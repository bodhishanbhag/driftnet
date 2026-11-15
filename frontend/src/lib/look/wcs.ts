/**
 * Celestial WCS for a FITS image: gnomonic (TAN) projection with optional SIP distortion, which
 * SPHEREx images carry. Pixel coordinates here are FITS 1-based (x = column, y = row).
 */
import type { Header } from "./fits";

const D2R = Math.PI / 180;

export interface Wcs {
  crpix: [number, number];
  crval: [number, number];
  /** CD matrix (degrees per pixel). */
  cd: [number, number, number, number];
  sipA: number[][] | null;
  sipB: number[][] | null;
  sipAP: number[][] | null;
  sipBP: number[][] | null;
}

function sip(h: Header, k: "A" | "B" | "AP" | "BP"): number[][] | null {
  const order = Number(h[`${k}_ORDER`]);
  if (!Number.isFinite(order) || order <= 0) return null;
  const m: number[][] = [];
  for (let p = 0; p <= order; p++) {
    m.push([]);
    for (let q = 0; q <= order - p; q++) m[p]!.push(Number(h[`${k}_${p}_${q}`] ?? 0));
  }
  return m;
}

const poly = (m: number[][], u: number, v: number) => {
  let s = 0;
  for (let p = 0; p < m.length; p++) for (let q = 0; q < m[p]!.length; q++) if (m[p]![q]) s += m[p]![q]! * u ** p * v ** q;
  return s;
};

export function wcsFromHeader(h: Header): Wcs | null {
  const c1 = String(h.CTYPE1 ?? "");
  if (!c1.startsWith("RA---TAN")) return null;
  let cd: [number, number, number, number];
  if (h.CD1_1 !== undefined) {
    cd = [Number(h.CD1_1), Number(h.CD1_2 ?? 0), Number(h.CD2_1 ?? 0), Number(h.CD2_2)];
  } else {
    const d1 = Number(h.CDELT1 ?? 1);
    const d2 = Number(h.CDELT2 ?? 1);
    cd = [Number(h.PC1_1 ?? 1) * d1, Number(h.PC1_2 ?? 0) * d1, Number(h.PC2_1 ?? 0) * d2, Number(h.PC2_2 ?? 1) * d2];
  }
  const hasSip = c1.endsWith("-SIP");
  return {
    crpix: [Number(h.CRPIX1), Number(h.CRPIX2)],
    crval: [Number(h.CRVAL1), Number(h.CRVAL2)],
    cd,
    sipA: hasSip ? sip(h, "A") : null,
    sipB: hasSip ? sip(h, "B") : null,
    sipAP: hasSip ? sip(h, "AP") : null,
    sipBP: hasSip ? sip(h, "BP") : null,
  };
}

/** Gnomonic projection about (ra0, dec0): standard coordinates (ξ, η) in degrees. */
export function tanProject(ra: number, dec: number, ra0: number, dec0: number): [number, number] | null {
  const a = (ra - ra0) * D2R;
  const d = dec * D2R;
  const d0 = dec0 * D2R;
  const cosc = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(a);
  if (cosc <= 0) return null;
  const xi = (Math.cos(d) * Math.sin(a)) / cosc;
  const eta = (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(a)) / cosc;
  return [xi / D2R, eta / D2R];
}

export function tanDeproject(xi: number, eta: number, ra0: number, dec0: number): [number, number] {
  const x = xi * D2R;
  const y = eta * D2R;
  const d0 = dec0 * D2R;
  const rho = Math.hypot(x, y);
  if (rho === 0) return [ra0, dec0];
  const c = Math.atan(rho);
  const dec = Math.asin(Math.cos(c) * Math.sin(d0) + (y * Math.sin(c) * Math.cos(d0)) / rho);
  const ra = ra0 * D2R + Math.atan2(x * Math.sin(c), rho * Math.cos(d0) * Math.cos(c) - y * Math.sin(d0) * Math.sin(c));
  return [((ra / D2R) % 360 + 360) % 360, dec / D2R];
}

export function pixToSky(w: Wcs, x: number, y: number): [number, number] {
  let u = x - w.crpix[0];
  let v = y - w.crpix[1];
  if (w.sipA && w.sipB) {
    const du = poly(w.sipA, u, v);
    const dv = poly(w.sipB, u, v);
    u += du;
    v += dv;
  }
  const xi = w.cd[0] * u + w.cd[1] * v;
  const eta = w.cd[2] * u + w.cd[3] * v;
  return tanDeproject(xi, eta, w.crval[0], w.crval[1]);
}

export function skyToPix(w: Wcs, ra: number, dec: number): [number, number] | null {
  const t = tanProject(ra, dec, w.crval[0], w.crval[1]);
  if (!t) return null;
  const [a, b, c, d] = w.cd;
  const det = a * d - b * c;
  const U = (d * t[0] - b * t[1]) / det;
  const V = (-c * t[0] + a * t[1]) / det;
  let u = U;
  let v = V;
  if (w.sipAP && w.sipBP) {
    u = U + poly(w.sipAP, U, V);
    v = V + poly(w.sipBP, U, V);
  } else if (w.sipA && w.sipB) {
    // No inverse coefficients: solve U = u + A(u, v) by fixed-point iteration.
    for (let i = 0; i < 8; i++) {
      u = U - poly(w.sipA, u, v);
      v = V - poly(w.sipB, u, v);
    }
  }
  return [u + w.crpix[0], v + w.crpix[1]];
}
