import { Module } from "@nestjs/common";
import { PrismaService } from "../../shared/infrastructure/prisma/prisma.service.js";
import { GetProfile } from "../application/get-profile.use-case.js";
import { SaveProfile } from "../application/save-profile.use-case.js";
import { PROFILE_REPOSITORY, type ProfileRepository } from "../domain/profile.repository.js";
import { ProfileController } from "./profile.controller.js";
import { PrismaProfileRepository } from "./prisma-profile.repository.js";

@Module({
  controllers: [ProfileController],
  providers: [
    { provide: PROFILE_REPOSITORY, useFactory: (prisma: PrismaService) => new PrismaProfileRepository(prisma), inject: [PrismaService] },
    { provide: GetProfile, useFactory: (repo: ProfileRepository) => new GetProfile(repo), inject: [PROFILE_REPOSITORY] },
    { provide: SaveProfile, useFactory: (repo: ProfileRepository) => new SaveProfile(repo), inject: [PROFILE_REPOSITORY] },
  ],
  exports: [PROFILE_REPOSITORY],
})
export class ProfileModule {}
