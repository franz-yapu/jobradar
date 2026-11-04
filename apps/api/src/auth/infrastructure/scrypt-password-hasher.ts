import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { PasswordHasher } from "../domain/ports.js";

export interface ScryptParams {
  /** CPU/memory cost (power of two). */
  N: number;
  r: number;
  p: number;
}

/** OWASP-recommended scrypt setting (64 MiB, ~0.1-0.2 s). */
export const STRONG_SCRYPT: ScryptParams = { N: 2 ** 16, r: 8, p: 2 };
/** Only for tests: makes hashing take milliseconds. Never used outside NODE_ENV=test. */
export const FAST_SCRYPT_FOR_TESTS: ScryptParams = { N: 2 ** 10, r: 8, p: 1 };

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
/** Upper bound on what a stored hash may ask for, so a corrupted row cannot exhaust memory. */
const MAX_N = 2 ** 18;

function derive(password: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize("NFKC"),
      salt,
      KEY_LENGTH,
      { N: params.N, r: params.r, p: params.p, maxmem: 256 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

/**
 * Format: `scrypt$N$r$p$<salt base64url>$<key base64url>`. The parameters travel with the hash, so they can be
 * raised later without breaking existing passwords.
 */
export class ScryptPasswordHasher implements PasswordHasher {
  constructor(private readonly params: ScryptParams = STRONG_SCRYPT) {}

  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const key = await derive(password, salt, this.params);
    const { N, r, p } = this.params;
    return `scrypt$${N}$${r}$${p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
  }

  async verify(password: string, storedHash: string): Promise<boolean> {
    const parts = storedHash.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const [N, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
    if (![N, r, p].every(Number.isInteger) || N < 2 || N > MAX_N || r < 1 || p < 1) return false;
    const salt = Buffer.from(parts[4] ?? "", "base64url");
    const expected = Buffer.from(parts[5] ?? "", "base64url");
    if (salt.length === 0 || expected.length !== KEY_LENGTH) return false;
    try {
      const actual = await derive(password, salt, { N, r, p });
      return timingSafeEqual(actual, expected);
    } catch {
      return false;
    }
  }
}
