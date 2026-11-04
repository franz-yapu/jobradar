import type { PostingScore as ScoreRow } from "../../generated/prisma/client.js";
import type { PrismaService } from "../../shared/infrastructure/prisma/prisma.service.js";
import { BLOCKER_TYPES, type Blocker, type PostingScore } from "../domain/posting-score.js";
import type { PostingScoreRepository } from "../domain/posting-score.repository.js";

function toBlockers(json: unknown): Blocker[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((item: unknown) => {
    if (typeof item !== "object" || item === null) return [];
    const { type, evidence } = item as { type?: unknown; evidence?: unknown };
    const known = BLOCKER_TYPES.find((t) => t === type);
    return known && typeof evidence === "string" ? [{ type: known, evidence }] : [];
  });
}

/** Rows are always read through a `userId` filter, so the owner is known to be `userId`. */
function toDomain(row: ScoreRow, userId: string): PostingScore {
  return { ...row, userId, blockers: toBlockers(row.blockers) };
}

export class PrismaPostingScoreRepository implements PostingScoreRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(score: PostingScore): Promise<void> {
    await this.prisma.postingScore.create({
      data: {
        ...score,
        reasons: [...score.reasons],
        blockers: score.blockers.map((b) => ({ type: b.type, evidence: b.evidence })),
      },
    });
  }

  async findLatest(userId: string, postingId: string): Promise<PostingScore | null> {
    const row = await this.prisma.postingScore.findFirst({
      where: { userId, postingId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return row ? toDomain(row, userId) : null;
  }
}
