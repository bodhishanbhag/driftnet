import { PageGuide } from "@/components/PageGuide";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/meta";
import { Suspense } from "react";
import { StudySkeleton } from "@/components/Skeletons";
import { SimulatedBanner } from "@/components/SimulatedBanner";
import { LimitsView } from "./LimitsView";
import { LimitingMagnitudePanel } from "@/components/limits/LimitingMagnitude";

export const metadata: Metadata = pageMeta(
  "Detection limits",
  "How faint and how slow an object our pipeline can find in real SPHEREx images, measured by planting simulated objects.",
  "/limits/",
);

export default function LimitsPage() {
  return (
    <div className="container">
      <header className="page-header">
        <PageGuide>How faint and how slow an object our search can find, so you know what we could still be missing.</PageGuide>
        <h1>Where could Planet X still be hiding?</h1>
        <p className="lede">
          Not finding something doesn&apos;t mean it isn&apos;t there. It might be too faint or too slow for us. Here&apos;s what we can
          and can&apos;t see.
        </p>
      </header>
      <LimitingMagnitudePanel />
      <div style={{ marginTop: "var(--space-8)" }} />
      <SimulatedBanner>
        The objects on this page are simulated: planted on purpose to test our software. They are not real objects in the sky.
      </SimulatedBanner>
      <div style={{ marginTop: "var(--space-8)" }}>
        <Suspense fallback={<StudySkeleton />}>
          <LimitsView />
        </Suspense>
      </div>
    </div>
  );
}
