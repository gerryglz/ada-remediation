import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compareScanRuns, comparisonForRun, deleteScanRun, getScanRun, listScanRuns, saveScanRun, scanProfilesCompatible, updateRunReview, websiteKey } from "../src/history.js";
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

    const updated = await updateRunReview(saved.id, {
      manualTasks: {
        "keyboard-focus": { status: "pass", notes: " Tested with NVDA. " },
        unknown: { status: "needs-attention", notes: "Must be discarded." },
      },
      findings: {
        one: { disposition: "action-required", notes: " Fix the shared button component. " },
        unknown: { disposition: "false-positive", notes: "Must be discarded." },
      },
      notes: " Reviewed with keyboard. ",
    }, directory);
    expect(updated.review).toEqual({
      manualTasks: { "keyboard-focus": { status: "pass", notes: "Tested with NVDA." } },
      findings: { one: { disposition: "action-required", notes: "Fix the shared button component." } },
      notes: "Reviewed with keyboard.",
    });
    expect((await getScanRun(saved.id, directory))?.review.notes).toBe("Reviewed with keyboard.");

    expect(await deleteScanRun(saved.id, directory)).toBe(true);
    expect(await deleteScanRun(saved.id, directory)).toBe(false);
  });

  it("loads legacy completed checkboxes without claiming they passed", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ada-history-legacy-"));
    directories.push(directory);
    const saved = await saveScanRun(result("2026-08-30T12:00:00.000Z", []), directory);
    await writeFile(join(directory, `${saved.id}.json`), JSON.stringify({
      ...saved,
      review: { completedManualIds: ["keyboard-focus"], notes: "Legacy review" },
    }), "utf8");

    expect((await getScanRun(saved.id, directory))?.review).toEqual({
      manualTasks: {
        "keyboard-focus": {
          status: "not-tested",
          notes: "Previously marked complete. Classify this review as Pass, Needs attention, or Not applicable.",
        },
      },
      findings: {},
      notes: "Legacy review",
    });
  });

  it("carries finding reviews to stable findings in a compatible rescan", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ada-history-finding-review-"));
    directories.push(directory);
    const base = await saveScanRun(result("2026-08-29T12:00:00.000Z", [finding("stable", ".same")]), directory);
    await updateRunReview(base.id, {
      findings: { stable: { disposition: "accepted-risk", notes: "Approved exception until the shared widget is replaced." } },
    }, directory);
    const changedRepresentative = { ...finding("new-representative", ".same"), occurrences: [{ fingerprint: "stable", location: { url: "https://example.com/", selector: ".same" } }] };
    const current = await saveScanRun(result("2026-08-30T12:00:00.000Z", [changedRepresentative, finding("brand-new", ".new")]), directory);

    expect(current.review.findings).toEqual({
      "new-representative": { disposition: "accepted-risk", notes: "Approved exception until the shared widget is replaced." },
    });
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

  it("only auto-compares runs that used the same disclosure-state setting", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ada-history-interactions-"));
    directories.push(directory);
    const initialOnly = await saveScanRun(result("2026-08-28T12:00:00.000Z", [finding("initial", ".initial")]), directory);
    const interactionResult = result("2026-08-29T12:00:00.000Z", [finding("revealed", ".revealed")]);
    interactionResult.metadata.interactionStatesRequested = true;
    const interactionBase = await saveScanRun(interactionResult, directory);
    const currentResult = result("2026-08-30T12:00:00.000Z", [finding("revealed", ".revealed")]);
    currentResult.metadata.interactionStatesRequested = true;
    const current = await saveScanRun(currentResult, directory);

    expect((await comparisonForRun(current, undefined, directory)).baseRunId).toBe(interactionBase.id);
    await expect(comparisonForRun(current, initialOnly.id, directory)).rejects.toThrow("same saved scan profile");
  });

  it("compares profile-backed runs only when every saved scan setting matches", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ada-history-profiles-"));
    directories.push(directory);
    const base = result("2026-08-29T12:00:00.000Z", [finding("same", ".same")]);
    base.metadata.profile = { target: base.metadata.target, wcagLevel: "AA", crawl: true, maxPages: 10, captureScreenshots: true, interactionStates: false };
    const current = result("2026-08-30T12:00:00.000Z", [finding("same", ".same")]);
    current.metadata.profile = { ...base.metadata.profile };

    expect(scanProfilesCompatible(current.metadata, base.metadata)).toBe(true);
    const savedBase = await saveScanRun(base, directory);
    current.metadata.profile.maxPages = 25;
    expect(scanProfilesCompatible(current.metadata, base.metadata)).toBe(false);
    const savedCurrent = await saveScanRun(current, directory);
    expect((await comparisonForRun(savedCurrent, undefined, directory)).baseRunId).toBeUndefined();
    await expect(comparisonForRun(savedCurrent, savedBase.id, directory)).rejects.toThrow("same saved scan profile");
    current.metadata.profile = undefined;
    expect(scanProfilesCompatible(current.metadata, base.metadata)).toBe(false);
  });
});
