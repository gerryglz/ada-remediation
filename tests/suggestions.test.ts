import { describe, expect, it } from "vitest";
import { buildCodeSuggestion } from "../src/suggestions.js";

describe("code suggestions", () => {
  it("suggests native navigation semantics for orphaned menu items", () => {
    const suggestion = buildCodeSuggestion(
      "aria-required-parent",
      '<button role="menuitem" aria-setsize="7" aria-posinset="1">Why Michigan</button>',
    );
    expect(suggestion?.before).toContain('role="menuitem"');
    expect(suggestion?.after).not.toContain("menuitem");
    expect(suggestion?.alternatives?.[0]).toContain("menubar");
  });

  it("uses an explicit author placeholder instead of inventing alt text", () => {
    const suggestion = buildCodeSuggestion("image-alt", '<img src="chart.png">');
    expect(suggestion?.after).toContain('alt="[Describe the image purpose]"');
    expect(suggestion?.alternatives?.[0]).toContain('alt=""');
  });

  it("adds a name and fallback starting point for embedded objects", () => {
    const suggestion = buildCodeSuggestion("object-alt", '<object data="map.svg"></object>');
    expect(suggestion?.after).toContain("aria-label");
    expect(suggestion?.after).toContain("accessible alternative");
  });
});
