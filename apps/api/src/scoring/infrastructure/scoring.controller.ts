import {
  Controller,
  Get,
  HttpCode,
  HttpException,
  Inject,
  NotFoundException,
  Param,
  Post,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { PostingScoreSchema, type PostingScoreResponse } from "@jobradar/shared";
import { z } from "zod";
import {
  AiNotConfiguredError,
  AiProviderError,
  AiRefusalError,
  BudgetExceededError,
} from "../../ai/domain/ai-provider.js";
import { PostingNotFoundError } from "../../postings/domain/posting.repository.js";
import { ProfileNotFoundError } from "../../profile/domain/profile.repository.js";
import { toSwaggerSchema } from "../../shared/infrastructure/swagger-schema.js";
import { ZodValidationPipe } from "../../shared/infrastructure/zod-validation.pipe.js";
import { GetPostingScore } from "../application/get-posting-score.use-case.js";
import { ScorePosting } from "../application/score-posting.use-case.js";
import { ScoreNotFoundError } from "../domain/posting-score.repository.js";
import { toPostingScoreResponse } from "./posting-score.presenter.js";

const IdPipe = new ZodValidationPipe(z.uuid());

/** Error body: { statusCode, error: <machine code>, message }. */
function coded(status: number, code: string, message: string): HttpException {
  return new HttpException({ statusCode: status, error: code, message }, status);
}

@ApiTags("postings")
@Controller("postings/:id/score")
export class ScoringController {
  constructor(
    @Inject(ScorePosting) private readonly scorePosting: ScorePosting,
    @Inject(GetPostingScore) private readonly getPostingScore: GetPostingScore,
  ) {}

  @Post()
  @HttpCode(201)
  @ApiParam({ name: "id", format: "uuid" })
  @ApiCreatedResponse({ schema: toSwaggerSchema(PostingScoreSchema), description: "A new score (history is kept)" })
  @ApiBadRequestResponse({ description: "Malformed posting id" })
  @ApiNotFoundResponse({ description: "Unknown posting" })
  @ApiResponse({ status: 422, description: "profile_not_configured or ai_refused" })
  @ApiResponse({ status: 429, description: "ai_budget_exceeded" })
  @ApiResponse({ status: 502, description: "ai_provider_error" })
  @ApiResponse({ status: 503, description: "ai_not_configured" })
  async score(@Param("id", IdPipe) id: string): Promise<PostingScoreResponse> {
    try {
      return toPostingScoreResponse(await this.scorePosting.execute(id));
    } catch (error) {
      throw mapScoringError(error);
    }
  }

  @Get()
  @ApiParam({ name: "id", format: "uuid" })
  @ApiOkResponse({ schema: toSwaggerSchema(PostingScoreSchema), description: "The latest score" })
  @ApiBadRequestResponse({ description: "Malformed posting id" })
  @ApiNotFoundResponse({ description: "Unknown posting or not scored yet" })
  async latest(@Param("id", IdPipe) id: string): Promise<PostingScoreResponse> {
    try {
      return toPostingScoreResponse(await this.getPostingScore.execute(id));
    } catch (error) {
      throw mapScoringError(error);
    }
  }
}

function mapScoringError(error: unknown): unknown {
  if (error instanceof PostingNotFoundError || error instanceof ScoreNotFoundError) {
    return new NotFoundException(error.message);
  }
  if (error instanceof ProfileNotFoundError) return coded(422, "profile_not_configured", error.message);
  if (error instanceof AiRefusalError) return coded(422, "ai_refused", error.message);
  if (error instanceof BudgetExceededError) return coded(429, "ai_budget_exceeded", error.message);
  if (error instanceof AiNotConfiguredError) return coded(503, "ai_not_configured", error.message);
  if (error instanceof AiProviderError) return coded(502, "ai_provider_error", "The AI provider failed");
  return error;
}
