import { randomUUID } from "node:crypto";
import {
  API_TOKEN_DISPLAY_PREFIX_LENGTH,
  API_TOKEN_PREFIX,
  ApiTokenNotFoundError,
  LAST_USED_RESOLUTION_MS,
  MAX_ACTIVE_API_TOKENS,
  TooManyTokensError,
  type ApiToken,
} from "../domain/api-token.js";
import type { ApiTokenRepository, Clock, SecureTokenGenerator, UserRepository } from "../domain/ports.js";
import { UnauthenticatedError, type AuthenticatedUser } from "../domain/user.js";

export interface CreatedApiToken {
  apiToken: ApiToken;
  /** The secret. Returned once, never stored. */
  token: string;
}

export class CreateApiToken {
  constructor(
    private readonly tokens: ApiTokenRepository,
    private readonly generator: SecureTokenGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(userId: string, name: string): Promise<CreatedApiToken> {
    if ((await this.tokens.countActive(userId)) >= MAX_ACTIVE_API_TOKENS) throw new TooManyTokensError();

    const token = `${API_TOKEN_PREFIX}${this.generator.generate()}`;
    const apiToken: ApiToken = {
      id: randomUUID(),
      userId,
      name: name.trim(),
      prefix: token.slice(0, API_TOKEN_DISPLAY_PREFIX_LENGTH),
      tokenHash: this.generator.hash(token),
      createdAt: this.clock.now(),
      lastUsedAt: null,
      revokedAt: null,
    };
    await this.tokens.create(apiToken);
    return { apiToken, token };
  }
}

export class ListApiTokens {
  constructor(private readonly tokens: ApiTokenRepository) {}

  execute(userId: string): Promise<ApiToken[]> {
    return this.tokens.listByUser(userId);
  }
}

export class RevokeApiToken {
  constructor(
    private readonly tokens: ApiTokenRepository,
    private readonly clock: Clock,
  ) {}

  /** Another account's token is "not found", like any other resource of another account. */
  async execute(userId: string, id: string): Promise<void> {
    if (!(await this.tokens.revoke(userId, id, this.clock.now()))) throw new ApiTokenNotFoundError();
  }
}

/** Turns a Bearer token into the account it acts for. */
export class AuthenticateApiToken {
  constructor(
    private readonly tokens: ApiTokenRepository,
    private readonly users: UserRepository,
    private readonly generator: SecureTokenGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(token: string): Promise<AuthenticatedUser> {
    if (!token.startsWith(API_TOKEN_PREFIX)) throw new UnauthenticatedError();
    const stored = await this.tokens.findByTokenHash(this.generator.hash(token));
    if (!stored || stored.revokedAt !== null) throw new UnauthenticatedError();

    const user = await this.users.findById(stored.userId);
    if (!user) throw new UnauthenticatedError();

    const now = this.clock.now();
    if (!stored.lastUsedAt || now.getTime() - stored.lastUsedAt.getTime() >= LAST_USED_RESOLUTION_MS) {
      await this.tokens.touchLastUsed(stored.id, now);
    }
    return { id: user.id, email: user.email };
  }
}
