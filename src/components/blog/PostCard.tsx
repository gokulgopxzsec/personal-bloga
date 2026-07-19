import Link from "next/link";
import type { Post } from "@/lib/posts";
import { formatDate, readingTime } from "@/lib/utils";

export function PostCard({ post }: { post: Post }) {
  return (
    <article className="post-row border-b border-[var(--hairline)] py-8 last:border-0">
      <header className="mb-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-stone-400 dark:text-stone-500">
          <time dateTime={post.date}>{formatDate(post.date)}</time>
          <span aria-hidden>·</span>
          <span>{readingTime(post.content)}</span>
        </div>
        <h2 className="mt-2 font-display text-2xl font-semibold leading-snug tracking-tight">
          <Link
            href={`/blog/${post.slug}`}
            className="text-stone-900 transition-colors hover:text-amber-700 dark:text-stone-100 dark:hover:text-amber-500"
          >
            {post.title}
          </Link>
        </h2>
      </header>
      <p className="max-w-xl text-base leading-relaxed text-stone-600 dark:text-stone-400">
        {post.description}
      </p>
      {post.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {post.tags.map((tag) => (
            <Link
              key={tag}
              href={`/tags/${tag}`}
              className="rounded-full border border-[var(--hairline)] px-3 py-1 text-xs font-medium text-stone-500 transition-colors hover:border-amber-600 hover:text-amber-700 dark:text-stone-400 dark:hover:text-amber-500"
            >
              {tag}
            </Link>
          ))}
        </div>
      )}
    </article>
  );
}
