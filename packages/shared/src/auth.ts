import { z } from "zod";

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

/** Emails are compared lowercase and trimmed everywhere. */
const EmailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const RegisterSchema = z.object({
  email: EmailSchema,
  password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
});
export type RegisterInput = z.input<typeof RegisterSchema>;
export type RegisterBody = z.output<typeof RegisterSchema>;

/** Login does not apply the length policy: it must answer "invalid credentials", not leak the rule. */
export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
});
export type LoginInput = z.input<typeof LoginSchema>;
export type LoginBody = z.output<typeof LoginSchema>;

export const UserSchema = z.object({
  id: z.uuid(),
  email: z.string(),
});
export type UserResponse = z.infer<typeof UserSchema>;

/** Machine codes of the `error` field in auth failures. */
export const AUTH_ERROR_CODES = [
  "unauthenticated",
  "invalid_credentials",
  "too_many_attempts",
  "email_taken",
  "weak_password",
  "signup_disabled",
  "bad_origin",
  "session_required",
  "too_many_tokens",
] as const;
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export const MAX_API_TOKEN_NAME_LENGTH = 60;

export const CreateApiTokenSchema = z.object({
  name: z.string().trim().min(1).max(MAX_API_TOKEN_NAME_LENGTH),
});
export type CreateApiTokenBody = z.output<typeof CreateApiTokenSchema>;

/** What a token looks like in a list: never the secret, only enough to recognise it. */
export const ApiTokenSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  prefix: z.string(),
  createdAt: z.iso.datetime({ offset: true }),
  lastUsedAt: z.iso.datetime({ offset: true }).nullable(),
  revokedAt: z.iso.datetime({ offset: true }).nullable(),
});
export type ApiTokenResponse = z.infer<typeof ApiTokenSchema>;

/** Returned once, when the token is created: the only time the secret is shown. */
export const CreatedApiTokenSchema = ApiTokenSchema.extend({ token: z.string() });
export type CreatedApiTokenResponse = z.infer<typeof CreatedApiTokenSchema>;
