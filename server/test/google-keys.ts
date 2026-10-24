import { GOOGLE_JWKS_URL } from "../src/google-id-token.js";

/** Stand-in for Google's ID token signing: an RSA key pair, its JWKS, and a token minter. */
export async function createFakeGoogleSigner(kid = "test-key-1") {
  const { privateKey, publicKey } = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey("jwk", publicKey)) as JsonWebKey;

  const b64url = (bytes: Uint8Array) =>
    btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const encodeJson = (value: unknown) => b64url(new TextEncoder().encode(JSON.stringify(value)));

  const nowSeconds = () => Math.floor(Date.now() / 1000);

  return {
    kid,
    jwks: { keys: [{ kty: "RSA", kid, alg: "RS256", use: "sig", n: jwk.n, e: jwk.e }] },

    /** Signs a token; `claims` override the valid defaults. */
    async sign(claims: Record<string, unknown> = {}, header: Record<string, unknown> = {}) {
      const head = encodeJson({ alg: "RS256", kid, typ: "JWT", ...header });
      const body = encodeJson({
        iss: "https://accounts.google.com",
        aud: "client-id",
        sub: "google-123",
        email: "player@example.com",
        email_verified: true,
        name: "Player One",
        picture: "https://lh3.googleusercontent.com/a/pic",
        iat: nowSeconds(),
        exp: nowSeconds() + 3600,
        ...claims,
      });
      const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(`${head}.${body}`));
      return `${head}.${body}.${b64url(new Uint8Array(signature))}`;
    },

    /** A fetch that serves this signer's JWKS, counting requests. */
    jwksFetch() {
      const state = { calls: 0 };
      const impl = (async (input: string | URL | Request) => {
        if (String(input) !== GOOGLE_JWKS_URL) return new Response("unexpected", { status: 500 });
        state.calls++;
        return Response.json(this.jwks, { headers: { "Cache-Control": "public, max-age=600" } });
      }) as typeof fetch;
      return Object.assign(impl, { state });
    },
  };
}
