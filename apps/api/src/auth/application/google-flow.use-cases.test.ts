import { beforeEach, describe, expect, it } from "vitest";
import { OAUTH_FLOW_TTL_MS, safeReturnTo } from "../domain/oauth-flow.js";
import { SESSION_TTL_MS } from "../domain/session.js";
import { PasswordExistsError, PasswordRequiredError, TooManyAttemptsError, UnauthenticatedError, WeakPasswordError, type User } from "../domain/user.js";
import { CryptoTokenGenerator } from "../infrastructure/crypto-token-generator.js";
import { FakeIdentityProvider } from "../infrastructure/fake-identity.provider.js";
import { InMemoryAttemptLimiter } from "../infrastructure/in-memory-attempt-limiter.js";
import { InMemoryOAuthFlowRepository, InMemorySessionRepository, InMemoryUserRepository } from "../infrastructure/in-memory-auth.repositories.js";
import { CryptoPkceGenerator } from "../infrastructure/pkce.js";
import { FAST_SCRYPT_FOR_TESTS, ScryptPasswordHasher } from "../infrastructure/scrypt-password-hasher.js";
import { CompleteGoogleFlow, GOOGLE_CALLBACK_LIMIT, GOOGLE_START_LIMIT, SetPassword, StartGoogleFlow, UnlinkGoogle } from "./google-flow.use-cases.js";

const IP = { ip: "198.51.100.7" };
const IDENTITY = { sub: "google-sub-1", email: "jane@example.com" };

let now: Date;
let provider: FakeIdentityProvider;
let flows: InMemoryOAuthFlowRepository;
let users: InMemoryUserRepository;
let sessions: InMemorySessionRepository;
let limiter: InMemoryAttemptLimiter;
const tokens = new CryptoTokenGenerator();
const hasher = new ScryptPasswordHasher(FAST_SCRYPT_FOR_TESTS);

function build(signupAllowed = true) {
  const clock = { now: () => now };
  return {
    start: new StartGoogleFlow(provider, flows, tokens, new CryptoPkceGenerator(), limiter, clock),
    complete: new CompleteGoogleFlow(provider, flows, users, sessions, tokens, limiter, clock, { signupAllowed }),
  };
}

const passwordUser = (overrides: Partial<User> = {}): User => ({
  id: "00000000-0000-4000-8000-0000000000a1",
  email: "jane@example.com",
  passwordHash: "scrypt$stored",
  googleSub: null,
  emailVerifiedAt: null,
  createdAt: new Date("2026-11-01T00:00:00Z"),
  ...overrides,
});

beforeEach(() => {
  now = new Date("2026-11-04T12:00:00Z");
  provider = new FakeIdentityProvider();
  flows = new InMemoryOAuthFlowRepository();
  users = new InMemoryUserRepository();
  sessions = new InMemorySessionRepository();
  limiter = new InMemoryAttemptLimiter({ now: () => now }); // shared by every use case of a test, like in the app
});

/** Starts an attempt and returns the raw state (what the browser keeps in its cookie). */
async function begin(intent: "login" | "link" = "login", userId: string | null = null, returnTo?: string) {
  const { start } = build();
  const { state } = await start.execute({ intent, userId, returnTo }, IP);
  return state;
}

const NO_COOKIE = Symbol("no cookie");
const callback = (state: string, cookie: string | typeof NO_COOKIE = state, extra: { code?: string; providerError?: boolean } = {}) =>
  build().complete.execute(
    { code: extra.code ?? "code-1", state, providerError: extra.providerError ?? false },
    { ...IP, cookieState: cookie === NO_COOKIE ? undefined : cookie },
  );

describe("StartGoogleFlow", () => {
  it("stores only the hash of the state, with its nonce, verifier and a 10 minute life, and returns the provider URL", async () => {
    const { start } = build();
    const result = await start.execute({ intent: "login", userId: null, returnTo: "/profile" }, IP);

    const [flow] = [...flows.flows.values()];
    expect(flows.flows.size).toBe(1);
    expect(flow?.stateHash).toBe(tokens.hash(result.state));
    expect(JSON.stringify(flow)).not.toContain(result.state);
    expect(flow).toMatchObject({ intent: "login", userId: null, returnTo: "/profile" });
    expect(flow?.expiresAt.getTime()).toBe(now.getTime() + OAUTH_FLOW_TTL_MS);
    expect(flow?.nonce.length).toBeGreaterThan(20);
    expect(flow?.codeVerifier.length).toBeGreaterThanOrEqual(43);
    // the provider gets the same state and nonce, and a challenge, never the verifier itself
    expect(provider.authorizations[0]).toMatchObject({ state: result.state, nonce: flow?.nonce });
    expect(result.redirectUrl).not.toContain(flow?.codeVerifier ?? "x");
  });

  it("every attempt gets a different state, nonce and verifier", async () => {
    await begin();
    await begin();
    const [a, b] = [...flows.flows.values()];
    expect(a?.stateHash).not.toBe(b?.stateHash);
    expect(a?.nonce).not.toBe(b?.nonce);
    expect(a?.codeVerifier).not.toBe(b?.codeVerifier);
  });

  it("only accepts a local return path", async () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "/ok\nSet-Cookie: a=b", "x".repeat(300), ""]) {
      expect(safeReturnTo(bad)).toBe("/");
    }
    expect(safeReturnTo("/settings/account?tab=1")).toBe("/settings/account?tab=1");
    expect(safeReturnTo(undefined)).toBe("/");
  });

  it("linking needs the logged-in user", async () => {
    await expect(build().start.execute({ intent: "link", userId: null, returnTo: undefined }, IP)).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("drops expired attempts when a new one begins, and is throttled per address", async () => {
    await begin();
    now = new Date(now.getTime() + OAUTH_FLOW_TTL_MS + 1000);
    await begin();
    expect(flows.flows.size).toBe(1);

    const { start } = build();
    // two attempts were already counted above; the rest of the window's allowance goes here
    for (let i = 0; i < GOOGLE_START_LIMIT - 2; i += 1) await start.execute({ intent: "login", userId: null, returnTo: undefined }, IP);
    await expect(start.execute({ intent: "login", userId: null, returnTo: undefined }, IP)).rejects.toBeInstanceOf(TooManyAttemptsError);
  });
});

describe("CompleteGoogleFlow, sign in and sign up", () => {
  it("creates a verified account without a password for a new Google identity, and opens a fresh session", async () => {
    const state = await begin("login", null, "/profile");
    provider.willVerify(IDENTITY);
    const result = await callback(state);

    expect(result.type).toBe("signed_in");
    if (result.type !== "signed_in") return;
    expect(result.returnTo).toBe("/profile");
    expect(result.grant.user).toMatchObject({ email: "jane@example.com", hasPassword: false, googleLinked: true, emailVerified: true });
    expect(result.grant.expiresAt.getTime()).toBe(now.getTime() + SESSION_TTL_MS);
    const stored = [...users.users.values()][0];
    expect(stored).toMatchObject({ passwordHash: null, googleSub: "google-sub-1", emailVerifiedAt: now });
    expect(sessions.sessions.has(tokens.hash(result.grant.sessionToken))).toBe(true);
    expect(sessions.sessions.has(result.grant.sessionToken)).toBe(false);
    // the provider received the code, and the verifier and nonce stored by this very attempt
    expect(provider.verifications[0]).toMatchObject({ code: "code-1" });
    expect(provider.verifications[0]?.nonce.length).toBeGreaterThan(20);
  });

  it("logs in the account that already has this Google identity (and does not look at its email)", async () => {
    users.users.set("u1", passwordUser({ id: "u1", email: "old@example.com", googleSub: "google-sub-1", passwordHash: null }));
    provider.willVerify({ sub: "google-sub-1", email: "changed@example.com" });
    const result = await callback(await begin());
    expect(result).toMatchObject({ type: "signed_in", grant: { user: { id: "u1", email: "old@example.com" } } });
    expect(users.users.size).toBe(1);
  });

  it("never links or logs in by email: a password account with the same email needs its password first", async () => {
    users.users.set("u1", passwordUser({ id: "u1" }));
    provider.willVerify(IDENTITY);
    const result = await callback(await begin());
    expect(result).toMatchObject({ type: "failed", code: "google_link_required", intent: "login" });
    expect(sessions.sessions.size).toBe(0);
    expect(users.users.get("u1")).toMatchObject({ googleSub: null, emailVerifiedAt: null, passwordHash: "scrypt$stored" });
    expect(users.users.size).toBe(1);
  });

  it("refuses to create accounts when registration is closed, but existing Google accounts can still log in", async () => {
    const closed = (state: string) =>
      build(false).complete.execute({ code: "c", state, providerError: false }, { ...IP, cookieState: state });
    provider.willVerify(IDENTITY);
    expect(await closed(await begin())).toMatchObject({ type: "failed", code: "signup_disabled" });
    expect(users.users.size).toBe(0);

    users.users.set("u1", passwordUser({ id: "u1", passwordHash: null, googleSub: "google-sub-1" }));
    expect(await closed(await begin())).toMatchObject({ type: "signed_in" });
  });
});

describe("CompleteGoogleFlow, the attempt itself", () => {
  it("is single use: replaying the same state finds nothing", async () => {
    const state = await begin();
    provider.willVerify(IDENTITY);
    expect((await callback(state)).type).toBe("signed_in");
    expect(await callback(state)).toMatchObject({ type: "failed", code: "google_failed" });
    expect(users.users.size).toBe(1);
  });

  it("expires after ten minutes", async () => {
    const state = await begin();
    now = new Date(now.getTime() + OAUTH_FLOW_TTL_MS + 1);
    provider.willVerify(IDENTITY);
    expect(await callback(state)).toMatchObject({ type: "failed", code: "google_failed" });
    expect(users.users.size).toBe(0);
  });

  it("refuses an unknown or missing state", async () => {
    provider.willVerify(IDENTITY);
    expect(await callback("made-up-state")).toMatchObject({ type: "failed", code: "google_failed" });
    expect(await build().complete.execute({ code: "c", state: undefined, providerError: false }, { ...IP, cookieState: undefined })).toMatchObject({
      type: "failed",
      code: "google_failed",
    });
    expect(users.users.size).toBe(0);
  });

  it("only works in the browser that began it: no cookie or another one is refused, and the attempt is burned", async () => {
    const state = await begin();
    provider.willVerify(IDENTITY);
    expect(await callback(state, NO_COOKIE)).toMatchObject({ type: "failed", code: "google_failed" });
    expect(await callback(state, "someone-elses-state")).toMatchObject({ type: "failed", code: "google_failed" });
    expect(await callback(state)).toMatchObject({ type: "failed", code: "google_failed" }); // already consumed
    expect(provider.verifications).toHaveLength(0);
    expect(users.users.size).toBe(0);
  });

  it("reports provider rejections and a cancelled consent as google_failed, creating nothing", async () => {
    provider.willFail("nonce mismatch");
    const rejected = await callback(await begin());
    expect(rejected).toMatchObject({ type: "failed", code: "google_failed", detail: "nonce mismatch" });

    const cancelled = await callback(await begin(), NO_COOKIE, { providerError: true });
    expect(cancelled.type).toBe("failed");
    const noCode = await build().complete.execute({ code: undefined, state: await begin(), providerError: false }, { ...IP, cookieState: undefined });
    expect(noCode.type).toBe("failed");
    expect(users.users.size).toBe(0);
    expect(sessions.sessions.size).toBe(0);
  });

  it("is throttled per address", async () => {
    provider.willFail();
    for (let i = 0; i < GOOGLE_CALLBACK_LIMIT; i += 1) await callback("nope");
    expect(await callback("nope")).toMatchObject({ type: "failed", code: "too_many_attempts" });
  });
});

describe("CompleteGoogleFlow, connecting Google to an account", () => {
  it("attaches the identity to the logged-in account and marks it verified when the email matches", async () => {
    users.users.set("u1", passwordUser({ id: "u1" }));
    provider.willVerify(IDENTITY);
    const result = await callback(await begin("link", "u1", "/settings/account"));
    expect(result).toEqual({ type: "linked", returnTo: "/settings/account" });
    expect(users.users.get("u1")).toMatchObject({ googleSub: "google-sub-1", emailVerifiedAt: now, passwordHash: "scrypt$stored" });
    expect(sessions.sessions.size).toBe(0); // linking opens no new session
  });

  it("keeps the account unverified when Google's email is a different address", async () => {
    users.users.set("u1", passwordUser({ id: "u1" }));
    provider.willVerify({ sub: "google-sub-9", email: "other@example.com" });
    expect(await callback(await begin("link", "u1"))).toMatchObject({ type: "linked" });
    expect(users.users.get("u1")).toMatchObject({ googleSub: "google-sub-9", emailVerifiedAt: null });
  });

  it("refuses a Google identity that belongs to another account", async () => {
    users.users.set("u1", passwordUser({ id: "u1" }));
    users.users.set("u2", passwordUser({ id: "u2", email: "b@example.com", googleSub: "google-sub-1", passwordHash: null }));
    provider.willVerify(IDENTITY);
    expect(await callback(await begin("link", "u1"))).toMatchObject({ type: "failed", code: "google_taken", intent: "link" });
    expect(users.users.get("u1")?.googleSub).toBeNull();
  });

  it("is a no-op when this account already has this identity, and refuses a second one", async () => {
    users.users.set("u1", passwordUser({ id: "u1", googleSub: "google-sub-1" }));
    provider.willVerify(IDENTITY);
    expect(await callback(await begin("link", "u1"))).toMatchObject({ type: "linked" });
    provider.willVerify({ sub: "another", email: "jane@example.com" });
    expect(await callback(await begin("link", "u1"))).toMatchObject({ type: "failed", code: "google_taken" });
    expect(users.users.get("u1")?.googleSub).toBe("google-sub-1");
  });

  it("fails if the account of the attempt no longer exists", async () => {
    provider.willVerify(IDENTITY);
    expect(await callback(await begin("link", "gone"))).toMatchObject({ type: "failed", code: "google_failed", intent: "link" });
  });
});

describe("UnlinkGoogle", () => {
  it("detaches Google from an account that has a password", async () => {
    users.users.set("u1", passwordUser({ id: "u1", googleSub: "g" }));
    await new UnlinkGoogle(users).execute("u1");
    expect(users.users.get("u1")?.googleSub).toBeNull();
  });

  it("refuses when Google is the only way in, and does nothing when Google is not connected", async () => {
    users.users.set("u1", passwordUser({ id: "u1", googleSub: "g", passwordHash: null }));
    await expect(new UnlinkGoogle(users).execute("u1")).rejects.toBeInstanceOf(PasswordRequiredError);
    expect(users.users.get("u1")?.googleSub).toBe("g");

    users.users.set("u2", passwordUser({ id: "u2" }));
    await expect(new UnlinkGoogle(users).execute("u2")).resolves.toBeUndefined();
    await expect(new UnlinkGoogle(users).execute("nobody")).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});

describe("SetPassword", () => {
  it("gives a Google-only account a password it can then log in with", async () => {
    users.users.set("u1", passwordUser({ id: "u1", passwordHash: null, googleSub: "g" }));
    await new SetPassword(users, hasher).execute("u1", "a long enough password");
    const stored = users.users.get("u1")?.passwordHash;
    expect(stored?.startsWith("scrypt$")).toBe(true);
    expect(stored).not.toContain("a long enough password");
    await expect(hasher.verify("a long enough password", stored ?? "")).resolves.toBe(true);
  });

  it("will not replace an existing password, and applies the password rules", async () => {
    users.users.set("u1", passwordUser({ id: "u1" }));
    await expect(new SetPassword(users, hasher).execute("u1", "a long enough password")).rejects.toBeInstanceOf(PasswordExistsError);
    expect(users.users.get("u1")?.passwordHash).toBe("scrypt$stored");

    users.users.set("u2", passwordUser({ id: "u2", email: "g@example.com", passwordHash: null, googleSub: "g2" }));
    await expect(new SetPassword(users, hasher).execute("u2", "short")).rejects.toBeInstanceOf(WeakPasswordError);
    await expect(new SetPassword(users, hasher).execute("u2", "g@example.com")).rejects.toBeInstanceOf(WeakPasswordError);
    expect(users.users.get("u2")?.passwordHash).toBeNull();
  });
});
