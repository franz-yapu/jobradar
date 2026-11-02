import { z } from "zod";

export const REMOTE_SCOPES = ["worldwide", "latam", "country", "onsite", "unknown"] as const;
export const RemoteScopeSchema = z.enum(REMOTE_SCOPES);
export type RemoteScope = z.infer<typeof RemoteScopeSchema>;

const HttpUrlSchema = z.url({ protocol: /^https?$/ });

export const CreatePostingSchema = z.object({
  title: z.string().trim().min(1).max(300),
  company: z.string().trim().min(1).max(300),
  url: HttpUrlSchema,
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

export const ListPostingsQuerySchema = z.object({
  source: optionalText,
  q: optionalText,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListPostingsQuery = z.output<typeof ListPostingsQuerySchema>;

export const PaginatedPostingsSchema = z.object({
  items: z.array(PostingSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
export type PaginatedPostingsResponse = z.infer<typeof PaginatedPostingsSchema>;
