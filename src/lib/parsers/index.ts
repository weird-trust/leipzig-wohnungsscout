import type { IncomingEmail } from "@/lib/domain/email";
import { genericParser } from "@/lib/parsers/generic";
import { immoscoutParser } from "@/lib/parsers/immoscout";
import type {
  ApartmentParser,
  ParseOutcome,
  ParserFailure,
} from "@/lib/parsers/types";

/**
 * Platform parsers, tried in order. Add one only together with real
 * fixtures in fixtures/emails/<platform>/.
 */
export const PLATFORM_PARSERS: readonly ApartmentParser[] = [
  immoscoutParser, // fixtures/emails/immoscout/alert-01.json
];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parserVersion(parser: ApartmentParser): string {
  return `${parser.name}@${parser.version}`;
}

/**
 * Tries each platform parser that accepts the email, then the fallback.
 * A throwing parser is recorded as a failure and skipped; this never throws.
 */
export function parseEmail(
  email: IncomingEmail,
  parsers: readonly ApartmentParser[] = PLATFORM_PARSERS,
  fallback: ApartmentParser = genericParser,
): ParseOutcome {
  const failures: ParserFailure[] = [];

  for (const parser of [...parsers, fallback]) {
    let accepts: boolean;
    try {
      accepts = parser.canParse(email);
    } catch (error) {
      failures.push({ parser: parser.name, stage: "canParse", message: errorMessage(error) });
      continue;
    }
    if (!accepts) continue;

    try {
      const apartments = parser.parse(email);
      if (apartments.length > 0) {
        return { status: "parsed", parserVersion: parserVersion(parser), apartments, failures };
      }
    } catch (error) {
      failures.push({ parser: parser.name, stage: "parse", message: errorMessage(error) });
    }
  }

  return {
    status: failures.length > 0 ? "failed" : "unrecognized",
    parserVersion: parserVersion(fallback),
    apartments: [],
    failures,
  };
}
