import { describe, expect, it } from "vitest";
import { CryptoTokenGenerator } from "./crypto-token-generator.js";
import { InMemoryAttemptLimiter } from "./in-memory-attempt-limiter.js";
import { FAST_SCRYPT_FOR_TESTS, STRONG_SCRYPT, ScryptPasswordHasher } from "./scrypt-password-hasher.js";

const hasher = new ScryptPasswordHasher(FAST_SCRYPT_FOR_TESTS);

describe("ScryptPasswordHasher", () => {
  it("verifies the right password and refuses a wrong one", async () => {
    const hash = await hasher.hash("correct horse battery");
    expect(await hasher.verify("correct horse battery", hash)).toBe(true);
    expect(await hasher.verify("correct horse batterz", hash)).toBe(false);
    expect(await hasher.verify("", hash)).toBe(false);
  });

  it("uses a different random salt every time", async () => {
    const [a, b] = await Promise.all([hasher.hash("same password"), hasher.hash("same password")]);
    expect(a).not.toBe(b);
    expect(await hasher.verify("same password", a)).toBe(true);
    expect(await hasher.verify("same password", b)).toBe(true);
  });

  it("stores its parameters, so a hash made with other parameters still verifies", async () => {
    const hash = await hasher.hash("pass-phrase-123");
    expect(hash).toMatch(/^scrypt\$1024\$8\$1\$/);
    expect(await new ScryptPasswordHasher({ N: 2 ** 11, r: 8, p: 1 }).verify("pass-phrase-123", hash)).toBe(true);
  });

  it("treats Unicode-equivalent passwords as equal (NFKC)", async () => {
    const hash = await hasher.hash("café-password"); // é as one code point
    expect(await hasher.verify("café-password", hash)).toBe(true); // e + combining accent
  });

  it("refuses tampered, truncated or foreign hashes without throwing", async () => {
    const hash = await hasher.hash("pass-phrase-123");
    const parts = hash.split("$");
    const flipped = [...parts.slice(0, 5), `${parts[5]?.slice(0, -2)}AA`].join("$");
    for (const bad of ["", "plaintext", "scrypt$1$2$3", `${hash}$extra`, flipped, "bcrypt$10$abc$def$ghi$jkl", "scrypt$NaN$8$1$c2FsdA$a2V5"]) {
      expect(await hasher.verify("pass-phrase-123", bad)).toBe(false);
    }
  });

  it("refuses a hash that asks for an absurd cost", async () => {
    const hash = await hasher.hash("pass-phrase-123");
    const parts = hash.split("$");
    expect(await hasher.verify("pass-phrase-123", ["scrypt", String(2 ** 30), "8", "1", parts[4], parts[5]].join("$"))).toBe(false);
  });

  it("production parameters meet the OWASP setting", () => {
    expect(STRONG_SCRYPT).toEqual({ N: 65536, r: 8, p: 2 });
  });
});

describe("CryptoTokenGenerator", () => {
  const tokens = new CryptoTokenGenerator();

  it("makes long, unique, URL-safe tokens", () => {
    const seen = new Set(Array.from({ length: 50 }, () => tokens.generate()));
    expect(seen.size).toBe(50);
    for (const token of seen) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("hashes deterministically and never returns the token", () => {
    const token = tokens.generate();
    expect(tokens.hash(token)).toBe(tokens.hash(token));
    expect(tokens.hash(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(tokens.hash(token)).not.toContain(token);
    expect(tokens.hash(token)).not.toBe(tokens.hash(`${token}x`));
  });
});

describe("InMemoryAttemptLimiter", () => {
  it("only counts failures inside the window and reports when to retry", () => {
    let time = 1_000_000;
    const limiter = new InMemoryAttemptLimiter({ now: () => new Date(time) });
    limiter.record("k", 60_000);
    limiter.record("k", 60_000);
    expect(() => limiter.check("k", 3, 60_000)).not.toThrow();
    limiter.record("k", 60_000);
    expect(() => limiter.check("k", 3, 60_000)).toThrow(/Too many/);

    time += 30_000;
    try {
      limiter.check("k", 3, 60_000);
    } catch (error) {
      expect(error).toMatchObject({ retryAfterSeconds: 30 });
    }
    time += 31_000;
    expect(() => limiter.check("k", 3, 60_000)).not.toThrow();
  });

  it("keeps keys apart and can be reset", () => {
    const limiter = new InMemoryAttemptLimiter();
    limiter.record("a", 60_000);
    expect(() => limiter.check("a", 1, 60_000)).toThrow();
    expect(() => limiter.check("b", 1, 60_000)).not.toThrow();
    limiter.reset("a");
    expect(() => limiter.check("a", 1, 60_000)).not.toThrow();
  });
});
