import { createRequire } from "node:module";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { LEGAL_NOTICE, type ContrastEvidence, type Finding, type FindingComponent, type InteractionStateFailure, type InteractionStateType, type RenderedHtmlContext, type ScanResult, type Severity, type SkippedAsset, type SkippedAssetKind, type VisualEvidence, type WcagLevel } from "../types.js";
import { fingerprintFinding, TOOL_VERSION } from "../utils.js";
import { buildCodeSuggestion } from "../suggestions.js";
import { axeTagsForWcagLevel, DEFAULT_WCAG_LEVEL, wcagLevelFromTags } from "../wcag.js";
import { manualReviewChecklist } from "../manual.js";
import { buildRemediationGuidance, buildRemediationPrompt, findingIssueCategory, remediationSummary } from "../guidance.js";
import { buildFindingGroups, consolidateCommonFindings } from "../findings.js";
import { crawlKey, navigateForAccessibilityScan, PageNavigationError } from "../navigation.js";
import { formatHtmlSnippet } from "../html.js";

const require = createRequire(import.meta.url);
const axePath = require.resolve("axe-core/axe.min.js");

const skippedAssetExtensions: Record<SkippedAssetKind, ReadonlySet<string>> = {
  pdf: new Set([".pdf"]),
  image: new Set([".avif", ".bmp", ".gif", ".ico", ".jpeg", ".jpg", ".png", ".svg", ".tif", ".tiff", ".webp"]),
  audio: new Set([".aac", ".flac", ".m4a", ".mp3", ".oga", ".ogg", ".wav"]),
  video: new Set([".avi", ".m4v", ".mov", ".mp4", ".mpeg", ".mpg", ".ogv", ".webm"]),
  download: new Set([".7z", ".doc", ".docx", ".ppt", ".pptx", ".rar", ".tar", ".xls", ".xlsx", ".zip"]),
};

const skippedAssetReasons: Record<SkippedAssetKind, string> = {
  pdf: "PDF documents require a dedicated document accessibility review and are outside this HTML website scan.",
  image: "Image assets are evaluated through the HTML page that uses them, not by navigating to the image file directly.",
  audio: "Audio assets require a media-specific review for alternatives such as transcripts and are outside this HTML website scan.",
  video: "Video assets require a media-specific review for captions, transcripts, and audio description and are outside this HTML website scan.",
  download: "Downloadable files require a format-specific accessibility review and are outside this HTML website scan.",
};

export function classifySkippedAssetUrl(value: string): SkippedAsset | undefined {
  let pathname: string;
  try {
    pathname = new URL(value).pathname.toLowerCase().replace(/\/+$/, "");
  } catch {
    return undefined;
  }
  const extension = pathname.match(/(\.[a-z0-9]+)$/)?.[1];
  if (!extension) return undefined;
  const kind = (Object.entries(skippedAssetExtensions) as Array<[SkippedAssetKind, ReadonlySet<string>]>).find(([, extensions]) => extensions.has(extension))?.[0];
  return kind ? { url: value, kind, reason: skippedAssetReasons[kind] } : undefined;
}

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

interface InteractionCandidate {
  type: InteractionStateType;
  selector: string;
  targetSelector: string;
  name: string;
  restoreSelector?: string;
  preflightFailure?: string;
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
): Promise<{ findings: Finding[]; links: string[]; interactionStatesScanned: number; interactionStateCounts: Record<InteractionStateType, number>; interactionStateFailures: InteractionStateFailure[] }> {
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
      const componentFor = (selectorParts: string[], ruleId: string): FindingComponent | undefined => {
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
        const selectorFor = (candidate: Element): string => {
          const candidateTag = candidate.tagName.toLowerCase();
          const candidateLabel = candidate.getAttribute("aria-label")?.trim();
          const candidateId = candidate.id.trim();
          const candidateClasses = [...candidate.classList].filter((value) => !/^(active|open|show|selected|focus|hover|js-)$/i.test(value)).slice(0, 2);
          if (candidateId) return `#${candidateId}`;
          if (candidateLabel) return `${candidateTag}[aria-label="${candidateLabel}"]`;
          if (candidateClasses.length) return `${candidateTag}${candidateClasses.map((value) => `.${value}`).join("")}`;
          const parent = candidate.parentElement;
          if (!parent) return candidateTag;
          const sameTagSiblings = [...parent.children].filter((sibling) => sibling.tagName === candidate.tagName);
          const position = sameTagSiblings.indexOf(candidate) + 1;
          const parentClass = [...parent.classList].find((value) => !/^(active|open|show|selected|focus|hover|js-)$/i.test(value));
          const parentSelector = parent.id ? `#${parent.id}` : `${parent.tagName.toLowerCase()}${parentClass ? `.${parentClass}` : ""}`;
          return `${parentSelector} > ${candidateTag}${sameTagSiblings.length > 1 ? `:nth-of-type(${position})` : ""}`;
        };
        const label = region.getAttribute("aria-label")?.trim();
        const id = region.id.trim();
        const stableClasses = [...region.classList].filter((value) => !/^(active|open|show|selected|focus|hover|js-)$/i.test(value)).slice(0, 2);
        const selector = selectorFor(region);
        const name = label || (category === "Header menu" ? "Header menu" : category);
        let remediationTarget: FindingComponent["remediationTarget"];
        if (ruleId === "aria-required-parent" && isMenuItem) {
          let candidate = element.parentElement;
          let owner: Element | null = null;
          while (candidate && candidate !== region.parentElement) {
            const ownedMenuItems = candidate.querySelectorAll(':scope > [role="menuitem"], :scope > li > [role="menuitem"], :scope > [role="presentation"] > [role="menuitem"]');
            if (ownedMenuItems.length > 1) {
              owner = candidate;
              break;
            }
            candidate = candidate.parentElement;
          }
          const target = owner ?? element.parentElement;
          if (target) {
            const outerHtml = target.outerHTML;
            const openingTag = outerHtml.match(/^<[^>]+>/)?.[0] ?? outerHtml.slice(0, 500);
            const currentRole = target.getAttribute("role")?.trim();
            remediationTarget = {
              selector: selectorFor(target),
              html: openingTag,
              ...(currentRole ? { currentRole } : {}),
              suggestedRoles: ["menu", "menubar", "group"],
              reason: owner
                ? "Nearest rendered container that directly owns multiple failing menuitem elements."
                : "Nearest rendered parent of the failing menuitem; confirm the shared owner in maintained source.",
            };
          }
        }
        return {
          key: [category, tag, label ?? "", id, ...stableClasses].join("|").toLowerCase(),
          category,
          name,
          selector,
          ...(remediationTarget ? { remediationTarget } : {}),
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
          component: componentFor(node.target, violation.id),
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
    const interactionStateCounts: Record<InteractionStateType, number> = { disclosure: 0, tab: 0, dialog: 0, carousel: 0 };
    const interactionStateFailures: InteractionStateFailure[] = [];
    const collectFindings = async (
      auditResult: { violations: AxeViolation[]; pageTitle: string },
      interaction?: { name: string; selector: string; type: InteractionStateType },
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
            finding.location.interactionType = interaction.type;
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
      const interactions = await page.evaluate((limit): InteractionCandidate[] => {
        const visible = (element: HTMLElement): boolean => Boolean(element.getClientRects().length) && getComputedStyle(element).visibility !== "hidden";
        const selectorFor = (button: HTMLButtonElement, fallback: string): string | undefined => {
          const selector = button.id ? `#${CSS.escape(button.id)}` : fallback;
          return document.querySelectorAll(selector).length === 1 ? selector : undefined;
        };
        const nameFor = (button: HTMLButtonElement, fallback: string): string => button.getAttribute("aria-label")?.trim()
          || button.textContent?.replace(/\s+/g, " ").trim()
          || button.title.trim()
          || fallback;
        const isSafeButton = (button: HTMLButtonElement): boolean => !button.disabled
          && button.getAttribute("aria-disabled") !== "true"
          && visible(button)
          && (!button.form || button.type === "button");
        return [...document.querySelectorAll<HTMLButtonElement>("button")].flatMap((button): InteractionCandidate[] => {
          if (!isSafeButton(button)) return [];
          const controls = button.getAttribute("aria-controls")?.trim() ?? "";
          if (!controls || /\s/.test(controls)) return [];
          const target = document.getElementById(controls);
          if (!target) return [];
          const targetSelector = `#${CSS.escape(controls)}`;
          if (button.getAttribute("role")?.toLowerCase() === "tab") {
            if (button.getAttribute("aria-selected") !== "false" || target.getAttribute("role")?.toLowerCase() !== "tabpanel" || visible(target)) return [];
            const tablist = button.closest('[role="tablist"]');
            const selected = tablist?.querySelector<HTMLButtonElement>('button[role="tab"][aria-selected="true"][aria-controls]');
            if (!selected || selected.disabled || selected.getAttribute("aria-disabled") === "true" || !visible(selected) || (selected.form && selected.type !== "button")) return [];
            const selectedControls = selected.getAttribute("aria-controls")?.trim() ?? "";
            const selector = selectorFor(button, `button[role="tab"][aria-controls="${CSS.escape(controls)}"]`);
            const restoreSelector = selectedControls && !/\s/.test(selectedControls)
              ? selectorFor(selected, `button[role="tab"][aria-controls="${CSS.escape(selectedControls)}"]`)
              : undefined;
            if (!selector || !restoreSelector) return [];
            return [{ type: "tab", selector, targetSelector, restoreSelector, name: nameFor(button, `Tab for #${controls}`) }];
          }
          if (button.getAttribute("aria-haspopup")?.toLowerCase() === "dialog") {
            if (!target.matches('dialog,[role="dialog"]') || visible(target)) return [];
            const selector = selectorFor(button, `button[aria-haspopup="dialog"][aria-controls="${CSS.escape(controls)}"]`);
            if (!selector) return [];
            return [{ type: "dialog", selector, targetSelector, name: nameFor(button, `Dialog for #${controls}`) }];
          }
          if (target.getAttribute("aria-roledescription")?.toLowerCase() === "carousel" && ["region", "group"].includes(target.getAttribute("role")?.toLowerCase() ?? "")) {
            const triggerName = nameFor(button, "");
            if (!/\b(next|forward|following)\b/i.test(triggerName)) return [];
            const selector = selectorFor(button, `button[aria-controls="${CSS.escape(controls)}"]`);
            if (!selector || document.querySelectorAll(targetSelector).length !== 1) return [];
            const carouselName = target.getAttribute("aria-label")?.trim() || "Carousel";
            const candidate = (preflightFailure: string, restoreSelector?: string): InteractionCandidate[] => [{
              type: "carousel",
              selector,
              targetSelector,
              ...(restoreSelector ? { restoreSelector } : {}),
              name: `${carouselName} — next slide`,
              preflightFailure,
            }];
            const carouselButtons = [...target.querySelectorAll<HTMLButtonElement>("button")];
            if (carouselButtons.some((control) => /\b(pause|stop|play|resume|rotation|autoplay)\b/i.test(nameFor(control, "")))) {
              return candidate("An automatic-rotation control was detected, so this carousel requires manual pause, timing, and keyboard review.");
            }
            const slides = [...target.querySelectorAll<HTMLElement>('[aria-roledescription="slide"]')];
            if (slides.length < 2 || slides.filter(visible).length !== 1) {
              return candidate("The carousel did not expose at least two slides with exactly one visible starting slide.");
            }
            const previous = carouselButtons.find((candidate) => candidate !== button
              && isSafeButton(candidate)
              && candidate.getAttribute("aria-controls")?.trim() === controls
              && /\b(previous|prev|back)\b/i.test(nameFor(candidate, "")));
            if (!previous) return candidate("A visible, enabled Previous button tied to the same carousel was not available to restore the starting slide.");
            const restoreSelector = selectorFor(previous, `button[aria-controls="${CSS.escape(controls)}"]`);
            if (!restoreSelector) return candidate("The Previous button could not be addressed with a unique selector, so the starting slide could not be restored safely.");
            return [{ type: "carousel", selector, targetSelector, restoreSelector, name: `${carouselName} — next slide` }];
          }
          if (button.getAttribute("aria-expanded") !== "false" || visible(target)) return [];
          const selector = selectorFor(button, `button[aria-controls="${CSS.escape(controls)}"]`);
          if (!selector) return [];
          return [{ type: "disclosure", selector, targetSelector, name: nameFor(button, `Disclosure for #${controls}`) }];
        }).slice(0, limit);
      }, interactionStateLimit);

      for (const interaction of interactions) {
        if (interaction.preflightFailure) {
          interactionStateFailures.push({ url, type: interaction.type, name: interaction.name, trigger: interaction.selector, reason: interaction.preflightFailure });
          continue;
        }
        const trigger = page.locator(interaction.selector).first();
        const target = page.locator(interaction.targetSelector).first();
        const carouselState = async (): Promise<string | undefined> => interaction.type === "carousel"
          ? target.evaluate((carousel) => {
            const visible = (element: HTMLElement): boolean => Boolean(element.getClientRects().length) && getComputedStyle(element).visibility !== "hidden";
            const slides = [...carousel.querySelectorAll<HTMLElement>('[aria-roledescription="slide"]')];
            return JSON.stringify(slides.map((slide, index) => ({
              key: slide.id || String(index),
              visible: visible(slide),
              hidden: slide.hidden,
              ariaHidden: slide.getAttribute("aria-hidden"),
              ariaCurrent: slide.getAttribute("aria-current"),
            })));
          })
          : undefined;
        const initialCarouselState = await carouselState();
        const restoreInteraction = async (): Promise<boolean> => {
          if (interaction.type === "disclosure") {
            if (await trigger.getAttribute("aria-expanded") === "true") await trigger.click({ timeout: 2_000, noWaitAfter: true });
          } else if (interaction.type === "tab" && interaction.restoreSelector) {
            await page.locator(interaction.restoreSelector).first().click({ timeout: 2_000, noWaitAfter: true });
          } else if (interaction.type === "dialog" && await target.isVisible().catch(() => false)) {
            await page.keyboard.press("Escape");
          } else if (interaction.type === "carousel" && interaction.restoreSelector) {
            await page.locator(interaction.restoreSelector).first().click({ timeout: 2_000, noWaitAfter: true });
          }
          await page.waitForTimeout(150);
          if (interaction.type !== "carousel" && await target.isVisible().catch(() => false)) return false;
          if (interaction.type === "disclosure") return await trigger.getAttribute("aria-expanded") !== "true";
          if (interaction.type === "tab" && interaction.restoreSelector) return await page.locator(interaction.restoreSelector).first().getAttribute("aria-selected") === "true";
          if (interaction.type === "carousel") return await carouselState() === initialCarouselState;
          return true;
        };
        try {
          if (interaction.type === "carousel") {
            await page.waitForTimeout(300);
            if (await carouselState() !== initialCarouselState) {
              interactionStateFailures.push({ url, type: interaction.type, name: interaction.name, trigger: interaction.selector, reason: "The carousel changed without activation, so it may auto-rotate and was left for manual review." });
              continue;
            }
          }
          const action = interaction.type === "tab" ? "Selecting" : interaction.type === "carousel" ? "Advancing" : "Opening";
          reportStage(0.5, "analyzing", `${action} ${interaction.type} “${interaction.name}” and auditing its state.`);
          await trigger.click({ timeout: Math.min(3_000, timeout), noWaitAfter: true });
          await page.waitForTimeout(250);
          const targetVisible = await target.isVisible().catch(() => false);
          const opened = interaction.type === "disclosure"
            ? await trigger.getAttribute("aria-expanded") === "true" && targetVisible
            : interaction.type === "tab"
              ? await trigger.getAttribute("aria-selected") === "true" && targetVisible
              : interaction.type === "carousel"
                ? targetVisible && await carouselState() !== initialCarouselState
                : targetVisible;
          if (!opened) {
            const restored = await restoreInteraction().catch(() => false);
            interactionStateFailures.push({ url, type: interaction.type, name: interaction.name, trigger: interaction.selector, reason: restored ? "The trigger did not expose its expected controlled state." : "The trigger did not expose the expected state and could not be safely restored; remaining states were skipped." });
            if (!restored) break;
            continue;
          }
          interactionStatesScanned += 1;
          interactionStateCounts[interaction.type] += 1;
          await collectFindings(await auditDocument(), { name: interaction.name, selector: interaction.selector, type: interaction.type });
          if (!await restoreInteraction()) {
            interactionStateFailures.push({ url, type: interaction.type, name: interaction.name, trigger: interaction.selector, reason: `The ${interaction.type} state was audited but could not be safely restored; remaining states were skipped.` });
            break;
          }
        } catch {
          const restored = await restoreInteraction().catch(() => false);
          interactionStateFailures.push({ url, type: interaction.type, name: interaction.name, trigger: interaction.selector, reason: restored ? "The control could not be activated within the safe interaction limits." : "The control could not be activated or safely restored; remaining states were skipped." });
          if (!restored) break;
        }
      }
    }

    reportStage(1, "scanning", `Finished ${url}`);
    return { findings, links: result.links, interactionStatesScanned, interactionStateCounts, interactionStateFailures };
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
  const interactionStateCounts: Record<InteractionStateType, number> = { disclosure: 0, tab: 0, dialog: 0, carousel: 0 };
  const interactionStateFailures: InteractionStateFailure[] = [];
  const skippedAssets = new Map<string, SkippedAsset>();
  const normalizedTargets = targets.map((target) => new URL(target).href);
  const queued: string[] = [];
  const enqueued = new Set<string>();
  for (const target of normalizedTargets) {
    const skippedAsset = classifySkippedAssetUrl(target);
    if (skippedAsset) skippedAssets.set(target, skippedAsset);
    else {
      queued.push(target);
      enqueued.add(crawlKey(target));
    }
  }
  const allowedOrigins = new Set(normalizedTargets.map((target) => new URL(target).origin));
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
        for (const type of ["disclosure", "tab", "dialog", "carousel"] as const) interactionStateCounts[type] += pageResult.interactionStateCounts[type];
        interactionStateFailures.push(...pageResult.interactionStateFailures);
        if (options.crawl) {
          for (const href of pageResult.links) {
            try {
              const candidate = new URL(href);
              candidate.hash = "";
              const skippedAsset = classifySkippedAssetUrl(candidate.href);
              if (skippedAsset && allowedOrigins.has(candidate.origin)) {
                skippedAssets.set(candidate.href, skippedAsset);
                continue;
              }
              if (["http:", "https:"].includes(candidate.protocol) && allowedOrigins.has(candidate.origin) && !visited.has(candidate.href) && !enqueued.has(crawlKey(candidate.href))) {
                queued.push(candidate.href);
                enqueued.add(crawlKey(candidate.href));
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
      interactionStateCounts,
      interactionStateFailures,
      skippedAssets: [...skippedAssets.values()],
      wcagLevel,
      profile: {
        target: targets.join(", "),
        wcagLevel,
        crawl: Boolean(options.crawl),
        maxPages,
        captureScreenshots: options.captureScreenshots ?? true,
        interactionStates: (options.interactionStateLimit ?? 0) > 0,
        authentication: options.storageState ? "storage-state" : "public",
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
