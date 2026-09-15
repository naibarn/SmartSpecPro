import {
  getOverview,
  requestAction,
  type PlatformActor,
  type PlatformAction,
} from "./platformOperations";

/**
 * Ordered coordinator for the final cutover boundary. Provider deployment and
 * data-promotion runners live outside the request process; this module only
 * records guarded intents and requires their durable gate evidence.
 */
export async function requestCutoverAction(input: PlatformActor & {
  environment: string;
  scope: string;
  action: PlatformAction;
  actionKey: string;
  expectedControlVersion: number;
  reason: string;
  targetIdentity?: string;
  releaseIdentity?: string;
  promotionId?: string;
  manifestVersion?: string;
}) {
  return requestAction(input);
}

export async function reconcileCutover(input: PlatformActor & {
  environment: string;
  scope: string;
  actionKey: string;
  expectedControlVersion: number;
  reason: string;
  targetIdentity?: string;
  releaseIdentity?: string;
  promotionId?: string;
  manifestVersion?: string;
}) {
  const overview = await getOverview({ environment: input.environment, scope: input.scope });
  if (!overview.control || overview.control.lifecycle !== "activating") {
    return { accepted: false, errorCode: "ACTIVATION_NOT_IN_PROGRESS", lifecycle: overview.control?.lifecycle ?? null };
  }
  return requestAction({ ...input, action: "reconcileActivation" });
}
