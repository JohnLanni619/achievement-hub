import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export interface Config {
  port: number;
  isProduction: boolean;
  databasePath: string;
  appSecret: string;
  enableDemoProvider: boolean;
  webDistPath: string;
}

function resolveSecret(databasePath: string, isProduction: boolean): string {
  const fromEnv = process.env.APP_SECRET;
  if (fromEnv) return fromEnv;
  if (isProduction) {
    throw new Error("APP_SECRET must be set in production");
  }
  // In development, persist a generated secret next to the database so
  // stored credentials stay decryptable across restarts.
  if (databasePath === ":memory:") return crypto.randomBytes(32).toString("hex");
  const secretFile = path.join(path.dirname(databasePath), ".app-secret");
  if (fs.existsSync(secretFile)) return fs.readFileSync(secretFile, "utf8").trim();
  const secret = crypto.randomBytes(32).toString("hex");
  fs.mkdirSync(path.dirname(secretFile), { recursive: true });
  fs.writeFileSync(secretFile, secret, { mode: 0o600 });
  return secret;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const isProduction = process.env.NODE_ENV === "production";
  const databasePath = overrides.databasePath ?? process.env.DATABASE_PATH ?? "./data/achievement-hub.db";
  const demoEnv = process.env.ENABLE_DEMO_PROVIDER;
  return {
    port: Number(process.env.PORT ?? 3001),
    isProduction,
    databasePath,
    appSecret: overrides.appSecret ?? resolveSecret(databasePath, isProduction),
    enableDemoProvider: demoEnv === undefined ? !isProduction : demoEnv === "true",
    webDistPath: path.resolve(import.meta.dirname, "../../web/dist"),
    ...overrides,
  };
}
