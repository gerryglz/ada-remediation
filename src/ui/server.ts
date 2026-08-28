import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { htmlReport } from "../reporters/index.js";
import { scanUrls } from "../scanners/url.js";
import type { ScanResult } from "../types.js";

export interface UiServerOptions {
  host?: string;
  port?: number;
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
    if (size > 32_768) throw new Error("Request body is too large.");
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

export function dashboardHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ADA Assistant dashboard</title>
  <style>
    :root{font-family:"Camera Plain Variable",ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1c1c1c;background:#f7f4ed;line-height:1.5;--ink:#1c1c1c;--ink-83:rgba(28,28,28,.83);--ink-82:rgba(28,28,28,.82);--ink-40:rgba(28,28,28,.4);--ink-12:rgba(28,28,28,.12);--ink-4:rgba(28,28,28,.04);--ink-3:rgba(28,28,28,.03);--muted:#5f5f5d;--border:#eceae4;--cream:#f7f4ed;--off-white:#fcfbf8}
    *{box-sizing:border-box}body{margin:0;background:var(--cream)}.shell{max-width:1200px;margin:auto;padding:0 24px 96px}.masthead{position:relative;overflow:hidden;padding:24px 0 96px;border-bottom:1px solid var(--border)}.masthead:before{content:"";position:absolute;inset:-50% -10% auto;height:520px;background:radial-gradient(circle at 28% 55%,rgba(225,174,137,.24),transparent 34%),radial-gradient(circle at 72% 35%,rgba(139,164,180,.18),transparent 31%),radial-gradient(circle at 56% 72%,rgba(208,155,171,.15),transparent 32%);filter:blur(20px);pointer-events:none}.masthead .inner{position:relative;max-width:1200px;margin:auto;padding:0 24px}.topbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:92px}.wordmark{font-size:1rem;font-weight:600}.mode{border:1px solid var(--border);border-radius:9999px;padding:6px 12px;font-size:.875rem;color:var(--muted);background:rgba(247,244,237,.65)}.eyebrow{font-size:.875rem;color:var(--muted);margin-bottom:12px}.masthead h1{font-size:clamp(2.25rem,6vw,3.75rem);font-weight:600;line-height:1.03;letter-spacing:-1.5px;margin:0 0 18px;max-width:850px}.masthead p{max-width:700px;font-size:1.13rem;line-height:1.38;color:var(--ink-82);margin:0}.panel{background:var(--cream);border:1px solid var(--border);border-radius:16px;padding:24px}.scan-panel{margin-top:-48px;position:relative}.scan-panel h2{font-size:1.25rem;font-weight:400;margin:0 0 18px}.form-grid{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:end}label{font-weight:400;display:block;margin-bottom:7px}input[type=url],input[type=number]{width:100%;border:1px solid var(--border);border-radius:6px;padding:12px 13px;font:inherit;color:var(--ink);background:var(--cream)}input::placeholder{color:var(--muted)}input:focus,button:focus,a:focus{outline:0;box-shadow:0 0 0 2px rgba(59,130,246,.5),rgba(0,0,0,.1) 0 4px 12px}.primary{border:0;border-radius:6px;background:var(--ink);color:var(--off-white);font:inherit;font-weight:400;padding:12px 18px;cursor:pointer;min-width:140px;box-shadow:rgba(255,255,255,.2) 0 .5px 0 inset,rgba(0,0,0,.2) 0 0 0 .5px inset,rgba(0,0,0,.05) 0 1px 2px}.primary:active,.secondary:active,.filter:active{opacity:.8}.primary:disabled{opacity:.5;cursor:wait}.options{display:flex;gap:22px;flex-wrap:wrap;margin-top:16px;color:var(--ink-82)}.check{display:flex;gap:8px;align-items:center;font-weight:400}.check input{width:18px;height:18px;accent-color:var(--ink)}.pages{display:none;width:110px}.status{min-height:1.5rem;margin:14px 0 0;color:var(--muted)}.status.error{color:var(--ink);font-weight:600}.results{margin-top:56px}.result-header{display:flex;justify-content:space-between;gap:18px;align-items:start;flex-wrap:wrap}.result-header h2{font-size:2.25rem;line-height:1.1;letter-spacing:-.9px;font-weight:600;margin:0 0 8px}.source{overflow-wrap:anywhere;color:var(--ink);text-decoration:underline}.downloads{display:flex;gap:8px;flex-wrap:wrap}.secondary,.filter{display:inline-block;border:1px solid var(--ink-40);border-radius:6px;background:transparent;color:var(--ink);padding:8px 16px;text-decoration:none;font:inherit;cursor:pointer}.summary{display:grid;grid-template-columns:repeat(6,minmax(110px,1fr));gap:12px;margin:32px 0}.metric{border:1px solid var(--border);border-radius:12px;padding:18px;background:var(--ink-3)}.metric strong{display:block;font-size:3rem;font-weight:600;letter-spacing:-1.2px;line-height:1}.metric span{color:var(--muted);font-size:.875rem}.filters{display:flex;gap:8px;flex-wrap:wrap;margin:24px 0 0}.filter{border-radius:9999px}.filter[aria-pressed=true]{background:var(--ink);color:var(--off-white);border-color:var(--ink);box-shadow:rgba(255,255,255,.2) 0 .5px 0 inset,rgba(0,0,0,.2) 0 0 0 .5px inset}.badge{text-transform:uppercase;font-size:.72rem;font-weight:600;letter-spacing:.04em;padding:4px 8px;border-radius:9999px;color:var(--off-white);background:var(--ink-40)}.badge.critical{background:var(--ink)}.badge.serious{background:var(--ink-83)}.badge.moderate{background:var(--ink-40);color:var(--ink)}.badge.minor{background:var(--ink-4);color:var(--ink);border:1px solid var(--border)}.selector{display:block;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;background:var(--ink-4);padding:8px 10px;border-radius:6px;overflow-wrap:anywhere}.detail-label{font-weight:600;margin:16px 0 4px}.detail-text{margin:0;white-space:pre-wrap;color:var(--ink-82)}.notice{background:var(--ink-3);border:1px solid var(--border);padding:12px 15px;margin:24px 0 0;border-radius:8px;color:var(--ink-82)}.empty{padding:40px;text-align:center;color:var(--muted)}.review-workspace{display:grid;grid-template-columns:330px minmax(0,1fr);gap:24px;margin-top:24px;align-items:start}.queue-panel,.detail-panel{border:1px solid var(--border);border-radius:16px;background:var(--cream)}.queue-panel{position:sticky;top:16px;max-height:calc(100vh - 32px);display:flex;flex-direction:column;overflow:hidden}.queue-header{padding:18px 18px 12px;border-bottom:1px solid var(--border)}.queue-header h3{font-size:1.25rem;font-weight:400;margin:0}.queue-count{font-size:.875rem;color:var(--muted);margin:4px 0 0}.finding-list{display:flex;flex-direction:column;gap:8px;padding:10px;overflow:auto}.finding-nav{width:100%;text-align:left;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--ink);padding:12px;cursor:pointer;font:inherit}.finding-nav:hover{background:var(--ink-3);border-color:var(--border)}.finding-nav[aria-current=true]{background:var(--ink-4);border-color:var(--ink-40)}.finding-nav-title{display:block;font-size:.95rem;line-height:1.3;margin-top:8px}.finding-nav-meta{display:block;font-size:.78rem;color:var(--muted);margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.detail-panel{padding:24px;min-width:0}.detail-kicker{display:flex;gap:10px;align-items:center;margin-bottom:12px}.detail-kicker-text{font-size:.875rem;color:var(--muted)}.detail-header h3{font-size:2.25rem;line-height:1.08;letter-spacing:-.9px;font-weight:600;margin:0;max-width:820px}.detail-section{border-top:1px solid var(--border);padding-top:24px;margin-top:24px}.detail-section h4{font-size:1.25rem;font-weight:400;margin:0 0 12px}.section-copy{margin:0;color:var(--ink-82);white-space:pre-wrap}.meta-grid,.location-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.meta-card,.location-card{border:1px solid var(--border);border-radius:8px;background:var(--ink-3);padding:14px;min-width:0}.meta-label{display:block;font-size:.78rem;color:var(--muted);margin-bottom:5px}.meta-value{display:block;font-size:1rem;font-weight:600;overflow-wrap:anywhere}.meta-help{font-size:.82rem;color:var(--muted);margin:5px 0 0}.location-link{display:block;color:var(--ink);text-decoration:underline;overflow-wrap:anywhere}.source-url{display:block;margin-top:5px;font-size:.82rem;color:var(--muted);text-decoration:underline;overflow-wrap:anywhere}.rule-link{color:var(--ink);text-decoration:underline}.wcag-list{display:flex;gap:6px;flex-wrap:wrap}.wcag-chip{border:1px solid var(--border);border-radius:9999px;padding:2px 8px;background:var(--cream);font-size:.82rem}.review-note{border:1px solid var(--border);border-radius:8px;background:var(--ink-3);padding:12px;color:var(--ink-82)}.code-compare{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}.code-card{min-width:0}.code-label{display:block;font-size:.8rem;color:var(--muted);margin-bottom:6px}.code-card pre{margin:0;background:var(--ink);color:var(--off-white);border-radius:8px;padding:14px;white-space:pre-wrap;overflow:auto;max-height:360px;font-size:.8rem}.alternative-list,.verify-list,.reference-list{color:var(--ink-82)}.verify-list li,.reference-list li{margin:7px 0}.shot-button{display:block;width:min(100%,540px);padding:0;border:1px solid var(--border);border-radius:12px;background:transparent;cursor:zoom-in;overflow:hidden}.shot-button img{display:block;width:100%;height:auto;max-height:280px;object-fit:cover;object-position:top}.shot-caption{display:flex;justify-content:space-between;gap:12px;width:min(100%,540px);font-size:.875rem;color:var(--muted);margin-top:8px}.image-dialog{width:min(96vw,1500px);max-width:none;border:1px solid var(--border);border-radius:16px;background:var(--cream);padding:14px}.image-dialog::backdrop{background:rgba(28,28,28,.78)}.dialog-bar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:10px}.dialog-bar strong{font-weight:600}.dialog-close{border:1px solid var(--ink-40);background:transparent;border-radius:6px;padding:8px 16px;font:inherit;cursor:pointer}.image-dialog img{display:block;width:100%;max-height:86vh;object-fit:contain;border:1px solid var(--border);border-radius:12px;background:var(--ink-3)}[hidden]{display:none!important}
    @media(max-width:900px){.topbar{margin-bottom:64px}.form-grid{grid-template-columns:1fr}.summary{grid-template-columns:repeat(2,1fr)}.primary{width:100%}.review-workspace{grid-template-columns:1fr}.queue-panel{position:static;max-height:360px}.code-compare{grid-template-columns:1fr}}@media(max-width:600px){.shell,.masthead .inner{padding-left:14px;padding-right:14px}.masthead{padding-bottom:64px}.masthead h1{font-size:2.25rem;letter-spacing:-.9px}.panel,.detail-panel{padding:17px}.summary,.meta-grid,.location-grid{grid-template-columns:1fr}.metric strong{font-size:2.25rem}.detail-header h3{font-size:1.75rem}.shot-caption{display:block}.shot-caption span{display:block;margin-top:4px}}
  </style>
</head>
<body>
  <header class="masthead"><div class="inner"><div class="topbar"><div class="wordmark">ADA Assistant</div><div class="mode">Local report studio</div></div><div class="eyebrow">Accessibility, made visible</div><h1>See every finding in context.</h1><p>Scan a rendered webpage, review the source element, and use highlighted screenshots to understand where each automated finding appears.</p></div></header>
  <main class="shell">
    <section class="panel scan-panel" aria-labelledby="scan-heading">
      <h2 id="scan-heading">Scan a website</h2>
      <form id="scan-form">
        <div class="form-grid"><div><label for="url">Website URL</label><input id="url" name="url" type="url" required placeholder="https://example.com/" value="https://www.michiganbusiness.org/"></div><button class="primary" id="scan-button" type="submit">Scan page</button></div>
        <div class="options"><label class="check"><input id="crawl" type="checkbox"> Crawl same-origin pages</label><label class="pages" id="pages-label">Page limit <input id="max-pages" type="number" min="1" max="50" value="10"></label><label class="check"><input id="screenshots" type="checkbox" checked> Capture screenshots</label></div>
        <p class="status" id="status" role="status" aria-live="polite"></p>
      </form>
    </section>
    <section class="results" id="results" hidden aria-labelledby="results-heading">
      <div class="panel"><div class="result-header"><div><h2 id="results-heading">Scan results</h2><span class="meta-label">Scanned website</span><a class="source" id="result-source" target="_blank" rel="noopener noreferrer"></a></div><div class="downloads"><a class="secondary" id="json-download" href="/api/report.json">Download JSON</a><a class="secondary" id="html-download" href="/api/report.html">Download HTML report</a></div></div><div class="summary" id="summary"></div><p class="notice" id="notice"></p><div class="notice" id="incomplete" hidden></div><nav class="filters" id="filters" aria-label="Filter findings"></nav></div>
      <div class="review-workspace"><aside class="queue-panel" aria-labelledby="queue-heading"><div class="queue-header"><h3 id="queue-heading">Finding list</h3><p class="queue-count" id="queue-count"></p></div><div class="finding-list" id="finding-list"></div></aside><section class="detail-panel" id="finding-detail" aria-live="polite"></section></div>
    </section>
  </main>
  <dialog class="image-dialog" id="image-dialog"><div class="dialog-bar"><strong id="dialog-title">Visual evidence</strong><button class="dialog-close" id="dialog-close" type="button">Close</button></div><img id="dialog-image" alt=""></dialog>
  <script>
    const form=document.getElementById('scan-form');const crawl=document.getElementById('crawl');const pagesLabel=document.getElementById('pages-label');const button=document.getElementById('scan-button');const status=document.getElementById('status');const results=document.getElementById('results');const list=document.getElementById('finding-list');const detail=document.getElementById('finding-detail');const queueCount=document.getElementById('queue-count');const imageDialog=document.getElementById('image-dialog');const dialogImage=document.getElementById('dialog-image');const dialogTitle=document.getElementById('dialog-title');let latest=null;let activeFilter='all';let selectedFingerprint=null;
    crawl.addEventListener('change',()=>{pagesLabel.style.display=crawl.checked?'block':'none';});
    function el(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
    function addTextBlock(parent,label,value,className){parent.append(el('p','detail-label',label));parent.append(el('p',className||'detail-text',value||'Not provided'));}
    function renderSummary(result){const counts={critical:0,serious:0,moderate:0,minor:0};result.findings.forEach(f=>counts[f.severity]++);const summary=document.getElementById('summary');summary.replaceChildren();[['Pages tested',result.metadata.pagesOrFilesScanned],['Findings',result.findings.length],['Critical',counts.critical],['Serious',counts.serious],['Moderate',counts.moderate],['Minor',counts.minor]].forEach(item=>{const card=el('div','metric');card.append(el('strong','',String(item[1])));card.append(el('span','',item[0]));summary.append(card);});}
    function renderFilters(){const filters=document.getElementById('filters');filters.replaceChildren();['all','critical','serious','moderate','minor'].forEach(name=>{const filter=el('button','filter',name[0].toUpperCase()+name.slice(1));filter.type='button';filter.setAttribute('aria-pressed',String(activeFilter===name));filter.addEventListener('click',()=>{activeFilter=name;selectedFingerprint=null;renderFilters();renderFindings();});filters.append(filter);});}
    function externalLink(label,url,className){const link=el('a',className||'source',label);link.href=url;link.target='_blank';link.rel='noopener noreferrer';return link;}
    function titledSection(title){const section=el('section','detail-section');section.append(el('h4','',title));return section;}
    function metaCard(label,value,help){const card=el('div','meta-card');card.append(el('span','meta-label',label));if(value instanceof Node)card.append(value);else card.append(el('strong','meta-value',value));if(help)card.append(el('p','meta-help',help));return card;}
    function severityDescription(severity){return {critical:'Highest priority. This issue can block access to important content or controls.',serious:'High priority. This issue can create a major barrier for some users.',moderate:'Review soon. This issue can make the page harder to understand or operate.',minor:'Lower priority, but still worth correcting and retesting.'}[severity]||'Review this finding and verify the result.';}
    function codeCard(label,value){const card=el('div','code-card');card.append(el('span','code-label',label));const pre=el('pre','');pre.append(el('code','',value));card.append(pre);return card;}
    function openScreenshot(f){dialogTitle.textContent=f.title;dialogImage.src=f.screenshot.dataUrl;dialogImage.alt=f.screenshot.description;imageDialog.showModal();}
    function renderDetail(f){detail.replaceChildren();if(!f){detail.append(el('div','empty','Select a finding to review its evidence and suggested code changes.'));return;}const header=el('header','detail-header');const kicker=el('div','detail-kicker');kicker.append(el('span','badge '+f.severity,f.severity));kicker.append(el('span','detail-kicker-text',(f.kind==='automatic'?'Automated finding':'Manual review')+' · '+f.confidence+' confidence'));header.append(kicker);header.append(el('h3','',f.title));detail.append(header);const summary=titledSection('Finding summary');const summaryGrid=el('div','meta-grid');summaryGrid.append(metaCard('Priority',f.severity[0].toUpperCase()+f.severity.slice(1),severityDescription(f.severity)));const ruleValue=f.helpUrl?externalLink(f.ruleId,f.helpUrl,'rule-link meta-value'):el('code','meta-value',f.ruleId);summaryGrid.append(metaCard('Automated rule',ruleValue,f.helpUrl?'Opens the full rule documentation in a new tab.':'Rule identifier reported by the scanner.'));const wcagValue=el('div','wcag-list');if(f.wcag.length)f.wcag.forEach(item=>wcagValue.append(el('span','wcag-chip','WCAG '+item)));else wcagValue.append(el('span','meta-value','Not mapped'));summaryGrid.append(metaCard('Standards mapping',wcagValue,f.wcag.length?'Success criteria associated with this automated rule.':'No WCAG criterion was supplied for this rule.'));summaryGrid.append(metaCard('Detection confidence',f.confidence[0].toUpperCase()+f.confidence.slice(1),f.kind==='automatic'?'Detected automatically; human verification is still required.':'This finding requires manual review.'));summary.append(summaryGrid);detail.append(summary);const location=titledSection('Where it was found');const locationGrid=el('div','location-grid');const sourceCard=el('div','location-card');if(f.location.url){sourceCard.append(el('span','meta-label','Source page'));sourceCard.append(externalLink(f.location.pageTitle||'Open the affected page',f.location.url,'location-link'));sourceCard.append(externalLink(f.location.url,f.location.url,'source-url'));}else{sourceCard.append(el('span','meta-label','Source file'));sourceCard.append(el('strong','meta-value',f.location.file||'Not provided'));if(f.location.line)sourceCard.append(el('p','meta-help','Line '+f.location.line+(f.location.column?', column '+f.location.column:'')));}locationGrid.append(sourceCard);const elementCard=el('div','location-card');elementCard.append(el('span','meta-label','Affected element'));elementCard.append(el('code','selector',f.location.selector||'No CSS selector was reported'));elementCard.append(el('p','meta-help','Use this selector to locate the element in browser developer tools.'));locationGrid.append(elementCard);location.append(locationGrid);detail.append(location);if(f.screenshot){const visual=titledSection('Visual evidence');visual.append(el('p','section-copy','The affected element is outlined in charcoal. Select the thumbnail to inspect the full viewport capture.'));const shot=el('button','shot-button');shot.type='button';shot.setAttribute('aria-label','Open larger screenshot for '+f.title);const image=el('img','');image.src=f.screenshot.dataUrl;image.alt=f.screenshot.description;shot.append(image);shot.addEventListener('click',()=>openScreenshot(f));visual.append(shot);const caption=el('div','shot-caption');caption.append(el('span','',f.screenshot.description));caption.append(el('span','','Click to enlarge'));visual.append(caption);detail.append(visual);}const why=titledSection('Why this was flagged');addTextBlock(why,'Rule purpose',f.explanation);addTextBlock(why,'Failed check',f.impact);detail.append(why);const fix=titledSection('Recommended fix');fix.append(el('p','section-copy',f.remediation));if(f.safeFix)fix.append(el('p','review-note','Safe automated fix available: '+f.safeFix.description));detail.append(fix);const suggestion=f.codeSuggestion;if(suggestion){const section=titledSection('Code example: '+suggestion.title);section.append(el('p','review-note',(suggestion.reviewRequired?'Review required: ':'')+suggestion.rationale));const compare=el('div','code-compare');compare.append(codeCard('Before — detected markup',suggestion.before));compare.append(codeCard('Suggested after — starting point',suggestion.after));section.append(compare);if(suggestion.alternatives&&suggestion.alternatives.length){section.append(el('p','detail-label','Other valid approach'));const alternatives=el('ul','alternative-list');suggestion.alternatives.forEach(item=>alternatives.append(el('li','',item)));section.append(alternatives);}detail.append(section);}else{const section=titledSection('Detected markup');section.append(codeCard('Before — no generic code patch is reliable for this rule',f.evidence));section.append(el('p','review-note','A code change needs page-specific context. Follow the recommended fix, then verify manually.'));detail.append(section);}const verify=titledSection('How to verify the fix');const steps=el('ol','verify-list');['Review the surrounding component so the change preserves the intended behavior.','Replace any bracketed placeholder text with content approved for this page.','Test the affected element with a keyboard and the relevant assistive technology.','Run the accessibility scan again and confirm the finding is gone without introducing a new issue.'].forEach(item=>steps.append(el('li','',item)));verify.append(steps);const references=el('ul','reference-list');if(f.location.url){const item=el('li','');item.append(externalLink('Open the affected source page',f.location.url,'source'));references.append(item);}if(f.helpUrl){const item=el('li','');item.append(externalLink('Open the axe rule documentation',f.helpUrl,'source'));references.append(item);}if(f.wcag.length){const item=el('li','');item.append(externalLink('Open the WCAG 2.2 Understanding guidance','https://www.w3.org/WAI/WCAG22/Understanding/','source'));references.append(item);}if(references.childElementCount){verify.append(el('p','detail-label','References'));verify.append(references);}detail.append(verify);}
    function renderFindings(){list.replaceChildren();const findings=latest.findings.filter(f=>activeFilter==='all'||f.severity===activeFilter);queueCount.textContent=findings.length+' finding'+(findings.length===1?'':'s')+' in this view';if(!findings.length){const failures=(latest.metadata.incomplete||[]).length;let message='No findings match this filter.';if(activeFilter==='all'&&failures){message='No completed findings are available because one or more pages failed to scan. Review the incomplete-page details above.';}else if(activeFilter==='all'&&latest.metadata.pagesOrFilesScanned>0){message='The completed page scan produced zero automated axe-core findings. This does not mean the page is fully accessible; continue with manual testing.';}else if(activeFilter==='all'){message='No pages completed successfully. Review the scan status and try again.';}list.append(el('div','empty',message));renderDetail(null);return;}if(!findings.some(f=>f.fingerprint===selectedFingerprint))selectedFingerprint=findings[0].fingerprint;findings.forEach((f,index)=>{const item=el('button','finding-nav');item.type='button';item.setAttribute('aria-current',String(f.fingerprint===selectedFingerprint));const meta=el('div','');meta.append(el('span','badge '+f.severity,f.severity));meta.append(el('span','finding-nav-title',(index+1)+'. '+f.title));meta.append(el('span','finding-nav-meta',f.location.selector||f.location.file||f.location.url||f.ruleId));item.append(meta);item.addEventListener('click',()=>{selectedFingerprint=f.fingerprint;renderFindings();detail.scrollIntoView({behavior:'smooth',block:'start'});});list.append(item);});renderDetail(findings.find(f=>f.fingerprint===selectedFingerprint));}
    function render(result){latest=result;activeFilter='all';selectedFingerprint=null;results.hidden=false;const source=document.getElementById('result-source');source.textContent=result.metadata.target;source.href=result.metadata.target;document.getElementById('notice').textContent=result.notice;const incomplete=document.getElementById('incomplete');const failures=result.metadata.incomplete||[];incomplete.replaceChildren();incomplete.hidden=!failures.length;if(failures.length){incomplete.append(el('strong','','Incomplete pages'));const failureList=el('ul','');failures.forEach(item=>{const row=el('li','');row.append(externalLink(item.url,item.url,'source'));row.append(document.createTextNode(' — '+item.reason));failureList.append(row);});incomplete.append(failureList);}renderSummary(result);renderFilters();renderFindings();results.scrollIntoView({behavior:'smooth',block:'start'});}
    form.addEventListener('submit',async event=>{event.preventDefault();button.disabled=true;button.textContent='Scanning…';status.className='status';status.textContent='Opening the page, running accessibility checks, and capturing visual evidence. This can take about a minute.';results.hidden=true;try{const response=await fetch('/api/scan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:document.getElementById('url').value,crawl:crawl.checked,maxPages:Number(document.getElementById('max-pages').value),captureScreenshots:document.getElementById('screenshots').checked})});const payload=await response.json();if(!response.ok)throw new Error(payload.error||'The scan failed.');render(payload);const failed=(payload.metadata.incomplete||[]).length;if(failed){status.className='status error';status.textContent='Scan incomplete: '+failed+' page(s) could not be tested. Review the failure details below.';}else{status.textContent='Scan complete: '+payload.findings.length+' finding(s) across '+payload.metadata.pagesOrFilesScanned+' page(s).';}}catch(error){status.className='status error';status.textContent=error.message;}finally{button.disabled=false;button.textContent='Scan page';}});
    document.getElementById('dialog-close').addEventListener('click',()=>imageDialog.close());imageDialog.addEventListener('click',event=>{if(event.target===imageDialog)imageDialog.close();});
  </script>
</body></html>`;
}

export async function startUiServer(options: UiServerOptions = {}): Promise<UiServerHandle> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 4173;
  let latestResult: ScanResult | undefined;
  let scanning = false;
  const server = createServer(async (req, res) => {
    const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? `${host}:${port}`}`);
    try {
      if (req.method === "GET" && requestUrl.pathname === "/") {
        send(res, 200, "text/html; charset=utf-8", dashboardHtml());
        return;
      }
      if (req.method === "POST" && requestUrl.pathname === "/api/scan") {
        if (scanning) {
          sendJson(res, 409, { error: "A scan is already running. Wait for it to finish before starting another." });
          return;
        }
        const body = await readJson(req);
        const target = parseTarget(body.url);
        const crawl = body.crawl === true;
        scanning = true;
        try {
          latestResult = await scanUrls([target], {
            crawl,
            maxPages: crawl ? boundedInteger(body.maxPages, 10, 1, 50) : 1,
            captureScreenshots: body.captureScreenshots !== false,
            screenshotLimit: 50,
          });
          sendJson(res, 200, latestResult);
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

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });
  return { server, url: `http://${host}:${port}` };
}
