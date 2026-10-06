import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { readFile, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { comparisonForRun, defaultHistoryDirectory, deleteScanRun, getScanRun, listScanRuns, reviewedScanResult, saveScanRun, updateRunReview } from "../history.js";
import { htmlReport } from "../reporters/index.js";
import { scanUrls, type UrlScanProgress } from "../scanners/url.js";
import { sharedCss } from "../styles.js";
import type { FindingReview, ManualTaskReview, ScanResult } from "../types.js";
import { parseWcagLevel, WCAG_UNDERSTANDING_URLS, WCAG_VERSION } from "../wcag.js";
import { createUiRuntimeRecord, defaultUiRuntimePath, prepareUiRuntime, removeUiRuntime, writeUiRuntime, type UiRuntimeRecord } from "./runtime.js";

export interface UiServerOptions {
  host?: string;
  port?: number;
  historyDirectory?: string;
  runtimePath?: string | false;
}

export interface UiServerHandle {
  server: Server;
  url: string;
}

function send(res: ServerResponse, status: number, contentType: string, body: string): void {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'self' data:; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
  });
  res.end(body);
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  send(res, status, "application/json; charset=utf-8", JSON.stringify(payload));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 4_194_304) throw new Error("Request body is too large.");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function parseTarget(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Enter a website URL.");
  const target = new URL(value.trim());
  if (!["http:", "https:"].includes(target.protocol)) throw new Error("The website URL must begin with http:// or https://.");
  return target.href;
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(parsed)));
}

async function validatedStorageStatePath(value: unknown): Promise<string> {
  if (typeof value !== "string" || !value.trim()) throw new Error("Enter the absolute path to a Playwright storage-state JSON file.");
  const storageStatePath = value.trim();
  if (!isAbsolute(storageStatePath)) throw new Error("The storage-state path must be absolute.");
  try {
    const information = await stat(storageStatePath);
    if (!information.isFile()) throw new Error("not-file");
    if (information.size > 5_242_880) throw new Error("too-large");
    const parsed = JSON.parse(await readFile(storageStatePath, "utf8")) as { cookies?: unknown; origins?: unknown };
    if (!Array.isArray(parsed.cookies) || !Array.isArray(parsed.origins)) throw new Error("invalid-shape");
  } catch {
    throw new Error("The storage-state file could not be opened or is not a valid Playwright storage-state JSON file.");
  }
  return storageStatePath;
}

export function dashboardHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="theme-color" content="#f7f4ed">
  <title>ADA Assistant dashboard</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%231c1c1c'/%3E%3Cpath d='M18 46 29 17h6l11 29h-7l-2-7H27l-2 7Zm11-13h6l-3-9Z' fill='%23fcfbf8'/%3E%3C/svg%3E">
  <style>
    ${sharedCss}
    html,body{height:100%}
    body{display:flex;flex-direction:column;overflow:hidden}
    .skip{position:absolute;left:8px;top:-48px;z-index:20;padding:8px 12px;border-radius:6px;background:var(--ink);color:var(--raised)}
    .skip:focus{top:8px}
    main:focus{outline:0}
    .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}

    .btn.solid{height:36px;padding:0 18px;border-color:var(--ink);background:var(--ink);color:var(--raised);font-size:14px}
    .btn.solid:hover{background:#000}
    .btn.solid:disabled{opacity:.55;cursor:wait}
    .field input:not([type=checkbox]),.field select,.field textarea{height:36px;padding:0 10px;border:1px solid var(--line-strong);border-radius:6px;background:var(--raised);font:inherit;color:var(--ink)}
    .check{display:inline-flex;align-items:center;gap:7px;min-height:36px;cursor:pointer}
    .check input[type=checkbox]{width:16px;height:16px;margin:0;accent-color:var(--ink)}

    .app-header{display:flex;align-items:center;gap:12px;height:48px;padding:0 20px;border-bottom:1px solid var(--line);flex:none}
    .app-header h1{margin-right:auto;font-size:15px;font-weight:600}
    main{flex:1;min-height:0;display:flex;flex-direction:column}

    .scan-panel{padding:14px 20px;border-bottom:1px solid var(--line);flex:none}
    .scan-form{display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px 16px}
    .field.grow{flex:1 1 320px;min-width:0}
    .field.grow input,.field.grow textarea{width:100%}
    .field.checks{flex-basis:100%;order:1;display:flex;flex-wrap:wrap;gap:0 20px}
    .field.auth{flex-basis:100%;order:2}
    .field.auth input{width:min(100%,640px);font-family:var(--mono);font-size:13px}
    .field.auth .note{display:block;margin-top:4px}
    #max-pages{width:64px;height:28px}
    .scan-progress{margin-top:12px}
    .progress-track{height:4px;border-radius:999px;background:rgba(28,28,28,.12);overflow:hidden}
    .progress-fill{display:block;height:100%;background:var(--ink);transform:scaleX(0);transform-origin:left;transition:transform .25s ease-out}
    .progress-copy{display:flex;justify-content:space-between;gap:16px;margin-top:6px;font-size:13px;color:var(--body)}
    .progress-copy span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .progress-copy strong{font-variant-numeric:tabular-nums}
    .status{margin:10px 0 0;font-size:13px;color:var(--muted)}
    .status.error{color:var(--ink);font-weight:600}
    input::placeholder,textarea::placeholder{color:var(--muted)}
    .status:empty{display:none}

    .empty-state{flex:1;display:grid;place-content:center;gap:6px;padding:32px 20px;text-align:center;color:var(--muted)}
    .empty-state h2{font-size:18px;font-weight:600;color:var(--ink)}
    .empty-state p{max-width:46ch;text-wrap:pretty}

    .results{flex:1;min-height:0;display:flex;flex-direction:column}
    .results-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 20px;padding:10px 20px;border-bottom:1px solid var(--line);flex:none}
    .results-id{display:flex;align-items:center;gap:10px;min-width:0}
    .result-source{min-width:0;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .tag{flex:none;padding:1px 8px;border:1px solid var(--line-strong);border-radius:999px;font-size:12px;white-space:nowrap}
    .results-stats{margin-right:auto;color:var(--body);font-variant-numeric:tabular-nums}
    .results-stats strong{color:var(--ink)}
    .results-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-left:auto}
    .save-state{font-size:12px;color:var(--muted)}
    .run-review{display:flex;flex-wrap:wrap;align-items:flex-start;gap:10px 16px;padding:12px 20px;border-bottom:1px solid var(--line);background:var(--raised);flex:none}
    .run-review select{max-width:100%}
    .run-review textarea{height:auto;min-height:36px;max-height:110px;padding:7px 10px;resize:vertical}
    .run-review .note,.resolved{flex-basis:100%;margin:0}
    .resolved ul,.incomplete ul{margin:4px 0 0;padding-left:18px}
    .incomplete{padding:10px 20px;border-bottom:1px solid var(--line);background:var(--raised);flex:none;max-height:30vh;overflow:auto}
    .incomplete li{overflow-wrap:anywhere}
    .incomplete p{margin:4px 0}
    .incomplete summary{font-weight:600;cursor:pointer}
    .incomplete>*+details{margin-top:6px}

    .workspace{flex:1;min-height:0;display:grid;grid-template-columns:340px minmax(0,1fr)}
    .sidebar{display:flex;flex-direction:column;min-height:0;border-right:1px solid var(--line)}
    .sidebar-head{display:grid;gap:10px;padding:12px;border-bottom:1px solid var(--line)}
    .tabs{display:grid;grid-template-columns:1fr 1fr;gap:3px;padding:3px;border-radius:9px;background:var(--tint)}
    .tabs button{height:30px;padding:0 6px;border:0;border-radius:6px;background:transparent;font-size:13px;white-space:nowrap;cursor:pointer;transition:background-color .15s ease-out}
    .tabs button:hover{background:var(--tint)}
    .tabs button[aria-pressed=true]{background:var(--raised);box-shadow:0 0 0 1px var(--line),0 1px 2px rgba(0,0,0,.06);font-weight:600}
    .list{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:8px;display:flex;flex-direction:column;gap:2px}
    .list-label{padding:10px 10px 4px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
    .list-empty{padding:24px 12px;color:var(--muted);text-wrap:pretty}
    .row{display:grid;grid-template-columns:8px minmax(0,1fr);gap:10px;width:100%;padding:9px 10px;border:0;border-radius:8px;background:transparent;font:inherit;color:var(--ink);text-align:left;cursor:pointer;transition:background-color .15s ease-out}
    .row:hover{background:var(--tint)}
    .row[aria-current=true]{background:var(--raised);box-shadow:inset 0 0 0 1px var(--line-strong)}
    .component>.dot{border-radius:2px}
    .row.manual{grid-template-columns:minmax(0,1fr)}
    .row.manual .dot{display:none}

    .detail{min-width:0;overflow:auto;scrollbar-gutter:stable;padding:28px 40px 72px}
    .detail>*{max-width:820px}
    .detail-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}
    .detail-head>div{min-width:0}
    .review{display:grid;gap:6px;margin-top:16px}
    .review-field{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted)}
    .review-notes>summary{font-size:13px;color:var(--muted);cursor:pointer}
    .detail textarea{display:block;width:100%;min-height:72px;margin-top:6px;padding:8px 10px;border:1px solid var(--line-strong);border-radius:6px;background:var(--raised);font:inherit;color:var(--ink);resize:vertical}
    .detail label.label{margin-top:20px}
    .review-select{height:32px;padding:0 6px;border:1px solid var(--line-strong);border-radius:6px;background:var(--raised);font-size:13px}

    .history-dialog{width:min(94vw,980px);max-width:none;max-height:88vh;padding:20px;overscroll-behavior:contain;border:1px solid var(--line);border-radius:14px;background:var(--cream);color:var(--ink)}
    .history-dialog::backdrop{background:rgba(28,28,28,.72)}
    .history-dialog .dialog-bar{align-items:flex-start}
    .history-dialog .dialog-bar p{margin-top:4px;font-size:13px;color:var(--muted)}
    .history-storage{padding:8px 10px;border-radius:6px;background:var(--tint);font-family:var(--mono);font-size:12px;overflow-wrap:anywhere}
    .history-list{display:grid;gap:10px;margin-top:10px;max-height:62vh;overflow:auto}
    .history-empty{padding:32px;text-align:center;color:var(--muted)}
    .history-group{display:grid;gap:8px}
    .history-group h3{position:sticky;top:0;padding:8px 0;background:var(--cream);font-size:14px;font-weight:600}
    .history-row{display:grid;grid-template-columns:minmax(220px,1fr) repeat(3,auto);gap:12px;align-items:center;padding:11px;border:1px solid var(--line);border-radius:10px}
    .history-row strong{display:block}
    .history-row span{display:block;font-size:12px;color:var(--muted)}
    .history-row-actions{display:flex;flex-wrap:wrap;gap:6px;grid-column:1/-1}
    .notice{flex:none;padding:10px 14px;border-top:1px solid var(--line);font-size:12px;color:var(--muted);text-wrap:pretty}

    @media(max-width:900px){
      html,body{height:auto}
      body{display:block;overflow:auto}
      .app-header{position:sticky;top:0;z-index:10;background:var(--cream)}
      .app-header h1{white-space:nowrap}
      main,.results,.workspace{display:block}
      .sidebar{border-right:0;border-bottom:1px solid var(--line)}
      .list{max-height:55vh}
      .detail{overflow:visible;padding:20px 16px 56px;scroll-margin-top:48px}
      .detail-head{flex-direction:column;gap:12px}
      .history-row{grid-template-columns:1fr auto auto}
      .results{scroll-margin-top:48px}
      .results-actions{margin-left:0}
      .empty-state{min-height:50vh}
    }
    @media(max-width:600px){
      .app-header{height:auto;min-height:48px;flex-wrap:wrap;padding:8px 16px}
      .scan-panel,.results-bar,.run-review,.incomplete{padding-left:16px;padding-right:16px}
      .history-row{grid-template-columns:1fr}
      .history-dialog{padding:14px}
    }
  </style>
</head>
<body>
  <a class="skip" href="#main">Skip to main content</a>
  <header class="app-header">
    <h1>ADA Assistant</h1>
    <button class="btn" id="history-toggle" type="button">Scan history</button>
    <button class="btn" id="scan-toggle" type="button" aria-controls="scan-panel" aria-expanded="true" hidden>Hide scan controls</button>
  </header>
  <main id="main" tabindex="-1">
    <section class="scan-panel" id="scan-panel" aria-label="Scan a website">
      <form class="scan-form" id="scan-form">
        <div class="field grow"><label class="label" for="url">Website URL</label><input id="url" name="url" type="url" required autocomplete="off" spellcheck="false" placeholder="https://example.com/…"></div>
        <div class="field"><label class="label" for="wcag-level">WCAG 2.2 target</label><select id="wcag-level" aria-describedby="wcag-level-help"><option value="A">Level A — essential</option><option value="AA" selected>Level AA — common target</option><option value="AAA">Level AAA — enhanced</option></select><span id="wcag-level-help" hidden>AA includes Level A checks. AAA includes A and AA checks. Automated results cannot certify conformance.</span></div>
        <div class="field checks">
          <label class="check"><input id="crawl" type="checkbox"> Crawl same-origin pages</label>
          <label class="check" id="pages-label" hidden>up to <input id="max-pages" type="number" inputmode="numeric" min="1" max="50" value="10" aria-label="Page limit"> pages</label>
          <label class="check"><input id="screenshots" type="checkbox" checked> Capture screenshots</label>
          <label class="check" title="Audits up to 10 visible, deterministic disclosure, tab, dialog, and carousel states using explicit ARIA relationships. It never submits forms or activates arbitrary links."><input id="interaction-states" type="checkbox"> Scan interactive states</label>
          <label class="check"><input id="authenticated" type="checkbox"> Use authenticated session</label>
        </div>
        <button class="btn solid" id="scan-button" type="submit">Scan page</button>
        <div class="field auth" id="storage-state-label" hidden><label class="label" for="storage-state">Playwright storage-state JSON</label><input id="storage-state" name="storageStatePath" type="text" autocomplete="off" spellcheck="false" aria-describedby="storage-state-help" placeholder="C:\\absolute\\path\\to\\auth.json"><span class="note" id="storage-state-help">Used for this scan only. Never stored.</span></div>
      </form>
      <div class="scan-progress" id="scan-progress" hidden>
        <div class="progress-track" id="progress-track" role="progressbar" aria-label="Scan progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="progress-fill" id="progress-fill"></span></div>
        <div class="progress-copy"><span id="progress-message">Preparing scan…</span><strong id="progress-percent">0%</strong></div>
      </div>
      <p class="status" id="status" role="status" aria-live="polite"></p>
    </section>
    <section class="empty-state" id="empty">
      <h2>Scan a page to see its findings</h2>
      <p>Enter a URL above, or open a saved run from Scan history. Everything runs on this computer.</p>
    </section>
    <section class="results" id="results" hidden aria-labelledby="results-heading">
      <h2 class="sr-only" id="results-heading" tabindex="-1">Scan results</h2>
      <div class="results-bar">
        <div class="results-id"><a class="result-source" id="result-source" target="_blank" rel="noopener noreferrer"></a><span class="tag" id="result-level"></span><span class="tag" id="result-auth" hidden>Authenticated scan</span></div>
        <p class="results-stats" id="summary"></p>
        <div class="results-actions"><span class="save-state" id="save-state" role="status"></span><button class="btn" id="run-review-toggle" type="button" aria-controls="run-review" aria-expanded="false" hidden>Notes and comparison</button><a class="btn" id="json-download" href="/api/report.json">Download JSON</a><a class="btn" id="html-download" href="/api/report.html">Download HTML report</a></div>
      </div>
      <div class="run-review" id="run-review" hidden>
        <div class="field"><label class="label" for="comparison-base">Compare with same-profile run</label><select id="comparison-base"></select></div>
        <div class="field grow"><label class="label" for="run-notes">Reviewer notes for this saved run</label><textarea id="run-notes" rows="2" maxlength="10000" placeholder="Record decisions, testing performed, ownership, or follow-up work."></textarea></div>
        <p class="note" id="result-profile"></p>
        <div class="resolved" id="resolved-panel" hidden></div>
      </div>
      <div class="incomplete" id="incomplete" hidden></div>
      <div class="workspace"><aside class="sidebar" aria-label="Report navigation"><div class="sidebar-head"><div class="tabs" role="group" aria-label="Report view"><button id="automated-tab" type="button" aria-pressed="true">Automated findings</button><button id="manual-tab" type="button" aria-pressed="false">Manual review</button></div><div class="chips" id="filters" role="group" aria-label="Impact severity"></div><div class="chips" id="manual-status-filters" role="group" aria-label="Manual review status" hidden></div></div><div class="list" id="finding-list"></div><p class="notice" id="notice"></p></aside><article class="detail" id="finding-detail" tabindex="-1" aria-label="Selected item"></article></div>
    </section>
  </main>
  <dialog class="image-dialog" id="image-dialog" aria-labelledby="dialog-title"><div class="dialog-bar"><strong id="dialog-title">Visual evidence</strong><button class="btn" id="dialog-close" type="button">Close</button></div><img id="dialog-image" alt=""></dialog>
  <dialog class="history-dialog" id="history-dialog" aria-labelledby="history-title" aria-describedby="history-description"><div class="dialog-bar"><div><strong id="history-title">Local scan history</strong><p id="history-description">Saved only on this computer.</p></div><button class="btn" id="history-close" type="button">Close</button></div><p class="history-storage" id="history-storage"></p><div class="history-list" id="history-list"></div></dialog>
  <script>
    const wcagVersion=${JSON.stringify(WCAG_VERSION)};
    const wcagUnderstandingUrls=${JSON.stringify(WCAG_UNDERSTANDING_URLS)};const wcagUnderstandingIndex='https://www.w3.org/WAI/WCAG22/Understanding/';const form=document.getElementById('scan-form');const crawl=document.getElementById('crawl');const pagesLabel=document.getElementById('pages-label');const authenticated=document.getElementById('authenticated');const storageStateLabel=document.getElementById('storage-state-label');const storageState=document.getElementById('storage-state');const button=document.getElementById('scan-button');const status=document.getElementById('status');const progress=document.getElementById('scan-progress');const progressMessage=document.getElementById('progress-message');const progressPercent=document.getElementById('progress-percent');const progressTrack=document.getElementById('progress-track');const progressFill=document.getElementById('progress-fill');const results=document.getElementById('results');const scanPanel=document.getElementById('scan-panel');const emptyState=document.getElementById('empty');const runToggle=document.getElementById('run-review-toggle');const list=document.getElementById('finding-list');const detail=document.getElementById('finding-detail');const severityFilters=document.getElementById('filters');const manualStatusFilters=document.getElementById('manual-status-filters');const automatedTab=document.getElementById('automated-tab');const manualTab=document.getElementById('manual-tab');const scanToggle=document.getElementById('scan-toggle');const imageDialog=document.getElementById('image-dialog');const dialogImage=document.getElementById('dialog-image');const dialogTitle=document.getElementById('dialog-title');const historyToggle=document.getElementById('history-toggle');const historyDialog=document.getElementById('history-dialog');const historyList=document.getElementById('history-list');const historyStorage=document.getElementById('history-storage');const comparisonBase=document.getElementById('comparison-base');const runReview=document.getElementById('run-review');const runNotes=document.getElementById('run-notes');const saveState=document.getElementById('save-state');const resolvedPanel=document.getElementById('resolved-panel');let latest=null;let activeFilter='all';let activeManualStatus='all';let reviewMode='automated';let selectedFingerprint=null;let selectedManualId=null;let progressTimer=null;let displayedProgress=0;let currentRunId=null;let currentComparison=null;let historyRuns=[];const manualReviews=new Map();const findingReviews=new Map();
    let selectedGroupId=null;let reviewDirty=false;
    function syncScanLabel(){button.textContent=crawl.checked?'Scan site':'Scan page';}
    const scrollBehavior=()=>window.matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth';
    crawl.addEventListener('change',()=>{pagesLabel.hidden=!crawl.checked;syncScanLabel();});
    authenticated.addEventListener('change',()=>{storageStateLabel.hidden=!authenticated.checked;if(authenticated.checked)storageState.focus();});
    function el(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
    function interactionTypeLabel(type){return type==='tab'?'Tab':type==='dialog'?'Dialog':type==='disclosure'?'Disclosure':type==='carousel'?'Carousel':'Interactive';}
    function interactionAction(location){return location?.interactionType==='tab'?'After selecting ':location?.interactionType==='carousel'?'After advancing ':'After opening ';}
    function scanProfileLabel(profile){if(!profile)return 'Legacy run · exact scan profile unavailable';return 'WCAG '+profile.wcagLevel+' · '+(profile.crawl?'Crawl up to '+profile.maxPages+' pages':'Single page')+' · screenshots '+(profile.captureScreenshots?'on':'off')+' · interactive states '+(profile.interactionStates?'on':'off')+' · '+(profile.authentication==='storage-state'?'authenticated':'public');}
    function scanProfilesMatch(left,right){return Boolean(left&&right&&left.target===right.target&&left.wcagLevel===right.wcagLevel&&left.crawl===right.crawl&&left.maxPages===right.maxPages&&left.captureScreenshots===right.captureScreenshots&&left.interactionStates===right.interactionStates&&(left.authentication||'public')===(right.authentication||'public'));}
    function applyAndRunProfile(profile){document.getElementById('url').value=profile.target;document.getElementById('wcag-level').value=profile.wcagLevel;crawl.checked=profile.crawl;document.getElementById('max-pages').value=String(profile.maxPages);pagesLabel.hidden=!profile.crawl;syncScanLabel();document.getElementById('screenshots').checked=profile.captureScreenshots;document.getElementById('interaction-states').checked=profile.interactionStates;authenticated.checked=profile.authentication==='storage-state';storageStateLabel.hidden=!authenticated.checked;storageState.value='';historyDialog.close();setScanControlsExpanded(true);if(authenticated.checked){status.className='status';status.textContent='Enter the storage-state path again, then start the scan. It is never stored.';storageState.focus();return;}form.requestSubmit();}
    function renderResolvedPanel(){resolvedPanel.replaceChildren();const resolved=currentComparison?.resolvedFindings||[];resolvedPanel.hidden=!resolved.length;if(!resolved.length)return;resolvedPanel.append(el('strong','','Resolved since the selected comparison run'));const items=el('ul','');resolved.forEach(finding=>items.append(appendTechnicalText(el('li',''),finding.title)));resolvedPanel.append(items);}
    function appendTechnicalText(parent,text){String(text).split(/(<\\/?[a-z][^>]*>|\\baria-[a-z0-9-]+\\b(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s,.;]+))?|\\brole\\b(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s,.;]+))?|\\b(?:tabindex|alt|for|id|href|lang)\\b\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s,.;]+))/gi).filter(Boolean).forEach(part=>parent.append(/^<\\/?[a-z]|^aria-[a-z0-9-]+\\b|^role\\b|^(?:tabindex|alt|for|id|href|lang)\\b\\s*=/i.test(part)?el('code','inline-code',part):document.createTextNode(part)));return parent;}
    function manualReview(check){return manualReviews.get(check.id)||{status:'not-tested',notes:''};}
    function manualStatusLabel(value){return {'not-tested':'Not tested',pass:'Pass','needs-attention':'Needs attention','not-applicable':'Not applicable'}[value]||'Not tested';}
    function manualCounts(){const counts={'not-tested':0,pass:0,'needs-attention':0,'not-applicable':0};(latest?.manualChecks||[]).forEach(check=>counts[manualReview(check).status]++);return counts;}
    function findingReview(finding){return findingReviews.get(finding.fingerprint)||{disposition:'unreviewed',notes:''};}
    function findingDispositionLabel(value){return {unreviewed:'Unreviewed','action-required':'Action required','accepted-risk':'Accepted risk','false-positive':'False positive'}[value]||'Unreviewed';}
    function setFindingReviews(findings,updates,save=false){findings.forEach(finding=>findingReviews.set(finding.fingerprint,{...findingReview(finding),...updates}));reviewDirty=true;saveState.textContent='Unsaved changes';renderSummary(latest);if(save){preserveDetail(renderFindings);void persistReview();}}
    function renderSummary(result){const occurrences=result.metadata.findingOccurrences??result.findings.reduce((total,f)=>total+(f.occurrences?.length||1),0);document.getElementById('result-level').textContent='WCAG '+wcagVersion+' Level '+(result.metadata.wcagLevel||'AA');document.getElementById('result-profile').textContent='Scanned '+new Date(result.metadata.completedAt).toLocaleString()+' · '+(result.metadata.profile?'Saved scan profile · '+scanProfileLabel(result.metadata.profile):'Older run without a saved profile. Start a new scan to compare or rerun.');document.getElementById('result-auth').hidden=result.metadata.profile?.authentication!=='storage-state';const summary=document.getElementById('summary');summary.replaceChildren();const stats=[['pages',result.metadata.pagesOrFilesScanned,'page tested','pages tested'],['findings',result.findings.length,'unique finding','unique findings'],['occurrences',occurrences,'occurrence','occurrences']];const pagesFailed=(result.metadata.incomplete||[]).length;if(pagesFailed)stats.splice(1,0,['pages-failed',pagesFailed,'page failed','pages failed']);const statesOpened=result.metadata.interactionStatesScanned||0;const statesSkipped=(result.metadata.interactionStateFailures||[]).length;if(statesOpened||statesSkipped)stats.push(['states-opened',statesOpened,'state opened','states opened']);if(statesSkipped)stats.push(['states-skipped',statesSkipped,'state skipped','states skipped']);if(currentComparison){stats.push(['new',currentComparison.newCount,'new','new']);if(currentComparison.existingCount)stats.push(['existing',currentComparison.existingCount,'existing','existing']);if(currentComparison.resolvedCount)stats.push(['resolved',currentComparison.resolvedCount,'resolved','resolved']);}stats.forEach(([key,count,one,many],index)=>{if(index)summary.append(' · ');const value=el('strong','',String(count));value.dataset.stat=key;summary.append(value,' '+(count===1?one:many));});renderResolvedPanel();}
    function externalLink(label,url,className){const wcagMatch=label.match(/^WCAG (\\d+\\.\\d+\\.\\d+)(.*)$/);const visibleLabel=wcagMatch?'WCAG '+wcagVersion+' · Section '+wcagMatch[1]+wcagMatch[2]:label;const link=el('a',className||'source',visibleLabel);link.href=url;link.target='_blank';link.rel='noopener noreferrer';return link;}
    function findingRenderedContext(f){return f?.renderedHtmlContext||{html:f?.evidence||'',scope:'element',truncated:false};}
    function showProgress(update){const value=Math.max(displayedProgress,Math.max(0,Math.min(100,Number(update.percent)||0)));displayedProgress=value;progress.hidden=false;progressMessage.textContent=update.message||'Scan in progress…';progressPercent.textContent=Math.round(value)+'%';progressTrack.setAttribute('aria-valuenow',String(Math.round(value)));progressFill.style.transform='scaleX('+value/100+')';}
    async function pollProgress(){try{const response=await fetch('/api/progress',{cache:'no-store'});if(response.ok)showProgress(await response.json());}catch{} }
    function startProgressPolling(){displayedProgress=0;showProgress({percent:1,message:'Starting the browser and preparing the scan…'});progressTimer=setInterval(pollProgress,350);}
    function stopProgressPolling(){if(progressTimer!==null){clearInterval(progressTimer);progressTimer=null;}}
    function openScreenshot(f){dialogTitle.textContent=f.title;dialogImage.src=f.screenshot.dataUrl;dialogImage.alt=f.screenshot.description;imageDialog.showModal();}
    function findingOccurrences(f){return f?.occurrences?.length?f.occurrences:[{fingerprint:f.fingerprint,location:f.location}];}
    function affectedPages(f){return [...new Map(findingOccurrences(f).filter(item=>item.location?.url).map(item=>[item.location.url,item.location])).values()];}
    function findingComponentCategory(f){if(f?.componentCategory)return f.componentCategory;const context=[f?.ruleId,f?.title,f?.location?.selector,f?.evidence].filter(Boolean).join(' ').replace(/\s+/g,' ').toLowerCase();const menu=/<nav\\b|\\b(?:navigation|navbar|menubar|menuitem|menu|js-top-level)\\b/.test(context);const header=/<header\\b|\\b(?:site-header|masthead|banner)\\b/.test(context);if(menu&&header)return 'Header menu';if(menu)return 'Navigation menu';if(header)return 'Header';if(/<footer\\b|\\b(?:site-footer|contentinfo)\\b/.test(context))return 'Footer';if(/<(?:form|input|select|textarea|label|fieldset)\\b|\\bform\\b/.test(context))return 'Form';if(/<(?:table|thead|tbody|tr|th|td)\\b|\\btable\\b/.test(context))return 'Table';if(/<(?:img|picture|video|audio|object|svg)\\b|\\b(?:image|media|video|audio)\\b/.test(context))return 'Image or media';if(/<(?:button|a)\\b|\\b(?:button|link|control)\\b/.test(context))return 'Interactive control';return 'Page content';}
    function groupMembers(group,findings){const ids=new Set(group.findingFingerprints);return findings.filter(f=>ids.has(f.fingerprint));}
    function groupPages(group,members){const pages=[...new Set(members.flatMap(f=>affectedPages(f).map(page=>page.url)))];return pages.length?pages:(group.pages||[]);}
    function groupCorrections(group,members){const ids=new Set(members.map(f=>f.fingerprint));return (group.sharedCorrections||[]).map(correction=>{const matching=correction.findingFingerprints.filter(id=>ids.has(id));return {...correction,appliesTo:matching.length,findingFingerprints:matching};}).filter(correction=>correction.appliesTo>1);}
    function combinedGroupPrompt(group,members){if(group.remediationPrompt)return group.remediationPrompt;return ['Fix all accessibility findings in this '+(group.kind==='pattern'?'shared remediation pattern':'shared website component')+': '+group.name+'.','','First identify the framework, CMS, template, component, or stylesheet that produces these rendered elements and update the maintained reusable source.','','Findings to resolve:',...members.flatMap((finding,index)=>[(index+1)+'. '+finding.title,'   Rule: '+finding.ruleId,'   Page: '+(finding.location.url||finding.location.file||'Locate in the project'),'   Selector: '+(finding.location.selector||'Not provided'),'   Failed condition: '+finding.impact,'   Rendered HTML context: '+findingRenderedContext(finding).html]),'','Verify every listed selector and affected page after making the coordinated correction.'].join(String.fromCharCode(10));}
    function findingIssueCategory(f){if(f?.issueCategory)return f.issueCategory;const context=[f?.ruleId,f?.title,f?.evidence,f?.location?.selector].filter(Boolean).join(' ').toLowerCase();if(/contrast|color|colour|link-in-text-block/.test(context))return 'Color';if(/aria|\brole\b/.test(context))return 'ARIA';if(/keyboard|focus|tabindex|bypass|skip-link/.test(context))return 'Keyboard';if(/image|\bimg\b|svg|video|audio|object|alt\b|caption/.test(context))return 'Media';if(/form|input|select|textarea|fieldset|legend|label/.test(context))return 'Forms';if(/\blang\b|language|html-has-lang|valid-lang/.test(context))return 'Language';if(/motion|animation|blink|marquee|meta-refresh/.test(context))return 'Motion';if(/navigation|\bnav\b|link|anchor/.test(context))return 'Navigation';if(/heading|landmark|region|list|table|definition|document-title|page-has-heading/.test(context))return 'Structure';return 'Content';}
    function remediationPrompt(f){if(f.remediationPrompt)return f.remediationPrompt;const changes=f.remediationGuidance?.change?.length?f.remediationGuidance.change:[f.remediation];const verification=f.remediationGuidance?.verify?.length?f.remediationGuidance.verify:['Retest the affected element with the automated rule, keyboard navigation, and relevant assistive technology.'];return ['Fix the following web accessibility finding in this project.','','The implementation technology is unknown. First identify the framework, CMS, template, component, or stylesheet that produces the affected rendered element. Follow existing project conventions and update the reusable source component when appropriate.','', 'Issue category: '+findingIssueCategory(f),'Finding: '+f.title,'Severity: '+f.severity,'WCAG 2.2 criteria: '+(f.wcag.length?f.wcag.join(', '):'Not mapped'),'Automated rule: '+f.ruleId,(f.location.url?'Page URL: '+f.location.url:'Source file: '+(f.location.file||'Locate this finding in the project')),'Affected selector: '+(f.location.selector||'Not provided'),'Rendered HTML context: '+findingRenderedContext(f).html,'Failed condition: '+f.impact,'','Recommended direction:',...changes.map(item=>'- '+item),'','Requirements:','- Preserve the intended content, visual design, and user behavior unless the accessibility correction requires a deliberate change.','- Prefer native HTML semantics before adding ARIA. Do not hide the element, suppress the scanner rule, or weaken the test merely to remove the finding.','- Check whether the same reusable component or pattern appears elsewhere and apply the correction consistently.','- Explain which source files were changed and why the solution is appropriate for the detected technology.','','Verification:',...verification.map(item=>'- '+item)].join(String.fromCharCode(10));}
    function childFailedCondition(finding){const exact=finding.remediationGuidance?.inspect?.find(item=>item.startsWith('Failed condition:'));if(exact)return exact.slice('Failed condition:'.length).trim();return String(finding.impact||finding.explanation||'Review the reported element and its rendered context.').replace(/^Fix (?:any|all) of the following:/i,'').trim();}
    function setManualReview(id,updates,save=false){const current=manualReviews.get(id)||{status:'not-tested',notes:''};manualReviews.set(id,{...current,...updates});reviewDirty=true;saveState.textContent='Unsaved changes';renderSummary(latest);if(save){preserveDetail(renderFindings);void persistReview();}}
    automatedTab.addEventListener('click',()=>setReviewMode('automated'));manualTab.addEventListener('click',()=>setReviewMode('manual'));
    function setScanControlsExpanded(expanded){scanPanel.hidden=!expanded;scanToggle.setAttribute('aria-expanded',String(expanded));scanToggle.textContent=expanded?'Hide scan controls':'Show scan controls';}
    function setRunPanel(expanded){runReview.hidden=!expanded||!currentRunId;runToggle.hidden=!currentRunId;runToggle.setAttribute('aria-expanded',String(!runReview.hidden));}
    function setHistoryState(history){currentRunId=history?.run?.id||null;currentComparison=history?.comparison||null;historyRuns=history?.runs||[];manualReviews.clear();findingReviews.clear();Object.entries(history?.run?.review?.manualTasks||{}).forEach(([id,review])=>manualReviews.set(id,review));Object.entries(history?.run?.review?.findings||{}).forEach(([id,review])=>findingReviews.set(id,review));setRunPanel(runToggle.getAttribute('aria-expanded')==='true');runNotes.value=history?.run?.review?.notes||'';saveState.textContent='';if(currentRunId){document.getElementById('json-download').href='/api/history/'+currentRunId+'/report.json';document.getElementById('html-download').href='/api/history/'+currentRunId+'/report.html';}else{document.getElementById('json-download').href='/api/report.json';document.getElementById('html-download').href='/api/report.html';}comparisonBase.replaceChildren();const currentProfile=history?.run?.result?.metadata?.profile;const previous=historyRuns.filter(run=>run.id!==currentRunId&&run.completedAt<(history?.run?.result?.metadata?.completedAt||'')&&scanProfilesMatch(currentProfile,run.profile));if(!previous.length){const option=el('option','','No earlier saved run with the same complete profile');option.value='';comparisonBase.append(option);comparisonBase.disabled=true;}else{comparisonBase.disabled=false;previous.forEach(run=>{const option=el('option','',new Date(run.completedAt).toLocaleString()+' · '+run.findings+' findings');option.value=run.id;option.selected=run.id===currentComparison?.baseRunId;comparisonBase.append(option);});}}
    // quiet: a note save, which must not rebuild the pane the reviewer is typing in. 'unload' also lets the request outlive the page.
    async function persistReview(quiet){if(!currentRunId)return;reviewDirty=false;saveState.textContent='Saving…';try{const response=await fetch('/api/history/'+currentRunId+'/review',{method:'PATCH',keepalive:quiet==='unload',headers:{'Content-Type':'application/json'},body:JSON.stringify({manualTasks:Object.fromEntries(manualReviews),findings:Object.fromEntries(findingReviews),notes:runNotes.value})});const payload=await response.json();if(!response.ok)throw new Error(payload.error||'Review could not be saved.');manualReviews.clear();findingReviews.clear();Object.entries(payload.review.manualTasks||{}).forEach(([id,review])=>manualReviews.set(id,review));Object.entries(payload.review.findings||{}).forEach(([id,review])=>findingReviews.set(id,review));if(latest?.history?.run)latest.history.run.review=payload.review;saveState.textContent='Saved locally';renderSummary(latest);if(!quiet)keepFocus(()=>preserveDetail(renderFindings));}catch(error){reviewDirty=true;saveState.textContent='Not saved: '+error.message;}}
    function saveNotes(){if(reviewDirty)void persistReview(true);}
    async function changeComparison(){if(!currentRunId||!comparisonBase.value)return;comparisonBase.disabled=true;try{const response=await fetch('/api/history/'+currentRunId+'/compare?base='+encodeURIComponent(comparisonBase.value));const payload=await response.json();if(!response.ok)throw new Error(payload.error||'Comparison could not be loaded.');currentComparison=payload.comparison;if(latest?.history)latest.history.comparison=currentComparison;renderSummary(latest);renderFindings();setHistoryState(latest.history);}catch(error){status.className='status error';status.textContent=error.message;}finally{comparisonBase.disabled=false;}}
    function historyRow(run){const row=el('article','history-row');const completedLabel=new Date(run.completedAt).toLocaleString();const identity=el('div','');identity.append(el('strong','',completedLabel));identity.append(el('span','',run.target));identity.append(el('span','',scanProfileLabel(run.profile)));row.append(identity);const findings=el('div','');findings.append(el('strong','',String(run.findings)));findings.append(el('span','','findings'));row.append(findings);const pages=el('div','');pages.append(el('strong','',String(run.pagesScanned)));pages.append(el('span','','pages'));row.append(pages);const manual=el('div','');manual.append(el('strong','',run.manualCompleted+'/'+run.manualTotal));manual.append(el('span','','manual'));row.append(manual);const actions=el('div','history-row-actions');if(run.profile){const isAuthenticated=run.profile.authentication==='storage-state';const rerun=el('button','btn',isAuthenticated?'Prepare rerun':'Run again');rerun.type='button';rerun.setAttribute('aria-label',(isAuthenticated?'Prepare this authenticated profile from ':'Run this saved profile again from ')+completedLabel);rerun.addEventListener('click',()=>applyAndRunProfile(run.profile));actions.append(rerun);}const open=el('button','btn','Open run');open.type='button';open.setAttribute('aria-label','Open scan from '+completedLabel+' for '+run.target);open.addEventListener('click',()=>void openHistoryRun(run.id));const remove=el('button','btn','Delete');remove.type='button';remove.setAttribute('aria-label','Delete scan from '+completedLabel+' for '+run.target);remove.addEventListener('click',()=>void removeHistoryRun(run));actions.append(open,remove);row.append(actions);return row;}
    function renderHistoryList(runs){historyList.replaceChildren();if(!runs.length){historyList.append(el('div','history-empty','No saved scans yet. Run a website scan to create the first local record.'));return;}const groups=new Map();runs.forEach(run=>{const values=groups.get(run.targetKey)||[];values.push(run);groups.set(run.targetKey,values);});groups.forEach((values,key)=>{const section=el('section','history-group');section.append(el('h3','',key));values.forEach(run=>section.append(historyRow(run)));historyList.append(section);});}
    async function loadHistory(){historyList.replaceChildren(el('div','history-empty','Loading saved runs…'));try{const response=await fetch('/api/history');const payload=await response.json();if(!response.ok)throw new Error(payload.error||'History could not be loaded.');historyStorage.textContent='Storage: '+payload.storageDirectory;renderHistoryList(payload.runs);}catch(error){historyList.replaceChildren(el('div','history-empty',error.message));}}
    async function openHistoryRun(id){const response=await fetch('/api/history/'+id);const payload=await response.json();if(!response.ok){historyList.prepend(el('p','status error',payload.error||'Saved run could not be opened.'));return;}const result=payload.run.result;result.history={run:payload.run,comparison:payload.comparison,runs:payload.runs};historyDialog.close();render(result);status.textContent='';}
    async function removeHistoryRun(run){if(!window.confirm('Delete the saved scan from '+new Date(run.completedAt).toLocaleString()+'? This removes its report, screenshots, manual progress, and notes from this computer.'))return;const response=await fetch('/api/history/'+run.id,{method:'DELETE'});const payload=await response.json();if(!response.ok){historyList.prepend(el('p','status error',payload.error||'Saved run could not be deleted.'));return;}if(currentRunId===run.id){currentRunId=null;currentComparison=null;setRunPanel(false);}await loadHistory();}
    scanToggle.addEventListener('click',()=>setScanControlsExpanded(scanToggle.getAttribute('aria-expanded')!=='true'));
    runToggle.addEventListener('click',()=>setRunPanel(runToggle.getAttribute('aria-expanded')!=='true'));
    const renderWithoutLevelFilters=render;render=function(result){activeManualStatus='all';reviewMode='automated';selectedManualId=null;selectedGroupId=null;setHistoryState(result.history);setRunPanel(Boolean(runNotes.value));emptyState.hidden=true;automatedTab.setAttribute('aria-pressed','true');manualTab.setAttribute('aria-pressed','false');renderWithoutLevelFilters(result);scanToggle.hidden=false;setScanControlsExpanded(false);window.scrollTo({top:0,behavior:'instant'});};
    // --- Detail pane: fix-first, with supporting material in collapsed sections ---
    const dispositionOptions=[['unreviewed','Unreviewed'],['action-required','Action required'],['accepted-risk','Accepted risk'],['false-positive','False positive']];
    function items(tag,values,fill){const node=el(tag,'');values.forEach(value=>{const item=el('li','');if(fill)fill(item,value);else appendTechnicalText(item,value);node.append(item);});return node;}
    function more(title,...children){const node=el('details','more');node.append(el('summary','',title));const body=el('div','more-body');body.append(...children.filter(Boolean));node.append(body);return node;}
    function codeBlock(label,text){const wrap=el('div','code');wrap.append(el('span','label',label));const pre=el('pre','');pre.tabIndex=0;pre.append(el('code','',text));wrap.append(pre);return wrap;}
    function copyButton(text){const button=el('button','btn','Copy AI prompt');button.type='button';button.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(text);button.textContent='Copied';}catch{button.textContent='Copy failed. Select the prompt text instead.';}setTimeout(()=>{button.textContent='Copy AI prompt';},1600);});return button;}
    function promptSection(title,prompt,description){const promptCode=el('pre','',prompt);promptCode.tabIndex=0;return more(title,el('p','muted',description),promptCode,copyButton(prompt));}
    // A review change rebuilds the pane. While the same item stays selected, keep its open sections open and its scroll position.
    function preserveDetail(update){const item=detail.dataset.item;const open=[...detail.querySelectorAll('details')].map(node=>node.open);const top=detail.scrollTop;update();if(!item||detail.dataset.item!==item)return;[...detail.querySelectorAll('details')].forEach((node,index)=>{if(open[index])node.open=true;});detail.scrollTop=top;}
    function detailHead(item,metaNodes,title,action){detail.dataset.item=item;const head=el('header','detail-head');const text=el('div','');const meta=el('p','meta');meta.append(...metaNodes.filter(Boolean));text.append(meta,appendTechnicalText(el('h2',''),title));head.append(text);if(action)head.append(action);return head;}
    function showEmpty(message){detail.dataset.item='';detail.replaceChildren(el('p','muted',message));}
    function comparisonWord(findings){if(!mixedComparison())return '';const statuses=findings.map(f=>currentComparison?.statuses?.[f.fingerprint]).filter(Boolean);if(!statuses.length)return '';if(findings.length===1)return cap(statuses[0]);const fresh=statuses.filter(value=>value==='new').length;return fresh?fresh+' new':'All existing';}
    // One disposition and one note for every finding passed in. Mixed dispositions read as Mixed until one is chosen.
    function reviewControl(findings){const wrap=el('div','review');const scope=findings.length>1?' for all '+findings.length+' findings':'';const dispositions=[...new Set(findings.map(f=>findingReview(f).disposition))];const field=el('label','review-field','Review'+scope+' ');const select=el('select','review-select');select.dataset.key='review-'+findings.length+'-'+findings[0].fingerprint;if(dispositions.length>1){const mixed=el('option','','Mixed');mixed.value='';mixed.disabled=true;mixed.selected=true;select.append(mixed);}dispositionOptions.forEach(([value,label])=>{const option=el('option','',label);option.value=value;option.selected=dispositions.length===1&&dispositions[0]===value;select.append(option);});select.addEventListener('change',()=>keepFocus(()=>setFindingReviews(findings,{disposition:select.value},true)));field.append(select);const notes=[...new Set(findings.map(f=>findingReview(f).notes).filter(Boolean))];const noteLabel=findings.length>1?'Shared reviewer notes':'Reviewer notes';const textarea=el('textarea','');textarea.rows=3;textarea.maxLength=4000;textarea.setAttribute('aria-label',noteLabel);textarea.placeholder=notes.length>1?'These findings have different notes. Enter text to replace all of them.':'Record validation performed, rationale, ownership, or follow-up work.';textarea.value=notes.length===1?notes[0]:'';textarea.addEventListener('input',()=>setFindingReviews(findings,{notes:textarea.value}));textarea.addEventListener('blur',saveNotes);const noteBox=el('details','review-notes');noteBox.open=notes.length>0;noteBox.append(el('summary','',noteLabel),textarea,el('p','note','Saves when you click away.'));wrap.append(field,noteBox);return wrap;}
    function changesOf(f){return f.remediationGuidance?.change?.length?f.remediationGuidance.change:[f.remediation];}
    function whereLine(f){const where=el('p','where');const pages=affectedPages(f);where.append(el('code','',f.location.selector||f.ruleId));if(pages.length){where.append(' on ',externalLink(pages[0].pageTitle||pages[0].url,pages[0].url));if(pages.length>1)where.append(' and '+plural(pages.length-1,'more page'));}else if(f.location.file)where.append(' in '+f.location.file+(f.location.line?':'+f.location.line:''));return where;}
    function stateText(location){return 'Revealed interaction state: '+interactionTypeLabel(location.interactionType)+' · '+location.interactionState+(location.interactionTrigger?', trigger '+location.interactionTrigger:'')+'. Reproduce it before verifying the fix.';}
    function failedConditionsOf(f){const found=(f.remediationGuidance?.inspect||[]).filter(item=>item.startsWith('Failed condition:')).map(item=>item.slice('Failed condition:'.length).trim());return found.length?found:[childFailedCondition(f)];}
    function failureCallout(conditions,label){const callout=el('div','callout');callout.append(el('span','label',label));if(conditions.length===1)callout.append(appendTechnicalText(el('p',''),conditions[0]));else{callout.append(items('ul',conditions.slice(0,3)));if(conditions.length>3){const rest=el('details','review-notes');rest.append(el('summary','',(conditions.length-3)+' more'),items('ul',conditions.slice(3)));callout.append(rest);}}return callout;}
    function contrastFacts(f,heading){if(!f.contrast)return [];const c=f.contrast;const facts=el('dl','facts');[['Foreground',c.foreground,true],['Background',c.background,true],['Measured ratio',c.ratio?c.ratio+':1':'Not reported'],['Required ratio',c.requiredRatio?c.requiredRatio+':1':'Verify manually'],['Font',[c.fontSize,c.fontWeight].filter(Boolean).join(' · ')||'Not reported']].forEach(([name,value,isColor])=>{const pair=el('div','');const dd=el('dd','');if(isColor){const swatch=el('span','swatch');swatch.style.background=value;dd.append(swatch);}dd.append(String(value));pair.append(el('dt','',name),dd);facts.append(pair);});return [el(heading,'','Color contrast evidence'),facts];}
    function contextNote(){return el('p','note','This is what the browser rendered. Make the fix in your source, not here.');}
    function contextBlock(f,label){const context=findingRenderedContext(f);return codeBlock((label||'Original browser HTML')+' · '+(context.scope==='parent'?'affected element and parent':'affected element')+(context.truncated?' · truncated, inspect the selector for the full DOM':''),context.html);}
    function shotButton(f){if(!f.screenshot)return null;const shot=el('button','shot');shot.type='button';shot.setAttribute('aria-label','Open larger screenshot for '+(f.location.selector||f.title));const image=el('img','');image.src=f.screenshot.dataUrl;image.alt=f.screenshot.description;image.width=f.screenshot.width;image.height=f.screenshot.height;shot.append(image);shot.addEventListener('click',()=>openScreenshot(f));return shot;}
    // findings: one finding, or the elements of one issue set. set carries the owning group and cluster when there is one.
    function findingBody(findings,heading,set){const f=findings[0];const single=findings.length===1;const group=set?.group;const cluster=set?.cluster;const body=el('div',f.severity);
      const sameFailure=new Set(findings.map(childFailedCondition)).size===1;const pages=[...new Map(findings.flatMap(affectedPages).map(page=>[page.url,page])).values()];
      if(single){body.append(whereLine(f));if(f.location.interactionState)body.append(el('p','note',stateText(f.location)));}else body.append(el('p','where',findings.length+' elements share this issue. One fix applies to all of them.'));
      if(single||sameFailure||cluster)body.append(failureCallout(single||sameFailure?failedConditionsOf(f):[cluster.failedCondition],single?'Failed condition':'Shared failure'));
      const changes=[...new Set(findings.flatMap(changesOf))];const suggestion=f.codeSuggestion;body.append(el(heading,'','What to change'));
      if(suggestion)body.append(appendTechnicalText(el('p','lead-fix'),suggestion.title+(suggestion.title.endsWith('.')?'':'.')));
      body.append(items('ul',changes));
      if(f.safeFix)body.append(el('p','note','Safe automated fix available: '+f.safeFix.description));
      if(suggestion){const why=(suggestion.reviewRequired?'Review required. ':'')+(changes.includes(suggestion.rationale)?'':suggestion.rationale);if(why)body.append(appendTechnicalText(el('p','note'),why));const others=(suggestion.alternatives||[]).filter(text=>!changes.includes(text));if(others.length)body.append(el('p','note','Other valid approach'),items('ul',others));}
      const target=cluster?.remediationTarget||(f.ruleId==='aria-required-parent'?group?.remediationTarget:null);
      if(target){const owner=el('div','owner');const line=el('p','where');line.append(el('code','',target.selector),' · Current role: '+(target.currentRole||'No explicit role')+' · Expected parent roles: ');target.suggestedRoles.forEach(role=>line.append(el('code','',role),' '));owner.append(el(heading,'','Likely shared owner'),line,el('p','note',target.reason),codeBlock('Owner markup',target.html));body.append(owner);}
      if(single){body.append(...contrastFacts(f,heading),el(heading,'','Rendered HTML context'),contextBlock(f),contextNote());const shot=shotButton(f);if(shot)body.append(el(heading,'','Visual evidence'),shot);}
      else{body.append(el(heading,'','Affected elements ('+findings.length+')'));findings.forEach(item=>{const shot=shotButton(item);const element=el('div','element'+(shot?'':' no-shot'));const main=el('div','element-main');main.append(el('code','',item.location.selector||item.ruleId),el('span','element-markup',item.evidence));if(!sameFailure)main.append(appendTechnicalText(el('span','element-note'),childFailedCondition(item)));if(item.location.interactionState)main.append(el('span','element-note',stateText(item.location)));if(pages.length>1){const own=affectedPages(item);if(own.length===1)main.append(externalLink(own[0].pageTitle||own[0].url,own[0].url));else if(own.length)main.append(el('span','element-note','On '+own.length+' pages'));}if(shot)element.append(shot);element.append(main);body.append(element);});}
      // Guidance that names one element stays out of the shared sections: keep only what every element has in common.
      const common=key=>(f.remediationGuidance?.[key]||[]).filter(text=>!text.startsWith('Failed condition:')&&findings.every(item=>item.remediationGuidance?.[key]?.includes(text)));
      const extra=el('div','more-list');const inspect=common('inspect');if(inspect.length)extra.append(more('What to inspect',items('ul',inspect)));
      const rule=el('p','muted','Detected by rule ');rule.append(el('code','',f.ruleId),' · '+cap(f.confidence)+' confidence · '+(f.kind==='automatic'?'human verification still required':'manual review required'));extra.append(more('Why this was flagged',appendTechnicalText(el('p',''),f.explanation),rule));
      if(!single)extra.append(more('Rendered HTML context',...findings.map(item=>contextBlock(item,item.location.selector||item.ruleId)),contextNote()));
      if(pages.length>1)extra.append(more('Affected pages ('+pages.length+')',el('p','muted','Same issue on every page listed. Retest each one after the fix.'),items('ul',pages,(node,page)=>{node.append(externalLink(page.pageTitle||page.url,page.url));if(page.pageTitle)node.append(el('span','muted',' '+page.url));})));
      const verify=common('verify');extra.append(more('How to verify the fix',items('ol',verify.length?verify:['Test each affected element with a keyboard and the relevant assistive technology.','Run the scan again and confirm the finding is gone without introducing a new issue.'])));
      const references=el('ul','');f.wcag.forEach(criterion=>{const node=el('li','');node.append(externalLink('WCAG '+criterion,wcagUnderstandingUrls[criterion]||wcagUnderstandingIndex),' — W3C Understanding guidance');references.append(node);});if(f.helpUrl){const node=el('li','');node.append(externalLink('axe scanner rule details (Deque)',f.helpUrl));references.append(node);}if(references.childElementCount)extra.append(more('Standards and references',references));
      body.append(extra);return body;}
    function renderDetail(f){if(!f){showEmpty('Select a finding to review its evidence and remediation guidance.');return;}
      const context=[f.wcagLevel&&'WCAG Level '+f.wcagLevel,findingIssueCategory(f),f.scope==='common'&&'Recurring '+findingComponentCategory(f).toLowerCase(),comparisonWord([f]),f.kind==='automatic'?'Automated finding':'Manual review'].filter(Boolean).join(' · ');const prompt=remediationPrompt(f);
      detail.replaceChildren(detailHead(f.fingerprint,[el('span','pill '+f.severity,f.severity),context],f.title,copyButton(prompt)),reviewControl([f]));
      const body=findingBody([f],'h3');body.querySelector('.more-list').append(promptSection('AI remediation prompt',prompt,'Paste into a coding agent.'));detail.append(body);}
    function renderGroupDetail(group,members){const isPattern=group.kind==='pattern';const sets=issueSetsFor(group,members);const pages=groupPages(group,members);const worst=worstSeverity(members);const prompt=combinedGroupPrompt(group,members);
      const only=sets.length===1?sets[0].members[0]:null;const context=[...new Set([isPattern?'Issue pattern':'Component',group.category,only?(only.wcagLevel&&'WCAG Level '+only.wcagLevel):plural(sets.length,'issue'),only&&findingIssueCategory(only),plural(members.length,'element'),plural(pages.length,'page'),comparisonWord(members)].filter(Boolean))].join(' · ');
      detail.replaceChildren(detailHead(group.id,[el('span','pill '+worst,worst),context],group.name,copyButton(prompt)),reviewControl(members));
      const ownerShown=only&&(sets[0].cluster.remediationTarget||(only.ruleId==='aria-required-parent'&&group.remediationTarget));if(group.selector&&!isPattern&&!ownerShown){const where=el('p','where','Component selector ');where.append(el('code','',group.selector));detail.append(where);}
      const corrections=only?[]:groupCorrections(group,members);if(corrections.length)detail.append(el('h3','','Corrections shared by multiple findings'),items('ul',corrections,(node,correction)=>{appendTechnicalText(node,correction.text);if(correction.appliesTo<members.length)node.append(el('span','muted',' Applies to '+correction.appliesTo+' of '+members.length+' findings.'));}));
      if(only)detail.append(findingBody(sets[0].members,'h3',{group,cluster:sets[0].cluster}));else{detail.append(el('h3','',isPattern?'Issues in this pattern':'Issues in this component'));
      sets.forEach(entry=>{const first=entry.members[0];const child=el('details','child '+worstSeverity(entry.members));const summary=el('summary','');const main=el('span','row-main');main.append(appendTechnicalText(el('span','row-title'),entry.cluster.name),el('span','row-meta',[cap(first.severity),first.wcagLevel&&'Level '+first.wcagLevel,findingIssueCategory(first),...statusWords(entry.members),plural(entry.members.length,'element'),plural(entry.cluster.pages.length,'page')].filter(Boolean).join(' · ')));summary.append(el('span','dot'),main);const body=findingBody(entry.members,'h4',{group,cluster:entry.cluster});body.classList.add('child-body');child.append(summary,body);detail.append(child);});}
      const extra=only?detail.querySelector('.more-list'):el('div','more-list');if(pages.length>1&&!only)extra.append(more('Affected pages ('+pages.length+')',items('ul',pages,(node,url)=>node.append(externalLink(url,url)))));extra.append(promptSection('Combined AI remediation prompt',prompt,'One prompt covers every finding in this group.'));if(!only)detail.append(extra);}
    function renderManualDetail(check){if(!check){showEmpty('No manual tasks match this status filter.');return;}const review=manualReview(check);
      detail.replaceChildren(detailHead('manual-'+check.id,[manualStatusLabel(review.status)+' · '+check.category+' · WCAG Level '+check.wcagLevel+' · Human verification required'],check.title),el('p','lead',check.description),el('h3','','Test steps'),items('ol',check.steps));
      const outcome=el('div','review');const field=el('label','review-field','Outcome ');const select=el('select','review-select');select.dataset.key='manual-outcome';[['not-tested','Not tested'],['pass','Pass'],['needs-attention','Needs attention'],['not-applicable','Not applicable']].forEach(([value,label])=>{const option=el('option','',label);option.value=value;option.selected=review.status===value;select.append(option);});select.addEventListener('change',()=>keepFocus(()=>setManualReview(check.id,{status:select.value},true)));field.append(select);outcome.append(field);
      const noteLabel=el('label','label','Evidence and reviewer notes');noteLabel.htmlFor='manual-notes';const textarea=el('textarea','');textarea.id='manual-notes';textarea.rows=4;textarea.maxLength=4000;textarea.placeholder='Record what was tested, the result, assistive technology used, and any follow-up needed.';textarea.value=review.notes;textarea.addEventListener('input',()=>setManualReview(check.id,{notes:textarea.value}));textarea.addEventListener('blur',saveNotes);
      detail.append(outcome,noteLabel,textarea,el('p','note','Both save automatically and appear in exports.'),el('h3','','WCAG '+wcagVersion+' requirements'),items('ul',check.wcag,(node,criterion)=>node.append(externalLink('WCAG '+criterion,wcagUnderstandingUrls[criterion]||wcagUnderstandingIndex))));}
    // --- Sidebar: tabs, filter chips and the finding list ---
    function cap(text){return text[0].toUpperCase()+text.slice(1);}
    function plural(count,word){return count+' '+word+(count===1?'':'s');}
    // Re-rendering replaces the focused control; put focus back on its replacement.
    function keepFocus(update){const key=document.activeElement?.dataset?.key;update();if(key)[...document.querySelectorAll('[data-key]')].find(node=>node.dataset.key===key)?.focus();}
    function chip(key,label,count,pressed,onClick){const button=el('button','chip',label+' ');button.type='button';button.dataset.key=key;button.append(el('span','count',String(count)));button.setAttribute('aria-pressed',String(pressed));button.addEventListener('click',()=>keepFocus(onClick));return button;}
    // A row offers All plus every value that has items. With fewer than two values there is nothing to choose, so the row hides unless it is required.
    function chipRow(container,name,allLabel,total,options,countOf,active,choose,required){const present=options.filter(([value])=>countOf(value)||value===active);container.hidden=!required&&present.length<2&&active==='all';container.replaceChildren(chip(name+'-all',allLabel,total,active==='all',()=>choose('all')),...present.map(([value,label])=>chip(name+'-'+value,label,countOf(value),active===value,()=>choose(value))));}
    function renderFilters(){const findings=latest.findings;const checks=latest.manualChecks||[];const count=test=>findings.filter(test).length;const manual=manualCounts();
      chipRow(severityFilters,'severity','All',findings.length,[['critical','Critical'],['serious','Serious'],['moderate','Moderate'],['minor','Minor']],value=>count(f=>f.severity===value),activeFilter,value=>{activeFilter=value;renderFindings();},true);
      chipRow(manualStatusFilters,'manual','All',checks.length,[['not-tested','Not tested'],['pass','Pass'],['needs-attention','Needs attention'],['not-applicable','Not applicable']],value=>manual[value],activeManualStatus,value=>{activeManualStatus=value;renderFindings();},true);
      severityFilters.hidden=reviewMode!=='automated'||!findings.length;manualStatusFilters.hidden=reviewMode!=='manual'||!checks.length;}
    function renderTabs(){const manual=manualCounts();const checks=(latest.manualChecks||[]).length;[[automatedTab,'automated','Automated findings',latest.findings.length],[manualTab,'manual','Manual review',(checks-manual['not-tested'])+'/'+checks]].forEach(([button,mode,label,count])=>{button.replaceChildren(label+' ',el('span','count',String(count)));button.setAttribute('aria-pressed',String(reviewMode===mode));});}
    function setReviewMode(mode){reviewMode=mode;renderFindings();}
    // A sidebar row is a marker, a title and one line of text metadata. The marker color always repeats the severity named first in that line.
    function row(key,kind,title,meta,current,onSelect){const button=el('button','row '+kind);button.type='button';button.dataset.key=key;button.setAttribute('aria-current',String(current));const main=el('span','row-main');main.append(appendTechnicalText(el('span','row-title'),title),el('span','row-meta',meta));button.append(el('span','dot'),main);button.addEventListener('click',()=>{onSelect();keepFocus(renderFindings);detail.scrollTop=0;detail.scrollIntoView({behavior:scrollBehavior(),block:'start'});});return button;}
    function mixedComparison(){return Boolean(currentComparison&&currentComparison.newCount&&currentComparison.existingCount);}
    function statusWords(findings){const fresh=mixedComparison()?findings.filter(f=>currentComparison.statuses?.[f.fingerprint]==='new').length:0;const reviews=[...new Set(findings.map(f=>findingReview(f).disposition))].filter(value=>value!=='unreviewed');return [fresh&&(findings.length>1?fresh+' new':'New'),...reviews.map(findingDispositionLabel)];}
    function findingMeta(f){const pages=affectedPages(f).length;return [cap(f.severity),f.wcagLevel&&'Level '+f.wcagLevel,findingIssueCategory(f),...statusWords([f]),pages>1&&pages+' pages',f.location.interactionState&&interactionAction(f.location)+f.location.interactionState,f.location.selector||f.location.file].filter(Boolean).join(' · ');}
    function worstSeverity(members){return ['critical','serious','moderate','minor'].find(severity=>members.some(f=>f.severity===severity))||'minor';}
    function groupMeta(group,members){const issues=issueSetsFor(group,members).length;const scope=[issues>1&&plural(issues,'issue'),plural(members.length,group.kind==='pattern'?'finding':'element')];return [cap(worstSeverity(members)),group.category,...statusWords(members),...scope,plural(groupPages(group,members).length,'page')].filter(Boolean).join(' · ');}
    function renderManualChecks(){const checks=latest.manualChecks||[];if(!checks.length){list.append(el('p','list-empty','No manual checklist was included in this result.'));renderManualDetail(null);return;}const visible=checks.filter(check=>activeManualStatus==='all'||manualReview(check).status===activeManualStatus);if(!visible.some(check=>check.id===selectedManualId))selectedManualId=visible[0]?.id||null;if(!visible.length)list.append(el('p','list-empty','No manual tasks match this status filter.'));visible.forEach(check=>{const review=manualReview(check);list.append(row('manual-'+check.id,'manual',check.title,[manualStatusLabel(review.status),check.category,'Level '+check.wcagLevel,review.notes&&'Notes recorded'].filter(Boolean).join(' · '),check.id===selectedManualId,()=>{selectedManualId=check.id;}));});renderManualDetail(visible.find(check=>check.id===selectedManualId));}
    function renderFindings(){renderTabs();renderFilters();list.replaceChildren();if(reviewMode==='manual'){renderManualChecks();return;}
      const filteredFindings=latest.findings.filter(f=>activeFilter==='all'||f.severity===activeFilter);
      const groups=(latest.findingGroups||[]).map(group=>({group,members:groupMembers(group,filteredFindings)})).filter(entry=>entry.members.length>1);
      const groupedFingerprints=new Set(groups.flatMap(entry=>entry.members.map(f=>f.fingerprint)));const individualFindings=filteredFindings.filter(f=>!groupedFingerprints.has(f.fingerprint));
      if(!groups.length&&!individualFindings.length){let message='No findings match this filter.';if(!latest.findings.length&&(latest.metadata.incomplete||[]).length)message='No findings: the pages could not be tested. See the notice above.';else if(!latest.findings.length&&latest.metadata.pagesOrFilesScanned>0)message='No automated findings. That is not a pass: continue with Manual review.';else if(!latest.findings.length)message='No pages were tested. Check the URL and scan again.';list.append(el('p','list-empty',message));renderDetail(null);return;}
      if(selectedGroupId&&!groups.some(entry=>entry.group.id===selectedGroupId))selectedGroupId=null;if(selectedFingerprint&&!individualFindings.some(f=>f.fingerprint===selectedFingerprint))selectedFingerprint=null;if(!selectedGroupId&&!selectedFingerprint){if(groups.length)selectedGroupId=groups[0].group.id;else selectedFingerprint=individualFindings[0].fingerprint;}
      const section=(label,rows)=>{if(rows.length)list.append(el('h3','list-label',label),...rows);};
      const groupRow=entry=>row(entry.group.id,worstSeverity(entry.members)+' component',entry.group.name,groupMeta(entry.group,entry.members),entry.group.id===selectedGroupId,()=>{selectedGroupId=entry.group.id;selectedFingerprint=null;});
      section('Components',groups.filter(entry=>entry.group.kind!=='pattern').map(groupRow));section('Issue patterns',groups.filter(entry=>entry.group.kind==='pattern').map(groupRow));
      const findingRows=individualFindings.map(f=>row(f.fingerprint,f.severity,f.title,findingMeta(f),!selectedGroupId&&f.fingerprint===selectedFingerprint,()=>{selectedGroupId=null;selectedFingerprint=f.fingerprint;}));
      if(groups.length)section('Individual findings',findingRows);else list.append(...findingRows);
      const selectedGroup=groups.find(entry=>entry.group.id===selectedGroupId);if(selectedGroup)renderGroupDetail(selectedGroup.group,selectedGroup.members);else renderDetail(individualFindings.find(f=>f.fingerprint===selectedFingerprint)||individualFindings[0]);}
    function render(result){latest=result;activeFilter='all';selectedFingerprint=null;results.hidden=false;const source=document.getElementById('result-source');source.textContent=result.metadata.target;source.href=result.metadata.target;document.getElementById('notice').textContent=result.notice;const incomplete=document.getElementById('incomplete');const failures=result.metadata.incomplete||[];const stateFailures=result.metadata.interactionStateFailures||[];incomplete.replaceChildren();incomplete.hidden=!(failures.length||stateFailures.length);if(failures.length){const failed=el('details','');const codes=[...new Set(failures.map(item=>(item.reason.match(/HTTP [0-9]+/)||[])[0]).filter(Boolean))].join(', ');failed.append(el('summary','',plural(failures.length,'page')+' could not be tested'+(codes?' · '+codes:'')));const failureList=el('ul','');failures.forEach(item=>{const row=el('li','');row.append(externalLink(item.url,item.url,'source'));const detail=[item.stage?item.stage+' stage':null,item.attempts?item.attempts+' attempt'+(item.attempts===1?'':'s'):null].filter(Boolean).join(', ');row.append((detail?' ('+detail+')':'')+' — '+item.reason.replace(' for '+item.url,''));failureList.append(row);});failed.append(failureList);incomplete.append(failed);}if(stateFailures.length){const states=el('details','');states.append(el('summary','','Interactive states skipped · '+stateFailures.length),el('p','','These could not be opened and restored safely. Check them by hand.'));const stateList=el('ul','');stateFailures.forEach(item=>{const row=el('li','');row.append(externalLink(item.url,item.url,'source'));row.append(document.createTextNode(' — '+interactionTypeLabel(item.type)+' “'+item.name+'” '));row.append(el('code','inline-code',item.trigger));row.append(document.createTextNode(': '+item.reason));stateList.append(row);});states.append(stateList);incomplete.append(states);}renderSummary(result);renderFindings();results.scrollIntoView({behavior:scrollBehavior(),block:'start'});}
    form.addEventListener('submit',async event=>{event.preventDefault();button.disabled=true;button.textContent='Scanning…';status.className='status';const selectedLevel=document.getElementById('wcag-level').value;status.textContent='Running WCAG '+wcagVersion+' Level '+selectedLevel+' automated checks'+(authenticated.checked?' with the authenticated session.':'.');results.hidden=true;emptyState.hidden=true;startProgressPolling();try{const response=await fetch('/api/scan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:document.getElementById('url').value,wcagLevel:selectedLevel,crawl:crawl.checked,maxPages:Number(document.getElementById('max-pages').value),captureScreenshots:document.getElementById('screenshots').checked,interactionStates:document.getElementById('interaction-states').checked,authenticated:authenticated.checked,storageStatePath:authenticated.checked?storageState.value:undefined})});const payload=await response.json();if(!response.ok)throw new Error(payload.error||'The scan failed.');showProgress({percent:100,message:'Scan complete. The report is ready for review.'});render(payload);if(authenticated.checked)storageState.value='';status.textContent='';}catch(error){status.className='status error';status.textContent=error.message;if(latest)results.hidden=false;else emptyState.hidden=false;await pollProgress();}finally{stopProgressPolling();progress.hidden=true;button.disabled=false;syncScanLabel();}});
    runNotes.addEventListener('input',()=>{reviewDirty=true;saveState.textContent='Unsaved changes';});runNotes.addEventListener('blur',saveNotes);window.addEventListener('pagehide',()=>{if(reviewDirty)void persistReview('unload');});comparisonBase.addEventListener('change',()=>void changeComparison());historyToggle.addEventListener('click',()=>{historyDialog.showModal();void loadHistory();});document.getElementById('history-close').addEventListener('click',()=>historyDialog.close());historyDialog.addEventListener('click',event=>{if(event.target===historyDialog)historyDialog.close();});document.getElementById('dialog-close').addEventListener('click',()=>imageDialog.close());imageDialog.addEventListener('click',event=>{if(event.target===imageDialog)imageDialog.close();});
    function renderSkippedAssets(result){const assets=result.metadata.skippedAssets||[];if(!assets.length)return;const container=document.getElementById('incomplete');container.hidden=false;const details=el('details','skipped-assets');details.append(el('summary','','Skipped non-HTML assets · '+assets.length));details.append(el('p','','Not HTML, so not scanned. PDFs and downloads need their own review.'));const items=el('ul','');assets.forEach(item=>{const row=el('li','');row.append(externalLink(item.url,item.url,'source'));row.append(document.createTextNode(' — '+item.reason));items.append(row);});details.append(items);container.append(details);}
    // Results replace the scan form on screen, so anything the reviewer must know about the run is shown with them, and focus moves there.
    const renderBeforeSkippedAssets=render;render=function(result){renderBeforeSkippedAssets(result);renderSkippedAssets(result);if(result.historyError){const box=document.getElementById('incomplete');box.hidden=false;box.prepend(el('strong','','This scan was not saved to history'),el('p','',result.historyError+' Reviews and notes cannot be saved for this run.'));}document.getElementById('results-heading').focus({preventScroll:true});};
    function issueSetName(finding,group){if(finding.ruleId==='aria-required-parent')return /menu/i.test(group.category)?'Menu items share one missing required parent':'ARIA elements share one missing required parent';return finding.title;}
    function issueSetResolution(finding,group,count){if(finding.ruleId!=='aria-required-parent')return '';const owner=finding.component?.remediationTarget?.selector||group.remediationTarget?.selector||group.selector||'the shared component';return 'One decision fixes all '+count+' elements. Find the container in '+owner+' that directly holds them. For normal site navigation, remove the menu roles and aria-posinset/aria-setsize from the links and buttons. For a real application menu, put the menu or menubar role on that container and add full keyboard support. Do not add a role to a wrapper just to silence the scanner.';}
    function issueSetsFor(group,members){const byFingerprint=new Map(members.map(f=>[f.fingerprint,f]));if(Array.isArray(group.issueClusters)&&group.issueClusters.length)return group.issueClusters.map(cluster=>{const visible=cluster.findingFingerprints.map(id=>byFingerprint.get(id)).filter(Boolean);return {cluster:{...cluster,pages:groupPages(group,visible)},members:visible};}).filter(entry=>entry.members.length);const clusters=new Map();members.forEach(finding=>{const target=finding.component?.remediationTarget?.selector||group.selector||'';const key=finding.ruleId+'|'+childFailedCondition(finding).toLowerCase()+'|'+target;const values=clusters.get(key)||[];values.push(finding);clusters.set(key,values);});return [...clusters.values()].map((values,index)=>{const first=values[0];return {cluster:{id:'runtime-issue-'+index,name:issueSetName(first,group),ruleId:first.ruleId,failedCondition:childFailedCondition(first),recommendedAction:first.codeSuggestion?.title||first.remediationGuidance?.change?.[0]||first.remediation,findingFingerprints:values.map(f=>f.fingerprint),pages:groupPages(group,values),remediationTarget:first.component?.remediationTarget||group.remediationTarget,parentResolution:issueSetResolution(first,group,values.length)},members:values};});}
  </script>
</body></html>`;
}

export async function startUiServer(options: UiServerOptions = {}): Promise<UiServerHandle> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 4173;
  const historyDirectory = options.historyDirectory ?? defaultHistoryDirectory();
  const runtimePath = options.runtimePath === false || (options.runtimePath === undefined && port === 0)
    ? undefined
    : options.runtimePath ?? defaultUiRuntimePath();
  if (runtimePath) await prepareUiRuntime(runtimePath);
  let runtime: UiRuntimeRecord | undefined;
  let latestResult: ScanResult | undefined;
  let latestRunId: string | undefined;
  let scanning = false;
  let scanProgress: UrlScanProgress = { phase: "idle", percent: 0, message: "Ready to scan.", pagesCompleted: 0, totalPages: 1, findingsFound: 0 };
  const server = createServer(async (req, res) => {
    const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? `${host}:${port}`}`);
    try {
      if (req.method === "GET" && requestUrl.pathname === "/favicon.ico") {
        res.writeHead(204, { "Cache-Control": "public, max-age=86400" });
        res.end();
        return;
      }
      if (req.method === "GET" && requestUrl.pathname === "/api/runtime") {
        sendJson(res, 200, runtime ? { schemaVersion: runtime.schemaVersion, pid: runtime.pid, url: runtime.url, startedAt: runtime.startedAt } : { pid: process.pid });
        return;
      }
      if (req.method === "POST" && requestUrl.pathname === "/api/shutdown") {
        if (!runtime || req.headers["x-ada-shutdown-token"] !== runtime.shutdownToken) {
          sendJson(res, 403, { error: "Invalid dashboard shutdown token." });
          return;
        }
        res.once("finish", () => {
          server.close();
          server.closeAllConnections();
        });
        sendJson(res, 200, { stopping: true });
        return;
      }
      if (req.method === "GET" && requestUrl.pathname === "/") {
        send(res, 200, "text/html; charset=utf-8", dashboardHtml());
        return;
      }
      if (req.method === "GET" && requestUrl.pathname === "/api/progress") {
        sendJson(res, 200, scanProgress);
        return;
      }
      if (req.method === "GET" && requestUrl.pathname === "/api/history") {
        const target = requestUrl.searchParams.get("target") ?? undefined;
        sendJson(res, 200, { runs: await listScanRuns(target, historyDirectory), storageDirectory: historyDirectory });
        return;
      }
      const historyMatch = requestUrl.pathname.match(/^\/api\/history\/([a-f0-9-]{36})(?:\/(review|compare|report\.json|report\.html))?$/i);
      if (historyMatch) {
        const [, runId, action] = historyMatch;
        const run = await getScanRun(runId, historyDirectory);
        if (!run) {
          sendJson(res, 404, { error: "Saved scan run not found." });
          return;
        }
        if (req.method === "DELETE" && !action) {
          await deleteScanRun(runId, historyDirectory);
          sendJson(res, 200, { deleted: true, runs: await listScanRuns(run.result.metadata.target, historyDirectory) });
          return;
        }
        if (req.method === "PATCH" && action === "review") {
          const body = await readJson(req);
          const updated = await updateRunReview(runId, {
            manualTasks: body.manualTasks && typeof body.manualTasks === "object" ? body.manualTasks as Record<string, ManualTaskReview> : undefined,
            findings: body.findings && typeof body.findings === "object" ? body.findings as Record<string, FindingReview> : undefined,
            notes: typeof body.notes === "string" ? body.notes : undefined,
          }, historyDirectory);
          if (latestRunId === runId && latestResult) latestResult = reviewedScanResult(updated);
          sendJson(res, 200, { review: updated.review });
          return;
        }
        if (req.method === "GET" && action === "compare") {
          const baseId = requestUrl.searchParams.get("base") ?? undefined;
          sendJson(res, 200, { comparison: await comparisonForRun(run, baseId, historyDirectory) });
          return;
        }
        if (req.method === "GET" && action === "report.json") {
          res.setHeader("Content-Disposition", `attachment; filename=ada-accessibility-report-${run.id}.json`);
          sendJson(res, 200, reviewedScanResult(run));
          return;
        }
        if (req.method === "GET" && action === "report.html") {
          res.setHeader("Content-Disposition", `attachment; filename=ada-accessibility-report-${run.id}.html`);
          send(res, 200, "text/html; charset=utf-8", htmlReport(reviewedScanResult(run)));
          return;
        }
        if (req.method === "GET" && !action) {
          sendJson(res, 200, {
            run,
            comparison: await comparisonForRun(run, requestUrl.searchParams.get("base") ?? undefined, historyDirectory),
            runs: await listScanRuns(run.result.metadata.target, historyDirectory),
          });
          return;
        }
      }
      if (req.method === "POST" && requestUrl.pathname === "/api/scan") {
        if (scanning) {
          sendJson(res, 409, { error: "A scan is already running. Wait for it to finish before starting another." });
          return;
        }
        const body = await readJson(req);
        const target = parseTarget(body.url);
        const wcagLevel = parseWcagLevel(body.wcagLevel);
        const crawl = body.crawl === true;
        const storageState = body.authenticated === true ? await validatedStorageStatePath(body.storageStatePath) : undefined;
        scanning = true;
        scanProgress = { phase: "starting", percent: 1, message: "Starting the browser and preparing the scan.", pagesCompleted: 0, totalPages: crawl ? boundedInteger(body.maxPages, 10, 1, 50) : 1, findingsFound: 0 };
        try {
          latestResult = await scanUrls([target], {
            crawl,
            wcagLevel,
            maxPages: crawl ? boundedInteger(body.maxPages, 10, 1, 50) : 1,
            captureScreenshots: body.captureScreenshots !== false,
            screenshotLimit: 50,
            interactionStateLimit: body.interactionStates === true ? 10 : 0,
            storageState,
            onProgress: (progress) => {
              scanProgress = progress;
            },
          });
          try {
            const run = await saveScanRun(latestResult, historyDirectory);
            latestRunId = run.id;
            const comparison = await comparisonForRun(run, undefined, historyDirectory);
            sendJson(res, 200, { ...latestResult, history: { run: { id: run.id, review: run.review, result: { metadata: run.result.metadata } }, comparison, runs: await listScanRuns(target, historyDirectory), storageDirectory: historyDirectory } });
          } catch (historyError) {
            sendJson(res, 200, { ...latestResult, historyError: historyError instanceof Error ? historyError.message : String(historyError) });
          }
        } catch (error) {
          scanProgress = { ...scanProgress, phase: "error", message: error instanceof Error ? error.message : String(error) };
          throw error;
        } finally {
          scanning = false;
        }
        return;
      }
      if (req.method === "GET" && requestUrl.pathname === "/api/report.json") {
        if (!latestResult) {
          sendJson(res, 404, { error: "Run a scan before downloading a report." });
          return;
        }
        res.setHeader("Content-Disposition", "attachment; filename=ada-accessibility-report.json");
        sendJson(res, 200, latestResult);
        return;
      }
      if (req.method === "GET" && requestUrl.pathname === "/api/report.html") {
        if (!latestResult) {
          sendJson(res, 404, { error: "Run a scan before downloading a report." });
          return;
        }
        res.setHeader("Content-Disposition", "attachment; filename=ada-accessibility-report.html");
        send(res, 200, "text/html; charset=utf-8", htmlReport(latestResult));
        return;
      }
      sendJson(res, 404, { error: "Not found." });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  if (runtimePath) {
    server.once("close", () => {
      if (runtime) void removeUiRuntime(runtimePath, runtime.shutdownToken);
    });
  }

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => resolve());
    });
  } catch (error) {
    if (runtimePath) await removeUiRuntime(runtimePath);
    throw error;
  }
  const address = server.address() as AddressInfo;
  const url = `http://${host}:${address.port}`;
  if (runtimePath) {
    runtime = createUiRuntimeRecord(url);
    try {
      await writeUiRuntime(runtime, runtimePath);
    } catch (error) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      throw error;
    }
  }
  return { server, url };
}
