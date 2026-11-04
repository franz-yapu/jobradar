import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { loadEnv } from "../../config/env.js";
import { PrismaService } from "../../shared/infrastructure/prisma/prisma.service.js";
import { AuthenticateSession } from "../application/authenticate-session.use-case.js";
import { LoginUser } from "../application/login-user.use-case.js";
import { LogoutUser } from "../application/logout-user.use-case.js";
import { RegisterUser } from "../application/register-user.use-case.js";
import {
  ATTEMPT_LIMITER,
  PASSWORD_HASHER,
  SESSION_REPOSITORY,
  TOKEN_GENERATOR,
  USER_REPOSITORY,
  type AttemptLimiter,
  type Clock,
  type PasswordHasher,
  type SecureTokenGenerator,
  type SessionRepository,
  type UserRepository,
} from "../domain/ports.js";
import { AuthController } from "./auth.controller.js";
import { AuthGuard } from "./auth.guard.js";
import { CryptoTokenGenerator } from "./crypto-token-generator.js";
import { InMemoryAttemptLimiter } from "./in-memory-attempt-limiter.js";
import { ALLOWED_ORIGINS, OriginGuard } from "./origin.guard.js";
import { PrismaSessionRepository, PrismaUserRepository } from "./prisma-auth.repositories.js";
import { FAST_SCRYPT_FOR_TESTS, ScryptPasswordHasher } from "./scrypt-password-hasher.js";

const CLOCK = Symbol("CLOCK");
const systemClock: Clock = { now: () => new Date() };

@Module({
  controllers: [AuthController],
  providers: [
    { provide: CLOCK, useValue: systemClock },
    { provide: USER_REPOSITORY, useFactory: (prisma: PrismaService) => new PrismaUserRepository(prisma), inject: [PrismaService] },
    { provide: SESSION_REPOSITORY, useFactory: (prisma: PrismaService) => new PrismaSessionRepository(prisma), inject: [PrismaService] },
    // Cheap hashing only under Vitest (NODE_ENV=test), so the suite stays fast; every other run uses the strong setting.
    {
      provide: PASSWORD_HASHER,
      useFactory: () => new ScryptPasswordHasher(process.env["NODE_ENV"] === "test" ? FAST_SCRYPT_FOR_TESTS : undefined),
    },
    { provide: TOKEN_GENERATOR, useFactory: () => new CryptoTokenGenerator() },
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
      ) => new RegisterUser(users, sessions, hasher, tokens, limiter, clock, { signupAllowed: loadEnv().ALLOW_SIGNUP }),
      inject: [USER_REPOSITORY, SESSION_REPOSITORY, PASSWORD_HASHER, TOKEN_GENERATOR, ATTEMPT_LIMITER, CLOCK],
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
      ) => new LoginUser(users, sessions, hasher, tokens, limiter, clock),
      inject: [USER_REPOSITORY, SESSION_REPOSITORY, PASSWORD_HASHER, TOKEN_GENERATOR, ATTEMPT_LIMITER, CLOCK],
    },
    {
      provide: AuthenticateSession,
      useFactory: (users: UserRepository, sessions: SessionRepository, tokens: SecureTokenGenerator, clock: Clock) =>
        new AuthenticateSession(users, sessions, tokens, clock),
      inject: [USER_REPOSITORY, SESSION_REPOSITORY, TOKEN_GENERATOR, CLOCK],
    },
    {
      provide: LogoutUser,
      useFactory: (sessions: SessionRepository, tokens: SecureTokenGenerator) => new LogoutUser(sessions, tokens),
      inject: [SESSION_REPOSITORY, TOKEN_GENERATOR],
    },
    { provide: ALLOWED_ORIGINS, useFactory: () => loadEnv().WEB_ORIGIN },
    // Order matters: the Origin check runs before authentication.
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AuthModule {}
