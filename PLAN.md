# Blog Architecture Plan — 100% Free Stack

## Goal
A blog that ranks on Google, builds Gokul's personal brand (makeforme.in founder), costs ₹0/month to run.

---

## 1. Tech Stack (₹0/mo)

| Layer | Choice | Why | Cost |
|-------|--------|-----|------|
| Framework | Next.js 14 (App Router) | SSG, auto sitemaps, excellent SEO | Free (MIT) |
| Content | MDX + gray-matter | Plain files in git, no database, no vendor lock-in | Free |
| Styling | Tailwind CSS | Zero runtime, small CSS output | Free |
| Hosting | **Cloudflare Pages** | Unlimited bandwidth, 500 builds/mo, global edge network, built-in analytics | **Free** |
| Domain | `gokul.me` or `blog.gokul.dev` | Namecheap/Cloudflare Registrar (~₹800/yr) OR `*.pages.dev` free subdomain | ₹0 or ₹800/yr |
| Comments | Giscus | GitHub Discussions, no database, no moderation costs | Free |
| Search | Pagefind | Static full-text search, zero server cost, no API keys | Free |
| Analytics | **Cloudflare Web Analytics** | Privacy-first, no cookie banner needed, free | Free |
| Images | Cloudflare Images (free tier) OR Unsplash/self-hosted WebP | 100k req/day free on CF | Free |
| Email (newsletter) | **Beehiiv free plan** OR Buttondown | Up to 2500 subscribers free | Free |
| Fonts | Self-hosted (Inter + JetBrains Mono) | Google Fonts is free but adds external request; self-hosted is better for CWV | Free |
| CI/CD | GitHub Actions | Auto-deploy on push | Free |
| SSL | Cloudflare Universal SSL | Automatic, managed | Free |

**Why Cloudflare Pages over Vercel?**
- Vercel free tier: 100 GB bandwidth, 6000 build minutes — runs out fast with images
- Cloudflare Pages: **unlimited bandwidth**, 500 builds/mo, global edge (330+ cities)
- Built-in analytics (no extra cost)
- No cold starts (Vercel Serverless has cold start issues on free plan)

---

## 2. Personal Branding Strategy

### Domain & Identity
```
Primary:   blog.gokul.me        — clean, professional
Redirect:  gokul.blog           — vanity redirect
Handle:    @gokul everywhere    — Twitter, GitHub, LinkedIn, Reddit
Email:     gokul@makeforme.in   — consistent touchpoint
```

### Blog Sections for Personal Branding

| Section | Purpose |
|---------|---------|
| `/about` | Origin story: built makeforme.in because a friend lost orders in Instagram DMs. Links to makeforme.in |
| `/blog` | Tech/business posts that establish authority |
| `/uses` | Gear, tools, software stack (popular SEO page type) |
| `/now` | What Gokul is working on now (/now page movement) |
| `/start-here` | Curated best posts for first-time visitors |

### Content Themes (Authority Building)

1. **Building in Public** — "13 sellers, 2-month-old product, 789 clicks and ₹0 from ads" style posts
2. **Technical** — How makeforme.in is built, architecture decisions
3. **Founder Lessons** — Real numbers, real failures, real learnings
4. **SEO / Marketing** — What works for Indian small sellers
5. **India Stack** — UPI, Razorpay, ONDC, DPDP Act posts

Every post subtly reinforces: "Gokul builds makeforme.in — a store builder for Indian solopreneurs."

---

## 3. SEO Architecture (Google-first)

### Technical SEO — All Free

```
sitemap.xml           → Dynamic, generated at build, auto-submitted to Google
robots.txt            → Allow all, point to sitemap
rss.xml               → RSS feed for RSS readers and Google News
atom.xml              → Atom format as alternative
```

### Every Page Gets

```ts
generateMetadata() {
  title: "Post Title — Gokul"
  description: "Unique 150-160 char description"
  canonical: "https://blog.gokul.me/blog/slug"
  openGraph: {
    title, description, url, siteName: "Gokul",
    type: "article", // or "website" for pages
    images: [{ url: ogImageUrl, width: 1200, height: 630 }]
  }
  twitter: {
    card: "summary_large_image",
    creator: "@gokul"
  }
  robots: {
    index: true,
    follow: true,
  }
  alternates: { canonical }
}
```

### Structured Data (JSON-LD)

Every post gets this injected automatically:

```json
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": "...",
  "description": "...",
  "author": {
    "@type": "Person",
    "name": "Gokul",
    "url": "https://blog.gokul.me/about",
    "sameAs": [
      "https://github.com/gokul",
      "https://twitter.com/gokul",
      "https://linkedin.com/in/gokul",
      "https://makeforme.in"
    ]
  },
  "datePublished": "...",
  "dateModified": "...",
  "image": "...",
  "publisher": {
    "@type": "Person",
    "name": "Gokul"
  }
}
```

### Page Types for SEO

| Page | URL | Keyword Target |
|------|-----|----------------|
| Home | `/` | "Gokul blog" "building in public" |
| Post | `/blog/slug` | Long-tail keywords in title |
| Tag | `/tags/nextjs` | Topic authority |
| About | `/about` | "Gokul makeforme" "founder" |
| Uses | `/uses` | "Gokul setup" "developer tools" |
| Archive | `/archive` | SEO crawl depth |

### Internal Linking Strategy

```
Home  →  Featured posts, recent 3
Post  →  Related posts (by tags), "Read next"
Tags  →  All posts under that tag
About →  Links to makeforme.in, GitHub, Twitter
```

### Core Web Vitals Targets (Free = No Edge Functions)

| Metric | Target | How |
|--------|--------|-----|
| LCP | < 1.5s | Static HTML, self-hosted fonts, WebP images, preload LCP element |
| FID/INP | < 50ms | Minimal JS, no third-party scripts |
| CLS | < 0.05 | Explicit width/height on all images, font-display: optional |

---

## 4. Folder Structure

```
blog.gokul.me/
├── app/
│   ├── (main)/
│   │   ├── page.tsx
│   │   ├── blog/
│   │   │   ├── page.tsx              # Paginated list (10/page)
│   │   │   └── [slug]/page.tsx
│   │   ├── tags/[tag]/page.tsx
│   │   ├── about/page.tsx
│   │   ├── uses/page.tsx
│   │   └── now/page.tsx
│   ├── layout.tsx                    # Root: header, footer, analytics
│   ├── sitemap.ts
│   ├── robots.ts
│   └── feed.xml/route.ts
├── content/
│   ├── posts/
│   │   ├── building-makeforme-in-public.mdx
│   │   ├── how-i-built-a-saas-for-indian-sellers.mdx
│   │   └── ...
│   └── authors.json
├── components/
│   ├── blog/          # PostCard, PostList, TOC, ShareButtons
│   ├── mdx/           # CodeBlock, Image, Callout, Blockquote
│   ├── layout/        # Header, Footer, MobileNav, ThemeToggle
│   └── ui/            # Button, Card, Badge, Input
├── lib/
│   ├── posts.ts       # getAllPosts, getPostBySlug, getAdjacentPosts
│   ├── seo.ts         # generatePostMetadata, generatePageMetadata
│   ├── utils.ts       # formatDate, readingTime, slugify
│   └── constants.ts   # siteMetadata, author info, social links
├── public/
│   ├── images/
│   └── fonts/         # Inter, JetBrains Mono (self-hosted)
├── styles/
│   └── globals.css
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── wrangler.toml      # Cloudflare Pages config
└── package.json
```

---

## 5. Implementation Phases (7 Days)

### Phase 1 — Scaffold (Day 1)

```bash
npx create-next-app@latest . --typescript --tailwind --app --src-dir --no-import-alias
npm install gray-matter reading-time
npm install -D rehype-pretty-code rehype-slug remark-gfm @tailwindcss/typography
```

- Set up Tailwind typography + dark mode via class strategy
- Self-host Inter + JetBrains Mono in `public/fonts/`
- Create root layout with Cloudflare Analytics snippet
- Create Header (logo, nav links, theme toggle) + Footer (social links, copyright)
- `lib/constants.ts` with site-wide metadata

### Phase 2 — Content Pipeline (Day 2–3)

- `lib/posts.ts` — read MDX from `content/posts/`, sort by date, paginate
- `app/blog/page.tsx` — post list with pagination (10 per page, prev/next)
- `app/blog/[slug]/page.tsx` — single post with MDX rendering
- Generate reading time, publish date format, tag badges
- MDX components: CodeBlock (rehype-pretty-code), Image (next/image), Callout (info/warning/error)
- `generateMetadata()` for every post

### Phase 3 — SEO (Day 4)

- `app/sitemap.ts` — dynamic sitemap from all posts + pages
- `app/robots.ts` — allow all, sitemap reference
- `app/feed.xml/route.ts` — RSS feed
- `lib/seo.ts` — reusable metadata generators with JSON-LD
- Structured data injected into post layout
- OG image generation (use `@vercel/og` or build static OG images in Canva)

### Phase 4 — Brand Pages (Day 5)

| Page | Content |
|------|---------|
| `/about` | Bio, origin story, photo, social links, link to makeforme.in |
| `/uses` | Every tool he uses (laptop, monitor, keyboard, software) |
| `/now` | "Building makeforme.in. 13 sellers. 2 months. Bootstrapped." |
| `/start-here` | 5 best posts for new readers |

### Phase 5 — Polish (Day 6–7)

- Giscus comments on posts
- Pagefind search (generate at build time)
- Related posts section (shared tags)
- Reading progress bar on posts
- 404 page with personality + search
- Lighthouse audit (target: 95+ all categories)
- Accessibility: keyboard nav, aria labels, heading hierarchy
- Disable all third-party scripts except analytics

---

## 6. Cloudflare Pages Setup

```toml
# wrangler.toml
name = "blog-gokul"
compatibility_date = "2026-07-19"

[build]
command = "npm run build"
output = "out"

[build.environment]
NODE_VERSION = "20"

[[redirects]]
from = "/"
to = "/blog"
status = 302  # Redirect root to blog listing
```

Deployment:
```bash
npm install -g wrangler
wrangler pages project create blog-gokul
wrangler pages deploy out/ --branch main
```

Or connect GitHub repo → Cloudflare Pages dashboard → auto-deploy on push.

---

## 7. Performance Budget (100% Free)

| Asset | Budget | How |
|-------|--------|-----|
| HTML per page | < 10kB | Static SSG, no server renders |
| CSS | < 15kB | Tailwind purged |
| JS | < 30kB total | Minimal client React, dynamic imports |
| Fonts | < 40kB | Self-hosted, woff2, subset Latin |
| Images | < 100kB each | WebP, responsive next/image |
| Total page weight | < 200kB | Target for fast 3G |
| Lighthouse | 95+ | All categories |

---

## 8. Content Workflow

```
Write in VS Code     →  Commit to GitHub     →  Auto-deploy to Cloudflare Pages
        ↓                      ↓                        ↓
MDX + frontmatter     git push main            ~2 min build, edge deploy
```

No admin panel. No database. No login. No hosting bill.

---

## 9. SEO Launch Checklist

- [ ] Submit sitemap to Google Search Console (free)
- [ ] Submit sitemap to Bing Webmaster Tools (free)
- [ ] Add `blog.gokul.me` to Google Search Console
- [ ] Set up Cloudflare Analytics (no cookie banner needed)
- [ ] Verify canonical URLs on every page
- [ ] Test with Google Rich Results Test (JSON-LD)
- [ ] Test with PageSpeed Insights (target 95+)
- [ ] Add blog URL to LinkedIn, Twitter, GitHub, Reddit profiles
- [ ] Submit RSS feed to RSS directories
- [ ] Write 5 posts before launch (critical mass for indexation)

---

## 10. Zero-Cost Summary

| Item | Cost |
|------|------|
| Hosting (Cloudflare Pages) | ₹0 |
| Domain (optional) | ₹0–₹800/yr |
| CMS (MDX + git) | ₹0 |
| Analytics | ₹0 |
| Comments | ₹0 |
| Search | ₹0 |
| SSL | ₹0 |
| CI/CD | ₹0 |
| Email newsletter | ₹0 (up to 2500 subs) |
| **Total** | **₹0/mo** |
