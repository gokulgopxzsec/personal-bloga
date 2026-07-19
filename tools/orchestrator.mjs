// Orchestrator — one entry point for the whole content system.
//
//   node tools/orchestrator.mjs <command>
//
//   crawl          Crawl knowledge sources (knowledge-base/sources.txt)
//   index          Embed + index knowledge base (semantic vectors)
//   style          Scrape human blogs → rebuild style baseline
//   query "q"      Semantic search over the knowledge base
//   pulse          Market pulse: validate → extract signals → cross-verify
//   quant          Run the quant engine (indices + BTC + forex)
//   events         Detect notable market events worth writing about
//   generate "t"   Generate a post draft (RAG + Claude + critique loop)
//   shield         Run AI-detection shield on all posts
//   rank           5-algorithm content ranking of all posts
//   distribute     Build the backlink/distribution playbook
//   autopilot      quant → events → generate for top event → shield → rank
//   pipeline       crawl → index → generate "topic"

const command = process.argv[2];
const rest = process.argv.slice(3).join(" ");

async function autopilot() {
  console.log("╔═══════════════════════════════════════════════╗");
  console.log("║      AUTOPILOT — event to post, end to end    ║");
  console.log("╚═══════════════════════════════════════════════╝\n");

  console.log("[1/5] Quant engine...");
  const { runQuantAnalysis } = await import("./quant-engine.mjs");
  await runQuantAnalysis();

  console.log("\n[2/5] Detecting events...");
  const { detectEvents } = await import("./event-detector.mjs");
  const events = detectEvents();
  if (events.length === 0) {
    console.log("  No notable events. Not forcing content — that's the point.");
    return;
  }
  events.forEach(e => console.log(`  ${"!".repeat(e.severity)} ${e.headline}`));

  const top = events[0];
  console.log(`\n[3/5] Generating for top event: "${top.topic}"`);
  const { generatePost } = await import("./generate-blog.mjs");
  const result = await generatePost(top.topic, { publish: false });

  console.log("\n[4/5] Shield check on the draft...");
  const { scanFile } = await import("./ai-detection-shield.mjs");
  scanFile(result.path);

  console.log("\n[5/5] Distribution playbook refresh...");
  const { buildPlaybook } = await import("./backlink-agent.mjs");
  buildPlaybook();

  console.log(`\n✓ Autopilot complete. Draft at ${result.path}`);
  console.log("  Review the draft, move it to content/posts/, then run: npm run build");
}

switch (command) {
  case "crawl":
    await import("./crawl.mjs");
    break;
  case "index": {
    const { buildIndex } = await import("./index-rag.mjs");
    await buildIndex({ rebuild: process.argv.includes("--rebuild") });
    break;
  }
  case "style": {
    const { buildStyleProfile } = await import("./style-learner.mjs");
    await buildStyleProfile({ localOnly: process.argv.includes("--local") });
    break;
  }
  case "query": {
    if (!rest) { console.log('Usage: orchestrator query "your question"'); process.exit(1); }
    const { retrieve, loadIndex } = await import("./query-rag.mjs");
    const results = await retrieve(rest, 8);
    console.log(`\n=== Query: "${rest}" (${loadIndex().length} chunks) ===\n`);
    results.forEach((r, i) => console.log(`--- ${i + 1} (${(r.score * 100).toFixed(0)}%) ${r.source}\n${r.text.slice(0, 250)}...\n`));
    break;
  }
  case "pulse":
    await import("./market-pulse.mjs");
    break;
  case "quant": {
    const { runQuantAnalysis } = await import("./quant-engine.mjs");
    await runQuantAnalysis();
    break;
  }
  case "events": {
    const { detectEvents } = await import("./event-detector.mjs");
    const events = detectEvents();
    console.log(`\n=== Market Events (${events.length}) ===\n`);
    if (events.length === 0) console.log("Nothing notable. Markets are boring today — no forced content.");
    for (const e of events) console.log(`  ${"!".repeat(e.severity)} [${e.key}] ${e.headline}\n     → "${e.topic}"\n`);
    break;
  }
  case "generate": {
    if (!rest) { console.log('Usage: orchestrator generate "topic" [--publish]'); process.exit(1); }
    const { generatePost } = await import("./generate-blog.mjs");
    await generatePost(rest.replace(/\s*--publish\s*/, ""), { publish: process.argv.includes("--publish") });
    break;
  }
  case "shield": {
    const { scanFile } = await import("./ai-detection-shield.mjs");
    const fs = await import("fs");
    const path = await import("path");
    const dir = path.join(process.cwd(), "content", "posts");
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".mdx"))) scanFile(path.join(dir, f));
    break;
  }
  case "rank":
    process.argv[1] = "content-rank";
    process.argv.splice(2, 1);
    await import("./content-rank.mjs");
    break;
  case "distribute": {
    const { buildPlaybook } = await import("./backlink-agent.mjs");
    buildPlaybook(process.argv[3] || null);
    break;
  }
  case "bench": {
    const { benchModels } = await import("./model-bench.mjs");
    await benchModels(rest || undefined);
    break;
  }
  case "autopilot":
    await autopilot();
    break;
  case "pipeline": {
    await import("./crawl.mjs");
    const { buildIndex } = await import("./index-rag.mjs");
    await buildIndex();
    const topic = rest || "why indian small businesses need better tools";
    const { generatePost } = await import("./generate-blog.mjs");
    await generatePost(topic);
    break;
  }
  default:
    console.log(`
RAG Content System — commands:

  Knowledge     crawl | index [--rebuild] | style [--local] | query "q"
  Markets       quant | events | pulse
  Content       generate "topic" [--publish] | shield | rank
  Distribution  distribute [slug]
  Everything    autopilot     (quant → events → draft → shield → playbook)

Examples:
  node tools/orchestrator.mjs autopilot
  node tools/orchestrator.mjs generate "how upi changed small sellers" --publish
`);
}
