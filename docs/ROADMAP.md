# Product roadmap

## Version 0.2 — review workflow

Version 0.2 turns scan output into a repeatable accessibility review workflow. Automated findings remain evidence to investigate rather than a claim of ADA, WCAG, or Section 508 compliance.

### 1. Automated finding review records — completed

- Record a human disposition for each finding: Unreviewed, Action required, Accepted risk, or False positive.
- Store reviewer notes with the finding and carry them forward when the same stable finding appears in a compatible rescan.
- Filter findings and show review totals without hiding accepted-risk or false-positive records from exports.
- Apply a disposition and shared notes to every child of a component or issue-pattern group.
- Include finding review records in saved history, JSON downloads, and HTML reports.
- Keep scanner history separate: New, Existing, and Resolved are computed from scans; a reviewer cannot manually mark a finding Resolved.

### 2. Repeatable scan profiles — completed

- Save the target, WCAG level, crawl limit, screenshots, and interaction-state settings with every rendered scan.
- Rerun a saved profile directly from scan history.
- Compare and carry reviewer records forward only between runs created with the same complete profile.

### 3. Authenticated website scanning — completed

- Expose the existing Playwright storage-state support through the local dashboard.
- Clearly label public and authenticated runs.
- Keep credentials and session data out of saved reports and scan history.
- Require the local storage-state path again for every authenticated rerun instead of retaining it in history or the dashboard.

### 4. Broader interactive-state coverage — in progress

- Add conservative recipes for tabs and dialogs alongside the existing disclosure recipe — completed.
- Record the interaction type, trigger, and reproduced state with every state-specific finding — completed.
- Report controls that match a recipe but cannot be safely opened and restored as explicit manual follow-up — completed.
- Add a conservative carousel recipe only after its activation and restoration rules can avoid automatic, destructive, or nondeterministic behavior.
- Continue avoiding form submission, arbitrary links, destructive actions, and nondeterministic interactions.

### 5. Private 0.2 release

- Add history/schema migration and export regression coverage.
- Document upgrade and recovery steps.
- Create a private GitHub tag and release; do not publish the package to npm.

## Later candidates

- Assign findings to owners and due dates.
- Connect review records to issue trackers.
- Add organization-level scan policies and reporting.
