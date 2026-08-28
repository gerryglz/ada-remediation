import { describe, expect, it } from "vitest";
import { wcagUnderstandingUrl } from "../src/wcag.js";

describe("WCAG references", () => {
  it("links a criterion to its exact W3C Understanding page", () => {
    expect(wcagUnderstandingUrl("1.3.1")).toBe(
      "https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html",
    );
  });

  it("falls back to the W3C Understanding index for an unknown criterion", () => {
    expect(wcagUnderstandingUrl("9.9.9")).toBe("https://www.w3.org/WAI/WCAG22/Understanding/");
  });
});
