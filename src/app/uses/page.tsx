import type { Metadata } from "next";
import { generateMeta } from "@/lib/seo";

export const metadata: Metadata = generateMeta({
  title: "Uses",
  description:
    "The gear, software, and tools I use to build makeforme.in and run my life.",
  path: "/uses",
});

const items = [
  {
    category: "Hardware",
    items: [
      { name: "Laptop", description: "MacBook Air M2, 16GB — daily driver" },
      { name: "Monitor", description: "Dell 27\" 4K, USB-C" },
      { name: "Keyboard", description: "Keychron K2, brown switches" },
      { name: "Mouse", description: "Logitech MX Master 3S" },
    ],
  },
  {
    category: "Software",
    items: [
      { name: "Editor", description: "VS Code — Jetbrains Mono, Catppuccin theme" },
      { name: "Terminal", description: "Warp" },
      { name: "Design", description: "Figma (free tier)" },
      { name: "Notes", description: "Notion + plain markdown files" },
    ],
  },
  {
    category: "Stack",
    items: [
      { name: "Framework", description: "Next.js + Tailwind CSS" },
      { name: "Hosting", description: "Cloudflare Pages" },
      { name: "Payments", description: "Razorpay" },
      { name: "Database", description: "PostgreSQL via Neon (free tier)" },
      { name: "Email", description: "Resend + React Email" },
    ],
  },
];

export default function UsesPage() {
  return (
    <div className="prose prose-zinc mx-auto dark:prose-invert">
      <h1>Uses</h1>
      <p>
        Everything I use to build makeforme.in and write this blog. Updated
        occasionally.
      </p>
      {items.map((group) => (
        <div key={group.category}>
          <h2>{group.category}</h2>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {group.items.map((item) => (
                <tr key={item.name}>
                  <td className="font-medium whitespace-nowrap">{item.name}</td>
                  <td>{item.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
