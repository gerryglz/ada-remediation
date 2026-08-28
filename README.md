# ADA Remediation Assistant

`ada-assistant` is an open-source command-line tool for finding accessibility problems in website source code and rendered web pages. It combines source-aware HTML checks with Playwright and axe-core, produces reviewable reports, and previews a deliberately small set of semantics-preserving fixes.

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
4. Leave **Capture screenshots** selected if you want visual evidence.
5. Select **Crawl same-origin pages** only when you want more than the supplied page and are authorized to crawl the site.
6. Click **Scan page**.
7. Review the severity totals, filter the findings, and select one from the **Finding list**. The review workspace separates the result into clearly labeled sections:
   - **Finding summary** explains priority and detection confidence, labels requirements as **WCAG 2.2 · Section X.X.X**, links each one to its exact W3C Understanding page, and labels Deque separately as axe scanner documentation
   - **Where it was found** provides clickable source-page links and the affected CSS selector
   - **Visual evidence** shows a compact screenshot thumbnail that opens into a near-full-window view
   - **Why this was flagged** separates the rule purpose from the specific failed check
   - **Recommended fix** explains the next change to consider
   - **Code example** compares the detected markup with a suggested starting point when a useful pattern is available
   - **How to verify the fix** provides a retesting checklist with W3C standards links first, followed by the affected source page and optional Deque/axe scanner details
8. Use **Download JSON** for machine-readable evidence or **Download HTML report** for a portable visual report.
9. Press `Ctrl+C` in the terminal when you are finished to stop the dashboard.

The dashboard runs locally on your computer and binds to `127.0.0.1` by default. It does not upload reports or screenshots to an external service. Screenshots can contain visible page information, including information from authenticated pages, so review them before sharing.

The results area uses a dashboard layout: select an item from the **Finding list** to open its detailed review workspace. Plum and cornflower accents identify priority and standards information, while a visible divider separates every review section. Click the compact screenshot thumbnail to open an almost full-window view, then use **Close** or the Escape key to return. Before/after examples are starting points, not automatic fixes. Replace bracketed placeholders, consider the listed alternative, review the surrounding code, and retest the page before accepting a change.

W3C is presented as the primary accessibility standards source. Deque links are secondary and explain the axe-core rule that produced an automated finding; they do not replace the linked WCAG requirement.

`npm run ui` rebuilds the current source before starting the server. Use it after every pull so you do not accidentally run an older copy from `dist/`.

## Restart the visual dashboard

1. Return to the terminal where the dashboard is running.
2. Press `Ctrl+C` once and wait for the command prompt to return.
3. From the project directory, update dependencies and restart with a fresh build:

   ```bash
   npm install
   npx playwright install chromium
   npm run ui
   ```

4. Reload [http://127.0.0.1:4173](http://127.0.0.1:4173) in the browser.

If port 4173 is still occupied or you cannot find the earlier terminal, start the dashboard on another port:

```bash
npm run ui -- --port 4174
```

Then open [http://127.0.0.1:4174](http://127.0.0.1:4174).

## Understand a result of zero

Check **Pages tested** before interpreting zero findings:

- **Pages tested is 1 or more, Findings is 0:** the completed axe-core scan did not detect an automated violation. This is a valid result, but manual accessibility testing is still required.
- **Pages tested is 0:** the page did not complete. Read the **Incomplete pages** message for the network, timeout, browser, or navigation error. Do not treat this as a clean accessibility result.
- **The UI does not show Pages tested:** you are probably running an older compiled dashboard. Stop it and restart with `npm run ui`.

For a simpler diagnostic without screenshots, run:

```bash
node dist/cli.js scan-url https://www.michiganbusiness.org/ --no-screenshots
```

The terminal will list findings or explain why the page was incomplete.

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
3. Increase the timeout only if pages load slowly.

```bash
node dist/cli.js scan-site https://example.com --max-pages 25
node dist/cli.js scan-site https://example.com --max-pages 50 --timeout 45000
```

The crawler stays on the starting origin. It ignores external origins, URL fragments, malformed URLs, and non-HTTP links. A crawl may not discover pages that are unlinked, require form submissions, or appear only after complex interactions; scan those URLs explicitly.

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

Every finding uses a normalized schema containing severity, WCAG references, location, evidence, impact, remediation guidance, confidence, detection type, and safe-fix metadata. Supported formats are:

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

Open the HTML report in a browser to filter by severity and inspect evidence. JSON is the input for fixes and baselines. SARIF is intended for code-scanning integrations.

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

The tool intentionally does **not** invent alt text, accessible names, heading structure, label text, language, or ARIA relationships. Those decisions require knowledge of the content and user experience.

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
  cli.ts          commands, validation, thresholds, and approval flow
```

The normalized result is the boundary between scanners, reporters, baselines, and remediation. Additional framework parsers or scanning engines can be added without changing report consumers.

## Testing

```bash
npm run check
```

Tests include intentionally accessible and inaccessible fixtures and cover source scanning, source locations, severity-threshold behavior, three safe fix types, dry-run behavior, HTML output, terminal output, and SARIF serialization.

## Privacy and security

- Repository scans run locally and do not transmit source code or findings.
- URL scans send normal browser requests only to the URLs and page resources being tested.
- Same-site crawling remains on the starting origin.
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
