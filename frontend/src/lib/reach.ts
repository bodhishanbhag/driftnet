/**
 * How far out the search can see: for bodies of a few sizes, the distance at which they get
 * fainter than a limiting magnitude, and the distance beyond which anything moves too slowly for
 * a one-to-two-day search to link.
 *
 * Brightness of a small body seen near opposition from near Earth, in reflected sunlight:
 *   H = 5 log10(1329 km / (D √p))          (absolute magnitude from diameter D and albedo p)
 *   V ≈ H + 5 log10(r Δ),  Δ ≈ r − 1 AU     (phase angle ignored: it is small past a few AU)
 * and V_AB − J_AB = 0.27 for solar colours (as in the injection study's planet model), so in
 * SPHEREx's 1.25 µm band m ≈ V − 0.27. These are optimistic (no phase darkening).
 */

export interface ReachBody {
  key: string;
  label: string;
  /** Distance (AU) at which it reaches each limiting magnitude. */
  ours: number;
  full: number;
}

export interface Reach {
  /** Limiting magnitudes compared: our search (m50) and the full SPHEREx survey (5σ). */
  oursAb: number;
  fullAb: number;
  bodies: ReachBody[];
  /** Beyond this distance the median motion is slower than any speed we ever recovered half of. */
  motionAu: number | null;
  slowestRate: number | null;
  /** Predicted Planet X distance range (AU). */
  planetX: [number, number];
}

export const absMag = (dKm: number, albedo: number) => 5 * Math.log10(1329 / (dKm * Math.sqrt(albedo)));

/** Heliocentric distance r (AU, > 1) at which a body of absolute magnitude H has magnitude m. */
export function brightReach(H: number, m: number): number {
  const q = 10 ** ((m + 0.27 - H) / 5); // r (r − 1)
  return (1 + Math.sqrt(1 + 4 * q)) / 2;
}

const BODIES = [
  { key: "1km", label: "1 km asteroid", d: 1, p: 0.15 },
  { key: "10km", label: "10 km asteroid", d: 10, p: 0.15 },
  { key: "100km", label: "100 km body", d: 100, p: 0.15 },
  { key: "pluto", label: "Pluto-sized world", d: 2377, p: 0.6 },
];

export interface ReachStudy {
  m50_by_rate: { rate_arcsec_per_hr: number; m50_ab: number | null }[];
  m50_by_distance: { distance_au: number; median_rate_arcsec_per_hr: number }[];
  planet_context?: { rows: { distance_au: number; predicted_mag_ab: number }[] } | null;
}

/** Log-log interpolation of median speed against distance: where it falls to `rate`. */
export function motionReach(rows: ReachStudy["m50_by_distance"], rate: number): number | null {
  const pts = [...rows].filter((r) => r.median_rate_arcsec_per_hr > 0).sort((a, b) => a.distance_au - b.distance_au);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    if (a.median_rate_arcsec_per_hr >= rate && b.median_rate_arcsec_per_hr <= rate) {
      const t = Math.log(rate / a.median_rate_arcsec_per_hr) / Math.log(b.median_rate_arcsec_per_hr / a.median_rate_arcsec_per_hr);
      return Math.exp(Math.log(a.distance_au) + t * Math.log(b.distance_au / a.distance_au));
    }
  }
  return null;
}

export function computeReach(study: ReachStudy, fullAb = 19.5): Reach | null {
  const m50s = study.m50_by_rate.filter((r) => r.m50_ab !== null);
  if (!m50s.length) return null;
  const sorted = m50s.map((r) => r.m50_ab!).sort((a, b) => a - b);
  const oursAb = sorted[Math.floor(sorted.length / 2)]!;
  const slowestRate = Math.min(...m50s.map((r) => r.rate_arcsec_per_hr));
  const bodies: ReachBody[] = BODIES.map((b) => {
    const H = absMag(b.d, b.p);
    return { key: b.key, label: b.label, ours: brightReach(H, oursAb), full: brightReach(H, fullAb) };
  });
  // Neptune-sized planet: the study's own model, which falls off as r⁴ that far out.
  const ref = study.planet_context?.rows.find((r) => r.distance_au === 500) ?? study.planet_context?.rows.at(-1);
  if (ref) {
    const at = (m: number) => ref.distance_au * 10 ** ((m - ref.predicted_mag_ab) / 10);
    bodies.push({ key: "neptune", label: "Neptune-sized planet", ours: at(oursAb), full: at(fullAb) });
  }
  return {
    oursAb,
    fullAb,
    bodies,
    motionAu: motionReach(study.m50_by_distance, slowestRate),
    slowestRate,
    planetX: [400, 800],
  };
}

/** Scene radius for a distance in AU: logarithmic, so 1 AU and 800 AU fit in one view. */
export const logRadius = (au: number) => 6 * Math.log10(1 + au);
