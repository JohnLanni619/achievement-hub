import { Hono, type Context } from "hono";
import { ZodError } from "zod";
import { TtlCache } from "./cache.js";
import { HttpError, type AppEnv } from "./context.js";
import { demoProvider } from "./providers/demo.js";
import { ProviderRegistry } from "./providers/registry.js";
import { createRetroAchievementsProvider } from "./providers/retroachievements/index.js";
import { ProviderError } from "./providers/types.js";
import { authRoutes, requireUser, sessionMiddleware } from "./routes/auth.js";
import { connectionRoutes } from "./routes/connections.js";

export interface AppOptions {
  /** Overrides the provider list (tests inject providers with fake fetch). */
  providers?: ProviderRegistry;
  /** fetch used for Google OAuth calls. */
  fetch?: typeof fetch;
}

const registries = new Map<boolean, ProviderRegistry>();
function defaultRegistry(c: Context<AppEnv>): ProviderRegistry {
  const demo = c.env.ENABLE_DEMO_PROVIDER === "true";
  let registry = registries.get(demo);
  if (!registry) {
    registry = new ProviderRegistry().register(createRetroAchievementsProvider());
    if (demo) registry.register(demoProvider);
    registries.set(demo, registry);
  }
  return registry;
}

export function createApp(options: AppOptions = {}) {
  const registryFor = options.providers ? () => options.providers! : defaultRegistry;
  // Per-isolate memo of provider responses. Best effort: Workers isolates come
  // and go, which only means an occasional extra call to the provider.
  const cache = new TtlCache(2 * 60 * 1000);

  const app = new Hono<AppEnv>().basePath("/api");

  // Mutating requests must carry a custom header. Browsers can't add custom
  // headers to cross-site requests without a CORS preflight (which we never
  // approve), so this blocks CSRF in addition to the SameSite cookie.
  app.use(async (c, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method) && c.req.header("X-Requested-With") !== "achievement-hub") {
      throw new HttpError(403, "Missing CSRF header.");
    }
    await next();
  });
  app.use(sessionMiddleware);

  app.get("/health", (c) => c.json({ ok: true }));
  app.route("/auth", authRoutes(options.fetch));
  app.use("/providers", requireUser);
  app.use("/connections/*", requireUser);
  app.use("/connections", requireUser);
  app.route("/", connectionRoutes(registryFor, cache));

  app.notFound((c) => c.json({ error: "Not found." }, 404));

  app.onError((err, c) => {
    if (err instanceof ZodError) {
      return c.json({ error: err.issues[0]?.message ?? "Invalid request." }, 400);
    }
    if (err instanceof HttpError) {
      return c.json({ error: err.message, code: err.code }, err.status as 400);
    }
    if (err instanceof ProviderError) {
      // A provider rejecting stored credentials must not look like our own
      // session expiring (401), or the UI would sign the user out.
      if (err.status === 401) {
        return c.json({ error: err.message, code: "provider_credentials_rejected" }, 422);
      }
      return c.json({ error: err.message, code: "provider_error" }, err.status as 400);
    }
    console.error(err);
    return c.json({ error: "Something went wrong." }, 500);
  });

  return app;
}
