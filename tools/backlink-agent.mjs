// Backlink & Distribution Agent — finds free link opportunities and drafts
// the outreach/submission content in Gokul's voice. It PREPARES, you FIRE:
// auto-posting links at scale gets domains penalized and accounts banned, so
// every output is a ready-to-send draft, organized into a 1-week sprint plan.
//
// What it does:
//   1. Opportunity map — free, high-authority places a founder blog can earn
//      links this week (directories, communities, syndication, HN, newsletters).
//   2. Per-post syndication drafts — HN titles, Reddit posts per subreddit
//      (voice-matched per community), dev.to/Medium canonical repost stubs,
//      X/LinkedIn threads.
//   3. Outreach drafts — newsletter/blogger pitches referencing the actual post.
//   4. distribution/PLAYBOOK.md — the week plan with everything inlined.
//
// Usage: node tools/backlink-agent.mjs             (full playbook, all posts)
//        node tools/backlink-agent.mjs <slug>      (one post)

import * as fs from "fs";
import * as path from "path";
import matter from "gray-matter";

const POSTS_DIR = path.join(process.cwd(), "content", "posts");
const OUT_DIR = path.join(process.cwd(), "distribution");
const RANK_FILE = path.join(process.cwd(), "vector-store", "content-rank.json");
const SITE = process.env.SITE_URL || "https://blog.gokul.me";

// ── Free backlink opportunity map (DR = rough domain rating) ──
const OPPORTUNITIES = [
  { name: "Hacker News (Show HN / story)", url: "https://news.ycombinator.com/submit", dr: 93, type: "community", effort: "5 min", note: "Story link for essays; Show HN only for the product. Weekday 6-9pm IST works best for India-relevant posts." },
  { name: "Indie Hackers", url: "https://www.indiehackers.com/new-post", dr: 82, type: "community", effort: "15 min", note: "Repost the full essay as a milestone/story post, link back to the blog." },
  { name: "dev.to", url: "https://dev.to/new", dr: 86, type: "syndication", effort: "10 min", note: "Full repost with rel=canonical to your blog (set canonical_url in front matter). Tech-stack posts fit." },
  { name: "Hashnode", url: "https://hashnode.com", dr: 80, type: "syndication", effort: "10 min", note: "Same canonical repost model. Indian dev audience is big here." },
  { name: "Medium (import tool)", url: "https://medium.com/p/import", dr: 94, type: "syndication", effort: "5 min", note: "Use the IMPORT tool, not paste — import sets canonical automatically." },
  { name: "Reddit (r/SaaS, r/IndiaBusiness, r/indianstartups, r/hyderabad)", url: "https://reddit.com", dr: 91, type: "community", effort: "20 min", note: "Native post per sub in that sub's register. Link in comments or when asked, not in the post body." },
  { name: "Peerlist", url: "https://peerlist.io", dr: 68, type: "profile", effort: "10 min", note: "Indian founder network. Profile link + article shares." },
  { name: "BetaList / Uneed / MicroLaunch", url: "https://betalist.com/submit", dr: 75, type: "directory", effort: "15 min", note: "Product directories — link to makeforme.in, bio links to blog." },
  { name: "Product Hunt (profile + discussions)", url: "https://producthunt.com", dr: 90, type: "profile", effort: "10 min", note: "Maker profile link. Answer discussions; don't launch just for a link." },
  { name: "GitHub profile README + repo", url: "https://github.com", dr: 96, type: "profile", effort: "10 min", note: "Pin the tech-stack post in profile README. Open-source one small tool from the blog pipeline for a real repo link." },
  { name: "IndiaHacks/StartupIndia forums + Discord/Slack founder groups", url: "", dr: 40, type: "community", effort: "ongoing", note: "Drop posts where relevant in #show-your-work channels." },
  { name: "Newsletter pitches (Indian startup newsletters)", url: "", dr: 60, type: "outreach", effort: "30 min", note: "FWIW-style newsletters love real-numbers building-in-public data. Pitch the post, not the product." },
  { name: "HARO-style (Qwoted/Featured.com free tier)", url: "https://featured.com", dr: 70, type: "outreach", effort: "15 min/day", note: "Answer founder/ecommerce queries; earns editorial links." },
  { name: "Blog comments on Zerodha Varsity/finance blogs you already cite", url: "", dr: 75, type: "relationship", effort: "10 min", note: "Substantive comments with your name, not link drops. Builds recognition before pitches." },
];

// ── Per-community syndication drafts, voice-matched ──
function hnTitles(p) {
  const t = p.data.title;
  return [
    t.length <= 80 ? t : t.slice(0, 77) + "...",
    `${t} (real numbers from an Indian bootstrapped SaaS)`,
    t.replace(/^(How|Why|What)/i, m => m) + " — lessons from 13 sellers",
  ].map(x => x.slice(0, 80));
}

function redditDraft(p, sub) {
  const url = `${SITE}/blog/${p.slug}`;
  const first = p.content.split(/\n\s*\n/).filter(x => x.trim() && !x.startsWith("#")).slice(0, 2).join("\n\n");
  const bodies = {
    "r/SaaS": `${p.data.title}\n\n${first}\n\nfull writeup with the numbers on my blog (link in comments if anyone wants it). brutal feedback welcome.`,
    "r/IndiaBusiness": `I run makeforme.in, been writing about the journey. This week: ${p.data.title.toLowerCase()}\n\n${first}\n\nhappy to answer anything about the numbers.`,
    "r/indianstartups": `${p.data.title} (building in public, real numbers inside)\n\n${first}\n\nwrote the full thing up on my blog. ask me anything.`,
    "r/hyderabad": `Hyderabad folks building things: ${p.data.title.toLowerCase()}\n\n${first.split("\n")[0]}\n\nwrote about it here if useful: ${url}`,
  };
  return bodies[sub] || bodies["r/SaaS"];
}

function outreachEmail(p) {
  const url = `${SITE}/blog/${p.slug}`;
  return `Subject: real numbers from a 2-month-old Indian SaaS (for your newsletter)

Hi [name],

I'm Gokul, I build makeforme.in, a store builder for Indian small sellers. I write up everything with real numbers as I go.

Just published: "${p.data.title}"
${url}

${p.data.description || ""}

If it fits [newsletter], feel free to quote or link any of it. Happy to share the raw numbers behind it too.

Gokul
makeforme.in`;
}

function canonicalStub(p) {
  return `---
title: "${p.data.title}"
canonical_url: ${SITE}/blog/${p.slug}
published: true
tags: startup, india, buildinpublic
---

*Originally published on [my blog](${SITE}/blog/${p.slug}).*

${p.content.trim()}
`;
}

function loadPosts(onlySlug) {
  return fs.readdirSync(POSTS_DIR).filter(f => f.endsWith(".mdx"))
    .map(f => {
      const { data, content } = matter(fs.readFileSync(path.join(POSTS_DIR, f), "utf-8"));
      return { slug: f.replace(/\.mdx$/, ""), file: f, data, content };
    })
    .filter(p => !onlySlug || p.slug === onlySlug);
}

export function buildPlaybook(onlySlug = null) {
  const posts = loadPosts(onlySlug);
  let rank = null;
  try { rank = JSON.parse(fs.readFileSync(RANK_FILE, "utf-8")); } catch {}
  const order = rank
    ? posts.sort((a, b) => (rank.results.find(r => r.file === b.file)?.composite || 0) - (rank.results.find(r => r.file === a.file)?.composite || 0))
    : posts;

  fs.mkdirSync(path.join(OUT_DIR, "syndication"), { recursive: true });

  const lines = [];
  lines.push(`# Distribution Playbook — 1-week sprint`);
  lines.push(`\nGenerated ${new Date().toISOString().slice(0, 10)}. Lead post chosen by content-rank composite. Everything below is a draft: review, personalize the [bracketed] parts, then send/post manually.\n`);

  lines.push(`## The week\n`);
  lines.push(`| Day | Action | Where |`);
  lines.push(`|-----|--------|-------|`);
  lines.push(`| Mon | Submit lead post | Hacker News + r/SaaS |`);
  lines.push(`| Tue | Canonical reposts of lead post | dev.to, Hashnode, Medium import |`);
  lines.push(`| Wed | Indian communities | r/IndiaBusiness, r/indianstartups, Peerlist |`);
  lines.push(`| Thu | Directories + profiles | BetaList, Uneed, GitHub README, PH profile |`);
  lines.push(`| Fri | Newsletter outreach (3 pitches) | see outreach drafts |`);
  lines.push(`| Sat | City sub + founder Discords | r/hyderabad, Slack/Discord groups |`);
  lines.push(`| Sun | Answer 3 Featured.com queries | featured.com |`);

  lines.push(`\n## Backlink opportunity map (all free)\n`);
  lines.push(`| Opportunity | DR | Type | Effort | Playbook note |`);
  lines.push(`|-------------|----|------|--------|---------------|`);
  for (const o of OPPORTUNITIES) {
    lines.push(`| ${o.url ? `[${o.name}](${o.url})` : o.name} | ${o.dr} | ${o.type} | ${o.effort} | ${o.note} |`);
  }

  for (const p of order) {
    const r = rank?.results?.find(x => x.file === p.file);
    lines.push(`\n---\n\n## ${p === order[0] ? "🥇 LEAD: " : ""}${p.data.title}${r ? ` (rank ${r.composite}/100)` : ""}\n`);
    lines.push(`Post: ${SITE}/blog/${p.slug}\n`);
    lines.push(`### HN title options\n`);
    hnTitles(p).forEach((t, i) => lines.push(`${i + 1}. ${t}`));
    for (const sub of ["r/SaaS", "r/IndiaBusiness", "r/indianstartups", "r/hyderabad"]) {
      lines.push(`\n### ${sub}\n`);
      lines.push("```");
      lines.push(redditDraft(p, sub));
      lines.push("```");
    }
    lines.push(`\n### Newsletter pitch\n`);
    lines.push("```");
    lines.push(outreachEmail(p));
    lines.push("```");

    const stubPath = path.join(OUT_DIR, "syndication", `${p.slug}.md`);
    fs.writeFileSync(stubPath, canonicalStub(p));
    lines.push(`\nCanonical repost file (paste into dev.to/Hashnode): distribution/syndication/${p.slug}.md`);
  }

  lines.push(`\n---\n\n## Tracker\n`);
  lines.push(`| Date | Where | Post | Link earned | Notes |`);
  lines.push(`|------|-------|------|-------------|-------|`);
  lines.push(`|      |       |      |             |       |`);

  const outPath = path.join(OUT_DIR, "PLAYBOOK.md");
  fs.writeFileSync(outPath, lines.join("\n"));
  console.log(`✓ Playbook: distribution/PLAYBOOK.md (${order.length} posts, ${OPPORTUNITIES.length} opportunities)`);
  console.log(`✓ Canonical repost stubs: distribution/syndication/`);
  return outPath;
}

const isMain = process.argv[1]?.includes("backlink-agent");
if (isMain) {
  console.log("\n=== Backlink & Distribution Agent ===\n");
  buildPlaybook(process.argv[2] || null);
}
