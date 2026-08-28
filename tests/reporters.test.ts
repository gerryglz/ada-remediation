import { describe, expect, it } from "vitest";
import { htmlReport, sarifReport, terminalReport } from "../src/reporters/index.js";
import { scanRepository } from "../src/scanners/repository.js";
import { dashboardHtml } from "../src/ui/server.js";

describe("reporters", () => {
  it("renders terminal, HTML, and SARIF output", async () => {
    const result = await scanRepository("tests/fixtures/inaccessible");
    result.metadata.wcagLevel = "AAA";
    result.findings[0].location.url = "https://example.com/problem";
    result.findings[0].location.pageTitle = "Example problem page";
    result.findings[0].helpUrl = "https://dequeuniversity.com/rules/axe/4.13/image-alt";
    result.findings[0].screenshot = {
      dataUrl: "data:image/jpeg;base64,ZmFrZQ==",
      mimeType: "image/jpeg",
      width: 1440,
      height: 900,
      highlightedSelector: "img",
      description: "The affected image is outlined in charcoal.",
    };
    expect(terminalReport(result)).toContain("Conformance target: WCAG 2.2 Level AAA");
    expect(terminalReport(result)).toContain("Automated results cannot certify");
    const html = htmlReport(result);
    expect(html).toContain("Findings in context");
    expect(html).toContain("Conformance target:</strong> WCAG 2.2 Level AAA");
    expect(html).toContain("Example problem page");
    expect(html).toContain("data:image/jpeg;base64,ZmFrZQ==");
    expect(html).toContain("Before — detected markup");
    expect(html).toContain("Suggested after — starting point");
    expect(html).toContain("Open large screenshot");
    expect(html).toContain("Finding summary");
    expect(html).toContain("Where it was found");
    expect(html).toContain("Why this was flagged");
    expect(html).toContain("How to verify the fix");
    expect(html).toContain("https://dequeuniversity.com/rules/axe/4.13/image-alt");
    expect(html).toContain("WCAG 2.2 requirements — W3C");
    expect(html).toContain("WCAG 2.2 · Section 1.1.1");
    expect(html).toContain("wcag-level-badge level-a");
    expect(html).toContain('aria-label="WCAG Level A"');
    expect(html).toContain('title="WCAG Level A">A</span>');
    expect(html).toContain('data-level="A"');
    expect(html).toContain('data-level-filter="AA"');
    expect(html).toContain("Impact severity");
    expect(html).toContain("WCAG level");
    expect(html).toContain("activeSeverity='all';let activeLevel='all'");
    expect(html).toContain("const levelMatches=activeLevel==='all'||item.dataset.level===activeLevel");
    expect(html).toContain("https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html");
    expect(html).toContain("View axe scanner rule details on Deque");
    expect(html).toContain("--accent-plum:#ab307e");
    expect(html).toContain("--accent-blue:#6495ed");
    expect(html).toContain("--accent-green:#2f7d5a");
    expect(html).toContain("--accent-orange:#9a4e12");
    expect(html).not.toContain(".wcag-level-badge.level-aa");
    expect(html).toContain(".finding .report-section::before");
    const sarif = JSON.parse(sarifReport(result)) as { version: string; runs: unknown[] };
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs).toHaveLength(1);
  });

  it("renders the local dashboard using the documented design system", () => {
    const html = dashboardHtml();
    expect(html).toContain("id=\"scan-form\"");
    expect(html).toContain('class="app-header"');
    expect(html).toContain("Accessibility audit workspace");
    expect(html).toContain('id="scan-toggle"');
    expect(html).toContain('aria-controls="scan-panel"');
    expect(html).toContain('id="scan-panel"');
    expect(html).toContain("100dvh");
    expect(html).toContain("grid-template-columns:minmax(330px,380px) minmax(0,1fr)");
    expect(html).toContain("scrollbar-gutter:stable");
    expect(html).toContain("scan-collapsed");
    expect(html).toContain("setScanControlsExpanded");
    expect(html).toContain("Show scan controls");
    expect(html).toContain("#f7f4ed");
    expect(html).toContain("Download HTML report");
    expect(html).toContain("Capture screenshots");
    expect(html).toContain("WCAG 2.2 conformance target");
    expect(html).toContain("Level A — essential");
    expect(html).toContain("Level AA — common target");
    expect(html).toContain("Level AAA — enhanced");
    expect(html).toContain('id="level-filters"');
    expect(html).toContain("All levels");
    expect(html).toContain("activeLevel='all'");
    expect(html).toContain("f.wcagLevel===activeLevel");
    expect(html).toContain("No findings match the selected severity and WCAG level filters.");
    expect(html).toContain("wcagLevel:selectedLevel");
    expect(html).toContain("result.metadata.wcagLevel||'AA'");
    expect(html).toContain("Pages tested");
    expect(html).toContain("zero automated axe-core findings");
    expect(html).toContain("Finding list");
    expect(html).toContain("image-dialog");
    expect(html).toContain("Finding summary");
    expect(html).toContain("Where it was found");
    expect(html).toContain("How to verify the fix");
    expect(html).toContain("Open the affected source page");
    expect(html).toContain("W3C Understanding guidance");
    expect(html).toContain("wcagUnderstandingUrls");
    expect(html).toContain("const wcagVersion=\"2.2\"");
    expect(html).toContain("/^WCAG (\\d+\\.\\d+\\.\\d+)(.*)$/");
    expect(html).toContain("WCAG '+wcagVersion+' · Section ");
    expect(html).toContain("--accent-plum:#ab307e");
    expect(html).toContain("--accent-blue:#6495ed");
    expect(html).toContain("--accent-green:#2f7d5a");
    expect(html).toContain("--accent-orange:#9a4e12");
    expect(html).not.toContain(".wcag-level-badge.level-aa");
    expect(html).toContain(".detail-section::before");
    expect(html).toContain("wcag-level-badge level-");
    expect(html).toContain("f.wcagLevel.toLowerCase(),f.wcagLevel");
    expect(html).toContain("aria-label','WCAG Level '+f.wcagLevel");
  });
});
