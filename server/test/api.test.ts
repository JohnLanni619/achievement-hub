import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp, createContext } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import type { AppContext } from "../src/context.js";
import { demoProvider } from "../src/providers/demo.js";
import { ProviderRegistry } from "../src/providers/registry.js";
import { createRetroAchievementsProvider } from "../src/providers/retroachievements/index.js";
import { fakeRaFetch } from "./fixtures.js";

const CSRF = { "X-Requested-With": "achievement-hub" };

let ctx: AppContext;
let ra: ReturnType<typeof fakeRaFetch>;

function setup() {
  ra = fakeRaFetch();
  const registry = new ProviderRegistry()
    .register(createRetroAchievementsProvider(ra.impl))
    .register(demoProvider);
  ctx = createContext(loadConfig({ databasePath: ":memory:", appSecret: "test-secret" }), registry);
  return createApp(ctx);
}

async function signedInAgent() {
  const agent = request.agent(setup());
  await agent
    .post("/api/auth/register")
    .set(CSRF)
    .send({ email: "Player@Example.com", password: "correct horse", displayName: "Player" })
    .expect(201);
  return agent;
}

describe("auth", () => {
  let app: ReturnType<typeof setup>;
  beforeEach(() => {
    app = setup();
  });

  it("registers, reports the session, logs out", async () => {
    const agent = request.agent(app);
    const res = await agent
      .post("/api/auth/register")
      .set(CSRF)
      .send({ email: "Player@Example.com", password: "correct horse", displayName: "Player" })
      .expect(201);
    expect(res.body.user).toMatchObject({ email: "player@example.com", displayName: "Player" });
    expect(res.headers["set-cookie"][0]).toMatch(/ah_session=.*HttpOnly/);

    expect((await agent.get("/api/auth/me")).body.user.email).toBe("player@example.com");
    await agent.post("/api/auth/logout").set(CSRF).expect(204);
    expect((await agent.get("/api/auth/me")).body.user).toBeNull();
  });

  it("logs in with the right password only", async () => {
    await request(app)
      .post("/api/auth/register")
      .set(CSRF)
      .send({ email: "a@example.com", password: "password123", displayName: "A" })
      .expect(201);
    await request(app).post("/api/auth/login").set(CSRF).send({ email: "a@example.com", password: "wrong-pass" }).expect(401);
    await request(app).post("/api/auth/login").set(CSRF).send({ email: "A@example.com", password: "password123" }).expect(200);
  });

  it("rejects duplicate emails and weak passwords", async () => {
    const body = { email: "a@example.com", password: "password123", displayName: "A" };
    await request(app).post("/api/auth/register").set(CSRF).send(body).expect(201);
    await request(app).post("/api/auth/register").set(CSRF).send(body).expect(409);
    const weak = await request(app).post("/api/auth/register").set(CSRF).send({ ...body, email: "b@example.com", password: "short" });
    expect(weak.status).toBe(400);
    expect(weak.body.error).toMatch(/at least 8/);
  });

  it("requires the CSRF header on mutations", async () => {
    await request(app).post("/api/auth/login").send({ email: "a@example.com", password: "password123" }).expect(403);
  });

  it("requires sign-in for provider routes", async () => {
    await request(app).get("/api/providers").expect(401);
  });
});

describe("connections", () => {
  it("lists providers with connection status", async () => {
    const agent = await signedInAgent();
    const res = await agent.get("/api/providers").expect(200);
    const ra = res.body.providers.find((p: { id: string }) => p.id === "retroachievements");
    expect(ra.connection).toBeNull();
    expect(ra.credentialFields.map((f: { name: string }) => f.name)).toEqual(["username", "apiKey"]);
  });

  it("connects RetroAchievements, stores the key encrypted, and serves data", async () => {
    const agent = await signedInAgent();
    const connect = await agent
      .put("/api/connections/retroachievements")
      .set(CSRF)
      .send({ credentials: { username: " TestPlayer ", apiKey: "good-key" } })
      .expect(200);
    expect(connect.body.connection).toMatchObject({ providerId: "retroachievements", displayName: "TestPlayer" });

    const stored = ctx.db.prepare("SELECT encrypted_credentials FROM connections").get() as { encrypted_credentials: string };
    expect(stored.encrypted_credentials).not.toContain("good-key");

    const profile = await agent.get("/api/connections/retroachievements/profile").expect(200);
    expect(profile.body.profile.displayName).toBe("TestPlayer");
    const games = await agent.get("/api/connections/retroachievements/games").expect(200);
    expect(games.body.games).toHaveLength(2);
    const game = await agent.get("/api/connections/retroachievements/games/228").expect(200);
    expect(game.body.game.achievements).toHaveLength(2);
    const recent = await agent.get("/api/connections/retroachievements/recent").expect(200);
    expect(recent.body.achievements).toHaveLength(1);

    const providers = await agent.get("/api/providers");
    expect(providers.body.providers.find((p: { id: string }) => p.id === "retroachievements").connection).not.toBeNull();
  });

  it("caches provider responses until refreshed", async () => {
    const agent = await signedInAgent();
    await agent.put("/api/connections/retroachievements").set(CSRF).send({ credentials: { username: "TestPlayer", apiKey: "good-key" } });
    const before = ra.calls.length;
    await agent.get("/api/connections/retroachievements/games").expect(200);
    await agent.get("/api/connections/retroachievements/games").expect(200);
    expect(ra.calls.length).toBe(before + 1);
    await agent.post("/api/connections/retroachievements/refresh").set(CSRF).expect(204);
    await agent.get("/api/connections/retroachievements/games").expect(200);
    expect(ra.calls.length).toBe(before + 2);
  });

  it("refuses invalid credentials without saving", async () => {
    const agent = await signedInAgent();
    const res = await agent
      .put("/api/connections/retroachievements")
      .set(CSRF)
      .send({ credentials: { username: "TestPlayer", apiKey: "bad" } });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("provider_credentials_rejected");
    await agent.get("/api/connections/retroachievements/profile").expect(404);

    const missing = await agent.put("/api/connections/retroachievements").set(CSRF).send({ credentials: { username: "TestPlayer" } });
    expect(missing.status).toBe(400);
  });

  it("disconnects", async () => {
    const agent = await signedInAgent();
    await agent.put("/api/connections/demo").set(CSRF).send({ credentials: { username: "p1" } }).expect(200);
    await agent.delete("/api/connections/demo").set(CSRF).expect(204);
    await agent.get("/api/connections/demo/games").expect(404);
  });

  it("keeps users' connections separate", async () => {
    const app = setup();
    const alice = request.agent(app);
    const bob = request.agent(app);
    await alice.post("/api/auth/register").set(CSRF).send({ email: "alice@example.com", password: "password123", displayName: "Alice" });
    await bob.post("/api/auth/register").set(CSRF).send({ email: "bob@example.com", password: "password123", displayName: "Bob" });
    await alice.put("/api/connections/demo").set(CSRF).send({ credentials: { username: "alice" } }).expect(200);
    await bob.get("/api/connections/demo/profile").expect(404);
    expect((await bob.get("/api/connections")).body.connections).toEqual([]);
  });

  it("404s on unknown providers", async () => {
    const agent = await signedInAgent();
    await agent.put("/api/connections/nope").set(CSRF).send({ credentials: {} }).expect(404);
  });
});
