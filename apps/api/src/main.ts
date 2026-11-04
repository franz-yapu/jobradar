import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { loadEnv } from "./config/env.js";
import { setupCors, setupSwagger } from "./setup-app.js";

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  setupCors(app, env.WEB_ORIGIN);
  setupSwagger(app);
  await app.listen(env.PORT);
}

void bootstrap();
