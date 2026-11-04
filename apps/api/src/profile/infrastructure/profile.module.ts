import { Module } from "@nestjs/common";
import { AI_PROVIDER, type AiProvider } from "../../ai/domain/ai-provider.js";
import { AiModule } from "../../ai/infrastructure/ai.module.js";
import { PrismaService } from "../../shared/infrastructure/prisma/prisma.service.js";
import { GetProfile } from "../application/get-profile.use-case.js";
import { ImportCv } from "../application/import-cv.use-case.js";
import { SaveProfile } from "../application/save-profile.use-case.js";
import { CV_TEXT_EXTRACTOR, type CvTextExtractor } from "../domain/cv-text-extractor.js";
import { PROFILE_REPOSITORY, type ProfileRepository } from "../domain/profile.repository.js";
import { CvImportController } from "./cv-import.controller.js";
import { PdfParseTextExtractor } from "./pdf-parse-text-extractor.js";
import { ProfileController } from "./profile.controller.js";
import { PrismaProfileRepository } from "./prisma-profile.repository.js";

@Module({
  imports: [AiModule],
  controllers: [ProfileController, CvImportController],
  providers: [
    { provide: PROFILE_REPOSITORY, useFactory: (prisma: PrismaService) => new PrismaProfileRepository(prisma), inject: [PrismaService] },
    { provide: GetProfile, useFactory: (repo: ProfileRepository) => new GetProfile(repo), inject: [PROFILE_REPOSITORY] },
    { provide: SaveProfile, useFactory: (repo: ProfileRepository) => new SaveProfile(repo), inject: [PROFILE_REPOSITORY] },
    { provide: CV_TEXT_EXTRACTOR, useFactory: () => new PdfParseTextExtractor() },
    {
      provide: ImportCv,
      useFactory: (extractor: CvTextExtractor, ai: AiProvider) => new ImportCv(extractor, ai),
      inject: [CV_TEXT_EXTRACTOR, AI_PROVIDER],
    },
  ],
  exports: [PROFILE_REPOSITORY],
})
export class ProfileModule {}
