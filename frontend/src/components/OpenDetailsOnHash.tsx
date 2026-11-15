"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** When a link points at a closed dropdown (e.g. /about/#catalogs), open it and scroll to it. */
export function OpenDetailsOnHash() {
  const pathname = usePathname();
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const el = document.getElementById(id);
      if (el instanceof HTMLDetailsElement && !el.open) {
        el.open = true;
        el.scrollIntoView({ block: "start" });
      }
    };
    const t = setTimeout(open, 0);
    window.addEventListener("hashchange", open);
    return () => {
      clearTimeout(t);
      window.removeEventListener("hashchange", open);
    };
  }, [pathname]);
  return null;
}
