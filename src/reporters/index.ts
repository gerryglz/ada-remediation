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
  return `<article class="finding" data-severity="${finding.severity}">
    <div class="finding-title"><span class="badge ${finding.severity}">${finding.severity}</span><h2>${escapeHtml(finding.title)}</h2></div>
    <p class="location">${escapeHtml(locationText(finding))}</p>
    <dl><dt>Rule</dt><dd>${escapeHtml(finding.ruleId)}</dd><dt>WCAG</dt><dd>${escapeHtml(wcag)}</dd><dt>Impact</dt><dd>${escapeHtml(finding.impact)}</dd><dt>Remediation</dt><dd>${escapeHtml(finding.remediation)}</dd></dl>
    <details><summary>Evidence</summary><pre>${escapeHtml(finding.evidence)}</pre></details>
    ${finding.safeFix ? `<p class="safe-fix">Safe fix: ${escapeHtml(finding.safeFix.description)}</p>` : ""}
  </article>`;
}

export function htmlReport(result: ScanResult): string {
  const payload = JSON.stringify(result.findings.map((finding) => finding.severity));
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Accessibility report</title>
<style>
:root{font-family:system-ui,sans-serif;color:#17202a;background:#f5f7f9}body{max-width:1100px;margin:auto;padding:2rem}header,.finding{background:#fff;border:1px solid #dce2e8;border-radius:.75rem;padding:1.25rem;margin-bottom:1rem}.notice{border-left:5px solid #8a5a00;padding:.8rem;background:#fff8e6}.filters{display:flex;gap:.5rem;flex-wrap:wrap;margin:1rem 0}.filters button{padding:.55rem .8rem;border:1px solid #75808b;background:white;border-radius:.35rem;cursor:pointer}.filters button:focus{outline:3px solid #1769aa;outline-offset:2px}.finding-title{display:flex;align-items:center;gap:.75rem}.finding h2{font-size:1.15rem;margin:0}.badge{font-size:.75rem;font-weight:700;text-transform:uppercase;padding:.25rem .45rem;border-radius:.25rem}.critical{background:#7b1420;color:#fff}.serious{background:#b23b00;color:#fff}.moderate{background:#ffd166;color:#302500}.minor{background:#dbe7f3;color:#17202a}.location{font-family:monospace;overflow-wrap:anywhere}dt{font-weight:700;margin-top:.7rem}dd{margin-left:0}pre{white-space:pre-wrap;background:#111827;color:#f9fafb;padding:1rem;border-radius:.35rem;overflow:auto}.safe-fix{border-left:4px solid #138a4b;padding-left:.75rem}.hidden{display:none}</style></head>
<body><header><h1>Accessibility report</h1><p><strong>Target:</strong> ${escapeHtml(result.metadata.target)}</p><p><strong>Scanned:</strong> ${result.metadata.pagesOrFilesScanned} &nbsp; <strong>Findings:</strong> ${result.findings.length}</p></header>
<p class="notice">${escapeHtml(result.notice)}</p>
<nav class="filters" aria-label="Filter findings"><button data-filter="all">All</button><button data-filter="critical">Critical</button><button data-filter="serious">Serious</button><button data-filter="moderate">Moderate</button><button data-filter="minor">Minor</button></nav>
<main>${result.findings.map(findingCard).join("\n") || "<p>No automated findings were detected. Manual testing is still required.</p>"}</main>
<script>const severities=${payload};document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{const filter=button.dataset.filter;document.querySelectorAll('.finding').forEach(card=>card.classList.toggle('hidden',filter!=='all'&&card.dataset.severity!==filter));}));</script></body></html>`;
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
