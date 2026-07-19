// Style Learner — scrapes verified human-written blogs and distills a
// stylometric baseline profile + reference word-frequency table.
// The shield validates against this baseline; the generator writes toward it.
//
// Usage: node tools/style-learner.mjs            (scrape + build profile)
//        node tools/style-learner.mjs --local    (rebuild profile from cached corpus only)
// Sources: knowledge-base/style-sources.txt (one URL per line, # comments ok)

import * as fs from "fs";
import * as path from "path";
import * as cheerio from "cheerio";
import { computeStylometrics } from "./stylometrics.mjs";

const SOURCES_FILE = path.join(process.cwd(), "knowledge-base", "style-sources.txt");
const CORPUS_DIR = path.join(process.cwd(), "knowledge-base", "style-corpus");
const PROFILE_FILE = path.join(process.cwd(), "vector-store", "style-profile.json");

// Human-written, scrape-friendly essays. Personal blogs of founders/writers —
// exactly the register Gokul's posts live in.
const DEFAULT_SOURCES = [
  "https://paulgraham.com/ds.html",
  "https://paulgraham.com/growth.html",
  "https://paulgraham.com/love.html",
  "https://paulgraham.com/think.html",
  "https://paulgraham.com/persistence.html",
  "https://sive.rs/ff",
  "https://sive.rs/hy",
  "https://sive.rs/dq",
  "https://www.kalzumeus.com/2012/01/23/salary-negotiation/",
  "https://blog.samaltman.com/how-to-be-successful",
  "https://blog.samaltman.com/productivity",
  "https://medium.com/@paulcanetti/why-i-quit-my-dream-job-8e63e952f6d5",
];

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";

function loadSources() {
  if (fs.existsSync(SOURCES_FILE)) {
    const lines = fs.readFileSync(SOURCES_FILE, "utf-8").split("\n")
      .map(l => l.trim()).filter(l => l && !l.startsWith("#"));
    if (lines.length > 0) return lines;
  }
  fs.writeFileSync(SOURCES_FILE, "# Human-written blogs for style learning (one URL per line)\n" + DEFAULT_SOURCES.join("\n") + "\n");
  return DEFAULT_SOURCES;
}

function extractArticleText(html) {
  const $ = cheerio.load(html);
  $("script, style, nav, header, footer, aside, form, iframe, figure, code, pre").remove();
  // Prefer semantic article container, fall back to body
  const root = $("article").length ? $("article").first() : $("body");
  const paras = [];
  root.find("p").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t.length > 40) paras.push(t);
  });
  // PG-era pages use <font> and <br><br> instead of <p>
  if (paras.length < 3) {
    const raw = root.text().replace(/\r/g, "");
    for (const block of raw.split(/\n\s*\n/)) {
      const t = block.replace(/\s+/g, " ").trim();
      if (t.length > 80) paras.push(t);
    }
  }
  return paras.join("\n\n");
}

async function scrape(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return extractArticleText(await res.text());
}

function slugify(url) {
  return url.replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/gi, "_").slice(0, 80) + ".json";
}

function buildWordFreq(texts) {
  const freq = {};
  let total = 0;
  for (const text of texts) {
    const words = text.toLowerCase().replace(/[^a-z'\s]/g, " ").split(/\s+/).filter(w => w.length > 1);
    for (const w of words) { freq[w] = (freq[w] || 0) + 1; total++; }
  }
  freq.__total = total;
  freq.__vocab = Object.keys(freq).length;
  return freq;
}

function aggregate(perDoc) {
  const keys = ["avgSentenceLen", "sentenceLenStd", "burstiness", "paraLenCV", "openerEntropy", "contractionRate", "fragmentRate", "questionRate", "firstPersonRate", "numberDensity", "flesch"];
  const metrics = {};
  for (const k of keys) {
    const vals = perDoc.map(d => d.metrics[k]).filter(v => Number.isFinite(v));
    const m = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
    const s = Math.sqrt(vals.reduce((a, b) => a + (b - m) * (b - m), 0) / Math.max(1, vals.length - 1));
    metrics[k] = { mean: Math.round(m * 1000) / 1000, std: Math.round(Math.max(s, m * 0.08) * 1000) / 1000 };
  }
  return metrics;
}

export async function buildStyleProfile({ localOnly = false } = {}) {
  fs.mkdirSync(CORPUS_DIR, { recursive: true });
  const sources = loadSources();

  if (!localOnly) {
    console.log(`Scraping ${sources.length} human-written sources...\n`);
    for (const url of sources) {
      const file = path.join(CORPUS_DIR, slugify(url));
      if (fs.existsSync(file)) { console.log(`  ⚡ cached ${url}`); continue; }
      try {
        const text = await scrape(url);
        const wordCount = text.split(/\s+/).length;
        if (wordCount < 300) { console.log(`  ✗ ${url} — too short (${wordCount}w), skipped`); continue; }
        fs.writeFileSync(file, JSON.stringify({ url, scrapedAt: new Date().toISOString(), words: wordCount, text }));
        console.log(`  ✓ ${url} (${wordCount}w)`);
      } catch (err) {
        console.log(`  ✗ ${url} — ${err.message}`);
      }
      await new Promise(r => setTimeout(r, 800)); // be polite
    }
  }

  const docs = fs.readdirSync(CORPUS_DIR).filter(f => f.endsWith(".json"))
    .map(f => { try { return JSON.parse(fs.readFileSync(path.join(CORPUS_DIR, f), "utf-8")); } catch { return null; } })
    .filter(Boolean);

  if (docs.length === 0) {
    console.log("\nNo corpus documents. Profile not built.");
    return null;
  }

  const perDoc = docs.map(d => ({ url: d.url, words: d.words, metrics: computeStylometrics(d.text) }));
  const profile = {
    builtAt: new Date().toISOString(),
    documents: perDoc.length,
    totalWords: docs.reduce((a, d) => a + d.words, 0),
    metrics: aggregate(perDoc),
    wordFreq: buildWordFreq(docs.map(d => d.text)),
    perDoc: perDoc.map(({ url, words, metrics }) => ({ url, words, burstiness: metrics.burstiness, openerEntropy: metrics.openerEntropy })),
  };

  fs.writeFileSync(PROFILE_FILE, JSON.stringify(profile));
  console.log(`\n✓ Style profile built from ${perDoc.length} docs / ${profile.totalWords.toLocaleString()} words`);
  console.log(`  Human baseline: burstiness ${profile.metrics.burstiness.mean} ±${profile.metrics.burstiness.std} | opener entropy ${profile.metrics.openerEntropy.mean} | contractions ${profile.metrics.contractionRate.mean}/100w`);
  console.log(`  Saved to vector-store/style-profile.json`);
  return profile;
}

export function loadStyleProfile() {
  try { return JSON.parse(fs.readFileSync(PROFILE_FILE, "utf-8")); } catch { return null; }
}

const isMain = process.argv[1]?.includes("style-learner");
if (isMain) {
  console.log("\n=== Style Learner — human writing baseline ===\n");
  await buildStyleProfile({ localOnly: process.argv.includes("--local") });
}
