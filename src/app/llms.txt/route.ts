import { getAllPosts } from "@/lib/posts";
import { site } from "@/lib/constants";

export const dynamic = "force-static";

// llms.txt — a machine-readable site guide for AI assistants and crawlers.
// Spec: https://llmstxt.org
export async function GET() {
  const posts = getAllPosts();

  const body = `# ${site.title}

> ${site.description}

Gokul is the founder of makeforme.in, an online store builder for Indian
solopreneurs (₹99/month, 0% commission). This blog documents building it in
public with real numbers: seller counts, revenue, ad spend, failures.

## Writing

${posts.map((p) => `- [${p.title}](${site.url}/blog/${p.slug}): ${p.description}`).join("\n")}

## Pages

- [About](${site.url}/about): Who Gokul is and why makeforme exists
- [Markets](${site.url}/markets): Daily quant analysis of Nifty, BankNifty, Bitcoin and forex
- [Start here](${site.url}/start-here): Best posts for first-time readers
- [Now](${site.url}/now): What Gokul is working on currently

## Product

- [makeforme.in](https://makeforme.in): Store builder for Indian makers — sell products, bookings, events from one link

## Contact

- Email: ${site.author.email}
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
