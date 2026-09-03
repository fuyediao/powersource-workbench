/**
 * Loose Supabase `.from()` for tables not yet regenerated in Electron `Database` types.
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase'

/** Minimal PostgREST filter chain used by loose table helpers. */
export type LooseFilterBuilder = {
  select: (
    columns?: string,
    options?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean },
  ) => LooseFilterBuilder
  insert: (values: Record<string, unknown> | Record<string, unknown>[]) => LooseFilterBuilder
  update: (values: Record<string, unknown>) => LooseFilterBuilder
  upsert: (
    values: Record<string, unknown> | Record<string, unknown>[],
    options?: { onConflict?: string },
  ) => LooseFilterBuilder
  delete: () => LooseFilterBuilder
  eq: (column: string, value: string | boolean | number) => LooseFilterBuilder
  /** Not-equal filter (PostgREST `neq`). */
  neq: (column: string, value: string | boolean | number) => LooseFilterBuilder
  /** `IS` comparison (PostgREST `is`), e.g. null checks. */
  is: (column: string, value: null | boolean) => LooseFilterBuilder
  in: (column: string, values: readonly string[]) => LooseFilterBuilder
  or: (filters: string) => LooseFilterBuilder
  /** Negated filter (PostgREST `not`), e.g. `.not('col', 'is', null)`. */
  not: (column: string, operator: string, value: unknown) => LooseFilterBuilder
  /** Case-insensitive `LIKE` (PostgREST `ilike`). */
  ilike: (column: string, pattern: string) => LooseFilterBuilder
  /** Greater-than filter. */
  gt: (column: string, value: string | number) => LooseFilterBuilder
  /** Less-than filter. */
  lt: (column: string, value: string | number) => LooseFilterBuilder
  /** Greater-than-or-equal filter. */
  gte: (column: string, value: string | number) => LooseFilterBuilder
  /** Less-than-or-equal filter. */
  lte: (column: string, value: string | number) => LooseFilterBuilder
  order: (
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean },
  ) => LooseFilterBuilder
  range: (from: number, to: number) => LooseFilterBuilder
  limit: (count: number) => LooseFilterBuilder
  maybeSingle: () => PromiseLike<{
    data: Record<string, unknown> | null
    error: { message: string } | null
  }>
  single: () => PromiseLike<{
    data: Record<string, unknown>
    error: { message: string } | null
  }>
  then: PromiseLike<{
    data: Record<string, unknown>[] | null
    error: { message: string } | null
    count: number | null
  }>['then']
}

/**
 * Returns an untyped query builder for a public table name.
 * @param table - Postgres table name.
 * @returns Query builder (same runtime as supabase.from).
 */
export function fromLoose(table: string): LooseFilterBuilder {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  return (
    supabase as unknown as {
      from: (relation: string) => LooseFilterBuilder
    }
  ).from(table)
}

/** Result of an untyped Postgres RPC. */
export type LooseRpcResult = {
  data: unknown
  error: { message: string } | null
}

/**
 * Calls a public Postgres function not yet in Electron `Database` types.
 * @param fn - Function name.
 * @param args - Named arguments.
 * @returns RPC payload.
 */
export async function rpcLoose(
  fn: string,
  args: Record<string, unknown>,
): Promise<LooseRpcResult> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  return (
    supabase as unknown as {
      rpc: (fnName: string, params: Record<string, unknown>) => Promise<LooseRpcResult>
    }
  ).rpc(fn, args)
}
