import { Body, ConflictException, Controller, Get, HttpCode, HttpException, Inject, Post, Query } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import {
  CreatePostingSchema,
  ListPostingsQuerySchema,
  PaginatedPostingsSchema,
  PostingSchema,
  type CreatePostingBody,
  type ListPostingsQuery,
  type PaginatedPostingsResponse,
  type PostingResponse,
} from "@jobradar/shared";
import { ZodValidationPipe } from "../../shared/infrastructure/zod-validation.pipe.js";
import { toSwaggerSchema } from "../../shared/infrastructure/swagger-schema.js";
import { CreatePosting, NotAdminError } from "../application/create-posting.use-case.js";
import { ListPostings } from "../application/list-postings.use-case.js";
import { DuplicatePostingError } from "../domain/posting.repository.js";
import { toPostingListItemResponse, toPostingResponse } from "./postings.presenter.js";
import type { AuthenticatedUser } from "../../auth/domain/user.js";
import { CurrentUser } from "../../auth/infrastructure/current-user.decorator.js";

@ApiTags("postings")
@Controller("postings")
export class PostingsController {
  constructor(
    @Inject(CreatePosting) private readonly createPosting: CreatePosting,
    @Inject(ListPostings) private readonly listPostings: ListPostings,
  ) {}

  @Post()
  @HttpCode(201)
  @ApiBody({ schema: toSwaggerSchema(CreatePostingSchema, "input") })
  @ApiCreatedResponse({ schema: toSwaggerSchema(PostingSchema) })
  @ApiBadRequestResponse({ description: "Invalid body" })
  @ApiForbiddenResponse({ description: "not_admin: only an administrator can send scope=catalog" })
  @ApiConflictResponse({ description: "A posting with the same (normalized) URL already exists" })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreatePostingSchema)) body: CreatePostingBody,
  ): Promise<PostingResponse> {
    try {
      const { scope, ...fields } = body;
      const posting = await this.createPosting.execute(
        user,
        { ...fields, publishedAt: fields.publishedAt ? new Date(fields.publishedAt) : undefined },
        scope,
      );
      return toPostingResponse(posting);
    } catch (error) {
      if (error instanceof DuplicatePostingError) throw new ConflictException(error.message);
      if (error instanceof NotAdminError) throw new HttpException({ statusCode: 403, error: "not_admin", message: error.message }, 403);
      throw error;
    }
  }

  @Get()
  @ApiQuery({ name: "scope", required: false, enum: ["mine", "catalog"], description: "Your own postings or the shared catalog; both when omitted" })
  @ApiQuery({ name: "source", required: false })
  @ApiQuery({ name: "q", required: false, description: "Matches title, company or description" })
  @ApiQuery({
    name: "verdict",
    required: false,
    enum: ["fit", "maybe", "reject", "unscored"],
    description: "Matches the LATEST score of each posting; `unscored` = never scored",
  })
  @ApiQuery({ name: "createdSince", required: false, description: "ISO 8601 instant; only postings stored at or after it" })
  @ApiQuery({ name: "page", required: false, schema: { type: "integer", minimum: 1, default: 1 } })
  @ApiQuery({ name: "pageSize", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } })
  @ApiOkResponse({ schema: toSwaggerSchema(PaginatedPostingsSchema) })
  @ApiBadRequestResponse({ description: "Invalid query (e.g. unknown verdict, createdSince not ISO 8601)" })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(ListPostingsQuerySchema)) query: ListPostingsQuery,
  ): Promise<PaginatedPostingsResponse> {
    const { createdSince, ...rest } = query;
    const result = await this.listPostings.execute(user.id, {
      ...rest,
      createdSince: createdSince ? new Date(createdSince) : undefined,
    });
    return { ...result, items: result.items.map(toPostingListItemResponse) };
  }
}
