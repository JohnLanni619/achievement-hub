import fs from "node:fs";
import path from "node:path";
import cookieParser from "cookie-parser";
import express, { type NextFunction, type Request, type Response } from "express";
import { ZodError } from "zod";
import { TtlCache } from "./cache.js";
import type { Config } from "./config.js";
import { HttpError, type AppContext } from "./context.js";
import { SecretBox } from "./crypto.js";
import { openDatabase } from "./db.js";
import { demoProvider } from "./providers/demo.js";
import { ProviderRegistry } from "./providers/registry.js";
import { createRetroAchievementsProvider } from "./providers/retroachievements/index.js";
import { ProviderError } from "./providers/types.js";
import { authRouter, requireUser, sessionMiddleware } from "./routes/auth.js";
import { connectionsRouter } from "./routes/connections.js";

export function createContext(config: Config, providers?: ProviderRegistry): AppContext {
  const registry = providers ?? new ProviderRegistry().register(createRetroAchievementsProvider());
  if (!providers && config.enableDemoProvider) registry.register(demoProvider);
  return {
    config,
    db: openDatabase(config.databasePath),
    providers: registry,
    secrets: new SecretBox(config.appSecret),
    cache: new TtlCache(2 * 60 * 1000),
  };
}

/**
 * Mutating requests must carry a custom header. Browsers can't add custom
 * headers to cross-site form posts without a CORS preflight (which we never
 * approve), so this blocks CSRF in addition to the SameSite cookie.
 */
function csrfGuard(req: Request, _res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.get("X-Requested-With") !== "achievement-hub") {
    return next(new HttpError(403, "Missing CSRF header."));
  }
  next();
}

function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(400).json({ error: err.issues[0]?.message ?? "Invalid request." });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  if (err instanceof ProviderError) {
    // A provider rejecting stored credentials must not look like our own
    // session expiring (401), or the UI would sign the user out.
    if (err.status === 401) {
      res.status(422).json({ error: err.message, code: "provider_credentials_rejected" });
    } else {
      res.status(err.status).json({ error: err.message, code: "provider_error" });
    }
    return;
  }
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ error: "Malformed JSON body." });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong." });
}

export function createApp(ctx: AppContext) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", "loopback");

  const api = express.Router();
  api.use(express.json({ limit: "100kb" }));
  api.use(cookieParser());
  api.use(csrfGuard);
  api.use(sessionMiddleware(ctx));
  api.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
  api.use("/auth", authRouter(ctx));
  api.use(requireUser, connectionsRouter(ctx));
  api.use((_req, _res, next) => next(new HttpError(404, "Not found.")));
  api.use(errorHandler);
  app.use("/api", api);

  // In production, serve the built web app and let the client router handle paths.
  const indexHtml = path.join(ctx.config.webDistPath, "index.html");
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(ctx.config.webDistPath, { index: false }));
    app.get(/.*/, (_req, res) => res.sendFile(indexHtml));
  }

  return app;
}
