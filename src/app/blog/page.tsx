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
      <h1 className="mb-8 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        Blog
      </h1>
      {posts.map((post) => (
        <PostCard key={post.slug} post={post} />
      ))}
      <Pagination currentPage={1} totalPages={totalPages} basePath="/blog" />
    </div>
  );
}
