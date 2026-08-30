import { describe, expect, it } from "vitest";
import { buildCodeSuggestion } from "../src/suggestions.js";

describe("code suggestions", () => {
  it("removes an unnecessary name from a decorative separator wrapper", () => {
    const markup = `<div class="fl-module fl-module-separator fl-node-5c810c8d6c475" data-node="5c810c8d6c475" aria-label="Separator">
  <div class="fl-module-content fl-node-content">
    <div class="fl-separator" aria-label="Preserve this nested label"></div>
  </div>
</div>`;
    const suggestion = buildCodeSuggestion("aria-prohibited-attr", markup);

    expect(suggestion?.title).toBe("Remove the decorative separator label");
    expect(suggestion?.after).not.toContain('data-node="5c810c8d6c475" aria-label="Separator"');
    expect(suggestion?.after).toContain('aria-label="Preserve this nested label"');
    expect(suggestion?.rationale).toContain("appears to be a visual separator");
    expect(suggestion?.alternatives?.[0]).toContain("<hr>");
    expect(suggestion?.alternatives?.[1]).toContain('role="separator"');
  });

  it("does not invent a role for a generic div with a prohibited accessible name", () => {
    const suggestion = buildCodeSuggestion("aria-prohibited-attr", '<div class="card-shell" aria-label="Account summary"></div>');

    expect(suggestion?.after).toBe('<div class="card-shell"></div>');
    expect(suggestion?.rationale).toContain("If this wrapper is only for layout or styling");
    expect(suggestion?.alternatives?.[0]).toContain("Do not invent a role");
  });

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

  it("uses measured contrast evidence for AA and AAA code guidance", () => {
    const suggestion = buildCodeSuggestion("color-contrast-enhanced", "<p>Muted copy</p>", {
      foreground: "#777777",
      background: "#ffffff",
      ratio: 4.48,
      requiredRatio: 7,
      fontSize: "16px",
      fontWeight: "400",
    });
    expect(suggestion?.after).toContain("#777777 on #ffffff");
    expect(suggestion?.after).toContain("7:1");
    expect(suggestion?.rationale).toContain("4.48:1");
  });
});
