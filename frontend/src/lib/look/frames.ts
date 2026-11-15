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
