import type { Metadata } from "next";
import { generateMeta } from "@/lib/seo";
import { site } from "@/lib/constants";

export const metadata: Metadata = generateMeta({
  title: "Now",
  description: "What Gokul is working on right now.",
  path: "/now",
});

export default function NowPage() {
  return (
    <article className="prose prose-zinc mx-auto dark:prose-invert">
      <h1>Now</h1>
      <p>
        <em>Last updated: July 2026</em>
      </p>
      <h2>Building makeforme.in</h2>
      <ul>
        <li>13 sellers on the platform</li>
        <li>2 months since first seller went live</li>
        <li>Bootstrapped, India-only, building in the open</li>
        <li>₹0 spent on paid ads that converted (so far)</li>
      </ul>
      <h2>Current focus</h2>
      <ul>
        <li>Hyper-targeted outreach to specific seller niches (jewellery, bakers, tutors)</li>
        <li>Improving the onboarding flow — target is under 2 minutes</li>
        <li>Writing daily on the build-in-public journey</li>
      </ul>
      <h2>Recent reads</h2>
      <ul>
        <li>Zero to Sold — Arvid Kahl</li>
        <li>Cold Email Manifesto — Ed Gandia</li>
      </ul>
      <p>
        This is a <a href="https://nownownow.com/about">/now page</a>. It
        says what I&apos;m focused on right now.
      </p>
      <p>
        <a href={site.author.makeforme}>
          → Check out makeforme.in
        </a>
      </p>
    </article>
  );
}
