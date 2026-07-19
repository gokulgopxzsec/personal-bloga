import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { getAllSlugs, getPostBySlug } from "@/lib/posts";
import { formatDate, readingTime } from "@/lib/utils";
import { getMdxComponents } from "@/components/mdx/MdxComponents";
import { generatePostMeta, postJsonLd } from "@/lib/seo";
import { ReadingProgress } from "@/components/blog/ReadingProgress";
import { RelatedPosts } from "@/components/blog/RelatedPosts";
import { GiscusComments } from "@/components/blog/GiscusComments";
import Link from "next/link";

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};
  return generatePostMeta(post);
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const mdxComponents = getMdxComponents();

  return (
    <>
      <ReadingProgress />
      <article>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: postJsonLd(post) }}
        />
        <header className="dot-grid -mx-5 mb-10 px-5 py-10 sm:-mx-6 sm:px-6">
          <div className="flex items-center gap-2 font-mono text-[0.72rem] text-zinc-400 dark:text-zinc-500">
            <time dateTime={post.date}>{formatDate(post.date)}</time>
            <span aria-hidden>·</span>
            <span>{readingTime(post.content)}</span>
          </div>
          <h1 className="mt-3 max-w-2xl text-3xl font-bold leading-[1.15] tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">
            {post.title}
          </h1>
          <p className="prompt mt-4 max-w-xl font-mono text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
            {post.description}
          </p>
          {post.tags.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
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
        </header>
        <div className="prose prose-zinc max-w-none dark:prose-invert">
          <MDXRemote source={post.content} components={mdxComponents} />
        </div>
      </article>
      <RelatedPosts currentSlug={post.slug} tags={post.tags} />
      <GiscusComments term={post.title} />
    </>
  );
}
