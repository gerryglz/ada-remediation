import { describe, expect, it } from "vitest";
import { buildRemediationGuidance, remediationSummary } from "../src/guidance.js";
import { buildCodeSuggestion } from "../src/suggestions.js";

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
});
