# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

### Added

- Version 0.2 product roadmap covering finding triage, repeatable profiles, authenticated dashboard scans, broader interaction coverage, and private-release stabilization.
- Per-finding reviewer dispositions and notes for automated results, with review filters and totals, grouped bulk updates, compatible-rescan carry-forward, local persistence, and JSON/HTML export support.
- Complete scan profiles stored with rendered runs, one-click **Run again** actions in history, profile summaries in dashboard and reports, and exact-profile comparison safeguards.
- Authenticated dashboard scans using a locally validated Playwright storage-state path, with explicit authenticated-run labels, secret-free history and exports, and path re-entry for reruns.
- Dashboard self-accessibility CI across primary application, dialog, error, responsive, and downloadable-report states.
- Keyboard focus, activation, dialog-return, and horizontal-reflow browser assertions.
- Opt-in disclosure-state scanning for visible native controls with valid `aria-expanded` and `aria-controls` relationships.
- Conservative interactive-state recipes for ARIA disclosures, tabs, and dialogs, with per-type totals, exact reproduction triggers, safe state restoration, and explicit skipped-state follow-up.
- Reproduction context for findings exposed only after a disclosure is opened, including the state name and trigger selector in dashboard, terminal, JSON, HTML, and AI-remediation output.
- Per-task manual review records with Pass, Needs attention, Not applicable, and Not tested outcomes; evidence notes; status filters and totals; local persistence; and JSON/HTML export support.
- Single-instance dashboard runtime tracking and `npm run ui:stop` for safely releasing its local port from another terminal.
- Collapsible automated and manual finding filters that preserve the queue's review space.
- Same-origin crawl exclusions for PDFs, media, office documents, and archives, reported separately from genuine incomplete HTML pages.
- Component-level issue sets that consolidate repeated child selectors, identify likely shared ARIA owners, and keep every affected element and source page available for verification.

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
