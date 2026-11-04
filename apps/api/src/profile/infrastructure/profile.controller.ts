import { Body, Controller, Get, HttpCode, Inject, NotFoundException, Put } from "@nestjs/common";
import { ApiBadRequestResponse, ApiBody, ApiNotFoundResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import {
  ProfileSchema,
  SaveProfileSchema,
  type ProfileResponse,
  type SaveProfileBody,
} from "@jobradar/shared";
import type { AuthenticatedUser } from "../../auth/domain/user.js";
import { CurrentUser } from "../../auth/infrastructure/current-user.decorator.js";
import { toSwaggerSchema } from "../../shared/infrastructure/swagger-schema.js";
import { ZodValidationPipe } from "../../shared/infrastructure/zod-validation.pipe.js";
import { GetProfile } from "../application/get-profile.use-case.js";
import { SaveProfile } from "../application/save-profile.use-case.js";
import { ProfileNotFoundError } from "../domain/profile.repository.js";
import { toProfileResponse } from "./profile.presenter.js";

@ApiTags("profile")
@Controller("profile")
export class ProfileController {
  constructor(
    @Inject(GetProfile) private readonly getProfile: GetProfile,
    @Inject(SaveProfile) private readonly saveProfile: SaveProfile,
  ) {}

  @Get()
  @ApiOkResponse({ schema: toSwaggerSchema(ProfileSchema) })
  @ApiNotFoundResponse({ description: "The profile has not been configured yet" })
  async get(@CurrentUser() user: AuthenticatedUser): Promise<ProfileResponse> {
    try {
      return toProfileResponse(await this.getProfile.execute(user.id));
    } catch (error) {
      if (error instanceof ProfileNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Put()
  @HttpCode(200)
  @ApiBody({ schema: toSwaggerSchema(SaveProfileSchema, "input") })
  @ApiOkResponse({ schema: toSwaggerSchema(ProfileSchema), description: "Created or replaced; version increments" })
  @ApiBadRequestResponse({ description: "Invalid body" })
  async put(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(SaveProfileSchema)) body: SaveProfileBody,
  ): Promise<ProfileResponse> {
    return toProfileResponse(await this.saveProfile.execute(user.id, body));
  }
}
