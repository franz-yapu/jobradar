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
] as const;
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];
