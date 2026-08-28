import { describe, expect, it } from "vitest";
import { htmlReport, sarifReport, terminalReport } from "../src/reporters/index.js";
import { scanRepository } from "../src/scanners/repository.js";
import { dashboardHtml } from "../src/ui/server.js";

describe("reporters", () => {
  it("renders terminal, HTML, and SARIF output", async () => {
    const result = await scanRepository("tests/fixtures/inaccessible");
    result.findings[0].location.url = "https://example.com/problem";
    result.findings[0].location.pageTitle = "Example problem page";
    result.findings[0].screenshot = {
      dataUrl: "data:image/jpeg;base64,ZmFrZQ==",
      mimeType: "image/jpeg",
      width: 1440,
      height: 900,
      highlightedSelector: "img",
      description: "The affected image is outlined in charcoal.",
    };
    expect(terminalReport(result)).toContain("Automated results cannot certify");
    const html = htmlReport(result);
    expect(html).toContain("Findings in context");
    expect(html).toContain("Example problem page");
    expect(html).toContain("data:image/jpeg;base64,ZmFrZQ==");
    const sarif = JSON.parse(sarifReport(result)) as { version: string; runs: unknown[] };
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs).toHaveLength(1);
  });

  it("renders the local dashboard using the documented design system", () => {
    const html = dashboardHtml();
    expect(html).toContain("id=\"scan-form\"");
    expect(html).toContain("#f7f4ed");
    expect(html).toContain("Download HTML report");
    expect(html).toContain("Capture screenshots");
    expect(html).toContain("Pages tested");
    expect(html).toContain("zero automated axe-core findings");
  });
});
