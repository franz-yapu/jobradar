import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC = "auth:isPublic";

/** Marks an endpoint that works without a session (everything else is protected by default). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);

export const SESSION_ONLY = "auth:sessionOnly";

/**
 * The endpoint accepts the browser session only, never an API token: a leaked n8n token must not be able to
 * create or revoke tokens (it could otherwise outlive its own revocation).
 */
export const SessionOnly = (): MethodDecorator & ClassDecorator => SetMetadata(SESSION_ONLY, true);
