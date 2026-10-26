import { beforeAll, describe, expect, it } from "vitest";
import { createGoogleIdTokenVerifier, GOOGLE_JWKS_URL, IdTokenError } from "../src/google-id-token.js";
import { createFakeGoogleSigner } from "./google-keys.js";

let signer: Awaited<ReturnType<typeof createFakeGoogleSigner>>;
let otherSigner: Awaited<ReturnType<typeof createFakeGoogleSigner>>;

beforeAll(async () => {
  signer = await createFakeGoogleSigner("key-1");
  otherSigner = await createFakeGoogleSigner("key-1"); // same kid, different key
});

async function expectRejected(promise: Promise<unknown>, message: RegExp) {
  const err = await promise.catch((e: IdTokenError) => e);
  expect(err).toBeInstanceOf(IdTokenError);
  expect((err as IdTokenError).status).toBe(401);
  expect((err as IdTokenError).message).toMatch(message);
}

describe("verifyGoogleIdToken", () => {
  it("accepts a valid token and returns its claims", async () => {
    const verify = createGoogleIdTokenVerifier(signer.jwksFetch());
    const claims = await verify(await signer.sign(), "client-id");
    expect(claims).toMatchObject({ sub: "google-123", email: "player@example.com", email_verified: true });
  });

  it("accepts the bare accounts.google.com issuer and an audience list", async () => {
    const verify = createGoogleIdTokenVerifier(signer.jwksFetch());
    const token = await signer.sign({ iss: "accounts.google.com", aud: ["other", "client-id"] });
    await expect(verify(token, "client-id")).resolves.toMatchObject({ sub: "google-123" });
  });

  it("rejects a token for a different app", async () => {
    const verify = createGoogleIdTokenVerifier(signer.jwksFetch());
    await expectRejected(verify(await signer.sign({ aud: "someone-else" }), "client-id"), /different app/);
  });

  it("rejects the wrong issuer", async () => {
    const verify = createGoogleIdTokenVerifier(signer.jwksFetch());
    await expectRejected(verify(await signer.sign({ iss: "https://evil.example" }), "client-id"), /issuer/);
  });

  it("rejects expired tokens, allowing a minute of clock skew", async () => {
    const verify = createGoogleIdTokenVerifier(signer.jwksFetch());
    const now = Math.floor(Date.now() / 1000);
    await expect(verify(await signer.sign({ exp: now - 30 }), "client-id")).resolves.toBeTruthy();
    await expectRejected(verify(await signer.sign({ exp: now - 120 }), "client-id"), /expired/);
  });

  it("rejects tokens issued in the future", async () => {
    const verify = createGoogleIdTokenVerifier(signer.jwksFetch());
    const now = Math.floor(Date.now() / 1000);
    await expectRejected(verify(await signer.sign({ iat: now + 600 }), "client-id"), /future/);
  });

  it("rejects a token signed by a different key", async () => {
    const verify = createGoogleIdTokenVerifier(signer.jwksFetch());
    await expectRejected(verify(await otherSigner.sign(), "client-id"), /signature/);
  });

  it("rejects tampered claims", async () => {
    const verify = createGoogleIdTokenVerifier(signer.jwksFetch());
    const [head, , sig] = (await signer.sign()).split(".");
    const forged = btoa(JSON.stringify({ iss: "accounts.google.com", aud: "client-id", sub: "admin", exp: 9e9 }))
      .replace(/=+$/, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    await expectRejected(verify(`${head}.${forged}.${sig}`, "client-id"), /signature/);
  });

  it("rejects unsupported algorithms and malformed tokens", async () => {
    const verify = createGoogleIdTokenVerifier(signer.jwksFetch());
    await expectRejected(verify(await signer.sign({}, { alg: "none" }), "client-id"), /Unsupported/);
    await expectRejected(verify("not-a-jwt", "client-id"), /Malformed/);
    await expectRejected(verify("a.b.c", "client-id"), /Malformed/);
  });

  it("caches keys, and refetches when Google rotates to an unknown kid", async () => {
    const rotated = await createFakeGoogleSigner("key-2");
    let served = signer.jwks;
    let calls = 0;
    let clock = Date.now();
    const fetchImpl = (async (input: string | URL | Request) => {
      expect(String(input)).toBe(GOOGLE_JWKS_URL);
      calls++;
      return Response.json(served, { headers: { "Cache-Control": "max-age=600" } });
    }) as typeof fetch;
    const verify = createGoogleIdTokenVerifier(fetchImpl, () => clock);

    await verify(await signer.sign(), "client-id");
    await verify(await signer.sign(), "client-id");
    expect(calls).toBe(1);

    // Google starts signing with key-2. A refetch happens, but at most once a minute.
    served = { keys: [...signer.jwks.keys, ...rotated.jwks.keys] };
    await expectRejected(verify(await rotated.sign(), "client-id"), /unknown key/);
    expect(calls).toBe(1);
    clock += 61_000;
    await expect(verify(await rotated.sign(), "client-id")).resolves.toBeTruthy();
    expect(calls).toBe(2);
  });

  it("reports a failure to load Google's keys separately", async () => {
    const verify = createGoogleIdTokenVerifier((async () => new Response("down", { status: 503 })) as typeof fetch);
    const err = await verify(await signer.sign(), "client-id").catch((e) => e);
    expect(err).toBeInstanceOf(IdTokenError);
    expect(err.status).toBe(502);
  });

  it("calls fetch unbound, as Cloudflare Workers requires", async () => {
    const jwks = signer.jwks;
    const workersLikeFetch = function (this: unknown) {
      if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
      return Promise.resolve(Response.json(jwks));
    } as unknown as typeof fetch;
    const verify = createGoogleIdTokenVerifier(workersLikeFetch);
    await expect(verify(await signer.sign(), "client-id")).resolves.toBeTruthy();
  });
});
