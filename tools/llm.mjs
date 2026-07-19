// LLM provider abstraction — free options only, auto-detected in order:
//
//   1. Ollama        — fully local, zero cost, no key (http://localhost:11434)
//   2. Groq          — free tier, set GROQ_API_KEY (console.groq.com)
//   3. Gemini        — free tier ~1500 req/day, set GEMINI_API_KEY (aistudio.google.com)
//   4. OpenRouter    — :free models, set OPENROUTER_API_KEY (openrouter.ai)
//   5. Anthropic     — optional, only if ANTHROPIC_API_KEY is set (paid)
//
// All exposed through one call: generate(messages, system) → string.

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.1";

async function ollamaAvailable() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return false;
    const data = await res.json();
    return (data.models || []).length > 0 ? data.models : false;
  } catch { return false; }
}

async function openaiCompatible(url, key, model, messages, system, extraHeaders = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, ...messages],
      max_tokens: 4000,
      temperature: 0.9,
    }),
  });
  if (!res.ok) throw new Error(`${url.split("/")[2]} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

export async function detectProvider() {
  const models = await ollamaAvailable();
  if (models) {
    const model = models.some(m => m.name.startsWith(OLLAMA_MODEL)) ? OLLAMA_MODEL : models[0].name;
    return {
      name: `ollama (${model}, local, free)`,
      free: true,
      generate: async (messages, system) => {
        // First call after boot can 500 while the model loads — retry once
        for (let attempt = 0; ; attempt++) {
          const res = await fetch(`${OLLAMA_URL}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model, stream: false, messages: [{ role: "system", content: system }, ...messages], options: { num_predict: 4000, temperature: 0.9 } }),
          });
          if (res.ok) return (await res.json()).message?.content || "";
          if (attempt >= 1) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 150)}`);
          await new Promise(r => setTimeout(r, 4000));
        }
      },
    };
  }
  if (process.env.GROQ_API_KEY) {
    const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
    return {
      name: `groq (${model}, free tier)`,
      free: true,
      generate: (m, s) => openaiCompatible("https://api.groq.com/openai/v1/chat/completions", process.env.GROQ_API_KEY, model, m, s),
    };
  }
  if (process.env.GEMINI_API_KEY) {
    const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
    return {
      name: `gemini (${model}, free tier)`,
      free: true,
      generate: async (messages, system) => {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: system }] },
            contents: messages.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
            generationConfig: { maxOutputTokens: 4000, temperature: 0.9 },
          }),
        });
        if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "";
      },
    };
  }
  if (process.env.OPENROUTER_API_KEY) {
    const model = process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free";
    return {
      name: `openrouter (${model})`,
      free: true,
      generate: (m, s) => openaiCompatible("https://openrouter.ai/api/v1/chat/completions", process.env.OPENROUTER_API_KEY, model, m, s),
    };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    const model = process.env.BLOG_MODEL || "claude-sonnet-5";
    return {
      name: `anthropic (${model}, paid)`,
      free: false,
      generate: async (messages, system) => {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model, max_tokens: 4000, system, messages }),
        });
        if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 200)}`);
        return (await res.json()).content?.map(b => b.text || "").join("") || "";
      },
    };
  }
  return null;
}

const isMain = process.argv[1]?.includes("llm.mjs");
if (isMain) {
  const p = await detectProvider();
  if (!p) {
    console.log(`No LLM provider available. Free options:
  1. Install Ollama (ollama.com) then: ollama pull llama3.1   ← fully local, recommended
  2. Free API key from console.groq.com  → set GROQ_API_KEY
  3. Free API key from aistudio.google.com → set GEMINI_API_KEY
  4. Free models via openrouter.ai → set OPENROUTER_API_KEY`);
  } else {
    console.log(`Provider: ${p.name}`);
    const out = await p.generate([{ role: "user", content: "Say 'pipeline online' and nothing else." }], "You are a test.");
    console.log(`Response: ${out.slice(0, 100)}`);
  }
}
