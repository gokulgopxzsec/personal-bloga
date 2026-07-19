// AI Detection Shield v3 — rule engine + statistical layer.
// Rules catch known detector tells; the statistical layer compares each post
// against a learned human baseline (vector-store/style-profile.json built by
// style-learner.mjs): sentence burstiness, opener entropy, contraction rate,
// paragraph rhythm, and lexical surprise vs a 43k-word human corpus.
//
// Usage: node tools/ai-detection-shield.mjs [path/to/post.mdx]
//        node tools/ai-detection-shield.mjs ALL    (scan all posts, CI mode)

import * as fs from "fs";
import * as path from "path";
import { computeStylometrics, compareToBaseline, lexicalSurprise } from "./stylometrics.mjs";
import { loadStyleProfile } from "./style-learner.mjs";

const POSTS_DIR = path.join(process.cwd(), "content", "posts");

const FIRST_PERSON_WORDS = new Set(["i", "we", "my", "our"]);
const REWRITE_TEMPLATES = {
  i: ["Honestly, ", "Look, ", "Here's the thing: ", "What i found: ", "For me, ", ""],
};

const FLAG_PATTERNS = {
  overusedTransitions: {
    weight: 2, label: "Overused transitions",
    patterns: [/\b(however|moreover|furthermore|nevertheless|nonetheless|consequently|subsequently|additionally|in addition|in contrast|on the other hand|in conclusion|to summarize|ultimately)\b/gi],
    hint: "Replace with 'but', 'and', 'so', or just start a new sentence. Humans don't use 'moreover'.",
  },
  perfectGrammar: {
    weight: 1, label: "Suspiciously perfect grammar",
    patterns: [/[A-Z][a-z]{2,},\s+(and|but|or|so|yet|for|nor)\s+/g, /^(It is|This is|There is|There are|One can|One must|It should be noted)/gm],
    hint: "Start with a lowercase fragment or a conversational opener. Human writing has fragments.",
  },
  listSpeak: {
    weight: 3, label: "Structured list pattern",
    patterns: [/^\d+\.\s/gm, /^-\s/gm, /^(firstly|secondly|thirdly|finally)\b/gim],
    hint: "Lists are AI dead giveaways. Turn each bullet into a paragraph or remove numbering.",
  },
  emotionalFlatness: {
    weight: 2, label: "Emotionally flat tone",
    patterns: [/it is important to note/gi, /it is worth mentioning/gi, /it should be noted/gi, /it can be argued/gi, /it is clear that/gi, /undoubtedly|indubitably/gi],
    hint: "Replace with a specific feeling or opinion. 'This pissed me off' beats 'It is important to note'.",
  },
  hedging: {
    weight: 2, label: "Hedging language",
    patterns: [/\b(may|might|could|perhaps|possibly|probably|arguably|somewhat|relatively|generally|typically|often|usually)\b/gi],
    hint: "Commit. Say 'This is' not 'This could be'. Real people have opinions.",
  },
  academicVocabulary: {
    weight: 3, label: "Academic/buzzword vocabulary",
    patterns: [/\b(utilize|leverage|optimize|holistic|paradigm|synergy|streamline|facilitate|implement|robust|seamless|transformative|empower|ecosystem)\b/gi],
    hint: "Use 'use', 'improve', 'simplify'. 'Leverage' is the #1 word detectors flag.",
  },
};

export function analyzeContent(text, fileName, styleProfile = null) {
  const lines = text.split("\n");
  const sentences = text.match(/[^.!?\n]+[.!?](\s|$)/g) || [text];
  const words = text.split(/\s+/).filter(Boolean);

  let totalScore = 100;
  const flags = [];

  // ── Detect writing style ──
  const firstPersonSentences = sentences.filter(s => /^\s*(i|we|my)\b/i.test(s.trim())).length;
  const isFirstPerson = firstPersonSentences / sentences.length > 0.3;

  // ── Check each flag pattern ──
  for (const rule of Object.values(FLAG_PATTERNS)) {
    let count = 0;
    const matches = [];
    for (const p of rule.patterns) {
      const found = [...text.matchAll(p)];
      count += found.length;
      matches.push(...found.map(m => ({
        match: m[0]?.substring(0, 60),
        line: text.substring(0, m.index).split("\n").length,
      })));
    }
    if (count > 0) {
      const deduction = Math.min(count * rule.weight, 20);
      totalScore -= deduction;
      flags.push({ rule: rule.label, count, deduction, matches: matches.slice(0, 3), hint: rule.hint, severity: deduction >= 10 ? "high" : deduction >= 5 ? "medium" : "low" });
    }
  }

  // ── Long sentences ──
  const longSentences = sentences.filter(s => s.split(/\s+/).filter(Boolean).length > 25);
  if (longSentences.length > 0) {
    const deduction = Math.min(longSentences.length * 1.5, 15);
    totalScore -= deduction;
    flags.push({
      rule: "AI-length sentences", count: longSentences.length, deduction,
      matches: longSentences.slice(0, 3).map(s => ({ match: s.trim().substring(0, 80) })),
      hint: "Break into shorter sentences. 25+ words feels AI-written.", severity: "low",
    });
  }

  // ── Paragraph uniformity ──
  const paras = text.split(/\n\s*\n/).filter(p => p.trim());
  const mediumParas = paras.filter(p => { const s = p.match(/[.!?\n]/g)?.length || 1; return s >= 3 && s <= 5; });
  if (paras.length >= 3 && mediumParas.length / paras.length > 0.6) {
    totalScore -= 8;
    flags.push({
      rule: "Uniform paragraph length", count: Math.round(mediumParas.length / paras.length * 100), deduction: 8,
      matches: [{ match: `${Math.round(mediumParas.length / paras.length * 100)}% of paragraphs are 3-5 sentences` }],
      hint: "Throw in a 1-sentence paragraph or a long 8-sentence one. Uniformity = AI.", severity: "medium",
    });
  }

  // ── Repetitive sentence starts ──
  const startWords = sentences.filter(s => s.trim()).map(s => s.trim().split(/\s+/)[0]?.toLowerCase()).filter(Boolean);
  const freq = {};
  for (const w of startWords) freq[w] = (freq[w] || 0) + 1;

  // In first-person, be more lenient with "i" but still flag other repeats
  const repeated = Object.entries(freq)
    .filter(([w, c]) => {
      if (isFirstPerson && FIRST_PERSON_WORDS.has(w)) return c >= 8; // lenient
      return c >= 3;
    })
    .sort((a, b) => b[1] - a[1]);

  if (repeated.length > 0) {
    const totalRepeats = repeated.reduce((a, [, c]) => a + c, 0);
    let deduction = Math.min(totalRepeats * 1.2, 12);
    totalScore -= deduction;

    // Suggest rewrites
    const suggestions = repeated.slice(0, 3).map(([w, c]) => {
      if (FIRST_PERSON_WORDS.has(w) && isFirstPerson) {
        return `"${w}" starts ${c} sentences (normal for first-person). Try alternating with ${REWRITE_TEMPLATES[w]?.join(", ") || "varied openings"}.`;
      }
      return `"${w}" starts ${c} sentences. Alternate with synonyms or merge sentences.`;
    });

    flags.push({
      rule: "Repetitive sentence starts", count: totalRepeats, deduction,
      matches: suggestions.slice(0, 3).map(s => ({ match: s })),
      hint: "Vary your openings. Use 'So', 'Then', 'Honestly', or drop the first word entirely.", severity: deduction >= 8 ? "high" : "medium",
    });
  }

  // ── No contractions ──
  const hasContractions = /\b(don't|can't|won't|it's|i'm|you're|they're|we're|i've|i'd|that's|isn't|aren't|wasn't|weren't|hasn't|haven't|doesn't|didn't|couldn't|wouldn't|shouldn't)\b/i.test(text);
  const hasCasualCont = /\b(dont|cant|wont|its|im|youre|theyre|were|ive|id|thats|isnt|arent|wasnt|werent|hasnt|havent|doesnt|didnt|couldnt|wouldnt|shouldnt)\b/i.test(text);
  if (!hasContractions && !hasCasualCont && words.length > 50) {
    totalScore -= 4;
    flags.push({
      rule: "No contractions", count: 1, deduction: 4,
      matches: [{ match: "Zero contractions in the entire post" }],
      hint: "Use 'don't', 'can't', 'it's', 'I'm'. Formal writing = AI flag.", severity: "low",
    });
  }

  // ── Perfect punctuation ──
  const contentLines = lines.filter(l => l.trim() && !l.trim().startsWith("#") && !l.trim().startsWith("import") && !l.trim().startsWith("export"));
  const noPunctLines = contentLines.filter(l => !/[.!?:"')\]}>]$/.test(l.trim()));
  if (noPunctLines.length === 0 && contentLines.length > 5) {
    totalScore -= 3;
    flags.push({
      rule: "Too-clean punctuation", count: 1, deduction: 3,
      matches: [{ match: "Every line ends with a period. Try a fragment somewhere." }],
      hint: "Real people misuse commas, write fragments, and occasionally skip capitals.", severity: "low",
    });
  }

  // ── Readability ──
  const avgSentenceWords = sentences.length > 0 ? Math.round(words.length / sentences.length * 10) / 10 : 0;
  const fleschReadingEase = sentences.length > 0 && words.length > 0
    ? Math.round(206.835 - 1.015 * (words.length / sentences.length) - 84.6 * (text.match(/[aeiou]/gi)?.length || 1) / words.length * 100) / 100
    : 0;

  // ── Statistical layer: compare against learned human baseline ──
  let stylometrics = null;
  let baselineComparison = null;
  let surprise = null;
  try {
    stylometrics = computeStylometrics(text);
    if (styleProfile) {
      baselineComparison = compareToBaseline(stylometrics, styleProfile);
      if (baselineComparison) {
        for (const d of baselineComparison.deviations) {
          totalScore -= d.penalty;
          flags.push({
            rule: `Human-baseline: ${d.metric}`, count: 1, deduction: d.penalty,
            matches: [{ match: `${d.metric} = ${d.value} vs human ${d.humanMean} (z=${d.z})` }],
            hint: d.hint, severity: d.penalty >= 8 ? "high" : d.penalty >= 4 ? "medium" : "low",
          });
        }
      }
      // Lexical surprise: AI text clusters in safe high-frequency vocabulary
      surprise = lexicalSurprise(text, styleProfile.wordFreq);
      if (surprise !== null && surprise < 9.5) {
        const penalty = Math.min(Math.round((9.5 - surprise) * 4), 10);
        totalScore -= penalty;
        flags.push({
          rule: "Low lexical surprise", count: 1, deduction: penalty,
          matches: [{ match: `${surprise.toFixed(1)} bits/word (human corpus ~10.5+)` }],
          hint: "Vocabulary is too generic. Use specific nouns, names, numbers, slang.", severity: penalty >= 6 ? "high" : "medium",
        });
      }
    }
  } catch {}

  // ── Verdict ──
  const adjusted = Math.max(0, Math.min(100, totalScore));
  const verdict = adjusted >= 85 ? "PASS ✅ — reads like a real person"
    : adjusted >= 70 ? "GOOD ENOUGH ⚡ — minor flags, likely passes most detectors"
    : adjusted >= 55 ? "WARNING ⚠️ — AI detectors may flag this"
    : "FAIL ❌ — will get flagged. Needs rewrite";

  const tips = flags.filter(r => r.deduction >= 4).map(r => `  • ${r.hint}`).join("\n");

  return {
    fileName: path.basename(fileName || ""),
    stats: { words: words.length, sentences: sentences.length, avgSentenceWords, fleschReadingEase: Math.max(0, Math.min(100, fleschReadingEase)), paragraphs: paras.length },
    humanScore: adjusted,
    stylometrics,
    baselineHumanness: baselineComparison?.humanness ?? null,
    lexicalSurprise: surprise !== null ? Math.round(surprise * 10) / 10 : null,
    flags: flags.sort((a, b) => b.deduction - a.deduction),
    verdict,
    improvementTips: tips,
  };
}

export function scanFile(filePath, styleProfile = null) {
  let content;
  try { content = fs.readFileSync(filePath, "utf-8"); } catch { return null; }
  const body = content.replace(/---[\s\S]*?---\n?/, "").trim();
  const analysis = analyzeContent(body, filePath, styleProfile ?? loadStyleProfile());

  const name = path.basename(filePath);
  const passEmoji = analysis.humanScore >= 85 ? "✅" : analysis.humanScore >= 70 ? "⚡" : analysis.humanScore >= 55 ? "⚠️" : "❌";
  console.log(`\n${passEmoji} ${name}`);
  console.log(`   Score: ${analysis.humanScore}/100  |  ${analysis.stats.words}w ${analysis.stats.sentences}s avg ${analysis.stats.avgSentenceWords}w/s`);
  console.log(`   ${analysis.verdict}`);

  for (const f of analysis.flags) {
    const sev = f.severity === "high" ? "🔴" : f.severity === "medium" ? "🟡" : "🟢";
    console.log(`   ${sev} ${f.rule} (${f.deduction} pts)`);
    for (const m of f.matches) {
      console.log(`      → ${m.match}`);
    }
  }

  if (analysis.improvementTips && analysis.humanScore < 85) {
    console.log(`\n${analysis.improvementTips}`);
  }

  return analysis;
}

async function main() {
  const target = process.argv[2];

  console.log(`╔═══════════════════════════════════════════════╗`);
  console.log(`║      AI DETECTION SHIELD  v3                 ║`);
  console.log(`╚═══════════════════════════════════════════════╝`);

  const profile = loadStyleProfile();
  console.log(profile
    ? `  Human baseline: ${profile.documents} docs / ${profile.totalWords.toLocaleString()} words (built ${profile.builtAt.slice(0, 10)})`
    : `  ⚠ No style profile — run 'node tools/style-learner.mjs' for statistical checks`);

  if (target === "ALL") {
    const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith(".mdx"));
    const results = [];
    let pass = 0, good = 0, warn = 0, fail = 0;

    for (const f of files) {
      const r = scanFile(path.join(POSTS_DIR, f), profile);
      if (r) {
        results.push(r);
        if (r.humanScore >= 85) pass++;
        else if (r.humanScore >= 70) good++;
        else if (r.humanScore >= 55) warn++;
        else fail++;
      }
    }

    const avgScore = results.length > 0 ? Math.round(results.reduce((a, r) => a + r.humanScore, 0) / results.length) : 0;
    const minScore = results.length > 0 ? Math.min(...results.map(r => r.humanScore)) : 0;

    console.log(`\n── Summary ──`);
    console.log(`   ${results.length} posts scanned | Avg: ${avgScore}/100 | Min: ${minScore}/100`);
    console.log(`   ✅ PASS: ${pass}  ⚡ GOOD: ${good}  ⚠️ WARN: ${warn}  ❌ FAIL: ${fail}`);

    // CI mode: fail if any post < 70 (GOOD ENOUGH threshold)
    const threshold = parseInt(process.env.SHIELD_THRESHOLD || "70", 10);
    if (minScore < threshold) {
      console.log(`\n❌ CI FAIL: minimum score ${minScore} < threshold ${threshold}`);
      process.exitCode = 1;
    } else {
      console.log(`\n✅ CI PASS: all posts above threshold ${threshold}`);
    }
  } else if (target) {
    scanFile(path.resolve(target), profile);
  } else {
    const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith(".mdx")).sort().reverse();
    if (files.length > 0) scanFile(path.join(POSTS_DIR, files[0]), profile);
    console.log(`\nUsage: node tools/ai-detection-shield.mjs [path/to/post.mdx | ALL]`);
  }
}

const isMain = process.argv[1]?.includes("ai-detection-shield");
if (isMain) main();
