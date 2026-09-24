import type { ApartmentParser } from "@/lib/parsers/types";

/**
 * Safe fallback for emails no platform parser handles. It extracts nothing:
 * guessing listings from unknown emails would fill the dashboard with junk.
 * The raw email is still stored, so it can become a fixture later.
 */
export const genericParser: ApartmentParser = {
  name: "generic",
  version: "0.1.0",
  canParse: () => true,
  parse: () => [],
};
