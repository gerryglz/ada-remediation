import { createHash } from "node:crypto";
import type { Finding, ScanResult, Severity } from "./types.js";

export const TOOL_VERSION = "0.3.0";

export function fingerprintFinding(
  ruleId: string,
  location: Finding["location"],
  evidence: string,
): string {
  const stable = [
    ruleId,
    location.file ?? location.url ?? "unknown",
    location.line ?? location.selector ?? "unknown",
    evidence.replace(/\s+/g, " ").trim(),
  ].join("|");
  return createHash("sha256").update(stable).digest("hex").slice(0, 16);
}

export const severityRank: Record<Severity, number> = {
  minor: 1,
  moderate: 2,
  serious: 3,
  critical: 4,
};

export function hasFindingsAtOrAbove(result: ScanResult, threshold: Severity): boolean {
  return result.findings.some((finding) => severityRank[finding.severity] >= severityRank[threshold]);
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
