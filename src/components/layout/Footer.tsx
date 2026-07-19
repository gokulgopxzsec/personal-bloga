import Link from "next/link";
import { site } from "@/lib/constants";

export function Footer() {
  return (
    <footer className="border-t border-[var(--hairline)]">
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-5 py-10 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div>
          <p className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            <span className="text-[var(--accent)]">~/</span>gokul
          </p>
          <p className="prompt mt-2 max-w-xs font-mono text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            building in public from india. real numbers, no press releases.
          </p>
        </div>
        <div className="flex gap-4 font-mono text-xs text-zinc-500 dark:text-zinc-400">
          <Link href={site.author.makeforme} className="link-craft">
            makeforme.in
          </Link>
          <Link href={site.author.twitter} className="link-craft">
            twitter
          </Link>
          <Link href={site.author.github} className="link-craft">
            github
          </Link>
          <Link href="/feed.xml" className="link-craft">
            rss
          </Link>
        </div>
      </div>
    </footer>
  );
}
