import { Module } from "@nestjs/common";
import { ProfileModule } from "./profile/infrastructure/profile.module.js";
import { ScoringModule } from "./scoring/infrastructure/scoring.module.js";
import { AiModule } from "./ai/infrastructure/ai.module.js";
import { PostingsModule } from "./postings/infrastructure/postings.module.js";
import { HealthModule } from "./health/infrastructure/health.module.js";
import { AuthModule } from "./auth/infrastructure/auth.module.js";
import { PrismaModule } from "./shared/infrastructure/prisma/prisma.module.js";

@Module({ imports: [PrismaModule, AuthModule, HealthModule, PostingsModule, ProfileModule, AiModule, ScoringModule] })
export class AppModule {}
