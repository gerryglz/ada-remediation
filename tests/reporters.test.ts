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
    result.findings[0].title = "<object> elements must have alternative text";
    result.findings[0].remediationGuidance = {
      inspect: ["Failed condition: <object> has no accessible alternative."],
      change: ['For an embedded image, add role="img" with an accessible name and an equivalent fallback link.'],
      verify: ["Run the object-alt check again and test the fallback with a keyboard."],
    };
    result.findings[0].contrast = {
      foreground: "#777777",
      background: "#ffffff",
      ratio: 4.48,
      requiredRatio: 7,
      fontSize: "16px",
      fontWeight: "400",
    };
    result.findings[0].screenshot = {
      dataUrl: "data:image/jpeg;base64,ZmFrZQ==",
      mimeType: "image/jpeg",
      width: 1440,
      height: 900,
      highlightedSelector: "img",
      description: "The affected image is outlined in charcoal.",
    };
    result.findings[0].scope = "common";
    result.findings[0].componentCategory = "Navigation menu";
    const component = { key: "header-menu|primary", category: "Header menu" as const, name: "Primary navigation", selector: 'nav[aria-label="Primary"]' };
    result.findings[0].component = component;
    result.findings[1].component = component;
    result.findings[1].remediationGuidance = {
      inspect: ["Review this child element in the primary navigation."],
      change: ['For an embedded image, add role="img" with an accessible name and an equivalent fallback link.'],
      verify: ["Retest the primary navigation."],
    };
    result.findings[0].occurrences = [
      { fingerprint: result.findings[0].fingerprint, location: { ...result.findings[0].location } },
      {
        fingerprint: `${result.findings[0].fingerprint}-second`,
        location: {
          ...result.findings[0].location,
          url: "https://example.com/second",
          pageTitle: "Second affected page",
        },
      },
    ];
    result.metadata.findingOccurrences = result.findings.length + 1;
    expect(terminalReport(result)).toContain("Conformance target: WCAG 2.2 Level AAA");
    expect(terminalReport(result)).toContain("Automated results cannot certify");
    expect(terminalReport(result)).toContain("Recurring Navigation menu: 2 pages / 2 occurrences");
    expect(terminalReport(result)).toContain("Finding groups:");
    expect(terminalReport(result)).toContain("Component — Primary navigation: 2 findings");
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
    expect(html).toContain("Navigation menu</span>");
    expect(html).toContain(".component-badge{border:1px solid var(--accent-orange)");
    expect(html).toContain("2 PAGES");
    expect(html).not.toContain("COMMON · 2 PAGES");
    expect(html).toContain("Affected pages");
    expect(html).toContain("Components and issue patterns");
    expect(html).toContain("Primary navigation");
    expect(html).toContain("Corrections shared by multiple findings");
    expect(html).toContain("Child findings");
    expect(html).toContain("APPLIES TO 2");
    expect(html).toContain("Second affected page");
    expect(html).toContain("2 total occurrences");
    expect(html).toContain("Why this was flagged");
    expect(html).toContain("How to verify the fix");
    expect(html).toContain("What to inspect");
    expect(html).toContain("What to change");
    expect(html).toContain('class="remediation-start"');
    expect(html).toContain("Start here");
    expect(html).toContain('<code class="inline-code">role=&quot;img&quot;</code>');
    expect(html).not.toContain('<code class="inline-code">For</code>');
    expect(html).toContain("Run the object-alt check again");
    expect(html).toContain("Color contrast evidence");
    expect(html).toContain("Measured ratio");
    expect(html).toContain("4.48:1");
    expect(html).toContain("Manual accessibility checklist");
    expect(html).toContain("Required human review");
    expect(html).toContain("data-manual-check");
    expect(html).toContain("manual-progress");
    expect(html).toContain('<code class="inline-code">&lt;object&gt;</code> elements must have alternative text');
    expect(html).toContain('font-family:ui-monospace');
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
    const sarif = JSON.parse(sarifReport(result)) as { version: string; runs: Array<{ results: Array<{ locations: unknown[] }> }> };
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs).toHaveLength(1);
    expect(sarif.runs[0].results[0].locations).toHaveLength(2);
  });

  it("renders the local dashboard using the documented design system", () => {
    const html = dashboardHtml();
    const dashboardScript = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
    expect(dashboardScript).toBeDefined();
    expect(() => new Function(dashboardScript)).not.toThrow();
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
    expect(html).toContain('id="result-summary-toggle"');
    expect(html).toContain("Hide summary");
    expect(html).toContain("summary-collapsed");
    expect(html).toContain("setResultSummaryExpanded");
    expect(html).toContain('id="scan-progress"');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain("/api/progress");
    expect(html).toContain("startProgressPolling");
    expect(html).toContain("What to inspect");
    expect(html).toContain("What to change");
    expect(html).toContain("appendTechnicalText");
    expect(html).toContain("aria-[a-z0-9-]+");
    expect(html).toContain("remediationStart");
    expect(html).toContain("Expected parent roles");
    expect(html).toContain("technical-values");
    expect(html).toContain("rel=\"icon\"");
    expect(html).toContain("data:image/svg+xml");
    expect(html).toContain("font-family:ui-monospace");
    expect(html).toContain(".finding-nav-title{margin-top:11px}");
    expect(html).toContain("el('span','wcag-level-badge',check.wcagLevel)");
    expect(html).not.toContain("el('span','wcag-level-badge','Level '+check.wcagLevel)");
    expect(html).toContain("Automated findings");
    expect(html).toContain("Manual checklist");
    expect(html).toContain("renderManualChecks");
    expect(html).toContain("Color contrast evidence");
    expect(html).toContain("Manual tasks");
    expect(html).toContain("Unique findings");
    expect(html).toContain("Occurrences");
    expect(html).toContain("component-badge");
    expect(html).toContain("page-count-badge");
    expect(html).toContain("findingComponentCategory");
    expect(html).not.toContain("'COMMON · '+pages+' PAGES'");
    expect(html).toContain("Affected pages");
    expect(html).toContain("enhanceCommonFinding");
    expect(html).toContain("renderGroupDetail");
    expect(html).toContain("componentGroupNav");
    expect(html).toContain("groupChildDetail");
    expect(html).toContain("sidebar-components");
    expect(html).toContain("Individual findings");
    expect(html).toContain("function findingNav(f)");
    expect(html).toContain("queueHeading.textContent='Finding list'");
    expect(html).toContain("Each collapsed card shows the affected element");
    expect(html).toContain("childElementName");
    expect(html).toContain("Affected pages for this finding");
    expect(html).toContain("CSS selector");
    expect(html).not.toContain("const pageSection=titledSection('Affected pages')");
    expect(html).toContain("Issue patterns");
    expect(html).toContain("combinedGroupPrompt");
    expect(html).toContain("Combined AI remediation prompt");
    expect(html).toContain("This single prompt includes every child finding");
    expect(html).toContain("issue-category-badge");
    expect(html).toContain("AI remediation prompt");
    expect(html).toContain("Copy prompt");
    expect(html).toContain("implementation technology is unknown");
    expect(html).toContain("sidebar-components{position:static");
    expect(html).toContain("@media(hover:hover)");
    expect(html).toContain(".component-group:has(.component-group-nav:hover)");
    expect(html).toContain(".finding-nav:hover");
    expect(html).toContain("text-decoration-thickness:2px");
    expect(html).toContain("@media(prefers-reduced-motion:reduce)");
    expect(html).not.toContain("Child findings shown below");
    expect(html).toContain("Corrections shared by multiple findings");
    expect(html).toContain("Findings to review");
    expect(html).toContain("item.stage+' stage'");
    expect(html).toContain("item.attempts");
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
    expect(html).toContain("No findings match this filter.");
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
