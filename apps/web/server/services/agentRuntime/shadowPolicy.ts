import type { AgentRuntimeMode } from "../../../shared/agentRuntime/types";

export type ShadowEffectKind =
  | "tool"
  | "connector_write"
  | "media_submit"
  | "approval_decision"
  | "user_visible_message";

export interface EvaluateShadowSideEffectInput {
  mode: AgentRuntimeMode;
  effectKind: ShadowEffectKind;
  toolMutationClass?: "read_only" | "mutating";
  dryRunAvailable?: boolean;
  sandboxRouteConfigured?: boolean;
}

export interface ShadowSideEffectDecision {
  allowed: boolean;
  suppressed: boolean;
  reason: string | null;
  traceEventName: string | null;
}

export function evaluateShadowSideEffect(
  input: EvaluateShadowSideEffectInput,
): ShadowSideEffectDecision {
  if (input.mode !== "shadow") {
    return {
      allowed: true,
      suppressed: false,
      reason: null,
      traceEventName: null,
    };
  }

  if (input.effectKind === "tool") {
    if (input.toolMutationClass === "mutating" && !input.dryRunAvailable) {
      return {
        allowed: false,
        suppressed: true,
        reason: "mutating_tool_suppressed_in_shadow_mode",
        traceEventName: "shadow_tool_suppressed",
      };
    }
    return {
      allowed: true,
      suppressed: false,
      reason: null,
      traceEventName: null,
    };
  }

  if (input.effectKind === "connector_write") {
    return {
      allowed: false,
      suppressed: true,
      reason: "connector_write_suppressed_in_shadow_mode",
      traceEventName: "shadow_connector_write_suppressed",
    };
  }

  if (input.effectKind === "media_submit") {
    if (input.sandboxRouteConfigured) {
      return {
        allowed: true,
        suppressed: false,
        reason: null,
        traceEventName: null,
      };
    }
    return {
      allowed: false,
      suppressed: true,
      reason: "media_submit_suppressed_without_sandbox_route",
      traceEventName: "shadow_media_submit_suppressed",
    };
  }

  if (input.effectKind === "approval_decision") {
    return {
      allowed: false,
      suppressed: true,
      reason: "approval_decision_suppressed_in_shadow_mode",
      traceEventName: "shadow_approval_suppressed",
    };
  }

  return {
    allowed: false,
    suppressed: true,
    reason: "user_visible_message_suppressed_in_shadow_mode",
    traceEventName: "shadow_user_visible_message_suppressed",
  };
}
