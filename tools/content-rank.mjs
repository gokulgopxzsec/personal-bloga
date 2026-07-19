// Content Rank — 5-algorithm scoring engine that finds the best writing.
// Every post gets scored 0-100 on five independent axes, combined into a
// composite. Used standalone (rank all posts) and by the generator's
// critique-revise loop (score a draft before accepting it).
//
//   A1 HUMANNESS  — shield v3 score (rules + human-baseline stylometrics)
//   A2 COHERENCE  — semantic flow: adjacent-paragraph embedding similarity
//                   + title↔body alignment (MiniLM vectors)
//   A3 RHYTHM     — burstiness, opener entropy, paragraph variance, Flesch band
//   A4 DENSITY    — specificity: numbers, proper nouns, unique-word ratio, ₹/$ facts
//   A5 HOOK/SEO   — title strength, first-100-word hook, structure, length band, meta
//
// Usage: node tools/content-rank.mjs           (rank all posts)
//        node tools/content-rank.mjs <file>    (score one file)

import * as fs from "fs";
import * as path from "path";
import matter from "gray-matter";
import { analyzeContent } from "./ai-detection-shield.mjs";
import { loadStyleProfile } from "./style-learner.mjs";
import { computeStylometrics, splitSentences } from "./stylometrics.mjs";
import { embedTexts, cosineDense } from "./embeddings.mjs";

const POSTS_DIR = path.join(process.cwd(), "content", "posts");
const OUTPUT = path.join(process.cwd(), "vector-store", "content-rank.json");

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
// Score how close v sits to an ideal band [lo, hi]; falls off linearly outside
function bandScore(v, lo, hi, falloff) {
  if (v >= lo && v <= hi) return 100;
  const dist = v < lo ? lo - v : v - hi;
  return clamp(100 - (dist / falloff) * 100);
}

// ── A1: Humanness ──
function scoreHumanness(body, profile) {
  const a = analyzeContent(body, "draft", profile);
  return { score: a.humanScore, detail: a.verdict, flags: a.flags.length, analysis: a };
}

// ── A2: Semantic coherence (needs embeddings; degrades gracefully) ──
async function scoreCoherence(title, body) {
  const paras = body.split(/\n\s*\n/).map(p => p.replace(/^#+\s*/, "").trim()).filter(p => p.length > 60);
  if (paras.length < 3) return { score: 60, detail: "too few paragraphs to measure flow" };
  const vecs = await embedTexts([title, ...paras.slice(0, 20)]);
  if (!vecs) return { score: 60, detail: "embeddings unavailable" };

  const [titleVec, ...paraVecs] = vecs;
  let flowSum = 0;
  for (let i = 1; i < paraVecs.length; i++) flowSum += cosineDense(paraVecs[i - 1], paraVecs[i]);
  const flow = flowSum / (paraVecs.length - 1);
  const alignment = paraVecs.reduce((a, v) => a + cosineDense(titleVec, v), 0) / paraVecs.length;

  // flow sweet spot 0.35-0.7: lower = disjointed, higher = repetitive
  const flowScore = bandScore(flow, 0.35, 0.7, 0.3);
  const alignScore = clamp(alignment * 200); // 0.5 cosine → 100
  return {
    score: Math.round(0.6 * flowScore + 0.4 * alignScore),
    detail: `flow ${flow.toFixed(2)}, title-alignment ${alignment.toFixed(2)}`,
  };
}

// ── A3: Rhythm ──
function scoreRhythm(body, profile) {
  const m = computeStylometrics(body);
  const b = profile?.metrics;
  const burstScore = b ? bandScore(m.burstiness, b.burstiness.mean - b.burstiness.std, 2, 0.25) : bandScore(m.burstiness, 0.5, 2, 0.25);
  const openerScore = clamp(m.openerEntropy * 125);
  const paraScore = bandScore(m.paraLenCV, 0.35, 2, 0.35);
  const fleschScore = bandScore(m.flesch, 55, 85, 30);
  return {
    score: Math.round(0.35 * burstScore + 0.3 * openerScore + 0.15 * paraScore + 0.2 * fleschScore),
    detail: `burstiness ${m.burstiness}, openers ${m.openerEntropy}, flesch ${m.flesch}`,
    metrics: m,
  };
}

// ── A4: Information density ──
function scoreDensity(body) {
  const words = body.split(/\s+/).filter(Boolean);
  if (words.length < 50) return { score: 30, detail: "too short" };
  const numbers = (body.match(/[₹$]\s?[\d,.]+|\b\d[\d,.]*%|\b\d{2,}\b/g) || []).length;
  // Human founder-writing baseline is ~1 hard number per 100 words; 1.2+ is dense
  const numberScore = bandScore((numbers / words.length) * 100, 1.2, 6, 1.2);
  // Specificity: concrete named things. Case-insensitive — lowercase voice is a
  // style choice, not a lack of specifics. Proxy: words that are rare in English
  // but repeated in this post (products, places, people get mentioned 2+ times).
  const counts = {};
  for (const w of body.toLowerCase().match(/\b[a-z]{4,}\b/g) || []) counts[w] = (counts[w] || 0) + 1;
  const COMMON = new Set(["that", "this", "with", "have", "from", "they", "them", "there", "their", "would", "could", "should", "about", "because", "every", "which", "when", "what", "were", "been", "just", "like", "more", "than", "then", "them", "some", "only", "into", "also", "your", "still", "here", "月"]);
  const entities = Object.entries(counts).filter(([w, c]) => c >= 2 && c <= 12 && !COMMON.has(w) && w.length >= 5).length;
  const nounScore = clamp((entities / words.length) * 100 * 6);
  // Moving-average TTR (window of 150 words) — plain TTR shrinks with length,
  // which would punish exactly the in-depth posts we want
  const norm = words.map(w => w.toLowerCase().replace(/[^a-z']/g, "")).filter(Boolean);
  const WIN = 150;
  let ttr;
  if (norm.length <= WIN) {
    ttr = new Set(norm).size / norm.length;
  } else {
    let sum = 0, n = 0;
    for (let i = 0; i + WIN <= norm.length; i += 75) {
      sum += new Set(norm.slice(i, i + WIN)).size / WIN;
      n++;
    }
    ttr = sum / n;
  }
  const ttrScore = bandScore(ttr, 0.55, 0.85, 0.2);
  const vagueness = (body.match(/\b(things|stuff|various|numerous|several|many people|some people|a lot)\b/gi) || []).length;
  const vaguenessPenalty = Math.min(vagueness * 4, 20);
  return {
    score: clamp(Math.round(0.4 * numberScore + 0.25 * nounScore + 0.35 * ttrScore - vaguenessPenalty)),
    detail: `${numbers} hard numbers, TTR ${ttr.toFixed(2)}, ${vagueness} vague phrases`,
  };
}

// ── A5: Hook & SEO ──
function scoreHookSeo(frontmatter, body) {
  let score = 0;
  const notes = [];
  const title = frontmatter.title || "";
  const tl = title.length;
  score += bandScore(tl, 30, 65, 30) * 0.2;
  if (tl < 30 || tl > 65) notes.push(`title ${tl} chars (30-65 ideal)`);
  if (/\d/.test(title) || /\b(how|why|what|nobody|actually|real)\b/i.test(title)) { score += 10; } else { notes.push("title has no number/how/why hook"); }

  const first100 = body.split(/\s+/).slice(0, 100).join(" ");
  let hook = 0;
  if (/\d/.test(first100)) hook += 4;
  if (/\?/.test(first100)) hook += 3;
  if (/\b(i|my|we)\b/i.test(first100)) hook += 3;
  score += hook;
  if (hook < 5) notes.push("weak opening hook (no number/question/personal entry)");

  const headings = (body.match(/^#{2,3}\s/gm) || []).length;
  const wordCount = body.split(/\s+/).length;
  score += wordCount > 600 ? bandScore(headings, 2, 8, 4) * 0.15 : 15;
  score += bandScore(wordCount, 500, 1800, 800) * 0.25;
  if (wordCount < 500) notes.push(`${wordCount} words — thin for search`);
  const desc = frontmatter.description || "";
  score += desc.length >= 60 && desc.length <= 160 ? 15 : 6;
  if (desc.length < 60 || desc.length > 160) notes.push(`description ${desc.length} chars (60-160 ideal)`);
  score += (frontmatter.tags?.length || 0) >= 2 ? 5 : 0;

  return { score: clamp(Math.round(score)), detail: notes.length ? notes.join("; ") : "strong hook and structure" };
}

const WEIGHTS = { humanness: 0.3, coherence: 0.15, rhythm: 0.2, density: 0.2, hookSeo: 0.15 };

export async function rankContent(body, frontmatter = {}, profile = null) {
  profile = profile ?? loadStyleProfile();
  const humanness = scoreHumanness(body, profile);
  const coherence = await scoreCoherence(frontmatter.title || "", body);
  const rhythm = scoreRhythm(body, profile);
  const density = scoreDensity(body);
  const hookSeo = scoreHookSeo(frontmatter, body);

  const composite = Math.round(
    humanness.score * WEIGHTS.humanness +
    coherence.score * WEIGHTS.coherence +
    rhythm.score * WEIGHTS.rhythm +
    density.score * WEIGHTS.density +
    hookSeo.score * WEIGHTS.hookSeo
  );

  return { composite, algorithms: { humanness, coherence, rhythm, density, hookSeo } };
}

function bar(score) {
  const filled = Math.round(score / 10);
  return "█".repeat(filled) + "░".repeat(10 - filled);
}

async function rankFile(filePath, profile) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);
  const result = await rankContent(content, data, profile);
  return { file: path.basename(filePath), title: data.title, ...result };
}

const isMain = process.argv[1]?.includes("content-rank");
if (isMain) {
  console.log(`\n╔═══════════════════════════════════════════════╗`);
  console.log(`║      CONTENT RANK — 5-ALGORITHM SCORER        ║`);
  console.log(`╚═══════════════════════════════════════════════╝\n`);

  const profile = loadStyleProfile();
  const target = process.argv[2];
  const files = target
    ? [path.resolve(target)]
    : fs.readdirSync(POSTS_DIR).filter(f => f.endsWith(".mdx")).map(f => path.join(POSTS_DIR, f));

  const results = [];
  for (const f of files) {
    try { results.push(await rankFile(f, profile)); }
    catch (e) { console.log(`  ✗ ${path.basename(f)}: ${e.message}`); }
  }
  results.sort((a, b) => b.composite - a.composite);

  results.forEach((r, i) => {
    console.log(`#${i + 1}  ${r.composite}/100  ${r.file}`);
    const a = r.algorithms;
    console.log(`    A1 Humanness  ${bar(a.humanness.score)} ${a.humanness.score}  (${a.humanness.detail})`);
    console.log(`    A2 Coherence  ${bar(a.coherence.score)} ${a.coherence.score}  (${a.coherence.detail})`);
    console.log(`    A3 Rhythm     ${bar(a.rhythm.score)} ${a.rhythm.score}  (${a.rhythm.detail})`);
    console.log(`    A4 Density    ${bar(a.density.score)} ${a.density.score}  (${a.density.detail})`);
    console.log(`    A5 Hook/SEO   ${bar(a.hookSeo.score)} ${a.hookSeo.score}  (${a.hookSeo.detail})`);
    console.log("");
  });

  fs.writeFileSync(OUTPUT, JSON.stringify({ rankedAt: new Date().toISOString(), results: results.map(({ file, title, composite, algorithms }) => ({ file, title, composite, scores: Object.fromEntries(Object.entries(algorithms).map(([k, v]) => [k, v.score])) })) }, null, 2));
  console.log(`✓ Saved rankings to vector-store/content-rank.json`);
}
