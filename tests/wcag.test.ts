import { describe, expect, it } from "vitest";
import { WCAG_VERSION, wcagCriterionLabel, wcagUnderstandingUrl } from "../src/wcag.js";

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
});
