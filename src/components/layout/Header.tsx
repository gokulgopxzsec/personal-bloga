import Link from "next/link";
import { Search } from "@/components/blog/Search";

const links = [
  { href: "/blog", label: "Writing" },
  { href: "/markets", label: "Markets" },
  { href: "/about", label: "About" },
  { href: "/now", label: "Now" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--hairline)] bg-[var(--background)]/80 backdrop-blur-md">
      <nav className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4 sm:px-6">
        <Link
          href="/"
          className="font-display text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-100"
        >
          Gokul<span className="text-amber-600">.</span>
        </Link>
        <div className="flex items-center gap-5 text-sm font-medium sm:gap-7">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="nav-link text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
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
