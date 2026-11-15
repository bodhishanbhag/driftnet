"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { fmt } from "@/lib/format";
import { logRadius, type Reach } from "@/lib/reach";
import { Stage3D } from "@/components/three/Stage3D";
import { cssColor, type Stage } from "@/components/three/stage";
import styles from "@/components/three/Figure3D.module.css";

export type ReachMode = "ours" | "full";

export interface ReachSceneProps {
  reach: Reach;
  mode: ReachMode;
  onFail: () => void;
}

const SEG = 160;
const circle = (r: number, y = 0) =>
  Array.from({ length: SEG + 1 }, (_, i) => {
    const a = (i / SEG) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
  });

/** Deterministic scatter, so the belts look the same on every visit. */
function rand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function belt(stage: Stage, n: number, au0: number, au1: number, thick: number, color: THREE.Color, opacity: number, seed: number) {
  const r = rand(seed);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const rad = logRadius(au0 + (au1 - au0) * r());
    pts.push(new THREE.Vector3(Math.cos(a) * rad, (r() - 0.5) * thick, Math.sin(a) * rad));
  }
  const geo = stage.keep(new THREE.BufferGeometry().setFromPoints(pts));
  const mat = stage.keep(new THREE.PointsMaterial({ color, size: 2, sizeAttenuation: false, transparent: true, opacity }));
  stage.scene.add(new THREE.Points(geo, mat));
}

/**
 * How far out the search can see, on a logarithmic distance scale: rings where bodies of a few
 * sizes get too faint, a sphere beyond which everything moves too slowly to link in a day or two,
 * and the predicted Planet X zone beyond both.
 */
export default function ReachScene({ reach, mode, onFail }: ReachSceneProps) {
  const update = useRef<((m: ReachMode) => void) | null>(null);
  const R = logRadius(reach.planetX[1]) * 1.05;

  const build = (stage: Stage) => {
    const { scene } = stage;
    const muted = cssColor("--text-muted", "#9fb3c8");
    const mint = cssColor("--track", "#7cf0c8");
    const gold = cssColor("--ir-7", "#ffcf5a");
    const coral = new THREE.Color("#ff8a70");

    // Sun.
    scene.add(new THREE.Mesh(stage.keep(new THREE.SphereGeometry(0.35, 24, 16)), stage.keep(new THREE.MeshBasicMaterial({ color: gold }))));
    stage.tag("Sun", new THREE.Vector3(), "sun");

    // Planets' orbits and the two belts, for scale.
    const ringMat = stage.keep(new THREE.LineBasicMaterial({ color: muted, transparent: true, opacity: 0.45 }));
    for (const [name, au, k] of [
      ["Earth", 1, 0.62],
      ["Jupiter", 5.2, 0.15],
      ["Neptune", 30.1, 0.3],
    ] as const) {
      const pts = circle(logRadius(au));
      scene.add(new THREE.Line(stage.keep(new THREE.BufferGeometry().setFromPoints(pts)), ringMat));
      stage.tag(name, pts[Math.round(SEG * k)]!, "plain");
    }
    belt(stage, 900, 2.1, 3.3, 0.25, muted, 0.5, 7);
    belt(stage, 1400, 30, 50, 0.9, muted, 0.35, 11);
    stage.tag("Main belt", new THREE.Vector3(logRadius(2.7) * Math.cos(2.2), 0, logRadius(2.7) * Math.sin(2.2)), "plain");
    stage.tag("Kuiper belt", new THREE.Vector3(logRadius(42) * Math.cos(2.6), 0, logRadius(42) * Math.sin(2.6)), "plain");

    // Distance scale along one axis.
    const tickMat = stage.keep(new THREE.LineBasicMaterial({ color: muted, transparent: true, opacity: 0.35 }));
    scene.add(new THREE.Line(stage.keep(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(R, 0, 0)])), tickMat));
    for (const au of [1, 10, 100, 1000]) stage.tag(`${au} AU`, new THREE.Vector3(logRadius(au), -0.15, 0), "plain");

    // Motion limit: a faint sphere.
    if (reach.motionAu) {
      const r = logRadius(reach.motionAu);
      scene.add(
        new THREE.Mesh(
          stage.keep(new THREE.SphereGeometry(r, 48, 24)),
          stage.keep(new THREE.MeshBasicMaterial({ color: gold, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false })),
        ),
      );
      const edge = circle(r, 0);
      scene.add(new THREE.Line(stage.keep(new THREE.BufferGeometry().setFromPoints(edge)), stage.keep(new THREE.LineBasicMaterial({ color: gold, transparent: true, opacity: 0.8 }))));
      stage.tag(`Moves fast enough to catch: within ≈${fmt(reach.motionAu, 0)} AU`, new THREE.Vector3(0, r, 0), "sun");
    }

    // Planet X zone: a broad band, tilted about 16° like the predicted orbit.
    const [x0, x1] = reach.planetX.map(logRadius) as [number, number];
    const zone = new THREE.Mesh(
      stage.keep(new THREE.RingGeometry(x0, x1, 128, 1)),
      stage.keep(new THREE.MeshBasicMaterial({ color: coral, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false })),
    );
    zone.rotation.x = -Math.PI / 2 + THREE.MathUtils.degToRad(16);
    scene.add(zone);
    zone.updateMatrixWorld();
    const zoneTag = new THREE.Vector3(0, (x0 + x1) / 2, 0).applyMatrix4(zone.matrixWorld);
    const zt = stage.tag(`Predicted Planet X: ${reach.planetX[0]}–${reach.planetX[1]} AU`, zoneTag, "plain");
    zt.el.style.color = "#ff8a70";

    // Brightness limits: one ring per body size, resized when the depth changes.
    const rings = reach.bodies.map((b, i) => {
      const line = new THREE.Line(
        stage.keep(new THREE.BufferGeometry().setFromPoints(circle(1))),
        stage.keep(new THREE.LineBasicMaterial({ color: mint, transparent: true, opacity: 0.45 + 0.1 * i })),
      );
      scene.add(line);
      const angle = -0.5 - i * 0.42;
      const tag = stage.tag("", new THREE.Vector3(), "accent");
      return { b, line, tag, angle };
    });
    const apply = (m: ReachMode) => {
      for (const { b, line, tag, angle } of rings) {
        const au = m === "ours" ? b.ours : b.full;
        const r = logRadius(au);
        line.scale.setScalar(r);
        tag.pos.set(Math.cos(angle) * r, 0, Math.sin(angle) * r);
        tag.el.textContent = `${b.label}: ${fmt(au, au < 10 ? 1 : 0)} AU`;
      }
      stage.invalidate();
    };
    update.current = apply;
    apply(mode);
    return () => {
      update.current = null;
    };
  };

  useEffect(() => {
    update.current?.(mode);
  }, [mode]);

  return (
    <Stage3D options={{ reach: R, camera: [0, 0.95, 1.45], minDistance: 2, maxDistance: R * 3 }} build={build} deps={[reach]} onFail={onFail} tall>
      <p className={styles.readout} aria-live="polite">
        {mode === "ours" ? `Our search, AB ${fmt(reach.oursAb, 1)}` : `Full SPHEREx survey, AB ${fmt(reach.fullAb, 1)}`}: green rings show how far
        each body stays bright enough to detect. Inside the gold sphere it also moves fast enough for our one-to-two-day linking.
      </p>
    </Stage3D>
  );
}
