# ADA Remediation Assistant

`ada-assistant` is an open-source command-line tool for finding accessibility problems in website source code and rendered web pages. It combines source-aware HTML checks with Playwright and axe-core, produces reviewable reports, and previews a deliberately small set of semantics-preserving fixes.

Version `0.1.0` is the initial release. See [CHANGELOG.md](CHANGELOG.md) for its included capabilities and known limitations.

The repository and GitHub releases are currently private, and the package is intentionally marked private so it cannot be published to npm accidentally. Install and run it from an authorized checkout for now.

> Automated scanning cannot certify ADA, WCAG, or Section 508 compliance. It does not replace keyboard testing, screen-reader testing, usability review, or evaluation by accessibility professionals and people with disabilities.

## Install the project

Requirements: Node.js 20 or newer.

From this repository, run:

```bash
npm install
npx playwright install chromium
npm run build
```

The examples below use `node dist/cli.js`, which works directly from a built checkout. If you want the shorter `ada-assistant` command, run `npm link` once and substitute `ada-assistant` for `node dist/cli.js` in any example.

## Start here: use the visual dashboard

This is the easiest way to test a website when you have its URL.

1. Start the dashboard:

   ```bash
   npm run ui
   ```

2. Open [http://127.0.0.1:4173](http://127.0.0.1:4173) in your browser.
3. Paste a complete website URL, such as `https://www.michiganbusiness.org/`.
4. Choose the **WCAG 2.2 conformance target**. **Level AA** is the default and the most common organizational target. Higher levels include all available automated checks from the lower levels.
5. Leave **Capture screenshots** selected if you want visual evidence.
6. Select **Scan disclosure states** to also open up to 10 visible disclosure buttons per page that expose both `aria-expanded="false"` and a valid `aria-controls` target. This can find issues hidden inside collapsed menus, accordions, and similar panels. It is opt-in because it interacts with the tested page.
7. Select **Crawl same-origin pages** only when you want more than the supplied page and are authorized to crawl the site.
8. Click **Scan page**. The progress bar reports the live phase—opening the page, running axe-core, opening eligible disclosures, collecting evidence and screenshots, or building the report—plus the current page and an estimated percentage. For crawls, the percentage is based on the selected page limit and may finish early when the site has fewer eligible links.
9. When a scan finishes, the scan controls collapse automatically so the report can use the full browser height. Select **Show scan controls** in the header whenever you want to change the URL, WCAG target, disclosure-state, crawl, or screenshot option and run another scan.
10. Review the selected target, severity totals, and **Automated findings**. Select **Hide summary** to collapse the totals and testing notice into a compact bar when you want more vertical space; select **Show summary** to restore them. On desktop, the finding queue and selected finding scroll independently so you can keep your place in both columns. Use the separate **Impact severity** and **WCAG level** controls together to narrow findings—for example, Serious + AAA. On smaller screens, the queue and details stack into one readable page. The review workspace separates the selected result into clearly labeled sections:
   - **Finding summary** explains priority and detection confidence, shows an **A**, **AA**, or **AAA** badge for the individual rule, labels requirements as **WCAG 2.2 · Section X.X.X**, links each one to its exact W3C Understanding page, and labels Deque separately as axe scanner documentation
   - **Where it was found** provides clickable source-page links and the affected CSS selector; findings exposed by an opened disclosure also identify the state name and exact trigger selector needed to reproduce it
   - **Visual evidence** shows a compact screenshot thumbnail that opens into a near-full-window view
   - **Why this was flagged** separates the rule purpose from the specific failed check
   - **Recommended fix** starts with axe-core's exact failed condition, then separates **What to inspect** from **What to change**. Rule-specific advice and the affected HTML element are included even when a safe generic patch is not possible
   - **Rendered HTML context** shows the original browser markup around the affected element; **Suggested change** explains the correction direction without pretending generated code is a production-ready replacement
   - **How to verify the fix** provides a retesting checklist with W3C standards links first, followed by the affected source page and optional Deque/axe scanner details
   - Grouped findings use the affected element or recognizable component pattern as the collapsed-card title instead of repeating the scanner rule name. Each card shows its exact failed condition, recommended action, and page scope before it is opened. Expanding the card reveals clickable affected-page links and labels the CSS selector as technical location information rather than presenting it as the finding name
11. For an identified text-contrast issue, review **Color contrast evidence** for the computed foreground and background colors, measured ratio, required ratio, and font information. The suggested CSS uses placeholders for approved design tokens; it does not invent production colors.
12. Select **Manual review** and work through the target-aware human-review tasks. Each task includes detailed steps and direct W3C links. Record one outcome—**Not tested**, **Pass**, **Needs attention**, or **Not applicable**—plus task-specific evidence or follow-up notes. Use the status filters to focus the queue. Status changes save immediately; select **Save review** after changing task notes.
13. Add run-level **Reviewer notes** for broader decisions, ownership, or follow-up work, then select **Save review**. Task outcomes and both kinds of notes are stored only with the local run.
14. Use **Compare with** to select an earlier run for the same website. **New** findings were not present in that run, **Existing** findings remain, and **Resolved** findings were present previously but are absent now.
15. Select **Scan history** in the application header to reopen or delete saved runs. Runs are grouped by website origin.
16. Use **Download JSON** for machine-readable evidence or **Download HTML report** for a portable visual report. Both record the selected conformance target, automated findings, contrast evidence when available, and saved manual outcomes and notes.
17. Press `Ctrl+C` in the terminal when you are finished. If that terminal is no longer available, run `npm run ui:stop` from the project directory. Both methods stop the tracked dashboard and release its port.

The dashboard runs locally on your computer and binds to `127.0.0.1` by default. It does not upload reports or screenshots to an external service. Screenshots can contain visible page information, including information from authenticated pages, so review them before sharing.

The results area is a full-height application workspace: the compact header and summary stay easy to scan while the finding queue and selected-finding details use the remaining browser space. Select an item from the **Finding list** to open its detailed review workspace. Plum identifies critical priority, orange identifies serious priority, cornflower blue supports standards and informational context, and green consistently identifies WCAG-level badges and filters. A visible divider separates every review section. Click the compact screenshot thumbnail to open an almost full-window view, then use **Close** or the Escape key to return. The report preserves the original rendered HTML as its primary code evidence and separates it from the suggested change. Treat that suggestion as review guidance, locate the maintained source that generated the browser HTML, and retest the page after editing it.

The **Manual review** is deliberately separate from automated findings. **Not tested** is not a detected failure; it identifies work that still needs human judgment or interaction testing. **Pass** means the reviewer completed the listed procedure and found no issue in the tested scope. **Needs attention** records a manual problem or unresolved question. **Not applicable** should include a short reason in the task notes. Level A scans receive the essential checklist, Level AA adds common production checks such as reflow and status messages, and Level AAA adds enhanced review tasks.

## Use local scan history and comparisons

Every successful dashboard scan is saved automatically on the same computer that runs the tool. The application stores runs outside the project repository:

- Windows: `%USERPROFILE%\.ada-remediation\history`
- macOS and Linux: `~/.ada-remediation/history`

Each run is one JSON file containing the complete scan result, embedded screenshot evidence, per-task manual outcomes and notes, and run-level reviewer notes. The dashboard does not create a cloud account or send these records to an external history service.

Select **Scan history** to see runs grouped by website origin. Opening a saved run restores its findings, downloadable reports, manual outcomes, and notes. Select **Delete** to permanently remove that run's JSON record, screenshots, manual review, and notes from the computer. Older records that only stored a “complete” checkbox are reopened as **Not tested** with a migration note so the tool never silently converts completion into a compliance claim.

The newest run is compared with the most recent earlier run for that website by default. Use **Compare with** to choose another earlier run. Comparison uses stable finding and occurrence fingerprints rather than titles or sidebar positions, which allows recurring component findings to remain identifiable across crawls:

- **New**: present in the open run but not the selected earlier run
- **Existing**: present in both runs
- **Resolved**: present in the selected earlier run but absent from the open run

Resolved means the automated finding was not reproduced in the newer scan. Confirm the affected behavior manually and make sure both runs tested equivalent pages, states, authentication, and WCAG targets before treating it as verified remediation.

Code snippets, CSS selectors, scanner rule IDs, HTML-tag references such as `<object>`, and attribute/value pairs such as `role="menuitem"` use the report's monospace technical-chip treatment. The **Recommended fix** section places the failed condition in a distinct **Start here** callout; when axe reports required ARIA parent roles, their expected `role` values appear as separate chips. Manual conformance badges display only **A**, **AA**, or **AAA** so they match automated finding badges.

W3C is presented as the primary accessibility standards source. Deque links are secondary and explain the axe-core rule that produced an automated finding; they do not replace the linked WCAG requirement.

`npm run ui` rebuilds the current source before starting the server. Use it after every pull so you do not accidentally run an older copy from `dist/`.

## Restart the visual dashboard

1. Return to the terminal where the dashboard is running and press `Ctrl+C` once. If you cannot find that terminal, run this from another terminal in the project directory:

   ```bash
   npm run ui:stop
   ```

2. Wait for the command prompt or the `Stopped the ADA Assistant dashboard` message.
3. From the project directory, update dependencies and restart with a fresh build:

   ```bash
   npm install
   npx playwright install chromium
   npm run ui
   ```

4. Reload [http://127.0.0.1:4173](http://127.0.0.1:4173) in the browser.

The dashboard records its process, URL, start time, and a private shutdown token in `~/.ada-remediation/ui-server.json` (under `%USERPROFILE%` on Windows). Starting a second tracked dashboard is refused while the first is active. Stale runtime records are removed automatically, and the stop command sends an authenticated request only to the recorded ADA Assistant server—it does not terminate unrelated Node processes.

If another application owns port 4173, stop the dashboard first and then choose another port:

```bash
npm run ui:stop
npm run ui -- --port 4174
```

Then open [http://127.0.0.1:4174](http://127.0.0.1:4174).

## Understand a result of zero

Check **Pages tested** before interpreting zero findings:

- **Pages tested is 1 or more, Unique findings is 0:** the completed axe-core scan did not detect an automated violation. This is a valid result, but manual accessibility testing is still required.
- **Pages tested is 0:** the page did not complete. Read **Incomplete pages** for the failed stage, number of attempts, and underlying network, HTTP, browser, or audit error. Do not treat this as a clean accessibility result.
- **The UI does not show Pages tested:** you are probably running an older compiled dashboard. Stop it and restart with `npm run ui`.

For a simpler diagnostic without screenshots, run:

```bash
node dist/cli.js scan-url https://www.michiganbusiness.org/ --no-screenshots
```

The terminal will list findings or explain why the page was incomplete.

## Choose a WCAG 2.2 conformance target

Rendered website scans support three cumulative targets:

| Target | Automated rules included | Typical use |
| --- | --- | --- |
| **Level A** | Available Level A rules | Essential minimum checks and early development feedback |
| **Level AA** | Available Level A + AA rules | Common legal, policy, procurement, and production target; this is the default |
| **Level AAA** | Available Level A + AA + AAA rules | Enhanced review for content or services with stricter accessibility goals |

Choose a target in the dashboard or pass `--wcag-level A`, `--wcag-level AA`, or `--wcag-level AAA` to `scan-url` and `scan-site`:

```bash
node dist/cli.js scan-url https://example.com --wcag-level A
node dist/cli.js scan-url https://example.com --wcag-level AA
node dist/cli.js scan-site https://example.com --wcag-level AAA --max-pages 25
```

The selected target filters axe-core to the automated WCAG rules available for that level. Each finding also receives its own **A**, **AA**, or **AAA** badge based on the rule's WCAG tag. All three badge labels share the same green treatment so color never implies that one conformance level is a severity. Hovering over a badge shows its full WCAG level label. After a scan, use **All levels**, **A**, **AA**, or **AAA** to filter the finding list; the level choice combines with the selected impact-severity filter. For example, a Level AAA scan can contain findings from all three levels, and choosing **AAA** shows only the enhanced-level findings.

The WCAG level and severity badges answer different questions: the WCAG badge identifies the requirement's conformance level, while **Critical**, **Serious**, **Moderate**, or **Minor** communicates the automated tool's assessment of user impact. Neither badge proves compliance. Many criteria—including much of Level AAA—require human judgment, assistive-technology testing, content review, and testing by people with disabilities. Repository source scans currently run the tool's supported HTML rules and do not use this rendered-scan level filter; their supported rules are labeled individually.

## Choose how to test a website

| What you have | Testing method | Use this command |
| --- | --- | --- |
| HTML source code in a repository | Source scan | `node dist/cli.js scan-repo .` |
| A locally running development site | Rendered local scan | `node dist/cli.js scan-url http://localhost:3000` |
| One public webpage | Single-page rendered scan | `node dist/cli.js scan-url https://example.com/page` |
| A known list of webpages | Multi-page rendered scan | `node dist/cli.js scan-url URL1 URL2 URL3` |
| A public site that should be crawled | Same-origin site crawl | `node dist/cli.js scan-site https://example.com --max-pages 25` |
| A page behind a login | Authenticated rendered scan | `node dist/cli.js scan-url URL --storage-state auth.json` |
| A pull request or CI build | Source scan with a severity gate | `node dist/cli.js scan-repo . --fail-on serious` |

Source and rendered scans catch different problems. For the best automated coverage, run both when you have the source code and can start the website. Follow automated testing with the manual checks described later in this README.

## Testing method 1: scan HTML source in a repository

Use this method when you have a repository containing `.html` or `.htm` files. It reports file, line, and column locations. It respects `.gitignore` and skips common dependency and build directories.

1. Open a terminal in the repository you want to test.
2. Run the scanner from this project's built CLI, passing the target repository path.
3. Save JSON if you want to create reports, preview fixes, or establish a baseline.

To scan this repository itself:

```bash
node dist/cli.js scan-repo .
```

To scan another repository:

```bash
node dist/cli.js scan-repo "C:\path\to\website" --format json --output ada-results.json
```

To limit the scan to selected folders:

```bash
node dist/cli.js scan-repo . --pattern "src/**/*.html" "templates/**/*.html"
```

Repository scanning currently analyzes HTML and HTM source. React, Vue, and other rendered frameworks should also be tested by starting the application and following method 2.

## Testing method 2: scan a locally running website

Use this method for React, Vue, Angular, server-rendered applications, or any project that builds its final interface in a browser.

1. Start the website yourself using the project's documented development command, such as `npm run dev`.
2. Confirm the site loads in your browser and note its local URL.
3. Keep the development server running.
4. In another terminal, scan that URL.

```bash
node dist/cli.js scan-url http://localhost:3000
```

The assistant deliberately does not execute start commands from scanned repositories. Only start applications you trust.

## Testing method 3: scan one public webpage

Use this when you need the rendered accessibility state of one specific page.

1. Copy the complete page URL, including `https://`.
2. Run `scan-url`.
3. Review the terminal result or save it in another report format.

```bash
node dist/cli.js scan-url https://example.com/contact
```

Rendered URL scans capture highlighted viewport screenshots by default. Add `--no-screenshots` when visual evidence is unnecessary or the page may display sensitive information:

```bash
node dist/cli.js scan-url https://example.com/account --no-screenshots
```

## Testing method 4: scan several known webpages

Pass each complete URL after `scan-url`. Only the listed pages are scanned.

```bash
node dist/cli.js scan-url https://example.com/ https://example.com/contact https://example.com/checkout
```

This is useful for testing a small set of high-value user journeys without crawling the rest of the site.

## Testing method 5: crawl a public website

Use `scan-site` to start at one page, follow same-origin links, and test several rendered pages.

1. Choose a starting URL that links to the important areas of the site.
2. Set a page limit appropriate for the site and your authorization.
3. Increase the timeout only if pages need more time to produce usable HTML.

```bash
node dist/cli.js scan-site https://example.com --max-pages 25
node dist/cli.js scan-site https://example.com --max-pages 50 --timeout 45000
```

The crawler waits for the initial HTML (`DOMContentLoaded`), allows a short rendering settle period, and then runs axe-core. It does not wait for every analytics, advertising, or long-lived network request to become idle. If navigation fails or returns an HTTP error, it retries that page once. Pages that still fail remain under **Incomplete pages** with the failed stage and attempt count while successfully completed pages remain in the report. `--timeout` applies to each navigation attempt.

The crawler stays on the starting origin. It ignores external origins, URL fragments, malformed URLs, and non-HTTP links. A crawl may not discover pages that are unlinked, require form submissions, or appear only after complex interactions; scan those URLs explicitly.

When the same axe rule reports the same CSS selector and detected markup on two or more tested URLs, the report consolidates those copies into one recurring finding. Two compact badges identify the likely component—such as **NAVIGATION MENU**, **FORM**, or **PAGE CONTENT**—and the number of affected pages. Its **Affected pages** section links every page where it appeared. Fix the owning shared component, then retest all listed pages. The summary separates **Unique findings** from total **Occurrences**, so consolidation does not hide how widespread an issue is. Recurring means repeated within the pages tested by this crawl; it does not claim that every page on the full site contains the issue.

The rendered-page scanner identifies the nearest semantic component around each failed element—for example a header menu, navigation region, footer, form, or table. It also captures the affected element's complete rendered parent HTML when that block fits safely in the report; otherwise it preserves the affected element and tells the reviewer to use its selector for more context. Structural parents and children are indented for review while inline text and preformatted content remain intact. This is browser output and may not be the React, Vue, WordPress, template, or other maintained source that produced it. When two or more distinct findings belong to that owner, the dashboard adds one parent item to **Components**, such as **HEADER MENU · 8 FINDINGS · 3 PAGES**. Findings without a shared semantic owner are grouped under **Issue patterns** when they share a concrete remediation theme such as **Color contrast**, **ARIA relationships**, **Accessible names and labels**, **Heading structure**, or **Keyboard and focus**. This keeps repeated scanner titles from filling the queue while avoiding a vague catch-all group.

Selecting either group shows corrections that apply to multiple children and expandable element-level evidence; every child contains its own affected-page links. The group also provides one **Combined AI remediation prompt** containing every child rule, URL, selector, failed condition, rendered HTML context, recommended direction, and verification requirement. Grouped children do not repeat separate prompts in the dashboard. Sidebar finding titles do not use positional numbers because filtering and grouping make those positions unstable. Grouping changes presentation only: distinct finding and occurrence totals remain intact.

Every automated finding also receives a compact issue-category badge such as **COLOR**, **CONTENT**, **ARIA**, **STRUCTURE**, **KEYBOARD**, **FORMS**, or **MEDIA**. Standalone findings receive an individual **AI remediation prompt**; grouped findings use the combined prompt described above. Prompts are technology-agnostic and tell a coding agent to identify the framework, CMS, template, or component that produces the rendered elements before editing maintained source. Treat the result as implementation guidance, review the proposed change, and complete the listed accessibility verification rather than accepting generated code blindly.

### Optionally scan collapsed disclosure states

The initial rendered page does not expose every menu, accordion, or popover to axe-core. Add `--interaction-states` to a rendered scan, or select **Scan disclosure states** in the dashboard, to inspect a deliberately limited set of revealed states:

```bash
node dist/cli.js scan-url https://example.com --interaction-states
node dist/cli.js scan-site https://example.com --max-pages 10 --interaction-states
```

This mode opens at most 10 visible native `<button>` elements per page that are not form-submission controls, currently expose `aria-expanded="false"`, reference exactly one existing element through `aria-controls`, and actually reveal that target when activated. The report counts opened states and labels each newly exposed finding with the disclosure name and trigger selector needed to reproduce it.

This is not a general crawler or complete interaction test. It does not submit forms, follow arbitrary controls, open controls without the expected ARIA state relationship, exercise validation, test keyboard behavior, or complete multi-step user journeys. Use it only on sites you are authorized to interact with, and follow it with manual keyboard and assistive-technology testing.

## Testing method 6: scan authenticated pages

Use a Playwright storage-state file when a page requires login.

1. Create a local authenticated browser state:

   ```bash
   npx playwright codegen --save-storage=auth.json https://example.com/login
   ```

2. Complete the login in the browser window, verify you are signed in, and close the window.
3. Scan the protected URL using the saved state:

   ```bash
   node dist/cli.js scan-url https://example.com/account --storage-state auth.json
   ```

4. Delete the storage-state file when it is no longer needed.

Treat `auth.json` as a secret. Never commit it, share it, or use an account you are not authorized to test. Add the chosen filename to the tested project's `.gitignore`.

## Testing method 7: test in CI or a pull request

Use `--fail-on` to turn findings at or above a severity into exit code `2`:

```bash
node dist/cli.js scan-repo . --fail-on serious
```

For existing sites with known findings, create a baseline first so CI detects newly introduced issues:

```bash
node dist/cli.js scan-repo . --format json --output ada-results.json
node dist/cli.js baseline create ada-results.json --output .ada-baseline.json
node dist/cli.js scan-repo . --baseline .ada-baseline.json --fail-on serious
```

See [the GitHub Actions example](docs/github-actions.yml) for SARIF upload and enforcement.

## Save and review results

### Reports

Every finding uses a normalized schema containing severity, WCAG references, location, evidence, impact, structured remediation guidance (`inspect`, `change`, and `verify` steps), confidence, detection type, and safe-fix metadata. Supported formats are:

- `terminal` for developer feedback
- `json` for automation and remediation
- `html` for a self-contained, filterable review artifact
- `sarif` for code-scanning integrations

Create a reusable JSON result, then render it in another format:

```bash
node dist/cli.js scan-repo . --format json --output ada-results.json
node dist/cli.js report ada-results.json --format html --output accessibility-report.html
node dist/cli.js report ada-results.json --format sarif --output ada-results.sarif
```

Open the HTML report in a browser to combine impact-severity and WCAG-level filters and inspect evidence. Common findings include their affected-page list. JSON preserves every occurrence, and SARIF emits each occurrence as a result location. JSON is also the input for fixes and baselines; SARIF is intended for code-scanning integrations.

## Preview fixes, apply them, and test again

The MVP can remove three types of ineffective or redundant attributes without inventing product meaning:

- empty `aria-labelledby`
- empty `aria-describedby`
- a `role` that exactly duplicates supported native HTML semantics

Fixes are tied to scan evidence, previewed as diffs, and require `--apply` plus confirmation. Use `--yes` only in a controlled environment. Always review the diff and rescan after applying it.

1. Create a JSON result from a repository source scan.
2. Preview the proposed changes. This does not write files.
3. Review every diff.
4. Apply the changes interactively.
5. Run the source scan again and then test the rendered site.

```bash
node dist/cli.js scan-repo . --format json --output ada-results.json
node dist/cli.js fix ada-results.json
node dist/cli.js fix ada-results.json --apply
node dist/cli.js scan-repo .
```

The tool intentionally does **not** invent alt text, accessible names, heading structure, label text, language, or ARIA relationships. Those decisions require knowledge of the content and user experience. Suggestions also avoid adding ARIA roles simply to satisfy a scanner. For example, a styled divider such as `<div class="separator" aria-label="Separator">` is treated as decorative when the surrounding markup supports that conclusion: remove the unnecessary `aria-label`, or use `<hr>` if the divider represents a meaningful thematic break.

## Baseline reference

Create a baseline from an accepted result:

```bash
node dist/cli.js baseline create ada-results.json --output .ada-baseline.json
```

Subsequent scans can omit matching fingerprints and fail only on newly introduced findings:

```bash
node dist/cli.js scan-repo . --baseline .ada-baseline.json --fail-on serious
```

The command exits with `2` when findings meet the `--fail-on` threshold, `1` for an operational failure, and `0` otherwise.

## Architecture

```text
src/
  scanners/       repository parser and Playwright/axe rendered scanner
  reporters/      terminal, JSON, self-contained HTML, and SARIF output
  rules.ts        normalized source-rule definitions
  remediation.ts evidence-bound proposals, diffs, and explicit writes
  baseline.ts     accepted-finding fingerprints
  history.ts      local scan records, review state, and run comparisons
  cli.ts          commands, validation, thresholds, and approval flow
```

The normalized result is the boundary between scanners, reporters, baselines, and remediation. Additional framework parsers or scanning engines can be added without changing report consumers.

## Testing

```bash
npm run check
```

The fast test suite includes intentionally accessible and inaccessible fixtures and covers source scanning, source locations, severity-threshold behavior, three safe fix types, dry-run behavior, HTML output, terminal output, and SARIF serialization.

Run the browser end-to-end test separately after installing Chromium:

```bash
npx playwright install chromium
npm run test:e2e
```

This starts an isolated local fixture and dashboard on temporary ports, drives the UI in Chromium, performs two real rendered axe-core scans, verifies New and Existing comparison states, saves manual progress and reviewer notes, deletes and reopens history, checks downloadable JSON, and fails on browser console errors. Pull-request CI runs both the fast suite and this browser workflow automatically. Test history is written to a temporary directory and removed afterward.

To run only the dashboard's own accessibility gate:

```bash
npm run test:a11y
```

The self-audit injects axe-core into the empty form, active progress, completed grouped findings, expanded child evidence, visual-evidence dialog, manual checklist, scan-history dialog, incomplete-result state, and downloadable HTML report. Any automated WCAG Level A or AA violation fails CI. It also checks keyboard activation and focus return for dialogs, keyboard access to filters and expandable findings, visible input focus, and absence of page-level horizontal overflow at 640px and 320px viewport widths.

This gate prevents known automated regressions; it does not certify that the dashboard conforms to WCAG. Screen-reader behavior, browser zoom, text spacing, forced colors, platform/browser combinations, and usability with people with disabilities still require manual testing.

## Privacy and security

- Repository scans run locally and do not transmit source code or findings.
- URL scans send normal browser requests only to the URLs and page resources being tested.
- Same-site crawling remains on the starting origin.
- Dashboard history is stored locally under `.ada-remediation/history` in the current user's home directory. Records can include page HTML, URLs, screenshots, manual progress, and reviewer notes; protect and delete them according to the tested site's data requirements.
- Authentication is optional and controlled through a user-supplied Playwright storage-state file. Treat that file as a secret and do not commit it.
- The tool does not execute package scripts or application start commands from scanned repositories.
- No AI service is used by the MVP.

Only scan systems you own or are authorized to test.

## Manual testing still required

Automated checks should be followed by, at minimum:

- complete keyboard navigation and visible-focus review
- screen-reader testing with representative browser/AT combinations
- zoom, reflow, text-spacing, contrast, and forced-colors review
- form validation, status-message, timeout, and error-recovery testing
- content, alternative-text, heading, landmark, and link-purpose review
- user testing that includes people with disabilities

## License

MIT
