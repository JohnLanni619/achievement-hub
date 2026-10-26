import { Hono, type Context, type MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import { HttpError, type AppEnv, type User } from "../context.js";
import { pkceChallenge, randomToken, sha256Hex } from "../crypto.js";
import { createGoogleIdTokenVerifier, IdTokenError } from "../google-id-token.js";

export const SESSION_COOKIE = "ah_session";
const OAUTH_COOKIE = "ah_oauth";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

interface UserRow {
  id: number;
  email: string;
  display_name: string;
  avatar_url: string | null;
}

const toUser = (row: UserRow): User => ({
  id: row.id,
  email: row.email,
  displayName: row.display_name,
  avatarUrl: row.avatar_url,
});

const isSecure = (c: Context) => new URL(c.req.url).protocol === "https:";

/** Only same-site paths, so the post-login redirect can't be used as an open redirect. */
function safeReturnTo(value: string | undefined): string {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/";
}

function devLoginAllowed(c: Context<AppEnv>): boolean {
  const host = new URL(c.req.url).hostname;
  return c.env.DEV_LOGIN === "true" && (host === "localhost" || host === "127.0.0.1");
}

function callbackUrl(c: Context<AppEnv>): string {
  return new URL("/api/auth/google/callback", c.env.PUBLIC_URL || c.req.url).toString();
}

function googleConfigured(c: Context<AppEnv>): boolean {
  return Boolean(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET);
}

/**
 * The session token from `Authorization: Bearer` (native apps) or the
 * session cookie (web). Both refer to rows in the same sessions table.
 */
function sessionToken(c: Context<AppEnv>): string | undefined {
  const auth = c.req.header("Authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice("Bearer ".length).trim() || undefined;
  return getCookie(c, SESSION_COOKIE);
}

export const sessionMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("user", null);
  const token = sessionToken(c);
  if (token) {
    const row = await c.env.DB.prepare(
      `SELECT u.id, u.email, u.display_name, u.avatar_url FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > datetime('now')`,
    )
      .bind(await sha256Hex(token))
      .first<UserRow>();
    if (row) c.set("user", toUser(row));
  }
  await next();
};

export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("user")) throw new HttpError(401, "Sign in required.", "unauthenticated");
  await next();
};

async function upsertUser(c: Context<AppEnv>, subject: string, email: string, name: string, avatarUrl: string | null) {
  const row = await c.env.DB.prepare(
    `INSERT INTO users (google_sub, email, display_name, avatar_url) VALUES (?, ?, ?, ?)
     ON CONFLICT (google_sub) DO UPDATE SET
       email = excluded.email, display_name = excluded.display_name, avatar_url = excluded.avatar_url
     RETURNING id, email, display_name, avatar_url`,
  )
    .bind(subject, email, name, avatarUrl)
    .first<UserRow>();
  return row!;
}

/** Creates a session row and returns its token. */
async function createSession(c: Context<AppEnv>, userId: number): Promise<string> {
  const token = randomToken();
  await c.env.DB.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
  await c.env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', ?))")
    .bind(await sha256Hex(token), userId, `+${SESSION_TTL_SECONDS} seconds`)
    .run();
  return token;
}

/** Starts a web session: creates it and sets the session cookie. */
async function startSession(c: Context<AppEnv>, userId: number) {
  const token = await createSession(c, userId);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: isSecure(c),
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });
}

interface GoogleUserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

/** `fetchImpl` is injectable so tests can stand in for Google. */
export function authRoutes(fetchImpl: typeof fetch = (...args) => fetch(...args)) {
  const router = new Hono<AppEnv>();
  const verifyIdToken = createGoogleIdTokenVerifier(fetchImpl);

  router.get("/config", (c) => c.json({ google: googleConfigured(c), devLogin: devLoginAllowed(c) }));

  router.get("/me", (c) => c.json({ user: c.get("user") }));

  // Step 1: send the browser to Google's consent screen.
  router.get("/google", async (c) => {
    if (!googleConfigured(c)) return c.redirect("/login?error=google_not_configured");
    const state = randomToken();
    const verifier = randomToken(48);
    const returnTo = safeReturnTo(c.req.query("returnTo"));
    setCookie(c, OAUTH_COOKIE, JSON.stringify({ state, verifier, returnTo }), {
      httpOnly: true,
      sameSite: "Lax",
      secure: isSecure(c),
      maxAge: 10 * 60,
      path: "/api/auth",
    });
    const url = new URL(GOOGLE_AUTH_URL);
    url.search = new URLSearchParams({
      client_id: c.env.GOOGLE_CLIENT_ID!,
      redirect_uri: callbackUrl(c),
      response_type: "code",
      scope: "openid email profile",
      state,
      code_challenge: await pkceChallenge(verifier),
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
    return c.redirect(url.toString());
  });

  // Step 2: Google redirects back here with a one-time code.
  router.get("/google/callback", async (c) => {
    const fail = (code: string) => c.redirect(`/login?error=${code}`);
    const raw = getCookie(c, OAUTH_COOKIE);
    deleteCookie(c, OAUTH_COOKIE, { path: "/api/auth" });
    if (!googleConfigured(c)) return fail("google_not_configured");
    if (c.req.query("error")) return fail("google_denied");

    let stored: { state: string; verifier: string; returnTo: string } | undefined;
    try {
      stored = raw ? JSON.parse(raw) : undefined;
    } catch {
      stored = undefined;
    }
    const code = c.req.query("code");
    if (!stored || !code || stored.state !== c.req.query("state")) return fail("invalid_state");

    const tokenRes = await fetchImpl(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: c.env.GOOGLE_CLIENT_ID!,
        client_secret: c.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: callbackUrl(c),
        grant_type: "authorization_code",
        code_verifier: stored.verifier,
      }),
    }).catch(() => undefined);
    if (!tokenRes?.ok) return fail("google_failed");
    const { access_token: accessToken } = (await tokenRes.json()) as { access_token?: string };
    if (!accessToken) return fail("google_failed");

    const infoRes = await fetchImpl(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => undefined);
    if (!infoRes?.ok) return fail("google_failed");
    const info = (await infoRes.json()) as GoogleUserInfo;
    if (!info.sub || !info.email || !info.email_verified) return fail("email_unverified");

    const user = await upsertUser(c, info.sub, info.email, info.name || info.email, info.picture ?? null);
    await startSession(c, user.id);
    return c.redirect(safeReturnTo(stored.returnTo));
  });

  // Native apps: exchange a Google ID token (from Android's Credential
  // Manager) for a session token, sent back as `Authorization: Bearer`.
  router.post("/google/token", async (c) => {
    const clientId = c.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new HttpError(503, "Google sign-in isn't configured on this server.", "google_not_configured");
    const { idToken } = z
      .object({ idToken: z.string().min(1).max(8192) })
      .parse(await c.req.json().catch(() => ({})));

    let claims;
    try {
      claims = await verifyIdToken(idToken, clientId);
    } catch (err) {
      if (!(err instanceof IdTokenError)) throw err;
      if (err.status === 502) throw new HttpError(502, "Couldn't reach Google. Try again shortly.", "google_failed");
      throw new HttpError(401, "Google sign-in failed. Please try again.", "invalid_id_token");
    }
    if (!claims.email || !claims.email_verified) {
      throw new HttpError(401, "Your Google account's email address isn't verified.", "email_unverified");
    }

    const user = await upsertUser(c, claims.sub, claims.email, claims.name || claims.email, claims.picture ?? null);
    const token = await createSession(c, user.id);
    return c.json({ token, expiresInSeconds: SESSION_TTL_SECONDS, user: toUser(user) });
  });

  // Local development only: sign in as any email without Google.
  router.post("/dev-login", async (c) => {
    if (!devLoginAllowed(c)) throw new HttpError(404, "Not found.");
    const input = z
      .object({
        email: z.string().trim().toLowerCase().email("Enter a valid email address."),
        name: z.string().trim().max(50).optional(),
      })
      .parse(await c.req.json().catch(() => ({})));
    const row = await upsertUser(c, `dev:${input.email}`, input.email, input.name || input.email, null);
    await startSession(c, row.id);
    return c.json({ user: toUser(row) });
  });

  router.post("/logout", async (c) => {
    const token = sessionToken(c);
    if (token) await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.body(null, 204);
  });

  return router;
}
