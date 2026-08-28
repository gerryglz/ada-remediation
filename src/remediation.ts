import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Finding, ScanResult } from "./types.js";

export interface ProposedFileChange {
  file: string;
  before: string;
  after: string;
  findings: Finding[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeAttribute(evidence: string, attribute: string, expectedValue: string): string {
  const name = escapeRegExp(attribute);
  const value = escapeRegExp(expectedValue);
  const pattern = new RegExp(`\\s+${name}\\s*=\\s*(?:"${value}"|'${value}'|${value}(?=\\s|>))`, "i");
  return evidence.replace(pattern, "");
}

function replaceNearest(source: string, before: string, after: string, line?: number): string | undefined {
  if (before === after) return undefined;
  const expectedOffset = line
    ? source.split(/\r?\n/, Math.max(line - 1, 0)).reduce((total, item) => total + item.length + 1, 0)
    : 0;
  let index = source.indexOf(before, Math.max(0, expectedOffset - 300));
  if (index < 0) index = source.indexOf(before);
  if (index < 0) return undefined;
  return source.slice(0, index) + after + source.slice(index + before.length);
}

export async function proposeFixes(result: ScanResult): Promise<ProposedFileChange[]> {
  if (result.metadata.scanner !== "repository") throw new Error("Safe source fixes require a repository scan result.");
  const byFile = new Map<string, Finding[]>();
  for (const finding of result.findings) {
    if (!finding.safeFix || !finding.location.file) continue;
    byFile.set(finding.location.file, [...(byFile.get(finding.location.file) ?? []), finding]);
  }

  const changes: ProposedFileChange[] = [];
  for (const [relativeFile, findings] of byFile) {
    const absoluteFile = path.resolve(result.metadata.target, relativeFile);
    const before = await readFile(absoluteFile, "utf8");
    let after = before;
    const applied: Finding[] = [];
    const byElement = new Map<string, Finding[]>();
    for (const finding of findings) {
      const key = `${finding.location.line ?? 0}:${finding.location.column ?? 0}:${finding.evidence}`;
      byElement.set(key, [...(byElement.get(key) ?? []), finding]);
    }
    const elementGroups = [...byElement.values()].sort(
      (a, b) => (b[0].location.line ?? 0) - (a[0].location.line ?? 0),
    );
    for (const group of elementGroups) {
      const evidence = group[0].evidence;
      let updatedEvidence = evidence;
      for (const finding of group) {
        const fix = finding.safeFix!;
        updatedEvidence = removeAttribute(updatedEvidence, fix.attribute, fix.expectedValue);
      }
      const updatedSource = replaceNearest(after, evidence, updatedEvidence, group[0].location.line);
      if (updatedSource !== undefined) {
        after = updatedSource;
        applied.push(...group);
      }
    }
    if (after !== before) changes.push({ file: absoluteFile, before, after, findings: applied });
  }
  return changes;
}

export function formatDiff(change: ProposedFileChange): string {
  const beforeLines = change.before.split(/\r?\n/);
  const afterLines = change.after.split(/\r?\n/);
  const lines = [`--- ${change.file}`, `+++ ${change.file}`];
  const max = Math.max(beforeLines.length, afterLines.length);
  for (let index = 0; index < max; index += 1) {
    if (beforeLines[index] !== afterLines[index]) {
      lines.push(`@@ line ${index + 1} @@`, `- ${beforeLines[index] ?? ""}`, `+ ${afterLines[index] ?? ""}`);
    }
  }
  return lines.join("\n");
}

export async function applyFixes(changes: ProposedFileChange[]): Promise<void> {
  for (const change of changes) await writeFile(change.file, change.after, "utf8");
}
