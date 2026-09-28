import { describe, expect, it } from "vitest";
import {
  VD_SERIES_PROFILE_IDS,
  SERIES_PROFILE_REGISTRY,
  getSeriesProfile,
  type VdSeriesProfile,
} from "@shared/verticalDramaSeries/seriesProfile";
import { buildProductionContextSnapshot } from "@shared/verticalDramaSeries/verticalDramaAssuranceContext";
import type {
  ShotBrollBinding,
  VisualEvidenceStatus,
  VisualSemanticRole,
  VisualSourceSnapshot,
} from "@shared/verticalDramaSeries/visualSource";
import { createVisualSourceSnapshot } from "../verticalDramaVisualSourceSnapshotService";
import { admitVerticalDramaProfileSource } from "../verticalDramaProfileSourceAdmission";

const owner = { tenantId: "tenant-157", userId: 157 };
const hash = (value: string) => value.repeat(64).slice(0, 64);

function visualSnapshot(
  profile: VdSeriesProfile,
  options: {
    role?: VisualSemanticRole;
    mediaType?: "image" | "video";
    evidenceStatus?: VisualEvidenceStatus;
    rightsStatus?: string;
    disclosureStatus?: string;
    coverage?: boolean;
    segment?: boolean;
  } = {},
): VisualSourceSnapshot {
  const role = options.role ?? "reference";
  const mediaType = options.mediaType ?? "image";
  const slotId = "slot-157";
  return createVisualSourceSnapshot({
    snapshotId: `visual-${profile.profileId}`,
    revision: 1,
    packId: 157,
    profileId: profile.profileId,
    profileVersion: profile.version,
    slots: [
      {
        slotId,
        slotKey: "primary_source",
        title: "Primary source",
        description: null,
        semanticRole: role,
        mediaType,
        origin: "user_upload",
        evidenceStatus: options.evidenceStatus ?? "verified",
        sourceAssetId: 157,
        mediaAssetId: 157,
        segmentIds: options.segment ? ["segment-157"] : [],
        rightsStatus: options.rightsStatus ?? "creator_owned",
        disclosureStatus: options.disclosureStatus ?? "shown",
        factualScope: [],
        required: true,
        sortOrder: 0,
      },
    ],
    segments: options.segment
      ? [
          {
            segmentId: "segment-157",
            sourceAssetId: 157,
            revision: 1,
            mediaType: "video",
            inSeconds: 0,
            outSeconds: 5,
            displayDurationSeconds: null,
            label: "Approved footage",
            description: null,
            evidenceScope: [],
            captureAt: null,
            locationLabel: null,
            sourceLabel: "Managed upload",
            audioPolicy: "mute",
            status: "ready",
          },
        ]
      : [],
    coverage: options.coverage === false
      ? []
      : [
          {
            requirementId: "coverage-157",
            scope: "series",
            scopeKey: "series-157",
            description: "Primary approved source",
            allowedRoles: [role],
            allowedMediaTypes: [mediaType],
            requiredEvidence: profile.sourceGatePolicy === "required" ? "verified" : "none",
            required: true,
            fulfilledBySlotIds: [slotId],
          },
        ],
  });
}

function context(
  profile: VdSeriesProfile,
  options: {
    source?: "selected" | "missing";
    evidenceStatuses?: VisualEvidenceStatus[];
    rightsStatuses?: string[];
    disclosureStatuses?: string[];
    visual?: VisualSourceSnapshot;
  } = {},
) {
  const visual = options.visual ?? visualSnapshot(profile);
  const selected = options.source ?? (profile.sourceGatePolicy === "required" ? "selected" : "missing");
  return buildProductionContextSnapshot({
    schemaVersion: 1,
    snapshotId: `context-${profile.profileId}`,
    revision: 1,
    seriesId: 157,
    profile: {
      profileId: profile.profileId,
      version: profile.version,
      contentKind: profile.contentKind,
      visualGroundingVersion: profile.visualVersion,
      visualGroundingFingerprint: visual.fingerprint,
      factPolicyVersion: profile.version,
      brollPolicyVersion: profile.version,
    },
    // A missing required source is represented as an optional authoring
    // snapshot so the admission service can return a typed blocking finding;
    // the shared context schema itself correctly rejects explicit_none for a
    // required-source production snapshot.
    sourcePackPolicy: selected === "selected" ? profile.sourceGatePolicy : "optional",
    sourcePackDecision: selected === "selected" ? "selected" : "explicit_none",
    sourcePack: selected === "selected"
      ? {
          packId: 157,
          version: 1,
          fingerprint: hash("a"),
          readiness: "production_ready",
          slotKeys: ["primary_source"],
          assetIds: [157],
          segmentIds: [],
          semanticRoles: ["reference"],
          evidenceStatuses: options.evidenceStatuses ?? ["verified"],
          rightsStatuses: options.rightsStatuses ?? ["creator_owned"],
          disclosureStatuses: options.disclosureStatuses ?? ["shown"],
        }
      : null,
    visualSource: {
      snapshotId: visual.snapshotId,
      revision: visual.revision,
      fingerprint: visual.fingerprint,
      visualCanonVersion: profile.visualVersion,
      visualCanonFingerprint: visual.fingerprint,
    },
    claimLedger: null,
    coveragePlan: null,
    references: {
      storyControlRefs: [],
      characterRefs: [],
      sceneRefs: [],
      shotRefs: [],
      claimRefs: [],
      coverageRefs: [],
      slotRefs: [],
      assetRefs: [],
      segmentRefs: [],
      mediaBindingRefs: [],
    },
  });
}

function admit(profile: VdSeriesProfile, options: Parameters<typeof context>[1] & {
  stage?: "authoring" | "draft_ready" | "provider_ready" | "production_ready";
  usages?: Parameters<typeof admitVerticalDramaProfileSource>[0]["usages"];
  brollBindings?: ShotBrollBinding[];
  managedMedia?: Parameters<typeof admitVerticalDramaProfileSource>[0]["managedMedia"];
  expectedContextRef?: { snapshotId: string; revision: number; fingerprint: string };
} = {}) {
  const visual = options.visual ?? visualSnapshot(profile);
  const snapshot = context(profile, { ...options, visual });
  return admitVerticalDramaProfileSource({
    owner,
    expectedOwner: owner,
    expectedSeriesId: 157,
    profile,
    snapshot,
    expectedContextRef: options.expectedContextRef ?? snapshot,
    visualSnapshot: visual,
    stage: options.stage ?? "provider_ready",
    usages: options.usages ?? [],
    brollBindings: options.brollBindings ?? [],
    managedMedia: options.managedMedia ?? [{ mediaAssetId: 157, exists: true, playable: true }],
  });
}

describe("vertical drama profile/source admission", () => {
  it("derives an eligible provider admission fixture from every registry profile", () => {
    expect(new Set(VD_SERIES_PROFILE_IDS)).toEqual(
      new Set(SERIES_PROFILE_REGISTRY.map(profile => profile.profileId)),
    );
    for (const profileId of VD_SERIES_PROFILE_IDS) {
      const result = admit(getSeriesProfile(profileId));
      expect(result, profileId).toMatchObject({ allowed: true, disposition: "admitted" });
    }
  });

  it.each(SERIES_PROFILE_REGISTRY.filter(profile => profile.sourceGatePolicy === "required"))(
    "requires server-proven source evidence for %s.profileId",
    profile => {
      expect(admit(profile, { source: "missing" })).toMatchObject({
        allowed: false,
        findings: expect.arrayContaining([expect.objectContaining({ code: "source_pack_missing", severity: "blocking" })]),
      });
    },
  );

  it("keeps missing sources advisory for preview but blocks the paid/export boundaries", () => {
    const documentary = getSeriesProfile("documentary");
    expect(admit(documentary, { source: "missing", stage: "authoring" })).toMatchObject({
      allowed: true,
      disposition: "needs_review",
      findings: expect.arrayContaining([expect.objectContaining({ code: "source_pack_missing", severity: "advisory" })]),
    });
    for (const stage of ["provider_ready", "production_ready"] as const) {
      expect(admit(documentary, { source: "missing", stage })).toMatchObject({ allowed: false });
    }
  });

  it("fails stale evidence, pending rights, and required disclosures only at a hard boundary", () => {
    const review = getSeriesProfile("product_review");
    const hard = admit(review, {
      evidenceStatuses: ["stale"],
      rightsStatuses: ["pending"],
      disclosureStatuses: ["required"],
    });
    expect(hard).toMatchObject({
      allowed: false,
      findings: expect.arrayContaining([
        expect.objectContaining({ code: "evidence_stale" }),
        expect.objectContaining({ code: "rights_not_ready" }),
        expect.objectContaining({ code: "disclosure_not_shown" }),
      ]),
    });
    expect(admit(review, {
      stage: "authoring",
      evidenceStatuses: ["stale"],
      rightsStatuses: ["pending"],
      disclosureStatuses: ["required"],
    })).toMatchObject({ allowed: true, disposition: "needs_review" });
  });

  it("preserves attached-media roles and managed-media availability without implicit conversion", () => {
    const profile = getSeriesProfile("location_review");
    const visual = visualSnapshot(profile, { role: "reference" });
    const current = context(profile, { visual });
    const invalidUsage = {
      usageId: "usage-157",
      slotId: "slot-157",
      semanticRole: "scene_anchor" as const,
      mediaType: "image" as const,
      sourceAssetId: 157,
      mediaAssetId: 157,
      segmentId: null,
      segmentRevision: null,
      inSeconds: null,
      outSeconds: null,
      displayDurationSeconds: 2,
      audioPolicy: "mute" as const,
      labelMode: "source" as const,
      snapshotRevision: visual.revision,
      snapshotFingerprint: visual.fingerprint,
    };
    const result = admitVerticalDramaProfileSource({
      owner,
      expectedOwner: owner,
      expectedSeriesId: 157,
      profile,
      snapshot: current,
      expectedContextRef: current,
      visualSnapshot: visual,
      stage: "provider_ready",
      usages: [invalidUsage],
      brollBindings: [],
      managedMedia: [{ mediaAssetId: 157, exists: false, playable: false }],
    });
    expect(result).toMatchObject({
      allowed: false,
      findings: expect.arrayContaining([
        expect.objectContaining({ code: "visual_role_conflict" }),
        expect.objectContaining({ code: "managed_media_unavailable" }),
      ]),
    });
  });

  it("validates B-roll through the existing role, segment, and timeline authorities", () => {
    const profile = getSeriesProfile("news_report");
    const visual = visualSnapshot(profile, { role: "b_roll_footage", mediaType: "video", segment: true });
    const binding: ShotBrollBinding = {
      bindingId: "binding-157",
      episodeId: 1,
      shotNumber: 1,
      usage: {
        usageId: "usage-157",
        slotId: "slot-157",
        semanticRole: "reference",
        mediaType: "video",
        sourceAssetId: 157,
        mediaAssetId: 157,
        segmentId: "segment-157",
        segmentRevision: 1,
        inSeconds: 0,
        outSeconds: 5,
        displayDurationSeconds: null,
        audioPolicy: "mute",
        labelMode: "source",
        snapshotRevision: visual.revision,
        snapshotFingerprint: visual.fingerprint,
      },
      order: 0,
      fitMode: "cover",
      active: true,
      status: "ready",
    };
    expect(admit(profile, { visual, brollBindings: [binding] })).toMatchObject({
      allowed: false,
      findings: expect.arrayContaining([expect.objectContaining({ code: "visual_role_conflict" })]),
    });
  });

  it("fences a stale production-context reference before exposing resource details", () => {
    const profile = getSeriesProfile("software_review");
    const result = admit(profile, {
      expectedContextRef: { snapshotId: "old", revision: 1, fingerprint: hash("f") },
    });
    expect(result).toEqual(expect.objectContaining({
      allowed: false,
      findings: [expect.objectContaining({ code: "VD_ASSURANCE_CONTEXT_STALE", target: null })],
    }));
  });
});
