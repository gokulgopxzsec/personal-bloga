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
        <header className="mb-12 pt-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-stone-400 dark:text-stone-500">
            <time dateTime={post.date}>{formatDate(post.date)}</time>
            <span aria-hidden>·</span>
            <span>{readingTime(post.content)}</span>
          </div>
          <h1 className="mt-4 font-display text-4xl font-semibold leading-[1.15] tracking-tight text-stone-900 sm:text-[2.75rem] dark:text-stone-100">
            {post.title}
          </h1>
          <p className="mt-5 max-w-xl font-display text-lg italic leading-relaxed text-stone-500 dark:text-stone-400">
            {post.description}
          </p>
          {post.tags.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <Link
                  key={tag}
                  href={`/tags/${tag}`}
                  className="rounded-full border border-[var(--hairline)] px-3 py-1 text-xs font-medium text-stone-500 transition-colors hover:border-amber-600 hover:text-amber-700 dark:text-stone-400 dark:hover:text-amber-500"
                >
                  {tag}
                </Link>
              ))}
            </div>
          )}
        </header>
        <div className="prose prose-stone max-w-none dark:prose-invert">
          <MDXRemote source={post.content} components={mdxComponents} />
        </div>
      </article>
      <RelatedPosts currentSlug={post.slug} tags={post.tags} />
      <GiscusComments term={post.title} />
    </>
  );
}
