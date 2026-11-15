import { PageGuide } from "@/components/PageGuide";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/meta";
import Link from "next/link";
import { ClassificationBadge } from "@/components/ClassificationBadge";
import { CatalogMethod } from "@/components/catalogs/CatalogMethod";
import { Disclosure, DisclosureGroup } from "@/components/Disclosure";
import { GLOSSARY } from "@/lib/glossary";
import { CLASSIFICATIONS, CLASSIFICATION_ORDER } from "@/lib/labels";
import { blindSpeeds, summarizeLimits } from "@/lib/limits";
import { staticInjectionStudy, staticSurvey } from "@/lib/staticData";
import styles from "./page.module.css";

export const metadata: Metadata = pageMeta(
  "About and methods",
  "How Driftnet finds moving objects in NASA SPHEREx images: the pipeline, data sources, honest limitations and the team.",
  "/about/",
);

/** Where each stage runs, in order. */
const PIPELINE: { where: string; note: string; steps: { title: string; body: string }[] }[] = [
  {
    where: "GitHub Actions",
    note: "Python, runs several times a day",
    steps: [
      { title: "Fetch", body: "Download every SPHEREx image of a small patch of sky (0.3° across) from NASA's archive." },
      { title: "Clean and align", body: "Remove the background glow, hide faulty pixels, and line all the images up." },
      { title: "Detect", body: "Find every dot that stands out clearly from the noise, in every image." },
      { title: "Remove the fixed sky", body: "Set aside dots that never move: stars and galaxies." },
      { title: "Link and fit", body: "Join dots that move in a steady line into a track. Three or more sightings make a track; two make an unconfirmed pair." },
      { title: "Vet and score", body: "Check each track for signs of a glitch, then give it a score for ranking." },
      { title: "Catalog check", body: "Ask two independent catalogs (NASA JPL and IMCCE SkyBoT) which known asteroids and comets were there. Close enough at every sighting counts as a match." },
      { title: "Orbit and publish", body: "Estimate a rough orbit for anything unexplained, then publish the results." },
    ],
  },
  {
    where: "Cloudflare Worker",
    note: "the data API",
    steps: [
      { title: "Serve and re-check", body: "Serve the data to this site and re-check objects regularly: unexplained ones about daily, known ones about monthly." },
    ],
  },
  {
    where: "Vercel",
    note: "the website",
    steps: [{ title: "Show the evidence", body: "This website: blinks, reports, leads, limits and the sky map." }],
  },
];

const SOURCES: { name: string; use: string; href: string; cite?: string }[] = [
  {
    name: "SPHEREx Level 2 images (NASA / JPL-Caltech / IPAC)",
    use: "Every image and measurement on this site.",
    href: "https://irsa.ipac.caltech.edu/Missions/spherex.html",
    cite: "Mission: Doré et al. 2014, “Cosmology with the SPHEREx All-Sky Spectral Survey”, arXiv:1412.4872; Bock et al. 2025, “The SPHEREx Satellite Mission”, arXiv:2511.02985.",
  },
  {
    name: "NASA/IPAC Infrared Science Archive (IRSA)",
    use: "Finding the exposures that cover each patch, and the files themselves.",
    href: "https://irsa.ipac.caltech.edu/",
  },
  {
    name: "JPL Small-Body Identification (SBIdent) API",
    use: "Which known asteroids and comets were near each detection, from SPHEREx's position.",
    href: "https://ssd-api.jpl.nasa.gov/doc/sb_ident.html",
  },
  {
    name: "JPL Horizons",
    use: "Precise predicted positions for the closest known objects; ephemeris links for identified objects.",
    href: "https://ssd.jpl.nasa.gov/horizons/",
    cite: "Giorgini et al. 1996, “JPL's On-Line Solar System Data Service”, BAAS 28, 1158.",
  },
  {
    name: "IMCCE SkyBoT (Sky Body Tracker)",
    use: "An independent second answer to the same question: which known solar system objects were in each patch at each time.",
    href: "https://ssp.imcce.fr/webservices/skybot/",
    cite: "Berthier et al. 2006, “SkyBoT, a new VO service to identify Solar System objects”, ASP Conf. Ser. 351, 367.",
  },
  {
    name: "Bus-DeMeo asteroid taxonomy (class mean spectra)",
    use: "The asteroid types each object's SPHEREx colors are compared with in “What is it made of?”.",
    href: "https://doi.org/10.1016/j.icarus.2009.02.005",
    cite: "DeMeo, Binzel, Slivan & Bus 2009, “An extension of the Bus asteroid taxonomy into the near-infrared”, Icarus 202, 160.",
  },
  {
    name: "ASTM E490-00a solar spectrum",
    use: "Dividing an object's fluxes by the Sun's spectrum to get its reflectance.",
    href: "https://doi.org/10.1520/E0490",
    cite: "ASTM International, Standard Solar Constant and Zero Air Mass Solar Spectral Irradiance Tables (2014).",
  },
  {
    name: "SPHEREx point-source sensitivity (limiting magnitude)",
    use: "The single-visit and full-survey 5σ depths quoted on the home, about and limits pages.",
    href: "https://arxiv.org/abs/2505.24856",
    cite: "Crill et al. 2025, “The SPHEREx Sky Simulator”, arXiv:2505.24856; Doré et al. 2018, arXiv:1805.05489.",
  },
  {
    name: "Predicted brightness of Planet Nine",
    use: "The Planet X brightness we compare our limiting magnitude with.",
    href: "https://arxiv.org/abs/2108.09868",
    cite: "Brown & Batygin 2021, “The orbit of Planet Nine”, AJ, arXiv:2108.09868.",
  },
  {
    name: "NASA/IPAC IRSA image search (SIA) and cutouts",
    use: "Look anywhere: every SPHEREx Level 2 image of any sky position, fetched live and trimmed to a small cutout.",
    href: "https://irsa.ipac.caltech.edu/docs/program_interface/sia.html",
    cite: "NASA/IPAC Infrared Science Archive, SPHEREx Data Release 1.",
  },
  {
    name: "CDS Sesame name resolver (SIMBAD, NED, VizieR)",
    use: "Look anywhere: turns a star's name into its position and proper motion.",
    href: "https://cds.unistra.fr/cgi-bin/Sesame",
    cite: "This research has made use of the SIMBAD database and the Sesame service, operated at CDS, Strasbourg, France.",
  },
  {
    name: "JPL Small-Body Database (SBDB)",
    use: "Orbit pages for every identified object (we link to JPL rather than recompute its orbits), and published asteroid types (spec_B, spec_T) to check our composition answers.",
    href: "https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html",
  },
];

const rate = (r: number) => `${r}″/hr`;

function Limitations() {
  const study = staticInjectionStudy();
  const survey = staticSurvey();
  const area = survey ? (survey.totals.area_deg2_searched ?? survey.totals.area_deg2_processed) : null;
  const sum = study ? summarizeLimits(study) : null;
  const blind = study ? blindSpeeds(study) : null;
  const fp = study?.false_positives;
  return (
    <ul className={styles.limits}>
      {sum?.deepest && (
        <li>
          <strong>Depth: about AB {sum.deepest.m50_ab.toFixed(1)}.</strong> Half of the simulated objects we planted were found down to
          AB magnitude {sum.shallowest ? `${sum.shallowest.m50_ab.toFixed(1)}–` : ""}
          {sum.deepest.m50_ab.toFixed(1)} at {sum.reachedRates.map(rate).join(", ")}. Anything fainter is mostly missed.
        </li>
      )}
      {blind && blind.slowNeverHalf.length > 0 && (
        <li>
          <strong>Planet X–like motion can&apos;t be detected yet.</strong> At {blind.slowNeverHalf.map(rate).join(" and ")}, the speeds
          of a distant planet, the pipeline never found half of the planted objects at any brightness: over a day or two they move less than
          one 6.2″ pixel, so they look like fixed stars. Finding them needs visits weeks or months apart.
        </li>
      )}
      {blind && blind.fastNeverHalf.length > 0 && (
        <li>
          <strong>Very fast movers are missed too:</strong> at {blind.fastNeverHalf.map(rate).join(", ")} the pipeline also never found
          half of them.
        </li>
      )}
      {fp && (
        <li>
          <strong>False alarms are rare but not zero:</strong> {fp.n_candidates} in {fp.area_deg2} deg² of control fields with nothing
          planted.
        </li>
      )}
      {area != null && (
        <li>
          <strong>Coverage is small so far:</strong> {area.toFixed(0)} deg², {((100 * area) / 41252.96).toFixed(2)}% of the sky, mostly
          near the ecliptic. Unsearched sky tells us nothing either way.
        </li>
      )}
      <li>
        <strong>Unexplained is not new.</strong> The catalog check looks within 15″ of predicted positions; an object with a poorly known
        orbit, or a very recent discovery, can be missed. Our orbits usually come from about a day of data, so their predictions are very uncertain.
      </li>
      <li>
        <strong>&ldquo;What is it made of?&rdquo; is indicative only.</strong> A SPHEREx track usually covers a narrow range of wavelengths over
        about a day, while the asteroid rotates, so most composition answers are low confidence. Points above about 3 µm are often the
        object&apos;s own heat rather than reflected sunlight, and are left out for near-Sun objects.{" "}
        <Link href="/limits/#composition">How often it is right</Link>
      </li>
      <li>
        <strong>The scores are rankings, not probabilities.</strong> No object here has been confirmed by another telescope.
      </li>
    </ul>
  );
}

export default function AboutPage() {
  return (
    <div className={`container ${styles.page}`}>
      <PageGuide>How the search works, where the data comes from, its limits, and who built it.</PageGuide>
      <h1>How it works</h1>
      <p className={styles.lede}>
        SPHEREx is a NASA space telescope that photographs the whole sky in infrared, again and again. Anything that moves between
        photos, like an asteroid or comet, shows up as a dot that changes place. We find those dots, check them against catalogs of known
        objects, and show the evidence. We don&apos;t claim to have found Planet X.
      </p>

      <section aria-labelledby="audience">
        <h2 id="audience">Who this is for</h2>
        <ul className={styles.audience}>
          <li>
            <strong>Curious people:</strong> watch real objects move, with plain-language write-ups in 10 languages.
          </li>
          <li>
            <strong>Teachers and students:</strong> every object is a worked example of how astronomers test a claim.
          </li>
          <li>
            <strong>Telescope owners:</strong> unexplained leads come with sky positions and standard follow-up files.
          </li>
          <li>
            <strong>Scientists:</strong> measured detection limits, plus open code and data.
          </li>
        </ul>
      </section>

      <section aria-labelledby="details">
        <h2 id="details">The details</h2>
        <p className="muted">Tap any topic to open it.</p>
        <DisclosureGroup>
          <Disclosure id="pipeline" summary="The search, step by step" hint={`${PIPELINE.reduce((n, s) => n + s.steps.length, 0)} steps`}>
            <div className={styles.flow}>
              {PIPELINE.map((stage, si) => (
                <div key={stage.where} className={styles.stage}>
                  <p className={styles.where}>
                    <span className="mono">{stage.where}</span> · {stage.note}
                  </p>
                  <ol className={styles.steps} start={PIPELINE.slice(0, si).reduce((n, s) => n + s.steps.length, 1)}>
                    {stage.steps.map((m, i) => (
                      <li key={m.title}>
                        <h3>
                          <span className={`mono ${styles.stepNo}`} aria-hidden="true">
                            {String(PIPELINE.slice(0, si).reduce((n, s) => n + s.steps.length, 1) + i).padStart(2, "0")}
                          </span>
                          {m.title}
                        </h3>
                        <p>{m.body}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </Disclosure>

          <Disclosure id="catalogs" summary="How we tell if an object is already known">
            <CatalogMethod />
          </Disclosure>

          <Disclosure id="labels" summary="What the labels mean" hint={`${CLASSIFICATION_ORDER.length} labels`}>
            <dl className={styles.labels}>
              {CLASSIFICATION_ORDER.map((c) => (
                <div key={c}>
                  <dt>
                    <ClassificationBadge value={c} />
                  </dt>
                  <dd>{CLASSIFICATIONS[c].plain}</dd>
                </div>
              ))}
            </dl>
          </Disclosure>

          <Disclosure id="limitations" summary="What we can't do (yet)">
            <p>
              We test ourselves by hiding fake moving objects in real images and counting how many we find. Fake objects are always
              labeled SIMULATED.
            </p>
            <Limitations />
            <p>
              <Link href="/limits/">Full detection limits, and whether SPHEREx could find Planet X</Link>
            </p>
          </Disclosure>

          <Disclosure id="wavelength" summary="Why an object's brightness changes between photos">
            <p>
              Each SPHEREx detector sees a slightly different infrared color at each edge. On different visits, the same object lands on
              a different spot, so it&apos;s photographed in a different color and can look brighter or fainter. That&apos;s why we judge
              motion by position, not brightness.
            </p>
          </Disclosure>

          <Disclosure id="ai-use" summary="How we use AI">
            <p>
              <strong>Finding and checking objects is ordinary code, not AI.</strong> AI only writes the plain-language summaries, answers
              questions, and powers search.
            </p>
            <ul>
              <li>
                Summaries and answers come from Meta&apos;s Llama 4 Scout (on Cloudflare Workers AI). It only sees an object&apos;s
                measurements.
              </li>
              <li>
                Before anything is shown, the site checks every number against the measurements and blocks any claim that an object is new.
                If a check fails, a fixed template is shown instead.
              </li>
              <li>Translations (m2m100), read-aloud (MeloTTS) and voice questions (Whisper) get the same number check.</li>
              <li>We used Claude (Anthropic) to help write and review code. The team chose the methods and checked the results.</li>
            </ul>
          </Disclosure>

          <Disclosure id="sources" summary="Data sources and citations" hint={`${SOURCES.length} sources`}>
            <ul className={styles.sources}>
              {SOURCES.map((src) => (
                <li key={src.name}>
                  <a href={src.href} target="_blank" rel="noopener noreferrer">
                    {src.name}
                  </a>
                  <span>{src.use}</span>
                  {src.cite && <span className={styles.cite}>{src.cite}</span>}
                </li>
              ))}
            </ul>
          </Disclosure>

          <Disclosure id="glossary" summary="Glossary" hint={`${Object.keys(GLOSSARY).length} terms`}>
            <dl className={styles.glossary}>
              {Object.entries(GLOSSARY).map(([term, text]) => (
                <div key={term}>
                  <dt>{term === "snr" ? "S/N" : term === "mjd" ? "MJD" : term === "µjy" ? "µJy" : term}</dt>
                  <dd>{text}</dd>
                </div>
              ))}
            </dl>
          </Disclosure>

          <Disclosure id="advisor" summary="Expert review">
            <p>
              We reviewed the method and the Planet X question with <strong>Dr. Tavarez-Brown</strong> (PhD, Astronomy, University of
              Washington). Her questions about how faint SPHEREx can see are why we now state our detection limits clearly. Any remaining
              errors are ours.
            </p>
          </Disclosure>
        </DisclosureGroup>
      </section>

      <section aria-labelledby="team">
        <h2 id="team">Team and code</h2>
        <ul>
          <li>Armaan: frontend, UI/UX, sky viewer, object reports</li>
          <li>Bodhi: NASA data research, image analysis, scientific validation, backend and AI</li>
        </ul>
        <p>
          Built for the NASA Space Apps Challenge 2026, &ldquo;Planet X and SPHEREx&rdquo;. Everything is open source (MIT).
        </p>
      </section>
    </div>
  );
}
