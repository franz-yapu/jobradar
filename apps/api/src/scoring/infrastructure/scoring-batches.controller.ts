import { Body, Controller, Get, HttpCode, HttpException, Inject, NotFoundException, Param, Post, Res } from "@nestjs/common";
import { ApiAcceptedResponse, ApiNotFoundResponse, ApiOkResponse, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  ScoringBatchSchema,
  ScoringBatchStartedSchema,
  StartScoringBatchSchema,
  type ScoringBatchResponse,
  type ScoringBatchStartedResponse,
} from "@jobradar/shared";
import type { Response } from "express";
import { z } from "zod";
import type { AuthenticatedUser } from "../../auth/domain/user.js";
import { CurrentUser } from "../../auth/infrastructure/current-user.decorator.js";
import { ProfileNotFoundError } from "../../profile/domain/profile.repository.js";
import { toSwaggerSchema } from "../../shared/infrastructure/swagger-schema.js";
import { ZodValidationPipe } from "../../shared/infrastructure/zod-validation.pipe.js";
import { GetScoringBatch } from "../application/get-scoring-batch.use-case.js";
import { StartScoringBatch } from "../application/start-scoring-batch.use-case.js";
import { ScoringBatchNotFoundError } from "../domain/scoring-batch.repository.js";
import { toScoringBatchResponse } from "./scoring-batch.presenter.js";

const BodyPipe = new ZodValidationPipe(StartScoringBatchSchema.default({ limit: 10 }));

@ApiTags("scoring")
@Controller("scoring/batches")
export class ScoringBatchesController {
  constructor(
    @Inject(StartScoringBatch) private readonly start: StartScoringBatch,
    @Inject(GetScoringBatch) private readonly get: GetScoringBatch,
  ) {}

  @Post()
  @ApiAcceptedResponse({ schema: toSwaggerSchema(ScoringBatchStartedSchema), description: "Batch queued; poll GET /scoring/batches/:id" })
  @ApiOkResponse({ description: "Nothing left to score (`requested` is 0, `id` is null)" })
  @ApiResponse({ status: 422, description: "profile_not_configured" })
  async startBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Body(BodyPipe) body: { limit: number },
    @Res({ passthrough: true }) res: Response,
  ): Promise<ScoringBatchStartedResponse> {
    try {
      const started = await this.start.execute(user.id, body.limit);
      res.status(started.requested === 0 ? 200 : 202);
      return started;
    } catch (error) {
      if (error instanceof ProfileNotFoundError) {
        throw new HttpException({ statusCode: 422, error: "profile_not_configured", message: error.message }, 422);
      }
      throw error;
    }
  }

  @Get(":id")
  @HttpCode(200)
  @ApiParam({ name: "id", format: "uuid" })
  @ApiOkResponse({ schema: toSwaggerSchema(ScoringBatchSchema) })
  @ApiNotFoundResponse({ description: "Unknown batch, or another account's" })
  async progress(@CurrentUser() user: AuthenticatedUser, @Param("id", new ZodValidationPipe(z.uuid())) id: string): Promise<ScoringBatchResponse> {
    try {
      return toScoringBatchResponse(await this.get.execute(user.id, id));
    } catch (error) {
      if (error instanceof ScoringBatchNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }
}
