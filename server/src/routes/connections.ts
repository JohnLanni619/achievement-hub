import { Hono, type Context } from "hono";
import { z } from "zod";
import type { TtlCache } from "../cache.js";
import { HttpError, type AppEnv } from "../context.js";
import { SecretBox } from "../crypto.js";
import { providerInfo, type ProviderRegistry } from "../providers/registry.js";
import type { Credentials, Provider } from "../providers/types.js";

interface ConnectionRow {
  id: number;
  provider_id: string;
  external_id: string;
  display_name: string;
  encrypted_credentials: string;
  created_at: string;
}

const toConnection = (row: ConnectionRow) => ({
  id: row.id,
  providerId: row.provider_id,
  externalId: row.external_id,
  displayName: row.display_name,
  connectedAt: `${row.created_at.replace(" ", "T")}Z`,
});

const connectSchema = z.object({
  credentials: z.record(z.string(), z.string().max(500)),
});

const secretBoxes = new Map<string, SecretBox>();
function secrets(c: Context<AppEnv>): SecretBox {
  const secret = c.env.APP_SECRET;
  if (!secret) throw new Error("APP_SECRET is not configured");
  let box = secretBoxes.get(secret);
  if (!box) secretBoxes.set(secret, (box = new SecretBox(secret)));
  return box;
}

export function connectionRoutes(registryFor: (c: Context<AppEnv>) => ProviderRegistry, cache: TtlCache) {
  const router = new Hono<AppEnv>();

  const userId = (c: Context<AppEnv>) => c.get("user")!.id;
  const cachePrefix = (uid: number, providerId: string) => `${uid}:${providerId}:`;

  function provider(c: Context<AppEnv>): Provider {
    const p = registryFor(c).get(c.req.param("providerId") ?? "");
    if (!p) throw new HttpError(404, "Unknown provider.");
    return p;
  }

  async function listConnections(c: Context<AppEnv>) {
    const { results } = await c.env.DB.prepare("SELECT * FROM connections WHERE user_id = ? ORDER BY created_at")
      .bind(userId(c))
      .all<ConnectionRow>();
    return results;
  }

  /** Resolves the provider and the signed-in user's decrypted credentials for it. */
  async function connected(c: Context<AppEnv>) {
    const p = provider(c);
    const row = await c.env.DB.prepare("SELECT * FROM connections WHERE user_id = ? AND provider_id = ?")
      .bind(userId(c), p.id)
      .first<ConnectionRow>();
    if (!row) throw new HttpError(404, `${p.name} is not connected.`, "not_connected");
    const credentials = JSON.parse(await secrets(c).decrypt(row.encrypted_credentials)) as Credentials;
    const cacheKey = (...parts: string[]) => cachePrefix(userId(c), p.id) + parts.join(":");
    return { provider: p, credentials, cacheKey };
  }

  // Catalog of supported providers, with the user's connection (if any).
  router.get("/providers", async (c) => {
    const byProvider = new Map((await listConnections(c)).map((r) => [r.provider_id, toConnection(r)]));
    return c.json({
      providers: registryFor(c)
        .list()
        .map((p) => ({ ...providerInfo(p), connection: byProvider.get(p.id) ?? null })),
    });
  });

  router.get("/connections", async (c) => {
    const registry = registryFor(c);
    return c.json({
      connections: (await listConnections(c))
        .filter((r) => registry.get(r.provider_id))
        .map((r) => ({ ...toConnection(r), providerName: registry.get(r.provider_id)!.name })),
    });
  });

  // Create or replace the connection for a provider. Credentials are verified first.
  router.put("/connections/:providerId", async (c) => {
    const p = provider(c);
    const body = await c.req.json().catch(() => {
      throw new HttpError(400, "Malformed JSON body.");
    });
    const { credentials: raw } = connectSchema.parse(body);
    const credentials: Credentials = {};
    for (const field of p.credentialFields) {
      const value = raw[field.name]?.trim();
      if (!value) throw new HttpError(400, `${field.label} is required.`);
      credentials[field.name] = value;
    }

    const account = await p.verify(credentials);
    const encrypted = await secrets(c).encrypt(JSON.stringify(credentials));
    const row = await c.env.DB.prepare(
      `INSERT INTO connections (user_id, provider_id, external_id, display_name, encrypted_credentials)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (user_id, provider_id) DO UPDATE SET
         external_id = excluded.external_id,
         display_name = excluded.display_name,
         encrypted_credentials = excluded.encrypted_credentials,
         updated_at = datetime('now')
       RETURNING *`,
    )
      .bind(userId(c), p.id, account.externalId, account.displayName, encrypted)
      .first<ConnectionRow>();
    cache.deleteByPrefix(cachePrefix(userId(c), p.id));
    return c.json({ connection: toConnection(row!) });
  });

  router.delete("/connections/:providerId", async (c) => {
    const p = provider(c);
    await c.env.DB.prepare("DELETE FROM connections WHERE user_id = ? AND provider_id = ?").bind(userId(c), p.id).run();
    cache.deleteByPrefix(cachePrefix(userId(c), p.id));
    return c.body(null, 204);
  });

  router.get("/connections/:providerId/profile", async (c) => {
    const { provider: p, credentials, cacheKey } = await connected(c);
    const profile = await cache.getOrLoad(cacheKey("profile"), () => p.getProfile(credentials));
    return c.json({ provider: providerInfo(p), profile });
  });

  router.get("/connections/:providerId/games", async (c) => {
    const { provider: p, credentials, cacheKey } = await connected(c);
    const games = await cache.getOrLoad(cacheKey("games"), () => p.listGames(credentials));
    return c.json({ games });
  });

  router.get("/connections/:providerId/games/:gameId", async (c) => {
    const { provider: p, credentials, cacheKey } = await connected(c);
    const gameId = c.req.param("gameId");
    const game = await cache.getOrLoad(cacheKey("game", gameId), () => p.getGame(credentials, gameId));
    return c.json({ game });
  });

  router.get("/connections/:providerId/recent", async (c) => {
    const { provider: p, credentials, cacheKey } = await connected(c);
    const achievements = await cache.getOrLoad(cacheKey("recent"), () => p.getRecentAchievements(credentials));
    return c.json({ achievements });
  });

  // Drop cached data so the next request hits the provider again.
  router.post("/connections/:providerId/refresh", (c) => {
    const p = provider(c);
    cache.deleteByPrefix(cachePrefix(userId(c), p.id));
    return c.body(null, 204);
  });

  return router;
}
