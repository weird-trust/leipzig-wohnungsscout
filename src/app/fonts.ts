import localFont from "next/font/local";

/**
 * ABC Diatype Rounded Superfamily, one variable file with real axes:
 * wght 200–1000, MONO 0–100 (proportional → monospaced), slnt −12–0.
 * Only the upright style is declared; there is no italic to fake.
 */
export const diatype = localFont({
  src: "../lib/fonts/ABC Diatype Rounded Superfamily Variable/ABCDiatypeRoundedSuperfamilyVariableTrial.ttf",
  weight: "200 1000",
  style: "normal",
  display: "swap",
  variable: "--font-diatype",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Helvetica Neue", "Arial", "sans-serif"],
});
