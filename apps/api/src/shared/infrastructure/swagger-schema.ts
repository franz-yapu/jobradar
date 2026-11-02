import type { ApiBodyOptions } from "@nestjs/swagger";
import { z } from "zod";

type SwaggerSchema = Extract<ApiBodyOptions, { schema: unknown }>["schema"];

/** Converts a Zod schema (single source of truth in packages/shared) to an OpenAPI schema. */
export function toSwaggerSchema(schema: z.ZodType, io: "input" | "output" = "output"): SwaggerSchema {
  return z.toJSONSchema(schema, { target: "openapi-3.0", io, unrepresentable: "any" }) as SwaggerSchema;
}
