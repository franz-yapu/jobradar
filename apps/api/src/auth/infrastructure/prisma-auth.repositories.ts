import { Prisma } from "../../generated/prisma/client.js";
import type { PrismaService } from "../../shared/infrastructure/prisma/prisma.service.js";
import type { Session } from "../domain/session.js";
import { EmailTakenError, type User } from "../domain/user.js";
import type { SessionRepository, UserRepository } from "../domain/ports.js";

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
