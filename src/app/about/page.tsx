import type { Metadata } from "next";
import { generateMeta } from "@/lib/seo";
import { site } from "@/lib/constants";

export const metadata: Metadata = generateMeta({
  title: "About",
  description:
    "Building makeforme.in. Previously side-project turned startup. Writing about SaaS, India Stack, and building in public.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <article className="prose prose-zinc mx-auto dark:prose-invert">
      <h1>About</h1>
      <p>
        I build <a href={site.author.makeforme}>makeforme.in</a> — an online
        store builder for Indian solopreneurs.
      </p>
      <h2>The Origin</h2>
      <p>
        A close friend runs a handmade jewellery business. She was losing orders
        inside Instagram DMs — messages got buried, payments were a chase, and
        she had no way to show her full catalog.
      </p>
      <p>
        I built makeforme.in to solve that. It started as a side project. Two
        months later, 13 sellers were using it to run their stores.
      </p>
      <h2>Why This Blog?</h2>
      <p>
        Indian SaaS needs more transparency. Founders hide their numbers, fake
        their growth, and burn out in silence.
      </p>
      <p>
        I&apos;m sharing everything — the wins, the failures, the ₹0 ad days.
        If it works, you&apos;ll see how. If it fails, you&apos;ll see that
        too.
      </p>
      <h2>Elsewhere</h2>
      <ul>
        <li>
          Twitter:{" "}
          <a href={site.author.twitter}>@{site.author.twitter}</a>
        </li>
        <li>
          GitHub:{" "}
          <a href={site.author.github}>github.com/gokul</a>
        </li>
        <li>
          LinkedIn:{" "}
          <a href={site.author.linkedin}>linkedin.com/in/gokul</a>
        </li>
        <li>
          Store builder:{" "}
          <a href={site.author.makeforme}>makeforme.in</a>
        </li>
        <li>
          Email:{" "}
          <a href={`mailto:${site.author.email}`}>
            {site.author.email}
          </a>
        </li>
      </ul>
    </article>
  );
}
