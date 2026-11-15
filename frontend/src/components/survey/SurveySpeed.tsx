import { surveySpeed, type SpeedRun } from "@/lib/speed";
import { formatUtcDateTime } from "@/lib/format";
import { staticRunLedger, staticSurvey } from "@/lib/staticData";
import styles from "./SurveySpeed.module.css";

const n0 = (x: number) => Math.round(x).toLocaleString("en-US");

/** How fast the pipeline searches and maps new sky, averaged over every survey run in the ledger. */
export function SurveySpeedPanel() {
  const survey = staticSurvey();
  if (!survey) return null;
  const runs: SpeedRun[] | undefined = staticRunLedger() ?? (survey as unknown as { runs?: SpeedRun[] }).runs;
  const t = survey.totals;
  const deg2PerTile = t.n_searched && t.area_deg2_searched ? t.area_deg2_searched / t.n_searched : 0.09;
  const s = surveySpeed(runs, deg2PerTile);
  if (!s) return null;
  return (
    <section className={`card ${styles.panel}`} aria-labelledby="speed-heading" data-testid="survey-speed">
      <p className="eyebrow">Processing speed</p>
      <h2 id="speed-heading">How fast we map new sky</h2>
      <dl className={styles.stats}>
        <div>
          <dt>Average speed</dt>
          <dd className="mono">
            {n0(s.tilesPerHour)} <small>tiles / hour</small>
          </dd>
        </div>
        <div>
          <dt>Sky mapped</dt>
          <dd className="mono">
            {s.deg2PerHour.toFixed(0)} <small>deg² / hour</small>
          </dd>
        </div>
        <div>
          <dt>A typical run</dt>
          <dd className="mono">
            {n0(s.avgRunTiles)} <small>tiles in {n0(s.avgRunMinutes)} min</small>
          </dd>
        </div>
        {s.latest && (
          <div>
            <dt>Latest run</dt>
            <dd className="mono">
              {n0(s.latest.tilesPerHour)} <small>tiles / hour</small>
            </dd>
          </div>
        )}
      </dl>
      <p className={styles.note}>
        Averaged over {s.nRuns} survey runs: {n0(s.tiles)} tiles (0.3° patches) in {s.hours.toFixed(1)} hours of run time. Each run is
        timed from planning to publishing, so this includes downloading the SPHEREx images, searching them, checking every new object
        against JPL and publishing the results. {s.latest && <>The latest run finished {formatUtcDateTime(s.latest.finished_utc)}: {n0(s.latest.tiles)} tiles in {n0(s.latest.minutes)} minutes. </>}
        Since 14 November 2026, runs search with 10 parallel jobs, each working on 3 blocks of sky at once (before: 4 jobs, one block
        at a time), so recent runs pull the average up.
      </p>
    </section>
  );
}
