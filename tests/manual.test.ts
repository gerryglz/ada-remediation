import { describe, expect, it } from "vitest";
import { manualReviewChecklist } from "../src/manual.js";

describe("manual accessibility checklist", () => {
  it("adds manual tasks cumulatively for A, AA, and AAA targets", () => {
    const levelA = manualReviewChecklist("A");
    const levelAA = manualReviewChecklist("AA");
    const levelAAA = manualReviewChecklist("AAA");
    expect(levelA.length).toBeLessThan(levelAA.length);
    expect(levelAA.length).toBeLessThan(levelAAA.length);
    expect(levelA.some((check) => check.id === "keyboard-focus")).toBe(true);
    expect(levelA.flatMap((check) => check.wcag)).not.toContain("1.4.11");
    expect(levelAA.flatMap((check) => check.wcag)).toContain("1.4.11");
    expect(levelAA.some((check) => check.id === "zoom-reflow")).toBe(true);
    expect(levelAAA.some((check) => check.id === "aaa-enhanced")).toBe(true);
  });

  it("provides actionable steps and W3C criteria for every task", () => {
    for (const check of manualReviewChecklist("AAA")) {
      expect(check.status).toBe("todo");
      expect(check.steps.length).toBeGreaterThanOrEqual(4);
      expect(check.wcag.length).toBeGreaterThan(0);
    }
  });
});
