import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { ApiOkResponse, ApiProperty, ApiServiceUnavailableResponse, ApiTags } from "@nestjs/swagger";
import { HealthResponseSchema } from "@jobradar/shared";
import { CheckHealth } from "../application/check-health.use-case.js";
import { Public } from "../../auth/infrastructure/public.decorator.js";

export class HealthResponseDto {
  @ApiProperty({ enum: ["ok", "degraded"] })
  status!: "ok" | "degraded";

  @ApiProperty({ enum: ["up", "down"] })
  db!: "up" | "down";
}

@Public()
@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(@Inject(CheckHealth) private readonly checkHealth: CheckHealth) {}

  @Get()
  @ApiOkResponse({ type: HealthResponseDto })
  @ApiServiceUnavailableResponse({ type: HealthResponseDto })
  async get(): Promise<HealthResponseDto> {
    const report = HealthResponseSchema.parse(await this.checkHealth.execute());
    if (report.db === "down") throw new ServiceUnavailableException(report);
    return report;
  }
}
