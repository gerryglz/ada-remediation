import { createRequire } from "node:module";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AxeResults, Result as AxeViolation } from "axe-core";
import { afterEach, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { startUiServer } from "../../src/ui/server.js";

const require = createRequire(import.meta.url);
const axePath = require.resolve("axe-core/axe.min.js");

const fixtureHtml = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Dashboard self-audit fixture</title><style>.prefix,.suffix,.gallery,.separator{width:180px;height:28px;margin:8px;border:1px solid #999}</style></head>
<body><main><h1>Fixture</h1><div class="prefix" aria-label="Prefix"></div><div class="suffix" aria-label="Suffix"></div><div class="gallery" aria-label="Gallery"></div><div class="separator" aria-label="Separator"></div></main></body>
</html>`;

async function closeServer(server: Server | undefined): Promise<void> {
  if (!server?.listening) return;
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

async function startFixtureServer(): Promise<{ server: Server; url: string }> {
  const server = createServer(async (request, response) => {
    if (request.url === "/slow") await new Promise((resolve) => setTimeout(resolve, 1_200));
    if (request.url === "/failure") {
      response.writeHead(503, { "Content-Type": "text/html; charset=utf-8" });
      response.end("<!doctype html><title>Unavailable</title><h1>Unavailable</h1>");
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(fixtureHtml);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture server did not bind to a TCP port.");
  return { server, url: `http://127.0.0.1:${address.port}` };
}

function formatViolations(violations: AxeViolation[]): string {
  return violations.map((violation) => {
    const targets = violation.nodes.flatMap((node) => node.target.map((target) => String(target))).join(", ");
    return `${violation.impact ?? "unknown"}: ${violation.id} — ${violation.help} (${targets})`;
  }).join("\n");
}

async function assertDashboardAccessibility(page: Page, state: string): Promise<void> {
  await page.addScriptTag({ path: axePath });
  const results = await page.evaluate(async () => {
    const runner = (window as typeof window & { axe: { run(context: Document, options: unknown): Promise<AxeResults> } }).axe;
    return runner.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
      resultTypes: ["violations"],
    });
  });
  expect(results.violations, `${state} has WCAG A/AA axe-core violations:\n${formatViolations(results.violations)}`).toEqual([]);
}

async function expectNoHorizontalOverflow(page: Page, state: string): Promise<void> {
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(dimensions.scrollWidth, `${state} has horizontal page overflow`).toBeLessThanOrEqual(dimensions.width + 1);
}

describe("dashboard self-accessibility gate", () => {
  let fixtureServer: Server | undefined;
  let uiServer: Server | undefined;
  let browser: Browser | undefined;
  let historyDirectory: string | undefined;

  afterEach(async () => {
    await browser?.close();
    await closeServer(uiServer);
    await closeServer(fixtureServer);
    if (historyDirectory) await rm(historyDirectory, { recursive: true, force: true });
  });

  async function startSession(): Promise<{ page: Page; dashboardUrl: string; fixtureUrl: string }> {
    const fixture = await startFixtureServer();
    fixtureServer = fixture.server;
    historyDirectory = await mkdtemp(join(tmpdir(), "ada-dashboard-self-audit-"));
    const dashboard = await startUiServer({ host: "127.0.0.1", port: 0, historyDirectory });
    uiServer = dashboard.server;
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(dashboard.url);
    return { page, dashboardUrl: dashboard.url, fixtureUrl: fixture.url };
  }

  it("passes axe-core and keyboard checks across primary application states", async () => {
    const { page, dashboardUrl, fixtureUrl } = await startSession();
    await assertDashboardAccessibility(page, "empty scan form");

    const historyButton = page.getByRole("button", { name: "Scan history" });
    await historyButton.focus();
    await assertDashboardAccessibility(page, "focused header action");
    await page.keyboard.press("Enter");
    await page.locator("#history-dialog[open]").waitFor();
    await assertDashboardAccessibility(page, "empty scan history dialog");
    await page.keyboard.press("Escape");
    await expect(historyButton.evaluate((element) => element === document.activeElement)).resolves.toBe(true);
    await page.keyboard.press("Tab");
    await expect(page.locator("#url").evaluate((element) => element === document.activeElement)).resolves.toBe(true);
    const focusStyle = await page.locator("#url").evaluate((element) => {
      const style = getComputedStyle(element);
      return { outline: style.outlineStyle, shadow: style.boxShadow };
    });
    expect(focusStyle.outline !== "none" || focusStyle.shadow !== "none").toBe(true);

    await page.locator("#url").fill(`${fixtureUrl}/slow`);
    await page.getByRole("button", { name: "Scan page" }).click();
    await page.locator("#scan-progress:not([hidden])").waitFor();
    await assertDashboardAccessibility(page, "active scan progress");
    await page.locator("#results:not([hidden])").waitFor({ timeout: 60_000 });
    await assertDashboardAccessibility(page, "completed grouped findings dashboard");
    const reportResponse = await page.request.get(`${dashboardUrl}/api/report.html`);
    expect(reportResponse.ok()).toBe(true);
    const reportPage = await browser!.newPage({ viewport: { width: 1280, height: 900 } });
    await reportPage.setContent(await reportResponse.text(), { waitUntil: "domcontentloaded" });
    await assertDashboardAccessibility(reportPage, "downloadable HTML report");
    await reportPage.close();

    const childSummary = page.locator(".group-child-summary").first();
    await childSummary.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".group-child-card").first().getAttribute("open")).resolves.not.toBeNull();
    await assertDashboardAccessibility(page, "expanded grouped finding");

    const screenshotButton = page.locator(".group-child-card").first().locator(".shot-button");
    await screenshotButton.click();
    await page.locator("#image-dialog[open]").waitFor();
    await assertDashboardAccessibility(page, "visual evidence dialog");
    await page.keyboard.press("Escape");
    await expect(screenshotButton.evaluate((element) => element === document.activeElement)).resolves.toBe(true);

    const filterToggle = page.locator("#filter-toggle");
    await expect(filterToggle.textContent()).resolves.toBe("Show filters");
    await expect(page.locator("#filter-groups").isHidden()).resolves.toBe(true);
    await filterToggle.focus();
    await page.keyboard.press("Enter");
    await expect(filterToggle.getAttribute("aria-expanded")).resolves.toBe("true");
    await expect(page.locator("#filter-groups").isVisible()).resolves.toBe(true);
    const criticalFilter = page.locator("#filters .filter").filter({ hasText: "Critical" });
    await criticalFilter.focus();
    await page.keyboard.press("Enter");
    await expect(criticalFilter.getAttribute("aria-pressed")).resolves.toBe("true");

    const manualTab = page.getByRole("button", { name: "Manual review" });
    await manualTab.focus();
    await page.keyboard.press("Enter");
    await expect(manualTab.getAttribute("aria-pressed")).resolves.toBe("true");
    await assertDashboardAccessibility(page, "manual review");

    await historyButton.click();
    await page.locator("#history-list .history-row").first().waitFor();
    await assertDashboardAccessibility(page, "populated scan history dialog");
  });

  it("keeps incomplete results usable at responsive and reflow-equivalent widths", async () => {
    const { page, fixtureUrl } = await startSession();
    await page.setViewportSize({ width: 640, height: 900 });
    await expectNoHorizontalOverflow(page, "640px viewport representing 200% zoom");
    await assertDashboardAccessibility(page, "responsive scan form");

    await page.locator("#url").fill(`${fixtureUrl}/failure`);
    await page.locator("#screenshots").uncheck();
    await page.getByRole("button", { name: "Scan page" }).click();
    await page.locator("#incomplete:not([hidden])").waitFor({ timeout: 60_000 });
    await page.waitForTimeout(500);
    const responsiveGeometry = await page.evaluate(() => ({
      headerBottom: document.querySelector(".app-header")!.getBoundingClientRect().bottom,
      summaryToggleTop: document.querySelector("#result-summary-toggle")!.getBoundingClientRect().top,
    }));
    expect(responsiveGeometry.summaryToggleTop, "result actions must not be obscured by the sticky header").toBeGreaterThanOrEqual(responsiveGeometry.headerBottom);
    await assertDashboardAccessibility(page, "incomplete scan result");

    await page.setViewportSize({ width: 320, height: 900 });
    await expectNoHorizontalOverflow(page, "320px reflow viewport");
    await assertDashboardAccessibility(page, "320px incomplete result");
  });
});
