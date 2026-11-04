import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from "@nestjs/common";
import { ApiBadRequestResponse, ApiCookieAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  LoginSchema,
  RegisterSchema,
  UserSchema,
  type LoginBody,
  type RegisterBody,
  type UserResponse,
} from "@jobradar/shared";
import type { Response } from "express";
import { toSwaggerSchema } from "../../shared/infrastructure/swagger-schema.js";
import { ZodValidationPipe } from "../../shared/infrastructure/zod-validation.pipe.js";
import { GetAccount } from "../application/get-account.use-case.js";
import { LoginUser } from "../application/login-user.use-case.js";
import { LogoutUser } from "../application/logout-user.use-case.js";
import { RegisterUser, type SessionGrant } from "../application/register-user.use-case.js";
import {
  EmailTakenError,
  InvalidCredentialsError,
  SignupDisabledError,
  TooManyAttemptsError,
  WeakPasswordError,
  type AuthenticatedUser,
} from "../domain/user.js";
import { coded } from "./auth-errors.js";
import { CurrentUser } from "./current-user.decorator.js";
import { readCookie, SESSION_COOKIE, sessionCookieOptions } from "./cookies.js";
import { Public } from "./public.decorator.js";
import type { AuthedRequest } from "./request-user.js";

const production = () => process.env["NODE_ENV"] === "production";

function setSessionCookie(res: Response, grant: SessionGrant): UserResponse {
  res.cookie(SESSION_COOKIE, grant.sessionToken, { ...sessionCookieOptions(production()), expires: grant.expiresAt });
  return grant.user;
}

function mapError(error: unknown, res: Response): unknown {
  if (error instanceof EmailTakenError) return coded(409, "email_taken", error.message);
  if (error instanceof WeakPasswordError) return coded(400, "weak_password", error.message);
  if (error instanceof SignupDisabledError) return coded(403, "signup_disabled", error.message);
  if (error instanceof InvalidCredentialsError) return coded(401, "invalid_credentials", error.message);
  if (error instanceof TooManyAttemptsError) {
    res.setHeader("Retry-After", String(error.retryAfterSeconds));
    return coded(429, "too_many_attempts", error.message);
  }
  return error;
}

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    @Inject(RegisterUser) private readonly registerUser: RegisterUser,
    @Inject(LoginUser) private readonly loginUser: LoginUser,
    @Inject(LogoutUser) private readonly logoutUser: LogoutUser,
    @Inject(GetAccount) private readonly getAccount: GetAccount,
  ) {}

  @Public()
  @Post("register")
  @HttpCode(201)
  @ApiCreatedResponse({ schema: toSwaggerSchema(UserSchema), description: "Account created and logged in (session cookie)" })
  @ApiBadRequestResponse({ description: "Invalid body or weak_password" })
  @ApiResponse({ status: 403, description: "signup_disabled or bad_origin" })
  @ApiResponse({ status: 409, description: "email_taken" })
  @ApiResponse({ status: 429, description: "too_many_attempts" })
  async register(
    @Body(new ZodValidationPipe(RegisterSchema)) body: RegisterBody,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserResponse> {
    try {
      return setSessionCookie(res, await this.registerUser.execute(body, { ip: req.ip ?? "unknown" }));
    } catch (error) {
      throw mapError(error, res);
    }
  }

  @Public()
  @Post("login")
  @HttpCode(200)
  @ApiOkResponse({ schema: toSwaggerSchema(UserSchema), description: "Logged in (session cookie)" })
  @ApiResponse({ status: 401, description: "invalid_credentials (same answer for an unknown email)" })
  @ApiResponse({ status: 429, description: "too_many_attempts (Retry-After header)" })
  async login(
    @Body(new ZodValidationPipe(LoginSchema)) body: LoginBody,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserResponse> {
    try {
      return setSessionCookie(res, await this.loginUser.execute(body, { ip: req.ip ?? "unknown" }));
    } catch (error) {
      throw mapError(error, res);
    }
  }

  /** Public on purpose: logging out with an expired cookie must still clear it. */
  @Public()
  @Post("logout")
  @HttpCode(204)
  @ApiNoContentResponse({ description: "Session deleted and cookie cleared" })
  async logout(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response): Promise<void> {
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    if (token) await this.logoutUser.execute(token);
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions(production()));
  }

  @Get("me")
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiOkResponse({ schema: toSwaggerSchema(UserSchema) })
  @ApiResponse({ status: 401, description: "unauthenticated" })
  me(@CurrentUser() user: AuthenticatedUser): Promise<UserResponse> {
    return this.getAccount.execute(user.id);
  }
}
