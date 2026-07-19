// Quant Engine — parallel fetches for Nifty, BankNifty, Bitcoin.
// Caches everything. Runs in ~5 seconds.

import { fetchAllIndices } from "./nse-fetcher.mjs";
import { archiveSnapshot, loadHistory, computeTrend } from "./data-cache.mjs";
import {
  computePCR, computeMaxPain, computeOIAnalysis,
  computeIVAnalysis, computeOIChangeSentiment, combineSignals,
} from "./options-quant.mjs";
import { fetchBitcoinData } from "./bitcoin-analyzer.mjs";
import { runForexAnalysis } from "./forex-analyzer.mjs";
import { computeIVRank, detectRegime, verdictAccuracy } from "./quant-advanced.mjs";
import * as fs from "fs";
import * as path from "path";

const OUTPUT = path.join(process.cwd(), "vector-store", "quant-analysis.json");

function daysUntilExpiry(expiryDate) {
  if (!expiryDate) return 0;
  try { return Math.max(0, Math.round((new Date(expiryDate) - new Date()) / (1000 * 60 * 60 * 24))); }
  catch { return 0; }
}

function analyzeOptions(data) {
  const hasOptions = data.calls?.length > 0 || data.puts?.length > 0;
  const hasError = data.error && !hasOptions;

  const { symbol, underlyingValue, calls, puts, currentExpiry, timestamp, isCached, cacheAge, info, liveEmpty } = data;

  if (hasError && !isCached) {
    return { error: data.error, symbol, underlyingValue, verdict: "NO_DATA", isCached: false, liveEmpty: true, type: "options" };
  }

  // No real options data but cached — use cache
  if (!hasOptions && isCached) {
    return {
      symbol, underlyingValue, timestamp, isCached: true, cacheAge: cacheAge || 0, info: info || "Cached data", liveEmpty: false,
      expiryDate: currentExpiry || null, daysToExpiry: 0, type: "options",
      quant: { pcr: computePCR(calls, puts), maxPain: computeMaxPain(calls, puts), oiAnalysis: computeOIAnalysis(calls, puts), ivAnalysis: computeIVAnalysis(calls, puts), oiChange: computeOIChangeSentiment(calls, puts) },
      signals: [],
      verdict: "NO_DATA", confidence: "NONE", netScore: 0,
    };
  }

  const quant = {
    pcr: computePCR(calls, puts),
    maxPain: computeMaxPain(calls, puts),
    oiAnalysis: computeOIAnalysis(calls, puts),
    ivAnalysis: computeIVAnalysis(calls, puts),
    oiChange: computeOIChangeSentiment(calls, puts),
  };
  const combined = combineSignals(quant.pcr, quant.maxPain, quant.oiAnalysis, quant.ivAnalysis, quant.oiChange);

  return {
    symbol, underlyingValue, timestamp, isCached: !!isCached, cacheAge: cacheAge || 0, info: info || null,
    expiryDate: currentExpiry, daysToExpiry: daysUntilExpiry(currentExpiry), liveEmpty: !!liveEmpty,
    quant, signals: combined.signals,
    verdict: combined.finalSignal, confidence: combined.confidence, netScore: combined.netScore,
    hasData: combined.hasData,
    type: "options",
  };
}

export async function runQuantAnalysis() {
  const day = new Date().toLocaleDateString("en-IN", { weekday: "long" });
  console.log(`\n╔═══════════════════════════════════════════════╗`);
  console.log(`║      QUANT ENGINE — ${day.toUpperCase().padEnd(27)}║`);
  console.log(`╚═══════════════════════════════════════════════╝\n`);

  // Parallel fetch: indices + bitcoin + forex
  console.log("Fetching...");
  const start = Date.now();
  const [indexData, btcData, forexData] = await Promise.all([
    fetchAllIndices(),
    fetchBitcoinData(),
    runForexAnalysis(),
  ]);
  const fetchTime = Date.now() - start;
  console.log(`Fetched in ${(fetchTime / 1000).toFixed(1)}s\n`);

  console.log("── Indian Indices ──");
  const analyzed = {};
  for (const [key, data] of Object.entries(indexData)) {
    const result = analyzeOptions(data);
    analyzed[key] = result;

    if (result.error && !result.isCached) {
      console.log(`  ${key}: ✗ ${result.error}`);
      continue;
    }

    const icons = { BULLISH: "📈", BEARISH: "📉", NEUTRAL: "➡️", NO_DATA: "⏸️" };
    const cacheLabel = result.isCached ? ` ⚡${result.cacheAge}h` : "";
    const noDataLabel = result.liveEmpty && !result.isCached ? ` (no live data — run during market hours)` : "";
    console.log(`  ${icons[result.verdict] || "⏸️"} ${key}${cacheLabel}${noDataLabel}`);

    if (result.verdict === "NO_DATA" && !result.isCached) {
      console.log(`     Spot: ${result.underlyingValue || "? "} ${data.info || "No data"}`);
      console.log("");
      continue;
    }

    if (result.verdict === "NO_DATA" && result.isCached) {
      console.log(`     Spot: ${result.underlyingValue || "?"} ${result.info || ""} (PCR/IV not meaningful on cached snapshot)`);
      console.log("");
      continue;
    }

    const spotVal = result.underlyingValue || "?";
    const pcrVal = result.quant?.pcr?.oiPCR?.toFixed(2) || "?";
    const maxPainVal = result.quant?.maxPain?.maxPainStrike || "?";
    console.log(`     Spot: ${spotVal} | PCR: ${pcrVal} | MaxPain: ${maxPainVal}`);

    if (result.quant?.ivAnalysis && result.quant?.oiAnalysis) {
      console.log(`     IV: ${result.quant.ivAnalysis.ivSkew.toFixed(1)} | P/C OI: ${result.quant.oiAnalysis.putToCallStrength.toFixed(2)}`);
    }
    console.log(`     ${result.verdict} (${result.confidence}, ${(result.netScore * 100).toFixed(0)}/100)`);
    console.log("");

    if (!result.isCached && data.calls?.length > 0) {
      archiveSnapshot(key, { ...result, ...data });
    }

    // Advanced layer: IV rank + self-graded verdict accuracy from history
    const hist = loadHistory(key, 260);
    result.advanced = {
      ivRank: computeIVRank(hist, result.quant?.ivAnalysis?.avgIV),
      accuracy: verdictAccuracy(hist),
    };
    if (result.advanced.ivRank.rank !== null) {
      console.log(`     IV Rank: ${result.advanced.ivRank.rank}/100 (${result.advanced.ivRank.regime})`);
    }
  }

  // Forex — attach to output (fetched in parallel above)
  analyzed.FOREX = forexData;

  // Bitcoin
  console.log("── Bitcoin ──");
  analyzed.BITCOIN = btcData;
  if (!btcData.error && btcData.series?.length >= 30) {
    btcData.advanced = {
      regime: detectRegime(btcData.series.map(p => p.c)),
      accuracy: verdictAccuracy(loadHistory("BITCOIN", 260)),
    };
    archiveSnapshot("BITCOIN", { underlyingValue: btcData.currentPrice, verdict: btcData.verdict, quant: { ivAnalysis: { avgIV: btcData.technicals.volatility20 } } });
  }

  if (btcData.error) {
    console.log(`  BTC: ✗ ${btcData.error}\n`);
  } else {
    const icons = { BULLISH: "📈", BEARISH: "📉", NEUTRAL: "➡️", CAUTION: "⚠️" };
    console.log(`  ${icons[btcData.verdict] || "➡️"} BTC-USD`);
    console.log(`     Price: $${btcData.currentPrice.toLocaleString()}`);
    console.log(`     24h: ${btcData.changes.day.pct > 0 ? "+" : ""}${btcData.changes.day.pct.toFixed(2)}% | 7d: ${btcData.changes.week.pct > 0 ? "+" : ""}${btcData.changes.week.pct.toFixed(2)}%`);
    console.log(`     RSI: ${btcData.technicals.rsi14} | Vol: ${btcData.technicals.volatility20}%`);
    console.log(`     SMA20: ${btcData.technicals.sma20.toLocaleString()} | SMA50: ${btcData.technicals.sma50.toLocaleString()}`);
    console.log(`     Support: $${btcData.technicals.support.toLocaleString()} | Resistance: $${btcData.technicals.resistance.toLocaleString()}`);
    console.log(`     ${btcData.verdict} (${btcData.signals.length} signals)`);
    console.log("");
  }

  // Trend
  const history = loadHistory("NIFTY", 10);
  if (history.length >= 2) {
    const trend = computeTrend(history);
    if (trend) {
      console.log(`── NIFTY Trend (${trend.dataPoints} snapshots: ${trend.fromDate} → ${trend.toDate}) ──`);
      console.log(`  Spot: ${trend.spotDirection} ${Math.abs(trend.spotChange).toFixed(0)}pts`);
      console.log(`  PCR: ${trend.pcrTrend} (${trend.pcrChange > 0 ? "+" : ""}${trend.pcrChange.toFixed(2)})`);
      console.log("");
    }
  }

  // Save
  try {
    fs.writeFileSync(OUTPUT, JSON.stringify({ ...analyzed, _meta: { fetchedAt: new Date().toISOString(), fetchTimeMs: fetchTime } }, null, 2));
    console.log(`✓ Saved to vector-store/quant-analysis.json (${(fetchTime / 1000).toFixed(1)}s)`);
  } catch {}
}

const isMain = process.argv[1]?.endsWith("quant-engine.mjs") || process.argv[1]?.endsWith("quant-engine");
if (isMain) {
  await runQuantAnalysis();
}
