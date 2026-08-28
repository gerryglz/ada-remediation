import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Finding, ScanResult, Severity } from "../types.js";
import { escapeHtml, severityRank } from "../utils.js";
import { WCAG_VERSION, wcagCriterionLabel, wcagUnderstandingUrl } from "../wcag.js";
import { manualReviewChecklist } from "../manual.js";

export type ReportFormat = "terminal" | "json" | "html" | "sarif";

function locationText(finding: Finding): string {
  const location = finding.location;
  if (location.file) return `${location.file}${location.line ? `:${location.line}:${location.column ?? 1}` : ""}`;
  return `${location.url ?? "unknown"}${location.selector ? ` (${location.selector})` : ""}`;
}

function wcagTargetText(result: ScanResult): string | undefined {
  return result.metadata.wcagLevel ? `WCAG ${WCAG_VERSION} Level ${result.metadata.wcagLevel}` : undefined;
}

function findingLevelBadge(finding: Finding): string {
  if (!finding.wcagLevel) return "";
  const level = escapeHtml(finding.wcagLevel);
  return `<span class="wcag-level-badge level-${level.toLowerCase()}" aria-label="WCAG Level ${level}" title="WCAG Level ${level}">${level}</span>`;
}

export function terminalReport(result: ScanResult): string {
  const manualChecks = result.manualChecks?.length ? result.manualChecks : manualReviewChecklist(result.metadata.wcagLevel ?? "AA");
  const counts = result.findings.reduce<Record<Severity, number>>(
    (summary, finding) => ({ ...summary, [finding.severity]: summary[finding.severity] + 1 }),
    { critical: 0, serious: 0, moderate: 0, minor: 0 },
  );
  const lines = [
    `Accessibility scan: ${result.metadata.target}`,
    `Scanned: ${result.metadata.pagesOrFilesScanned} | Findings: ${result.findings.length} | Manual checks: ${manualChecks.length}`,
    ...(wcagTargetText(result) ? [`Conformance target: ${wcagTargetText(result)}`] : []),
    `Critical ${counts.critical} | Serious ${counts.serious} | Moderate ${counts.moderate} | Minor ${counts.minor}`,
    "",
  ];
  for (const finding of [...result.findings].sort((a, b) => severityRank[b.severity] - severityRank[a.severity])) {
    lines.push(
      `[${finding.severity.toUpperCase()}${finding.wcagLevel ? ` · WCAG LEVEL ${finding.wcagLevel}` : ""}] ${finding.title} (${finding.ruleId})`,
      `  ${locationText(finding)}`,
      `  ${finding.remediation}`,
      finding.safeFix ? `  Safe fix available: ${finding.safeFix.description}` : "",
      "",
    );
  }
  if (result.metadata.incomplete?.length) {
    lines.push("Incomplete pages:");
    for (const item of result.metadata.incomplete) lines.push(`  ${item.url}: ${item.reason}`);
    lines.push("");
  }
  lines.push(result.notice);
  return lines.filter((line, index, array) => line !== "" || array[index - 1] !== "").join("\n");
}

export function jsonReport(result: ScanResult): string {
  return JSON.stringify(result, null, 2);
}

function findingCard(finding: Finding): string {
  const wcag = finding.wcag.length ? finding.wcag.join(", ") : "Not mapped";
  const wcagLinks = finding.wcag.length
    ? `<div class="wcag-links">${finding.wcag.map((criterion) => `<a href="${wcagUnderstandingUrl(criterion)}" target="_blank" rel="noopener noreferrer">${escapeHtml(wcagCriterionLabel(criterion))}</a>`).join("")}</div>`
    : `<strong>Not mapped</strong>`;
  const source = finding.location.url
    ? `<div class="location-card"><span class="meta-label">Source page</span><a class="location-link" href="${escapeHtml(finding.location.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(finding.location.pageTitle || "Open the affected page")}</a><a class="source-url" href="${escapeHtml(finding.location.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(finding.location.url)}</a></div>`
    : `<div class="location-card"><span class="meta-label">Source file</span><strong>${escapeHtml(locationText(finding))}</strong></div>`;
  const selector = `<div class="location-card"><span class="meta-label">Affected element</span><code class="selector">${escapeHtml(finding.location.selector || "No CSS selector was reported")}</code><p class="meta-help">Use this selector to locate the element in browser developer tools.</p></div>`;
  const screenshot = finding.screenshot?.dataUrl.startsWith("data:image/")
    ? `<section class="report-section"><h3>Visual evidence</h3><p>The affected element is outlined in charcoal. Select the thumbnail to inspect the full viewport capture.</p><figure><button class="report-shot" type="button" aria-label="Open larger screenshot for ${escapeHtml(finding.title)}"><img src="${finding.screenshot.dataUrl}" alt="${escapeHtml(finding.screenshot.description)}" loading="lazy"><span>Open large screenshot</span></button><figcaption>${escapeHtml(finding.screenshot.description)}</figcaption></figure></section>`
    : "";
  const contrast = finding.contrast
    ? `<section class="report-section contrast-section"><h3>Color contrast evidence</h3><div class="contrast-grid"><div><span class="meta-label">Foreground</span><code>${escapeHtml(finding.contrast.foreground)}</code></div><div><span class="meta-label">Background</span><code>${escapeHtml(finding.contrast.background)}</code></div><div><span class="meta-label">Measured ratio</span><strong>${finding.contrast.ratio ? `${finding.contrast.ratio}:1` : "Not reported"}</strong></div><div><span class="meta-label">Required ratio</span><strong>${finding.contrast.requiredRatio ? `${finding.contrast.requiredRatio}:1` : "Verify manually"}</strong></div><div><span class="meta-label">Font</span><span>${escapeHtml([finding.contrast.fontSize, finding.contrast.fontWeight].filter(Boolean).join(" · ") || "Not reported")}</span></div></div><p class="meta-help">Verify the final colors in default, hover, focus, active, disabled, error, and visited states.</p></section>`
    : "";
  const suggestion = finding.codeSuggestion
    ? `<section class="report-section"><h3>Code example: ${escapeHtml(finding.codeSuggestion.title)}</h3><p class="review-note">${finding.codeSuggestion.reviewRequired ? "Review required: " : ""}${escapeHtml(finding.codeSuggestion.rationale)}</p><div class="code-compare"><div><span class="code-label">Before — detected markup</span><pre>${escapeHtml(finding.codeSuggestion.before)}</pre></div><div><span class="code-label">Suggested after — starting point</span><pre>${escapeHtml(finding.codeSuggestion.after)}</pre></div></div>${finding.codeSuggestion.alternatives?.length ? `<p><strong>Other valid approach</strong></p><ul>${finding.codeSuggestion.alternatives.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}</section>`
    : `<section class="report-section"><h3>Detected markup</h3><p class="review-note">No generic code patch is reliable for this rule. Use the recommended fix and verify manually.</p><pre>${escapeHtml(finding.evidence)}</pre></section>`;
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
  return `<article class="finding" id="finding-${finding.fingerprint}" data-severity="${finding.severity}" data-level="${escapeHtml(finding.wcagLevel ?? "")}">
    <header class="finding-header"><div class="finding-kicker"><span class="badge ${finding.severity}">${finding.severity}</span>${findingLevelBadge(finding)}<span>${finding.kind === "automatic" ? "Automated finding" : "Manual review"} · ${escapeHtml(finding.confidence)} confidence</span></div><h2>${escapeHtml(finding.title)}</h2></header>
    <section class="report-section"><h3>Finding summary</h3><div class="meta-grid"><div class="meta-card"><span class="meta-label">Priority</span><strong>${escapeHtml(finding.severity)}</strong><p class="meta-help">Review this finding according to its severity and user impact.</p></div><div class="meta-card standards-card"><span class="meta-label">WCAG 2.2 requirements — W3C</span>${wcagLinks}<p class="meta-help">Each section opens its exact W3C Understanding guidance page. Reported mapping: ${escapeHtml(wcag)}.</p></div><div class="meta-card"><span class="meta-label">Automated scanner check</span>${rule}<p class="meta-help">The rule ID comes from axe-core; Deque documentation describes how the scanner detected it.</p></div><div class="meta-card"><span class="meta-label">Detection confidence</span><strong>${escapeHtml(finding.confidence)}</strong><p class="meta-help">Human verification is still required.</p></div></div></section>
    <section class="report-section"><h3>Where it was found</h3><div class="location-grid">${source}${selector}</div></section>
    ${contrast}
    ${screenshot}
    <section class="report-section"><h3>Why this was flagged</h3><h4>Rule purpose</h4><p>${escapeHtml(finding.explanation)}</p><h4>Failed check</h4><p>${escapeHtml(finding.impact)}</p></section>
    <section class="report-section"><h3>Recommended fix</h3><p>${escapeHtml(finding.remediation)}</p>${finding.safeFix ? `<p class="safe-fix">Safe automated fix available: ${escapeHtml(finding.safeFix.description)}</p>` : ""}</section>
    ${suggestion}
    <section class="report-section"><h3>How to verify the fix</h3><ol><li>Review the surrounding component so the change preserves the intended behavior.</li><li>Replace any bracketed placeholder text with content approved for this page.</li><li>Test the affected element with a keyboard and the relevant assistive technology.</li><li>Run the accessibility scan again and confirm the finding is gone without introducing a new issue.</li></ol>${references ? `<h4>References</h4><ul>${references}</ul>` : ""}</section>
  </article>`;
}

function manualChecklistHtml(result: ScanResult): string {
  const checks = result.manualChecks?.length ? result.manualChecks : manualReviewChecklist(result.metadata.wcagLevel ?? "AA");
  return `<section class="manual-review" aria-labelledby="manual-review-heading"><div class="manual-heading"><div><span class="eyebrow">Required human review</span><h2 id="manual-review-heading">Manual accessibility checklist</h2><p>Automated tools cannot determine these requirements reliably. Complete and document each task before making a conformance claim.</p></div><strong id="manual-progress">0 of ${checks.length} complete</strong></div><ol class="manual-list">${checks.map((check) => `<li class="manual-check"><label><input type="checkbox" data-manual-check><span class="todo-badge">TODO</span><strong>${escapeHtml(check.title)}</strong></label><p><span class="category">${escapeHtml(check.category)}</span> · WCAG Level ${escapeHtml(check.wcagLevel)}</p><p>${escapeHtml(check.description)}</p><ol>${check.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol><div class="wcag-links">${check.wcag.map((criterion) => `<a href="${wcagUnderstandingUrl(criterion)}" target="_blank" rel="noopener noreferrer">${escapeHtml(wcagCriterionLabel(criterion))}</a>`).join("")}</div></li>`).join("")}</ol></section>`;
}

export function htmlReport(result: ScanResult): string {
  const counts = result.findings.reduce<Record<Severity, number>>(
    (summary, finding) => ({ ...summary, [finding.severity]: summary[finding.severity] + 1 }),
    { critical: 0, serious: 0, moderate: 0, minor: 0 },
  );
  const incomplete = result.metadata.incomplete?.length
    ? `<section class="notice"><strong>Incomplete pages</strong><ul>${result.metadata.incomplete.map((item) => `<li><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.url)}</a> — ${escapeHtml(item.reason)}</li>`).join("")}</ul></section>`
    : "";
  const findingIndex = result.findings.length
    ? `<nav class="finding-index" aria-label="Finding list"><h2>Finding list</h2><ol>${result.findings.map((finding, index) => `<li data-severity="${finding.severity}" data-level="${escapeHtml(finding.wcagLevel ?? "")}"><a href="#finding-${finding.fingerprint}"><span class="badge ${finding.severity}">${escapeHtml(finding.severity)}</span>${findingLevelBadge(finding)}<span>${index + 1}. ${escapeHtml(finding.title)}</span></a></li>`).join("")}</ol></nav>`
    : "";
  const manualChecklist = manualChecklistHtml(result);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Accessibility report</title>
<style>
:root{--accent-plum:#ab307e;--accent-blue:#6495ed;--accent-green:#2f7d5a;--accent-orange:#9a4e12;--accent-plum-soft:rgba(171,48,126,.10);--accent-blue-soft:rgba(100,149,237,.14);--accent-green-soft:rgba(47,125,90,.12);--accent-orange-soft:rgba(154,78,18,.12)}
html body button:focus,html body a:focus{box-shadow:0 0 0 2px rgba(100,149,237,.68),rgba(0,0,0,.1) 0 4px 12px}.finding .badge.critical,.finding-index .badge.critical{background:var(--accent-plum)}.finding .badge.serious,.finding-index .badge.serious{background:var(--accent-orange);color:var(--off-white)}.finding .badge.moderate,.finding-index .badge.moderate{background:var(--accent-blue-soft);border:1px solid var(--accent-blue);color:var(--ink)}.wcag-level-badge{display:inline-block;font-size:.72rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em;padding:3px 8px;border:1px solid var(--accent-green);border-radius:9999px;color:var(--ink);background:var(--accent-green-soft);white-space:nowrap}.finding-kicker,.finding-index a{flex-wrap:wrap}.filter-groups{display:flex;align-items:start;gap:32px;flex-wrap:wrap;margin:32px 0 24px}.filter-group-label{display:block;font-size:.78rem;color:var(--muted);margin-bottom:6px}.filter-group .filters{margin:0}html body .level-filters button[aria-pressed=true]{background:var(--accent-green);border-color:var(--accent-green);color:var(--off-white)}.finding .report-section{position:relative;border-top:0;padding-top:32px;margin-top:32px}.finding .report-section::before{content:"";position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,var(--accent-plum) 0,var(--accent-blue) 32%,var(--border) 72%)}.finding .standards-card{background:var(--accent-blue-soft);border-color:var(--accent-blue)}.finding .wcag-links a{border-color:var(--accent-blue);background:var(--cream)}.contrast-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.contrast-grid>div{border:1px solid var(--border);border-radius:8px;background:var(--accent-blue-soft);padding:12px;min-width:0}.contrast-grid code{overflow-wrap:anywhere}.manual-review{border:1px solid var(--border);border-radius:16px;padding:24px;margin:32px 0;background:var(--accent-green-soft)}.manual-heading{display:flex;justify-content:space-between;gap:24px;align-items:start}.manual-heading h2{margin:4px 0 6px}.manual-heading p{margin:0;max-width:760px}.manual-list{padding-left:0;list-style:none}.manual-check{border-top:1px solid var(--border);padding:18px 0}.manual-check label{display:flex;gap:10px;align-items:center;cursor:pointer}.manual-check input{width:20px;height:20px;accent-color:var(--accent-green)}.manual-check>p{margin:7px 0}.todo-badge,.category{font-size:.72rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase}.todo-badge{border:1px solid var(--accent-orange);border-radius:9999px;padding:3px 8px}.manual-check:has(input:checked){opacity:.66}.manual-check:has(input:checked) .todo-badge{border-color:var(--accent-green);background:var(--accent-green);color:var(--off-white)}
:root{font-family:"Camera Plain Variable",ui-sans-serif,system-ui,sans-serif;color:#1c1c1c;background:#f7f4ed;line-height:1.5;--ink:#1c1c1c;--muted:#5f5f5d;--border:#eceae4;--cream:#f7f4ed;--off-white:#fcfbf8}*{box-sizing:border-box}html{scroll-behavior:smooth}body{max-width:1200px;margin:auto;padding:64px 24px 96px;background:var(--cream)}header{margin-bottom:48px}header .eyebrow{color:var(--muted);font-size:.875rem}h1{font-size:clamp(2.25rem,6vw,3.75rem);font-weight:600;line-height:1.03;letter-spacing:-1.5px;margin:.5rem 0 1rem}.target{font-size:1.13rem;color:rgba(28,28,28,.82);overflow-wrap:anywhere}.target a,.finding-index a,.location-link,.source-url,.scanner-link,.report-section a,.manual-review a{color:var(--ink);text-decoration:underline}.summary{display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:12px;margin:32px 0}.metric{border:1px solid var(--border);border-radius:12px;padding:18px;background:rgba(28,28,28,.03)}.metric strong{display:block;font-size:3rem;font-weight:600;letter-spacing:-1.2px;line-height:1}.metric span{color:var(--muted);font-size:.875rem}.notice{border:1px solid var(--border);padding:12px 15px;background:rgba(28,28,28,.03);border-radius:8px;color:rgba(28,28,28,.82)}.filters{display:flex;gap:8px;flex-wrap:wrap;margin:32px 0 24px}.filters button{padding:8px 16px;border:1px solid rgba(28,28,28,.4);background:transparent;color:var(--ink);border-radius:9999px;cursor:pointer;font:inherit}.filters button[aria-pressed=true]{background:var(--ink);color:var(--off-white)}button:focus,a:focus,input:focus{outline:0;box-shadow:0 0 0 2px rgba(59,130,246,.5),rgba(0,0,0,.1) 0 4px 12px}.finding-index{border:1px solid var(--border);border-radius:16px;padding:20px;margin:24px 0}.finding-index h2{font-size:1.25rem;font-weight:400;margin:0 0 12px}.finding-index ol{columns:2;column-gap:32px;margin:0;padding-left:24px}.finding-index li{break-inside:avoid;margin:8px 0}.finding-index a{display:inline-flex;align-items:center;gap:8px}.finding{border:1px solid var(--border);border-radius:12px;padding:24px;margin-bottom:24px;scroll-margin-top:16px}.finding-header{margin:0}.finding-kicker{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:.875rem;margin-bottom:10px}.finding h2{font-size:2.25rem;font-weight:600;line-height:1.08;letter-spacing:-.9px;margin:0}.finding h3{font-size:1.25rem;font-weight:400;margin:0 0 12px}.finding h4{font-size:1rem;font-weight:600;margin:16px 0 4px}.badge{font-size:.72rem;font-weight:600;text-transform:uppercase;padding:4px 8px;border-radius:9999px;color:var(--off-white);background:rgba(28,28,28,.4)}.badge.critical{background:var(--ink)}.badge.serious{background:rgba(28,28,28,.83)}.badge.moderate{background:rgba(28,28,28,.4);color:var(--ink)}.badge.minor{background:rgba(28,28,28,.04);color:var(--ink);border:1px solid var(--border)}.report-section{border-top:1px solid var(--border);padding-top:24px;margin-top:24px}.meta-grid,.location-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.meta-card,.location-card{border:1px solid var(--border);border-radius:8px;background:rgba(28,28,28,.03);padding:14px;min-width:0}.standards-card{border-color:rgba(28,28,28,.4)}.meta-label{display:block;font-size:.78rem;color:var(--muted);margin-bottom:5px}.meta-help{font-size:.82rem;color:var(--muted);margin:5px 0 0}.wcag-links{display:flex;gap:6px;flex-wrap:wrap}.wcag-links a{display:inline-block;border:1px solid rgba(28,28,28,.4);border-radius:9999px;padding:3px 9px;background:var(--cream)}.scanner-link{display:block;font-size:.82rem;margin-top:6px}.location-link,.source-url{display:block;overflow-wrap:anywhere}.source-url{font-size:.82rem;color:var(--muted);margin-top:5px}.selector{display:block;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;background:rgba(28,28,28,.04);padding:8px 10px;border-radius:6px;overflow-wrap:anywhere}pre{white-space:pre-wrap;background:var(--ink);color:var(--off-white);padding:14px;border-radius:8px;overflow:auto;font-size:.82rem}.review-note{border:1px solid var(--border);border-radius:8px;background:rgba(28,28,28,.03);padding:12px;color:rgba(28,28,28,.82)}.code-compare{display:grid;grid-template-columns:1fr 1fr;gap:12px}.code-label{display:block;font-size:.8rem;color:var(--muted);margin-bottom:6px}.report-shot{display:block;width:min(100%,540px);border:1px solid var(--border);border-radius:12px;padding:0;background:transparent;overflow:hidden;cursor:zoom-in}.report-shot img{display:block;width:100%;height:auto;max-height:280px;object-fit:cover;object-position:top;border:0}.report-shot span{display:block;padding:8px;color:var(--muted)}figure{margin:14px 0 0}figcaption{font-size:.875rem;color:var(--muted);margin-top:8px;max-width:540px}.safe-fix{border-left:3px solid var(--ink);padding-left:.75rem}.image-dialog{width:min(96vw,1500px);max-width:none;border:1px solid var(--border);border-radius:16px;background:var(--cream);padding:14px}.image-dialog::backdrop{background:rgba(28,28,28,.78)}.dialog-bar{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:10px}.dialog-close{border:1px solid rgba(28,28,28,.4);border-radius:6px;background:transparent;padding:8px 16px;font:inherit}.image-dialog img{display:block;width:100%;max-height:86vh;object-fit:contain;border:1px solid var(--border);border-radius:12px}.hidden{display:none}@media(max-width:800px){.summary{grid-template-columns:repeat(2,1fr)}.meta-grid,.location-grid,.code-compare,.contrast-grid{grid-template-columns:1fr}.finding-index ol{columns:1}.manual-heading{display:block}}@media(max-width:600px){body{padding:40px 14px}h1,.finding h2{font-size:2.25rem;letter-spacing:-.9px}.metric strong{font-size:2.25rem}}</style></head>
<body><header><div class="eyebrow">ADA Assistant · Accessibility report</div><h1>Findings in context.</h1><p class="target"><strong>Internet source:</strong> ${result.metadata.target.startsWith("http") ? `<a href="${escapeHtml(result.metadata.target)}" target="_blank" rel="noopener noreferrer">${escapeHtml(result.metadata.target)}</a>` : escapeHtml(result.metadata.target)}</p>${wcagTargetText(result) ? `<p><strong>Conformance target:</strong> ${escapeHtml(wcagTargetText(result)!)}</p>` : ""}<p>Scanned ${result.metadata.pagesOrFilesScanned} page(s). Generated ${escapeHtml(result.metadata.completedAt)}.</p></header>
<section class="summary" aria-label="Finding totals"><div class="metric"><strong>${result.findings.length}</strong><span>Findings</span></div><div class="metric"><strong>${counts.critical}</strong><span>Critical</span></div><div class="metric"><strong>${counts.serious}</strong><span>Serious</span></div><div class="metric"><strong>${counts.moderate}</strong><span>Moderate</span></div><div class="metric"><strong>${counts.minor}</strong><span>Minor</span></div></section>
<p class="notice">${escapeHtml(result.notice)}</p>
${incomplete}
${manualChecklist}
<div class="filter-groups"><div class="filter-group"><span class="filter-group-label" id="report-severity-label">Impact severity</span><nav class="filters" aria-labelledby="report-severity-label"><button data-severity-filter="all" aria-pressed="true">All</button><button data-severity-filter="critical" aria-pressed="false">Critical</button><button data-severity-filter="serious" aria-pressed="false">Serious</button><button data-severity-filter="moderate" aria-pressed="false">Moderate</button><button data-severity-filter="minor" aria-pressed="false">Minor</button></nav></div><div class="filter-group"><span class="filter-group-label" id="report-level-label">WCAG level</span><nav class="filters level-filters" aria-labelledby="report-level-label"><button data-level-filter="all" aria-pressed="true">All levels</button><button data-level-filter="A" aria-pressed="false">A</button><button data-level-filter="AA" aria-pressed="false">AA</button><button data-level-filter="AAA" aria-pressed="false">AAA</button></nav></div></div>
${findingIndex}
<main>${result.findings.map(findingCard).join("\n") || "<p>No automated findings were detected. Manual testing is still required.</p>"}</main>
<dialog class="image-dialog" id="image-dialog"><div class="dialog-bar"><strong id="dialog-title">Visual evidence</strong><button class="dialog-close" id="dialog-close" type="button">Close</button></div><img id="dialog-image" alt=""></dialog><script>const dialog=document.getElementById('image-dialog');const dialogImage=document.getElementById('dialog-image');let activeSeverity='all';let activeLevel='all';function applyFilters(){document.querySelectorAll('.finding,.finding-index li').forEach(item=>{const severityMatches=activeSeverity==='all'||item.dataset.severity===activeSeverity;const levelMatches=activeLevel==='all'||item.dataset.level===activeLevel;item.classList.toggle('hidden',!severityMatches||!levelMatches);});}function updateManualProgress(){const checks=[...document.querySelectorAll('[data-manual-check]')];const complete=checks.filter(item=>item.checked).length;const progress=document.getElementById('manual-progress');if(progress)progress.textContent=complete+' of '+checks.length+' complete';}document.querySelectorAll('[data-manual-check]').forEach(input=>input.addEventListener('change',updateManualProgress));document.querySelectorAll('[data-severity-filter]').forEach(button=>button.addEventListener('click',()=>{activeSeverity=button.dataset.severityFilter;document.querySelectorAll('[data-severity-filter]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));applyFilters();}));document.querySelectorAll('[data-level-filter]').forEach(button=>button.addEventListener('click',()=>{activeLevel=button.dataset.levelFilter;document.querySelectorAll('[data-level-filter]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));applyFilters();}));document.querySelectorAll('.report-shot').forEach(button=>button.addEventListener('click',()=>{const image=button.querySelector('img');dialogImage.src=image.src;dialogImage.alt=image.alt;document.getElementById('dialog-title').textContent=button.getAttribute('aria-label');dialog.showModal();}));document.getElementById('dialog-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});</script></body></html>`;
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
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: finding.location.file ?? finding.location.url ?? "unknown" },
                  region: finding.location.line
                    ? { startLine: finding.location.line, startColumn: finding.location.column ?? 1 }
                    : undefined,
                },
                logicalLocations: finding.location.selector ? [{ name: finding.location.selector }] : undefined,
              },
            ],
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
