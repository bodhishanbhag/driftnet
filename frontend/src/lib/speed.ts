/** How fast the survey searches new sky, from the run ledger (every run's tiles and wall-clock time). */

export interface SpeedRun {
  started_utc: string | null;
  finished_utc: string | null;
  n_tiles_processed: number;
}

export interface SurveySpeed {
  /** Runs that searched at least one tile and recorded both times. */
  nRuns: number;
  tiles: number;
  hours: number;
  /** Average over all those runs: total tiles / total run hours. */
  tilesPerHour: number;
  deg2PerHour: number;
  /** Average run length in minutes and tiles. */
  avgRunMinutes: number;
  avgRunTiles: number;
  latest: { finished_utc: string; tiles: number; minutes: number; tilesPerHour: number } | null;
}

/**
 * Average speed from start (planning) to publish, so it includes downloading images, the search,
 * the JPL checks and committing the results. `deg2PerTile` is the searched area per searched
 * tile (tiles overlap a little, so it is less than 0.3° × 0.3°).
 */
export function surveySpeed(runs: readonly SpeedRun[] | null | undefined, deg2PerTile: number): SurveySpeed | null {
  const ok = (runs ?? [])
    .map((r) => ({
      r,
      h: r.started_utc && r.finished_utc ? (Date.parse(r.finished_utc) - Date.parse(r.started_utc)) / 3.6e6 : NaN,
    }))
    .filter(({ r, h }) => Number.isFinite(h) && h > 0 && r.n_tiles_processed > 0);
  if (!ok.length) return null;
  const tiles = ok.reduce((s, { r }) => s + r.n_tiles_processed, 0);
  const hours = ok.reduce((s, { h }) => s + h, 0);
  const last = [...ok].sort((a, b) => Date.parse(a.r.finished_utc!) - Date.parse(b.r.finished_utc!)).at(-1)!;
  return {
    nRuns: ok.length,
    tiles,
    hours,
    tilesPerHour: tiles / hours,
    deg2PerHour: (tiles / hours) * deg2PerTile,
    avgRunMinutes: (hours * 60) / ok.length,
    avgRunTiles: tiles / ok.length,
    latest: {
      finished_utc: last.r.finished_utc!,
      tiles: last.r.n_tiles_processed,
      minutes: last.h * 60,
      tilesPerHour: last.r.n_tiles_processed / last.h,
    },
  };
}
