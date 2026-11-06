import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  /** Optional: the API boots without it and AI endpoints answer 503. */
  ANTHROPIC_API_KEY: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
  /** Optional, only used when AI_PROVIDER=groq (cheap trials). */
  GROQ_API_KEY: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
  AI_PROVIDER: z.enum(["anthropic", "groq"]).default("anthropic"),
  /** Defaults to the provider's recommended model. */
  AI_MODEL: z.string().trim().optional(),
  AI_DAILY_BUDGET_USD: z.coerce.number().min(0).default(1),
  /** Open registration. Set to false to close it once the intended accounts exist. */
  ALLOW_SIGNUP: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  /**
   * Sign in with Google (ADR-0003). All three or none: without them the feature is off and the button is hidden.
   * The redirect URI is the API's callback, registered in Google Cloud Console.
   */
  GOOGLE_CLIENT_ID: z.string().trim().optional(),
  GOOGLE_CLIENT_SECRET: z.string().trim().optional(),
  GOOGLE_REDIRECT_URI: z.url().optional().or(z.literal("")),
  /** Emails of the administrators who feed the shared job catalog (ADR-0004). Their email must also be verified (Google). */
  ADMIN_EMAILS: z
    .string()
    .trim()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  /**
   * Batch scoring queue (SDD-010). Empty = jobs run inside the API process. With a queue URL the jobs go through SQS
   * and a worker calls back the API, so WORKER_SECRET (the shared HMAC key, 32+ chars) becomes mandatory.
   * AWS_ENDPOINT_URL points the SDK at LocalStack in tests.
   */
  SQS_QUEUE_URL: optionalText,
  AWS_REGION: z.string().trim().default("us-east-1"),
  AWS_ENDPOINT_URL: optionalText,
  WORKER_SECRET: optionalText.pipe(z.string().min(32, "WORKER_SECRET needs at least 32 characters").optional()),
  /** Origins allowed to call the API from a browser (comma separated). The dashboard's dev server by default. */
  WEB_ORIGIN: z
    .string()
    .trim()
    .default("http://localhost:5173")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
}).refine((env) => env.SQS_QUEUE_URL === undefined || env.WORKER_SECRET !== undefined, {
  message: "SQS_QUEUE_URL needs WORKER_SECRET",
  path: ["WORKER_SECRET"],
});

const DEFAULT_MODELS = { anthropic: "claude-sonnet-5-5", groq: "openai/gpt-oss-20b" } as const;

export interface GoogleSettings {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface SqsSettings {
  queueUrl: string;
  region: string;
  /** Only set for LocalStack. */
  endpoint: string | undefined;
}

export type Env = Omit<
  z.infer<typeof EnvSchema>,
  "AI_MODEL" | "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET" | "GOOGLE_REDIRECT_URI" | "SQS_QUEUE_URL" | "AWS_REGION" | "AWS_ENDPOINT_URL"
> & {
  AI_MODEL: string;
  /** Null unless SQS_QUEUE_URL is set: batch scoring then runs in-process. */
  SQS: SqsSettings | null;
  /** Null unless the client id, the secret and the redirect URI are all set. */
  GOOGLE: GoogleSettings | null;
};

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, SQS_QUEUE_URL, AWS_REGION, AWS_ENDPOINT_URL, ...env } =
    EnvSchema.parse(source);
  const sqs = SQS_QUEUE_URL ? { queueUrl: SQS_QUEUE_URL, region: AWS_REGION, endpoint: AWS_ENDPOINT_URL } : null;
  const google =
    GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REDIRECT_URI
      ? { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET, redirectUri: GOOGLE_REDIRECT_URI }
      : null;
  return { ...env, AI_MODEL: env.AI_MODEL || DEFAULT_MODELS[env.AI_PROVIDER], GOOGLE: google, SQS: sqs };
}
