// Stylometrics — quantitative fingerprint of a piece of writing.
// Used by style-learner (to build the human baseline), shield v3 (to compare
// posts against that baseline), and content-rank (rhythm scoring).

const CONTRACTIONS = /\b(don't|can't|won't|it's|i'm|you're|they're|we're|i've|i'd|that's|isn't|aren't|wasn't|weren't|hasn't|haven't|doesn't|didn't|couldn't|wouldn't|shouldn't|let's|there's|what's|who's|dont|cant|wont|im|ive|thats|isnt|doesnt|didnt)\b/gi;

export function splitSentences(text) {
  return (text.match(/[^.!?\n]+[.!?]+(\s|$)|[^.!?\n]{15,}(\n|$)/g) || [])
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

function shannonEntropy(freq) {
  const total = Object.values(freq).reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  let h = 0;
  for (const c of Object.values(freq)) {
    const p = c / total;
    h -= p * Math.log2(p);
  }
  return h;
}

function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function std(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(mean(arr.map(x => (x - m) * (x - m))));
}

// Word-level surprise model: unigram log-prob against a reference frequency table.
// A cheap perplexity proxy — AI text overuses high-frequency "safe" words, humans
// use rarer, more specific vocabulary. Higher avg surprise = more human.
export function lexicalSurprise(text, refFreq) {
  if (!refFreq) return null;
  const words = text.toLowerCase().replace(/[^a-z'\s]/g, " ").split(/\s+/).filter(w => w.length > 1);
  if (words.length < 20) return null;
  const total = refFreq.__total || 1;
  const vocab = refFreq.__vocab || 10000;
  let sum = 0;
  for (const w of words) {
    const count = refFreq[w] || 0;
    const p = (count + 0.5) / (total + 0.5 * vocab); // smoothed
    sum += -Math.log2(p);
  }
  return sum / words.length; // bits per word
}

export function computeStylometrics(text) {
  const sentences = splitSentences(text);
  const words = text.split(/\s+/).filter(Boolean);
  const paras = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);

  const sentLens = sentences.map(s => s.split(/\s+/).filter(Boolean).length);
  const paraSentCounts = paras.map(p => splitSentences(p).length || 1);

  // Burstiness: coefficient of variation of sentence length. Humans ~0.55-0.9, AI ~0.3-0.45.
  const slMean = mean(sentLens);
  const burstiness = slMean > 0 ? std(sentLens) / slMean : 0;

  const openerFreq = {};
  for (const s of sentences) {
    const w = s.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z']/g, "");
    if (w) openerFreq[w] = (openerFreq[w] || 0) + 1;
  }
  // Normalized opener entropy: 1 = every sentence starts differently
  const openerEntropy = sentences.length > 1
    ? shannonEntropy(openerFreq) / Math.log2(sentences.length)
    : 1;

  const contractionRate = words.length ? ((text.match(CONTRACTIONS) || []).length / words.length) * 100 : 0;
  const fragmentRate = sentences.length ? sentences.filter(s => s.split(/\s+/).length <= 4).length / sentences.length : 0;
  const questionRate = sentences.length ? sentences.filter(s => s.includes("?")).length / sentences.length : 0;
  const firstPersonRate = sentences.length ? sentences.filter(s => /^\s*(i|we|my|our)\b/i.test(s)).length / sentences.length : 0;
  const numberDensity = words.length ? (text.match(/\d[\d,.]*%?|₹|\$/g) || []).length / words.length * 100 : 0;

  const syllableProxy = (text.match(/[aeiou]+/gi) || []).length;
  const flesch = sentences.length && words.length
    ? Math.max(0, Math.min(100, 206.835 - 1.015 * (words.length / sentences.length) - 84.6 * (syllableProxy / words.length)))
    : 0;

  return {
    words: words.length,
    sentences: sentences.length,
    paragraphs: paras.length,
    avgSentenceLen: Math.round(slMean * 10) / 10,
    sentenceLenStd: Math.round(std(sentLens) * 10) / 10,
    burstiness: Math.round(burstiness * 1000) / 1000,
    paraLenCV: mean(paraSentCounts) > 0 ? Math.round((std(paraSentCounts) / mean(paraSentCounts)) * 1000) / 1000 : 0,
    openerEntropy: Math.round(openerEntropy * 1000) / 1000,
    contractionRate: Math.round(contractionRate * 100) / 100,
    fragmentRate: Math.round(fragmentRate * 1000) / 1000,
    questionRate: Math.round(questionRate * 1000) / 1000,
    firstPersonRate: Math.round(firstPersonRate * 1000) / 1000,
    numberDensity: Math.round(numberDensity * 100) / 100,
    flesch: Math.round(flesch * 10) / 10,
  };
}

// Compare a post's stylometrics against the human baseline profile.
// Returns 0-100 humanness + per-metric deviations with fix hints.
const METRIC_HINTS = {
  burstiness: "Sentence lengths too uniform. Mix a 3-word punch with a 30-word ramble.",
  openerEntropy: "Too many sentences start the same way. Vary openings.",
  contractionRate: "Contraction rate is off the human band. Humans write don't, it's, I'm.",
  fragmentRate: "No fragments. Real writing has them. Like this.",
  paraLenCV: "Paragraphs are all the same size. Throw in a one-liner.",
  numberDensity: "Add specific numbers. Vague text reads generated.",
};

export function compareToBaseline(metrics, baseline) {
  if (!baseline?.metrics) return null;
  const checks = ["burstiness", "openerEntropy", "contractionRate", "fragmentRate", "paraLenCV", "numberDensity"];
  const deviations = [];
  let score = 100;

  for (const key of checks) {
    const b = baseline.metrics[key];
    if (!b || b.std === 0) continue;
    const z = (metrics[key] - b.mean) / b.std;
    // Only penalize the "AI direction" (below-human variance/specificity)
    const aiDirection = z < 0;
    const severity = Math.abs(z);
    if (aiDirection && severity > 1) {
      const penalty = Math.min(Math.round((severity - 1) * 8), 15);
      score -= penalty;
      deviations.push({ metric: key, value: metrics[key], humanMean: b.mean, z: Math.round(z * 100) / 100, penalty, hint: METRIC_HINTS[key] || "" });
    }
  }
  return { humanness: Math.max(0, score), deviations };
}
