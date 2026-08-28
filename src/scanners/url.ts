import { createRequire } from "node:module";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { LEGAL_NOTICE, type Finding, type ScanResult, type Severity, type VisualEvidence } from "../types.js";
import { fingerprintFinding, TOOL_VERSION } from "../utils.js";

const require = createRequire(import.meta.url);
const axePath = require.resolve("axe-core/axe.min.js");

interface AxeNode {
  html: string;
  target: string[];
  failureSummary?: string;
}

interface AxeViolation {
  id: string;
  impact: Severity | null;
  tags: string[];
  help: string;
  description: string;
  helpUrl: string;
  nodes: AxeNode[];
}

function normalizeWcag(tags: string[]): string[] {
  return tags
    .filter((tag) => /^wcag\d{3,4}$/.test(tag))
    .map((tag) => {
      const digits = tag.slice(4);
      return digits.length === 3 ? `${digits[0]}.${digits[1]}.${digits[2]}` : tag;
    });
}

function normalizeViolation(violation: AxeViolation, node: AxeNode, url: string, pageTitle: string): Finding {
  const selector = node.target.join(" ");
  const location = { url, selector, pageTitle };
  const severity: Severity = violation.impact ?? "moderate";
  return {
    fingerprint: fingerprintFinding(violation.id, location, node.html),
    ruleId: violation.id,
    title: violation.help,
    severity,
    wcag: normalizeWcag(violation.tags),
    location,
    evidence: node.html,
    explanation: violation.description,
    impact: node.failureSummary ?? `axe-core classified this issue as ${severity}.`,
    remediation: `Resolve the failed checks, then verify manually. Rule guidance: ${violation.helpUrl}`,
    confidence: "high",
    kind: "automatic",
  };
}

async function captureScreenshot(page: Page, selector: string, title: string): Promise<VisualEvidence | undefined> {
  try {
    const locator = page.locator(selector).first();
    if ((await locator.count()) === 0 || !(await locator.isVisible())) return undefined;
    await locator.scrollIntoViewIfNeeded();
    const previousStyle = await locator.evaluate((element) => {
      const htmlElement = element as HTMLElement;
      const snapshot = {
        outline: htmlElement.style.outline,
        outlineOffset: htmlElement.style.outlineOffset,
        boxShadow: htmlElement.style.boxShadow,
      };
      htmlElement.style.outline = "5px solid #1c1c1c";
      htmlElement.style.outlineOffset = "4px";
      htmlElement.style.boxShadow = "0 0 0 9px rgba(247, 244, 237, 0.88), 0 0 0 12px rgba(28, 28, 28, 0.45)";
      return snapshot;
    });
    try {
      await page.waitForTimeout(75);
      const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
      const buffer = await page.screenshot({ type: "jpeg", quality: 72, fullPage: false });
      return {
        dataUrl: `data:image/jpeg;base64,${buffer.toString("base64")}`,
        mimeType: "image/jpeg",
        width: viewport.width,
        height: viewport.height,
        highlightedSelector: selector,
        description: `Viewport capture of ${title}; the affected element is outlined in charcoal.`,
      };
    } finally {
      await locator
        .evaluate((element, previous) => {
          const htmlElement = element as HTMLElement;
          htmlElement.style.outline = previous.outline;
          htmlElement.style.outlineOffset = previous.outlineOffset;
          htmlElement.style.boxShadow = previous.boxShadow;
        }, previousStyle)
        .catch(() => undefined);
    }
  } catch {
    return undefined;
  }
}

async function scanPage(
  page: Page,
  url: string,
  timeout: number,
  captureScreenshots: boolean,
  screenshotBudget: { remaining: number },
): Promise<{ findings: Finding[]; links: string[] }> {
  await page.goto(url, { waitUntil: "networkidle", timeout });
  await page.addScriptTag({ path: axePath });
  const result = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (context: Document, options: object) => Promise<{ violations: AxeViolation[] }> } }).axe;
    const audit = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } });
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).map((link) => link.href);
    return { violations: audit.violations, links, pageTitle: document.title };
  });

  const findings: Finding[] = [];
  for (const violation of result.violations) {
    for (const node of violation.nodes) {
      const finding = normalizeViolation(violation, node, url, result.pageTitle);
      if (captureScreenshots && screenshotBudget.remaining > 0) {
        finding.screenshot = await captureScreenshot(page, finding.location.selector!, finding.title);
        if (finding.screenshot) screenshotBudget.remaining -= 1;
      }
      findings.push(finding);
    }
  }

  return {
    findings,
    links: result.links,
  };
}

export interface UrlScanOptions {
  timeout?: number;
  storageState?: string;
  maxPages?: number;
  crawl?: boolean;
  captureScreenshots?: boolean;
  screenshotLimit?: number;
}

export async function scanUrls(targets: string[], options: UrlScanOptions = {}): Promise<ScanResult> {
  const startedAt = new Date().toISOString();
  const timeout = options.timeout ?? 30_000;
  const maxPages = options.maxPages ?? targets.length;
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  const findings: Finding[] = [];
  const incomplete: Array<{ url: string; reason: string }> = [];
  const screenshotBudget = { remaining: options.screenshotLimit ?? 50 };
  const queued = targets.map((target) => new URL(target).href);
  const allowedOrigins = new Set(queued.map((target) => new URL(target).origin));
  const visited = new Set<string>();

  try {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      ...(options.storageState ? { storageState: options.storageState } : {}),
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();

    while (queued.length > 0 && visited.size < maxPages) {
      const url = queued.shift()!;
      if (visited.has(url)) continue;
      visited.add(url);
      try {
        const pageResult = await scanPage(page, url, timeout, options.captureScreenshots ?? true, screenshotBudget);
        findings.push(...pageResult.findings);
        if (options.crawl) {
          for (const href of pageResult.links) {
            try {
              const candidate = new URL(href);
              candidate.hash = "";
              if (["http:", "https:"].includes(candidate.protocol) && allowedOrigins.has(candidate.origin) && !visited.has(candidate.href)) {
                queued.push(candidate.href);
              }
            } catch {
              // Ignore malformed or non-URL href values.
            }
          }
        }
      } catch (error) {
        incomplete.push({ url, reason: error instanceof Error ? error.message : String(error) });
      }
    }
  } finally {
    await context?.close();
    await browser?.close();
  }

  return {
    schemaVersion: "1.0",
    metadata: {
      scanner: options.crawl ? "site" : "url",
      target: targets.join(", "),
      startedAt,
      completedAt: new Date().toISOString(),
      toolVersion: TOOL_VERSION,
      pagesOrFilesScanned: visited.size - incomplete.length,
      incomplete,
    },
    findings,
    notice: LEGAL_NOTICE,
  };
}
