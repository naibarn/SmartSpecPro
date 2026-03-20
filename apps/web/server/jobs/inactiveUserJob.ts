/**
 * Inactive User Check Background Job
 *
 * Checks for users registered via admin invite codes who haven't used
 * any credits within the configured inactivity window, and disables them.
 * Runs every 24 hours.
 */

import { checkAndDisableInactiveUsers } from "../services/inactiveUserService";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
let intervalId: NodeJS.Timeout | null = null;
let startupTimeoutId: NodeJS.Timeout | null = null;

export async function initializeInactiveUserJob(): Promise<void> {
  // Clean up any previous instance (e.g., hot-reload)
  shutdownInactiveUserJob();

  // Run once at startup (delayed 2 minutes to let DB connections settle)
  startupTimeoutId = setTimeout(async () => {
    try {
      const result = await checkAndDisableInactiveUsers();
      if (result.disabled > 0) {
        console.log(
          `[InactiveUserJob] Initial check: disabled ${result.disabled}/${result.checked} users`,
        );
      }
    } catch (err) {
      console.error("[InactiveUserJob] Initial check failed:", err);
    }
  }, 120_000);

  // Schedule recurring check every 24 hours
  intervalId = setInterval(async () => {
    try {
      const result = await checkAndDisableInactiveUsers();
      if (result.disabled > 0) {
        console.log(
          `[InactiveUserJob] Disabled ${result.disabled}/${result.checked} inactive users`,
        );
      }
    } catch (err) {
      console.error("[InactiveUserJob] Check failed:", err);
    }
  }, TWENTY_FOUR_HOURS_MS);

  console.log("[InactiveUserJob] Job initialized (every 24 hours)");
}

export function shutdownInactiveUserJob(): void {
  if (startupTimeoutId) {
    clearTimeout(startupTimeoutId);
    startupTimeoutId = null;
  }
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
