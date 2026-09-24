import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Leipzig Wohnungsscout",
  description: "Persönliches Wohnungssuche-Dashboard für Leipzig",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className="h-full">
      <body className="min-h-full">
        <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <header className="flex items-baseline justify-between border-b-4 border-fg pt-6 pb-3">
            <Link
              href="/"
              className="text-sm font-bold tracking-[0.12em] uppercase hover:underline"
            >
              Leipzig Wohnungsscout
            </Link>
            <span className="text-xs text-muted">V0.1</span>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
