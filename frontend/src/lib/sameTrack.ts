import type { ObjectSummary } from "./contract";

/**
 * Neighbouring survey tiles overlap, so a track near a shared edge is published once per tile:
 * the same sightings, at the same times, with the same fitted speed. The live API folds those
 * into one object (worker/src/routes/objects.ts, mergeSameTrack); this counts the same way from
 * the data the site was built with.
 */
export function countDistinctTracks(objects: Pick<ObjectSummary, "classification" | "first_time_utc" | "last_time_utc" | "n_detections" | "rate_arcsec_per_hr">[]): number {
  const seen = new Set<string>();
  for (const o of objects) {
    if (o.classification === "injected") continue;
    seen.add(`${o.first_time_utc}|${o.last_time_utc}|${o.n_detections}|${o.rate_arcsec_per_hr}`);
  }
  return seen.size;
}
