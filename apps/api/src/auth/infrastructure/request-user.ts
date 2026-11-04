import type { Request } from "express";
import type { AuthenticatedUser } from "../domain/user.js";

/** How the request proved who it is. */
export type AuthMethod = "session" | "token";

/** The Express request after the AuthGuard ran. */
export type AuthedRequest = Request & { user?: AuthenticatedUser; authMethod?: AuthMethod };
