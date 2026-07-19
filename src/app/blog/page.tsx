import type { Metadata } from "next";
import { getAllPosts, getPostsForPage } from "@/lib/posts";
import { PostCard } from "@/components/blog/PostCard";
import { Pagination } from "@/components/blog/Pagination";
import { generateMeta } from "@/lib/seo";

export const metadata: Metadata = generateMeta({
  title: "Blog",
  description: "Building in public. SaaS, India Stack, and founder lessons.",
  path: "/blog",
});

export default function BlogPage() {
  const allPosts = getAllPosts();
  const { posts, totalPages } = getPostsForPage(allPosts, 1);
  return (
    <div>
      <header className="mb-8">
        <p className="mono-label text-zinc-500 dark:text-zinc-400">
          all writing
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Writing
        </h1>
        <p className="prompt mt-2 font-mono text-xs text-zinc-500 dark:text-zinc-400">
          {allPosts.length} posts, newest first
        </p>
      </header>
      <div className="flex flex-col gap-4">
        {posts.map((post) => (
          <PostCard key={post.slug} post={post} />
        ))}
      </div>
      <Pagination currentPage={1} totalPages={totalPages} basePath="/blog" />
    </div>
  );
}
