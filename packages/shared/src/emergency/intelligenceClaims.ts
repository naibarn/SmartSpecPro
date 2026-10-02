export type EmergencyIntelClaimStatus = "unreviewed" | "under_review" | "verified" | "disputed" | "retracted" | "superseded";

const transitions: Readonly<Record<EmergencyIntelClaimStatus, readonly EmergencyIntelClaimStatus[]>> = {
  unreviewed: ["under_review", "disputed"],
  under_review: ["verified", "disputed", "retracted"],
  verified: ["disputed", "retracted"],
  disputed: ["verified", "retracted"],
  retracted: [],
  superseded: [],
};

export function canTransitionEmergencyIntelClaim(from: string, to: string): boolean {
  return (transitions[from as EmergencyIntelClaimStatus] ?? []).includes(to as EmergencyIntelClaimStatus);
}

export function countIndependentEmergencyIntelSources(groups: readonly string[]): number {
  return new Set(groups.map(group => group.trim()).filter(Boolean)).size;
}
