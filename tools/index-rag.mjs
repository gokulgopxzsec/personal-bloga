// Semantic RAG indexer — embeds all knowledge-base sources with real MiniLM vectors.
// Usage: node tools/index-rag.mjs [--rebuild]
// Falls back to keyword-only indexing if the embedding model can't load.

import * as fs from "fs";
import * as path from "path";
import { embedTexts, keywordVector } from "./embeddings.mjs";

const KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge-base");
const VECTOR_STORE = path.join(process.cwd(), "vector-store", "index.json");
// Obsidian notes index — separate file, git-ignored: personal notes must never
// end up in the (public) repo via the committed web index.
const OBSIDIAN_STORE = path.join(process.cwd(), "vector-store", "obsidian-index.json");
const VAULTS_FILE = path.join(KNOWLEDGE_DIR, "obsidian-vaults.txt");

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

function scanVaultFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue; // .obsidian, .trash
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) scanVaultFiles(full, out);
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

function cleanNote(raw) {
  return raw
    .replace(/^---\n[\s\S]*?\n---\n?/, "")          // frontmatter
    .replace(/!\[\[([^\]]+)\]\]/g, "")               // embeds
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")  // [[target|alias]] → alias
    .replace(/\[\[([^\]]+)\]\]/g, "$1")             // [[wikilink]] → text
    .replace(/```[\s\S]*?```/g, "")                 // code blocks
    .replace(/^#+\s*/gm, "")                        // heading markers
    .trim();
}

export async function buildObsidianIndex() {
  if (!fs.existsSync(VAULTS_FILE)) {
    console.log("No obsidian-vaults.txt — skipping Obsidian.");
    return [];
  }
  const vaults = fs.readFileSync(VAULTS_FILE, "utf-8").split("\n")
    .map(l => l.trim()).filter(l => l && !l.startsWith("#"));

  const allChunks = [];
  for (const vault of vaults) {
    if (!fs.existsSync(vault)) { console.log(`  ✗ vault missing: ${vault}`); continue; }
    const vaultName = path.basename(vault);
    const files = scanVaultFiles(vault);
    let count = 0;
    for (const file of files) {
      try {
        const text = cleanNote(fs.readFileSync(file, "utf-8"));
        if (text.length < 80) continue;
        const rel = path.relative(vault, file).replace(/\\/g, "/");
        for (const chunk of chunkText(text, `obsidian:${vaultName}/${rel}`)) {
          allChunks.push({ ...chunk, keywords: keywordVector(chunk.text), sourceTitle: path.basename(file, ".md") });
          count++;
        }
      } catch {}
    }
    console.log(`  ${vaultName}: ${files.length} notes → ${count} chunks`);
  }

  if (allChunks.length > 0) {
    console.log(`\nEmbedding ${allChunks.length} note chunks...`);
    const vecs = await embedTexts(allChunks.map(c => c.text), {
      onProgress: (done, total) => process.stdout.write(`\r  ${done}/${total}`),
    });
    if (vecs) { allChunks.forEach((c, i) => { c.vec = vecs[i]; }); console.log(""); }
  }
  fs.writeFileSync(OBSIDIAN_STORE, JSON.stringify(allChunks));
  console.log(`✓ Obsidian index: ${allChunks.length} chunks (git-ignored, stays private)`);
  return allChunks;
}

const isMain = process.argv[1]?.includes("index-rag");
if (isMain) {
  console.log("\n=== Semantic RAG Indexer ===\n");
  await buildIndex({ rebuild: process.argv.includes("--rebuild") });
  console.log("\n── Obsidian vaults ──");
  await buildObsidianIndex();
  console.log("\nQuery with: node tools/query-rag.mjs \"your question\"");
}
