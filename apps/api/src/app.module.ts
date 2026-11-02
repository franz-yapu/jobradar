import { Module } from "@nestjs/common";
import { PostingsModule } from "./postings/infrastructure/postings.module.js";
import { HealthModule } from "./health/infrastructure/health.module.js";
import { PrismaModule } from "./shared/infrastructure/prisma/prisma.module.js";

@Module({ imports: [PrismaModule, HealthModule, PostingsModule] })
export class AppModule {}
