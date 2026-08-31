import { randomBytes } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface UiRuntimeRecord {
  schemaVersion: "1.0";
  pid: number;
  url: string;
  startedAt: string;
  shutdownToken: string;
}

export interface StopUiResult {
  status: "stopped" | "not-running";
  url?: string;
}

export function defaultUiRuntimePath(): string {
  return join(homedir(), ".ada-remediation", "ui-server.json");
}

export function createUiRuntimeRecord(url: string): UiRuntimeRecord {
  return {
    schemaVersion: "1.0",
    pid: process.pid,
    url,
    startedAt: new Date().toISOString(),
    shutdownToken: randomBytes(32).toString("hex"),
  };
}

export async function readUiRuntime(path = defaultUiRuntimePath()): Promise<UiRuntimeRecord | undefined> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as Partial<UiRuntimeRecord>;
    return value.schemaVersion === "1.0"
      && Number.isInteger(value.pid)
      && typeof value.url === "string"
      && typeof value.startedAt === "string"
      && typeof value.shutdownToken === "string"
      ? value as UiRuntimeRecord
      : undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    return undefined;
  }
}

export async function writeUiRuntime(record: UiRuntimeRecord, path = defaultUiRuntimePath()): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(record, null, 2), { encoding: "utf8", mode: 0o600 });
}

export async function removeUiRuntime(path = defaultUiRuntimePath(), expectedToken?: string): Promise<void> {
  if (expectedToken) {
    const current = await readUiRuntime(path);
    if (current && current.shutdownToken !== expectedToken) return;
  }
  await rm(path, { force: true });
}

export function removeCurrentUiRuntimeSync(path = defaultUiRuntimePath()): void {
  try {
    const current = JSON.parse(readFileSync(path, "utf8")) as Partial<UiRuntimeRecord>;
    if (current.pid === process.pid) rmSync(path, { force: true });
  } catch {
    // Missing or invalid runtime state is already equivalent to cleanup.
  }
}

export async function isUiRuntimeActive(record: UiRuntimeRecord): Promise<boolean> {
  try {
    const response = await fetch(`${record.url}/api/runtime`, { signal: AbortSignal.timeout(1_500) });
    if (!response.ok) return false;
    const value = await response.json() as Partial<UiRuntimeRecord>;
    return value.pid === record.pid && value.startedAt === record.startedAt;
  } catch {
    return false;
  }
}

export async function prepareUiRuntime(path = defaultUiRuntimePath()): Promise<void> {
  const existing = await readUiRuntime(path);
  if (!existing) {
    await removeUiRuntime(path);
    return;
  }
  if (await isUiRuntimeActive(existing)) {
    throw new Error(`ADA Assistant is already running at ${existing.url}. Use \"npm run ui:stop\" before starting another dashboard.`);
  }
  await removeUiRuntime(path, existing.shutdownToken);
}

export async function stopUiServer(path = defaultUiRuntimePath()): Promise<StopUiResult> {
  const record = await readUiRuntime(path);
  if (!record) {
    await removeUiRuntime(path);
    return { status: "not-running" };
  }
  try {
    const response = await fetch(`${record.url}/api/shutdown`, {
      method: "POST",
      headers: { "X-ADA-Shutdown-Token": record.shutdownToken },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`Dashboard returned HTTP ${response.status}.`);
    for (let attempt = 0; attempt < 20 && await readUiRuntime(path); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return { status: "stopped", url: record.url };
  } catch {
    if (!await isUiRuntimeActive(record)) {
      await removeUiRuntime(path, record.shutdownToken);
      return { status: "not-running" };
    }
    throw new Error(`The ADA Assistant dashboard at ${record.url} did not accept the shutdown request. Return to its terminal and press Ctrl+C.`);
  }
}
