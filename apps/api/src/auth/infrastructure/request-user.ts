import type { Request } from "express";
import type { AuthenticatedUser } from "../domain/user.js";

/** The Express request after the AuthGuard ran. */
export type AuthedRequest = Request & { user?: AuthenticatedUser };
