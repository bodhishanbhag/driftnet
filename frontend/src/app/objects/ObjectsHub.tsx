"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FieldGrid } from "@/components/FieldGrid";
import { LeadsView } from "../leads/LeadsView";
import { CandidateBrowser } from "./browse/CandidateBrowser";
import styles from "./ObjectsHub.module.css";

export type HubView = "all" | "leads" | "known" | "patches";

/** Which tab a query string opens. "Known objects" is the list filtered to known objects only. */
export function hubView(params: URLSearchParams): HubView {
  const view = params.get("view");
  if (view === "leads" || view === "patches") return view;
  const classes = params.getAll("class");
  return classes.length === 1 && classes[0] === "known_object" ? "known" : "all";
}

const TABS: { id: HubView; label: string; href: string; purpose: string }[] = [
  {
    id: "all",
    label: "All",
    href: "/objects/",
    purpose: "Every moving object. Search, filter, and open one for its report.",
  },
  {
    id: "leads",
    label: "Unexplained leads",
    href: "/objects/?view=leads",
    purpose: "Objects no catalog can explain, strongest evidence first.",
  },
  {
    id: "known",
    label: "Known objects",
    href: "/objects/?class=known_object",
    purpose: "Objects matched to known asteroids or comets.",
  },
  {
    id: "patches",
    label: "Patches of sky",
    href: "/objects/?view=patches",
    purpose: "Open a patch of sky and blink its images to spot what moved.",
  },
];

export function ObjectsHub() {
  const params = useSearchParams();
  const view = hubView(new URLSearchParams(params.toString()));
  const tab = TABS.find((t) => t.id === view)!;
  return (
    <>
      <nav className={styles.tabs} aria-label="Object lists">
        <ul>
          {TABS.map((t) => (
            <li key={t.id}>
              <Link href={t.href} aria-current={t.id === view ? "page" : undefined} scroll={false} prefetch={false}>
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <p className={styles.purpose}>{tab.purpose}</p>
      {view === "leads" ? <LeadsView /> : view === "patches" ? <FieldGrid /> : <CandidateBrowser />}
    </>
  );
}
