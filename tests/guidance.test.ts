import { describe, expect, it } from "vitest";
import { buildGroupRemediationPrompt, buildRemediationGuidance, buildRemediationPrompt, findingIssueCategory, findingRemediationTheme, remediationSummary } from "../src/guidance.js";
import { buildCodeSuggestion } from "../src/suggestions.js";
import type { Finding } from "../src/types.js";

describe("remediation guidance", () => {
  it("preserves the exact axe failure and pairs it with a concrete code direction", () => {
    const evidence = '<button role="menuitem" aria-posinset="1">Products</button>';
    const guidance = buildRemediationGuidance({
      ruleId: "aria-required-parent",
      title: "Certain ARIA roles must be contained by particular parents",
      failureSummary: "Fix any of the following:\n  Required ARIA parent role not present: menu, menubar",
      evidence,
      selector: '.nav > button[role="menuitem"]',
      codeSuggestion: buildCodeSuggestion("aria-required-parent", evidence),
    });

    expect(guidance.inspect).toContain("Failed condition: Required ARIA parent role not present: menu, menubar");
    expect(guidance.change[0]).toContain("native buttons and links");
    expect(guidance.verify[0]).toContain("aria-required-parent");
    expect(remediationSummary(guidance)).not.toContain("apply the most appropriate code change");
  });

  it("gives useful rule-family steps when an automatic patch is unsafe", () => {
    const guidance = buildRemediationGuidance({
      ruleId: "heading-order",
      title: "Heading levels should only increase by one",
      failureSummary: "Fix any of the following:\n  Heading order is not logical",
      evidence: "<h4>Services</h4>",
      selector: "main > h4",
    });

    expect(guidance.inspect[0]).toContain("<h4>");
    expect(guidance.change.join(" ")).toContain("document outline");
    expect(guidance.verify).toHaveLength(3);
  });

  it("carries decorative-separator analysis into the recommended fix", () => {
    const evidence = '<div class="fl-module fl-module-separator" aria-label="Separator"><div class="fl-separator"></div></div>';
    const guidance = buildRemediationGuidance({
      ruleId: "aria-prohibited-attr",
      title: "Elements must only use permitted ARIA attributes",
      failureSummary: "Fix all of the following:\n  aria-label attribute cannot be used on a div with no valid role attribute.",
      evidence,
      selector: ".fl-module-separator",
      codeSuggestion: buildCodeSuggestion("aria-prohibited-attr", evidence),
    });

    expect(guidance.inspect).toContain("Failed condition: aria-label attribute cannot be used on a div with no valid role attribute.");
    expect(guidance.change[0]).toContain("appears to be a visual separator");
    expect(guidance.change.join(" ")).toContain("<hr>");
    expect(remediationSummary(guidance)).toContain("remove aria-label");
  });

  it("classifies findings and builds a technology-agnostic coding-agent prompt", () => {
    const finding: Finding = {
      fingerprint: "contrast",
      ruleId: "color-contrast",
      title: "Elements must meet minimum color contrast ratio thresholds",
      severity: "serious",
      wcagLevel: "AA",
      wcag: ["WCAG 1.4.3"],
      location: { url: "https://example.com/", selector: ".hero strong" },
      evidence: '<strong style="color:#999">Read more</strong>',
      explanation: "Text must have sufficient contrast.",
      impact: "Element has insufficient color contrast of 2.8:1.",
      remediation: "Increase the contrast ratio.",
      remediationGuidance: { inspect: ["Inspect computed colors."], change: ["Update the foreground or background color."], verify: ["Measure the final computed contrast ratio."] },
      confidence: "high",
      kind: "automatic",
    };

    expect(findingIssueCategory(finding)).toBe("Color");
    const prompt = buildRemediationPrompt(finding);
    expect(prompt).toContain("implementation technology is unknown");
    expect(prompt).toContain("Issue category: Color");
    expect(prompt).toContain("Affected selector: .hero strong");
    expect(prompt).toContain("Do not hide the element, suppress the scanner rule");
    expect(findingRemediationTheme(finding)).toMatchObject({ key: "color-contrast", name: "Color contrast" });

    const second = { ...finding, fingerprint: "contrast-2", location: { url: "https://example.com/about", selector: ".card p" } };
    const groupPrompt = buildGroupRemediationPrompt({
      id: "pattern-color",
      kind: "pattern",
      name: "Color contrast",
      category: "Color",
      findingFingerprints: [finding.fingerprint, second.fingerprint],
      pages: [finding.location.url!, second.location.url!],
      sharedCorrections: [],
    }, [finding, second]);
    expect(groupPrompt).toContain("Fix all accessibility findings");
    expect(groupPrompt).toContain("1. Elements must meet minimum color contrast ratio thresholds");
    expect(groupPrompt).toContain("2. Elements must meet minimum color contrast ratio thresholds");
    expect(groupPrompt).toContain("Selector: .card p");
  });
});
