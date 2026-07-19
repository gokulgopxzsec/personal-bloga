// Universal web crawler for RAG knowledge base
// Usage: node tools/crawl.mjs <url> [<url> ...]

import * as cheerio from "cheerio";
import * as fs from "fs";
import * as path from "path";

const KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge-base");

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });
  return await res.text();
}

function extractContent(html, url) {
  const $ = cheerio.load(html);
  
  // Remove unwanted elements
  $("script, style, nav, footer, header, iframe, .ad, .ads, .sidebar").remove();
  
  const title = $("title").text() || $("h1").first().text() || url;
  const body = $("body");
  
  // Get all meaningful text
  const texts = [];
  
  body.find("h1, h2, h3, h4, h5, h6").each((_, el) => {
    const text = $(el).text().trim();
    if (text) texts.push(`\n## ${text}`);
  });
  
  body.find("p").each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length > 20) texts.push(text);
  });
  
  body.find("li").each((_, el) => {
    const text = $(el).text().trim();
    if (text) texts.push(`- ${text}`);
  });
  
  body.find("table").each((_, el) => {
    const rows = [];
    $(el).find("tr").each((_, tr) => {
      const cells = [];
      $(tr).find("td, th").each((_, td) => {
        cells.push($(td).text().trim());
      });
      if (cells.length > 0) rows.push(cells.join(" | "));
    });
    if (rows.length > 0) {
      texts.push("\n" + rows.join("\n"));
    }
  });

  const content = texts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { title, content };
}

function saveSource(url, data) {
  const safeName = url
    .replace(/https?:\/\//, "")
    .replace(/[^a-zA-Z0-9]/g, "_")
    .slice(0, 100);
  const filePath = path.join(KNOWLEDGE_DIR, `${safeName}.json`);
  fs.writeFileSync(filePath, JSON.stringify({ url, ...data }, null, 2));
  return filePath;
}

// Main — only http(s) args count as URLs (orchestrator passes its command name through)
const urls = process.argv.slice(2).filter(a => a.startsWith("http"));
if (urls.length === 0) {
  // Read from URLs file, skipping comments and blank lines
  const urlFile = path.join(KNOWLEDGE_DIR, "sources.txt");
  if (fs.existsSync(urlFile)) {
    urls.push(...fs.readFileSync(urlFile, "utf-8").split("\n")
      .map(l => l.trim())
      .filter(l => l.startsWith("http")));
  }
}

if (urls.length === 0) {
  console.log("Usage: node tools/crawl.mjs <url1> <url2> ...");
  console.log("Or: put URLs in knowledge-base/sources.txt");
  process.exit(1);
}

console.log(`\n=== Universal Web Crawler ===`);
console.log(`Targets: ${urls.length} URLs\n`);

for (const url of urls) {
  try {
    process.stdout.write(`Crawling: ${url} ... `);
    const html = await fetchPage(url);
    const data = extractContent(html, url);
    const filePath = saveSource(url, data);
    const charCount = data.content.length;
    console.log(`✓ ${charCount} chars saved to ${path.basename(filePath)}`);
  } catch (err) {
    console.log(`✗ Error: ${err.message}`);
  }
}

console.log(`\nDone. All sources saved to knowledge-base/\n`);
console.log("Next step: Run 'node tools/index-rag.mjs' to embed and index everything.");
