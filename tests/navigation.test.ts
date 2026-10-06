import { describe, expect, it, vi } from "vitest";
import { crawlKey, navigateForAccessibilityScan, PageNavigationError } from "../src/navigation.js";

describe("rendered page navigation", () => {
  it("uses DOM-ready navigation and retries a transient failure once", async () => {
    const goto = vi.fn().mockRejectedValueOnce(new Error("temporary timeout")).mockResolvedValueOnce(null);
    const page = {
      goto,
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    };
    const attempts: number[] = [];

    await expect(navigateForAccessibilityScan(page as never, "https://example.com/", 12_000, (attempt) => attempts.push(attempt))).resolves.toBe(2);
    expect(goto).toHaveBeenCalledTimes(2);
    expect(goto).toHaveBeenLastCalledWith("https://example.com/", { waitUntil: "domcontentloaded", timeout: 12_000 });
    expect(attempts).toEqual([1, 2]);
  });

  it("reports the attempt count after a persistent navigation failure", async () => {
    const page = {
      goto: vi.fn().mockRejectedValue(new Error("connection refused")),
      waitForLoadState: vi.fn(),
      waitForTimeout: vi.fn(),
    };

    const error = await navigateForAccessibilityScan(page as never, "https://example.com/", 5_000).catch((caught) => caught);
    expect(error).toBeInstanceOf(PageNavigationError);
    expect(error.attempts).toBe(2);
    expect(error.message).toContain("connection refused");
  });
});

describe("crawl page identity", () => {
  it("treats a directory and its index file as the same page", () => {
    expect(crawlKey("https://example.com/index.html")).toBe(crawlKey("https://example.com/"));
    expect(crawlKey("https://example.com/docs/index.htm#top")).toBe(crawlKey("https://example.com/docs/"));
    expect(crawlKey("https://example.com/about.html")).not.toBe(crawlKey("https://example.com/"));
    expect(crawlKey("https://example.com/?page=2")).not.toBe(crawlKey("https://example.com/"));
  });
});
