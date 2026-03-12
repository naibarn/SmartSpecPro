import { evaluateBrowserPolicyReleaseReadiness } from "./browserPolicyReleaseReadiness";
import {
  evaluateBrowserPolicyRolloutGate,
  type BrowserPolicyRolloutTransition,
} from "./browserPolicyRolloutGates";
import { getRedisClient } from "./redis";

export type BrowserPolicyControlledSurface = "automationCopilot" | "browserTool" | "liveBrowser";

const DEFAULT_BROWSER_POLICY_ROLLOUT_TRANSITION: BrowserPolicyRolloutTransition = (
  process.env.BROWSER_POLICY_ROLLOUT_TRANSITION || "observe_to_read_only"
) as BrowserPolicyRolloutTransition;
const BROWSER_POLICY_CONTROLLED_SURFACES = new Set<BrowserPolicyControlledSurface>([
  "automationCopilot",
  "browserTool",
  "liveBrowser",
]);

function parseJsonObject(raw: string | null): Record<string, unknown> {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function isBrowserPolicyControlledSurface(
  flagName: string,
): flagName is BrowserPolicyControlledSurface {
  return BROWSER_POLICY_CONTROLLED_SURFACES.has(flagName as BrowserPolicyControlledSurface);
}

export interface BrowserPolicySurfaceGateStatus {
  surface: BrowserPolicyControlledSurface;
  transition: BrowserPolicyRolloutTransition;
  ready: boolean;
  release: ReturnType<typeof evaluateBrowserPolicyReleaseReadiness>;
  rollout: ReturnType<typeof evaluateBrowserPolicyRolloutGate>;
}

export async function getBrowserPolicySurfaceGateStatus(input: {
  surface: BrowserPolicyControlledSurface;
  transition?: BrowserPolicyRolloutTransition;
}): Promise<BrowserPolicySurfaceGateStatus> {
  const transition = input.transition ?? DEFAULT_BROWSER_POLICY_ROLLOUT_TRANSITION;
  let releaseRaw: string | null = null;
  let rolloutRaw: string | null = null;
  try {
    const redis = getRedisClient();
    [releaseRaw, rolloutRaw] = await Promise.all([
      redis.get("browser-policy:release-readiness"),
      redis.get(`browser-policy:rollout-gate:${transition}`),
    ]);
  } catch {
    releaseRaw = null;
    rolloutRaw = null;
  }

  const release = evaluateBrowserPolicyReleaseReadiness({
    regressionSuitePassed: false,
    abuseSuitePassed: false,
    auditCompletenessReady: false,
    redTeamPassed: false,
    rollbackReady: false,
    rawBrowserBypassClosed: false,
    ...parseJsonObject(releaseRaw),
  });
  const rollout = evaluateBrowserPolicyRolloutGate(
    transition,
    parseJsonObject(rolloutRaw),
  );

  return {
    surface: input.surface,
    transition,
    ready: release.passed && rollout.passed,
    release,
    rollout,
  };
}

export async function assertBrowserPolicySurfaceReady(input: {
  tenantId: string;
  surface: BrowserPolicyControlledSurface;
  transition?: BrowserPolicyRolloutTransition;
}): Promise<void> {
  const status = await getBrowserPolicySurfaceGateStatus({
    surface: input.surface,
    transition: input.transition,
  });

  if (status.ready) {
    return;
  }

  throw new Error(
    [
      `browser policy release gate blocked ${input.surface} access`,
      `tenant=${input.tenantId}`,
      `transition=${status.transition}`,
      `release_failed=${status.release.failedChecks.join(",") || "none"}`,
      `rollout_failed=${status.rollout.failedChecks.join(",") || "none"}`,
    ].join(" "),
  );
}

export async function assertBrowserPolicyFeaturePromotionReady(input: {
  tenantId: string;
  flagName: string;
  nextValue: boolean;
  transition?: BrowserPolicyRolloutTransition;
}): Promise<void> {
  if (!input.nextValue || !isBrowserPolicyControlledSurface(input.flagName)) {
    return;
  }

  await assertBrowserPolicySurfaceReady({
    tenantId: input.tenantId,
    surface: input.flagName,
    transition: input.transition,
  });
}
