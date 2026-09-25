import type { AwsAccount, Breakdown } from '../../db/schema';

export type WeekCosts = Breakdown & { total: number; currency: string };

export interface CostProvider {
  /** Pulls spend for one ISO week (partial if the week is still in progress). */
  fetchWeek(account: AwsAccount, weekStart: string, now: Date): Promise<WeekCosts>;
  /** Throws a user-presentable error if the account can't be read. */
  verify(account: AwsAccount): Promise<void>;
}

export class AccountConnectionError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}
