// Forex Analyzer — Yahoo Finance INR pairs + arbitrage detection.
// Completely free. No API keys.

const FOREX_SYMBOLS = {
  USDINR: "USDINR=X",
  EURINR: "EURINR=X",
  GBPINR: "GBPINR=X",
  JPYINR: "JPYINR=X",
  AUDINR: "AUDINR=X",
  SGDINR: "SGDINR=X",
  EURUSD: "EURUSD=X",
  GBPUSD: "GBPUSD=X",
  USDJPY: "USDJPY=X",
};

async function fetchYahooQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });
  if (!res.ok) return { symbol, error: `HTTP ${res.status}` };
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return { symbol, error: "no result in chart response" };
  const meta = result.meta;
  const timestamps = result.timestamp || [];
  const quotes = result.indicators?.quote?.[0];
  if (!quotes) return { symbol, error: "no quote data" };
  const closes = quotes.close || [];
  const opens = quotes.open || [];
  const highs = quotes.high || [];
  const lows = quotes.low || [];
  const volumes = quotes.volume || [];

  // Build daily candles
  const candles = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (closes[i] != null) {
      candles.push({
        date: new Date(timestamps[i] * 1000).toISOString().split("T")[0],
        open: opens[i],
        high: highs[i],
        low: lows[i],
        close: closes[i],
        volume: volumes[i] || 0,
      });
    }
  }

  const currentPrice = meta.regularMarketPrice;
  const previousClose = meta.previousClose || meta.chartPreviousClose || currentPrice;
  const change = currentPrice - previousClose;
  const pctChange = previousClose ? (change / previousClose) * 100 : 0;
  const weekChange = candles.length >= 5 && candles[0].close
    ? ((currentPrice - candles[0].close) / candles[0].close) * 100
    : 0;

  return {
    symbol,
    pair: symbol.replace("=X", ""),
    currentPrice,
    previousClose,
    change,
    pctChange,
    weekChange,
    candles,
  };
}

// Triangular arbitrage: check if EUR/INR ≈ EUR/USD × USD/INR
function triangularArbitrage(pairs) {
  const arbitrages = [];

  // EUR/INR vs EUR/USD × USD/INR
  const eurusd = pairs.EURUSD?.currentPrice;
  const usdinr = pairs.USDINR?.currentPrice;
  const eurinr = pairs.EURINR?.currentPrice;
  if (eurusd && usdinr && eurinr) {
    const implied = eurusd * usdinr;
    const dev = ((eurinr - implied) / implied) * 100;
    arbitrages.push({
      type: "TRIANGULAR",
      route: "EUR/USD × USD/INR → EUR/INR",
      implied, actual: eurinr, deviationPct: dev,
      profitable: Math.abs(dev) > 0.1,
      direction: dev > 0 ? "EUR overpriced vs INR" : "EUR underpriced vs INR",
    });
  }

  // GBP/INR vs GBP/USD × USD/INR
  const gbpusd = pairs.GBPUSD?.currentPrice;
  const gbpinr = pairs.GBPINR?.currentPrice;
  if (gbpusd && usdinr && gbpinr) {
    const implied = gbpusd * usdinr;
    const dev = ((gbpinr - implied) / implied) * 100;
    arbitrages.push({
      type: "TRIANGULAR",
      route: "GBP/USD × USD/INR → GBP/INR",
      implied, actual: gbpinr, deviationPct: dev,
      profitable: Math.abs(dev) > 0.1,
      direction: dev > 0 ? "GBP overpriced vs INR" : "GBP underpriced vs INR",
    });
  }

  // EUR/GBP cross: (EUR/INR) / (GBP/INR) vs EUR/USD / GBP/USD
  if (eurinr && gbpinr && eurusd && gbpusd) {
    const impliedCross = eurusd / gbpusd;
    const actualCross = eurinr / gbpinr;
    const dev = ((actualCross - impliedCross) / impliedCross) * 100;
    arbitrages.push({
      type: "CROSS_RATE",
      route: "EUR/GBP via INR vs EUR/GBP via USD",
      implied: impliedCross,
      actual: actualCross,
      deviationPct: dev,
      profitable: Math.abs(dev) > 0.15,
      direction: dev > 0 ? "EUR strong vs GBP through INR" : "EUR weak vs GBP through INR",
    });
  }

  return arbitrages;
}

// Spread: bid-ask estimate from daily high-low
function spreadAnalysis(candles) {
  if (!candles?.length) return { avgSpread: 0, maxSpread: 0, minSpread: 0 };
  const spreads = candles
    .filter(c => c.high && c.low && c.high > c.low)
    .map(c => ((c.high - c.low) / c.close) * 100);
  if (!spreads.length) return { avgSpread: 0, maxSpread: 0, minSpread: 0 };
  return {
    avgSpread: +(spreads.reduce((a, b) => a + b, 0) / spreads.length).toFixed(3),
    maxSpread: +Math.max(...spreads).toFixed(3),
    minSpread: +Math.min(...spreads).toFixed(3),
  };
}

export async function runForexAnalysis() {
  console.log("── Forex ──");

  const pairs = await Promise.all(
    Object.entries(FOREX_SYMBOLS).map(async ([key, sym]) => {
      const d = await fetchYahooQuote(sym);
      return [key, d];
    })
  );
  const pairMap = Object.fromEntries(pairs);

  let hasError = true;
  for (const [key, data] of pairs) {
    if (data.error) continue;
    hasError = false;

    const spread = spreadAnalysis(data.candles);
    const dayLabel = data.change >= 0
      ? `+${data.change.toFixed(4)} (+${data.pctChange.toFixed(2)}%)`
      : `${data.change.toFixed(4)} (${data.pctChange.toFixed(2)}%)`;

    console.log(`  ${key}: ${data.currentPrice.toFixed(4)} ${dayLabel} | spread ${spread.avgSpread}% | 5d: ${data.weekChange > 0 ? "+" : ""}${data.weekChange.toFixed(2)}%`);
  }

  if (hasError) {
    console.log(`  ✗ No forex data available (markets closed)`);
    return { pairs: pairMap, arbitrages: [], error: "no data", type: "forex" };
  }

  // Arbitrage detection
  console.log(`\n  ── Arbitrage ──`);
  const arbitrages = triangularArbitrage(pairMap);

  const usdinr = pairMap.USDINR;
  const dayRange = usdinr?.candles?.length >= 2
    ? Math.max(...usdinr.candles.slice(-2).map(c => c.high)) - Math.min(...usdinr.candles.slice(-2).map(c => c.low))
    : 0;
  const spread = spreadAnalysis(usdinr?.candles);

  if (usdinr) {
    console.log(`  USD/INR spread: ${spread.avgSpread}% (5d avg)`);
    console.log(`  2-day range: ${dayRange.toFixed(4)} pts`);
  }

  if (arbitrages.length) {
    const profitable = arbitrages.filter(a => a.profitable);
    for (const arb of arbitrages) {
      const flag = arb.profitable ? "⚠️" : "✓";
      console.log(`  ${flag} ${arb.route}: ${arb.deviationPct > 0 ? "+" : ""}${arb.deviationPct.toFixed(3)}% dev${arb.profitable ? " (ACTIONABLE)" : ""}`);
    }
    if (!profitable.length) console.log(`  No actionable arbitrage found.`);
  }

  return { pairs: pairMap, arbitrages, usdinr, type: "forex" };
}

const isMain = process.argv[1]?.endsWith("forex-analyzer.mjs") || process.argv[1]?.endsWith("forex-analyzer");
if (isMain) {
  await runForexAnalysis();
}
