import { Module } from "@nestjs/common";
import { HealthModule } from "./health/infrastructure/health.module.js";
import { PrismaModule } from "./shared/infrastructure/prisma/prisma.module.js";

@Module({ imports: [PrismaModule, HealthModule] })
export class AppModule {}
