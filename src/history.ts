import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Finding, ManualReviewStatus, ManualTaskReview, ScanResult, ScanReview } from "./types.js";

export type FindingHistoryStatus = "new" | "existing";

export type RunReview = ScanReview;

export interface SavedScanRun {
  schemaVersion: "1.0";
  id: string;
  targetKey: string;
  savedAt: string;
  result: ScanResult;
  review: RunReview;
}

export interface ScanRunSummary {
  id: string;
  target: string;
  targetKey: string;
  completedAt: string;
  wcagLevel?: string;
  pagesScanned: number;
  findings: number;
  occurrences: number;
  interactionStatesRequested: boolean;
  manualCompleted: number;
  manualTotal: number;
}

export interface ScanComparison {
  currentRunId: string;
  baseRunId?: string;
  currentCompletedAt: string;
  baseCompletedAt?: string;
  statuses: Record<string, FindingHistoryStatus>;
  newCount: number;
  existingCount: number;
  resolvedCount: number;
  resolvedFindings: Finding[];
}

function runPath(directory: string, id: string): string {
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error("Invalid scan run ID.");
  return join(directory, `${id}.json`);
}

export function defaultHistoryDirectory(): string {
  return join(homedir(), ".ada-remediation", "history");
}

export function websiteKey(target: string): string {
  try {
    const url = new URL(target);
    return url.origin.toLowerCase();
  } catch {
    return target.trim().toLowerCase();
  }
}

function isSavedScanRun(value: unknown): value is SavedScanRun {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SavedScanRun>;
  return candidate.schemaVersion === "1.0"
    && typeof candidate.id === "string"
    && typeof candidate.targetKey === "string"
    && typeof candidate.savedAt === "string"
    && Boolean(candidate.result?.metadata)
    && Array.isArray(candidate.result?.findings)
    && typeof candidate.review?.notes === "string"
    && (Boolean(candidate.review?.manualTasks && typeof candidate.review.manualTasks === "object")
      || Array.isArray((candidate.review as RunReview & { completedManualIds?: string[] })?.completedManualIds));
}

const manualReviewStatuses = new Set<ManualReviewStatus>(["not-tested", "pass", "needs-attention", "not-applicable"]);

function sanitizeManualReview(value: unknown): ManualTaskReview | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<ManualTaskReview>;
  if (!candidate.status || !manualReviewStatuses.has(candidate.status)) return undefined;
  return { status: candidate.status, notes: typeof candidate.notes === "string" ? candidate.notes.trim().slice(0, 4_000) : "" };
}

function normalizeRun(run: SavedScanRun): SavedScanRun {
  const rawReview = run.review as RunReview & { completedManualIds?: string[] };
  const allowedManualIds = new Set(run.result.manualChecks.map((check) => check.id));
  const manualTasks: Record<string, ManualTaskReview> = {};
  if (rawReview.manualTasks && typeof rawReview.manualTasks === "object") {
    for (const [manualId, value] of Object.entries(rawReview.manualTasks)) {
      const sanitized = sanitizeManualReview(value);
      if (allowedManualIds.has(manualId) && sanitized) manualTasks[manualId] = sanitized;
    }
  } else {
    for (const manualId of rawReview.completedManualIds ?? []) {
      if (allowedManualIds.has(manualId)) manualTasks[manualId] = {
        status: "not-tested",
        notes: "Previously marked complete. Classify this review as Pass, Needs attention, or Not applicable.",
      };
    }
  }
  return { ...run, review: { manualTasks, notes: rawReview.notes.trim().slice(0, 10_000) } };
}

function summary(run: SavedScanRun): ScanRunSummary {
  return {
    id: run.id,
    target: run.result.metadata.target,
    targetKey: run.targetKey,
    completedAt: run.result.metadata.completedAt,
    wcagLevel: run.result.metadata.wcagLevel,
    pagesScanned: run.result.metadata.pagesOrFilesScanned,
    findings: run.result.findings.length,
    occurrences: run.result.metadata.findingOccurrences ?? run.result.findings.reduce((total, finding) => total + (finding.occurrences?.length || 1), 0),
    interactionStatesRequested: Boolean(run.result.metadata.interactionStatesRequested),
    manualCompleted: Object.values(run.review.manualTasks).filter((review) => review.status !== "not-tested").length,
    manualTotal: run.result.manualChecks.length,
  };
}

async function writeRun(directory: string, run: SavedScanRun): Promise<void> {
  await mkdir(directory, { recursive: true });
  const destination = runPath(directory, run.id);
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(run, null, 2), "utf8");
  await rename(temporary, destination);
}

export async function saveScanRun(result: ScanResult, directory = defaultHistoryDirectory()): Promise<SavedScanRun> {
  const run: SavedScanRun = {
    schemaVersion: "1.0",
    id: randomUUID(),
    targetKey: websiteKey(result.metadata.target),
    savedAt: new Date().toISOString(),
    result,
    review: { manualTasks: {}, notes: "" },
  };
  await writeRun(directory, run);
  return run;
}

export async function getScanRun(id: string, directory = defaultHistoryDirectory()): Promise<SavedScanRun | undefined> {
  try {
    const parsed = JSON.parse(await readFile(runPath(directory, id), "utf8")) as unknown;
    return isSavedScanRun(parsed) ? normalizeRun(parsed) : undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function listScanRuns(target?: string, directory = defaultHistoryDirectory()): Promise<ScanRunSummary[]> {
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const targetKey = target ? websiteKey(target) : undefined;
  const runs = await Promise.all(names.filter((name) => /^[a-f0-9-]{36}\.json$/i.test(name)).map(async (name) => {
    try {
      const parsed = JSON.parse(await readFile(join(directory, name), "utf8")) as unknown;
      return isSavedScanRun(parsed) ? normalizeRun(parsed) : undefined;
    } catch {
      return undefined;
    }
  }));
  return runs
    .filter((run): run is SavedScanRun => Boolean(run) && (!targetKey || run!.targetKey === targetKey))
    .sort((left, right) => right.result.metadata.completedAt.localeCompare(left.result.metadata.completedAt))
    .map(summary);
}

export async function updateRunReview(id: string, review: Partial<RunReview>, directory = defaultHistoryDirectory()): Promise<SavedScanRun> {
  const run = await getScanRun(id, directory);
  if (!run) throw new Error("Scan run not found.");
  const allowedManualIds = new Set(run.result.manualChecks.map((check) => check.id));
  const manualTasks = review.manualTasks === undefined ? run.review.manualTasks : Object.fromEntries(Object.entries(review.manualTasks)
    .filter(([manualId, value]) => allowedManualIds.has(manualId) && Boolean(sanitizeManualReview(value)))
    .map(([manualId, value]) => [manualId, sanitizeManualReview(value)!]));
  const notes = review.notes === undefined ? run.review.notes : review.notes.trim().slice(0, 10_000);
  const updated = { ...run, review: { manualTasks, notes } };
  await writeRun(directory, updated);
  return updated;
}

export function reviewedScanResult(run: SavedScanRun): ScanResult {
  return { ...run.result, review: run.review };
}

export async function deleteScanRun(id: string, directory = defaultHistoryDirectory()): Promise<boolean> {
  try {
    await rm(runPath(directory, id));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function findingKeys(finding: Finding): Set<string> {
  return new Set([finding.fingerprint, ...(finding.occurrences ?? []).map((occurrence) => occurrence.fingerprint)]);
}

function findingsOverlap(left: Finding, right: Finding): boolean {
  const rightKeys = findingKeys(right);
  return [...findingKeys(left)].some((key) => rightKeys.has(key));
}

export function compareScanRuns(current: SavedScanRun, base?: SavedScanRun): ScanComparison {
  const statuses: Record<string, FindingHistoryStatus> = {};
  const matchedBase = new Set<string>();
  let newCount = 0;
  let existingCount = 0;
  for (const currentFinding of current.result.findings) {
    const baseFinding = base?.result.findings.find((candidate) => findingsOverlap(currentFinding, candidate));
    if (baseFinding) {
      statuses[currentFinding.fingerprint] = "existing";
      matchedBase.add(baseFinding.fingerprint);
      existingCount += 1;
    } else {
      statuses[currentFinding.fingerprint] = "new";
      newCount += 1;
    }
  }
  const resolvedFindings = base?.result.findings.filter((finding) => !matchedBase.has(finding.fingerprint)) ?? [];
  return {
    currentRunId: current.id,
    baseRunId: base?.id,
    currentCompletedAt: current.result.metadata.completedAt,
    baseCompletedAt: base?.result.metadata.completedAt,
    statuses,
    newCount,
    existingCount,
    resolvedCount: resolvedFindings.length,
    resolvedFindings,
  };
}

export async function comparisonForRun(current: SavedScanRun, baseId: string | undefined, directory = defaultHistoryDirectory()): Promise<ScanComparison> {
  let base = baseId ? await getScanRun(baseId, directory) : undefined;
  if (base && base.targetKey !== current.targetKey) throw new Error("Comparison runs must belong to the same website.");
  if (base && Boolean(base.result.metadata.interactionStatesRequested) !== Boolean(current.result.metadata.interactionStatesRequested)) {
    throw new Error("Comparison runs must use the same disclosure-state scan setting.");
  }
  if (!base && !baseId) {
    const summaries = await listScanRuns(current.result.metadata.target, directory);
    const previous = summaries.find((candidate) => candidate.id !== current.id
      && candidate.completedAt < current.result.metadata.completedAt
      && candidate.interactionStatesRequested === Boolean(current.result.metadata.interactionStatesRequested));
    base = previous ? await getScanRun(previous.id, directory) : undefined;
  }
  return compareScanRuns(current, base);
}
