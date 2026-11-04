import {
  ApiTokenSchema,
  CreatedApiTokenSchema,
  CvDraftSchema,
  PaginatedPostingsSchema,
  PostingScoreSchema,
  PostingSchema,
  ProfileSchema,
  ProvidersSchema,
  UserSchema,
} from "@jobradar/shared";
import type {
  ApiTokenResponse,
  CreatePostingInput,
  CreatedApiTokenResponse,
  CvDraft,
  ListPostingsQuery,
  PaginatedPostingsResponse,
  PostingResponse,
  PostingScoreResponse,
  ProfileResponse,
  ProvidersResponse,
  SaveProfileInput,
  UserResponse,
} from "@jobradar/shared";
import { z } from "zod";
import type { ZodType } from "zod";

/**
 * The only module of the web app that talks to the API. Every response is validated with the shared Zod
 * schemas. The session lives in an httpOnly cookie the browser sends by itself (`credentials: "include"`),
 * so no token ever passes through this code; a 401 on a protected call tells the app the session ended.
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

  register(email: string, password: string): Promise<UserResponse>;
  login(email: string, password: string): Promise<UserResponse>;
  logout(): Promise<void>;
  /** `null` when nobody is logged in (401). */
  me(): Promise<UserResponse | null>;
  listApiTokens(): Promise<ApiTokenResponse[]>;
  /** The secret is in the answer once; it cannot be read again. */
  createApiToken(name: string): Promise<CreatedApiTokenResponse>;
  revokeApiToken(id: string): Promise<void>;

  /** Which sign-in methods the server offers. */
  providers(): Promise<ProvidersResponse>;
  /** Disconnects Google; the server refuses (`password_required`) when it is the only way in. */
  disconnectGoogle(): Promise<void>;
  /** For an account created with Google: its first password. */
  setPassword(password: string): Promise<void>;
  /** Pages the browser navigates to (not fetch calls): the Google round trip starts on the server. */
  googleSignInUrl(returnTo?: string): string;
  googleLinkUrl(returnTo?: string): string;
}

interface ClientOptions {
  baseUrl: string;
  fetchFn?: typeof fetch;
  /** Called when a protected endpoint answers 401: the session is gone. */
  onUnauthorized?: () => void;
}

/** Endpoints where a 401 is an expected answer ("wrong password", "nobody logged in"), not a lost session. */
const EXPECTS_401 = new Set(["/auth/login", "/auth/register", "/auth/me", "/auth/logout"]);

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

export function createApiClient({ baseUrl, fetchFn, onUnauthorized }: ClientOptions): ApiClient {
  const base = baseUrl.replace(/\/+$/, "");

  async function request<T>(path: string, schema: ZodType<T>, init?: RequestInit): Promise<T> {
    const doFetch = fetchFn ?? fetch;
    let response: Response;
    try {
      response = await doFetch(`${base}${path}`, {
        credentials: "include",
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
      if (response.status === 401 && !EXPECTS_401.has(path)) onUnauthorized?.();
      throw new ApiError(response.status, code, message);
    }
    // 204 No Content has no body to parse (logout, revoke).
    const parsed = schema.safeParse(response.status === 204 ? undefined : await response.json());
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
    register: (email, password) => request("/auth/register", UserSchema, { method: "POST", body: JSON.stringify({ email, password }) }),
    login: (email, password) => request("/auth/login", UserSchema, { method: "POST", body: JSON.stringify({ email, password }) }),
    logout: () => request("/auth/logout", z.undefined(), { method: "POST" }),
    me: async () => {
      try {
        return await request("/auth/me", UserSchema);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    listApiTokens: () => request("/auth/tokens", z.array(ApiTokenSchema)),
    createApiToken: (name) => request("/auth/tokens", CreatedApiTokenSchema, { method: "POST", body: JSON.stringify({ name }) }),
    revokeApiToken: (id) => request(`/auth/tokens/${encodeURIComponent(id)}`, z.undefined(), { method: "DELETE" }),
    providers: () => request("/auth/providers", ProvidersSchema),
    disconnectGoogle: () => request("/auth/google", z.undefined(), { method: "DELETE" }),
    setPassword: (password) => request("/auth/password", z.undefined(), { method: "PUT", body: JSON.stringify({ password }) }),
    googleSignInUrl: (returnTo) => `${base}/auth/google/start${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`,
    googleLinkUrl: (returnTo) => `${base}/auth/google/link${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`,
  };
}

/** Set by the app shell: what to do when the session ends in the middle of using the app. */
let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export const api: ApiClient = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE ?? "/api",
  onUnauthorized: () => unauthorizedHandler?.(),
});
