import Link from "next/link";
import { FieldGrid } from "@/components/FieldGrid";
import { SpacetimeFabric } from "@/components/home/SpacetimeFabric";
import { HomeSky } from "@/components/home/HomeSky";
import { HeroBlink } from "@/components/home/HeroBlink";
import { LiveObjectTotal, LiveUnidentified } from "@/components/home/LiveCounts";
import { heroBlink } from "@/lib/heroBlink";
import { LimitingMagnitudeSummary } from "@/components/limits/LimitingMagnitude";
import { Disclosure, DisclosureGroup } from "@/components/Disclosure";
import { TourButton } from "@/components/tour/Tour";
import { SpectralStrip } from "@/components/SpectralStrip";
import { formatUtcDate } from "@/lib/format";
import { countDistinctTracks } from "@/lib/sameTrack";
import { staticGrowth, staticObjects, staticSurvey } from "@/lib/staticData";
import styles from "./page.module.css";

/** The whole sky: 4π steradians, in square degrees. */
const SKY_DEG2 = 41252.96;

/** How it works, in five plain steps. Titles are always visible; the detail is one tap away. */
const STEPS = [
  {
    title: "Get the images",
    body: "We download SPHEREx images of each patch of sky from NASA's public archive, with the time and wavelength of each one.",
  },
  {
    title: "Find every dot",
    body: "We measure every point of light in every image, and ignore pixels the telescope marks as faulty.",
  },
  {
    title: "Throw out what stays still",
    body: "Stars and galaxies sit in the same place every time. We set those aside. What's left might be moving.",
  },
  {
    title: "Connect the dots",
    body: "Dots that move in a steady line across several images become a track. We measure its speed and direction.",
  },
  {
    title: "Check if it's already known",
    body: "We ask two independent catalogs of known asteroids and comets (NASA JPL and France's IMCCE SkyBoT) what was there at that moment. If neither knows it, we call it unexplained, not new. Every object is re-checked regularly.",
  },
];

function fmtInt(n: number) {
  return n.toLocaleString("en-US");
}

function skyShare(area: number) {
  const p = (100 * area) / SKY_DEG2;
  return p < 0.01 ? "<0.01%" : `${p < 1 ? p.toFixed(2) : p.toFixed(1)}%`;
}

export default function LandingPage() {
  const blink = heroBlink();
  // Real numbers from the data the site was built with.
  const survey = staticSurvey();
  const t = survey?.totals;
  // Objects JPL couldn't identify, as last recorded from the live site by the pipeline.
  const unidentified = staticGrowth().findLast((d) => d.unidentified != null)?.unidentified ?? null;
  // One object per body: the same sightings published by two overlapping patches count once. The
  // live count (which also folds an asteroid seen in different weeks into one) replaces it on load.
  const objects = staticObjects()?.objects ?? null;
  type Stat = { value: React.ReactNode; label: string };
  const stats = ([
    t && { value: fmtInt(t.n_epochs), label: "SPHEREx images analyzed" },
    t && { value: fmtInt(t.n_searched ?? t.n_processed), label: "patches of sky searched" },
    t && { value: `${(t.area_deg2_searched ?? t.area_deg2_processed).toFixed(1)} deg²`, label: `of sky covered (${skyShare(t.area_deg2_searched ?? t.area_deg2_processed)})` },
    objects && { value: <LiveObjectTotal fallback={countDistinctTracks(objects)} />, label: "moving objects tracked" },
  ] as (Stat | null | undefined)[]).filter((s): s is Stat => !!s);

  return (
    <>
      <SpacetimeFabric />
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroShade} aria-hidden="true" />
        <div className={`container ${styles.heroInner}`}>
          <p className="eyebrow">NASA SPHEREx · moving-object search · Planet X</p>
          <h1 id="hero-title" className={styles.title}>
            Everything that moves
            <br />
            <span className={styles.glow}>in the infrared sky.</span>
          </h1>
          <p className={styles.lede}>
            We search real images from NASA&apos;s SPHEREx telescope for things that move: asteroids, comets and distant worlds. Each one is
            checked against catalogs of known objects, with the evidence shown.
          </p>
          <div className={styles.actions}>
            <Link href="/objects/" className="button button-primary">
              Browse the objects
            </Link>
            <Link href="/objects/?view=leads" className="button">
              <LiveUnidentified fallback={unidentified} />
            </Link>
            <TourButton />
            <Link href="#how" className={styles.textLink}>
              How it works ↓
            </Link>
          </div>
          {stats.length > 0 && (
            <dl className={styles.stats}>
              {stats.map((s) => (
                <div key={s.label}>
                  <dt>{s.label}</dt>
                  <dd className="mono">{s.value}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className={styles.planetX}>
            <Disclosure summary="Can this find Planet X?" hint="Not yet: tap for why">
              <LimitingMagnitudeSummary heading={false} />
            </Disclosure>
          </div>
          {survey && <p className={styles.asOf}>Survey data as of {formatUtcDate(survey.generated_utc)}.</p>}
        </div>
      </section>

      {blink && (
        <div className="container">
          <section className={`section ${styles.seeIt}`} aria-labelledby="see-it-heading">
            <div className={styles.seeItText}>
              <p className="eyebrow">See it move</p>
              <h2 id="see-it-heading">Two real SPHEREx images, hours apart</h2>
              <p>
                The stars stay put. The circled dot moves. That&apos;s how every object on this site was found: by comparing pictures of the
                same patch of sky taken at different times.
              </p>
              <p>
                Want to try your own? <Link href="/look/">Look anywhere</Link> in the sky.
              </p>
            </div>
            <div className={styles.seeItPlate}>
              <HeroBlink {...blink} lazy />
            </div>
          </section>
        </div>
      )}

      <div className="container">
        <section id="how" className={`section ${styles.how}`} aria-labelledby="how-heading">
          <div className={styles.howGrid}>
            <div className={styles.howIntro}>
              <p className="eyebrow">How it works</p>
              <h2 id="how-heading">From raw images to an evidence report</h2>
              <p className={styles.sectionLede}>
                Our code runs several times a day, searching new patches of sky automatically. Tap a step to learn more, or read the{" "}
                <Link href="/about/">full method</Link>.
              </p>
              <div className={`card ${styles.instrument}`}>
                <p className={`mono ${styles.instrumentLabel}`}>What SPHEREx sees</p>
                <SpectralStrip />
                <p className={styles.instrumentNote}>Infrared light from 0.75 to 5 µm, invisible to our eyes, in 102 colors.</p>
              </div>
            </div>
            <DisclosureGroup className={styles.steps}>
              {STEPS.map((s, i) => (
                <Disclosure
                  key={s.title}
                  summary={
                    <>
                      <span className={`mono ${styles.stageNo}`} aria-hidden="true">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {s.title}
                    </>
                  }
                >
                  <p>{s.body}</p>
                </Disclosure>
              ))}
            </DisclosureGroup>
          </div>
        </section>

        <HomeSky searched={t ? (t.n_searched ?? t.n_processed) : null} withObjects={t ? t.n_processed : null} />

        <section className="section" aria-labelledby="modes-heading">
          <div className={styles.sectionHead}>
            <div>
              <p className="eyebrow">Ways in</p>
              <h2 id="modes-heading">See it for yourself</h2>
            </div>
          </div>
          <div className={styles.modes}>
            <Link href="/objects/?view=leads" className={`card ${styles.mode}`}>
              <span className="eyebrow">Unexplained leads</span>
              <h3>Not matched to anything known</h3>
              <p>Ranked by evidence, with where to point a telescope.</p>
              <span className={styles.modeCta}>See the leads</span>
            </Link>
            <Link href="/look/" className={`card ${styles.mode}`}>
              <span className="eyebrow">Look anywhere</span>
              <h3>Pick any star</h3>
              <p>Name a star or a spot on the sky and watch every SPHEREx image of it, live from NASA&apos;s archive.</p>
              <span className={styles.modeCta}>Try Barnard&apos;s Star</span>
            </Link>
            <Link href="/objects/?view=patches" className={`card ${styles.mode}`}>
              <span className="eyebrow">Patches of sky</span>
              <h3>Blink the sky</h3>
              <p>Flip between images taken hours apart. Stars hold still; movers jump.</p>
              <span className={styles.modeCta}>Start exploring</span>
            </Link>
            <Link href="/objects/" className={`card ${styles.mode}`}>
              <span className="eyebrow">Objects</span>
              <h3>Weigh the evidence</h3>
              <p>Every moving object, each with a full report.</p>
              <span className={styles.modeCta}>Browse objects</span>
            </Link>
            <Link href="/sky/" className={`card ${styles.mode}`}>
              <span className="eyebrow">Sky map</span>
              <h3>Where we&apos;ve searched</h3>
              <p>Every patch we&apos;ve covered, on one map of the sky.</p>
              <span className={styles.modeCta}>Open the map</span>
            </Link>
            <Link href="/limits/" className={`card ${styles.mode}`}>
              <span className="eyebrow">Detection limits</span>
              <h3>What we could miss</h3>
              <p>How faint and how slow an object we can still catch.</p>
              <span className={styles.modeCta}>See the limits</span>
            </Link>
          </div>
        </section>

        <section className="section" aria-labelledby="featured-heading">
          <div className={styles.sectionHead}>
            <div>
              <p className="eyebrow">Start here</p>
              <h2 id="featured-heading">Patches of sky to explore</h2>
            </div>
            <Link href="/objects/?view=patches" className={styles.more}>
              See all
            </Link>
          </div>
          <FieldGrid limit={3} />
        </section>

        <section className={`section ${styles.integrity}`} aria-labelledby="integrity-heading">
          <p className="eyebrow">Scientific integrity</p>
          <h2 id="integrity-heading">We&apos;re looking, not claiming.</h2>
          <p>
            Planet X is why we built this, but we haven&apos;t found it. An object no catalog knows could be a glitch, a measuring error, or
            something real that nobody has listed yet. We show the evidence either way.
          </p>
        </section>
      </div>
    </>
  );
}
