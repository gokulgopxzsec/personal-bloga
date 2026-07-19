import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getAllPosts } from "@/lib/posts";
import { PostCard } from "@/components/blog/PostCard";
import { generateMeta } from "@/lib/seo";
import Link from "next/link";

export async function generateStaticParams() {
  const posts = getAllPosts();
  const tags = [...new Set(posts.flatMap((p) => p.tags))];
  return tags.map((tag) => ({ tag }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tag: string }>;
}): Promise<Metadata> {
  const { tag } = await params;
  return generateMeta({
    title: `Posts tagged "${tag}"`,
    description: `Blog posts about ${tag} by Gokul.`,
    path: `/tags/${tag}`,
  });
}

export default async function TagPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;
  const allPosts = getAllPosts();
  const posts = allPosts.filter((p) => p.tags.includes(tag));
  if (posts.length === 0) notFound();

  return (
    <div>
      <div className="mb-8">
        <Link
          href="/blog"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          ← Back to blog
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Posts tagged &ldquo;{tag}&rdquo;
        </h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          {posts.length} {posts.length === 1 ? "post" : "posts"}
        </p>
      </div>
      {posts.map((post) => (
        <PostCard key={post.slug} post={post} />
      ))}
    </div>
  );
}
