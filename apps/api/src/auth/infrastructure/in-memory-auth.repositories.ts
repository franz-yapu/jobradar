import type { ApiToken } from "../domain/api-token.js";
import type { Session } from "../domain/session.js";
import { EmailTakenError, type User } from "../domain/user.js";
import type { OAuthFlow } from "../domain/oauth-flow.js";
import type { ApiTokenRepository, OAuthFlowRepository, SessionRepository, UserRepository } from "../domain/ports.js";

export class InMemoryUserRepository implements UserRepository {
  readonly users = new Map<string, User>();

  async create(user: User): Promise<void> {
    if ([...this.users.values()].some((existing) => existing.email === user.email)) throw new EmailTakenError();
    this.users.set(user.id, user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return [...this.users.values()].find((user) => user.email === email) ?? null;
  }

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async findByGoogleSub(sub: string): Promise<User | null> {
    return [...this.users.values()].find((user) => user.googleSub === sub) ?? null;
  }

  async linkGoogle(userId: string, sub: string, emailVerifiedAt: Date | null): Promise<"linked" | "taken"> {
    if ([...this.users.values()].some((user) => user.googleSub === sub && user.id !== userId)) return "taken";
    const user = this.users.get(userId);
    if (user) this.users.set(userId, { ...user, googleSub: sub, emailVerifiedAt });
    return "linked";
  }

  async unlinkGoogleIfPassword(userId: string): Promise<boolean> {
    const user = this.users.get(userId);
    if (!user || user.passwordHash === null) return false;
    this.users.set(userId, { ...user, googleSub: null });
    return true;
  }

  async setPasswordIfNone(userId: string, passwordHash: string): Promise<boolean> {
    const user = this.users.get(userId);
    if (!user || user.passwordHash !== null) return false;
    this.users.set(userId, { ...user, passwordHash });
    return true;
  }
}

export class InMemoryOAuthFlowRepository implements OAuthFlowRepository {
  readonly flows = new Map<string, OAuthFlow>();

  async create(flow: OAuthFlow): Promise<void> {
    this.flows.set(flow.stateHash, flow);
  }

  async consume(stateHash: string, now: Date): Promise<OAuthFlow | null> {
    const flow = this.flows.get(stateHash);
    if (!flow) return null;
    this.flows.delete(stateHash);
    return flow.expiresAt.getTime() > now.getTime() ? flow : null;
  }

  async deleteExpired(now: Date): Promise<void> {
    for (const [hash, flow] of this.flows) if (flow.expiresAt.getTime() <= now.getTime()) this.flows.delete(hash);
  }
}

export class InMemorySessionRepository implements SessionRepository {
  readonly sessions = new Map<string, Session>();

  async create(session: Session): Promise<void> {
    this.sessions.set(session.tokenHash, session);
  }

  async findByTokenHash(tokenHash: string): Promise<Session | null> {
    return this.sessions.get(tokenHash) ?? null;
  }

  async updateExpiry(id: string, expiresAt: Date): Promise<void> {
    for (const [hash, session] of this.sessions) {
      if (session.id === id) this.sessions.set(hash, { ...session, expiresAt });
    }
  }

  async deleteByTokenHash(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
  }
}

export class InMemoryApiTokenRepository implements ApiTokenRepository {
  readonly tokens = new Map<string, ApiToken>();

  async create(token: ApiToken): Promise<void> {
    this.tokens.set(token.id, token);
  }

  async listByUser(userId: string): Promise<ApiToken[]> {
    return [...this.tokens.values()].filter((t) => t.userId === userId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async countActive(userId: string): Promise<number> {
    return [...this.tokens.values()].filter((t) => t.userId === userId && t.revokedAt === null).length;
  }

  async findByTokenHash(tokenHash: string): Promise<ApiToken | null> {
    return [...this.tokens.values()].find((t) => t.tokenHash === tokenHash) ?? null;
  }

  async revoke(userId: string, id: string, at: Date): Promise<boolean> {
    const token = this.tokens.get(id);
    if (!token || token.userId !== userId) return false;
    if (token.revokedAt === null) this.tokens.set(id, { ...token, revokedAt: at });
    return true;
  }

  async touchLastUsed(id: string, at: Date): Promise<void> {
    const token = this.tokens.get(id);
    if (token) this.tokens.set(id, { ...token, lastUsedAt: at });
  }
}
