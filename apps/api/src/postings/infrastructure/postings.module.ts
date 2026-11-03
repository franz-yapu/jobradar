import { Module } from "@nestjs/common";
import { PrismaService } from "../../shared/infrastructure/prisma/prisma.service.js";
import { CreatePosting } from "../application/create-posting.use-case.js";
import { ListPostings } from "../application/list-postings.use-case.js";
import { POSTING_REPOSITORY, type PostingRepository } from "../domain/posting.repository.js";
import { PostingsController } from "./postings.controller.js";
import { PrismaPostingRepository } from "./prisma-posting.repository.js";

@Module({
  controllers: [PostingsController],
  providers: [
    { provide: POSTING_REPOSITORY, useFactory: (prisma: PrismaService) => new PrismaPostingRepository(prisma), inject: [PrismaService] },
    { provide: CreatePosting, useFactory: (repo: PostingRepository) => new CreatePosting(repo), inject: [POSTING_REPOSITORY] },
    { provide: ListPostings, useFactory: (repo: PostingRepository) => new ListPostings(repo), inject: [POSTING_REPOSITORY] },
  ],
  exports: [POSTING_REPOSITORY],
})
export class PostingsModule {}
