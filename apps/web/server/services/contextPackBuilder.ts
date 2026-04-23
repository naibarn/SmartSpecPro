import type { ContextSurface, ContextPack } from "../../shared/contextEngine";
import type {
  LibraryContextPackRef,
  LibraryContextPackResolveResult,
  LibraryContextPackRuntimeTier,
} from "../../shared/libraryContextPacks";
import type { UnifiedExecutionRequest } from "./executors/types";
import {
  buildChatExecutionContextPack,
  buildTeamExecutionContextPack,
  summarizeContextPack,
} from "./contextEngineAdapter";
import {
  assertKnowledgeVaultSurfaceEnabledAsync,
  isKnowledgeVaultSurfaceEnabledAsync,
} from "./libraryFeatureFlags";
import {
  incrementLibraryKnowledgeCounter,
  recordLibraryKnowledgeLeakageProbe,
  sanitizeLibraryKnowledgeLeakageProbe,
} from "./libraryKnowledgeObservabilityService";
import { resolveLibraryContextPack } from "./libraryContextPackService";
import { getLibraryMarkdownContent } from "./libraryService";

export interface BuildLibraryContextPackRequest {
  ref: LibraryContextPackRef;
  required?: boolean;
  runtimeTierOverride?: LibraryContextPackRuntimeTier;
  maxItems?: number;
  tokenBudgetHint?: number;
  includeCitations?: boolean;
  allowPrivateVaultRuntimeUnlock?: boolean;
}

export interface BuildContextPackRequest {
  surface: ContextSurface;
  request: UnifiedExecutionRequest;
  tenantId?: string;
  skillSystemPrompt?: string | null;
  knowledgebase?: string | null;
  dynamicParams?: Record<string, unknown> | null;
  libraryContextPacks?: BuildLibraryContextPackRequest[];
  tokenBudget?: number;
  label?: string | null;
}

const MAX_LIBRARY_CONTEXT_PACK_REFS = 5;

type LibraryContextRuntimeBlockKey =
  | "durableMemory"
  | "retrievedEvidence"
  | "resources";

type LibraryContextRuntimeState = Partial<
  Record<LibraryContextRuntimeBlockKey, Array<Record<string, unknown>>>
>;

interface LibraryContextRuntimeDiagnostic {
  severity: "info" | "warning" | "error";
  ref: string;
  message: string;
}

function mergeContextStateBlocks(
  base: unknown,
  additions: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const existing = Array.isArray(base)
    ? base.filter(
      (entry): entry is Record<string, unknown> =>
        Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
    )
    : [];
  return [...existing, ...additions];
}

function describeLibraryContextPackRef(ref: LibraryContextPackRef): string {
  if ("id" in ref) {
    return `id:${ref.id}`;
  }
  return `slug:${ref.slug}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function diagnosticsBlock(
  diagnostics: LibraryContextRuntimeDiagnostic[],
): Record<string, unknown> | null {
  if (!diagnostics.length) {
    return null;
  }

  const content = diagnostics
    .map((diagnostic) => {
      return `[${diagnostic.severity}] ${diagnostic.ref}: ${diagnostic.message}`;
    })
    .join("\n");

  return {
    title: "Library context pack diagnostics",
    content,
    source: "library_context_pack.diagnostics",
    refs: diagnostics.map((diagnostic) => `context_pack_ref:${diagnostic.ref}`),
    trust: "derived",
    freshness: "recent",
  };
}

function runtimeEligibilityMessage(
  resolved: LibraryContextPackResolveResult,
): string {
  if (resolved.pack.readinessStatus !== "trusted") {
    return `not trusted (${resolved.pack.readinessStatus})`;
  }
  if (!resolved.pack.approvedForAgents) {
    return "not approved for agents";
  }
  return "eligible";
}

function hasExplicitPrivateVaultRuntimeUnlock(
  dynamicParams: Record<string, unknown> | null | undefined,
): boolean {
  return dynamicParams?.privateVaultRuntimeUnlock === true
    && dynamicParams?.privateVaultAccessGranted === true;
}

async function buildLibraryContextState(
  input: BuildContextPackRequest,
): Promise<LibraryContextRuntimeState | null> {
  const requestedPacks = input.libraryContextPacks ?? [];
  if (!requestedPacks.length) {
    return null;
  }
  if (requestedPacks.length > MAX_LIBRARY_CONTEXT_PACK_REFS) {
    throw new Error(
      `A runtime request can include up to ${MAX_LIBRARY_CONTEXT_PACK_REFS} library context packs`,
    );
  }

  const requestedPrivateVaultRuntimeUnlock = requestedPacks.some(
    (requestedPack) => requestedPack.allowPrivateVaultRuntimeUnlock === true,
  );
  const explicitPrivateVaultRuntimeUnlock = hasExplicitPrivateVaultRuntimeUnlock(
    input.dynamicParams,
  );

  const actor = {
    userId: input.request.userId,
    tenantId: input.tenantId ?? input.request.tenantId,
    role: null,
    privateVaultUnlocked:
      requestedPrivateVaultRuntimeUnlock && explicitPrivateVaultRuntimeUnlock,
  } as const;

  await assertKnowledgeVaultSurfaceEnabledAsync("contextPacksRuntime", actor.tenantId);
  if (requestedPrivateVaultRuntimeUnlock) {
    if (
      !(await isKnowledgeVaultSurfaceEnabledAsync(
        "privateVaultRuntimeUnlock",
        actor.tenantId,
      ))
    ) {
      incrementLibraryKnowledgeCounter({
        tenantId: actor.tenantId,
        counter: "privateVaultBlockedCount",
      });
      recordLibraryKnowledgeLeakageProbe(
        sanitizeLibraryKnowledgeLeakageProbe({
          probeId: `private-vault-runtime-${Date.now()}`,
          probeType: "private_vault_mention",
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          leaked: false,
          blockedReason: "private_vault_runtime_unlock_disabled",
        }),
      );
      throw new Error(
        "Private vault runtime unlock is disabled for this tenant",
      );
    }
    if (!explicitPrivateVaultRuntimeUnlock) {
      incrementLibraryKnowledgeCounter({
        tenantId: actor.tenantId,
        counter: "privateVaultBlockedCount",
      });
      recordLibraryKnowledgeLeakageProbe(
        sanitizeLibraryKnowledgeLeakageProbe({
          probeId: `private-vault-runtime-${Date.now()}`,
          probeType: "private_vault_mention",
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          leaked: false,
          blockedReason:
            "private_vault_runtime_unlock_requires_explicit_intent",
        }),
      );
      throw new Error(
        "Private vault runtime unlock requires explicit caller intent and authorization",
      );
    }
  }

  const durableMemory: Array<Record<string, unknown>> = [];
  const retrievedEvidence: Array<Record<string, unknown>> = [];
  const diagnostics: LibraryContextRuntimeDiagnostic[] = [];
  const seenPackIds = new Set<number>();

  for (const requestedPack of requestedPacks) {
    const refLabel = describeLibraryContextPackRef(requestedPack.ref);
    let resolved: LibraryContextPackResolveResult;
    try {
      resolved = await resolveLibraryContextPack(
        {
          ref: requestedPack.ref,
          runtimeTierOverride: requestedPack.runtimeTierOverride,
          maxItems: requestedPack.maxItems,
          tokenBudgetHint: requestedPack.tokenBudgetHint,
          failIfPartial: requestedPack.required !== false,
          includeCitations: requestedPack.includeCitations ?? true,
        },
        actor,
      );
    } catch (error) {
      if (requestedPack.required !== false) {
        throw error;
      }
      diagnostics.push({
        severity: "error",
        ref: refLabel,
        message: `Optional library context pack was skipped: ${errorMessage(error)}`,
      });
      continue;
    }

    const runtimeEligibility = runtimeEligibilityMessage(resolved);
    if (runtimeEligibility !== "eligible") {
      if (requestedPack.required !== false) {
        throw new Error(
          `Required library context pack ${resolved.pack.slug} is ${runtimeEligibility}`,
        );
      }
      diagnostics.push({
        severity: "error",
        ref: refLabel,
        message: `Optional library context pack was skipped: ${runtimeEligibility}`,
      });
      continue;
    }

    if (seenPackIds.has(resolved.pack.id)) {
      diagnostics.push({
        severity: "warning",
        ref: refLabel,
        message: `Duplicate library context pack ${resolved.pack.slug} was ignored after the first declaration`,
      });
      continue;
    }
    seenPackIds.add(resolved.pack.id);

    if (requestedPack.required !== false && resolved.status !== "complete") {
      throw new Error(
        `Required library context pack ${resolved.pack.slug} could not be resolved completely`,
      );
    }
    if (requestedPack.required === false && resolved.status !== "complete") {
      diagnostics.push({
        severity: "warning",
        ref: refLabel,
        message: `Optional library context pack ${resolved.pack.slug} resolved with status ${resolved.status}`,
      });
    }
    for (const diagnostic of resolved.diagnostics) {
      diagnostics.push({
        severity: diagnostic.severity,
        ref: refLabel,
        message: diagnostic.message,
      });
    }

    for (const item of resolved.items) {
      let markdown;
      try {
        markdown = await getLibraryMarkdownContent(item.libraryItemId, actor);
      } catch (error) {
        if (requestedPack.required !== false) {
          throw error;
        }
        diagnostics.push({
          severity: "error",
          ref: refLabel,
          message: `Optional pack item ${item.libraryItemId} was skipped: ${errorMessage(error)}`,
        });
        continue;
      }
      const content = markdown?.content?.trim();
      if (!content) {
        diagnostics.push({
          severity: "warning",
          ref: refLabel,
          message: `Pack item ${item.libraryItemId} has no readable markdown content`,
        });
        continue;
      }

      const block = {
        title: `${resolved.pack.title} · ${item.title}`,
        content,
        source: `library_context_pack.${resolved.pack.slug}`,
        refs: [
          `context_pack:${resolved.pack.slug}`,
          `library_item:${item.libraryItemId}`,
          ...item.citations.map((citation) => citation.sourceRef),
        ],
        trust: "derived",
        freshness: item.freshness,
      };

      if (item.runtimeTier === "durable_memory") {
        durableMemory.push(block);
      } else {
        retrievedEvidence.push(block);
      }
    }
  }

  const diagnosticResource = diagnosticsBlock(diagnostics);
  const resources = diagnosticResource ? [diagnosticResource] : [];

  if (!durableMemory.length && !retrievedEvidence.length && !resources.length) {
    return null;
  }

  return {
    ...(durableMemory.length > 0 ? { durableMemory } : {}),
    ...(retrievedEvidence.length > 0 ? { retrievedEvidence } : {}),
    ...(resources.length > 0 ? { resources } : {}),
  };
}

export async function build_context_pack(
  input: BuildContextPackRequest,
): Promise<ContextPack> {
  const libraryContextState = await buildLibraryContextState(input);
  const mergedDynamicParams = (() => {
    const base = input.dynamicParams ?? input.request.dynamicParams ?? null;
    if (!libraryContextState) {
      return base;
    }

    const contextState =
      base?.contextState && typeof base.contextState === "object"
        ? { ...(base.contextState as Record<string, unknown>) }
        : {};

    if (libraryContextState.durableMemory) {
      contextState.durableMemory = mergeContextStateBlocks(
        contextState.durableMemory,
        libraryContextState.durableMemory as Array<Record<string, unknown>>,
      );
    }
    if (libraryContextState.retrievedEvidence) {
      contextState.retrievedEvidence = mergeContextStateBlocks(
        contextState.retrievedEvidence,
        libraryContextState.retrievedEvidence as Array<Record<string, unknown>>,
      );
    }
    if (libraryContextState.resources) {
      contextState.resources = mergeContextStateBlocks(
        contextState.resources,
        libraryContextState.resources as Array<Record<string, unknown>>,
      );
    }

    return {
      ...(base ?? {}),
      contextState,
    };
  })();

  const options = {
    skillSystemPrompt: input.skillSystemPrompt ?? null,
    knowledgebase: input.knowledgebase ?? null,
    dynamicParams: mergedDynamicParams,
    tokenBudget: input.tokenBudget,
    label: input.label ?? null,
  };

  if (input.surface === "chat") {
    return buildChatExecutionContextPack(input.request, options);
  }

  const tenantId = input.tenantId ?? input.request.tenantId;
  return buildTeamExecutionContextPack(input.request, tenantId, options);
}

export const buildContextPack = build_context_pack;
export { summarizeContextPack };
