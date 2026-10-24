// Verifies Google ID tokens (JWTs) such as those Android's Credential Manager
// returns, using Web Crypto so it runs on Cloudflare Workers.
// https://developers.google.com/identity/gsi/web/guides/verify-google-id-token

export const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

const ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);
const CLOCK_SKEW_SECONDS = 60;
const DEFAULT_KEYS_MAX_AGE_SECONDS = 60 * 60;
/** An unknown `kid` forces a key refetch at most this often, so bogus tokens can't make us hammer Google. */
const MIN_FORCED_REFETCH_MS = 60 * 1000;

export interface GoogleIdTokenClaims {
  iss: string;
  aud: string | string[];
  sub: string;
  exp: number;
  iat?: number;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

export class IdTokenError extends Error {
  constructor(
    message: string,
    /** 401 for a bad token; 502 when Google's keys couldn't be loaded. */
    public status: 401 | 502 = 401,
  ) {
    super(message);
    this.name = "IdTokenError";
  }
}

interface Jwk {
  kid?: string;
  kty?: string;
  n?: string;
  e?: string;
}

const encoder = new TextEncoder();

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

function decodeJson<T>(segment: string): T {
  return JSON.parse(new TextDecoder().decode(fromBase64Url(segment))) as T;
}

export type GoogleIdTokenVerifier = (idToken: string, clientId: string) => Promise<GoogleIdTokenClaims>;

/**
 * Returns a verifier that caches Google's signing keys for as long as
 * Google's Cache-Control header allows. `fetchImpl` and `now` are injectable
 * for tests.
 */
export function createGoogleIdTokenVerifier(
  fetchImpl: typeof fetch = (...args) => fetch(...args),
  now: () => number = () => Date.now(),
): GoogleIdTokenVerifier {
  let cache: { keys: Map<string, CryptoKey>; expiresAt: number; fetchedAt: number } | undefined;

  async function loadKeys(force: boolean): Promise<Map<string, CryptoKey>> {
    if (cache && (force ? now() - cache.fetchedAt < MIN_FORCED_REFETCH_MS : cache.expiresAt > now())) {
      return cache.keys;
    }
    const res = await fetchImpl(GOOGLE_JWKS_URL).catch(() => undefined);
    if (!res?.ok) throw new IdTokenError("Could not load Google's signing keys.", 502);
    const { keys = [] } = (await res.json().catch(() => ({}))) as { keys?: Jwk[] };

    const imported = new Map<string, CryptoKey>();
    for (const jwk of keys) {
      if (jwk.kty !== "RSA" || !jwk.kid || !jwk.n || !jwk.e) continue;
      const key = await crypto.subtle.importKey(
        "jwk",
        { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      );
      imported.set(jwk.kid, key);
    }
    const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get("Cache-Control") ?? "")?.[1] ?? DEFAULT_KEYS_MAX_AGE_SECONDS);
    cache = { keys: imported, expiresAt: now() + maxAge * 1000, fetchedAt: now() };
    return imported;
  }

  return async function verify(idToken, clientId) {
    const parts = idToken.split(".");
    if (parts.length !== 3) throw new IdTokenError("Malformed ID token.");

    let header: { alg?: string; kid?: string };
    let claims: GoogleIdTokenClaims;
    try {
      header = decodeJson(parts[0]);
      claims = decodeJson(parts[1]);
    } catch {
      throw new IdTokenError("Malformed ID token.");
    }
    if (header.alg !== "RS256" || typeof header.kid !== "string") throw new IdTokenError("Unsupported ID token.");

    // Google rotates keys; a kid we haven't seen may be newer than our cache.
    let key = (await loadKeys(false)).get(header.kid);
    if (!key) key = (await loadKeys(true)).get(header.kid);
    if (!key) throw new IdTokenError("ID token signed with an unknown key.");

    let signature: Uint8Array<ArrayBuffer>;
    try {
      signature = fromBase64Url(parts[2]);
    } catch {
      throw new IdTokenError("Malformed ID token.");
    }
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      signature,
      encoder.encode(`${parts[0]}.${parts[1]}`),
    );
    if (!valid) throw new IdTokenError("Invalid ID token signature.");

    const nowSeconds = now() / 1000;
    if (!ISSUERS.has(claims.iss)) throw new IdTokenError("ID token has the wrong issuer.");
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(clientId)) throw new IdTokenError("ID token was issued for a different app.");
    if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_SECONDS < nowSeconds) {
      throw new IdTokenError("ID token has expired.");
    }
    if (typeof claims.iat === "number" && claims.iat - CLOCK_SKEW_SECONDS > nowSeconds) {
      throw new IdTokenError("ID token was issued in the future.");
    }
    if (typeof claims.sub !== "string" || !claims.sub) throw new IdTokenError("ID token has no subject.");
    return claims;
  };
}
