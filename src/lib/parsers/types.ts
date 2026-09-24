import type { ApartmentFeatures, ListingData } from "@/lib/domain/apartment";
import type { IncomingEmail } from "@/lib/domain/email";

/**
 * What a parser extracts from an email. Semantic features are normally
 * extracted afterwards from the text; a parser only fills `features` when the
 * email states them as structured data (e.g. a "Balkon: nein" field).
 * Structured values win over text extraction; null/omitted means "not stated".
 */
export interface ParsedApartment extends ListingData {
  features?: Partial<ApartmentFeatures>;
}

export interface ApartmentParser {
  readonly name: string;
  /** Bump when parsing output changes; stored with each email for debugging. */
  readonly version: string;
  canParse(email: IncomingEmail): boolean;
  /** One alert email can contain several listings. */
  parse(email: IncomingEmail): ParsedApartment[];
}

export interface ParserFailure {
  parser: string;
  stage: "canParse" | "parse";
  message: string;
}

export interface ParseOutcome {
  /**
   * parsed: at least one apartment found.
   * failed: nothing found and at least one parser threw.
   * unrecognized: nothing found, no errors.
   */
  status: "parsed" | "unrecognized" | "failed";
  /** "name@version" of the parser that produced the result. */
  parserVersion: string;
  apartments: ParsedApartment[];
  failures: ParserFailure[];
}
