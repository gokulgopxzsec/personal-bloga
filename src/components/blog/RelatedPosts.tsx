import Link from "next/link";
import { getAllPosts } from "@/lib/posts";
import { formatDate } from "@/lib/utils";
import type { Post } from "@/lib/posts";

type Props = {
  currentSlug: string;
  tags: string[];
};

export function RelatedPosts({ currentSlug, tags }: Props) {
  const allPosts = getAllPosts();
  const related = allPosts
    .filter((p) => p.slug !== currentSlug && p.tags.some((t) => tags.includes(t)))
    .slice(0, 3);

  if (related.length === 0) return null;

  return (
    <section className="mt-14 border-t border-dashed border-[var(--hairline)] pt-8">
      <h2 className="mono-label mb-4 text-zinc-500 dark:text-zinc-400">
        keep reading
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {related.map((post) => (
          <ArticleCard key={post.slug} post={post} />
        ))}
      </div>
    </section>
  );
}

function ArticleCard({ post }: { post: Post }) {
  return (
    <Link href={`/blog/${post.slug}`} className="stitch group block p-4">
      <time className="font-mono text-[0.68rem] text-zinc-400 dark:text-zinc-500">
        {formatDate(post.date)}
      </time>
      <h3 className="mt-1.5 text-sm font-semibold leading-snug text-zinc-900 transition-colors group-hover:text-[var(--accent)] dark:text-zinc-100">
        {post.title}
      </h3>
      <p className="mt-1.5 text-xs leading-relaxed text-zinc-500 line-clamp-2 dark:text-zinc-400">
        {post.description}
      </p>
    </Link>
  );
}
