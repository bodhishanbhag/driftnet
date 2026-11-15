/**
 * "Look anywhere": every SPHEREx image of any point on the sky, live from NASA/IPAC IRSA.
 *
 *   GET /api/look/images?ra_deg=&dec_deg=   list the Level 2 images covering the point
 *   GET /api/look/cutout?src=&ra_deg=&dec_deg=&size_deg=   one small FITS cutout, proxied
 *   GET /api/look/resolve?name=   object name to position and proper motion (CDS Sesame)
 *
 * Browsers cannot call IRSA directly (no CORS), so the Worker proxies. The image list tries
 * IRSA's SIA service first (fast), then the TAP query /api/coverage uses (slow but complete).
 */
import { Hono } from "hono";
import type { AppEnv } from "../app";
import { ApiError, UpstreamError, badRequest } from "../errors";
import { FILE_RE, coverageUrl, mjdToIso, parseCsv } from "../irsa";
import { fetchUpstream } from "../upstream";
import { SCHEMA_VERSION, workerVersion } from "../version";

export const look = new Hono<AppEnv>();

export const IRSA_SIA = "https://irsa.ipac.caltech.edu/SIA";
export const CDS_SESAME = "https://cds.unistra.fr/cgi-bin/nph-sesame/-oxp/SNV";
const IRSA_HOST = "https://irsa.ipac.caltech.edu/";
/** SIA collections to try, newest release first. */
export const SIA_COLLECTIONS = ["spherex_dr1", "spherex_qr2"];
const MAX_IMAGES = 1500;

function num(v: string | undefined, name: string, lo: number, hi: number, dflt?: number): number {
  if (v === undefined || v === "") {
    if (dflt !== undefined) return dflt;
    throw badRequest(`${name} is required`);
  }
  const x = Number(v);
  if (!Number.isFinite(x) || x < lo || x > hi) throw badRequest(`${name} must be between ${lo} and ${hi}`);
  return x;
}

export interface LookImage {
  obs_id: string | null;
  detector: number | null;
  time_utc: string;
  mjd: number;
  /** Wavelength range the whole detector covers (µm); the point itself sees a narrow slice. */
  wavelength_um_range: [number, number] | null;
  /** The full Level 2 file on IRSA. */
  archive_url: string;
}

const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

/** Rows from an SIA (ObsCore) or TAP CSV answer, whichever column names it uses. */
export function imageRows(csv: string): LookImage[] {
  const rows = parseCsv(csv);
  if (rows.length === 0) return [];
  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => names.map((n) => header.indexOf(n)).find((i) => i >= 0) ?? -1;
  const iUrl = col("access_url", "uri");
  const iT0 = col("t_min", "time_bounds_lower");
  const iE0 = col("em_min", "energy_bounds_lower");
  const iE1 = col("em_max", "energy_bounds_upper");
  if (iUrl < 0 || iT0 < 0) throw new Error("the image list is missing its file or time column");
  const val = (r: string[], i: number) => (i < 0 ? Number.NaN : Number.parseFloat(r[i] ?? ""));
  const seen = new Set<string>();
  const out: LookImage[] = [];
  for (const r of rows.slice(1)) {
    const raw = (r[iUrl] ?? "").trim();
    const t0 = val(r, iT0);
    if (!raw || !Number.isFinite(t0)) continue;
    const url = /^https?:/.test(raw) ? raw : IRSA_HOST + raw.replace(/^\/+/, "");
    // Level 2 spectral images only, each file once.
    if (!/\/level2\//.test(url) || !/\.fits(\?|$)/.test(url) || seen.has(url)) continue;
    seen.add(url);
    const m = FILE_RE.exec(url);
    const e0 = val(r, iE0);
    const e1 = val(r, iE1);
    out.push({
      obs_id: m ? m[1]! : null,
      detector: m ? Number(m[2]) : null,
      time_utc: mjdToIso(t0),
      mjd: t0,
      wavelength_um_range: Number.isFinite(e0) && Number.isFinite(e1) ? [round(e0 * 1e6, 4), round(e1 * 1e6, 4)] : null,
      archive_url: url.split("?")[0]!,
    });
  }
  return out.sort((a, b) => a.mjd - b.mjd);
}

export function siaUrl(collection: string, ra: number, dec: number): string {
  return `${IRSA_SIA}?COLLECTION=${collection}&POS=CIRCLE+${ra}+${dec}+0.0005&RESPONSEFORMAT=CSV&MAXREC=${MAX_IMAGES}`;
}

look.get("/images", async (c) => {
  const ra = num(c.req.query("ra_deg"), "ra_deg", 0, 360);
  const dec = num(c.req.query("dec_deg"), "dec_deg", -90, 90);
  const deps = c.get("deps");
  const tried: string[] = [];
  let images: LookImage[] = [];
  let via = "";
  for (const coll of SIA_COLLECTIONS) {
    try {
      const res = await fetchUpstream<string>(deps, "IRSA SIA", siaUrl(coll, ra, dec), { as: "text", ttlSeconds: 86_400, timeoutMs: 20_000 });
      images = imageRows(res.data);
      tried.push(`SIA ${coll}: ${images.length}`);
      if (images.length) {
        via = `IRSA SIA (${coll})`;
        break;
      }
    } catch (err) {
      tried.push(`SIA ${coll}: ${(err as Error).message}`);
    }
  }
  if (!images.length) {
    try {
      const res = await fetchUpstream<string>(deps, "IRSA TAP", coverageUrl(ra, dec, 0), { as: "text", ttlSeconds: 86_400, timeoutMs: 28_000 });
      images = imageRows(res.data);
      via = "IRSA TAP";
      tried.push(`TAP: ${images.length}`);
    } catch (err) {
      tried.push(`TAP: ${(err as Error).message}`);
      if (err instanceof UpstreamError) {
        throw new UpstreamError("IRSA", err.upstreamStatus ?? "unreachable", `IRSA did not answer (${tried.join("; ")})`);
      }
      throw err;
    }
  }
  c.header("Cache-Control", "public, max-age=3600");
  return c.json({
    schema_version: SCHEMA_VERSION,
    pipeline_version: workerVersion(),
    center: { ra_deg: ra, dec_deg: dec },
    searched: via || "IRSA",
    tried,
    n_images: images.length,
    images: images.slice(0, MAX_IMAGES),
  });
});

/** Only SPHEREx Level 2 files on IRSA may be proxied. */
export function allowedSource(src: string): boolean {
  try {
    const u = new URL(src);
    return u.protocol === "https:" && u.host === "irsa.ipac.caltech.edu" && /^\/ibe\/data\/spherex\/[\w./-]+\.fits$/.test(u.pathname) && !u.search;
  } catch {
    return false;
  }
}

look.get("/cutout", async (c) => {
  const src = c.req.query("src") ?? "";
  if (!allowedSource(src)) throw badRequest("src must be a SPHEREx Level 2 file on irsa.ipac.caltech.edu");
  const ra = num(c.req.query("ra_deg"), "ra_deg", 0, 360);
  const dec = num(c.req.query("dec_deg"), "dec_deg", -90, 90);
  const size = num(c.req.query("size_deg"), "size_deg", 0.01, 0.2, 0.1);
  const url = `${src}?center=${ra.toFixed(6)},${dec.toFixed(6)}&size=${size}`;
  const deps = c.get("deps");
  const key = new Request(url, { method: "GET" });
  let bytes: ArrayBuffer | null = null;
  if (deps.cache) {
    try {
      const hit = await deps.cache.match(key);
      if (hit) bytes = await hit.arrayBuffer();
    } catch {
      bytes = null;
    }
  }
  if (!bytes) {
    if (deps.budget.remaining <= 0) throw new UpstreamError("IRSA cutout", "budget");
    deps.budget.remaining -= 1;
    let res: Response;
    try {
      res = await deps.fetch(url, { headers: { "User-Agent": "Driftnet/1.0 (NASA Space Apps 2026)" }, signal: AbortSignal.timeout(25_000) });
    } catch (err) {
      const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      throw new UpstreamError("IRSA cutout", timeout ? "timeout" : "unreachable");
    }
    if (!res.ok) throw new UpstreamError("IRSA cutout", res.status);
    bytes = await res.arrayBuffer();
    // A FITS file starts with the SIMPLE card; anything else is an error page.
    if (new TextDecoder().decode(bytes.slice(0, 6)) !== "SIMPLE") throw new UpstreamError("IRSA cutout", "invalid_response");
    if (deps.cache) {
      const stored = new Response(bytes.slice(0), { headers: { "Content-Type": "application/fits", "Cache-Control": "public, max-age=604800" } });
      deps.waitUntil(deps.cache.put(key, stored).catch(() => undefined));
    }
  }
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/fits",
      "Cache-Control": "public, max-age=604800, immutable",
      "X-Source": src,
    },
  });
});

export interface Resolved {
  name: string;
  ra_deg: number;
  dec_deg: number;
  /** Proper motion (mas/yr; RA component includes cos δ), position epoch J2000. */
  pm_ra_mas_yr: number | null;
  pm_dec_mas_yr: number | null;
  epoch_year: number;
}

export function parseSesame(xml: string): Resolved | null {
  const tag = (t: string) => new RegExp(`<${t}>\\s*([^<]+?)\\s*</${t}>`).exec(xml)?.[1] ?? null;
  const ra = Number(tag("jradeg"));
  const dec = Number(tag("jdedeg"));
  if (!tag("jradeg") || !Number.isFinite(ra) || !Number.isFinite(dec)) return null;
  const pmRA = tag("pmRA");
  const pmDE = tag("pmDE");
  return {
    name: (tag("oname") ?? "").replace(/^NAME\s+/, ""),
    ra_deg: ra,
    dec_deg: dec,
    pm_ra_mas_yr: pmRA !== null && Number.isFinite(Number(pmRA)) ? Number(pmRA) : null,
    pm_dec_mas_yr: pmDE !== null && Number.isFinite(Number(pmDE)) ? Number(pmDE) : null,
    epoch_year: 2000,
  };
}

look.get("/resolve", async (c) => {
  const name = (c.req.query("name") ?? "").trim();
  if (!name || name.length > 80 || /[<>]/.test(name)) throw badRequest("name is required (up to 80 characters)");
  const res = await fetchUpstream<string>(c.get("deps"), "CDS Sesame", `${CDS_SESAME}?${encodeURIComponent(name)}`, {
    as: "text",
    ttlSeconds: 604_800,
    timeoutMs: 12_000,
  });
  const r = parseSesame(res.data);
  if (!r) throw new ApiError(404, `no object called "${name}" was found in SIMBAD, NED or VizieR`);
  c.header("Cache-Control", "public, max-age=86400");
  return c.json({ query: name, ...r });
});
