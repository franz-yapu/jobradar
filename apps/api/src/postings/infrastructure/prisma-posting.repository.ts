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

function toDomain(row: PostingRow): Posting {
  return { ...row };
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

  async findByUrl(url: string): Promise<Posting | null> {
    const row = await this.prisma.posting.findUnique({ where: { url } });
    return row ? toDomain(row) : null;
  }

  async findById(id: string): Promise<Posting | null> {
    const row = await this.prisma.posting.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async list(filter: PostingFilter): Promise<PostingPage> {
    const verdictIds = filter.verdict === undefined ? undefined : await this.idsWithLatestVerdict(filter.verdict);
    const where: Prisma.PostingWhereInput = {
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

    const latest = await this.latestScores(rows.map((row) => row.id));
    return { items: rows.map((row) => ({ ...toDomain(row), latestScore: latest.get(row.id) ?? null })), total };
  }

  /**
   * Ids whose NEWEST score has the verdict (or that have no score, for `unscored`).
   * Single-user volumes: the id list is small; revisit with a keyset query if postings reach the millions.
   */
  private async idsWithLatestVerdict(verdict: VerdictFilter): Promise<string[]> {
    const condition = verdict === "unscored" ? Prisma.sql`ls.verdict IS NULL` : Prisma.sql`ls.verdict = ${verdict}::"Verdict"`;
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT p.id FROM postings p
      LEFT JOIN LATERAL (
        SELECT s.verdict FROM posting_scores s
        WHERE s."postingId" = p.id
        ORDER BY s."createdAt" DESC, s.id DESC
        LIMIT 1
      ) ls ON true
      WHERE ${condition}`;
    return rows.map((row) => row.id);
  }

  private async latestScores(postingIds: string[]): Promise<Map<string, LatestScore>> {
    if (postingIds.length === 0) return new Map();
    const rows = await this.prisma.postingScore.findMany({
      where: { postingId: { in: postingIds } },
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
