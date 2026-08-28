import { describe, expect, it } from "vitest";
import {
  DEFAULT_WCAG_LEVEL,
  WCAG_VERSION,
  axeTagsForWcagLevel,
  parseWcagLevel,
  wcagCriterionLabel,
  wcagUnderstandingUrl,
} from "../src/wcag.js";

describe("WCAG references", () => {
  it("links a criterion to its exact W3C Understanding page", () => {
    expect(wcagUnderstandingUrl("1.3.1")).toBe(
      "https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html",
    );
  });

  it("falls back to the W3C Understanding index for an unknown criterion", () => {
    expect(wcagUnderstandingUrl("9.9.9")).toBe("https://www.w3.org/WAI/WCAG22/Understanding/");
  });

  it("makes the WCAG version and criterion section explicit", () => {
    expect(WCAG_VERSION).toBe("2.2");
    expect(wcagCriterionLabel("1.3.1")).toBe("WCAG 2.2 · Section 1.3.1");
  });

  it("builds cumulative axe rule tags for A, AA, and AAA scans", () => {
    expect(DEFAULT_WCAG_LEVEL).toBe("AA");
    expect(axeTagsForWcagLevel("A")).toEqual(["wcag2a", "wcag21a", "wcag22a"]);
    expect(axeTagsForWcagLevel("AA")).toEqual(["wcag2a", "wcag21a", "wcag22a", "wcag2aa", "wcag21aa", "wcag22aa"]);
    expect(axeTagsForWcagLevel("AAA")).toEqual([
      "wcag2a",
      "wcag21a",
      "wcag22a",
      "wcag2aa",
      "wcag21aa",
      "wcag22aa",
      "wcag2aaa",
      "wcag21aaa",
      "wcag22aaa",
    ]);
  });

  it("normalizes user-supplied levels and rejects invalid values", () => {
    expect(parseWcagLevel(undefined)).toBe("AA");
    expect(parseWcagLevel("aaa")).toBe("AAA");
    expect(() => parseWcagLevel("AAAA")).toThrow("WCAG level must be A, AA, or AAA.");
  });
});
