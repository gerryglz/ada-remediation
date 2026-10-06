# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

### Added

- A small demonstration site with deliberate accessibility errors in `demo-site/`. Run `npm run demo` and scan `http://127.0.0.1:4180/` to try the dashboard without touching a real website.
- Repository source findings now include inspect, change, and verify guidance, an issue category, and an AI remediation prompt, matching the detail of rendered-scan findings.

### Changed

- Dashboard header, scan form, and results summary redesigned: one results bar (URL, WCAG target, totals, review actions, exports) replaces the metric tiles and the summary toggle, run notes and comparison move into a disclosure, and the automated-testing disclaimer moves to the sidebar foot.
- Dashboard sidebar redesigned: tabs and filter chips carry their own counts, empty filter values are hidden, and each finding row is a severity dot, a title, and one line of text metadata with no badges. The **Show filters** toggle and the finding-count line are gone.
- Dashboard detail pane redesigned to be fix-first: the location, failed condition, what to change, rendered HTML context, and screenshot stay visible, and supporting material moves into collapsed sections. Severity is the only color-coded attribute; all other badges became text. Same-rule elements in an issue set are compact rows with one combined AI prompt.
- Downloadable HTML report redesigned to match the dashboard, sharing its style sheet. Report totals, filters, and review dispositions are text and chips instead of metric tiles and badges.
- Review dispositions and notes are recorded per finding or per component through one **Review** dropdown, and manual tasks use one **Outcome** dropdown. The sidebar keeps a single severity filter; the WCAG-level and review filters are removed.

- Dashboard and report use a light blue palette with one blue accent in place of the cream theme. Detail sections are white cards on a tinted page, each one collapsible; the fix-first sections start open.
- Affected-element rows lead with the element's visible name instead of its markup, and the likely shared owner is three labelled facts.
- Dashboard and report copy shortened for skimming: **What to change** opens with one bold line naming the fix, failed conditions are a bulleted list with three shown, help text is one sentence, and an element on several pages shows a page count instead of a list of links.
- Run notices (pages that could not be tested, skipped interactive states, skipped assets) are one collapsed line each, and the totals state failed pages next to tested pages.
- A component with a single issue shows that issue directly instead of nesting it in a card, and no longer repeats its guidance as shared corrections. Zero comparison counts and the header subtitle are removed.
- Reviewer notes save when their field loses focus, so the **Save review** button is gone. Unsaved notes are also sent when the page closes.
- The scan button reads **Scan site** while crawling is on, the URL field no longer starts with a prefilled address, and the dashboard has a skip link.

### Fixed

- A failure to save a scan to history is now shown with the results instead of in the collapsed scan form, where it was never seen.
- Keyboard focus moves to the results when a scan finishes instead of staying on the hidden scan button.
- Screenshots reserve their space while loading, and scrolling to a selected finding respects reduced-motion settings.
- The dashboard no longer shows the **Authenticated scan** label on public scans.

- Same-origin crawls no longer scan a directory URL and its `index.html` or `index.htm` file as two pages, which double-counted every finding on that page.

## 0.2.0 — 2026-09-01

### Added

- Version 0.2 product roadmap covering finding triage, repeatable profiles, authenticated dashboard scans, broader interaction coverage, and private-release stabilization.
- Per-finding reviewer dispositions and notes for automated results, with review filters and totals, grouped bulk updates, compatible-rescan carry-forward, local persistence, and JSON/HTML export support.
- Complete scan profiles stored with rendered runs, one-click **Run again** actions in history, profile summaries in dashboard and reports, and exact-profile comparison safeguards.
- Authenticated dashboard scans using a locally validated Playwright storage-state path, with explicit authenticated-run labels, secret-free history and exports, and path re-entry for reruns.
- Dashboard self-accessibility CI across primary application, dialog, error, responsive, and downloadable-report states.
- Keyboard focus, activation, dialog-return, and horizontal-reflow browser assertions.
- Opt-in disclosure-state scanning for visible native controls with valid `aria-expanded` and `aria-controls` relationships.
- Conservative interactive-state recipes for ARIA disclosures, tabs, and dialogs, with per-type totals, exact reproduction triggers, safe state restoration, and explicit skipped-state follow-up.
- Conservative single-step carousel scanning with stable-state checks, exact restoration verification, and manual follow-up for auto-rotating or ambiguous carousels.
- Reproduction context for findings exposed only after a disclosure is opened, including the state name and trigger selector in dashboard, terminal, JSON, HTML, and AI-remediation output.
- Per-task manual review records with Pass, Needs attention, Not applicable, and Not tested outcomes; evidence notes; status filters and totals; local persistence; and JSON/HTML export support.
- Single-instance dashboard runtime tracking and `npm run ui:stop` for safely releasing its local port from another terminal.
- Collapsible automated and manual finding filters that preserve the queue's review space.
- Same-origin crawl exclusions for PDFs, media, office documents, and archives, reported separately from genuine incomplete HTML pages.
- Component-level issue sets that consolidate repeated child selectors, identify likely shared ARIA owners, and keep every affected element and source page available for verification.
- Explicit migration from private history-wrapper schema 1.0 to 1.1, plus regression coverage proving migrated review records remain present in JSON and HTML exports.

### Fixed

- Scrollable code and AI-prompt regions are now keyboard focusable.
- Grouped-finding field labels meet WCAG AA text-contrast thresholds on tinted cards.
- History and visual-evidence dialogs now expose explicit accessible names.
- Report-view tabs no longer pass through low-contrast intermediate colors while their selected state changes.
- Responsive result actions keep a sticky-header scroll offset so their touch targets cannot be obscured after a scan.

## 0.1.0 — 2026-08-30

Initial private release.

### Added

- Repository scanning for HTML and HTM source with file, line, column, and selector locations.
- Rendered single-page, multi-URL, same-origin crawl, and authenticated Playwright scans powered by axe-core.
- WCAG 2.2 Level A, AA, and AAA scan targets with per-finding conformance badges.
- Local review dashboard with severity and WCAG filters, semantic finding groups, screenshots, contrast evidence, and source links.
- Rendered HTML context with readable indentation and remediation guidance that distinguishes evidence from suggested changes.
- Target-aware manual accessibility checklist with direct W3C guidance links.
- JSON, terminal, self-contained HTML, and SARIF reports.
- Conservative source-fix previews, accepted-finding baselines, and severity-based CI exit thresholds.

### Limitations

- Automated findings do not certify ADA, WCAG, or Section 508 compliance and require manual accessibility testing.
- Repository scanning directly analyzes HTML and HTM files; rendered framework applications must also be tested through a running URL.
- Generated remediation guidance must be reviewed and applied to the maintained source that produces the rendered HTML.
