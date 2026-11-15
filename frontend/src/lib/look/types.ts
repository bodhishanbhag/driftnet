/** Shapes of the Worker's /api/look answers. */

export interface Resolved {
  name: string;
  ra_deg: number;
  dec_deg: number;
  /** mas/yr, RA component includes cos δ. */
  pm_ra_mas_yr: number | null;
  pm_dec_mas_yr: number | null;
  /** Year of the position. */
  epoch_year: number;
}

export interface LookImage {
  obs_id: string | null;
  detector: number | null;
  time_utc: string;
  mjd: number;
  wavelength_um_range: [number, number] | null;
  archive_url: string;
}

export interface LookImages {
  center: { ra_deg: number; dec_deg: number };
  searched: string;
  n_images: number;
  images: LookImage[];
}
