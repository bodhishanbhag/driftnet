import Link from "next/link";
import { summarizeLimits, type LimitsStudy } from "@/lib/limits";
import { staticInjectionStudy } from "@/lib/staticData";
import styles from "./LimitingMagnitude.module.css";

/**
 * The limiting magnitude of SPHEREx data, our own search depth, and how both compare with the
 * predicted brightness of Planet X. Answers "how long would it take to find Planet X with this
 * data, or is it even possible?".
 *
 * SPHEREx depths are the mission team's published 5σ point-source estimates per spectral channel
 * (Crill et al. 2025, arXiv:2505.24856; SPHEREx current best estimate for the all-sky survey).
 * Planet X brightness: Brown & Batygin 2021 (arXiv:2108.09868), plus our own Neptune-sized model
 * from the injection study's planet_context. Our depth (m50) is read from the published study.
 */

/** One SPHEREx visit, 5σ per spectral channel, 0.75–3.8 µm. */
export const SINGLE_VISIT_AB = "18.5–19";
/** Same, 3.8–5 µm (brighter zodiacal background, shallower). */
export const SINGLE_VISIT_LONG_AB = "16.6–18";
/** All four all-sky passes of the two-year mission combined, 0.75–3.8 µm. */
export const FULL_MISSION_AB = "≈19.5";
export const FULL_MISSION_LONG_AB = "17.5–19";
/** Predicted Planet X brightness range, AB, near-infrared. */
export const PLANET_X_AB = "20–23";

function ourDepth(): { lo: number; hi: number } | null {
  const study = staticInjectionStudy();
  if (!study) return null;
  const sum = summarizeLimits(study);
  if (!sum.deepest) return null;
  return { lo: (sum.shallowest ?? sum.deepest).m50_ab, hi: sum.deepest.m50_ab };
}

function planetRow(au: number): number | null {
  const study = staticInjectionStudy() as LimitsStudy | null;
  const row = study?.planet_context?.rows.find((r) => r.distance_au === au);
  return row ? row.predicted_mag_ab : null;
}

const depthText = (d: { lo: number; hi: number } | null) =>
  d ? (d.lo === d.hi ? `AB ${d.hi.toFixed(1)}` : `AB ${d.lo.toFixed(1)}–${d.hi.toFixed(1)}`) : "about AB 17";

/** Short version for the home and about pages. */
export function LimitingMagnitudeSummary({ heading = true }: { heading?: boolean }) {
  const d = ourDepth();
  return (
    <div className={styles.summary} data-testid="limiting-magnitude">
      {heading && <p className={styles.kicker}>Limiting magnitude</p>}
      <dl className={styles.ladder}>
        <div>
          <dt>One SPHEREx image</dt>
          <dd className="mono">AB {SINGLE_VISIT_AB}</dd>
        </div>
        <div>
          <dt>Full 2-year SPHEREx survey</dt>
          <dd className="mono">AB {FULL_MISSION_AB}</dd>
        </div>
        <div>
          <dt>Our moving-object search (m₅₀)</dt>
          <dd className="mono">{depthText(d)}</dd>
        </div>
        <div className={styles.target}>
          <dt>Predicted Planet X</dt>
          <dd className="mono">AB {PLANET_X_AB}</dd>
        </div>
      </dl>
      <p className={styles.verdict}>
        Bigger numbers are fainter. Planet X is predicted to be fainter than SPHEREx can see in one image, and our current search can&apos;t
        find it however long it runs. At best a brighter-than-expected planet could be reached by stacking images across the full
        two-year survey (complete around mid-2027).{" "}
        <Link href="/limits/#limiting-magnitude">Why, in numbers</Link>
      </p>
    </div>
  );
}

/** Full explanation for the Limits page. */
export function LimitingMagnitudePanel() {
  const d = ourDepth();
  const p500 = planetRow(500);
  const p700 = planetRow(700);
  return (
    <section id="limiting-magnitude" className={`card ${styles.panel}`} aria-labelledby="limiting-magnitude-heading">
      <p className="eyebrow">Limiting magnitude</p>
      <h2 id="limiting-magnitude-heading">How faint can SPHEREx see, and could it find Planet X?</h2>
      <p className={styles.intro}>
        The limiting magnitude is the faintest object that can still be detected. Astronomers usually quote it at 5σ (signal five times
        the noise). Bigger numbers are fainter: each step of 1 is about 2.5 times fainter, and 5 steps is 100 times.
      </p>

      <div className={styles.tableWrap} role="region" aria-label="Limiting magnitudes" tabIndex={0}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">What</th>
              <th scope="col">0.75–3.8 µm</th>
              <th scope="col">3.8–5 µm</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">One SPHEREx visit, 5σ per spectral channel</th>
              <td className="mono">AB {SINGLE_VISIT_AB}</td>
              <td className="mono">AB {SINGLE_VISIT_LONG_AB}</td>
            </tr>
            <tr>
              <th scope="row">Full two-year survey, all 4 sky passes combined</th>
              <td className="mono">AB {FULL_MISSION_AB}</td>
              <td className="mono">AB {FULL_MISSION_LONG_AB}</td>
            </tr>
            <tr>
              <th scope="row">Our moving-object search, 50% recovered (m₅₀)</th>
              <td className="mono" colSpan={2}>
                {depthText(d)} at asteroid speeds; nothing at Planet X speeds
              </td>
            </tr>
            <tr className={styles.targetRow}>
              <th scope="row">Predicted Planet X</th>
              <td className="mono" colSpan={2}>
                AB {PLANET_X_AB}
                {p500 != null && p700 != null && (
                  <span className={styles.note}>
                    {" "}
                    (our Neptune-sized model: AB {p500.toFixed(1)} at 500 AU, {p700.toFixed(1)} at 700 AU)
                  </span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3 className={styles.sub}>So how long would it take?</h3>
      <ul className={styles.points}>
        <li>
          <strong>With our current search: not possible at any wait.</strong> Planet X is predicted about 2–5 magnitudes (10–100 times)
          fainter than our m₅₀, and at 300–1,000 AU it drifts only 0.01–0.05″ per hour, at most about one 6.2″ SPHEREx pixel a week. Linking images
          over 1–2 days, it looks like a fixed star.
        </li>
        <li>
          <strong>With all of SPHEREx&apos;s data: still short in any single image.</strong> One visit reaches about AB 18.5–19 and the
          full two-year survey about AB 19.5 per channel. That is 0.5–3.5 magnitudes brighter than the predictions, so only a
          Planet X that is closer or larger than expected (roughly AB 19 or brighter) would show up in a single image.
        </li>
        <li>
          <strong>The only realistic route is shift-and-stack, after mid-2027.</strong> SPHEREx sees each patch of sky about every six
          months. Adding together every exposure of a patch along millions of trial orbits, across many spectral channels and all four
          passes (roughly 70 exposures), could in principle gain about 2 magnitudes, to around AB 21. That is our own rough estimate,
          not a measured result: it ignores crowding by faint stars and galaxies and methane absorption, which would make the planet
          fainter at many SPHEREx wavelengths. It would be a months-long computing project after the survey ends, not a change to this site.
        </li>
        <li>
          <strong>What we can honestly say today:</strong> in the patches we searched, we would have caught most asteroid-speed
          objects brighter than our m₅₀. We can&apos;t yet rule out a slow, distant planet at any brightness.
        </li>
      </ul>
      <p className={styles.cite}>
        Sources: SPHEREx single-visit and full-survey 5σ sensitivities from the SPHEREx team (Crill et al. 2025, arXiv:2505.24856;
        Doré et al. 2018, arXiv:1805.05489). Planet Nine brightness about V 21–22 from Brown &amp; Batygin 2021 (arXiv:2108.09868);
        optical surveys already exclude much of its predicted path brighter than V ≈ 21 (Brown, Holman &amp; Batygin 2024). Our m₅₀ and
        the Neptune-sized model come from the injection study below.
      </p>
    </section>
  );
}
