// Data Cache — persistent storage + historical archive for market data
// Ensures engine works 24/7 even when markets are closed.

import * as fs from "fs";
import * as path from "path";

const CACHE_FILE = path.join(process.cwd(), "vector-store", "options-cache.json");
const HISTORY_FILE = path.join(process.cwd(), "vector-store", "options-history.jsonl");

export function loadCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return {};
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
  } catch {
    return {};
  }
}

export function saveToCache(symbol, data) {
  try {
    const cache = loadCache();
    cache[symbol] = {
      ...data,
      cachedAt: new Date().toISOString(),
      cacheDate: new Date().toISOString().split("T")[0],
      cacheDayOfWeek: new Date().getDay(),
    };
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    return true;
  } catch {
    return false;
  }
}

export function getCachedOrLive(liveResult, symbol) {
  const isMarketOpen = !liveResult.error && liveResult.totalCalls > 0;

  // Live data with options — cache it and return
  if (isMarketOpen) {
    saveToCache(symbol, liveResult);
    return { ...liveResult, isCached: false, cacheAge: 0, liveEmpty: false };
  }

  // Check cache
  const cache = loadCache();
  const cached = cache[symbol];
  if (cached?.calls?.length > 0) {
    const cacheAge = cached.cachedAt
      ? Math.round((Date.now() - new Date(cached.cachedAt).getTime()) / (1000 * 60 * 60) * 10) / 10
      : 0;
    const reason = liveResult.error
      ? `Live unavailable (${liveResult.error}). Using cached snapshot from ${cached.cacheDate}.`
      : `Market closed (${liveResult.totalCalls}C / ${liveResult.totalPuts}P live). Using cached snapshot from ${cached.cacheDate}.`;

    return { ...cached, isCached: true, cacheAge, liveError: liveResult.error || null, info: reason, liveEmpty: false };
  }

  // No live options AND no cache — mark as empty
  return { ...liveResult, liveEmpty: true, isCached: false, info: liveResult.error || "Market closed. No cached data available. Run during market hours to seed cache." };
}

// Historical archive — appends each snapshot for time-series analysis
export function archiveSnapshot(symbol, data) {
  try {
    const record = {
      t: new Date().toISOString(),
      s: symbol,
      u: data.underlyingValue,
      c: data.totalCalls,
      p: data.totalPuts,
      expiry: data.currentExpiry,
      pcr: data.quant?.pcr?.oiPCR || 0,
      maxPain: data.quant?.maxPain?.maxPainStrike || 0,
      iv: data.quant?.ivAnalysis?.avgIV || 0,
      verdict: data.verdict || null,
    };
    const dir = path.dirname(HISTORY_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(HISTORY_FILE, JSON.stringify(record) + "\n");
    return true;
  } catch {
    return false;
  }
}

// Load historical records for a symbol
export function loadHistory(symbol, limit = 20) {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return [];
    const lines = fs.readFileSync(HISTORY_FILE, "utf-8").split("\n").filter(Boolean);
    const records = lines
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean)
      .filter(r => r.s === symbol)
      .slice(-limit);
    return records;
  } catch {
    return [];
  }
}

// Generate trend from history
export function computeTrend(history) {
  if (history.length < 2) return null;

  const latest = history[history.length - 1];
  const oldest = history[0];
  const spotChange = latest.u - oldest.u;
  const pcrChange = latest.pcr - oldest.pcr;

  return {
    spotDirection: spotChange > 0 ? "UP" : spotChange < 0 ? "DOWN" : "FLAT",
    spotChange: Math.round(spotChange * 100) / 100,
    pcrTrend: pcrChange > 0.1 ? "PUTS_BUILDING" : pcrChange < -0.1 ? "CALLS_BUILDING" : "STABLE",
    pcrChange: Math.round(pcrChange * 100) / 100,
    dataPoints: history.length,
    fromDate: history[0].t.split("T")[0],
    toDate: latest.t.split("T")[0],
  };
}

export function cacheStats() {
  const cache = loadCache();
  const symbols = Object.keys(cache);
  return {
    cachedSymbols: symbols,
    total: symbols.length,
    ages: symbols.map(s => ({
      symbol: s,
      cachedAt: cache[s].cachedAt,
      age: cache[s].cachedAt
        ? Math.round((Date.now() - new Date(cache[s].cachedAt).getTime()) / (1000 * 60 * 60) * 10) / 10
        : null,
      hasOptions: cache[s].calls?.length > 0,
    })),
  };
}
