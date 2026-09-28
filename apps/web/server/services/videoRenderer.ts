/**
 * Render-engine selection layer for the Marketplace Auto-Review render
 * worker (`server/workers/hyperframesRenderWorker.ts`).
 *
 * Phase 1 of planning/remotion-migration/plan.md introduced a routing layer
 * that picks between the existing HyperFrames renderer and the Remotion
 * renderer behind a feature flag, defaulting to HyperFrames.
 *
 * Phase 6 (section 7 of the plan) flips the default to Remotion, since only
 * the schema-default preset combination is ported to Remotion so far (see
 * `remotionCompositionService.ts`'s `assertRemotionPresetSupport()`),
 * `executeVideoRender()` catches `UnsupportedPresetError` specifically and
 * transparently falls back to the HyperFrames path for that one job, so
 * every tenant using an unported preset keeps working exactly as before —
 * zero functional regression, no flag flip required on their end. Any other
 * Remotion failure is NOT caught here — it propagates unchanged, so real
 * bugs/regressions stay visible instead of being silently masked.
 *
 * `resolveVideoRenderEngine()` and `executeVideoRender()` are the shared
 * interface Phase 2 (real Remotion composition rendering) builds on — keep
 * their signatures stable.
 */
import {
  executeHyperframesCliRender,
  executeHyperframesProducerRender,
  getHyperframesRuntimeMode,
  type HyperframesRuntimeAdapterEnv,
  type HyperframesRuntimeRenderResult,
} from "./hyperframesRuntimeAdapter";
import { getTenantFeatureFlags } from "./tenantFeatureFlagService";
import { executeRemotionRender } from "./remotionRuntimeAdapter";
import { UnsupportedPresetError } from "./remotionCompositionService";

export type VideoRenderEngine = "hyperframes" | "remotion";

export interface VideoRenderInput {
  workspace: string;
  outputPath: string;
  payload: Record<string, unknown>;
  env?: Record<string, string | undefined>;
}

export interface VideoRenderResult {
  engine: VideoRenderEngine;
  outputPath: string;
  inputPath: string;
  result: unknown;
}

/**
 * Resolve which render engine should be used for a given tenant/env.
 *
 * Precedence (highest wins), per planning/remotion-migration/plan.md
 * section 7 (Phase 6):
 *   1. `RENDERER_ENGINE=hyperframes` env var — global kill-switch, no
 *      deploy needed, forces HyperFrames regardless of anything else.
 *   2. `RENDERER_ENGINE=remotion` env var — forces a Remotion attempt
 *      (still subject to the automatic per-job `UnsupportedPresetError`
 *      fallback to HyperFrames in `executeVideoRender()`).
 *   3. Tenant feature flag `marketplaceHyperframesRendererForced` (if
 *      true -> "hyperframes") — per-tenant rollback lever, independent of
 *      the global env var.
 *   4. Tenant feature flag `marketplaceRemotionRendererEnabled` (if true
 *      -> "remotion") — kept for backward compat, redundant now that
 *      Remotion is the default, harmless.
 *   5. Default -> "remotion".
 *
 * NOTE (deviation from brief): this is declared `async`/`Promise<VideoRenderEngine>`
 * rather than a plain synchronous function. The tenant feature-flag lookup
 * (`getTenantFeatureFlags`) is a DB read via Drizzle — there is no synchronous
 * codebase helper for it (see `server/services/tenantFeatureFlagService.ts`,
 * already used the same way in this worker for
 * `isHyperframesWorkerEnabledForTenant()`). Making this sync would either
 * require inventing a new cached/sync lookup (out of scope for phase 1) or
 * skipping the tenant flag entirely (violates the CONTRACT). Async was the
 * minimal change that reuses the existing helper as instructed.
 *
 * The tenant flag lookup is wrapped in try/catch: if it fails for any
 * reason (e.g. DATABASE_URL not configured, as in unit tests / local
 * tooling that exercise the render path without a DB), resolution falls
 * through to the env-var/default precedence instead of throwing. This
 * preserves the pre-existing behavior of `executeLocalHyperframesSmokeRender()`,
 * which previously had no DB dependency at all — it must remain runnable
 * without a DB when the caller doesn't need tenant-scoped Remotion opt-in.
 */
export async function resolveVideoRenderEngine(opts: {
  tenantId?: string | null;
  env?: Record<string, string | undefined>;
}): Promise<VideoRenderEngine> {
  const envSource = opts.env ?? process.env;
  const envEngine = String(envSource.RENDERER_ENGINE ?? "")
    .trim()
    .toLowerCase();

  // 1. Global kill-switch — highest precedence, no deploy needed.
  if (envEngine === "hyperframes") {
    return "hyperframes";
  }
  // 2. Explicit global force-on for Remotion.
  if (envEngine === "remotion") {
    return "remotion";
  }

  try {
    const flags = await getTenantFeatureFlags(opts.tenantId ?? "default");
    // 3. Per-tenant rollback lever forcing HyperFrames.
    if (flags.marketplaceHyperframesRendererForced === true) {
      return "hyperframes";
    }
    // 4. Legacy per-tenant opt-in flag, redundant now but harmless.
    if (flags.marketplaceRemotionRendererEnabled === true) {
      return "remotion";
    }
  } catch {
    // Tenant flag lookup unavailable (e.g. no DB configured) — fall through
    // to the default below.
  }

  // 5. Default.
  return "remotion";
}

/**
 * Execute a render on the given engine.
 *
 * For "hyperframes", this is a verbatim move of the runtimeMode branching
 * that previously lived inline in `executeLocalHyperframesSmokeRender()` —
 * no logic change. Returns `null` when the resolved HyperFrames runtime
 * mode is neither "cli" nor "producer" (i.e. "diagnostic"), matching the
 * prior inline behavior exactly (the caller falls back to the existing
 * FFmpeg/ASS fallback path in that case).
 *
 * NOTE (deviation from brief): return type is `Promise<VideoRenderResult | null>`
 * rather than `Promise<VideoRenderResult>`, to preserve the pre-existing
 * "diagnostic mode -> null -> fallback path" behavior byte-for-byte. See
 * `hyperframesRenderWorker.ts` `executeLocalHyperframesSmokeRender()`.
 */
/**
 * Runs the HyperFrames render path (CLI or producer runtime mode, per
 * `getHyperframesRuntimeMode()`). Extracted so both the explicit
 * `engine === "hyperframes"` branch and the Remotion
 * `UnsupportedPresetError` fallback branch in `executeVideoRender()` share
 * one implementation instead of duplicating it.
 */
async function executeHyperframesVideoRender(
  input: VideoRenderInput
): Promise<VideoRenderResult | null> {
  const hyperframesEnv = input.env as HyperframesRuntimeAdapterEnv | undefined;
  const runtimeMode = getHyperframesRuntimeMode(hyperframesEnv);
  const hyperframesInput = {
    workspace: input.workspace,
    outputPath: input.outputPath,
    payload: input.payload,
    env: hyperframesEnv,
  };
  const hyperframesResult: HyperframesRuntimeRenderResult | null =
    runtimeMode === "producer"
      ? await executeHyperframesProducerRender(hyperframesInput)
      : runtimeMode === "cli"
        ? await executeHyperframesCliRender(hyperframesInput)
        : null;

  if (!hyperframesResult) return null;

  return {
    engine: "hyperframes",
    outputPath: hyperframesResult.outputPath,
    inputPath: hyperframesResult.inputPath,
    result: hyperframesResult,
  };
}

export async function executeVideoRender(
  engine: VideoRenderEngine,
  input: VideoRenderInput
): Promise<VideoRenderResult | null> {
  if (engine === "remotion") {
    try {
      return await executeRemotionRender(input);
    } catch (error) {
      if (error instanceof UnsupportedPresetError) {
        // Known, deterministic condition (see planning/remotion-migration/
        // plan.md section 7): the config uses a preset combination not yet
        // ported to Remotion. Transparently fall back to HyperFrames for
        // this one job — not a crash, not a bug, just an unported preset.
        console.warn(
          "[videoRenderer] Remotion render fell back to HyperFrames for " +
            `this job — unsupported preset combination: ${error.message}`
        );
        return executeHyperframesVideoRender(input);
      }
      // Any other Remotion failure (a real bug, a runtime/environment
      // issue) must NOT be silently swallowed — re-throw unchanged so it
      // propagates exactly as before.
      throw error;
    }
  }

  return executeHyperframesVideoRender(input);
}
