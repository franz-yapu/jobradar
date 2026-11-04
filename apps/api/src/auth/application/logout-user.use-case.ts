import type { SecureTokenGenerator, SessionRepository } from "../domain/ports.js";

export class LogoutUser {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly tokens: SecureTokenGenerator,
  ) {}

  /** Deleting an unknown or already deleted session is not an error. */
  async execute(sessionToken: string): Promise<void> {
    await this.sessions.deleteByTokenHash(this.tokens.hash(sessionToken));
  }
}
