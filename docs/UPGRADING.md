# Upgrade and recovery

## Upgrade from 0.1 to 0.2

Version 0.2 keeps the package and GitHub release private. It is installed from an authorized repository checkout and is not published to npm.

The dashboard stores scan history outside the repository. Before updating, stop the dashboard and copy that directory to a dated backup location:

- Windows: `%USERPROFILE%\.ada-remediation\history`
- macOS and Linux: `~/.ada-remediation/history`

The backup can contain URLs, rendered HTML, screenshots, finding decisions, and reviewer notes. Store it with the same protection as the original history and do not commit it.

1. Stop the current dashboard from the 0.1 checkout:

   ```bash
   npm run ui:stop
   ```

2. Copy the complete history directory to a dated backup. On Windows PowerShell:

   ```powershell
   Copy-Item -LiteralPath "$env:USERPROFILE\.ada-remediation\history" -Destination "$env:USERPROFILE\.ada-remediation\history-backup-0.1" -Recurse
   ```

   On macOS or Linux:

   ```bash
   cp -R "$HOME/.ada-remediation/history" "$HOME/.ada-remediation/history-backup-0.1"
   ```

   If the history directory does not exist, no dashboard scans have been saved and this backup step can be skipped.

3. From the repository checkout, pull the approved 0.2 release and refresh local dependencies:

   ```bash
   git pull --ff-only
   npm install
   npx playwright install chromium
   npm run check
   ```

4. Start the dashboard and open one earlier run from **Scan history**:

   ```bash
   npm run ui
   ```

5. Confirm the earlier run still shows its findings, screenshots, automated finding dispositions, manual outcomes, and reviewer notes. Download its JSON and HTML reports as a spot check before continuing normal review work.

## What is migrated

Version 0.2 distinguishes the private saved-history wrapper from the downloaded report format:

- Existing history-wrapper schema `1.0` records are validated and migrated to schema `1.1` in memory when opened.
- A migrated record is rewritten as schema `1.1` only when its review is next saved. Merely opening history does not overwrite the original file.
- Legacy completed manual-task checkboxes become **Not tested** with a note asking the reviewer to classify them. The migration does not claim that an older checkbox represented a verified pass.
- Finding decisions, manual outcomes, notes, screenshots, findings, occurrences, and scan metadata remain part of the saved record and its JSON and HTML exports.
- The downloaded `ScanResult` report schema stays at `1.0`; existing report consumers do not need a schema update for version 0.2.
- Playwright storage-state paths, cookies, and tokens are not added to history or exports.

Unknown schema versions and malformed JSON files are ignored rather than guessed at or overwritten. Keep the backup until the 0.2 history and exports have been reviewed successfully.

## Recover or roll back

If the updated dashboard cannot open expected history, stop it before changing any files:

```bash
npm run ui:stop
```

Then use the least destructive applicable recovery:

1. Confirm you are inspecting the same operating-system account and history directory shown by the dashboard's **Scan history** dialog.
2. Preserve the current history directory under a different name; do not delete it while investigating.
3. Restore the complete pre-upgrade backup to the normal history path.
4. Restart version 0.2 and check the restored run again. Invalid individual files are skipped, so compare the active directory with the backup if one run is missing.
5. If application rollback is necessary, restore the 0.1 history backup first. Version 0.1 does not understand history-wrapper schema `1.1`. Run the `v0.1.0` tag from a separate checkout or worktree so the 0.2 checkout and its dependencies remain intact.

Example separate rollback worktree:

```bash
git worktree add ../ada-remediation-0.1.0 v0.1.0
cd ../ada-remediation-0.1.0
npm install
npx playwright install chromium
npm run ui
```

Do not reuse an authenticated Playwright storage-state file unless it is still authorized and protected. Rolling back the application does not roll back or revoke website sessions.

## Release verification

Before the private `v0.2.0` tag is created, the release commit should pass:

```bash
npm run release:check
npm run test:e2e
```

The tag-triggered GitHub workflow verifies that `package.json` is still marked private and that the tag exactly matches the package version. It creates a package artifact attached to the private GitHub release; it has no npm publication step.
