"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseTarget, propagate, fmtDec, fmtRa } from "@/lib/look/coords";
import { findImage } from "@/lib/look/fits";
import {
  aperture,
  differential,
  fillSaturated,
  findComparisonStars,
  haloFlux,
  medianStack,
  normalize,
  quantile,
  reproject,
  shiftAndStack,
  skyToGrid,
  toDiff,
  toGray,
  type Grid,
} from "@/lib/look/frames";
import { DETECTORS, PRESETS, type Preset } from "@/lib/look/targets";
import type { LookImage, LookImages, Resolved } from "@/lib/look/types";
import { wcsFromHeader } from "@/lib/look/wcs";
import styles from "./Look.module.css";

/** Output grid: 57 pixels of 6″ (SPHEREx's pixels are 6.15″), 5.7 arcminutes across. */
const N = 57;
const SCALE = 6;
const CUTOUT_DEG = 0.1;
const MAX_FRAMES = 24;
const CONCURRENCY = 3;
const TRIES = 3;
/** Mid-survey date used to center the cutouts on a moving star (2025 Dec 1). */
const MID_MJD = 61010;

interface Target extends Resolved {
  label: string;
  preset?: Preset;
}

interface Frame {
  image: LookImage;
  /** Reprojected, in MJy/sr, and the same in units of the frame's own noise. */
  raw: Float32Array;
  z: Float32Array;
  /** Where the target should be in this frame (grid pixels). */
  at: [number, number];
  flux: number | null;
  /** "core" for normal aperture photometry, "halo" when the core is saturated. */
  method: "core" | "halo" | null;
}

type Status =
  | { kind: "idle" }
  | { kind: "busy"; message: string; done?: number; total?: number }
  | { kind: "error"; message: string }
  | { kind: "ready" };

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
const fmtTime = (iso: string) => `${iso.slice(11, 16)} UTC`;

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  const body = (await res.json().catch(() => ({}))) as T & { detail?: string };
  if (!res.ok) throw new Error(body.detail ?? `request failed (${res.status})`);
  return body;
}

/** Pick up to `max` images of one detector, spread over as many separate visits as possible. */
export function chooseImages(images: LookImage[], detector: number, max = MAX_FRAMES): LookImage[] {
  const mine = images.filter((i) => i.detector === detector).sort((a, b) => a.mjd - b.mjd);
  const visits: LookImage[][] = [];
  for (const im of mine) {
    const last = visits.at(-1);
    if (last && im.mjd - last.at(-1)!.mjd < 2) last.push(im);
    else visits.push([im]);
  }
  const perVisit = Math.max(1, Math.min(3, Math.floor(max / Math.max(1, visits.length))));
  let picked = visits.flatMap((v) => (v.length <= perVisit ? v : Array.from({ length: perVisit }, (_, k) => v[Math.round((k * (v.length - 1)) / Math.max(1, perVisit - 1))]!)));
  if (picked.length > max) picked = Array.from({ length: max }, (_, k) => picked[Math.round((k * (picked.length - 1)) / (max - 1))]!);
  return [...new Map(picked.map((p) => [p.archive_url, p])).values()];
}

export function LookView() {
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<Target | null>(null);
  const [images, setImages] = useState<LookImage[] | null>(null);
  const [detector, setDetector] = useState(2);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [mode, setMode] = useState<"blink" | "diff" | "stack">("blink");
  const [failed, setFailed] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);

  const grid: Grid | null = useMemo(() => {
    if (!target) return null;
    const [ra0, dec0] = propagate(target, MID_MJD);
    return { ra0, dec0, n: N, scale: SCALE };
  }, [target]);

  // 1. A target: list every SPHEREx image of it.
  const lookAt = useCallback(async (t: Target, det: number) => {
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setTarget(t);
    setDetector(det);
    setImages(null);
    setFrames([]);
    setIndex(0);
    setFailed(0);
    setStatus({ kind: "busy", message: "Asking NASA's archive for every SPHEREx image of this spot…" });
    const [ra, dec] = propagate(t, MID_MJD);
    try {
      const list = await getJson<LookImages>(`/api/look/images?ra_deg=${ra.toFixed(6)}&dec_deg=${dec.toFixed(6)}`, ac.signal);
      if (ac.signal.aborted) return;
      setImages(list.images);
      if (!list.images.length) setStatus({ kind: "error", message: "SPHEREx hasn't imaged this spot yet in the public data releases." });
    } catch (err) {
      if (!ac.signal.aborted) setStatus({ kind: "error", message: `NASA's archive didn't answer: ${(err as Error).message}. Try again in a moment.` });
    }
  }, []);

  // 2. Images and a detector: fetch the cutouts and line them up.
  useEffect(() => {
    if (!images?.length || !target || !grid) return;
    const chosen = chooseImages(images, detector);
    const ac = new AbortController();
    abort.current = ac;
    const [cra, cdec] = [grid.ra0, grid.dec0];
    let done = 0;
    let bad = 0;
    const got: (Frame | null)[] = new Array(chosen.length).fill(null);
    const one = async (k: number) => {
      const im = chosen[k]!;
      try {
        const url = `/api/look/cutout?src=${encodeURIComponent(im.archive_url)}&ra_deg=${cra.toFixed(6)}&dec_deg=${cdec.toFixed(6)}&size_deg=${CUTOUT_DEG}`;
        // IRSA turns some requests away when several arrive at once: retry with a short pause.
        let buf: ArrayBuffer | null = null;
        for (let attempt = 0; attempt < TRIES && !buf; attempt++) {
          if (attempt) await new Promise((r) => setTimeout(r, 800 * attempt));
          const res = await fetch(url, { signal: ac.signal });
          if (res.ok) buf = await res.arrayBuffer();
        }
        if (!buf) throw new Error("download failed");
        const img = findImage(buf);
        const wcs = img && wcsFromHeader(img.header);
        if (!img || !wcs) throw new Error("no image");
        const raw = reproject(img, wcs, grid);
        const [ra, dec] = propagate(target, im.mjd);
        const at = skyToGrid(grid, ra, dec);
        const core = aperture(raw, N, at[0], at[1]);
        const halo = core === null ? haloFlux(raw, N, at[0], at[1]) : null;
        got[k] = { image: im, raw, z: normalize(raw), at, flux: core ?? halo, method: core !== null ? "core" : halo !== null ? "halo" : null };
      } catch {
        if (ac.signal.aborted) return;
        bad++;
      } finally {
        done++;
        if (!ac.signal.aborted) {
          setStatus({ kind: "busy", message: "Downloading SPHEREx images", done, total: chosen.length });
          setFrames(got.filter((f): f is Frame => f !== null));
        }
      }
    };
    (async () => {
      await Promise.resolve();
      if (ac.signal.aborted) return;
      setFrames([]);
      setIndex(0);
      if (!chosen.length) {
        setStatus({ kind: "error", message: `No images from detector ${detector} here. Pick another wavelength band.` });
        return;
      }
      setStatus({ kind: "busy", message: "Downloading SPHEREx images", done: 0, total: chosen.length });
      let next = 0;
      await Promise.all(
        Array.from({ length: CONCURRENCY }, async () => {
          while (next < chosen.length && !ac.signal.aborted) await one(next++);
        }),
      );
      if (ac.signal.aborted) return;
      setFailed(bad);
      const ok = got.filter(Boolean).length;
      setStatus(ok ? { kind: "ready" } : { kind: "error", message: "None of the images could be downloaded from NASA's archive. Try again in a moment." });
    })();
    return () => ac.abort();
  }, [images, detector, target, grid]);

  // The static sky, for the "changes" view, and one display range for every frame.
  const ref = useMemo(() => (frames.length >= 3 ? medianStack(frames.map((f) => f.z)) : null), [frames]);
  const top = useMemo(() => (frames.length ? Math.max(8, quantile(frames[0]!.z, 0.995)) : 30), [frames]);

  // Shift-and-stack along the predicted motion (a plain deeper image for a star that barely moves).
  const stack = useMemo(() => {
    if (frames.length < 3) return null;
    const mid = frames[frames.length >> 1]!.at;
    return { ...shiftAndStack(frames, N, mid), at: mid };
  }, [frames]);

  // Brightness, corrected with comparison stars in the same images.
  const photometry = useMemo(() => {
    if (status.kind !== "ready" || frames.length < 3) return null;
    const ref0 = medianStack(frames.map((f) => f.z));
    const comps = findComparisonStars(ref0, N, frames[frames.length >> 1]!.at);
    const method: "core" | "halo" = frames.some((f) => f.method === "halo") ? "halo" : "core";
    const target = frames.map((f) => (f.method === method ? f.flux : null));
    const compFlux = comps.map(([x, y]) => frames.map((f) => aperture(f.raw, N, x, y)));
    const cal = differential(target, compFlux);
    const pts = frames.map((f, i) => ({ t: f.image.mjd, d: cal.target[i] ?? null })).filter((p): p is { t: number; d: number } => p.d !== null);
    return pts.length >= 3 ? { pts, floor: cal.floor, nComp: cal.nComp, method } : null;
  }, [frames, status.kind]);

  // Blink.
  useEffect(() => {
    if (!playing || frames.length < 2 || mode === "stack") return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % frames.length), 700);
    return () => window.clearInterval(id);
  }, [playing, frames.length, mode]);

  // Draw.
  useEffect(() => {
    const c = canvas.current;
    const f = frames[index % Math.max(1, frames.length)];
    if (!c || !f) return;
    const off = document.createElement("canvas");
    off.width = N;
    off.height = N;
    const stackTop = stack ? Math.max(8, quantile(stack.z, 0.995)) : top;
    const px =
      mode === "stack" && stack
        ? toGray(fillSaturated(stack.z, N, stackTop * 0.3, stackTop).data, stackTop)
        : mode === "diff" && ref
          ? toDiff(f.z, ref)
          : toGray(fillSaturated(f.z, N, top * 0.3, top).data, top);
    off.getContext("2d")!.putImageData(new ImageData(px as Uint8ClampedArray<ArrayBuffer>, N, N), 0, 0);
    const ctx = c.getContext("2d")!;
    const S = c.width / N;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, c.width, c.height);
    // The target's predicted path and where it is in this frame.
    const first = frames[0]!.at;
    const last = frames.at(-1)!.at;
    ctx.lineWidth = 1.5;
    if (target?.preset?.show === "motion" || Math.hypot(last[0] - first[0], last[1] - first[1]) > 0.5) {
      ctx.strokeStyle = "rgba(255, 207, 90, 0.7)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo((first[0] + 0.5) * S, (first[1] + 0.5) * S);
      ctx.lineTo((last[0] + 0.5) * S, (last[1] + 0.5) * S);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const ring = mode === "stack" && stack ? stack.at : f.at;
    ctx.strokeStyle = "#7cf0c8";
    ctx.beginPath();
    ctx.arc((ring[0] + 0.5) * S, (ring[1] + 0.5) * S, 3.2 * S, 0, Math.PI * 2);
    ctx.stroke();
    // Scale bar: one arcminute.
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(c.width - 12 - (60 / SCALE) * S, c.height - 16, (60 / SCALE) * S, 2);
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillText("1′", c.width - 12 - (30 / SCALE) * S - 5, c.height - 22);
    ctx.fillText("N ↑  E ←", 10, 18);
  }, [frames, index, mode, ref, top, target, stack]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseTarget(query);
    if (p.kind === "error") {
      setStatus({ kind: "error", message: p.message });
      return;
    }
    if (p.kind === "coords") {
      void lookAt({ label: `${fmtRa(p.ra)} ${fmtDec(p.dec)}`, name: "", ra_deg: p.ra, dec_deg: p.dec, pm_ra_mas_yr: null, pm_dec_mas_yr: null, epoch_year: 2000 }, detector);
      return;
    }
    const preset = PRESETS.find((t) => t.name.toLowerCase().replace(/[^a-z0-9]/g, "") === p.name.toLowerCase().replace(/[^a-z0-9]/g, ""));
    if (preset) {
      void lookAt({ ...preset, label: preset.name, preset }, preset.detector);
      return;
    }
    setStatus({ kind: "busy", message: `Looking up "${p.name}"…` });
    try {
      const r = await getJson<Resolved>(`/api/look/resolve?name=${encodeURIComponent(p.name)}`, new AbortController().signal);
      void lookAt({ ...r, label: r.name || p.name }, detector);
    } catch (err) {
      setStatus({ kind: "error", message: (err as Error).message });
    }
  };

  const f = frames[index % Math.max(1, frames.length)];
  const motionArcsec = frames.length >= 2 ? Math.hypot(frames.at(-1)!.at[0] - frames[0]!.at[0], frames.at(-1)!.at[1] - frames[0]!.at[1]) * SCALE : 0;
  const saturated = useMemo(() => frames.some((x) => fillSaturated(x.z, N, top * 0.3, top).filled > 0 && x.flux === null), [frames, top]);
  const counts = useMemo(() => {
    const m = new Map<number, number>();
    for (const im of images ?? []) if (im.detector) m.set(im.detector, (m.get(im.detector) ?? 0) + 1);
    return m;
  }, [images]);

  return (
    <div className={styles.look}>
      <form className={styles.search} onSubmit={submit} role="search" aria-label="Look anywhere in SPHEREx">
        <label htmlFor="look-q" className={styles.searchLabel}>
          A star&apos;s name or sky coordinates
        </label>
        <div className={styles.searchRow}>
          <input
            id="look-q"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Barnard's Star, M31, or 08h55m10.8s -07d14m42s"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" className="button">
            Look
          </button>
        </div>
      </form>

      <div className={styles.presets} role="group" aria-label="The challenge's example targets">
        <p className={styles.presetsLabel}>The challenge&apos;s five example targets:</p>
        {PRESETS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={styles.preset}
            aria-pressed={target?.preset?.key === t.key}
            onClick={() => {
              setQuery(t.name);
              void lookAt({ ...t, label: t.name, preset: t }, t.detector);
            }}
          >
            <strong>{t.name}</strong>
            <span>{t.what}</span>
          </button>
        ))}
      </div>

      {target && (
        <section className={styles.stage} aria-labelledby="look-title">
          <div className={styles.viewer}>
            <canvas ref={canvas} width={456} height={456} className={styles.canvas} aria-label={`SPHEREx images of ${target.label}, aligned north up`} role="img" />
            {status.kind === "busy" && (
              <p className={styles.overlay} role="status">
                {status.message}
                {status.total ? ` (${status.done ?? 0} of ${status.total})` : ""}…
              </p>
            )}
            {status.kind === "error" && !frames.length && (
              <p className={styles.overlay} role="alert">
                {status.message}
              </p>
            )}
          </div>
          <div className={styles.side}>
            <p className="eyebrow">Live from NASA/IPAC IRSA</p>
            <h2 id="look-title">{target.label}</h2>
            <p className={`mono ${styles.pos}`}>
              {fmtRa(grid?.ra0 ?? target.ra_deg)} {fmtDec(grid?.dec0 ?? target.dec_deg)}
            </p>
            {target.preset && <p>{target.preset.look}</p>}

            <div className={styles.controls}>
              <button type="button" className="button" onClick={() => setPlaying((p) => !p)} disabled={frames.length < 2} aria-pressed={!playing}>
                {playing ? "Pause" : "Play"}
              </button>
              <button type="button" className="button" onClick={() => { setPlaying(false); setIndex((i) => (i + frames.length - 1) % Math.max(1, frames.length)); }} disabled={frames.length < 2} aria-label="Previous image">
                ←
              </button>
              <button type="button" className="button" onClick={() => { setPlaying(false); setIndex((i) => (i + 1) % Math.max(1, frames.length)); }} disabled={frames.length < 2} aria-label="Next image">
                →
              </button>
              <div className={styles.modes} role="group" aria-label="View">
                <button type="button" aria-pressed={mode === "blink"} onClick={() => setMode("blink")}>
                  Images
                </button>
                <button type="button" aria-pressed={mode === "diff"} onClick={() => setMode("diff")} disabled={!ref}>
                  What changed
                </button>
                <button type="button" aria-pressed={mode === "stack"} onClick={() => setMode("stack")} disabled={!stack}>
                  Stack
                </button>
              </div>
            </div>
            <label className={styles.band}>
              Wavelength band{" "}
              <select value={detector} onChange={(e) => setDetector(Number(e.target.value))}>
                {DETECTORS.map((d) => (
                  <option key={d.n} value={d.n} disabled={images !== null && !counts.get(d.n)}>
                    {d.range[0]}–{d.range[1]} µm (detector {d.n}){images ? ` · ${counts.get(d.n) ?? 0} images` : ""}
                  </option>
                ))}
              </select>
            </label>

            {mode === "stack" && stack && (
              <p className={styles.stackNote}>
                <strong>Shift-and-stack of {frames.length} images.</strong> Each image is shifted so the target&apos;s predicted position
                lines up, then all are averaged: anything that moves as predicted adds up while noise averages down, about{" "}
                {Math.sqrt(frames.length).toFixed(1)}× deeper than one image. This is how searches for faint, slow objects like Planet X
                work. Signal at the ring:{" "}
                <strong className="mono">{stack.snr === null ? "not measurable (saturated or off the edge)" : `S/N ${stack.snr.toFixed(1)}`}</strong>
                {stack.snr !== null && (stack.snr >= 5 ? ", a clear detection." : stack.snr >= 3 ? ", a hint, not a detection." : ", not detected.")}
              </p>
            )}
            {f && mode !== "stack" && (
              <dl className={styles.meta}>
                <div>
                  <dt>Image</dt>
                  <dd className="mono">
                    {(index % frames.length) + 1} of {frames.length}
                  </dd>
                </div>
                <div>
                  <dt>Taken</dt>
                  <dd className="mono">
                    {fmtDate(f.image.time_utc)}, {fmtTime(f.image.time_utc)}
                  </dd>
                </div>
                {f.image.wavelength_um_range && (
                  <div>
                    <dt>Detector covers</dt>
                    <dd className="mono">
                      {f.image.wavelength_um_range[0].toFixed(2)}–{f.image.wavelength_um_range[1].toFixed(2)} µm
                    </dd>
                  </div>
                )}
                <div>
                  <dt>Source file</dt>
                  <dd>
                    <a href={f.image.archive_url} rel="noopener">
                      {f.image.obs_id ?? "SPHEREx Level 2 image"}
                    </a>
                  </dd>
                </div>
              </dl>
            )}
            {status.kind === "ready" && frames.length > 0 && (
              <p className={styles.note}>
                {frames.length} of {images?.filter((i) => i.detector === detector).length ?? 0} images from this band, spread over every
                visit{failed ? `; ${failed} couldn't be downloaded` : ""}. Each is resampled onto the same north-up grid so stars line up.
                {motionArcsec >= 1 && ` The ring marks where the star should be on each date; it moves ${motionArcsec.toFixed(0)}″ over these images.`}{" "}
                {saturated && " The star's core saturates SPHEREx's detector, which records no value there; it is drawn white."}{" "}
                The wavelength changes slightly from image to image (SPHEREx sees a different color across each detector), so steady
                stars can flicker a little.
              </p>
            )}
          </div>

          {photometry && <LightCurve {...photometry} emphasize={target.preset?.show === "brightness"} />}

          {frames.length > 1 && (
            <ol className={styles.strip} aria-label="Images in time order">
              {frames.map((x, i) => (
                <li key={x.image.archive_url}>
                  <button
                    type="button"
                    aria-current={i === index % frames.length}
                    onClick={() => {
                      setPlaying(false);
                      setIndex(i);
                    }}
                  >
                    {fmtDate(x.image.time_utc)}
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {!target && (
        <p className={styles.hint}>
          Pick a target or type any place on the sky. We ask NASA&apos;s archive for every SPHEREx image of that spot, line the images
          up and play them in time order, right here in your browser.
        </p>
      )}
    </div>
  );
}

/** Brightness of the target in each image, relative to its median, corrected with comparison stars. */
function LightCurve({
  pts,
  floor,
  nComp,
  method,
  emphasize,
}: {
  pts: { t: number; d: number }[];
  floor: number | null;
  nComp: number;
  method: "core" | "halo";
  emphasize: boolean;
}) {
  const t0 = Math.min(...pts.map((p) => p.t));
  const t1 = Math.max(...pts.map((p) => p.t));
  const lim = Math.max(0.3, (floor ?? 0) * 3, ...pts.map((p) => Math.abs(p.d))) * 1.15;
  const W = 640;
  const H = 180;
  const x = (t: number) => 40 + ((t - t0) / Math.max(1, t1 - t0)) * (W - 60);
  const y = (d: number) => H / 2 + (d / lim) * (H / 2 - 18);
  const spread = Math.max(...pts.map((p) => p.d)) - Math.min(...pts.map((p) => p.d));
  const verdict =
    floor === null
      ? "No comparison stars were bright enough here to check the calibration, so treat this as rough."
      : spread > 5 * floor
        ? `That is ${(spread / floor).toFixed(0)} times the scatter of the ${nComp} steady comparison stars (±${floor.toFixed(2)} mag), far more than calibration noise. Some of it can still come from each image seeing a slightly different wavelength, which matters for very red stars.`
        : `The ${nComp} steady comparison stars scatter by ±${floor.toFixed(2)} mag, so a change this small can't be told apart from noise.`;
  const date = (mjd: number) => fmtDate(new Date((mjd - 40587) * 864e5).toISOString());
  return (
    <figure className={`${styles.curve} ${emphasize ? styles.curveMain : ""}`}>
      <figcaption>
        <strong>Brightness in each image: </strong>
        range {spread.toFixed(2)} magnitudes ({(10 ** (0.4 * spread)).toFixed(1)}× from faintest to brightest). {verdict}{" "}
        {method === "halo"
          ? "The star's core saturates the detector, so this is measured from its halo, which is rougher."
          : "Measured in a 13″ circle, then divided by the comparison stars in the same image to cancel calibration differences."}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Brightness over time: range ${spread.toFixed(2)} magnitudes`}>
        {floor !== null && <rect x={40} width={W - 60} y={y(-floor)} height={Math.max(1, y(floor) - y(-floor))} className={styles.band2} />}
        <line x1={40} x2={W - 20} y1={H / 2} y2={H / 2} className={styles.axis} />
        <text x={4} y={14} className={styles.tick}>
          brighter
        </text>
        <text x={4} y={H - 4} className={styles.tick}>
          fainter
        </text>
        <text x={40} y={H - 4} className={styles.tick}>
          {date(t0)}
        </text>
        <text x={W - 20} y={H - 4} className={styles.tick} textAnchor="end">
          {date(t1)}
        </text>
        {pts.map((p, i) => (
          <circle key={i} cx={x(p.t)} cy={y(p.d)} r={4} className={styles.dot} />
        ))}
      </svg>
    </figure>
  );
}
