import { Prisma, type Posting as PostingRow, type PostingScore as ScoreRow } from "../../generated/prisma/client.js";
import type { PrismaService } from "../../shared/infrastructure/prisma/prisma.service.js";
import type { Posting } from "../domain/posting.js";
import {
  DuplicatePostingError,
  type LatestScore,
  type PostingFilter,
  type PostingPage,
  type PostingRepository,
  type VerdictFilter,
} from "../domain/posting.repository.js";

/** Rows are always read through a `userId` filter, so the owner is known to be `userId`. */
function toDomain(row: PostingRow, userId: string): Posting {
  return { ...row, userId };
}

export class PrismaPostingRepository implements PostingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(posting: Posting): Promise<void> {
    try {
      await this.prisma.posting.create({ data: posting });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new DuplicatePostingError(posting.url);
      }
      throw error;
    }
  }

  async findByUrl(userId: string, url: string): Promise<Posting | null> {
    const row = await this.prisma.posting.findUnique({ where: { userId_url: { userId, url } } });
    return row ? toDomain(row, userId) : null;
  }

  async findById(userId: string, id: string): Promise<Posting | null> {
    const row = await this.prisma.posting.findFirst({ where: { id, userId } });
    return row ? toDomain(row, userId) : null;
  }

  async list(userId: string, filter: PostingFilter): Promise<PostingPage> {
    const verdictIds = filter.verdict === undefined ? undefined : await this.idsWithLatestVerdict(userId, filter.verdict);
    const where: Prisma.PostingWhereInput = {
      userId,
      ...(filter.source !== undefined && { source: filter.source }),
      ...(filter.createdSince !== undefined && { createdAt: { gte: filter.createdSince } }),
      ...(verdictIds !== undefined && { id: { in: verdictIds } }),
      ...(filter.q !== undefined && {
        OR: [
          { title: { contains: filter.q, mode: "insensitive" } },
          { company: { contains: filter.q, mode: "insensitive" } },
          { description: { contains: filter.q, mode: "insensitive" } },
        ],
      }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.posting.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
      this.prisma.posting.count({ where }),
    ]);

    const latest = await this.latestScores(userId, rows.map((row) => row.id));
    return { items: rows.map((row) => ({ ...toDomain(row, userId), latestScore: latest.get(row.id) ?? null })), total };
  }

  /**
   * Ids whose NEWEST score has the verdict (or that have no score, for `unscored`).
   * Single-user volumes: the id list is small; revisit with a keyset query if postings reach the millions.
   */
  private async idsWithLatestVerdict(userId: string, verdict: VerdictFilter): Promise<string[]> {
    const condition = verdict === "unscored" ? Prisma.sql`ls.verdict IS NULL` : Prisma.sql`ls.verdict = ${verdict}::"Verdict"`;
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT p.id FROM postings p
      LEFT JOIN LATERAL (
        SELECT s.verdict FROM posting_scores s
        WHERE s."postingId" = p.id AND s."userId" = ${userId}::uuid
        ORDER BY s."createdAt" DESC, s.id DESC
        LIMIT 1
      ) ls ON true
      WHERE p."userId" = ${userId}::uuid AND ${condition}`;
    return rows.map((row) => row.id);
  }

  private async latestScores(userId: string, postingIds: string[]): Promise<Map<string, LatestScore>> {
    if (postingIds.length === 0) return new Map();
    const rows = await this.prisma.postingScore.findMany({
      where: { userId, postingId: { in: postingIds } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      distinct: ["postingId"],
    });
    return new Map(rows.map((row) => [row.postingId, toLatestScore(row)]));
  }
}

function toLatestScore(row: ScoreRow): LatestScore {
  const blockers = Array.isArray(row.blockers) ? row.blockers : [];
  return {
    verdict: row.verdict,
    reasons: row.reasons,
    blockers: blockers.flatMap((item: unknown) => {
      if (typeof item !== "object" || item === null) return [];
      const { type, evidence } = item as { type?: unknown; evidence?: unknown };
      return typeof type === "string" && typeof evidence === "string" ? [{ type, evidence }] : [];
    }),
    scoredAt: row.createdAt,
  };
}
