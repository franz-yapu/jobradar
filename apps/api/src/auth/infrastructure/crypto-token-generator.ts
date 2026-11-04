import { createHash, randomBytes } from "node:crypto";
import type { SecureTokenGenerator } from "../domain/ports.js";

/** 256 random bits; only the SHA-256 is stored, which is enough because the token is not a guessable password. */
export class CryptoTokenGenerator implements SecureTokenGenerator {
  generate(): string {
    return randomBytes(32).toString("base64url");
  }

  hash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
