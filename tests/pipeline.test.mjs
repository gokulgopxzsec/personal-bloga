// Pipeline test suite — every algorithm in the content system, tested.
// Run: npm test   (node --test tests/)

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { keywordVector, cosineSparse, cosineDense, hybridScore } from "../tools/embeddings.mjs";
import { splitSentences, computeStylometrics, compareToBaseline, lexicalSurprise } from "../tools/stylometrics.mjs";
import { computePCR, computeMaxPain } from "../tools/options-quant.mjs";
import { computeIVRank, detectRegime, verdictAccuracy } from "../tools/quant-advanced.mjs";
import { detectEvents } from "../tools/event-detector.mjs";
import { analyzeContent } from "../tools/ai-detection-shield.mjs";
import { rankContent } from "../tools/content-rank.mjs";
import { computeTrend } from "../tools/data-cache.mjs";

const HUMAN_TEXT = `So here's the thing. I didn't plan any of this.

Last march my friend Shruthi lost ₹4,200 worth of orders because Instagram DMs buried them. Three customers, gone. She called me at 11pm, furious.

I built the first version of makeforme in 9 days. Ugly? Extremely. But it worked, and she stopped losing orders.

Now 13 sellers use it. Not a huge number. It's real though, and every one of them pays ₹99 a month.

Would I do it again? In a heartbeat.`;

const AI_TEXT = `It is important to note that building a successful startup requires careful planning. Moreover, entrepreneurs should leverage various tools to streamline their operations. Additionally, it is worth mentioning that customer feedback is essential for growth. Furthermore, companies must optimize their processes to remain competitive. Consequently, businesses that utilize robust frameworks typically achieve better outcomes. In conclusion, the ecosystem of modern entrepreneurship demands a holistic approach.`;

// ── Embeddings ──
describe("embeddings", () => {
  test("keywordVector counts meaningful words", () => {
    const v = keywordVector("startup startup founder india");
    assert.equal(v.startup, 2);
    assert.equal(v.founder, 1);
  });
  test("keywordVector drops stopwords and short words", () => {
    const v = keywordVector("this that with from is a");
    assert.deepEqual(v, {});
  });
  test("cosineSparse identical vectors = 1", () => {
    const v = keywordVector("bitcoin market analysis");
    assert.ok(Math.abs(cosineSparse(v, v) - 1) < 1e-6);
  });
  test("cosineSparse disjoint vectors = 0", () => {
    assert.equal(cosineSparse({ alpha: 1 }, { beta: 1 }), 0);
  });
  test("cosineDense identical = 1, orthogonal = 0", () => {
    assert.ok(Math.abs(cosineDense([1, 0], [1, 0]) - 1) < 1e-6);
    assert.ok(Math.abs(cosineDense([1, 0], [0, 1])) < 1e-6);
  });
  test("cosineDense handles mismatched/empty input safely", () => {
    assert.equal(cosineDense(null, [1]), 0);
    assert.equal(cosineDense([1, 2], [1]), 0);
  });
  test("hybridScore falls back to sparse when no dense vec", () => {
    const kw = keywordVector("nifty options trading");
    const chunk = { keywords: kw };
    assert.ok(hybridScore(null, kw, chunk) > 0.99);
  });
  test("hybridScore blends dense and sparse 75/25", () => {
    const chunk = { vec: [1, 0], keywords: { foo: 1 } };
    const s = hybridScore([1, 0], { foo: 1 }, chunk);
    assert.ok(Math.abs(s - 1) < 1e-6);
  });
});

// ── Stylometrics ──
describe("stylometrics", () => {
  test("splitSentences splits on terminal punctuation", () => {
    const s = splitSentences("One sentence here. Another one follows! A third question?");
    assert.equal(s.length, 3);
  });
  test("human text has higher burstiness than AI text", () => {
    const h = computeStylometrics(HUMAN_TEXT);
    const a = computeStylometrics(AI_TEXT);
    assert.ok(h.burstiness > a.burstiness, `human ${h.burstiness} should exceed ai ${a.burstiness}`);
  });
  test("human text has contractions, AI sample has none", () => {
    assert.ok(computeStylometrics(HUMAN_TEXT).contractionRate > 0);
    assert.equal(computeStylometrics(AI_TEXT).contractionRate, 0);
  });
  test("fragment rate detected in punchy writing", () => {
    assert.ok(computeStylometrics(HUMAN_TEXT).fragmentRate > 0);
  });
  test("number density reflects hard numbers", () => {
    assert.ok(computeStylometrics(HUMAN_TEXT).numberDensity > 0);
  });
  test("opener entropy in [0,1]", () => {
    const m = computeStylometrics(HUMAN_TEXT);
    assert.ok(m.openerEntropy >= 0 && m.openerEntropy <= 1);
  });
  test("compareToBaseline penalizes low-variance text", () => {
    const baseline = { metrics: { burstiness: { mean: 0.6, std: 0.07 }, openerEntropy: { mean: 0.72, std: 0.06 }, contractionRate: { mean: 1.5, std: 0.4 }, fragmentRate: { mean: 0.1, std: 0.04 }, paraLenCV: { mean: 0.6, std: 0.2 }, numberDensity: { mean: 1.2, std: 0.5 } } };
    const ai = compareToBaseline(computeStylometrics(AI_TEXT), baseline);
    const human = compareToBaseline(computeStylometrics(HUMAN_TEXT), baseline);
    assert.ok(ai.humanness < human.humanness, `ai ${ai.humanness} should score below human ${human.humanness}`);
  });
  test("compareToBaseline returns null without baseline", () => {
    assert.equal(compareToBaseline(computeStylometrics(HUMAN_TEXT), null), null);
  });
  test("lexicalSurprise higher for rare vocabulary", () => {
    const ref = { the: 1000, market: 50, is: 800, good: 100, __total: 1950, __vocab: 5 };
    const common = lexicalSurprise("the market is good the market is good the market is good the market is good the market is good the market", ref);
    const rare = lexicalSurprise("zygomorphic quixotic phantasm ephemeral xylophone quasar nebula vortex zephyr labyrinth obsidian raconteur silhouette juxtapose mellifluous serendipity petrichor luminous ineffable sonder vellichor", ref);
    assert.ok(rare > common);
  });
  test("lexicalSurprise null for short text or no ref", () => {
    assert.equal(lexicalSurprise("too short", { __total: 10, __vocab: 2 }), null);
    assert.equal(lexicalSurprise(HUMAN_TEXT, null), null);
  });
});

// ── Options quant ──
describe("options-quant", () => {
  const mk = (oi, vol = 100) => ({ strike: 100, oi, volume: vol });
  test("computePCR flags extreme put buying as bullish", () => {
    const r = computePCR([mk(100)], [mk(200)]);
    assert.equal(r.interpretation.signal, "BULLISH");
    assert.ok(Math.abs(r.oiPCR - 2) < 1e-6);
  });
  test("computePCR flags extreme call buying as bearish", () => {
    const r = computePCR([mk(200)], [mk(50)]);
    assert.equal(r.interpretation.signal, "BEARISH");
  });
  test("computePCR handles empty data", () => {
    const r = computePCR([], []);
    assert.equal(r.interpretation.signal, "NO_DATA");
  });
  test("computeMaxPain finds minimal-pain strike", () => {
    const calls = [{ strike: 100, oi: 100 }, { strike: 110, oi: 50 }];
    const puts = [{ strike: 100, oi: 100 }, { strike: 90, oi: 50 }];
    const r = computeMaxPain(calls, puts);
    assert.equal(r.maxPainStrike, 100);
  });
  test("computeMaxPain safe on empty chains", () => {
    const r = computeMaxPain([], []);
    assert.equal(r.maxPainStrike, 0);
    assert.equal(r.noData, true);
  });
});

// ── Quant advanced ──
describe("quant-advanced", () => {
  test("IV rank needs 5+ samples", () => {
    const r = computeIVRank([{ iv: 12 }, { iv: 14 }], 13);
    assert.equal(r.rank, null);
  });
  test("IV rank 100 at historical high", () => {
    const hist = [10, 11, 12, 13, 14].map(iv => ({ iv }));
    const r = computeIVRank(hist, 14);
    assert.equal(r.rank, 100);
    assert.equal(r.regime, "IV_EXPENSIVE");
  });
  test("IV rank 0 at historical low", () => {
    const hist = [10, 11, 12, 13, 14].map(iv => ({ iv }));
    assert.equal(computeIVRank(hist, 10).rank, 0);
  });
  test("detectRegime identifies clean uptrend", () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 + i * 2);
    const r = detectRegime(closes);
    assert.equal(r.regime, "TRENDING_UP");
  });
  test("detectRegime identifies downtrend", () => {
    const closes = Array.from({ length: 40 }, (_, i) => 200 - i * 2);
    assert.equal(detectRegime(closes).regime, "TRENDING_DOWN");
  });
  test("detectRegime identifies chop", () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 + (i % 2 === 0 ? 8 : -8));
    const r = detectRegime(closes);
    assert.ok(["VOLATILE_CHOP", "QUIET_RANGE"].includes(r.regime));
  });
  test("detectRegime UNKNOWN on short series", () => {
    assert.equal(detectRegime([1, 2, 3]).regime, "UNKNOWN");
  });
  test("verdictAccuracy grades predictions against next move", () => {
    const hist = [
      { t: "1", u: 100, verdict: "BULLISH" },
      { t: "2", u: 110, verdict: "BEARISH" },
      { t: "3", u: 105, verdict: null },
    ];
    const r = verdictAccuracy(hist);
    assert.equal(r.samples, 2);
    assert.equal(r.hitRate, 100);
  });
  test("verdictAccuracy empty history", () => {
    assert.equal(verdictAccuracy([]).samples, 0);
  });
  test("computeTrend reports direction from history", () => {
    const r = computeTrend([{ t: "2026-01-01T00:00:00Z", u: 100, pcr: 1.0 }, { t: "2026-01-02T00:00:00Z", u: 110, pcr: 1.3 }]);
    assert.equal(r.spotDirection, "UP");
    assert.equal(r.pcrTrend, "PUTS_BUILDING");
  });
});

// ── Event detector ──
describe("event-detector", () => {
  test("detects big BTC daily move", () => {
    const events = detectEvents({ BITCOIN: { error: null, changes: { day: { pct: -5.2 }, week: { pct: 1 } }, technicals: { rsi14: 50, resistance: 70000, support: 60000 }, currentPrice: 65000 } });
    assert.ok(events.some(e => e.key === "btc-daily-move"));
  });
  test("detects extreme PCR on NIFTY", () => {
    const events = detectEvents({ NIFTY: { hasData: true, underlyingValue: 24000, quant: { pcr: { oiPCR: 1.7 }, maxPain: { maxPainStrike: 24000 } }, advanced: {} } });
    assert.ok(events.some(e => e.key === "nifty-pcr-high"));
  });
  test("quiet markets produce no events", () => {
    const events = detectEvents({ BITCOIN: { error: null, changes: { day: { pct: 0.5 }, week: { pct: 1 } }, technicals: { rsi14: 50, resistance: 90000, support: 50000 }, currentPrice: 65000 } });
    assert.equal(events.length, 0);
  });
  test("events sorted by severity descending", () => {
    const events = detectEvents({
      BITCOIN: { error: null, changes: { day: { pct: 6 }, week: { pct: 2 } }, technicals: { rsi14: 75, resistance: 90000, support: 50000 }, currentPrice: 65000 },
    });
    for (let i = 1; i < events.length; i++) assert.ok(events[i - 1].severity >= events[i].severity);
  });
});

// ── Shield ──
describe("ai-detection-shield", () => {
  test("human text outscores AI text", () => {
    const h = analyzeContent(HUMAN_TEXT, "h.mdx");
    const a = analyzeContent(AI_TEXT, "a.mdx");
    assert.ok(h.humanScore > a.humanScore, `human ${h.humanScore} vs ai ${a.humanScore}`);
  });
  test("buzzwords get flagged", () => {
    const a = analyzeContent(AI_TEXT, "a.mdx");
    assert.ok(a.flags.some(f => f.rule.includes("buzzword") || f.rule.includes("Academic")));
  });
  test("scores stay within 0-100", () => {
    for (const t of [HUMAN_TEXT, AI_TEXT, "short."]) {
      const r = analyzeContent(t, "x.mdx");
      assert.ok(r.humanScore >= 0 && r.humanScore <= 100);
    }
  });
  test("baseline comparison lowers AI score further when profile provided", () => {
    const baseline = { metrics: { burstiness: { mean: 0.6, std: 0.07 }, openerEntropy: { mean: 0.72, std: 0.06 }, contractionRate: { mean: 1.5, std: 0.4 }, fragmentRate: { mean: 0.1, std: 0.04 }, paraLenCV: { mean: 0.6, std: 0.2 }, numberDensity: { mean: 1.2, std: 0.5 } }, wordFreq: null };
    const without = analyzeContent(AI_TEXT, "a.mdx", null);
    const withProfile = analyzeContent(AI_TEXT, "a.mdx", baseline);
    assert.ok(withProfile.humanScore <= without.humanScore);
  });
});

// ── Content rank ──
describe("content-rank", () => {
  test("composite in 0-100 with all five algorithms present", async () => {
    const r = await rankContent(HUMAN_TEXT, { title: "How i lost ₹4,200 of orders and built a product", description: "A real story about Instagram DM chaos and what i built because of it, with numbers.", tags: ["startup", "founder"] }, null);
    assert.ok(r.composite >= 0 && r.composite <= 100);
    for (const k of ["humanness", "coherence", "rhythm", "density", "hookSeo"]) {
      assert.ok(r.algorithms[k], `missing algorithm ${k}`);
      assert.ok(r.algorithms[k].score >= 0 && r.algorithms[k].score <= 100);
    }
  });
  test("specific numeric writing beats vague writing on density", async () => {
    const vague = await rankContent("Many people think various things about stuff. Several folks say numerous items matter a lot. Things happen. Stuff changes. A lot of people care about many things and stuff like that generally.", { title: "t", description: "d", tags: [] }, null);
    const specific = await rankContent(HUMAN_TEXT, { title: "t", description: "d", tags: [] }, null);
    assert.ok(specific.algorithms.density.score > vague.algorithms.density.score);
  });
  test("hook/seo rewards title with number and good description", async () => {
    const good = await rankContent(HUMAN_TEXT, { title: "How 13 sellers taught me what actually matters in ecommerce", description: "Real lessons from the first 13 paying customers of a bootstrapped Indian SaaS product.", tags: ["a", "b"] }, null);
    const bad = await rankContent(HUMAN_TEXT, { title: "Thoughts", description: "", tags: [] }, null);
    assert.ok(good.algorithms.hookSeo.score > bad.algorithms.hookSeo.score);
  });
});
