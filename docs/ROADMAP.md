# Product roadmap

## Version 0.2 — review workflow

Version 0.2 turns scan output into a repeatable accessibility review workflow. Automated findings remain evidence to investigate rather than a claim of ADA, WCAG, or Section 508 compliance.

### 1. Automated finding review records

- Record a human disposition for each finding: Unreviewed, Action required, Accepted risk, or False positive.
- Store reviewer notes with the finding and carry them forward when the same stable finding appears in a compatible rescan.
- Filter findings and show review totals without hiding accepted-risk or false-positive records from exports.
- Apply a disposition and shared notes to every child of a component or issue-pattern group.
- Include finding review records in saved history, JSON downloads, and HTML reports.
- Keep scanner history separate: New, Existing, and Resolved are computed from scans; a reviewer cannot manually mark a finding Resolved.

### 2. Repeatable scan profiles

- Save the target, WCAG level, crawl limit, screenshots, and interaction-state settings.
- Rerun a saved profile from scan history.
- Compare only runs created with compatible scan settings.

### 3. Authenticated website scanning

- Expose the existing Playwright storage-state support through the local dashboard.
- Clearly label public and authenticated runs.
- Keep credentials and session data out of saved reports and scan history.

### 4. Broader interactive-state coverage

- Add conservative recipes for tabs, dialogs, carousels, and similar components.
- Record the trigger and reproduced state with every state-specific finding.
- Avoid form submission, destructive actions, and nondeterministic interactions.

### 5. Private 0.2 release

- Add history/schema migration and export regression coverage.
- Document upgrade and recovery steps.
- Create a private GitHub tag and release; do not publish the package to npm.

## Later candidates

- Assign findings to owners and due dates.
- Connect review records to issue trackers.
- Add organization-level scan policies and reporting.
