// Model Bench — runs every installed Ollama model through the same blog-writing
// task and scores each draft with shield v3 + the 5-algorithm ranker.
// Two outputs: a console leaderboard, and vector-store/model-bench.json —
// which doubles as raw material for "i benchmarked local llms" posts.
//
// Models containing "/" (e.g. oc/deepseek-v4-flash-free, auto/best-chat) are
// routed through the OmniRoute gateway (needs OMNIROUTE_API_KEY); everything
// else goes to Ollama. Both can be mixed in one --models run.
//
// Usage: node tools/model-bench.mjs ["topic"]
//        node tools/model-bench.mjs --models qwen2.5:7b-instruct,oc/big-pickle

import * as fs from "fs";
import * as path from "path";
import { retrieve } from "./query-rag.mjs";
import { loadStyleProfile } from "./style-learner.mjs";
import { analyzeContent } from "./ai-detection-shield.mjs";
import { rankContent } from "./content-rank.mjs";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OUTPUT = path.join(process.cwd(), "vector-store", "model-bench.json");
const DEFAULT_TOPIC = "how small indian sellers can use ai tools without spending money";

const SYSTEM = `You are ghostwriting a blog post for an indie founder. Rules: first person, honest, short paragraphs, contractions, no bullet lists, no em dashes, no buzzwords (leverage, seamless, robust), specific numbers only if given in the context, 500-700 words. Output the post body only, starting with the first paragraph.`;

async function listModels() {
  const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2000) });
  if (!res.ok) throw new Error("Ollama not reachable");
  return (await res.json()).models.map(m => m.name);
}

const GATEWAY_URL = (process.env.OMNIROUTE_URL || "http://localhost:20128/v1").replace(/\/$/, "");

async function generateViaGateway(model, prompt) {
  const start = Date.now();
  const res = await fetch(`${GATEWAY_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OMNIROUTE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model, stream: false,
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }],
      max_tokens: 1200, temperature: 0.9,
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`gateway ${res.status}: ${(await res.text()).slice(0, 120)}`);
  const data = await res.json();
  const seconds = Math.round((Date.now() - start) / 100) / 10;
  const evalTokens = data.usage?.completion_tokens || 0;
  return {
    text: data.choices?.[0]?.message?.content || "",
    seconds, evalTokens,
    tokensPerSec: evalTokens ? Math.round((evalTokens / seconds) * 10) / 10 : null,
    servedBy: data.model || model,
  };
}

async function generateWith(model, prompt) {
  if (model.includes("/")) return generateViaGateway(model, prompt);
  const start = Date.now();
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model, stream: false,
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }],
      options: { num_predict: 1200, temperature: 0.9 },
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  const data = await res.json();
  return {
    text: data.message?.content || "",
    seconds: Math.round((Date.now() - start) / 100) / 10,
    evalTokens: data.eval_count || 0,
    tokensPerSec: data.eval_duration ? Math.round((data.eval_count / (data.eval_duration / 1e9)) * 10) / 10 : null,
  };
}

export async function benchModels(topic = DEFAULT_TOPIC, only = null) {
  const profile = loadStyleProfile();
  // Gateway models ("x/y") are taken as-is; bare names must be installed in Ollama
  const all = await listModels().catch(() => []);
  const models = only ? only.filter(m => m.includes("/") || all.includes(m)) : all;
  if (models.length === 0) {
    console.log("No Ollama models found. Install some: ollama pull llama3.1");
    return null;
  }

  console.log(`Topic: "${topic}"`);
  console.log(`Models: ${models.join(", ")}\n`);

  const context = (await retrieve(topic, 6)).map(r => r.text).join("\n\n").slice(0, 4000);
  const prompt = `Write the post on: "${topic}"\n\nResearch context (use facts, never copy sentences):\n${context}`;

  const results = [];
  for (const model of models) {
    process.stdout.write(`▸ ${model} ... `);
    try {
      const gen = await generateWith(model, prompt);
      if (gen.text.split(/\s+/).length < 100) throw new Error("output too short");
      const shield = analyzeContent(gen.text, model, profile);
      const rank = await rankContent(gen.text, { title: topic, description: topic, tags: ["ai"] }, profile);
      results.push({
        model,
        servedBy: gen.servedBy,
        words: gen.text.split(/\s+/).length,
        seconds: gen.seconds,
        tokensPerSec: gen.tokensPerSec,
        shield: shield.humanScore,
        composite: rank.composite,
        scores: Object.fromEntries(Object.entries(rank.algorithms).map(([k, v]) => [k, v.score])),
        sample: gen.text.slice(0, 400),
      });
      console.log(`${gen.seconds}s | shield ${shield.humanScore} | composite ${rank.composite}`);
    } catch (err) {
      console.log(`✗ ${err.message}`);
      results.push({ model, error: err.message });
    }
  }

  const ok = results.filter(r => !r.error);
  ok.sort((a, b) => b.composite - a.composite);

  console.log(`\n── Leaderboard ──`);
  console.log(`  model                          write   shield  quality  speed`);
  for (const r of ok) {
    console.log(`  ${r.model.padEnd(30)} ${String(r.seconds + "s").padEnd(7)} ${String(r.shield).padEnd(7)} ${String(r.composite).padEnd(8)} ${r.tokensPerSec || "?"} tok/s`);
  }
  if (ok.length >= 2) {
    const best = ok[0];
    console.log(`\n  Winner: ${best.model} — quality ${best.composite}/100 in ${best.seconds}s`);
    const envVar = best.model.includes("/") ? "OMNIROUTE_MODEL" : "OLLAMA_MODEL";
    console.log(`  Set it as default:  $env:${envVar} = "${best.model}"`);
  }

  const report = { benchedAt: new Date().toISOString(), topic, results };
  fs.writeFileSync(OUTPUT, JSON.stringify(report, null, 2));
  console.log(`\n✓ Full report (with samples): vector-store/model-bench.json`);
  return report;
}

const isMain = process.argv[1]?.includes("model-bench");
if (isMain) {
  console.log(`\n╔═══════════════════════════════════════════════╗`);
  console.log(`║      MODEL BENCH — local LLM shootout         ║`);
  console.log(`╚═══════════════════════════════════════════════╝\n`);
  const args = process.argv.slice(2);
  const mIdx = args.indexOf("--models");
  const only = mIdx > -1 ? args[mIdx + 1]?.split(",") : null;
  const topicArgs = mIdx > -1 ? [...args.slice(0, mIdx), ...args.slice(mIdx + 2)] : args;
  await benchModels(topicArgs.join(" ") || DEFAULT_TOPIC, only);
}
