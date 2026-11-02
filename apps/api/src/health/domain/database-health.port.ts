export const DATABASE_HEALTH = Symbol("DATABASE_HEALTH");

export interface DatabaseHealth {
  /** Resolves true when the database answers, false otherwise. Never throws. */
  isUp(): Promise<boolean>;
}
