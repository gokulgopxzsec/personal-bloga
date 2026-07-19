import type { Metadata } from "next";
import { site } from "./constants";
import type { Post } from "./posts";

type PageMeta = {
  title: string;
  description: string;
  path?: string;
  ogImage?: string;
  type?: "website" | "article";
  publishedAt?: string;
  tags?: string[];
};

export function generateMeta({
  title,
  description,
  path = "",
  ogImage,
  type = "website",
  publishedAt,
  tags,
}: PageMeta): Metadata {
  const url = `${site.url}${path}`;
  return {
    // Plain title — the root layout template appends "— Gokul"
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: site.siteName,
      type,
      ...(publishedAt && type === "article"
        ? { publishedTime: publishedAt }
        : {}),
      ...(tags ? { tags } : {}),
      images: [
        {
          url: ogImage ?? site.ogImage,
          width: 1200,
          height: 630,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      creator: site.author.twitter,
    },
    robots: { index: true, follow: true },
  };
}

export function generatePostMeta(post: Post): Metadata {
  return generateMeta({
    title: post.title,
    description: post.description,
    path: `/blog/${post.slug}`,
    type: "article",
    publishedAt: post.date,
    tags: post.tags,
  });
}

export function postJsonLd(post: Post): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    author: {
      "@type": "Person",
      name: site.author.name,
      url: site.author.url,
      sameAs: [
        site.author.github,
        site.author.twitter,
        site.author.linkedin,
        site.author.makeforme,
      ],
    },
    datePublished: post.date,
    dateModified: post.date,
    publisher: {
      "@type": "Person",
      name: site.author.name,
    },
  });
}
