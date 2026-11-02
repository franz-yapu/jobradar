import { Module } from "@nestjs/common";
import { PrismaService } from "../../shared/infrastructure/prisma/prisma.service.js";
import { CheckHealth } from "../application/check-health.use-case.js";
import { DATABASE_HEALTH, type DatabaseHealth } from "../domain/database-health.port.js";
import { HealthController } from "./health.controller.js";
import { PrismaDatabaseHealth } from "./prisma-database-health.js";

@Module({
  controllers: [HealthController],
  providers: [
    { provide: DATABASE_HEALTH, useFactory: (prisma: PrismaService) => new PrismaDatabaseHealth(prisma), inject: [PrismaService] },
    { provide: CheckHealth, useFactory: (db: DatabaseHealth) => new CheckHealth(db), inject: [DATABASE_HEALTH] },
  ],
})
export class HealthModule {}
