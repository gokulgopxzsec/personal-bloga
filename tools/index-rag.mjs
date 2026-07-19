// Semantic RAG indexer — embeds all knowledge-base sources with real MiniLM vectors.
// Usage: node tools/index-rag.mjs [--rebuild]
// Falls back to keyword-only indexing if the embedding model can't load.

import * as fs from "fs";
import * as path from "path";
import { embedTexts, keywordVector } from "./embeddings.mjs";

const KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge-base");
const VECTOR_STORE = path.join(process.cwd(), "vector-store", "index.json");

function chunkText(text, source, maxLen = 500) {
  const paragraphs = text.split("\n").filter(p => p.trim().length > 20);
  const chunks = [];
  let current = "";
  let index = 0;

  for (const p of paragraphs) {
    if ((current + p).length > maxLen && current.length > 0) {
      chunks.push({ text: current.trim(), source, index });
      current = p;
      index++;
    } else {
      current += (current ? " " : "") + p;
    }
  }
  if (current.trim()) chunks.push({ text: current.trim(), source, index });
  return chunks;
}

export async function buildIndex({ rebuild = false } = {}) {
  const files = fs.readdirSync(KNOWLEDGE_DIR).filter(f => f.endsWith(".json"));
  console.log(`Found ${files.length} sources in knowledge-base/\n`);

  const allChunks = [];
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(KNOWLEDGE_DIR, file), "utf-8"));
      const chunks = chunkText(data.content, data.url);
      for (const chunk of chunks) {
        allChunks.push({ ...chunk, keywords: keywordVector(chunk.text), sourceTitle: data.title });
      }
      console.log(`  ${file}: ${chunks.length} chunks`);
    } catch { console.log(`  ${file}: ✗ unreadable, skipped`); }
  }

  let existing = [];
  if (!rebuild && fs.existsSync(VECTOR_STORE)) {
    try { existing = JSON.parse(fs.readFileSync(VECTOR_STORE, "utf-8")); } catch {}
  }

  const existingTexts = new Set(existing.map(c => c.text));
  const newChunks = allChunks.filter(c => !existingTexts.has(c.text));

  // Embed anything missing a dense vector (new chunks + legacy keyword-only chunks)
  const needsVec = [...existing.filter(c => !c.vec), ...newChunks];
  if (needsVec.length > 0) {
    console.log(`\nEmbedding ${needsVec.length} chunks with all-MiniLM-L6-v2...`);
    const vecs = await embedTexts(needsVec.map(c => c.text), {
      onProgress: (done, total) => process.stdout.write(`\r  ${done}/${total}`),
    });
    if (vecs) {
      needsVec.forEach((c, i) => { c.vec = vecs[i]; });
      console.log("\n  ✓ dense vectors attached");
    } else {
      console.log("  keyword-only mode (model unavailable)");
    }
  }

  existing.push(...newChunks);
  fs.writeFileSync(VECTOR_STORE, JSON.stringify(existing));

  const withVec = existing.filter(c => c.vec).length;
  console.log(`\nIndexed: ${existing.length} chunks (${newChunks.length} new, ${withVec} with semantic vectors)`);
  return existing;
}

const isMain = process.argv[1]?.includes("index-rag");
if (isMain) {
  console.log("\n=== Semantic RAG Indexer ===\n");
  await buildIndex({ rebuild: process.argv.includes("--rebuild") });
  console.log("\nQuery with: node tools/query-rag.mjs \"your question\"");
}
