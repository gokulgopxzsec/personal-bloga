import type { MetadataRoute } from "next";
import { getAllPosts } from "@/lib/posts";
import { site } from "@/lib/constants";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const posts = getAllPosts();

  const staticPages = [
    { url: site.url, lastModified: new Date(), changeFrequency: "weekly" as const, priority: 1 },
    { url: `${site.url}/blog`, lastModified: new Date(), changeFrequency: "daily" as const, priority: 0.9 },
    { url: `${site.url}/about`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.7 },
  ];

  const postPages = posts.map((post) => ({
    url: `${site.url}/blog/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  const tagPages = [
    ...new Set(posts.flatMap((p) => p.tags)),
  ].map((tag) => ({
    url: `${site.url}/tags/${tag}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  return [...staticPages, ...postPages, ...tagPages];
}
