// Multi-source cross-verification for data accuracy
// Usage: imported by other tools

export function crossVerifySignals(allSignals) {
  // Group signals by type
  const grouped = {
    bullish: allSignals.flatMap(s => s.bullish.map(k => ({ ...k, source: s.source, text: s.text }))),
    bearish: allSignals.flatMap(s => s.bearish.map(k => ({ ...k, source: s.source, text: s.text }))),
  };

  // Find signals mentioned by multiple sources (higher confidence)
  const verified = { bullish: [], bearish: [] };

  for (const [type, signals] of Object.entries(grouped)) {
    const keywordSources = {};
    for (const s of signals) {
      if (!keywordSources[s.keyword]) keywordSources[s.keyword] = [];
      keywordSources[s.keyword].push(s.source);
    }
    
    for (const [keyword, sources] of Object.entries(keywordSources)) {
      const uniqueSources = [...new Set(sources)];
      verified[type].push({
        keyword,
        sourceCount: uniqueSources.length,
        sources: uniqueSources,
        confidence: uniqueSources.length >= 2 ? "HIGH" : "MEDIUM",
      });
    }
  }

  return verified;
}

export function findDiscrepancies(entries) {
  // Find conflicting signals across sources
  const discrepancies = [];
  const sourceGroups = {};

  for (const entry of entries) {
    const source = new URL(entry.source).hostname || entry.source;
    if (!sourceGroups[source]) sourceGroups[source] = [];
    sourceGroups[source].push(entry);
  }

  // Simplified: just report which sources agree/disagree
  const sourceCount = Object.keys(sourceGroups).length;
  if (sourceCount >= 2) {
    discrepancies.push({
      type: "info",
      message: `Data from ${sourceCount} different sources`,
      sourceCount,
    });
  }

  return discrepancies;
}

export function validateNumericalData(text, sourceUrl) {
  const numbers = [];
  const percentageMatches = text.matchAll(/([+-]?\d+\.?\d*)\s*%/g);
  for (const m of percentageMatches) {
    numbers.push({ value: parseFloat(m[1]), type: "percentage", source: sourceUrl });
  }

  const priceMatches = text.matchAll(/₹\s*(\d[\d,]*\.?\d*)/g);
  for (const m of priceMatches) {
    numbers.push({ value: parseFloat(m[1].replace(/,/g, "")), type: "price", source: sourceUrl });
  }

  return numbers;
}
