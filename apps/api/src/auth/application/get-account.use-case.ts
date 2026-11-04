import { NO_ADMINS, type AdminPolicy } from "../domain/admin-policy.js";
import { toAccount, UnauthenticatedError, type Account } from "../domain/user.js";
import type { UserRepository } from "../domain/ports.js";

/** The logged-in user's own account data, for the account screen. */
export class GetAccount {
  constructor(
    private readonly users: UserRepository,
    private readonly admins: AdminPolicy = NO_ADMINS,
  ) {}

  async execute(userId: string): Promise<Account> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthenticatedError();
    return toAccount(user, this.admins);
  }
}
