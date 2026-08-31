import { createRequire } from "node:module";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { LEGAL_NOTICE, type ContrastEvidence, type Finding, type FindingComponent, type RenderedHtmlContext, type ScanResult, type Severity, type VisualEvidence, type WcagLevel } from "../types.js";
import { fingerprintFinding, TOOL_VERSION } from "../utils.js";
import { buildCodeSuggestion } from "../suggestions.js";
import { axeTagsForWcagLevel, DEFAULT_WCAG_LEVEL, wcagLevelFromTags } from "../wcag.js";
import { manualReviewChecklist } from "../manual.js";
import { buildRemediationGuidance, buildRemediationPrompt, findingIssueCategory, remediationSummary } from "../guidance.js";
import { buildFindingGroups, consolidateCommonFindings } from "../findings.js";
import { navigateForAccessibilityScan, PageNavigationError } from "../navigation.js";
import { formatHtmlSnippet } from "../html.js";

const require = createRequire(import.meta.url);
const axePath = require.resolve("axe-core/axe.min.js");

interface AxeNode {
  html: string;
  target: string[];
  failureSummary?: string;
  component?: FindingComponent;
  renderedHtmlContext?: RenderedHtmlContext;
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

class PageAuditError extends Error {
  readonly stage = "audit" as const;
  readonly attempts = 1;

  constructor(cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`Accessibility engine failed: ${detail}`);
    this.name = "PageAuditError";
    this.cause = cause;
  }
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
  const codeSuggestion = buildCodeSuggestion(violation.id, node.html);
  const remediationGuidance = buildRemediationGuidance({
    ruleId: violation.id,
    title: violation.help,
    failureSummary: node.failureSummary,
    evidence: node.html,
    selector,
    codeSuggestion,
  });
  return {
    fingerprint: fingerprintFinding(violation.id, location, node.html),
    ruleId: violation.id,
    helpUrl: violation.helpUrl,
    title: violation.help,
    severity,
    wcagLevel: wcagLevelFromTags(violation.tags),
    wcag: normalizeWcag(violation.tags),
    location,
    evidence: node.html,
    ...(node.renderedHtmlContext ? {
      renderedHtmlContext: {
        ...node.renderedHtmlContext,
        html: node.renderedHtmlContext.truncated ? node.renderedHtmlContext.html : formatHtmlSnippet(node.renderedHtmlContext.html),
      },
    } : {}),
    explanation: violation.description,
    impact: node.failureSummary ?? `axe-core classified this issue as ${severity}.`,
    remediation: remediationSummary(remediationGuidance),
    remediationGuidance,
    confidence: "high",
    kind: "automatic",
    ...(node.component ? { component: node.component, componentCategory: node.component.category } : {}),
    codeSuggestion,
  };
}

function summaryValue(summary: string | undefined, pattern: RegExp): string | undefined {
  return summary?.match(pattern)?.[1]?.trim();
}

async function captureContrastEvidence(
  page: Page,
  selector: string,
  failureSummary: string | undefined,
): Promise<ContrastEvidence | undefined> {
  try {
    const locator = page.locator(selector).first();
    if ((await locator.count()) === 0) return undefined;
    const computed = await locator.evaluate((element) => {
      const style = getComputedStyle(element);
      return { foreground: style.color, background: style.backgroundColor, fontSize: style.fontSize, fontWeight: style.fontWeight };
    });
    const ratio = Number(summaryValue(failureSummary, /contrast(?: ratio)? of\s+([\d.]+)/i));
    const requiredRatio = Number(summaryValue(failureSummary, /expected contrast ratio of\s+([\d.]+):1/i));
    return {
      foreground: summaryValue(failureSummary, /foreground color:\s*([^,)]+)/i) ?? computed.foreground,
      background: summaryValue(failureSummary, /background color:\s*([^,)]+)/i) ?? computed.background,
      ...(Number.isFinite(ratio) && ratio > 0 ? { ratio } : {}),
      ...(Number.isFinite(requiredRatio) && requiredRatio > 0 ? { requiredRatio } : {}),
      fontSize: summaryValue(failureSummary, /font size:\s*(.*?),\s*font weight:/i) ?? computed.fontSize,
      fontWeight: summaryValue(failureSummary, /font weight:\s*([^,)]+)/i) ?? computed.fontWeight,
    };
  } catch {
    return undefined;
  }
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
  axeTags: string[],
  interactionStateLimit: number,
  reportStage: (fraction: number, phase: UrlScanProgress["phase"], message: string) => void,
): Promise<{ findings: Finding[]; links: string[]; interactionStatesScanned: number }> {
  await navigateForAccessibilityScan(page, url, timeout, (attempt, maximumAttempts) => {
    reportStage(0.05, "loading", `Opening ${url}${attempt > 1 ? ` — retry ${attempt} of ${maximumAttempts}` : ""}`);
  });
  reportStage(0.32, "analyzing", "Page loaded. Running axe-core accessibility checks.");
  let result: { violations: AxeViolation[]; links: string[]; pageTitle: string };
  try {
    await page.addScriptTag({ path: axePath });
    const auditDocument = async (): Promise<{ violations: AxeViolation[]; links: string[]; pageTitle: string }> => page.evaluate(async (runOnlyTags) => {
      const axe = (window as unknown as {
        axe: {
          getRules: () => Array<{ tags: string[] }>;
          run: (context: Document, options: object) => Promise<{ violations: AxeViolation[] }>;
        };
      }).axe;
      const availableTags = new Set(axe.getRules().flatMap((rule) => rule.tags));
      const supportedTags = runOnlyTags.filter((tag) => availableTags.has(tag));
      const audit = await axe.run(document, { runOnly: { type: "tag", values: supportedTags } });
      const elementFor = (selectorParts: string[]): Element | null => {
        let element: Element | null = null;
        try {
          element = document.querySelector(selectorParts.join(" "));
        } catch {
          return null;
        }
        return element;
      };
      const componentFor = (selectorParts: string[]): FindingComponent | undefined => {
        const element = elementFor(selectorParts);
        if (!element) return undefined;
        const menu = element.closest('nav,[role="navigation"],[role="menu"],[role="menubar"]');
        const isMenuItem = element.matches('[role="menuitem"]');
        const header = element.closest('header,[role="banner"]');
        const region = menu ?? header ?? (isMenuItem ? element.parentElement : null) ?? element.closest('footer,[role="contentinfo"],form,table');
        if (!region) return undefined;
        const tag = region.tagName.toLowerCase();
        const role = region.getAttribute("role")?.toLowerCase();
        const category = menu || isMenuItem
          ? (header ? "Header menu" : "Navigation menu")
          : tag === "header" || role === "banner"
            ? "Header"
            : tag === "footer" || role === "contentinfo"
              ? "Footer"
              : tag === "form"
                ? "Form"
                : "Table";
        const label = region.getAttribute("aria-label")?.trim();
        const id = region.id.trim();
        const stableClasses = [...region.classList].filter((value) => !/^(active|open|show|selected|focus|hover|js-)$/i.test(value)).slice(0, 2);
        const selector = id
          ? `#${id}`
          : label
            ? `${tag}[aria-label="${label}"]`
            : `${tag}${stableClasses.map((value) => `.${value}`).join("")}`;
        const name = label || (category === "Header menu" ? "Header menu" : category);
        return {
          key: [category, tag, label ?? "", id, ...stableClasses].join("|").toLowerCase(),
          category,
          name,
          selector,
        };
      };
      const renderedHtmlContextFor = (selectorParts: string[], detectedHtml: string): RenderedHtmlContext => {
        const maximumLength = 12_000;
        const element = elementFor(selectorParts);
        if (!element) {
          return { html: detectedHtml.slice(0, maximumLength), scope: "element", truncated: detectedHtml.length > maximumLength };
        }
        const parentHtml = element.parentElement?.outerHTML;
        const useParent = Boolean(parentHtml && parentHtml.length <= maximumLength);
        const html = useParent ? parentHtml! : element.outerHTML;
        return { html: html.slice(0, maximumLength), scope: useParent ? "parent" : "element", truncated: html.length > maximumLength };
      };
      const violations = audit.violations.map((violation) => ({
        ...violation,
        nodes: violation.nodes.map((node) => ({
          ...node,
          component: componentFor(node.target),
          renderedHtmlContext: renderedHtmlContextFor(node.target, node.html),
        })),
      }));
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).map((link) => link.href);
      return { violations, links, pageTitle: document.title };
    }, axeTags);
    result = await auditDocument();

    const findings: Finding[] = [];
    const seenFingerprints = new Set<string>();
    let interactionStatesScanned = 0;
    const collectFindings = async (
      auditResult: { violations: AxeViolation[]; pageTitle: string },
      interaction?: { name: string; selector: string },
    ): Promise<void> => {
      const totalNodes = auditResult.violations.reduce((total, violation) => total + violation.nodes.length, 0);
      let processedNodes = 0;
      reportStage(0.55, "evidence", totalNodes ? `Reviewing ${totalNodes} detected issue${totalNodes === 1 ? "" : "s"} and collecting evidence.` : "No automated violations found. Finalizing this page.");
      for (const violation of auditResult.violations) {
        for (const node of violation.nodes) {
          const finding = normalizeViolation(violation, node, url, auditResult.pageTitle);
          processedNodes += 1;
          if (seenFingerprints.has(finding.fingerprint)) continue;
          seenFingerprints.add(finding.fingerprint);
          if (interaction) {
            finding.location.interactionState = interaction.name;
            finding.location.interactionTrigger = interaction.selector;
          }
          if (["color-contrast", "color-contrast-enhanced"].includes(finding.ruleId)) {
            finding.contrast = await captureContrastEvidence(page, finding.location.selector!, node.failureSummary);
            finding.codeSuggestion = buildCodeSuggestion(finding.ruleId, node.html, finding.contrast);
            finding.remediationGuidance = buildRemediationGuidance({
              ruleId: finding.ruleId,
              title: finding.title,
              failureSummary: node.failureSummary,
              evidence: node.html,
              selector: finding.location.selector!,
              codeSuggestion: finding.codeSuggestion,
            });
            finding.remediation = remediationSummary(finding.remediationGuidance);
            if (finding.contrast?.ratio && finding.contrast.requiredRatio) {
              finding.remediation = `The measured ${finding.contrast.ratio}:1 contrast must reach at least ${finding.contrast.requiredRatio}:1. Change the foreground or background color in every interactive state, then measure the computed result again.`;
            }
          }
          if (captureScreenshots && screenshotBudget.remaining > 0) {
            finding.screenshot = await captureScreenshot(page, finding.location.selector!, finding.title);
            if (finding.screenshot) screenshotBudget.remaining -= 1;
          }
          findings.push(finding);
          reportStage(0.55 + 0.4 * (processedNodes / Math.max(1, totalNodes)), "evidence", `Collected evidence for ${processedNodes} of ${totalNodes} detected issues.`);
        }
      }
    };

    await collectFindings(result);
    if (interactionStateLimit > 0) {
      const disclosures = await page.evaluate((limit) => {
        const visible = (element: HTMLElement): boolean => Boolean(element.getClientRects().length) && getComputedStyle(element).visibility !== "hidden";
        return [...document.querySelectorAll<HTMLButtonElement>('button[aria-expanded="false"][aria-controls]')]
          .filter((button) => !button.disabled && visible(button) && (!button.form || button.type === "button"))
          .flatMap((button) => {
            const controls = button.getAttribute("aria-controls")?.trim() ?? "";
            if (!controls || /\s/.test(controls) || !document.getElementById(controls)) return [];
            const selector = button.id
              ? `#${CSS.escape(button.id)}`
              : `button[aria-controls="${CSS.escape(controls)}"]`;
            if (document.querySelectorAll(selector).length !== 1) return [];
            const name = button.getAttribute("aria-label")?.trim() || button.textContent?.replace(/\s+/g, " ").trim() || button.title.trim() || `Disclosure for #${controls}`;
            return [{ selector, controls, targetSelector: `#${CSS.escape(controls)}`, name }];
          })
          .slice(0, limit);
      }, interactionStateLimit);

      for (const disclosure of disclosures) {
        const trigger = page.locator(disclosure.selector).first();
        try {
          reportStage(0.5, "analyzing", `Opening “${disclosure.name}” and auditing its revealed state.`);
          await trigger.click({ timeout: Math.min(3_000, timeout), noWaitAfter: true });
          await page.waitForTimeout(250);
          const opened = await trigger.getAttribute("aria-expanded") === "true"
            && await page.locator(disclosure.targetSelector).first().isVisible().catch(() => false);
          if (!opened) continue;
          interactionStatesScanned += 1;
          await collectFindings(await auditDocument(), { name: disclosure.name, selector: disclosure.selector });
          if (await trigger.getAttribute("aria-expanded") === "true") {
            await trigger.click({ timeout: 2_000, noWaitAfter: true }).catch(() => undefined);
            await page.waitForTimeout(100);
          }
        } catch {
          // A disclosure that cannot be opened safely is skipped without failing the page scan.
        }
      }
    }

    reportStage(1, "scanning", `Finished ${url}`);
    return { findings, links: result.links, interactionStatesScanned };
  } catch (error) {
    throw new PageAuditError(error);
  }
}

export interface UrlScanOptions {
  timeout?: number;
  storageState?: string;
  maxPages?: number;
  crawl?: boolean;
  captureScreenshots?: boolean;
  screenshotLimit?: number;
  interactionStateLimit?: number;
  wcagLevel?: WcagLevel;
  onProgress?: (progress: UrlScanProgress) => void;
}

export interface UrlScanProgress {
  phase: "idle" | "starting" | "loading" | "analyzing" | "evidence" | "scanning" | "finalizing" | "complete" | "error";
  percent: number;
  message: string;
  currentUrl?: string;
  pagesCompleted: number;
  totalPages: number;
  findingsFound: number;
}

export async function scanUrls(targets: string[], options: UrlScanOptions = {}): Promise<ScanResult> {
  const startedAt = new Date().toISOString();
  const timeout = options.timeout ?? 30_000;
  const maxPages = options.maxPages ?? targets.length;
  const wcagLevel = options.wcagLevel ?? DEFAULT_WCAG_LEVEL;
  const axeTags = axeTagsForWcagLevel(wcagLevel);
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  const findings: Finding[] = [];
  const incomplete: Array<{ url: string; reason: string; stage?: "navigation" | "audit"; attempts?: number }> = [];
  const screenshotBudget = { remaining: options.screenshotLimit ?? 50 };
  let interactionStatesScanned = 0;
  const queued = targets.map((target) => new URL(target).href);
  const allowedOrigins = new Set(queued.map((target) => new URL(target).origin));
  const visited = new Set<string>();
  const totalPages = Math.max(1, maxPages);
  let reportedPercent = 0;
  const emitProgress = (progress: Omit<UrlScanProgress, "percent"> & { percent: number }): void => {
    reportedPercent = Math.max(reportedPercent, Math.min(100, Math.round(progress.percent)));
    try {
      options.onProgress?.({ ...progress, percent: reportedPercent });
    } catch {
      // Progress reporting must never interrupt a scan.
    }
  };

  emitProgress({ phase: "starting", percent: 2, message: "Starting the browser and preparing the accessibility engine.", pagesCompleted: 0, totalPages, findingsFound: 0 });

  try {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      ...(options.storageState ? { storageState: options.storageState } : {}),
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    emitProgress({ phase: "starting", percent: 5, message: "Browser ready. Preparing the first page.", pagesCompleted: 0, totalPages, findingsFound: 0 });

    while (queued.length > 0 && visited.size < maxPages) {
      const url = queued.shift()!;
      if (visited.has(url)) continue;
      visited.add(url);
      const pageIndex = visited.size - 1;
      const reportStage = (fraction: number, phase: UrlScanProgress["phase"], message: string): void => {
        emitProgress({
          phase,
          percent: 5 + ((pageIndex + Math.max(0, Math.min(1, fraction))) / totalPages) * 88,
          message: `${message} Page ${visited.size} of up to ${totalPages}.`,
          currentUrl: url,
          pagesCompleted: Math.max(0, visited.size - incomplete.length - 1),
          totalPages,
          findingsFound: findings.length,
        });
      };
      try {
        const pageResult = await scanPage(page, url, timeout, options.captureScreenshots ?? true, screenshotBudget, axeTags, options.interactionStateLimit ?? 0, reportStage);
        findings.push(...pageResult.findings);
        interactionStatesScanned += pageResult.interactionStatesScanned;
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
        const knownError = error instanceof PageNavigationError || error instanceof PageAuditError ? error : undefined;
        incomplete.push({
          url,
          reason: error instanceof Error ? error.message : String(error),
          ...(knownError ? { stage: knownError.stage, attempts: knownError.attempts } : {}),
        });
      }
      emitProgress({
        phase: "scanning",
        percent: 5 + (visited.size / totalPages) * 88,
        message: `Completed ${visited.size} of up to ${totalPages} pages. ${findings.length} finding${findings.length === 1 ? "" : "s"} collected so far.`,
        currentUrl: url,
        pagesCompleted: visited.size - incomplete.length,
        totalPages,
        findingsFound: findings.length,
      });
    }
  } finally {
    await context?.close();
    await browser?.close();
  }

  emitProgress({ phase: "finalizing", percent: 96, message: "Building the report and manual review checklist.", pagesCompleted: visited.size - incomplete.length, totalPages, findingsFound: findings.length });

  const consolidatedFindings = consolidateCommonFindings(findings).map((finding) => {
    const issueCategory = findingIssueCategory(finding);
    const categorizedFinding = { ...finding, issueCategory };
    return { ...categorizedFinding, remediationPrompt: buildRemediationPrompt(categorizedFinding) };
  });
  const findingGroups = buildFindingGroups(consolidatedFindings);
  const scanResult: ScanResult = {
    schemaVersion: "1.0",
    metadata: {
      scanner: options.crawl ? "site" : "url",
      target: targets.join(", "),
      startedAt,
      completedAt: new Date().toISOString(),
      toolVersion: TOOL_VERSION,
      pagesOrFilesScanned: visited.size - incomplete.length,
      findingOccurrences: findings.length,
      commonFindings: consolidatedFindings.filter((finding) => finding.scope === "common").length,
      interactionStatesScanned,
      interactionStatesRequested: (options.interactionStateLimit ?? 0) > 0,
      wcagLevel,
      profile: {
        target: targets.join(", "),
        wcagLevel,
        crawl: Boolean(options.crawl),
        maxPages,
        captureScreenshots: options.captureScreenshots ?? true,
        interactionStates: (options.interactionStateLimit ?? 0) > 0,
      },
      incomplete,
    },
    findings: consolidatedFindings,
    findingGroups,
    manualChecks: manualReviewChecklist(wcagLevel),
    notice: LEGAL_NOTICE,
  };
  emitProgress({ phase: "complete", percent: 100, message: "Scan complete. The report is ready for review.", pagesCompleted: scanResult.metadata.pagesOrFilesScanned, totalPages, findingsFound: findings.length });
  return scanResult;
}
