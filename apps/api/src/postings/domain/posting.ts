import { randomUUID } from "node:crypto";

export const REMOTE_SCOPES = ["worldwide", "latam", "country", "onsite", "unknown"] as const;
export type RemoteScope = (typeof REMOTE_SCOPES)[number];

export interface Posting {
  readonly id: string;
  readonly title: string;
  readonly company: string;
  /** Normalized URL, unique across postings. */
  readonly url: string;
  readonly source: string;
  readonly location: string | null;
  readonly remoteScope: RemoteScope;
  readonly description: string;
  readonly publishedAt: Date | null;
  readonly createdAt: Date;
}

export interface NewPosting {
  title: string;
  company: string;
  url: string;
  source: string;
  location?: string | undefined;
  remoteScope: RemoteScope;
  description: string;
  publishedAt?: Date | undefined;
}

export function createPosting(input: NewPosting, createdAt: Date): Posting {
  return {
    id: randomUUID(),
    title: input.title,
    company: input.company,
    url: input.url,
    source: input.source,
    location: input.location ?? null,
    remoteScope: input.remoteScope,
    description: input.description,
    publishedAt: input.publishedAt ?? null,
    createdAt,
  };
}
