import type { CodeSuggestion, Finding, FindingIssueCategory, RemediationGuidance } from "./types.js";

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
  const steps = [
    `Run the ${ruleId} automated check again and confirm this selector is no longer reported.`,
    "Inspect the browser accessibility tree and confirm the element exposes the intended name, role, state, relationships, and reading order.",
  ];
  if (/contrast|link-in-text-block/.test(ruleId)) {
    steps.splice(1, 0, "Measure the final computed colors in every interactive state and confirm the ratio meets the target shown in the report.");
  } else if (/aria|name|label|role|tabindex|focus|keyboard|link|button/.test(ruleId)) {
    steps.splice(1, 0, "Operate the component using only a keyboard, then check its announcement with a screen reader.");
  } else {
    steps.splice(1, 0, "Review the affected content at common viewport sizes and zoom levels to make sure the change preserves its meaning and operation.");
  }
  return steps;
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
