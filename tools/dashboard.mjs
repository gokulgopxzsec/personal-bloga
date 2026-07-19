// Control Room — dynamic local dashboard for the whole content pipeline.
// Zero dependencies, plain Node http. Runs pipeline commands live from the
// browser, streams their output, and serves the built static site.
//
//   node tools/dashboard.mjs      → http://localhost:4000        (control room)
//                                   http://localhost:4000/site/  (built blog, from out/)
//
// Free by design: works with whatever free LLM provider llm.mjs detects.

import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { detectEvents } from "./event-detector.mjs";
import { detectProvider } from "./llm.mjs";

const PORT = process.env.DASHBOARD_PORT || 4000;
const ROOT = process.cwd();
const VS = p => path.join(ROOT, "vector-store", p);

const ALLOWED = new Set(["quant", "events", "shield", "rank", "distribute", "index", "style", "autopilot", "crawl", "pulse"]);
let running = null;
let logBuffer = [];

function readJson(file) { try { return JSON.parse(fs.readFileSync(file, "utf-8")); } catch { return null; } }

function pushLog(line) {
  logBuffer.push(line);
  if (logBuffer.length > 500) logBuffer = logBuffer.slice(-400);
}

function runCommand(cmd, arg) {
  if (running) return false;
  const args = ["tools/orchestrator.mjs", cmd];
  if (arg) args.push(arg);
  logBuffer = [`$ node ${args.join(" ")}`];
  const child = spawn(process.execPath, args, { cwd: ROOT, env: process.env });
  running = { cmd, startedAt: Date.now() };
  const onData = d => d.toString().split(/\r?\n/).forEach(l => l.trim() && pushLog(l));
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  child.on("close", code => {
    pushLog(code === 0 ? `✓ ${cmd} finished` : `✗ ${cmd} exited with code ${code}`);
    running = null;
  });
  return true;
}

function getState() {
  const quant = readJson(VS("quant-analysis.json"));
  const rank = readJson(VS("content-rank.json"));
  const profile = readJson(VS("style-profile.json"));
  const index = readJson(VS("index.json"));
  const btc = quant?.BITCOIN && !quant.BITCOIN.error ? {
    price: quant.BITCOIN.currentPrice,
    day: quant.BITCOIN.changes?.day?.pct,
    week: quant.BITCOIN.changes?.week?.pct,
    rsi: quant.BITCOIN.technicals?.rsi14,
    verdict: quant.BITCOIN.verdict,
    regime: quant.BITCOIN.advanced?.regime?.regime,
    regimeNote: quant.BITCOIN.advanced?.regime?.note,
    series: quant.BITCOIN.series || [],
  } : null;
  const indices = ["NIFTY", "BANKNIFTY"].map(k => ({
    key: k,
    spot: quant?.[k]?.underlyingValue,
    verdict: quant?.[k]?.verdict || "NO_DATA",
    hasData: !!quant?.[k]?.hasData,
    pcr: quant?.[k]?.quant?.pcr?.oiPCR,
    ivRank: quant?.[k]?.advanced?.ivRank?.rank,
  }));
  const fx = quant?.FOREX?.pairs?.USDINR;
  return {
    fetchedAt: quant?._meta?.fetchedAt || null,
    btc, indices,
    usdinr: fx ? { price: fx.currentPrice, pct: fx.pctChange } : null,
    events: detectEvents(quant || undefined),
    rank: rank?.results || [],
    styleProfile: profile ? { documents: profile.documents, totalWords: profile.totalWords, burstiness: profile.metrics?.burstiness?.mean } : null,
    indexedChunks: Array.isArray(index) ? index.length : 0,
    running: running ? running.cmd : null,
    drafts: fs.existsSync(path.join(ROOT, "content", "drafts")) ? fs.readdirSync(path.join(ROOT, "content", "drafts")).filter(f => f.endsWith(".mdx")) : [],
    hasSite: fs.existsSync(path.join(ROOT, "out", "index.html")),
  };
}

const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".txt": "text/plain", ".xml": "application/xml", ".woff2": "font/woff2", ".pf_meta": "application/octet-stream", ".pf_index": "application/octet-stream", ".pf_fragment": "application/octet-stream", ".pagefind": "application/octet-stream", ".wasm": "application/wasm" };

function serveStatic(res, urlPath) {
  let rel = urlPath.replace(/^\/site\/?/, "") || "index.html";
  rel = decodeURIComponent(rel).replace(/\.\./g, "");
  let file = path.join(ROOT, "out", rel);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file) && !path.extname(file)) file = file + ".html";
  if (!fs.existsSync(file)) { res.writeHead(404); res.end("Not found — run npm run build first"); return; }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}

const HTML = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Control Room — Gokul's content engine</title>
<style>
:root{--bg:#0e0d0b;--card:#171512;--ink:#e7e5e4;--dim:#a8a29e;--faint:#57534e;--accent:#d97706;--green:#4ade80;--red:#f87171;--hair:rgba(231,229,228,.08)}
*{box-sizing:border-box;margin:0}
body{background:var(--bg);color:var(--ink);font:15px/1.6 ui-sans-serif,system-ui,"Segoe UI",sans-serif;padding:32px 20px;max-width:1100px;margin:0 auto}
h1{font-family:Georgia,serif;font-weight:600;font-size:26px;letter-spacing:-.01em}
h1 .dot{color:var(--accent)}
h2{font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:var(--faint);margin-bottom:12px}
.sub{color:var(--dim);font-size:13px;margin-top:4px}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));margin-top:28px}
.card{background:var(--card);border:1px solid var(--hair);border-radius:14px;padding:20px}
.big{font-size:28px;font-weight:600;font-family:Georgia,serif}
.pos{color:var(--green)}.neg{color:var(--red)}
.badge{display:inline-block;padding:2px 10px;border-radius:99px;font-size:11px;font-weight:600;letter-spacing:.05em}
.badge.BULLISH{background:rgba(74,222,128,.12);color:var(--green)}
.badge.BEARISH{background:rgba(248,113,113,.12);color:var(--red)}
.badge.NEUTRAL,.badge.NO_DATA{background:rgba(168,162,158,.12);color:var(--dim)}
.row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--hair);font-size:14px}
.row:last-child{border:0}
.row .k{color:var(--dim)}
button{background:var(--ink);color:var(--bg);border:0;border-radius:99px;padding:8px 18px;font-weight:600;font-size:13px;cursor:pointer;transition:all .2s}
button:hover{background:var(--accent);color:#fff}
button:disabled{opacity:.35;cursor:default;background:var(--faint)}
.btns{display:flex;flex-wrap:wrap;gap:8px}
#log{background:#0a0908;border:1px solid var(--hair);border-radius:14px;padding:16px;font:12px/1.7 ui-monospace,Consolas,monospace;color:var(--dim);height:260px;overflow-y:auto;white-space:pre-wrap;margin-top:16px}
.bar{height:6px;border-radius:3px;background:var(--hair);overflow:hidden;flex:1;margin-left:12px}
.bar i{display:block;height:100%;background:var(--accent);border-radius:3px}
.rankrow{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--hair);font-size:13px}
.rankrow:last-child{border:0}
.rankrow .score{font-weight:700;width:34px;font-family:Georgia,serif;font-size:16px}
.rankrow .name{flex:2;color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
svg.spark{width:100%;height:48px;margin-top:10px}
.ev{padding:8px 0;border-bottom:1px solid var(--hair);font-size:13px}
.ev:last-child{border:0}
.ev .sev{color:var(--accent);font-weight:700;margin-right:6px}
a{color:var(--accent);text-decoration:none}
.pulse{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--green);margin-right:6px;animation:pu 1.2s infinite}
@keyframes pu{50%{opacity:.3}}
</style></head><body>
<header style="display:flex;justify-content:space-between;align-items:end;flex-wrap:wrap;gap:12px">
  <div><h1>Control Room<span class="dot">.</span></h1><div class="sub" id="meta">loading…</div></div>
  <div class="btns">
    <button onclick="run('quant')">Quant</button>
    <button onclick="run('events')">Events</button>
    <button onclick="run('rank')">Rank</button>
    <button onclick="run('shield')">Shield</button>
    <button onclick="run('distribute')">Distribute</button>
    <button onclick="run('autopilot')" style="background:var(--accent);color:#fff">⚡ Autopilot</button>
  </div>
</header>
<div class="grid">
  <div class="card"><h2>Bitcoin</h2><div id="btc">—</div></div>
  <div class="card"><h2>Indices & FX</h2><div id="idx">—</div></div>
  <div class="card"><h2>Market events</h2><div id="events">—</div></div>
  <div class="card"><h2>Content ranking</h2><div id="rank">—</div></div>
  <div class="card"><h2>System</h2><div id="sys">—</div></div>
  <div class="card"><h2>Console <span id="runstate"></span></h2><div class="sub">live output of the running command</div></div>
</div>
<div id="log">ready.</div>
<script>
const $=id=>document.getElementById(id);
const fmt=(n,d=2)=>n==null?"—":Number(n).toLocaleString(undefined,{maximumFractionDigits:d});
const pct=n=>n==null?"":'<span class="'+(n>=0?"pos":"neg")+'">'+(n>=0?"+":"")+n.toFixed(2)+"%</span>";
function spark(series){
  if(!series||series.length<2)return"";
  const v=series.map(p=>p.c),min=Math.min(...v),max=Math.max(...v),W=300,H=48;
  const pts=v.map((c,i)=>(i/(v.length-1)*W).toFixed(1)+","+(H-4-(c-min)/(max-min||1)*(H-8)).toFixed(1)).join(" ");
  return '<svg class="spark" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none"><polyline points="'+pts+'" fill="none" stroke="#d97706" stroke-width="1.5"/></svg>';
}
async function refresh(){
  const s=await(await fetch("/api/state")).json();
  $("meta").innerHTML=(s.fetchedAt?"data "+new Date(s.fetchedAt).toLocaleString():"no quant data yet")+" · "+s.indexedChunks+" chunks indexed"+(s.hasSite?' · <a href="/site/" target="_blank">view site ↗</a>':"");
  if(s.btc){$("btc").innerHTML='<div class="big">$'+fmt(s.btc.price,0)+' '+pct(s.btc.day)+'</div><div class="sub">7d '+ (s.btc.week==null?"—":(s.btc.week>=0?"+":"")+s.btc.week.toFixed(1)+"%")+' · RSI '+fmt(s.btc.rsi,1)+' · <span class="badge '+s.btc.verdict+'">'+s.btc.verdict+'</span></div>'+spark(s.btc.series)+(s.btc.regime?'<div class="sub" style="margin-top:8px">'+s.btc.regime+" — "+(s.btc.regimeNote||"")+"</div>":"");}
  $("idx").innerHTML=s.indices.map(i=>'<div class="row"><span class="k">'+i.key+'</span><span>'+(i.spot?fmt(i.spot,0):"—")+' <span class="badge '+i.verdict+'">'+(i.hasData?i.verdict:"closed")+'</span>'+(i.ivRank!=null?" IVR "+i.ivRank:"")+'</span></div>').join("")+(s.usdinr?'<div class="row"><span class="k">USD/INR</span><span>'+fmt(s.usdinr.price)+' '+pct(s.usdinr.pct)+'</span></div>':"");
  $("events").innerHTML=s.events.length?s.events.map(e=>'<div class="ev"><span class="sev">'+"!".repeat(e.severity)+'</span>'+e.headline+'</div>').join(""):'<div class="sub">markets are quiet. no forced content.</div>';
  $("rank").innerHTML=s.rank.length?s.rank.map(r=>'<div class="rankrow"><span class="score">'+r.composite+'</span><span class="name">'+r.file.replace(".mdx","")+'</span><span class="bar"><i style="width:'+r.composite+'%"></i></span></div>').join(""):'<div class="sub">run Rank</div>';
  $("sys").innerHTML='<div class="row"><span class="k">LLM provider</span><span>'+(s.provider||"none — template mode")+'</span></div><div class="row"><span class="k">Style baseline</span><span>'+(s.styleProfile?s.styleProfile.documents+" docs / "+fmt(s.styleProfile.totalWords,0)+"w":"not built")+'</span></div><div class="row"><span class="k">Drafts waiting</span><span>'+s.drafts.length+'</span></div>';
  $("runstate").innerHTML=s.running?'<span class="pulse"></span>'+s.running:"";
  document.querySelectorAll("button").forEach(b=>b.disabled=!!s.running);
}
async function poll(){const t=await(await fetch("/api/logs")).text();if($("log").textContent!==t){$("log").textContent=t;$("log").scrollTop=1e9;}}
async function run(cmd){await fetch("/api/run?cmd="+cmd,{method:"POST"});refresh();}
setInterval(poll,1200);setInterval(refresh,4000);refresh();poll();
</script></body></html>`;

let providerName = null;
detectProvider().then(p => { providerName = p ? p.name : null; });

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === "/") { res.writeHead(200, { "Content-Type": "text/html" }); res.end(HTML); return; }
  if (url.pathname === "/api/state") {
    const state = getState();
    state.provider = providerName;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(state));
    return;
  }
  if (url.pathname === "/api/logs") { res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" }); res.end(logBuffer.join("\n")); return; }
  if (url.pathname === "/api/run" && req.method === "POST") {
    const cmd = url.searchParams.get("cmd");
    if (!ALLOWED.has(cmd)) { res.writeHead(400); res.end("unknown command"); return; }
    const started = runCommand(cmd);
    res.writeHead(started ? 200 : 409, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ started, cmd }));
    return;
  }
  if (url.pathname.startsWith("/site")) { serveStatic(res, url.pathname); return; }
  res.writeHead(404); res.end("not found");
});

server.listen(PORT, () => {
  console.log(`\n╔═══════════════════════════════════════════════╗`);
  console.log(`║      CONTROL ROOM                             ║`);
  console.log(`╚═══════════════════════════════════════════════╝\n`);
  console.log(`  Dashboard:  http://localhost:${PORT}`);
  console.log(`  Built site: http://localhost:${PORT}/site/   (after npm run build)\n`);
});
