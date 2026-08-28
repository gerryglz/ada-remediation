import type { Confidence, Finding, FindingKind, SafeFix, Severity, WcagLevel } from "./types.js";
import { buildCodeSuggestion } from "./suggestions.js";
import { fingerprintFinding } from "./utils.js";

export interface RuleDefinition {
  title: string;
  severity: Severity;
  wcagLevel: WcagLevel;
  wcag: string[];
  explanation: string;
  impact: string;
  remediation: string;
  confidence: Confidence;
  kind: FindingKind;
}

export const rules: Record<string, RuleDefinition> = {
  "html-has-lang": {
    title: "Document language is missing",
    severity: "serious",
    wcagLevel: "A",
    wcag: ["3.1.1"],
    explanation: "The root html element does not declare a document language.",
    impact: "Screen readers may pronounce the page using the wrong language rules.",
    remediation: "Set the html lang attribute to the page's actual primary language, such as lang=\"en\".",
    confidence: "high",
    kind: "automatic",
  },
  "image-alt": {
    title: "Image is missing an alt attribute",
    severity: "critical",
    wcagLevel: "A",
    wcag: ["1.1.1"],
    explanation: "An img element has no alt attribute.",
    impact: "People using screen readers may not receive the information conveyed by the image.",
    remediation: "Provide concise equivalent text for an informative image, or alt=\"\" only when the image is genuinely decorative.",
    confidence: "high",
    kind: "automatic",
  },
  "button-name": {
    title: "Button has no accessible name",
    severity: "critical",
    wcagLevel: "A",
    wcag: ["4.1.2"],
    explanation: "The button has no visible text or accessible labeling attribute.",
    impact: "Screen-reader users cannot determine what the control does.",
    remediation: "Add descriptive visible text or an accurate aria-label when visible text is not possible.",
    confidence: "medium",
    kind: "automatic",
  },
  "link-name": {
    title: "Link has no accessible name",
    severity: "serious",
    wcagLevel: "A",
    wcag: ["2.4.4", "4.1.2"],
    explanation: "The link has no visible text or accessible label.",
    impact: "Keyboard and screen-reader users cannot identify the link's purpose.",
    remediation: "Add meaningful link text or an accurate accessible name.",
    confidence: "medium",
    kind: "automatic",
  },
  "form-label": {
    title: "Form control may not have a label",
    severity: "critical",
    wcagLevel: "A",
    wcag: ["1.3.1", "3.3.2", "4.1.2"],
    explanation: "A form control is not associated with a label and has no accessible labeling attribute.",
    impact: "Users of assistive technology may not know what information the field expects.",
    remediation: "Associate a visible label using for/id, wrap the control in a label, or use another accurate labeling method.",
    confidence: "medium",
    kind: "automatic",
  },
  "duplicate-id": {
    title: "Document contains a duplicate ID",
    severity: "serious",
    wcagLevel: "A",
    wcag: ["4.1.2"],
    explanation: "An id value is used by more than one element in the document.",
    impact: "Label and ARIA references can resolve to the wrong element.",
    remediation: "Assign unique IDs and update every label, fragment, and ARIA reference that uses them.",
    confidence: "high",
    kind: "automatic",
  },
  "positive-tabindex": {
    title: "Element uses a positive tabindex",
    severity: "serious",
    wcagLevel: "A",
    wcag: ["2.4.3"],
    explanation: "A positive tabindex creates a custom focus order that can conflict with the visual and DOM order.",
    impact: "Keyboard users may encounter a confusing or unpredictable navigation sequence.",
    remediation: "Prefer natural DOM order and tabindex=\"0\" only for custom interactive elements that must enter the tab sequence.",
    confidence: "high",
    kind: "automatic",
  },
  "empty-aria-labelledby": {
    title: "Empty aria-labelledby has no effect",
    severity: "moderate",
    wcagLevel: "A",
    wcag: ["4.1.2"],
    explanation: "The aria-labelledby attribute is empty and cannot reference a label.",
    impact: "The intended accessible name may be absent or fall back unpredictably.",
    remediation: "Provide valid element IDs when labeling is intended; otherwise remove the empty attribute.",
    confidence: "high",
    kind: "automatic",
  },
  "empty-aria-describedby": {
    title: "Empty aria-describedby has no effect",
    severity: "moderate",
    wcagLevel: "A",
    wcag: ["1.3.1", "4.1.2"],
    explanation: "The aria-describedby attribute is empty and cannot reference a description.",
    impact: "Assistive technology will not receive the intended supporting description.",
    remediation: "Provide valid element IDs when a description is intended; otherwise remove the empty attribute.",
    confidence: "high",
    kind: "automatic",
  },
  "redundant-role": {
    title: "Explicit role duplicates native semantics",
    severity: "minor",
    wcagLevel: "A",
    wcag: ["4.1.2"],
    explanation: "The explicit role is identical to the element's native semantic role.",
    impact: "Redundant ARIA increases maintenance risk without improving accessibility.",
    remediation: "Remove the redundant role and rely on the native HTML element.",
    confidence: "high",
    kind: "automatic",
  },
};

export function createFinding(
  ruleId: string,
  location: Finding["location"],
  evidence: string,
  safeFix?: SafeFix,
): Finding {
  const rule = rules[ruleId];
  if (!rule) throw new Error(`Unknown accessibility rule: ${ruleId}`);
  return {
    fingerprint: fingerprintFinding(ruleId, location, evidence),
    ruleId,
    ...rule,
    location,
    evidence,
    codeSuggestion: buildCodeSuggestion(ruleId, evidence),
    safeFix,
  };
}
