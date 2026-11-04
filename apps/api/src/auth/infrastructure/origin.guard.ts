import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { coded } from "./auth-errors.js";
import type { AuthedRequest } from "./request-user.js";

export const ALLOWED_ORIGINS = Symbol("ALLOWED_ORIGINS");
const STATE_CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * CSRF defence next to SameSite=Lax: a browser always sends `Origin` on cross-site writes, so a write
 * that carries an Origin we do not know is refused. Requests without Origin (curl, n8n, server to server)
 * and requests authenticated with a Bearer token do not depend on the cookie and are not affected.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(@Inject(ALLOWED_ORIGINS) private readonly allowedOrigins: string[]) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    if (!STATE_CHANGING.has(request.method)) return true;
    if (request.headers.authorization?.toLowerCase().startsWith("bearer ")) return true;
    const origin = request.headers.origin;
    if (origin === undefined) return true;
    if (this.allowedOrigins.includes(origin)) return true;
    throw coded(403, "bad_origin", "Request from an origin that is not allowed");
  }
}
