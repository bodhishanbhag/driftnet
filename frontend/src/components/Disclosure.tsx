import styles from "./Disclosure.module.css";

/**
 * A plain dropdown: a one-line question or title that opens to the detail. Built on
 * <details>, so it works without JavaScript and in server components.
 */
export function Disclosure({
  summary,
  hint,
  open,
  id,
  children,
}: {
  summary: React.ReactNode;
  /** A few muted words after the title, e.g. "8 steps". */
  hint?: React.ReactNode;
  open?: boolean;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <details className={styles.disclosure} open={open || undefined} id={id}>
      <summary className={styles.summary}>
        <span className={styles.title}>{summary}</span>
        {hint && <span className={styles.hint}>{hint}</span>}
        <span className={styles.chevron} aria-hidden="true" />
      </summary>
      <div className={styles.body}>{children}</div>
    </details>
  );
}

/** A stack of dropdowns that reads as one list. */
export function DisclosureGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`${styles.group} ${className ?? ""}`}>{children}</div>;
}
