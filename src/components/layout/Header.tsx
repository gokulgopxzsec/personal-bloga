import Link from "next/link";
import { Search } from "@/components/blog/Search";

const links = [
  { href: "/blog", label: "writing" },
  { href: "/markets", label: "markets" },
  { href: "/about", label: "about" },
  { href: "/now", label: "now" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--hairline)] bg-[var(--background)]/85 backdrop-blur-md">
      <nav className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3.5 sm:px-6">
        <Link
          href="/"
          className="font-mono text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100"
        >
          <span className="text-[var(--accent)]">~/</span>gokul
          <span className="animate-pulse text-[var(--accent)]">_</span>
        </Link>
        <div className="flex items-center gap-5 font-mono text-[0.8rem] sm:gap-7">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="nav-link text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              {link.label}
            </Link>
          ))}
          <Search />
        </div>
      </nav>
    </header>
  );
}
