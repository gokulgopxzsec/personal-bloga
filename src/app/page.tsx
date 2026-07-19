import Link from "next/link";
import { getAllPosts } from "@/lib/posts";
import { PostCard } from "@/components/blog/PostCard";
import { site } from "@/lib/constants";

export default function Home() {
  const posts = getAllPosts().slice(0, 5);
  return (
    <div>
      <section className="dot-grid -mx-5 mb-14 px-5 py-14 sm:-mx-6 sm:px-6">
        <p className="mono-label text-zinc-500 dark:text-zinc-400">
          building in public
        </p>
        <h1 className="mt-3 max-w-xl text-4xl font-bold leading-[1.08] tracking-tight text-zinc-900 sm:text-5xl dark:text-zinc-50">
          I build things, ship them, and show you the numbers.
        </h1>
        <p className="mt-5 max-w-lg text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
          I&apos;m Gokul. I&apos;m building{" "}
          <a href={site.author.makeforme} className="link-craft font-medium">
            makeforme.in
          </a>{" "}
          — an online store builder for Indian solopreneurs. Real revenue, real
          failures, zero press releases.
        </p>
        <div className="mt-7 flex flex-wrap gap-3 font-mono text-[0.82rem]">
          <Link
            href="/start-here"
            className="rounded-lg bg-zinc-900 px-4 py-2.5 font-medium text-zinc-50 transition-colors hover:bg-[var(--accent)] dark:bg-zinc-100 dark:text-zinc-900"
          >
            start here →
          </Link>
          <Link
            href="/blog"
            className="stitch px-4 py-2.5 font-medium text-zinc-700 dark:text-zinc-300"
          >
            all writing
          </Link>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="mono-label text-zinc-500 dark:text-zinc-400">
            latest posts
          </h2>
          <Link
            href="/blog"
            className="link-craft font-mono text-xs text-zinc-500 dark:text-zinc-400"
          >
            view all
          </Link>
        </div>
        <div className="flex flex-col gap-4">
          {posts.map((post) => (
            <PostCard key={post.slug} post={post} />
          ))}
        </div>
      </section>
    </div>
  );
}
