import { Body, Controller, Delete, Get, HttpCode, Inject, Logger, Put, Query, Req, Res } from "@nestjs/common";
import { ApiCookieAuth, ApiNoContentResponse, ApiOkResponse, ApiResponse, ApiTags } from "@nestjs/swagger";
import { ProvidersSchema, SetPasswordSchema, type ProvidersResponse, type SetPasswordBody } from "@jobradar/shared";
import type { Response } from "express";
import { z } from "zod";
import { toSwaggerSchema } from "../../shared/infrastructure/swagger-schema.js";
import { ZodValidationPipe } from "../../shared/infrastructure/zod-validation.pipe.js";
import { CompleteGoogleFlow, SetPassword, StartGoogleFlow, UnlinkGoogle } from "../application/google-flow.use-cases.js";
import { PasswordExistsError, PasswordRequiredError, TooManyAttemptsError, UnauthenticatedError, WeakPasswordError, type AuthenticatedUser } from "../domain/user.js";
import { coded } from "./auth-errors.js";
import { CurrentUser } from "./current-user.decorator.js";
import { OAUTH_COOKIE, oauthCookieOptions, readCookie, SESSION_COOKIE, sessionCookieOptions } from "./cookies.js";
import { Public, SessionOnly } from "./public.decorator.js";
import type { AuthedRequest } from "./request-user.js";

export const GOOGLE_WEB = Symbol("GOOGLE_WEB");

/** Present only when Google sign-in is configured. */
export interface GoogleWeb {
  /** Where the web app lives: the browser is sent back there after the round trip. */
  webOrigin: string;
  /** Folder of the callback, the only place the attempt cookie is sent. */
  cookiePath: string;
}

const production = () => process.env["NODE_ENV"] === "production";
const StartQuery = z.object({ returnTo: z.string().max(500).optional() });
const CallbackQuery = z.object({
  code: z.string().max(2048).optional(),
  state: z.string().max(512).optional(),
  error: z.string().max(200).optional(),
});

function noStore(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
}

function mapError(error: unknown, res: Response): unknown {
  if (error instanceof TooManyAttemptsError) {
    res.setHeader("Retry-After", String(error.retryAfterSeconds));
    return coded(429, "too_many_attempts", error.message);
  }
  if (error instanceof UnauthenticatedError) return coded(401, "unauthenticated", error.message);
  if (error instanceof PasswordRequiredError) return coded(409, "password_required", error.message);
  if (error instanceof PasswordExistsError) return coded(409, "password_exists", error.message);
  if (error instanceof WeakPasswordError) return coded(400, "weak_password", error.message);
  return error;
}

@ApiTags("auth")
@Controller("auth")
export class OAuthController {
  private readonly log = new Logger("GoogleSignIn");

  constructor(
    @Inject(StartGoogleFlow) private readonly startFlow: StartGoogleFlow,
    @Inject(CompleteGoogleFlow) private readonly completeFlow: CompleteGoogleFlow,
    @Inject(UnlinkGoogle) private readonly unlinkGoogle: UnlinkGoogle,
    @Inject(SetPassword) private readonly setPasswordUseCase: SetPassword,
    @Inject(GOOGLE_WEB) private readonly google: GoogleWeb | null,
  ) {}

  private enabled(): GoogleWeb {
    if (!this.google) throw coded(404, "not_found", "Sign in with Google is not configured");
    return this.google;
  }

  @Public()
  @Get("providers")
  @ApiOkResponse({ schema: toSwaggerSchema(ProvidersSchema) })
  providers(): ProvidersResponse {
    return { google: this.google !== null };
  }

  @Public()
  @Get("google/start")
  @ApiResponse({ status: 302, description: "Redirect to Google (and the attempt cookie)" })
  @ApiResponse({ status: 404, description: "Google sign-in is not configured" })
  async startLogin(@Query(new ZodValidationPipe(StartQuery)) query: z.output<typeof StartQuery>, @Req() req: AuthedRequest, @Res() res: Response): Promise<void> {
    const google = this.enabled();
    try {
      const { redirectUrl, state } = await this.startFlow.execute({ intent: "login", userId: null, returnTo: query.returnTo }, { ip: req.ip ?? "unknown" });
      res.cookie(OAUTH_COOKIE, state, oauthCookieOptions(production(), google.cookiePath));
      noStore(res);
      res.redirect(302, redirectUrl);
    } catch (error) {
      throw mapError(error, res);
    }
  }

  /** Browser session only: connecting Google to an account must be the account's owner at the keyboard. */
  @SessionOnly()
  @Get("google/link")
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiResponse({ status: 302, description: "Redirect to Google to connect it to the logged-in account" })
  async startLink(
    @Query(new ZodValidationPipe(StartQuery)) query: z.output<typeof StartQuery>,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const google = this.enabled();
    try {
      const { redirectUrl, state } = await this.startFlow.execute({ intent: "link", userId: user.id, returnTo: query.returnTo }, { ip: req.ip ?? "unknown" });
      res.cookie(OAUTH_COOKIE, state, oauthCookieOptions(production(), google.cookiePath));
      noStore(res);
      res.redirect(302, redirectUrl);
    } catch (error) {
      throw mapError(error, res);
    }
  }

  @Public()
  @Get("google/callback")
  @ApiResponse({ status: 302, description: "Back to the web app: signed in, or /login?error=<code>" })
  async callback(@Query() rawQuery: unknown, @Req() req: AuthedRequest, @Res() res: Response): Promise<void> {
    const google = this.enabled();
    noStore(res);
    const cookieState = readCookie(req.headers.cookie, OAUTH_COOKIE);
    res.clearCookie(OAUTH_COOKIE, oauthCookieOptions(production(), google.cookiePath));
    const parsed = CallbackQuery.safeParse(rawQuery);
    const query = parsed.success ? parsed.data : {};
    const go = (path: string) => res.redirect(302, `${google.webOrigin}${path}`);

    const result = await this.completeFlow.execute(
      { code: query.code, state: query.state, providerError: !parsed.success || query.error !== undefined },
      { ip: req.ip ?? "unknown", cookieState },
    );
    if (result.type === "failed") {
      this.log.warn(`Google sign-in (${result.intent}) refused: ${result.code} - ${result.detail}`);
      return go(`${result.intent === "link" ? "/settings/account" : "/login"}?error=${result.code}`);
    }
    if (result.type === "signed_in") {
      res.cookie(SESSION_COOKIE, result.grant.sessionToken, { ...sessionCookieOptions(production()), expires: result.grant.expiresAt });
    }
    return go(result.returnTo);
  }

  @SessionOnly()
  @Delete("google")
  @HttpCode(204)
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiNoContentResponse({ description: "Google disconnected" })
  @ApiResponse({ status: 409, description: "password_required: Google is the only way in" })
  async disconnect(@CurrentUser() user: AuthenticatedUser, @Res({ passthrough: true }) res: Response): Promise<void> {
    try {
      await this.unlinkGoogle.execute(user.id);
    } catch (error) {
      throw mapError(error, res);
    }
  }

  @SessionOnly()
  @Put("password")
  @HttpCode(204)
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiNoContentResponse({ description: "Password set" })
  @ApiResponse({ status: 409, description: "password_exists" })
  async setPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(SetPasswordSchema)) body: SetPasswordBody,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    try {
      await this.setPasswordUseCase.execute(user.id, body.password);
    } catch (error) {
      throw mapError(error, res);
    }
  }
}
