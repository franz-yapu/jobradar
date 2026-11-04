import { SESSION_RENEW_AFTER_MS, SESSION_TTL_MS } from "../domain/session.js";
import { NO_ADMINS, type AdminPolicy } from "../domain/admin-policy.js";
import { UnauthenticatedError, type AuthenticatedUser } from "../domain/user.js";
import type { Clock, SecureTokenGenerator, SessionRepository, UserRepository } from "../domain/ports.js";

/** Turns the session cookie value into the logged-in user, renewing the session when it is used. */
export class AuthenticateSession {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly tokens: SecureTokenGenerator,
    private readonly clock: Clock,
    private readonly admins: AdminPolicy = NO_ADMINS,
  ) {}

  async execute(sessionToken: string): Promise<AuthenticatedUser> {
    const tokenHash = this.tokens.hash(sessionToken);
    const session = await this.sessions.findByTokenHash(tokenHash);
    const now = this.clock.now();
    if (!session || session.expiresAt.getTime() <= now.getTime()) throw new UnauthenticatedError();

    const user = await this.users.findById(session.userId);
    if (!user) throw new UnauthenticatedError();

    // Renew at most once a day: only when more than a day of the lifetime has been used.
    const lifetimeUsed = SESSION_TTL_MS - (session.expiresAt.getTime() - now.getTime());
    if (lifetimeUsed >= SESSION_RENEW_AFTER_MS) {
      await this.sessions.updateExpiry(session.id, new Date(now.getTime() + SESSION_TTL_MS));
    }
    return { id: user.id, email: user.email, isAdmin: this.admins.isAdmin(user) };
  }
}
