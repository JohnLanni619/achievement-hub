import type { TtlCache } from "./cache.js";
import type { Config } from "./config.js";
import type { SecretBox } from "./crypto.js";
import type { Db } from "./db.js";
import type { ProviderRegistry } from "./providers/registry.js";

export interface AppContext {
  config: Config;
  db: Db;
  providers: ProviderRegistry;
  secrets: SecretBox;
  cache: TtlCache;
}

export interface User {
  id: number;
  email: string;
  displayName: string;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: User;
  }
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}
