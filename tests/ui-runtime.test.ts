import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startUiServer } from "../src/ui/server.js";
import { createUiRuntimeRecord, readUiRuntime, stopUiServer, writeUiRuntime } from "../src/ui/runtime.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("dashboard runtime cleanup", () => {
  it("tracks one dashboard instance and stops it through its authenticated local endpoint", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ada-ui-runtime-"));
    directories.push(directory);
    const runtimePath = join(directory, "ui-server.json");
    const dashboard = await startUiServer({ host: "127.0.0.1", port: 0, historyDirectory: join(directory, "history"), runtimePath });
    const runtime = await readUiRuntime(runtimePath);

    expect(runtime).toMatchObject({ pid: process.pid, url: dashboard.url });
    await expect(startUiServer({ host: "127.0.0.1", port: 0, historyDirectory: join(directory, "other-history"), runtimePath }))
      .rejects.toThrow("already running");
    expect((await fetch(`${dashboard.url}/api/shutdown`, { method: "POST" })).status).toBe(403);

    const closed = new Promise<void>((resolve) => dashboard.server.once("close", () => resolve()));
    await expect(stopUiServer(runtimePath)).resolves.toEqual({ status: "stopped", url: dashboard.url });
    await closed;
    expect(await readUiRuntime(runtimePath)).toBeUndefined();
  });

  it("removes a stale runtime record without terminating an unrelated process", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ada-ui-stale-"));
    directories.push(directory);
    const runtimePath = join(directory, "ui-server.json");
    const stale = createUiRuntimeRecord("http://127.0.0.1:9");
    await writeUiRuntime(stale, runtimePath);

    await expect(stopUiServer(runtimePath)).resolves.toEqual({ status: "not-running" });
    expect(await readUiRuntime(runtimePath)).toBeUndefined();
  });
});
