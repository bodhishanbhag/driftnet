import { describe, expect, it } from "vitest";
import { surveySpeed } from "./speed";

describe("surveySpeed", () => {
  it("averages tiles over total run time and skips runs without times or tiles", () => {
    const s = surveySpeed(
      [
        { started_utc: "2026-11-01T00:00:00Z", finished_utc: "2026-11-01T01:00:00Z", n_tiles_processed: 600 },
        { started_utc: "2026-11-02T00:00:00Z", finished_utc: "2026-11-02T00:30:00Z", n_tiles_processed: 900 },
        { started_utc: null, finished_utc: "2026-11-03T00:30:00Z", n_tiles_processed: 900 },
        { started_utc: "2026-11-04T00:00:00Z", finished_utc: "2026-11-04T00:30:00Z", n_tiles_processed: 0 },
      ],
      0.06,
    )!;
    expect(s.nRuns).toBe(2);
    expect(s.tiles).toBe(1500);
    expect(s.hours).toBeCloseTo(1.5);
    expect(s.tilesPerHour).toBeCloseTo(1000);
    expect(s.deg2PerHour).toBeCloseTo(60);
    expect(s.avgRunMinutes).toBeCloseTo(45);
    expect(s.latest).toMatchObject({ tiles: 900, tilesPerHour: 1800 });
  });

  it("is null without usable runs", () => {
    expect(surveySpeed([], 0.06)).toBeNull();
    expect(surveySpeed(undefined, 0.06)).toBeNull();
  });
});
