import type { Session } from "../domain/session.js";
import { EmailTakenError, type User } from "../domain/user.js";
import type { SessionRepository, UserRepository } from "../domain/ports.js";

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
