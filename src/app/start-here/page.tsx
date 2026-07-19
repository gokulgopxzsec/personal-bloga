import type { Metadata } from "next";
import { getAllPosts } from "@/lib/posts";
import { generateMeta } from "@/lib/seo";
import { PostCard } from "@/components/blog/PostCard";

export const metadata: Metadata = generateMeta({
  title: "Start Here",
  description:
    "New here? Start with these posts to understand what this blog is about.",
  path: "/start-here",
});

export default function StartHerePage() {
  const posts = getAllPosts().slice(0, 5);
  return (
    <div>
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Start Here
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          New reader? These posts will get you up to speed on what this blog is
          about — building in public, Indian SaaS, and the journey behind
          makeforme.in.
        </p>
      </header>
      {posts.map((post) => (
        <PostCard key={post.slug} post={post} />
      ))}
    </div>
  );
}
