// Blog Generator v2 — semantic RAG + Claude API + style targets + critique-revise loop.
//
// Pipeline: retrieve context (MiniLM hybrid search) → build prompt with Gokul's
// voice guide + human-baseline style targets + live quant data (market topics)
// → Claude drafts → shield v3 + 5-algorithm rank critique the draft → flags fed
// back for revision (up to 2 rounds) → best draft wins.
//
// Usage: node tools/generate-blog.mjs "topic"              (draft → content/drafts/)
//        node tools/generate-blog.mjs "topic" --publish    (straight to content/posts/)
// LLM drafting uses the first available FREE provider (Ollama local → Groq →
// Gemini → OpenRouter; see tools/llm.mjs). With no provider it writes a
// research template with retrieved context so you can write the post yourself.

import * as fs from "fs";
import * as path from "path";
import { retrieve } from "./query-rag.mjs";
import { loadStyleProfile } from "./style-learner.mjs";
import { analyzeContent } from "./ai-detection-shield.mjs";
import { rankContent } from "./content-rank.mjs";
import { detectProvider } from "./llm.mjs";

const POSTS_DIR = path.join(process.cwd(), "content", "posts");
const DRAFTS_DIR = path.join(process.cwd(), "content", "drafts");
const QUANT_FILE = path.join(process.cwd(), "vector-store", "quant-analysis.json");

const MAX_REVISIONS = 2;

const VOICE_GUIDE = `You are ghostwriting for Gokul, founder of makeforme.in (an online store builder for Indian small sellers, ₹99/month). This is HIS personal blog, written in first person.

Voice rules (non-negotiable):
- Direct, honest, builder-not-marketer. Shares real numbers: user counts, ₹ amounts, timelines, failures.
- Short paragraphs, often 1-2 sentences. Occasional fragments. Occasional lowercase casual lines.
- Contractions always: don't, it's, i'm.
- NEVER use: em dashes, en dashes, buzzwords (seamlessly, leverage, streamline, game-changer, robust, empower, ecosystem), bullet-point lists in the body, "In conclusion", "Moreover", "Furthermore".
- Never sound like a press release. No extraordinary claims without data.
- NEVER invent statistics, percentages, amounts, or "our data" claims. Only use numbers that appear in the research context or in Gokul's known facts (13 sellers, ₹99/month, 2-month-old product). If you need a number you don't have, write [FILL: what number] instead.
- Origin story if relevant: built makeforme because a friend kept losing handmade jewellery orders in Instagram DMs.`;

function styleTargets(profile) {
  if (!profile?.metrics) return "";
  const m = profile.metrics;
  return `
Statistical style targets (learned from ${profile.documents} human-written essays; your draft is machine-checked against these):
- Sentence length variety (burstiness/CV): at least ${m.burstiness.mean.toFixed(2)}. Mix 3-word sentences with 30-word ones.
- Opening-word variety: ${(m.openerEntropy.mean * 100).toFixed(0)}%+ of sentences should start with different words.
- Contractions: roughly ${m.contractionRate.mean.toFixed(1)} per 100 words.
- Some paragraphs must be a single sentence. At least one sentence fragment.
- Specific numbers and proper nouns throughout. Generic vocabulary gets flagged.`;
}

function loadQuantContext(topic) {
  const t = topic.toLowerCase();
  if (!/market|nifty|bank|bitcoin|btc|stock|forex|rupee|trading|invest/.test(t)) return "";
  try {
    const q = JSON.parse(fs.readFileSync(QUANT_FILE, "utf-8"));
    const parts = [];
    if (q.BITCOIN && !q.BITCOIN.error) {
      const b = q.BITCOIN;
      parts.push(`Bitcoin: $${b.currentPrice} (24h ${b.changes.day.pct.toFixed(1)}%, 7d ${b.changes.week.pct.toFixed(1)}%), RSI ${b.technicals.rsi14}, support $${b.technicals.support}, resistance $${b.technicals.resistance}, verdict ${b.verdict}`);
    }
    for (const key of ["NIFTY", "BANKNIFTY"]) {
      const n = q[key];
      if (n?.hasData) parts.push(`${key}: spot ${n.underlyingValue}, PCR ${n.quant?.pcr?.oiPCR?.toFixed(2)}, max pain ${n.quant?.maxPain?.maxPainStrike}, verdict ${n.verdict}`);
    }
    if (q.FOREX?.pairs?.USDINR) parts.push(`USD/INR: ${q.FOREX.pairs.USDINR.currentPrice.toFixed(2)} (${q.FOREX.pairs.USDINR.pctChange.toFixed(2)}% today)`);
    return parts.length ? `\nLive market data (as of ${q._meta?.fetchedAt?.slice(0, 16)}, cite these real numbers):\n${parts.map(p => "- " + p).join("\n")}` : "";
  } catch { return ""; }
}

function makeSlug(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80);
}

function parseDraft(raw, topic) {
  // Expect frontmatter; synthesize if the model skipped it
  if (raw.trim().startsWith("---")) return raw.trim();
  const title = raw.match(/^#\s+(.+)$/m)?.[1] || topic;
  const body = raw.replace(/^#\s+.+$/m, "").trim();
  return `---\ntitle: "${title.replace(/"/g, "'")}"\ndescription: "${body.split(/\s+/).slice(0, 20).join(" ").replace(/"/g, "'")}"\ndate: "${new Date().toISOString().slice(0, 10)}"\ntags: ["startup"]\npublished: true\n---\n\n${body}`;
}

function critiqueSummary(analysis, rank) {
  const lines = [];
  for (const f of analysis.flags.filter(f => f.deduction >= 3)) {
    lines.push(`- ${f.rule}: ${f.matches.map(m => m.match).join("; ")} → ${f.hint}`);
  }
  const a = rank.algorithms;
  if (a.density.score < 60) lines.push(`- Information density ${a.density.score}/100: ${a.density.detail}. Add real numbers, names, specifics.`);
  if (a.coherence.score < 55) lines.push(`- Flow ${a.coherence.score}/100: ${a.coherence.detail}. Tighten paragraph-to-paragraph connection to the topic.`);
  if (a.hookSeo.score < 70) lines.push(`- Hook/SEO ${a.hookSeo.score}/100: ${a.hookSeo.detail}`);
  return lines.join("\n");
}

export async function generatePost(topic, { publish = false } = {}) {
  const profile = loadStyleProfile();
  console.log(`Topic: ${topic}\n`);

  console.log("Retrieving context (semantic hybrid search)...");
  const results = await retrieve(topic, 8);
  const context = results.map(r => `[${r.source}]\n${r.text}`).join("\n\n");
  console.log(`  ${results.length} chunks retrieved`);
  const quantContext = loadQuantContext(topic);
  if (quantContext) console.log("  + live quant data attached");

  const outDir = publish ? POSTS_DIR : DRAFTS_DIR;
  fs.mkdirSync(outDir, { recursive: true });

  const provider = await detectProvider();
  if (!provider) {
    console.log("\n⚠ No LLM provider found (free options: Ollama local, GROQ_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY).");
    console.log("  Writing research template instead of LLM draft.");
    const slug = makeSlug(topic);
    const template = `---\ntitle: "${topic}"\ndescription: ""\ndate: "${new Date().toISOString().slice(0, 10)}"\ntags: ["startup"]\npublished: false\n---\n\n<!-- RESEARCH CONTEXT (semantic retrieval):\n${context.slice(0, 3000)}\n${quantContext}\n-->\n\nWrite the post here. Run: node tools/ai-detection-shield.mjs content/drafts/${slug}.mdx\n`;
    const outPath = path.join(outDir, `${slug}.mdx`);
    fs.writeFileSync(outPath, template);
    console.log(`Template: ${path.relative(process.cwd(), outPath)}`);
    return { path: outPath, mode: "template" };
  }

  const system = VOICE_GUIDE + "\n" + styleTargets(profile);
  const userPrompt = `Write a blog post for Gokul's blog on: "${topic}"

Research context from crawled sources (use the concrete facts, never copy sentences):
${context.slice(0, 6000)}
${quantContext}

Output the complete MDX file: frontmatter (title, description 60-160 chars, date "${new Date().toISOString().slice(0, 10)}", tags array, published: true) then the body. 700-1200 words. No bullet lists, no em dashes.`;

  const messages = [{ role: "user", content: userPrompt }];
  let best = null;

  for (let round = 0; round <= MAX_REVISIONS; round++) {
    console.log(round === 0 ? `\nDrafting with ${provider.name}...` : `Revising (round ${round})...`);
    const raw = await provider.generate(messages, system);
    const mdx = parseDraft(raw, topic);
    const body = mdx.replace(/---[\s\S]*?---\n?/, "").trim();
    const fm = Object.fromEntries([...mdx.matchAll(/^(title|description):\s*"?(.+?)"?\s*$/gm)].map(m => [m[1], m[2]]));

    const analysis = analyzeContent(body, "draft", profile);
    const rank = await rankContent(body, { title: fm.title, description: fm.description, tags: ["x", "y"] }, profile);
    console.log(`  Shield: ${analysis.humanScore}/100 | Composite: ${rank.composite}/100 (H${rank.algorithms.humanness.score} C${rank.algorithms.coherence.score} R${rank.algorithms.rhythm.score} D${rank.algorithms.density.score} S${rank.algorithms.hookSeo.score})`);

    if (!best || rank.composite > best.rank.composite) best = { mdx, analysis, rank };
    if (analysis.humanScore >= 85 && rank.composite >= 78) break;
    if (round < MAX_REVISIONS) {
      messages.push({ role: "assistant", content: raw });
      messages.push({ role: "user", content: `Machine critique of your draft (detectors would flag these). Rewrite the FULL post fixing every point. Keep the voice, keep the facts:\n${critiqueSummary(analysis, rank)}` });
    }
  }

  // Fabrication check: numbers in the draft that never appeared in any source
  const KNOWN = new Set(["13", "99", "7", "4", "2026"]);
  const sourceNums = new Set((context + quantContext + topic).match(/\d[\d,.]*/g) || []);
  const draftNums = [...new Set(best.mdx.match(/\d[\d,.]*%?/g) || [])]
    .filter(n => !sourceNums.has(n.replace("%", "")) && !KNOWN.has(n.replace("%", "")) && !/^\d{4}-/.test(n));
  if (draftNums.length > 0) {
    console.log(`\n⚠ FABRICATION CHECK — numbers not found in any source (verify or replace before publishing):`);
    console.log(`  ${draftNums.slice(0, 12).join(", ")}`);
  }

  const title = best.mdx.match(/^title:\s*"?(.+?)"?\s*$/m)?.[1] || topic;
  const slug = makeSlug(title);
  const outPath = path.join(outDir, `${slug}.mdx`);
  fs.writeFileSync(outPath, best.mdx);
  console.log(`\n✓ ${publish ? "Published" : "Draft"}: ${path.relative(process.cwd(), outPath)}`);
  console.log(`  Final: shield ${best.analysis.humanScore}/100, composite ${best.rank.composite}/100`);
  return { path: outPath, mode: "llm", shield: best.analysis.humanScore, composite: best.rank.composite };
}

const isMain = process.argv[1]?.includes("generate-blog");
if (isMain) {
  const topic = process.argv.filter(a => !a.startsWith("--")).slice(2).join(" ");
  if (!topic) {
    console.log('Usage: node tools/generate-blog.mjs "topic" [--publish]');
    process.exit(1);
  }
  console.log("\n=== Blog Generator v2 ===\n");
  await generatePost(topic, { publish: process.argv.includes("--publish") });
}
