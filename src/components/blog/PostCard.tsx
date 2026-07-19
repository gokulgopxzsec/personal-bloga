import Link from "next/link";
import type { Post } from "@/lib/posts";
import { formatDate, readingTime } from "@/lib/utils";

export function PostCard({ post }: { post: Post }) {
  return (
    <article className="stitch p-5">
      <header className="mb-2">
        <div className="flex items-center gap-2 font-mono text-[0.7rem] text-zinc-400 dark:text-zinc-500">
          <time dateTime={post.date}>{formatDate(post.date)}</time>
          <span aria-hidden>·</span>
          <span>{readingTime(post.content)}</span>
        </div>
        <h2 className="mt-1.5 text-xl font-bold leading-snug tracking-tight">
          <Link
            href={`/blog/${post.slug}`}
            className="text-zinc-900 transition-colors hover:text-[var(--accent)] dark:text-zinc-100"
          >
            {post.title}
          </Link>
        </h2>
      </header>
      <p className="max-w-xl text-[0.95rem] leading-relaxed text-zinc-600 dark:text-zinc-400">
        {post.description}
      </p>
      {post.tags.length > 0 && (
        <div className="mt-3.5 flex flex-wrap gap-2">
          {post.tags.map((tag) => (
            <Link
              key={tag}
              href={`/tags/${tag}`}
              className="sticker text-zinc-500 dark:text-zinc-400"
            >
              {tag}
            </Link>
          ))}
        </div>
      )}
    </article>
  );
}
