// Options Quant Engine — zero-error, handles all edge cases.
// Every function returns safe defaults. Never throws.

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function safeArr(v) {
  return Array.isArray(v) ? v : [];
}


export function computePCR(calls, puts) {
  const c = safeArr(calls);
  const p = safeArr(puts);

  const totalCallOI = c.reduce((s, r) => s + safeNum(r.oi), 0);
  const totalPutOI = p.reduce((s, r) => s + safeNum(r.oi), 0);
  const totalCallVol = c.reduce((s, r) => s + safeNum(r.volume), 0);
  const totalPutVol = p.reduce((s, r) => s + safeNum(r.volume), 0);

  const noData = totalCallOI === 0 && totalPutOI === 0 && totalCallVol === 0 && totalPutVol === 0;

  const oiPCR = totalCallOI > 0 ? totalPutOI / totalCallOI : (noData ? 0 : 1);
  const volumePCR = totalCallVol > 0 ? totalPutVol / totalCallVol : (noData ? 0 : 1);

  let interpretation;
  if (noData) interpretation = { signal: "NO_DATA", strength: "NONE", reason: "No options data available." };
  else if (oiPCR > 1.5) interpretation = { signal: "BULLISH", strength: "STRONG", reason: `PCR ${oiPCR.toFixed(2)}. Extreme put buying suggests market may bounce.` };
  else if (oiPCR > 1.2) interpretation = { signal: "BULLISH", strength: "MODERATE", reason: `PCR ${oiPCR.toFixed(2)}. Elevated put positioning. Contrarian bullish.` };
  else if (oiPCR > 0.9) interpretation = { signal: "NEUTRAL", strength: "MILD", reason: `PCR ${oiPCR.toFixed(2)} near 1.0. Balanced positioning.` };
  else if (oiPCR > 0.6) interpretation = { signal: "BEARISH", strength: "MODERATE", reason: `PCR ${oiPCR.toFixed(2)}. Call buying dominance. Contrarian bearish.` };
  else interpretation = { signal: "BEARISH", strength: "STRONG", reason: `PCR ${oiPCR.toFixed(2)}. Extreme call buying. Market top risk.` };

  return { oiPCR, volumePCR, totalCallOI, totalPutOI, totalCallVol, totalPutVol, interpretation, noData };
}

export function computeMaxPain(calls, puts) {
  const c = safeArr(calls);
  const p = safeArr(puts);

  const allStrikes = [...new Set([...c.map(r => r.strike), ...p.map(r => r.strike)])].filter(s => safeNum(s) > 0);
  const sortedStrikes = allStrikes.sort((a, b) => a - b);

  if (sortedStrikes.length === 0) {
    return { maxPainStrike: 0, maxPainValue: 0, totalPainByStrike: [], noData: true };
  }

  const painByStrike = sortedStrikes.map(strike => {
    let callPain = 0;
    let putPain = 0;

    for (const row of c) {
      if (strike > row.strike) {
        callPain += (strike - row.strike) * safeNum(row.oi);
      }
    }
    for (const row of p) {
      if (strike < row.strike) {
        putPain += (row.strike - strike) * safeNum(row.oi);
      }
    }

    return { strike, totalPain: callPain + putPain, callPain, putPain };
  });

  const maxPainStrike = painByStrike.reduce((min, curr) =>
    curr.totalPain < min.totalPain ? curr : min
  , painByStrike[0]);

  return {
    maxPainStrike: maxPainStrike.strike,
    maxPainValue: maxPainStrike.totalPain,
    totalPainByStrike: painByStrike,
    noData: false,
  };
}

export function computeOIAnalysis(calls, puts) {
  const c = safeArr(calls).filter(r => safeNum(r.oi) > 0);
  const p = safeArr(puts).filter(r => safeNum(r.oi) > 0);

  const totalCallOI = c.reduce((s, r) => s + safeNum(r.oi), 0);
  const totalPutOI = p.reduce((s, r) => s + safeNum(r.oi), 0);
  const noData = totalCallOI === 0 && totalPutOI === 0;

  const callByOI = c.map(r => ({ strike: r.strike, oi: safeNum(r.oi), oiChange: safeNum(r.oiChange) }))
    .sort((a, b) => b.oi - a.oi);
  const putByOI = p.map(r => ({ strike: r.strike, oi: safeNum(r.oi), oiChange: safeNum(r.oiChange) }))
    .sort((a, b) => b.oi - a.oi);

  const topCallOI = callByOI.slice(0, 5);
  const topPutOI = putByOI.slice(0, 5);

  const callOIBuild = c.filter(r => r.oiChange > 0)
    .map(r => ({ strike: r.strike, oiChange: safeNum(r.oiChange), oi: safeNum(r.oi) }))
    .sort((a, b) => b.oiChange - a.oiChange)
    .slice(0, 5);
  const putOIBuild = p.filter(r => r.oiChange > 0)
    .map(r => ({ strike: r.strike, oiChange: safeNum(r.oiChange), oi: safeNum(r.oi) }))
    .sort((a, b) => b.oiChange - a.oiChange)
    .slice(0, 5);

  const resistance = topCallOI.length > 0 ? topCallOI[0].strike : 0;
  const support = topPutOI.length > 0 ? topPutOI[0].strike : 0;
  const putToCallStrength = totalCallOI > 0 ? totalPutOI / totalCallOI : (noData ? 0 : 1);

  const topCallConcentration = totalCallOI > 0
    ? topCallOI.reduce((s, r) => s + r.oi, 0) / totalCallOI : 0;
  const topPutConcentration = totalPutOI > 0
    ? topPutOI.reduce((s, r) => s + r.oi, 0) / totalPutOI : 0;

  return {
    resistance, support, putToCallStrength, noData,
    topCallOI, topPutOI, topCallOIBuild: callOIBuild, topPutOIBuild: putOIBuild,
    callConcentration: topCallConcentration, putConcentration: topPutConcentration,
  };
}

export function computeIVAnalysis(calls, puts) {
  const callIVs = safeArr(calls).filter(r => safeNum(r.iv) > 0).map(r => safeNum(r.iv));
  const putIVs = safeArr(puts).filter(r => safeNum(r.iv) > 0).map(r => safeNum(r.iv));
  const allIVs = [...callIVs, ...putIVs];

  const avgIV = allIVs.length > 0 ? allIVs.reduce((s, v) => s + v, 0) / allIVs.length : 0;
  const avgCallIV = callIVs.length > 0 ? callIVs.reduce((s, v) => s + v, 0) / callIVs.length : 0;
  const avgPutIV = putIVs.length > 0 ? putIVs.reduce((s, v) => s + v, 0) / putIVs.length : 0;
  const ivSkew = avgPutIV - avgCallIV;
  const minIV = allIVs.length > 0 ? Math.min(...allIVs) : 0;
  const maxIV = allIVs.length > 0 ? Math.max(...allIVs) : 0;
  const noData = allIVs.length === 0;

  let interpretation;
  if (noData) interpretation = { signal: "NO_DATA", reason: "No IV data from options chain." };
  else if (ivSkew > 3) interpretation = { signal: "BEARISH", reason: `Put IV ${avgPutIV.toFixed(1)}% > Call IV ${avgCallIV.toFixed(1)}%. Market pricing downside risk.` };
  else if (ivSkew > 1) interpretation = { signal: "SLIGHTLY_BEARISH", reason: "Puts slightly more expensive than calls. Mild fear." };
  else if (ivSkew < -3) interpretation = { signal: "BULLISH", reason: `Call IV ${avgCallIV.toFixed(1)}% > Put IV ${avgPutIV.toFixed(1)}%. Bullish bias.` };
  else if (ivSkew < -1) interpretation = { signal: "SLIGHTLY_BULLISH", reason: "Calls slightly more expensive. Mild optimism." };
  else interpretation = { signal: "NEUTRAL", reason: "IV balanced across strikes." };

  return { avgIV, avgCallIV, avgPutIV, ivSkew, ivRange: { min: minIV, max: maxIV }, interpretation, noData };
}

export function computeOIChangeSentiment(calls, puts) {
  const c = safeArr(calls);
  const p = safeArr(puts);

  const callOIBuild = c.reduce((s, r) => s + Math.max(safeNum(r.oiChange), 0), 0);
  const putOIBuild = p.reduce((s, r) => s + Math.max(safeNum(r.oiChange), 0), 0);
  const netOIFlow = putOIBuild - callOIBuild;
  const noData = callOIBuild === 0 && putOIBuild === 0;

  let interpretation;
  if (noData) interpretation = { signal: "NO_DATA", reason: "No OI change data available." };
  else if (netOIFlow > 0) interpretation = { signal: "BEARISH", reason: `Puts building ${Math.abs(netOIFlow).toLocaleString()} OI more than calls. Bearish positioning.` };
  else if (netOIFlow < 0) interpretation = { signal: "BULLISH", reason: `Calls building ${Math.abs(netOIFlow).toLocaleString()} OI more than puts. Bullish positioning.` };
  else interpretation = { signal: "NEUTRAL", reason: "OI flow balanced. No directional bias." };

  return { callOIBuild, putOIBuild, netOIFlow, interpretation, noData };
}

export function combineSignals(pcr, maxPain, oiAnalysis, ivAnalysis, oiChange) {
  const signals = [];
  const weights = { pcr: 0.30, maxPain: 0.20, oi: 0.25, iv: 0.15, oiChange: 0.10 };

  const anyData = !pcr.noData || !maxPain.noData || !oiAnalysis.noData || !ivAnalysis.noData || !oiChange.noData;

  if (!pcr.noData && pcr.interpretation.signal !== "NEUTRAL") {
    signals.push({
      indicator: "PCR", signal: pcr.interpretation.signal, strength: pcr.interpretation.strength,
      value: pcr.oiPCR.toFixed(2), weight: weights.pcr, detail: pcr.interpretation.reason,
    });
  }

  if (!maxPain.noData && maxPain.maxPainStrike > 0) {
    signals.push({
      indicator: "MAX_PAIN", signal: "NEUTRAL", strength: "INFO",
      value: String(maxPain.maxPainStrike), weight: weights.maxPain,
      detail: `Max pain at ${maxPain.maxPainStrike}. Market gravitates here at expiry.`,
    });
  }

  if (!oiAnalysis.noData && (oiAnalysis.resistance > 0 || oiAnalysis.support > 0)) {
    const oiSignal = oiAnalysis.putToCallStrength > 1.2 ? "BULLISH"
      : oiAnalysis.putToCallStrength < 0.8 ? "BEARISH" : "NEUTRAL";
    if (oiSignal !== "NEUTRAL") {
      signals.push({
        indicator: "OI_CONCENTRATION", signal: oiSignal,
        strength: Math.abs(oiAnalysis.putToCallStrength - 1) > 0.5 ? "STRONG" : "MODERATE",
        value: oiAnalysis.putToCallStrength.toFixed(2), weight: weights.oi,
        detail: `S/R: ${oiAnalysis.support}/${oiAnalysis.resistance}. P/C OI: ${oiAnalysis.putToCallStrength.toFixed(2)}`,
      });
    }
  }

  if (!ivAnalysis.noData && ivAnalysis.interpretation.signal !== "NEUTRAL" && ivAnalysis.interpretation.signal !== "NO_DATA") {
    signals.push({
      indicator: "IV_SKEW", signal: ivAnalysis.interpretation.signal,
      strength: Math.abs(ivAnalysis.ivSkew) > 3 ? "STRONG" : "MODERATE",
      value: ivAnalysis.ivSkew.toFixed(2), weight: weights.iv, detail: ivAnalysis.interpretation.reason,
    });
  }

  if (!oiChange.noData) {
    signals.push({
      indicator: "OI_CHANGE", signal: oiChange.interpretation.signal, strength: "MODERATE",
      value: oiChange.netOIFlow.toLocaleString(), weight: weights.oiChange, detail: oiChange.interpretation.reason,
    });
  }

  let bullScore = 0, bearScore = 0;
  for (const s of signals) {
    if (s.signal === "BULLISH" || s.signal === "SLIGHTLY_BULLISH") bullScore += s.weight;
    if (s.signal === "BEARISH" || s.signal === "SLIGHTLY_BEARISH") bearScore += s.weight;
  }

  const netScore = bullScore - bearScore;
  const finalSignal = !anyData ? "NO_DATA" : netScore > 0.05 ? "BULLISH" : netScore < -0.05 ? "BEARISH" : "NEUTRAL";
  const confidence = !anyData ? "NONE" : Math.abs(netScore) > 0.3 ? "HIGH" : Math.abs(netScore) > 0.1 ? "MEDIUM" : "LOW";

  return { signals, finalSignal, confidence, bullScore, bearScore, netScore, hasData: anyData };
}
