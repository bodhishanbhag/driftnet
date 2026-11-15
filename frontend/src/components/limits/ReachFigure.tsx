"use client";

import { useState } from "react";
import { Figure3D } from "@/components/three/Figure3D";
import { WhenVisible } from "@/components/WhenVisible";
import { fmt } from "@/lib/format";
import type { Reach } from "@/lib/reach";
import type { ReachMode } from "./ReachScene";
import styles from "./LimitingMagnitude.module.css";

const au = (x: number) => `${fmt(x, x < 10 ? 1 : 0)} AU`;

/** The same numbers as the 3D view, as a table (also the view without WebGL). */
function ReachTable({ reach }: { reach: Reach }) {
  return (
    <div className={styles.tableWrap} role="region" aria-label="How far out each body can be detected" tabIndex={0}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Body</th>
            <th scope="col">Bright enough out to (our search, AB {fmt(reach.oursAb, 1)})</th>
            <th scope="col">Full SPHEREx survey (AB {fmt(reach.fullAb, 1)})</th>
          </tr>
        </thead>
        <tbody>
          {reach.bodies.map((b) => (
            <tr key={b.key}>
              <th scope="row">{b.label}</th>
              <td className="mono">{au(b.ours)}</td>
              <td className="mono">{au(b.full)}</td>
            </tr>
          ))}
          {reach.motionAu && (
            <tr>
              <th scope="row">Moves fast enough to link in 1–2 days</th>
              <td className="mono" colSpan={2}>
                within about {au(reach.motionAu)} (slower than {fmt(reach.slowestRate ?? 0, 0)}″/hr is never recovered)
              </td>
            </tr>
          )}
          <tr className={styles.targetRow}>
            <th scope="row">Predicted Planet X</th>
            <td className="mono" colSpan={2}>
              {reach.planetX[0]}–{reach.planetX[1]} AU
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function ReachFigure({ reach }: { reach: Reach }) {
  const [mode, setMode] = useState<ReachMode>("ours");
  return (
    <div className={styles.reach} data-testid="reach-3d">
      <div className={styles.toggle} role="group" aria-label="Limiting magnitude shown">
        <button type="button" aria-pressed={mode === "ours"} onClick={() => setMode("ours")}>
          Our search today
        </button>
        <button type="button" aria-pressed={mode === "full"} onClick={() => setMode("full")}>
          Full SPHEREx survey
        </button>
      </div>
      <WhenVisible minHeight={420}>
        <Figure3D
          load={() => import("./ReachScene")}
          props={{ reach, mode }}
          flat={<ReachTable reach={reach} />}
          label="the detection-reach view"
          hint="3D view, distances on a log scale: drag to turn, scroll or pinch to zoom."
          tall
        />
      </WhenVisible>
      <details className={styles.details}>
        <summary>The numbers behind this view</summary>
        <ReachTable reach={reach} />
        <p className={styles.cite}>
          Brightness from reflected sunlight near opposition: H = 5 log₁₀(1329 km / (D√p)), V ≈ H + 5 log₁₀(rΔ), and V − J = 0.27 for
          solar colours. Albedo 0.15 for asteroids, 0.6 for a Pluto-sized world; the Neptune-sized planet uses the injection
          study&apos;s model. Phase darkening is ignored, so these distances are optimistic. The motion limit comes from the study:
          the distance where the median speed of planted objects falls below the slowest speed we ever recovered half of.
        </p>
      </details>
    </div>
  );
}
