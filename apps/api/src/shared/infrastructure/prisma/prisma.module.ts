import { Global, Module } from "@nestjs/common";
import { loadEnv } from "../../../config/env.js";
import { PrismaService } from "./prisma.service.js";

@Global()
@Module({
  providers: [{ provide: PrismaService, useFactory: () => new PrismaService(loadEnv().DATABASE_URL) }],
  exports: [PrismaService],
})
export class PrismaModule {}
