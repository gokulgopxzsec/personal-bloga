import Link from "next/link";
import { getAllPosts } from "@/lib/posts";
import { PostCard } from "@/components/blog/PostCard";
import { site } from "@/lib/constants";

export default function Home() {
  const posts = getAllPosts().slice(0, 5);
  return (
    <div>
      <section className="mb-16 pt-4">
        <h1 className="font-display text-4xl font-semibold leading-[1.1] tracking-tight text-stone-900 sm:text-5xl dark:text-stone-100">
          Building in public,
          <br />
          <span className="italic text-amber-700 dark:text-amber-500">
            numbers included.
          </span>
        </h1>
        <p className="mt-6 max-w-lg text-lg leading-relaxed text-stone-600 dark:text-stone-400">
          I&apos;m Gokul. I build{" "}
          <a href={site.author.makeforme} className="link-editorial font-medium">
            makeforme.in
          </a>
          , an online store builder for Indian solopreneurs. I write about
          SaaS, India Stack, markets, and what it actually costs to get your
          first customers.
        </p>
        <div className="mt-8 flex gap-4 text-sm font-medium">
          <Link
            href="/start-here"
            className="rounded-full bg-stone-900 px-5 py-2.5 text-stone-50 transition-colors hover:bg-amber-700 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-amber-500"
          >
            Start here
          </Link>
          <Link
            href="/blog"
            className="rounded-full border border-[var(--hairline)] px-5 py-2.5 text-stone-700 transition-colors hover:border-amber-600 hover:text-amber-700 dark:text-stone-300 dark:hover:text-amber-500"
          >
            All writing
          </Link>
        </div>
      </section>
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-display text-2xl font-semibold text-stone-900 dark:text-stone-100">
            Latest
          </h2>
          <Link
            href="/blog"
            className="link-editorial text-sm font-medium text-stone-500 dark:text-stone-400"
          >
            View all
          </Link>
        </div>
        {posts.map((post) => (
          <PostCard key={post.slug} post={post} />
        ))}
      </section>
    </div>
  );
}
