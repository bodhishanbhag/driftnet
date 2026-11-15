/** Parse what someone types into the "look anywhere" box: decimal or sexagesimal RA/Dec, or a name. */

export type Parsed = { kind: "coords"; ra: number; dec: number } | { kind: "name"; name: string } | { kind: "error"; message: string };

const SEX_RE =
  /^\s*(\d{1,2})[h:\s]\s*(\d{1,2})[m:\s]\s*(\d{1,2}(?:\.\d+)?)s?\s*[,\s]\s*([+\-−]?)\s*(\d{1,2})[d°:\s]\s*(\d{1,2})[m′':\s]\s*(\d{1,2}(?:\.\d+)?)(?:s|″|")?\s*$/i;
const DEC_RE = /^\s*(\d{1,3}(?:\.\d+)?)\s*[,\s]\s*([+\-−]?\d{1,2}(?:\.\d+)?)\s*$/;

export function parseTarget(input: string): Parsed {
  const s = input.trim();
  if (!s) return { kind: "error", message: "Type a name or coordinates." };
  const m = SEX_RE.exec(s);
  if (m) {
    const ra = 15 * (Number(m[1]) + Number(m[2]) / 60 + Number(m[3]) / 3600);
    const sign = m[4] === "-" || m[4] === "−" ? -1 : 1;
    const dec = sign * (Number(m[5]) + Number(m[6]) / 60 + Number(m[7]) / 3600);
    return check(ra, dec);
  }
  const d = DEC_RE.exec(s);
  if (d) return check(Number(d[1]), Number(d[2]!.replace("−", "-")));
  if (/^[\d\s.:+\-−,hmsd°′″'"]+$/i.test(s)) return { kind: "error", message: "Couldn't read those coordinates. Try 269.452 4.693 or 17h57m48.5s +04d41m36s." };
  return { kind: "name", name: s };
}

function check(ra: number, dec: number): Parsed {
  if (!(ra >= 0 && ra < 360) || !(dec >= -90 && dec <= 90)) return { kind: "error", message: "RA must be 0–360° and Dec −90 to +90°." };
  return { kind: "coords", ra, dec };
}

/** Where a star is at a given MJD, from its position at an epoch and its proper motion. */
export function propagate(
  t: { ra_deg: number; dec_deg: number; pm_ra_mas_yr: number | null; pm_dec_mas_yr: number | null; epoch_year: number },
  mjd: number,
): [number, number] {
  const year = 2000 + (mjd - 51544.5) / 365.25;
  const dt = year - t.epoch_year;
  const cosd = Math.cos((t.dec_deg * Math.PI) / 180);
  const ra = t.ra_deg + ((t.pm_ra_mas_yr ?? 0) * dt) / 3.6e6 / Math.max(cosd, 1e-6);
  const dec = t.dec_deg + ((t.pm_dec_mas_yr ?? 0) * dt) / 3.6e6;
  return [((ra % 360) + 360) % 360, dec];
}

export const fmtRa = (ra: number) => {
  const h = ra / 15;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  const ss = ((h - hh) * 60 - mm) * 60;
  return `${String(hh).padStart(2, "0")}h${String(mm).padStart(2, "0")}m${ss.toFixed(1).padStart(4, "0")}s`;
};

export const fmtDec = (dec: number) => {
  const s = dec < 0 ? "−" : "+";
  const a = Math.abs(dec);
  const dd = Math.floor(a);
  const mm = Math.floor((a - dd) * 60);
  const ss = ((a - dd) * 60 - mm) * 60;
  return `${s}${String(dd).padStart(2, "0")}°${String(mm).padStart(2, "0")}′${ss.toFixed(0).padStart(2, "0")}″`;
};
