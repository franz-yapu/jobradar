import { z } from "zod";
import { VERDICTS, VerdictSchema } from "./scoring.js";

export const REMOTE_SCOPES = ["worldwide", "latam", "country", "onsite", "unknown"] as const;
export const RemoteScopeSchema = z.enum(REMOTE_SCOPES);
export type RemoteScope = z.infer<typeof RemoteScopeSchema>;

const HttpUrlSchema = z.url({ protocol: /^https?$/ });

/** Identity of a posting pasted by hand without a URL: `manual:` + sha-256 hex of its text (made by the client). */
export const MANUAL_URL_PATTERN = /^manual:[0-9a-f]{64}$/;
export const ManualUrlSchema = z.string().regex(MANUAL_URL_PATTERN, "Expected manual:<64 hex characters>");

export const CreatePostingSchema = z.object({
  title: z.string().trim().min(1).max(300),
  company: z.string().trim().min(1).max(300),
  url: z.union([HttpUrlSchema, ManualUrlSchema]),
  source: z.string().trim().min(1).max(100),
  location: z.string().trim().min(1).max(300).optional(),
  remoteScope: RemoteScopeSchema.default("unknown"),
  description: z.string().default(""),
  publishedAt: z.iso.datetime({ offset: true }).optional(),
});
export type CreatePostingInput = z.input<typeof CreatePostingSchema>;
export type CreatePostingBody = z.output<typeof CreatePostingSchema>;

export const PostingSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  company: z.string(),
  url: z.string(),
  source: z.string(),
  location: z.string().nullable(),
  remoteScope: RemoteScopeSchema,
  description: z.string(),
  publishedAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type PostingResponse = z.infer<typeof PostingSchema>;

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));

/** `unscored` matches postings that have no score yet; the others match the LATEST score. */
export const VERDICT_FILTERS = [...VERDICTS, "unscored"] as const;

export const ListPostingsQuerySchema = z.object({
  source: optionalText,
  q: optionalText,
  verdict: z.enum(VERDICT_FILTERS).optional(),
  /** Only postings stored at or after this instant. */
  createdSince: z.iso.datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListPostingsQuery = z.output<typeof ListPostingsQuerySchema>;

/** Read-only view of the newest score of a posting. */
export const LatestScoreSchema = z.object({
  verdict: VerdictSchema,
  reasons: z.array(z.string()),
  blockers: z.array(z.object({ type: z.string(), evidence: z.string() })),
  scoredAt: z.iso.datetime({ offset: true }),
});
export type LatestScoreResponse = z.infer<typeof LatestScoreSchema>;

export const PostingListItemSchema = PostingSchema.extend({ latestScore: LatestScoreSchema.nullable() });
export type PostingListItemResponse = z.infer<typeof PostingListItemSchema>;

export const PaginatedPostingsSchema = z.object({
  items: z.array(PostingListItemSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
export type PaginatedPostingsResponse = z.infer<typeof PaginatedPostingsSchema>;
