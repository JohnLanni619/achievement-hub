// Web Crypto only, so this runs on Cloudflare Workers (and in Node for tests).

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomToken(byteLength = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The PKCE S256 code challenge for a verifier. */
export async function pkceChallenge(verifier: string): Promise<string> {
  return toBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(verifier))));
}

/** Symmetric encryption for provider credentials at rest (AES-256-GCM). */
export class SecretBox {
  private key: Promise<CryptoKey>;

  constructor(secret: string) {
    this.key = crypto.subtle
      .digest("SHA-256", encoder.encode(`achievement-hub:credentials:${secret}`))
      .then((raw) => crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]));
  }

  async encrypt(plaintext: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await this.key, encoder.encode(plaintext));
    return `${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`;
  }

  async decrypt(payload: string): Promise<string> {
    const [iv, ciphertext] = payload.split(".").map(fromBase64);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await this.key, ciphertext);
    return new TextDecoder().decode(plaintext);
  }
}
