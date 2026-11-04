import {
  CvDraftSchema,
  PaginatedPostingsSchema,
  PostingScoreSchema,
  PostingSchema,
  ProfileSchema,
} from "@jobradar/shared";
import type {
  CreatePostingInput,
  CvDraft,
  ListPostingsQuery,
  PaginatedPostingsResponse,
  PostingResponse,
  PostingScoreResponse,
  ProfileResponse,
  SaveProfileInput,
} from "@jobradar/shared";
import type { ZodType } from "zod";

/**
 * The only module of the web app that talks to the API. Every response is validated with the shared Zod
 * schemas. When accounts arrive (SDD-006) the auth token is added here and nowhere else.
 */

/** Error from the API: `status` is the HTTP status, `code` the machine code (or HTTP error name) of the body. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** The response did not match the shared schema (API and UI out of sync). */
export class ContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractError";
  }
}

export type ListPostingsParams = Partial<Pick<ListPostingsQuery, "source" | "q" | "verdict" | "createdSince" | "page" | "pageSize">>;

export interface ApiClient {
  listPostings(params?: ListPostingsParams): Promise<PaginatedPostingsResponse>;
  createPosting(body: CreatePostingInput): Promise<PostingResponse>;
  scorePosting(postingId: string): Promise<PostingScoreResponse>;
  /** `null` when the profile has not been configured yet (404). */
  getProfile(): Promise<ProfileResponse | null>;
  saveProfile(body: SaveProfileInput): Promise<ProfileResponse>;
  /** Reads a CV (PDF) and returns a profile draft to review; nothing is stored by the API. */
  importCv(file: File): Promise<CvDraft>;
}

interface ClientOptions {
  baseUrl: string;
  fetchFn?: typeof fetch;
}

async function readErrorBody(response: Response): Promise<{ code: string; message: string }> {
  const fallback = { code: response.statusText || "error", message: `HTTP ${response.status}` };
  try {
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null) return fallback;
    const { error, message } = body as { error?: unknown; message?: unknown };
    return {
      code: typeof error === "string" ? error : fallback.code,
      message: Array.isArray(message) ? message.join("; ") : typeof message === "string" ? message : fallback.message,
    };
  } catch {
    return fallback;
  }
}

export function createApiClient({ baseUrl, fetchFn }: ClientOptions): ApiClient {
  const base = baseUrl.replace(/\/+$/, "");

  async function request<T>(path: string, schema: ZodType<T>, init?: RequestInit): Promise<T> {
    const doFetch = fetchFn ?? fetch;
    let response: Response;
    try {
      response = await doFetch(`${base}${path}`, {
        ...init,
        // JSON bodies get their content type; a FormData body must not (the browser adds the multipart boundary).
        headers: {
          Accept: "application/json",
          ...(typeof init?.body === "string" ? { "Content-Type": "application/json" } : {}),
          ...init?.headers,
        },
      });
    } catch {
      throw new ApiError(0, "network_error", "The API is unreachable");
    }
    if (!response.ok) {
      const { code, message } = await readErrorBody(response);
      throw new ApiError(response.status, code, message);
    }
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) throw new ContractError(`Unexpected response from ${path}: ${parsed.error.message}`);
    return parsed.data;
  }

  function queryString(params: ListPostingsParams): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") search.set(key, String(value));
    }
    const text = search.toString();
    return text ? `?${text}` : "";
  }

  return {
    listPostings: (params = {}) => request(`/postings${queryString(params)}`, PaginatedPostingsSchema),
    createPosting: (body) => request("/postings", PostingSchema, { method: "POST", body: JSON.stringify(body) }),
    scorePosting: (postingId) =>
      request(`/postings/${encodeURIComponent(postingId)}/score`, PostingScoreSchema, { method: "POST" }),
    getProfile: async () => {
      try {
        return await request("/profile", ProfileSchema);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    saveProfile: (body) => request("/profile", ProfileSchema, { method: "PUT", body: JSON.stringify(body) }),
    importCv: (file) => {
      const form = new FormData();
      form.append("file", file);
      return request("/profile/import-cv", CvDraftSchema, { method: "POST", body: form });
    },
  };
}

export const api: ApiClient = createApiClient({ baseUrl: import.meta.env.VITE_API_BASE ?? "/api" });
