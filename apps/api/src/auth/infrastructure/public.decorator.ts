import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC = "auth:isPublic";

/** Marks an endpoint that works without a session (everything else is protected by default). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);
