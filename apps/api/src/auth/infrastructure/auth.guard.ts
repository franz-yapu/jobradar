import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthenticateSession } from "../application/authenticate-session.use-case.js";
import { UnauthenticatedError } from "../domain/user.js";
import { coded } from "./auth-errors.js";
import { readCookie, SESSION_COOKIE } from "./cookies.js";
import { IS_PUBLIC } from "./public.decorator.js";
import type { AuthedRequest } from "./request-user.js";

/** Global guard: every endpoint needs a valid session unless it is marked @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthenticateSession) private readonly authenticate: AuthenticateSession,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const token = readCookie(request.headers.cookie, SESSION_COOKIE);
    if (!token) throw coded(401, "unauthenticated", "Authentication required");
    try {
      request.user = await this.authenticate.execute(token);
      return true;
    } catch (error) {
      if (error instanceof UnauthenticatedError) throw coded(401, "unauthenticated", "Authentication required");
      throw error;
    }
  }
}
