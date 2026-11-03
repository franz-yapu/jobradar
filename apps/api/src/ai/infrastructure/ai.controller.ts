import { Controller, Get, Inject } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { AiUsageSchema, type AiUsageResponse } from "@jobradar/shared";
import { toSwaggerSchema } from "../../shared/infrastructure/swagger-schema.js";
import { GetAiUsage } from "../application/get-ai-usage.use-case.js";

@ApiTags("ai")
@Controller("ai")
export class AiController {
  constructor(@Inject(GetAiUsage) private readonly getUsage: GetAiUsage) {}

  @Get("usage")
  @ApiOkResponse({ schema: toSwaggerSchema(AiUsageSchema), description: "AI spend and tokens for the current UTC day" })
  usage(): Promise<AiUsageResponse> {
    return this.getUsage.execute();
  }
}
