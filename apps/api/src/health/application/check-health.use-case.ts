import type { DatabaseHealth } from "../domain/database-health.port.js";

export interface HealthReport {
  status: "ok" | "degraded";
  db: "up" | "down";
}

export class CheckHealth {
  constructor(private readonly database: DatabaseHealth) {}

  async execute(): Promise<HealthReport> {
    const up = await this.database.isUp();
    return up ? { status: "ok", db: "up" } : { status: "degraded", db: "down" };
  }
}
