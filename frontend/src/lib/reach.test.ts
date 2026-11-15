import { describe, expect, it } from "vitest";
import { absMag, brightReach, computeReach, logRadius, motionReach } from "./reach";

describe("reach", () => {
  it("absolute magnitude from size and albedo", () => {
    expect(absMag(1, 0.15)).toBeCloseTo(17.68, 1);
  });

  it("solves the brightness distance", () => {
    // A body of H = 10 is magnitude 10 + 5 log10(r (r − 1)) − 0.27 at distance r.
    const r = brightReach(10, 18);
    expect(10 + 5 * Math.log10(r * (r - 1)) - 0.27).toBeCloseTo(18, 6);
    expect(brightReach(10, 19)).toBeGreaterThan(r);
  });

  it("interpolates where the median speed falls to the slowest speed recovered", () => {
    const rows = [
      { distance_au: 5, median_rate_arcsec_per_hr: 14.3 },
      { distance_au: 30, median_rate_arcsec_per_hr: 1.09 },
    ];
    const r = motionReach(rows, 3)!;
    expect(r).toBeGreaterThan(5);
    expect(r).toBeLessThan(30);
    expect(motionReach(rows, 100)).toBeNull();
  });

  it("builds the reach table from a study", () => {
    const reach = computeReach({
      m50_by_rate: [
        { rate_arcsec_per_hr: 1, m50_ab: null },
        { rate_arcsec_per_hr: 3, m50_ab: 17 },
        { rate_arcsec_per_hr: 10, m50_ab: 17.67 },
        { rate_arcsec_per_hr: 30, m50_ab: 17.64 },
      ],
      m50_by_distance: [
        { distance_au: 5, median_rate_arcsec_per_hr: 14.3 },
        { distance_au: 30, median_rate_arcsec_per_hr: 1.09 },
      ],
      planet_context: { rows: [{ distance_au: 500, predicted_mag_ab: 19.83 }] },
    })!;
    expect(reach.oursAb).toBe(17.64);
    expect(reach.slowestRate).toBe(3);
    const nep = reach.bodies.find((b) => b.key === "neptune")!;
    expect(nep.ours).toBeCloseTo(500 * 10 ** ((17.64 - 19.83) / 10), 6);
    expect(nep.full).toBeGreaterThan(nep.ours);
    // Bigger bodies are seen further out.
    const d = reach.bodies.map((b) => b.ours);
    expect([...d].sort((a, b) => a - b)).toEqual(d);
    expect(logRadius(0)).toBe(0);
  });
});
