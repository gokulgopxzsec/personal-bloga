// Event Detector — reads the latest quant analysis and decides what is
// actually worth writing about. Each rule maps a market condition to a
// ready-to-generate blog topic. Autopilot consumes this list.

import * as fs from "fs";
import * as path from "path";

const QUANT_FILE = path.join(process.cwd(), "vector-store", "quant-analysis.json");

export function detectEvents(quant = null) {
  if (!quant) {
    try { quant = JSON.parse(fs.readFileSync(QUANT_FILE, "utf-8")); } catch { return []; }
  }
  const events = [];
  const push = (severity, key, headline, topic) => events.push({ severity, key, headline, topic });

  const btc = quant.BITCOIN;
  if (btc && !btc.error) {
    const d = btc.changes.day.pct, w = btc.changes.week.pct, rsi = btc.technicals.rsi14;
    if (Math.abs(d) >= 4) push(3, "btc-daily-move", `Bitcoin moved ${d.toFixed(1)}% in 24h`, `bitcoin just moved ${d.toFixed(1)} percent in a day, what it means for indian investors`);
    if (rsi >= 72) push(2, "btc-overbought", `Bitcoin RSI ${rsi} — overbought`, `bitcoin looks overbought right now, the numbers behind the hype`);
    if (rsi <= 28) push(2, "btc-oversold", `Bitcoin RSI ${rsi} — oversold`, `bitcoin is oversold, what the data says about buying fear`);
    const distRes = (btc.technicals.resistance - btc.currentPrice) / btc.currentPrice * 100;
    if (distRes < 1 && distRes > -1) push(2, "btc-resistance", `Bitcoin testing resistance $${btc.technicals.resistance.toLocaleString()}`, `bitcoin is testing a key level, a plain-english breakdown`);
    if (Math.abs(w) >= 10) push(3, "btc-weekly-move", `Bitcoin ${w > 0 ? "up" : "down"} ${Math.abs(w).toFixed(0)}% this week`, `bitcoin ${w > 0 ? "rallied" : "dropped"} ${Math.abs(w).toFixed(0)} percent in a week, the indicators that called it`);
    if (btc.advanced?.regime?.regime === "VOLATILE_CHOP") push(1, "btc-chop", "Bitcoin in volatile chop regime", "why trading bitcoin right now is harder than it looks, regime data inside");
  }

  for (const key of ["NIFTY", "BANKNIFTY"]) {
    const n = quant[key];
    if (!n?.hasData) continue;
    const pcr = n.quant?.pcr?.oiPCR;
    if (pcr >= 1.5) push(3, `${key.toLowerCase()}-pcr-high`, `${key} PCR ${pcr.toFixed(2)} — extreme put buying`, `${key.toLowerCase()} options traders are hedging like crazy, what pcr ${pcr.toFixed(2)} actually means`);
    if (pcr > 0 && pcr <= 0.6) push(3, `${key.toLowerCase()}-pcr-low`, `${key} PCR ${pcr.toFixed(2)} — extreme call buying`, `everyone is buying ${key.toLowerCase()} calls, why that usually ends badly`);
    const ivRank = n.advanced?.ivRank?.rank;
    if (ivRank !== null && ivRank !== undefined && ivRank >= 80) push(2, `${key.toLowerCase()}-iv-high`, `${key} IV rank ${ivRank} — options expensive`, `${key.toLowerCase()} option premiums are the most expensive they have been, here is the data`);
    const spot = n.underlyingValue, maxPain = n.quant?.maxPain?.maxPainStrike;
    if (spot && maxPain && Math.abs(spot - maxPain) / spot > 0.02) push(1, `${key.toLowerCase()}-maxpain-gap`, `${key} spot ${Math.round(spot)} vs max pain ${maxPain}`, `${key.toLowerCase()} is trading far from max pain, does expiry gravity actually work`);
  }

  const fx = quant.FOREX;
  if (fx?.pairs?.USDINR && Math.abs(fx.pairs.USDINR.pctChange) >= 0.8) {
    const p = fx.pairs.USDINR;
    push(2, "usdinr-move", `USD/INR moved ${p.pctChange.toFixed(2)}% to ${p.currentPrice.toFixed(2)}`, `the rupee just moved, what ${p.currentPrice.toFixed(0)} per dollar means for indian sellers and freelancers`);
  }
  if (fx?.arbitrages?.some(a => a.profitable)) {
    push(2, "fx-arb", "Cross-rate arbitrage deviation detected", "i found a real arbitrage gap in currency cross rates, here is the math");
  }

  events.sort((a, b) => b.severity - a.severity);
  return events;
}

const isMain = process.argv[1]?.includes("event-detector");
if (isMain) {
  const events = detectEvents();
  console.log(`\n=== Market Events (${events.length}) ===\n`);
  if (events.length === 0) console.log("Nothing notable. Markets are boring today — no forced content.");
  for (const e of events) {
    console.log(`  ${"!".repeat(e.severity)} [${e.key}] ${e.headline}`);
    console.log(`     → topic: "${e.topic}"\n`);
  }
}
