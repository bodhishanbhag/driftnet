import { describe, expect, it } from "vitest";
import { countDistinctTracks } from "./sameTrack";

const row = (first: string, rate: number, classification: "unmatched" | "injected" = "unmatched") => ({
  classification,
  first_time_utc: first,
  last_time_utc: "2025-11-30T12:55:04Z",
  n_detections: 27,
  rate_arcsec_per_hr: rate,
});

describe("countDistinctTracks", () => {
  it("counts the same sightings published by two tiles once, and leaves simulations out", () => {
    const rows = [row("2025-11-29T05:56:06Z", 32.973), row("2025-11-29T05:56:06Z", 32.973), row("2025-11-29T05:56:06Z", 12.5), row("2025-11-28T00:00:00Z", 32.973), row("2025-11-29T05:56:06Z", 32.973, "injected")];
    expect(countDistinctTracks(rows)).toBe(3);
  });
});
