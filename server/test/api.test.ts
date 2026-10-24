import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { Env } from "../src/context.js";
import { pkceChallenge } from "../src/crypto.js";
import { GOOGLE_JWKS_URL } from "../src/google-id-token.js";
import { demoProvider } from "../src/providers/demo.js";
import { ProviderRegistry } from "../src/providers/registry.js";
import { createRetroAchievementsProvider } from "../src/providers/retroachievements/index.js";
import { createTestD1 } from "./d1.js";
import { fakeRaFetch } from "./fixtures.js";
import { createFakeGoogleSigner } from "./google-keys.js";

const ORIGIN = "http://localhost:8787";
const CSRF = { "X-Requested-With": "achievement-hub" };

let db: ReturnType<typeof createTestD1>;
let env: Env;
let ra: ReturnType<typeof fakeRaFetch>;
let googleCalls: { url: string; body?: string }[];
let app: ReturnType<typeof createApp>;
let signer: Awaited<ReturnType<typeof createFakeGoogleSigner>>;

beforeAll(async () => {
  signer = await createFakeGoogleSigner();
});

/** Stands in for Google's token, userinfo and signing-key endpoints. */
const fakeGoogle = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  googleCalls.push({ url, body: init?.body?.toString() });
  if (url === "https://oauth2.googleapis.com/token") {
    const code = new URLSearchParams(init!.body!.toString()).get("code");
    if (code !== "good-code") return Response.json({ error: "invalid_grant" }, { status: 400 });
    return Response.json({ access_token: "google-access-token" });
  }
  if (url === "https://openidconnect.googleapis.com/v1/userinfo") {
    return Response.json({
      sub: "google-123",
      email: "player@example.com",
      email_verified: true,
      name: "Player One",
      picture: "https://lh3.googleusercontent.com/a/pic",
    });
  }
  if (url === GOOGLE_JWKS_URL) return Response.json(signer.jwks);
  return new Response("unexpected", { status: 500 });
}) as typeof fetch;

/** Minimal cookie-keeping client, like a browser tab. */
function client() {
  const jar = new Map<string, string>();
  return async (path: string, init: RequestInit & { json?: unknown } = {}) => {
    const headers = new Headers(init.headers);
    if (jar.size) headers.set("Cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
    if (init.json !== undefined) headers.set("Content-Type", "application/json");
    const res = await app.request(
      `${ORIGIN}${path}`,
      { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body },
      env,
    );
    for (const cookie of res.headers.getSetCookie()) {
      const [pair, ...attrs] = cookie.split(";");
      const [name, value] = pair.split("=");
      if (attrs.some((a) => /max-age=0/i.test(a)) || !value) jar.delete(name);
      else jar.set(name, value);
    }
    return res;
  };
}

async function signedInClient(email = "player@example.com") {
  const http = client();
  const res = await http("/api/auth/dev-login", { method: "POST", headers: CSRF, json: { email } });
  expect(res.status).toBe(200);
  return http;
}

beforeEach(() => {
  db = createTestD1();
  ra = fakeRaFetch();
  googleCalls = [];
  env = {
    DB: db,
    APP_SECRET: "test-secret",
    GOOGLE_CLIENT_ID: "client-id",
    GOOGLE_CLIENT_SECRET: "client-secret",
    DEV_LOGIN: "true",
  };
  app = createApp({
    providers: new ProviderRegistry().register(createRetroAchievementsProvider(ra.impl)).register(demoProvider),
    fetch: fakeGoogle,
  });
});

describe("Google sign-in", () => {
  async function startLogin(http: ReturnType<typeof client>, returnTo?: string) {
    const res = await http(`/api/auth/google${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`);
    expect(res.status).toBe(302);
    return new URL(res.headers.get("Location")!);
  }

  it("redirects to Google with state and PKCE, then signs in on callback", async () => {
    const http = client();
    const google = await startLogin(http, "/p/demo");
    expect(google.origin + google.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(google.searchParams.get("client_id")).toBe("client-id");
    expect(google.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/auth/google/callback`);
    expect(google.searchParams.get("code_challenge_method")).toBe("S256");
    const state = google.searchParams.get("state")!;

    const callback = await http(`/api/auth/google/callback?code=good-code&state=${state}`);
    expect(callback.status).toBe(302);
    expect(callback.headers.get("Location")).toBe("/p/demo");
    expect(callback.headers.getSetCookie().join()).toMatch(/ah_session=.*HttpOnly/);

    // The code verifier sent to Google must match the challenge sent to the browser.
    const verifier = new URLSearchParams(googleCalls[0].body).get("code_verifier")!;
    expect(await pkceChallenge(verifier)).toBe(google.searchParams.get("code_challenge"));

    const me = await (await http("/api/auth/me")).json();
    expect(me.user).toMatchObject({
      email: "player@example.com",
      displayName: "Player One",
      avatarUrl: "https://lh3.googleusercontent.com/a/pic",
    });
  });

  it("reuses the same account on the next sign-in", async () => {
    for (let i = 0; i < 2; i++) {
      const http = client();
      const state = (await startLogin(http)).searchParams.get("state");
      await http(`/api/auth/google/callback?code=good-code&state=${state}`);
    }
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM users").get()).toEqual({ n: 1 });
  });

  it("rejects a callback whose state doesn't match", async () => {
    const http = client();
    await startLogin(http);
    const res = await http("/api/auth/google/callback?code=good-code&state=forged");
    expect(res.headers.get("Location")).toBe("/login?error=invalid_state");
    expect(googleCalls).toHaveLength(0);
  });

  it("rejects a callback without the browser's state cookie", async () => {
    const state = (await startLogin(client())).searchParams.get("state");
    const res = await client()(`/api/auth/google/callback?code=good-code&state=${state}`);
    expect(res.headers.get("Location")).toBe("/login?error=invalid_state");
  });

  it("handles a failed code exchange and a denied consent", async () => {
    const http = client();
    const state = (await startLogin(http)).searchParams.get("state");
    const res = await http(`/api/auth/google/callback?code=bad-code&state=${state}`);
    expect(res.headers.get("Location")).toBe("/login?error=google_failed");
    const denied = await client()("/api/auth/google/callback?error=access_denied");
    expect(denied.headers.get("Location")).toBe("/login?error=google_denied");
  });

  it("ignores off-site returnTo values", async () => {
    const http = client();
    const state = (await startLogin(http, "//evil.example")).searchParams.get("state");
    const res = await http(`/api/auth/google/callback?code=good-code&state=${state}`);
    expect(res.headers.get("Location")).toBe("/");
  });

  it("builds the redirect URI from PUBLIC_URL when set", async () => {
    env.PUBLIC_URL = "https://hub.example.com";
    const google = await startLogin(client());
    expect(google.searchParams.get("redirect_uri")).toBe("https://hub.example.com/api/auth/google/callback");
  });

  it("reports when Google isn't configured", async () => {
    env.GOOGLE_CLIENT_ID = undefined;
    const res = await client()("/api/auth/google");
    expect(res.headers.get("Location")).toBe("/login?error=google_not_configured");
    expect(await (await client()("/api/auth/config")).json()).toEqual({ google: false, devLogin: true });
  });
});

describe("native app sign-in (ID token → bearer session)", () => {
  /** Requests as the Android app would: bearer token, no cookies. */
  const appRequest = (path: string, token?: string, init: RequestInit & { json?: unknown } = {}) => {
    const headers = new Headers(init.headers);
    headers.set("X-Requested-With", "achievement-hub");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (init.json !== undefined) headers.set("Content-Type", "application/json");
    return app.request(
      `${ORIGIN}${path}`,
      { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body },
      env,
    );
  };
  const exchange = async (idToken: string) =>
    appRequest("/api/auth/google/token", undefined, { method: "POST", json: { idToken } });

  it("exchanges a Google ID token for a bearer session", async () => {
    const res = await exchange(await signer.sign());
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie()).toEqual([]);
    const body = await res.json();
    expect(body.user).toMatchObject({ email: "player@example.com", displayName: "Player One" });
    expect(body.expiresInSeconds).toBeGreaterThan(0);

    const me = await (await appRequest("/api/auth/me", body.token)).json();
    expect(me.user.email).toBe("player@example.com");
    expect((await appRequest("/api/providers", body.token)).status).toBe(200);

    const stored = db.raw.prepare("SELECT token_hash FROM sessions").all() as { token_hash: string }[];
    expect(stored.map((r) => r.token_hash)).not.toContain(body.token);
  });

  it("signs in to the same account as the web's Google sign-in", async () => {
    const web = client();
    const google = new URL((await web("/api/auth/google")).headers.get("Location")!);
    await web(`/api/auth/google/callback?code=good-code&state=${google.searchParams.get("state")}`);
    await exchange(await signer.sign());
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM users").get()).toEqual({ n: 1 });
  });

  it("rejects an invalid token without creating a session", async () => {
    const res = await exchange(await signer.sign({ aud: "someone-else" }));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("invalid_id_token");
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM sessions").get()).toEqual({ n: 0 });
    expect((await exchange("garbage")).status).toBe(401);
    expect((await appRequest("/api/auth/google/token", undefined, { method: "POST", json: {} })).status).toBe(400);
  });

  it("rejects an unverified email", async () => {
    const res = await exchange(await signer.sign({ email_verified: false }));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("email_unverified");
  });

  it("reports when Google isn't configured", async () => {
    env.GOOGLE_CLIENT_ID = undefined;
    const res = await exchange(await signer.sign());
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("google_not_configured");
  });

  it("still requires the CSRF header", async () => {
    const res = await app.request(
      `${ORIGIN}/api/auth/google/token`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: "x" }) },
      env,
    );
    expect(res.status).toBe(403);
  });

  it("rejects unknown bearer tokens and ends the session on logout", async () => {
    expect((await appRequest("/api/providers", "not-a-real-token")).status).toBe(401);
    const { token } = await (await exchange(await signer.sign())).json();
    expect((await appRequest("/api/auth/logout", token, { method: "POST" })).status).toBe(204);
    expect((await appRequest("/api/providers", token)).status).toBe(401);
  });

  it("works with the connection endpoints", async () => {
    const { token } = await (await exchange(await signer.sign())).json();
    const put = await appRequest("/api/connections/demo", token, { method: "PUT", json: { credentials: { username: "p1" } } });
    expect(put.status).toBe(200);
    const games = await (await appRequest("/api/connections/demo/games", token)).json();
    expect(games.games.length).toBeGreaterThan(0);
  });
});

describe("sessions", () => {
  it("logs out", async () => {
    const http = await signedInClient();
    expect((await (await http("/api/auth/me")).json()).user.email).toBe("player@example.com");
    expect((await http("/api/auth/logout", { method: "POST", headers: CSRF })).status).toBe(204);
    expect((await (await http("/api/auth/me")).json()).user).toBeNull();
  });

  it("only allows dev login when enabled and on localhost", async () => {
    env.DEV_LOGIN = undefined;
    const off = await client()("/api/auth/dev-login", { method: "POST", headers: CSRF, json: { email: "a@b.co" } });
    expect(off.status).toBe(404);

    env.DEV_LOGIN = "true";
    const remote = await app.request(
      "https://achievement-hub.example.workers.dev/api/auth/dev-login",
      { method: "POST", headers: { ...CSRF, "Content-Type": "application/json" }, body: '{"email":"a@b.co"}' },
      env,
    );
    expect(remote.status).toBe(404);
  });

  it("requires the CSRF header on mutations", async () => {
    const res = await client()("/api/auth/dev-login", { method: "POST", json: { email: "a@b.co" } });
    expect(res.status).toBe(403);
  });

  it("requires sign-in for provider routes", async () => {
    expect((await client()("/api/providers")).status).toBe(401);
    expect((await client()("/api/connections/demo/games")).status).toBe(401);
  });
});

describe("connections", () => {
  const connectRa = (http: ReturnType<typeof client>, apiKey = "good-key") =>
    http("/api/connections/retroachievements", {
      method: "PUT",
      headers: CSRF,
      json: { credentials: { username: " TestPlayer ", apiKey } },
    });

  it("lists providers with connection status", async () => {
    const http = await signedInClient();
    const { providers } = await (await http("/api/providers")).json();
    const raInfo = providers.find((p: { id: string }) => p.id === "retroachievements");
    expect(raInfo.connection).toBeNull();
    expect(raInfo.credentialFields.map((f: { name: string }) => f.name)).toEqual(["username", "apiKey"]);
  });

  it("connects RetroAchievements, stores the key encrypted, and serves data", async () => {
    const http = await signedInClient();
    const connect = await connectRa(http);
    expect(connect.status).toBe(200);
    expect((await connect.json()).connection).toMatchObject({ providerId: "retroachievements", displayName: "TestPlayer" });

    const stored = db.raw.prepare("SELECT encrypted_credentials FROM connections").get() as { encrypted_credentials: string };
    expect(stored.encrypted_credentials).not.toContain("good-key");

    const profile = await (await http("/api/connections/retroachievements/profile")).json();
    expect(profile.profile.displayName).toBe("TestPlayer");
    expect((await (await http("/api/connections/retroachievements/games")).json()).games).toHaveLength(2);
    expect((await (await http("/api/connections/retroachievements/games/228")).json()).game.achievements).toHaveLength(2);
    expect((await (await http("/api/connections/retroachievements/recent")).json()).achievements).toHaveLength(1);

    const { providers } = await (await http("/api/providers")).json();
    expect(providers.find((p: { id: string }) => p.id === "retroachievements").connection).not.toBeNull();
  });

  it("caches provider responses until refreshed", async () => {
    const http = await signedInClient();
    await connectRa(http);
    const before = ra.calls.length;
    await http("/api/connections/retroachievements/games");
    await http("/api/connections/retroachievements/games");
    expect(ra.calls.length).toBe(before + 1);
    expect((await http("/api/connections/retroachievements/refresh", { method: "POST", headers: CSRF })).status).toBe(204);
    await http("/api/connections/retroachievements/games");
    expect(ra.calls.length).toBe(before + 2);
  });

  it("refuses invalid credentials without saving", async () => {
    const http = await signedInClient();
    const res = await connectRa(http, "bad");
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("provider_credentials_rejected");
    expect((await http("/api/connections/retroachievements/profile")).status).toBe(404);

    const missing = await http("/api/connections/retroachievements", {
      method: "PUT",
      headers: CSRF,
      json: { credentials: { username: "TestPlayer" } },
    });
    expect(missing.status).toBe(400);
  });

  it("disconnects", async () => {
    const http = await signedInClient();
    const put = await http("/api/connections/demo", { method: "PUT", headers: CSRF, json: { credentials: { username: "p1" } } });
    expect(put.status).toBe(200);
    expect((await http("/api/connections/demo", { method: "DELETE", headers: CSRF })).status).toBe(204);
    expect((await http("/api/connections/demo/games")).status).toBe(404);
  });

  it("keeps users' connections separate", async () => {
    const alice = await signedInClient("alice@example.com");
    const bob = await signedInClient("bob@example.com");
    await alice("/api/connections/demo", { method: "PUT", headers: CSRF, json: { credentials: { username: "alice" } } });
    expect((await bob("/api/connections/demo/profile")).status).toBe(404);
    expect((await (await bob("/api/connections")).json()).connections).toEqual([]);
  });

  it("404s on unknown providers and routes", async () => {
    const http = await signedInClient();
    const res = await http("/api/connections/nope", { method: "PUT", headers: CSRF, json: { credentials: {} } });
    expect(res.status).toBe(404);
    expect((await http("/api/nothing-here")).status).toBe(404);
  });
});
