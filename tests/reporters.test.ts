import { describe, expect, it } from "vitest";
import { htmlReport, sarifReport, terminalReport } from "../src/reporters/index.js";
import { scanRepository } from "../src/scanners/repository.js";
import { dashboardHtml } from "../src/ui/server.js";

describe("reporters", () => {
  it("renders terminal, HTML, and SARIF output", async () => {
    const result = await scanRepository("tests/fixtures/inaccessible");
    result.metadata.wcagLevel = "AAA";
    result.metadata.profile = { target: result.metadata.target, wcagLevel: "AAA", crawl: false, maxPages: 1, captureScreenshots: true, interactionStates: true, authentication: "storage-state" };
    result.findings[0].location.url = "https://example.com/problem";
    result.findings[0].location.pageTitle = "Example problem page";
    result.findings[0].location.interactionState = "Account actions";
    result.findings[0].location.interactionTrigger = "#account-disclosure";
    result.findings[0].location.interactionType = "disclosure";
    result.metadata.interactionStatesScanned = 1;
    result.metadata.interactionStatesRequested = true;
    result.metadata.interactionStateCounts = { disclosure: 1, tab: 0, dialog: 0, carousel: 0 };
    result.metadata.interactionStateFailures = [{ url: "https://example.com/problem", type: "dialog", name: "Account help", trigger: "#help-trigger", reason: "The dialog opened, but Escape did not close it; remaining states were skipped to avoid unsafe interaction." }];
    result.metadata.skippedAssets = [{ url: "https://example.com/menu.pdf", kind: "pdf", reason: "PDF documents require a dedicated document accessibility review and are outside this HTML website scan." }];
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
    result.findings[0].renderedHtmlContext = {
      html: '<figure class="feature"><object data="chart.svg"></object><figcaption>Quarterly results</figcaption></figure>',
      scope: "parent",
      truncated: false,
    };
    const component = {
      key: "header-menu|primary",
      category: "Header menu" as const,
      name: "Primary navigation",
      selector: 'nav[aria-label="Primary"]',
      remediationTarget: {
        selector: "ul.primary-menu",
        html: '<ul class="primary-menu" role="presentation">',
        currentRole: "presentation",
        suggestedRoles: ["menu", "menubar", "group"],
        reason: "Nearest rendered container that directly owns multiple failing menuitem elements.",
      },
    };
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
    result.review = {
      manualTasks: {
        [result.manualChecks[0].id]: { status: "needs-attention", notes: "Focus became obscured behind the sticky header." },
      },
      findings: {
        [result.findings[0].fingerprint]: { disposition: "action-required", notes: "Update the shared navigation component." },
      },
      notes: "Manual review is in progress.",
    };
    expect(terminalReport(result)).toContain("Conformance target: WCAG 2.2 Level AAA");
    expect(terminalReport(result)).toContain("Scan profile: Single page; screenshots on; interactive states on; authenticated session");
    expect(terminalReport(result)).toContain("Automated results cannot certify");
    expect(terminalReport(result)).toContain("Recurring Navigation menu: 2 pages / 2 occurrences");
    expect(terminalReport(result)).toContain("Finding groups:");
    expect(terminalReport(result)).toContain("Component — Primary navigation: 2 issue set(s) / 2 affected elements");
    expect(terminalReport(result)).toContain("Interactive states opened: 1 state(s): 1 disclosure, 0 tab, 0 dialog");
    expect(terminalReport(result)).toContain("Interactive states skipped: 1");
    expect(terminalReport(result)).toContain("Non-HTML assets skipped: 1");
    expect(terminalReport(result)).toContain("https://example.com/menu.pdf");
    expect(terminalReport(result)).toContain("after opening Account actions");
    expect(terminalReport(result)).toContain("Review: Action required — Update the shared navigation component.");
    const html = htmlReport(result);
    expect(html).toContain("Findings in context");
    expect(html).toContain("WCAG 2.2 Level AAA");
    expect(html).toContain("Saved scan profile: Single page; screenshots on; interactive states on; authenticated session");
    expect(html).toContain("Example problem page");
    expect(html).toContain("data:image/jpeg;base64,ZmFrZQ==");
    expect(html).toContain("Rendered HTML context");
    expect(html).toContain("Original browser HTML · affected element and parent");
    expect(html).toContain("Quarterly results");
    expect(html).toContain("Visual evidence");
    expect(html).toContain("Make the fix in your source, not here.");
    expect(html).not.toContain("Before — detected markup");
    expect(html).not.toContain("Suggested after — starting point");
    expect(html).toContain("Open larger screenshot for");
    expect(html).toContain("Review disposition: <strong>Action required</strong>");
    expect(html).toContain("Failed condition");
    expect(html).toContain("Revealed interaction state");
    expect(html).toContain("Disclosure · Account actions");
    expect(html).toContain("#account-disclosure");
    expect(html).toContain("interactive state opened");
    expect(html).toContain("state skipped");
    expect(html).toContain("Interactive states skipped");
    expect(html).toContain("Skipped non-HTML assets · 1");
    expect(html).toContain("https://example.com/menu.pdf");
    expect(html).toContain("Recurring navigation menu");
    expect(html).not.toContain("-badge");
    expect(html).toContain("2 pages");
    expect(html).not.toContain("COMMON · 2 PAGES");
    expect(html).toContain("Affected pages");
    expect(html).toContain("Components and issue patterns");
    expect(html).toContain("Primary navigation");
    expect(html).toContain("Corrections shared by multiple findings");
    expect(html).toContain("Issue sets and affected elements");
    expect(html).toContain("Likely shared owner");
    expect(html).toContain("ul.primary-menu");
    expect(html).not.toContain("Applies to 2 findings.");
    expect(html).toContain("Second affected page");
    expect(html).toContain("2 total occurrences");
    expect(html).toContain("Why this was flagged");
    expect(html).toContain("How to verify the fix");
    expect(html).toContain("What to inspect");
    expect(html).toContain("What to change");
    expect(html).toContain('class="callout"');
    expect(html).toContain('class="more-list"');
    expect(html).toContain('<code class="inline-code">role=&quot;img&quot;</code>');
    expect(html).not.toContain('<code class="inline-code">For</code>');
    expect(html).toContain("Run the object-alt check again");
    expect(html).toContain("Color contrast evidence");
    expect(html).toContain("Measured ratio");
    expect(html).toContain("4.48:1");
    expect(html).toContain("Manual accessibility review record");
    expect(html).toContain("Required human review");
    expect(html).toContain("Not tested");
    expect(html).toContain("Needs attention");
    expect(html).toContain("Focus became obscured behind the sticky header.");
    expect(html).toContain("Manual review is in progress.");
    expect(html).toContain("Automated finding review");
    expect(html).toContain("Action required");
    expect(html).toContain("Update the shared navigation component.");
    expect(html).toContain('data-disposition="action-required"');
    expect(html).not.toContain("data-disposition-filter");
    expect(html).not.toContain("data-level-filter");
    expect(html).not.toContain('data-disposition-filter="false-positive"');
    expect(html).toContain("manual-progress");
    expect(html).toContain('<code class="inline-code">&lt;object&gt;</code> elements must have alternative text');
    expect(html).toContain("--mono:ui-monospace");
    expect(html).toContain("https://dequeuniversity.com/rules/axe/4.13/image-alt");
    expect(html).toContain("W3C Understanding guidance");
    expect(html).toContain("WCAG 2.2 · Section 1.1.1");
    expect(html).toContain("WCAG Level A");
    expect(html).toContain('<span class="pill">');
    expect(html).toContain('class="row-meta"');
    expect(html).toContain('data-level="A"');
    expect(html).toContain('data-severity-filter="all"');
    expect(html).toContain("Impact severity");
    expect(html).toContain("Review disposition");
    expect(html).toContain("const active={severity:'all'}");
    expect(html).toContain("item.dataset[kind]!==active[kind]");
    expect(html).toContain("https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html");
    expect(html).toContain("axe scanner rule details (Deque)");
    expect(html).toContain('<pre tabindex="0">');
    expect(html).toContain("--critical:#ab307e");
    expect(html).toContain("--moderate:#2f5bb7");
    expect(html).toContain("--minor:#6b6b68");
    expect(html).toContain("--serious:#9a4e12");
    expect(html).not.toContain(".wcag-level-badge.level-aa");
    expect(html).not.toContain("linear-gradient");
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
    expect(html).not.toContain("Accessibility audit workspace");
    expect(html).toContain("' could not be tested'");
    expect(html).toContain("'page failed','pages failed'");
    expect(html).toContain("function mixedComparison()");
    expect(html).toContain('id="scan-toggle"');
    expect(html).toContain('aria-controls="scan-panel"');
    expect(html).toContain('id="scan-panel"');
    expect(html).toContain('class="results-bar"');
    expect(html).toContain('<p class="notice" id="notice"></p></aside>');
    expect(html).not.toContain('class="metric');
    expect(html).toContain("grid-template-columns:340px minmax(0,1fr)");
    expect(html).toContain("scrollbar-gutter:stable");
    expect(html).toContain("scanPanel.hidden=!expanded");
    expect(html).toContain("setScanControlsExpanded");
    expect(html).toContain("Show scan controls");
    expect(html).toContain('id="run-review-toggle"');
    expect(html).toContain("Notes and comparison");
    expect(html).toContain('id="empty"');
    expect(html).toContain("setRunPanel");
    expect(html).toContain('id="scan-progress"');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain("/api/progress");
    expect(html).toContain("startProgressPolling");
    expect(html).toContain("What to inspect");
    expect(html).toContain("What to change");
    expect(html).toContain("appendTechnicalText");
    expect(html).toContain("aria-[a-z0-9-]+");
    expect(html).toContain("failureCallout");
    expect(html).toContain("findingRenderedContext");
    expect(html).toContain("contextBlock");
    expect(html).toContain("Original browser HTML");
    expect(html).toContain("Make the fix in your source, not here.");
    expect(html).not.toContain("Before and suggested after");
    expect(html).not.toContain("Suggested after — starting point");
    expect(html).toContain("fact('Current role'");
    expect(html).toContain("fact('Needs one of'");
    expect(html).toContain("function elementName(f)");
    expect(html).not.toContain("element-markup',item.evidence");
    expect(html).toContain("rel=\"icon\"");
    expect(html).toContain("data:image/svg+xml");
    expect(html).toContain("--mono:ui-monospace");
    expect(html).toContain(".row-meta{");
    expect(html).toContain("' · WCAG Level '+check.wcagLevel");
    expect(html).not.toContain("el('span','wcag-level-badge','Level '+check.wcagLevel)");
    expect(html).toContain("Automated findings");
    expect(html).toContain("Manual review");
    expect(html).toContain("Run again");
    expect(html).toContain("applyAndRunProfile");
    expect(html).toContain("scanProfilesMatch");
    expect(html).toContain('id="result-profile"');
    expect(html).toContain('id="authenticated"');
    expect(html).toContain('id="storage-state"');
    expect(html).toContain('id="result-auth"');
    expect(html).toContain("Authenticated scan");
    expect(html).toContain("Prepare rerun");
    expect(html).not.toContain('id="finding-review-filters"');
    expect(html).toContain("el('label','review-field','Review'+scope+' ')");
    expect(html).toContain("Accepted risk");
    expect(html).toContain("False positive");
    expect(html).toContain("reviewControl");
    expect(html).toContain("findingReviews");
    expect(html).toContain("function reviewControl(findings)");
    expect(html).toContain("renderManualChecks");
    expect(html).toContain("Color contrast evidence");
    expect(html).toContain("Needs attention");
    expect(html).toContain("(checks-manual['not-tested'])");
    expect(html).toContain("unique findings");
    expect(html).toContain("occurrences");
    expect(html).not.toContain("-badge");
    expect(html).toContain("review-select");
    expect(html).not.toContain("el('button','chip',label);choice");
    expect(html).toContain("findingComponentCategory");
    expect(html).not.toContain("'COMMON · '+pages+' PAGES'");
    expect(html).toContain("Affected pages");
    expect(html).toContain("'Recurring '+findingComponentCategory(f).toLowerCase()");
    expect(html).toContain("renderGroupDetail");
    expect(html).toContain("groupMeta");
    expect(html).toContain("issueSetsFor");
    expect(html).toContain("findingBody");
    expect(html).toContain("Likely shared owner");
    expect(html).toContain("Affected elements (");
    expect(html).toContain("Do not add a role to a wrapper just to silence the scanner.");
    expect(html).toContain("conditions.slice(0,3)");
    expect(html).toContain("'On '+own.length+' pages'");
    expect(html).toContain("function failedConditionsOf(f)");
    expect(html).toContain("el('p','lead-fix')");
    expect(html).toContain("Issues in this component");
    expect(html).toContain("list-label");
    expect(html).toContain("Individual findings");
    expect(html).toContain("function findingMeta(f)");
    expect(html).toContain("function chipRow(");
    expect(html).toContain("One fix applies to all of them.");
    expect(html).toContain("preserveDetail");
    expect(html).toContain("Retest each one after the fix.");
    expect(html).toContain("Component selector ");
    expect(html).not.toContain("const pageSection=titledSection('Affected pages')");
    expect(html).toContain("Issue patterns");
    expect(html).toContain("combinedGroupPrompt");
    expect(html).toContain("Combined AI remediation prompt");
    expect(html).toContain("One prompt covers every finding in this group.");
    expect(html).toContain("el('span','pill '+f.severity,f.severity)");
    expect(html).toContain("AI remediation prompt");
    expect(html).toContain("Copy AI prompt");
    expect(html).toContain("implementation technology is unknown");
    expect(html).toContain("container.hidden=!required&&present.length<2");
    expect(html).toContain(".btn:hover");
    expect(html).toContain(".row:hover");
    expect(html).toContain(".chip[aria-pressed=true]");
    expect(html).toContain("text-decoration-thickness:2px");
    expect(html).toContain("@media(prefers-reduced-motion:reduce)");
    expect(html).not.toContain("Child findings shown below");
    expect(html).toContain("Corrections shared by multiple findings");
    expect(html).toContain("Shared failure");
    expect(html).toContain("item.stage+' stage'");
    expect(html).toContain("item.attempts");
    expect(html).toContain("#f7f4ed");
    expect(html).toContain("Download HTML report");
    expect(html).toContain("Capture screenshots");
    expect(html).toContain('id="interaction-states"');
    expect(html).toContain("Scan interactive states");
    expect(html).toContain("interactionTypeLabel");
    expect(html).toContain("states skipped");
    expect(html).toContain("WCAG 2.2 target");
    expect(html).toContain("Level A — essential");
    expect(html).toContain("Level AA — common target");
    expect(html).toContain("Level AAA — enhanced");
    expect(html).not.toContain('id="level-filters"');
    expect(html).toContain('id="filters" role="group" aria-label="Impact severity"');
    expect(html).toContain('id="manual-status-filters"');
    expect(html).toContain("Skipped non-HTML assets");
    expect(html).toContain("keepFocus");
    expect(html).not.toContain("All levels");
    expect(html).toContain("activeFilter==='all'||f.severity===activeFilter");
    expect(html).toContain("el('label','review-field','Outcome ')");
    expect(html).toContain("No findings match this filter.");
    expect(html).toContain("wcagLevel:selectedLevel");
    expect(html).toContain("result.metadata.wcagLevel||'AA'");
    expect(html).toContain("pages tested");
    expect(html).toContain("No automated findings. That is not a pass: continue with Manual review.");
    expect(html).toContain("renderTabs");
    expect(html).toContain("image-dialog");
    expect(html).toContain('id="image-dialog" aria-labelledby="dialog-title"');
    expect(html).toContain('id="history-dialog" aria-labelledby="history-title"');
    expect(html).toContain("pre.tabIndex=0");
    expect(html).toContain("promptCode.tabIndex=0");
    expect(html).toContain("Why this was flagged");
    expect(html).toContain("function whereLine(f)");
    expect(html).toContain("How to verify the fix");
    expect(html).toContain("Standards and references");
    expect(html).toContain("W3C Understanding guidance");
    expect(html).toContain("wcagUnderstandingUrls");
    expect(html).toContain("const wcagVersion=\"2.2\"");
    expect(html).toContain("/^WCAG (\\d+\\.\\d+\\.\\d+)(.*)$/");
    expect(html).toContain("WCAG '+wcagVersion+' · Section ");
    expect(html).toContain("--critical:#ab307e");
    expect(html).toContain("--moderate:#2f5bb7");
    expect(html).toContain("--minor:#6b6b68");
    expect(html).toContain("--serious:#9a4e12");
    expect(html).not.toContain(".wcag-level-badge.level-aa");
    expect(html).not.toContain("linear-gradient");
    expect(html).toContain("'WCAG Level '+f.wcagLevel");
    expect(html).toContain(".more>summary");
    expect(html).toContain("Human verification required");
  });
});
