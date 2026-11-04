import { HttpException } from "@nestjs/common";

/** Error body: { statusCode, error: <machine code>, message }, like the scoring endpoints. */
export function coded(status: number, code: string, message: string): HttpException {
  return new HttpException({ statusCode: status, error: code, message }, status);
}
