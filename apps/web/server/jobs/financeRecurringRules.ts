import { runDueRecurringRules } from "../services/financeService";

export async function executeFinanceRecurringRulesJob(now = new Date()): Promise<{
  scannedCount: number;
  draftsCreated: number;
  transactionsCreated: number;
  errors: number;
}> {
  return await runDueRecurringRules(now);
}

export async function initializeFinanceRecurringRulesJob(): Promise<void> {
  // Section 03 keeps the recurring runner callable but does not schedule
  // a timer yet; section 06 can wire the production cron/worker entrypoint.
}

export async function shutdownFinanceRecurringRulesJob(): Promise<void> {
  // No-op for now.
}

