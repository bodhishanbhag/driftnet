"use client";

import { useEffect, useState } from "react";
import styles from "./report.module.css";

/** Fired on window to open or close every collapsible panel at once. */
export const PANELS_EVENT = "panels:set";

/**
 * One section of a report. Collapsible by default: the title row is a button, and the body is
 * only built the first time it opens, so a long report starts as a short list of headings.
 * A panel also opens when the URL hash points at it (the section links do this).
 */
export function Panel({
  id,
  title,
  kicker,
  intro,
  defaultOpen = false,
  collapsible = true,
  children,
}: {
  id: string;
  title: string;
  kicker?: string;
  intro?: React.ReactNode;
  defaultOpen?: boolean;
  collapsible?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen || !collapsible);
  const [built, setBuilt] = useState(open);

  useEffect(() => {
    if (!collapsible) return;
    const show = (v: boolean) => {
      setOpen(v);
      if (v) setBuilt(true);
    };
    const fromHash = () => {
      if (window.location.hash === `#${id}`) show(true);
    };
    const fromEvent = (e: Event) => show(Boolean((e as CustomEvent<boolean>).detail));
    const t = setTimeout(fromHash, 0);
    window.addEventListener("hashchange", fromHash);
    window.addEventListener(PANELS_EVENT, fromEvent);
    return () => {
      clearTimeout(t);
      window.removeEventListener("hashchange", fromHash);
      window.removeEventListener(PANELS_EVENT, fromEvent);
    };
  }, [id, collapsible]);

  const toggle = () => {
    setOpen((v) => !v);
    setBuilt(true);
  };

  return (
    <section id={id} className={`card ${styles.panel}`} aria-labelledby={`${id}-title`} data-open={open ? "true" : "false"}>
      <div className={`${styles.panelHead} ${collapsible && !open ? styles.panelHeadClosed : ""}`}>
        <h2 id={`${id}-title`}>
          {collapsible ? (
            <button type="button" className={styles.panelToggle} aria-expanded={open} aria-controls={`${id}-body`} onClick={toggle}>
              <span>{title}</span>
              <span className={styles.panelChevron} aria-hidden="true" />
            </button>
          ) : (
            title
          )}
        </h2>
        {kicker && <span className={styles.kicker}>{kicker}</span>}
      </div>
      <div id={`${id}-body`} hidden={!open}>
        {built && (
          <>
            {intro && <p className={styles.intro}>{intro}</p>}
            {children}
          </>
        )}
      </div>
    </section>
  );
}
