// Market Pulse - Full pipeline: crawl → validate → extract signals → cross-verify → report
// Usage: node tools/market-pulse.mjs

import * as fs from "fs";
import * as path from "path";
import { isRelevant, cleanText, scoreContent, isFinancialData } from "./data-quality.mjs";
import { extractSignals, summarizeSignals, categorizeSource } from "./signal-extractor.mjs";
import { crossVerifySignals, findDiscrepancies } from "./cross-verify.mjs";

const VECTOR_STORE = path.join(process.cwd(), "vector-store", "index.json");
const SIGNAL_LOG = path.join(process.cwd(), "vector-store", "signals.json");

function loadIndex() {
  if (!fs.existsSync(VECTOR_STORE)) return [];
  return JSON.parse(fs.readFileSync(VECTOR_STORE, "utf-8"));
}

console.log("\n╔══════════════════════════════════════════╗");
console.log("║        MARKET PULSE - SIGNAL REPORT      ║");
console.log("╚══════════════════════════════════════════╝\n");

// 1. Load and filter the vector store
const index = loadIndex();
console.log(`Loaded ${index.length} chunks from vector store\n`);

// 2. Quality filter
console.log("── Data Quality Filter ──");
const qualified = index.filter(chunk => {
  const cleaned = cleanText(chunk.text);
  if (!isRelevant(cleaned)) return false;
  if (!isFinancialData(cleaned)) return false;
  return scoreContent(cleaned) > 5;
});
console.log(`Passed quality filter: ${qualified.length}/${index.length} chunks\n`);

// 3. Extract signals from each chunk
console.log("── Signal Extraction ──");
const allExtracted = [];
for (const chunk of qualified) {
  const cleaned = cleanText(chunk.text);
  const signals = extractSignals(cleaned);
  const score = scoreContent(cleaned);
  
  allExtracted.push({
    source: chunk.source,
    text: cleaned.slice(0, 500),
    signals,
    score,
    category: categorizeSource(chunk.source),
  });
}

// 4. Aggregate signals
const totalBullish = allExtracted.reduce((s, e) => s + e.signals.bullish.length, 0);
const totalBearish = allExtracted.reduce((s, e) => s + e.signals.bearish.length, 0);
const totalNeutral = allExtracted.reduce((s, e) => s + e.signals.neutral.length, 0);

console.log(`Bullish signals: ${totalBullish}`);
console.log(`Bearish signals: ${totalBearish}`);
console.log(`Neutral signals: ${totalNeutral}`);
console.log(`Net sentiment: ${totalBullish - totalBearish}\n`);

// 5. Cross-verification
console.log("── Cross-Verification ──");
const verified = crossVerifySignals(allExtracted);
const discrepancies = findDiscrepancies(allExtracted);

console.log(`High-confidence bullish signals: ${verified.bullish.filter(s => s.confidence === "HIGH").length}`);
console.log(`High-confidence bearish signals: ${verified.bearish.filter(s => s.confidence === "HIGH").length}`);
console.log(`Sources analyzed: ${discrepancies.length > 0 ? discrepancies[0].sourceCount : 1}\n`);

// 6. Signal breakdown by source category
console.log("── Signals by Source Category ──");
const byCategory = {};
for (const entry of allExtracted) {
  if (!byCategory[entry.category]) byCategory[entry.category] = { bullish: 0, bearish: 0, neutral: 0 };
  byCategory[entry.category].bullish += entry.signals.bullish.length;
  byCategory[entry.category].bearish += entry.signals.bearish.length;
  byCategory[entry.category].neutral += entry.signals.neutral.length;
}

for (const [cat, sigs] of Object.entries(byCategory)) {
  if (sigs.bullish + sigs.bearish + sigs.neutral > 0) {
    console.log(`  ${cat}: ${sigs.bullish}B / ${sigs.bearish}Be / ${sigs.neutral}N`);
  }
}

// 7. Top individual signals (from highest confidence sources)
console.log("\n── Top Market Signals ──");
const sortedByScore = allExtracted.sort((a, b) => b.score - a.score);
for (const entry of sortedByScore.slice(0, 10)) {
  const direction = entry.signals.strength > 0 ? "📈" : entry.signals.strength < 0 ? "📉" : "➡️";
  console.log(`  ${direction} [${entry.category}] ${entry.source.split("/")[2] || entry.source}`);
  if (entry.signals.bullish.length > 0) {
    console.log(`     Bullish: ${entry.signals.bullish.slice(0, 3).map(s => s.keyword).join(", ")}`);
  }
  if (entry.signals.bearish.length > 0) {
    console.log(`     Bearish: ${entry.signals.bearish.slice(0, 3).map(s => s.keyword).join(", ")}`);
  }
  console.log(`     Score: ${entry.score} | Strength: ${entry.signals.strength}`);
}

// 8. Save signals to file
const report = {
  timestamp: new Date().toISOString(),
  summary: {
    totalSources: [...new Set(allExtracted.map(e => e.source))].length,
    totalBullish,
    totalBearish,
    totalNeutral,
    netSentiment: totalBullish - totalBearish,
    confidenceSignals: {
      highConfidenceBullish: verified.bullish.filter(s => s.confidence === "HIGH").length,
      highConfidenceBearish: verified.bearish.filter(s => s.confidence === "HIGH").length,
    },
  },
  topSignals: sortedByScore.slice(0, 20).map(e => ({
    source: e.source,
    score: e.score,
    sentiment: e.signals.strength,
    summary: summarizeSignals(e.signals),
    text: e.text.slice(0, 200),
  })),
  byCategory,
};

fs.writeFileSync(SIGNAL_LOG, JSON.stringify(report, null, 2));
console.log(`\nFull report saved to vector-store/signals.json`);
