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
    *{box-sizing:border-box}body{margin:0;background:var(--cream)}.shell{max-width:1200px;margin:auto;padding:0 24px 96px}.masthead{position:relative;overflow:hidden;padding:24px 0 96px;border-bottom:1px solid var(--border)}.masthead:before{content:"";position:absolute;inset:-50% -10% auto;height:520px;background:radial-gradient(circle at 28% 55%,rgba(225,174,137,.24),transparent 34%),radial-gradient(circle at 72% 35%,rgba(139,164,180,.18),transparent 31%),radial-gradient(circle at 56% 72%,rgba(208,155,171,.15),transparent 32%);filter:blur(20px);pointer-events:none}.masthead .inner{position:relative;max-width:1200px;margin:auto;padding:0 24px}.topbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:92px}.wordmark{font-size:1rem;font-weight:600}.mode{border:1px solid var(--border);border-radius:9999px;padding:6px 12px;font-size:.875rem;color:var(--muted);background:rgba(247,244,237,.65)}.eyebrow{font-size:.875rem;color:var(--muted);margin-bottom:12px}.masthead h1{font-size:clamp(2.25rem,6vw,3.75rem);font-weight:600;line-height:1.03;letter-spacing:-1.5px;margin:0 0 18px;max-width:850px}.masthead p{max-width:700px;font-size:1.13rem;line-height:1.38;color:var(--ink-82);margin:0}.panel{background:var(--cream);border:1px solid var(--border);border-radius:16px;padding:24px}.scan-panel{margin-top:-48px;position:relative}.scan-panel h2{font-size:1.25rem;font-weight:400;margin:0 0 18px}.form-grid{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:end}label{font-weight:400;display:block;margin-bottom:7px}input[type=url],input[type=number]{width:100%;border:1px solid var(--border);border-radius:6px;padding:12px 13px;font:inherit;color:var(--ink);background:var(--cream)}input::placeholder{color:var(--muted)}input:focus,button:focus,a:focus{outline:0;box-shadow:0 0 0 2px rgba(59,130,246,.5),rgba(0,0,0,.1) 0 4px 12px}.primary{border:0;border-radius:6px;background:var(--ink);color:var(--off-white);font:inherit;font-weight:400;padding:12px 18px;cursor:pointer;min-width:140px;box-shadow:rgba(255,255,255,.2) 0 .5px 0 inset,rgba(0,0,0,.2) 0 0 0 .5px inset,rgba(0,0,0,.05) 0 1px 2px}.primary:active,.secondary:active,.filter:active{opacity:.8}.primary:disabled{opacity:.5;cursor:wait}.options{display:flex;gap:22px;flex-wrap:wrap;margin-top:16px;color:var(--ink-82)}.check{display:flex;gap:8px;align-items:center;font-weight:400}.check input{width:18px;height:18px;accent-color:var(--ink)}.pages{display:none;width:110px}.status{min-height:1.5rem;margin:14px 0 0;color:var(--muted)}.status.error{color:var(--ink);font-weight:600}.results{margin-top:56px}.result-header{display:flex;justify-content:space-between;gap:18px;align-items:start;flex-wrap:wrap}.result-header h2{font-size:2.25rem;line-height:1.1;letter-spacing:-.9px;font-weight:600;margin:0 0 8px}.source{overflow-wrap:anywhere;color:var(--ink);text-decoration:underline}.downloads{display:flex;gap:8px;flex-wrap:wrap}.secondary,.filter{display:inline-block;border:1px solid var(--ink-40);border-radius:6px;background:transparent;color:var(--ink);padding:8px 16px;text-decoration:none;font:inherit;cursor:pointer}.summary{display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:12px;margin:32px 0}.metric{border:1px solid var(--border);border-radius:12px;padding:18px;background:var(--ink-3)}.metric strong{display:block;font-size:3rem;font-weight:600;letter-spacing:-1.2px;line-height:1}.metric span{color:var(--muted);font-size:.875rem}.filters{display:flex;gap:8px;flex-wrap:wrap;margin:24px 0 0}.filter{border-radius:9999px}.filter[aria-pressed=true]{background:var(--ink);color:var(--off-white);border-color:var(--ink);box-shadow:rgba(255,255,255,.2) 0 .5px 0 inset,rgba(0,0,0,.2) 0 0 0 .5px inset}.finding-list{display:grid;gap:24px;margin-top:24px}.finding{background:var(--cream);border:1px solid var(--border);border-radius:12px;overflow:hidden}.finding-head{padding:20px 20px 10px}.finding-title{display:flex;align-items:center;gap:10px}.finding h3{margin:0;font-size:1.25rem;line-height:1.25;font-weight:400}.badge{text-transform:uppercase;font-size:.72rem;font-weight:600;letter-spacing:.04em;padding:4px 8px;border-radius:9999px;color:var(--off-white);background:var(--ink-40)}.badge.critical{background:var(--ink)}.badge.serious{background:var(--ink-83)}.badge.moderate{background:var(--ink-40);color:var(--ink)}.badge.minor{background:var(--ink-4);color:var(--ink);border:1px solid var(--border)}.source-line{font-size:.875rem;margin:.8rem 0;color:var(--muted);overflow-wrap:anywhere}.selector{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;background:var(--ink-4);padding:3px 6px;border-radius:4px}.finding-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,45%);gap:24px;padding:8px 20px 22px}.finding-grid.no-image{grid-template-columns:1fr}.detail-label{font-weight:600;margin:16px 0 4px}.detail-text{margin:0;white-space:pre-wrap;color:var(--ink-82)}.evidence{background:var(--ink);color:var(--off-white);border-radius:8px;padding:14px;white-space:pre-wrap;overflow:auto;font-size:.82rem}.shot{margin:0}.shot img{display:block;width:100%;height:auto;border:1px solid var(--border);border-radius:12px}.shot figcaption{font-size:.875rem;color:var(--muted);margin-top:8px}.notice{background:var(--ink-3);border:1px solid var(--border);padding:12px 15px;margin:24px 0 0;border-radius:8px;color:var(--ink-82)}.empty{padding:40px;text-align:center;color:var(--muted)}[hidden]{display:none!important}
    @media(max-width:850px){.topbar{margin-bottom:64px}.form-grid,.finding-grid{grid-template-columns:1fr}.summary{grid-template-columns:repeat(2,1fr)}.primary{width:100%}}@media(max-width:600px){.shell,.masthead .inner{padding-left:14px;padding-right:14px}.masthead{padding-bottom:64px}.masthead h1{font-size:2.25rem;letter-spacing:-.9px}.panel{padding:17px}.summary{grid-template-columns:1fr 1fr}.metric strong{font-size:2.25rem}.finding-grid{padding:6px 14px 16px}.finding-head{padding:16px 14px 8px}}
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
      <div class="panel"><div class="result-header"><div><h2 id="results-heading">Scan results</h2><a class="source" id="result-source" target="_blank" rel="noopener noreferrer"></a></div><div class="downloads"><a class="secondary" id="json-download" href="/api/report.json">Download JSON</a><a class="secondary" id="html-download" href="/api/report.html">Download HTML report</a></div></div><div class="summary" id="summary"></div><p class="notice" id="notice"></p><div class="notice" id="incomplete" hidden></div><nav class="filters" id="filters" aria-label="Filter findings"></nav></div>
      <div class="finding-list" id="finding-list"></div>
    </section>
  </main>
  <script>
    const form=document.getElementById('scan-form');const crawl=document.getElementById('crawl');const pagesLabel=document.getElementById('pages-label');const button=document.getElementById('scan-button');const status=document.getElementById('status');const results=document.getElementById('results');const list=document.getElementById('finding-list');let latest=null;let activeFilter='all';
    crawl.addEventListener('change',()=>{pagesLabel.style.display=crawl.checked?'block':'none';});
    function el(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
    function addTextBlock(parent,label,value,className){parent.append(el('p','detail-label',label));parent.append(el('p',className||'detail-text',value||'Not provided'));}
    function renderSummary(result){const counts={critical:0,serious:0,moderate:0,minor:0};result.findings.forEach(f=>counts[f.severity]++);const summary=document.getElementById('summary');summary.replaceChildren();[['Findings',result.findings.length],['Critical',counts.critical],['Serious',counts.serious],['Moderate',counts.moderate],['Minor',counts.minor]].forEach(item=>{const card=el('div','metric');card.append(el('strong','',String(item[1])));card.append(el('span','',item[0]));summary.append(card);});}
    function renderFilters(){const filters=document.getElementById('filters');filters.replaceChildren();['all','critical','serious','moderate','minor'].forEach(name=>{const filter=el('button','filter',name[0].toUpperCase()+name.slice(1));filter.type='button';filter.setAttribute('aria-pressed',String(activeFilter===name));filter.addEventListener('click',()=>{activeFilter=name;renderFilters();renderFindings();});filters.append(filter);});}
    function renderFindings(){list.replaceChildren();const findings=latest.findings.filter(f=>activeFilter==='all'||f.severity===activeFilter);if(!findings.length){list.append(el('div','panel empty','No findings match this filter. Automated scans still require manual testing.'));return;}findings.forEach(f=>{const card=el('article','finding');card.dataset.severity=f.severity;const head=el('div','finding-head');const titleRow=el('div','finding-title');titleRow.append(el('span','badge '+f.severity,f.severity));titleRow.append(el('h3','',f.title));head.append(titleRow);const source=el('p','source-line');if(f.location.url){const link=el('a','source',f.location.pageTitle||f.location.url);link.href=f.location.url;link.target='_blank';link.rel='noopener noreferrer';source.append(link);}if(f.location.selector){source.append(document.createTextNode(' · '));source.append(el('span','selector',f.location.selector));}head.append(source);card.append(head);const grid=el('div','finding-grid'+(f.screenshot?'':' no-image'));const details=el('div','');addTextBlock(details,'Why it matters',f.impact);addTextBlock(details,'Potential solution',f.remediation);addTextBlock(details,'Rule and WCAG',f.ruleId+(f.wcag.length?' · WCAG '+f.wcag.join(', '):''));details.append(el('p','detail-label','HTML evidence'));details.append(el('pre','evidence',f.evidence));grid.append(details);if(f.screenshot){const figure=el('figure','shot');const image=el('img','');image.src=f.screenshot.dataUrl;image.alt=f.screenshot.description;image.loading='lazy';figure.append(image);figure.append(el('figcaption','',f.screenshot.description));grid.append(figure);}card.append(grid);list.append(card);});}
    function render(result){latest=result;activeFilter='all';results.hidden=false;const source=document.getElementById('result-source');source.textContent=result.metadata.target;source.href=result.metadata.target;document.getElementById('notice').textContent=result.notice;const incomplete=document.getElementById('incomplete');const failures=result.metadata.incomplete||[];incomplete.replaceChildren();incomplete.hidden=!failures.length;if(failures.length){incomplete.append(el('strong','','Incomplete pages'));const failureList=el('ul','');failures.forEach(item=>failureList.append(el('li','',item.url+' — '+item.reason)));incomplete.append(failureList);}renderSummary(result);renderFilters();renderFindings();results.scrollIntoView({behavior:'smooth',block:'start'});}
    form.addEventListener('submit',async event=>{event.preventDefault();button.disabled=true;button.textContent='Scanning…';status.className='status';status.textContent='Opening the page, running accessibility checks, and capturing visual evidence. This can take about a minute.';results.hidden=true;try{const response=await fetch('/api/scan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:document.getElementById('url').value,crawl:crawl.checked,maxPages:Number(document.getElementById('max-pages').value),captureScreenshots:document.getElementById('screenshots').checked})});const payload=await response.json();if(!response.ok)throw new Error(payload.error||'The scan failed.');render(payload);const failed=(payload.metadata.incomplete||[]).length;if(failed){status.className='status error';status.textContent='Scan incomplete: '+failed+' page(s) could not be tested. Review the failure details below.';}else{status.textContent='Scan complete: '+payload.findings.length+' finding(s) across '+payload.metadata.pagesOrFilesScanned+' page(s).';}}catch(error){status.className='status error';status.textContent=error.message;}finally{button.disabled=false;button.textContent='Scan page';}});
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
