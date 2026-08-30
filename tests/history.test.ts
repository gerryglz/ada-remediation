import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compareScanRuns, deleteScanRun, getScanRun, listScanRuns, saveScanRun, updateRunReview, websiteKey } from "../src/history.js";
import type { Finding, ScanResult } from "../src/types.js";

const directories: string[] = [];

function finding(fingerprint: string, selector: string): Finding {
  return {
    fingerprint,
    ruleId: "button-name",
    title: "Buttons must have discernible text",
    severity: "critical",
    wcag: ["4.1.2"],
    location: { url: "https://example.com/", selector },
    evidence: `<button class="${selector.slice(1)}"></button>`,
    explanation: "Buttons need names.",
    impact: "The button has no accessible name.",
    remediation: "Add a name.",
    confidence: "high",
    kind: "automatic",
  };
}

function result(completedAt: string, findings: Finding[]): ScanResult {
  return {
    schemaVersion: "1.0",
    metadata: {
      scanner: "url",
      target: "https://example.com/page",
      startedAt: completedAt,
      completedAt,
      toolVersion: "0.1.0",
      pagesOrFilesScanned: 1,
      findingOccurrences: findings.length,
      wcagLevel: "AA",
    },
    findings,
    manualChecks: [{ id: "keyboard-focus", category: "Keyboard", title: "Keyboard", description: "Test keyboard access.", wcagLevel: "A", wcag: ["2.1.1"], steps: ["Use Tab."], status: "todo" }],
    notice: "Manual testing remains required.",
  };
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("local scan history", () => {
  it("stores, lists, updates, and deletes runs without using the project directory", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ada-history-"));
    directories.push(directory);
    const saved = await saveScanRun(result("2026-08-30T12:00:00.000Z", [finding("one", ".one")]), directory);
    expect(websiteKey(saved.result.metadata.target)).toBe("https://example.com");
    expect((await listScanRuns("https://example.com/another", directory))[0].id).toBe(saved.id);

    const updated = await updateRunReview(saved.id, { completedManualIds: ["keyboard-focus", "unknown"], notes: " Reviewed with keyboard. " }, directory);
    expect(updated.review).toEqual({ completedManualIds: ["keyboard-focus"], notes: "Reviewed with keyboard." });
    expect((await getScanRun(saved.id, directory))?.review.notes).toBe("Reviewed with keyboard.");

    expect(await deleteScanRun(saved.id, directory)).toBe(true);
    expect(await deleteScanRun(saved.id, directory)).toBe(false);
  });

  it("ignores corrupt history files and compares new, existing, and resolved findings", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ada-history-"));
    directories.push(directory);
    await writeFile(join(directory, "00000000-0000-0000-0000-000000000000.json"), "not json", "utf8");
    const base = await saveScanRun(result("2026-08-29T12:00:00.000Z", [finding("existing", ".same"), finding("resolved", ".old")]), directory);
    const currentFinding = { ...finding("representative-changed", ".same"), occurrences: [{ fingerprint: "existing", location: { url: "https://example.com/", selector: ".same" } }] };
    const current = await saveScanRun(result("2026-08-30T12:00:00.000Z", [currentFinding, finding("new", ".new")]), directory);
    const comparison = compareScanRuns(current, base);

    expect((await listScanRuns(undefined, directory)).map((run) => run.id)).toEqual([current.id, base.id]);
    expect(comparison.statuses).toEqual({ "representative-changed": "existing", new: "new" });
    expect({ new: comparison.newCount, existing: comparison.existingCount, resolved: comparison.resolvedCount }).toEqual({ new: 1, existing: 1, resolved: 1 });
    expect(comparison.resolvedFindings[0].fingerprint).toBe("resolved");
  });
});
