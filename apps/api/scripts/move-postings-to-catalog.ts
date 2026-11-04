/**
 * One-off, idempotent data step of SDD-009: postings ingested by workflows (any source but "manual") stop
 * belonging to one account and become catalog postings (ADR-0004). Scores stay with the account that made them.
 * When several accounts hold the same URL, the oldest posting is kept and the scores of the others move to it.
 *
 * Usage: pnpm --filter @jobradar/api exec tsx --env-file-if-exists=../../.env scripts/move-postings-to-catalog.ts
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { normalizeUrl } from "../src/postings/domain/normalize-url.js";

const url = process.env["DATABASE_URL"];
if (!url) throw new Error("DATABASE_URL is not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

try {
  const candidates = await prisma.posting.findMany({
    where: { userId: { not: null }, source: { not: "manual" }, catalogKey: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const kept = new Map<string, string>();
  let moved = 0;
  let merged = 0;
  await prisma.$transaction(async (tx) => {
    for (const posting of candidates) {
      const key = normalizeUrl(posting.url);
      const existing = (await tx.posting.findUnique({ where: { catalogKey: key }, select: { id: true } }))?.id ?? kept.get(key);
      if (existing) {
        await tx.postingScore.updateMany({ where: { postingId: posting.id }, data: { postingId: existing } });
        await tx.posting.delete({ where: { id: posting.id } });
        merged += 1;
      } else {
        await tx.posting.update({ where: { id: posting.id }, data: { userId: null, catalogKey: key } });
        kept.set(key, posting.id);
        moved += 1;
      }
    }
  });
  console.log(JSON.stringify({ candidates: candidates.length, moved, merged }));
} finally {
  await prisma.$disconnect();
}
