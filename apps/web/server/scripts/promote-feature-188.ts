/**
 * The actual source-to-target adapter is deliberately injected by the
 * deployment runner. This command is a safe preflight and never copies a
 * database, queue, credential, or object when a target adapter is absent.
 */
export function promotionPreflight(input: { sourceIdentity: string; targetIdentity: string; changeFeedMode?: string; dryRun?: boolean }) {
  if (!input.sourceIdentity || !input.targetIdentity || input.sourceIdentity === input.targetIdentity) throw new Error("PROMOTION_IDENTITY_MISMATCH");
  if (input.changeFeedMode && input.changeFeedMode !== "logical_replication" && input.changeFeedMode !== "ordered_change_feed") throw new Error("PROMOTION_CHANGE_FEED_UNSUPPORTED");
  return {
    status: "blocked_without_injected_target_adapter",
    sourceIdentity: input.sourceIdentity,
    targetIdentity: input.targetIdentity,
    dryRun: input.dryRun !== false,
    reason: "Target credentials, replication capability, and provider evidence must be supplied by the approved deployment runner",
  } as const;
}

if (process.argv[1]?.endsWith("promote-feature-188.ts")) {
  const result = promotionPreflight({ sourceIdentity: process.env.FEATURE_188_SOURCE_IDENTITY || "dev-server", targetIdentity: process.env.FEATURE_188_TARGET_IDENTITY || "production-postgres", changeFeedMode: process.env.FEATURE_188_CHANGE_FEED_MODE, dryRun: true });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
