/**
 * Minimal subset of Cloudflare's D1 binding that we use. Declared here rather
 * than pulling in @cloudflare/workers-types, whose globals clash with Node's
 * in tests; the real binding satisfies it structurally.
 */
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
}

/** Worker bindings: see wrangler.jsonc and .dev.vars.example. */
export interface Env {
  DB: D1Database;
  /** Encrypts stored provider credentials. */
  APP_SECRET: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** Public origin used to build the OAuth redirect URI. Defaults to the request's origin. */
  PUBLIC_URL?: string;
  /** "true" to show the sample-data Demo Provider. */
  ENABLE_DEMO_PROVIDER?: string;
  /** "true" to allow passwordless sign-in from localhost, for local development. */
  DEV_LOGIN?: string;
}

export interface User {
  id: number;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

export type AppEnv = {
  Bindings: Env;
  Variables: { user: User | null };
};

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}
