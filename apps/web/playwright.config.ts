import { defineConfig, devices } from "@playwright/test";

try {
  process.loadEnvFile(new URL("../../.env", import.meta.url));
} catch {
  // No .env file (e.g. CI): variables come from the environment.
}

// The E2E API EMPTIES this database: it must be a disposable one (the server refuses names not ending in _test / _e2e).
const databaseUrl = process.env["E2E_DATABASE_URL"] ?? process.env["TEST_DATABASE_URL"] ?? process.env["DATABASE_URL"] ?? "";
const API_PORT = 3100;
const WEB_PORT = 5174;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${WEB_PORT}`, trace: "retain-on-failure", locale: "en-US" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // Real API + real database + deterministic AI (never Groq or Anthropic).
      command: "pnpm exec tsx e2e/server.ts",
      cwd: "../api",
      url: `http://localhost:${API_PORT}/health`,
      env: { DATABASE_URL: databaseUrl, PORT: String(API_PORT), WEB_ORIGIN: `http://localhost:${WEB_PORT}` },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `pnpm exec vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      env: { VITE_API_TARGET: `http://localhost:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
