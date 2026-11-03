import { defineConfig } from "vitest/config";

try {
  process.loadEnvFile(new URL("../../.env", import.meta.url));
} catch {
  // No .env file (e.g. CI): variables come from the environment.
}

// Integration tests use TEST_DATABASE_URL when set, otherwise DATABASE_URL.
const databaseUrl = process.env["TEST_DATABASE_URL"] ?? process.env["DATABASE_URL"] ?? "";

export default defineConfig({
  test: {
    env: { DATABASE_URL: databaseUrl },
    globalSetup: ["./test/global-setup.ts"],
    // Integration tests share one database and wipe tables, so files must not run concurrently.
    fileParallelism: false,
    include: ["src/**/*.test.ts", "test/**/*.test.ts", "evals/**/*.test.ts"],
  },
});
