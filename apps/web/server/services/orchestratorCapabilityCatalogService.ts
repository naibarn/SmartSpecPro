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
import { getAvailableSkillsAsync } from "./skillRegistry";
import type { SkillDefinition } from "@smartspec/skills";
import { getDb } from "../db";
import {
  agencies,
  libraryContextPacks,
  mediaModels,
  workflowTemplates,
} from "../../drizzle/schema";
import { and, eq, or } from "drizzle-orm";

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

function describeSurface(surface: WorkOrchestratorSurface): string {
  switch (surface) {
    case "skill":
      return "Run a registered skill or native OpenAI Agents/Python skill bundle.";
    case "agency":
      return "Delegate complex multi-agent work to the agency swarm runtime.";
    case "document_management":
      return "Create, update, search, and cite document/RAG/vector-backed workspace artifacts.";
    case "media_studio":
      return "Generate or transform image/media assets through Media Studio providers.";
    case "video_editor":
      return "Generate video clips, assemble timelines, concatenate clips, and render final videos.";
    case "browser":
      return "Run browser automation in a governed sandbox.";
    case "workflow":
      return "Execute a preconfigured workflow graph or automation workflow.";
    case "skill_studio":
      return "Create or modify skills under Skill Studio governance.";
    case "work_os":
      return "Mirror status, evidence, and handoff records into Work OS.";
    case "manual":
    default:
      return "Pause for manual human action or inspection.";
  }
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
      : describeSurface(surface),
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

function classifySkillSurface(skill: SkillDefinition): WorkOrchestratorSurface {
  const mode = String(skill.executionMode ?? "").toLowerCase();
  const type = String(skill.type ?? "").toLowerCase();
  const category = String(skill.category ?? "").toLowerCase();
  const text = `${skill.id} ${skill.name} ${skill.description} ${type} ${category} ${(skill.tags ?? []).join(" ")}`.toLowerCase();

  if (type.includes("video") || /video|วีดีโอ|วิดีโอ|veo|clip|storyboard/.test(text)) {
    return "video_editor";
  }
  if (mode.includes("media") || type.includes("image") || /image|ภาพ|รูป|media studio/.test(text)) {
    return "media_studio";
  }
  if (skill.nativeBundleReady || mode === "python" || mode.startsWith("sandbox-")) {
    return "skill";
  }
  return "skill";
}

function skillIsPlannerVisible(skill: SkillDefinition): boolean {
  if (skill.internalOnly) return false;
  if (skill.enabledByDefault === false) return false;
  if (skill.teamRunEligible) return true;
  if (skill.surfaceScopes?.some(scope => scope === "team_run" || scope === "team_room")) {
    return true;
  }
  if (skill.interactionModes?.some(mode => mode === "agent_to_agent" || mode === "work_item")) {
    return true;
  }
  return Boolean(skill.chainTo || skill.nativeBundleReady || skill.executionMode);
}

function summarizeSkillForPlanner(skill: SkillDefinition): string {
  const parts = [
    skill.description,
    skill.executionMode ? `Execution mode: ${skill.executionMode}.` : null,
    skill.chainTo ? `Chains to: ${skill.chainTo}.` : null,
    skill.nativeBundleReady ? "Native OpenAI Agents/Python bundle ready." : null,
  ].filter((value): value is string => Boolean(value?.trim()));
  return parts.join(" ").slice(0, 600);
}

function inferSkillRiskTags(
  skill: SkillDefinition,
  surface: WorkOrchestratorSurface,
): string[] {
  const text = `${skill.id} ${skill.name} ${skill.description} ${skill.type ?? ""} ${skill.category ?? ""} ${(skill.tags ?? []).join(" ")}`.toLowerCase();
  const tags = new Set<string>();
  if (surface === "media_studio" || surface === "video_editor") {
    tags.add("external_media_provider");
    tags.add("billable_provider_job");
  }
  if (skill.nativeBundleReady || String(skill.executionMode ?? "").toLowerCase().includes("python")) {
    tags.add("sandboxed_code_execution");
  }
  if (/browser|web|scrape|crawl/.test(text)) tags.add("network_read");
  if (/write|publish|post|send|upload|delete|apply/.test(text)) tags.add("write_side_effect");
  if (/private|credential|token|secret/.test(text)) tags.add("sensitive_context");
  return Array.from(tags);
}

function buildToolContractSummary(
  skill: SkillDefinition,
  surface: WorkOrchestratorSurface,
): Record<string, unknown> {
  return {
    surface,
    skillId: skill.id,
    executionMode: skill.executionMode ?? null,
    inputSchemaAvailable: Boolean((skill as { inputSchema?: unknown }).inputSchema),
    outputSchemaAvailable: Boolean((skill as { outputSchema?: unknown }).outputSchema),
    chainTargetSkillId: skill.chainTo ?? null,
    nativeBundleReady: skill.nativeBundleReady ?? false,
    asyncJobSurface:
      surface === "media_studio" || surface === "video_editor"
        ? "media_generation"
        : null,
    expectedArtifacts:
      surface === "video_editor"
        ? ["video_clip", "final_video", "media_probe"]
        : surface === "media_studio"
          ? ["image_asset", "storyboard_keyframe"]
          : surface === "document_management"
            ? ["document", "rag_evidence"]
            : ["text_result", "evidence"],
  };
}

function buildSkillCapabilityEntry(
  skill: SkillDefinition,
  input: BuildCapabilityCatalogInput,
): CapabilityCatalogEntry {
  const surface = classifySkillSurface(skill);
  const decision = evaluateSurfaceGovernance({
    surface,
    action: null,
    actorContext: input.actorContext,
    flags: input.flags,
  });

  return {
    id: skill.id,
    surface,
    action: null,
    title: `Skill: ${skill.name || skill.id}`,
    description: summarizeSkillForPlanner(skill),
    governance: decision.governance,
    contractCompatibility: {
      state: decision.contractCompatibilityState,
      reasonCode: decision.blockedReason,
      migrationRequired: decision.contractCompatibilityState !== "compatible",
    },
    blockedReason: decision.blockedReason,
    metadata: {
      source: "skill_registry",
      skillId: skill.id,
      skillType: skill.type,
      category: skill.category ?? null,
      tags: skill.tags ?? [],
      executionMode: skill.executionMode ?? null,
      chainTo: skill.chainTo ?? null,
      nativeBundleReady: skill.nativeBundleReady ?? false,
      nativeBundlePath: skill.nativeBundlePath ?? null,
      teamRunEligible: skill.teamRunEligible ?? false,
      plannerUseCases: [
        skill.type,
        skill.category,
        ...(skill.tags ?? []),
      ].filter(Boolean),
      riskTags: inferSkillRiskTags(skill, surface),
      toolContract: buildToolContractSummary(skill, surface),
      authorityDecision: decision.authorityDecision,
      reasonCodes: decision.reasonCodes,
    },
  };
}

function buildRuntimeInventoryEntry(input: {
  id: string;
  surface: WorkOrchestratorSurface;
  title: string;
  description?: string | null;
  metadata: Record<string, unknown>;
  catalogInput: BuildCapabilityCatalogInput;
}): CapabilityCatalogEntry {
  const decision = evaluateSurfaceGovernance({
    surface: input.surface,
    action: null,
    actorContext: input.catalogInput.actorContext,
    flags: input.catalogInput.flags,
  });
  return {
    id: input.id,
    surface: input.surface,
    action: null,
    title: input.title,
    description: input.description ?? describeSurface(input.surface),
    governance: decision.governance,
    contractCompatibility: {
      state: decision.contractCompatibilityState,
      reasonCode: decision.blockedReason,
      migrationRequired: decision.contractCompatibilityState !== "compatible",
    },
    blockedReason: decision.blockedReason,
    metadata: {
      source: "runtime_inventory",
      ...input.metadata,
      authorityDecision: decision.authorityDecision,
      reasonCodes: decision.reasonCodes,
    },
  };
}

async function buildInventoryCapabilityEntries(
  input: BuildCapabilityCatalogInput,
): Promise<CapabilityCatalogEntry[]> {
  let db: Awaited<ReturnType<typeof getDb>> | null = null;
  try {
    db = await getDb();
  } catch {
    db = null;
  }
  if (!db) return [];
  const tenantId = input.actorContext.tenantId;
  const entries: CapabilityCatalogEntry[] = [];

  const [models, agencyRows, workflowRows, contextPacks] = await Promise.all([
    db
      .select()
      .from(mediaModels)
      .where(eq(mediaModels.isEnabled, true))
      .limit(40)
      .catch(() => []),
    db
      .select()
      .from(agencies)
      .where(
        and(
          eq(agencies.tenantId, tenantId),
          or(eq(agencies.status, "approved"), eq(agencies.isPublished, true)),
        ),
      )
      .limit(30)
      .catch(() => []),
    db
      .select()
      .from(workflowTemplates)
      .where(
        and(
          or(eq(workflowTemplates.tenantId, tenantId), eq(workflowTemplates.isPublic, true)),
          eq(workflowTemplates.status, "published"),
        ),
      )
      .limit(30)
      .catch(() => []),
    db
      .select()
      .from(libraryContextPacks)
      .where(
        and(
          eq(libraryContextPacks.tenantId, tenantId),
          eq(libraryContextPacks.status, "active"),
          eq(libraryContextPacks.approvedForAgents, true),
        ),
      )
      .limit(30)
      .catch(() => []),
  ]);

  for (const model of models) {
    const surface = model.modelType === "video" ? "video_editor" : "media_studio";
    entries.push(
      buildRuntimeInventoryEntry({
        id: `media_model:${model.modelId}`,
        surface,
        title: `Media model: ${model.name}`,
        description: model.description,
        catalogInput: input,
        metadata: {
          inventoryType: "media_model",
          modelId: model.modelId,
          modelType: model.modelType,
          provider: model.provider,
          creditCost: model.creditCost,
          aspectRatios: model.aspectRatios ?? [],
          sizes: model.sizes ?? [],
          durations: model.durations ?? [],
          toolContract: {
            asyncJobSurface: "media_generation",
            expectedArtifacts:
              model.modelType === "video" ? ["video_clip"] : ["image_asset"],
          },
        },
      }),
    );
  }

  for (const agency of agencyRows) {
    entries.push(
      buildRuntimeInventoryEntry({
        id: `agency:${agency.id}`,
        surface: "agency",
        title: `Agency: ${agency.name}`,
        description: agency.description,
        catalogInput: input,
        metadata: {
          inventoryType: "agency",
          agencyId: agency.id,
          slug: agency.slug,
          defaultModel: agency.defaultModel,
          maxAgents: agency.maxAgents,
          maxRunTimeSeconds: agency.maxRunTimeSeconds,
          visibility: agency.visibility,
        },
      }),
    );
  }

  for (const workflow of workflowRows) {
    entries.push(
      buildRuntimeInventoryEntry({
        id: `workflow:${workflow.id}`,
        surface: "workflow",
        title: `Workflow: ${workflow.name}`,
        description: workflow.description,
        catalogInput: input,
        metadata: {
          inventoryType: "workflow_template",
          workflowTemplateId: workflow.id,
          templateKey: workflow.templateKey,
          stepCount: workflow.stepCount,
          estimatedSetupMinutes: workflow.estimatedSetupMinutes,
          tags: workflow.tags ?? [],
          industry: workflow.industry ?? [],
        },
      }),
    );
  }

  for (const pack of contextPacks) {
    entries.push(
      buildRuntimeInventoryEntry({
        id: `context_pack:${pack.id}`,
        surface: "document_management",
        title: `Context pack: ${pack.title}`,
        description: pack.description,
        catalogInput: input,
        metadata: {
          inventoryType: "library_context_pack",
          contextPackId: pack.id,
          slug: pack.slug,
          runtimeTier: pack.defaultRuntimeTier,
          readinessStatus: pack.readinessStatus,
          sourceMode: pack.sourceMode,
        },
      }),
    );
  }

  return entries;
}

export async function buildCapabilityCatalogWithRuntimeCapabilities(
  input: BuildCapabilityCatalogInput,
): Promise<CapabilityCatalogEntry[]> {
  const baseCatalog = buildCapabilityCatalog(input);
  const skills = await getAvailableSkillsAsync().catch(() => []);
  const inventoryEntries = await buildInventoryCapabilityEntries(input).catch(() => []);
  const skillEntries = skills
    .filter(skillIsPlannerVisible)
    .map(skill => buildSkillCapabilityEntry(skill, input));

  const seen = new Set<string>();
  return [...baseCatalog, ...skillEntries, ...inventoryEntries]
    .filter(entry => {
      const key = entry.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 160);
}
