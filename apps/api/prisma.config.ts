import { defineConfig } from "prisma/config";

try {
  // Scripts run from apps/api; the shared .env lives at the repo root.
  process.loadEnvFile("../../.env");
} catch {
  // No .env file (e.g. CI): variables come from the environment.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url: process.env["DATABASE_URL"] ?? "postgresql://placeholder@localhost:5432/placeholder" },
});
