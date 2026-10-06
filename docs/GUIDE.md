# Guide

The full reference for ADA Remediation Assistant. For a two-minute start, see the [README](../README.md).

> Automated scanning cannot certify ADA, WCAG, or Section 508 compliance. It does not replace keyboard testing, screen-reader testing, usability review, or evaluation by accessibility professionals and people with disabilities.

## Install

Requirements: Node.js 20 or newer.

From this repository, run:

```bash
npm install
npx playwright install chromium
npm run build
```

The examples below use `node dist/cli.js`, which works directly from a built checkout. If you want the shorter `ada-assistant` command, run `npm link` once and substitute `ada-assistant` for `node dist/cli.js` in any example.

Existing local history is retained during a normal update. Version 0.2 reads history-wrapper schema `1.0` through an explicit migration and writes schema `1.1` when a migrated review is next saved. The downloaded report schema remains `1.0` for compatibility. Back up the history directory before pulling an update.

## Use the dashboard

The dashboard is the easiest way to test a website when you have its URL. It runs on your computer and binds to `127.0.0.1`. Nothing is uploaded.

1. Start it with `npm run ui` and open [http://127.0.0.1:4173](http://127.0.0.1:4173).
2. Paste a complete URL and pick the **WCAG 2.2 target**. Level AA is the default; higher levels include the lower ones.
3. Choose options:
   - **Crawl same-origin pages** tests more than the one page. Use it only on sites you are authorized to crawl.
   - **Capture screenshots** adds a highlighted screenshot to each finding.
   - **Scan interactive states** opens up to 10 disclosures, tabs, dialogs, and carousels per page. See [interactive states](#optionally-scan-deterministic-interactive-states).
   - **Use authenticated session** scans pages behind a login. See [method 6](#testing-method-6-scan-authenticated-pages).
4. Select **Scan page** (or **Scan site** when crawling). The progress bar names the current phase.
5. When the scan finishes, the form collapses and focus moves to the results. **Show scan controls** brings the form back.

### Read the results

- **Results bar:** the URL, the WCAG target, and one line of totals. Failed pages are stated next to tested pages. Notices about failed pages, skipped interactive states, and skipped non-HTML files sit just below as collapsed lines.
- **Sidebar:** findings that share an owning component are grouped under **Components**; the rest are listed individually. Filter by severity with the chips.
- **Detail pane:** every section is a card you can collapse. **Failed condition**, **What to change**, the rendered HTML, and the screenshot start open. Supporting material (what to inspect, why it was flagged, how to verify, standards, and the AI prompt) starts closed.
- **Copy AI prompt** gives a coding agent the finding, its evidence, and the verification steps.

### Record your review

- Set **Review** on a finding or a component: Unreviewed, Action required, Accepted risk, or False positive. Add notes if you want. Everything saves on its own.
- **Manual review** lists the checks that need a person. Set an **Outcome** for each: Not tested, Pass, Needs attention, or Not applicable.
- **Notes and comparison** holds run-level notes and lets you compare with an earlier run of the same scan settings.
- **Download JSON** and **Download HTML report** export the findings with your review record. Neither contains a storage-state path or its contents.

A review disposition is a human note, not a scanner result. Reviewed findings stay visible and stay in exports. Only a later equivalent scan can show that a finding is gone.

Press `Ctrl+C` in the terminal to stop the dashboard, or run `npm run ui:stop` from the project directory.

## Use local scan history and comparisons

Every successful dashboard scan is saved automatically on the same computer that runs the tool. The application stores runs outside the project repository:

- Windows: `%USERPROFILE%\.ada-remediation\history`
- macOS and Linux: `~/.ada-remediation/history`

Each run is one JSON file containing the complete scan result, embedded screenshot evidence, automated finding dispositions and notes, per-task manual outcomes and notes, and run-level reviewer notes. The dashboard does not create a cloud account or send these records to an external history service.

Select **Scan history** to see runs grouped by website origin. Each new rendered scan records its exact target, WCAG level, public or authenticated mode, single-page or crawl mode, page limit, screenshot choice, and interactive-state choice. **Run again** immediately applies a public profile. **Prepare rerun** applies an authenticated profile's non-secret settings, but requires the local storage-state path again because the path and session contents are never saved. Opening a saved run restores its findings, downloadable reports, manual outcomes, and notes. Select **Delete** to permanently remove that run's JSON record, screenshots, manual review, and notes from the computer. Older records that predate scan profiles can still be opened, but cannot be rerun or compared as an exact profile.

The newest run is compared with the most recent earlier run that has the same complete scan profile by default. Use **Compare with same-profile run** to choose another compatible run. Runs with a different URL, WCAG target, authentication mode, crawl mode or limit, screenshot choice, or interactive-state choice are excluded so the totals are not presented as an equivalent regression comparison. Comparison uses stable finding and occurrence fingerprints rather than titles or sidebar positions, which allows recurring component findings to remain identifiable across crawls:

- **New**: present in the open run but not the selected earlier run
- **Existing**: present in both runs
- **Resolved**: present in the selected earlier run but absent from the open run

Resolved means the automated finding was not reproduced in the newer scan. Confirm the affected behavior manually and make sure both runs tested equivalent pages, states, authentication, and WCAG targets before treating it as verified remediation.

When the same stable finding appears in the next scan for the same website, WCAG target, and interactive-state setting, its reviewer disposition and notes carry forward. New findings begin as **Unreviewed**.

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

Check the totals in the results bar before interpreting zero findings:

- **1 or more pages tested, 0 unique findings:** the completed axe-core scan did not detect an automated violation. This is a valid result, but manual accessibility testing is still required.
- **0 pages tested:** the page did not complete. Open the **pages could not be tested** notice under the results bar for the failed stage, the number of attempts, and the underlying network, HTTP, browser, or audit error. Do not treat this as a clean accessibility result.
For a simpler diagnostic without screenshots, run:

```bash
node dist/cli.js scan-url https://example.com/ --no-screenshots
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

The selected target filters axe-core to the automated WCAG rules available for that level. Each finding names its own level (A, AA, or AAA) in its metadata line, so a Level AAA scan can contain findings from all three levels.

WCAG level and severity answer different questions. The level identifies the requirement's conformance level. **Critical**, **Serious**, **Moderate**, or **Minor** is the automated tool's assessment of user impact. Neither proves compliance: many criteria, including much of Level AAA, require human judgment, assistive-technology testing, content review, and testing by people with disabilities. Repository source scans run the tool's supported HTML rules and do not use this rendered-scan level filter.

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

Source and rendered scans catch different problems. For the best automated coverage, run both when you have the source code and can start the website. Follow automated testing with the manual checks described at the end of this guide.

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

The crawler stays on the starting origin. It treats a directory URL and its `index.html` or `index.htm` file as one page, so a link to `/index.html` is not scanned again after `/`. It ignores external origins, URL fragments, malformed URLs, and non-HTTP links. It also excludes URLs whose file extension clearly identifies a PDF, image, audio file, video, office document, or archive instead of attempting to navigate to that asset as HTML. These appear in a collapsed **Skipped non-HTML assets** list, not under **Incomplete pages**. PDF accessibility is a separate document-review workflow; this website scanner does not certify or remediate the PDF itself. A crawl may not discover pages that are unlinked, require form submissions, or appear only after complex interactions; scan those HTML URLs explicitly.

When the same axe rule reports the same CSS selector and detected markup on two or more tested URLs, the report consolidates those copies into one recurring finding. Its row shows the number of affected pages, and its **Affected pages** section links every page where it appeared. Fix the owning shared component, then retest all listed pages. The totals separate unique findings from occurrences, so consolidation does not hide how widespread an issue is. Recurring means repeated within the pages tested by this crawl; it does not claim that every page on the full site contains the issue.

The rendered-page scanner identifies the nearest semantic component around each failed element, for example a header menu, navigation region, footer, form, or table. It also captures the affected element's rendered parent HTML when that block fits safely in the report. This is browser output and may not be the React, Vue, WordPress, template, or other maintained source that produced it. When two or more findings belong to the same owner, the dashboard lists one row under **Components**. Findings that only share a theme, such as two images without alternative text on different pages, stay as individual findings.

Inside a component, results with the same automated rule, failed condition, and likely owner are combined into one issue. It states the failure and the fix once, then lists every affected element by its visible name. For `aria-required-parent`, the scanner records the nearest rendered container that directly owns the failing `role="menuitem"` elements when it can identify one. Treat that as the element to inspect, not as permission to add a role blindly. Ordinary website navigation is usually more robust after removing menu-only ARIA from native links and buttons; an intentional application-style menu instead needs the correct `menu` or `menubar` owner plus the complete keyboard interaction pattern.

A component provides one **Combined AI remediation prompt** covering every element in it. Every other finding has its own **AI remediation prompt**. Prompts are technology-agnostic and tell a coding agent to identify the framework, CMS, template, or component that produces the rendered elements before editing maintained source. Treat the result as implementation guidance, review the proposed change, and complete the listed verification rather than accepting generated code blindly. Grouping changes presentation only: finding and occurrence totals remain intact.

### Optionally scan deterministic interactive states

The initial rendered page does not expose every menu, accordion, tab panel, dialog, or carousel slide to axe-core. Add `--interaction-states` to a rendered scan, or select **Scan interactive states** in the dashboard, to inspect a deliberately limited set of states:

```bash
node dist/cli.js scan-url https://example.com --interaction-states
node dist/cli.js scan-site https://example.com --max-pages 10 --interaction-states
```

This mode activates at most 10 visible, enabled native `<button>` elements per page, in document order. Buttons inside forms must use `type="button"`, every trigger must have a unique selector, and every controlled target must be connected through one valid `aria-controls` ID. Four recipes are supported:

- **Disclosure:** the button starts with `aria-expanded="false"`, exposes its controlled target, and can be closed with the same button.
- **Tab:** an inactive `button[role="tab"]` starts with `aria-selected="false"`, controls a `role="tabpanel"`, and has an active sibling tab the scanner can restore afterward.
- **Dialog:** a button uses `aria-haspopup="dialog"`, controls a native `<dialog>` or `role="dialog"` target that starts hidden, and the opened dialog closes with Escape.
- **Carousel:** an explicitly named `role="region"` or `role="group"` with `aria-roledescription="carousel"` has at least two `aria-roledescription="slide"` children, exactly one visible starting slide, and uniquely addressable Next and Previous buttons tied to that carousel. The scanner confirms the slide state is stable, advances once, audits the newly visible slide, returns with Previous, and verifies the complete starting slide state was restored. Carousels with an automatic-rotation control or an ambiguous slide/control structure are left for manual review.

The report counts each recipe separately and labels every newly exposed finding with its interaction type, human-readable state name, and trigger selector. A matching control that cannot be safely opened and restored is listed under **Interactive states skipped** for manual review. The scanner stops trying additional states if an opened dialog cannot be dismissed with Escape.

This is not a general interaction crawler or a complete interaction test. It does not submit forms, activate links, guess at controls without the expected ARIA relationships, run auto-rotating or structurally ambiguous carousels, exercise validation, test keyboard behavior, or complete multi-step user journeys. It advances only one eligible carousel state and does not certify its keyboard operation, announcements, timing controls, or overall usability. Use it only on sites you are authorized to interact with, and follow it with manual keyboard and assistive-technology testing.

## Testing method 6: scan authenticated pages

Use a Playwright storage-state file when a page requires login. This file can contain reusable cookies and tokens, so create it outside the repository and protect it like a password.

1. Create a private directory that is not synchronized or committed, then create the authenticated browser state there. This Windows example uses your user profile; choose an equivalent protected location on macOS or Linux:

   ```powershell
   New-Item -ItemType Directory -Force "$env:USERPROFILE\.ada-remediation\sessions"
   npx playwright codegen --save-storage="$env:USERPROFILE\.ada-remediation\sessions\example-auth.json" https://example.com/login
   ```

2. Complete the login in the browser window, verify you are signed in, and close the window.
3. Choose one testing route:

   - **Dashboard:** run `npm run ui`, select **Use authenticated session**, and paste the file's **absolute path** into **Playwright storage-state JSON**. Then enter the protected URL and select **Scan page**.
   - **Command line:** pass the file with `--storage-state`:

   ```bash
   node dist/cli.js scan-url https://example.com/account --storage-state "C:\Users\you\.ada-remediation\sessions\example-auth.json"
   ```

4. Confirm the result is labeled **Authenticated scan**. Saved history and exports record only `authenticated session`; they do not contain the storage-state path, cookies, tokens, or file contents. Public and authenticated profiles are intentionally excluded from one another's comparisons.
5. To repeat an authenticated history entry, select **Prepare rerun** and supply the absolute path again. Requiring it again prevents the dashboard from retaining a secret path.
6. Delete the storage-state file as soon as it is no longer needed:

   ```powershell
   Remove-Item -LiteralPath "$env:USERPROFILE\.ada-remediation\sessions\example-auth.json"
   ```

Never commit or share a storage-state file, place it in the repository, paste its contents into the dashboard, or use an account you are not authorized to test. Add the chosen filename pattern to the tested project's `.gitignore` as an extra safeguard. Screenshots and rendered HTML from authenticated pages may also contain private information; review exported evidence before sharing it.

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

See [the GitHub Actions example](github-actions.yml) for SARIF upload and enforcement.

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

Open the HTML report in a browser to filter by severity and inspect evidence. Recurring findings include their affected-page list. JSON preserves every occurrence, and SARIF emits each occurrence as a result location. JSON is also the input for fixes and baselines; SARIF is intended for code-scanning integrations.

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
