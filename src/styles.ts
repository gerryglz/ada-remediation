// Visual language shared by the local dashboard and the downloadable HTML report.
export const sharedCss = `
    :root{--ink:#1b2540;--body:rgba(27,37,64,.84);--muted:#55637a;--line:#dde3f0;--line-strong:rgba(27,37,64,.36);--page:#f3f5fb;--raised:#fff;--tint:rgba(47,85,196,.07);--accent:#2f55c4;--accent-strong:#2446a8;--accent-soft:#eef2fc;--critical:#ab307e;--serious:#9a4e12;--moderate:#0e6e78;--minor:#5b6578;--sev:var(--minor);--mono:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace}
    *{box-sizing:border-box}
    [hidden]{display:none!important}
    body{margin:0;font:14px/1.5 "Camera Plain Variable",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:var(--page);-webkit-font-smoothing:antialiased}
    :focus-visible{outline:2px solid var(--accent);outline-offset:2px}
    a{color:var(--accent);text-underline-offset:2px}
    a:hover{text-decoration-thickness:2px}
    h1,h2,h3,h4,p{margin:0}
    code,pre{font-family:var(--mono)}
    code{font-size:.92em;background:var(--tint);border-radius:4px;padding:1px 5px;overflow-wrap:anywhere}
    .critical{--sev:var(--critical)}.serious{--sev:var(--serious)}.moderate{--sev:var(--moderate)}.minor{--sev:var(--minor)}
    .muted{color:var(--muted)}
    .label{display:block;font-size:12px;color:var(--muted);margin-bottom:4px}
    .count{color:var(--muted);font-variant-numeric:tabular-nums}
    .btn,.chip,.tabs button,input,select{font:inherit;color:var(--ink);touch-action:manipulation}
    .btn{display:inline-flex;align-items:center;height:32px;padding:0 12px;border:1px solid var(--line-strong);border-radius:6px;background:transparent;font-size:13px;text-decoration:none;white-space:nowrap;cursor:pointer;transition:background-color .15s ease-out,transform .15s ease-out}
    .btn:hover{background:var(--tint)}
    .btn:active{transform:scale(.97)}
    .chips{display:flex;flex-wrap:wrap;gap:6px}
    .chip{height:28px;padding:0 10px;border:1px solid var(--line);border-radius:999px;background:var(--raised);font-size:13px;cursor:pointer;transition:background-color .15s ease-out,border-color .15s ease-out}
    .chip:hover{border-color:var(--line-strong)}
    .chip[aria-pressed=true]{border-color:var(--accent);background:var(--accent);color:var(--raised)}
    .chip[aria-pressed=true] .count{color:inherit;opacity:.75}
    .dot{width:8px;height:8px;margin-top:6px;border-radius:50%;background:var(--sev)}
    .row-main{display:grid;gap:2px;min-width:0}
    .row-title{line-height:1.35;overflow-wrap:anywhere}
    .row-meta{font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .meta{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:13px;color:var(--muted)}
    .pill{padding:2px 9px;border-radius:999px;background:var(--sev);color:var(--raised);font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase}
    .detail h2{margin-top:8px;font-size:24px;font-weight:600;line-height:1.2;letter-spacing:-.3px;text-wrap:balance}
    .detail h3,.detail h4{margin:28px 0 8px;font-size:15px;font-weight:600}
    .detail p,.detail li{color:var(--body);text-wrap:pretty}
    .detail ul,.detail ol{margin:0;padding-left:20px}
    .detail li+li{margin-top:6px}
    .where{margin-top:12px}
    .lead{margin-top:12px}
    .callout{margin-top:20px;padding:12px 16px;border:1px solid var(--line);border-left:3px solid var(--sev);border-radius:8px;background:var(--raised)}
    .callout p{font-weight:600;color:var(--ink)}
    .callout .roles{margin-top:8px;font-weight:400}
    .note{margin-top:8px;font-size:13px;color:var(--muted)}
    .facts{display:flex;flex-wrap:wrap;gap:12px 28px;margin:0}
    .facts dt{font-size:12px;color:var(--muted)}
    .facts dd{display:flex;align-items:center;gap:6px;margin:0;font-weight:600;font-variant-numeric:tabular-nums}
    .swatch{width:14px;height:14px;border-radius:3px;outline:1px solid rgba(0,0,0,.2);outline-offset:-1px}
    .compare{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px}
    .code{min-width:0}
    pre{margin:0;max-height:320px;overflow:auto;padding:12px 14px;border-radius:8px;background:var(--ink);color:var(--raised);font-size:12.5px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}
    pre code{background:none;padding:0;font-size:inherit}
    .shot{display:block;width:min(100%,520px);padding:0;border:1px solid var(--line);border-radius:8px;background:transparent;overflow:hidden;cursor:zoom-in}
    .shot img{display:block;width:100%;height:auto;max-height:260px;object-fit:cover;object-position:top}
    .more-list{margin-top:32px;border-bottom:1px solid var(--line)}
    .more{border-top:1px solid var(--line)}
    .more>summary{padding:11px 0;font-weight:600;cursor:pointer}
    .more>summary:hover{color:#000}
    .more-body{display:grid;gap:10px;padding:0 0 16px}
    .more-body .btn{justify-self:start}
    .image-dialog{width:min(96vw,1500px);max-width:none;padding:12px;border:1px solid var(--line);border-radius:14px;background:var(--page);overscroll-behavior:contain}
    .image-dialog::backdrop{background:rgba(28,28,28,.78)}
    .dialog-bar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:10px}
    .image-dialog img{display:block;width:100%;height:auto;max-height:84vh;object-fit:contain;border-radius:6px;outline:1px solid rgba(0,0,0,.1);outline-offset:-1px}
    @media(prefers-reduced-motion:reduce){*{transition:none!important}}
    .detail .muted,.detail .note{color:var(--muted)}
    .child{margin-top:8px;border:1px solid var(--line);border-radius:10px;background:var(--raised)}
    .child[open]{border-color:var(--line-strong)}
    .child>summary{display:grid;grid-template-columns:8px minmax(0,1fr);gap:10px;padding:10px 12px;cursor:pointer;list-style:none}
    .child>summary::-webkit-details-marker{display:none}
    .child>summary:hover{background:var(--tint)}
    .child-body{padding:0 16px 16px}
    .child-body .where{margin-top:4px}
    .element{display:grid;grid-template-columns:132px minmax(0,1fr);gap:14px;align-items:start;padding:12px 0;border-top:1px solid var(--line)}
    .element.no-shot{grid-template-columns:minmax(0,1fr)}
    .element .shot{width:132px}
    .element .shot img{max-height:84px}
    .element-main{display:grid;gap:4px;min-width:0;justify-items:start}
    .element-markup{font-family:var(--mono);font-size:12px;color:var(--muted);overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .element-note{font-size:13px;color:var(--body)}
    .callout ul{margin:0;padding-left:18px}
    .callout li{color:var(--ink)}
    .callout details{margin-top:6px}
    .detail .lead-fix{font-weight:600;color:var(--ink)}
`;
