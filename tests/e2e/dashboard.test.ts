import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { startUiServer } from "../../src/ui/server.js";

const fixturePath = new URL("../fixtures/grouped-aria/index.html", import.meta.url);
const unsafeDialogFixturePath = new URL("../fixtures/unsafe-dialog/index.html", import.meta.url);

async function closeServer(server: Server | undefined): Promise<void> {
  if (!server?.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function startFixtureServer(requireAuthentication = false, sourcePath = fixturePath): Promise<{ server: Server; url: string }> {
  const html = await readFile(sourcePath, "utf8");
  const server = createServer((request, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    const authenticated = request.headers.cookie?.split(";").some((cookie) => cookie.trim() === "ada-auth=session-token-93a761") ?? false;
    response.end(requireAuthentication && !authenticated ? "<!doctype html><html lang=\"en\"><title>Sign in</title><main><h1>Sign in</h1></main></html>" : html);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture server did not bind to a TCP port.");
  return { server, url: `http://127.0.0.1:${address.port}/` };
}

describe("dashboard reviewer workflow", () => {
  let fixtureServer: Server | undefined;
  let uiServer: Server | undefined;
  let browser: Browser | undefined;
  let historyDirectory: string | undefined;
  let sessionDirectory: string | undefined;

  afterEach(async () => {
    await browser?.close();
    await closeServer(uiServer);
    await closeServer(fixtureServer);
    if (historyDirectory) await rm(historyDirectory, { recursive: true, force: true });
    if (sessionDirectory) await rm(sessionDirectory, { recursive: true, force: true });
  });

  it("scans a rendered page and exposes reviewable findings and downloads", async () => {
    const fixture = await startFixtureServer();
    fixtureServer = fixture.server;
    historyDirectory = await mkdtemp(join(tmpdir(), "ada-dashboard-history-"));
    const dashboard = await startUiServer({ host: "127.0.0.1", port: 0, historyDirectory });
    uiServer = dashboard.server;
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await page.goto(dashboard.url);
    await expect(page.title()).resolves.toBe("ADA Assistant dashboard");
    await page.locator("#url").fill(fixture.url);
    await page.locator("#wcag-level").selectOption("AA");
    await page.locator("#screenshots").uncheck();
    await page.getByRole("button", { name: "Scan page" }).click();

    await page.locator("#results:not([hidden])").waitFor({ timeout: 60_000 });
    await expect(page.locator("#result-source").getAttribute("href")).resolves.toBe(fixture.url);
    await expect(page.locator("#queue-count").textContent()).resolves.toMatch(/component|pattern|individual/i);
    await expect(page.locator("#finding-detail").textContent()).resolves.toContain("Rendered HTML context");
    await expect(page.locator("#finding-detail").textContent()).resolves.toContain("Recommended correction");
    await expect(page.locator("#finding-detail code, #finding-detail pre").first().textContent()).resolves.toBeTruthy();

    const jsonResponse = await page.request.get(`${dashboard.url}/api/report.json`);
    expect(jsonResponse.ok()).toBe(true);
    const report = await jsonResponse.json();
    expect(report.metadata.pagesOrFilesScanned).toBe(1);
    expect(report.metadata.profile).toEqual({
      target: fixture.url,
      wcagLevel: "AA",
      crawl: false,
      maxPages: 1,
      captureScreenshots: false,
      interactionStates: false,
      authentication: "public",
    });
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.findings[0].renderedHtmlContext.html).toContain("\n");
    await expect(page.locator(".new-metric strong").textContent()).resolves.toBe(String(report.findings.length));

    const selectedReviewFingerprints = report.findingGroups?.find((group: { findingFingerprints: string[] }) => group.findingFingerprints.length > 1)?.findingFingerprints
      ?? [report.findings[0].fingerprint];
    await page.locator("#finding-detail .finding-review-panel").first().getByRole("button", { name: "Action required", exact: true }).click();
    await page.locator("#save-state").getByText("Saved locally").waitFor();
    await page.locator("#finding-detail .finding-review-panel textarea").first().fill("Update the shared component and retest every affected page.");
    await page.getByRole("button", { name: "Save review" }).click();
    await page.locator("#save-state").getByText("Saved locally").waitFor();
    const findingReviewJsonHref = await page.locator("#json-download").getAttribute("href");
    const findingReviewJson = await (await page.request.get(`${dashboard.url}${findingReviewJsonHref}`)).json();
    for (const fingerprint of selectedReviewFingerprints) {
      expect(findingReviewJson.review.findings[fingerprint]).toEqual({
        disposition: "action-required",
        notes: "Update the shared component and retest every affected page.",
      });
    }
    await page.locator("#finding-review-filters").getByRole("button", { name: "Action required", exact: true }).click();
    await expect(page.locator("#queue-count").textContent()).resolves.toContain(`${selectedReviewFingerprints.length} finding`);
    await page.locator("#finding-review-filters").getByRole("button", { name: "All", exact: true }).click();

    await page.getByRole("button", { name: "Manual review" }).click();
    await expect(page.locator("#queue-heading").textContent()).resolves.toBe("Manual review");
    await expect(page.locator("#finding-list .manual-nav").count()).resolves.toBeGreaterThan(0);
    await page.locator("#finding-detail").getByRole("button", { name: "Pass", exact: true }).click();
    await page.locator("#save-state").getByText("Saved locally").waitFor();
    await page.locator("#finding-detail textarea").fill("Keyboard access and focus order verified with NVDA.");
    await page.locator("#run-notes").fill("Keyboard review assigned to the accessibility team.");
    await page.getByRole("button", { name: "Save review" }).click();
    await page.locator("#save-state").getByText("Saved locally").waitFor();
    const reviewedJsonHref = await page.locator("#json-download").getAttribute("href");
    const reviewedJson = await (await page.request.get(`${dashboard.url}${reviewedJsonHref}`)).json();
    expect(reviewedJson.review.notes).toBe("Keyboard review assigned to the accessibility team.");
    expect(reviewedJson.review.manualTasks[reviewedJson.manualChecks[0].id]).toEqual({
      status: "pass",
      notes: "Keyboard access and focus order verified with NVDA.",
    });
    const reviewedHtmlHref = await page.locator("#html-download").getAttribute("href");
    const reviewedHtml = await (await page.request.get(`${dashboard.url}${reviewedHtmlHref}`)).text();
    expect(reviewedHtml).toContain("Manual accessibility review record");
    expect(reviewedHtml).toContain("Keyboard access and focus order verified with NVDA.");

    await page.locator("#manual-status-filters").getByRole("button", { name: "Needs attention" }).click();
    await expect(page.locator("#finding-list .manual-nav").count()).resolves.toBe(0);
    await page.locator("#manual-status-filters").getByRole("button", { name: "All", exact: true }).click();

    await page.getByRole("button", { name: "Scan history" }).click();
    await page.locator("#history-list .history-row").first().waitFor();
    await expect(page.locator("#history-list .history-row").first().textContent()).resolves.toContain("WCAG AA · Single page · screenshots off · interactive states off · public");
    await page.locator("#history-list .history-row").first().getByRole("button", { name: /Run this saved profile again/ }).click();
    await page.locator("#results:not([hidden])").waitFor({ timeout: 60_000 });
    await expect(page.locator(".new-metric strong").textContent()).resolves.toBe("0");
    await expect(page.locator(".existing-metric strong").textContent()).resolves.toBe(String(report.findings.length));
    await expect(page.locator(".history-status-badge.existing").count()).resolves.toBeGreaterThan(0);
    await expect(page.locator(".finding-review-status.action-required").count()).resolves.toBeGreaterThan(0);

    await page.getByRole("button", { name: "Scan history" }).click();
    await page.locator("#history-list .history-row").first().waitFor();
    await expect(page.locator("#history-list .history-row").count()).resolves.toBe(2);
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#history-list .history-row").first().getByRole("button", { name: /Delete scan/ }).click();
    await page.waitForFunction(() => document.querySelectorAll("#history-list .history-row").length === 1);
    await expect(page.locator("#history-list .history-row").count()).resolves.toBe(1);
    await page.locator("#history-list .history-row").first().getByRole("button", { name: /Open scan/ }).click();
    await page.getByRole("button", { name: "Manual review" }).click();
    await expect(page.locator("#finding-detail .manual-status").first().textContent()).resolves.toBe("Pass");
    await expect(page.locator("#finding-detail textarea").inputValue()).resolves.toBe("Keyboard access and focus order verified with NVDA.");
    await expect(page.locator("#run-notes").inputValue()).resolves.toBe("Keyboard review assigned to the accessibility team.");
    expect(consoleErrors).toEqual([]);
  });

  it("uses a local storage state without persisting its path or session contents", async () => {
    const fixture = await startFixtureServer(true);
    fixtureServer = fixture.server;
    historyDirectory = await mkdtemp(join(tmpdir(), "ada-dashboard-auth-history-"));
    sessionDirectory = await mkdtemp(join(tmpdir(), "ada-dashboard-auth-session-"));
    const storageStatePath = join(sessionDirectory, "private-session.json");
    await writeFile(storageStatePath, JSON.stringify({
      cookies: [{
        name: "ada-auth",
        value: "session-token-93a761",
        domain: "127.0.0.1",
        path: "/",
        expires: -1,
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      }],
      origins: [],
    }), "utf8");
    const dashboard = await startUiServer({ host: "127.0.0.1", port: 0, historyDirectory });
    uiServer = dashboard.server;
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto(dashboard.url);
    await page.locator("#url").fill(fixture.url);
    await page.locator("#screenshots").uncheck();
    await page.locator("#authenticated").check();
    await expect(page.locator("#storage-state-label").isVisible()).resolves.toBe(true);

    const missingPath = join(sessionDirectory, "missing-session.json");
    await page.locator("#storage-state").fill(missingPath);
    await page.getByRole("button", { name: "Scan page" }).click();
    await page.locator("#status").getByText("The storage-state file could not be opened or is not a valid Playwright storage-state JSON file.", { exact: true }).waitFor();
    await expect(page.locator("#status").textContent()).resolves.toBe("The storage-state file could not be opened or is not a valid Playwright storage-state JSON file.");
    await expect(page.locator("#status").textContent()).resolves.not.toContain(missingPath);

    await page.locator("#storage-state").fill(storageStatePath);
    await page.getByRole("button", { name: "Scan page" }).click();
    await page.locator("#results:not([hidden])").waitFor({ timeout: 60_000 });
    await expect(page.locator("#result-auth").isVisible()).resolves.toBe(true);
    await expect(page.locator("#storage-state").inputValue()).resolves.toBe("");

    const report = await (await page.request.get(`${dashboard.url}/api/report.json`)).json();
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.metadata.profile.authentication).toBe("storage-state");
    expect(JSON.stringify(report)).not.toContain(storageStatePath);
    expect(JSON.stringify(report)).not.toContain("session-token-93a761");
    const html = await (await page.request.get(`${dashboard.url}/api/report.html`)).text();
    expect(html).toContain("authenticated session");
    expect(html).not.toContain(storageStatePath);
    expect(html).not.toContain("session-token-93a761");

    await page.getByRole("button", { name: "Scan history" }).click();
    const savedRun = page.locator("#history-list .history-row").first();
    await expect(savedRun.textContent()).resolves.toContain("authenticated");
    await savedRun.getByRole("button", { name: /Prepare this authenticated profile/ }).click();
    await expect(page.locator("#storage-state").inputValue()).resolves.toBe("");
    await expect(page.locator("#status").textContent()).resolves.toContain("Enter the storage-state path again");
    await expect(page.locator("#history-list .history-row").count()).resolves.toBe(1);
  });

  it("audits opt-in disclosure, tab, and dialog states and records how to reproduce their findings", async () => {
    const fixture = await startFixtureServer();
    fixtureServer = fixture.server;
    historyDirectory = await mkdtemp(join(tmpdir(), "ada-dashboard-interactions-"));
    const dashboard = await startUiServer({ host: "127.0.0.1", port: 0, historyDirectory });
    uiServer = dashboard.server;
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto(dashboard.url);
    await page.locator("#url").fill(fixture.url);
    await page.locator("#screenshots").uncheck();
    await page.locator("#interaction-states").check();
    await page.getByRole("button", { name: "Scan page" }).click();
    await page.locator("#results:not([hidden])").waitFor({ timeout: 60_000 });

    const report = await (await page.request.get(`${dashboard.url}/api/report.json`)).json();
    const revealed = report.findings.filter((finding: { ruleId: string; location: { interactionType?: string } }) => finding.ruleId === "button-name" && finding.location.interactionType);
    expect(report.metadata.interactionStatesScanned).toBe(3);
    expect(report.metadata.interactionStateCounts).toEqual({ disclosure: 1, tab: 1, dialog: 1 });
    expect(report.metadata.interactionStateFailures).toEqual([]);
    expect(revealed.map((finding: { location: { interactionType: string } }) => finding.location.interactionType).sort()).toEqual(["dialog", "disclosure", "tab"]);
    const disclosureFinding = revealed.find((finding: { location: { interactionType: string } }) => finding.location.interactionType === "disclosure");
    expect(disclosureFinding.location).toMatchObject({
      interactionState: "Account actions",
      interactionTrigger: "#account-disclosure",
      interactionType: "disclosure",
    });

    const disclosureGroup = report.findingGroups.find((group: { findingFingerprints: string[] }) => group.findingFingerprints.includes(disclosureFinding.fingerprint));
    await page.locator(".component-group-nav").filter({ hasText: disclosureGroup.name }).click();
    await expect(page.locator("#finding-detail").textContent()).resolves.toContain("Revealed interaction state");
    await expect(page.locator("#finding-detail").textContent()).resolves.toContain("Disclosure");
    await expect(page.locator("#finding-detail").textContent()).resolves.toContain("#account-disclosure");
  });

  it("reports a matched dialog that cannot be safely restored as manual follow-up", async () => {
    const fixture = await startFixtureServer(false, unsafeDialogFixturePath);
    fixtureServer = fixture.server;
    historyDirectory = await mkdtemp(join(tmpdir(), "ada-dashboard-unsafe-dialog-"));
    const dashboard = await startUiServer({ host: "127.0.0.1", port: 0, historyDirectory });
    uiServer = dashboard.server;
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto(dashboard.url);
    await page.locator("#url").fill(fixture.url);
    await page.locator("#screenshots").uncheck();
    await page.locator("#interaction-states").check();
    await page.getByRole("button", { name: "Scan page" }).click();
    await page.locator("#results:not([hidden])").waitFor({ timeout: 60_000 });

    const report = await (await page.request.get(`${dashboard.url}/api/report.json`)).json();
    expect(report.metadata.interactionStateCounts).toEqual({ disclosure: 0, tab: 0, dialog: 1 });
    expect(report.metadata.interactionStateFailures).toHaveLength(1);
    expect(report.metadata.interactionStateFailures[0]).toMatchObject({
      type: "dialog",
      name: "Open sticky dialog",
      trigger: "#sticky-dialog-trigger",
    });
    await expect(page.locator("#incomplete").textContent()).resolves.toContain("Interactive states skipped");
    await expect(page.locator("#incomplete").textContent()).resolves.toContain("#sticky-dialog-trigger");
  });
});
