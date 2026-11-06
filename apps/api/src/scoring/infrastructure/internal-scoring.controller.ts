import { Controller, HttpCode, Inject, NotFoundException, Param, Post, UseGuards } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { z } from "zod";
import { Public } from "../../auth/infrastructure/public.decorator.js";
import { ZodValidationPipe } from "../../shared/infrastructure/zod-validation.pipe.js";
import { ProcessScoringJob } from "../application/process-scoring-job.use-case.js";
import { ScoringJobNotFoundError } from "../domain/scoring-batch.repository.js";
import { WorkerSignatureGuard } from "./worker-signature.guard.js";

/** Called by the queue worker only. Public for the session guard, protected by the worker signature. Not in Swagger. */
@ApiExcludeController()
@Public()
@UseGuards(WorkerSignatureGuard)
@Controller("internal/scoring/jobs")
export class InternalScoringController {
  constructor(@Inject(ProcessScoringJob) private readonly process: ProcessScoringJob) {}

  @Post(":id/process")
  @HttpCode(204)
  async processJob(@Param("id", new ZodValidationPipe(z.uuid())) id: string): Promise<void> {
    try {
      await this.process.execute(id);
    } catch (error) {
      if (error instanceof ScoringJobNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }
}
