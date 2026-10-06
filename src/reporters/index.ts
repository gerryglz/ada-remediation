import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Finding, FindingGroup, ScanResult, Severity, SourceLocation } from "../types.js";
import { sharedCss } from "../styles.js";
import { escapeHtml, severityRank } from "../utils.js";
import { WCAG_VERSION, wcagCriterionLabel, wcagUnderstandingUrl } from "../wcag.js";
import { manualReviewChecklist } from "../manual.js";
import { affectedPageCount, buildFindingGroups, buildFindingIssueClusters, findingComponentCategory, findingOccurrenceCount } from "../findings.js";
import { buildGroupRemediationPrompt, buildRemediationPrompt, findingIssueCategory } from "../guidance.js";

export type ReportFormat = "terminal" | "json" | "html" | "sarif";

function locationText(finding: Finding): string {
  const location = finding.location;
  const state = location.interactionState ? ` — after ${location.interactionType === "tab" ? "selecting" : location.interactionType === "carousel" ? "advancing" : "opening"} ${location.interactionState}` : "";
  if (location.file) return `${location.file}${location.line ? `:${location.line}:${location.column ?? 1}` : ""}${state}`;
  return `${location.url ?? "unknown"}${location.selector ? ` (${location.selector})` : ""}${state}`;
}

function interactionTypeLabel(type: Finding["location"]["interactionType"]): string {
  return type === "tab" ? "Tab" : type === "dialog" ? "Dialog" : type === "disclosure" ? "Disclosure" : type === "carousel" ? "Carousel" : "Interactive";
}

function interactionSummary(result: ScanResult): string {
  const counts = result.metadata.interactionStateCounts;
  if (!counts) return `${result.metadata.interactionStatesScanned ?? 0} state(s)`;
  return `${result.metadata.interactionStatesScanned ?? 0} state(s): ${counts.disclosure ?? 0} disclosure, ${counts.tab ?? 0} tab, ${counts.dialog ?? 0} dialog, ${counts.carousel ?? 0} carousel`;
}

function technicalText(value: string): string {
  return value
    .split(/(<\/?[a-z][^>]*>|\baria-[a-z0-9-]+\b(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s,.;]+))?|\brole\b(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s,.;]+))?|\b(?:tabindex|alt|for|id|href|lang)\b\s*=\s*(?:"[^"]*"|'[^']*'|[^\s,.;]+))/gi)
    .filter(Boolean)
    .map((part) => (/^<\/?[a-z]|^aria-[a-z0-9-]+\b|^role\b|^(?:tabindex|alt|for|id|href|lang)\b\s*=/i.test(part) ? `<code class="inline-code">${escapeHtml(part)}</code>` : escapeHtml(part)))
    .join("");
}

function wcagTargetText(result: ScanResult): string | undefined {
  return result.metadata.wcagLevel ? `WCAG ${WCAG_VERSION} Level ${result.metadata.wcagLevel}` : undefined;
}

function scanProfileText(result: ScanResult): string | undefined {
  const profile = result.metadata.profile;
  if (!profile) return undefined;
  return `${profile.crawl ? `Crawl up to ${profile.maxPages} pages` : "Single page"}; screenshots ${profile.captureScreenshots ? "on" : "off"}; interactive states ${profile.interactionStates ? "on" : "off"}; ${profile.authentication === "storage-state" ? "authenticated session" : "public session"}`;
}

const findingDispositionLabels = {
  unreviewed: "Unreviewed",
  "action-required": "Action required",
  "accepted-risk": "Accepted risk",
  "false-positive": "False positive",
} as const;

function findingReviewFor(result: ScanResult, finding: Finding) {
  return result.review?.findings?.[finding.fingerprint] ?? { disposition: "unreviewed" as const, notes: "" };
}

function incompleteDetail(item: NonNullable<ScanResult["metadata"]["incomplete"]>[number]): string {
  const context = [
    item.stage ? `${item.stage} stage` : undefined,
    item.attempts ? `${item.attempts} attempt${item.attempts === 1 ? "" : "s"}` : undefined,
  ].filter(Boolean).join(" · ");
  return context ? `${context} — ${item.reason}` : item.reason;
}

export function terminalReport(result: ScanResult): string {
  const manualChecks = result.manualChecks?.length ? result.manualChecks : manualReviewChecklist(result.metadata.wcagLevel ?? "AA");
  const counts = result.findings.reduce<Record<Severity, number>>(
    (summary, finding) => ({ ...summary, [finding.severity]: summary[finding.severity] + 1 }),
    { critical: 0, serious: 0, moderate: 0, minor: 0 },
  );
  const lines = [
    `Accessibility scan: ${result.metadata.target}`,
    `Scanned: ${result.metadata.pagesOrFilesScanned} | Findings: ${result.findings.length} unique / ${result.metadata.findingOccurrences ?? result.findings.length} occurrences | Manual checks: ${manualChecks.length}`,
    ...(result.metadata.interactionStatesRequested ? [`Interactive states opened: ${interactionSummary(result)}`] : []),
    ...(result.metadata.interactionStateFailures?.length ? [`Interactive states skipped: ${result.metadata.interactionStateFailures.length}`] : []),
    ...(result.metadata.skippedAssets?.length ? [`Non-HTML assets skipped: ${result.metadata.skippedAssets.length}`] : []),
    ...(wcagTargetText(result) ? [`Conformance target: ${wcagTargetText(result)}`] : []),
    ...(scanProfileText(result) ? [`Scan profile: ${scanProfileText(result)}`] : []),
    `Critical ${counts.critical} | Serious ${counts.serious} | Moderate ${counts.moderate} | Minor ${counts.minor}`,
    "",
  ];
  const componentGroups = result.findingGroups?.length ? result.findingGroups : buildFindingGroups(result.findings);
  if (componentGroups.length) {
    lines.push("Finding groups:");
    for (const group of componentGroups) {
      const issueCount = group.issueClusters?.length ?? group.findingFingerprints.length;
      lines.push(`  ${group.kind === "pattern" ? "Issue pattern" : "Component"} — ${group.name}: ${issueCount} issue set(s) / ${group.findingFingerprints.length} affected elements / ${group.pages.length} pages / ${group.sharedCorrections.length} shared corrections`);
    }
    lines.push("");
  }
  for (const finding of [...result.findings].sort((a, b) => severityRank[b.severity] - severityRank[a.severity])) {
    const review = findingReviewFor(result, finding);
    lines.push(
      `[${finding.severity.toUpperCase()}${finding.wcagLevel ? ` · WCAG LEVEL ${finding.wcagLevel}` : ""}] ${finding.title} (${finding.ruleId})`,
      `  ${locationText(finding)}`,
      finding.scope === "common" ? `  Recurring ${finding.componentCategory ?? findingComponentCategory(finding)}: ${affectedPageCount(finding)} pages / ${findingOccurrenceCount(finding)} occurrences` : "",
      `  Review: ${findingDispositionLabels[review.disposition]}${review.notes ? ` — ${review.notes}` : ""}`,
      `  ${finding.remediation}`,
      finding.safeFix ? `  Safe fix available: ${finding.safeFix.description}` : "",
      "",
    );
  }
  if (result.metadata.incomplete?.length) {
    lines.push("Incomplete pages:");
    for (const item of result.metadata.incomplete) lines.push(`  ${item.url}: ${incompleteDetail(item)}`);
    lines.push("");
  }
  if (result.metadata.skippedAssets?.length) {
    lines.push("Skipped non-HTML assets:");
    for (const item of result.metadata.skippedAssets) lines.push(`  ${item.url}: ${item.reason}`);
    lines.push("");
  }
  if (result.metadata.interactionStateFailures?.length) {
    lines.push("Interactive states skipped:");
    for (const item of result.metadata.interactionStateFailures) lines.push(`  ${interactionTypeLabel(item.type)} “${item.name}” at ${item.url} (${item.trigger}): ${item.reason}`);
    lines.push("");
  }
  lines.push(result.notice);
  return lines.filter((line, index, array) => line !== "" || array[index - 1] !== "").join("\n");
}

export function jsonReport(result: ScanResult): string {
  return JSON.stringify(result, null, 2);
}

const DEFAULT_VERIFY = [
  "Test the affected element with a keyboard and the relevant assistive technology.",
  "Run the scan again and confirm the finding is gone without introducing a new issue.",
];

const REPORT_CSS = `
    body{max-width:920px;margin:0 auto;padding:48px 24px 96px}
    .report-head h1{margin-top:4px;font-size:28px;font-weight:600;letter-spacing:-.4px;text-wrap:balance}
    .report-head p{margin-top:6px}
    .target{overflow-wrap:anywhere}
    .detail .notice{margin-top:16px;font-size:13px;color:var(--muted)}
    .incomplete{margin-top:16px;padding:10px 14px;border:1px solid var(--line);border-radius:8px;background:var(--raised)}
    .incomplete li{overflow-wrap:anywhere}
    .incomplete>summary{font-weight:600;cursor:pointer}
    section{margin-top:40px}
    .detail .section-title{margin:0 0 12px;font-size:18px;letter-spacing:0}
    .filters{display:grid;gap:6px;margin:12px 0}
    .detail .index{margin:0;padding:0;list-style:none;border-top:1px solid var(--line)}
    .detail .index li{margin:0;border-bottom:1px solid var(--line)}
    .index a{display:grid;grid-template-columns:8px minmax(0,1fr);gap:10px;padding:9px 4px;text-decoration:none}
    .index a:hover{background:var(--tint)}
    .finding{margin-top:24px;padding:24px;border:1px solid var(--line);border-radius:12px;scroll-margin-top:16px}
    .detail .group-name{margin:8px 0 0;font-size:18px}
    .review-notes{margin-top:6px;padding:8px 12px;border-left:3px solid var(--line-strong);background:var(--raised);white-space:pre-wrap}
    .check{padding:16px 0;border-top:1px solid var(--line)}
    .detail .check h3{margin:4px 0 6px}
    .check ol{margin-top:8px}
    .hidden{display:none}
    @media(max-width:700px){body{padding:32px 16px 64px}.finding{padding:16px}}
    @media print{.filters,[data-copy]{display:none}pre{max-height:none}}
`;

function link(href: string, text: string): string {
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`;
}

function wcagLink(criterion: string): string {
  return link(wcagUnderstandingUrl(criterion), wcagCriterionLabel(criterion));
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function capitalize(value: string): string {
  return value[0].toUpperCase() + value.slice(1);
}

function list(tag: "ul" | "ol", items: string[]): string {
  return `<${tag}>${items.map((item) => `<li>${technicalText(item)}</li>`).join("")}</${tag}>`;
}

function more(title: string, body: string): string {
  return `<details class="more"><summary>${escapeHtml(title)}</summary><div class="more-body">${body}</div></details>`;
}

function codeBlock(label: string, text: string): string {
  return `<div class="code"><span class="label">${escapeHtml(label)}</span><pre tabindex="0"><code>${escapeHtml(text)}</code></pre></div>`;
}

function promptHtml(title: string, prompt: string, description: string): string {
  return more(title, `<p class="muted">${description}</p><pre tabindex="0">${escapeHtml(prompt)}</pre><button class="btn" type="button" data-copy>Copy AI prompt</button>`);
}

function affectedPages(finding: Finding): SourceLocation[] {
  const locations = (finding.occurrences ?? [{ location: finding.location }]).map((item) => item.location).filter((location) => location.url);
  return [...new Map(locations.map((location) => [location.url, location])).values()];
}

function failedConditions(finding: Finding): string[] {
  const found = (finding.remediationGuidance?.inspect ?? []).filter((item) => item.startsWith("Failed condition:")).map((item) => item.replace(/^Failed condition:\s*/, ""));
  return found.length ? found : [finding.impact];
}

function failureHtml(conditions: string[], label: string): string {
  return `<div class="callout"><span class="label">${label}</span>${conditions.length > 1 ? list("ul", conditions) : `<p>${technicalText(conditions[0])}</p>`}</div>`;
}

function stateText(location: SourceLocation): string {
  return `Revealed interaction state: ${interactionTypeLabel(location.interactionType)} · ${location.interactionState}${location.interactionTrigger ? `, trigger ${location.interactionTrigger}` : ""}. Reproduce it before verifying the fix.`;
}

// The one line of text metadata under a title, shared by the index and the issue sets.
function findingMeta(finding: Finding, result: ScanResult): string {
  const review = findingReviewFor(result, finding);
  const pages = affectedPageCount(finding);
  return [
    capitalize(finding.severity),
    finding.wcagLevel ? `Level ${finding.wcagLevel}` : "",
    finding.issueCategory ?? findingIssueCategory(finding),
    review.disposition === "unreviewed" ? "" : findingDispositionLabels[review.disposition],
    pages > 1 ? `${pages} pages` : "",
  ].filter(Boolean).join(" · ");
}

function contrastHtml(finding: Finding): string {
  const contrast = finding.contrast;
  if (!contrast) return "";
  const swatch = (color: string): string => (/^#[0-9a-f]{3,8}$/i.test(color) ? `<span class="swatch" style="background:${color}"></span>` : "");
  const fact = (name: string, value: string, isColor = false): string => `<div><dt>${name}</dt><dd>${isColor ? swatch(value) : ""}${escapeHtml(value)}</dd></div>`;
  return `<h3>Color contrast evidence</h3><dl class="facts">${fact("Foreground", contrast.foreground, true)}${fact("Background", contrast.background, true)}${fact("Measured ratio", contrast.ratio ? `${contrast.ratio}:1` : "Not reported")}${fact("Required ratio", contrast.requiredRatio ? `${contrast.requiredRatio}:1` : "Verify manually")}${fact("Font", [contrast.fontSize, contrast.fontWeight].filter(Boolean).join(" · ") || "Not reported")}</dl>`;
}

function shotHtml(finding: Finding): string {
  return finding.screenshot?.dataUrl.startsWith("data:image/")
    ? `<h3>Visual evidence</h3><button class="shot" type="button" aria-label="Open larger screenshot for ${escapeHtml(finding.location.selector || finding.title)}"><img src="${escapeHtml(finding.screenshot.dataUrl)}" alt="${escapeHtml(finding.screenshot.description)}" width="${finding.screenshot.width}" height="${finding.screenshot.height}" loading="lazy"></button>`
    : "";
}

function findingCard(finding: Finding, result: ScanResult): string {
  const review = findingReviewFor(result, finding);
  const pages = affectedPages(finding);
  const selector = `<code>${escapeHtml(finding.location.selector || finding.ruleId)}</code>`;
  const where = pages.length
    ? `${selector} on ${link(pages[0].url!, pages[0].pageTitle || pages[0].url!)}${pages.length > 1 ? ` and ${plural(pages.length - 1, "more page")}` : ""}`
    : `${selector} in ${escapeHtml(locationText(finding))}`;
  const changes = finding.remediationGuidance?.change.length ? finding.remediationGuidance.change : [finding.remediation];
  const suggestion = finding.codeSuggestion;
  const lead = suggestion ? `<p class="lead-fix">${technicalText(suggestion.title)}</p>` : "";
  const why = suggestion ? `${suggestion.reviewRequired ? "Review required. " : ""}${changes.includes(suggestion.rationale) ? "" : suggestion.rationale}` : "";
  const suggested = suggestion
    ? `${why ? `<p class="note">${technicalText(why)}</p>` : ""}${suggestion.alternatives?.length ? `<p class="note">Other valid approach</p>${list("ul", suggestion.alternatives)}` : ""}`
    : "";
  const context = finding.renderedHtmlContext ?? { html: finding.evidence, scope: "element" as const, truncated: false };
  const contextLabel = `Original browser HTML · ${context.scope === "parent" ? "affected element and parent" : "affected element"}${context.truncated ? " · truncated, inspect the selector for the full DOM" : ""}`;
  const header = [
    finding.wcagLevel ? `WCAG Level ${finding.wcagLevel}` : "",
    finding.issueCategory ?? findingIssueCategory(finding),
    finding.scope === "common" ? `Recurring ${(finding.componentCategory ?? findingComponentCategory(finding)).toLowerCase()}` : "",
    finding.kind === "automatic" ? "Automated finding" : "Manual review",
  ].filter(Boolean).join(" · ");
  const inspect = (finding.remediationGuidance?.inspect ?? []).filter((item) => !item.startsWith("Failed condition:"));
  const references = [
    ...finding.wcag.map((criterion) => `<li>${wcagLink(criterion)} — W3C Understanding guidance</li>`),
    finding.helpUrl ? `<li>${link(finding.helpUrl, "axe scanner rule details (Deque)")}</li>` : "",
  ].join("");
  const prompt = finding.remediationPrompt ?? buildRemediationPrompt({ ...finding, issueCategory: finding.issueCategory ?? findingIssueCategory(finding) });
  const extra = [
    inspect.length ? more("What to inspect", list("ul", inspect)) : "",
    more("Why this was flagged", `<p>${technicalText(finding.explanation)}</p><p class="muted">Detected by rule <code>${escapeHtml(finding.ruleId)}</code> · ${capitalize(finding.confidence)} confidence · human verification still required</p>`),
    pages.length > 1 ? more(`Affected pages (${pages.length})`, `<p class="muted">Same issue on ${pages.length} tested pages (${findingOccurrenceCount(finding)} total occurrences). Retest each one after the fix.</p><ul>${pages.map((page) => `<li>${link(page.url!, page.pageTitle || page.url!)}${page.pageTitle ? ` <span class="muted">${escapeHtml(page.url!)}</span>` : ""}</li>`).join("")}</ul>`) : "",
    more("How to verify the fix", list("ol", finding.remediationGuidance?.verify.length ? finding.remediationGuidance.verify : DEFAULT_VERIFY)),
    references ? more("Standards and references", `<ul>${references}</ul>`) : "",
    promptHtml("AI remediation prompt", prompt, "Paste into a coding agent."),
  ].join("");

  return `<article class="finding ${finding.severity}" id="finding-${finding.fingerprint}" data-severity="${finding.severity}" data-level="${escapeHtml(finding.wcagLevel ?? "")}" data-disposition="${review.disposition}">
    <p class="meta"><span class="pill">${finding.severity}</span>${escapeHtml(header)}</p>
    <h2>${technicalText(finding.title)}</h2>
    <p class="where">Review disposition: <strong>${findingDispositionLabels[review.disposition]}</strong></p>${review.notes ? `<p class="review-notes">${escapeHtml(review.notes)}</p>` : ""}
    <p class="where">${where}</p>${finding.location.interactionState ? `<p class="note">${escapeHtml(stateText(finding.location))}</p>` : ""}
    ${failureHtml(failedConditions(finding), "Failed condition")}
    <h3>What to change</h3>${lead}${list("ul", changes)}${finding.safeFix ? `<p class="note">Safe automated fix available: ${escapeHtml(finding.safeFix.description)}</p>` : ""}${suggested}
    ${contrastHtml(finding)}
    <h3>Rendered HTML context</h3>${codeBlock(contextLabel, context.html)}<p class="note">This is what the browser rendered. Make the fix in your source, not here.</p>
    ${shotHtml(finding)}
    <div class="more-list">${extra}</div>
  </article>`;
}

function manualChecklistHtml(result: ScanResult): string {
  const checks = result.manualChecks?.length ? result.manualChecks : manualReviewChecklist(result.metadata.wcagLevel ?? "AA");
  const reviews = result.review?.manualTasks ?? {};
  const labels = { "not-tested": "Not tested", pass: "Pass", "needs-attention": "Needs attention", "not-applicable": "Not applicable" } as const;
  const counts = { "not-tested": 0, pass: 0, "needs-attention": 0, "not-applicable": 0 };
  checks.forEach((check) => counts[reviews[check.id]?.status ?? "not-tested"]++);
  const runNotes = result.review?.notes ? `<p class="where">Run-level reviewer notes</p><p class="review-notes">${escapeHtml(result.review.notes)}</p>` : "";
  return `<section aria-labelledby="manual-review-heading"><h2 class="section-title" id="manual-review-heading">Manual accessibility review record</h2><p>Required human review: automated tools cannot check these. <strong id="manual-progress">${counts.pass} pass · ${counts["needs-attention"]} need attention · ${counts["not-tested"]} not tested · ${counts["not-applicable"]} not applicable</strong></p>${runNotes}${checks.map((check) => {
    const review = reviews[check.id] ?? { status: "not-tested" as const, notes: "" };
    return `<div class="check"><p class="meta"><strong>${labels[review.status]}</strong> · ${escapeHtml(check.category)} · WCAG Level ${escapeHtml(check.wcagLevel)}</p><h3>${escapeHtml(check.title)}</h3><p>${escapeHtml(check.description)}</p>${review.notes ? `<p class="review-notes">${escapeHtml(review.notes)}</p>` : ""}${list("ol", check.steps)}<p class="note">${check.wcag.map(wcagLink).join(" · ")}</p></div>`;
  }).join("")}</section>`;
}

function componentGroupsHtml(result: ScanResult, groups: FindingGroup[]): string {
  if (!groups.length) return "";
  const byFingerprint = new Map(result.findings.map((finding) => [finding.fingerprint, finding]));
  const membersOf = (fingerprints: string[]): Finding[] => fingerprints.map((fingerprint) => byFingerprint.get(fingerprint)).filter((finding): finding is Finding => Boolean(finding));
  const worst = (members: Finding[]): Severity => members.reduce<Severity>((current, finding) => (severityRank[finding.severity] > severityRank[current] ? finding.severity : current), "minor");
  return `<section aria-labelledby="components-heading"><h2 class="section-title" id="components-heading">Components and issue patterns</h2><p>Fix the shared cause once, then check each element.</p>${groups.map((group) => {
    const members = membersOf(group.findingFingerprints);
    const clusters = group.issueClusters?.length ? group.issueClusters : buildFindingIssueClusters(members);
    const corrections = clusters.length > 1 ? group.sharedCorrections.filter((correction) => correction.appliesTo > 1) : [];
    const issueSets = clusters.map((cluster) => {
      const elements = membersOf(cluster.findingFingerprints);
      if (!elements.length) return "";
      const target = cluster.remediationTarget ?? (cluster.ruleId === "aria-required-parent" ? group.remediationTarget : undefined);
      const owner = target
        ? `<span class="label">Likely shared owner</span><p class="where"><code>${escapeHtml(target.selector)}</code> · Current role: ${escapeHtml(target.currentRole ?? "No explicit role")} · Expected parent roles: ${target.suggestedRoles.map((role) => `<code>${escapeHtml(role)}</code>`).join(" ")}</p><p class="note">${escapeHtml(target.reason)}</p>${codeBlock("Owner markup", target.html)}`
        : "";
      return `<details class="child ${worst(elements)}"><summary><span class="dot"></span><span class="row-main"><span class="row-title">${technicalText(cluster.name)}</span><span class="row-meta">${escapeHtml([findingMeta(elements[0], result), plural(elements.length, "element"), plural(cluster.pages.length, "page")].join(" · "))}</span></span></summary><div class="child-body ${worst(elements)}">${failureHtml(elements.length === 1 ? failedConditions(elements[0]) : [cluster.failedCondition], elements.length > 1 ? "Shared failure" : "Failed condition")}<span class="label">What to change</span>${cluster.parentResolution ? `<p>${technicalText(cluster.parentResolution)}</p>` : ""}<p>${technicalText(cluster.recommendedAction)}</p>${owner}<span class="label">Affected elements (${elements.length})</span><ul>${elements.map((finding) => `<li><a href="#finding-${finding.fingerprint}"><code>${escapeHtml(finding.location.selector || finding.ruleId)}</code></a>${finding.location.url ? ` on ${link(finding.location.url, finding.location.pageTitle || finding.location.url)}` : ""}</li>`).join("")}</ul></div></details>`;
    }).join("");
    const prompt = group.remediationPrompt ?? buildGroupRemediationPrompt(group, members);
    return `<article class="finding ${worst(members)}"><p class="meta"><span class="pill">${worst(members)}</span>${escapeHtml([group.kind === "pattern" ? "Issue pattern" : "Component", group.category, plural(clusters.length, "issue"), plural(members.length, "element"), plural(group.pages.length, "page")].join(" · "))}</p><h3 class="group-name">${escapeHtml(group.name)}</h3>${group.selector && group.kind !== "pattern" ? `<p class="where">Component selector <code>${escapeHtml(group.selector)}</code></p>` : ""}${corrections.length ? `<h4>Corrections shared by multiple findings</h4><ul>${corrections.map((correction) => `<li>${technicalText(correction.text)}${correction.appliesTo < members.length ? ` <span class="muted">Applies to ${correction.appliesTo} of ${members.length} findings.</span>` : ""}</li>`).join("")}</ul>` : ""}<h4>Issue sets and affected elements</h4>${issueSets}<div class="more-list">${promptHtml("Combined AI remediation prompt", prompt, "One prompt covers every finding in this group.")}</div></article>`;
  }).join("")}</section>`;
}

// Severity is the only filter. Chips carry their own counts, and severities with no findings are left out.
function filtersHtml(result: ScanResult): string {
  const findings = result.findings;
  if (!findings.length) return "";
  const chip = (kind: string, value: string, label: string, count: number): string => `<button class="chip" type="button" data-${kind}-filter="${value}" aria-pressed="${value === "all"}">${label} <span class="count">${count}</span></button>`;
  const row = (kind: string, label: string, allLabel: string, options: Array<[string, string]>, key: (finding: Finding) => string | undefined, required = false): string => {
    const present = options.map(([value, text]) => [value, text, findings.filter((finding) => key(finding) === value).length] as const).filter(([, , count]) => count);
    if (!required && present.length < 2) return "";
    return `<div class="chips" role="group" aria-label="${label}">${chip(kind, "all", allLabel, findings.length)}${present.map(([value, text, count]) => chip(kind, value, text, count)).join("")}</div>`;
  };
  return `<div class="filters">${row("severity", "Impact severity", "All", [["critical", "Critical"], ["serious", "Serious"], ["moderate", "Moderate"], ["minor", "Minor"]], (finding) => finding.severity, true)}</div>`;
}

export function htmlReport(result: ScanResult): string {
  const metadata = result.metadata;
  const occurrences = metadata.findingOccurrences ?? result.findings.length;
  const skippedStates = metadata.interactionStateFailures?.length ?? 0;
  const count = (value: number, one: string, many: string): string => `<strong>${value}</strong> ${value === 1 ? one : many}`;
  const totals = [
    metadata.scanner === "repository" ? count(metadata.pagesOrFilesScanned, "file scanned", "files scanned") : count(metadata.pagesOrFilesScanned, "page tested", "pages tested"),
    metadata.incomplete?.length ? count(metadata.incomplete.length, "page failed", "pages failed") : "",
    count(result.findings.length, "unique finding", "unique findings"),
    count(occurrences, "occurrence", "occurrences"),
    metadata.interactionStatesRequested || metadata.interactionStatesScanned ? `${count(metadata.interactionStatesScanned ?? 0, "interactive state opened", "interactive states opened")}${metadata.interactionStateCounts ? ` (${escapeHtml(interactionSummary(result).replace(/^.*?: /, ""))})` : ""}` : "",
    skippedStates ? count(skippedStates, "state skipped", "states skipped") : "",
    wcagTargetText(result) ? escapeHtml(wcagTargetText(result)!) : "",
    `Generated ${escapeHtml(metadata.completedAt)}`,
  ].filter(Boolean).join(" · ");
  const reviewCounts = result.findings.reduce<Record<string, number>>((summary, finding) => {
    const disposition = findingReviewFor(result, finding).disposition;
    return { ...summary, [disposition]: (summary[disposition] ?? 0) + 1 };
  }, {});
  const reviewSummary = Object.entries(findingDispositionLabels).filter(([value]) => reviewCounts[value]).map(([value, label]) => `${reviewCounts[value]} ${label.toLowerCase()}`).join(" · ");
  const incomplete = metadata.incomplete?.length
    ? `<div class="incomplete"><strong>Incomplete pages</strong><ul>${metadata.incomplete.map((item) => `<li>${link(item.url, item.url)} — ${escapeHtml(incompleteDetail(item))}</li>`).join("")}</ul></div>`
    : "";
  const interactionFailures = metadata.interactionStateFailures?.length
    ? `<div class="incomplete"><strong>Interactive states skipped</strong><p>These could not be opened and restored safely. Check them by hand.</p><ul>${metadata.interactionStateFailures.map((item) => `<li>${link(item.url, item.url)} — ${interactionTypeLabel(item.type)} “${escapeHtml(item.name)}” <code>${escapeHtml(item.trigger)}</code>: ${escapeHtml(item.reason)}</li>`).join("")}</ul></div>`
    : "";
  const skippedAssets = metadata.skippedAssets?.length
    ? `<details class="incomplete"><summary>Skipped non-HTML assets · ${metadata.skippedAssets.length}</summary><p>Not HTML, so not scanned. PDFs and downloads need their own review.</p><ul>${metadata.skippedAssets.map((item) => `<li>${link(item.url, item.url)} — ${escapeHtml(item.reason)}</li>`).join("")}</ul></details>`
    : "";
  const groups = result.findingGroups?.length ? result.findingGroups : buildFindingGroups(result.findings);
  const findingIndex = result.findings.length
    ? `<ol class="index">${result.findings.map((finding) => `<li class="${finding.severity}" data-severity="${finding.severity}" data-level="${escapeHtml(finding.wcagLevel ?? "")}" data-disposition="${findingReviewFor(result, finding).disposition}"><a href="#finding-${finding.fingerprint}"><span class="dot"></span><span class="row-main"><span class="row-title">${technicalText(finding.title)}</span><span class="row-meta">${escapeHtml(findingMeta(finding, result))}</span></span></a></li>`).join("")}</ol>`
    : "<p>No automated findings were detected. Manual testing is still required.</p>";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light">
<title>Accessibility report</title>
<style>${sharedCss}${REPORT_CSS}</style></head>
<body class="detail">
<header class="report-head"><p class="muted">ADA Assistant · Accessibility report</p><h1>Findings in context</h1><p class="target">${metadata.target.startsWith("http") ? link(metadata.target, metadata.target) : escapeHtml(metadata.target)}</p><p>${totals}</p>${scanProfileText(result) ? `<p class="muted">Saved scan profile: ${escapeHtml(scanProfileText(result)!)}</p>` : ""}<p class="notice">${escapeHtml(result.notice)}</p></header>
${incomplete}
${interactionFailures}
${skippedAssets}
<main>
<section aria-labelledby="findings-heading"><h2 class="section-title" id="findings-heading">Findings</h2>${reviewSummary ? `<p>Automated finding review: ${reviewSummary}.</p>` : ""}${filtersHtml(result)}${findingIndex}</section>
${componentGroupsHtml(result, groups)}
${result.findings.map((finding) => findingCard(finding, result)).join("\n")}
${manualChecklistHtml(result)}
</main>
<dialog class="image-dialog" id="image-dialog" aria-labelledby="dialog-title"><div class="dialog-bar"><strong id="dialog-title">Visual evidence</strong><button class="btn" id="dialog-close" type="button">Close</button></div><img id="dialog-image" alt=""></dialog>
<script>
const dialog=document.getElementById('image-dialog');const dialogImage=document.getElementById('dialog-image');
const active={severity:'all'};const kinds=Object.keys(active);
function applyFilters(){document.querySelectorAll('.finding[data-severity],.index li').forEach(item=>{item.classList.toggle('hidden',kinds.some(kind=>active[kind]!=='all'&&item.dataset[kind]!==active[kind]));});}
kinds.forEach(kind=>{const buttons=document.querySelectorAll('[data-'+kind+'-filter]');buttons.forEach(button=>button.addEventListener('click',()=>{active[kind]=button.dataset[kind+'Filter'];buttons.forEach(item=>item.setAttribute('aria-pressed',String(item===button)));applyFilters();}));});
document.querySelectorAll('.shot').forEach(button=>button.addEventListener('click',()=>{const image=button.querySelector('img');dialogImage.src=image.src;dialogImage.alt=image.alt;document.getElementById('dialog-title').textContent=button.getAttribute('aria-label');dialog.showModal();}));
document.getElementById('dialog-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
document.querySelectorAll('[data-copy]').forEach(button=>button.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(button.previousElementSibling.textContent);button.textContent='Copied';}catch{button.textContent='Copy failed. Select the prompt text instead.';}setTimeout(()=>{button.textContent='Copy AI prompt';},1600);}));
// Collapsed sections would be left out of a printout, so open them all before printing.
window.addEventListener('beforeprint',()=>document.querySelectorAll('details').forEach(item=>{item.open=true;}));
</script></body></html>`;
}

export function sarifReport(result: ScanResult): string {
  const uniqueRules = new Map(result.findings.map((finding) => [finding.ruleId, finding]));
  const level: Record<Severity, "error" | "warning" | "note"> = {
    critical: "error",
    serious: "error",
    moderate: "warning",
    minor: "note",
  };
  return JSON.stringify(
    {
      $schema: "https://json.schemastore.org/sarif-2.1.0.json",
      version: "2.1.0",
      runs: [
        {
          tool: {
            driver: {
              name: "ada-assistant",
              version: result.metadata.toolVersion,
              rules: [...uniqueRules.values()].map((finding) => ({
                id: finding.ruleId,
                shortDescription: { text: finding.title },
                help: { text: finding.remediation },
              })),
            },
          },
          results: result.findings.map((finding) => ({
            ruleId: finding.ruleId,
            level: level[finding.severity],
            message: { text: `${finding.explanation} ${finding.remediation}` },
            locations: (finding.occurrences ?? [{ fingerprint: finding.fingerprint, location: finding.location }]).map((occurrence) => ({
                physicalLocation: {
                  artifactLocation: { uri: occurrence.location.file ?? occurrence.location.url ?? "unknown" },
                  region: occurrence.location.line
                    ? { startLine: occurrence.location.line, startColumn: occurrence.location.column ?? 1 }
                    : undefined,
                },
                logicalLocations: occurrence.location.selector ? [{ name: occurrence.location.selector }] : undefined,
              })),
            partialFingerprints: { primaryLocationLineHash: finding.fingerprint },
          })),
        },
      ],
    },
    null,
    2,
  );
}

export function renderReport(result: ScanResult, format: ReportFormat): string {
  if (format === "json") return jsonReport(result);
  if (format === "html") return htmlReport(result);
  if (format === "sarif") return sarifReport(result);
  return terminalReport(result);
}

export async function writeReport(content: string, output?: string): Promise<void> {
  if (!output) {
    process.stdout.write(`${content}\n`);
    return;
  }
  const absolute = path.resolve(output);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, content, "utf8");
  process.stdout.write(`Report written to ${absolute}\n`);
}
