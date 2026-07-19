// Market Signal Extractor - finds bullish/bearish signals from market data
// Usage: imported by other tools

const BULLISH_KEYWORDS = {
  direct: ["bullish", "rally", "upside", "breakout", "buy", "accumulate", "overweight",
           "positive", "optimistic", "growth", "surge", "soar", "gain", "green"],
  data: ["fii buying", "dii buying", "rate cut", "liquidity", "tax cut",
         "reforms", "upgrade", "exceeds estimates", "beat estimates"],
  technical: ["support held", "resistance breakout", "higher high", "higher low",
              "golden cross", "oversold", "bull flag", "cup handle"],
  fundamental: ["strong earnings", "high growth", "low pe", "high roe",
                "margin expansion", "debt reduction", "buyback"],
};

const BEARISH_KEYWORDS = {
  direct: ["bearish", "downtrend", "downside", "breakdown", "sell", "reduce", "underweight",
           "negative", "pessimistic", "decline", "crash", "plunge", "slump", "red"],
  data: ["fii selling", "dii selling", "rate hike", "withdrawal", "tax hike",
         "downgrade", "misses estimates", "below estimates"],
  technical: ["support break", "resistance held", "lower high", "lower low",
              "death cross", "overbought", "bear flag", "head shoulders"],
  fundamental: ["weak earnings", "low growth", "high pe", "low roe",
                "margin compression", "debt increase"],
};

const NEUTRAL_KEYWORDS = ["consolidation", "rangebound", "sideways", "mixed",
                          "volatile", "uncertainty", "wait and watch"];

export function extractSignals(text) {
  const lower = text.toLowerCase();
  const signals = { bullish: [], bearish: [], neutral: [], strength: 0 };

  // Check bullish signals
  for (const [category, keywords] of Object.entries(BULLISH_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        signals.bullish.push({ keyword, category });
      }
    }
  }

  // Check bearish signals
  for (const [category, keywords] of Object.entries(BEARISH_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        signals.bearish.push({ keyword, category });
      }
    }
  }

  // Check neutral signals
  for (const keyword of NEUTRAL_KEYWORDS) {
    if (lower.includes(keyword)) {
      signals.neutral.push({ keyword });
    }
  }

  // Calculate signal strength (-100 to +100)
  const bullScore = signals.bullish.length * 2;
  const bearScore = signals.bearish.length * 2;
  const weightedBull = signals.bullish.filter(s => s.category === "direct" || s.category === "data").length * 3;
  const weightedBear = signals.bearish.filter(s => s.category === "direct" || s.category === "data").length * 3;
  const totalBull = bullScore + weightedBull;
  const totalBear = bearScore + weightedBear;
  
  if (totalBull + totalBear > 0) {
    signals.strength = Math.round(((totalBull - totalBear) / (totalBull + totalBear)) * 100);
  }

  // Extract specific data points
  signals.dataPoints = extractDataPoints(text);

  return signals;
}

function extractDataPoints(text) {
  const points = {};

  // Index levels
  const niftyMatch = text.match(/nifty\s*(?:50)?\s*(?:is\s*at|:)?\s*[:\s]*(\d[\d,.]+)/i);
  if (niftyMatch) points.nifty = parseFloat(niftyMatch[1].replace(/,/g, ""));

  const sensexMatch = text.match(/sensex\s*[:\s]*(\d[\d,.]+)/i);
  if (sensexMatch) points.sensex = parseFloat(sensexMatch[1].replace(/,/g, ""));

  // Percentage changes
  const changes = text.match(/([+-]?\d+\.?\d*)%/g);
  if (changes) {
    points.changes = changes.map(c => parseFloat(c));
  }

  // FII/DII data
  if (text.toLowerCase().includes("fii")) points.hasFiiData = true;
  if (text.toLowerCase().includes("dii")) points.hasDiiData = true;

  // Crude oil
  const crudeMatch = text.match(/crude\s*(?:oil)?\s*[:\s$]*(\d[\d,.]+)/i);
  if (crudeMatch) points.crudeOil = parseFloat(crudeMatch[1].replace(/,/g, ""));

  // USD/INR
  const usdMatch = text.match(/usd\s*\/?\s*inr\s*[:\s]*(\d[\d,.]+)/i);
  if (usdMatch) points.usdInr = parseFloat(usdMatch[1].replace(/,/g, ""));

  return points;
}

export function categorizeSource(source) {
  if (source.includes("economictimes") || source.includes("financialexpress")) return "news";
  if (source.includes("moneycontrol") || source.includes("livemint")) return "news";
  if (source.includes("cnbctv18") || source.includes("bloombergquint")) return "news";
  if (source.includes("zerodha") || source.includes("angelone")) return "education";
  if (source.includes("investing.com") || source.includes("tradingeconomics")) return "data";
  if (source.includes("nseindia") || source.includes("bseindia") || source.includes("sebi")) return "official";
  if (source.includes("inc42") || source.includes("yourstory") || source.includes("entrackr")) return "startup";
  return "other";
}

export function summarizeSignals(signals) {
  const parts = [];
  
  if (signals.bullish.length > 0) {
    const cats = [...new Set(signals.bullish.map(s => s.category))];
    parts.push(`Bullish signals: ${signals.bullish.length} (${cats.join(", ")})`);
  }
  
  if (signals.bearish.length > 0) {
    const cats = [...new Set(signals.bearish.map(s => s.category))];
    parts.push(`Bearish signals: ${signals.bearish.length} (${cats.join(", ")})`);
  }

  if (signals.strength !== 0) {
    const direction = signals.strength > 0 ? "BULLISH" : "BEARISH";
    parts.push(`Sentiment: ${direction} (${Math.abs(signals.strength)}/100)`);
  }

  if (signals.neutral.length > 0) {
    parts.push(`Neutral: ${signals.neutral.length} signals`);
  }

  return parts.join(" | ");
}
