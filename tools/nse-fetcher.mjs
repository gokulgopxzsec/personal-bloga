// Market Data Fetcher — Yahoo Finance with crumb auth + cache fallback
// Live data during market hours, last-known-good on weekends/holidays.

import { getCachedOrLive } from "./data-cache.mjs";

const SYMBOLS = {
  NIFTY: "^NSEI",
  BANKNIFTY: "^NSEBANK",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

async function getCrumb() {
  const loginRes = await fetch("https://fc.yahoo.com/", {
    headers: { "User-Agent": UA },
  });
  const cookie = loginRes.headers.get("set-cookie") || "";
  const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": UA, Cookie: cookie, Accept: "text/plain" },
  });
  const crumb = crumbRes.ok ? (await crumbRes.text()).trim() : "";
  return { cookie, crumb };
}

export async function fetchOptionsChain(symbol = "NIFTY") {
  const yahooSymbol = SYMBOLS[symbol] || symbol;

  try {
    // 1. Current price (no auth needed)
    let underlyingValue = 0;
    try {
      const r = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=1d&interval=1d`,
        { headers: { "User-Agent": UA } }
      );
      if (r.ok) {
        const d = await r.json();
        const m = d?.chart?.result?.[0]?.meta;
        underlyingValue = m?.regularMarketPrice || m?.previousClose || 0;
      }
    } catch {}

    // 2. Crumb
    const { cookie, crumb } = await getCrumb();
    if (!crumb) {
      const base = { symbol, yahooSymbol, underlyingValue, calls: [], puts: [], totalCalls: 0, totalPuts: 0, error: "No crumb" };
      return getCachedOrLive(base, symbol);
    }

    // 3. Options chain
    const optRes = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(yahooSymbol)}?crumb=${encodeURIComponent(crumb)}`,
      { headers: { "User-Agent": UA, Cookie: cookie, Accept: "application/json" } }
    );

    if (!optRes.ok) {
      const base = { symbol, yahooSymbol, underlyingValue, error: `YF ${optRes.status}`, calls: [], puts: [], totalCalls: 0, totalPuts: 0 };
      return getCachedOrLive(base, symbol);
    }

    const data = await optRes.json();
    const result = data?.optionChain?.result?.[0];
    if (!result) {
      const base = { symbol, yahooSymbol, underlyingValue, error: "Empty result", calls: [], puts: [], totalCalls: 0, totalPuts: 0 };
      return getCachedOrLive(base, symbol);
    }

    const expiryDates = (result.expirationDates || []).map(d => new Date(d * 1000).toISOString().split("T")[0]);
    const currentExpiry = expiryDates[0] || null;
    const options = result.options?.[0] || {};

    const parse = (arr, type) => (arr || []).map(o => ({
      strike: o.strike || 0, type,
      oi: o.openInterest || 0, oiChange: o.openInterest || 0,
      volume: o.volume || 0, iv: o.impliedVolatility || 0,
      ltp: o.lastPrice || 0, change: o.change || 0,
      bid: o.bid || 0, ask: o.ask || 0, expiry: currentExpiry,
    }));

    const calls = parse(options.calls, "CE");
    const puts = parse(options.puts, "PE");
    const live = {
      symbol, yahooSymbol, underlyingValue,
      timestamp: new Date().toISOString(),
      currentExpiry, expiryDates,
      totalCalls: calls.length, totalPuts: puts.length,
      calls, puts,
    };
    return getCachedOrLive(live, symbol);
  } catch (err) {
    const base = {
      symbol, yahooSymbol: SYMBOLS[symbol] || symbol,
      underlyingValue: 0, error: err?.message || "Unknown",
      calls: [], puts: [], totalCalls: 0, totalPuts: 0,
    };
    return getCachedOrLive(base, symbol);
  }
}

export async function fetchAllIndices() {
  const entries = Object.entries(SYMBOLS);
  const results = {};
  const fetches = entries.map(async ([key]) => {
    const data = await fetchOptionsChain(key);
    return { key, data };
  });
  const resolved = await Promise.all(fetches);
  for (const { key, data } of resolved) {
    results[key] = data;
    if (data.isCached) {
      console.log(`  ${key}: ⚡ cached ${data.cacheAge}h old`);
    } else if (data.error) {
      console.log(`  ${key}: ✗ ${data.error}`);
    } else {
      console.log(`  ${key}: ✓ ${data.totalCalls}C / ${data.totalPuts}P @ ${data.underlyingValue}`);
    }
  }
  return results;
}

const isMain = process.argv[1]?.endsWith("nse-fetcher.mjs") || process.argv[1]?.endsWith("nse-fetcher");
if (isMain) {
  const symbol = process.argv[2] || "NIFTY";
  if (symbol === "ALL") {
    const results = await fetchAllIndices();
    try {
      const fs = await import("fs");
      fs.writeFileSync("vector-store/nse-options-data.json", JSON.stringify(results, null, 2));
    } catch {}
  } else {
    const d = await fetchOptionsChain(symbol);
    console.log(JSON.stringify({ symbol: d.symbol, spot: d.underlyingValue, calls: d.totalCalls, puts: d.totalPuts, cached: d.isCached, age: d.cacheAge || 0, info: d.info || d.error || "ok" }, null, 2));
  }
}
