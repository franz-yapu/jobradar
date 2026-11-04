import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { loadEnv } from "../../config/env.js";
import { PrismaService } from "../../shared/infrastructure/prisma/prisma.service.js";
import { ADMIN_POLICY, EmailAdminPolicy, type AdminPolicy } from "../domain/admin-policy.js";
import { AuthenticateApiToken, CreateApiToken, ListApiTokens, RevokeApiToken } from "../application/api-token.use-cases.js";
import { CompleteGoogleFlow, SetPassword, StartGoogleFlow, UnlinkGoogle } from "../application/google-flow.use-cases.js";
import { AuthenticateSession } from "../application/authenticate-session.use-case.js";
import { GetAccount } from "../application/get-account.use-case.js";
import { LoginUser } from "../application/login-user.use-case.js";
import { LogoutUser } from "../application/logout-user.use-case.js";
import { RegisterUser } from "../application/register-user.use-case.js";
import {
  API_TOKEN_REPOSITORY,
  ATTEMPT_LIMITER,
  OAUTH_FLOW_REPOSITORY,
  PASSWORD_HASHER,
  PKCE_GENERATOR,
  SESSION_REPOSITORY,
  TOKEN_GENERATOR,
  USER_REPOSITORY,
  type ApiTokenRepository,
  type AttemptLimiter,
  type Clock,
  type OAuthFlowRepository,
  type PasswordHasher,
  type PkceGenerator,
  type SecureTokenGenerator,
  type SessionRepository,
  type UserRepository,
} from "../domain/ports.js";
import { IDENTITY_PROVIDER, IdentityVerificationError, type IdentityProvider } from "../domain/identity-provider.js";
import { ApiTokensController } from "./api-tokens.controller.js";
import { AuthController } from "./auth.controller.js";
import { AuthGuard } from "./auth.guard.js";
import { GoogleIdentityProvider } from "./google-identity.provider.js";
import { GOOGLE_WEB, OAuthController, type GoogleWeb } from "./oauth.controller.js";
import { CryptoPkceGenerator } from "./pkce.js";
import { CryptoTokenGenerator } from "./crypto-token-generator.js";
import { InMemoryAttemptLimiter } from "./in-memory-attempt-limiter.js";
import { ALLOWED_ORIGINS, OriginGuard } from "./origin.guard.js";
import { PrismaApiTokenRepository, PrismaOAuthFlowRepository, PrismaSessionRepository, PrismaUserRepository } from "./prisma-auth.repositories.js";
import { FAST_SCRYPT_FOR_TESTS, ScryptPasswordHasher } from "./scrypt-password-hasher.js";

/** Stands in when Google is not configured: the endpoints answer 404 before it is ever called. */
const unconfiguredProvider: IdentityProvider = {
  authorizationUrl() {
    throw new IdentityVerificationError("Google sign-in is not configured");
  },
  async verifyCallback() {
    throw new IdentityVerificationError("Google sign-in is not configured");
  },
};

/** The callback lives in a folder like `/auth/google`; the attempt cookie is scoped to it. */
function googleWeb(): GoogleWeb | null {
  const { GOOGLE, WEB_ORIGIN } = loadEnv();
  const webOrigin = WEB_ORIGIN[0];
  if (!GOOGLE || !webOrigin) return null;
  const callbackPath = new URL(GOOGLE.redirectUri).pathname;
  return { webOrigin, cookiePath: callbackPath.slice(0, callbackPath.lastIndexOf("/")) || "/" };
}

const CLOCK = Symbol("CLOCK");
const systemClock: Clock = { now: () => new Date() };

@Module({
  controllers: [AuthController, ApiTokensController, OAuthController],
  providers: [
    { provide: CLOCK, useValue: systemClock },
    { provide: ADMIN_POLICY, useFactory: (): AdminPolicy => new EmailAdminPolicy(loadEnv().ADMIN_EMAILS) },
    { provide: USER_REPOSITORY, useFactory: (prisma: PrismaService) => new PrismaUserRepository(prisma), inject: [PrismaService] },
    { provide: SESSION_REPOSITORY, useFactory: (prisma: PrismaService) => new PrismaSessionRepository(prisma), inject: [PrismaService] },
    {
      provide: API_TOKEN_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaApiTokenRepository(prisma),
      inject: [PrismaService],
    },
    // Cheap hashing only under Vitest (NODE_ENV=test), so the suite stays fast; every other run uses the strong setting.
    {
      provide: PASSWORD_HASHER,
      useFactory: () => new ScryptPasswordHasher(process.env["NODE_ENV"] === "test" ? FAST_SCRYPT_FOR_TESTS : undefined),
    },
    { provide: TOKEN_GENERATOR, useFactory: () => new CryptoTokenGenerator() },
    { provide: PKCE_GENERATOR, useFactory: () => new CryptoPkceGenerator() },
    {
      provide: OAUTH_FLOW_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaOAuthFlowRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: IDENTITY_PROVIDER,
      useFactory: (): IdentityProvider => {
        const { GOOGLE } = loadEnv();
        return GOOGLE ? new GoogleIdentityProvider(GOOGLE) : unconfiguredProvider;
      },
    },
    { provide: GOOGLE_WEB, useFactory: googleWeb },
    {
      provide: StartGoogleFlow,
      useFactory: (provider: IdentityProvider, flows: OAuthFlowRepository, tokens: SecureTokenGenerator, pkce: PkceGenerator, limiter: AttemptLimiter, clock: Clock) =>
        new StartGoogleFlow(provider, flows, tokens, pkce, limiter, clock),
      inject: [IDENTITY_PROVIDER, OAUTH_FLOW_REPOSITORY, TOKEN_GENERATOR, PKCE_GENERATOR, ATTEMPT_LIMITER, CLOCK],
    },
    {
      provide: CompleteGoogleFlow,
      useFactory: (
        provider: IdentityProvider,
        flows: OAuthFlowRepository,
        users: UserRepository,
        sessions: SessionRepository,
        tokens: SecureTokenGenerator,
        limiter: AttemptLimiter,
        clock: Clock,
        admins: AdminPolicy,
      ) => new CompleteGoogleFlow(provider, flows, users, sessions, tokens, limiter, clock, { signupAllowed: loadEnv().ALLOW_SIGNUP }, admins),
      inject: [IDENTITY_PROVIDER, OAUTH_FLOW_REPOSITORY, USER_REPOSITORY, SESSION_REPOSITORY, TOKEN_GENERATOR, ATTEMPT_LIMITER, CLOCK, ADMIN_POLICY],
    },
    { provide: UnlinkGoogle, useFactory: (users: UserRepository) => new UnlinkGoogle(users), inject: [USER_REPOSITORY] },
    {
      provide: SetPassword,
      useFactory: (users: UserRepository, hasher: PasswordHasher) => new SetPassword(users, hasher),
      inject: [USER_REPOSITORY, PASSWORD_HASHER],
    },
    { provide: ATTEMPT_LIMITER, useFactory: (clock: Clock) => new InMemoryAttemptLimiter(clock), inject: [CLOCK] },
    {
      provide: RegisterUser,
      useFactory: (
        users: UserRepository,
        sessions: SessionRepository,
        hasher: PasswordHasher,
        tokens: SecureTokenGenerator,
        limiter: AttemptLimiter,
        clock: Clock,
        admins: AdminPolicy,
      ) => new RegisterUser(users, sessions, hasher, tokens, limiter, clock, { signupAllowed: loadEnv().ALLOW_SIGNUP }, admins),
      inject: [USER_REPOSITORY, SESSION_REPOSITORY, PASSWORD_HASHER, TOKEN_GENERATOR, ATTEMPT_LIMITER, CLOCK, ADMIN_POLICY],
    },
    {
      provide: LoginUser,
      useFactory: (
        users: UserRepository,
        sessions: SessionRepository,
        hasher: PasswordHasher,
        tokens: SecureTokenGenerator,
        limiter: AttemptLimiter,
        clock: Clock,
        admins: AdminPolicy,
      ) => new LoginUser(users, sessions, hasher, tokens, limiter, clock, admins),
      inject: [USER_REPOSITORY, SESSION_REPOSITORY, PASSWORD_HASHER, TOKEN_GENERATOR, ATTEMPT_LIMITER, CLOCK, ADMIN_POLICY],
    },
    {
      provide: AuthenticateSession,
      useFactory: (users: UserRepository, sessions: SessionRepository, tokens: SecureTokenGenerator, clock: Clock, admins: AdminPolicy) =>
        new AuthenticateSession(users, sessions, tokens, clock, admins),
      inject: [USER_REPOSITORY, SESSION_REPOSITORY, TOKEN_GENERATOR, CLOCK, ADMIN_POLICY],
    },
    {
      provide: GetAccount,
      useFactory: (users: UserRepository, admins: AdminPolicy) => new GetAccount(users, admins),
      inject: [USER_REPOSITORY, ADMIN_POLICY],
    },
    {
      provide: LogoutUser,
      useFactory: (sessions: SessionRepository, tokens: SecureTokenGenerator) => new LogoutUser(sessions, tokens),
      inject: [SESSION_REPOSITORY, TOKEN_GENERATOR],
    },
    {
      provide: AuthenticateApiToken,
      useFactory: (tokens: ApiTokenRepository, users: UserRepository, generator: SecureTokenGenerator, clock: Clock, admins: AdminPolicy) =>
        new AuthenticateApiToken(tokens, users, generator, clock, admins),
      inject: [API_TOKEN_REPOSITORY, USER_REPOSITORY, TOKEN_GENERATOR, CLOCK, ADMIN_POLICY],
    },
    {
      provide: CreateApiToken,
      useFactory: (tokens: ApiTokenRepository, generator: SecureTokenGenerator, clock: Clock) =>
        new CreateApiToken(tokens, generator, clock),
      inject: [API_TOKEN_REPOSITORY, TOKEN_GENERATOR, CLOCK],
    },
    { provide: ListApiTokens, useFactory: (tokens: ApiTokenRepository) => new ListApiTokens(tokens), inject: [API_TOKEN_REPOSITORY] },
    {
      provide: RevokeApiToken,
      useFactory: (tokens: ApiTokenRepository, clock: Clock) => new RevokeApiToken(tokens, clock),
      inject: [API_TOKEN_REPOSITORY, CLOCK],
    },
    { provide: ALLOWED_ORIGINS, useFactory: () => loadEnv().WEB_ORIGIN },
    // Order matters: the Origin check runs before authentication.
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AuthModule {}
