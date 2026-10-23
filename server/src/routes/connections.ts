import { Router, type Request } from "express";
import { z } from "zod";
import { HttpError, type AppContext } from "../context.js";
import { providerInfo } from "../providers/registry.js";
import type { Credentials, Provider } from "../providers/types.js";

interface ConnectionRow {
  id: number;
  provider_id: string;
  external_id: string;
  display_name: string;
  encrypted_credentials: string;
  created_at: string;
  updated_at: string;
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

export function connectionsRouter(ctx: AppContext): Router {
  const router = Router();

  const findConnection = ctx.db.prepare("SELECT * FROM connections WHERE user_id = ? AND provider_id = ?");
  const listConnections = ctx.db.prepare("SELECT * FROM connections WHERE user_id = ? ORDER BY created_at");

  const cachePrefix = (userId: number, providerId: string) => `${userId}:${providerId}:`;

  function provider(id: string): Provider {
    const p = ctx.providers.get(id);
    if (!p) throw new HttpError(404, "Unknown provider.");
    return p;
  }

  /** Resolves the provider and the signed-in user's decrypted credentials for it. */
  function connected(req: Request) {
    const providerId = String(req.params.providerId);
    const p = provider(providerId);
    const row = findConnection.get(req.user!.id, providerId) as ConnectionRow | undefined;
    if (!row) throw new HttpError(404, `${p.name} is not connected.`, "not_connected");
    const credentials = JSON.parse(ctx.secrets.decrypt(row.encrypted_credentials)) as Credentials;
    const cacheKey = (...parts: string[]) => cachePrefix(req.user!.id, providerId) + parts.join(":");
    return { provider: p, credentials, cacheKey };
  }

  // Catalog of supported providers, with the user's connection (if any).
  router.get("/providers", (req, res) => {
    const rows = listConnections.all(req.user!.id) as unknown as ConnectionRow[];
    const byProvider = new Map(rows.map((r) => [r.provider_id, toConnection(r)]));
    res.json({
      providers: ctx.providers.list().map((p) => ({ ...providerInfo(p), connection: byProvider.get(p.id) ?? null })),
    });
  });

  router.get("/connections", (req, res) => {
    const rows = listConnections.all(req.user!.id) as unknown as ConnectionRow[];
    res.json({
      connections: rows
        .filter((r) => ctx.providers.get(r.provider_id))
        .map((r) => ({ ...toConnection(r), providerName: ctx.providers.get(r.provider_id)!.name })),
    });
  });

  // Create or replace the connection for a provider. Credentials are verified first.
  router.put("/connections/:providerId", async (req, res) => {
    const p = provider(req.params.providerId);
    const { credentials: raw } = connectSchema.parse(req.body);
    const credentials: Credentials = {};
    for (const field of p.credentialFields) {
      const value = raw[field.name]?.trim();
      if (!value) throw new HttpError(400, `${field.label} is required.`);
      credentials[field.name] = value;
    }

    const account = await p.verify(credentials);
    const encrypted = ctx.secrets.encrypt(JSON.stringify(credentials));
    const row = ctx.db
      .prepare(
        `INSERT INTO connections (user_id, provider_id, external_id, display_name, encrypted_credentials)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (user_id, provider_id) DO UPDATE SET
           external_id = excluded.external_id,
           display_name = excluded.display_name,
           encrypted_credentials = excluded.encrypted_credentials,
           updated_at = datetime('now')
         RETURNING *`,
      )
      .get(req.user!.id, p.id, account.externalId, account.displayName, encrypted) as unknown as ConnectionRow;
    ctx.cache.deleteByPrefix(cachePrefix(req.user!.id, p.id));
    res.json({ connection: toConnection(row) });
  });

  router.delete("/connections/:providerId", (req, res) => {
    const p = provider(req.params.providerId);
    ctx.db.prepare("DELETE FROM connections WHERE user_id = ? AND provider_id = ?").run(req.user!.id, p.id);
    ctx.cache.deleteByPrefix(cachePrefix(req.user!.id, p.id));
    res.status(204).end();
  });

  router.get("/connections/:providerId/profile", async (req, res) => {
    const { provider: p, credentials, cacheKey } = connected(req);
    const profile = await ctx.cache.getOrLoad(cacheKey("profile"), () => p.getProfile(credentials));
    res.json({ provider: providerInfo(p), profile });
  });

  router.get("/connections/:providerId/games", async (req, res) => {
    const { provider: p, credentials, cacheKey } = connected(req);
    const games = await ctx.cache.getOrLoad(cacheKey("games"), () => p.listGames(credentials));
    res.json({ games });
  });

  router.get("/connections/:providerId/games/:gameId", async (req, res) => {
    const { provider: p, credentials, cacheKey } = connected(req);
    const gameId = String(req.params.gameId);
    const game = await ctx.cache.getOrLoad(cacheKey("game", gameId), () => p.getGame(credentials, gameId));
    res.json({ game });
  });

  router.get("/connections/:providerId/recent", async (req, res) => {
    const { provider: p, credentials, cacheKey } = connected(req);
    const achievements = await ctx.cache.getOrLoad(cacheKey("recent"), () => p.getRecentAchievements(credentials));
    res.json({ achievements });
  });

  // Drop cached data so the next request hits the provider again.
  router.post("/connections/:providerId/refresh", (req, res) => {
    const p = provider(req.params.providerId);
    ctx.cache.deleteByPrefix(cachePrefix(req.user!.id, p.id));
    res.status(204).end();
  });

  return router;
}
