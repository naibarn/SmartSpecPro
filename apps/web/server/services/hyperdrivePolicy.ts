export type HyperdriveReadiness = {
  targetIdentity: string;
  bindingName: string;
  reachable: boolean | null;
  cacheSafe: boolean | null;
  reason: string;
};

/** Configuration policy only. It never claims a live connectivity probe. */
export function getHyperdrivePolicy(): HyperdriveReadiness {
  const targetIdentity = process.env.FEATURE_188_TARGET_IDENTITY?.trim() || "production-postgres";
  const bindingName = process.env.FEATURE_188_HYPERDRIVE_BINDING?.trim() || "HYPERDRIVE";
  return {
    targetIdentity,
    bindingName,
    reachable: null,
    cacheSafe: null,
    reason: "Live Hyperdrive connectivity and cache behavior require target-account evidence",
  };
}

export function isHyperdriveEvidenceReady(input: HyperdriveReadiness): boolean {
  return input.reachable === true && input.cacheSafe === true;
}
