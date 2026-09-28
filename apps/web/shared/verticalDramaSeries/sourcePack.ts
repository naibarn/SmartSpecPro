import { z } from "zod";
import type { VdSeriesProfile } from "./seriesProfile";

export const VD_SOURCE_KINDS = [
  "known_place",
  "coordinates",
  "product_snapshot",
  "software_review",
  "upload_image",
  "upload_video",
  "generated_reference",
  "documentary_note",
  "custom",
] as const;
export type VdSourceKind = (typeof VD_SOURCE_KINDS)[number];

export const VD_SOURCE_RIGHTS_STATUSES = [
  "pending",
  "creator_owned",
  "licensed",
  "restricted",
  "rejected",
] as const;
export type VdSourceRightsStatus = (typeof VD_SOURCE_RIGHTS_STATUSES)[number];
export const VD_SOURCE_DISCLOSURE_STATUSES = [
  "not_required",
  "required",
  "shown",
] as const;
export type VdSourceDisclosureStatus =
  (typeof VD_SOURCE_DISCLOSURE_STATUSES)[number];

export const VD_SOURCE_PACK_STATUSES = [
  "draft",
  "analyzing",
  "needs_review",
  "draft_ready",
  "production_ready",
  "failed",
  "stale",
  "blocked",
] as const;
export type VdSourcePackStatus = (typeof VD_SOURCE_PACK_STATUSES)[number];

export const verticalDramaSourceSlotInputSchema = z.object({
  slotId: z.number().int().positive().optional(),
  slotKey: z.string().trim().min(1).max(96),
  title: z.string().trim().min(1).max(180),
  narrativeDescription: z.string().trim().max(5000).nullable().optional(),
  sourceKind: z.enum(VD_SOURCE_KINDS).default("custom"),
  required: z.boolean().default(false),
  usagePolicy: z
    .enum(["reference", "broll", "insert", "overlay"])
    .default("reference"),
  sourceAssetId: z.number().int().positive().nullable().optional(),
  version: z.number().int().positive().optional(),
  sortOrder: z.number().int().min(0).max(100000).default(0),
});
export type VdSourceSlotInput = z.infer<
  typeof verticalDramaSourceSlotInputSchema
>;

export const verticalDramaSourceAssetInputSchema = z.object({
  clientMutationKey: z.string().trim().min(16).max(128).optional(),
  sourceKind: z.enum(VD_SOURCE_KINDS),
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(5000).nullable().optional(),
  mediaAssetId: z.number().int().positive().nullable().optional(),
  provenance: z.record(z.string(), z.unknown()).default({}),
  rightsStatus: z.enum(VD_SOURCE_RIGHTS_STATUSES).default("pending"),
  disclosureStatus: z
    .enum(VD_SOURCE_DISCLOSURE_STATUSES)
    .default("not_required"),
});
export type VdSourceAssetInput = z.infer<
  typeof verticalDramaSourceAssetInputSchema
>;

export type VdSourcePackSlotForReadiness = {
  slotKey: string;
  required: boolean;
  narrativeDescription: string | null;
  sourceAssetId: number | null;
  status: string;
};

export type VdSourceAssetForReadiness = {
  id: number;
  /** Source kind is needed for the profile-level image gate. */
  sourceKind?: string;
  /** A managed media reference proves that an actual visual asset is attached. */
  mediaAssetId?: number | null;
  rightsStatus: string;
  disclosureStatus: string;
  analysisStatus: string;
};

export type VdSourcePackReadiness = {
  status: VdSourcePackStatus;
  draftReady: boolean;
  productionReady: boolean;
  textDraftAllowed: boolean;
  productionRenderAllowed: boolean;
  blockingItems: Array<{ code: string; slotKey?: string; message: string }>;
  repairableItems: Array<{ code: string; slotKey?: string; message: string }>;
};

export function evaluateSourcePackReadiness(params: {
  profile: VdSeriesProfile;
  slots: VdSourcePackSlotForReadiness[];
  assets: VdSourceAssetForReadiness[];
  promptExpansion?: {
    approved: boolean;
  };
}): VdSourcePackReadiness {
  if (params.profile.sourceGatePolicy === "optional") {
    return {
      status: "draft_ready",
      draftReady: true,
      productionReady: true,
      textDraftAllowed: true,
      productionRenderAllowed: true,
      blockingItems: [],
      repairableItems: [],
    };
  }

  if (params.promptExpansion && !params.promptExpansion.approved) {
    return {
      status: "blocked",
      draftReady: false,
      productionReady: false,
      textDraftAllowed: false,
      productionRenderAllowed: false,
      blockingItems: [
        {
          code: "prompt_expansion_required",
          message: "Approve the expanded premise before preparing source slots",
        },
      ],
      repairableItems: [],
    };
  }

  const assets = new Map(params.assets.map(asset => [asset.id, asset]));
  const blockingItems: VdSourcePackReadiness["blockingItems"] = [];
  const repairableItems: VdSourcePackReadiness["repairableItems"] = [];

  // Review/documentary profiles are visual-first: a text-only source pack can
  // satisfy the narrative slot contract, but it cannot produce trustworthy
  // B-roll or let the creator compare the generated story against the source
  // image. Require at least one real attached image before Draft is allowed.
  const requiresAttachedImage =
    params.profile.sourceGatePolicy === "required" &&
    params.profile.defaultSlots.some(
      slot => slot.required && slot.acceptedKinds.includes("image")
    );
  if (requiresAttachedImage) {
    const hasAttachedImage = params.assets.some(
      asset =>
        typeof asset.mediaAssetId === "number" &&
        asset.mediaAssetId > 0 &&
        asset.sourceKind !== "upload_video"
    );
    if (!hasAttachedImage) {
      blockingItems.push({
        code: "reference_image_required",
        message:
          "Attach at least one image reference before creating the Draft",
      });
    }
  }

  // Once the creator approves a prompt expansion, its slot plan becomes the
  // source of truth. Profile defaults remain the compatibility path for
  // callers that do not use prompt expansion (for example older packs).
  const requiredProfileSlots = params.promptExpansion?.approved
    ? []
    : params.profile.defaultSlots.filter(item => item.required);

  for (const preset of requiredProfileSlots) {
    const actual = params.slots.find(item => item.slotKey === preset.key);
    if (!actual) {
      blockingItems.push({
        code: "required_slot_missing",
        slotKey: preset.key,
        message: `Required source slot is missing: ${preset.title}`,
      });
      continue;
    }
    if (!actual.narrativeDescription?.trim()) {
      repairableItems.push({
        code: "slot_description_missing",
        slotKey: actual.slotKey,
        message: "Add what this source should communicate to viewers",
      });
    }
    if (!actual.sourceAssetId && actual.status !== "accepted_text") {
      repairableItems.push({
        code: "slot_source_missing",
        slotKey: actual.slotKey,
        message: "Attach an image, video, metadata, or accepted text source",
      });
    }
  }

  for (const slot of params.slots.filter(item => item.required)) {
    if (!slot.narrativeDescription?.trim()) {
      repairableItems.push({
        code: "slot_description_missing",
        slotKey: slot.slotKey,
        message: "Describe the story purpose of this source",
      });
    }
    if (slot.sourceAssetId) {
      const asset = assets.get(slot.sourceAssetId);
      if (!asset) {
        blockingItems.push({
          code: "asset_not_found",
          slotKey: slot.slotKey,
          message: "The linked source asset is unavailable",
        });
      } else if (asset.rightsStatus === "rejected") {
        blockingItems.push({
          code: "asset_rights_rejected",
          slotKey: slot.slotKey,
          message: "Replace the source or resolve its rights",
        });
      } else if (asset.rightsStatus === "pending") {
        repairableItems.push({
          code: "asset_rights_pending",
          slotKey: slot.slotKey,
          message: "Confirm usage rights before production",
        });
      }
      if (asset && asset.analysisStatus === "failed") {
        repairableItems.push({
          code: "asset_analysis_failed",
          slotKey: slot.slotKey,
          message: "Retry source analysis or provide the description manually",
        });
      }
    }
  }

  const draftReady = blockingItems.length === 0 && repairableItems.length === 0;
  const boundAssetIds = new Set(
    params.slots
      .map(slot => slot.sourceAssetId)
      .filter((assetId): assetId is number => assetId != null)
  );
  const productionReady =
    draftReady &&
    params.assets
      .filter(asset => boundAssetIds.has(asset.id))
      .every(
        asset =>
          asset.rightsStatus === "creator_owned" ||
          asset.rightsStatus === "licensed" ||
          (asset.rightsStatus === "restricted" &&
            asset.disclosureStatus === "shown")
      );
  if (draftReady && !productionReady) {
    repairableItems.push({
      code: "production_rights_pending",
      message:
        "Text drafting is ready; production needs approved rights/disclosure",
    });
  }
  return {
    status: productionReady
      ? "production_ready"
      : draftReady
        ? "draft_ready"
        : blockingItems.length
          ? "blocked"
          : "needs_review",
    draftReady,
    productionReady,
    textDraftAllowed: draftReady,
    productionRenderAllowed: productionReady,
    blockingItems,
    repairableItems,
  };
}

export function buildSourcePackDigest(params: {
  packId: number;
  packVersion: number;
  profile: VdSeriesProfile;
  slots: Array<
    Pick<
      VdSourcePackSlotForReadiness,
      "slotKey" | "narrativeDescription" | "sourceAssetId" | "required"
    > & { title: string; sourceKind: string; usagePolicy?: string }
  >;
    assets: Array<
      Pick<
        VdSourceAssetForReadiness,
      "id" | "sourceKind" | "mediaAssetId" | "rightsStatus" | "disclosureStatus"
      > & {
      title: string;
      description: string | null;
      provenance: Record<string, unknown> | null;
    }
  >;
}) {
  const assetById = new Map(params.assets.map(asset => [asset.id, asset]));
  return {
    version: 1,
    packId: params.packId,
    packVersion: params.packVersion,
    profileId: params.profile.profileId,
    visualVersion: params.profile.visualVersion,
    grounding: params.profile.grounding,
    slots: params.slots.slice(0, 128).map(slot => {
      const asset = slot.sourceAssetId
        ? assetById.get(slot.sourceAssetId)
        : undefined;
      return {
        slotKey: slot.slotKey,
        title: slot.title,
        narrativeDescription: slot.narrativeDescription?.slice(0, 1000) ?? null,
        required: slot.required,
        sourceKind: slot.sourceKind,
        usagePolicy: slot.usagePolicy ?? "reference",
        source: asset
          ? {
              id: asset.id,
              sourceKind: asset.sourceKind,
              mediaAssetId: asset.mediaAssetId ?? null,
              title: asset.title,
              description: asset.description?.slice(0, 1200) ?? null,
              provenance: asset.provenance,
              rightsStatus: asset.rightsStatus,
              disclosureStatus: asset.disclosureStatus,
            }
          : null,
      };
    }),
  };
}

export function buildSourcePackBrollManifest(params: {
  packId: number;
  packVersion: number;
  profile: VdSeriesProfile;
  slots: Array<{
    slotKey: string;
    title: string;
    narrativeDescription: string | null;
    sourceAssetId: number | null;
    usagePolicy: string;
    sourceKind: string;
  }>;
  assets: Array<{
    id: number;
    title: string;
    mediaAssetId: number | null;
    provenance: Record<string, unknown> | null;
    rightsStatus: string;
    disclosureStatus: string;
  }>;
}) {
  const assets = new Map(params.assets.map(asset => [asset.id, asset]));
  return {
    version: 1,
    packId: params.packId,
    packVersion: params.packVersion,
    profileId: params.profile.profileId,
    entries: params.slots
      .filter(
        slot =>
          slot.sourceAssetId &&
          ["broll", "insert", "overlay"].includes(slot.usagePolicy)
      )
      .slice(0, 256)
      .map(slot => {
        const asset = slot.sourceAssetId
          ? assets.get(slot.sourceAssetId)
          : undefined;
        const productionEligible = Boolean(
          asset &&
          asset.mediaAssetId &&
          (asset.rightsStatus === "creator_owned" ||
            asset.rightsStatus === "licensed" ||
            (asset.rightsStatus === "restricted" &&
              asset.disclosureStatus === "shown"))
        );
        return {
          slotKey: slot.slotKey,
          title: slot.title,
          narrativeDescription:
            slot.narrativeDescription?.slice(0, 1000) ?? null,
          usagePolicy: slot.usagePolicy,
          sourceKind: slot.sourceKind,
          sourceAssetId: slot.sourceAssetId,
          mediaAssetId: asset?.mediaAssetId ?? null,
          provenance: asset?.provenance ?? null,
          productionEligible,
          blockedReason: productionEligible
            ? null
            : "Rights, disclosure, or managed media is not ready",
        };
      }),
  };
}

export function renderSourcePackDigestPromptBlock(
  digest: Record<string, unknown> | undefined
): string {
  if (!digest) return "";
  const slots = Array.isArray(digest.slots)
    ? digest.slots.slice(0, 128).map(raw => {
        const slot =
          raw && typeof raw === "object"
            ? (raw as Record<string, unknown>)
            : {};
        const source =
          slot.source && typeof slot.source === "object"
            ? (slot.source as Record<string, unknown>)
            : null;
        return {
          slotKey: typeof slot.slotKey === "string" ? slot.slotKey : null,
          title: typeof slot.title === "string" ? slot.title : null,
          narrativeDescription:
            typeof slot.narrativeDescription === "string"
              ? slot.narrativeDescription.slice(0, 1000)
              : null,
          sourceKind: typeof slot.sourceKind === "string" ? slot.sourceKind : null,
          usagePolicy: typeof slot.usagePolicy === "string" ? slot.usagePolicy : "reference",
          attachedSource:
            source && {
              title: typeof source.title === "string" ? source.title : null,
              description:
                typeof source.description === "string"
                  ? source.description.slice(0, 1200)
                  : null,
            },
        };
      })
    : [];
  const workerMediaEvidence = Array.isArray(digest.workerMediaEvidence)
    ? digest.workerMediaEvidence.slice(0, 16).flatMap(raw => {
        if (!raw || typeof raw !== "object") return [];
        const item = raw as Record<string, unknown>;
        return [{
          mediaAssetId: typeof item.mediaAssetId === "string" ? item.mediaAssetId : null,
          score: Number.isFinite(Number(item.score)) ? Number(item.score) : null,
          searchableText: typeof item.searchableText === "string" ? item.searchableText.slice(0, 1200) : "",
          tags: Array.isArray(item.tags) ? item.tags.filter((value): value is string => typeof value === "string").slice(0, 16) : [],
          subjects: Array.isArray(item.subjectLabels) ? item.subjectLabels.filter((value): value is string => typeof value === "string").slice(0, 16) : [],
          sourceTimeRanges: Array.isArray(item.sourceTimeRanges) ? item.sourceTimeRanges.slice(0, 16) : [],
          silenceSegments: Array.isArray(item.silenceSegments) ? item.silenceSegments.slice(0, 16) : [],
          transform: item.transform && typeof item.transform === "object" ? item.transform : null,
        }];
      })
    : [];
  if (slots.length === 0 && workerMediaEvidence.length === 0) return "";
  const blocks: string[] = [];
  if (slots.length > 0) {
    blocks.push(
      "SOURCE PACK GROUNDING (AUTHORITATIVE CREATOR-PROVIDED EVIDENCE):",
      JSON.stringify({
        profileId: digest.profileId,
        visualVersion: digest.visualVersion,
        grounding: digest.grounding,
        slots,
      }),
      "Use these source slots and descriptions as the factual/evidentiary spine for the selected profile.",
      "When an attached image is described in a slot, treat that description as the visual truth for the matching scene and B-roll; preserve the described identity, setting, and visible details rather than generating an unrelated generic image.",
      "For slots marked broll, insert, or overlay, make the episode beat and shot summary explicitly compatible with that source so a later B-roll attachment is narratively aligned.",
      "Do not invent claims about a place, product, restaurant, software, or uploaded media that are not supported by the source pack.",
      "A source description explains what the creator wants viewers to understand; it is not permission to fabricate measurements, prices, reviews, or historical facts.",
      "Keep every required slot represented in the long-form plan or explicitly mark it as not applicable with a creator-facing warning.",
    );
  }
  if (workerMediaEvidence.length > 0) {
    blocks.push(
      "WORKER MEDIA INTELLIGENCE (SERIES-SCOPED DERIVED FOOTAGE EVIDENCE):",
      JSON.stringify(workerMediaEvidence),
      "Use these derived-media labels, source time ranges, silence intervals, and transform facts to align episode beats and B-roll recommendations with footage that actually exists.",
      "Treat media evidence as bounded observations, not permission to invent facts absent from the evidence. Recommend the mediaAssetId and source time range when a shot can use it.",
    );
  }
  return blocks.join("\n");
}
