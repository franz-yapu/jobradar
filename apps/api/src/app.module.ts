import { Module } from "@nestjs/common";
import { ProfileModule } from "./profile/infrastructure/profile.module.js";
import { PostingsModule } from "./postings/infrastructure/postings.module.js";
import { HealthModule } from "./health/infrastructure/health.module.js";
import { PrismaModule } from "./shared/infrastructure/prisma/prisma.module.js";

@Module({ imports: [PrismaModule, HealthModule, PostingsModule, ProfileModule] })
export class AppModule {}
