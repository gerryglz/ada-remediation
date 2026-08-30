import type { CodeSuggestion, Finding, FindingGroup, FindingIssueCategory, RemediationGuidance } from "./types.js";

export interface GuidanceInput {
  ruleId: string;
  title: string;
  failureSummary?: string;
  evidence: string;
  selector: string;
  codeSuggestion?: CodeSuggestion;
}

function failedConditions(summary: string | undefined): string[] {
  if (!summary) return [];
  return summary
    .replace(/^Fix (?:any|all) of the following:\s*/i, "")
    .split(/\n+/)
    .map((item) => item.replace(/^\s*[-•]?\s*/, "").trim())
    .filter(Boolean);
}

function elementName(markup: string): string {
  const tag = markup.match(/^\s*<([a-z0-9-]+)/i)?.[1];
  return tag ? `<${tag}>` : "element";
}

function ruleSpecificChanges(ruleId: string): string[] {
  if (ruleId === "aria-prohibited-attr") {
    return [
      "Decide whether the affected element is only a visual or layout wrapper. If it is decorative, remove the prohibited aria-* attribute instead of adding semantics that the element does not need.",
      "If the element represents a real control, landmark, separator, or other semantic object, use the native HTML element that matches its purpose. Add a role only when the behavior truly implements that role.",
    ];
  }
  if (ruleId.startsWith("aria-") || ruleId.includes("role")) {
    return [
      "Prefer the native HTML element whose built-in semantics match the component. If ARIA is necessary, correct the role, required parent/child relationship, referenced IDs, and permitted aria-* values identified above.",
      "Do not add or remove ARIA only to silence the scanner; confirm the resulting name, role, state, and keyboard behavior in the accessibility tree.",
    ];
  }
  if (/name|label/.test(ruleId)) {
    return [
      "Give the control a concise visible label that describes its purpose. Associate labels with form controls using matching for/id values.",
      "Use aria-label or aria-labelledby only when a suitable visible label is not practical, and make sure referenced IDs exist and are unique.",
    ];
  }
  if (/image|object|svg|alt/.test(ruleId)) {
    return [
      "Provide concise author-approved alternative text for informative content. Use an empty alt attribute only when the image is genuinely decorative.",
      "For complex images or embedded content, provide an adjacent long description or an equivalent accessible alternative.",
    ];
  }
  if (/contrast|link-in-text-block/.test(ruleId)) {
    return [
      "Change the actual foreground, background, border, or adjacent-link styling responsible for the failed contrast condition.",
      "Check the computed styles in default, hover, focus, active, visited, disabled, and error states; do not judge the design token or hex value in isolation.",
    ];
  }
  if (/heading/.test(ruleId)) {
    return [
      "Use heading elements for section titles and arrange their levels to reflect the document outline without choosing levels for visual size alone.",
      "Change appearance with CSS rather than replacing or skipping semantic heading levels.",
    ];
  }
  if (/landmark|region|main/.test(ruleId)) {
    return [
      "Place the content inside the appropriate native landmark such as header, nav, main, aside, or footer, and keep one primary main region per page.",
      "When multiple landmarks have the same type, give each a unique accessible label that describes its purpose.",
    ];
  }
  if (/list|definition|dlitem/.test(ruleId)) {
    return [
      "Restore valid list structure: list items must be owned by the correct ul, ol, or menu parent, and description terms/details must remain inside a dl.",
      "Remove presentational roles that hide required list semantics unless an equivalent accessible structure is supplied.",
    ];
  }
  if (/table|th-has-data-cells|td-headers/.test(ruleId)) {
    return [
      "Use th cells for row or column headers and associate complex data cells with their headers using scope or matching headers/id values.",
      "Keep the visual table order aligned with the programmatic reading order and provide a concise caption when it helps identify the table.",
    ];
  }
  if (/duplicate-id/.test(ruleId)) {
    return [
      "Rename the duplicated id so it is unique on the page, then update every for, href fragment, aria-labelledby, aria-describedby, and script reference that points to it.",
    ];
  }
  if (/tabindex|focus|keyboard|scrollable-region-focusable/.test(ruleId)) {
    return [
      "Use native interactive elements and natural DOM order. Remove positive tabindex values and make custom controls keyboard operable only when a native control cannot be used.",
      "Keep a visible focus indicator and ensure focus does not become trapped or move unexpectedly.",
    ];
  }
  if (/document-title|html-has-lang|valid-lang/.test(ruleId)) {
    return [
      "Correct the document-level metadata identified by the failed condition, using a unique descriptive title and valid language code that match the page content.",
    ];
  }
  return [
    "Make the smallest markup, content, or CSS change that directly resolves every failed condition listed above. Use the linked W3C requirement to confirm the intended behavior before changing the component.",
    "Do not hide the element from assistive technology or disable the rule unless the content is truly unavailable to every user and the product requirement supports that decision.",
  ];
}

function verificationSteps(ruleId: string): string[] {
  if (/contrast|link-in-text-block/.test(ruleId)) {
    return [
      `Run the ${ruleId} automated check again and confirm this selector is no longer reported.`,
      "Measure the final computed foreground and background colors and confirm the ratio meets the target shown in the report.",
      "Recheck default, hover, focus, active, visited, disabled, and error states that apply to the element.",
    ];
  }
  if (/aria|name|label|role|tabindex|focus|keyboard|link|button/.test(ruleId)) {
    return [
      `Run the ${ruleId} automated check again and confirm this selector is no longer reported.`,
      "Operate the component using only a keyboard, then check its announcement with a screen reader.",
      "Inspect the browser accessibility tree and confirm the intended name, role, state, and relationships.",
    ];
  }
  return [
    `Run the ${ruleId} automated check again and confirm this selector is no longer reported.`,
    "Review the affected content at common viewport sizes and zoom levels to make sure the change preserves its meaning and operation.",
    "Inspect the rendered DOM and browser accessibility tree to confirm the intended semantics and reading order.",
  ];
}

export function buildRemediationGuidance(input: GuidanceInput): RemediationGuidance {
  const conditions = failedConditions(input.failureSummary);
  const inspect = [
    `Locate the ${elementName(input.evidence)} element at ${input.selector} and review it together with its parent, children, labels, and computed styles.`,
    ...(conditions.length ? conditions.map((condition) => `Failed condition: ${condition}`) : [`Check why the element fails “${input.title}” in its rendered context.`]),
  ];
  const change = input.codeSuggestion
    ? [input.codeSuggestion.rationale, ...(input.codeSuggestion.alternatives ?? [])]
    : ruleSpecificChanges(input.ruleId);
  return { inspect, change, verify: verificationSteps(input.ruleId) };
}

export function remediationSummary(guidance: RemediationGuidance): string {
  const failedCondition = guidance.inspect.find((item) => item.startsWith("Failed condition:"));
  return [failedCondition, guidance.change[0]].filter(Boolean).join(" ");
}

export function findingIssueCategory(finding: Pick<Finding, "ruleId" | "title" | "evidence" | "location">): FindingIssueCategory {
  const context = [finding.ruleId, finding.title, finding.evidence, finding.location.selector].filter(Boolean).join(" ").toLowerCase();
  if (/contrast|color|colour|link-in-text-block/.test(context)) return "Color";
  if (/aria|\brole\b/.test(context)) return "ARIA";
  if (/keyboard|focus|tabindex|bypass|skip-link/.test(context)) return "Keyboard";
  if (/image|\bimg\b|svg|video|audio|object|alt\b|caption/.test(context)) return "Media";
  if (/form|input|select|textarea|fieldset|legend|label/.test(context)) return "Forms";
  if (/\blang\b|language|html-has-lang|valid-lang/.test(context)) return "Language";
  if (/motion|animation|blink|marquee|meta-refresh/.test(context)) return "Motion";
  if (/navigation|\bnav\b|link|anchor/.test(context)) return "Navigation";
  if (/heading|landmark|region|list|table|definition|document-title|page-has-heading/.test(context)) return "Structure";
  return "Content";
}

export function findingRemediationTheme(finding: Pick<Finding, "ruleId" | "title" | "evidence" | "location">): { key: string; name: string; category: FindingIssueCategory } {
  const rule = finding.ruleId.toLowerCase();
  const category = findingIssueCategory(finding);
  const namedThemes: Array<[RegExp, string, string]> = [
    [/^color-contrast(?:-enhanced)?$|link-in-text-block/, "color-contrast", "Color contrast"],
    [/aria-required-parent|aria-required-children|aria-required-attr/, "aria-relationships", "ARIA relationships"],
    [/^aria-|role/, "aria-semantics", "ARIA roles and attributes"],
    [/label|accessible-name|button-name|link-name|input-button-name/, "accessible-names", "Accessible names and labels"],
    [/image-alt|object-alt|svg-img-alt|area-alt/, "media-alternatives", "Image and media alternatives"],
    [/heading|page-has-heading-one/, "heading-structure", "Heading structure"],
    [/landmark|region|bypass|main/, "page-landmarks", "Page landmarks and navigation"],
    [/list|definition|dlitem/, "list-structure", "List structure"],
    [/table|th-has-data-cells|td-headers|scope-attr-valid/, "table-structure", "Table structure"],
    [/keyboard|focus|tabindex|scrollable-region-focusable/, "keyboard-focus", "Keyboard and focus"],
    [/html-has-lang|valid-lang|document-title/, "page-metadata", "Page language and title"],
    [/duplicate-id/, "unique-ids", "Unique element IDs"],
    [/link|button/, "interactive-controls", "Links and controls"],
  ];
  const match = namedThemes.find(([pattern]) => pattern.test(rule));
  if (match) return { key: match[1], name: match[2], category };
  const readableRule = rule.split("-").filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
  return { key: `rule-${rule}`, name: readableRule || `${category} issues`, category };
}

export function buildRemediationPrompt(finding: Finding): string {
  const guidance = finding.remediationGuidance;
  const location = finding.location.url
    ? `Page URL: ${finding.location.url}`
    : `Source file: ${finding.location.file ?? "Locate this finding in the project"}${finding.location.line ? `:${finding.location.line}` : ""}`;
  const changes = guidance?.change?.length ? guidance.change : [finding.remediation];
  const verification = guidance?.verify?.length
    ? guidance.verify
    : ["Retest the affected element with the automated rule, keyboard navigation, and relevant assistive technology."];
  return [
    "Fix the following web accessibility finding in this project.",
    "",
    "The implementation technology is unknown. First identify the framework, CMS, template, component, or stylesheet that produces the affected rendered element. Follow the project's existing conventions and make the change in the reusable source component when appropriate; do not patch only generated output unless that is the actual maintained source.",
    "",
    `Issue category: ${finding.issueCategory ?? findingIssueCategory(finding)}`,
    `Finding: ${finding.title}`,
    `Severity: ${finding.severity}`,
    `WCAG 2.2 criteria: ${finding.wcag.length ? finding.wcag.join(", ") : "Not mapped"}`,
    `Automated rule: ${finding.ruleId}`,
    location,
    `Affected selector: ${finding.location.selector ?? "Not provided"}`,
    `Detected markup: ${finding.evidence}`,
    `Failed condition: ${finding.impact}`,
    "",
    "Recommended direction:",
    ...changes.map((item) => `- ${item}`),
    ...(finding.codeSuggestion ? ["", `Suggested starting point: ${finding.codeSuggestion.after}`] : []),
    "",
    "Requirements:",
    "- Preserve the intended content, visual design, and user behavior unless the accessibility correction requires a deliberate change.",
    "- Prefer native HTML semantics before adding ARIA. Do not hide the element, suppress the scanner rule, or weaken the test merely to remove the finding.",
    "- Check whether the same reusable component or pattern appears elsewhere and apply the correction consistently.",
    "- Explain which source files were changed and why the solution is appropriate for the detected technology.",
    "",
    "Verification:",
    ...verification.map((item) => `- ${item}`),
  ].join("\n");
}

export function buildGroupRemediationPrompt(group: FindingGroup, findings: Finding[]): string {
  const kind = group.kind === "pattern" ? "related accessibility pattern" : "shared website component";
  const pages = [...new Set(findings.flatMap((finding) => (finding.occurrences ?? [{ fingerprint: finding.fingerprint, location: finding.location }]).map((item) => item.location.url)).filter((url): url is string => Boolean(url)))];
  const corrections = [...new Set(findings.flatMap((finding) => finding.remediationGuidance?.change?.length ? finding.remediationGuidance.change : [finding.remediation]).filter(Boolean))];
  const verification = [...new Set(findings.flatMap((finding) => finding.remediationGuidance?.verify ?? []))];
  const childDetails = findings.flatMap((finding, index) => [
    `${index + 1}. ${finding.title}`,
    `   Category: ${finding.issueCategory ?? findingIssueCategory(finding)}`,
    `   Severity: ${finding.severity}`,
    `   WCAG 2.2 criteria: ${finding.wcag.length ? finding.wcag.join(", ") : "Not mapped"}`,
    `   Automated rule: ${finding.ruleId}`,
    `   Page: ${finding.location.url ?? finding.location.file ?? "Locate in the project"}`,
    `   Selector: ${finding.location.selector ?? "Not provided"}`,
    `   Failed condition: ${finding.impact}`,
    `   Detected markup: ${finding.evidence}`,
  ]);
  return [
    `Fix all accessibility findings in this ${kind}: ${group.name}.`,
    "",
    "The implementation technology is unknown. First identify the framework, CMS, template, component, or stylesheet that produces these rendered elements. Find the maintained reusable source and make a coordinated correction there instead of applying unrelated page-by-page patches.",
    "",
    `Group type: ${group.kind === "pattern" ? "Shared remediation theme" : "Owning component"}`,
    `Theme: ${group.name}`,
    `Category: ${group.category}`,
    ...(group.selector ? [`Owning component selector: ${group.selector}`] : []),
    `Affected pages (${pages.length}): ${pages.length ? pages.join(", ") : "Review the source locations below"}`,
    `Child findings: ${findings.length}`,
    "",
    "Findings to resolve:",
    ...childDetails,
    "",
    "Recommended direction:",
    ...corrections.map((item) => `- ${item}`),
    "",
    "Requirements:",
    "- Treat the findings as one coordinated remediation task, but verify that every listed selector and failed condition is resolved.",
    "- Preserve intended content, visual design, and behavior unless an accessibility correction requires a deliberate change.",
    "- Prefer native HTML semantics before ARIA. Do not hide elements, suppress scanner rules, or weaken tests to remove findings.",
    "- Check every use of the shared component or pattern across the project and explain which maintained source files were changed.",
    "",
    "Verification:",
    ...(verification.length ? verification.map((item) => `- ${item}`) : ["- Rerun every listed automated rule for each affected page and selector."]),
    "- Retest every affected page and confirm all child findings are resolved without introducing regressions.",
  ].join("\n");
}
