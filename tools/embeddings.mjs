// Embedding engine — real semantic vectors via @xenova/transformers (all-MiniLM-L6-v2).
// Runs fully local, no API keys. Model (~25MB) downloads once to node_modules/.cache.
// Falls back gracefully: callers should catch and use keyword scoring if load fails.

let _pipeline = null;
let _loadFailed = false;

export async function getEmbedder() {
  if (_loadFailed) return null;
  if (_pipeline) return _pipeline;
  try {
    const { pipeline, env } = await import("@xenova/transformers");
    env.allowLocalModels = false;
    _pipeline = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
      quantized: true,
    });
    return _pipeline;
  } catch (err) {
    _loadFailed = true;
    console.warn(`  ⚠ Embedding model unavailable (${err?.message?.slice(0, 80)}). Falling back to keyword mode.`);
    return null;
  }
}

// Embed a batch of texts → array of Float32-like number arrays (384-dim, L2-normalized)
export async function embedTexts(texts, { batchSize = 24, onProgress } = {}) {
  const embedder = await getEmbedder();
  if (!embedder) return null;

  const out = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const result = await embedder(batch, { pooling: "mean", normalize: true });
    // result.dims = [batch, 384]
    const dim = result.dims[result.dims.length - 1];
    for (let j = 0; j < batch.length; j++) {
      const vec = Array.from(result.data.slice(j * dim, (j + 1) * dim));
      out.push(vec.map(v => Math.round(v * 1e5) / 1e5));
    }
    if (onProgress) onProgress(Math.min(i + batchSize, texts.length), texts.length);
  }
  return out;
}

export async function embedOne(text) {
  const vecs = await embedTexts([text]);
  return vecs ? vecs[0] : null;
}

// Cosine similarity for dense vectors (assumes normalized, but computes fully for safety)
export function cosineDense(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-10);
}

// Sparse keyword vector (fallback + hybrid boost)
const STOPWORDS = new Set(["this", "that", "with", "from", "have", "been", "were", "they", "them", "their", "what", "when", "where", "which", "there", "about", "would", "could", "should", "into", "over", "also", "than", "then", "these", "those", "your", "will", "more", "most", "some", "such", "only", "other", "very", "just", "because"]);

export function keywordVector(text) {
  const words = text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOPWORDS.has(w));
  const freq = {};
  for (const w of words) freq[w] = (freq[w] || 0) + 1;
  return freq;
}

export function cosineSparse(a, b) {
  if (!a || !b) return 0;
  let dot = 0, na = 0, nb = 0;
  for (const k in a) { na += a[k] * a[k]; if (b[k]) dot += a[k] * b[k]; }
  for (const k in b) { nb += b[k] * b[k]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-10);
}

// Hybrid score: dense semantic when available, sparse keyword as tiebreaker
export function hybridScore(queryVec, queryKw, chunk) {
  const dense = queryVec && chunk.vec ? cosineDense(queryVec, chunk.vec) : null;
  const sparse = cosineSparse(queryKw, chunk.keywords);
  if (dense === null) return sparse;
  return 0.75 * dense + 0.25 * sparse;
}
