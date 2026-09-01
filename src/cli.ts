#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Command, InvalidArgumentError } from "commander";
import { applyBaseline, createBaseline } from "./baseline.js";
import { applyFixes, formatDiff, proposeFixes } from "./remediation.js";
import { renderReport, writeReport, type ReportFormat } from "./reporters/index.js";
import { scanRepository } from "./scanners/repository.js";
import { scanUrls } from "./scanners/url.js";
import type { ScanResult, Severity, WcagLevel } from "./types.js";
import { removeCurrentUiRuntimeSync, stopUiServer } from "./ui/runtime.js";
import { startUiServer } from "./ui/server.js";
import { hasFindingsAtOrAbove, TOOL_VERSION } from "./utils.js";
import { parseWcagLevel } from "./wcag.js";

const formats = new Set<ReportFormat>(["terminal", "json", "html", "sarif"]);
const severities = new Set<Severity>(["critical", "serious", "moderate", "minor"]);

function reportFormat(value: string): ReportFormat {
  if (!formats.has(value as ReportFormat)) throw new InvalidArgumentError("Use terminal, json, html, or sarif.");
  return value as ReportFormat;
}

function severity(value: string): Severity {
  if (!severities.has(value as Severity)) throw new InvalidArgumentError("Use critical, serious, moderate, or minor.");
  return value as Severity;
}

function wcagLevel(value: string): WcagLevel {
  try {
    return parseWcagLevel(value);
  } catch {
    throw new InvalidArgumentError("Use A, AA, or AAA.");
  }
}

async function loadResult(file: string): Promise<ScanResult> {
  const parsed = JSON.parse(await readFile(path.resolve(file), "utf8")) as ScanResult;
  if (parsed.schemaVersion !== "1.0" || !Array.isArray(parsed.findings)) throw new Error("Unsupported or invalid scan result.");
  return parsed;
}

interface OutputOptions {
  format: ReportFormat;
  output?: string;
  baseline?: string;
  failOn?: Severity;
}

async function finishScan(result: ScanResult, options: OutputOptions): Promise<void> {
  const filtered = await applyBaseline(result, options.baseline);
  await writeReport(renderReport(filtered, options.format), options.output);
  if (options.failOn && hasFindingsAtOrAbove(filtered, options.failOn)) {
    process.exitCode = 2;
  }
}

function addOutputOptions(command: Command): Command {
  return command
    .option("-f, --format <format>", "report format", reportFormat, "terminal")
    .option("-o, --output <file>", "write report to a file")
    .option("--baseline <file>", "omit findings already recorded in a baseline")
    .option("--fail-on <severity>", "exit with code 2 at or above this severity", severity);
}

const program = new Command()
  .name("ada-assistant")
  .description("Audit websites and repositories for accessibility issues, then preview conservative source fixes.")
  .version(TOOL_VERSION)
  .showHelpAfterError();

addOutputOptions(
  program
    .command("scan-repo")
    .description("scan HTML source files in a repository")
    .argument("[directory]", "repository directory", ".")
    .option("--pattern <glob...>", "override source file globs"),
).action(async (directory: string, options: OutputOptions & { pattern?: string[] }) => {
  await finishScan(await scanRepository(directory, { patterns: options.pattern }), options);
});

addOutputOptions(
  program
    .command("scan-url")
    .description("scan one or more rendered URLs with Playwright and axe-core")
    .argument("<urls...>", "URLs to scan")
    .option("--timeout <milliseconds>", "navigation timeout", (value) => Number.parseInt(value, 10), 30_000)
    .option("--storage-state <file>", "Playwright storage state for an authenticated session")
    .option("--wcag-level <level>", "WCAG 2.2 conformance target: A, AA, or AAA", wcagLevel, "AA")
    .option("--interaction-states", "audit up to 10 safe disclosure, tab, and dialog states")
    .option("--no-screenshots", "do not capture highlighted viewport screenshots"),
).action(async (urls: string[], options: OutputOptions & { timeout: number; storageState?: string; screenshots: boolean; wcagLevel: WcagLevel; interactionStates?: boolean }) => {
  await finishScan(
    await scanUrls(urls, {
      timeout: options.timeout,
      storageState: options.storageState,
      wcagLevel: options.wcagLevel,
      captureScreenshots: options.screenshots,
      interactionStateLimit: options.interactionStates ? 10 : 0,
    }),
    options,
  );
});

addOutputOptions(
  program
    .command("scan-site")
    .description("crawl and scan same-origin pages starting at a URL")
    .argument("<url>", "starting URL")
    .option("--max-pages <count>", "maximum pages to scan", (value) => Number.parseInt(value, 10), 25)
    .option("--timeout <milliseconds>", "navigation timeout", (value) => Number.parseInt(value, 10), 30_000)
    .option("--storage-state <file>", "Playwright storage state for an authenticated session")
    .option("--wcag-level <level>", "WCAG 2.2 conformance target: A, AA, or AAA", wcagLevel, "AA")
    .option("--interaction-states", "audit up to 10 safe disclosure, tab, and dialog states per page")
    .option("--no-screenshots", "do not capture highlighted viewport screenshots"),
).action(async (url: string, options: OutputOptions & { maxPages: number; timeout: number; storageState?: string; screenshots: boolean; wcagLevel: WcagLevel; interactionStates?: boolean }) => {
  await finishScan(
    await scanUrls([url], {
      crawl: true,
      maxPages: options.maxPages,
      timeout: options.timeout,
      storageState: options.storageState,
      wcagLevel: options.wcagLevel,
      captureScreenshots: options.screenshots,
      interactionStateLimit: options.interactionStates ? 10 : 0,
    }),
    options,
  );
});

program
  .command("ui")
  .description("start or stop the local website scanning and reporting dashboard")
  .argument("[action]", "start or stop", "start")
  .option("--port <number>", "local dashboard port", (value) => Number.parseInt(value, 10), 4173)
  .option("--host <address>", "listen address", "127.0.0.1")
  .action(async (action: string, options: { port: number; host: string }) => {
    if (action === "stop") {
      const result = await stopUiServer();
      process.stdout.write(result.status === "stopped"
        ? `Stopped the ADA Assistant dashboard at ${result.url}.\n`
        : "No tracked ADA Assistant dashboard is running.\n");
      return;
    }
    if (action !== "start") throw new InvalidArgumentError("Use ui start or ui stop.");
    const handle = await startUiServer({ port: options.port, host: options.host });
    let closing = false;
    const close = () => {
      if (closing) return;
      closing = true;
      removeCurrentUiRuntimeSync();
      handle.server.close();
      handle.server.closeAllConnections();
    };
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
    process.once("exit", () => removeCurrentUiRuntimeSync());
    process.stdout.write(`ADA Assistant dashboard is running at ${handle.url}\nPress Ctrl+C or run \"npm run ui:stop\" from another terminal to stop it.\n`);
  });

program
  .command("report")
  .description("render an existing JSON scan result")
  .argument("<result>", "JSON result file")
  .requiredOption("-f, --format <format>", "terminal, json, html, or sarif", reportFormat)
  .option("-o, --output <file>", "write report to a file")
  .action(async (resultFile: string, options: { format: ReportFormat; output?: string }) => {
    await writeReport(renderReport(await loadResult(resultFile), options.format), options.output);
  });

program
  .command("fix")
  .description("preview or apply deterministic source fixes from a repository scan")
  .argument("<result>", "JSON repository scan result")
  .option("--apply", "apply the proposed changes; otherwise only show diffs")
  .option("-y, --yes", "confirm all proposed changes without an interactive prompt")
  .action(async (resultFile: string, options: { apply?: boolean; yes?: boolean }) => {
    const changes = await proposeFixes(await loadResult(resultFile));
    if (changes.length === 0) {
      process.stdout.write("No applicable safe fixes were found.\n");
      return;
    }
    process.stdout.write(`${changes.map(formatDiff).join("\n\n")}\n\n`);
    if (!options.apply) {
      process.stdout.write("Dry run only. Re-run with --apply to request file changes.\n");
      return;
    }
    let approved = Boolean(options.yes);
    if (!approved) {
      const prompt = createInterface({ input, output });
      approved = (await prompt.question(`Apply changes to ${changes.length} file(s)? [y/N] `)).trim().toLowerCase() === "y";
      prompt.close();
    }
    if (!approved) {
      process.stdout.write("No files changed.\n");
      return;
    }
    await applyFixes(changes);
    process.stdout.write(`Applied ${changes.reduce((total, change) => total + change.findings.length, 0)} fix(es) to ${changes.length} file(s). Re-scan to verify the result.\n`);
  });

const baseline = program.command("baseline").description("manage accepted-finding baselines");
baseline
  .command("create")
  .description("create a baseline from a JSON scan result")
  .argument("<result>", "JSON result file")
  .option("-o, --output <file>", "baseline output path", ".ada-baseline.json")
  .action(async (resultFile: string, options: { output: string }) => {
    const outputFile = path.resolve(options.output);
    await createBaseline(await loadResult(resultFile), outputFile);
    process.stdout.write(`Baseline written to ${outputFile}\n`);
  });

program.parseAsync().catch((error: unknown) => {
  process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
