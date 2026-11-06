import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { verifyWorkerRequest, WORKER_SIGNATURE_HEADER, WORKER_TIMESTAMP_HEADER } from "@jobradar/shared/worker-signature";
import { coded } from "../../auth/infrastructure/auth-errors.js";

export const WORKER_SECRET = Symbol("WORKER_SECRET");

/**
 * Authenticates the queue worker (not a user): HMAC of timestamp, method and path with the shared secret.
 * Fails closed: with no secret configured every call is refused.
 */
@Injectable()
export class WorkerSignatureGuard implements CanActivate {
  constructor(@Inject(WORKER_SECRET) private readonly secret: string | undefined) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = (name: string): string | undefined => {
      const value = request.headers[name];
      return Array.isArray(value) ? value[0] : value;
    };
    const path = request.originalUrl.split("?")[0] ?? "";
    const ok =
      this.secret !== undefined &&
      verifyWorkerRequest(
        { secret: this.secret, method: request.method, path },
        { timestamp: header(WORKER_TIMESTAMP_HEADER), signature: header(WORKER_SIGNATURE_HEADER) },
      );
    if (!ok) throw coded(401, "invalid_worker_signature", "Missing or invalid worker signature");
    return true;
  }
}
