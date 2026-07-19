import Link from "next/link";

type Props = {
  currentPage: number;
  totalPages: number;
  basePath: string;
};

export function Pagination({ currentPage, totalPages }: Props) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-8 flex items-center justify-between">
      {currentPage > 1 ? (
        <Link
          href={currentPage === 2 ? "/blog" : `/blog/page/${currentPage - 1}`}
          className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          ← Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-zinc-500">
        Page {currentPage} of {totalPages}
      </span>
      {currentPage < totalPages ? (
        <Link
          href={`/blog/page/${currentPage + 1}`}
          className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Next →
        </Link>
      ) : (
        <span />
      )}
    </div>
  );
}
