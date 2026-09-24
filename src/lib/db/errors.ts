/** Postgres error codes the repositories react to. */
export const PG_UNIQUE_VIOLATION = "23505";
export const PG_INVALID_TEXT_REPRESENTATION = "22P02";

/** The subset of a Supabase/PostgREST error the db layer relies on. */
export interface DbErrorLike {
  code?: string;
  message: string;
}

export class DbError extends Error {
  readonly code: string | undefined;

  constructor(operation: string, cause: DbErrorLike) {
    super(`${operation} failed: ${cause.message}`);
    this.name = "DbError";
    this.code = cause.code;
  }
}

export function isUniqueViolation(error: DbErrorLike): boolean {
  return error.code === PG_UNIQUE_VIOLATION;
}

/** e.g. a malformed uuid in a lookup, which should read as "not found". */
export function isInvalidInput(error: DbErrorLike): boolean {
  return error.code === PG_INVALID_TEXT_REPRESENTATION;
}
