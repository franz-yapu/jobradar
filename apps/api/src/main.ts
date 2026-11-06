import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { loadEnv } from "./config/env.js";
import { setupCors, setupSwagger, setupTrustProxy } from "./setup-app.js";

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  setupCors(app, env.WEB_ORIGIN);
  setupTrustProxy(app, env.TRUST_PROXY);
  if (env.SWAGGER_ENABLED) setupSwagger(app);
  await app.listen(env.PORT);
}

void bootstrap();
