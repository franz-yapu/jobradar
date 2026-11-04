import { Prisma } from "../../generated/prisma/client.js";
import type { PrismaService } from "../../shared/infrastructure/prisma/prisma.service.js";
import type { ApiToken } from "../domain/api-token.js";
import type { Session } from "../domain/session.js";
import { EmailTakenError, type User } from "../domain/user.js";
import type { OAuthFlow } from "../domain/oauth-flow.js";
import type { ApiTokenRepository, OAuthFlowRepository, SessionRepository, UserRepository } from "../domain/ports.js";

/** Serializes "am I the first account?" so two simultaneous first registrations cannot both adopt. */
const FIRST_ACCOUNT_LOCK = 7_240_001;

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates the account. The very first account ever created also adopts the rows that predate accounts
   * (no owner yet) in the same transaction, so the data of the single-user days is not lost (ADR-0002).
   */
  async create(user: User): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${FIRST_ACCOUNT_LOCK}::bigint)`;
        const existing = await tx.user.count();
        await tx.user.create({ data: user });
        if (existing > 0) return;
        const orphan = { where: { userId: null }, data: { userId: user.id } };
        await tx.posting.updateMany(orphan);
        await tx.candidateProfile.updateMany(orphan);
        await tx.postingScore.updateMany(orphan);
        await tx.aiCall.updateMany(orphan);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new EmailTakenError();
      throw error;
    }
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByGoogleSub(sub: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { googleSub: sub } });
  }

  async linkGoogle(userId: string, sub: string, emailVerifiedAt: Date | null): Promise<"linked" | "taken"> {
    try {
      await this.prisma.user.update({ where: { id: userId }, data: { googleSub: sub, emailVerifiedAt } });
      return "linked";
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return "taken";
      throw error;
    }
  }

  async unlinkGoogleIfPassword(userId: string): Promise<boolean> {
    const { count } = await this.prisma.user.updateMany({
      where: { id: userId, passwordHash: { not: null } },
      data: { googleSub: null },
    });
    return count === 1;
  }

  async setPasswordIfNone(userId: string, passwordHash: string): Promise<boolean> {
    const { count } = await this.prisma.user.updateMany({ where: { id: userId, passwordHash: null }, data: { passwordHash } });
    return count === 1;
  }
}

export class PrismaOAuthFlowRepository implements OAuthFlowRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(flow: OAuthFlow): Promise<void> {
    await this.prisma.oAuthFlow.create({ data: flow });
  }

  async consume(stateHash: string, now: Date): Promise<OAuthFlow | null> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.oAuthFlow.findUnique({ where: { stateHash } });
      if (!row) return null;
      // Deleting by id and checking the count makes the use single even with two simultaneous callbacks.
      const { count } = await tx.oAuthFlow.deleteMany({ where: { id: row.id } });
      if (count !== 1 || row.expiresAt.getTime() <= now.getTime()) return null;
      return { ...row, intent: row.intent === "link" ? "link" : "login" };
    });
  }

  async deleteExpired(now: Date): Promise<void> {
    await this.prisma.oAuthFlow.deleteMany({ where: { expiresAt: { lte: now } } });
  }
}

export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(session: Session): Promise<void> {
    await this.prisma.session.create({ data: session });
  }

  findByTokenHash(tokenHash: string): Promise<Session | null> {
    return this.prisma.session.findUnique({ where: { tokenHash } });
  }

  async updateExpiry(id: string, expiresAt: Date): Promise<void> {
    await this.prisma.session.update({ where: { id }, data: { expiresAt } });
  }

  async deleteByTokenHash(tokenHash: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { tokenHash } });
  }
}

export class PrismaApiTokenRepository implements ApiTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(token: ApiToken): Promise<void> {
    await this.prisma.apiToken.create({ data: token });
  }

  listByUser(userId: string): Promise<ApiToken[]> {
    return this.prisma.apiToken.findMany({ where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  }

  countActive(userId: string): Promise<number> {
    return this.prisma.apiToken.count({ where: { userId, revokedAt: null } });
  }

  findByTokenHash(tokenHash: string): Promise<ApiToken | null> {
    return this.prisma.apiToken.findUnique({ where: { tokenHash } });
  }

  async revoke(userId: string, id: string, at: Date): Promise<boolean> {
    const owned = await this.prisma.apiToken.findFirst({ where: { id, userId }, select: { revokedAt: true } });
    if (!owned) return false;
    if (owned.revokedAt === null) await this.prisma.apiToken.updateMany({ where: { id, userId, revokedAt: null }, data: { revokedAt: at } });
    return true;
  }

  async touchLastUsed(id: string, at: Date): Promise<void> {
    await this.prisma.apiToken.updateMany({ where: { id }, data: { lastUsedAt: at } });
  }
}
