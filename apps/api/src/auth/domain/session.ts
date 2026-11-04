export interface Session {
  readonly id: string;
  readonly userId: string;
  /** SHA-256 of the cookie token; the token itself is never stored. */
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
/** A session is renewed on use, but at most once a day (saves a write per request). */
export const SESSION_RENEW_AFTER_MS = 24 * 60 * 60 * 1000;
