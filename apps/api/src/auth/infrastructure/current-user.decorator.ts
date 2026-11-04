import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { AuthenticatedUser } from "../domain/user.js";
import { UnauthenticatedError } from "../domain/user.js";
import type { AuthedRequest } from "./request-user.js";

/** The logged-in user. Only valid on protected endpoints (the guard guarantees it is set). */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthenticatedUser => {
  const user = context.switchToHttp().getRequest<AuthedRequest>().user;
  if (!user) throw new UnauthenticatedError();
  return user;
});
