import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Finding, ScanResult, Severity } from "../types.js";
import { escapeHtml, severityRank } from "../utils.js";

export type ReportFormat = "terminal" | "json" | "html" | "sarif";

function locationText(finding: Finding): string {
  const location = finding.location;
  if (location.file) return `${location.file}${location.line ? `:${location.line}:${location.column ?? 1}` : ""}`;
  return `${location.url ?? "unknown"}${location.selector ? ` (${location.selector})` : ""}`;
}

export function terminalReport(result: ScanResult): string {
  const counts = result.findings.reduce<Record<Severity, number>>(
    (summary, finding) => ({ ...summary, [finding.severity]: summary[finding.severity] + 1 }),
    { critical: 0, serious: 0, moderate: 0, minor: 0 },
  );
  const lines = [
    `Accessibility scan: ${result.metadata.target}`,
    `Scanned: ${result.metadata.pagesOrFilesScanned} | Findings: ${result.findings.length}`,
    `Critical ${counts.critical} | Serious ${counts.serious} | Moderate ${counts.moderate} | Minor ${counts.minor}`,
    "",
  ];
  for (const finding of [...result.findings].sort((a, b) => severityRank[b.severity] - severityRank[a.severity])) {
    lines.push(
      `[${finding.severity.toUpperCase()}] ${finding.title} (${finding.ruleId})`,
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
  const source = finding.location.url
    ? `<a href="${escapeHtml(finding.location.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(finding.location.pageTitle || finding.location.url)}</a>`
    : escapeHtml(locationText(finding));
  const selector = finding.location.selector ? `<code>${escapeHtml(finding.location.selector)}</code>` : "";
  const screenshot = finding.screenshot?.dataUrl.startsWith("data:image/")
    ? `<figure><button class="report-shot" type="button" aria-label="Open larger screenshot for ${escapeHtml(finding.title)}"><img src="${finding.screenshot.dataUrl}" alt="${escapeHtml(finding.screenshot.description)}" loading="lazy"><span>Open large screenshot</span></button><figcaption>${escapeHtml(finding.screenshot.description)}</figcaption></figure>`
    : "";
  const suggestion = finding.codeSuggestion
    ? `<section class="suggestion"><h3>${escapeHtml(finding.codeSuggestion.title)}</h3><p class="review-note">${finding.codeSuggestion.reviewRequired ? "Review required: " : ""}${escapeHtml(finding.codeSuggestion.rationale)}</p><div class="code-compare"><div><span class="code-label">Before — detected markup</span><pre>${escapeHtml(finding.codeSuggestion.before)}</pre></div><div><span class="code-label">Suggested after — starting point</span><pre>${escapeHtml(finding.codeSuggestion.after)}</pre></div></div>${finding.codeSuggestion.alternatives?.length ? `<p><strong>Other valid approach</strong></p><ul>${finding.codeSuggestion.alternatives.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}</section>`
    : `<section class="suggestion"><h3>Detected markup</h3><p class="review-note">No generic code patch is reliable for this rule. Use the potential solution and rule guidance, then verify manually.</p><pre>${escapeHtml(finding.evidence)}</pre></section>`;
  return `<article class="finding" id="finding-${finding.fingerprint}" data-severity="${finding.severity}">
    <div class="finding-title"><span class="badge ${finding.severity}">${finding.severity}</span><h2>${escapeHtml(finding.title)}</h2></div>
    <p class="location">${source}${selector ? ` <span aria-hidden="true">·</span> ${selector}` : ""}</p>
    <div class="finding-grid${screenshot ? "" : " no-image"}"><div><dl><dt>Rule</dt><dd>${escapeHtml(finding.ruleId)}</dd><dt>WCAG</dt><dd>${escapeHtml(wcag)}</dd><dt>Impact</dt><dd>${escapeHtml(finding.impact)}</dd><dt>Potential solution</dt><dd>${escapeHtml(finding.remediation)}</dd></dl>
    ${finding.safeFix ? `<p class="safe-fix">Safe fix: ${escapeHtml(finding.safeFix.description)}</p>` : ""}
    </div>${screenshot}</div>${suggestion}
  </article>`;
}

export function htmlReport(result: ScanResult): string {
  const counts = result.findings.reduce<Record<Severity, number>>(
    (summary, finding) => ({ ...summary, [finding.severity]: summary[finding.severity] + 1 }),
    { critical: 0, serious: 0, moderate: 0, minor: 0 },
  );
  const incomplete = result.metadata.incomplete?.length
    ? `<section class="notice"><strong>Incomplete pages</strong><ul>${result.metadata.incomplete.map((item) => `<li>${escapeHtml(item.url)} — ${escapeHtml(item.reason)}</li>`).join("")}</ul></section>`
    : "";
  const findingIndex = result.findings.length
    ? `<nav class="finding-index" aria-label="Finding list"><h2>Finding list</h2><ol>${result.findings.map((finding, index) => `<li><a href="#finding-${finding.fingerprint}"><span class="badge ${finding.severity}">${escapeHtml(finding.severity)}</span><span>${index + 1}. ${escapeHtml(finding.title)}</span></a></li>`).join("")}</ol></nav>`
    : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Accessibility report</title>
<style>
:root{font-family:"Camera Plain Variable",ui-sans-serif,system-ui,sans-serif;color:#1c1c1c;background:#f7f4ed;line-height:1.5;--ink:#1c1c1c;--muted:#5f5f5d;--border:#eceae4;--cream:#f7f4ed;--off-white:#fcfbf8}*{box-sizing:border-box}html{scroll-behavior:smooth}body{max-width:1200px;margin:auto;padding:64px 24px 96px;background:var(--cream)}header{margin-bottom:48px}header .eyebrow{color:var(--muted);font-size:.875rem}h1{font-size:clamp(2.25rem,6vw,3.75rem);font-weight:600;line-height:1.03;letter-spacing:-1.5px;margin:.5rem 0 1rem}.target{font-size:1.13rem;color:rgba(28,28,28,.82);overflow-wrap:anywhere}.target a,.location a,.finding-index a{color:var(--ink);text-decoration:underline}.summary{display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:12px;margin:32px 0}.metric{border:1px solid var(--border);border-radius:12px;padding:18px;background:rgba(28,28,28,.03)}.metric strong{display:block;font-size:3rem;font-weight:600;letter-spacing:-1.2px;line-height:1}.metric span{color:var(--muted);font-size:.875rem}.notice{border:1px solid var(--border);padding:12px 15px;background:rgba(28,28,28,.03);border-radius:8px;color:rgba(28,28,28,.82)}.filters{display:flex;gap:8px;flex-wrap:wrap;margin:32px 0 24px}.filters button{padding:8px 16px;border:1px solid rgba(28,28,28,.4);background:transparent;color:var(--ink);border-radius:9999px;cursor:pointer;font:inherit}.filters button[aria-pressed=true]{background:var(--ink);color:var(--off-white)}button:focus,a:focus{outline:0;box-shadow:0 0 0 2px rgba(59,130,246,.5),rgba(0,0,0,.1) 0 4px 12px}.finding-index{border:1px solid var(--border);border-radius:16px;padding:20px;margin:24px 0}.finding-index h2{font-size:1.25rem;font-weight:400;margin:0 0 12px}.finding-index ol{columns:2;column-gap:32px;margin:0;padding-left:24px}.finding-index li{break-inside:avoid;margin:8px 0}.finding-index a{display:inline-flex;align-items:center;gap:8px}.finding{border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:24px;scroll-margin-top:16px}.finding-title{display:flex;align-items:center;gap:10px}.finding h2{font-size:1.25rem;font-weight:400;line-height:1.25;margin:0}.finding h3{font-size:1.25rem;font-weight:400;margin:0 0 10px}.badge{font-size:.72rem;font-weight:600;text-transform:uppercase;padding:4px 8px;border-radius:9999px;color:var(--off-white);background:rgba(28,28,28,.4)}.badge.critical{background:var(--ink)}.badge.serious{background:rgba(28,28,28,.83)}.badge.moderate{background:rgba(28,28,28,.4);color:var(--ink)}.badge.minor{background:rgba(28,28,28,.04);color:var(--ink);border:1px solid var(--border)}.location{font-size:.875rem;color:var(--muted);overflow-wrap:anywhere}.location code{background:rgba(28,28,28,.04);padding:3px 6px;border-radius:4px}.finding-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,45%);gap:24px}.finding-grid.no-image{grid-template-columns:1fr}dt{font-weight:600;margin-top:14px}dd{margin-left:0;color:rgba(28,28,28,.82);white-space:pre-wrap}pre{white-space:pre-wrap;background:var(--ink);color:var(--off-white);padding:14px;border-radius:8px;overflow:auto;font-size:.82rem}.suggestion{border-top:1px solid var(--border);padding-top:22px;margin-top:22px}.review-note{border:1px solid var(--border);border-radius:8px;background:rgba(28,28,28,.03);padding:12px;color:rgba(28,28,28,.82)}.code-compare{display:grid;grid-template-columns:1fr 1fr;gap:12px}.code-label{display:block;font-size:.8rem;color:var(--muted);margin-bottom:6px}.report-shot{display:block;width:100%;border:1px solid var(--border);border-radius:12px;padding:0;background:transparent;overflow:hidden;cursor:zoom-in}.report-shot img{display:block;width:100%;height:auto;max-height:460px;object-fit:cover;object-position:top;border:0}.report-shot span{display:block;padding:8px;color:var(--muted)}figure{margin:14px 0 0}figcaption{font-size:.875rem;color:var(--muted);margin-top:8px}.safe-fix{border-left:3px solid var(--ink);padding-left:.75rem}.image-dialog{width:min(96vw,1500px);max-width:none;border:1px solid var(--border);border-radius:16px;background:var(--cream);padding:14px}.image-dialog::backdrop{background:rgba(28,28,28,.78)}.dialog-bar{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:10px}.dialog-close{border:1px solid rgba(28,28,28,.4);border-radius:6px;background:transparent;padding:8px 16px;font:inherit}.image-dialog img{display:block;width:100%;max-height:86vh;object-fit:contain;border:1px solid var(--border);border-radius:12px}.hidden{display:none}@media(max-width:800px){.summary{grid-template-columns:repeat(2,1fr)}.finding-grid,.code-compare{grid-template-columns:1fr}.finding-index ol{columns:1}}@media(max-width:600px){body{padding:40px 14px}h1{font-size:2.25rem;letter-spacing:-.9px}.metric strong{font-size:2.25rem}}</style></head>
<body><header><div class="eyebrow">ADA Assistant · Accessibility report</div><h1>Findings in context.</h1><p class="target"><strong>Internet source:</strong> ${result.metadata.target.startsWith("http") ? `<a href="${escapeHtml(result.metadata.target)}" target="_blank" rel="noopener noreferrer">${escapeHtml(result.metadata.target)}</a>` : escapeHtml(result.metadata.target)}</p><p>Scanned ${result.metadata.pagesOrFilesScanned} page(s). Generated ${escapeHtml(result.metadata.completedAt)}.</p></header>
<section class="summary" aria-label="Finding totals"><div class="metric"><strong>${result.findings.length}</strong><span>Findings</span></div><div class="metric"><strong>${counts.critical}</strong><span>Critical</span></div><div class="metric"><strong>${counts.serious}</strong><span>Serious</span></div><div class="metric"><strong>${counts.moderate}</strong><span>Moderate</span></div><div class="metric"><strong>${counts.minor}</strong><span>Minor</span></div></section>
<p class="notice">${escapeHtml(result.notice)}</p>
${incomplete}
<nav class="filters" aria-label="Filter findings"><button data-filter="all" aria-pressed="true">All</button><button data-filter="critical" aria-pressed="false">Critical</button><button data-filter="serious" aria-pressed="false">Serious</button><button data-filter="moderate" aria-pressed="false">Moderate</button><button data-filter="minor" aria-pressed="false">Minor</button></nav>
${findingIndex}
<main>${result.findings.map(findingCard).join("\n") || "<p>No automated findings were detected. Manual testing is still required.</p>"}</main>
<dialog class="image-dialog" id="image-dialog"><div class="dialog-bar"><strong id="dialog-title">Visual evidence</strong><button class="dialog-close" id="dialog-close" type="button">Close</button></div><img id="dialog-image" alt=""></dialog><script>const dialog=document.getElementById('image-dialog');const dialogImage=document.getElementById('dialog-image');document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{const filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));document.querySelectorAll('.finding').forEach(card=>card.classList.toggle('hidden',filter!=='all'&&card.dataset.severity!==filter));}));document.querySelectorAll('.report-shot').forEach(button=>button.addEventListener('click',()=>{const image=button.querySelector('img');dialogImage.src=image.src;dialogImage.alt=image.alt;document.getElementById('dialog-title').textContent=button.getAttribute('aria-label');dialog.showModal();}));document.getElementById('dialog-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});</script></body></html>`;
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
