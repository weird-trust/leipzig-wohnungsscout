import type { DbErrorLike } from "@/lib/db/errors";
import type { Db } from "@/lib/db/types";

/**
 * Minimal stand-in for the Supabase query builder, for repository unit
 * tests. Each awaited query consumes the next queued response and records
 * the chain of calls that built it. Test-only.
 */

export interface FakeResponse {
  data: unknown;
  error: DbErrorLike | null;
  count?: number | null;
}

export interface RecordedQuery {
  table: string;
  calls: { method: string; args: unknown[] }[];
}

const CHAIN_METHODS = [
  "select",
  "insert",
  "upsert",
  "update",
  "eq",
  "is",
  "order",
  "single",
  "maybeSingle",
] as const;

export function createFakeDb(responses: FakeResponse[]): {
  db: Db;
  queries: RecordedQuery[];
} {
  const queue = [...responses];
  const queries: RecordedQuery[] = [];

  function from(table: string) {
    const query: RecordedQuery = { table, calls: [] };
    queries.push(query);

    const builder: Record<string, unknown> = {
      then(resolve: (value: FakeResponse) => unknown, reject: (error: unknown) => unknown) {
        const response = queue.shift();
        return response
          ? Promise.resolve(response).then(resolve)
          : Promise.reject(new Error(`No fake response queued for ${table}`)).catch(reject);
      },
    };
    for (const method of CHAIN_METHODS) {
      builder[method] = (...args: unknown[]) => {
        query.calls.push({ method, args });
        return builder;
      };
    }
    return builder;
  }

  return { db: { from } as unknown as Db, queries };
}

export function callArgs(query: RecordedQuery, method: string): unknown[] | undefined {
  return query.calls.find((call) => call.method === method)?.args;
}
