// Admin Panel — local control room for the whole blog system.
// Zero dependencies, plain Node http, binds to 127.0.0.1 only (it can write
// files and push to git — never expose it to a network).
//
//   node tools/dashboard.mjs      → http://localhost:4000
//
// Tabs: Overview (markets/events/rank) · Posts (manage, promote, generate)
//       Editor (edit + live shield score) · Distribution (playbook) · Console

import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { detectEvents } from "./event-detector.mjs";
import { detectProvider } from "./llm.mjs";

const PORT = process.env.DASHBOARD_PORT || 4000;
const ROOT = process.cwd();
const VS = p => path.join(ROOT, "vector-store", p);
const POSTS = path.join(ROOT, "content", "posts");
const DRAFTS = path.join(ROOT, "content", "drafts");

const ALLOWED = new Set(["quant", "events", "shield", "rank", "distribute", "index", "style", "autopilot", "crawl", "pulse", "generate"]);
let running = null;
let logBuffer = ["ready."];

function readJson(file) { try { return JSON.parse(fs.readFileSync(file, "utf-8")); } catch { return null; } }
function pushLog(line) { logBuffer.push(line); if (logBuffer.length > 600) logBuffer = logBuffer.slice(-450); }
function safeName(name) { return path.basename(String(name || "")).replace(/[^a-zA-Z0-9._-]/g, ""); }
function dirFor(d) { return d === "drafts" ? DRAFTS : POSTS; }

function runCommand(cmd, arg) {
  if (running) return false;
  const args = ["tools/orchestrator.mjs", cmd];
  if (arg) args.push(arg);
  logBuffer = [`$ node ${args.map(a => a.includes(" ") ? `"${a}"` : a).join(" ")}`];
  const child = spawn(process.execPath, args, { cwd: ROOT, env: process.env });
  running = { cmd, startedAt: Date.now() };
  const onData = d => d.toString().split(/\r?\n/).forEach(l => l.trim() && pushLog(l));
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  child.on("close", code => { pushLog(code === 0 ? `✓ ${cmd} finished` : `✗ ${cmd} exited with code ${code}`); running = null; });
  return true;
}

function runDeploy(message) {
  if (running) return false;
  running = { cmd: "deploy", startedAt: Date.now() };
  logBuffer = ["$ git add -A && git commit && git push"];
  const msg = (message || "Update from admin panel").replace(/"/g, "'") +
    "\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>";
  const child = spawn("git", ["add", "-A"], { cwd: ROOT });
  child.on("close", () => {
    const c2 = spawn("git", ["commit", "-m", msg], { cwd: ROOT });
    c2.stdout.on("data", d => pushLog(d.toString().trim()));
    c2.stderr.on("data", d => pushLog(d.toString().trim()));
    c2.on("close", () => {
      const c3 = spawn("git", ["push"], { cwd: ROOT });
      c3.stdout.on("data", d => pushLog(d.toString().trim()));
      c3.stderr.on("data", d => pushLog(d.toString().trim()));
      c3.on("close", code => {
        pushLog(code === 0 ? "✓ pushed — Cloudflare is deploying (~2 min)" : "✗ push failed");
        running = null;
      });
    });
  });
  return true;
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  const fm = {};
  if (m) for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w+):\s*"?(.*?)"?\s*$/);
    if (kv) fm[kv[1]] = kv[2];
  }
  return fm;
}

function listPosts() {
  const rank = readJson(VS("content-rank.json"));
  const scan = (dir, kind) => {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(f => f.endsWith(".mdx")).map(f => {
      const raw = fs.readFileSync(path.join(dir, f), "utf-8");
      const fm = parseFrontmatter(raw);
      const words = raw.replace(/---[\s\S]*?---/, "").split(/\s+/).filter(Boolean).length;
      const r = rank?.results?.find(x => x.file === f);
      return { file: f, kind, title: fm.title || f, date: fm.date || "", words, composite: kind === "posts" ? (r?.composite ?? null) : null };
    });
  };
  return [...scan(POSTS, "posts"), ...scan(DRAFTS, "drafts")].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

async function shieldCheck(body) {
  const { analyzeContent } = await import("./ai-detection-shield.mjs");
  const { loadStyleProfile } = await import("./style-learner.mjs");
  const content = body.replace(/---[\s\S]*?---\n?/, "").trim();
  const a = analyzeContent(content, "editor", loadStyleProfile());
  return { score: a.humanScore, verdict: a.verdict, flags: a.flags.slice(0, 6).map(f => ({ rule: f.rule, deduction: f.deduction, hint: f.hint })) };
}

function getState() {
  const quant = readJson(VS("quant-analysis.json"));
  const rank = readJson(VS("content-rank.json"));
  const profile = readJson(VS("style-profile.json"));
  const index = readJson(VS("index.json"));
  const btc = quant?.BITCOIN && !quant.BITCOIN.error ? {
    price: quant.BITCOIN.currentPrice, day: quant.BITCOIN.changes?.day?.pct, week: quant.BITCOIN.changes?.week?.pct,
    rsi: quant.BITCOIN.technicals?.rsi14, verdict: quant.BITCOIN.verdict,
    regime: quant.BITCOIN.advanced?.regime?.regime, regimeNote: quant.BITCOIN.advanced?.regime?.note,
    series: quant.BITCOIN.series || [],
  } : null;
  return {
    fetchedAt: quant?._meta?.fetchedAt || null,
    btc,
    indices: ["NIFTY", "BANKNIFTY"].map(k => ({ key: k, spot: quant?.[k]?.underlyingValue, verdict: quant?.[k]?.verdict || "NO_DATA", hasData: !!quant?.[k]?.hasData, pcr: quant?.[k]?.quant?.pcr?.oiPCR, ivRank: quant?.[k]?.advanced?.ivRank?.rank })),
    usdinr: quant?.FOREX?.pairs?.USDINR ? { price: quant.FOREX.pairs.USDINR.currentPrice, pct: quant.FOREX.pairs.USDINR.pctChange } : null,
    events: detectEvents(quant || undefined),
    rank: rank?.results || [],
    styleProfile: profile ? { documents: profile.documents, totalWords: profile.totalWords } : null,
    indexedChunks: Array.isArray(index) ? index.length : 0,
    running: running ? running.cmd : null,
    hasSite: fs.existsSync(path.join(ROOT, "out", "index.html")),
  };
}

const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".txt": "text/plain", ".xml": "application/xml", ".woff2": "font/woff2", ".wasm": "application/wasm" };

function serveStatic(res, urlPath) {
  let rel = decodeURIComponent(urlPath.replace(/^\/site\/?/, "") || "index.html").replace(/\.\./g, "");
  let file = path.join(ROOT, "out", rel);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file) && !path.extname(file)) file = file + ".html";
  if (!fs.existsSync(file)) { res.writeHead(404); res.end("Not found — run npm run build first"); return; }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}

function readBody(req) {
  return new Promise(resolve => {
    let data = "";
    req.on("data", c => { data += c; if (data.length > 2e6) req.destroy(); });
    req.on("end", () => { try { resolve(JSON.parse(data || "{}")); } catch { resolve({}); } });
  });
}

const HTML = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Admin — Gokul's blog engine</title>
<style>
:root{--bg:#0a0a0b;--card:#111113;--ink:#e4e4e7;--dim:#a1a1aa;--faint:#52525b;--accent:#34d399;--red:#f87171;--amber:#fbbf24;--hair:rgba(228,228,231,.09)}
*{box-sizing:border-box;margin:0}
body{background:var(--bg);color:var(--ink);font:14px/1.6 ui-sans-serif,system-ui,sans-serif;max-width:1150px;margin:0 auto;padding:24px 20px}
.mono{font-family:ui-monospace,Consolas,monospace}
h1{font:600 20px ui-monospace,monospace}
h1 b{color:var(--accent)}
h2{font:600 11px ui-monospace,monospace;text-transform:lowercase;letter-spacing:.1em;color:var(--faint);margin-bottom:10px}
h2::before{content:"// ";color:var(--accent)}
.tabs{display:flex;gap:4px;margin:18px 0;border-bottom:1px solid var(--hair);flex-wrap:wrap}
.tab{background:none;border:0;color:var(--dim);font:500 13px ui-monospace,monospace;padding:8px 14px;cursor:pointer;border-bottom:2px solid transparent}
.tab.active{color:var(--accent);border-bottom-color:var(--accent)}
.tab:hover{color:var(--ink)}
.panel{display:none}.panel.active{display:block}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(320px,1fr))}
.card{background:var(--card);border:1.5px dashed var(--hair);border-radius:12px;padding:16px}
.big{font:600 26px ui-monospace,monospace}
.pos{color:var(--accent)}.neg{color:var(--red)}
.badge{padding:1px 9px;border-radius:6px;font:600 10px ui-monospace,monospace}
.badge.BULLISH{background:rgba(52,211,153,.12);color:var(--accent)}
.badge.BEARISH{background:rgba(248,113,113,.12);color:var(--red)}
.badge.NEUTRAL,.badge.NO_DATA{background:rgba(161,161,170,.12);color:var(--dim)}
.badge.drafts{background:rgba(251,191,36,.12);color:var(--amber)}
.badge.posts{background:rgba(52,211,153,.12);color:var(--accent)}
.row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--hair);font-size:13px}
.row:last-child{border:0}.row .k{color:var(--dim)}
button,.btn{background:var(--ink);color:var(--bg);border:0;border-radius:8px;padding:7px 14px;font:600 12px ui-monospace,monospace;cursor:pointer;transition:background .15s}
button:hover{background:var(--accent)}
button:disabled{opacity:.3;cursor:default}
button.ghost{background:transparent;color:var(--dim);border:1px solid var(--hair)}
button.ghost:hover{color:var(--accent);border-color:var(--accent);background:transparent}
button.primary{background:var(--accent);color:#052e22}
.btns{display:flex;flex-wrap:wrap;gap:6px}
input,textarea{background:#0d0d0f;border:1px solid var(--hair);border-radius:8px;color:var(--ink);font:13px ui-monospace,monospace;padding:9px 12px;width:100%}
textarea{min-height:480px;line-height:1.7;resize:vertical}
input:focus,textarea:focus{outline:none;border-color:var(--accent)}
#log{background:#080809;border:1px solid var(--hair);border-radius:12px;padding:14px;font:12px/1.7 ui-monospace,monospace;color:var(--dim);height:300px;overflow-y:auto;white-space:pre-wrap}
.bar{height:5px;border-radius:3px;background:var(--hair);overflow:hidden;flex:1;margin-left:10px}
.bar i{display:block;height:100%;background:var(--accent)}
table{width:100%;border-collapse:collapse;font-size:13px}
td,th{padding:8px 6px;text-align:left;border-bottom:1px solid var(--hair)}
th{font:600 10px ui-monospace,monospace;color:var(--faint);text-transform:lowercase;letter-spacing:.08em}
td .title{cursor:pointer;color:var(--ink);font-weight:500}
td .title:hover{color:var(--accent)}
.score{font:700 14px ui-monospace,monospace}
svg.spark{width:100%;height:44px;margin-top:8px}
.ev{padding:7px 0;border-bottom:1px solid var(--hair);font-size:13px}
.ev:last-child{border:0}
.ev .sev{color:var(--accent);font-weight:700;margin-right:6px}
.pulse{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--accent);margin-right:6px;animation:pu 1.2s infinite}
@keyframes pu{50%{opacity:.25}}
.hint{font:11px ui-monospace,monospace;color:var(--faint);margin-top:6px}
a{color:var(--accent);text-decoration:none}
#shieldbox{margin-top:10px;font:12px ui-monospace,monospace}
.flagline{color:var(--dim);padding:2px 0}
#md{background:var(--card);border:1.5px dashed var(--hair);border-radius:12px;padding:20px;font-size:13px;line-height:1.7;white-space:pre-wrap;font-family:ui-monospace,monospace;color:var(--dim);max-height:70vh;overflow-y:auto}
</style></head><body>
<header style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
  <h1><b>~/</b>gokul admin<b>_</b></h1>
  <div class="btns">
    <span id="runstate" class="mono" style="font-size:12px;color:var(--dim);align-self:center"></span>
    <button class="primary" onclick="deploy()">⇪ deploy</button>
  </div>
</header>
<nav class="tabs">
  <button class="tab active" data-t="overview" onclick="tab('overview')">overview</button>
  <button class="tab" data-t="posts" onclick="tab('posts')">posts</button>
  <button class="tab" data-t="editor" onclick="tab('editor')">editor</button>
  <button class="tab" data-t="dist" onclick="tab('dist')">distribution</button>
  <button class="tab" data-t="console" onclick="tab('console')">console</button>
</nav>

<div class="panel active" id="p-overview">
  <div class="btns" style="margin-bottom:14px">
    <button class="ghost" onclick="run('quant')">quant</button>
    <button class="ghost" onclick="run('rank')">rank</button>
    <button class="ghost" onclick="run('shield')">shield</button>
    <button class="ghost" onclick="run('index')">reindex rag</button>
    <button class="ghost" onclick="run('autopilot')">⚡ autopilot</button>
  </div>
  <div class="grid">
    <div class="card"><h2>bitcoin</h2><div id="btc">—</div></div>
    <div class="card"><h2>indices & fx</h2><div id="idx">—</div></div>
    <div class="card"><h2>market events</h2><div id="events">—</div></div>
    <div class="card"><h2>content ranking</h2><div id="rank">—</div></div>
    <div class="card"><h2>system</h2><div id="sys">—</div></div>
  </div>
</div>

<div class="panel" id="p-posts">
  <div class="card" style="margin-bottom:14px">
    <h2>generate a draft (free, local llm)</h2>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <input id="topic" placeholder="topic, e.g. why cod is still king for indian small sellers" style="flex:1;min-width:260px">
      <button onclick="gen()">generate →</button>
    </div>
    <p class="hint">draft lands in content/drafts. review it, then promote. watch progress in console.</p>
  </div>
  <div class="card">
    <h2>all posts & drafts</h2>
    <table id="posttable"><thead><tr><th>title</th><th>kind</th><th>date</th><th>words</th><th>rank</th><th>actions</th></tr></thead><tbody></tbody></table>
  </div>
</div>

<div class="panel" id="p-editor">
  <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;align-items:center">
    <span class="mono" id="editing" style="color:var(--dim);font-size:12px">no file open — pick one from the posts tab</span>
    <span style="flex:1"></span>
    <button class="ghost" onclick="checkShield()">shield check</button>
    <button onclick="savePost()">save</button>
  </div>
  <textarea id="editor" spellcheck="false" placeholder="open a post from the posts tab..."></textarea>
  <div id="shieldbox"></div>
</div>

<div class="panel" id="p-dist">
  <div class="btns" style="margin-bottom:12px"><button class="ghost" onclick="run('distribute')">regenerate playbook</button></div>
  <div id="md">loading...</div>
</div>

<div class="panel" id="p-console">
  <div id="log">ready.</div>
</div>

<script>
// all API calls carry the CSRF header the server requires on POST
const _fetch=window.fetch;window.fetch=(u,o={})=>_fetch(u,{...o,headers:{...(o.headers||{}),"x-admin":"1"}});
const $=id=>document.getElementById(id);
let cur={dir:null,file:null};
const fmt=(n,d=2)=>n==null?"—":Number(n).toLocaleString(undefined,{maximumFractionDigits:d});
const pct=n=>n==null?"":'<span class="'+(n>=0?"pos":"neg")+'">'+(n>=0?"+":"")+n.toFixed(2)+"%</span>";
function tab(t){document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.t===t));document.querySelectorAll(".panel").forEach(p=>p.classList.toggle("active",p.id==="p-"+t));if(t==="dist")loadPlaybook();if(t==="posts")loadPosts();}
function spark(s){if(!s||s.length<2)return"";const v=s.map(p=>p.c),min=Math.min(...v),max=Math.max(...v),W=300,H=44;const pts=v.map((c,i)=>(i/(v.length-1)*W).toFixed(1)+","+(H-4-(c-min)/(max-min||1)*(H-8)).toFixed(1)).join(" ");return '<svg class="spark" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none"><polyline points="'+pts+'" fill="none" stroke="#34d399" stroke-width="1.5"/></svg>';}
async function refresh(){
  const s=await(await fetch("/api/state")).json();
  if(s.btc)$("btc").innerHTML='<div class="big">$'+fmt(s.btc.price,0)+' '+pct(s.btc.day)+'</div><div style="font-size:12px;color:var(--dim)">rsi '+fmt(s.btc.rsi,1)+' · <span class="badge '+s.btc.verdict+'">'+s.btc.verdict+'</span> · '+(s.btc.regime||"")+'</div>'+spark(s.btc.series);
  $("idx").innerHTML=s.indices.map(i=>'<div class="row"><span class="k">'+i.key+'</span><span>'+(i.spot?fmt(i.spot,0):"—")+' <span class="badge '+i.verdict+'">'+(i.hasData?i.verdict:"closed")+'</span></span></div>').join("")+(s.usdinr?'<div class="row"><span class="k">USD/INR</span><span>'+fmt(s.usdinr.price)+' '+pct(s.usdinr.pct)+'</span></div>':"");
  $("events").innerHTML=s.events.length?s.events.map(e=>'<div class="ev"><span class="sev">'+"!".repeat(e.severity)+'</span>'+e.headline+'</div>').join(""):'<div style="color:var(--faint);font-size:12px">markets are quiet. no forced content.</div>';
  $("rank").innerHTML=s.rank.length?s.rank.map(r=>'<div style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:12px"><span class="score">'+r.composite+'</span><span style="flex:2;color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+r.file.replace(".mdx","")+'</span><span class="bar"><i style="width:'+r.composite+'%"></i></span></div>').join(""):'<div style="color:var(--faint)">run rank</div>';
  $("sys").innerHTML='<div class="row"><span class="k">llm</span><span>'+(s.provider||"detecting…")+'</span></div><div class="row"><span class="k">rag chunks</span><span>'+s.indexedChunks+'</span></div><div class="row"><span class="k">style corpus</span><span>'+(s.styleProfile?s.styleProfile.documents+" docs":"—")+'</span></div><div class="row"><span class="k">built site</span><span>'+(s.hasSite?'<a href="/site/" target="_blank">open ↗</a>':"not built")+'</span></div>';
  $("runstate").innerHTML=s.running?'<span class="pulse"></span>'+s.running+" running":"";
  document.querySelectorAll("button").forEach(b=>{if(!b.classList.contains("tab"))b.disabled=!!s.running;});
}
async function loadPosts(){
  const list=await(await fetch("/api/posts")).json();
  $("posttable").querySelector("tbody").innerHTML=list.map(p=>'<tr><td><span class="title" onclick="openPost(\\''+p.kind+'\\',\\''+p.file+'\\')">'+p.title+'</span></td><td><span class="badge '+p.kind+'">'+p.kind+'</span></td><td class="mono" style="color:var(--dim)">'+(p.date||"—")+'</td><td class="mono" style="color:var(--dim)">'+p.words+'</td><td class="score">'+(p.composite??"—")+'</td><td class="btns">'+(p.kind==="drafts"?'<button class="ghost" onclick="promote(\\''+p.file+'\\')">promote ↑</button>':"")+'<button class="ghost" onclick="openPost(\\''+p.kind+'\\',\\''+p.file+'\\')">edit</button></td></tr>').join("");
}
async function openPost(dir,file){
  const d=await(await fetch("/api/post?dir="+dir+"&file="+encodeURIComponent(file))).json();
  cur={dir,file};$("editor").value=d.content;$("editing").textContent="editing: content/"+dir+"/"+file;$("shieldbox").innerHTML="";tab("editor");
}
async function savePost(){
  if(!cur.file)return alert("open a file first");
  const r=await(await fetch("/api/post/save",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({dir:cur.dir,file:cur.file,content:$("editor").value})})).json();
  showShield(r.shield,"saved ✓ ");
}
async function checkShield(){
  if(!$("editor").value)return;
  const r=await(await fetch("/api/shield-check",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({content:$("editor").value})})).json();
  showShield(r,"");
}
function showShield(s,prefix){
  if(!s)return;
  $("shieldbox").innerHTML='<span style="color:'+(s.score>=85?"var(--accent)":s.score>=70?"var(--amber)":"var(--red)")+'">'+prefix+'shield '+s.score+'/100</span> — '+s.verdict+(s.flags||[]).map(f=>'<div class="flagline">− '+f.deduction+' '+f.rule+' → '+f.hint+'</div>').join("");
}
async function promote(file){
  if(!confirm("promote "+file+" to published posts?"))return;
  await fetch("/api/post/promote",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({file})});
  loadPosts();
}
async function gen(){
  const t=$("topic").value.trim();if(!t)return;
  await fetch("/api/run?cmd=generate&arg="+encodeURIComponent(t),{method:"POST"});
  tab("console");refresh();
}
async function deploy(){
  const m=prompt("commit message:","update content");
  if(m===null)return;
  await fetch("/api/deploy",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({message:m})});
  tab("console");refresh();
}
async function loadPlaybook(){
  $("md").textContent=await(await fetch("/api/playbook")).text();
}
async function run(cmd){await fetch("/api/run?cmd="+cmd,{method:"POST"});if(cmd!=="rank")tab("console");refresh();}
async function poll(){const t=await(await fetch("/api/logs")).text();if($("log").textContent!==t){$("log").textContent=t;$("log").scrollTop=1e9;}}
setInterval(poll,1200);setInterval(refresh,4000);refresh();poll();loadPosts();
</script></body></html>`;

let providerName = null;
detectProvider().then(p => { providerName = p ? p.name : null; });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const json = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };

  // CSRF guard: mutating requests must carry the x-admin header, which
  // browsers only attach from same-origin scripts (cross-origin attempts
  // trigger a CORS preflight we never answer).
  if (req.method === "POST" && req.headers["x-admin"] !== "1") {
    return json(403, { error: "forbidden" });
  }

  if (url.pathname === "/") { res.writeHead(200, { "Content-Type": "text/html" }); res.end(HTML); return; }
  if (url.pathname === "/api/state") { const s = getState(); s.provider = providerName; return json(200, s); }
  if (url.pathname === "/api/logs") { res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" }); res.end(logBuffer.join("\n")); return; }
  if (url.pathname === "/api/posts") return json(200, listPosts());

  if (url.pathname === "/api/post") {
    const file = safeName(url.searchParams.get("file"));
    const dir = dirFor(url.searchParams.get("dir"));
    const p = path.join(dir, file);
    if (!file.endsWith(".mdx") || !fs.existsSync(p)) return json(404, { error: "not found" });
    return json(200, { content: fs.readFileSync(p, "utf-8") });
  }

  if (url.pathname === "/api/post/save" && req.method === "POST") {
    const b = await readBody(req);
    const file = safeName(b.file);
    const dir = dirFor(b.dir);
    if (!file.endsWith(".mdx") || typeof b.content !== "string") return json(400, { error: "bad request" });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, file), b.content);
    pushLog(`✓ saved content/${b.dir === "drafts" ? "drafts" : "posts"}/${file}`);
    return json(200, { ok: true, shield: await shieldCheck(b.content) });
  }

  if (url.pathname === "/api/shield-check" && req.method === "POST") {
    const b = await readBody(req);
    return json(200, await shieldCheck(String(b.content || "")));
  }

  if (url.pathname === "/api/post/promote" && req.method === "POST") {
    const b = await readBody(req);
    const file = safeName(b.file);
    const src = path.join(DRAFTS, file);
    if (!file.endsWith(".mdx") || !fs.existsSync(src)) return json(404, { error: "not found" });
    fs.mkdirSync(POSTS, { recursive: true });
    fs.renameSync(src, path.join(POSTS, file));
    pushLog(`✓ promoted ${file} → content/posts/ (hit deploy to publish)`);
    return json(200, { ok: true });
  }

  if (url.pathname === "/api/run" && req.method === "POST") {
    const cmd = url.searchParams.get("cmd");
    const arg = url.searchParams.get("arg") || undefined;
    if (!ALLOWED.has(cmd)) return json(400, { error: "unknown command" });
    return json(runCommand(cmd, arg) ? 200 : 409, { started: !running || running.cmd === cmd, cmd });
  }

  if (url.pathname === "/api/deploy" && req.method === "POST") {
    const b = await readBody(req);
    return json(runDeploy(b.message) ? 200 : 409, { started: true });
  }

  if (url.pathname === "/api/playbook") {
    const p = path.join(ROOT, "distribution", "PLAYBOOK.md");
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : "No playbook yet — click 'regenerate playbook'.");
    return;
  }

  if (url.pathname.startsWith("/site")) return serveStatic(res, url.pathname);
  res.writeHead(404); res.end("not found");
});

// 127.0.0.1 only — this panel writes files and pushes to git
server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n╔═══════════════════════════════════════════════╗`);
  console.log(`║      ADMIN PANEL                              ║`);
  console.log(`╚═══════════════════════════════════════════════╝\n`);
  console.log(`  Admin:      http://localhost:${PORT}`);
  console.log(`  Built site: http://localhost:${PORT}/site/\n`);
  console.log(`  Bound to 127.0.0.1 only (writes files + pushes git).\n`);
});
