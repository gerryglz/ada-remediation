import { describe, expect, it } from "vitest";
import { affectedPageCount, buildFindingGroups, consolidateCommonFindings, findingComponentCategory, findingOccurrenceCount } from "../src/findings.js";
import type { Finding } from "../src/types.js";

function finding(url: string, selector = "nav > button"): Finding {
  return {
    fingerprint: url,
    ruleId: "aria-required-parent",
    title: "ARIA parent missing",
    severity: "critical",
    wcagLevel: "A",
    wcag: ["1.3.1"],
    location: { url, pageTitle: url.split("/").at(-1) || "Home", selector },
    evidence: '<button role="menuitem">Products</button>',
    explanation: "Required parent is missing.",
    impact: "Required ARIA parent role not present.",
    remediation: "Use native navigation semantics.",
    confidence: "high",
    kind: "automatic",
  };
}

describe("common findings", () => {
  it("consolidates matching rendered issues across pages and preserves occurrences", () => {
    const result = consolidateCommonFindings([
      finding("https://example.com/"),
      finding("https://example.com/about"),
      finding("https://example.com/contact"),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].scope).toBe("common");
    expect(result[0].componentCategory).toBe("Navigation menu");
    expect(findingOccurrenceCount(result[0])).toBe(3);
    expect(affectedPageCount(result[0])).toBe(3);
    expect(result[0].occurrences?.map((item) => item.location.url)).toEqual([
      "https://example.com/",
      "https://example.com/about",
      "https://example.com/contact",
    ]);
  });

  it("assigns useful component categories instead of a generic common label", () => {
    expect(findingComponentCategory(finding("https://example.com/"))).toBe("Navigation menu");
    expect(findingComponentCategory({ ...finding("https://example.com/"), ruleId: "image-alt", title: "Images need text", evidence: '<img src="hero.jpg">', location: { url: "https://example.com/", selector: ".hero-image" } })).toBe("Image or media");
    expect(findingComponentCategory({ ...finding("https://example.com/"), ruleId: "heading-order", title: "Heading order", evidence: "<h3>Details</h3>", location: { url: "https://example.com/", selector: "main h3" } })).toBe("Page content");
  });

  it("groups distinct child findings under one detected component and deduplicates shared corrections", () => {
    const component = {
      key: "header-menu|nav|primary",
      category: "Header menu" as const,
      name: "Primary navigation",
      selector: 'nav[aria-label="Primary"]',
      remediationTarget: {
        selector: "ul.primary-menu",
        html: '<ul class="primary-menu" role="presentation">',
        currentRole: "presentation",
        suggestedRoles: ["menu", "menubar", "group"],
        reason: "Nearest rendered container that directly owns multiple failing menuitem elements.",
      },
    };
    const first = { ...finding("https://example.com/", "#products"), component, remediationGuidance: { inspect: [], change: ["Use native navigation links."], verify: [] } };
    const second = { ...finding("https://example.com/about", "#services"), fingerprint: "second", component, remediationGuidance: { inspect: [], change: ["Use native navigation links."], verify: [] } };
    const groups = buildFindingGroups([first, second]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ name: "Primary navigation", category: "Header menu" });
    expect(groups[0].findingFingerprints).toEqual([first.fingerprint, second.fingerprint]);
    expect(groups[0].pages).toEqual(["https://example.com/", "https://example.com/about"]);
    expect(groups[0].remediationTarget).toEqual(component.remediationTarget);
    expect(groups[0].issueClusters).toHaveLength(1);
    expect(groups[0].issueClusters?.[0]).toMatchObject({
      name: "Menu items share one missing required parent",
      ruleId: "aria-required-parent",
      findingFingerprints: [first.fingerprint, second.fingerprint],
      remediationTarget: component.remediationTarget,
    });
    expect(groups[0].issueClusters?.[0].parentResolution).toContain("one owning-container decision");
    expect(groups[0].issueClusters?.[0].parentResolution).toContain("do not add a role to a broad wrapper");
    expect(groups[0].sharedCorrections).toEqual([{
      text: "Use native navigation links.",
      appliesTo: 2,
      findingFingerprints: [first.fingerprint, second.fingerprint],
    }]);
  });

  it("preserves the scanner's semantic component category when consolidating pages", () => {
    const component = { key: "header-menu|nav|primary", category: "Header menu" as const, name: "Primary navigation" };
    const result = consolidateCommonFindings([
      { ...finding("https://example.com/"), component, componentCategory: component.category },
      { ...finding("https://example.com/about"), component, componentCategory: component.category },
    ]);

    expect(result[0].componentCategory).toBe("Header menu");
  });

  it("groups repeated standalone findings by a useful remediation theme", () => {
    const first = { ...finding("https://example.com/", ".hero p"), fingerprint: "contrast-1", component: undefined, ruleId: "color-contrast", title: "Elements must meet minimum color contrast ratio thresholds", evidence: "<p>Welcome</p>" };
    const second = { ...finding("https://example.com/about", ".card p"), fingerprint: "contrast-2", component: undefined, ruleId: "color-contrast", title: "Elements must meet minimum color contrast ratio thresholds", evidence: "<p>About us</p>" };

    const groups = buildFindingGroups([first, second]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ kind: "pattern", name: "Color contrast", category: "Color" });
    expect(groups[0].findingFingerprints).toEqual(["contrast-1", "contrast-2"]);
    expect(groups[0].remediationPrompt).toContain("Findings to resolve:");
    expect(groups[0].remediationPrompt).toContain("Selector: .hero p");
    expect(groups[0].remediationPrompt).toContain("Selector: .card p");
  });

  it("does not merge different selectors or duplicates confined to one page", () => {
    const result = consolidateCommonFindings([
      finding("https://example.com/", "header button"),
      finding("https://example.com/", "footer button"),
    ]);

    expect(result).toHaveLength(2);
    expect(result.every((item) => item.scope !== "common")).toBe(true);
  });
});
