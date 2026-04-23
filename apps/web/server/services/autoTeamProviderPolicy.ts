import crypto from "crypto";
import type { AutoTeamRouteClass } from "../../shared/autoTeamExecution";
import { MEDIA_MODELS } from "./mediaGenerationService";
import { normalizeMediaProviderName } from "./mediaProviderUtils";

export interface AutoTeamProviderDecision {
  requestedProvider: string | null;
  requestedModel: string | null;
  selectedProvider: string | null;
  selectedModel: string | null;
  selectedReason: string | null;
  substituted: boolean;
  blockedReason: string | null;
}

export interface AutoTeamProviderPolicyInput {
  tenantId: string;
  runId: string;
  stageId?: string | null;
  routeClass: AutoTeamRouteClass;
  objective?: string | null;
  requestedProvider?: string | null;
  requestedModel?: string | null;
  creditsAvailable?: number | null;
  teamLanguage?: "en" | "th" | null;
}

const ROUTE_DEFAULTS: Record<
  AutoTeamRouteClass,
  { provider: string | null; model: string | null; selectedReason: string }
> = {
  "media.video": {
    provider: "kie.ai",
    model: "veo-3-1",
    selectedReason: "explicit_or_default",
  },
  "media.image": {
    provider: "kie.ai",
    model: "google-nano-banana-pro",
    selectedReason: "explicit_or_default",
  },
  "agency.swarm": {
    provider: "agency",
    model: "agency-swarm",
    selectedReason: "explicit_or_default",
  },
  "workflow.automation": {
    provider: "tool",
    model: "workflow-automation",
    selectedReason: "explicit_or_default",
  },
  "research.synthesis": {
    provider: null,
    model: null,
    selectedReason: "llm_router_auto_selection",
  },
  "document.writing": {
    provider: null,
    model: null,
    selectedReason: "llm_router_auto_selection",
  },
  "unknown.blocked": {
    provider: "blocked",
    model: "blocked",
    selectedReason: "blocked_route",
  },
};

function normalizeModelHint(value?: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (/veo\s*3(?:\.\s*1|\.1)?/i.test(normalized)) return "veo-3-1";
  if (/gpt\s*image/i.test(normalized)) return "gpt-image-1.5-all";
  if (/nano\s*banana/i.test(normalized)) return "google-nano-banana-pro";
  if (/seedream/i.test(normalized)) return "seedream-4-5-251128";
  if (/kling/i.test(normalized)) return "kling-2.6";
  if (/sora/i.test(normalized)) return "sora-2";
  return normalized.replace(/\s+/g, "-").replace(/[_.]/g, "-");
}

function inferProviderFromModel(model: string | null): string | null {
  if (!model) return null;
  const entry = MEDIA_MODELS[model];
  if (entry?.provider) {
    return normalizeMediaProviderName(entry.provider);
  }
  if (model.startsWith("veo")) return "kie.ai";
  if (model.startsWith("gpt-image") || model.startsWith("google-nano") || model.startsWith("seedream")) {
    return "kie.ai";
  }
  if (model.startsWith("kling") || model.startsWith("sora")) return "kie.ai";
  return null;
}

export function resolveAutoTeamProviderDecision(
  input: AutoTeamProviderPolicyInput,
): AutoTeamProviderDecision {
  if (input.routeClass === "unknown.blocked") {
    return {
      requestedProvider: input.requestedProvider ?? null,
      requestedModel: input.requestedModel ?? null,
      selectedProvider: null,
      selectedModel: null,
      selectedReason: "blocked_route",
      substituted: false,
      blockedReason: "route_classification_failed",
    };
  }

  const defaultConfig = ROUTE_DEFAULTS[input.routeClass];
  const requestedModel = normalizeModelHint(input.requestedModel);
  const requestedProvider = input.requestedProvider
    ? normalizeMediaProviderName(input.requestedProvider)
    : inferProviderFromModel(requestedModel);

  const selectedModel = requestedModel ?? defaultConfig.model;
  const selectedProvider =
    requestedProvider ?? inferProviderFromModel(selectedModel) ?? defaultConfig.provider;

  const substituted = Boolean(
    (requestedModel && requestedModel !== selectedModel) ||
      (requestedProvider && requestedProvider !== selectedProvider),
  );

  return {
    requestedProvider: input.requestedProvider ?? null,
    requestedModel: input.requestedModel ?? null,
    selectedProvider,
    selectedModel,
    selectedReason: substituted
      ? "provider_substitution_recorded"
      : defaultConfig.selectedReason,
    substituted,
    blockedReason: null,
  };
}

export function buildAutoTeamProviderRequestHash(input: {
  tenantId: string;
  runId: string;
  stageId?: string | null;
  routeClass: AutoTeamRouteClass;
  provider: string;
  model: string;
  prompt: string;
  attempt?: number;
}): string {
  return crypto
    .createHash("sha256")
    .update(
      [
        input.tenantId,
        input.runId,
        input.stageId ?? "",
        input.routeClass,
        input.provider,
        input.model,
        input.prompt,
        String(input.attempt ?? 1),
      ].join("|"),
    )
    .digest("hex");
}
