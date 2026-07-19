// Content Calendar — plans 3 months of posts and works through them.
//
//   node tools/content-calendar.mjs plan          → build/refresh the calendar
//   node tools/content-calendar.mjs               → show status
//   node tools/content-calendar.mjs due           → generate drafts for due posts
//
// Planning uses the active LLM provider (omniroute/ollama/groq/…) to propose
// topics across the content pillars, falling back to a curated list if no
// provider is up. Cadence: 2 posts/week (Mon & Thu) for 13 weeks = 26 posts.
// Publishing is always manual: `due` writes DRAFTS, you review and promote.

import * as fs from "fs";
import * as path from "path";
import { detectProvider } from "./llm.mjs";

const CALENDAR = path.join(process.cwd(), "content", "calendar.json");
const CALENDAR_MD = path.join(process.cwd(), "content", "CALENDAR.md");

const PILLARS = [
  { key: "ai-tools", share: 8, desc: "new AI models and tools, hands-on reviews, local LLMs, comparisons with real benchmarks" },
  { key: "ai-automation", share: 5, desc: "practical AI automation for small businesses and creators, workflows, agents" },
  { key: "digital-marketing", share: 5, desc: "SEO, content distribution, social growth for small sellers, what actually works with real numbers" },
  { key: "tech-news", share: 4, desc: "commentary on major tech/AI news through an indie builder's lens" },
  { key: "building-in-public", share: 4, desc: "makeforme journey: seller counts, revenue, failures, lessons" },
];

// Fallback topics if no LLM provider is reachable — curated, pillar-tagged
const CURATED = [
  ["ai-tools", "i benchmarked every local llm on my laptop for blog writing, here are the scores"],
  ["ai-tools", "ollama vs free api tiers, what actually costs zero for indie builders"],
  ["ai-tools", "i replaced three paid saas tools with open source ai this month"],
  ["ai-tools", "what running a rag pipeline at home taught me about ai search"],
  ["ai-tools", "small language models are good enough now, i tested where the line is"],
  ["ai-tools", "the ai detection arms race, what my own detector taught me"],
  ["ai-tools", "claude vs gemini vs llama for writing that doesn't sound like ai"],
  ["ai-tools", "how i use embeddings to find what to write next"],
  ["ai-automation", "i automated my blog's entire research pipeline with free tools"],
  ["ai-automation", "ai agents for small business owners, what's real and what's demo-ware"],
  ["ai-automation", "how a solo founder automates content without losing their voice"],
  ["ai-automation", "my market data pipeline runs every morning for zero rupees"],
  ["ai-automation", "automating instagram order management, what small sellers actually need"],
  ["digital-marketing", "i spent 1978 rupees on ads and learned distribution the hard way"],
  ["digital-marketing", "backlinks for a brand new blog, my free playbook and what it earned"],
  ["digital-marketing", "seo for a workers dev subdomain, ranking without a real domain"],
  ["digital-marketing", "why word of mouth beat paid ads for my 13 sellers, with math"],
  ["digital-marketing", "llms txt and the new seo, optimizing for ai search engines"],
  ["tech-news", "what the latest ai model releases mean for indie builders in india"],
  ["tech-news", "upi, ondc and the india stack pieces nobody writes about"],
  ["tech-news", "the real cost of the ai subscription stack for a bootstrapped founder"],
  ["tech-news", "cloudflare workers vs vercel vs pages for zero budget builders"],
  ["building-in-public", "month three of makeforme, every number and every mistake"],
  ["building-in-public", "the brownie test, how one seller changed my product roadmap"],
  ["building-in-public", "13 sellers taught me more than 13 startup books"],
  ["building-in-public", "what i'd tell myself before writing the first line of makeforme"],
];

function nextDates(count, startDate = new Date()) {
  // Mon(1) & Thu(4), starting from the next occurrence
  const dates = [];
  const d = new Date(startDate);
  while (dates.length < count) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 1 || d.getDay() === 4) dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

async function proposeTopics() {
  const provider = await detectProvider();
  if (!provider) {
    console.log("No LLM provider — using curated topic list.");
    return CURATED.map(([pillar, topic]) => ({ pillar, topic }));
  }
  console.log(`Planning with ${provider.name}...`);
  const prompt = `Propose 26 blog post topics for an indie founder's blog. He builds makeforme.in (store builder for Indian small sellers, ₹99/month, 13 sellers so far), runs his own AI content pipeline with local LLMs, and writes honestly with real numbers.

Distribute across pillars (count each):
${PILLARS.map(p => `- ${p.key} (${p.share}): ${p.desc}`).join("\n")}

Rules: lowercase titles, specific and opinionated, first-person angle, no buzzwords, no colons-with-hype. Each must be writable from his real experience or public information (no fabricated data).

Output exactly 26 lines, format: pillar-key | topic
No other text.`;
  try {
    const raw = await provider.generate([{ role: "user", content: prompt }], "You plan content calendars for technical founders. Output only the requested lines.");
    const topics = raw.split("\n")
      .map(l => l.match(/^\s*([a-z-]+)\s*\|\s*(.{10,})\s*$/))
      .filter(Boolean)
      .map(m => ({ pillar: m[1], topic: m[2].trim().toLowerCase() }))
      .filter(t => PILLARS.some(p => p.key === t.pillar));
    if (topics.length >= 15) return topics.slice(0, 26);
    console.log(`Provider returned only ${topics.length} usable topics — topping up from curated list.`);
    return [...topics, ...CURATED.map(([pillar, topic]) => ({ pillar, topic }))].slice(0, 26);
  } catch (err) {
    console.log(`Provider failed (${err.message}) — using curated list.`);
    return CURATED.map(([pillar, topic]) => ({ pillar, topic }));
  }
}

export function loadCalendar() {
  try { return JSON.parse(fs.readFileSync(CALENDAR, "utf-8")); } catch { return null; }
}

function writeMarkdown(cal) {
  const lines = [`# Content Calendar — ${cal.plannedAt.slice(0, 10)} to ${cal.entries[cal.entries.length - 1].date}`, ""];
  lines.push(`| date | pillar | topic | status |`);
  lines.push(`|------|--------|-------|--------|`);
  for (const e of cal.entries) lines.push(`| ${e.date} | ${e.pillar} | ${e.topic} | ${e.status} |`);
  lines.push("", "Statuses: planned → drafted (in content/drafts) → published (you promoted + pushed).");
  fs.writeFileSync(CALENDAR_MD, lines.join("\n"));
}

export async function plan() {
  const existing = loadCalendar();
  if (existing?.entries?.some(e => e.status !== "planned")) {
    console.log("Calendar has in-progress entries — keeping them, replanning only 'planned' slots.");
  }
  const topics = await proposeTopics();
  const keep = existing?.entries?.filter(e => e.status !== "planned") || [];
  const keepTopics = new Set(keep.map(e => e.topic));
  const fresh = topics.filter(t => !keepTopics.has(t.topic)).slice(0, 26 - keep.length);
  const dates = nextDates(fresh.length);
  const entries = [
    ...keep,
    ...fresh.map((t, i) => ({ ...t, date: dates[i], status: "planned" })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const cal = { plannedAt: new Date().toISOString(), cadence: "Mon & Thu", entries };
  fs.writeFileSync(CALENDAR, JSON.stringify(cal, null, 2));
  writeMarkdown(cal);
  console.log(`\n✓ Calendar: ${entries.length} posts, ${entries[0].date} → ${entries[entries.length - 1].date}`);
  console.log(`  content/calendar.json + content/CALENDAR.md`);
  const byPillar = {};
  for (const e of entries) byPillar[e.pillar] = (byPillar[e.pillar] || 0) + 1;
  console.log(`  Mix: ${Object.entries(byPillar).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  return cal;
}

export async function generateDue() {
  const cal = loadCalendar();
  if (!cal) { console.log("No calendar. Run: node tools/content-calendar.mjs plan"); return; }
  const today = new Date().toISOString().slice(0, 10);
  const due = cal.entries.filter(e => e.status === "planned" && e.date <= today);
  if (due.length === 0) {
    const next = cal.entries.find(e => e.status === "planned");
    console.log(`Nothing due. Next up: "${next?.topic}" on ${next?.date}.`);
    return;
  }
  console.log(`${due.length} post(s) due:\n`);
  const { generatePost } = await import("./generate-blog.mjs");
  for (const entry of due) {
    console.log(`▸ [${entry.date}] ${entry.topic}`);
    try {
      const result = await generatePost(entry.topic, { publish: false });
      entry.status = "drafted";
      entry.draft = path.basename(result.path);
    } catch (err) {
      console.log(`  ✗ ${err.message}`);
    }
  }
  fs.writeFileSync(CALENDAR, JSON.stringify(cal, null, 2));
  writeMarkdown(cal);
  console.log(`\n✓ Drafts in content/drafts — review in the admin panel, promote, then commit & push yourself.`);
}

export function status() {
  const cal = loadCalendar();
  if (!cal) { console.log("No calendar yet. Run: node tools/content-calendar.mjs plan"); return; }
  const today = new Date().toISOString().slice(0, 10);
  const counts = { planned: 0, drafted: 0, published: 0 };
  for (const e of cal.entries) counts[e.status] = (counts[e.status] || 0) + 1;
  console.log(`\nCalendar: ${cal.entries.length} posts (${cal.cadence}) | planned ${counts.planned} · drafted ${counts.drafted} · published ${counts.published}\n`);
  for (const e of cal.entries.slice(0, 30)) {
    const mark = e.status === "published" ? "✓" : e.status === "drafted" ? "◐" : e.date <= today ? "!" : "·";
    console.log(`  ${mark} ${e.date}  [${e.pillar}] ${e.topic}${e.draft ? ` → ${e.draft}` : ""}`);
  }
  console.log(`\n  ! = due now (run 'due')  ◐ = drafted  · = scheduled`);
}

const isMain = process.argv[1]?.includes("content-calendar");
if (isMain) {
  const cmd = process.argv[2];
  console.log(`\n╔═══════════════════════════════════════════════╗`);
  console.log(`║      CONTENT CALENDAR — 3-month pipeline      ║`);
  console.log(`╚═══════════════════════════════════════════════╝`);
  if (cmd === "plan") await plan();
  else if (cmd === "due") await generateDue();
  else status();
}
