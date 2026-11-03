import { Prisma, type Posting as PostingRow } from "../../generated/prisma/client.js";
import type { PrismaService } from "../../shared/infrastructure/prisma/prisma.service.js";
import type { Posting } from "../domain/posting.js";
import {
  DuplicatePostingError,
  type PostingFilter,
  type PostingPage,
  type PostingRepository,
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
    const where: Prisma.PostingWhereInput = {
      ...(filter.source !== undefined && { source: filter.source }),
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
    return { items: rows.map(toDomain), total };
  }
}
