import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle("JobRadar API")
    .setDescription("Job postings, AI scoring and application drafts")
    .setVersion("0.1.0")
    .addCookieAuth("jr_session")
    .build();
  SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, config));
}

/** Browsers may call the API only from the configured origins (never a wildcard). */
export function setupCors(app: INestApplication, allowedOrigins: string[]): void {
  app.enableCors({ origin: allowedOrigins, credentials: true, methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], maxAge: 600 });
}
