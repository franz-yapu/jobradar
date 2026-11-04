import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthenticateApiToken } from "../application/api-token.use-cases.js";
import { AuthenticateSession } from "../application/authenticate-session.use-case.js";
import { UnauthenticatedError } from "../domain/user.js";
import { coded } from "./auth-errors.js";
import { readCookie, SESSION_COOKIE } from "./cookies.js";
import { IS_PUBLIC, SESSION_ONLY } from "./public.decorator.js";
import type { AuthedRequest } from "./request-user.js";

const BEARER = /^Bearer\s+(\S+)$/i;

/**
 * Global guard: every endpoint needs a valid session cookie or API token unless it is marked @Public().
 * A Bearer header wins over the cookie and is never silently ignored: a bad token is a 401, not a fallback.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthenticateSession) private readonly authenticateSession: AuthenticateSession,
    @Inject(AuthenticateApiToken) private readonly authenticateApiToken: AuthenticateApiToken,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, targets)) return true;

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const unauthenticated = () => coded(401, "unauthenticated", "Authentication required");
    const bearer = BEARER.exec(request.headers.authorization ?? "")?.[1];
    const cookie = readCookie(request.headers.cookie, SESSION_COOKIE);
    if (!bearer && !cookie) throw unauthenticated();

    try {
      if (bearer) {
        request.user = await this.authenticateApiToken.execute(bearer);
        request.authMethod = "token";
      } else if (cookie) {
        request.user = await this.authenticateSession.execute(cookie);
        request.authMethod = "session";
      }
    } catch (error) {
      if (error instanceof UnauthenticatedError) throw unauthenticated();
      throw error;
    }

    if (request.authMethod === "token" && this.reflector.getAllAndOverride<boolean | undefined>(SESSION_ONLY, targets)) {
      throw coded(403, "session_required", "This endpoint needs a logged-in browser session, not an API token");
    }
    return true;
  }
}
