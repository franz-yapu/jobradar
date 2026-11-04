import { beforeEach, describe, expect, it } from "vitest";
import { FAST_SCRYPT_FOR_TESTS, ScryptPasswordHasher } from "../infrastructure/scrypt-password-hasher.js";
import { CryptoTokenGenerator } from "../infrastructure/crypto-token-generator.js";
import { InMemoryAttemptLimiter } from "../infrastructure/in-memory-attempt-limiter.js";
import { InMemorySessionRepository, InMemoryUserRepository } from "../infrastructure/in-memory-auth.repositories.js";
import { SESSION_TTL_MS } from "../domain/session.js";
import {
  EmailTakenError,
  InvalidCredentialsError,
  SignupDisabledError,
  TooManyAttemptsError,
  UnauthenticatedError,
  WeakPasswordError,
} from "../domain/user.js";
import { AuthenticateSession } from "./authenticate-session.use-case.js";
import { GetAccount } from "./get-account.use-case.js";
import { LoginUser, LOGIN_EMAIL_LIMIT, LOGIN_IP_LIMIT, LOGIN_WINDOW_MS } from "./login-user.use-case.js";
import { LogoutUser } from "./logout-user.use-case.js";
import { RegisterUser, REGISTER_LIMIT } from "./register-user.use-case.js";

const DAY = 24 * 60 * 60 * 1000;
const PASSWORD = "correct horse battery";
const IP = { ip: "203.0.113.7" };

let now: Date;
const clock = { now: () => now };
let users: InMemoryUserRepository;
let sessions: InMemorySessionRepository;
let limiter: InMemoryAttemptLimiter;
const hasher = new ScryptPasswordHasher(FAST_SCRYPT_FOR_TESTS);
const tokens = new CryptoTokenGenerator();

function build(signupAllowed = true) {
  return {
    register: new RegisterUser(users, sessions, hasher, tokens, limiter, clock, { signupAllowed }),
    login: new LoginUser(users, sessions, hasher, tokens, limiter, clock),
    authenticate: new AuthenticateSession(users, sessions, tokens, clock),
    logout: new LogoutUser(sessions, tokens),
  };
}

beforeEach(() => {
  now = new Date("2026-11-04T10:00:00Z");
  users = new InMemoryUserRepository();
  sessions = new InMemorySessionRepository();
  limiter = new InMemoryAttemptLimiter(clock);
});

describe("RegisterUser", () => {
  it("creates the account and a session, storing only hashes", async () => {
    const { register } = build();
    const grant = await register.execute({ email: "  Jane@Example.com ", password: PASSWORD }, IP);

    expect(grant.user.email).toBe("jane@example.com");
    expect(grant.expiresAt.getTime()).toBe(now.getTime() + SESSION_TTL_MS);
    const stored = await users.findByEmail("jane@example.com");
    expect(stored?.passwordHash).not.toContain(PASSWORD);
    expect(stored?.passwordHash?.startsWith("scrypt$")).toBe(true);
    expect(grant.user).toMatchObject({ hasPassword: true, googleLinked: false, emailVerified: false });
    // the session is stored under the hash of the token, never the token itself
    expect(sessions.sessions.has(grant.sessionToken)).toBe(false);
    expect(sessions.sessions.has(tokens.hash(grant.sessionToken))).toBe(true);
  });

  it("refuses a second account with the same email, whatever its case", async () => {
    const { register } = build();
    await register.execute({ email: "jane@example.com", password: PASSWORD }, IP);
    await expect(register.execute({ email: "JANE@example.com", password: PASSWORD }, IP)).rejects.toBeInstanceOf(EmailTakenError);
  });

  it("refuses weak passwords", async () => {
    const { register } = build();
    await expect(register.execute({ email: "a@b.co", password: "short" }, IP)).rejects.toMatchObject({ reason: "too_short" });
    await expect(register.execute({ email: "longer-email@example.com", password: "longer-email@example.com" }, IP)).rejects.toMatchObject({
      reason: "same_as_email",
    });
    await expect(register.execute({ email: "a@b.co", password: "x".repeat(129) }, IP)).rejects.toBeInstanceOf(WeakPasswordError);
    expect(users.users.size).toBe(0);
  });

  it("is closed when signup is disabled", async () => {
    await expect(build(false).register.execute({ email: "a@b.co", password: PASSWORD }, IP)).rejects.toBeInstanceOf(SignupDisabledError);
    expect(users.users.size).toBe(0);
  });

  it("limits how many accounts one address can create per hour", async () => {
    const { register } = build();
    for (let i = 0; i < REGISTER_LIMIT; i += 1) {
      await register.execute({ email: `user${i}@example.com`, password: PASSWORD }, IP);
    }
    await expect(register.execute({ email: "one-more@example.com", password: PASSWORD }, IP)).rejects.toBeInstanceOf(TooManyAttemptsError);
    // another address is not affected, and the window moves on
    await build().register.execute({ email: "other@example.com", password: PASSWORD }, { ip: "198.51.100.1" });
    now = new Date(now.getTime() + 61 * 60 * 1000);
    await register.execute({ email: "later@example.com", password: PASSWORD }, IP);
  });
});

describe("LoginUser", () => {
  beforeEach(async () => {
    await build().register.execute({ email: "jane@example.com", password: PASSWORD }, { ip: "198.51.100.200" });
  });

  it("logs in with the right password, ignoring the case of the email", async () => {
    const grant = await build().login.execute({ email: "Jane@Example.com", password: PASSWORD }, IP);
    expect(grant.user.email).toBe("jane@example.com");
    expect(sessions.sessions.has(tokens.hash(grant.sessionToken))).toBe(true);
  });

  it("answers the same error for a wrong password and for an unknown email", async () => {
    const { login } = build();
    const wrong = await login.execute({ email: "jane@example.com", password: "not the password" }, IP).catch((e: unknown) => e);
    const unknown = await login.execute({ email: "nobody@example.com", password: PASSWORD }, IP).catch((e: unknown) => e);
    expect(wrong).toBeInstanceOf(InvalidCredentialsError);
    expect(unknown).toBeInstanceOf(InvalidCredentialsError);
    expect((wrong as Error).message).toBe((unknown as Error).message);
  });

  it("treats an account without a password (created with Google) like an unknown email", async () => {
    const { login } = build();
    const id = "00000000-0000-4000-8000-0000000000a1";
    users.users.set(id, { id, email: "g@example.com", passwordHash: null, googleSub: "sub-1", emailVerifiedAt: now, createdAt: now });
    const googleOnly = await login.execute({ email: "g@example.com", password: PASSWORD }, IP).catch((e: unknown) => e);
    const unknown = await login.execute({ email: "nobody@example.com", password: PASSWORD }, IP).catch((e: unknown) => e);
    expect(googleOnly).toBeInstanceOf(InvalidCredentialsError);
    expect((googleOnly as Error).message).toBe((unknown as Error).message);
    expect(sessions.sessions.size).toBe(1); // only the session of the earlier registration
  });

  it("blocks an email after too many failures, even with the right password, until the window passes", async () => {
    const { login } = build();
    for (let i = 0; i < LOGIN_EMAIL_LIMIT; i += 1) {
      await expect(login.execute({ email: "jane@example.com", password: "wrong" }, IP)).rejects.toBeInstanceOf(InvalidCredentialsError);
    }
    await expect(login.execute({ email: "jane@example.com", password: PASSWORD }, IP)).rejects.toBeInstanceOf(TooManyAttemptsError);

    now = new Date(now.getTime() + LOGIN_WINDOW_MS + 1000);
    await expect(login.execute({ email: "jane@example.com", password: PASSWORD }, IP)).resolves.toBeDefined();
  });

  it("blocks an address that fails against many emails", async () => {
    const { login } = build();
    for (let i = 0; i < LOGIN_IP_LIMIT; i += 1) {
      await expect(login.execute({ email: `ghost${i}@example.com`, password: "wrong" }, IP)).rejects.toBeInstanceOf(InvalidCredentialsError);
    }
    await expect(login.execute({ email: "jane@example.com", password: PASSWORD }, IP)).rejects.toBeInstanceOf(TooManyAttemptsError);
    // the same account from another address still works
    await expect(login.execute({ email: "jane@example.com", password: PASSWORD }, { ip: "198.51.100.9" })).resolves.toBeDefined();
  });

  it("forgets earlier failures after a successful login", async () => {
    const { login } = build();
    for (let i = 0; i < LOGIN_EMAIL_LIMIT - 1; i += 1) {
      await login.execute({ email: "jane@example.com", password: "wrong" }, IP).catch(() => undefined);
    }
    await login.execute({ email: "jane@example.com", password: PASSWORD }, IP);
    await expect(login.execute({ email: "jane@example.com", password: "wrong" }, IP)).rejects.toBeInstanceOf(InvalidCredentialsError);
  });
});

describe("AuthenticateSession", () => {
  it("returns the user for a valid session token", async () => {
    const { register, authenticate } = build();
    const grant = await register.execute({ email: "jane@example.com", password: PASSWORD }, IP);
    await expect(authenticate.execute(grant.sessionToken)).resolves.toEqual({ id: grant.user.id, email: grant.user.email });
  });

  it("GetAccount reports how the account signs in, without hashes or provider ids", async () => {
    const { register } = build();
    const grant = await register.execute({ email: "jane@example.com", password: PASSWORD }, IP);
    const getAccount = new GetAccount(users);
    await expect(getAccount.execute(grant.user.id)).resolves.toEqual({
      id: grant.user.id,
      email: "jane@example.com",
      hasPassword: true,
      googleLinked: false,
      emailVerified: false,
    });

    const id = "00000000-0000-4000-8000-0000000000b2";
    users.users.set(id, { id, email: "g@example.com", passwordHash: null, googleSub: "sub-2", emailVerifiedAt: now, createdAt: now });
    await expect(getAccount.execute(id)).resolves.toMatchObject({ hasPassword: false, googleLinked: true, emailVerified: true });
    await expect(getAccount.execute("00000000-0000-4000-8000-0000000000ff")).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("rejects an unknown token", async () => {
    await expect(build().authenticate.execute("made-up-token")).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("rejects an expired session", async () => {
    const { register, authenticate } = build();
    const grant = await register.execute({ email: "jane@example.com", password: PASSWORD }, IP);
    now = new Date(now.getTime() + SESSION_TTL_MS + 1000);
    await expect(authenticate.execute(grant.sessionToken)).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("renews a session at most once a day", async () => {
    const { register, authenticate } = build();
    const grant = await register.execute({ email: "jane@example.com", password: PASSWORD }, IP);
    const read = () => sessions.sessions.get(tokens.hash(grant.sessionToken))?.expiresAt.getTime();

    now = new Date(now.getTime() + 2 * 60 * 60 * 1000); // two hours later: not renewed
    await authenticate.execute(grant.sessionToken);
    expect(read()).toBe(grant.expiresAt.getTime());

    now = new Date(now.getTime() + 2 * DAY); // two days later: renewed from now
    await authenticate.execute(grant.sessionToken);
    expect(read()).toBe(now.getTime() + SESSION_TTL_MS);
  });

  it("rejects a session whose user no longer exists", async () => {
    const { register, authenticate } = build();
    const grant = await register.execute({ email: "jane@example.com", password: PASSWORD }, IP);
    users.users.clear();
    await expect(authenticate.execute(grant.sessionToken)).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});

describe("LogoutUser", () => {
  it("kills the session so the cookie stops working", async () => {
    const { register, authenticate, logout } = build();
    const grant = await register.execute({ email: "jane@example.com", password: PASSWORD }, IP);
    await logout.execute(grant.sessionToken);
    await expect(authenticate.execute(grant.sessionToken)).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("is harmless for an unknown or repeated token", async () => {
    await expect(build().logout.execute("never-existed")).resolves.toBeUndefined();
  });
});
