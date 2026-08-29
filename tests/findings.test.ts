import { describe, expect, it } from "vitest";
import { affectedPageCount, consolidateCommonFindings, findingComponentCategory, findingOccurrenceCount } from "../src/findings.js";
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

  it("does not merge different selectors or duplicates confined to one page", () => {
    const result = consolidateCommonFindings([
      finding("https://example.com/", "header button"),
      finding("https://example.com/", "footer button"),
    ]);

    expect(result).toHaveLength(2);
    expect(result.every((item) => item.scope !== "common")).toBe(true);
  });
});
