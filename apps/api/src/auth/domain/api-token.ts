/** A personal token for n8n and scripts. The secret is shown once; only its hash is stored. */
export interface ApiToken {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  /** First characters of the token, to recognise it in a list. */
  readonly prefix: string;
  readonly tokenHash: string;
  readonly createdAt: Date;
  readonly lastUsedAt: Date | null;
  readonly revokedAt: Date | null;
}

export const API_TOKEN_PREFIX = "jr_";
export const API_TOKEN_DISPLAY_PREFIX_LENGTH = 8;
export const MAX_ACTIVE_API_TOKENS = 10;
/** `lastUsedAt` is refreshed at most this often (saves a write per request). */
export const LAST_USED_RESOLUTION_MS = 60_000;

export class TooManyTokensError extends Error {
  constructor(public readonly max: number = MAX_ACTIVE_API_TOKENS) {
    super(`An account can have at most ${max} active API tokens`);
    this.name = "TooManyTokensError";
  }
}

export class ApiTokenNotFoundError extends Error {
  constructor() {
    super("API token not found");
    this.name = "ApiTokenNotFoundError";
  }
}
