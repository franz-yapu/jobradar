import { beforeEach, describe, expect, it } from "vitest";
import { API_TOKEN_PREFIX, ApiTokenNotFoundError, LAST_USED_RESOLUTION_MS, MAX_ACTIVE_API_TOKENS, TooManyTokensError } from "../domain/api-token.js";
import { UnauthenticatedError, type User } from "../domain/user.js";
import { CryptoTokenGenerator } from "../infrastructure/crypto-token-generator.js";
import { InMemoryApiTokenRepository, InMemoryUserRepository } from "../infrastructure/in-memory-auth.repositories.js";
import { AuthenticateApiToken, CreateApiToken, ListApiTokens, RevokeApiToken } from "./api-token.use-cases.js";

let now: Date;
const clock = { now: () => now };
const generator = new CryptoTokenGenerator();
let tokens: InMemoryApiTokenRepository;
let users: InMemoryUserRepository;

const user = (id: string): User => ({ id, email: `${id}@example.com`, passwordHash: "x", googleSub: null, emailVerifiedAt: null, createdAt: new Date() });
const create = () => new CreateApiToken(tokens, generator, clock);
const authenticate = () => new AuthenticateApiToken(tokens, users, generator, clock);

beforeEach(async () => {
  now = new Date("2026-11-04T10:00:00Z");
  tokens = new InMemoryApiTokenRepository();
  users = new InMemoryUserRepository();
  await users.create(user("user-a"));
  await users.create(user("user-b"));
});

describe("CreateApiToken", () => {
  it("returns the secret once and stores only its hash", async () => {
    const { apiToken, token } = await create().execute("user-a", "  n8n  ");
    expect(token.startsWith(API_TOKEN_PREFIX)).toBe(true);
    expect(token.length).toBeGreaterThan(40);
    expect(apiToken).toMatchObject({ userId: "user-a", name: "n8n", lastUsedAt: null, revokedAt: null, createdAt: now });
    expect(apiToken.prefix).toBe(token.slice(0, 8));
    expect(apiToken.tokenHash).toBe(generator.hash(token));
    expect(JSON.stringify([...tokens.tokens.values()])).not.toContain(token);
  });

  it("makes a different token every time", async () => {
    const a = await create().execute("user-a", "one");
    const b = await create().execute("user-a", "two");
    expect(a.token).not.toBe(b.token);
  });

  it("limits the active tokens per account; revoked ones do not count", async () => {
    const first = await create().execute("user-a", "t0");
    for (let i = 1; i < MAX_ACTIVE_API_TOKENS; i += 1) await create().execute("user-a", `t${i}`);
    await expect(create().execute("user-a", "one too many")).rejects.toBeInstanceOf(TooManyTokensError);
    await create().execute("user-b", "other account is not affected");

    await new RevokeApiToken(tokens, clock).execute("user-a", first.apiToken.id);
    await expect(create().execute("user-a", "now there is room")).resolves.toBeDefined();
  });
});

describe("ListApiTokens", () => {
  it("lists the account's tokens newest first, revoked included, never the secret", async () => {
    await create().execute("user-a", "old");
    now = new Date(now.getTime() + 1000);
    const newer = await create().execute("user-a", "new");
    await create().execute("user-b", "not mine");
    await new RevokeApiToken(tokens, clock).execute("user-a", newer.apiToken.id);

    const listed = await new ListApiTokens(tokens).execute("user-a");
    expect(listed.map((t) => t.name)).toEqual(["new", "old"]);
    expect(listed[0]?.revokedAt).not.toBeNull();
  });
});

describe("RevokeApiToken", () => {
  it("revokes the account's token, and again is harmless without moving the date", async () => {
    const { apiToken } = await create().execute("user-a", "n8n");
    const revoke = new RevokeApiToken(tokens, clock);
    await revoke.execute("user-a", apiToken.id);
    const firstDate = tokens.tokens.get(apiToken.id)?.revokedAt;
    expect(firstDate).toEqual(now);

    now = new Date(now.getTime() + 60_000);
    await revoke.execute("user-a", apiToken.id);
    expect(tokens.tokens.get(apiToken.id)?.revokedAt).toEqual(firstDate);
  });

  it("treats another account's token (or an unknown id) as not found, and leaves it working", async () => {
    const { apiToken, token } = await create().execute("user-a", "n8n");
    const revoke = new RevokeApiToken(tokens, clock);
    await expect(revoke.execute("user-b", apiToken.id)).rejects.toBeInstanceOf(ApiTokenNotFoundError);
    await expect(revoke.execute("user-a", "unknown")).rejects.toBeInstanceOf(ApiTokenNotFoundError);
    await expect(authenticate().execute(token)).resolves.toMatchObject({ id: "user-a" });
  });
});

describe("AuthenticateApiToken", () => {
  it("returns the owner of a valid token", async () => {
    const { token } = await create().execute("user-a", "n8n");
    await expect(authenticate().execute(token)).resolves.toEqual({ id: "user-a", email: "user-a@example.com" });
  });

  it("rejects unknown, foreign-format, tampered and revoked tokens", async () => {
    const { apiToken, token } = await create().execute("user-a", "n8n");
    for (const bad of ["", "jr_unknown", "no-prefix-token", `${token}x`, token.slice(0, -1)]) {
      await expect(authenticate().execute(bad)).rejects.toBeInstanceOf(UnauthenticatedError);
    }
    await new RevokeApiToken(tokens, clock).execute("user-a", apiToken.id);
    await expect(authenticate().execute(token)).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("rejects a token whose account no longer exists", async () => {
    const { token } = await create().execute("user-a", "n8n");
    users.users.delete("user-a");
    await expect(authenticate().execute(token)).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("records the last use, at most once a minute", async () => {
    const { apiToken, token } = await create().execute("user-a", "n8n");
    await authenticate().execute(token);
    expect(tokens.tokens.get(apiToken.id)?.lastUsedAt).toEqual(now);

    const first = now;
    now = new Date(now.getTime() + LAST_USED_RESOLUTION_MS - 1000);
    await authenticate().execute(token);
    expect(tokens.tokens.get(apiToken.id)?.lastUsedAt).toEqual(first);

    now = new Date(first.getTime() + LAST_USED_RESOLUTION_MS);
    await authenticate().execute(token);
    expect(tokens.tokens.get(apiToken.id)?.lastUsedAt).toEqual(now);
  });
});
