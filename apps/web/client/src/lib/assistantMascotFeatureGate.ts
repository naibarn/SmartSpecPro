/**
 * The visual enhancement is opt-in at both deployment and tenant scope.
 * Missing deployment configuration is a global deny; callers must also
 * require the tenant flag query to resolve without error.
 */
export const ASSISTANT_MASCOT_GLOBAL_ALLOW =
  import.meta.env.VITE_ASSISTANT_MASCOT_GLOBAL_ALLOW === "true";

export interface AssistantMascotGateState {
  globalAllowed: boolean;
  tenantEnabled: boolean | undefined;
  tenantResolved: boolean;
  tenantError: boolean;
}

export function isAssistantMascotEnabled({
  globalAllowed,
  tenantEnabled,
  tenantResolved,
  tenantError,
}: AssistantMascotGateState): boolean {
  return globalAllowed === true &&
    tenantResolved === true &&
    tenantError === false &&
    tenantEnabled === true;
}
