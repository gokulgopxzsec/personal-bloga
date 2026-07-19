// Data Quality Layer - filters fake/irrelevant content, validates accuracy
// Usage: imported by other tools

const BOILERPLATE = [
  "cookie", "privacy policy", "terms of service", "subscribe now",
  "advertisement", "sponsored", "click here", "read more",
  "follow us", "share this", "newsletter", "sign up",
  "all rights reserved", "powered by", "copyright",
  "download now", "buy now", "limited offer",
];

const LOW_VALUE_PATTERNS = [
  /^\s*$\n/gm,                           // empty lines
  /https?:\/\/[^\s]+/g,                  // raw URLs
  /[|]{2,}/g,                            // table separators
  /[_\-*=]{3,}/g,                        // decorative lines
  /(\b\w{1,2}\b\s?){10,}/g,             // random short words (spam)
];

const BOLLYWOOD_KEYWORDS = [
  "movie", "film", "actor", "actress", "singer", "song",
  "trailer", "box office", "bollywood", "tollywood",
  "celebrity", "gossip", "entertainment",
];

export function isRelevant(text) {
  const lower = text.toLowerCase();
  
  // Check for entertainment/spam content
  if (BOLLYWOOD_KEYWORDS.some(k => lower.includes(k)) &&
      !lower.includes("stock") && !lower.includes("market") && 
      !lower.includes("nifty") && !lower.includes("economy")) {
    return false;
  }

  // Check if it's mostly boilerplate
  const boilerplateRatio = BOILERPLATE.reduce((count, word) => {
    return count + (lower.includes(word) ? 1 : 0);
  }, 0) / BOILERPLATE.length;

  if (boilerplateRatio > 0.3) return false;

  // Must have meaningful content
  const meaningfulWords = text.split(/\s+/).filter(w => w.length > 4).length;
  if (meaningfulWords < 5) return false;

  return true;
}

export function cleanText(text) {
  let cleaned = text;
  
  // Remove low-value patterns
  for (const pattern of LOW_VALUE_PATTERNS) {
    cleaned = cleaned.replace(pattern, " ");
  }

  // Remove lines that are mostly boilerplate
  const lines = cleaned.split("\n").filter(line => {
    const lower = line.toLowerCase().trim();
    if (!lower) return false;
    const bpScore = BOILERPLATE.reduce((s, w) => s + (lower.includes(w) ? 1 : 0), 0);
    return bpScore === 0;
  });

  cleaned = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return cleaned;
}

export function checkDataConsistency() {
  // Cross-source numeric verification not implemented yet
  return [];
}

export function isFinancialData(text) {
  const financialTerms = [
    "nifty", "sensex", "bse", "nse", "stock", "share", "market",
    "rupee", "dollar", "inr", "usd", "crude", "gold", "silver",
    "fii", "dii", "foreign", "institutional", "rbi", "reserve bank",
    "gdp", "inflation", "iip", "cpi", "wpi", "pmi",
    "earnings", "revenue", "profit", "quarterly", "dividend",
    "mutual fund", "etf", "ipo", "fpo", "index",
    "bull", "bear", "rally", "correction", "volatility",
    "trading", "investment", "portfolio", "asset",
  ];
  const lower = text.toLowerCase();
  const matches = financialTerms.filter(t => lower.includes(t));
  return matches.length >= 2;
}

export function scoreContent(text) {
  let score = 0;
  const lower = text.toLowerCase();

  // Financial indicators (high value)
  const highValue = ["nifty 50", "sensex", "rbi", "fii", "dii", "crude oil", "usd/inr"];
  highValue.forEach(t => { if (lower.includes(t)) score += 10; });

  // Market terms (medium value)
  const mediumValue = ["stock market", "trading", "investment", "economy", "inflation", "gdp"];
  mediumValue.forEach(t => { if (lower.includes(t)) score += 5; });

  // Data presence (numbers, percentages)
  const numbers = text.match(/\d+\.?\d*%/g);
  if (numbers) score += numbers.length * 3;

  // Penalize short content
  if (text.length < 100) score -= 20;
  
  return Math.max(0, score);
}
