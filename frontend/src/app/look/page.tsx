import type { Metadata } from "next";
import { PageGuide } from "@/components/PageGuide";
import { pageMeta } from "@/lib/meta";
import { LookView } from "./LookView";

export const metadata: Metadata = pageMeta(
  "Look anywhere",
  "Type any star or sky position and watch every SPHEREx image of it, live from NASA's archive, lined up and played in time order.",
  "/look/",
);

export default function LookPage() {
  return (
    <div className="container">
      <header className="page-header">
        <PageGuide>Any spot on the sky, every SPHEREx image of it, played in time order.</PageGuide>
        <h1>Look anywhere</h1>
        <p className="lede">
          Our survey searches the band of sky where planets travel. This page goes anywhere else: name a star or give coordinates,
          and we fetch every SPHEREx image of that spot straight from NASA&apos;s archive, line them up and blink them, so you can
          see what moved or changed. Nothing is precomputed; it all happens in your browser.
        </p>
      </header>
      <LookView />
    </div>
  );
}
