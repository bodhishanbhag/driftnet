import { describe, expect, it } from "vitest";
import { parseTarget, propagate } from "./coords";
import { findImage, readHdus } from "./fits";
import { aperture, differential, gridToSky, medianStack, shiftAndStack, skyToGrid } from "./frames";
import { pixToSky, skyToPix, wcsFromHeader } from "./wcs";

function card(k: string, v: string) {
  return `${k.padEnd(8)}= ${v.padStart(20)}`.padEnd(80);
}

function fitsFile(w: number, h: number, extra: string[] = []): ArrayBuffer {
  const cards = [card("SIMPLE", "T"), card("BITPIX", "-32"), card("NAXIS", "2"), card("NAXIS1", String(w)), card("NAXIS2", String(h)), ...extra, "END".padEnd(80)];
  const head = cards.join("").padEnd(Math.ceil((cards.length * 80) / 2880) * 2880, " ");
  const dataBytes = Math.ceil((w * h * 4) / 2880) * 2880;
  const buf = new ArrayBuffer(head.length + dataBytes);
  new Uint8Array(buf).set(new TextEncoder().encode(head));
  const dv = new DataView(buf, head.length);
  for (let i = 0; i < w * h; i++) dv.setFloat32(i * 4, i, false);
  return buf;
}

describe("fits", () => {
  it("reads a big-endian float image", () => {
    const buf = fitsFile(4, 3, [card("CTYPE1", "'RA---TAN'")]);
    expect(readHdus(buf)).toHaveLength(1);
    const img = findImage(buf)!;
    expect(img.width).toBe(4);
    expect(img.height).toBe(3);
    expect(img.data[5]).toBe(5);
    expect(img.header.CTYPE1).toBe("RA---TAN");
  });
});

describe("wcs", () => {
  const header = {
    CTYPE1: "RA---TAN-SIP",
    CTYPE2: "DEC--TAN-SIP",
    CRPIX1: 30,
    CRPIX2: 30,
    CRVAL1: 269.45,
    CRVAL2: 4.69,
    CD1_1: -0.0012,
    CD1_2: 0.0011,
    CD2_1: 0.0011,
    CD2_2: 0.0012,
    A_ORDER: 2,
    A_2_0: 1e-5,
    B_ORDER: 2,
    B_0_2: -1e-5,
  };
  it("round-trips pixel → sky → pixel with SIP (no inverse coefficients)", () => {
    const w = wcsFromHeader(header)!;
    for (const [x, y] of [
      [30, 30],
      [5, 50],
      [55, 8],
    ] as const) {
      const [ra, dec] = pixToSky(w, x, y);
      const p = skyToPix(w, ra, dec)!;
      expect(p[0]).toBeCloseTo(x, 4);
      expect(p[1]).toBeCloseTo(y, 4);
    }
  });

  it("output grid is north up, east left, and invertible", () => {
    const g = { ra0: 10, dec0: 20, n: 61, scale: 6 };
    const [ra, dec] = gridToSky(g, 30, 30);
    expect(ra).toBeCloseTo(10, 8);
    expect(dec).toBeCloseTo(20, 8);
    expect(gridToSky(g, 30, 0)[1]).toBeGreaterThan(20); // top is north
    expect(gridToSky(g, 0, 30)[0]).toBeGreaterThan(10); // left is east
    const [c, r] = skyToGrid(g, ...gridToSky(g, 12, 44));
    expect(c).toBeCloseTo(12, 1);
    expect(r).toBeCloseTo(44, 1);
  });
});

describe("photometry and stacking", () => {
  it("measures a point source above the background", () => {
    const n = 31;
    const d = new Float32Array(n * n).fill(10);
    d[15 * n + 15] = 110;
    expect(aperture(d, n, 15, 15)).toBeCloseTo(100, 5);
  });
  it("median stack ignores blanks", () => {
    const a = Float32Array.from([1, Number.NaN, 5]);
    const b = Float32Array.from([3, 2, 5]);
    const c = Float32Array.from([2, 4, 100]);
    expect(Array.from(medianStack([a, b, c]))).toEqual([2, 3, 5]);
  });
});

describe("coords", () => {
  it("reads the challenge's sexagesimal format, decimals and names", () => {
    const p = parseTarget("08h55m10.831s -7d14m42.53s");
    expect(p.kind).toBe("coords");
    if (p.kind === "coords") {
      expect(p.ra).toBeCloseTo(133.79513, 4);
      expect(p.dec).toBeCloseTo(-7.24515, 4);
    }
    expect(parseTarget("17 57 48.5 +04 41 36")).toMatchObject({ kind: "coords" });
    expect(parseTarget("269.452, 4.693")).toMatchObject({ kind: "coords", ra: 269.452, dec: 4.693 });
    expect(parseTarget("Barnard's Star")).toEqual({ kind: "name", name: "Barnard's Star" });
    expect(parseTarget("400 0").kind).toBe("error");
  });
  it("moves a star by its proper motion", () => {
    const [ra, dec] = propagate({ ra_deg: 0, dec_deg: 0, pm_ra_mas_yr: 3600, pm_dec_mas_yr: -3600, epoch_year: 2000 }, 51544.5 + 365.25 * 10);
    expect(ra).toBeCloseTo(36 / 3600, 8);
    expect(dec).toBeCloseTo(-36 / 3600, 8);
  });
});

describe("differential photometry and stacking", () => {
  it("removes a per-frame calibration change seen in the comparison stars", () => {
    // Frame 2 is 20% too bright overall; the target really is 2× brighter in frame 3.
    const scale = [1, 1.2, 1, 1];
    const target = [100, 120, 200, 100].map((v) => v);
    const comps = [
      scale.map((s) => 50 * s),
      scale.map((s) => 80 * s),
      scale.map((s) => 30 * s),
    ];
    const r = differential(target, comps);
    expect(r.nComp).toBe(3);
    expect(r.target[1]).toBeCloseTo(0, 6);
    expect(r.target[2]).toBeCloseTo(-2.5 * Math.log10(2), 6);
    expect(r.floor).toBeCloseTo(0, 6);
  });

  it("shift-and-stack lines up a faint mover", () => {
    const n = 41;
    const frames = Array.from({ length: 16 }, (_, k) => {
      const z = new Float32Array(n * n);
      let seed = k * 7919 + 1;
      for (let i = 0; i < z.length; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        z[i] = ((seed / 0x7fffffff) - 0.5) * 3.46; // unit-variance noise
      }
      const at: [number, number] = [10 + k, 20];
      // A faint star spread over 3×3 pixels at 1σ each: invisible in any one frame.
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) z[(20 + dy) * n + 10 + k + dx]! += 1;
      return { z, at };
    });
    const { snr } = shiftAndStack(frames, n, [20, 20]);
    expect(snr).not.toBeNull();
    expect(snr!).toBeGreaterThan(5);
  });
});
