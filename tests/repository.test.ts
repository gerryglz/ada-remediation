import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyFixes, proposeFixes } from "../src/remediation.js";
import { scanRepository } from "../src/scanners/repository.js";

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("repository scanner", () => {
  it("finds common accessibility issues with source locations", async () => {
    const result = await scanRepository("tests/fixtures/inaccessible");
    const ruleIds = new Set(result.findings.map((finding) => finding.ruleId));
    expect(result.metadata.pagesOrFilesScanned).toBe(1);
    expect(ruleIds.has("html-has-lang")).toBe(true);
    expect(ruleIds.has("image-alt")).toBe(true);
    expect(ruleIds.has("button-name")).toBe(true);
    expect(ruleIds.has("form-label")).toBe(true);
    expect(ruleIds.has("duplicate-id")).toBe(true);
    expect(result.findings.every((finding) => finding.location.line && finding.location.file)).toBe(true);
    expect(result.findings.every((finding) => finding.wcagLevel === "A")).toBe(true);
    expect(result.manualChecks.length).toBeGreaterThan(0);
    expect(result.manualChecks.some((check) => check.id === "keyboard-focus")).toBe(true);
  });

  it("does not report the covered rules for the accessible fixture", async () => {
    const result = await scanRepository("tests/fixtures/accessible");
    expect(result.findings).toHaveLength(0);
  });

  it("previews and applies three kinds of semantics-preserving fixes", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ada-assistant-"));
    temporaryDirectories.push(directory);
    const source = '<!doctype html><html lang="en"><body><button role="button" aria-labelledby="" aria-describedby="">Save</button></body></html>';
    await writeFile(path.join(directory, "index.html"), source, "utf8");
    const result = await scanRepository(directory);
    const changes = await proposeFixes(result);
    expect(changes).toHaveLength(1);
    expect(changes[0].findings).toHaveLength(3);
    expect(await readFile(path.join(directory, "index.html"), "utf8")).toBe(source);
    await applyFixes(changes);
    const fixed = await readFile(path.join(directory, "index.html"), "utf8");
    expect(fixed).not.toContain("role=");
    expect(fixed).not.toContain("aria-labelledby");
    expect(fixed).not.toContain("aria-describedby");
  });
});
