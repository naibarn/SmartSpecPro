import { useEffect, useRef, useState } from "react";
import {
  buildTenantServiceRecoveryUrl,
  consumeTenantServiceRecoveryAttempt,
  TENANT_SERVICE_RECOVERY_DELAY_MS,
} from "@/lib/tenantServiceRecovery";

/**
 * Schedules one bounded same-route cache-busting navigation after a tenant
 * bootstrap request has exhausted its transient retry budget.
 */
export function useTenantServiceRecovery(isTransientError: boolean): boolean {
  const scheduledForCurrentError = useRef(false);
  const [isScheduled, setIsScheduled] = useState(false);

  useEffect(() => {
    if (!isTransientError) {
      scheduledForCurrentError.current = false;
      setIsScheduled(false);
      return;
    }

    if (scheduledForCurrentError.current) return;
    scheduledForCurrentError.current = true;

    if (!consumeTenantServiceRecoveryAttempt()) {
      setIsScheduled(false);
      return;
    }

    setIsScheduled(true);
    const timer = window.setTimeout(() => {
      window.location.replace(
        buildTenantServiceRecoveryUrl(window.location.href)
      );
    }, TENANT_SERVICE_RECOVERY_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [isTransientError]);

  return isScheduled;
}
