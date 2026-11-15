/**
 * The five example targets from the "Planet X and SPHEREx" challenge, with positions at a stated
 * epoch and proper motions, so each SPHEREx image can mark where the object should be that day.
 *
 * Sources: Barnard's Star, SIMBAD/Gaia DR3 (J2000 position, proper motion). WISE 0855−0714,
 * HST program 13802 target position at epoch 2014.052, proper motion from Kirkpatrick et al. 2021
 * (its catalogue name encodes a 2010 position it has long since left). ε Indi B, McCaughrean et
 * al. 2004 (position at 1999.666, proper motion). RW Aurigae A, Gaia DR3. R Draconis, GCVS.
 */
import type { Resolved } from "./types";

export interface Preset extends Resolved {
  key: string;
  what: string;
  /** What to look for, in a sentence. */
  look: string;
  /** SPHEREx detector (1–6) shown first. */
  detector: number;
  show: "motion" | "brightness";
}

export const PRESETS: Preset[] = [
  {
    key: "barnard",
    name: "Barnard's Star",
    what: "The fastest-moving star in our sky",
    look: "It crawls about 10 arcseconds a year, nearly 2 SPHEREx pixels, so the marker shifts north between visits months apart. It is bright enough to saturate SPHEREx's detectors at short wavelengths.",
    ra_deg: 269.452075,
    dec_deg: 4.693392,
    pm_ra_mas_yr: -802.8,
    pm_dec_mas_yr: 10362.5,
    epoch_year: 2000,
    detector: 2,
    show: "motion",
  },
  {
    key: "wise0855",
    name: "WISE 0855−0714",
    what: "The coldest known brown dwarf, 7.4 light-years away",
    look: "At about −30 °C it is colder than ice, so it is invisible at short wavelengths and faint even at 4–5 µm: in single SPHEREx images it is at or below the detection limit. It moves 8 arcseconds a year, to the west.",
    ra_deg: 133.7870833,
    dec_deg: -7.24445,
    pm_ra_mas_yr: -8123.7,
    pm_dec_mas_yr: 673.2,
    epoch_year: 2014.052,
    detector: 6,
    show: "motion",
  },
  {
    key: "epsindib",
    name: "Epsilon Indi B",
    what: "A pair of brown dwarfs 12 light-years away",
    look: "The two brown dwarfs are about 0.6 arcseconds apart, far closer than one SPHEREx pixel, so they show as a single dot moving about 4.7 arcseconds a year to the southeast.",
    ra_deg: 331.0433,
    dec_deg: -56.782581,
    pm_ra_mas_yr: 3976,
    pm_dec_mas_yr: -2500,
    epoch_year: 1999.666,
    detector: 2,
    show: "motion",
  },
  {
    key: "rwaur",
    name: "RW Aurigae",
    what: "A young star still feeding on its planet-forming disk",
    look: "It hardly moves. Watch its brightness instead: dust in its disk makes it dim and recover, and the chart below measures it in every image.",
    ra_deg: 76.956068,
    dec_deg: 30.401326,
    pm_ra_mas_yr: 2.6,
    pm_dec_mas_yr: -27.4,
    epoch_year: 2016,
    detector: 2,
    show: "brightness",
  },
  {
    key: "rdra",
    name: "R Draconis",
    what: "A pulsating red giant (Mira variable, 246-day cycle)",
    look: "It swells and shrinks, changing brightness many times over in visible light and less in the infrared. It sits near the north ecliptic pole, which SPHEREx sees often, so there are many images.",
    ra_deg: 248.1675,
    dec_deg: 66.755,
    pm_ra_mas_yr: null,
    pm_dec_mas_yr: null,
    epoch_year: 2000,
    detector: 2,
    show: "brightness",
  },
];

/** SPHEREx's six detectors and the wavelengths each covers (µm). */
export const DETECTORS: { n: number; range: [number, number] }[] = [
  { n: 1, range: [0.75, 1.09] },
  { n: 2, range: [1.1, 1.62] },
  { n: 3, range: [1.63, 2.41] },
  { n: 4, range: [2.42, 3.82] },
  { n: 5, range: [3.83, 4.41] },
  { n: 6, range: [4.42, 5.0] },
];
