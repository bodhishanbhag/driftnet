/**
 * Turn SPHEREx cutouts into frames that can be blinked: every frame resampled onto the same
 * north-up grid around the target, so the stars line up even though SPHEREx images the sky at a
 * different angle on every visit.
 */
import type { Image2D } from "./fits";
import { skyToPix, tanDeproject, type Wcs } from "./wcs";

export interface Grid {
  ra0: number;
  dec0: number;
  /** Output size in pixels (square) and scale in arcseconds per pixel. */
  n: number;
  scale: number;
}

/** Output pixel (column, row from the top) to sky, north up and east left. */
export function gridToSky(g: Grid, col: number, row: number): [number, number] {
  const c = (g.n - 1) / 2;
  const xi = (-(col - c) * g.scale) / 3600;
  const eta = ((c - row) * g.scale) / 3600;
  return tanDeproject(xi, eta, g.ra0, g.dec0);
}

/** Sky to output pixel: the inverse of gridToSky (small-field approximation is exact enough here). */
export function skyToGrid(g: Grid, ra: number, dec: number): [number, number] {
  const c = (g.n - 1) / 2;
  const dra = ((((ra - g.ra0 + 540) % 360) - 180) * Math.cos((g.dec0 * Math.PI) / 180) * 3600) / g.scale;
  const ddec = ((dec - g.dec0) * 3600) / g.scale;
  return [c - dra, c - ddec];
}

function bilinear(img: Image2D, x: number, y: number): number {
  // x, y are FITS 1-based; array is 0-based, row 0 = y 1.
  const fx = x - 1;
  const fy = y - 1;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  if (x0 < 0 || y0 < 0 || x0 + 1 >= img.width || y0 + 1 >= img.height) return Number.NaN;
  const tx = fx - x0;
  const ty = fy - y0;
  const w = img.width;
  const a = img.data[y0 * w + x0]!;
  const b = img.data[y0 * w + x0 + 1]!;
  const c = img.data[(y0 + 1) * w + x0]!;
  const d = img.data[(y0 + 1) * w + x0 + 1]!;
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
}

export function reproject(img: Image2D, wcs: Wcs, g: Grid): Float32Array {
  const out = new Float32Array(g.n * g.n);
  for (let row = 0; row < g.n; row++) {
    for (let col = 0; col < g.n; col++) {
      const [ra, dec] = gridToSky(g, col, row);
      const p = skyToPix(wcs, ra, dec);
      out[row * g.n + col] = p ? bilinear(img, p[0], p[1]) : Number.NaN;
    }
  }
  return out;
}

function median(xs: number[]): number {
  if (!xs.length) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Background level and noise (median and 1.4826 × median absolute deviation). */
export function stats(data: Float32Array): { bg: number; sigma: number; valid: number } {
  const v: number[] = [];
  for (const x of data) if (Number.isFinite(x)) v.push(x);
  const bg = median(v);
  const sigma = 1.4826 * median(v.map((x) => Math.abs(x - bg)));
  return { bg, sigma: sigma > 0 ? sigma : 1, valid: v.length / data.length };
}

/** Each frame in units of its own noise above its own background: comparable across frames. */
export function normalize(data: Float32Array): Float32Array {
  const { bg, sigma } = stats(data);
  const out = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = (data[i]! - bg) / sigma;
  return out;
}

/** Pixel-by-pixel median of several frames (the static sky), ignoring blanks. */
export function medianStack(frames: Float32Array[]): Float32Array {
  const n = frames[0]?.length ?? 0;
  const out = new Float32Array(n);
  const buf: number[] = [];
  for (let i = 0; i < n; i++) {
    buf.length = 0;
    for (const f of frames) if (Number.isFinite(f[i]!)) buf.push(f[i]!);
    out[i] = buf.length ? median(buf) : Number.NaN;
  }
  return out;
}

/**
 * Aperture photometry at (col, row): sum above the local background inside radius r, background
 * from the median of an annulus. Returns null if the aperture has blanks.
 */
export function aperture(data: Float32Array, n: number, col: number, row: number, r = 2.2, r1 = 4, r2 = 7): number | null {
  let sum = 0;
  let count = 0;
  const ring: number[] = [];
  for (let y = Math.floor(row - r2); y <= Math.ceil(row + r2); y++) {
    for (let x = Math.floor(col - r2); x <= Math.ceil(col + r2); x++) {
      if (x < 0 || y < 0 || x >= n || y >= n) continue;
      const d = Math.hypot(x - col, y - row);
      const v = data[y * n + x]!;
      if (d <= r) {
        if (!Number.isFinite(v)) return null;
        sum += v;
        count++;
      } else if (d >= r1 && d <= r2 && Number.isFinite(v)) ring.push(v);
    }
  }
  if (!count || ring.length < 8) return null;
  return sum - count * median(ring);
}

/**
 * Blank pixels inside a bright star are saturated, not missing: SPHEREx flags a saturated core and
 * leaves no value there. Fill blanks that touch bright pixels with `fill`, growing inward a few
 * times, so the star shows as solid white instead of a hole. Blanks at the image edge stay blank.
 */
export function fillSaturated(z: Float32Array, n: number, bright: number, fill: number): { data: Float32Array; filled: number } {
  const out = Float32Array.from(z);
  let filled = 0;
  for (let pass = 0; pass < 6; pass++) {
    const add: number[] = [];
    for (let y = 1; y < n - 1; y++) {
      for (let x = 1; x < n - 1; x++) {
        const i = y * n + x;
        if (Number.isFinite(out[i]!)) continue;
        let hot = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((out[i + dy * n + dx] ?? Number.NaN) > bright) hot++;
        if (hot >= 2) add.push(i);
      }
    }
    if (!add.length) break;
    for (const i of add) out[i] = fill;
    filled += add.length;
  }
  return { data: out, filled };
}

/** asinh display stretch to 0..255 (soft knee at `knee` sigma, white at `top` sigma). */
export function toGray(z: Float32Array, top: number, knee = 2): Uint8ClampedArray {
  const out = new Uint8ClampedArray(z.length * 4);
  const lo = -1;
  const norm = Math.asinh(top / knee) - Math.asinh(lo / knee);
  for (let i = 0; i < z.length; i++) {
    const v = z[i]!;
    const g = Number.isFinite(v) ? (255 * (Math.asinh(Math.min(v, top) / knee) - Math.asinh(lo / knee))) / norm : 0;
    out[i * 4] = g;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = Number.isFinite(v) ? g : 40;
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** Difference image: brighter than the static sky in mint, fainter in coral. */
export function toDiff(z: Float32Array, ref: Float32Array, top = 12): Uint8ClampedArray {
  const out = new Uint8ClampedArray(z.length * 4);
  for (let i = 0; i < z.length; i++) {
    const d = z[i]! - ref[i]!;
    const k = Number.isFinite(d) ? Math.min(1, Math.asinh(Math.abs(d) / 2) / Math.asinh(top / 2)) : 0;
    const base = 18;
    if (d >= 0) {
      out[i * 4] = base + k * (124 - base);
      out[i * 4 + 1] = base + k * (240 - base);
      out[i * 4 + 2] = base + k * (200 - base);
    } else {
      out[i * 4] = base + k * (255 - base);
      out[i * 4 + 1] = base + k * (138 - base);
      out[i * 4 + 2] = base + k * (112 - base);
    }
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** The value below which `q` of the finite values fall. */
export function quantile(data: Float32Array, q: number): number {
  const v: number[] = [];
  for (let i = 0; i < data.length; i += 3) if (Number.isFinite(data[i]!)) v.push(data[i]!);
  if (!v.length) return 1;
  v.sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.floor(q * v.length))]!;
}

/**
 * Brightness of a star whose core is saturated, from its halo: the sum in a ring around the core
 * (r 3.5–7 px) above a far background (r 20–27 px). The halo scales with the star's total light,
 * so ratios between images are a rough brightness measure; absolute values mean nothing.
 */
export function haloFlux(data: Float32Array, n: number, col: number, row: number): number | null {
  let sum = 0;
  let count = 0;
  const far: number[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x - col, y - row);
      const v = data[y * n + x]!;
      if (!Number.isFinite(v)) continue;
      if (d >= 3.5 && d <= 7) {
        sum += v;
        count++;
      } else if (d >= 20 && d <= 27) far.push(v);
    }
  }
  if (count < 40 || far.length < 30) return null;
  return sum - count * median(far);
}

/** Bright, unsaturated stars in the static sky, away from the target and the edges. */
export function findComparisonStars(stack: Float32Array, n: number, avoid: [number, number], max = 6): [number, number][] {
  const peaks: { x: number; y: number; v: number }[] = [];
  for (let y = 6; y < n - 6; y++) {
    for (let x = 6; x < n - 6; x++) {
      const v = stack[y * n + x]!;
      if (!Number.isFinite(v) || v < 15) continue;
      if (Math.hypot(x - avoid[0], y - avoid[1]) < 9) continue;
      let peak = true;
      for (let dy = -2; dy <= 2 && peak; dy++) for (let dx = -2; dx <= 2; dx++) if ((dx || dy) && !(stack[(y + dy) * n + x + dx]! < v)) { peak = false; break; }
      if (peak) peaks.push({ x, y, v });
    }
  }
  peaks.sort((a, b) => b.v - a.v);
  const out: [number, number][] = [];
  for (const p of peaks) {
    if (out.every(([x, y]) => Math.hypot(x - p.x, y - p.y) > 6)) out.push([p.x, p.y]);
    if (out.length >= max) break;
  }
  return out;
}

export interface Calibrated {
  /** Target brightness per frame relative to its median, in magnitudes (null where unmeasured). */
  target: (number | null)[];
  /** Typical scatter (magnitudes) of the comparison stars after the same correction. */
  floor: number | null;
  nComp: number;
}

/**
 * Differential photometry: divide each frame's target flux by that frame's median comparison-star
 * ratio, which removes calibration and gray wavelength differences between images. The
 * comparison stars' own leftover scatter is the noise floor a real change must beat.
 */
export function differential(targetFlux: (number | null)[], compFlux: (number | null)[][]): Calibrated {
  const nF = targetFlux.length;
  const comps = compFlux.filter((c) => c.filter((v) => v !== null && v > 0).length >= Math.max(3, nF * 0.7));
  const compMed = comps.map((c) => median(c.filter((v): v is number => v !== null && v > 0)));
  const zp = Array.from({ length: nF }, (_, f) => {
    const r = comps.map((c, k) => (c[f] !== null && c[f]! > 0 ? c[f]! / compMed[k]! : Number.NaN)).filter(Number.isFinite);
    return r.length ? median(r) : comps.length ? Number.NaN : 1;
  });
  const corr = targetFlux.map((v, f) => (v !== null && v > 0 && Number.isFinite(zp[f]!) ? v / zp[f]! : null));
  const ok = corr.filter((v): v is number => v !== null);
  const mid = ok.length ? median(ok) : 1;
  const target = corr.map((v) => (v === null ? null : -2.5 * Math.log10(v / mid)));
  const scat = comps.map((c, k) => {
    const m = c.map((v, f) => (v !== null && v > 0 && Number.isFinite(zp[f]!) ? -2.5 * Math.log10(v / zp[f]! / compMed[k]!) : null)).filter((x): x is number => x !== null);
    if (m.length < 3) return Number.NaN;
    const mu = m.reduce((a, b) => a + b, 0) / m.length;
    return Math.sqrt(m.reduce((a, b) => a + (b - mu) ** 2, 0) / (m.length - 1));
  }).filter(Number.isFinite);
  return { target, floor: scat.length ? median(scat) : null, nComp: comps.length };
}

/**
 * Shift-and-stack: shift every frame so the target's predicted position lands on the same pixel,
 * then average. Anything that moves as predicted adds up; noise averages down by about √N.
 * Returns the stack (in noise units, rescaled so its own noise is 1) and the target's S/N.
 */
export function shiftAndStack(frames: { z: Float32Array; at: [number, number] }[], n: number, to: [number, number]): { z: Float32Array; snr: number | null } {
  const sum = new Float32Array(n * n);
  const cnt = new Uint16Array(n * n);
  for (const f of frames) {
    const dx = f.at[0] - to[0];
    const dy = f.at[1] - to[1];
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const sx = x + dx;
        const sy = y + dy;
        const x0 = Math.floor(sx);
        const y0 = Math.floor(sy);
        if (x0 < 0 || y0 < 0 || x0 + 1 >= n || y0 + 1 >= n) continue;
        const tx = sx - x0;
        const ty = sy - y0;
        const a = f.z[y0 * n + x0]!;
        const b = f.z[y0 * n + x0 + 1]!;
        const c = f.z[(y0 + 1) * n + x0]!;
        const d = f.z[(y0 + 1) * n + x0 + 1]!;
        const v = a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
        if (!Number.isFinite(v)) continue;
        sum[y * n + x]! += v;
        cnt[y * n + x]! += 1;
      }
    }
  }
  const mean = new Float32Array(n * n);
  for (let i = 0; i < mean.length; i++) mean[i] = cnt[i]! ? sum[i]! / cnt[i]! : Number.NaN;
  const z = normalize(mean);
  return { z, snr: empiricalSnr(z, n, to) };
}

/**
 * Signal-to-noise at `to`, calibrated on the image itself: the aperture sum there compared with
 * the same aperture placed on a grid of spots across the image (median and robust spread).
 * Correlated noise from resampling and stacking is then accounted for automatically.
 */
export function empiricalSnr(z: Float32Array, n: number, to: [number, number], r = 2.2): number | null {
  const sumAt = (cx: number, cy: number): number | null => {
    let s = 0;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if (Math.hypot(x - cx, y - cy) > r) continue;
        if (x < 0 || y < 0 || x >= n || y >= n) return null;
        const v = z[y * n + x]!;
        if (!Number.isFinite(v)) return null;
        s += v;
      }
    }
    return s;
  };
  const here = sumAt(to[0], to[1]);
  if (here === null) return null;
  const sums: number[] = [];
  for (let y = 4; y < n - 4; y += 3) {
    for (let x = 4; x < n - 4; x += 3) {
      if (Math.hypot(x - to[0], y - to[1]) < 6) continue;
      const v = sumAt(x, y);
      if (v !== null) sums.push(v);
    }
  }
  if (sums.length < 30) return null;
  const mid = median(sums);
  const spread = 1.4826 * median(sums.map((v) => Math.abs(v - mid)));
  return spread > 0 ? (here - mid) / spread : null;
}
