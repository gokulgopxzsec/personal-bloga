import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { site } from "./constants";

export type Post = {
  slug: string;
  title: string;
  description: string;
  date: string;
  tags: string[];
  published: boolean;
  content: string;
};

const postsDirectory = path.join(process.cwd(), "content", "posts");

export function getAllPosts(): Post[] {
  const filenames = fs.readdirSync(postsDirectory);
  const posts = filenames
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => {
      const slug = f.replace(/\.mdx$/, "");
      const filePath = path.join(postsDirectory, f);
      const source = fs.readFileSync(filePath, "utf-8");
      const { data, content } = matter(source);
      return {
        slug,
        title: data.title,
        description: data.description,
        date: data.date,
        tags: data.tags ?? [],
        published: data.published !== false,
        content,
      } satisfies Post;
    })
    .filter((p) => p.published)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return posts;
}

export function getPostBySlug(slug: string): Post | null {
  const filePath = path.join(postsDirectory, `${slug}.mdx`);
  if (!fs.existsSync(filePath)) return null;
  const source = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(source);
  return {
    slug,
    title: data.title,
    description: data.description,
    date: data.date,
    tags: data.tags ?? [],
    published: data.published !== false,
    content,
  };
}

export function getPostsForPage(
  posts: Post[],
  page: number
): { posts: Post[]; totalPages: number } {
  const totalPages = Math.ceil(posts.length / site.postsPerPage);
  const start = (page - 1) * site.postsPerPage;
  return {
    posts: posts.slice(start, start + site.postsPerPage),
    totalPages,
  };
}

export function getAllSlugs(): string[] {
  return getAllPosts().map((p) => p.slug);
}
