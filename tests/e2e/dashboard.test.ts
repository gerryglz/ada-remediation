import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { startUiServer } from "../../src/ui/server.js";

const fixturePath = new URL("../fixtures/grouped-aria/index.html", import.meta.url);

async function closeServer(server: Server | undefined): Promise<void> {
  if (!server?.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function startFixtureServer(): Promise<{ server: Server; url: string }> {
  const html = await readFile(fixturePath, "utf8");
  const server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(html);
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

  afterEach(async () => {
    await browser?.close();
    await closeServer(uiServer);
    await closeServer(fixtureServer);
    if (historyDirectory) await rm(historyDirectory, { recursive: true, force: true });
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
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.findings[0].renderedHtmlContext.html).toContain("\n");
    await expect(page.locator(".new-metric strong").textContent()).resolves.toBe(String(report.findings.length));

    await page.getByRole("button", { name: "Manual checklist" }).click();
    await expect(page.locator("#queue-heading").textContent()).resolves.toBe("Manual checklist");
    await expect(page.locator("#finding-list .manual-nav").count()).resolves.toBeGreaterThan(0);
    await page.locator("#finding-list .manual-nav input").first().check();
    await page.locator("#save-state").getByText("Saved locally").waitFor();
    await page.locator("#run-notes").fill("Keyboard review assigned to the accessibility team.");
    await page.getByRole("button", { name: "Save review" }).click();
    await page.locator("#save-state").getByText("Saved locally").waitFor();

    await page.getByRole("button", { name: "Show scan controls" }).click();
    await page.getByRole("button", { name: "Scan page" }).click();
    await page.locator("#results:not([hidden])").waitFor({ timeout: 60_000 });
    await expect(page.locator(".new-metric strong").textContent()).resolves.toBe("0");
    await expect(page.locator(".existing-metric strong").textContent()).resolves.toBe(String(report.findings.length));
    await expect(page.locator(".history-status-badge.existing").count()).resolves.toBeGreaterThan(0);

    await page.getByRole("button", { name: "Scan history" }).click();
    await page.locator("#history-list .history-row").first().waitFor();
    await expect(page.locator("#history-list .history-row").count()).resolves.toBe(2);
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#history-list .history-row").first().getByRole("button", { name: /Delete scan/ }).click();
    await page.waitForFunction(() => document.querySelectorAll("#history-list .history-row").length === 1);
    await expect(page.locator("#history-list .history-row").count()).resolves.toBe(1);
    await page.locator("#history-list .history-row").first().getByRole("button", { name: /Open scan/ }).click();
    await page.getByRole("button", { name: "Manual checklist" }).click();
    await expect(page.locator("#finding-list .manual-nav input").first().isChecked()).resolves.toBe(true);
    await expect(page.locator("#run-notes").inputValue()).resolves.toBe("Keyboard review assigned to the accessibility team.");
    expect(consoleErrors).toEqual([]);
  });

  it("audits opt-in disclosure states and records how to reproduce a revealed finding", async () => {
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
    const revealed = report.findings.find((finding: { ruleId: string }) => finding.ruleId === "button-name");
    expect(report.metadata.interactionStatesScanned).toBe(1);
    expect(revealed.location).toMatchObject({
      interactionState: "Account actions",
      interactionTrigger: "#account-disclosure",
    });

    await page.getByText("After opening Account actions", { exact: false }).first().click();
    await expect(page.locator("#finding-detail").textContent()).resolves.toContain("Revealed interaction state");
    await expect(page.locator("#finding-detail").textContent()).resolves.toContain("#account-disclosure");
  });
});
