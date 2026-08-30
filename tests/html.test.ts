import { describe, expect, it } from "vitest";
import { formatHtmlSnippet } from "../src/html.js";

describe("HTML evidence formatting", () => {
  it("indents structural descendants while keeping inline text together", () => {
    const html = '<main><h1>Review <strong>results</strong></h1><div class="separator"><div class="line"></div></div></main>';

    expect(formatHtmlSnippet(html)).toBe([
      "<main>",
      "  <h1>Review <strong>results</strong></h1>",
      '  <div class="separator">',
      '    <div class="line"></div>',
      "  </div>",
      "</main>",
    ].join("\n"));
  });

  it("preserves preformatted and script contents", () => {
    const html = '<section><pre>first\n  second</pre><script>if (a < b) { run(); }</script></section>';
    const formatted = formatHtmlSnippet(html);

    expect(formatted).toContain("<pre>first\n  second</pre>");
    expect(formatted).toContain("<script>if (a < b) { run(); }</script>");
  });
});
