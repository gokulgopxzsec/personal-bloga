// Quant Advanced — analytics that only become possible with accumulated history:
// IV rank/percentile, market regime detection, and verdict accuracy tracking.
// History accumulates in vector-store/options-history.jsonl (one snapshot per
// quant-engine run during market hours) — run the engine daily to feed this.

// IV rank: where current IV sits in its own historical range (0-100).
// Below 30 = options cheap, above 70 = options expensive.
export function computeIVRank(history, currentIV) {
  const ivs = history.map(h => h.iv).filter(v => Number.isFinite(v) && v > 0);
  if (!Number.isFinite(currentIV) || currentIV <= 0 || ivs.length < 5) {
    return { rank: null, percentile: null, samples: ivs.length, note: `Need 5+ snapshots with IV (have ${ivs.length}). Run quant daily during market hours.` };
  }
  const lo = Math.min(...ivs), hi = Math.max(...ivs);
  const rank = hi > lo ? ((currentIV - lo) / (hi - lo)) * 100 : 50;
  const percentile = (ivs.filter(v => v <= currentIV).length / ivs.length) * 100;
  const regime = rank < 30 ? "IV_CHEAP" : rank > 70 ? "IV_EXPENSIVE" : "IV_NORMAL";
  return { rank: Math.round(rank), percentile: Math.round(percentile), lo, hi, samples: ivs.length, regime };
}

// Market regime from a close-price series: trend direction via SMA slope,
// character via volatility + efficiency ratio (net move / path length).
export function detectRegime(closes) {
  if (!closes || closes.length < 30) return { regime: "UNKNOWN", note: "need 30+ closes" };
  const recent = closes.slice(-30);
  const first = recent[0], last = recent[recent.length - 1];
  const netMove = Math.abs(last - first);
  let pathLength = 0;
  const rets = [];
  for (let i = 1; i < recent.length; i++) {
    pathLength += Math.abs(recent[i] - recent[i - 1]);
    rets.push((recent[i] - recent[i - 1]) / recent[i - 1]);
  }
  const efficiency = pathLength > 0 ? netMove / pathLength : 0; // 1 = straight trend, 0 = pure chop
  const meanRet = rets.reduce((a, b) => a + b, 0) / rets.length;
  const vol = Math.sqrt(rets.reduce((a, r) => a + (r - meanRet) ** 2, 0) / rets.length) * Math.sqrt(365) * 100;

  const direction = last > first ? "UP" : "DOWN";
  let regime;
  if (efficiency > 0.35) regime = `TRENDING_${direction}`;
  else if (vol > 60) regime = "VOLATILE_CHOP";
  else regime = "QUIET_RANGE";

  return {
    regime,
    efficiency: Math.round(efficiency * 100) / 100,
    annualizedVol: Math.round(vol),
    move30d: Math.round(((last - first) / first) * 10000) / 100,
    note: {
      TRENDING_UP: "Clean uptrend. Momentum entries work; buying dips beats chasing breakouts.",
      TRENDING_DOWN: "Clean downtrend. Rallies are for selling, not buying.",
      VOLATILE_CHOP: "High-volatility chop. Trend signals will whipsaw; smaller size, wider stops.",
      QUIET_RANGE: "Low-volatility range. Mean reversion regime; breakout trades fail more here.",
    }[regime],
  };
}

// Verdict accuracy: for each archived snapshot with a verdict, check whether the
// NEXT snapshot's spot moved in the predicted direction. Self-grading system.
export function verdictAccuracy(history) {
  const graded = [];
  for (let i = 0; i < history.length - 1; i++) {
    const cur = history[i], next = history[i + 1];
    if (!cur.verdict || cur.verdict === "NO_DATA" || cur.verdict === "NEUTRAL") continue;
    if (!Number.isFinite(cur.u) || !Number.isFinite(next.u) || cur.u <= 0) continue;
    const movePct = ((next.u - cur.u) / cur.u) * 100;
    const hit = (cur.verdict === "BULLISH" && movePct > 0) || (cur.verdict === "BEARISH" && movePct < 0);
    graded.push({ t: cur.t, verdict: cur.verdict, movePct: Math.round(movePct * 100) / 100, hit });
  }
  if (graded.length === 0) return { samples: 0, hitRate: null, note: "No graded predictions yet. Accuracy builds as history accumulates." };
  const hits = graded.filter(g => g.hit).length;
  return {
    samples: graded.length,
    hitRate: Math.round((hits / graded.length) * 100),
    recent: graded.slice(-10),
    note: graded.length < 20 ? "Small sample. Treat hit rate as directional only." : "Statistically meaningful sample.",
  };
}
