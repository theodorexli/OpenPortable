/**
 * Minimal SQL driver surface for OpenPort memory.
 * Cloudflare D1 and platforms/local (node:sqlite) implement this.
 */

export type SqlRow = Record<string, unknown>

export type SqlStatement = {
  bind(...values: unknown[]): SqlStatement
  first<T = SqlRow>(): Promise<T | null>
  all<T = SqlRow>(): Promise<{ results?: T[] }>
  run(): Promise<unknown>
}

export type SqlDatabase = {
  prepare(query: string): SqlStatement
}
