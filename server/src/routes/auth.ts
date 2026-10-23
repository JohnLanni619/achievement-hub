import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { HttpError, type AppContext, type User } from "../context.js";
import { hashPassword, randomToken, sha256, verifyPassword } from "../crypto.js";

export const SESSION_COOKIE = "ah_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
  password: z.string().min(8, "Password must be at least 8 characters.").max(200),
});

const registerSchema = credentialsSchema.extend({
  displayName: z.string().trim().min(1, "Display name is required.").max(50),
});

interface UserRow {
  id: number;
  email: string;
  display_name: string;
  password_hash: string;
}

const toUser = (row: UserRow): User => ({ id: row.id, email: row.email, displayName: row.display_name });

/** Throttles repeated failed logins per IP + email. */
class LoginThrottle {
  private failures = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private maxFailures = 10,
    private windowMs = 15 * 60 * 1000,
  ) {}

  check(key: string) {
    const entry = this.failures.get(key);
    if (entry && entry.resetAt > Date.now() && entry.count >= this.maxFailures) {
      throw new HttpError(429, "Too many failed sign-in attempts. Try again later.");
    }
  }
  fail(key: string) {
    const now = Date.now();
    const entry = this.failures.get(key);
    if (!entry || entry.resetAt <= now) this.failures.set(key, { count: 1, resetAt: now + this.windowMs });
    else entry.count++;
  }
  clear(key: string) {
    this.failures.delete(key);
  }
}

export function sessionMiddleware(ctx: AppContext) {
  const findSession = ctx.db.prepare(
    `SELECT u.id, u.email, u.display_name FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > datetime('now')`,
  );
  return (req: Request, _res: Response, next: NextFunction) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token === "string" && token) {
      const row = findSession.get(sha256(token)) as UserRow | undefined;
      if (row) req.user = toUser(row);
    }
    next();
  };
}

export function requireUser(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, "Sign in required.", "unauthenticated"));
  next();
}

export function authRouter(ctx: AppContext): Router {
  const router = Router();
  const throttle = new LoginThrottle();

  const insertSession = ctx.db.prepare(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', ?))",
  );

  function startSession(res: Response, userId: number) {
    const token = randomToken();
    insertSession.run(sha256(token), userId, `+${SESSION_TTL_MS / 1000} seconds`);
    ctx.db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: ctx.config.isProduction,
      maxAge: SESSION_TTL_MS,
      path: "/",
    });
  }

  router.post("/register", async (req, res) => {
    const input = registerSchema.parse(req.body);
    const existing = ctx.db.prepare("SELECT id FROM users WHERE email = ?").get(input.email);
    if (existing) throw new HttpError(409, "An account with that email already exists.");
    const passwordHash = await hashPassword(input.password);
    const row = ctx.db
      .prepare("INSERT INTO users (email, display_name, password_hash) VALUES (?, ?, ?) RETURNING *")
      .get(input.email, input.displayName, passwordHash) as unknown as UserRow;
    startSession(res, row.id);
    res.status(201).json({ user: toUser(row) });
  });

  router.post("/login", async (req, res) => {
    const input = credentialsSchema.parse(req.body);
    const throttleKey = `${req.ip}:${input.email}`;
    throttle.check(throttleKey);
    const row = ctx.db.prepare("SELECT * FROM users WHERE email = ?").get(input.email) as UserRow | undefined;
    if (!row || !(await verifyPassword(input.password, row.password_hash))) {
      throttle.fail(throttleKey);
      throw new HttpError(401, "Incorrect email or password.", "invalid_credentials");
    }
    throttle.clear(throttleKey);
    startSession(res, row.id);
    res.json({ user: toUser(row) });
  });

  router.post("/logout", (req, res) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token === "string") ctx.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.status(204).end();
  });

  router.get("/me", (req, res) => {
    res.json({ user: req.user ?? null });
  });

  return router;
}
