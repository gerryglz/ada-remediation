import { readFile } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import createIgnore from "ignore";
import { parse } from "parse5";
import { LEGAL_NOTICE, type Finding, type ScanResult, type SafeFix } from "../types.js";
import { createFinding } from "../rules.js";
import { manualReviewChecklist } from "../manual.js";
import { TOOL_VERSION } from "../utils.js";

interface HtmlAttribute {
  name: string;
  value: string;
}

interface HtmlLocation {
  startLine: number;
  startCol: number;
  startOffset: number;
  endOffset: number;
}

interface HtmlNode {
  nodeName: string;
  tagName?: string;
  value?: string;
  attrs?: HtmlAttribute[];
  childNodes?: HtmlNode[];
  parentNode?: HtmlNode;
  sourceCodeLocation?: HtmlLocation & { attrs?: Record<string, HtmlLocation> };
}

const DEFAULT_GLOBS = ["**/*.html", "**/*.htm"];
const DEFAULT_IGNORES = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/.git/**",
  "**/vendor/**",
  "**/*.min.html",
];

function attr(node: HtmlNode, name: string): HtmlAttribute | undefined {
  return node.attrs?.find((item) => item.name.toLowerCase() === name);
}

function textContent(node: HtmlNode): string {
  if (node.nodeName === "#text") return node.value ?? "";
  return (node.childNodes ?? []).map(textContent).join("").trim();
}

function selectorFor(node: HtmlNode): string {
  if (!node.tagName) return node.nodeName;
  const id = attr(node, "id")?.value;
  if (id) return `${node.tagName}#${id}`;
  const classes = attr(node, "class")?.value.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return `${node.tagName}${classes?.length ? `.${classes.join(".")}` : ""}`;
}

function evidenceFor(node: HtmlNode, source: string): string {
  const location = node.sourceCodeLocation;
  if (!location) return `<${node.tagName ?? node.nodeName}>`;
  return source.slice(location.startOffset, Math.min(location.endOffset, location.startOffset + 400)).trim();
}

function implicitRole(node: HtmlNode): string | undefined {
  if (node.tagName === "button") return "button";
  if (node.tagName === "main") return "main";
  if (node.tagName === "nav") return "navigation";
  if (node.tagName === "form") return "form";
  if (node.tagName === "article") return "article";
  if (node.tagName === "a" && attr(node, "href")) return "link";
  return undefined;
}

function safeFix(kind: SafeFix["kind"], attribute: string, expectedValue: string, description: string): SafeFix {
  return { kind, attribute, expectedValue, description };
}

function inspectDocument(document: HtmlNode, source: string, file: string): Finding[] {
  const findings: Finding[] = [];
  const all: HtmlNode[] = [];
  const labelsFor = new Set<string>();
  const ids = new Map<string, HtmlNode[]>();

  const visit = (node: HtmlNode): void => {
    if (node.tagName) {
      all.push(node);
      const id = attr(node, "id")?.value;
      if (id) ids.set(id, [...(ids.get(id) ?? []), node]);
      if (node.tagName === "label") {
        const target = attr(node, "for")?.value;
        if (target) labelsFor.add(target);
      }
    }
    for (const child of node.childNodes ?? []) visit(child);
  };
  visit(document);

  const add = (ruleId: string, node: HtmlNode, fix?: SafeFix): void => {
    const loc = node.sourceCodeLocation;
    findings.push(
      createFinding(
        ruleId,
        { file, line: loc?.startLine, column: loc?.startCol, selector: selectorFor(node) },
        evidenceFor(node, source),
        fix,
      ),
    );
  };

  const html = all.find((node) => node.tagName === "html");
  if (html && !attr(html, "lang")?.value.trim()) add("html-has-lang", html);

  for (const node of all) {
    if (node.tagName === "img" && !attr(node, "alt")) add("image-alt", node);

    if (node.tagName === "button") {
      const named = textContent(node) || attr(node, "aria-label")?.value.trim() || attr(node, "aria-labelledby")?.value.trim();
      if (!named) add("button-name", node);
    }

    if (node.tagName === "a" && attr(node, "href")) {
      const named = textContent(node) || attr(node, "aria-label")?.value.trim() || attr(node, "aria-labelledby")?.value.trim();
      if (!named) add("link-name", node);
    }

    if (["input", "select", "textarea"].includes(node.tagName ?? "")) {
      const inputType = attr(node, "type")?.value.toLowerCase();
      const ignored = node.tagName === "input" && ["hidden", "button", "submit", "reset", "image"].includes(inputType ?? "text");
      const id = attr(node, "id")?.value;
      const wrappedByLabel = node.parentNode?.tagName === "label";
      const named = attr(node, "aria-label")?.value.trim() || attr(node, "aria-labelledby")?.value.trim();
      if (!ignored && !wrappedByLabel && !(id && labelsFor.has(id)) && !named) add("form-label", node);
    }

    const tabindex = attr(node, "tabindex")?.value;
    if (tabindex && Number.parseInt(tabindex, 10) > 0) add("positive-tabindex", node);

    const labelledby = attr(node, "aria-labelledby");
    if (labelledby && labelledby.value.trim() === "") {
      add(
        "empty-aria-labelledby",
        node,
        safeFix("remove-empty-aria-labelledby", "aria-labelledby", labelledby.value, "Remove the empty aria-labelledby attribute."),
      );
    }

    const describedby = attr(node, "aria-describedby");
    if (describedby && describedby.value.trim() === "") {
      add(
        "empty-aria-describedby",
        node,
        safeFix("remove-empty-aria-describedby", "aria-describedby", describedby.value, "Remove the empty aria-describedby attribute."),
      );
    }

    const role = attr(node, "role");
    const nativeRole = implicitRole(node);
    if (role && nativeRole && role.value.toLowerCase() === nativeRole) {
      add(
        "redundant-role",
        node,
        safeFix("remove-redundant-role", "role", role.value, `Remove role=\"${role.value}\" and rely on native semantics.`),
      );
    }
  }

  for (const duplicateNodes of ids.values()) {
    if (duplicateNodes.length > 1) {
      for (const node of duplicateNodes.slice(1)) add("duplicate-id", node);
    }
  }

  return findings;
}

export interface RepositoryScanOptions {
  patterns?: string[];
}

export async function scanRepository(target: string, options: RepositoryScanOptions = {}): Promise<ScanResult> {
  const startedAt = new Date().toISOString();
  const root = path.resolve(target);
  const candidates = await fg(options.patterns ?? DEFAULT_GLOBS, {
    cwd: root,
    absolute: true,
    onlyFiles: true,
    dot: false,
    ignore: DEFAULT_IGNORES,
    followSymbolicLinks: false,
  });
  let gitignore = "";
  try {
    gitignore = await readFile(path.join(root, ".gitignore"), "utf8");
  } catch {
    // A repository is not required to contain a .gitignore file.
  }
  const matcher = createIgnore().add(gitignore);
  const files = candidates.filter((file) => !matcher.ignores(path.relative(root, file).replaceAll("\\", "/")));

  const findings: Finding[] = [];
  for (const absoluteFile of files) {
    const source = await readFile(absoluteFile, "utf8");
    const document = parse(source, { sourceCodeLocationInfo: true }) as unknown as HtmlNode;
    const relativeFile = path.relative(root, absoluteFile).replaceAll("\\", "/");
    findings.push(...inspectDocument(document, source, relativeFile));
  }

  return {
    schemaVersion: "1.0",
    metadata: {
      scanner: "repository",
      target: root,
      startedAt,
      completedAt: new Date().toISOString(),
      toolVersion: TOOL_VERSION,
      pagesOrFilesScanned: files.length,
    },
    findings,
    manualChecks: manualReviewChecklist("AA"),
    notice: LEGAL_NOTICE,
  };
}
