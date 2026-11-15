import type { Page } from "@playwright/test";

/**
 * Report and limits panels start collapsed. Open every panel and dropdown on the page, as the
 * "Open all" button does, so a test can check what is inside them.
 */
export async function openPanels(page: Page) {
  await page.waitForLoadState("load");
  await page.locator("button[aria-controls$='-body']").first().waitFor({ state: "attached", timeout: 10_000 }).catch(() => undefined);
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("panels:set", { detail: true }));
    document.querySelectorAll("details").forEach((d) => (d.open = true));
  });
}
