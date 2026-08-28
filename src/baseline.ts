import { readFile, writeFile } from "node:fs/promises";
import type { ScanResult } from "./types.js";

interface Baseline {
  schemaVersion: "1.0";
  createdAt: string;
  fingerprints: string[];
}

export async function createBaseline(result: ScanResult, output: string): Promise<void> {
  const baseline: Baseline = {
    schemaVersion: "1.0",
    createdAt: new Date().toISOString(),
    fingerprints: [...new Set(result.findings.map((finding) => finding.fingerprint))].sort(),
  };
  await writeFile(output, JSON.stringify(baseline, null, 2), "utf8");
}

export async function applyBaseline(result: ScanResult, baselinePath?: string): Promise<ScanResult> {
  if (!baselinePath) return result;
  const baseline = JSON.parse(await readFile(baselinePath, "utf8")) as Baseline;
  const known = new Set(baseline.fingerprints);
  return { ...result, findings: result.findings.filter((finding) => !known.has(finding.fingerprint)) };
}
