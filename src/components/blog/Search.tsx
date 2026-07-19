"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type SearchResult = {
  url: string;
  meta: { title: string };
  excerpt: string;
};

type Pagefind = {
  init?: () => Promise<void>;
  search: (query: string) => Promise<{
    results: Array<{ data: () => Promise<SearchResult> }>;
  }>;
};

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function Search() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const pagefindRef = useRef<Pagefind | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open || pagefindRef.current) return;

    let cancelled = false;

    async function loadPagefind() {
      try {
        const modulePath = "/pagefind/pagefind.js";
        const pagefind = (await import(
          /* webpackIgnore: true */ modulePath
        )) as Pagefind;
        await pagefind.init?.();
        if (cancelled) return;
        pagefindRef.current = pagefind;
        setReady(true);
      } catch {
        if (!cancelled) setError(true);
      }
    }

    loadPagefind();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (
        e.key === "/" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !open &&
        !isEditableTarget(e.target)
      ) {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open]);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery || !ready || !pagefindRef.current) {
      setResults([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    async function search() {
      try {
        const search = await pagefindRef.current?.search(normalizedQuery);
        if (cancelled || !search) return;

        const items = await Promise.all(
          search.results.slice(0, 8).map((result) => result.data()),
        );
        if (!cancelled) setResults(items);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    search();
    return () => { cancelled = true; };
  }, [query, ready]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        aria-label="Search"
      >
        Search /
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-24"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search posts"
        className="w-full max-w-lg rounded-xl bg-white shadow-2xl dark:bg-zinc-900"
      >
        <div className="flex items-center border-b border-zinc-200 px-4 dark:border-zinc-800">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search posts... (press / to open)"
            className="w-full bg-transparent py-3 text-sm outline-none text-zinc-900 placeholder:text-zinc-400 dark:text-zinc-100"
          />
          <button
            onClick={() => setOpen(false)}
            className="ml-2 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            aria-label="Close search"
          >
            Esc
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {!ready && query && (
            <p className="px-2 py-4 text-sm text-zinc-500">Loading search...</p>
          )}
          {error && (
            <p className="px-2 py-4 text-sm text-red-600 dark:text-red-400">
              Search is unavailable right now. Please try again after reloading.
            </p>
          )}
          {loading && (
            <p className="px-2 py-4 text-sm text-zinc-500">Searching...</p>
          )}
          {!loading && query && results.length === 0 && ready && (
            <p className="px-2 py-4 text-sm text-zinc-500">
              No results for &ldquo;{query}&rdquo;
            </p>
          )}
          {results.map((result) => (
            <Link
              key={result.url}
              href={result.url.replace(/\/$/, "") || "/"}
              onClick={() => {
                setOpen(false);
                setQuery("");
              }}
              className="block rounded-lg px-3 py-2 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {result.meta.title}
              </div>
              <div
                className="mt-0.5 text-xs text-zinc-500 line-clamp-1"
                dangerouslySetInnerHTML={{ __html: result.excerpt }}
              />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
