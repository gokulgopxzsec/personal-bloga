import type { MDXComponents } from "mdx/types";
import Image from "next/image";
import { Callout } from "./Callout";

export function getMdxComponents(): MDXComponents {
  return {
    Image: (props: React.ComponentProps<typeof Image>) => (
      <Image {...props} alt={props.alt ?? ""} className="rounded-lg my-6" />
    ),
    Callout,
    blockquote: ({ children, ...props }) => (
      <blockquote
        className="my-6 border-l-4 border-zinc-300 pl-4 italic text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
        {...props}
      >
        {children}
      </blockquote>
    ),
    pre: ({ children, ...props }) => (
      <pre
        className="my-6 overflow-x-auto rounded-lg bg-zinc-900 p-4 text-sm text-zinc-100"
        {...props}
      >
        {children}
      </pre>
    ),
    code: ({ children, ...props }) => (
      <code
        className="rounded bg-zinc-100 px-1.5 py-0.5 text-sm text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
        {...props}
      >
        {children}
      </code>
    ),
  };
}
