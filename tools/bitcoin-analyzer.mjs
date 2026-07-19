// Bitcoin Analyzer — chart data, technical indicators, signals
// Free via Yahoo Finance, BTC-USD trades 24/7 (works on weekends)

const BTC_SYMBOL = "BTC-USD";

export async function fetchBitcoinData() {
  try {
    const now = Math.floor(Date.now() / 1000);
    const oneYearAgo = now - 365 * 24 * 60 * 60;

    // Fetch 1 year of daily data for indicators
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${BTC_SYMBOL}?period1=${oneYearAgo}&period2=${now}&interval=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return { error: `BTC fetch ${res.status}` };

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return { error: "No BTC data" };

    const quotes = result.indicators?.quote?.[0];
    const timestamps = result.timestamp || [];
    const closes = quotes?.close || [];
    const volumes = quotes?.volume || [];
    const highs = quotes?.high || [];
    const lows = quotes?.low || [];
    const opens = quotes?.open || [];

    // Filter valid entries
    const valid = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] != null && closes[i] > 0) {
        valid.push({
          date: new Date(timestamps[i] * 1000).toISOString().split("T")[0],
          open: opens[i] || 0,
          high: highs[i] || 0,
          low: lows[i] || 0,
          close: closes[i],
          volume: volumes[i] || 0,
        });
      }
    }

    if (valid.length < 2) return { error: "Insufficient BTC data" };

    const current = valid[valid.length - 1];
    const prev = valid[valid.length - 2];
    const weekAgo = valid[Math.max(0, valid.length - 8)];
    const monthAgo = valid[Math.max(0, valid.length - 31)];

    const dayChange = current.close - prev.close;
    const dayChangePct = prev.close > 0 ? (dayChange / prev.close) * 100 : 0;
    const weekChangePct = weekAgo.close > 0 ? ((current.close - weekAgo.close) / weekAgo.close) * 100 : 0;
    const monthChangePct = monthAgo.close > 0 ? ((current.close - monthAgo.close) / monthAgo.close) * 100 : 0;

    // Moving Averages
    const closesArr = valid.map(v => v.close);
    const sma20 = computeSMA(closesArr, 20);
    const sma50 = computeSMA(closesArr, 50);
    const sma200 = computeSMA(closesArr, 200);

    // Volatility (20-day annualized)
    const vol20 = computeVolatility(closesArr, 20);

    // RSI (14-day)
    const rsi14 = computeRSI(closesArr, 14);

    // ATR (14-day)
    const atr14 = computeATR(valid, 14);

    // Support & Resistance (recent highs/lows)
    const recent20 = valid.slice(-20);
    const resistance = Math.max(...recent20.map(v => v.high));
    const support = Math.min(...recent20.map(v => v.low));
    
    const distanceFromResistance = resistance > 0 ? ((resistance - current.close) / resistance) * 100 : 0;
    const distanceFromSupport = current.close > 0 ? ((current.close - support) / current.close) * 100 : 0;

    // Generate signals
    const signals = [];
    const trend = current.close > sma50 ? "BULLISH" : "BEARISH";

    // MA crossover signals
    if (sma20 > 0 && sma50 > 0) {
      if (sma20 > sma50) signals.push({ indicator: "MA_CROSS", signal: "BULLISH", detail: `20 SMA (${sma20.toFixed(0)}) > 50 SMA (${sma50.toFixed(0)})` });
      else signals.push({ indicator: "MA_CROSS", signal: "BEARISH", detail: `20 SMA (${sma20.toFixed(0)}) < 50 SMA (${sma50.toFixed(0)})` });
    }

    // RSI signals
    if (rsi14 > 70) signals.push({ indicator: "RSI", signal: "BEARISH", detail: `RSI ${rsi14.toFixed(1)} — overbought` });
    else if (rsi14 < 30) signals.push({ indicator: "RSI", signal: "BULLISH", detail: `RSI ${rsi14.toFixed(1)} — oversold` });
    else signals.push({ indicator: "RSI", signal: "NEUTRAL", detail: `RSI ${rsi14.toFixed(1)} — neutral` });

    // Volatility signal
    if (vol20 > 80) signals.push({ indicator: "VOLATILITY", signal: "CAUTION", detail: `High vol ${vol20.toFixed(0)}% — wider stops` });
    if (vol20 < 30) signals.push({ indicator: "VOLATILITY", signal: "LOW", detail: `Low vol ${vol20.toFixed(0)}% — rangebound` });

    // Support/Resistance proximity
    if (distanceFromResistance < 2) signals.push({ indicator: "RESISTANCE", signal: "CAUTION", detail: `Near resistance ${resistance.toLocaleString()}` });
    if (distanceFromSupport < 2) signals.push({ indicator: "SUPPORT", signal: "OPPORTUNITY", detail: `Near support ${support.toLocaleString()}` });

    // Aggregate verdict
    const bullCount = signals.filter(s => s.signal === "BULLISH" || s.signal === "OPPORTUNITY").length;
    const bearCount = signals.filter(s => s.signal === "BEARISH" || s.signal === "CAUTION").length;
    const verdict = bullCount > bearCount ? "BULLISH" : bearCount > bullCount ? "BEARISH" : "NEUTRAL";

    return {
      symbol: "BTC-USD",
      currentPrice: current.close,
      open: current.open,
      high: current.high,
      low: current.low,
      volume: current.volume,
      timestamp: new Date().toISOString(),
      changes: {
        day: { value: dayChange, pct: dayChangePct },
        week: { pct: weekChangePct },
        month: { pct: monthChangePct },
      },
      technicals: {
        sma20: Math.round(sma20),
        sma50: Math.round(sma50),
        sma200: Math.round(sma200),
        rsi14: Math.round(rsi14 * 10) / 10,
        volatility20: Math.round(vol20 * 10) / 10,
        atr14: Math.round(atr14),
        support: Math.round(support),
        resistance: Math.round(resistance),
      },
      series: valid.slice(-90).map(v => ({ d: v.date, c: Math.round(v.close) })),
      trend,
      signals,
      verdict,
      dataPoints: valid.length,
    };
  } catch (err) {
    return { error: `BTC analysis failed: ${err?.message || "Unknown"}` };
  }
}

function computeSMA(arr, period) {
  if (arr.length < period) return 0;
  const slice = arr.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / period;
}

function computeVolatility(arr, period) {
  if (arr.length < period + 1) return 0;
  const returns = [];
  const slice = arr.slice(-period - 1);
  for (let i = 1; i < slice.length; i++) {
    returns.push((slice[i] - slice[i - 1]) / slice[i - 1]);
  }
  const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
  const variance = returns.reduce((s, v) => s + (v - mean) ** 2, 0) / returns.length;
  const dailyStd = Math.sqrt(variance);
  return dailyStd * Math.sqrt(365) * 100; // Annualized %
}

function computeRSI(arr, period = 14) {
  if (arr.length < period + 1) return 50;
  const changes = [];
  for (let i = arr.length - period; i < arr.length; i++) {
    changes.push(arr[i] - arr[i - 1]);
  }
  const gains = changes.filter(c => c > 0);
  const losses = changes.filter(c => c < 0).map(c => Math.abs(c));
  const avgGain = gains.length > 0 ? gains.reduce((s, v) => s + v, 0) / period : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((s, v) => s + v, 0) / period : 0;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function computeATR(valid, period = 14) {
  if (valid.length < period + 1) return 0;
  const trs = [];
  for (let i = valid.length - period; i < valid.length; i++) {
    const prev = valid[i - 1];
    const curr = valid[i];
    const hl = curr.high - curr.low;
    const hc = Math.abs(curr.high - prev.close);
    const lc = Math.abs(curr.low - prev.close);
    trs.push(Math.max(hl, hc, lc));
  }
  return trs.reduce((s, v) => s + v, 0) / trs.length;
}

// CLI
const isMain = process.argv[1]?.endsWith("bitcoin-analyzer.mjs") || process.argv[1]?.endsWith("bitcoin-analyzer");
if (isMain) {
  const result = await fetchBitcoinData();
  if (result.error) {
    console.log(`✗ ${result.error}`);
  } else {
    const icon = result.verdict === "BULLISH" ? "📈" : result.verdict === "BEARISH" ? "📉" : "➡️";
    console.log(`\n${icon} Bitcoin (BTC-USD)`);
    console.log(`Price: $${result.currentPrice.toLocaleString()}`);
    console.log(`24h: ${result.changes.day.pct > 0 ? "+" : ""}${result.changes.day.pct.toFixed(2)}%`);
    console.log(`7d: ${result.changes.week.pct > 0 ? "+" : ""}${result.changes.week.pct.toFixed(2)}%`);
    console.log(`RSI(14): ${result.technicals.rsi14} | Vol: ${result.technicals.volatility20}%`);
    console.log(`SMA20: $${result.technicals.sma20.toLocaleString()} | SMA50: $${result.technicals.sma50.toLocaleString()}`);
    console.log(`Support: $${result.technicals.support.toLocaleString()} | Resistance: $${result.technicals.resistance.toLocaleString()}`);
    console.log(`Verdict: ${result.verdict}`);
    console.log(`Signals: ${result.signals.map(s => `${s.indicator}=${s.signal}`).join(", ")}`);
  }
}
