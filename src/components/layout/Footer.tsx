import Link from "next/link";
import { site } from "@/lib/constants";

export function Footer() {
  return (
    <footer className="border-t border-[var(--hairline)]">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-12 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div>
          <p className="font-display text-lg font-semibold text-stone-900 dark:text-stone-100">
            Gokul<span className="text-amber-600">.</span>
          </p>
          <p className="mt-1 max-w-xs text-sm leading-relaxed text-stone-500 dark:text-stone-400">
            Building in public from India. Real numbers, real failures, no
            press releases.
          </p>
        </div>
        <div className="flex gap-5 text-sm text-stone-500 dark:text-stone-400">
          <Link href={site.author.makeforme} className="link-editorial">
            makeforme.in
          </Link>
          <Link href={site.author.twitter} className="link-editorial">
            Twitter
          </Link>
          <Link href={site.author.github} className="link-editorial">
            GitHub
          </Link>
          <Link href="/feed.xml" className="link-editorial">
            RSS
          </Link>
        </div>
      </div>
    </footer>
  );
}
