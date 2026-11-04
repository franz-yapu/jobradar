import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import type { JWK, JWTPayload } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { IdentityVerificationError } from "../domain/identity-provider.js";
import { GoogleIdentityProvider } from "./google-identity.provider.js";
import { challengeFor, generatePkce } from "./pkce.js";

const CONFIG = { clientId: "client-123.apps.googleusercontent.com", clientSecret: "shh-secret", redirectUri: "http://localhost:3000/auth/google/callback" };
const NOW = new Date("2026-11-04T12:00:00Z");
const NONCE = "nonce-abc";
const INPUT = { code: "auth-code", codeVerifier: "verifier-xyz", nonce: NONCE };
const KID = "test-key";

let privateKey: CryptoKey;
let otherKey: CryptoKey;
let publicJwk: JWK;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  otherKey = (await generateKeyPair("RS256")).privateKey;
  publicJwk = { ...(await exportJWK(pair.publicKey)), kid: KID, alg: "RS256", use: "sig" };
});

const seconds = (date: Date) => Math.floor(date.getTime() / 1000);

async function sign(overrides: JWTPayload = {}, options: { key?: CryptoKey; alg?: string } = {}): Promise<string> {
  const payload: JWTPayload = {
    iss: "https://accounts.google.com",
    aud: CONFIG.clientId,
    sub: "1234567890",
    email: "Jane@Example.com",
    email_verified: true,
    nonce: NONCE,
    iat: seconds(NOW),
    exp: seconds(NOW) + 3600,
    ...overrides,
  };
  const jwt = new SignJWT(payload).setProtectedHeader({ alg: options.alg ?? "RS256", kid: KID });
  return jwt.sign(options.key ?? privateKey);
}

interface Call {
  url: string;
  init: RequestInit;
}

function provider(answer: () => Promise<Response>, calls: Call[] = []) {
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return answer();
  }) as typeof fetch;
  return new GoogleIdentityProvider(CONFIG, { fetch: fetcher, keys: createLocalJWKSet({ keys: [publicJwk] }), now: () => NOW });
}

const tokenAnswer = (idToken: string) => async () => new Response(JSON.stringify({ id_token: idToken, access_token: "ignored" }), { status: 200 });

async function rejects(idToken: string, matcher: RegExp) {
  const error = await provider(tokenAnswer(idToken)).verifyCallback(INPUT).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(IdentityVerificationError);
  expect((error as Error).message).toMatch(matcher);
}

describe("GoogleIdentityProvider.authorizationUrl", () => {
  it("asks for the code flow with PKCE S256, state, nonce and only openid + email", () => {
    const url = new URL(provider(tokenAnswer("x")).authorizationUrl({ state: "s1", nonce: "n1", codeChallenge: "c1" }));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: CONFIG.clientId,
      redirect_uri: CONFIG.redirectUri,
      scope: "openid email",
      state: "s1",
      nonce: "n1",
      code_challenge: "c1",
      code_challenge_method: "S256",
    });
    expect(url.toString()).not.toContain(CONFIG.clientSecret);
  });
});

describe("GoogleIdentityProvider.verifyCallback", () => {
  it("returns the identity of a valid token, with the email lowercased", async () => {
    await expect(provider(tokenAnswer(await sign())).verifyCallback(INPUT)).resolves.toEqual({ sub: "1234567890", email: "jane@example.com" });
  });

  it("exchanges the code on the server with the secret and the PKCE verifier", async () => {
    const calls: Call[] = [];
    await provider(tokenAnswer(await sign()), calls).verifyCallback(INPUT);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://oauth2.googleapis.com/token");
    expect(calls[0]?.init.method).toBe("POST");
    const body = new URLSearchParams(String(calls[0]?.init.body));
    expect(Object.fromEntries(body)).toEqual({
      grant_type: "authorization_code",
      code: "auth-code",
      code_verifier: "verifier-xyz",
      client_id: CONFIG.clientId,
      client_secret: CONFIG.clientSecret,
      redirect_uri: CONFIG.redirectUri,
    });
  });

  it("accepts the other issuer spelling Google uses", async () => {
    await expect(provider(tokenAnswer(await sign({ iss: "accounts.google.com" }))).verifyCallback(INPUT)).resolves.toMatchObject({ sub: "1234567890" });
  });

  it("rejects a token for another client (audience)", async () => rejects(await sign({ aud: "someone-else" }), /aud|claim/i));
  it("rejects a token from another issuer", async () => rejects(await sign({ iss: "https://evil.example" }), /iss|claim/i));
  it("rejects an expired token", async () => rejects(await sign({ exp: seconds(NOW) - 3600, iat: seconds(NOW) - 7200 }), /exp|JWTExpired/i));
  it("rejects a token without exp or sub", async () => {
    await rejects(await sign({ exp: undefined as unknown as number }), /exp|claim/i);
    await rejects(await sign({ sub: undefined }), /sub|claim/i);
  });
  it("rejects a wrong nonce (replay of a token from another attempt)", async () => rejects(await sign({ nonce: "other" }), /nonce/));
  it("rejects a token without a nonce", async () => rejects(await sign({ nonce: undefined }), /nonce/));
  it("rejects an unverified email, and a missing or non-boolean email_verified", async () => {
    await rejects(await sign({ email_verified: false }), /not verified/);
    await rejects(await sign({ email_verified: undefined }), /not verified/);
    await rejects(await sign({ email_verified: "true" }), /not verified/);
  });
  it("rejects a token without an email", async () => rejects(await sign({ email: undefined }), /email/));
  it("rejects a token signed with another key", async () => rejects(await sign({}, { key: otherKey }), /signature|JWS/i));

  it("rejects an unsigned token (alg none)", async () => {
    const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const unsigned = `${part({ alg: "none", typ: "JWT" })}.${part({ iss: "https://accounts.google.com", aud: CONFIG.clientId, sub: "1", email: "a@b.co", email_verified: true, nonce: NONCE, iat: seconds(NOW), exp: seconds(NOW) + 60 })}.`;
    await rejects(unsigned, /./);
  });

  it("rejects an HS256 token (algorithm confusion), even one signed with the public key as secret", async () => {
    const token = await new SignJWT({ iss: "https://accounts.google.com", aud: CONFIG.clientId, sub: "1", email: "a@b.co", email_verified: true, nonce: NONCE })
      .setProtectedHeader({ alg: "HS256", kid: KID })
      .setIssuedAt(seconds(NOW))
      .setExpirationTime(seconds(NOW) + 60)
      .sign(new TextEncoder().encode(JSON.stringify(publicJwk)));
    await rejects(token, /alg|JWS|signature/i);
  });

  it("fails when Google answers an error, no id_token, or garbage", async () => {
    for (const answer of [
      async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }),
      async () => new Response(JSON.stringify({ access_token: "x" }), { status: 200 }),
      async () => new Response("<html>nope</html>", { status: 200 }),
    ]) {
      await expect(provider(answer).verifyCallback(INPUT)).rejects.toBeInstanceOf(IdentityVerificationError);
    }
  });

  it("turns a network failure into a verification error that does not leak the secret", async () => {
    const error = await provider(async () => {
      throw new TypeError("fetch failed");
    })
      .verifyCallback(INPUT)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(IdentityVerificationError);
    expect((error as Error).message).not.toContain(CONFIG.clientSecret);
  });
});

describe("PKCE", () => {
  it("creates a long random verifier and its S256 challenge, different every time", () => {
    const first = generatePkce();
    const second = generatePkce();
    expect(first.codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(first.codeVerifier).not.toBe(second.codeVerifier);
    expect(first.codeChallenge).toBe(challengeFor(first.codeVerifier));
    // RFC 7636 appendix B
    expect(challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});
