"use client";

import { useEffect, useState } from "react";
import { getObjects } from "@/lib/api";
import { isUnidentified } from "@/lib/leads";

interface Counts {
  /** Objects on the Objects page: one per body, however many patches caught it. */
  total: number;
  /** Objects no catalog has named (the Unexplained leads list). */
  unidentified: number;
}

// One request for the page, shared by every number that shows it.
let pending: Promise<Counts> | null = null;

function load(): Promise<Counts> {
  pending ??= getObjects().then(
    (list) => {
      const real = list.objects.filter((o) => o.classification !== "injected");
      return { total: real.length, unidentified: real.filter((o) => isUnidentified(o.classification)).length };
    },
    (err: unknown) => {
      pending = null;
      throw err;
    },
  );
  return pending;
}

/**
 * The live counts, as the Objects page shows them. Catalog answers arrive after the site is built,
 * so the numbers baked into the page go stale within hours; these replace them once the page is
 * idle. Until then, and if the API can't be reached, the built-in numbers stay.
 */
function useLiveCounts(): Counts | null {
  const [counts, setCounts] = useState<Counts | null>(null);
  useEffect(() => {
    let live = true;
    const run = () => {
      load().then(
        (c) => {
          if (live) setCounts(c);
        },
        () => {},
      );
    };
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(run, { timeout: 4000 });
      return () => {
        live = false;
        window.cancelIdleCallback(id);
      };
    }
    const id = window.setTimeout(run, 1500);
    return () => {
      live = false;
      window.clearTimeout(id);
    };
  }, []);
  return counts;
}

const int = (n: number) => n.toLocaleString("en-US");

/** The hero's "N not yet identified" label. */
export function LiveUnidentified({ fallback }: { fallback: number | null }) {
  const n = useLiveCounts()?.unidentified ?? fallback;
  return <>{n != null ? `${int(n)} not yet identified` : "Unexplained leads"}</>;
}

/** The number of moving objects, as counted on the Objects page. */
export function LiveObjectTotal({ fallback }: { fallback: number }) {
  return <>{int(useLiveCounts()?.total ?? fallback)}</>;
}
