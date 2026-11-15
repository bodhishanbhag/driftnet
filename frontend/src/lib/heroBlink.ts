import type { HeroBlinkProps } from "@/components/home/HeroBlink";
import { formatInterval, formatUtcShortDate, formatUtcTime, formatWavelength } from "@/lib/format";
import { gridToImage } from "@/lib/grid";
import { fieldHref, objectHref } from "@/lib/routes";
import { staticField, staticObjects } from "@/lib/staticData";

/** "about half the width of this patch of Aquarius": distance as a share of the picture, not arcseconds. */
function shiftWords(fraction: number, arcsec: number): string {
  const share =
    fraction > 0.85
      ? "nearly the full width"
      : fraction > 0.6
        ? "about two-thirds of the width"
        : fraction > 0.4
          ? "about half the width"
          : fraction > 0.25
            ? "about a third of the width"
            : null;
  return share ? `${share} of this patch of Aquarius` : `${Math.round(arcsec)}″ across this patch of Aquarius`;
}

/** The showcase patch the home page blinks: its default pair, with the mover's place in each image. */
const HERO_FIELD = "aquarius-a";

export function heroBlink(): HeroBlinkProps | null {
  const field = staticField(HERO_FIELD);
  if (!field) return null;
  const pair = field.blink_pairs.find((p) => p.default) ?? field.blink_pairs[0];
  const mover = field.movers[0];
  if (!pair || !mover) return null;
  const epochs = [pair.epoch_id_a, pair.epoch_id_b].map((id) => field.epochs.find((e) => e.epoch_id === id));
  const points = [pair.epoch_id_a, pair.epoch_id_b].map((id) => mover.track.find((t) => t.epoch_id === id));
  if (epochs.some((e) => !e?.image?.source) || points.some((p) => !p)) return null;
  const h = field.wcs.height_px;
  const frames = epochs.map((e, i) => ({
    key: i === 0 ? "A" : "B",
    src: e!.image.url,
    timeLabel: formatUtcTime(e!.time_utc),
    dateLabel: `${formatUtcShortDate(e!.time_utc)}, ${e!.time_utc.slice(0, 4)}`,
    wavelengthLabel: formatWavelength(e!.wavelength_um_center),
    sourceFile: e!.image.source.file,
    archiveUrl: e!.image.source.archive_url ?? null,
    mover: gridToImage(points[i]!.x_grid, points[i]!.y_grid, h),
  })) as HeroBlinkProps["frames"];
  const shiftPx = Math.hypot(points[1]!.x_grid - points[0]!.x_grid, points[1]!.y_grid - points[0]!.y_grid);
  const shift = shiftPx * field.wcs.cdelt_arcsec;
  const object = staticObjects()?.objects.find((o) => o.candidate_ids.includes(mover.candidate_id));
  return {
    frames,
    widthPx: field.wcs.width_px,
    heightPx: h,
    place: "a patch of Aquarius",
    interval: formatInterval(epochs[0]!.mjd, epochs[1]!.mjd),
    shift: shiftWords(shiftPx / field.wcs.width_px, shift),
    wavelengthMatched: pair.lambda_matched,
    fieldHref: fieldHref(field.field_id),
    objectHref: object ? objectHref(object.object_id) : null,
  };
}
