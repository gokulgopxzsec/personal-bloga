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
    <section className="mt-12 border-t border-zinc-200 pt-8 dark:border-zinc-800">
      <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        Related Posts
      </h2>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {related.map((post) => (
          <ArticleCard key={post.slug} post={post} />
        ))}
      </div>
    </section>
  );
}

function ArticleCard({ post }: { post: Post }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group rounded-lg border border-zinc-200 p-4 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
    >
      <time className="text-xs text-zinc-500">{formatDate(post.date)}</time>
      <h3 className="mt-1 text-sm font-medium text-zinc-900 group-hover:text-zinc-600 dark:text-zinc-100 dark:group-hover:text-zinc-400">
        {post.title}
      </h3>
      <p className="mt-1 text-xs text-zinc-500 line-clamp-2">{post.description}</p>
    </Link>
  );
}
