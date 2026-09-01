import { describe, expect, it } from "vitest";
import { classifySkippedAssetUrl } from "../src/scanners/url.js";

describe("non-HTML URL classification", () => {
  it("separates PDFs and media assets from HTML pages", () => {
    expect(classifySkippedAssetUrl("https://example.com/menu.PDF?download=1")).toMatchObject({ kind: "pdf" });
    expect(classifySkippedAssetUrl("https://example.com/images/hero.webp")).toMatchObject({ kind: "image" });
    expect(classifySkippedAssetUrl("https://example.com/media/interview.mp3")).toMatchObject({ kind: "audio" });
    expect(classifySkippedAssetUrl("https://example.com/media/tour.mp4")).toMatchObject({ kind: "video" });
    expect(classifySkippedAssetUrl("https://example.com/files/worksheet.xlsx")).toMatchObject({ kind: "download" });
  });

  it("does not exclude ordinary HTML routes or query-based application URLs", () => {
    expect(classifySkippedAssetUrl("https://example.com/menu")).toBeUndefined();
    expect(classifySkippedAssetUrl("https://example.com/about.html")).toBeUndefined();
    expect(classifySkippedAssetUrl("https://example.com/view?document=menu.pdf")).toBeUndefined();
  });
});
