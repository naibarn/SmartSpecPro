import type {
  CapabilityCatalogEntry,
  SkillStudioAction,
  WorkIntakeActorContext,
  WorkOrchestratorSurface,
} from "../../shared/workOrchestrator";
import {
  skillStudioActionValues,
  workOrchestratorSurfaceValues,
} from "../../shared/workOrchestrator";
import type { WorkOrchestratorFeatureFlags } from "./workOrchestratorFeatureFlags";
import { evaluateSurfaceGovernance } from "./workOrchestratorSecurityPolicy";

export interface BuildCapabilityCatalogInput {
  actorContext: WorkIntakeActorContext;
  flags?: Partial<WorkOrchestratorFeatureFlags> | null;
  selectedSurfaces?: readonly string[] | null;
}

function buildEntryTitle(
  surface: WorkOrchestratorSurface,
  action?: SkillStudioAction | null,
): string {
  if (surface === "skill_studio" && action) {
    return `Skill Studio: ${action.replace(/_/g, " ")}`;
  }
  return surface
    .split("_")
    .map(part => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function buildEntryId(
  surface: WorkOrchestratorSurface,
  action?: SkillStudioAction | null,
): string {
  return action ? `${surface}:${action}` : surface;
}

function buildEntriesForSurface(
  surface: WorkOrchestratorSurface,
  input: BuildCapabilityCatalogInput,
): CapabilityCatalogEntry[] {
  const selectedSurfaces = new Set((input.selectedSurfaces ?? []).map(value => value.trim()));

  if (surface === "skill_studio") {
    return skillStudioActionValues.map(action =>
      buildCatalogEntry(surface, action, input, selectedSurfaces.has(surface)),
    );
  }

  return [
    buildCatalogEntry(surface, null, input, selectedSurfaces.has(surface)),
  ];
}

function buildCatalogEntry(
  surface: WorkOrchestratorSurface,
  action: SkillStudioAction | null,
  input: BuildCapabilityCatalogInput,
  selected: boolean,
): CapabilityCatalogEntry {
  const decision = evaluateSurfaceGovernance({
    surface,
    action,
    actorContext: input.actorContext,
    flags: input.flags,
  });

  return {
    id: buildEntryId(surface, action),
    surface,
    action,
    title: buildEntryTitle(surface, action),
    description: selected
      ? "Selected by the current policy snapshot."
      : "Available as a planner-visible alternative.",
    governance: decision.governance,
    contractCompatibility: {
      state: decision.contractCompatibilityState,
      reasonCode: decision.blockedReason,
      migrationRequired: decision.contractCompatibilityState !== "compatible",
    },
    blockedReason:
      decision.blockedReason ??
      (selected ? null : "surface_not_selected_by_policy"),
    metadata: {
      selectedByPolicy: selected,
      authorityDecision: decision.authorityDecision,
      reasonCodes: decision.reasonCodes,
    },
  };
}

export function buildCapabilityCatalog(
  input: BuildCapabilityCatalogInput,
): CapabilityCatalogEntry[] {
  return workOrchestratorSurfaceValues.flatMap(surface =>
    buildEntriesForSurface(surface, input),
  );
}
