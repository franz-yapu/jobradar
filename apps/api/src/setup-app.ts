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

/**
 * Trust the X-Forwarded-For set by `hops` reverse proxies, so `req.ip` (login throttle, Google flow) is the real client.
 * With 0 the header is ignored: a client cannot choose its own IP.
 */
export function setupTrustProxy(app: INestApplication, hops: number): void {
  (app.getHttpAdapter().getInstance() as { set(name: string, value: unknown): void }).set("trust proxy", hops);
}
