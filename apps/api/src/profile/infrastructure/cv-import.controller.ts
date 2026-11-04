import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpException,
  Inject,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBadRequestResponse, ApiBody, ApiConsumes, ApiOkResponse, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CvDraftSchema, type CvDraft as CvDraftResponse } from "@jobradar/shared";
import {
  AiNotConfiguredError,
  AiProviderError,
  AiRefusalError,
  BudgetExceededError,
} from "../../ai/domain/ai-provider.js";
import { toSwaggerSchema } from "../../shared/infrastructure/swagger-schema.js";
import { ImportCv } from "../application/import-cv.use-case.js";
import { NoTextError, NotAPdfError, TooManyPagesError } from "../domain/cv-text-extractor.js";

/** The part of the multer file (memory storage) this controller needs. */
interface UploadedCv {
  buffer: Buffer;
}

export const MAX_CV_BYTES = 5 * 1024 * 1024;

/** Error body: { statusCode, error: <machine code>, message }, like the scoring endpoints. */
function coded(status: number, code: string, message: string): HttpException {
  return new HttpException({ statusCode: status, error: code, message }, status);
}

@ApiTags("profile")
@Controller("profile")
export class CvImportController {
  constructor(@Inject(ImportCv) private readonly importCv: ImportCv) {}

  @Post("import-cv")
  @HttpCode(200)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_CV_BYTES, files: 1 } }))
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: { type: "object", required: ["file"], properties: { file: { type: "string", format: "binary" } } },
  })
  @ApiOkResponse({ schema: toSwaggerSchema(CvDraftSchema), description: "A draft to review; nothing is stored" })
  @ApiBadRequestResponse({ description: "No file" })
  @ApiResponse({ status: 413, description: "File larger than 5 MB" })
  @ApiResponse({ status: 415, description: "cv_not_pdf" })
  @ApiResponse({ status: 422, description: "cv_no_text, cv_too_long or ai_refused" })
  @ApiResponse({ status: 429, description: "ai_budget_exceeded" })
  @ApiResponse({ status: 502, description: "ai_provider_error" })
  @ApiResponse({ status: 503, description: "ai_not_configured" })
  async import(@UploadedFile() file: UploadedCv | undefined): Promise<CvDraftResponse> {
    if (!file) throw new BadRequestException('Send the CV as multipart/form-data in the "file" field');
    try {
      return await this.importCv.execute(file.buffer);
    } catch (error) {
      throw mapImportError(error);
    }
  }
}

function mapImportError(error: unknown): unknown {
  if (error instanceof NotAPdfError) return coded(415, "cv_not_pdf", error.message);
  if (error instanceof TooManyPagesError) return coded(422, "cv_too_long", error.message);
  if (error instanceof NoTextError) return coded(422, "cv_no_text", error.message);
  if (error instanceof AiRefusalError) return coded(422, "ai_refused", error.message);
  if (error instanceof BudgetExceededError) return coded(429, "ai_budget_exceeded", error.message);
  if (error instanceof AiNotConfiguredError) return coded(503, "ai_not_configured", error.message);
  if (error instanceof AiProviderError) return coded(502, "ai_provider_error", "The AI provider failed");
  return error;
}
