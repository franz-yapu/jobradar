import type { ApiToken } from "./api-token.js";
import type { Session } from "./session.js";
import type { User } from "./user.js";

export const USER_REPOSITORY = Symbol("USER_REPOSITORY");
export const SESSION_REPOSITORY = Symbol("SESSION_REPOSITORY");
export const PASSWORD_HASHER = Symbol("PASSWORD_HASHER");
export const TOKEN_GENERATOR = Symbol("TOKEN_GENERATOR");
export const ATTEMPT_LIMITER = Symbol("ATTEMPT_LIMITER");
export const API_TOKEN_REPOSITORY = Symbol("API_TOKEN_REPOSITORY");

export interface UserRepository {
  /**
   * Throws EmailTakenError when the email exists. The first account ever created also adopts the data that
   * predates accounts (rows without an owner); later accounts start empty.
   */
  create(user: User): Promise<void>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
}

export interface SessionRepository {
  create(session: Session): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<Session | null>;
  updateExpiry(id: string, expiresAt: Date): Promise<void>;
  deleteByTokenHash(tokenHash: string): Promise<void>;
}

export interface ApiTokenRepository {
  create(token: ApiToken): Promise<void>;
  /** All of the account's tokens, revoked ones included, newest first. */
  listByUser(userId: string): Promise<ApiToken[]>;
  countActive(userId: string): Promise<number>;
  findByTokenHash(tokenHash: string): Promise<ApiToken | null>;
  /** Revokes the account's token. Returns false when the account has no such token. Already revoked: true, unchanged. */
  revoke(userId: string, id: string, at: Date): Promise<boolean>;
  touchLastUsed(id: string, at: Date): Promise<void>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, storedHash: string): Promise<boolean>;
}

export interface SecureTokenGenerator {
  /** A new unguessable token (given to the client once). */
  generate(): string;
  /** What is stored and looked up instead of the token. */
  hash(token: string): string;
}

/**
 * Counts failures per key inside a time window. `check` throws TooManyAttemptsError when the key is
 * over its limit. Kept behind a port so a shared store can replace the in-memory one.
 */
export interface AttemptLimiter {
  check(key: string, limit: number, windowMs: number): void;
  record(key: string, windowMs: number): void;
  reset(key: string): void;
}

export interface Clock {
  now(): Date;
}
