"use client";

import { useId, useState } from "react";
import { GLOSSARY } from "@/lib/glossary";
import styles from "./Term.module.css";

export { GLOSSARY };

/** A term with a plain-language definition on hover, focus or tap. */
export function Term({ term, children }: { term: keyof typeof GLOSSARY | string; children?: React.ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const text = GLOSSARY[term.toLowerCase()];
  if (!text) return <>{children ?? term}</>;
  return (
    <span className={styles.wrap} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className={styles.term}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      >
        {children ?? term}
      </button>
      {open && (
        <span role="tooltip" id={id} className={styles.tip}>
          {text}
        </span>
      )}
    </span>
  );
}
