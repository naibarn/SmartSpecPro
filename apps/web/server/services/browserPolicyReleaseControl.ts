import { evaluateBrowserPolicyReleaseReadiness } from "./browserPolicyReleaseReadiness";
import {
  evaluateBrowserPolicyRolloutGate,
  type BrowserPolicyRolloutTransition,
} from "./browserPolicyRolloutGates";
import { getRedisClient } from "./redis";

const DEFAULT_BROWSER_POLICY_ROLLOUT_TRANSITION: BrowserPolicyRolloutTransition = (
  process.env.BROWSER_POLICY_ROLLOUT_TRANSITION || "observe_to_read_only"
) as BrowserPolicyRolloutTransition;

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

export async function assertBrowserPolicyFeaturePromotionReady(input: {
  tenantId: string;
  flagName: string;
  nextValue: boolean;
  transition?: BrowserPolicyRolloutTransition;
}): Promise<void> {
  if (input.flagName !== "automationCopilot" || !input.nextValue) {
    return;
  }

  const transition = input.transition ?? DEFAULT_BROWSER_POLICY_ROLLOUT_TRANSITION;
  const redis = getRedisClient();
  const [releaseRaw, rolloutRaw] = await Promise.all([
    redis.get("browser-policy:release-readiness"),
    redis.get(`browser-policy:rollout-gate:${transition}`),
  ]);

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

  if (release.passed && rollout.passed) {
    return;
  }

  throw new Error(
    [
      "browser policy release gate blocked automationCopilot enable",
      `tenant=${input.tenantId}`,
      `transition=${transition}`,
      `release_failed=${release.failedChecks.join(",") || "none"}`,
      `rollout_failed=${rollout.failedChecks.join(",") || "none"}`,
    ].join(" "),
  );
}
