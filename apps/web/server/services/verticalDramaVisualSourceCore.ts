import { createHash } from "node:crypto";
import {
  shotBrollBindingSchema,
  sourceMediaSegmentSchema,
  visualSourceSnapshotSchema,
  visualUsageRefSchema,
  type ShotBrollBinding,
  type SourceMediaSegment,
  type VisualCoverageFinding,
  type VisualCoverageRequirement,
  type VisualSourceSnapshot,
  type VisualSourceSlot,
  type VisualUsageRef,
} from "@shared/verticalDramaSeries/visualSource";

type FingerprintInput = Pick<
  VisualSourceSnapshot,
  "packId" | "seriesId" | "profileId" | "profileVersion" | "slots" | "segments" | "coverage"
>;

function sortByKey<T extends Record<string, unknown>>(
  items: readonly T[],
  key: keyof T
): T[] {
  return [...items].sort((a, b) =>
    String(a[key]).localeCompare(String(b[key]), "en", { numeric: true })
  );
}

export function canonicalizeVisualSourceFingerprintInput(
  input: FingerprintInput
): FingerprintInput {
  return {
    packId: input.packId,
    seriesId: input.seriesId ?? null,
    profileId: input.profileId,
    profileVersion: input.profileVersion,
    slots: sortByKey(input.slots, "slotId"),
    segments: sortByKey(input.segments, "segmentId"),
    coverage: sortByKey(input.coverage, "requirementId"),
  };
}

export function visualSourceFingerprint(input: FingerprintInput): string {
  const canonical = canonicalizeVisualSourceFingerprintInput(input);
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function finding(
  code: string,
  severity: VisualCoverageFinding["severity"],
  message: string,
  extra: Partial<VisualCoverageFinding> = {}
): VisualCoverageFinding {
  return {
    code,
    severity,
    message,
    requirementId: extra.requirementId ?? null,
    slotId: extra.slotId ?? null,
    claimId: extra.claimId ?? null,
  };
}

function evidenceRank(status: string): number {
  return {
    not_applicable: 0,
    illustrative: 1,
    needs_verification: 2,
    partially_verified: 3,
    verified: 4,
  }[status] ?? 0;
}

export function validateVisualCoverage(params: {
  requirements: readonly VisualCoverageRequirement[];
  slots: readonly VisualSourceSlot[];
}): VisualCoverageFinding[] {
  const findings: VisualCoverageFinding[] = [];
  for (const requirement of params.requirements) {
    const matching = params.slots.filter(
      slot =>
        requirement.fulfilledBySlotIds.includes(slot.slotId) &&
        requirement.allowedRoles.includes(slot.semanticRole) &&
        requirement.allowedMediaTypes.includes(slot.mediaType)
    );
    if (!matching.length) {
      findings.push(
        finding(
          "visual_coverage_missing",
          requirement.required ? "blocking" : "warning",
          "No visual source satisfies " + requirement.description,
          { requirementId: requirement.requirementId }
        )
      );
      continue;
    }
    if (
      evidenceRank(requirement.requiredEvidence) >
      Math.max(...matching.map(slot => evidenceRank(slot.evidenceStatus)))
    ) {
      findings.push(
        finding(
          "visual_evidence_insufficient",
          requirement.required ? "blocking" : "warning",
          "Visual evidence is below the required level for " + requirement.description,
          { requirementId: requirement.requirementId }
        )
      );
    }
  }
  return findings;
}

export function validateVisualUsageRef(
  usage: VisualUsageRef,
  snapshot: VisualSourceSnapshot
): VisualCoverageFinding[] {
  const parsed = visualUsageRefSchema.safeParse(usage);
  if (!parsed.success) {
    return [
      finding(
        "visual_usage_invalid",
        "blocking",
        parsed.error.issues[0]?.message ?? "Invalid visual usage"
      ),
    ];
  }
  const slot = snapshot.slots.find(item => item.slotId === usage.slotId);
  if (!slot) {
    return [
      finding(
        "visual_slot_missing",
        "blocking",
        "Visual slot is not in the approved snapshot",
        { slotId: usage.slotId }
      ),
    ];
  }
  const findings: VisualCoverageFinding[] = [];
  if (slot.semanticRole !== usage.semanticRole || slot.mediaType !== usage.mediaType) {
    findings.push(
      finding(
        "visual_role_conflict",
        "blocking",
        "Usage role or modality differs from the approved slot",
        { slotId: usage.slotId }
      )
    );
  }
  if (
    usage.snapshotRevision !== snapshot.revision ||
    usage.snapshotFingerprint !== snapshot.fingerprint
  ) {
    findings.push(
      finding(
        "visual_snapshot_stale",
        "blocking",
        "Usage was created from an older visual snapshot",
        { slotId: usage.slotId }
      )
    );
  }
  if (slot.evidenceStatus === "blocked" || slot.rightsStatus === "rejected") {
    findings.push(
      finding("visual_source_blocked", "blocking", "The selected visual source is blocked", {
        slotId: usage.slotId,
      })
    );
  }
  if (usage.mediaType === "video") {
    const segment = snapshot.segments.find(item => item.segmentId === usage.segmentId);
    if (!segment) {
      findings.push(
        finding("visual_segment_missing", "blocking", "Video usage has no matching segment", {
          slotId: usage.slotId,
        })
      );
    } else if (segment.revision !== usage.segmentRevision) {
      findings.push(
        finding(
          "visual_segment_stale",
          "blocking",
          "Video usage points to an older segment revision",
          { slotId: usage.slotId }
        )
      );
    } else if (
      usage.inSeconds == null ||
      usage.outSeconds == null ||
      usage.inSeconds < (segment.inSeconds ?? 0) ||
      usage.outSeconds > (segment.outSeconds ?? Number.POSITIVE_INFINITY) ||
      usage.outSeconds <= usage.inSeconds
    ) {
      findings.push(
        finding(
          "visual_segment_bounds_invalid",
          "blocking",
          "Video usage is outside the approved segment bounds",
          { slotId: usage.slotId }
        )
      );
    }
  } else if (
    usage.inSeconds != null ||
    usage.outSeconds != null ||
    usage.displayDurationSeconds == null
  ) {
    findings.push(
      finding(
        "visual_still_duration_invalid",
        "blocking",
        "Still B-roll requires a display duration and no video bounds",
        { slotId: usage.slotId }
      )
    );
  }
  return findings;
}

export function validateBrollTimeline(params: {
  bindings: readonly ShotBrollBinding[];
  durationBudgetSeconds: number;
}): VisualCoverageFinding[] {
  const findings: VisualCoverageFinding[] = [];
  const active = params.bindings.filter(binding => binding.active);
  const sorted = [...active].sort((a, b) => a.order - b.order);
  if (sorted.some((binding, index) => binding.order !== index)) {
    findings.push(
      finding(
        "broll_order_invalid",
        "blocking",
        "B-roll order must be contiguous and deterministic"
      )
    );
  }
  const duration = sorted.reduce((total, binding) => {
    const usage = binding.usage;
    return (
      total +
      (usage.mediaType === "video"
        ? Math.max(0, (usage.outSeconds ?? 0) - (usage.inSeconds ?? 0))
        : usage.displayDurationSeconds ?? 0)
    );
  }, 0);
  if (duration > params.durationBudgetSeconds) {
    findings.push(
      finding(
        "broll_duration_overflow",
        "blocking",
        "B-roll exceeds the episode/shot duration budget"
      )
    );
  }
  for (const binding of sorted) {
    if (
      binding.usage.semanticRole !== "b_roll_still" &&
      binding.usage.semanticRole !== "b_roll_footage"
    ) {
      findings.push(
        finding(
          "broll_role_invalid",
          "blocking",
          "Only still or footage B-roll roles can enter the B-roll timeline"
        )
      );
    }
    if (
      binding.usage.labelMode === "ai_illustration" &&
      binding.usage.mediaType !== "image"
    ) {
      findings.push(
        finding(
          "broll_label_invalid",
          "blocking",
          "AI illustration label is only valid for an image illustration"
        )
      );
    }
  }
  return findings;
}

export function visualSourceStaleReasons(params: {
  expectedRevision: number;
  expectedFingerprint: string;
  actualRevision: number;
  actualFingerprint: string;
  sourceChanged?: boolean;
  evidenceChanged?: boolean;
  rightsChanged?: boolean;
}): string[] {
  const reasons: string[] = [];
  if (
    params.expectedRevision !== params.actualRevision ||
    params.expectedFingerprint !== params.actualFingerprint
  ) {
    reasons.push("visual_source_snapshot_changed");
  }
  if (params.sourceChanged) reasons.push("source_media_changed");
  if (params.evidenceChanged) reasons.push("evidence_revision_changed");
  if (params.rightsChanged) reasons.push("rights_or_disclosure_changed");
  return reasons;
}

export function parseSourceMediaSegment(input: unknown): SourceMediaSegment {
  return sourceMediaSegmentSchema.parse(input);
}

export function parseVisualSourceSnapshot(input: unknown): VisualSourceSnapshot {
  return visualSourceSnapshotSchema.parse(input);
}

export function parseShotBrollBinding(input: unknown): ShotBrollBinding {
  return shotBrollBindingSchema.parse(input);
}
