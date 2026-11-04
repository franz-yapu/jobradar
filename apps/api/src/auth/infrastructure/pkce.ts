import { createHash, randomBytes } from "node:crypto";

const base64url = (bytes: Buffer): string => bytes.toString("base64url");

/** PKCE (RFC 7636): a 256-bit random verifier and its S256 challenge. */
export function generatePkce(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = base64url(randomBytes(32));
  return { codeVerifier, codeChallenge: challengeFor(codeVerifier) };
}

export function challengeFor(codeVerifier: string): string {
  return base64url(createHash("sha256").update(codeVerifier).digest());
}
