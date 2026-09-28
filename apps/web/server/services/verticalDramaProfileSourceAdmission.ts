import type { VdSeriesProfile } from "@shared/verticalDramaSeries/seriesProfile";
import {
  validateBrollBinding,
  type ShotBrollBinding,
} from "./verticalDramaBrollService";
import {
  validateProductionContextSnapshotRef,
  type ProductionContextSnapshot,
} from "@shared/verticalDramaSeries/verticalDramaAssuranceContext";
import {
  type VisualSourceSnapshot,
  type VisualUsageRef,
} from "@shared/verticalDramaSeries/visualSource";

export type ProfileSourceAdmissionStage =
  | "authoring"
  | "draft_ready"
  | "provider_ready"
  | "production_ready";

export type ProfileSourceAdmissionFinding = {
  code: string;
  severity: "info" | "advisory" | "blocking";
  message: string;
  target: string | null;
};

export type ProfileSourceAdmissionResult = {
  allowed: boolean;
  disposition: "admitted" | "needs_review" | "blocked";
  findings: ProfileSourceAdmissionFinding[];
  contextFingerprint: string;
  profileId: string;
};

type Owner = { tenantId: string; userId: number | string };

export type ProfileSourceAdmissionInput = {
  owner: Owner;
  expectedOwner?: Owner | null;
  expectedSeriesId: number;
  profile: VdSeriesProfile;
  snapshot: ProductionContextSnapshot;
  expectedContextRef: { snapshotId: string; revision: number; fingerprint: string };
  visualSnapshot: VisualSourceSnapshot;
  stage: ProfileSourceAdmissionStage;
  usages: VisualUsageRef[];
  brollBindings: ShotBrollBinding[];
  managedMedia: Array<{ mediaAssetId: number; exists: boolean; playable: boolean }>;
};

function finding(
  code: string,
  severity: ProfileSourceAdmissionFinding["severity"],
  message: string,
  target: string | null = null,
): ProfileSourceAdmissionFinding {
  return { code, severity, message, target };
}

function isHard(stage: ProfileSourceAdmissionStage): boolean {
  return stage === "provider_ready" || stage === "production_ready";
}

function harden(
  item: ProfileSourceAdmissionFinding,
  hard: boolean,
): ProfileSourceAdmissionFinding {
  return hard && item.severity === "advisory"
    ? { ...item, severity: "blocking" }
    : item;
}

/**
 * Server-only admission façade for profile/source/visual/B-roll boundaries.
 * It deliberately returns findings instead of throwing so authoring/preview
 * remains usable while paid/export boundaries can fail closed.
 */
export function admitVerticalDramaProfileSource(
  input: ProfileSourceAdmissionInput,
): ProfileSourceAdmissionResult {
  const hard = isHard(input.stage);
  const findings: ProfileSourceAdmissionFinding[] = [];

  if (
    input.expectedOwner &&
    (input.expectedOwner.tenantId !== input.owner.tenantId ||
      String(input.expectedOwner.userId) !== String(input.owner.userId))
  ) {
    findings.push(finding("VD_ASSURANCE_TENANT_MISMATCH", "blocking", "Profile/source owner does not match the authenticated owner"));
  }
  if (input.snapshot.seriesId !== input.expectedSeriesId) {
    findings.push(finding("VD_ASSURANCE_TENANT_MISMATCH", "blocking", "Profile/source context is bound to another series"));
  }
  const refCheck = validateProductionContextSnapshotRef(input.snapshot, input.expectedContextRef);
  if (!refCheck.ok) {
    findings.push(finding("VD_ASSURANCE_CONTEXT_STALE", "blocking", "Production context changed; refresh before using sources"));
    return result(input, findings);
  }
  if (input.visualSnapshot.fingerprint !== input.snapshot.visualSource.fingerprint) {
    findings.push(finding("VD_ASSURANCE_CONTEXT_STALE", "blocking", "Visual source snapshot is stale", null));
  }

  const sourceMissing = input.snapshot.sourcePackDecision === "explicit_none";
  if (input.profile.sourceGatePolicy === "required" && sourceMissing) {
    findings.push(finding("source_pack_missing", hard ? "blocking" : "advisory", "This profile requires a server-proven source pack"));
  }

  const slots = new Map(input.visualSnapshot.slots.map(slot => [slot.slotId, slot]));
  for (const usage of input.usages) {
    const slot = slots.get(usage.slotId);
    if (!slot || slot.semanticRole !== usage.semanticRole || slot.mediaType !== usage.mediaType) {
      findings.push(finding("visual_role_conflict", hard ? "blocking" : "advisory", "Visual usage does not match the server-owned source slot", usage.usageId));
    }
    if (usage.mediaAssetId != null) {
      const media = input.managedMedia.find(item => item.mediaAssetId === usage.mediaAssetId);
      if (!media || !media.exists || !media.playable) {
        findings.push(finding("managed_media_unavailable", hard ? "blocking" : "advisory", "Managed media is unavailable or not playable", usage.usageId));
      }
    }
  }

  const statuses = input.snapshot.sourcePack;
  if (statuses) {
    if (statuses.evidenceStatuses.some(status => ["stale", "contradictory", "blocked", "needs_verification"].includes(status))) {
      findings.push(finding("evidence_stale", hard ? "blocking" : "advisory", "Source evidence is stale or not fully verified"));
    }
    if (statuses.rightsStatuses.some(status => !["creator_owned", "licensed", "public_domain", "cleared"].includes(status))) {
      findings.push(finding("rights_not_ready", hard ? "blocking" : "advisory", "Source rights are not proven for this boundary"));
    }
    if (statuses.disclosureStatuses.some(status => ["required", "not_shown", "missing"].includes(status))) {
      findings.push(finding("disclosure_not_shown", hard ? "blocking" : "advisory", "Required source disclosure has not been shown"));
    }
  }

  for (const binding of input.brollBindings) {
    const bindingSlot = slots.get(binding.usage.slotId);
    if (!bindingSlot || bindingSlot.semanticRole !== binding.usage.semanticRole || bindingSlot.mediaType !== binding.usage.mediaType) {
      findings.push(finding("visual_role_conflict", hard ? "blocking" : "advisory", "B-roll usage does not match the server-owned source slot", binding.bindingId));
    }
    const segment = binding.usage.segmentId
      ? input.visualSnapshot.segments.find(item => item.segmentId === binding.usage.segmentId)
      : null;
    try {
      validateBrollBinding(binding, {
        snapshotRevision: input.visualSnapshot.revision,
        snapshotFingerprint: input.visualSnapshot.fingerprint,
        segment,
      });
    } catch {
      findings.push(finding("visual_role_conflict", hard ? "blocking" : "advisory", "B-roll binding does not match the current source role or segment", binding.bindingId));
    }
  }
  if (input.profile.bRollPolicy === "evidence_and_broll" && input.stage === "production_ready" && input.brollBindings.length === 0) {
    findings.push(finding("broll_missing", "blocking", "This profile requires an approved B-roll binding"));
  }

  return result(input, findings);
}

function result(input: ProfileSourceAdmissionInput, findings: ProfileSourceAdmissionFinding[]): ProfileSourceAdmissionResult {
  const blocking = findings.some(item => item.severity === "blocking");
  const advisory = findings.some(item => item.severity === "advisory");
  return {
    allowed: !blocking,
    disposition: blocking ? "blocked" : advisory ? "needs_review" : "admitted",
    findings,
    contextFingerprint: input.snapshot.fingerprint,
    profileId: input.profile.profileId,
  };
}
