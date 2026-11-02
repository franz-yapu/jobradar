import { describe, expect, it } from "vitest";
import type { DatabaseHealth } from "../domain/database-health.port.js";
import { CheckHealth } from "./check-health.use-case.js";

const fakeDb = (up: boolean): DatabaseHealth => ({ isUp: async () => up });

describe("CheckHealth", () => {
  it("reports ok when the database is up", async () => {
    await expect(new CheckHealth(fakeDb(true)).execute()).resolves.toEqual({ status: "ok", db: "up" });
  });

  it("reports degraded when the database is down", async () => {
    await expect(new CheckHealth(fakeDb(false)).execute()).resolves.toEqual({ status: "degraded", db: "down" });
  });
});
