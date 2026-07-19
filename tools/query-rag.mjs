// Semantic RAG retrieval — hybrid dense + keyword scoring.
// Usage: node tools/query-rag.mjs "your question"
// Also exports retrieve() for the generator and orchestrator.

import * as fs from "fs";
import * as path from "path";
import { embedOne, keywordVector, hybridScore } from "./embeddings.mjs";

const VECTOR_STORE = path.join(process.cwd(), "vector-store", "index.json");
const OBSIDIAN_STORE = path.join(process.cwd(), "vector-store", "obsidian-index.json");

export function loadIndex() {
  const load = f => { try { return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf-8")) : []; } catch { return []; } };
  // Web knowledge + private Obsidian notes, searched as one corpus
  return [...load(VECTOR_STORE), ...load(OBSIDIAN_STORE)];
}

export async function retrieve(query, topK = 8) {
  const index = loadIndex();
  if (index.length === 0) return [];

  const queryVec = await embedOne(query);
  const queryKw = keywordVector(query);

  const scored = index.map(chunk => ({
    chunk,
    score: hybridScore(queryVec, queryKw, chunk),
  }));
  scored.sort((a, b) => b.score - a.score);

  // Diversity: cap chunks per source so one crawl doesn't dominate context
  const perSource = {};
  const results = [];
  for (const { chunk, score } of scored) {
    if (score < 0.05) break;
    perSource[chunk.source] = (perSource[chunk.source] || 0) + 1;
    if (perSource[chunk.source] > 3) continue;
    results.push({ text: chunk.text, source: chunk.source, sourceTitle: chunk.sourceTitle, score });
    if (results.length >= topK) break;
  }
  return results;
}

const isMain = process.argv[1]?.includes("query-rag");
if (isMain) {
  const query = process.argv[2];
  if (!query) {
    console.log('Usage: node tools/query-rag.mjs "your question"');
    process.exit(1);
  }
  const index = loadIndex();
  if (index.length === 0) {
    console.log("Vector store is empty. Run 'node tools/index-rag.mjs' first.");
    process.exit(1);
  }
  const results = await retrieve(query, 8);
  console.log(`\n=== Query: "${query}" ===`);
  console.log(`Top ${results.length} of ${index.length} indexed chunks (semantic ${results[0]?.score !== undefined ? "hybrid" : "keyword"} search):\n`);
  results.forEach((r, i) => {
    console.log(`--- Result ${i + 1} (${(r.score * 100).toFixed(0)}%) ---`);
    console.log(`Source: ${r.source}`);
    console.log(`Text: ${r.text.slice(0, 300)}...\n`);
  });
}
