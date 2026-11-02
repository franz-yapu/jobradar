import { execSync } from "node:child_process";

/** Applies migrations to the test database once before the integration tests run. */
export default function setup(): void {
  const databaseUrl = process.env["TEST_DATABASE_URL"] ?? process.env["DATABASE_URL"];
  if (!databaseUrl) throw new Error("Set TEST_DATABASE_URL or DATABASE_URL to run integration tests");
  execSync("pnpm exec prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}
