import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Finding, ScanResult, Severity } from "../types.js";
import { escapeHtml, severityRank } from "../utils.js";
import { WCAG_VERSION, wcagCriterionLabel, wcagUnderstandingUrl } from "../wcag.js";
import { manualReviewChecklist } from "../manual.js";
import { affectedPageCount, buildFindingGroups, findingComponentCategory, findingOccurrenceCount } from "../findings.js";
import { buildGroupRemediationPrompt, buildRemediationPrompt, findingIssueCategory } from "../guidance.js";

export type ReportFormat = "terminal" | "json" | "html" | "sarif";

function locationText(finding: Finding): string {
  const location = finding.location;
  const state = location.interactionState ? ` — after opening ${location.interactionState}` : "";
  if (location.file) return `${location.file}${location.line ? `:${location.line}:${location.column ?? 1}` : ""}${state}`;
  return `${location.url ?? "unknown"}${location.selector ? ` (${location.selector})` : ""}${state}`;
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
  return `${profile.crawl ? `Crawl up to ${profile.maxPages} pages` : "Single page"}; screenshots ${profile.captureScreenshots ? "on" : "off"}; disclosure states ${profile.interactionStates ? "on" : "off"}; ${profile.authentication === "storage-state" ? "authenticated session" : "public session"}`;
}

function findingLevelBadge(finding: Finding): string {
  if (!finding.wcagLevel) return "";
  const level = escapeHtml(finding.wcagLevel);
  return `<span class="wcag-level-badge level-${level.toLowerCase()}" aria-label="WCAG Level ${level}" title="WCAG Level ${level}">${level}</span>`;
}

function recurringFindingBadges(finding: Finding): string {
  if (finding.scope !== "common") return "";
  const category = escapeHtml(finding.componentCategory ?? findingComponentCategory(finding));
  return `<span class="component-badge">${category}</span><span class="page-count-badge">${affectedPageCount(finding)} PAGES</span>`;
}

function issueCategoryBadge(finding: Finding): string {
  const category = finding.issueCategory ?? findingIssueCategory(finding);
  return `<span class="issue-category-badge category-${category.toLowerCase()}" aria-label="Issue category: ${escapeHtml(category)}">${escapeHtml(category)}</span>`;
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
    ...(result.metadata.interactionStatesScanned ? [`Disclosure states opened: ${result.metadata.interactionStatesScanned}`] : []),
    ...(wcagTargetText(result) ? [`Conformance target: ${wcagTargetText(result)}`] : []),
    ...(scanProfileText(result) ? [`Scan profile: ${scanProfileText(result)}`] : []),
    `Critical ${counts.critical} | Serious ${counts.serious} | Moderate ${counts.moderate} | Minor ${counts.minor}`,
    "",
  ];
  const componentGroups = result.findingGroups?.length ? result.findingGroups : buildFindingGroups(result.findings);
  if (componentGroups.length) {
    lines.push("Finding groups:");
    for (const group of componentGroups) {
      lines.push(`  ${group.kind === "pattern" ? "Issue pattern" : "Component"} — ${group.name}: ${group.findingFingerprints.length} findings / ${group.pages.length} pages / ${group.sharedCorrections.length} shared corrections`);
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
  lines.push(result.notice);
  return lines.filter((line, index, array) => line !== "" || array[index - 1] !== "").join("\n");
}

export function jsonReport(result: ScanResult): string {
  return JSON.stringify(result, null, 2);
}

function remediationGuidanceHtml(finding: Finding): string {
  const guidance = finding.remediationGuidance;
  if (!guidance) return `<p>${escapeHtml(finding.remediation)}</p>`;
  const list = (items: string[]): string => `<ul>${items.map((item) => `<li>${technicalText(item)}</li>`).join("")}</ul>`;
  const failedCondition = guidance.inspect.find((item) => item.startsWith("Failed condition:"))?.replace(/^Failed condition:\s*/, "") ?? finding.impact;
  const roleValues = failedCondition.match(/ARIA parents? role not present:\s*(.+)$/i)?.[1].split(",").map((item) => item.trim()).filter(Boolean) ?? [];
  const expectedRoles = roleValues.length ? `<div class="technical-values"><span>Expected parent roles</span>${roleValues.map((value) => `<code>role=&quot;${escapeHtml(value)}&quot;</code>`).join("")}</div>` : "";
  return `<div class="remediation-start"><span class="remediation-eyebrow">Start here</span><span class="remediation-step-label">Failed condition</span><p>${technicalText(failedCondition)}</p>${expectedRoles}</div><div class="remediation-grid"><div class="remediation-card"><h4>What to inspect</h4>${list(guidance.inspect)}</div><div class="remediation-card"><h4>What to change</h4>${list(guidance.change)}</div></div>`;
}

function findingCard(finding: Finding, result: ScanResult): string {
  const findingReview = findingReviewFor(result, finding);
  const wcag = finding.wcag.length ? finding.wcag.join(", ") : "Not mapped";
  const wcagLinks = finding.wcag.length
    ? `<div class="wcag-links">${finding.wcag.map((criterion) => `<a href="${wcagUnderstandingUrl(criterion)}" target="_blank" rel="noopener noreferrer">${escapeHtml(wcagCriterionLabel(criterion))}</a>`).join("")}</div>`
    : `<strong>Not mapped</strong>`;
  const source = finding.location.url
    ? `<div class="location-card"><span class="meta-label">Source page</span><a class="location-link" href="${escapeHtml(finding.location.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(finding.location.pageTitle || "Open the affected page")}</a><a class="source-url" href="${escapeHtml(finding.location.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(finding.location.url)}</a></div>`
    : `<div class="location-card"><span class="meta-label">Source file</span><strong>${escapeHtml(locationText(finding))}</strong></div>`;
  const selector = `<div class="location-card"><span class="meta-label">Affected element</span><code class="selector">${escapeHtml(finding.location.selector || "No CSS selector was reported")}</code><p class="meta-help">Use this selector to locate the element in browser developer tools.</p></div>`;
  const interactionState = finding.location.interactionState
    ? `<div class="location-card"><span class="meta-label">Revealed interaction state</span><strong>${escapeHtml(finding.location.interactionState)}</strong>${finding.location.interactionTrigger ? `<code class="selector">${escapeHtml(finding.location.interactionTrigger)}</code>` : ""}<p class="meta-help">This issue appeared only after the scanner opened this disclosure control. Reproduce the state before verifying the fix.</p></div>`
    : "";
  const affectedPages = finding.scope === "common" && finding.occurrences
    ? `<section class="report-section common-pages"><h3>Affected pages</h3><p>This recurring ${escapeHtml((finding.componentCategory ?? findingComponentCategory(finding)).toLowerCase())} issue has the same rule, selector, and detected markup on ${affectedPageCount(finding)} tested pages (${findingOccurrenceCount(finding)} total occurrences). Fix the shared component once, then retest every listed page.</p><ul>${[...new Map(finding.occurrences.filter((item) => item.location.url).map((item) => [item.location.url!, item.location])).values()].map((location) => `<li><a href="${escapeHtml(location.url!)}" target="_blank" rel="noopener noreferrer">${escapeHtml(location.pageTitle || location.url!)}</a><span>${escapeHtml(location.url!)}</span></li>`).join("")}</ul></section>`
    : "";
  const screenshot = finding.screenshot?.dataUrl.startsWith("data:image/")
    ? `<section class="report-section"><h3>Visual evidence</h3><p>The affected element is outlined in charcoal. Select the thumbnail to inspect the full viewport capture.</p><figure><button class="report-shot" type="button" aria-label="Open larger screenshot for ${escapeHtml(finding.title)}"><img src="${finding.screenshot.dataUrl}" alt="${escapeHtml(finding.screenshot.description)}" loading="lazy"><span>Open large screenshot</span></button><figcaption>${escapeHtml(finding.screenshot.description)}</figcaption></figure></section>`
    : "";
  const contrast = finding.contrast
    ? `<section class="report-section contrast-section"><h3>Color contrast evidence</h3><div class="contrast-grid"><div><span class="meta-label">Foreground</span><code>${escapeHtml(finding.contrast.foreground)}</code></div><div><span class="meta-label">Background</span><code>${escapeHtml(finding.contrast.background)}</code></div><div><span class="meta-label">Measured ratio</span><strong>${finding.contrast.ratio ? `${finding.contrast.ratio}:1` : "Not reported"}</strong></div><div><span class="meta-label">Required ratio</span><strong>${finding.contrast.requiredRatio ? `${finding.contrast.requiredRatio}:1` : "Verify manually"}</strong></div><div><span class="meta-label">Font</span><span>${escapeHtml([finding.contrast.fontSize, finding.contrast.fontWeight].filter(Boolean).join(" · ") || "Not reported")}</span></div></div><p class="meta-help">Verify the final colors in default, hover, focus, active, disabled, error, and visited states.</p></section>`
    : "";
  const renderedContext = finding.renderedHtmlContext ?? { html: finding.evidence, scope: "element" as const, truncated: false };
  const contextDescription = renderedContext.scope === "parent"
    ? "Complete rendered parent HTML captured around the affected element. This is browser output and may have been generated by a framework, CMS, template, or component."
    : "Rendered HTML for the affected element. A complete parent block was not safely available, so review the selector in browser developer tools for additional surrounding structure.";
  const contextTruncation = renderedContext.truncated ? `<p class="meta-help">The captured element exceeded the report limit and was truncated. Use the affected selector to inspect the complete browser DOM.</p>` : "";
  const renderedHtml = `<section class="report-section rendered-context"><h3>Rendered HTML context</h3><p>${contextDescription}</p><span class="code-label">Original browser HTML · ${renderedContext.scope === "parent" ? "affected element and parent" : "affected element"}</span><pre tabindex="0">${escapeHtml(renderedContext.html)}</pre>${contextTruncation}</section>`;
  const suggestedChange = finding.codeSuggestion
    ? `<section class="report-section"><h3>Suggested change</h3><h4>${escapeHtml(finding.codeSuggestion.title)}</h4><p class="review-note">${finding.codeSuggestion.reviewRequired ? "Review required: " : ""}${escapeHtml(finding.codeSuggestion.rationale)}</p>${finding.codeSuggestion.alternatives?.length ? `<p><strong>Other valid approach</strong></p><ul>${finding.codeSuggestion.alternatives.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}<p class="meta-help">Apply this direction in the maintained source that produces the rendered HTML, then inspect the resulting DOM and retest. It is not a generated replacement block.</p></section>`
    : `<section class="report-section"><h3>Suggested change</h3><p class="review-note">No context-safe automatic edit is available for this rule. Use the exact failed condition and change checklist above, locate the maintained source, and verify the resulting rendered HTML.</p></section>`;
  const rule = `<code>${escapeHtml(finding.ruleId)}</code>${finding.helpUrl ? `<a class="scanner-link" href="${escapeHtml(finding.helpUrl)}" target="_blank" rel="noopener noreferrer">View axe scanner rule details (Deque)</a>` : ""}`;
  const references = [
    ...finding.wcag.map(
      (criterion) => `<li><a href="${wcagUnderstandingUrl(criterion)}" target="_blank" rel="noopener noreferrer">${escapeHtml(wcagCriterionLabel(criterion))} — W3C Understanding guidance</a></li>`,
    ),
    finding.location.url
      ? `<li><a href="${escapeHtml(finding.location.url)}" target="_blank" rel="noopener noreferrer">Open the affected source page</a></li>`
      : "",
    finding.helpUrl
      ? `<li><a href="${escapeHtml(finding.helpUrl)}" target="_blank" rel="noopener noreferrer">View axe scanner rule details on Deque</a></li>`
      : "",
  ].join("");
  const remediationPrompt = finding.remediationPrompt ?? buildRemediationPrompt({ ...finding, issueCategory: finding.issueCategory ?? findingIssueCategory(finding) });
  return `<article class="finding" id="finding-${finding.fingerprint}" data-severity="${finding.severity}" data-level="${escapeHtml(finding.wcagLevel ?? "")}" data-disposition="${findingReview.disposition}">
    <header class="finding-header"><div class="finding-kicker"><span class="badge ${finding.severity}">${finding.severity}</span>${findingLevelBadge(finding)}${issueCategoryBadge(finding)}${recurringFindingBadges(finding)}<span class="finding-review-status ${findingReview.disposition}">${findingDispositionLabels[findingReview.disposition]}</span><span>${finding.kind === "automatic" ? "Automated finding" : "Manual review"} · ${escapeHtml(finding.confidence)} confidence</span></div><h2>${technicalText(finding.title)}</h2></header>
    <section class="report-section finding-review-record"><h3>Automated finding review</h3><p><span class="finding-review-status ${findingReview.disposition}">${findingDispositionLabels[findingReview.disposition]}</span></p>${findingReview.notes ? `<div class="finding-review-notes"><span class="meta-label">Reviewer notes</span><p>${escapeHtml(findingReview.notes)}</p></div>` : `<p class="meta-help">No reviewer notes were recorded for this finding.</p>`}<p class="meta-help">This human disposition does not change the scan-derived New, Existing, or Resolved status.</p></section>
    <section class="report-section"><h3>Finding summary</h3><div class="meta-grid"><div class="meta-card"><span class="meta-label">Priority</span><strong>${escapeHtml(finding.severity)}</strong><p class="meta-help">Review this finding according to its severity and user impact.</p></div><div class="meta-card standards-card"><span class="meta-label">WCAG 2.2 requirements — W3C</span>${wcagLinks}<p class="meta-help">Each section opens its exact W3C Understanding guidance page. Reported mapping: ${escapeHtml(wcag)}.</p></div><div class="meta-card"><span class="meta-label">Automated scanner check</span>${rule}<p class="meta-help">The rule ID comes from axe-core; Deque documentation describes how the scanner detected it.</p></div><div class="meta-card"><span class="meta-label">Detection confidence</span><strong>${escapeHtml(finding.confidence)}</strong><p class="meta-help">Human verification is still required.</p></div></div></section>
    <section class="report-section"><h3>Where it was found</h3><div class="location-grid">${source}${selector}${interactionState}</div></section>
    ${affectedPages}
    ${contrast}
    ${screenshot}
    <section class="report-section"><h3>Why this was flagged</h3><h4>Rule purpose</h4><p>${escapeHtml(finding.explanation)}</p><h4>Failed check</h4><p>${escapeHtml(finding.impact)}</p></section>
    <section class="report-section"><h3>Recommended fix</h3>${remediationGuidanceHtml(finding)}${finding.safeFix ? `<p class="safe-fix">Safe automated fix available: ${escapeHtml(finding.safeFix.description)}</p>` : ""}</section>
    ${renderedHtml}
    ${suggestedChange}
    <section class="report-section agent-prompt-section"><h3>AI remediation prompt</h3><p>Copy this prompt into a coding agent. It asks the agent to identify the site technology before changing the maintained source.</p><pre tabindex="0">${escapeHtml(remediationPrompt)}</pre></section>
    <section class="report-section"><h3>How to verify the fix</h3><ol>${(finding.remediationGuidance?.verify ?? ["Review the surrounding component so the change preserves the intended behavior.", "Test the affected element with a keyboard and the relevant assistive technology.", "Run the accessibility scan again and confirm the finding is gone without introducing a new issue."]).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>${references ? `<h4>References</h4><ul>${references}</ul>` : ""}</section>
  </article>`;
}

function findingReviewSummaryHtml(result: ScanResult): string {
  const counts = { unreviewed: 0, "action-required": 0, "accepted-risk": 0, "false-positive": 0 };
  result.findings.forEach((finding) => counts[findingReviewFor(result, finding).disposition]++);
  return `<section class="finding-review-summary" aria-labelledby="finding-review-summary-heading"><div><span class="eyebrow">Human triage</span><h2 id="finding-review-summary-heading">Automated finding review</h2><p>Review dispositions document decisions without changing scan-derived resolution status.</p></div><div class="finding-review-totals"><span class="finding-review-status unreviewed">${counts.unreviewed} Unreviewed</span><span class="finding-review-status action-required">${counts["action-required"]} Action required</span><span class="finding-review-status accepted-risk">${counts["accepted-risk"]} Accepted risk</span><span class="finding-review-status false-positive">${counts["false-positive"]} False positive</span></div></section>`;
}

function manualChecklistHtml(result: ScanResult): string {
  const checks = result.manualChecks?.length ? result.manualChecks : manualReviewChecklist(result.metadata.wcagLevel ?? "AA");
  const reviews = result.review?.manualTasks ?? {};
  const labels = { "not-tested": "Not tested", pass: "Pass", "needs-attention": "Needs attention", "not-applicable": "Not applicable" } as const;
  const counts = { "not-tested": 0, pass: 0, "needs-attention": 0, "not-applicable": 0 };
  checks.forEach((check) => counts[reviews[check.id]?.status ?? "not-tested"]++);
  const reviewerNotes = result.review?.notes
    ? `<div class="reviewer-notes"><span class="meta-label">Run-level reviewer notes</span><p>${escapeHtml(result.review.notes)}</p></div>`
    : "";
  return `<section class="manual-review" aria-labelledby="manual-review-heading"><div class="manual-heading"><div><span class="eyebrow">Required human review</span><h2 id="manual-review-heading">Manual accessibility review record</h2><p>Automated tools cannot determine these requirements reliably. Each task records a human outcome and supporting notes.</p></div><strong id="manual-progress">${counts.pass} pass · ${counts["needs-attention"]} need attention · ${counts["not-tested"]} not tested</strong></div><div class="manual-status-summary" aria-label="Manual review totals"><span class="manual-status pass">${counts.pass} Pass</span><span class="manual-status needs-attention">${counts["needs-attention"]} Needs attention</span><span class="manual-status not-tested">${counts["not-tested"]} Not tested</span><span class="manual-status not-applicable">${counts["not-applicable"]} Not applicable</span></div>${reviewerNotes}<ol class="manual-list">${checks.map((check) => { const review = reviews[check.id] ?? { status: "not-tested" as const, notes: "" }; return `<li class="manual-check"><div class="manual-check-heading"><span class="manual-status ${review.status}">${labels[review.status]}</span><strong>${escapeHtml(check.title)}</strong></div><p><span class="category">${escapeHtml(check.category)}</span> · WCAG ${escapeHtml(check.wcagLevel)}</p><p>${escapeHtml(check.description)}</p>${review.notes ? `<div class="manual-evidence"><span class="meta-label">Reviewer evidence and notes</span><p>${escapeHtml(review.notes)}</p></div>` : ""}<ol>${check.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol><div class="wcag-links">${check.wcag.map((criterion) => `<a href="${wcagUnderstandingUrl(criterion)}" target="_blank" rel="noopener noreferrer">${escapeHtml(wcagCriterionLabel(criterion))}</a>`).join("")}</div></li>`; }).join("")}</ol></section>`;
}

function componentGroupsHtml(result: ScanResult): string {
  const groups = result.findingGroups?.length ? result.findingGroups : buildFindingGroups(result.findings);
  if (!groups.length) return "";
  const findingByFingerprint = new Map(result.findings.map((finding) => [finding.fingerprint, finding]));
  return `<section class="component-groups" aria-labelledby="component-groups-heading"><div class="component-groups-heading"><div><span class="eyebrow">Related remediation work</span><h2 id="component-groups-heading">Components and issue patterns</h2><p>Each group combines findings that share an owning component or a concrete remediation theme.</p></div><strong>${groups.length} group${groups.length === 1 ? "" : "s"}</strong></div>${groups.map((group) => {
    const members = group.findingFingerprints.map((fingerprint) => findingByFingerprint.get(fingerprint)).filter((finding): finding is Finding => Boolean(finding));
    const prompt = group.remediationPrompt ?? buildGroupRemediationPrompt(group, members);
    const corrections = group.sharedCorrections.length
      ? `<div class="shared-corrections"><h4>Corrections shared by multiple findings</h4>${group.sharedCorrections.map((correction) => `<article><span class="applies-badge">APPLIES TO ${correction.appliesTo}</span><p>${technicalText(correction.text)}</p></article>`).join("")}</div>`
      : "";
    return `<article class="component-group-report"><div class="component-group-kicker"><span class="component-badge">${escapeHtml(group.kind === "pattern" ? "Issue pattern" : group.category)}</span><span class="group-count-badge">${members.length} FINDINGS</span><span class="page-count-badge">${group.pages.length} PAGE${group.pages.length === 1 ? "" : "S"}</span></div><h3>${escapeHtml(group.name)}</h3>${group.selector ? `<code class="selector">${escapeHtml(group.selector)}</code>` : ""}${corrections}<h4>Child findings</h4><ol>${members.map((finding) => `<li><a href="#finding-${finding.fingerprint}">${technicalText(finding.title)}</a><code>${escapeHtml(finding.location.selector || finding.ruleId)}</code></li>`).join("")}</ol><section class="agent-prompt-section"><h4>Combined AI remediation prompt</h4><p>Use one coordinated task for every child finding in this group.</p><pre tabindex="0">${escapeHtml(prompt)}</pre></section></article>`;
  }).join("")}</section>`;
}

export function htmlReport(result: ScanResult): string {
  const counts = result.findings.reduce<Record<Severity, number>>(
    (summary, finding) => ({ ...summary, [finding.severity]: summary[finding.severity] + 1 }),
    { critical: 0, serious: 0, moderate: 0, minor: 0 },
  );
  const incomplete = result.metadata.incomplete?.length
    ? `<section class="notice"><strong>Incomplete pages</strong><ul>${result.metadata.incomplete.map((item) => `<li><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.url)}</a> — ${escapeHtml(incompleteDetail(item))}</li>`).join("")}</ul></section>`
    : "";
  const findingIndex = result.findings.length
    ? `<nav class="finding-index" aria-label="Finding list"><h2>Finding list</h2><ol>${result.findings.map((finding) => { const review = findingReviewFor(result, finding); return `<li data-severity="${finding.severity}" data-level="${escapeHtml(finding.wcagLevel ?? "")}" data-disposition="${review.disposition}"><a href="#finding-${finding.fingerprint}"><span class="badge ${finding.severity}">${escapeHtml(finding.severity)}</span>${findingLevelBadge(finding)}${issueCategoryBadge(finding)}${recurringFindingBadges(finding)}<span class="finding-review-status ${review.disposition}">${findingDispositionLabels[review.disposition]}</span><span>${technicalText(finding.title)}</span></a></li>`; }).join("")}</ol></nav>`
    : "";
  const manualChecklist = manualChecklistHtml(result);
  const findingReviewSummary = findingReviewSummaryHtml(result);
  const componentGroups = componentGroupsHtml(result);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Accessibility report</title>
<style>
.remediation-start{border:1px solid var(--accent-blue);border-left:5px solid var(--accent-plum);border-radius:10px;background:linear-gradient(110deg,var(--accent-plum-soft),var(--accent-blue-soft));padding:16px 18px}.remediation-eyebrow{display:block;color:var(--accent-plum);font-size:.72rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px}.remediation-step-label{display:block;color:var(--muted);font-size:.78rem;font-weight:600;margin-bottom:4px}.remediation-start p{font-size:1.08rem;font-weight:600;margin:0}.technical-values{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:12px}.technical-values>span{font-size:.78rem;color:var(--muted);margin-right:2px}.technical-values code,html body .inline-code{display:inline-block;border:1px solid var(--accent-blue);border-radius:5px;background:var(--cream);color:var(--ink);padding:1px 5px;font-weight:600}.remediation-card h4{color:var(--accent-plum)}
.component-badge,.page-count-badge{display:inline-block;font-size:.72rem;font-weight:700;letter-spacing:.04em;padding:3px 8px;border-radius:9999px;color:var(--ink);white-space:nowrap}.component-badge{border:1px solid var(--accent-orange);background:var(--accent-orange-soft);text-transform:uppercase}.page-count-badge{border:1px solid var(--accent-blue);background:var(--accent-blue-soft)}.common-pages>p{color:rgba(28,28,28,.82)}.common-pages ul{display:grid;gap:8px;margin:0;padding:0;list-style:none}.common-pages li{border:1px solid var(--border);border-radius:8px;background:var(--accent-blue-soft);padding:11px 13px}.common-pages li a,.common-pages li span{display:block;overflow-wrap:anywhere}.common-pages li span{margin-top:4px;font-size:.82rem;color:var(--muted)}
.component-groups{border:1px solid var(--border);border-radius:16px;padding:24px;margin:32px 0;background:var(--accent-orange-soft)}.component-groups-heading{display:flex;justify-content:space-between;gap:20px;align-items:start}.component-groups-heading h2{margin:4px 0 6px}.component-groups-heading p{margin:0}.component-group-report{border-top:1px solid var(--border);padding-top:20px;margin-top:20px}.component-group-kicker{display:flex;gap:8px;flex-wrap:wrap}.group-count-badge,.applies-badge{display:inline-block;font-size:.72rem;font-weight:700;letter-spacing:.04em;padding:3px 8px;border:1px solid var(--accent-green);border-radius:9999px;background:var(--accent-green-soft);color:var(--ink)}.shared-corrections article{border:1px solid var(--accent-green);border-radius:8px;background:var(--accent-green-soft);padding:12px;margin-top:8px}.shared-corrections article p{margin:7px 0 0}.component-group-report>ol>li{margin:10px 0}.component-group-report>ol code{display:block;margin-top:3px;color:var(--muted)}
:root{--accent-plum:#ab307e;--accent-blue:#6495ed;--accent-green:#2f7d5a;--accent-orange:#9a4e12;--accent-plum-soft:rgba(171,48,126,.10);--accent-blue-soft:rgba(100,149,237,.14);--accent-green-soft:rgba(47,125,90,.12);--accent-orange-soft:rgba(154,78,18,.12)}
html body button:focus,html body a:focus{box-shadow:0 0 0 2px rgba(100,149,237,.68),rgba(0,0,0,.1) 0 4px 12px}.finding .badge.critical,.finding-index .badge.critical{background:var(--accent-plum)}.finding .badge.serious,.finding-index .badge.serious{background:var(--accent-orange);color:var(--off-white)}.finding .badge.moderate,.finding-index .badge.moderate{background:var(--accent-blue-soft);border:1px solid var(--accent-blue);color:var(--ink)}.wcag-level-badge{display:inline-block;font-size:.72rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em;padding:3px 8px;border:1px solid var(--accent-green);border-radius:9999px;color:var(--ink);background:var(--accent-green-soft);white-space:nowrap}.finding-kicker,.finding-index a{flex-wrap:wrap}.filter-groups{display:flex;align-items:start;gap:32px;flex-wrap:wrap;margin:32px 0 24px}.filter-group-label{display:block;font-size:.78rem;color:var(--muted);margin-bottom:6px}.filter-group .filters{margin:0}html body .level-filters button[aria-pressed=true]{background:var(--accent-green);border-color:var(--accent-green);color:var(--off-white)}.finding .report-section{position:relative;border-top:0;padding-top:32px;margin-top:32px}.finding .report-section::before{content:"";position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,var(--accent-plum) 0,var(--accent-blue) 32%,var(--border) 72%)}.finding .standards-card{background:var(--accent-blue-soft);border-color:var(--accent-blue)}.finding .wcag-links a{border-color:var(--accent-blue);background:var(--cream)}.contrast-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.contrast-grid>div{border:1px solid var(--border);border-radius:8px;background:var(--accent-blue-soft);padding:12px;min-width:0}.contrast-grid code{overflow-wrap:anywhere}.manual-review{border:1px solid var(--border);border-radius:16px;padding:24px;margin:32px 0;background:var(--accent-green-soft)}.manual-heading{display:flex;justify-content:space-between;gap:24px;align-items:start}.manual-heading h2{margin:4px 0 6px}.manual-heading p{margin:0;max-width:760px}.manual-list{padding-left:0;list-style:none}.manual-check{border-top:1px solid var(--border);padding:18px 0}.manual-check-heading{display:flex;gap:10px;align-items:center}.manual-check>p{margin:7px 0}.category{font-size:.72rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase}.manual-status-summary{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}.manual-status{display:inline-block;border:1px solid var(--border);border-radius:9999px;padding:3px 8px;font-size:.72rem;font-weight:700;letter-spacing:.03em;text-transform:uppercase;white-space:nowrap}.manual-status.pass{border-color:var(--accent-green);background:var(--accent-green-soft)}.manual-status.needs-attention{border-color:var(--accent-orange);background:var(--accent-orange-soft)}.manual-status.not-tested{border-color:var(--accent-plum);background:var(--accent-plum-soft)}.manual-status.not-applicable{border-color:var(--accent-blue);background:var(--accent-blue-soft)}.manual-evidence,.reviewer-notes{border:1px solid var(--accent-blue);border-radius:8px;background:var(--cream);padding:12px 14px;margin:12px 0}.manual-evidence p,.reviewer-notes p{margin:4px 0 0;white-space:pre-wrap}
.badge,.wcag-level-badge,.component-badge,.page-count-badge,.group-count-badge,.applies-badge,.todo-badge{font-size:.62rem;padding:2px 6px;line-height:1.25}.issue-category-badge{display:inline-block;border:1px solid var(--accent-blue);border-radius:9999px;background:var(--accent-blue-soft);color:var(--ink);font-size:.62rem;font-weight:700;letter-spacing:.04em;line-height:1.25;padding:2px 6px;text-transform:uppercase;white-space:nowrap}.issue-category-badge.category-color{border-color:var(--accent-plum);background:var(--accent-plum-soft)}.issue-category-badge.category-aria,.issue-category-badge.category-navigation{border-color:var(--accent-orange);background:var(--accent-orange-soft)}.issue-category-badge.category-structure,.issue-category-badge.category-keyboard,.issue-category-badge.category-forms{border-color:var(--accent-green);background:var(--accent-green-soft)}.agent-prompt-section{border:1px solid var(--accent-blue);border-left:5px solid var(--accent-plum);border-radius:10px;background:linear-gradient(120deg,var(--accent-plum-soft),var(--accent-blue-soft));padding:18px!important}.agent-prompt-section::before{display:none}.agent-prompt-section pre{max-height:420px}.finding-review-summary{display:flex;justify-content:space-between;gap:24px;align-items:center;border:1px solid var(--border);border-radius:16px;background:var(--accent-blue-soft);padding:20px;margin:32px 0}.finding-review-summary h2{margin:3px 0}.finding-review-summary p{margin:0}.finding-review-totals{display:flex;gap:7px;flex-wrap:wrap}.finding-review-status{display:inline-block;border:1px solid var(--border);border-radius:9999px;padding:2px 6px;font-size:.62rem;font-weight:700;letter-spacing:.03em;text-transform:uppercase;white-space:nowrap;color:var(--ink)}.finding-review-status.unreviewed{border-color:var(--ink-40);background:var(--ink-4)}.finding-review-status.action-required{border-color:var(--accent-orange);background:var(--accent-orange-soft)}.finding-review-status.accepted-risk{border-color:var(--accent-blue);background:var(--accent-blue-soft)}.finding-review-status.false-positive{border-color:var(--accent-green);background:var(--accent-green-soft)}.finding-review-notes{border:1px solid var(--accent-blue);border-radius:8px;background:var(--cream);padding:12px 14px}.finding-review-notes p{margin:4px 0 0;white-space:pre-wrap}
.filters button,.report-shot,.report-shot img,.dialog-close,.finding-index a,.target a,.location-link,.source-url,.scanner-link,.report-section a,.manual-review a,.manual-check label{transition:background-color .14s ease,border-color .14s ease,box-shadow .14s ease,transform .14s ease,text-decoration-thickness .14s ease,text-underline-offset .14s ease}@media(hover:hover){.filters button:hover:not([aria-pressed=true]),.dialog-close:hover{border-color:var(--accent-blue);background:var(--accent-blue-soft);box-shadow:0 2px 7px rgba(28,28,28,.08);transform:translateY(-1px)}.report-shot:hover{border-color:var(--accent-plum);box-shadow:0 4px 12px rgba(28,28,28,.12);transform:translateY(-1px)}.report-shot:hover img{transform:scale(1.01)}.finding-index a:hover,.target a:hover,.location-link:hover,.source-url:hover,.scanner-link:hover,.report-section a:hover,.manual-review a:hover{text-decoration-thickness:2px;text-underline-offset:3px}.wcag-links a:hover{border-color:var(--accent-blue);background:var(--accent-blue-soft)}.manual-check label:hover strong{text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:3px}}.filters button:active,.dialog-close:active{transform:translateY(0);box-shadow:none}@media(prefers-reduced-motion:reduce){.filters button,.report-shot,.report-shot img,.dialog-close,.finding-index a,.target a,.location-link,.source-url,.scanner-link,.report-section a,.manual-review a,.manual-check label{transition:none!important}.filters button:hover,.report-shot:hover,.report-shot:hover img,.dialog-close:hover{transform:none!important}}
:root{font-family:"Camera Plain Variable",ui-sans-serif,system-ui,sans-serif;color:#1c1c1c;background:#f7f4ed;line-height:1.5;--ink:#1c1c1c;--muted:#5f5f5d;--border:#eceae4;--cream:#f7f4ed;--off-white:#fcfbf8}*{box-sizing:border-box}html{scroll-behavior:smooth}body{max-width:1200px;margin:auto;padding:64px 24px 96px;background:var(--cream)}header{margin-bottom:48px}header .eyebrow{color:var(--muted);font-size:.875rem}h1{font-size:clamp(2.25rem,6vw,3.75rem);font-weight:600;line-height:1.03;letter-spacing:-1.5px;margin:.5rem 0 1rem}.target{font-size:1.13rem;color:rgba(28,28,28,.82);overflow-wrap:anywhere}.target a,.finding-index a,.location-link,.source-url,.scanner-link,.report-section a,.manual-review a{color:var(--ink);text-decoration:underline}.summary{display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:12px;margin:32px 0}.metric{border:1px solid var(--border);border-radius:12px;padding:18px;background:rgba(28,28,28,.03)}.metric strong{display:block;font-size:3rem;font-weight:600;letter-spacing:-1.2px;line-height:1}.metric span{color:var(--muted);font-size:.875rem}.notice{border:1px solid var(--border);padding:12px 15px;background:rgba(28,28,28,.03);border-radius:8px;color:rgba(28,28,28,.82)}.filters{display:flex;gap:8px;flex-wrap:wrap;margin:32px 0 24px}.filters button{padding:8px 16px;border:1px solid rgba(28,28,28,.4);background:transparent;color:var(--ink);border-radius:9999px;cursor:pointer;font:inherit}.filters button[aria-pressed=true]{background:var(--ink);color:var(--off-white)}button:focus,a:focus,input:focus{outline:0;box-shadow:0 0 0 2px rgba(59,130,246,.5),rgba(0,0,0,.1) 0 4px 12px}code,pre,.selector{font-family:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace}.inline-code{font-size:.92em;background:rgba(28,28,28,.04);border-radius:4px;padding:1px 4px}.finding-index{border:1px solid var(--border);border-radius:16px;padding:20px;margin:24px 0}.finding-index h2{font-size:1.25rem;font-weight:400;margin:0 0 12px}.finding-index ol{columns:2;column-gap:32px;margin:0;padding-left:24px}.finding-index li{break-inside:avoid;margin:8px 0}.finding-index a{display:inline-flex;align-items:center;gap:8px}.finding{border:1px solid var(--border);border-radius:12px;padding:24px;margin-bottom:24px;scroll-margin-top:16px}.finding-header{margin:0}.finding-kicker{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:.875rem;margin-bottom:10px}.finding h2{font-size:2.25rem;font-weight:600;line-height:1.08;letter-spacing:-.9px;margin:0}.finding h3{font-size:1.25rem;font-weight:400;margin:0 0 12px}.finding h4{font-size:1rem;font-weight:600;margin:16px 0 4px}.badge{font-size:.72rem;font-weight:600;text-transform:uppercase;padding:4px 8px;border-radius:9999px;color:var(--off-white);background:rgba(28,28,28,.4)}.badge.critical{background:var(--ink)}.badge.serious{background:rgba(28,28,28,.83)}.badge.moderate{background:rgba(28,28,28,.4);color:var(--ink)}.badge.minor{background:rgba(28,28,28,.04);color:var(--ink);border:1px solid var(--border)}.report-section{border-top:1px solid var(--border);padding-top:24px;margin-top:24px}.meta-grid,.location-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.meta-card,.location-card{border:1px solid var(--border);border-radius:8px;background:rgba(28,28,28,.03);padding:14px;min-width:0}.standards-card{border-color:rgba(28,28,28,.4)}.meta-label{display:block;font-size:.78rem;color:var(--muted);margin-bottom:5px}.meta-help{font-size:.82rem;color:var(--muted);margin:5px 0 0}.wcag-links{display:flex;gap:6px;flex-wrap:wrap}.wcag-links a{display:inline-block;border:1px solid rgba(28,28,28,.4);border-radius:9999px;padding:3px 9px;background:var(--cream)}.scanner-link{display:block;font-size:.82rem;margin-top:6px}.location-link,.source-url{display:block;overflow-wrap:anywhere}.source-url{font-size:.82rem;color:var(--muted);margin-top:5px}.selector{display:block;background:rgba(28,28,28,.04);padding:8px 10px;border-radius:6px;overflow-wrap:anywhere}pre{white-space:pre-wrap;background:var(--ink);color:var(--off-white);padding:14px;border-radius:8px;overflow:auto;font-size:.82rem}.review-note{border:1px solid var(--border);border-radius:8px;background:rgba(28,28,28,.03);padding:12px;color:rgba(28,28,28,.82)}.remediation-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}.remediation-card{border:1px solid var(--border);border-radius:8px;background:rgba(28,28,28,.03);padding:14px}.remediation-card h4{margin:0 0 8px}.remediation-card ul{margin:0;padding-left:20px}.remediation-card li{margin:7px 0}.code-compare{display:grid;grid-template-columns:1fr 1fr;gap:12px}.code-label{display:block;font-size:.8rem;color:var(--muted);margin-bottom:6px}.report-shot{display:block;width:min(100%,540px);border:1px solid var(--border);border-radius:12px;padding:0;background:transparent;overflow:hidden;cursor:zoom-in}.report-shot img{display:block;width:100%;height:auto;max-height:280px;object-fit:cover;object-position:top;border:0}.report-shot span{display:block;padding:8px;color:var(--muted)}figure{margin:14px 0 0}figcaption{font-size:.875rem;color:var(--muted);margin-top:8px;max-width:540px}.safe-fix{border-left:3px solid var(--ink);padding-left:.75rem}.image-dialog{width:min(96vw,1500px);max-width:none;border:1px solid var(--border);border-radius:16px;background:var(--cream);padding:14px}.image-dialog::backdrop{background:rgba(28,28,28,.78)}.dialog-bar{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:10px}.dialog-close{border:1px solid rgba(28,28,28,.4);border-radius:6px;background:transparent;padding:8px 16px;font:inherit}.image-dialog img{display:block;width:100%;max-height:86vh;object-fit:contain;border:1px solid var(--border);border-radius:12px}.hidden{display:none}@media(max-width:800px){.summary{grid-template-columns:repeat(2,1fr)}.meta-grid,.location-grid,.code-compare,.contrast-grid,.remediation-grid{grid-template-columns:1fr}.finding-index ol{columns:1}.manual-heading{display:block}}@media(max-width:600px){body{padding:40px 14px}h1,.finding h2{font-size:2.25rem;letter-spacing:-.9px}.metric strong{font-size:2.25rem}}</style></head>
<body><style>.summary{grid-template-columns:repeat(7,minmax(110px,1fr))}</style><header><div class="eyebrow">ADA Assistant · Accessibility report</div><h1>Findings in context.</h1><p class="target"><strong>Internet source:</strong> ${result.metadata.target.startsWith("http") ? `<a href="${escapeHtml(result.metadata.target)}" target="_blank" rel="noopener noreferrer">${escapeHtml(result.metadata.target)}</a>` : escapeHtml(result.metadata.target)}</p>${wcagTargetText(result) ? `<p><strong>Conformance target:</strong> ${escapeHtml(wcagTargetText(result)!)}</p>` : ""}${scanProfileText(result) ? `<p><strong>Saved scan profile:</strong> ${escapeHtml(scanProfileText(result)!)}</p>` : ""}<p>Scanned ${result.metadata.pagesOrFilesScanned} page(s) and opened ${result.metadata.interactionStatesScanned ?? 0} disclosure state(s). Generated ${escapeHtml(result.metadata.completedAt)}.</p></header>
<style>.badge,.wcag-level-badge,.component-badge,.page-count-badge,.group-count-badge,.applies-badge,.todo-badge{font-size:.62rem!important;padding:2px 6px!important;line-height:1.25}</style>
<section class="summary" aria-label="Finding totals"><div class="metric"><strong>${result.findings.length}</strong><span>Unique findings</span></div><div class="metric"><strong>${result.metadata.findingOccurrences ?? result.findings.length}</strong><span>Occurrences</span></div><div class="metric"><strong>${result.metadata.interactionStatesScanned ?? 0}</strong><span>States opened</span></div><div class="metric"><strong>${counts.critical}</strong><span>Critical</span></div><div class="metric"><strong>${counts.serious}</strong><span>Serious</span></div><div class="metric"><strong>${counts.moderate}</strong><span>Moderate</span></div><div class="metric"><strong>${counts.minor}</strong><span>Minor</span></div></section>
<p class="notice">${escapeHtml(result.notice)}</p>
${incomplete}
${findingReviewSummary}
${manualChecklist}
${componentGroups}
<div class="filter-groups"><div class="filter-group"><span class="filter-group-label" id="report-severity-label">Impact severity</span><nav class="filters" aria-labelledby="report-severity-label"><button data-severity-filter="all" aria-pressed="true">All</button><button data-severity-filter="critical" aria-pressed="false">Critical</button><button data-severity-filter="serious" aria-pressed="false">Serious</button><button data-severity-filter="moderate" aria-pressed="false">Moderate</button><button data-severity-filter="minor" aria-pressed="false">Minor</button></nav></div><div class="filter-group"><span class="filter-group-label" id="report-level-label">WCAG level</span><nav class="filters level-filters" aria-labelledby="report-level-label"><button data-level-filter="all" aria-pressed="true">All levels</button><button data-level-filter="A" aria-pressed="false">A</button><button data-level-filter="AA" aria-pressed="false">AA</button><button data-level-filter="AAA" aria-pressed="false">AAA</button></nav></div><div class="filter-group"><span class="filter-group-label" id="report-disposition-label">Review disposition</span><nav class="filters" aria-labelledby="report-disposition-label"><button data-disposition-filter="all" aria-pressed="true">All</button><button data-disposition-filter="unreviewed" aria-pressed="false">Unreviewed</button><button data-disposition-filter="action-required" aria-pressed="false">Action required</button><button data-disposition-filter="accepted-risk" aria-pressed="false">Accepted risk</button><button data-disposition-filter="false-positive" aria-pressed="false">False positive</button></nav></div></div>
${findingIndex}
<main>${result.findings.map((finding) => findingCard(finding, result)).join("\n") || "<p>No automated findings were detected. Manual testing is still required.</p>"}</main>
<dialog class="image-dialog" id="image-dialog"><div class="dialog-bar"><strong id="dialog-title">Visual evidence</strong><button class="dialog-close" id="dialog-close" type="button">Close</button></div><img id="dialog-image" alt=""></dialog><script>const dialog=document.getElementById('image-dialog');const dialogImage=document.getElementById('dialog-image');let activeSeverity='all';let activeLevel='all';let activeDisposition='all';function applyFilters(){document.querySelectorAll('.finding,.finding-index li').forEach(item=>{const severityMatches=activeSeverity==='all'||item.dataset.severity===activeSeverity;const levelMatches=activeLevel==='all'||item.dataset.level===activeLevel;const dispositionMatches=activeDisposition==='all'||item.dataset.disposition===activeDisposition;item.classList.toggle('hidden',!severityMatches||!levelMatches||!dispositionMatches);});}document.querySelectorAll('[data-severity-filter]').forEach(button=>button.addEventListener('click',()=>{activeSeverity=button.dataset.severityFilter;document.querySelectorAll('[data-severity-filter]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));applyFilters();}));document.querySelectorAll('[data-level-filter]').forEach(button=>button.addEventListener('click',()=>{activeLevel=button.dataset.levelFilter;document.querySelectorAll('[data-level-filter]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));applyFilters();}));document.querySelectorAll('[data-disposition-filter]').forEach(button=>button.addEventListener('click',()=>{activeDisposition=button.dataset.dispositionFilter;document.querySelectorAll('[data-disposition-filter]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));applyFilters();}));document.querySelectorAll('.report-shot').forEach(button=>button.addEventListener('click',()=>{const image=button.querySelector('img');dialogImage.src=image.src;dialogImage.alt=image.alt;document.getElementById('dialog-title').textContent=button.getAttribute('aria-label');dialog.showModal();}));document.getElementById('dialog-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});</script></body></html>`;
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
