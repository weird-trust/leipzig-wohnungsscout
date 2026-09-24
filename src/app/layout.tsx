import type { Metadata } from "next";
import { diatype } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mauwscout Leipzig",
  description: "Persönliches Wohnungssuche-Dashboard für Leipzig",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className={`h-full ${diatype.variable}`}>
      <body className="min-h-full">
        {/* Decorative background: slow yellow heat fields plus grain (globals.css). */}
        <div aria-hidden="true" className="heatmap">
          <span />
          <span />
          <span />
        </div>
        <div className="mx-auto max-w-[90rem] px-4 pt-10 pb-24 sm:px-8 sm:pt-14 lg:px-16 lg:pt-20 xl:px-24">
          {children}
        </div>
      </body>
    </html>
  );
}
