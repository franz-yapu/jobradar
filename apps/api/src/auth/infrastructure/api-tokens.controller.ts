import { Body, Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, Post } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import {
  ApiTokenSchema,
  CreateApiTokenSchema,
  CreatedApiTokenSchema,
  type ApiTokenResponse,
  type CreateApiTokenBody,
  type CreatedApiTokenResponse,
} from "@jobradar/shared";
import { z } from "zod";
import { toSwaggerSchema } from "../../shared/infrastructure/swagger-schema.js";
import { ZodValidationPipe } from "../../shared/infrastructure/zod-validation.pipe.js";
import { CreateApiToken, ListApiTokens, RevokeApiToken } from "../application/api-token.use-cases.js";
import { ApiTokenNotFoundError, TooManyTokensError, type ApiToken } from "../domain/api-token.js";
import type { AuthenticatedUser } from "../domain/user.js";
import { coded } from "./auth-errors.js";
import { SESSION_COOKIE } from "./cookies.js";
import { CurrentUser } from "./current-user.decorator.js";
import { SessionOnly } from "./public.decorator.js";

function toResponse(token: ApiToken): ApiTokenResponse {
  return {
    id: token.id,
    name: token.name,
    prefix: token.prefix,
    createdAt: token.createdAt.toISOString(),
    lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
    revokedAt: token.revokedAt?.toISOString() ?? null,
  };
}

/** Managing tokens needs the browser session: an API token cannot mint or revoke tokens. */
@SessionOnly()
@ApiTags("auth")
@ApiCookieAuth(SESSION_COOKIE)
@Controller("auth/tokens")
export class ApiTokensController {
  constructor(
    @Inject(CreateApiToken) private readonly createToken: CreateApiToken,
    @Inject(ListApiTokens) private readonly listTokens: ListApiTokens,
    @Inject(RevokeApiToken) private readonly revokeToken: RevokeApiToken,
  ) {}

  @Get()
  @ApiOkResponse({ schema: { type: "array", items: toSwaggerSchema(ApiTokenSchema) }, description: "Your tokens (never the secret)" })
  async list(@CurrentUser() user: AuthenticatedUser): Promise<ApiTokenResponse[]> {
    return (await this.listTokens.execute(user.id)).map(toResponse);
  }

  @Post()
  @HttpCode(201)
  @ApiCreatedResponse({ schema: toSwaggerSchema(CreatedApiTokenSchema), description: "The only time the token is shown" })
  @ApiBadRequestResponse({ description: "Invalid name" })
  @ApiResponse({ status: 403, description: "session_required (not available with an API token)" })
  @ApiResponse({ status: 409, description: "too_many_tokens" })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateApiTokenSchema)) body: CreateApiTokenBody,
  ): Promise<CreatedApiTokenResponse> {
    try {
      const { apiToken, token } = await this.createToken.execute(user.id, body.name);
      return { ...toResponse(apiToken), token };
    } catch (error) {
      if (error instanceof TooManyTokensError) throw coded(409, "too_many_tokens", error.message);
      throw error;
    }
  }

  @Delete(":id")
  @HttpCode(204)
  @ApiParam({ name: "id", format: "uuid" })
  @ApiNoContentResponse({ description: "Revoked (also when it already was)" })
  @ApiNotFoundResponse({ description: "No such token in your account" })
  async revoke(@CurrentUser() user: AuthenticatedUser, @Param("id", new ZodValidationPipe(z.uuid())) id: string): Promise<void> {
    try {
      await this.revokeToken.execute(user.id, id);
    } catch (error) {
      if (error instanceof ApiTokenNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }
}
