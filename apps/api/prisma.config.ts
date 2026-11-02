import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url: process.env["DATABASE_URL"] ?? "postgresql://placeholder@localhost:5432/placeholder" },
});
