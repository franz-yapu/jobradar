import type { DatabaseHealth } from "../domain/database-health.port.js";
import type { PrismaService } from "../../shared/infrastructure/prisma/prisma.service.js";

export class PrismaDatabaseHealth implements DatabaseHealth {
  constructor(private readonly prisma: PrismaService) {}

  async isUp(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
