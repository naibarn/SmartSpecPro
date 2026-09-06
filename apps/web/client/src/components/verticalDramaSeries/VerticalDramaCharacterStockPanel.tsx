/**
 * VerticalDramaCharacterStockPanel (spec feature 131, section-05 · §7.1 / §7.2 / §7.3).
 *
 * The durable per-series character-stock surface: the character roster on the
 * left, and — for the selected character — its reference-asset stock (approved /
 * pending / stale) plus the durable stock manifest on the right. Add a character,
 * import an existing canonical media asset as a reference, then approve / reject /
 * mark-stale it through the state machine. Nothing here triggers paid generation.
 *
 * Consumes only `trpc.verticalDramaCharacters.*`. Covers the section State Matrix
 * (loading / empty / error / selected) and Accessibility Acceptance:
 *  - status is conveyed by icon + text, never color alone,
 *  - every control has an accessible name,
 *  - inline Thai/English copy driven by the shared language hook.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  Grid3x3,
  Copy,
  ImagePlus,
  Loader2,
  Merge,
  Pencil,
  Plus,
  Shirt,
  ScanFace,
  Sparkles,
  Trash2,
  UploadCloud,
  User,
  Users,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { TRPCClientError } from "@trpc/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AuthenticatedMediaImage } from "@/components/media/AuthenticatedMediaImage";
import { trpc } from "@/lib/trpc";
import { classifyError } from "@/lib/systemErrorMonitor";
import {
  isNetworkConnectionError,
  retryDelayMs,
  RETRYABLE_QUERY_MAX_ATTEMPTS,
} from "@/lib/requestResilience";
import { rateLimitBackoffMs } from "@/lib/rateLimitBackoff";
import { SerializedMediaPollScheduler } from "@/lib/mediaPollScheduler";
import { useVerticalDramaLang } from "@/components/verticalDramaSeries/verticalDramaCopy";
import { VD_COPY } from "@/components/verticalDramaSeries/verticalDramaWorkspaceCopy";
import { VerticalDramaCharacterReferencePanel } from "@/components/verticalDramaSeries/VerticalDramaCharacterReferencePanel";
import { VerticalDramaCharacterVoiceCastingCard } from "@/components/verticalDramaSeries/VerticalDramaCharacterVoiceCastingCard";
import { useVerticalDramaCreditConfirmation } from "@/components/verticalDramaSeries/VerticalDramaCreditConfirmDialog";
import { VerticalDramaCharacterMergeReviewDialog } from "@/components/verticalDramaSeries/VerticalDramaCharacterMergeReviewDialog";
import type {
  VerticalDramaCharacterVoiceConfig,
  VerticalDramaVoiceCatalogEntry,
} from "@shared/verticalDramaSeries/voiceCasting";
import {
  speechProfileSchema,
  VD_SPEECH_PROFILE_SPEAKING_SPEEDS,
  VD_SPEECH_PROFILE_VOCABULARY_LEVELS,
  VD_SPEECH_PROFILE_SENTENCE_LENGTHS,
  VD_SPEECH_PROFILE_METAPHOR_USAGE,
  type VerticalDramaSpeechProfile,
} from "@shared/verticalDramaSeries/speechProfile";
import ImageSourcePicker, {
  readDroppedImageInput,
  readFileAsDataUrl,
} from "@/components/media/ImageSourcePicker";
import ModelSelectorDialog, {
  type MediaModel,
} from "@/components/media/ModelSelectorDialog";
import { McpConnectionPicker } from "@/components/media/McpConnectionPicker";
import { HermesConnectionPicker } from "@/components/media/HermesConnectionPicker";
import {
  formatHermesErrorForToast,
  presentHermesError,
} from "@/lib/hermesErrorPresentation";
import { MediaPromptPreview } from "@/components/chat/MediaPromptPreview";
import { ImageLightbox } from "@/components/chat/media/ImageLightbox";
import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { Grid } from "@astryxdesign/core/Grid";
import { SelectableCard } from "@astryxdesign/core/SelectableCard";
import { resolveMediaModelTransportConfig } from "@shared/mediaModelTransport";
import { splitImage, type SplitResult } from "@/lib/imageGridSplitter";
import { parseAgeStageVariantRequiredMessage } from "@shared/verticalDramaSeries/ageStageVariant";
import type {
  VerticalDramaCharacterAsset,
  VdCharacterNeedsSetupReason,
} from "@shared/verticalDramaSeries/characterAssets";
import type { VerticalDramaApprovedCharacterDesignSnapshot } from "@shared/verticalDramaSeries/characterProfile";
import {
  isCharacterIdentityDnaStale,
  readCharacterIdentityDna,
  readCharacterIdentityDnaRevision,
  type VerticalDramaCharacterIdentityDnaEdit,
} from "@shared/verticalDramaSeries/characterDnaEditor";
import {
  VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS,
  VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_LABELS_EN,
  VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_LABELS_TH,
  normalizeTargetAudienceRegion,
  type VerticalDramaTargetAudienceRegion,
} from "@shared/verticalDramaSeries/targetAudienceRegion";
import { looksLikeCharacterLookStoryLeak } from "@shared/verticalDramaSeries/characterLookSelection";
import {
  VERTICAL_DRAMA_CHARACTER_CASTING_LOOKS,
  VERTICAL_DRAMA_CHARACTER_CASTING_LOOK_LABELS_EN,
  VERTICAL_DRAMA_CHARACTER_CASTING_LOOK_LABELS_TH,
  VERTICAL_DRAMA_CHARACTER_CASTING_REGIONS,
  VERTICAL_DRAMA_CHARACTER_CASTING_REGION_LABELS_EN,
  VERTICAL_DRAMA_CHARACTER_CASTING_REGION_LABELS_TH,
  VERTICAL_DRAMA_CHARACTER_CASTING_FORM_DEFAULTS,
  buildVerticalDramaCharacterCastingPreferences,
  characterCastingFormFromData,
  type VerticalDramaCharacterCastingFormState,
} from "@shared/verticalDramaSeries/characterCasting";
import {
  ROLE_TIER_LABELS,
  ROLE_TIER_VALUES,
  roleTierToNarrativeRole,
  type RoleTier,
} from "@shared/verticalDramaSeries/narrativeRole";
import { isCharacterLockPolicyFailureMessage } from "@shared/verticalDramaSeries/characterLock";

export const CHARACTER_EDITOR_SECTION_ID = "vd-character-reference-disclosure";

export function scrollToCharacterEditor(): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  window.requestAnimationFrame(() => {
    const target = document.getElementById(CHARACTER_EDITOR_SECTION_ID);
    if (!target) return;
    const prefersReducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });
  });
}

type VdCharacterIdentityDnaFormState = VerticalDramaCharacterIdentityDnaEdit;
type VdCharacterIdentityDnaFormPatch = {
  ageRange?: string;
  faceIdentity?: Partial<VdCharacterIdentityDnaFormState["faceIdentity"]>;
};

const VD_CHARACTER_IDENTITY_DNA_FIELDS = [
  ["facialGeometry", "โครงหน้า", "Facial geometry"],
  ["eyesAndGaze", "ดวงตาและสายตา", "Eyes and gaze"],
  ["brows", "คิ้ว", "Brows"],
  ["nose", "จมูก", "Nose"],
  ["lipsAndSmile", "ปากและรอยยิ้ม", "Lips and smile"],
  ["skinAndTexture", "สีผิวและผิวสัมผัส", "Skin and texture"],
  ["hair", "เส้นผมและทรงผม", "Hair and hairstyle"],
  ["distinctiveAsymmetry", "จุดเด่น/ความไม่สมมาตร", "Distinctive asymmetry"],
] as const;

export function characterIdentityDnaFormFromData(
  data: Record<string, unknown> | null | undefined
): VdCharacterIdentityDnaFormState | null {
  const dna = readCharacterIdentityDna(data);
  if (!dna) return null;
  return {
    ageRange: dna.ageRange,
    faceIdentity: { ...dna.faceIdentity },
  };
}

export function characterVisualBibleFromData(
  data: Record<string, unknown> | null | undefined
): Record<string, unknown> | undefined {
  const value = data?.visualBible;
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
import { safeStorageGet, safeStorageSet } from "@/lib/safeLocalStorage";

function getCanonicalRoleLabel(
  roleTier: string | null | undefined,
  lang: "th" | "en"
): string | null {
  if (!roleTier || !(roleTier in ROLE_TIER_LABELS)) return null;
  const label = ROLE_TIER_LABELS[roleTier as keyof typeof ROLE_TIER_LABELS];
  return lang === "th" ? label.th : label.en;
}

/**
 * Set B (`vd-stuck-generation-and-lost-characters` plan, 2026-07-16) —
 * composes the roster "needs setup" badge label from a character's
 * `needsSetupReasons` (`VdCharacterNeedsSetupReason[]`, computed
 * server-side by `characterRowToDto`/`computeCharacterNeedsSetupReasons`;
 * see that function's own doc comment for what each reason means).
 * `"auto_registered_from_story"` always wins — it's the single most
 * actionable message (the row exists only because the deep-draft LLM
 * introduced this character; nothing has been done on it yet) — otherwise
 * composes from whichever of `missing_portrait`/`missing_dna` apply so a
 * manually-created character missing just one of the two still gets a
 * precise label instead of the generic auto-registered one. Falls back to
 * a generic label for the (should-be-impossible) case of `needsSetup: true`
 * with an empty reasons array, rather than rendering nothing.
 */
export function needsSetupBadgeLabel(
  lang: "th" | "en",
  reasons: readonly VdCharacterNeedsSetupReason[]
): string {
  if (reasons.includes("auto_registered_from_story")) {
    return lang === "th"
      ? "auto-สร้างจากเรื่อง — ยังต้องทำ DNA/ภาพ"
      : "Auto-created from story — needs DNA/portrait";
  }
  const parts: string[] = [];
  if (reasons.includes("missing_portrait")) {
    parts.push(lang === "th" ? "ยังไม่มีภาพ" : "no portrait");
  }
  if (reasons.includes("missing_dna")) {
    parts.push(lang === "th" ? "ยังไม่มี DNA" : "no DNA");
  }
  if (parts.length === 0) {
    return lang === "th" ? "ยังต้องตั้งค่า" : "Needs setup";
  }
  return `${lang === "th" ? "ยังต้องตั้งค่า" : "Needs setup"}: ${parts.join(", ")}`;
}

/**
 * Best-effort character description for display — mirrors the server-side
 * `extractCharacterDescription` in `server/routers/verticalDramaCharacters.ts`
 * (kept in sync deliberately; there is no single `description` field, only a
 * free-form `data` payload with personality/backstory/identityLock/wardrobeRules).
 */
const VD_CHARACTER_IMAGE_MODEL_STORAGE_KEY =
  "smartspec_vd_character_image_model";

/** Separate remembered model for image-to-image / EDIT renders
 *  (`planning/vd-character-image-edit-model/plan.md`). Its own key, so an
 *  existing user's remembered text-to-image model survives untouched and the
 *  edit slot simply starts empty (= keep using the t2i model, previous
 *  behavior). */
const VD_CHARACTER_EDIT_IMAGE_MODEL_STORAGE_KEY =
  "smartspec_vd_character_edit_image_model";

/**
 * Character image providers can legitimately take longer than the old
 * five-minute browser window (especially MCP-backed models). Keep polling
 * bounded, but give the task the same 30-minute SLA the user sees in Media
 * History before declaring that the page cannot finalize it.
 */
export const VD_CHARACTER_IMAGE_POLL_INTERVAL_MS = 2500;
export const VD_CHARACTER_IMAGE_POLL_TIMEOUT_MS = 30 * 60 * 1000;
export const VD_CHARACTER_IMAGE_POLL_MAX_ATTEMPTS = Math.ceil(
  VD_CHARACTER_IMAGE_POLL_TIMEOUT_MS / VD_CHARACTER_IMAGE_POLL_INTERVAL_MS
);

/** Shared MCP-connection localStorage key — same key
 *  `VerticalDramaEpisodePage.tsx` reads/writes, so a connection picked on
 *  either surface carries over automatically. */
const MCP_CONNECTION_ID_STORAGE_KEY = "smartspec_mcp_connection_id";
const CHARACTER_PROMPT_JOB_STORAGE_PREFIX = "vd_character_prompt_job:";

type StoredCharacterPromptJob = {
  jobId: string;
  characterId: string;
};

function characterPromptJobStorageKey(seriesId: string): string {
  return `${CHARACTER_PROMPT_JOB_STORAGE_PREFIX}${seriesId}`;
}

function readStoredCharacterPromptJob(
  seriesId: string
): StoredCharacterPromptJob | null {
  const raw = safeStorageGet(characterPromptJobStorageKey(seriesId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredCharacterPromptJob>;
    return parsed.jobId && parsed.characterId
      ? { jobId: parsed.jobId, characterId: parsed.characterId }
      : null;
  } catch {
    return null;
  }
}

/** Best-effort localStorage access. Reads/writes here are only a CONVENIENCE
 *  cache (remembered model/MCP-connection defaults) — never the source of
 *  truth. They MUST NOT throw: `localStorage.setItem` raises
 *  `QuotaExceededError` when the origin's storage is full (common for heavy
 *  users) and `getItem`/`setItem` raise `SecurityError` in
 *  sandboxed/blocked-storage contexts. An unguarded throw here used to abort
 *  the whole click handler BEFORE the real (state/mutation) action fired.
 *  Swallow the error and let the real action proceed. */

function safeStorageRemove(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* storage blocked — best-effort, ignore */
  }
}

function readStoredMcpConnectionId(): string | null {
  return safeStorageGet(MCP_CONNECTION_ID_STORAGE_KEY);
}

function storeMcpConnectionId(connectionId: string | null): void {
  if (connectionId) {
    safeStorageSet(MCP_CONNECTION_ID_STORAGE_KEY, connectionId);
  } else {
    safeStorageRemove(MCP_CONNECTION_ID_STORAGE_KEY);
  }
}

/** Feature 135 (Hermes/Grok media worker) — shared Hermes-connection
 *  localStorage key, same cross-surface carry-over convention as
 *  `MCP_CONNECTION_ID_STORAGE_KEY` above: this key is shared with
 *  `VerticalDramaLocationStockPanel.tsx` and `VerticalDramaEpisodePage.tsx`
 *  so a connection picked on any surface carries over automatically. */
export const HERMES_CONNECTION_ID_STORAGE_KEY =
  "smartspec_hermes_connection_id";

/** Exported (unlike its MCP sibling above) so the storage contract is
 *  directly unit-testable — see
 *  `__tests__/VerticalDramaCharacterStockPanel.hermesConnection.test.ts`. */
export function readStoredHermesConnectionId(): string | null {
  return safeStorageGet(HERMES_CONNECTION_ID_STORAGE_KEY);
}

/** State-first ordering: callers always update React state BEFORE calling
 *  this (see `handleSelectHermesConnection`) — this write is a best-effort
 *  cache only and must never block/throw the real action (memory: the
 *  QuotaExceeded incident that once blocked model selection). */
export function storeHermesConnectionId(connectionId: string | null): void {
  if (connectionId) {
    safeStorageSet(HERMES_CONNECTION_ID_STORAGE_KEY, connectionId);
  } else {
    safeStorageRemove(HERMES_CONNECTION_ID_STORAGE_KEY);
  }
}

/** Best-effort mimeType from a resolved media URL's extension — replaces a
 *  previous hardcoded `"image/png"` that mislabeled every completed task's
 *  actual format (evidence: kie_ai model completions return `.jpeg`, not
 *  `.png`). Falls back to `"image/jpeg"` (the most common provider output)
 *  when the extension is missing/unrecognized — `resolveMediaAssetForImport`
 *  only uses this to satisfy `validateImage`'s allowlist, not to transcode,
 *  so an imperfect guess is still far more correct than a fixed wrong value. */
export function guessImageMimeTypeFromUrl(url: string): string {
  const match = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(url);
  const ext = match?.[1]?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    default:
      return "image/jpeg";
  }
}

/**
 * Defensive UI-level dedupe for the "ภาพตัวละครนี้" (this character's images)
 * list (bug repro 2026-07-06, series 4 คุณหญิงเบญจวรรณ): dragging a reference
 * tile the panel already showed onto the character card used to create a
 * SECOND link row for the same underlying image (see
 * `verticalDramaCharacterStock.ts`'s `linkAsset` doc comment for the
 * service-level idempotency fix) — old, already-linked data may still carry
 * true duplicates the service-level fix cannot retroactively collapse without
 * a migration. Groups by `(mediaAssetId, role)` — NOT by `mediaAssetId` alone,
 * since a single image legitimately carries more than one role for the same
 * character (e.g. the same render tagged both `primary_portrait` and
 * `character_sheet_full`) and collapsing those would hide a real, distinct
 * list entry. Within a group, keeps the most recently updated row, preferring
 * an `approved` one on an exact tie.
 */
export function dedupeCharacterAssetsForDisplay(
  assets: VerticalDramaCharacterAsset[]
): VerticalDramaCharacterAsset[] {
  const byGroup = new Map<string, VerticalDramaCharacterAsset>();
  const order: string[] = [];
  for (const a of assets) {
    const groupKey = `${a.mediaAssetId ?? `asset:${a.assetLinkId}`}::${a.role ?? ""}`;
    const existing = byGroup.get(groupKey);
    if (!existing) {
      byGroup.set(groupKey, a);
      order.push(groupKey);
      continue;
    }
    const existingTime = new Date(existing.updatedAt).getTime();
    const nextTime = new Date(a.updatedAt).getTime();
    if (
      nextTime > existingTime ||
      (nextTime === existingTime &&
        a.state === "approved" &&
        existing.state !== "approved")
    ) {
      byGroup.set(groupKey, a);
    }
  }
  return order.map(key => byGroup.get(key)!);
}

/** Result of {@link resolveCharacterCardPortraitAsset}: the URL a card
 *  thumbnail should render, plus the winning asset's `assetLinkId` so
 *  callers can offer a delete action on it. */
export interface VdCharacterCardPortraitAsset {
  thumbnailUrl: string;
  /** `null` only in the rare transient race where the thumbnail is showing
   *  purely from this session's local generation cache
   *  (`generatedImageUrls`) and hasn't yet appeared as a linked asset row —
   *  in that window there's nothing durable to delete yet. Self-heals once
   *  the asset list refetches. */
  assetLinkId: string | null;
}

/**
 * Resolves the single `primary_portrait` asset a character card's
 * thumbnail shows for `characterId`: the `approved` one if present, else
 * the most-recently-updated `generated`/`imported` one, else (matched by
 * `mediaAssetId`) this session's local generation cache. Same selection
 * rule the roster card thumbnail has always used (see
 * `getCharacterCardThumbnail` in the component body, which now delegates
 * here) — extracted as a standalone pure function so it can carry an
 * `assetLinkId` (needed by the card-level delete button added 2026-07-11)
 * without duplicating the selection logic, and so it's unit-testable
 * without mounting the component.
 *
 * Reused for BOTH the main portrait thumbnail (`characterId` = the
 * character's own id) and every variant "look" chip underneath it
 * (`characterId` = the variant row's own id — each variant is its own
 * character row with its own portrait, so no extra filtering is needed
 * beyond what this function already does).
 */
export function resolveCharacterCardPortraitAsset(
  assets: VerticalDramaCharacterAsset[],
  characterId: string,
  sessionCachedImage?: { imageUrl: string; mediaAssetId: string }
): VdCharacterCardPortraitAsset | null {
  const portraitAssets = assets.filter(
    a => a.characterId === characterId && a.role === "primary_portrait"
  );
  const newestFirst = (
    left: VerticalDramaCharacterAsset,
    right: VerticalDramaCharacterAsset
  ) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  // Precedence, most explicit first. `approved` (the column) is what
  // `setPrimaryPortrait` writes and what `getPrimaryPortraitUrl` orders by, so
  // it must outrank `state` here or the card can disagree with the image the
  // server actually feeds back as the identity reference.
  //
  // Every tier is tie-broken by recency rather than array order. It used to be
  // `.find(a => a.state === "approved")`, which silently depended on the order
  // the manifest happened to arrive in — and since `linkAsset` stamps EVERY
  // linked image with `state: "approved"`, a character with several portraits
  // had several "approved" rows and the winner was effectively arbitrary.
  const chosen =
    [...portraitAssets].filter(a => a.approved).sort(newestFirst)[0] ??
    [...portraitAssets]
      .filter(a => a.state === "approved")
      .sort(newestFirst)[0] ??
    [...portraitAssets]
      .filter(a => a.state === "generated" || a.state === "imported")
      .sort(newestFirst)[0];
  if (chosen?.thumbnailUrl) {
    return {
      thumbnailUrl: chosen.thumbnailUrl,
      assetLinkId: chosen.assetLinkId,
    };
  }
  if (
    sessionCachedImage &&
    (!chosen || String(chosen.mediaAssetId) === sessionCachedImage.mediaAssetId)
  ) {
    return {
      thumbnailUrl: sessionCachedImage.imageUrl,
      assetLinkId: chosen?.assetLinkId ?? null,
    };
  }
  return null;
}

/**
 * The reference/casting group is the recovery path for a character's face.
 * Keep the first-visit default explicit and pure so the UI cannot accidentally
 * invert the product rule when the asset query is refreshed.
 */
export function resolveCharacterReferenceDisclosureDefault(params: {
  hasPrimaryPortrait: boolean;
}): boolean {
  return !params.hasPrimaryPortrait;
}

/**
 * How much of a first-portrait candidate batch to show
 * (`planning/vd-character-primary-portrait-control/plan.md`).
 *
 * A batch's 3-5 alternates are stored durably and used to render forever, even
 * long after the user picked one. Every unpicked face then keeps appearing next
 * to the chosen one, and the panel stops answering the only question that
 * matters at a glance: which face IS this character now. So once a batch is
 * resolved, collapse to the winner and keep the rest one click away — they are
 * still worth keeping (changing your mind is a real workflow), just not worth
 * showing by default.
 *
 * An UNRESOLVED batch (nothing selected yet) always shows everything: that is
 * the moment the alternates exist for.
 */
export function resolvePortraitCandidateVisibility<
  TCandidate extends { status: string },
>(params: {
  candidates: readonly TCandidate[];
  expanded: boolean;
}): { visible: TCandidate[]; hiddenCount: number; isResolved: boolean } {
  const isResolved = params.candidates.some(c => c.status === "selected");
  if (!isResolved || params.expanded) {
    return { visible: [...params.candidates], hiddenCount: 0, isResolved };
  }
  const visible = params.candidates.filter(c => c.status === "selected");
  return {
    visible,
    hiddenCount: params.candidates.length - visible.length,
    isResolved,
  };
}

/** A single candidate the reference-image picker
 *  (planning/vertical-drama-reference-picker-outfit-lock/plan.md, Phase D3)
 *  can offer for the identity-lock reference of the NEXT
 *  generateCharacterImage/generateCharacterSheet call. */
export interface VdReferenceCandidate {
  assetLinkId: string;
  thumbnailUrl: string;
  /** `"own"` — one of this character's own `primary_portrait` assets.
   *  `"parent"` — a variant borrowing its parent character's portrait.
   *  `"twin"` — a twin (`sharesFaceWithCharacterId`, either direction)
   *  sharing a face with the source character. `"variant"` — one of THIS
   *  character's own outfit/age-stage variants (reverse of `"parent"` —
   *  shown when viewing the PARENT, offering a child variant's portrait). */
  sourceLabel: "own" | "parent" | "twin" | "variant";
  /** Set for every candidate except `"own"` — the source character's
   *  display name (`"parent"`/`"twin"`) or variant label (`"variant"`), for
   *  the "จาก {name}" / "from {name}" caption. */
  sourceName?: string;
}

/** Minimum shape {@link buildReferenceCandidates} needs from a character
 *  DTO — deliberately narrower than {@link VdRosterCharacterFields} (no
 *  `name`/`variantLabel`) since the picker only needs to know THIS
 *  character's id and which other character (if any) it borrows its
 *  identity reference from. */
export interface VdReferenceCandidateCharacterFields {
  characterId: string;
  parentCharacterId?: string;
  sharesFaceWithCharacterId?: string;
}

/** Lookup entry {@link buildReferenceCandidates} needs for every OTHER
 *  character in the series — carries the relationship fields too (not just
 *  `characterId`/`name`) so the function can scan for characters that
 *  borrow identity FROM the one being viewed (reverse direction), not just
 *  resolve the name of a source the viewed character itself points at. */
export interface VdReferenceCandidateLookupEntry {
  characterId: string;
  name: string;
  parentCharacterId?: string;
  sharesFaceWithCharacterId?: string;
  variantLabel?: string;
}

/**
 * Candidate reference images for the character-detail-panel picker: every
 * one of this character's OWN `primary_portrait` assets (not just the
 * auto-picked one — show every candidate when there's more than one), PLUS
 * two symmetric cross-character cases:
 *  - UPWARD: when the character IS a variant (`parentCharacterId` set) or
 *    twin (`sharesFaceWithCharacterId` set), the resolved source
 *    character's own `primary_portrait` assets too.
 *  - DOWNWARD (2026-07-11 fix — a parent/twin-source character's own detail
 *    panel used to show ONLY its own portrait, never its variants'/twins'
 *    portraits, even though they're the exact same face): every OTHER
 *    character that points AT this one — this character's own outfit/
 *    age-stage variants, and any twin that shares ITS face with this
 *    character — offered the same way, labeled with the variant's
 *    `variantLabel` (variants share the parent's `name`, so the label is
 *    what actually distinguishes them) or the twin's `name`.
 * This is the UI surface that lets a variant/twin with no portrait of its
 * own yet actually attach a reference image at render time (see the plan
 * doc's "real, confirmed gap" note — `getPrimaryPortraitUrl` never
 * consulted the face-source relationship server-side, so a brand-new
 * variant/twin got ZERO reference image attached before this picker
 * existed) — and, symmetrically, lets a parent character borrow a look from
 * one of its own variants when regenerating its base portrait.
 *
 * Deliberately does NOT dedupe or cap the "own" list to one entry — every
 * approved/generated/imported `primary_portrait` this character has is
 * offered, so the user can pick an older look on purpose.
 */
export function buildReferenceCandidates(
  assets: VerticalDramaCharacterAsset[],
  character: VdReferenceCandidateCharacterFields,
  charactersById: Map<string, VdReferenceCandidateLookupEntry>
): VdReferenceCandidate[] {
  const ownPortraits = assets.filter(
    a =>
      a.characterId === character.characterId &&
      a.role === "primary_portrait" &&
      a.thumbnailUrl
  );
  const candidates: VdReferenceCandidate[] = ownPortraits.map(a => ({
    assetLinkId: a.assetLinkId,
    thumbnailUrl: a.thumbnailUrl!,
    sourceLabel: "own",
  }));

  const crossSourceId =
    character.sharesFaceWithCharacterId ?? character.parentCharacterId;
  if (crossSourceId) {
    const sourceName = charactersById.get(crossSourceId)?.name;
    const crossPortraits = assets.filter(
      a =>
        a.characterId === crossSourceId &&
        a.role === "primary_portrait" &&
        a.thumbnailUrl
    );
    candidates.push(
      ...crossPortraits.map(a => ({
        assetLinkId: a.assetLinkId,
        thumbnailUrl: a.thumbnailUrl!,
        sourceLabel: character.sharesFaceWithCharacterId
          ? ("twin" as const)
          : ("parent" as const),
        sourceName,
      }))
    );
  }

  for (const entry of charactersById.values()) {
    if (entry.characterId === character.characterId) continue;
    const isVariantOfThis = entry.parentCharacterId === character.characterId;
    const isTwinOfThis =
      entry.sharesFaceWithCharacterId === character.characterId;
    if (!isVariantOfThis && !isTwinOfThis) continue;
    const reversePortraits = assets.filter(
      a =>
        a.characterId === entry.characterId &&
        a.role === "primary_portrait" &&
        a.thumbnailUrl
    );
    candidates.push(
      ...reversePortraits.map(a => ({
        assetLinkId: a.assetLinkId,
        thumbnailUrl: a.thumbnailUrl!,
        sourceLabel: isTwinOfThis ? ("twin" as const) : ("variant" as const),
        sourceName: isTwinOfThis
          ? entry.name
          : (entry.variantLabel ?? entry.name),
      }))
    );
  }

  return candidates;
}

/**
 * Mirrors the backend's `getPrimaryPortraitUrl` selection ordering exactly
 * (approved-first, then newest-updated — same rule
 * {@link resolveCharacterCardPortraitAsset} already applies for the roster
 * card thumbnail). Main portrait generation no longer uses this as an
 * implicit selection: only the explicit per-character override is sent as a
 * reference. Returns `null` when there is no own portrait.
 */
export function resolveDefaultReferenceAssetLinkId(
  assets: VerticalDramaCharacterAsset[],
  characterId: string
): string | null {
  const own = assets
    .filter(a => a.characterId === characterId && a.role === "primary_portrait")
    .sort((a, b) => {
      const aApproved = a.state === "approved";
      const bApproved = b.state === "approved";
      if (aApproved !== bApproved) return aApproved ? -1 : 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  return own[0]?.assetLinkId ?? null;
}

/** Only a user-imported primary link is an explicit reference selection. A
 * generated portrait is the result of a render and must not become the next
 * main portrait's implicit reference merely because the poller links it. */
export function isExplicitPrimaryReferenceImport(params: {
  source: string;
  role?: string | null;
  characterId?: string | null;
}): boolean {
  return (
    params.source === "imported" &&
    params.role === "primary_portrait" &&
    Boolean(params.characterId)
  );
}

/** Minimum shape `buildCharacterRosterEntries` needs from a character DTO
 *  (planning/vertical-drama-character-variants/plan.md Phase E) — kept
 *  separate from the full `characterRowToDto` response shape so this stays
 *  testable with plain fixtures rather than the full tRPC response type. */
export interface VdRosterCharacterFields {
  characterId: string;
  name: string;
  data?: Record<string, unknown> | null;
  parentCharacterId?: string;
  variantLabel?: string;
  sharesFaceWithCharacterId?: string;
  twinCharacterId?: string;
  twinCharacterName?: string;
  twinRelationshipStatus?: "linked" | "candidate" | "unlinked";
  twinIdentity?: {
    sourceCharacterId: string;
    sourceDnaRevision: number;
    syncedAt: string;
    sharedFields: readonly string[];
  };
  /** Set B (`vd-stuck-generation-and-lost-characters` plan) — DTO
   *  completeness signal (`characterRowToDto`'s `needsSetup`/
   *  `needsSetupReasons`); optional here so plain fixtures without it keep
   *  working. */
  needsSetup?: boolean;
  needsSetupReasons?: VdCharacterNeedsSetupReason[];
}

/**
 * Picks the most useful human-readable detail for a look card. New variants
 * without an explicit description inherit `variantLabel` into
 * `data.description`; suppress that duplicate and use the generated image
 * brief when it contains additional information instead.
 */
export function resolveCharacterLookDescription(params: {
  data?: Record<string, unknown> | null;
  variantLabel?: string | null;
}): string | undefined {
  const label = params.variantLabel?.trim() ?? "";
  const candidates = [params.data?.description, params.data?.lookImageBrief];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (
      !trimmed ||
      trimmed === label ||
      looksLikeCharacterLookStoryLeak(trimmed)
    )
      continue;
    return trimmed;
  }
  return undefined;
}

function readLookObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readLookText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

/**
 * Read visual prompt material from both the current look contract and the
 * older visual-bible shape. A review-required repair used to persist only the
 * latter, so the UI must not present that real prompt as an empty state while
 * the row is waiting for human review.
 */
function resolveCharacterLookDerivedPrompt(
  data?: Record<string, unknown> | null
): string | undefined {
  const lookDesign = readLookObject(data?.lookDesign);
  const visualBible = readLookObject(data?.visualBible);
  const visualBiblePrompt = [
    visualBible?.visualIdentitySummary,
    visualBible?.signatureWardrobe,
    visualBible?.hairMakeupNotes,
    visualBible?.consistencyStrategy,
    visualBible?.colorPalette,
    ...(Array.isArray(visualBible?.identityAnchors)
      ? visualBible?.identityAnchors
      : []),
    ...(Array.isArray(visualBible?.forbiddenDrift)
      ? visualBible.forbiddenDrift.map(value => `Avoid: ${value}`)
      : []),
  ]
    .map(readLookText)
    .filter((value): value is string => Boolean(value))
    .join(" ");
  const candidates = [
    lookDesign?.image_brief,
    lookDesign?.visual_description,
    visualBiblePrompt,
  ];
  for (const candidate of candidates) {
    const value = readLookText(candidate);
    if (value) return value;
  }
  return undefined;
}

/**
 * Keep the roster card scannable even when a legacy row contains a complete
 * wardrobe prompt in `description`. Prefer the structured LLM look design
 * when available; otherwise fall back to the persisted human-facing text and
 * bound it for the card. The full value remains available in the editor.
 */
export function resolveCharacterLookSummary(params: {
  data?: Record<string, unknown> | null;
  variantLabel?: string | null;
  maxLength?: number;
}): string | undefined {
  const data = params.data ?? null;
  const design = readLookObject(data?.lookDesign);
  const outfit = readLookObject(design?.outfit);
  const hair = readLookObject(design?.hair);
  const footwear = readLookObject(design?.footwear);
  const makeup = readLookObject(design?.makeup);
  const structured =
    data?.lookPromptEdited === true
      ? []
      : [
          readLookText(design?.visual_description),
          readLookText(design?.age_stage_description),
          readLookText(outfit?.top),
          readLookText(outfit?.bottom) ?? readLookText(outfit?.one_piece),
          readLookText(outfit?.outerwear),
          readLookText(hair?.style),
          readLookText(makeup?.level),
          readLookText(footwear?.type),
        ].filter((value): value is string => Boolean(value));
  const fallback =
    resolveCharacterLookDescription({
      data,
      variantLabel: params.variantLabel,
    }) ?? resolveCharacterLookDerivedPrompt(data);
  const source = structured.length > 0 ? structured.join(" · ") : fallback;
  if (!source) return undefined;
  const normalized = source.replace(/\s+/g, " ").trim();
  const maxLength = params.maxLength ?? 180;
  if (normalized.length <= maxLength) return normalized;
  const boundary = normalized.lastIndexOf(" ", maxLength);
  const cutoff =
    boundary >= Math.floor(maxLength * 0.65) ? boundary : maxLength;
  return `${normalized.slice(0, cutoff).trimEnd()}…`;
}

/** Resolve the raw prompt shown in the compact look editor. */
export function resolveCharacterLookPrompt(
  data?: Record<string, unknown> | null
): string {
  const candidates = [
    data?.lookImageBrief,
    resolveCharacterLookDerivedPrompt(data),
    data?.description,
  ];
  for (const candidate of candidates) {
    const value = readLookText(candidate);
    if (value) return value;
  }
  return "";
}

/** Compact preview of the exact prompt source used by the editor. */
export function resolveCharacterLookPromptSummary(params: {
  data?: Record<string, unknown> | null;
  maxLength?: number;
}): string | undefined {
  const structuredSummary = resolveCharacterLookSummary({
    data: params.data,
    maxLength: params.maxLength,
  });
  // A manually edited prompt is the explicit source of truth. For
  // skill-generated looks, prefer the structured visual summary so the
  // preview starts with actual outfit/hair/makeup details instead of the
  // generic identity-lock sentence at the beginning of image_brief.
  if (params.data?.lookPromptEdited !== true && structuredSummary) {
    return structuredSummary;
  }
  const prompt = resolveCharacterLookPrompt(params.data);
  if (!prompt) return undefined;
  const normalized = prompt.replace(/\s+/g, " ").trim();
  const maxLength = params.maxLength ?? 180;
  if (normalized.length <= maxLength) return normalized;
  const boundary = normalized.lastIndexOf(" ", maxLength);
  const cutoff =
    boundary >= Math.floor(maxLength * 0.65) ? boundary : maxLength;
  return `${normalized.slice(0, cutoff).trimEnd()}…`;
}

/**
 * Build a safe whole-JSONB replacement for `updateCharacter`. The server
 * stamps the authenticated manual-edit provenance; this helper only changes
 * the two derived visual prompt fields and leaves identity/evidence intact.
 */
export function buildCharacterLookPromptData(params: {
  currentData?: Record<string, unknown> | null;
  prompt: string;
}): Record<string, unknown> {
  const prompt = params.prompt.trim();
  return {
    ...(params.currentData ?? {}),
    description: prompt,
    lookImageBrief: prompt,
    lookDesignStatus: "review",
    lookPromptEdited: true,
  };
}

export interface VdRosterEntry<T extends VdRosterCharacterFields> {
  character: T;
  /** Variant rows (`parentCharacterId` === this entry's `characterId`), in
   *  the same relative order they appear in the source list. Empty for
   *  plain characters and twins — a variant row is never itself a
   *  top-level roster entry (see the filter below). */
  variants: T[];
  /** Resolved `name` of the character this row shares a face with (twins),
   *  or `undefined` when this row isn't a twin OR the source character
   *  can't be found in the same list — defensive, never throws; the caller
   *  should simply omit the shares-face badge in that case rather than
   *  render broken text. */
  shareFaceSourceName: string | undefined;
}

/**
 * Partitions a flat character list (as returned by
 * `verticalDramaCharacters.listCharacters`) into roster grid entries:
 * - one entry per TOP-LEVEL character (no `parentCharacterId`) — this
 *   includes plain standalone characters, parent characters that HAVE
 *   variants (their variants nest inside the SAME entry, not separate
 *   top-level entries), and twins (independent people who just share a
 *   face reference, annotated via `shareFaceSourceName`);
 * - variant rows (`parentCharacterId` set) are grouped onto their parent's
 *   entry and never produce their own top-level entry.
 *
 * Pure/derived from the already-fetched flat list — callers should NOT run
 * a separate query for this.
 */
export function buildCharacterRosterEntries<T extends VdRosterCharacterFields>(
  characters: T[]
): VdRosterEntry<T>[] {
  const variantsByParentId = new Map<string, T[]>();
  for (const c of characters) {
    if (!c.parentCharacterId) continue;
    const existing = variantsByParentId.get(c.parentCharacterId);
    if (existing) {
      existing.push(c);
    } else {
      variantsByParentId.set(c.parentCharacterId, [c]);
    }
  }
  return characters
    .filter(c => !c.parentCharacterId)
    .map(c => ({
      character: c,
      variants: variantsByParentId.get(c.characterId) ?? [],
      shareFaceSourceName:
        c.twinCharacterName ??
        (c.sharesFaceWithCharacterId
          ? characters.find(
              other => other.characterId === c.sharesFaceWithCharacterId
            )?.name
          : characters.find(
              other =>
                other.twinCharacterId === c.characterId ||
                other.sharesFaceWithCharacterId === c.characterId
            )?.name),
    }));
}

/**
 * Set B (`vd-stuck-generation-and-lost-characters` plan) — narrows roster
 * entries down to only the ones the user still needs to finish (a
 * story-introduced character with no DNA/portrait yet, or any other
 * `needsSetup` reason). An entry counts if its own top-level character OR
 * any nested variant row still needs setup, so a variant needing work is
 * never hidden behind an otherwise-complete parent card. Pure/derived —
 * mirrors `buildCharacterRosterEntries`'s own testing convention.
 */
export function filterRosterEntriesNeedingSetup<
  T extends VdRosterCharacterFields,
>(entries: VdRosterEntry<T>[]): VdRosterEntry<T>[] {
  return entries.filter(
    entry =>
      entry.character.needsSetup === true ||
      entry.variants.some(v => v.needsSetup === true)
  );
}

/**
 * Set B — total character ROWS (not roster entries; every top-level
 * character AND every variant row counts individually) still needing
 * setup, for the roster filter toggle's "(N)" count.
 */
export function countCharactersNeedingSetup<T extends { needsSetup?: boolean }>(
  characters: T[]
): number {
  return characters.filter(c => c.needsSetup === true).length;
}

/* -------------------------------------------------------------------------- */
/* W2 manual CRUD (plan: vertical-drama-twin-variant-completeness, F6) —      */
/* pure mutation-input builders + copy helpers, kept separate from the        */
/* dialog JSX below so they stay testable with plain fixtures (matches this   */
/* file's own established convention — see `buildCharacterRosterEntries`/     */
/* `buildReferenceCandidates` above and their sibling `__tests__/*.test.ts`   */
/* files — a full render test of this ~4000-line panel is impractical).       */
/* -------------------------------------------------------------------------- */

/** Exact payload shape `verticalDramaCharacters.createCharacterVariant`
 *  expects (`server/routers/verticalDramaCharacters.ts`, ~line 977) — kept as
 *  a local literal type rather than importing the router's Zod-inferred type
 *  directly, since that file pulls in server-only modules that must never
 *  reach the client bundle (same rationale as `VD_CHARACTER_SHEET_TYPE_VALUES`
 *  above). If the router's input schema ever changes, update this to match. */
export interface VdCreateCharacterVariantInput {
  seriesId: string;
  parentCharacterId: string;
  variantLabel: string;
  variantType: "outfit" | "age_stage";
  customDescription?: string;
  referenceMediaAssetId?: string;
}

/** Builds the `createCharacterVariant` mutation payload from the "เพิ่มลุค"
 *  dialog's raw form state: trims `variantLabel`/`customDescription`, and
 *  omits `customDescription`/`referenceMediaAssetId` entirely when empty/null
 *  rather than sending an empty string (matches the input schema's own
 *  `.optional()` — an empty string would otherwise pass Zod's `.max(2000)`
 *  but pointlessly override the mutation's own `variantLabel` fallback for
 *  `data.description`, see that mutation's doc comment). */
export function buildCreateCharacterVariantInput(params: {
  seriesId: string;
  parentCharacterId: string;
  variantLabel: string;
  variantType: "outfit" | "age_stage";
  customDescription: string;
  referenceMediaAssetId: string | null;
}): VdCreateCharacterVariantInput {
  const variantLabel = params.variantLabel.trim();
  const customDescription = params.customDescription.trim();
  return {
    seriesId: params.seriesId,
    parentCharacterId: params.parentCharacterId,
    variantLabel,
    variantType: params.variantType,
    ...(customDescription ? { customDescription } : {}),
    ...(params.referenceMediaAssetId
      ? { referenceMediaAssetId: params.referenceMediaAssetId }
      : {}),
  };
}

/**
 * `planning/vd-character-look-one-step-flow/plan.md` (2026-07-17) — pure
 * decision for whether "เพิ่มลุค" should auto-fire the SAME direct (no-
 * preview) portrait generation `generateCharacterImage` already uses
 * elsewhere in this panel, right after the variant row is created. Shared by
 * `createVariantMutation`'s `onSuccess` (real auto-fire) and the modal's own
 * hint row (preview of what submit is about to do) so the two can never
 * silently disagree. Never fires when the user already supplied their own
 * reference image (`bestEffortLinkPrimaryPortrait`, server, already turns
 * that into the look's portrait — nothing left to generate), when the
 * parent has no usable portrait yet (nothing to use as the face-lock
 * reference — `needsSetupReasons` already carries this exact signal, see
 * `characterRowToDto`'s `hasApprovedOrGeneratedPortrait` doc comment,
 * `server/routers/verticalDramaCharacters.ts`), or when no image model is
 * selected (fail-closed server guard — never invent a default here, per the
 * project's model-selection policy).
 */
export type VdVariantAutoGenerateBlockReason =
  | "has_reference_image"
  | "missing_parent_portrait"
  | "missing_model";

export function decideVariantAutoGenerateImage(params: {
  hasReferenceMediaAssetId: boolean;
  parentNeedsSetupReasons: readonly VdCharacterNeedsSetupReason[] | undefined;
  selectedImageModelId: string;
}): { fire: true } | { fire: false; reason: VdVariantAutoGenerateBlockReason } {
  if (params.hasReferenceMediaAssetId) {
    return { fire: false, reason: "has_reference_image" };
  }
  if ((params.parentNeedsSetupReasons ?? []).includes("missing_portrait")) {
    return { fire: false, reason: "missing_parent_portrait" };
  }
  if (!params.selectedImageModelId.trim()) {
    return { fire: false, reason: "missing_model" };
  }
  return { fire: true };
}

/**
 * Which image the per-look re-render should condition on
 * (`planning/vd-look-image-not-replace-primary/plan.md` §4C).
 *
 * - `"auto"` — send no `referenceAssetLinkId`; the server resolves its own
 *   tiers (the look's own portrait, else the parent's borrowed one). Exactly
 *   today's behavior for the chip's generate button.
 * - `"primary"` — pin the BASE character's main portrait. The face anchor
 *   users mean by "ใช้ภาพ primary เป็น reference"; the server reports this as
 *   an `"inherited"` (borrowed) likeness, so the parent's wardrobe is NOT
 *   locked onto the new look.
 * - `"look"` — pin this look's own current image, to iterate on it.
 */
export type VdLookRenderReferenceChoice = "auto" | "primary" | "look";

/** Keep only the ephemeral per-render customInstruction within its server
 * contract while retaining as much of the high-signal opening as possible.
 * The reusable persisted `lookImageBrief` has its own 2,000-character
 * contract and is also supplied by the server from character data; this
 * client-side cap must not be confused with that durable brief's size. */
export const VD_CHARACTER_CUSTOM_INSTRUCTION_MAX_LENGTH = 500;

export function fitCharacterLookInstruction(
  value: string,
  maxLength = VD_CHARACTER_CUSTOM_INSTRUCTION_MAX_LENGTH
): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length <= maxLength) return trimmed;

  const ellipsis = "…";
  const contentLimit = Math.max(1, maxLength - ellipsis.length);
  const sentences = trimmed.split(/(?<=[.!?])\s+/);
  let compact = "";
  for (const sentence of sentences) {
    const candidate = compact ? `${compact} ${sentence}` : sentence;
    if (candidate.length > contentLimit) break;
    compact = candidate;
  }
  if (compact.length < Math.min(120, contentLimit)) {
    compact = trimmed.slice(0, contentLimit).trimEnd();
  }
  return `${compact}${ellipsis}`;
}

/** The subset of `generateCharacterImage`'s input this dialog decides. The
 *  caller merges the model/transport fields it already sends everywhere else. */
export interface VdLookRenderRequestFields {
  characterId: string;
  customInstruction?: string;
  referencePolicy: "auto";
  referenceAssetLinkId?: string;
}

/**
 * Pure builder for the per-look "สร้างภาพใหม่ของลุคนี้" dialog's request.
 *
 * `referencePolicy: "auto"` is always explicit so the backend cannot mistake
 * a look render for the main portrait's no-reference default. The optional
 * asset field is omitted rather than sent empty: `customInstruction`
 * is server-capped at 500 chars and an empty string would be a meaningless
 * brief, and an absent `referenceAssetLinkId` is what selects the server's own
 * auto-resolution tiers. A choice whose asset link does not exist (e.g.
 * `"look"` before the look has any image) degrades to auto rather than sending
 * an id the server would reject.
 */
export function buildLookRenderRequestFields(params: {
  lookCharacterId: string;
  instruction: string;
  referenceChoice: VdLookRenderReferenceChoice;
  primaryAssetLinkId: string | null;
  lookAssetLinkId: string | null;
}): VdLookRenderRequestFields {
  const instruction = fitCharacterLookInstruction(params.instruction);
  const referenceAssetLinkId =
    params.referenceChoice === "primary"
      ? params.primaryAssetLinkId
      : params.referenceChoice === "look"
        ? params.lookAssetLinkId
        : null;
  return {
    characterId: params.lookCharacterId,
    referencePolicy: "auto",
    ...(instruction ? { customInstruction: instruction } : {}),
    ...(referenceAssetLinkId ? { referenceAssetLinkId } : {}),
  };
}

/**
 * Which free-text visual brief a DIRECT (no-preview) character-image
 * generation should carry — `planning/vd-character-full-body-framing/plan.md`
 * C1. Extracted as a pure function for the same reason as
 * `buildPreviewCharacterPromptInput` below: a full render test of this panel
 * is impractical, so the decision itself is what gets pinned.
 *
 * `override` wins when supplied, because the "เพิ่มลุค" dialog's auto-fire
 * runs in the same event handler that seeds `instructionByCharacter` — React
 * has not committed that state yet, so reading the map back there would see a
 * stale (empty) value and silently drop the user's brief. Returns `undefined`
 * (not `""`) when there is nothing to send, so the caller omits the field
 * entirely and the backend keeps its exact pre-feature default.
 */
export function resolveDirectCharacterImageInstruction(params: {
  characterId: string;
  instructionByCharacter: Record<string, string>;
  override?: string;
}): string | undefined {
  const resolved = (
    params.override ??
    params.instructionByCharacter[params.characterId] ??
    ""
  ).trim();
  return resolved || undefined;
}

/**
 * Resolve only the ephemeral instruction for a look render. The persisted look
 * prompt is already part of the character data read by the server-side visual
 * look skill; it must not be copied into this 500-character supplemental field
 * because doing so creates a truncated second source of truth for Generate vs
 * Edit prompt.
 */
export function resolveLookRenderInstruction(params: {
  characterId: string;
  instructionByCharacter: Record<string, string>;
}): string | undefined {
  const resolved = resolveDirectCharacterImageInstruction({
    characterId: params.characterId,
    instructionByCharacter: params.instructionByCharacter,
  });
  return resolved ? fitCharacterLookInstruction(resolved) : undefined;
}

/** Exact payload shape `verticalDramaCharacters.previewCharacterPrompt`
 *  expects (`server/routers/verticalDramaCharacters.ts`) — the
 *  `customInstruction` field name/cap (500 chars, enforced server-side via
 *  `z.string().trim().max(500).optional()`) is fixed by
 *  `planning/vertical-drama-character-custom-instruction/plan.md` and must
 *  match the backend exactly. */
export interface VdPreviewCharacterPromptInput {
  seriesId: string;
  characterId: string;
  selectedImageModelId?: string;
  customInstruction?: string;
  portraitCandidateCount?: number;
  castingReferenceAssetLinkIds?: string[];
  castingLockClothing?: boolean;
  castingPoseMode?: "auto_natural" | "lock_reference";
  castingCameraFraming?:
    | "full_body"
    | "three_quarter"
    | "half_body"
    | "medium_close_up"
    | "close_up"
    | "extreme_close_up"
    | "wide_environmental";
}

/** Candidate counts exposed by both the first-casting and reference-area flows. */
export const VD_PORTRAIT_CANDIDATE_COUNTS = [1, 2, 3, 4, 5] as const;

export type PortraitCandidateResultsPlacement = "detail" | "reference-inline";

export function resolvePortraitCandidateResultsPlacement(params: {
  hasReferenceGuidedCandidates: boolean;
  hasReferenceResultsMount: boolean;
}): PortraitCandidateResultsPlacement {
  return params.hasReferenceGuidedCandidates && params.hasReferenceResultsMount
    ? "reference-inline"
    : "detail";
}

/** Builds the `previewCharacterPrompt` mutation payload from the optional
 *  per-character "additional details" hint (roster-card compact input +
 *  detail-panel textarea) — same trim/omit-when-blank convention as
 *  `buildCreateCharacterVariantInput` above: never sends an empty string,
 *  so omitting the field entirely preserves today's exact default backend
 *  behavior when the user types nothing. */
export function buildPreviewCharacterPromptInput(params: {
  seriesId: string;
  characterId: string;
  selectedImageModelId?: string;
  customInstruction: string;
  portraitCandidateCount?: number;
  castingReferenceAssetLinkIds?: string[];
  castingLockClothing?: boolean;
  castingPoseMode?: VdPreviewCharacterPromptInput["castingPoseMode"];
  castingCameraFraming?: VdPreviewCharacterPromptInput["castingCameraFraming"];
}): VdPreviewCharacterPromptInput {
  const customInstruction = params.customInstruction.trim();
  const referenceAssetLinkIds = Array.from(
    new Set(
      (params.castingReferenceAssetLinkIds ?? [])
        .map(id => id.trim())
        .filter(Boolean)
    )
  ).slice(0, 6);
  return {
    seriesId: params.seriesId,
    characterId: params.characterId,
    ...(params.selectedImageModelId?.trim()
      ? { selectedImageModelId: params.selectedImageModelId.trim() }
      : {}),
    ...(customInstruction ? { customInstruction } : {}),
    ...(params.portraitCandidateCount
      ? { portraitCandidateCount: params.portraitCandidateCount }
      : {}),
    ...(referenceAssetLinkIds.length
      ? {
          castingReferenceAssetLinkIds: referenceAssetLinkIds,
          castingLockClothing: params.castingLockClothing ?? false,
          castingPoseMode: params.castingPoseMode ?? "auto_natural",
          castingCameraFraming: params.castingCameraFraming ?? "half_body",
        }
      : {}),
  };
}

/** Keep casting references deterministic and within the server/skill limit. */
export function projectCastingReferenceAssets(
  assets: VerticalDramaCharacterAsset[],
  characterId: string,
  maxReferences = 6
): VerticalDramaCharacterAsset[] {
  const references = assets.filter(
    asset =>
      asset.characterId === characterId &&
      (asset.role === "primary_portrait" ||
        asset.role === "casting_reference") &&
      Boolean(asset.thumbnailUrl)
  );
  const canonicalId = resolveCharacterCardPortraitAsset(
    assets,
    characterId
  )?.assetLinkId;
  const newestFirst = (
    left: VerticalDramaCharacterAsset,
    right: VerticalDramaCharacterAsset
  ) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  const canonical = references.find(asset => asset.assetLinkId === canonicalId);
  const remainder = references
    .filter(asset => asset.assetLinkId !== canonicalId)
    .sort(newestFirst);
  return (canonical ? [canonical, ...remainder] : remainder).slice(
    0,
    maxReferences
  );
}

export function projectCastingReferenceAssetLinkIds(
  assets: VerticalDramaCharacterAsset[],
  characterId: string,
  maxReferences = 6
): string[] {
  return projectCastingReferenceAssets(assets, characterId, maxReferences).map(
    asset => asset.assetLinkId
  );
}

/**
 * Builds the single-candidate preview payload used by both the initial
 * candidate flow and candidate retry. Keeping this in one pure helper makes
 * it impossible for retry to silently drop the selected model capability.
 */
export function buildPortraitCandidateRetryPreviewInput(params: {
  seriesId: string;
  characterId: string;
  selectedImageModelId?: string;
  customInstruction: string;
  castingReferenceAssetLinkIds?: string[];
  castingLockClothing?: boolean;
  castingPoseMode?: VdPreviewCharacterPromptInput["castingPoseMode"];
  castingCameraFraming?: VdPreviewCharacterPromptInput["castingCameraFraming"];
}): VdPreviewCharacterPromptInput {
  return buildPreviewCharacterPromptInput({
    seriesId: params.seriesId,
    characterId: params.characterId,
    selectedImageModelId: params.selectedImageModelId,
    customInstruction: params.customInstruction,
    portraitCandidateCount: 1,
    castingReferenceAssetLinkIds: params.castingReferenceAssetLinkIds,
    castingLockClothing: params.castingLockClothing,
    castingPoseMode: params.castingPoseMode,
    castingCameraFraming: params.castingCameraFraming,
  });
}

export function isFirstPortraitCandidateEligible(
  character: {
    characterId: string;
    parentCharacterId?: string;
    sharesFaceWithCharacterId?: string;
    data?: Record<string, unknown>;
  },
  assets: VerticalDramaCharacterAsset[]
): boolean {
  if (character.parentCharacterId || character.sharesFaceWithCharacterId)
    return false;
  // Legacy stories may already contain a saved visual bible even though no
  // portrait was ever rendered. Candidate casting is gated by the actual
  // primary portrait lifecycle, not by that legacy planning snapshot.
  return !assets.some(
    asset =>
      asset.characterId === character.characterId &&
      asset.role === "primary_portrait"
  );
}

type VdPortraitCandidateUiStatus =
  | "previewed"
  | "submitting"
  | "queued"
  | "completed"
  | "failed"
  | "selected"
  | "superseded";

interface VdPortraitCandidateUiItem {
  assetLinkId: string;
  candidateId: string;
  index: number;
  portraitPrompt?: string;
  negativePrompt?: string;
  visualIdentitySummary?: string;
  status: VdPortraitCandidateUiStatus;
  taskId?: string;
  imageUrl?: string;
  errorMessage?: string;
}

interface VdPortraitCandidateUiBatch {
  batchId: string;
  characterId: string;
  sharedVisualLanguage?: string;
  model?: string;
  referenceGuided?: boolean;
  castingAgeProfile?: {
    min: number;
    max: number;
    label: string;
    source: string;
    confidence: string;
    rationale: string;
    isMinor: boolean;
  };
  candidates: VdPortraitCandidateUiItem[];
  /** Non-fatal lead-beauty graceful-degradation warnings from the server
   * (FIX A) — batch-level, shown above the candidate grid. */
  warnings?: string[];
}

/** Amber, non-blocking note for the server's lead-beauty graceful-degradation
 * warnings (FIX A) — a lead portrait was ACCEPTED despite reading a touch plain,
 * shown so the creator can regenerate/edit if they want a more camera-ready look.
 * `heading` is pre-translated by the caller (this component is lang-agnostic). */
function PortraitLeadBeautyWarnings({
  warnings,
  heading,
}: {
  warnings?: string[];
  heading: string;
}) {
  if (!warnings || warnings.length === 0) return null;
  return (
    <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <p className="font-medium">{heading}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {warnings.map((warning, i) => (
          <li key={`${i}-${warning.slice(0, 24)}`}>{warning}</li>
        ))}
      </ul>
    </div>
  );
}

export interface VdCharacterPromptConfirmPayload<TSnapshot> {
  seriesId: string;
  characterId: string;
  approvedPrompt: string;
  approvedNegativePrompt?: string;
  approvedDesignSnapshot?: TSnapshot;
  // Required (not optional) — the server now REJECTS image generation
  // without an explicit model (fail-closed, no more silent
  // `DEFAULT_MODELS.image` fallback). `buildCharacterPromptConfirmPayload`'s
  // only caller (`handleCharacterPromptConfirm`) guards on
  // `requireModelSelected()` immediately before calling this, so it always
  // has a non-empty value to pass in.
  selectedImageModelId: string;
  /** Image-to-image / EDIT model — optional, applied server-side only when
   *  this render actually attaches a reference image
   *  (`pickCharacterRenderModelId`). */
  selectedEditImageModelId?: string;
  mcpConnectionId?: string;
  sharedGroupId?: number;
  /** Feature 135 — Hermes/Grok media worker transport. Mutually exclusive
   *  with `mcpConnectionId` (a model row resolves to exactly one transport). */
  hermesConnectionId?: string;
  /** Main portrait generation is text-to-image unless the user explicitly
   * selects/attaches a reference asset. */
  referencePolicy: "none" | "auto";
  referenceAssetLinkId?: string;
}

/**
 * Builds the portrait-confirm mutation payload while preventing a stale DNA
 * snapshot from being persisted for user-edited prompt text. Whitespace-only
 * changes are treated as unchanged because the server applies the same trim
 * correlation rule.
 */
export function buildCharacterPromptConfirmPayload<TSnapshot>(params: {
  seriesId: string;
  characterId: string;
  originalPrompt: string;
  editedPrompt: string;
  negativePrompt?: string;
  approvedDesignSnapshot?: TSnapshot;
  // Required — see `VdCharacterPromptConfirmPayload.selectedImageModelId`'s
  // own doc comment for why this is no longer optional.
  selectedImageModelId: string;
  /** Optional second pick — see `VdCharacterPromptConfirmPayload`'s own field.
   *  Omitted from the payload when blank so a caller that never split its
   *  models sends a byte-identical request to before. */
  selectedEditImageModelId?: string;
  imageModelUsesMcp: boolean;
  mcpConnectionId?: string | null;
  sharedGroupId?: number | null;
  /** Feature 135 — Hermes/Grok media worker transport gate, sibling of
   *  `imageModelUsesMcp`. */
  imageModelUsesHermes?: boolean;
  hermesConnectionId?: string | null;
  referencePolicy?: "none" | "auto";
  referenceAssetLinkId?: string | null;
}): {
  payload: VdCharacterPromptConfirmPayload<TSnapshot>;
  wasPromptEdited: boolean;
  carriesApprovedDna: boolean;
} {
  const wasPromptEdited =
    params.originalPrompt.trim() !== params.editedPrompt.trim();
  const carriesApprovedDna =
    !wasPromptEdited && params.approvedDesignSnapshot !== undefined;
  return {
    wasPromptEdited,
    carriesApprovedDna,
    payload: {
      seriesId: params.seriesId,
      characterId: params.characterId,
      approvedPrompt: params.editedPrompt,
      ...(params.negativePrompt
        ? { approvedNegativePrompt: params.negativePrompt }
        : {}),
      ...(carriesApprovedDna
        ? { approvedDesignSnapshot: params.approvedDesignSnapshot }
        : {}),
      // Always sent (never conditionally spread) — see this function's
      // param doc comment.
      selectedImageModelId: params.selectedImageModelId,
      ...(params.selectedEditImageModelId?.trim()
        ? { selectedEditImageModelId: params.selectedEditImageModelId.trim() }
        : {}),
      ...(params.imageModelUsesMcp && params.mcpConnectionId
        ? { mcpConnectionId: params.mcpConnectionId }
        : {}),
      ...(params.imageModelUsesMcp &&
      params.mcpConnectionId &&
      params.sharedGroupId != null
        ? { sharedGroupId: params.sharedGroupId }
        : {}),
      // Defensively mutually exclusive with `mcpConnectionId` above even if
      // a caller passed both flags true — a model row resolves to exactly
      // one transport, so the MCP field (if present) always wins.
      ...(params.imageModelUsesHermes &&
      params.hermesConnectionId &&
      !(params.imageModelUsesMcp && params.mcpConnectionId)
        ? { hermesConnectionId: params.hermesConnectionId }
        : {}),
      // Main portrait regeneration defaults to no reference. An explicit
      // referenceAssetLinkId still wins in the backend resolver.
      referencePolicy: params.referencePolicy ?? "none",
      ...(params.referenceAssetLinkId
        ? { referenceAssetLinkId: params.referenceAssetLinkId }
        : {}),
    },
  };
}

/** Bilingual summary toast copy for a `detectCharacterVariantsNow` success
 *  response — matches the exact wording confirmed in the task brief. All
 *  three counts at 0 gets its own "nothing found" message rather than
 *  "Created 0 variant(s), 0 twin(s), updated 0", which reads as a bug/error
 *  even though the call succeeded. */
export function buildDetectCharacterVariantsSummaryMessage(
  lang: Lang,
  result: {
    variantsCreated: number;
    variantsUpdated: number;
    twinsCreated: number;
  }
): string {
  if (
    result.variantsCreated === 0 &&
    result.variantsUpdated === 0 &&
    result.twinsCreated === 0
  ) {
    return t(
      lang,
      "ไม่พบ variant/แฝดใหม่จากเนื้อเรื่องปัจจุบัน",
      "No new variants/twins found in the current story"
    );
  }
  return t(
    lang,
    `สร้าง variant ${result.variantsCreated} รายการ, แฝด ${result.twinsCreated} รายการ, อัปเดต ${result.variantsUpdated} รายการ`,
    `Created ${result.variantsCreated} variant(s), ${result.twinsCreated} twin(s), updated ${result.variantsUpdated}`
  );
}

/** Shared error-message resolution for every mutation's `onError` in this
 *  panel — extracted to a pure, exported function so it's independently
 *  testable (e.g. that `deleteCharacter`'s PRECONDITION_FAILED Thai message
 *  passes straight through unmodified) without needing a full component
 *  render. Byte-identical logic to what `onError` inlined before this
 *  extraction — EXCEPT (Feature 135 section-10 review fix) a `[HERMES_X] ...`
 *  prefixed message (the pinned server wire convention, `shared/hermesMedia.ts`)
 *  is now rendered via `presentHermesError`/`formatHermesErrorForToast`
 *  instead of leaking the raw bracketed English string; every other message
 *  (including this file's own pre-existing test fixtures) passes through
 *  completely unchanged — `presentHermesError` returns `null` for them. */
export function resolveVdCharacterMutationErrorMessage(
  err: { message?: string } | null | undefined,
  lang: Lang
): string {
  const presentation = presentHermesError(err ?? null);
  if (presentation) return formatHermesErrorForToast(presentation, lang);
  const creditCapacityMessage = resolveCharacterCreditCapacityMessage(
    err,
    lang
  );
  if (creditCapacityMessage) return creditCapacityMessage;
  const roleTierMismatch = resolveCharacterRoleTierMismatchMessage(err, lang);
  if (roleTierMismatch) return roleTierMismatch;
  return err?.message ?? t(lang, "เกิดข้อผิดพลาด", "Something went wrong");
}

/**
 * Provider account capacity is temporary when another request is still
 * running.  The durable prompt job now retries this condition, but keep the
 * terminal fallback actionable if the provider remains saturated after the
 * bounded retry window.
 */
export function resolveCharacterCreditCapacityMessage(
  err: { message?: string } | null | undefined,
  lang: Lang
): string | null {
  const message = (err?.message ?? "").toLowerCase().replace(/\s+/g, " ");
  if (
    !message.includes("would exceed your available credits") ||
    !message.includes("in-flight")
  ) {
    return null;
  }
  return lang === "th"
    ? "ระบบส่งงานสร้างตัวละครแล้ว แต่ผู้ให้บริการกำลังใช้เครดิตกับงานอื่นอยู่ ระบบรอและลองให้อัตโนมัติแล้ว หากยังไม่สำเร็จให้รอให้งานเดิมเสร็จ แล้วกดสร้างใหม่ได้โดยไม่ต้องสร้างข้อมูลตัวละครซ้ำ"
    : "The character job was submitted, but the provider is using credits for other in-flight work. The system waited and retried automatically. If it still fails, wait for the existing jobs to finish and retry; the character data does not need to be recreated.";
}

/**
 * Converts the server's deliberate role-tier validation failure into an
 * actionable creator-facing message. The raw schema error is still useful in
 * logs, but it is not useful in a toast — especially when the model reports a
 * coarse tier such as `support` while the authoritative character record says
 * `child`.
 *
 * Keep this parser narrow: unrelated schema errors must continue to pass
 * through their existing messages instead of being mislabeled as a role
 * problem. The server message is stable because it is authored by
 * `isCompatibleReportedRoleTier` in the character visual-bible service.
 */
export function resolveCharacterRoleTierMismatchMessage(
  err: { message?: string } | null | undefined,
  lang: Lang
): string | null {
  const message = err?.message ?? "";
  const match = message.match(
    /Reported role tier "([^"]+)" does not match authoritative input tier "([^"]+)"\./i
  );
  if (!match) return null;

  const reportedRoleTier = match[1];
  const expectedRoleTier = match[2];
  const coarseRoleTierLabels: Record<string, { th: string; en: string }> = {
    child: { th: "เด็ก", en: "Child" },
    lead: { th: "ตัวเอก", en: "Lead" },
    lead_female: { th: "นางเอก", en: "Female lead" },
    lead_male: { th: "พระเอก", en: "Male lead" },
    villain: { th: "ตัวร้าย", en: "Villain" },
    villain_female: { th: "นางร้าย", en: "Female villain" },
    villain_male: { th: "ตัวร้ายชาย", en: "Male villain" },
    second_lead: { th: "ตัวรอง", en: "Second lead" },
    support: { th: "ตัวประกอบ", en: "Supporting character" },
    other: { th: "อื่น ๆ", en: "Other" },
  };
  const labelFor = (roleTier: string): string => {
    const canonicalLabel = getCanonicalRoleLabel(roleTier, lang);
    if (canonicalLabel) return `${canonicalLabel} (${roleTier})`;
    const coarseLabel = coarseRoleTierLabels[roleTier];
    if (coarseLabel)
      return `${lang === "th" ? coarseLabel.th : coarseLabel.en} (${roleTier})`;
    return roleTier;
  };

  return lang === "th"
    ? `สร้างตัวละครไม่สำเร็จ: บทบาทตัวละครไม่ตรงกัน — ระบบกำหนด “${labelFor(expectedRoleTier)}” แต่ LLM ส่งกลับ “${labelFor(reportedRoleTier)}” ระบบจึงไม่ใช้ผลลัพธ์นี้เพื่อป้องกันภาพผิดบทบาท กรุณาตรวจสอบ Role/อายุของตัวละคร แล้วลองใหม่`
    : `Character generation stopped: role mismatch — the system expected “${labelFor(expectedRoleTier)}” but the LLM returned “${labelFor(reportedRoleTier)}”. The result was not used to prevent role drift. Check the character role/age and try again.`;
}

/** True when a generate-image mutation's `onError` message indicates the
 *  server rejected the request over `selectedImageModelId` — either the
 *  fail-closed "no model selected" `BAD_REQUEST` thrown by
 *  `resolveCharacterImageModelId` (server: `verticalDramaCharacters.ts`), or
 *  its sibling "unknown"/"disabled" model messages. Used to additionally
 *  reopen the model-picker dialog instead of just toasting, since a plain
 *  toast leaves the user stuck without a next step. Matched on message
 *  content (not `error.data.code`, which stays `BAD_REQUEST` for plenty of
 *  unrelated validation failures too) — exported so it's unit-testable
 *  against the exact server copy without mounting the component. */
export function isImageModelSelectionError(
  err: { message?: string } | null | undefined
): boolean {
  const message = err?.message ?? "";
  return /เลือกโมเดลภาพ/.test(message) || /image model/i.test(message);
}

function extractCharacterDescriptionForDisplay(
  data: Record<string, unknown> | null | undefined
): string | undefined {
  if (!data) return undefined;
  const parts: string[] = [];
  if (
    typeof data.personality === "string" &&
    data.personality.trim() &&
    !looksLikeCharacterLookStoryLeak(data.personality)
  ) {
    parts.push(`Personality: ${data.personality.trim()}`);
  }
  if (
    typeof data.backstory === "string" &&
    data.backstory.trim() &&
    !looksLikeCharacterLookStoryLeak(data.backstory)
  ) {
    parts.push(`Backstory: ${data.backstory.trim()}`);
  }
  if (
    typeof data.identityLock === "string" &&
    data.identityLock.trim() &&
    !looksLikeCharacterLookStoryLeak(data.identityLock)
  ) {
    parts.push(`Identity lock: ${data.identityLock.trim()}`);
  }
  if (Array.isArray(data.wardrobeRules)) {
    const rules = data.wardrobeRules.filter(
      (rule): rule is string =>
        typeof rule === "string" &&
        rule.trim().length > 0 &&
        !looksLikeCharacterLookStoryLeak(rule)
    );
    if (rules.length > 0) parts.push(`Wardrobe rules: ${rules.join("; ")}`);
  }
  return parts.length > 0 ? parts.join(" | ") : undefined;
}

function canRepairLegacyCharacterLook(
  data: Record<string, unknown> | null | undefined
): boolean {
  // The repair action is deliberately available for every persisted row. A
  // click is an explicit request to let the skill reinterpret the complete
  // record, including rows that already look standard or have old metadata.
  // The server remains the authorization boundary for this user-triggered
  // overwrite; automatic episode repair still protects manual rows.
  return Boolean(data);
}

/**
 * Fallback source for the character description: the series bible's own
 * character roster (`bible.refinedCharacters`, falling back to
 * `bible.charactersDraft`) already has a real, rich `description` per
 * character — generated at the story-bible stage — which is where this
 * information actually lives; `character.data` (read above) is a separate,
 * often-empty free-form field. Showing "no description yet" when the bible
 * clearly has one read as a bug, not an empty state. Matched by name
 * (case-sensitive substring either direction) since the bible tends to use
 * full names — e.g. "พิมพ์วิภา รัตนไพศาล" — while the character record's own
 * `name` is often just the given name, "พิมพ์วิภา".
 */
function findBibleCharacterDescription(
  bible: Record<string, unknown> | null | undefined,
  characterName: string
): string | undefined {
  if (!bible || !characterName) return undefined;
  const roster = Array.isArray(bible.refinedCharacters)
    ? bible.refinedCharacters
    : Array.isArray(bible.charactersDraft)
      ? bible.charactersDraft
      : [];
  for (const entry of roster as Array<Record<string, unknown>>) {
    const bibleName = typeof entry.name === "string" ? entry.name.trim() : "";
    if (!bibleName) continue;
    if (
      bibleName.includes(characterName) ||
      characterName.includes(bibleName)
    ) {
      const description =
        typeof entry.description === "string" ? entry.description.trim() : "";
      if (description) return description;
    }
  }
  return undefined;
}

/* -------------------------------------------------------------------------- */
/* F132F speech-profile editing form state (spec 132 §7.3, added 2026-07-09)  */
/* -------------------------------------------------------------------------- */

/** Editable form-state mirror of `VerticalDramaSpeechProfile` — the array
 *  fields (`forbiddenStyle`/`signaturePhrases`) are edited as newline-
 *  separated free text and split/joined only at the form <-> schema
 *  boundary (`formStateToSpeechProfile`/`speechProfileToFormState`), so the
 *  inputs behave like a normal textarea rather than a tag-picker widget. */
export type VdSpeechProfileFormState = {
  speakingSpeed: VerticalDramaSpeechProfile["speakingSpeed"];
  vocabularyLevel: VerticalDramaSpeechProfile["vocabularyLevel"];
  emotionalDefault: string;
  typicalSentenceLength: VerticalDramaSpeechProfile["typicalSentenceLength"];
  metaphorUsage: VerticalDramaSpeechProfile["metaphorUsage"];
  commonLineFunction: string;
  forbiddenStyleText: string;
  signaturePhrasesText: string;
};

export const VD_SPEECH_PROFILE_FORM_DEFAULTS: VdSpeechProfileFormState = {
  speakingSpeed: "normal",
  vocabularyLevel: "everyday",
  emotionalDefault: "",
  typicalSentenceLength: "medium",
  metaphorUsage: "occasional",
  commonLineFunction: "",
  forbiddenStyleText: "",
  signaturePhrasesText: "",
};

/** Splits a newline-separated textarea value into a trimmed, non-empty-only string array — `undefined` when the result would be empty (matches `speechProfileSchema`'s optional-array convention, never persists an empty array). */
function splitLinesToArray(text: string): string[] | undefined {
  const lines = text
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines : undefined;
}

export function speechProfileToFormState(
  profile: VerticalDramaSpeechProfile | undefined
): VdSpeechProfileFormState {
  if (!profile) return VD_SPEECH_PROFILE_FORM_DEFAULTS;
  return {
    speakingSpeed: profile.speakingSpeed,
    vocabularyLevel: profile.vocabularyLevel,
    emotionalDefault: profile.emotionalDefault,
    typicalSentenceLength: profile.typicalSentenceLength,
    metaphorUsage: profile.metaphorUsage,
    commonLineFunction: profile.commonLineFunction,
    forbiddenStyleText: (profile.forbiddenStyle ?? []).join("\n"),
    signaturePhrasesText: (profile.signaturePhrases ?? []).join("\n"),
  };
}

export function formStateToSpeechProfile(
  form: VdSpeechProfileFormState
): Record<string, unknown> {
  return {
    speakingSpeed: form.speakingSpeed,
    vocabularyLevel: form.vocabularyLevel,
    emotionalDefault: form.emotionalDefault.trim(),
    typicalSentenceLength: form.typicalSentenceLength,
    metaphorUsage: form.metaphorUsage,
    commonLineFunction: form.commonLineFunction.trim(),
    forbiddenStyle: splitLinesToArray(form.forbiddenStyleText),
    signaturePhrases: splitLinesToArray(form.signaturePhrasesText),
  };
}

/* -------------------------------------------------------------------------- */
/* Per-character ethnicity/region override — pure helpers                    */
/* (planning/vd-per-character-ethnicity/plan.md, 2026-07-17). Server side is  */
/* DONE — `createCharacter`/`updateCharacter` already accept `region`         */
/* (enum, one of `VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS`) and `ethnicityText`*/
/* (free string, max 80), persisted into `character.data.region`/            */
/* `character.data.ethnicityText` (see `verticalDramaCharacters.ts`'s         */
/* `mergeCharacterRegionOverrideIntoData`). Free text wins over the dropdown  */
/* — enforced server-side by `resolveCharacterTargetAudienceRegion` — this    */
/* file only has to prefill + submit both fields untouched. A full render    */
/* test of this panel is impractical (see                                    */
/* `VerticalDramaCharacterStockPanel.referencePicker.test.ts`'s established   */
/* precedent) so, same as the speech-profile helpers just above, the         */
/* form-state <-> payload conversion is pulled out into these exported pure  */
/* functions instead of asserting on rendered DOM.                           */
/* -------------------------------------------------------------------------- */

/** Draft-form shape for the region/ethnicity controls. `region: ""` means
 *  "unset — inherit the series-level default" — it must NEVER be defaulted
 *  to a preset (user decision: no backfill; existing/blank characters stay
 *  unset until the user explicitly picks one). */
export interface VdRegionOverrideFormState {
  region: string;
  ethnicityText: string;
}

export const VD_REGION_OVERRIDE_FORM_DEFAULTS: VdRegionOverrideFormState = {
  region: "",
  ethnicityText: "",
};

/** Radix `Select.Item` rejects an empty-string `value` — this sentinel is
 *  used ONLY as the "ไม่ระบุ / inherit series default" option's control
 *  value; it is translated back to `""` (unset) in the `onValueChange`
 *  handler and never leaves the component / reaches any mutation payload. */
const VD_REGION_UNSET_SENTINEL = "unset";

/** Prefill helper — reads the two override keys off a character's loosely-
 *  typed `data` jsonb payload, mirroring the server's own
 *  `readCharacterRegionOverrideFromData` "tolerant, never throws on a
 *  malformed value" convention: a non-string or unrecognized `region` is
 *  silently treated as unset rather than crashing or guessing a default. */
export function regionOverrideFormFromCharacterData(
  data: Record<string, unknown> | null | undefined
): VdRegionOverrideFormState {
  const rawRegion = data?.region;
  const region =
    typeof rawRegion === "string" &&
    (VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS as readonly string[]).includes(
      rawRegion
    )
      ? rawRegion
      : "";
  const ethnicityText =
    typeof data?.ethnicityText === "string" ? data.ethnicityText : "";
  return { region, ethnicityText };
}

/** Builds the `createCharacter` payload fragment from the draft form.
 *  `createCharacter`'s `region`/`ethnicityText` inputs are `.optional()`
 *  only (no `.nullable()`) — so an unset field must be OMITTED, never sent
 *  as `null` (that would fail the create schema). */
export function buildCharacterRegionOverrideCreateFields(
  form: VdRegionOverrideFormState
): { region?: VerticalDramaTargetAudienceRegion; ethnicityText?: string } {
  const ethnicityText = form.ethnicityText.trim();
  return {
    ...(form.region
      ? { region: form.region as VerticalDramaTargetAudienceRegion }
      : {}),
    ...(ethnicityText ? { ethnicityText } : {}),
  };
}

/** Builds the `updateCharacter` payload fragment from the draft form.
 *  Unlike `createCharacter`, `updateCharacter`'s inputs are
 *  `.nullable().optional()` — sending `null` explicitly CLEARS an
 *  already-set override back to "inherit the series default" without the
 *  caller resending the character's entire `data` blob (see
 *  `updateCharacter`'s own doc comment). Always sends both fields together
 *  so a single Save always fully replaces both, matching the free-text-wins
 *  precedence `resolveCharacterTargetAudienceRegion` resolves server-side. */
export function buildCharacterRegionOverrideUpdateFields(
  form: VdRegionOverrideFormState
): {
  region: VerticalDramaTargetAudienceRegion | null;
  ethnicityText: string | null;
} {
  const ethnicityText = form.ethnicityText.trim();
  return {
    region: (form.region || null) as VerticalDramaTargetAudienceRegion | null,
    ethnicityText: ethnicityText || null,
  };
}

/** Compact roster-card label for a character's EXPLICIT region/ethnicity —
 *  `null` when nothing is set, so the (already dense — see badge-overflow
 *  fix) roster card renders no chip at all for the common unset case.
 *  Free text wins over the dropdown for display too, mirroring
 *  `resolveCharacterTargetAudienceRegion`'s server-side precedence. */
export function getCharacterRegionBadgeLabel(
  data: Record<string, unknown> | null | undefined,
  lang: Lang
): string | null {
  const ethnicityText =
    typeof data?.ethnicityText === "string" ? data.ethnicityText.trim() : "";
  if (ethnicityText) return ethnicityText;
  const rawRegion = data?.region;
  if (
    typeof rawRegion === "string" &&
    (VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS as readonly string[]).includes(
      rawRegion
    )
  ) {
    const region = rawRegion as VerticalDramaTargetAudienceRegion;
    return lang === "th"
      ? VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_LABELS_TH[region]
      : VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_LABELS_EN[region];
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Localized copy                                                             */
/* -------------------------------------------------------------------------- */

type Lang = "th" | "en";
const t = (lang: Lang, th: string, en: string) => (lang === "th" ? th : en);

/* -------------------------------------------------------------------------- */
/* Media status-poll error classification — pure helpers                     */
/* (planning/fix-character-image-false-failure/plan.md, section "A. Client") */
/* -------------------------------------------------------------------------- */

/** tRPC error `.data` shape, loosely typed like `systemErrorMonitor`'s own
 *  private helper of the same purpose (not exported from there, so kept as a
 *  small local copy rather than reaching into that module's internals). */
type PollTrpcErrorData = { code?: string; httpStatus?: number };

function getPollTrpcErrorData(error: unknown): PollTrpcErrorData | undefined {
  if (!(error instanceof TRPCClientError)) return undefined;
  return error.data as PollTrpcErrorData | undefined;
}

function isAbortLikeError(value: unknown): boolean {
  if (typeof DOMException !== "undefined" && value instanceof DOMException) {
    return value.name === "AbortError";
  }
  return value instanceof Error && value.name === "AbortError";
}

/**
 * Fallback signal for the two real call sites this classifier serves —
 * verified against actual server behavior (not guessed), 2026-07-31:
 *  - `verticalDramaCharacters.settlePortraitCandidate`
 *    (`server/routers/verticalDramaCharacters.ts` ~1609) lets a thrown
 *    `Error("Get task failed: <upstream status>")` from
 *    `mediaGenerationService.getTask` (`server/services/mediaGenerationService.ts`
 *    ~2919) escape uncaught. tRPC's default unknown-error wrapping turns
 *    that into `TRPCError(code: "INTERNAL_SERVER_ERROR", httpStatus: 500)`
 *    — matches the production evidence
 *    (`[tRPC] ERROR: verticalDramaCharacters.settlePortraitCandidate: Get
 *    task failed: 429`). The *real* upstream status (429 in the evidence)
 *    only survives in `.message`; `classifyError` below already treats
 *    `httpStatus 500`/`INTERNAL_SERVER_ERROR` as transient, so this regex
 *    is defense-in-depth there.
 *  - `media.getTask` (`server/routers/media.ts` ~3723) explicitly catches
 *    ANY thrown error from the same `mediaGenerationService.getTask` and
 *    rethrows as `TRPCError(code: "NOT_FOUND", httpStatus: 404, message:
 *    <original message>)` — httpStatus/code are 404/NOT_FOUND regardless of
 *    the real cause, so for THIS endpoint the message text is the *only*
 *    place the real signal (429/408/5xx/rate-limit/timeout) survives, which
 *    is why this fallback is load-bearing (not merely defensive) for
 *    `pollCharacterImageTask`.
 */
const TRANSIENT_POLL_MESSAGE_PATTERN =
  /\b(429|408|5\d{2})\b|rate.?limit|too many requests|request timeout|\btimed?\s*out\b/i;

export type MediaPollErrorClass = "transient" | "terminal";

/**
 * Classifies a THROWN status-poll error as TRANSIENT (we simply failed to
 * OBSERVE the job — rate limit, network blip, gateway 5xx, or a client-side
 * request timeout/abort) or TERMINAL (anything else — most likely a
 * structural/programming error that will not resolve by retrying, e.g. a
 * mismatched task id).
 *
 * Deliberately does NOT decide "the generation failed" in either case — per
 * the plan's core principle, only a genuine server-reported
 * `status === "failed"` result (returned, never thrown, by
 * `settlePortraitCandidate`/`media.getTask`) may ever render as failed.
 * Callers must land a TERMINAL-classified thrown error in the same
 * non-destructive "outcome not yet confirmed" state a TRANSIENT error uses
 * once its retry budget is exhausted (`buildPortraitCandidateUnresolvedOutcomePatch`)
 * — TERMINAL here only means "stop retrying immediately", not "mark failed".
 */
export function classifyMediaPollError(error: unknown): MediaPollErrorClass {
  if (classifyError(error) === "system") return "transient";
  if (isAbortLikeError(error)) return "transient";
  const cause =
    error instanceof Error ? (error as { cause?: unknown }).cause : undefined;
  if (isNetworkConnectionError(cause) || isAbortLikeError(cause))
    return "transient";
  const data = getPollTrpcErrorData(error);
  if (data?.httpStatus === 429 || data?.httpStatus === 408) return "transient";
  if (data?.code === "TOO_MANY_REQUESTS" || data?.code === "TIMEOUT")
    return "transient";
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  if (TRANSIENT_POLL_MESSAGE_PATTERN.test(message)) return "transient";
  return "terminal";
}

/** Reuses the shared query-retry budget (`requestResilience.ts`) as the cap
 *  on CONSECUTIVE transient poll errors — bounds how long a persistent
 *  provider outage can stall a poll loop before it gives up early, without
 *  introducing a second bespoke magic number. A run that alternates
 *  successful reads with occasional transient errors never hits this; it
 *  only fires on an unbroken streak. Still bounded overall by each poll
 *  loop's own existing attempt budget either way. */
export const VD_MEDIA_POLL_MAX_CONSECUTIVE_TRANSIENT_ERRORS =
  RETRYABLE_QUERY_MAX_ATTEMPTS;

/**
 * Shared "we could not confirm the outcome" copy — used both when a
 * transient status-read error exhausts its retry budget and when a
 * TERMINAL-classified (non-retryable) read error is hit directly.
 * Deliberately NOT "ล้มเหลว"/"failed": failing to observe a job's status is
 * not the job failing.
 */
export function buildPollUnresolvedOutcomeMessage(lang: Lang): string {
  return t(
    lang,
    "ยังไม่ทราบผล — ระบบเก็บงานไว้ให้ตรวจสอบภายหลัง",
    "Outcome not yet confirmed — the task remains saved for later review."
  );
}

/* -------------------------------------------------------------------------- */
/* Portrait candidate — pure helpers                                         */
/* (planning/vd-stuck-generation-and-lost-characters/plan.md, Set A —         */
/* stuck / policy-rejected character portrait candidates never clear)        */
/* -------------------------------------------------------------------------- */

/** Once a candidate reaches one of these it is final; only an
 *  equally-or-more-final durable status should ever move it — never a stale
 *  in-memory non-terminal status (see `mergeDurablePortraitCandidateStatus`). */
export const VD_PORTRAIT_CANDIDATE_TERMINAL_STATUSES: ReadonlySet<VdPortraitCandidateUiStatus> =
  new Set(["completed", "failed", "selected", "superseded"]);

/**
 * Set A fix #1: previously a 30-min poll timeout only fired a toast and left
 * the card frozen on "กำลังสร้าง…" forever
 * (`VerticalDramaCharacterStockPanel.tsx`'s old `pollPortraitCandidateTask`
 * timeout branch). This builds the terminal-`failed` patch that function now
 * applies via `updatePortraitCandidateUi` so the card visibly stops instead
 * of hanging.
 */
export function buildPortraitCandidateTimeoutPatch(
  lang: Lang
): Pick<VdPortraitCandidateUiItem, "status" | "errorMessage"> {
  return {
    status: "failed",
    errorMessage: t(
      lang,
      "ใช้เวลานานเกินไป — กรุณาลองใหม่",
      "Taking too long — please retry."
    ),
  };
}

/**
 * Set B fix (planning/fix-character-image-false-failure/plan.md): the
 * non-destructive landing patch `pollPortraitCandidateTask` applies when it
 * cannot confirm the outcome — either a TRANSIENT status-read error
 * exhausted its retry budget, or a TERMINAL-classified (non-retryable) read
 * error was hit directly (`classifyMediaPollError`). Unlike
 * `buildPortraitCandidateTimeoutPatch` (which is for the unrelated case
 * where every read genuinely succeeded and the job simply never left
 * "queued" within the SLA), status stays `"queued"` — a non-terminal value
 * — deliberately so:
 *  1. it is never rendered as "ล้มเหลว"/"Failed" (core principle: failing to
 *     OBSERVE a job's status is not the job failing), and
 *  2. the next durable-status refetch (`mergeDurablePortraitCandidateStatus`)
 *     and the panel's own resume-on-mount effect (both already gated on
 *     `status === "queued" | "submitting"`) can still advance the card to
 *     its real outcome once it becomes observable again, instead of
 *     freezing it at a wrong verdict.
 */
export function buildPortraitCandidateUnresolvedOutcomePatch(
  lang: Lang
): Pick<VdPortraitCandidateUiItem, "status" | "errorMessage"> {
  return {
    status: "queued",
    errorMessage: buildPollUnresolvedOutcomeMessage(lang),
  };
}

/**
 * Set A fix #2 (the core bug): merges the durable (server-persisted) view of
 * a portrait candidate onto the in-memory (locally-polled) one. Previously
 * only a durable `selected`/`superseded` was ever copied from `saved`, so a
 * durable `failed` (e.g. corrected by a background reconciler, or set from
 * another browser tab) never advanced a frozen in-memory `queued`/
 * `submitting` card — the rejection never surfaced in this tab.
 *
 * Rules:
 *  - `saved.status` of `selected`/`superseded` always wins — unchanged from
 *    the pre-fix behavior (another tab's selection outcome must always be
 *    reflected here, even over a locally `completed` candidate).
 *  - A durable `failed`/`completed` also now advances the card, but ONLY
 *    when the in-memory status is not already terminal itself — an
 *    already-final local state (e.g. this tab's own poll just settled it,
 *    or `buildPortraitCandidateTimeoutPatch` already marked it `failed`) is
 *    never downgraded by a differently-terminal saved status.
 */
export function mergeDurablePortraitCandidateStatus(
  candidate: VdPortraitCandidateUiItem,
  saved: VdPortraitCandidateUiItem | undefined
): VdPortraitCandidateUiItem {
  if (!saved) return candidate;
  const merged: VdPortraitCandidateUiItem = {
    ...candidate,
    ...(saved.taskId && !candidate.taskId ? { taskId: saved.taskId } : {}),
    ...(saved.imageUrl && !candidate.imageUrl
      ? { imageUrl: saved.imageUrl }
      : {}),
  };
  if (saved.status === "selected" || saved.status === "superseded") {
    return { ...merged, status: saved.status };
  }
  const inMemoryIsTerminal = VD_PORTRAIT_CANDIDATE_TERMINAL_STATUSES.has(
    candidate.status
  );
  if (
    !inMemoryIsTerminal &&
    (saved.status === "failed" || saved.status === "completed")
  ) {
    return {
      ...merged,
      status: saved.status,
      ...(saved.status === "failed" && saved.errorMessage
        ? { errorMessage: saved.errorMessage }
        : {}),
    };
  }
  return merged;
}

/**
 * Set A fix #3 "Cancel" pure helper: optimistically drops a candidate from
 * its in-memory batch so the card disappears immediately, before the
 * `deleteAsset` round-trip + query invalidation land.
 */
export function removePortraitCandidateFromBatch(
  batch: VdPortraitCandidateUiBatch,
  assetLinkId: string
): VdPortraitCandidateUiBatch {
  return {
    ...batch,
    candidates: batch.candidates.filter(
      candidate => candidate.assetLinkId !== assetLinkId
    ),
  };
}

/**
 * Policy refusals are terminal for the current portrait-candidate submission.
 * The user may manually edit the source and choose Retry after reviewing the
 * refusal; this helper remains false so a policy error can never cause an
 * automatic resubmit or credit-consuming loop.
 */
export function shouldAutoSoftenPortraitCandidate(
  errorMessage: string | undefined,
  softenLevel: number
): boolean {
  void errorMessage;
  void softenLevel;
  return false;
}

/**
 * Character Design Bible sheet formats (vertical-drama-character-sheet-
 * consolidation plan, Phase C). Value-for-value mirror of the router's own
 * `CHARACTER_SHEET_TYPE_VALUES` (`apps/web/server/routers/
 * verticalDramaCharacters.ts`) — kept as a local literal array rather than
 * importing that export directly: the router file pulls in server-only
 * modules (db, TRPCError, etc.) that must never end up in the client bundle,
 * and this array is needed as a runtime VALUE here (to build
 * `SHEET_TYPE_OPTIONS` below), not just a type, so a type-only import can't
 * substitute for it. If the router's array ever changes, update this to
 * match.
 */
const VD_CHARACTER_SHEET_TYPE_VALUES = [
  "auto",
  "turnaround",
  "full_combined",
  "cover",
  "character_profile",
  "face_detail",
  "expression_12",
  "hair_reference",
  "costume_breakdown",
  "material_fabric",
  "color_palette",
  "pose_library",
  "body_proportion",
  "ai_prompt_lock",
] as const;
type VdCharacterSheetType = (typeof VD_CHARACTER_SHEET_TYPE_VALUES)[number];

interface VdSheetTypeOption {
  value: VdCharacterSheetType;
  labelTh: string;
  labelEn: string;
}

/** Options for the unified sheet-type `<Select>` in the character detail
 *  panel (replaces the old two separate "สร้างชีทตัวละคร"/"Character Sheet
 *  แบบเต็ม" buttons) — one entry per `VD_CHARACTER_SHEET_TYPE_VALUES` value,
 *  in the same order. */
const SHEET_TYPE_OPTIONS: VdSheetTypeOption[] = [
  { value: "auto", labelTh: "อัตโนมัติ", labelEn: "Auto" },
  {
    value: "turnaround",
    labelTh: "ชีทหมุนรอบตัว (3 มุม)",
    labelEn: "Turnaround (3-angle)",
  },
  {
    value: "full_combined",
    labelTh: "Character Sheet แบบเต็ม",
    labelEn: "Full character sheet",
  },
  { value: "cover", labelTh: "หน้าปก", labelEn: "Cover" },
  {
    value: "character_profile",
    labelTh: "โปรไฟล์ตัวละคร",
    labelEn: "Character profile",
  },
  {
    value: "face_detail",
    labelTh: "รายละเอียดใบหน้า",
    labelEn: "Face detail",
  },
  {
    value: "expression_12",
    labelTh: "ชีทสีหน้า (12 แบบ)",
    labelEn: "Expression sheet (12)",
  },
  {
    value: "hair_reference",
    labelTh: "อ้างอิงทรงผม",
    labelEn: "Hair reference",
  },
  {
    value: "costume_breakdown",
    labelTh: "แจกแจงชุด",
    labelEn: "Costume breakdown",
  },
  {
    value: "material_fabric",
    labelTh: "วัสดุ/เนื้อผ้า",
    labelEn: "Material & fabric",
  },
  { value: "color_palette", labelTh: "จานสี", labelEn: "Color palette" },
  {
    value: "pose_library",
    labelTh: "คลังท่าโพส",
    labelEn: "Pose library",
  },
  {
    value: "body_proportion",
    labelTh: "สัดส่วนร่างกาย",
    labelEn: "Scale & proportion",
  },
  {
    value: "ai_prompt_lock",
    labelTh: "AI Prompt Lock",
    labelEn: "AI prompt lock",
  },
];

/** Best-effort label for a `character_design_bible`-role asset, derived from
 *  its `metadata.sheetType` (see `resolveCharacterSheetAssetTag` server-side)
 *  via `SHEET_TYPE_OPTIONS`. Returns `undefined` when the metadata is
 *  missing/unrecognized so callers can fall back to a generic label. */
function sheetTypeLabelFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
  langKey: "th" | "en"
): string | undefined {
  const sheetType =
    metadata && typeof metadata.sheetType === "string"
      ? metadata.sheetType
      : undefined;
  if (!sheetType) return undefined;
  const option = SHEET_TYPE_OPTIONS.find(o => o.value === sheetType);
  if (!option) return undefined;
  return langKey === "th" ? option.labelTh : option.labelEn;
}

/* -------------------------------------------------------------------------- */
/* Props                                                                       */
/* -------------------------------------------------------------------------- */

type VariantAnalysisSummary = {
  variantsCreated: number;
  variantsUpdated: number;
  twinsCreated: number;
  createdCharacters?: unknown[];
  updatedCharacters?: unknown[];
};

export interface VerticalDramaCharacterStockPanelProps {
  seriesId: string;
  /** When true (archived series), all mutating controls are disabled. */
  readOnly?: boolean;
  /** W12-B voice chain wave — gates the per-character voice-casting card
   *  (`VerticalDramaCharacterVoiceCastingCard`) mounted below the selected
   *  character's detail card. `false`/omitted renders byte-identical to
   *  before this wave (see `VerticalDramaSeriesDetailPage.tsx`'s
   *  `useTenantFeatureFlag("verticalDramaSeriesVoiceChain")`). */
  voiceChainEnabled?: boolean;
  /** F132F `verticalDramaCharacterProfiles` (spec 132 §7.3, added 2026-07-09)
   *  — gates the speech-profile editing sub-section mounted below the
   *  selected character's detail card, and the voice-casting card's
   *  "prefill from speech profile" suggestion action. `false`/omitted
   *  renders byte-identical to before this section (see
   *  `VerticalDramaSeriesDetailPage.tsx`'s
   *  `useTenantFeatureFlag("verticalDramaCharacterProfiles")`). */
  characterProfilesEnabled?: boolean;
  /** Feature 137 P2 angle-pack generation gate (default-off). */
  videoSafeStartFramesEnabled?: boolean;
  className?: string;
}

/* -------------------------------------------------------------------------- */
/* Panel                                                                       */
/* -------------------------------------------------------------------------- */

export function VerticalDramaCharacterStockPanel({
  seriesId,
  readOnly = false,
  voiceChainEnabled = false,
  characterProfilesEnabled = false,
  videoSafeStartFramesEnabled = false,
  className,
}: VerticalDramaCharacterStockPanelProps) {
  const lang = useVerticalDramaLang();
  const utils = trpc.useUtils();
  const [variantAnalysisJobId, setVariantAnalysisJobId] = useState<
    string | null
  >(null);
  const [variantAnalysisResult, setVariantAnalysisResult] =
    useState<VariantAnalysisSummary | null>(null);
  const interactiveJobStatusProcedure =
    trpc.verticalDramaSeries.getInteractiveJobStatus;
  const variantAnalysisJobQuery = interactiveJobStatusProcedure?.useQuery(
    {
      jobId: variantAnalysisJobId ?? "00000000-0000-0000-0000-000000000000",
      scopeKey: `series:${seriesId}`,
    },
    {
      enabled: Boolean(variantAnalysisJobId),
      refetchInterval: variantAnalysisJobId ? 2000 : false,
      staleTime: 0,
    }
  ) ?? { data: undefined };
  useEffect(() => {
    const job = variantAnalysisJobQuery.data;
    if (!job || !variantAnalysisJobId) return;
    if (job.status === "succeeded") {
      const result = job.result as VariantAnalysisSummary;
      setVariantAnalysisResult(result);
      setVariantAnalysisJobId(null);
      invalidate();
      toast.success(buildDetectCharacterVariantsSummaryMessage(lang, result));
    } else if (job.status === "failed") {
      setVariantAnalysisJobId(null);
      onError({ message: job.error ?? "Character analysis failed" });
    }
  }, [lang, variantAnalysisJobId, variantAnalysisJobQuery.data]);
  const { requestConfirmation, creditConfirmDialog } =
    useVerticalDramaCreditConfirmation();
  const confirmCharacterCreditAction = (
    characterId: string,
    title: string,
    description: string,
    confirmLabel: string,
    action: () => void
  ) => {
    requestConfirmation({
      title,
      description,
      confirmLabel,
      cancelLabel: t(lang, "ยกเลิก", "Cancel"),
      testId: `vd-credit-confirm-character-${characterId}`,
      onConfirm: action,
    });
  };

  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(
    () => readStoredCharacterPromptJob(seriesId)?.characterId ?? null
  );
  const [twinLinkTargetId, setTwinLinkTargetId] = useState("");
  const [newName, setNewName] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newRoleTier, setNewRoleTier] = useState<RoleTier | "">("");
  /** Newly-generated portrait URLs keyed by characterId — only populated for
   *  this session's freshly-generated images (see `generateImageMutation`).
   *  Pre-existing assets without a resolvable URL keep their plain-text
   *  `Media #{id}` rendering; this is a pragmatic, session-local cache. */
  const [generatedImageUrls, setGeneratedImageUrls] = useState<
    Record<string, { imageUrl: string; mediaAssetId: string }>
  >({});
  /** Same session-local cache pattern for the "character sheet" (multi-angle
   *  turnaround) reference, keyed by characterId — kept separate from the
   *  single-portrait cache above so both thumbnails can render side by side. */
  const [generatedTurnaroundUrls, setGeneratedTurnaroundUrls] = useState<
    Record<string, { imageUrl: string; mediaAssetId: string }>
  >({});
  /** Same session-local cache pattern, for the full-spec Character Sheet
   *  (a THIRD, separate generation mode alongside portrait/turnaround —
   *  see `generateSheetMutation`). */
  const [generatedSheetUrls, setGeneratedSheetUrls] = useState<
    Record<string, { imageUrl: string; mediaAssetId: string }>
  >({});
  /** 3x3-split tiles for the turnaround/full-sheet results (BUG 3 fix) —
   *  both are multi-panel grid-style images (turnaround = 3-pose row +
   *  padding; full sheet = portrait+turnaround+expression+outfit panels), so
   *  reusing the exact `splitImage(url, 3, 3, ...)` call the Storyboard
   *  panel's own "ตัดภาพ 3x3" flow already ships and live-verifies (see
   *  `VerticalDramaStoryboardPanel.tsx`) gives the user individually
   *  viewable/downloadable frames instead of only one flat composite image.
   *  Keyed by characterId, one map per result kind so both can be split
   *  independently. */
  const [turnaroundSplitTiles, setTurnaroundSplitTiles] = useState<
    Record<string, SplitResult[]>
  >({});
  const [sheetSplitTiles, setSheetSplitTiles] = useState<
    Record<string, SplitResult[]>
  >({});
  const [splittingResultKey, setSplittingResultKey] = useState<string | null>(
    null
  );
  const splitGeneratedResultIntoTiles = async (
    characterId: string,
    kind: "turnaround" | "sheet",
    imageUrl: string
  ) => {
    const resultKey = `${kind}::${characterId}`;
    setSplittingResultKey(resultKey);
    try {
      const results = await splitImage(imageUrl, 3, 3, "image/jpeg", 0.92);
      const setTiles =
        kind === "turnaround" ? setTurnaroundSplitTiles : setSheetSplitTiles;
      setTiles(prev => ({ ...prev, [characterId]: results }));
    } catch {
      toast.error(
        t(
          lang,
          "ตัดภาพไม่สำเร็จ — ตรวจสอบ URL ของภาพ",
          "Failed to split the image — check the image URL."
        )
      );
    } finally {
      setSplittingResultKey(current =>
        current === resultKey ? null : current
      );
    }
  };
  /** Language of the stats text on the full Character Sheet (the character's
   *  own name is never translated). Defaults to English per the confirmed
   *  product decision; toggleable per-generation. */
  const [sheetLanguage, setSheetLanguage] = useState<"en" | "th">("en");
  /** Which Character Design Bible sheet format the unified generate button
   *  (detail panel) will request — bound to the `<Select>` that replaced the
   *  old two separate "สร้างชีทตัวละคร"/"Character Sheet แบบเต็ม" buttons
   *  (vertical-drama-character-sheet-consolidation plan, Phase C). Defaults
   *  to `"auto"`, which the backend resolves to `"turnaround"`. */
  const [selectedSheetType, setSelectedSheetType] =
    useState<VdCharacterSheetType>("auto");
  /** Tracks which character+role pairs are between "task submitted" and
   *  "task completed" — `generateImageMutation.isPending`/`generateSheetMutation.isPending`
   *  only cover the (fast) submit call itself; the actual generation happens
   *  async and is tracked here for the duration of the poll. A Set (not a
   *  single value) — bug fix, 2026-07-05: this used to be a single
   *  `{characterId, role} | null`, so generating one character's image
   *  clobbered the "busy" state for every other character, and (combined
   *  with several buttons disabling on the global `mutating` flag below)
   *  made it impossible to start a second character's generation until the
   *  first one's poll finished. Keyed by `${characterId}::${role}` so the
   *  same character can even have two different roles generating at once. */
  const [pollingCharacters, setPollingCharacters] = useState<Set<string>>(
    new Set()
  );
  /** `role` is intentionally `string`, not a narrow literal union: since the
   *  vertical-drama-character-sheet-consolidation plan (Phase C) merged the
   *  turnaround/full-sheet mutations into one, the backend
   *  (`generateCharacterSheet`) is the sole source of truth for which role a
   *  given `sheetType` resolves to (`"character_sheet_turnaround"`,
   *  `"character_sheet_full"`, or the new `"character_design_bible"` — see
   *  `resolveCharacterSheetAssetTag` server-side), so this key must accept
   *  whatever the response returns rather than a fixed client-side list. */
  const pollingCharacterKey = (characterId: string, role: string) =>
    `${characterId}::${role}`;

  /** Reference-image-picker (vertical-drama-reference-picker-outfit-lock
   *  plan, Phase D3): explicit per-character override of which
   *  `primary_portrait` asset is attached as the identity-lock reference on
   *  the next `generateCharacterImage`/`generateCharacterSheet` call for
   *  that character. Keyed by characterId so switching characters never
   *  clobbers another character's choice; absent key = no explicit main-image
   *  reference. Look/sheet flows select their own server policy.
   *  In-memory only, matches this file's existing per-character state
   *  convention (see `generatedImageUrls`/`pollingCharacters` above) — not
   *  persisted, not reset when the character selection changes. */
  const [referenceOverrideByCharacter, setReferenceOverrideByCharacter] =
    useState<Record<string, string>>({});

  /** Optional free-text visual brief (framing/pose/crop/outfit/setting, e.g.
   *  "หน้าตรง"/"ภาพเต็มตัว ในชุดนอนแบบสบาย") sent alongside the
   *  `previewCharacterPrompt` call as a raw `customInstruction` fact — lets
   *  the LLM honor user-specified visible details instead of returning the
   *  same default portrait
   *  generations instead of producing near-identical prompts every click
   *  (planning/vertical-drama-character-custom-instruction/plan.md). Keyed
   *  by characterId, same rationale and lifecycle as
   *  `referenceOverrideByCharacter` above: in-memory only, per-character, not
   *  reset on selection change, absent key = today's exact default (no
   *  `customInstruction` sent). Shared by both the roster-card compact input
   *  and the detail-panel textarea for the same character. */
  const [customInstructionByCharacter, setCustomInstructionByCharacter] =
    useState<Record<string, string>>({});
  const [
    portraitCandidateCountByCharacter,
    setPortraitCandidateCountByCharacter,
  ] = useState<Record<string, number>>({});
  const [castingLockClothingByCharacter, setCastingLockClothingByCharacter] =
    useState<Record<string, boolean>>({});
  const [castingPoseModeByCharacter, setCastingPoseModeByCharacter] = useState<
    Record<string, "auto_natural" | "lock_reference">
  >({});
  const [castingCameraFramingByCharacter, setCastingCameraFramingByCharacter] =
    useState<
      Record<
        string,
        NonNullable<VdPreviewCharacterPromptInput["castingCameraFraming"]>
      >
    >({});
  const [
    castingReferencePickerUrlsByCharacter,
    setCastingReferencePickerUrlsByCharacter,
  ] = useState<Record<string, string[]>>({});
  const [
    castingReferenceSyncingCharacterId,
    setCastingReferenceSyncingCharacterId,
  ] = useState<string | null>(null);
  const [portraitCandidateBatches, setPortraitCandidateBatches] = useState<
    Record<string, VdPortraitCandidateUiBatch>
  >({});
  const [portraitCandidateResultsMount, setPortraitCandidateResultsMount] =
    useState<HTMLElement | null>(null);
  const portraitCandidateResultsRef = useRef<HTMLElement | null>(null);
  const observedReferenceCandidateBatchIdRef = useRef<string | null>(null);
  const hasObservedReferenceCandidateBatchRef = useRef(false);
  const [
    pollingPortraitCandidateAssetIds,
    setPollingPortraitCandidateAssetIds,
  ] = useState<Set<string>>(new Set());
  const resumedPortraitCandidateTasksRef = useRef<Set<string>>(new Set());
  // Provider status endpoints are rate-limited more aggressively than submit
  // endpoints. Serialize all character-media reads for this panel so a batch
  // of candidates does not produce a burst of simultaneous GETs.
  const mediaPollSchedulerRef = useRef(new SerializedMediaPollScheduler());
  /** Set A fix #3: assetLinkIds currently mid-Retry (from the fresh
   *  single-candidate preview call through the batch-submit mutation) — used
   *  only to disable that one candidate's Retry button against double-clicks
   *  while the round-trip is in flight. */
  const [
    retryingPortraitCandidateAssetIds,
    setRetryingPortraitCandidateAssetIds,
  ] = useState<Set<string>>(new Set());

  /** Master disclosure for the complete reference/casting recovery workflow.
   *  The override is per character so switching characters evaluates the
   *  approved default independently: no primary portrait opens the group,
   *  while an existing primary portrait starts collapsed. */
  const [
    referenceDisclosureOverrideByCharacter,
    setReferenceDisclosureOverrideByCharacter,
  ] = useState<Record<string, boolean>>({});

  /** Model picker for the two "Generate" actions (portrait + character sheet),
   *  mirroring Media Studio's own model-selector-before-generate UX. Persisted
   *  to localStorage (same convention as MediaStudio.tsx's own
   *  `smartspec_video_voice_model` / `smartspec_video_music_model` keys) so
   *  the user doesn't have to re-pick a model every single generate. */
  /** Which slot the shared `ModelSelectorDialog` is currently editing —
   *  `null` when closed. ONE dialog serves both the text-to-image and the
   *  image-to-image slot (`planning/vd-character-image-edit-model/plan.md`)
   *  so the two pickers can never drift in behavior or model list. */
  const [modelDialogTarget, setModelDialogTarget] = useState<
    "create" | "edit" | null
  >(null);
  const isModelDialogOpen = modelDialogTarget !== null;
  const setIsModelDialogOpen = (open: boolean) =>
    setModelDialogTarget(open ? "create" : null);
  const [selectedImageModelId, setSelectedImageModelId] = useState(
    () => safeStorageGet(VD_CHARACTER_IMAGE_MODEL_STORAGE_KEY) || ""
  );
  /** Model for renders that attach a reference image (looks, twins, every
   *  regeneration) — a genuinely different job from a first portrait, and the
   *  best model for it is a different model. Empty = "no separate choice",
   *  which the server reads as "keep using the text-to-image model", i.e.
   *  exactly the previous single-picker behavior. */
  const [selectedEditImageModelId, setSelectedEditImageModelId] = useState(
    () => safeStorageGet(VD_CHARACTER_EDIT_IMAGE_MODEL_STORAGE_KEY) || ""
  );
  const handleSelectImageModel = (modelId: string) => {
    if (modelDialogTarget === "edit") {
      setSelectedEditImageModelId(modelId);
      safeStorageSet(VD_CHARACTER_EDIT_IMAGE_MODEL_STORAGE_KEY, modelId);
      return;
    }
    setSelectedImageModelId(modelId);
    safeStorageSet(VD_CHARACTER_IMAGE_MODEL_STORAGE_KEY, modelId);
  };
  const imageModelsQuery = trpc.mediaModels.list.useQuery({ type: "image" });
  const imageModels = (imageModelsQuery.data?.models ?? []) as MediaModel[];
  const selectedImageModelRecord = imageModels.find(
    m => m.modelId === selectedImageModelId
  );
  const selectedEditImageModelRecord = imageModels.find(
    m => m.modelId === selectedEditImageModelId
  );
  /** Whether the currently-selected image model is MCP-transport (e.g.
   *  `higgsfield/*`, `magnific-mcp/*`) — mirrors
   *  `VerticalDramaEpisodePage.tsx`'s own `imageModelUsesMcp` derivation so
   *  the character tab shows the same MCP-connection picker + guard the
   *  episode workspace already has. */
  /**
   * Covers BOTH selected models, not just the text-to-image one. The client
   * cannot know which of the two the server will pick — that depends on
   * whether a reference image ends up attached, which only the server resolves
   * (`pickCharacterRenderModelId`). Reproducing that three-tier lookup here
   * would drift, so this is deliberately the UNION: if either model needs an
   * MCP connection, ask for one. Over-asking costs the user one picker; under-
   * asking costs them a failed generation, so the union is the fail-closed
   * direction — the same convention as every other model guard in this panel.
   */
  const imageModelUsesMcp =
    (Boolean(selectedImageModelId) &&
      resolveMediaModelTransportConfig({
        provider: selectedImageModelRecord?.provider,
        modelId: selectedImageModelRecord?.modelId ?? selectedImageModelId,
        configJson: selectedImageModelRecord?.configJson as
          | Record<string, unknown>
          | undefined,
      }).transport === "mcp") ||
    (Boolean(selectedEditImageModelId) &&
      resolveMediaModelTransportConfig({
        provider: selectedEditImageModelRecord?.provider,
        modelId:
          selectedEditImageModelRecord?.modelId ?? selectedEditImageModelId,
        configJson: selectedEditImageModelRecord?.configJson as
          | Record<string, unknown>
          | undefined,
      }).transport === "mcp");
  const [mcpConnectionId, setMcpConnectionIdState] = useState<string | null>(
    readStoredMcpConnectionId
  );
  const [mcpSharedGroupId, setMcpSharedGroupId] = useState<number | null>(null);
  const handleSelectMcpConnection = (connectionId: string | null) => {
    setMcpConnectionIdState(connectionId);
    storeMcpConnectionId(connectionId);
    if (!connectionId) setMcpSharedGroupId(null);
  };
  /** Blocks generation client-side with a toast instead of letting the
   *  server throw BAD_REQUEST — same convention as
   *  `VerticalDramaEpisodePage.tsx`'s `requireMcpConnectionOrToast`. */
  const requireMcpConnectionOrToast = (): boolean => {
    if (!imageModelUsesMcp || mcpConnectionId) return true;
    toast.error(
      t(
        lang,
        "ต้องเลือกการเชื่อมต่อ MCP ก่อนใช้โมเดลนี้",
        "Select an MCP connection before using this image model."
      )
    );
    return false;
  };

  /** Feature 135 (Hermes/Grok media worker) — sibling of `imageModelUsesMcp`
   *  above. Mutually exclusive: a model row resolves to exactly one
   *  transport, so at most one of `imageModelUsesMcp`/`imageModelUsesHermes`
   *  is ever true. */
  const imageModelUsesHermes =
    (Boolean(selectedImageModelId) &&
      resolveMediaModelTransportConfig({
        provider: selectedImageModelRecord?.provider,
        modelId: selectedImageModelRecord?.modelId ?? selectedImageModelId,
        configJson: selectedImageModelRecord?.configJson as
          | Record<string, unknown>
          | undefined,
      }).transport === "hermes_worker") ||
    (Boolean(selectedEditImageModelId) &&
      resolveMediaModelTransportConfig({
        provider: selectedEditImageModelRecord?.provider,
        modelId:
          selectedEditImageModelRecord?.modelId ?? selectedEditImageModelId,
        configJson: selectedEditImageModelRecord?.configJson as
          | Record<string, unknown>
          | undefined,
      }).transport === "hermes_worker");
  const [hermesConnectionId, setHermesConnectionIdState] = useState<
    string | null
  >(readStoredHermesConnectionId);
  const handleSelectHermesConnection = (connectionId: string | null) => {
    setHermesConnectionIdState(connectionId);
    storeHermesConnectionId(connectionId);
  };
  /** Same convention as `requireMcpConnectionOrToast` above, for the Hermes
   *  transport arm. */
  const requireHermesConnectionOrToast = (): boolean => {
    if (!imageModelUsesHermes || hermesConnectionId) return true;
    toast.error(
      t(
        lang,
        "ต้องเลือกบัญชี Grok (Hermes) ก่อนใช้โมเดลนี้",
        "Select a Grok (Hermes) connection before using this image model."
      )
    );
    return false;
  };

  /** Click-to-expand fullscreen viewer (reuses `chat/media/ImageLightbox.tsx`,
   *  the codebase's existing lightbox — not a new one) for every reference/
   *  generated-image thumbnail in this panel, so reviewing a portrait's
   *  detail doesn't depend on how big the inline thumbnail is. */
  const [lightboxImage, setLightboxImage] = useState<{
    src: string;
    alt?: string;
  } | null>(null);

  const listQuery = trpc.verticalDramaCharacters.listCharacters.useQuery(
    { seriesId },
    { enabled: Boolean(seriesId), staleTime: 15_000 }
  );
  // Fallback source for the character description (see
  // `findBibleCharacterDescription`) — the series bible's own character
  // roster, not otherwise loaded by this panel.
  const seriesQuery = trpc.verticalDramaSeries.get.useQuery(
    { seriesId },
    { enabled: Boolean(seriesId), staleTime: 15_000 }
  );
  const seriesBible =
    (
      seriesQuery.data?.series as
        | { bible?: Record<string, unknown> | null }
        | undefined
    )?.bible ?? null;
  /** Chip shown in this panel's header so users always know what
   *  region/ethnicity default is currently applied to generated character
   *  images (series settings tab is where it's changed). */
  const targetAudienceRegion = normalizeTargetAudienceRegion(
    seriesBible?.targetAudienceRegion
  );
  const targetAudienceRegionLabel =
    lang === "th"
      ? VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_LABELS_TH[targetAudienceRegion]
      : VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_LABELS_EN[targetAudienceRegion];

  const invalidate = () =>
    utils.verticalDramaCharacters.listCharacters.invalidate({ seriesId });

  const onError = (err: { message?: string }) =>
    toast.error(resolveVdCharacterMutationErrorMessage(err, lang));

  /** Same toast as `onError`, plus reopens the model-picker dialog when the
   *  server rejected the request specifically for a missing/invalid
   *  `selectedImageModelId` (see `isImageModelSelectionError`). Used on the
   *  three mutations that now require that field:
   *  `generateImageMutation`/`generateSheetMutation`/
   *  `generatePortraitCandidateBatchMutation`. In normal use
   *  `requireModelSelected()` already blocks the click before any of these
   *  fire, so this is a defense-in-depth path (stale selection, disabled
   *  model, etc.) — never swallows the server's bilingual message. */
  const onImageModelError = (err: { message?: string }) => {
    onError(err);
    if (isImageModelSelectionError(err)) setIsModelDialogOpen(true);
  };

  /* ---- W12-B voice chain — per-character voice casting ----
   * Series-scoped (not per-character), so this query is fetched once
   * regardless of which character is selected — `listVoiceCatalog`'s own
   * input is `{seriesId}` only. Only enabled once the tenant flag is on,
   * mirroring `voiceChainEnabled`'s own byte-identical-when-off contract. */
  const voiceCatalogQuery =
    trpc.verticalDramaCharacters.listVoiceCatalog.useQuery(
      { seriesId },
      { enabled: voiceChainEnabled && Boolean(seriesId), staleTime: 5 * 60_000 }
    );
  const voiceCatalog: VerticalDramaVoiceCatalogEntry[] =
    voiceCatalogQuery.data?.voices ?? [];

  const setVoiceConfigMutation =
    trpc.verticalDramaCharacters.setCharacterVoiceConfig.useMutation({
      onSuccess: (_res, variables) => {
        invalidate();
        toast.success(
          variables.voiceConfig === null
            ? t(lang, "ล้างเสียงแล้ว", "Voice cleared")
            : t(lang, "กำหนดเสียงแล้ว", "Voice cast")
        );
      },
      onError,
    });

  /** F132F (spec 132 §7.3, added 2026-07-09) — persists the speech-profile
   *  editing sub-section's edits via the existing generic `updateCharacter`
   *  mutation (`data` is a wholesale replace server-side, never a merge —
   *  see `verticalDramaCharacters.ts`'s `updateCharacter` mutation — so every
   *  call site below always spreads the character's CURRENT `data` first,
   *  then overrides only the `speechProfile` key). */
  const updateCharacterMutation =
    trpc.verticalDramaCharacters.updateCharacter.useMutation({
      onSuccess: () => {
        invalidate();
        toast.success(
          t(lang, "บันทึกโปรไฟล์เสียงพูดแล้ว", "Speech profile saved")
        );
      },
      onError,
    });

  const updateLookPromptMutation =
    trpc.verticalDramaCharacters.updateCharacter.useMutation({
      onSuccess: () => {
        invalidate();
        closeLookPromptDialog();
        toast.success(t(lang, "บันทึก prompt ของลุคแล้ว", "Look prompt saved"));
      },
      onError,
    });

  const updateCharacterRoleMutation =
    trpc.verticalDramaCharacters.updateCharacter.useMutation({
      onSuccess: () => {
        invalidate();
        toast.success(
          t(lang, "บันทึกบทบาทตัวละครแล้ว", "Narrative role saved")
        );
      },
      onError,
    });

  /** F132F speech-profile editing sub-section — a per-character draft-form
   *  buffer, keyed by characterId (mirrors `generatedImageUrls`'s own
   *  Record-keyed-by-id convention). Deliberately NOT synced via a `useEffect`
   *  on character switch — reading always falls back to the persisted
   *  server value (`speechProfileFormFor`) when no local draft exists yet
   *  for that character, so switching characters shows the right data
   *  immediately without any effect-timing risk. */
  const [speechProfileFormDrafts, setSpeechProfileFormDrafts] = useState<
    Record<string, VdSpeechProfileFormState>
  >({});

  const speechProfileFormFor = (
    characterId: string
  ): VdSpeechProfileFormState => {
    const existingDraft = speechProfileFormDrafts[characterId];
    if (existingDraft) return existingDraft;
    const persisted =
      characterId === selectedCharacter?.characterId
        ? selectedCharacterSpeechProfile
        : undefined;
    return speechProfileToFormState(persisted);
  };

  const updateSpeechProfileForm = (
    characterId: string,
    patch: Partial<VdSpeechProfileFormState>
  ) => {
    setSpeechProfileFormDrafts(prev => ({
      ...prev,
      [characterId]: { ...speechProfileFormFor(characterId), ...patch },
    }));
  };

  const handleSaveSpeechProfile = (characterId: string) => {
    const form = speechProfileFormFor(characterId);
    const parsed = speechProfileSchema.safeParse(
      formStateToSpeechProfile(form)
    );
    if (!parsed.success) {
      toast.error(
        t(
          lang,
          "กรอกอารมณ์หลักและหน้าที่ของบทพูดก่อนบันทึก",
          "Fill in the emotional default and common line function before saving"
        )
      );
      return;
    }
    const character = characters.find(
      (c: VdCharacterListItem) => c.characterId === characterId
    );
    const currentData = (character?.data ?? {}) as Record<string, unknown>;
    updateCharacterMutation.mutate({
      seriesId,
      characterId,
      data: { ...currentData, speechProfile: parsed.data },
    });
  };

  const updateCharacterIdentityDnaMutation =
    trpc.verticalDramaCharacters.updateCharacterIdentityDna.useMutation({
      onSuccess: (_result, variables) => {
        setIdentityDnaFormDrafts(prev => {
          const next = { ...prev };
          delete next[variables.characterId];
          return next;
        });
        invalidate();
        toast.success(
          t(
            lang,
            "บันทึก Character DNA แล้ว — Prompt/ภาพเดิมอาจยังไม่ตรง",
            "Character DNA saved — the existing prompt/portrait may be stale"
          )
        );
      },
      onError,
    });

  const linkCharacterTwinsMutation =
    trpc.verticalDramaCharacters.linkCharacterTwins.useMutation({
      onSuccess: () => {
        setTwinLinkTargetId("");
        invalidate();
        toast.success(
          t(lang, "เชื่อมตัวละครเป็นแฝดและซิงก์ DNA แล้ว", "Characters linked as twins and shared DNA synchronized")
        );
      },
      onError,
    });

  const [identityDnaFormDrafts, setIdentityDnaFormDrafts] = useState<
    Record<string, VdCharacterIdentityDnaFormState>
  >({});

  const identityDnaFormFor = (
    characterId: string
  ): VdCharacterIdentityDnaFormState | null => {
    const draft = identityDnaFormDrafts[characterId];
    if (draft) return draft;
    const character = characters.find(
      (candidate: VdCharacterListItem) => candidate.characterId === characterId
    );
    return characterIdentityDnaFormFromData(
      (character?.data as Record<string, unknown> | null | undefined) ?? null
    );
  };

  const updateIdentityDnaForm = (
    characterId: string,
    patch: VdCharacterIdentityDnaFormPatch
  ) => {
    const current = identityDnaFormFor(characterId);
    if (!current) return;
    const { faceIdentity: faceIdentityPatch, ...formPatch } = patch;
    setIdentityDnaFormDrafts(prev => ({
      ...prev,
      [characterId]: {
        ...current,
        ...formPatch,
        faceIdentity: {
          ...current.faceIdentity,
          ...(faceIdentityPatch ?? {}),
        },
      },
    }));
  };

  const handleSaveIdentityDna = (characterId: string) => {
    const character = characters.find(
      (candidate: VdCharacterListItem) => candidate.characterId === characterId
    );
    const data = (character?.data as Record<string, unknown> | null) ?? null;
    const visualBible = characterVisualBibleFromData(data);
    const identityDna = identityDnaFormFor(characterId);
    if (!visualBible || !identityDna) return;
    updateCharacterIdentityDnaMutation.mutate({
      seriesId,
      characterId,
      expectedRevision: readCharacterIdentityDnaRevision(visualBible),
      identityDna,
    });
  };

  /** Per-character casting preferences — one durable mutation for region,
   *  casting look, and the optional high-priority details field. Keeping the
   *  section on its own mutation makes its pending state independent from
   *  role/profile edits and ensures the exact same contract is used for both
   *  existing and newly-created characters. */
  const updateCharacterCastingMutation =
    trpc.verticalDramaCharacters.updateCharacter.useMutation({
      onSuccess: () => {
        invalidate();
        toast.success(
          t(
            lang,
            "บันทึกข้อมูล Casting ของตัวละครแล้ว",
            "Character casting preferences saved"
          )
        );
      },
      onError,
    });

  const [castingPreferencesFormDrafts, setCastingPreferencesFormDrafts] =
    useState<Record<string, VerticalDramaCharacterCastingFormState>>({});

  const castingPreferencesFormFor = (
    characterId: string
  ): VerticalDramaCharacterCastingFormState => {
    const existingDraft = castingPreferencesFormDrafts[characterId];
    if (existingDraft) return existingDraft;
    const character = characters.find(
      (c: VdCharacterListItem) => c.characterId === characterId
    );
    return characterCastingFormFromData(
      (character?.data as Record<string, unknown> | null | undefined) ??
        undefined
    );
  };

  const updateCastingPreferencesForm = (
    characterId: string,
    patch: Partial<VerticalDramaCharacterCastingFormState>
  ) => {
    setCastingPreferencesFormDrafts(prev => ({
      ...prev,
      [characterId]: {
        ...castingPreferencesFormFor(characterId),
        ...patch,
      },
    }));
  };

  const handleSaveCastingPreferences = (characterId: string) => {
    const form = castingPreferencesFormFor(characterId);
    updateCharacterCastingMutation.mutate({
      seriesId,
      characterId,
      castingPreferences: buildVerticalDramaCharacterCastingPreferences(form),
    });
  };

  /** New-character "Add character" card draft state. */
  const [newCastingPreferences, setNewCastingPreferences] =
    useState<VerticalDramaCharacterCastingFormState>(
      VERTICAL_DRAMA_CHARACTER_CASTING_FORM_DEFAULTS
    );

  /** Character ids currently between "preview task submitted" and
   *  "preview task completed" — same Set-keyed-by-id convention as
   *  `pollingCharacters` above (independent characters can preview
   *  concurrently). */
  const [previewingVoiceCharacterIds, setPreviewingVoiceCharacterIds] =
    useState<Set<string>>(new Set());
  const [voicePreviewUrlByCharacterId, setVoicePreviewUrlByCharacterId] =
    useState<Record<string, string>>({});
  /** Resolved `creditCost` from the most recent `previewCharacterVoice`
   *  response, per character (debt-item-2, 2026-07-08) — same Record-keyed-
   *  by-id convention as `voicePreviewUrlByCharacterId` above. Set in
   *  `previewVoiceMutation`'s `onSuccess` (available immediately on submit,
   *  unlike the audio URL which only resolves once `pollVoicePreviewTask`
   *  completes). */
  const [
    voicePreviewCreditCostByCharacterId,
    setVoicePreviewCreditCostByCharacterId,
  ] = useState<Record<string, number>>({});

  /** Poll a submitted character-voice-preview task to completion, mirroring
   *  `pollCharacterImageTask`'s exact `utils.media.getTask.fetch` loop
   *  (120 attempts, 2.5s interval) — simpler than that function since a
   *  voice preview never links into character stock, it only needs the
   *  resolved audio URL for the inline `<audio>` player. */
  async function pollVoicePreviewTask(taskId: string, characterId: string) {
    setPreviewingVoiceCharacterIds(prev => new Set(prev).add(characterId));
    try {
      for (let attempt = 0; attempt < 120; attempt++) {
        const task = await utils.media.getTask.fetch({ taskId });
        const status = (task as { status?: string } | null)?.status;
        if (status === "completed") {
          const resultUrl = (task as { resultUrl?: string } | null)?.resultUrl;
          if (!resultUrl) {
            toast.error(
              t(
                lang,
                "สร้างตัวอย่างเสียงสำเร็จแต่ไม่พบ URL ผลลัพธ์",
                "Preview completed but no result URL."
              )
            );
            return;
          }
          setVoicePreviewUrlByCharacterId(prev => ({
            ...prev,
            [characterId]: resultUrl,
          }));
          return;
        }
        if (status === "failed") {
          const errorMessage = (task as { errorMessage?: string } | null)
            ?.errorMessage;
          toast.error(
            t(
              lang,
              `สร้างตัวอย่างเสียงล้มเหลว${errorMessage ? `: ${errorMessage}` : ""}`,
              `Voice preview failed${errorMessage ? `: ${errorMessage}` : ""}`
            )
          );
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 2500));
      }
      toast.error(
        t(
          lang,
          "สร้างตัวอย่างเสียงใช้เวลานานเกินไป ลองตรวจสอบภายหลัง",
          "Preview is taking too long — check back later."
        )
      );
    } finally {
      setPreviewingVoiceCharacterIds(prev => {
        const next = new Set(prev);
        next.delete(characterId);
        return next;
      });
    }
  }

  const previewVoiceMutation =
    trpc.verticalDramaCharacters.previewCharacterVoice.useMutation({
      onSuccess: (res, variables) => {
        setVoicePreviewCreditCostByCharacterId(prev => ({
          ...prev,
          [variables.characterId]: res.creditCost,
        }));
        void pollVoicePreviewTask(res.taskId, variables.characterId);
      },
      onError,
    });

  const handleCastVoice = (
    characterId: string,
    entry: VerticalDramaVoiceCatalogEntry
  ) => {
    setVoiceConfigMutation.mutate({
      seriesId,
      characterId,
      voiceConfig: {
        voiceModelId: entry.voiceModelId,
        voiceId: entry.voiceId,
        voiceLabel: entry.label,
      },
      idempotencyKey: crypto.randomUUID(),
    });
  };

  const handleClearVoice = (characterId: string) => {
    setVoiceConfigMutation.mutate({
      seriesId,
      characterId,
      voiceConfig: null,
      idempotencyKey: crypto.randomUUID(),
    });
  };

  const handlePreviewVoice = (characterId: string) => {
    setVoicePreviewUrlByCharacterId(prev => {
      if (!(characterId in prev)) return prev;
      const { [characterId]: _drop, ...rest } = prev;
      return rest;
    });
    previewVoiceMutation.mutate({ seriesId, characterId });
  };

  /** F132F "prefill from speech profile" style-hints save (spec 132 §7.3,
   *  added 2026-07-09) — only ever called on an explicit user Save click
   *  (never automatically); merges the reviewed `hints[]` onto the
   *  character's EXISTING voice config (required: `setCharacterVoiceConfig`'s
   *  input schema needs `voiceModelId`/`voiceId`, so this is only reachable
   *  once a voice is already cast — the casting card itself disables its
   *  Save button until then). */
  const handleSaveStyleHints = (
    characterId: string,
    voiceConfig: VerticalDramaCharacterVoiceConfig | undefined,
    hints: string[]
  ) => {
    if (!voiceConfig) return;
    setVoiceConfigMutation.mutate({
      seriesId,
      characterId,
      voiceConfig: {
        voiceModelId: voiceConfig.voiceModelId,
        voiceId: voiceConfig.voiceId,
        voiceLabel: voiceConfig.voiceLabel,
        styleHints: hints.length > 0 ? hints : undefined,
      },
      idempotencyKey: crypto.randomUUID(),
    });
  };

  const createMutation =
    trpc.verticalDramaCharacters.createCharacter.useMutation({
      onSuccess: res => {
        setNewName("");
        setNewKey("");
        setNewRole("");
        setNewRoleTier("");
        setNewCastingPreferences(
          VERTICAL_DRAMA_CHARACTER_CASTING_FORM_DEFAULTS
        );
        setSelectedCharacterId(res.character.characterId);
        invalidate();
        toast.success(t(lang, "เพิ่มตัวละครแล้ว", "Character added"));
      },
      onError,
    });

  const linkMutation = trpc.verticalDramaCharacters.linkAsset.useMutation({
    onSuccess: (_result, variables) => {
      // An imported primary image came from an explicit user attach/drop
      // action. Preserve that intent for the next main portrait generation;
      // generated task completion also uses this mutation, so only imported
      // primary links may become an explicit reference override.
      if (isExplicitPrimaryReferenceImport(variables)) {
        setReferenceOverrideByCharacter(prev => ({
          ...prev,
          [variables.characterId!]: _result.asset.assetLinkId,
        }));
      }
      invalidate();
      toast.success(t(lang, "นำเข้าอ้างอิงแล้ว", "Reference imported"));
    },
    onError,
  });
  const linkAngleAssetMutation =
    trpc.verticalDramaCharacters.linkCharacterAngleAsset.useMutation({
      onSuccess: () => {
        invalidate();
        toast.success(
          t(
            lang,
            "เพิ่มภาพมุมอ้างอิงเข้าคิวตรวจแล้ว",
            "Angle reference added to the review queue."
          )
        );
      },
      onError,
    });

  const deleteAssetMutation =
    trpc.verticalDramaCharacters.deleteAsset.useMutation({
      onSuccess: () => {
        invalidate();
        toast.success(t(lang, "ลบภาพอ้างอิงแล้ว", "Reference deleted"));
      },
      onError,
    });
  const [confirmingDeleteAssetLinkId, setConfirmingDeleteAssetLinkId] =
    useState<string | null>(null);

  /* ------------------------------------------------------------------ */
  /* W2 manual CRUD (plan: vertical-drama-twin-variant-completeness, F6) */
  /* ------------------------------------------------------------------ */

  /** Batches the user explicitly expanded to see the faces they did NOT pick
   *  (`resolvePortraitCandidateVisibility`). Session-only and opt-in: a
   *  resolved batch collapses back to its winner on every fresh visit, which is
   *  the whole point of the collapse. */
  const [expandedCandidateBatchIds, setExpandedCandidateBatchIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const toggleCandidateBatchExpanded = (batchId: string) =>
    setExpandedCandidateBatchIds(prev => {
      const next = new Set(prev);
      if (next.has(batchId)) next.delete(batchId);
      else next.add(batchId);
      return next;
    });

  /** "เพิ่มลุค" dialog — `null` when closed, else the BASE character it's
   *  being opened for (`buildCharacterRosterEntries`'s top-level entry). */
  const [variantDialogCharacter, setVariantDialogCharacter] = useState<{
    characterId: string;
    name: string;
  } | null>(null);
  const [variantLabelInput, setVariantLabelInput] = useState("");
  const [variantTypeInput, setVariantTypeInput] = useState<
    "outfit" | "age_stage"
  >("outfit");
  const [variantDescriptionInput, setVariantDescriptionInput] = useState("");
  /** Free-text visual brief for the look's FIRST image — sent as
   *  `customInstruction` on the auto-fire generation this dialog triggers on
   *  submit (`planning/vd-character-full-body-framing/plan.md` C1). Distinct
   *  from `variantDescriptionInput`, which is a persisted identity FACT about
   *  the look; this one is ephemeral per-generation framing/composition
   *  direction and is never stored on the character row. Seeded into
   *  `customInstructionByCharacter` on success so the look's own chip button
   *  and detail panel keep using it for later regenerations. */
  const [variantImageInstructionInput, setVariantImageInstructionInput] =
    useState("");
  const [variantReferenceMediaAssetId, setVariantReferenceMediaAssetId] =
    useState<string | null>(null);
  const [variantReferencePreviewUrl, setVariantReferencePreviewUrl] = useState<
    string | null
  >(null);
  const [variantReferenceResolving, setVariantReferenceResolving] =
    useState(false);
  const [variantReferenceDragOver, setVariantReferenceDragOver] =
    useState(false);
  const variantReferenceInputRef = useRef<HTMLInputElement>(null);

  const openVariantDialog = (character: {
    characterId: string;
    name: string;
  }) => {
    setVariantDialogCharacter(character);
    setVariantLabelInput("");
    setVariantTypeInput("outfit");
    setVariantDescriptionInput("");
    setVariantImageInstructionInput("");
    setVariantReferenceMediaAssetId(null);
    setVariantReferencePreviewUrl(null);
  };
  const openAgeStageVariantDialog = (
    character: { characterId: string; name: string },
    age?: number,
    customInstruction?: string
  ) => {
    setVariantDialogCharacter(character);
    setVariantLabelInput(age ? `วัยเด็ก ${age} ขวบ` : "วัยเด็ก");
    setVariantTypeInput("age_stage");
    setVariantDescriptionInput(age ? `อายุ ${age} ปี` : "วัยเด็ก");
    setVariantImageInstructionInput(customInstruction?.trim() ?? "");
    setVariantReferenceMediaAssetId(null);
    setVariantReferencePreviewUrl(null);
  };

  const handleAgeStageVariantRequiredError = (
    err: { message?: string } | null | undefined,
    variables?: { characterId?: string; customInstruction?: string }
  ): boolean => {
    const parsed = parseAgeStageVariantRequiredMessage(err?.message);
    if (!parsed || !variables?.characterId) return false;
    const character = characters.find(
      (candidate: { characterId: string; name: string }) =>
        candidate.characterId === variables.characterId
    );
    if (!character) return false;
    openAgeStageVariantDialog(
      character,
      parsed.age,
      variables.customInstruction
    );
    toast.info(
      t(
        lang,
        "คำขอนี้ต้องการตัวละครวัยเด็ก — ตรวจสอบรายละเอียดแล้วกดยืนยันเพื่อสร้างลุคใหม่",
        "This request needs a child version — review the details and confirm to create a new look."
      )
    );
    return true;
  };
  const closeVariantDialog = () => setVariantDialogCharacter(null);

  /**
   * "สร้างภาพใหม่ของลุคนี้" dialog
   * (`planning/vd-look-image-not-replace-primary/plan.md` §4C) — `null` when
   * closed, else the LOOK (variant row) whose image is being re-rendered, plus
   * the two reference images the user can choose between: the base character's
   * main portrait and the look's own current image. Both `assetLinkId`s are
   * resolved by the caller from the same `getCharacterCardPortraitAsset` the
   * cards already render, so what the dialog offers is exactly what the user
   * sees on screen.
   */
  const [lookRenderDialog, setLookRenderDialog] = useState<{
    lookCharacterId: string;
    lookLabel: string;
    promptSummary: string | null;
    baseCharacterName: string;
    primaryAssetLinkId: string | null;
    primaryThumbnailUrl: string | null;
    lookAssetLinkId: string | null;
    lookThumbnailUrl: string | null;
  } | null>(null);
  const [lookRenderInstruction, setLookRenderInstruction] = useState("");
  const [lookRenderReferenceChoice, setLookRenderReferenceChoice] =
    useState<VdLookRenderReferenceChoice>("auto");
  const closeLookRenderDialog = () => setLookRenderDialog(null);

  /** Compact look prompt editor. The card only shows a bounded summary; this
   * dialog is the deliberate place to inspect/edit the full persisted visual
   * prompt without exposing it in every roster card. */
  const [lookPromptDialog, setLookPromptDialog] = useState<{
    characterId: string;
    characterName: string;
    lookLabel: string;
    originalPrompt: string;
  } | null>(null);
  const [lookPromptInput, setLookPromptInput] = useState("");
  const closeLookPromptDialog = () => setLookPromptDialog(null);

  const handleSaveLookPrompt = () => {
    if (!lookPromptDialog) return;
    const prompt = lookPromptInput.trim();
    if (!prompt || prompt === lookPromptDialog.originalPrompt.trim()) return;
    const character = characters.find(
      (candidate: VdCharacterListItem) =>
        candidate.characterId === lookPromptDialog.characterId
    );
    updateLookPromptMutation.mutate({
      seriesId,
      characterId: lookPromptDialog.characterId,
      data: buildCharacterLookPromptData({
        currentData:
          (character?.data as Record<string, unknown> | null | undefined) ??
          null,
        prompt,
      }),
    });
  };

  /** Delete-CHARACTER confirm state (distinct from `confirmingDeleteAssetLinkId`
   *  above, which only ever deletes a reference IMAGE) — same 2-step
   *  inline-confirm convention, shared across the base-character card, twin
   *  card, and variant-chip delete affordances below. */
  const [confirmingDeleteCharacterId, setConfirmingDeleteCharacterId] =
    useState<string | null>(null);

  const createVariantMutation =
    trpc.verticalDramaCharacters.createCharacterVariant.useMutation({
      onSuccess: (res, variables) => {
        invalidate();
        setSelectedCharacterId(res.character.characterId);
        // Carry the dialog's ephemeral visual brief over to the freshly
        // created look BEFORE closing the dialog resets the input, so the
        // look's own chip button and detail panel keep regenerating with the
        // same framing the user asked for on the very first image
        // (`planning/vd-character-full-body-framing/plan.md` C1).
        const lookImageInstruction = variantImageInstructionInput.trim();
        if (lookImageInstruction) {
          setCustomInstructionByCharacter(prev => ({
            ...prev,
            [res.character.characterId]: lookImageInstruction,
          }));
        }
        closeVariantDialog();

        // `planning/vd-character-look-one-step-flow/plan.md` (2026-07-17) —
        // the modal used to only insert the variant row, leaving the user to
        // discover the detail-panel wizard to ever get an image out of it.
        // Complete the whole flow in one step whenever it's safe to: fire
        // the SAME direct generation `fireDirectCharacterImageGeneration`
        // above fires for every other "auto" affordance in this panel.
        // `characters` (roster list, defined below) still reflects the
        // PRE-create snapshot here — fine, since the parent's own portrait
        // status never changes as a side effect of adding a look to it.
        const parent = (characters as VdCharacterListItem[]).find(
          candidate => candidate.characterId === variables.parentCharacterId
        );
        const decision = decideVariantAutoGenerateImage({
          hasReferenceMediaAssetId: Boolean(variables.referenceMediaAssetId),
          parentNeedsSetupReasons: parent?.needsSetupReasons,
          selectedImageModelId,
        });
        if (!decision.fire) {
          toast.success(
            decision.reason === "missing_parent_portrait"
              ? t(
                  lang,
                  "เพิ่มลุคแล้ว — ยังไม่สร้างภาพอัตโนมัติ: กรุณาสร้างภาพหลักของตัวละครก่อน เพื่อใช้เป็นภาพอ้างอิงใบหน้า",
                  "Look added — image not auto-generated: generate the character's main portrait first to use as the face reference."
                )
              : decision.reason === "missing_model"
                ? t(
                    lang,
                    "เพิ่มลุคแล้ว — ยังไม่สร้างภาพอัตโนมัติ: กรุณาเลือกโมเดลภาพก่อน",
                    "Look added — image not auto-generated: choose an image model first."
                  )
                : t(lang, "เพิ่มลุคแล้ว", "Look added")
          );
          return;
        }
        toast.success(
          t(
            lang,
            "เพิ่มลุคแล้ว กำลังสร้างภาพลุค...",
            "Look added. Generating the look's image..."
          )
        );
        // Pass the brief explicitly: the `setCustomInstructionByCharacter`
        // above has not been committed to state yet at this point in the same
        // event handler, so reading it back inside the fire helper would see
        // the stale (empty) map.
        fireDirectCharacterImageGeneration(
          res.character.characterId,
          lookImageInstruction
        );
      },
      onError,
    });

  const repairLegacyLookMutation =
    trpc.verticalDramaCharacters.repairLegacyCharacterLook.useMutation({
      onSuccess: result => {
        invalidate();
        if (result.stats.applied > 0) {
          toast.success(
            t(
              lang,
              "ซ่อมรายละเอียดลุคด้วย AI แล้ว — ใบหน้าและรูปร่างหลักเดิมยังคงเดิม",
              "AI repaired the look details — the original face and body identity were preserved."
            )
          );
        } else if (result.stats.reviewed > 0) {
          toast.warning(
            t(
              lang,
              "ลุคนี้มีข้อมูลอายุ/ฉากขัดกัน จึงส่งให้ตรวจสอบก่อน ไม่เดารายละเอียดแทน",
              "The look has conflicting age/scene evidence, so it needs review instead of guessing."
            )
          );
        } else {
          toast.info(
            t(
              lang,
              "ลุคนี้ยังซ่อมอัตโนมัติไม่ได้ เพราะหลักฐานจากตอนยังไม่ชัดเจน",
              "This look cannot be repaired automatically because the episode evidence is ambiguous."
            )
          );
        }
      },
      onError,
    });

  const deleteCharacterMutation =
    trpc.verticalDramaCharacters.deleteCharacter.useMutation({
      onSuccess: () => {
        invalidate();
        toast.success(t(lang, "ลบตัวละครแล้ว", "Character deleted"));
      },
      onError,
    });

  /** "ตรวจจับ variant/แฝด" (`detectCharacterVariantsNow`) — a real, slow LLM
   *  call (seconds, costs credits), so it's deliberately NOT folded into the
   *  shared `mutating` flag below (would needlessly disable every other
   *  roster control for the whole duration); its own button carries its own
   *  `isPending` spinner instead. */
  const detectVariantsMutation =
    trpc.verticalDramaCharacters.detectCharacterVariantsNow.useMutation({
      onSuccess: res => {
        if ("jobId" in res) {
          setVariantAnalysisJobId(res.jobId);
          return;
        }
        const completed = res as VariantAnalysisSummary;
        setVariantAnalysisResult(completed);
        invalidate();
        toast.success(
          buildDetectCharacterVariantsSummaryMessage(lang, completed)
        );
      },
      onError,
    });

  /**
   * Poll a submitted character portrait/sheet generation task
   * (`generateCharacterImage`/`generateCharacterSheet` return `{taskId,
   * ...promptMeta}` — async submit, matching how every other real
   * image/video generation in the app works, so it shows in Media History
   * with correct credit deduction) until it completes. Primary portraits use
   * `settleCharacterImageTask`, which performs the durable ingest + character
   * link server-side; sheet/angle roles retain the existing resolve-then-link
   * flow because they have role-specific metadata.
   *
   * `role`/`metadata` are NOT a fixed client-side list for the sheet flow —
   * since `generateCharacterSheet` was consolidated (vertical-drama-
   * character-sheet-consolidation plan, Phase B/C) it can now return any of
   * `"character_sheet_turnaround"`, `"character_sheet_full"`, or the new
   * `"character_design_bible"` (with `metadata: {sheetType}`) depending on
   * the caller's `sheetType`, via `resolveCharacterSheetAssetTag` server-
   * side — this function just tags the `linkAsset` call with whatever the
   * mutation's response says, never re-deciding the role itself.
   */
  async function pollCharacterImageTask(
    taskId: string,
    characterId: string,
    role: string,
    promptCreditsUsed: number,
    metadata?: Record<string, unknown> | null
  ) {
    const key = pollingCharacterKey(characterId, role);
    setPollingCharacters(prev => new Set(prev).add(key));
    // Set B fix (planning/fix-character-image-false-failure/plan.md): a
    // thrown status-read error (e.g. a 429 rate-limit on `media.getTask`)
    // used to become an unhandled promise rejection here, leaving the card
    // stuck on "generating" forever. `hadUnresolvedRead` tracks whether ANY
    // read in this run could not be confirmed, so the natural-timeout branch
    // below can tell "genuinely too slow" (never touch this flag) apart from
    // "we lost visibility at some point" (use the non-destructive "outcome
    // not yet confirmed" state instead of the generic timeout one).
    let hadUnresolvedRead = false;
    let consecutiveTransientErrors = 0;
    try {
      for (
        let attempt = 0;
        attempt < VD_CHARACTER_IMAGE_POLL_MAX_ATTEMPTS;
        attempt++
      ) {
        let task: unknown;
        let settledMediaAssetId: string | undefined;
        try {
          if (role === "primary_portrait") {
            const settled = await settleCharacterImageTaskMutation.mutateAsync({
              seriesId,
              characterId,
              taskId,
            });
            if (settled.status === "completed") {
              task = {
                status: "completed",
                resultUrl: settled.imageUrl,
              };
              settledMediaAssetId = settled.mediaAssetId;
            } else if (settled.status === "failed") {
              task = {
                status: "failed",
                errorMessage: settled.errorMessage,
              };
            } else {
              await new Promise(resolve =>
                setTimeout(
                  resolve,
                  Math.max(
                    VD_CHARACTER_IMAGE_POLL_INTERVAL_MS,
                    settled.retryAfterMs ?? 0
                  )
                )
              );
              continue;
            }
          } else {
            task = await mediaPollSchedulerRef.current.run(() =>
              utils.media.getTask.fetch({ taskId })
            );
          }
        } catch (pollError) {
          const errorClass = classifyMediaPollError(pollError);
          hadUnresolvedRead = true;
          if (
            errorClass === "transient" &&
            consecutiveTransientErrors <
              VD_MEDIA_POLL_MAX_CONSECUTIVE_TRANSIENT_ERRORS
          ) {
            const delay = Math.max(
              retryDelayMs(consecutiveTransientErrors),
              rateLimitBackoffMs(pollError)
            );
            consecutiveTransientErrors += 1;
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          // Non-retryable (TERMINAL-classified) read error, or a transient
          // one that exhausted its own consecutive-failure guard — never
          // report this as a generation failure (core principle: we only
          // failed to OBSERVE the status, the generation may still be
          // running or may have already completed). Stop polling and let
          // the user check back / find it in Media History.
          // A transient read failure means that the provider outcome is
          // unknown, not failed. Keep the task quiet and durable; the next
          // refresh/resume pass can observe it again.
          if (errorClass !== "transient") {
            toast.error(buildPollUnresolvedOutcomeMessage(lang));
          }
          return;
        }
        consecutiveTransientErrors = 0;
        const status = (task as { status?: string } | null)?.status;
        if (status === "completed") {
          const resultUrl = (task as { resultUrl?: string } | null)?.resultUrl;
          if (!resultUrl) {
            toast.error(
              t(
                lang,
                "สร้างภาพสำเร็จแต่ไม่พบ URL ผลลัพธ์",
                "Generation completed but no result URL."
              )
            );
            return;
          }
          let resolved: { mediaAssetId: string };
          let settledImageUrl = resultUrl;
          try {
            if (settledMediaAssetId) {
              resolved = { mediaAssetId: settledMediaAssetId };
            } else {
              resolved = await cardResolveMutation.mutateAsync({
                seriesId,
                source: "url",
                url: resultUrl,
                mimeType: guessImageMimeTypeFromUrl(resultUrl),
              });
              if (
                role === "angle_front" ||
                role === "angle_left_three_quarter" ||
                role === "angle_right_three_quarter"
              ) {
                await linkAngleAssetMutation.mutateAsync({
                  seriesId,
                  characterId,
                  mediaAssetId: resolved.mediaAssetId,
                  role,
                  ...(metadata && typeof metadata.anglePackId === "string"
                    ? { anglePackId: metadata.anglePackId }
                    : {}),
                });
              } else {
                await linkMutation.mutateAsync({
                  seriesId,
                  characterId,
                  mediaAssetId: resolved.mediaAssetId,
                  assetType: "character_reference",
                  role,
                  source: "generated",
                  ...(metadata ? { metadata } : {}),
                });
              }
            }
          } catch (err) {
            toast.error(
              t(
                lang,
                `สร้างภาพเสร็จแล้ว แต่ซิงก์เข้าตัวละครไม่สำเร็จ${err instanceof Error ? `: ${err.message}` : ""} ตรวจสอบ Media History แล้วลองใหม่`,
                `Image generation finished, but syncing it to the character failed${err instanceof Error ? `: ${err.message}` : ""}. Check Media History and retry.`
              )
            );
            return;
          }
          const setCache =
            role === "primary_portrait"
              ? setGeneratedImageUrls
              : role === "character_sheet_turnaround"
                ? setGeneratedTurnaroundUrls
                : setGeneratedSheetUrls;
          setCache(prev => ({
            ...prev,
            [characterId]: {
              imageUrl: settledImageUrl,
              mediaAssetId: resolved.mediaAssetId,
            },
          }));
          if (role === "primary_portrait") {
            void invalidate();
          }
          const roleLabelTh =
            role === "primary_portrait"
              ? "ภาพตัวละคร"
              : role === "angle_front"
                ? "มุมหน้า"
                : role === "angle_left_three_quarter"
                  ? "มุมซ้ายสามส่วน"
                  : role === "angle_right_three_quarter"
                    ? "มุมขวาสามส่วน"
                    : role === "character_sheet_turnaround"
                      ? "ชีทตัวละคร"
                      : role === "character_sheet_full"
                        ? "Character Sheet แบบเต็ม"
                        : (sheetTypeLabelFromMetadata(metadata, "th") ??
                          "ชีท Character Design Bible");
          const roleLabelEn =
            role === "primary_portrait"
              ? "Character image"
              : role === "angle_front"
                ? "Front angle"
                : role === "angle_left_three_quarter"
                  ? "Left three-quarter angle"
                  : role === "angle_right_three_quarter"
                    ? "Right three-quarter angle"
                    : role === "character_sheet_turnaround"
                      ? "Character sheet"
                      : role === "character_sheet_full"
                        ? "Full character sheet"
                        : (sheetTypeLabelFromMetadata(metadata, "en") ??
                          "Character Design Bible sheet");
          toast.success(
            t(
              lang,
              `สร้าง${roleLabelTh}แล้ว (ใช้ ${promptCreditsUsed} เครดิต + ค่าเรนเดอร์ภาพ)`,
              `${roleLabelEn} generated (${promptCreditsUsed} prompt credits + image render)`
            )
          );
          return;
        }
        if (status === "failed") {
          const failedTask = task as {
            errorMessage?: string;
            errorCode?: string;
          } | null;
          const errorMessage = failedTask?.errorMessage;
          // Feature 135 section-10 review fix: prefer the typed hermes
          // presentation (reads `MediaTask.errorCode`, section-06) when this
          // was a hermes_ task; every other/legacy task falls through to the
          // exact pre-existing bilingual "<generic>: <errorMessage>" format.
          const hermesPresentation = presentHermesError(failedTask);
          toast.error(
            hermesPresentation
              ? formatHermesErrorForToast(hermesPresentation, lang)
              : t(
                  lang,
                  `สร้างภาพล้มเหลว${errorMessage ? `: ${errorMessage}` : ""}`,
                  `Generation failed${errorMessage ? `: ${errorMessage}` : ""}`
                )
          );
          return;
        }
        await new Promise(resolve =>
          setTimeout(resolve, VD_CHARACTER_IMAGE_POLL_INTERVAL_MS)
        );
      }
      if (!hadUnresolvedRead) {
        toast.info(
          t(
            lang,
            "สร้างภาพใช้เวลานานเกินไป ลองตรวจสอบภายหลัง",
            "Generation is taking too long — check back later."
          )
        );
      }
    } finally {
      setPollingCharacters(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  const generateImageMutation =
    trpc.verticalDramaCharacters.generateCharacterImage.useMutation({
      onSuccess: (res, variables) => {
        if (
          res.dnaPersistenceStatus === "failed" &&
          res.dnaPersistenceWarning
        ) {
          toast.warning(
            t(
              lang,
              "ส่งงานสร้างภาพแล้ว แต่บันทึก Character DNA ไม่สำเร็จ ระบบไม่ได้ส่งงานซ้ำ",
              res.dnaPersistenceWarning
            )
          );
        }
        void pollCharacterImageTask(
          res.taskId,
          variables.characterId,
          "primary_portrait",
          res.creditsUsed.promptGeneration
        );
      },
      onError: (err, variables) => {
        if (!handleAgeStageVariantRequiredError(err, variables)) {
          onImageModelError(err);
        }
      },
    });

  /**
   * `planning/vd-character-look-one-step-flow/plan.md` (2026-07-17) — fires
   * the SAME direct (no-preview) `generateImageMutation` call the roster
   * card's "auto" shortcuts already use (see `generateSheetMutation.mutate`'s
   * call site below for the identical `selectedImageModelId`/MCP/Hermes
   * field convention), for an arbitrary `characterId` — used both by
   * `createVariantMutation`'s auto-fire-on-submit and the per-look chip's
   * own "สร้างภาพลุค" button. No `approvedPrompt` is passed, so the server
   * runs its own prompt-generation step (the fallback path), exactly like
   * every other "auto" generate affordance in this panel. Callers are
   * responsible for their own guard checks first (`decideVariantAutoGenerateImage`
   * for the silent auto-fire path, `requireModelSelected`/
   * `requireMcpConnectionOrToast`/`requireHermesConnectionOrToast` for the
   * explicit chip-button click) — this function never guards, only fires.
   *
   * `planning/vd-character-full-body-framing/plan.md` C1 — ALSO forwards the
   * free-text visual brief. This used to send no `customInstruction` at all,
   * which is why a look generated through either of its two call sites
   * silently ignored "ภาพเต็มตัว"/"full body": the text existed in panel state
   * but no request ever carried it. `instructionOverride` exists for the
   * auto-fire-on-submit case, where the brief was typed in the "เพิ่มลุค"
   * dialog for a character whose id did not exist yet when the user typed it.
   */
  const fireDirectCharacterImageGeneration = (
    characterId: string,
    instructionOverride?: string,
    referenceAssetLinkId?: string
  ) => {
    const customInstruction = resolveDirectCharacterImageInstruction({
      characterId,
      instructionByCharacter: customInstructionByCharacter,
      override: instructionOverride,
    });
    generateImageMutation.mutate({
      seriesId,
      characterId,
      selectedImageModelId,
      referencePolicy: "auto",
      // A look/regeneration is exactly the case that renders image-to-image;
      // the server applies it only when a reference is genuinely attached.
      ...(selectedEditImageModelId ? { selectedEditImageModelId } : {}),
      ...(customInstruction ? { customInstruction } : {}),
      // Explicit reference pick from the per-look re-render dialog
      // (`buildLookRenderRequestFields`). `auto` preserves the look contract;
      // an explicit asset id still wins server-side.
      ...(referenceAssetLinkId ? { referenceAssetLinkId } : {}),
      ...(imageModelUsesMcp && mcpConnectionId ? { mcpConnectionId } : {}),
      ...(imageModelUsesMcp && mcpConnectionId && mcpSharedGroupId != null
        ? { sharedGroupId: mcpSharedGroupId }
        : {}),
      ...(imageModelUsesHermes && hermesConnectionId
        ? { hermesConnectionId }
        : {}),
    });
  };

  /**
   * Character Design Bible sheet generation — ONE mutation for whichever
   * `sheetType` the caller requests (vertical-drama-character-sheet-
   * consolidation plan, Phase C). Replaces what used to be two separate
   * mutations here (`generateTurnaroundMutation`, bound to the now-deleted
   * `generateCharacterTurnaround`; and this file's own former
   * `generateSheetMutation`, bound to a `full_combined`-only
   * `generateCharacterSheet`). The backend (`generateCharacterSheet`, Phase
   * B) is now the sole source of truth for which `role`/`metadata` the
   * resulting asset gets tagged with — `assetRole`/`assetMetadata` in its
   * response, via `resolveCharacterSheetAssetTag` — so this reads those
   * straight off the response instead of hardcoding a role client-side. Does
   * not go through the preview-prompt gate the portrait action uses (see
   * below) — a direct-confirm flow, matching how "Character Sheet แบบเต็ม"
   * already worked before this consolidation, kept simple across all 14
   * possible formats.
   */
  const generateSheetMutation =
    trpc.verticalDramaCharacters.generateCharacterSheet.useMutation({
      onSuccess: (
        res: {
          taskId: string;
          creditsUsed?: { promptGeneration?: number };
          assetRole: string;
          assetMetadata: Record<string, unknown> | null;
          dnaPersistenceStatus?: "persisted" | "skipped" | "failed";
          dnaPersistenceWarning?: string | null;
        },
        variables: { characterId: string }
      ) => {
        if (
          res.dnaPersistenceStatus === "failed" &&
          res.dnaPersistenceWarning
        ) {
          toast.warning(
            t(
              lang,
              "ส่งงานสร้างชีตแล้ว แต่บันทึก Character DNA ไม่สำเร็จ ระบบไม่ได้ส่งงานซ้ำ",
              res.dnaPersistenceWarning
            )
          );
        }
        void pollCharacterImageTask(
          res.taskId,
          variables.characterId,
          res.assetRole,
          res.creditsUsed?.promptGeneration ?? 0,
          res.assetMetadata
        );
      },
      onError: (err, variables) => {
        if (!handleAgeStageVariantRequiredError(err, variables)) {
          onImageModelError(err);
        }
      },
    });

  const generateAnglePackMutation =
    trpc.verticalDramaCharacters.generateCharacterAnglePack.useMutation({
      onSuccess: (
        res: {
          anglePackId: string;
          tasks: Array<{
            role: string;
            taskId: string;
            creditsUsed?: { promptGeneration?: number };
          }>;
        },
        variables: { characterId: string }
      ) => {
        for (const task of res.tasks) {
          void pollCharacterImageTask(
            task.taskId,
            variables.characterId,
            task.role,
            task.creditsUsed?.promptGeneration ?? 0,
            { anglePackId: res.anglePackId, angleRole: task.role }
          );
        }
        toast.success(
          t(
            lang,
            "ส่งงานสร้างชุดมุมอ้างอิง 3 มุมแล้ว — ตรวจและอนุมัติแต่ละภาพได้ในคลังตัวละคร",
            "Three identity-angle renders submitted — review and approve each image in the character stock."
          )
        );
      },
      onError: onImageModelError,
    });

  const settlePortraitCandidateMutation =
    trpc.verticalDramaCharacters.settlePortraitCandidate.useMutation();

  const updatePortraitCandidateUi = (
    characterId: string,
    assetLinkId: string,
    patch: Partial<VdPortraitCandidateUiItem>
  ) => {
    setPortraitCandidateBatches(prev => {
      const batch = prev[characterId];
      if (!batch) return prev;
      return {
        ...prev,
        [characterId]: {
          ...batch,
          candidates: batch.candidates.map(candidate =>
            candidate.assetLinkId === assetLinkId
              ? { ...candidate, ...patch }
              : candidate
          ),
        },
      };
    });
  };

  async function pollPortraitCandidateTask(
    characterId: string,
    assetLinkId: string,
    taskId?: string
  ) {
    if (pollingPortraitCandidateAssetIds.has(assetLinkId)) return;
    setPollingPortraitCandidateAssetIds(prev => new Set(prev).add(assetLinkId));
    // Set B fix (planning/fix-character-image-false-failure/plan.md): see
    // `pollCharacterImageTask`'s matching comment — same rationale, applied
    // to `settlePortraitCandidate` (whose own thrown 429 reads are the exact
    // production evidence for this bug).
    let hadUnresolvedRead = false;
    let consecutiveTransientErrors = 0;
    try {
      for (
        let attempt = 0;
        attempt < VD_CHARACTER_IMAGE_POLL_MAX_ATTEMPTS;
        attempt += 1
      ) {
        let result: Awaited<
          ReturnType<typeof settlePortraitCandidateMutation.mutateAsync>
        >;
        try {
          result = await mediaPollSchedulerRef.current.run(() =>
            settlePortraitCandidateMutation.mutateAsync({
              seriesId,
              assetLinkId,
              ...(taskId ? { taskId } : {}),
            })
          );
        } catch (pollError) {
          const errorClass = classifyMediaPollError(pollError);
          hadUnresolvedRead = true;
          if (
            errorClass === "transient" &&
            consecutiveTransientErrors <
              VD_MEDIA_POLL_MAX_CONSECUTIVE_TRANSIENT_ERRORS
          ) {
            const delay = Math.max(
              retryDelayMs(consecutiveTransientErrors),
              rateLimitBackoffMs(pollError)
            );
            consecutiveTransientErrors += 1;
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          // Non-retryable (TERMINAL-classified) read error, or a transient
          // one that exhausted its own consecutive-failure guard — land in
          // the same non-destructive "outcome not yet confirmed" state the
          // budget-exhaustion path below uses. NEVER write `failed` here:
          // this catch only ever means we could not OBSERVE the status, not
          // that the provider reported the job as failed.
          updatePortraitCandidateUi(
            characterId,
            assetLinkId,
            buildPortraitCandidateUnresolvedOutcomePatch(lang)
          );
          return;
        }
        consecutiveTransientErrors = 0;
        if (result.status === "completed") {
          updatePortraitCandidateUi(characterId, assetLinkId, {
            status: "completed",
            taskId: result.taskId,
            imageUrl: result.imageUrl,
          });
          await invalidate();
          return;
        }
        if (result.status === "failed") {
          // Policy failures are terminal for this submission. Keep the
          // classification explicit so the user sees actionable guidance and
          // must choose any retry manually; no automatic resubmit is allowed.
          const willAutoSoften = shouldAutoSoftenPortraitCandidate(
            result.errorMessage,
            0
          );
          if (
            !willAutoSoften &&
            isCharacterLockPolicyFailureMessage(result.errorMessage)
          ) {
            toast.error(
              t(
                lang,
                "ผู้ให้บริการปฏิเสธภาพนี้ตามนโยบายเนื้อหา กด “ลองใหม่” เพื่อสร้างใหม่",
                "The provider rejected this image under content policy. Tap Retry to generate again."
              )
            );
          }
          updatePortraitCandidateUi(characterId, assetLinkId, {
            status: "failed",
            taskId: result.taskId,
            errorMessage: result.errorMessage,
          });
          await invalidate();
          return;
        }
        updatePortraitCandidateUi(characterId, assetLinkId, {
          status: "queued",
          taskId: result.taskId,
        });
        const retryAfterMs =
          "retryAfterMs" in result && typeof result.retryAfterMs === "number"
            ? Math.min(300_000, Math.max(0, result.retryAfterMs))
            : 0;
        await new Promise(resolve =>
          setTimeout(
            resolve,
            Math.max(VD_CHARACTER_IMAGE_POLL_INTERVAL_MS, retryAfterMs)
          )
        );
      }
      // Set A fix #1: previously this only toasted, leaving the card frozen
      // on "กำลังสร้าง…" forever — now also patches a terminal `failed`
      // status (with a Retry button available once rendered) via
      // `buildPortraitCandidateTimeoutPatch`. Set B fix: that terminal
      // `failed` verdict is only correct when every read genuinely
      // succeeded and the job simply never left "queued" — if any read
      // along the way was unreadable (`hadUnresolvedRead`), use the
      // non-destructive outcome instead (core principle: never fail a job
      // because we could not observe it).
      updatePortraitCandidateUi(
        characterId,
        assetLinkId,
        hadUnresolvedRead
          ? buildPortraitCandidateUnresolvedOutcomePatch(lang)
          : buildPortraitCandidateTimeoutPatch(lang)
      );
      if (!hadUnresolvedRead) {
        toast.info(
          t(
            lang,
            "ภาพตัวเลือกใช้เวลานาน ระบบจะเก็บงานไว้ตรวจสอบต่อภายหลัง",
            "Candidate generation is taking longer; the task remains saved for later review."
          )
        );
      }
    } catch (error) {
      // Defensive backstop only — every expected poll-error path is now
      // handled by the per-iteration try/catch above and never reaches
      // here. Kept as a safety net for anything unexpected escaping that
      // handling (e.g. a bug in `updatePortraitCandidateUi`/`invalidate`
      // itself); per the same Set B core principle, still never writes
      // `failed` purely because of a caught exception here.
      void error;
      updatePortraitCandidateUi(
        characterId,
        assetLinkId,
        buildPortraitCandidateUnresolvedOutcomePatch(lang)
      );
    } finally {
      setPollingPortraitCandidateAssetIds(prev => {
        const next = new Set(prev);
        next.delete(assetLinkId);
        return next;
      });
    }
  }

  const generatePortraitCandidateBatchMutation =
    trpc.verticalDramaCharacters.generatePortraitCandidateBatch.useMutation({
      onSuccess: (result, variables) => {
        setPortraitCandidateBatches(prev => {
          const batch = prev[variables.characterId];
          if (!batch) return prev;
          const submitted = new Map(
            result.candidates.map(candidate => [
              candidate.assetLinkId,
              candidate,
            ])
          );
          return {
            ...prev,
            [variables.characterId]: {
              ...batch,
              model: result.model,
              candidates: batch.candidates.map(candidate => {
                const next = submitted.get(candidate.assetLinkId);
                return next
                  ? {
                      ...candidate,
                      status: next.status,
                      taskId: next.taskId,
                      errorMessage: next.errorMessage,
                    }
                  : candidate;
              }),
            },
          };
        });
        for (const candidate of result.candidates) {
          if (
            candidate.status === "queued" &&
            !resumedPortraitCandidateTasksRef.current.has(candidate.assetLinkId)
          ) {
            resumedPortraitCandidateTasksRef.current.add(candidate.assetLinkId);
            void pollPortraitCandidateTask(
              variables.characterId,
              candidate.assetLinkId,
              candidate.taskId
            );
          }
        }
      },
      onError: onImageModelError,
    });

  const selectPortraitCandidateMutation =
    trpc.verticalDramaCharacters.selectPortraitCandidate.useMutation({
      onSuccess: async (result, variables) => {
        setPortraitCandidateBatches(prev => {
          const batch = prev[variables.characterId];
          if (!batch) return prev;
          return {
            ...prev,
            [variables.characterId]: {
              ...batch,
              candidates: batch.candidates.map(candidate => ({
                ...candidate,
                status:
                  candidate.assetLinkId === variables.assetLinkId
                    ? "selected"
                    : candidate.status === "selected"
                      ? "superseded"
                      : candidate.status,
              })),
            },
          };
        });
        await invalidate();
        const selectedBatch = portraitCandidateBatches[variables.characterId];
        const referenceGuided =
          result.asset.portraitCandidate?.referenceGuided ??
          selectedBatch?.referenceGuided ??
          false;
        toast.success(
          t(
            lang,
            referenceGuided
              ? "เลือกภาพหลักแล้ว ภาพนี้เป็นคนใหม่และยังไม่ล็อก Character DNA เดิม"
              : "เลือกภาพหลักและล็อก Character DNA แล้ว",
            referenceGuided
              ? "Primary portrait selected. This is a new person and the existing Character DNA remains unchanged."
              : "Primary portrait selected and Character DNA locked."
          )
        );
      },
      onError,
    });

  /**
   * "Make this the main image" — `planning/vd-character-primary-portrait-
   * control/plan.md`. One mutation for BOTH kinds of image: the server routes a
   * first-portrait batch candidate through the DNA-locking path and everything
   * else through the plain promotion, so this caller never has to know which
   * kind it is pointing at. Until this existed there was no way at all to say
   * which of a character's several `primary_portrait` rows was actually in use.
   */
  const setPrimaryPortraitMutation =
    trpc.verticalDramaCharacters.setPrimaryPortrait.useMutation({
      onSuccess: async () => {
        // Setting an image as primary is not the same as explicitly attaching
        // it as the next generation's reference. Main portrait generation is
        // intentionally `none` by default; look generation uses the primary
        // through its own `auto` policy.
        await invalidate();
        toast.success(t(lang, "ตั้งเป็นภาพหลักแล้ว", "Set as the main image"));
      },
      onError,
    });

  /**
   * Prompt-preview confirmation step (spec fix-round-3, Section C): the
   * portrait ("Generate character image") action must show the actual LLM-
   * produced prompt for user approval BEFORE any image-render credit is
   * spent. `previewCharacterPrompt` runs only the (already credit-gated)
   * prompt-generation LLM leg and returns `portraitPrompt` (plus a
   * `turnaroundPrompt` this file no longer reads — the merged sheet-
   * generation flow below is a direct-confirm flow with no preview step, see
   * `generateSheetMutation`'s doc comment). The real `generateCharacterImage`
   * mutation is only invoked from `handleCharacterPromptConfirm`, with
   * `approvedPrompt` set, so the backend skips its own internal prompt-
   * generation call and never double-charges the same spend.
   *
   * NOTE: prior to the vertical-drama-character-sheet-consolidation plan
   * (Phase C) this preview step was shared between the portrait AND
   * turnaround-sheet actions (an `action: "image" | "turnaround"`
   * discriminator threaded through this whole preview flow) — the turnaround
   * action was removed once the sheet-generation buttons stopped using the
   * preview step at all, so everything below is portrait-only now.
   */
  const previewCharacterPromptMutation =
    trpc.verticalDramaCharacters.previewCharacterPrompt.useMutation({
      onError: (err, variables) => {
        if (!handleAgeStageVariantRequiredError(err, variables)) {
          onError(err);
        }
      },
    });

  /** Which character is currently waiting on `previewCharacterPromptMutation`
   *  — tracked separately from the mutation's own `variables` purely for
   *  clarity/parity with the rest of this file's per-character loading-state
   *  pattern. Cleared as soon as the preview resolves (success or error). */
  const [pendingPreviewTarget, setPendingPreviewTarget] = useState<{
    characterId: string;
  } | null>(null);
  /** Durable BullMQ character-prompt preview currently being polled. */
  const [characterPromptJob, setCharacterPromptJob] = useState<{
    jobId: string;
    characterId: string;
  } | null>(() => readStoredCharacterPromptJob(seriesId));

  /** Populated once `previewCharacterPromptMutation` resolves — drives the
   *  inline `MediaPromptPreview` card. Cleared on confirm or cancel. */
  const [pendingCharacterPromptPreview, setPendingCharacterPromptPreview] =
    useState<{
      characterId: string;
      portraitPrompt: string;
      turnaroundPrompt: string;
      negativePrompt?: string;
      model?: string;
      approvedDesignSnapshot: VerticalDramaApprovedCharacterDesignSnapshot;
      /** Non-fatal lead-beauty graceful-degradation warnings from the server
       * (FIX A) — shown so the creator knows a lead portrait was accepted
       * despite reading a touch plain, instead of the previous silent block. */
      warnings?: string[];
    } | null>(null);

  type CharacterPromptPreviewResult =
    | {
        mode: "candidate_batch";
        batchId: string;
        candidateCount: number;
        sharedVisualLanguage?: string;
        model?: string;
        referenceGuided?: boolean;
        castingAgeProfile?: VdPortraitCandidateUiBatch["castingAgeProfile"];
        warnings?: string[];
        candidates: Array<{
          assetLinkId: string;
          candidateId: string;
          index: number;
          portraitPrompt: string;
          negativePrompt?: string;
          visualIdentitySummary?: string;
          warnings?: string[];
        }>;
      }
    | {
        mode: "single";
        portraitPrompt: string;
        turnaroundPrompt: string;
        negativePrompt?: string;
        model?: string;
        warnings?: string[];
        approvedDesignSnapshot: VerticalDramaApprovedCharacterDesignSnapshot;
      };

  const applyCharacterPromptPreviewResult = (
    res: CharacterPromptPreviewResult
  ) => {
    const characterId =
      pendingPreviewTarget?.characterId ?? characterPromptJob?.characterId;
    if (!characterId) return;
    setPendingPreviewTarget(null);
    setCharacterPromptJob(null);
    if (res.mode === "candidate_batch") {
      setRetryingPortraitCandidateAssetIds(new Set());
      setPendingCharacterPromptPreview(null);
      setPortraitCandidateBatches(prev => ({
        ...prev,
        [characterId]: {
          batchId: res.batchId,
          characterId,
          sharedVisualLanguage: res.sharedVisualLanguage,
          model: res.model,
          referenceGuided: res.referenceGuided,
          castingAgeProfile: res.castingAgeProfile,
          warnings: res.warnings,
          candidates: res.candidates.map(candidate => ({
            assetLinkId: candidate.assetLinkId,
            candidateId: candidate.candidateId,
            index: candidate.index,
            portraitPrompt: candidate.portraitPrompt,
            negativePrompt: candidate.negativePrompt,
            visualIdentitySummary: candidate.visualIdentitySummary,
            status: "previewed",
          })),
        },
      }));
      return;
    }
    setPendingCharacterPromptPreview({
      characterId,
      portraitPrompt: res.portraitPrompt,
      turnaroundPrompt: res.turnaroundPrompt,
      negativePrompt: res.negativePrompt,
      model: res.model,
      approvedDesignSnapshot: res.approvedDesignSnapshot,
      warnings: res.warnings,
    });
  };

  const characterPromptJobQuery =
    trpc.verticalDramaCharacters.getCharacterPromptJob.useQuery(
      characterPromptJob
        ? {
            jobId: characterPromptJob.jobId,
            seriesId,
            characterId: characterPromptJob.characterId,
          }
        : {
            jobId: "00000000-0000-4000-8000-000000000000",
            seriesId,
            characterId: "0",
          },
      {
        enabled: Boolean(characterPromptJob),
        refetchInterval: query => {
          const status = query.state.data?.status;
          return status === "queued" || status === "running" ? 2_000 : false;
        },
        refetchIntervalInBackground: true,
      }
    );

  useEffect(() => {
    const storageKey = characterPromptJobStorageKey(seriesId);
    if (characterPromptJob) {
      safeStorageSet(storageKey, JSON.stringify(characterPromptJob));
    } else {
      safeStorageRemove(storageKey);
    }
  }, [characterPromptJob, seriesId]);

  useEffect(() => {
    const job = characterPromptJobQuery.data;
    if (characterPromptJobQuery.error) {
      setRetryingPortraitCandidateAssetIds(new Set());
      setPendingPreviewTarget(null);
      setCharacterPromptJob(null);
      return;
    }
    if (!job || !characterPromptJob) return;
    if (job.status === "succeeded" && job.result) {
      applyCharacterPromptPreviewResult(
        job.result as CharacterPromptPreviewResult
      );
    } else if (job.status === "failed") {
      setRetryingPortraitCandidateAssetIds(new Set());
      setPendingPreviewTarget(null);
      setCharacterPromptJob(null);
      toast.error(
        resolveVdCharacterMutationErrorMessage(
          {
            message: job.error
              ? `สร้าง prompt ตัวละครไม่สำเร็จ: ${job.error}`
              : "สร้าง prompt ตัวละครไม่สำเร็จ",
          },
          lang
        )
      );
    }
  }, [
    characterPromptJobQuery.data,
    characterPromptJobQuery.error,
    characterPromptJob,
    lang,
  ]);

  /** Entry point for the portrait generate button (card grid + selected-
   *  character detail panel) — replaces the previous direct
   *  `generateImageMutation` call. Still gates on `requireModelSelected()`
   *  exactly as before; only inserts the preview fetch in between "click"
   *  and "real mutation fires". */
  const startCharacterPromptPreview = (
    characterId: string,
    options: {
      forceCandidateBatch?: boolean;
      castingReferenceAssetLinkIds?: string[];
    } = {}
  ) => {
    if (!requireModelSelected()) return;
    if (!requireMcpConnectionOrToast()) return;
    if (!requireHermesConnectionOrToast()) return;
    const character = characters.find(
      (candidate: VdCharacterListItem) => candidate.characterId === characterId
    );
    const useCandidateBatch =
      options.forceCandidateBatch === true ||
      Boolean(character && isFirstPortraitCandidateEligible(character, assets));
    if (useCandidateBatch) setSelectedCharacterId(characterId);
    requestConfirmation({
      title: t(
        lang,
        "ยืนยันสร้าง prompt ตัวละคร",
        "Confirm character prompt generation"
      ),
      description: t(
        lang,
        "การทำงานนี้ใช้ AI เพื่อสร้าง prompt และอาจหักเครดิต ก่อนเข้าสู่ขั้นตรวจสอบภาพ",
        "This uses AI to generate a character prompt and may spend credits before the image review step."
      ),
      confirmLabel: t(lang, "สร้าง prompt", "Generate prompt"),
      cancelLabel: t(lang, "ยกเลิก", "Cancel"),
      testId: `vd-credit-confirm-character-prompt-${characterId}`,
      onConfirm: () => {
        setPendingPreviewTarget({ characterId });
        const castingReferenceAssetLinkIds = Array.from(
          new Set(
            (
              options.castingReferenceAssetLinkIds ??
              assets
                .filter(
                  asset =>
                    asset.characterId === characterId &&
                    asset.role === "primary_portrait" &&
                    Boolean(asset.assetLinkId)
                )
                .map(asset => asset.assetLinkId)
            ).filter(Boolean)
          )
        ).slice(0, 6);
        previewCharacterPromptMutation.mutate(
          buildPreviewCharacterPromptInput({
            seriesId,
            characterId,
            selectedImageModelId,
            customInstruction: customInstructionByCharacter[characterId] ?? "",
            ...(useCandidateBatch
              ? {
                  portraitCandidateCount:
                    portraitCandidateCountByCharacter[characterId] ?? 3,
                }
              : {}),
            ...(castingReferenceAssetLinkIds.length
              ? {
                  castingReferenceAssetLinkIds,
                  castingLockClothing:
                    castingLockClothingByCharacter[characterId] ?? false,
                  castingPoseMode:
                    castingPoseModeByCharacter[characterId] ?? "auto_natural",
                  castingCameraFraming:
                    castingCameraFramingByCharacter[characterId] ?? "half_body",
                }
              : {}),
          }),
          {
            onSuccess: res => {
              if (res.mode === "job") {
                setCharacterPromptJob({
                  jobId: res.jobId,
                  characterId,
                });
                return;
              }
              applyCharacterPromptPreviewResult(res);
            },
            onError: () => {
              setPendingPreviewTarget(null);
              setCharacterPromptJob(null);
            },
          }
        );
      },
    });
  };

  /** User confirmed (optionally edited) the previewed prompt — now, and only
   *  now, fire the real paid image-render mutation, passing the approved
   *  text back as `approvedPrompt` so the backend skips re-running (and
   *  re-charging) its own internal prompt-generation step. */
  const handleCharacterPromptConfirm = (editedPrompt: string) => {
    if (!pendingCharacterPromptPreview) return;
    // Defense in depth: `startCharacterPromptPreview` already gated on
    // `requireModelSelected()` before this preview was ever generated, but
    // re-check here too — the preview step + user review can take a while,
    // and the server now REJECTS (BAD_REQUEST, no more silent
    // `DEFAULT_MODELS.image` fallback) if `selectedImageModelId` is blank.
    if (!requireModelSelected()) return;
    const {
      characterId,
      portraitPrompt,
      negativePrompt,
      approvedDesignSnapshot,
    } = pendingCharacterPromptPreview;
    const confirmation = buildCharacterPromptConfirmPayload({
      seriesId,
      characterId,
      originalPrompt: portraitPrompt,
      editedPrompt,
      negativePrompt,
      approvedDesignSnapshot,
      selectedImageModelId,
      selectedEditImageModelId,
      imageModelUsesMcp,
      mcpConnectionId,
      sharedGroupId: mcpSharedGroupId,
      imageModelUsesHermes,
      hermesConnectionId,
      referenceAssetLinkId: referenceOverrideByCharacter[characterId] ?? null,
    });
    confirmCharacterCreditAction(
      characterId,
      t(lang, "ยืนยันสร้างภาพตัวละคร", "Confirm character image generation"),
      t(
        lang,
        "การสร้างภาพตัวละครใช้ AI และมีค่าใช้จ่ายเครดิต ต้องการดำเนินการต่อหรือไม่?",
        "Generating the character image uses AI and spends credits. Continue?"
      ),
      t(lang, "สร้างภาพตัวละคร", "Generate character image"),
      () => {
        setPendingCharacterPromptPreview(null);
        if (confirmation.wasPromptEdited) {
          toast.info(
            t(
              lang,
              "ระบบจะสร้างภาพจาก Prompt ที่แก้ไข แต่จะยังไม่ล็อก Character DNA หากต้องการล็อกหน้าตาใหม่นี้ ให้สร้าง Preview ใหม่ก่อนยืนยัน",
              "The edited prompt will render, but Character DNA was not locked. Generate a fresh preview to lock the edited identity."
            )
          );
        }
        generateImageMutation.mutate(confirmation.payload);
      }
    );
  };

  /** User cancelled the preview — clear state only, no mutation call, no
   *  credit spent (the preview's own prompt-generation credit was already
   *  charged by `previewCharacterPromptMutation` itself; that is the single
   *  charge the plan accepts as the cost of showing the preview at all). */
  const handleCharacterPromptCancel = () =>
    setPendingCharacterPromptPreview(null);

  const handlePortraitCandidateBatchConfirm = (characterId: string) => {
    const batch = portraitCandidateBatches[characterId];
    if (
      !batch ||
      !requireModelSelected() ||
      !requireMcpConnectionOrToast() ||
      !requireHermesConnectionOrToast()
    )
      return;
    confirmCharacterCreditAction(
      characterId,
      t(lang, "ยืนยันสร้างภาพตัวเลือก", "Confirm candidate image generation"),
      t(
        lang,
        "การสร้างภาพตัวเลือกใช้ AI และอาจหักเครดิต ต้องการดำเนินการต่อหรือไม่?",
        "Generating candidate images uses AI and may spend credits. Continue?"
      ),
      t(lang, "สร้างภาพตัวเลือก", "Generate candidates"),
      () => {
        setPortraitCandidateBatches(prev => ({
          ...prev,
          [characterId]: {
            ...batch,
            candidates: batch.candidates.map(candidate => ({
              ...candidate,
              status: "submitting",
            })),
          },
        }));
        generatePortraitCandidateBatchMutation.mutate({
          seriesId,
          characterId,
          batchId: batch.batchId,
          // Always sent (never conditionally spread) — the server now REJECTS
          // image generation without an explicit `selectedImageModelId` (fail-
          // closed, no more silent `DEFAULT_MODELS.image` fallback). Safe to
          // assert non-empty here: `requireModelSelected()` above already
          // returned early when it was blank.
          selectedImageModelId,
          ...(imageModelUsesMcp && mcpConnectionId ? { mcpConnectionId } : {}),
          ...(imageModelUsesMcp && mcpConnectionId && mcpSharedGroupId != null
            ? { sharedGroupId: mcpSharedGroupId }
            : {}),
          ...(imageModelUsesHermes && hermesConnectionId
            ? { hermesConnectionId }
            : {}),
        });
      }
    );
  };

  const handlePortraitCandidateBatchCancel = (characterId: string) =>
    setPortraitCandidateBatches(prev => {
      const next = { ...prev };
      delete next[characterId];
      return next;
    });

  /**
   * Set A fix #3 "Cancel" — per-candidate affordance for a stuck
   * `queued`/`submitting` or a terminal `failed` candidate. Deletes the
   * asset outright (`deleteAssetMutation`, already wired above with
   * `invalidate()` + a success toast in its own `useMutation` options) and
   * clears this tab's ephemeral polling/resume-guard state for it, plus
   * optimistically drops it from the in-memory batch via
   * `removePortraitCandidateFromBatch` so the card disappears immediately
   * instead of waiting on the round-trip.
   */
  const cancelPortraitCandidate = (
    characterId: string,
    assetLinkId: string
  ) => {
    setPollingPortraitCandidateAssetIds(prev => {
      if (!prev.has(assetLinkId)) return prev;
      const next = new Set(prev);
      next.delete(assetLinkId);
      return next;
    });
    resumedPortraitCandidateTasksRef.current.delete(assetLinkId);
    setPortraitCandidateBatches(prev => {
      const batch = prev[characterId];
      if (!batch) return prev;
      return {
        ...prev,
        [characterId]: removePortraitCandidateFromBatch(batch, assetLinkId),
      };
    });
    deleteAssetMutation.mutate({ seriesId, assetLinkId });
  };

  /**
   * Set A fix #3 "Retry" — there is no per-slot resubmit endpoint server-
   * side: `claimPortraitCandidateBatch` requires EVERY row sharing a
   * `batchId` to still be at `status: "previewed"`
   * (`server/services/verticalDramaCharacterStock.ts:636-698`), so replaying
   * the SAME `batchId` after the first `generatePortraitCandidateBatch` call
   * always throws `candidate_batch_claimed` — a single failed slot can never
   * be resubmitted in place through that endpoint. The closest existing
   * mechanism (per the plan's explicit fallback instruction): request a
   * fresh single-candidate preview (`portraitCandidateCount: 1`) and
   * immediately submit ITS new batch through the exact same
   * `generatePortraitCandidateBatchMutation` path the normal "Generate all"
   * button uses. A new `batchId` naturally gives the server a fresh
   * idempotency key (`${batchId}:${candidateId}`,
   * `server/routers/verticalDramaCharacters.ts:1035`). The failed candidate
   * itself is left as-is (still visible, still Cancel-able) — Retry does not
   * couple a delete into the resubmit, so a resubmit failure never loses the
   * user's only record of what happened.
   */
  const retryPortraitCandidate = (
    characterId: string,
    assetLinkId: string,
    referenceGuided = portraitCandidateBatches[characterId]?.referenceGuided ===
      true
  ) => {
    if (!requireModelSelected()) return;
    if (!requireMcpConnectionOrToast()) return;
    if (!requireHermesConnectionOrToast()) return;
    confirmCharacterCreditAction(
      characterId,
      t(lang, "ยืนยันลองสร้างภาพตัวเลือกใหม่", "Confirm candidate retry"),
      t(
        lang,
        "การลองสร้างภาพตัวเลือกใหม่ใช้ AI และอาจหักเครดิต ต้องการดำเนินการต่อหรือไม่?",
        "Retrying this candidate uses AI and may spend credits. Continue?"
      ),
      t(lang, "ลองสร้างใหม่", "Retry generation"),
      () => {
        setRetryingPortraitCandidateAssetIds(prev =>
          new Set(prev).add(assetLinkId)
        );
        const clearRetrying = () =>
          setRetryingPortraitCandidateAssetIds(prev => {
            if (!prev.has(assetLinkId)) return prev;
            const next = new Set(prev);
            next.delete(assetLinkId);
            return next;
          });
        previewCharacterPromptMutation.mutate(
          buildPortraitCandidateRetryPreviewInput({
            seriesId,
            characterId,
            selectedImageModelId,
            customInstruction: customInstructionByCharacter[characterId] ?? "",
            ...(referenceGuided
              ? {
                  castingReferenceAssetLinkIds:
                    projectCastingReferenceAssetLinkIds(assets, characterId),
                  castingLockClothing:
                    castingLockClothingByCharacter[characterId] ?? false,
                  castingPoseMode:
                    castingPoseModeByCharacter[characterId] ?? "auto_natural",
                  castingCameraFraming:
                    castingCameraFramingByCharacter[characterId] ?? "half_body",
                }
              : {}),
          }),
          {
            onSuccess: res => {
              if (res.mode === "job") {
                setCharacterPromptJob({ jobId: res.jobId, characterId });
                return;
              }
              if (
                res.mode !== "candidate_batch" ||
                res.candidates.length === 0
              ) {
                clearRetrying();
                return;
              }
              setPortraitCandidateBatches(prev => ({
                ...prev,
                [characterId]: {
                  batchId: res.batchId,
                  characterId,
                  sharedVisualLanguage: res.sharedVisualLanguage,
                  model: res.model,
                  referenceGuided: res.referenceGuided,
                  castingAgeProfile: res.castingAgeProfile,
                  candidates: res.candidates.map(candidate => ({
                    assetLinkId: candidate.assetLinkId,
                    candidateId: candidate.candidateId,
                    index: candidate.index,
                    portraitPrompt: candidate.portraitPrompt,
                    negativePrompt:
                      "negativePrompt" in candidate
                        ? candidate.negativePrompt
                        : undefined,
                    visualIdentitySummary: candidate.visualIdentitySummary,
                    status: "submitting",
                  })),
                },
              }));
              generatePortraitCandidateBatchMutation.mutate({
                seriesId,
                characterId,
                batchId: res.batchId,
                selectedImageModelId,
                ...(imageModelUsesMcp && mcpConnectionId
                  ? { mcpConnectionId }
                  : {}),
                ...(imageModelUsesMcp &&
                mcpConnectionId &&
                mcpSharedGroupId != null
                  ? { sharedGroupId: mcpSharedGroupId }
                  : {}),
                ...(imageModelUsesHermes && hermesConnectionId
                  ? { hermesConnectionId }
                  : {}),
              });
              clearRetrying();
            },
            onError: () => {
              clearRetrying();
              setCharacterPromptJob(null);
            },
          }
        );
      }
    );
  };

  const isPreviewLoadingFor = (characterId: string) =>
    (previewCharacterPromptMutation.isPending &&
      pendingPreviewTarget?.characterId === characterId) ||
    characterPromptJob?.characterId === characterId;

  const isImageGeneratingFor = (characterId: string) =>
    isPreviewLoadingFor(characterId) ||
    (generateImageMutation.isPending &&
      generateImageMutation.variables?.characterId === characterId) ||
    pollingCharacters.has(
      pollingCharacterKey(characterId, "primary_portrait")
    ) ||
    (portraitCandidateBatches[characterId]?.candidates.some(candidate =>
      ["submitting", "queued"].includes(candidate.status)
    ) ??
      false);

  /** Covers the merged sheet-generation mutation regardless of which
   *  `sheetType` was requested — i.e. regardless of whether the resulting
   *  `role` turns out to be `"character_sheet_turnaround"`,
   *  `"character_sheet_full"`, or `"character_design_bible"` (see
   *  `generateSheetMutation`'s doc comment). Rather than hardcoding that
   *  role list here too, this treats ANY `pollingCharacters` entry for this
   *  character that isn't the portrait key as a sheet-generation in
   *  progress — stays correct automatically if the backend's role set ever
   *  changes. Also doubles as the busy-state for the roster card's mini
   *  "auto" shortcut icon, since it fires the exact same mutation. */
  const isSheetGeneratingFor = (characterId: string) =>
    (generateSheetMutation.isPending &&
      generateSheetMutation.variables?.characterId === characterId) ||
    Array.from(pollingCharacters).some(
      key =>
        key.startsWith(`${characterId}::`) &&
        key !== pollingCharacterKey(characterId, "primary_portrait")
    );

  const isAnglePackGeneratingFor = (characterId: string) =>
    generateAnglePackMutation.isPending &&
    generateAnglePackMutation.variables?.characterId === characterId;

  /**
   * Per-card drop-to-assign (roster card grid, spec fix-round-3 Section A):
   * every visible character card is its own drop target, resolved the same
   * way `VerticalDramaCharacterReferencePanel`'s own drop zone resolves a
   * drop — `resolveMediaAssetForImport` -> `linkAsset` — just invoked
   * directly here so assignment never requires selecting the character
   * first. Uses the same tRPC procedures, just without going through that
   * panel's `characterId`-scoped callback.
   */
  const [dragOverCharacterId, setDragOverCharacterId] = useState<string | null>(
    null
  );
  const [assigningCharacterId, setAssigningCharacterId] = useState<
    string | null
  >(null);
  const cardUploadMutation = trpc.ai.upload.useMutation();
  const cardResolveMutation =
    trpc.verticalDramaCharacters.resolveMediaAssetForImport.useMutation();
  const settleCharacterImageTaskMutation =
    trpc.verticalDramaCharacters.settleCharacterImageTask.useMutation();

  /** Resolves a dropped/uploaded image (a `data:` URL from a file/grid-cutter
   *  tile, or an already-hosted URL from Library/History) into a canonical
   *  `media_assets` id, via `resolveMediaAssetForImport` — same 2-branch
   *  resolution `assignDroppedReference` below already performed inline;
   *  extracted here so the "เพิ่มลุค" dialog's optional reference-image attach
   *  can reuse the EXACT same resolution without also calling `linkAsset` —
   *  the dialog creates the character first and passes `referenceMediaAssetId`
   *  to `createCharacterVariant`, which best-effort-links it server-side. */
  const resolveReferenceImageToMediaAssetId = async (
    url: string
  ): Promise<string> => {
    if (url.startsWith("data:")) {
      // Grid-cutter tiles carry client-side data URLs — upload first
      // (mirrors `VerticalDramaCharacterReferencePanel.resolveAndLinkFromDataUrl`).
      const uploadResult = await cardUploadMutation.mutateAsync({
        fileName: `character-reference-${Date.now()}.jpg`,
        fileType: "image/jpeg",
        fileBase64: url,
      });
      const resolved = await cardResolveMutation.mutateAsync({
        seriesId,
        source: "url",
        url: uploadResult.url,
        mimeType: uploadResult.fileType,
      });
      return resolved.mediaAssetId;
    }
    const resolved = await cardResolveMutation.mutateAsync({
      seriesId,
      source: "url",
      url,
      mimeType: "image/jpeg",
    });
    return resolved.mediaAssetId;
  };

  /** Upload files selected through the inline casting picker using the same
   * canonical upload path as the existing character reference panel. The
   * picker deliberately returns URLs to its controlled value; the change
   * handler below resolves those URLs into tenant-scoped media assets before
   * linking them to the character. */
  const uploadCastingReferenceFiles = async (
    files: FileList | File[]
  ): Promise<string[]> => {
    try {
      const uploadedUrls: string[] = [];
      for (const file of Array.from(files).slice(0, 6)) {
        const dataUrl = await readFileAsDataUrl(file);
        const result = await cardUploadMutation.mutateAsync({
          fileName: file.name || `character-reference-${Date.now()}.jpg`,
          fileType: file.type || "image/jpeg",
          fileBase64: dataUrl,
        });
        uploadedUrls.push(result.url);
      }
      return uploadedUrls;
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t(lang, "อัปโหลดภาพไม่สำเร็จ", "Image upload failed")
      );
      throw err;
    }
  };

  const handleCastingReferencePickerChange = async (
    characterId: string,
    urls: string[]
  ) => {
    const currentAssets = projectCastingReferenceAssets(
      selectedAssets,
      characterId
    );
    const canonicalAsset = resolveCharacterCardPortraitAsset(
      selectedAssets,
      characterId
    );
    const canonicalUrl = currentAssets.find(
      asset => asset.assetLinkId === canonicalAsset?.assetLinkId
    )?.thumbnailUrl;
    const nextUrls = Array.from(
      new Set(urls.map(url => url.trim()).filter(Boolean))
    );
    if (canonicalUrl && !nextUrls.includes(canonicalUrl))
      nextUrls.unshift(canonicalUrl);
    nextUrls.splice(6);
    setCastingReferencePickerUrlsByCharacter(prev => ({
      ...prev,
      [characterId]: nextUrls,
    }));

    const currentByUrl = new Map(
      currentAssets.map(asset => [asset.thumbnailUrl as string, asset])
    );
    const nextUrlSet = new Set(nextUrls);
    const removedAssets = currentAssets.filter(
      asset => !nextUrlSet.has(asset.thumbnailUrl as string)
    );
    const addedUrls = nextUrls.filter(url => !currentByUrl.has(url));

    if (removedAssets.length === 0 && addedUrls.length === 0) return;

    setCastingReferenceSyncingCharacterId(characterId);
    try {
      for (const asset of removedAssets) {
        await deleteAssetMutation.mutateAsync({
          seriesId,
          assetLinkId: asset.assetLinkId,
        });
      }
      for (const url of addedUrls) {
        const mediaAssetId = await resolveReferenceImageToMediaAssetId(url);
        await linkMutation.mutateAsync({
          seriesId,
          characterId,
          mediaAssetId,
          assetType: "character_reference",
          role: "casting_reference",
          source: "imported",
        });
      }
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t(
              lang,
              "บันทึกภาพอ้างอิงไม่สำเร็จ",
              "Failed to save the reference image"
            )
      );
      setCastingReferencePickerUrlsByCharacter(prev => ({
        ...prev,
        [characterId]: currentAssets
          .map(asset => asset.thumbnailUrl)
          .filter((url): url is string => Boolean(url)),
      }));
    } finally {
      setCastingReferenceSyncingCharacterId(current =>
        current === characterId ? null : current
      );
    }
  };

  const assignDroppedReference = async (characterId: string, url: string) => {
    setAssigningCharacterId(characterId);
    try {
      const mediaAssetId = await resolveReferenceImageToMediaAssetId(url);
      linkMutation.mutate({
        seriesId,
        characterId,
        mediaAssetId,
        assetType: "character_reference",
        // `role` must be "primary_portrait" — that's what `getCharacterCardThumbnail`
        // filters on to pick a card's thumbnail. Without it, `role` defaults to
        // null server-side and a successfully-linked drop never shows on the card.
        role: "primary_portrait",
        source: "imported",
      });
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t(lang, "นำเข้าอ้างอิงไม่สำเร็จ", "Failed to import reference")
      );
    } finally {
      setAssigningCharacterId(null);
    }
  };

  /** Factory for the "เพิ่มลุค" dialog's reference-image drop zone +
   *  upload-button handlers. Mirrors
   *  `VerticalDramaCharacterReferencePanel`'s own drop-zone + "อัปโหลดภาพ"
   *  button validation copy exactly (unsupported type / too-large / no-image
   *  messages), just resolving to a stored `mediaAssetId` instead of
   *  immediately linking it because the look character does not exist yet. */
  const makeReferenceAttachHandlers = (
    setMediaAssetId: (id: string | null) => void,
    setPreviewUrl: (url: string | null) => void,
    setResolving: (resolving: boolean) => void
  ) => {
    const resolve = async (url: string) => {
      setResolving(true);
      try {
        const mediaAssetId = await resolveReferenceImageToMediaAssetId(url);
        setMediaAssetId(mediaAssetId);
        setPreviewUrl(url);
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : t(lang, "นำเข้าอ้างอิงไม่สำเร็จ", "Failed to import reference")
        );
      } finally {
        setResolving(false);
      }
    };
    const handleDrop = (event: React.DragEvent) => {
      event.preventDefault();
      const { input, error } = readDroppedImageInput(event);
      if (error) {
        if (error.kind === "unsupported-file-type") {
          toast.error(
            t(lang, "รองรับเฉพาะไฟล์ภาพ", "Only image files are supported")
          );
        } else {
          toast.error(
            t(
              lang,
              `ไฟล์ภาพใหญ่เกินไป (สูงสุด ${Math.round(error.maxBytes / (1024 * 1024))}MB)`,
              `Image is too large (max ${Math.round(error.maxBytes / (1024 * 1024))}MB)`
            )
          );
        }
        return;
      }
      if (!input) {
        toast.error(
          t(
            lang,
            "ไม่พบภาพที่ลากมา — ลองใหม่อีกครั้ง",
            "No draggable image found — please try again"
          )
        );
        return;
      }
      if (input.kind === "url") {
        void resolve(input.url);
      } else {
        void readFileAsDataUrl(input.file).then(dataUrl => resolve(dataUrl));
      }
    };
    const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        toast.error(
          t(lang, "รองรับเฉพาะไฟล์ภาพ", "Only image files are supported")
        );
        return;
      }
      if (file.size > 15 * 1024 * 1024) {
        toast.error(
          t(
            lang,
            "ไฟล์ภาพใหญ่เกินไป (สูงสุด 15MB)",
            "Image is too large (max 15MB)"
          )
        );
        return;
      }
      void readFileAsDataUrl(file).then(dataUrl => resolve(dataUrl));
    };
    return { handleDrop, handleFileInput };
  };

  const variantReferenceHandlers = makeReferenceAttachHandlers(
    setVariantReferenceMediaAssetId,
    setVariantReferencePreviewUrl,
    setVariantReferenceResolving
  );

  const characters = listQuery.data?.characters ?? [];
  const manifest = listQuery.data?.manifest;
  const assets = (manifest?.assets ?? []) as VerticalDramaCharacterAsset[];

  useEffect(() => {
    for (const asset of assets) {
      const candidate = asset.portraitCandidate;
      if (
        !candidate?.taskId ||
        !["queued", "submitting"].includes(candidate.status) ||
        resumedPortraitCandidateTasksRef.current.has(asset.assetLinkId)
      ) {
        continue;
      }
      resumedPortraitCandidateTasksRef.current.add(asset.assetLinkId);
      void pollPortraitCandidateTask(
        asset.characterId,
        asset.assetLinkId,
        candidate.taskId
      );
    }
  }, [assets]);

  /**
   * Best-effort roster-card thumbnail for a character: the `primary_portrait`
   * asset in `approved` state if present, else the most recently updated
   * `primary_portrait` still in `generated` (pending) state. Prefers the
   * durable `thumbnailUrl` projection (LEFT JOIN onto `media_assets.originalUrl`,
   * populated server-side); falls back to this session's freshly-generated
   * image cache (`generatedImageUrls`), matched by `mediaAssetId`, for the
   * rare race where the asset list hasn't reflected a just-linked asset yet.
   */
  const getCharacterCardPortraitAsset = (
    characterId: string
  ): VdCharacterCardPortraitAsset | null =>
    resolveCharacterCardPortraitAsset(
      assets,
      characterId,
      generatedImageUrls[characterId]
    );

  const getCharacterCardThumbnail = (characterId: string): string | null =>
    getCharacterCardPortraitAsset(characterId)?.thumbnailUrl ?? null;

  // Auto-select the first character once data loads.
  type VdCharacterListItem = (typeof characters)[number];

  /** Reference-picker (Phase D3, widened 2026-07-11 for the reverse/
   *  "downward" case) reusable `characterId -> VdReferenceCandidateLookupEntry`
   *  lookup — the same resolution `buildCharacterRosterEntries`'s own inline
   *  `shareFaceSourceName` computation already does per-twin (see below),
   *  built once as a `Map` so `buildReferenceCandidates` can resolve a
   *  variant/twin's source character name AND scan for characters that
   *  point back at the one being viewed, without re-scanning the flat list
   *  for every character. */
  const charactersById = useMemo(() => {
    const map = new Map<string, VdReferenceCandidateLookupEntry>();
    for (const c of characters as VdCharacterListItem[]) {
      map.set(c.characterId, {
        characterId: c.characterId,
        name: c.name,
        parentCharacterId: c.parentCharacterId,
        sharesFaceWithCharacterId: c.sharesFaceWithCharacterId,
        variantLabel: c.variantLabel,
      });
    }
    return map;
  }, [characters]);

  /** planning/vertical-drama-character-variants/plan.md Phase E — the flat
   *  `characters` list now mixes plain characters, variant rows
   *  (`parentCharacterId` set — same person, different outfit/age-stage
   *  look, each with its OWN portrait) and twin rows
   *  (`sharesFaceWithCharacterId` set — a different, independent person who
   *  just shares a face reference). `buildCharacterRosterEntries` groups
   *  variant rows under their parent's entry so the roster grid can nest
   *  them as chips instead of rendering every row as an unrelated
   *  top-level card; twins deliberately stay top-level (independent
   *  people) with their shares-face source resolved for the badge. Derived
   *  purely from the already-fetched flat list — no extra query. */
  const rosterEntries = useMemo(
    () => buildCharacterRosterEntries(characters as VdCharacterListItem[]),
    [characters]
  );
  /** Set B (`vd-stuck-generation-and-lost-characters` plan) — roster filter
   *  toggle state: off by default (full roster shown, matching this panel's
   *  existing behavior), flips to only `needsSetup` rows when the user
   *  taps the count chip above the list. */
  const [showOnlyNeedsSetup, setShowOnlyNeedsSetup] = useState(false);
  const needsSetupCount = useMemo(
    () => countCharactersNeedingSetup(characters as VdCharacterListItem[]),
    [characters]
  );
  const repairableLegacyLookCount = useMemo(
    () =>
      (characters as VdCharacterListItem[]).filter(character =>
        canRepairLegacyCharacterLook(character.data)
      ).length,
    [characters]
  );
  const [showOnlyLegacyLookRepairs, setShowOnlyLegacyLookRepairs] =
    useState(false);
  /** `vd-character-identity-repair` plan, Phase 3.4 — "รวมตัวละครซ้ำ" review
   *  dialog visibility. The dialog owns its own analyze/merge mutations;
   *  this panel only needs to know whether it's open. */
  const [isMergeReviewOpen, setIsMergeReviewOpen] = useState(false);
  const visibleRosterEntries = useMemo(() => {
    if (showOnlyLegacyLookRepairs) {
      return rosterEntries.filter(
        entry =>
          canRepairLegacyCharacterLook(entry.character.data) ||
          entry.variants.some(variant =>
            canRepairLegacyCharacterLook(variant.data)
          )
      );
    }
    return showOnlyNeedsSetup
      ? filterRosterEntriesNeedingSetup(rosterEntries)
      : rosterEntries;
  }, [rosterEntries, showOnlyLegacyLookRepairs, showOnlyNeedsSetup]);
  const effectiveSelectedId = useMemo(() => {
    if (
      selectedCharacterId &&
      characters.some(
        (c: VdCharacterListItem) => c.characterId === selectedCharacterId
      )
    ) {
      return selectedCharacterId;
    }
    return characters[0]?.characterId ?? null;
  }, [selectedCharacterId, characters]);

  /** Refresh-safe recovery for a prompt preview that was submitted before a
   * page reload. The active pointer is cleared as soon as the worker reaches
   * a terminal state, so this query only resumes queued/running work and can
   * never create a duplicate paid request. */
  const activeCharacterPromptJobQuery =
    trpc.verticalDramaCharacters.getActiveCharacterPromptJob.useQuery(
      {
        seriesId,
        characterId: effectiveSelectedId ?? "0",
      },
      {
        enabled: Boolean(effectiveSelectedId),
        refetchInterval: query => {
          const status = query.state.data?.status;
          return status === "queued" || status === "running" ? 2_000 : false;
        },
        refetchIntervalInBackground: true,
      }
    );

  useEffect(() => {
    const activeJob = activeCharacterPromptJobQuery.data;
    if (!activeJob || !effectiveSelectedId) return;
    if (!characterPromptJob || characterPromptJob.jobId !== activeJob.jobId) {
      setPendingPreviewTarget({ characterId: effectiveSelectedId });
      setCharacterPromptJob({
        jobId: activeJob.jobId,
        characterId: effectiveSelectedId,
      });
    }
  }, [
    activeCharacterPromptJobQuery.data,
    characterPromptJob,
    effectiveSelectedId,
  ]);

  const selectedCharacter =
    characters.find(
      (c: VdCharacterListItem) => c.characterId === effectiveSelectedId
    ) ?? null;
  /** `characterRowToDto`'s conditional `...(includeVoiceConfig ? {voiceConfig} : {})`
   *  spread makes its own TS-inferred return type a union whose OTHER branch
   *  has no `voiceConfig` property at all — a defensive cast (not `any`)
   *  reading it back off `selectedCharacter` sidesteps that union-property-
   *  access without assuming a shape the server didn't actually send
   *  (`voiceConfig` is simply `undefined` when the flag is off or the
   *  character was never cast). */
  const selectedCharacterVoiceConfig = (
    selectedCharacter as
      | (VdCharacterListItem & {
          voiceConfig?: VerticalDramaCharacterVoiceConfig;
        })
      | null
  )?.voiceConfig;
  /** F132F (spec 132 §7.3, added 2026-07-09) — tolerant parse of the
   *  selected character's `data.speechProfile` (a free-form jsonb payload
   *  server-side, so a malformed/legacy value must never crash this panel —
   *  `safeParse` degrades to `undefined`, which the editing sub-section
   *  below renders as "no profile yet" rather than throwing). */
  const selectedCharacterData = (selectedCharacter?.data ?? null) as Record<
    string,
    unknown
  > | null;
  const selectedCharacterSpeechProfileParse =
    selectedCharacterData?.speechProfile
      ? speechProfileSchema.safeParse(selectedCharacterData.speechProfile)
      : null;
  const selectedCharacterSpeechProfile: VerticalDramaSpeechProfile | undefined =
    selectedCharacterSpeechProfileParse?.success
      ? selectedCharacterSpeechProfileParse.data
      : undefined;
  const selectedCharacterHasPrimaryPortrait = Boolean(
    selectedCharacter &&
    resolveCharacterCardPortraitAsset(
      assets,
      selectedCharacter.characterId,
      generatedImageUrls[selectedCharacter.characterId]
    )
  );
  const isCharacterReferenceDisclosureExpanded = selectedCharacter
    ? (referenceDisclosureOverrideByCharacter[selectedCharacter.characterId] ??
      resolveCharacterReferenceDisclosureDefault({
        hasPrimaryPortrait: selectedCharacterHasPrimaryPortrait,
      }))
    : false;
  /** Show the persistent right-side reference-panel column only when there's
   *  a character to attach references to and mutations are allowed — matches
   *  the condition that previously gated mounting `VerticalDramaCharacterReferencePanel`
   *  at all (`!readOnly`). It now follows the master disclosure so the asset
   *  list cannot remain visible while the detail-side casting controls are
   *  collapsed. */
  const showReferencePanelColumn =
    Boolean(selectedCharacter) &&
    !readOnly &&
    isCharacterReferenceDisclosureExpanded;
  const jumpToCharacterEditor = (characterId: string) => {
    setSelectedCharacterId(characterId);
    setReferenceDisclosureOverrideByCharacter(prev => ({
      ...prev,
      [characterId]: true,
    }));
    scrollToCharacterEditor();
  };
  const selectedAssets = dedupeCharacterAssetsForDisplay(
    assets.filter(
      a => effectiveSelectedId != null && a.characterId === effectiveSelectedId
    )
  );
  const selectedCastingReferenceAssets = projectCastingReferenceAssets(
    selectedAssets,
    selectedCharacter?.characterId ?? ""
  );
  const selectedCastingReferenceUrls = selectedCastingReferenceAssets
    .map(asset => asset.thumbnailUrl)
    .filter((url): url is string => Boolean(url));
  const castingReferencePickerUrls = selectedCharacter
    ? (castingReferencePickerUrlsByCharacter[selectedCharacter.characterId] ??
      selectedCastingReferenceUrls)
    : [];
  useEffect(() => {
    if (!selectedCharacter) return;
    setCastingReferencePickerUrlsByCharacter(prev => ({
      ...prev,
      [selectedCharacter.characterId]: selectedCastingReferenceUrls,
    }));
  }, [
    selectedCharacter?.characterId,
    selectedCastingReferenceUrls.join("\u0000"),
  ]);
  const selectedCharacterSupportsCandidateBatch = Boolean(
    selectedCharacter &&
    isFirstPortraitCandidateEligible(selectedCharacter, assets)
  );
  const selectedPortraitCandidateBatches = useMemo(() => {
    if (!selectedCharacter) return [] as VdPortraitCandidateUiBatch[];
    const characterId = selectedCharacter.characterId;
    const durableAssets = [...assets]
      .filter(
        asset =>
          asset.characterId === characterId && Boolean(asset.portraitCandidate)
      )
      .sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() -
          new Date(left.updatedAt).getTime()
      );
    const groups = new Map<string, VdPortraitCandidateUiBatch>();
    for (const asset of durableAssets) {
      const candidate = asset.portraitCandidate!;
      const batch: VdPortraitCandidateUiBatch = groups.get(
        candidate.batchId
      ) ?? {
        batchId: candidate.batchId,
        characterId,
        referenceGuided: candidate.referenceGuided,
        castingAgeProfile: candidate.castingAgeProfile,
        candidates: [],
      };
      batch.candidates.push({
        assetLinkId: asset.assetLinkId,
        candidateId: candidate.candidateId,
        index: candidate.index,
        status: candidate.status,
        taskId: candidate.taskId,
        imageUrl: asset.thumbnailUrl,
        // Set A fix #2: the only durable place a candidate-submission
        // failure message currently lands is the asset-level
        // `rejectionReason` (see `characterAssetRowToContract`,
        // `server/services/verticalDramaCharacterStock.ts:290-318`) —
        // `portraitCandidate` itself carries no `errorMessage` field today.
        // Read defensively via optional chaining so this keeps working
        // whether or not it's populated yet.
        errorMessage: asset.rejectionReason,
      });
      groups.set(candidate.batchId, batch);
    }

    const active = portraitCandidateBatches[characterId];
    if (active) {
      const durable = groups.get(active.batchId);
      const durableByAssetId = new Map(
        durable?.candidates.map(candidate => [
          candidate.assetLinkId,
          candidate,
        ]) ?? []
      );
      groups.set(active.batchId, {
        ...active,
        candidates: active.candidates
          .map(candidate =>
            mergeDurablePortraitCandidateStatus(
              candidate,
              durableByAssetId.get(candidate.assetLinkId)
            )
          )
          .sort((left, right) => left.index - right.index),
      });
    }

    const ordered = [...groups.values()].map(batch => ({
      ...batch,
      candidates: [...batch.candidates].sort(
        (left, right) => left.index - right.index
      ),
    }));
    if (!active) return ordered;
    return [
      groups.get(active.batchId)!,
      ...ordered.filter(batch => batch.batchId !== active.batchId),
    ];
  }, [assets, portraitCandidateBatches, selectedCharacter]);
  const hasReferenceGuidedPortraitCandidates =
    selectedPortraitCandidateBatches.some(batch => batch.referenceGuided);
  const latestReferenceGuidedCandidateBatchId =
    selectedPortraitCandidateBatches.find(batch => batch.referenceGuided)
      ?.batchId ?? null;
  const candidateResultsPlacement = resolvePortraitCandidateResultsPlacement({
    hasReferenceGuidedCandidates: hasReferenceGuidedPortraitCandidates,
    hasReferenceResultsMount: Boolean(portraitCandidateResultsMount),
  });

  useEffect(() => {
    if (
      !latestReferenceGuidedCandidateBatchId ||
      !portraitCandidateResultsMount
    ) {
      if (!latestReferenceGuidedCandidateBatchId) {
        observedReferenceCandidateBatchIdRef.current = null;
        hasObservedReferenceCandidateBatchRef.current = false;
      }
      return;
    }

    if (!hasObservedReferenceCandidateBatchRef.current) {
      observedReferenceCandidateBatchIdRef.current =
        latestReferenceGuidedCandidateBatchId;
      hasObservedReferenceCandidateBatchRef.current = true;
      return;
    }

    if (
      observedReferenceCandidateBatchIdRef.current ===
      latestReferenceGuidedCandidateBatchId
    ) {
      return;
    }

    observedReferenceCandidateBatchIdRef.current =
      latestReferenceGuidedCandidateBatchId;
    const frameId = window.requestAnimationFrame(() => {
      const results = portraitCandidateResultsRef.current;
      if (!results) return;
      results.focus({ preventScroll: true });
      results.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "nearest",
      });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [latestReferenceGuidedCandidateBatchId, portraitCandidateResultsMount]);
  // Deliberately does NOT include the per-character generate/poll flags
  // (`generateImageMutation.isPending` etc., `pollingCharacters`) — those
  // gate only THAT character's own generate buttons (via
  // `isImageGeneratingFor`/`isSheetGeneratingFor` below), so generating one
  // character's image never blocks starting
  // another character's generation concurrently.
  const mutating =
    createMutation.isPending ||
    linkMutation.isPending ||
    deleteAssetMutation.isPending ||
    createVariantMutation.isPending ||
    deleteCharacterMutation.isPending;

  const requireModelSelected = (): boolean => {
    if (selectedImageModelId) return true;
    toast.info(
      t(
        lang,
        "กรุณาเลือกโมเดลสร้างภาพก่อน",
        "Please choose an image model first"
      )
    );
    setIsModelDialogOpen(true);
    return false;
  };

  /* ---- Loading ---- */
  if (listQuery.isLoading) {
    return (
      <section
        aria-busy="true"
        aria-label={t(lang, "สต็อกตัวละคร", "Character stock")}
        className={cn("grid gap-4", className)}
      >
        <Skeleton className="h-10 w-full" />
        <div className="grid gap-4 md:grid-cols-[280px_1fr]">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </section>
    );
  }

  /* ---- Error ---- */
  // Fatal only on a FIRST-load failure. A failed background refetch keeps
  // reporting `isError` while the cached roster is still in `data`; taking the
  // panel over there wipes every in-progress selection/dialog below it.
  if (listQuery.isError && !listQuery.data) {
    return (
      <Card className={cn("border-destructive/40", className)}>
        <CardContent
          role="alert"
          className="flex flex-col items-center gap-3 py-10 text-center"
        >
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
            {listQuery.error?.message ??
              t(
                lang,
                "โหลดสต็อกตัวละครไม่สำเร็จ",
                "Failed to load character stock"
              )}
          </p>
          <Button variant="outline" onClick={() => listQuery.refetch()}>
            {t(lang, "ลองอีกครั้ง", "Retry")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <section
      aria-label={t(lang, "สต็อกตัวละคร", "Character stock")}
      className={cn("flex flex-col gap-4", className)}
    >
      {creditConfirmDialog}
      {/* Target-audience-region chip (2026-07-06 quality upgrade) — always
          visible so users know which region/ethnicity default is currently
          applied to every generated character image. Changed from the
          Series Settings tab. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-muted-foreground">
          {t(lang, "ตัวละครในซีรีย์", "Series characters")}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1 text-xs font-normal">
            {t(lang, "กลุ่มผู้ชมเป้าหมาย", "Target audience")}:{" "}
            {targetAudienceRegionLabel}
          </Badge>
          {/* W2 "ตรวจจับ variant/แฝดตอนนี้" (plan: vertical-drama-twin-
          variant-completeness, F6) — manual on-demand trigger for the same
          detection `runImproveScriptJob` already runs automatically after a
          script-improve pass, so a user doesn't have to re-run improve-
          script just to pick up variants/twins from the current draft. Real
          LLM call (seconds, costs credits) — button carries its own
          `isPending` spinner rather than the shared `mutating` flag (see that
          flag's own doc comment). */}
          {!readOnly && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              disabled={detectVariantsMutation.isPending}
              aria-label={t(
                lang,
                "ตรวจจับ variant/แฝดตอนนี้",
                "Detect variants/twins now"
              )}
              title={t(
                lang,
                "สแกนเนื้อเรื่องปัจจุบันหา variant/แฝดใหม่ (ใช้ LLM จริง อาจใช้เวลาสักครู่)",
                "Scans the current story for new variants/twins (real LLM call, may take a moment)"
              )}
              onClick={() =>
                requestConfirmation({
                  title: t(
                    lang,
                    "ยืนยันตรวจจับ variant/แฝด",
                    "Confirm variant/twin detection"
                  ),
                  description: t(
                    lang,
                    "การทำงานนี้ใช้ LLM วิเคราะห์เรื่องและอาจหักเครดิต ต้องการดำเนินการต่อหรือไม่?",
                    "This uses an LLM to analyze the story and may spend credits. Continue?"
                  ),
                  confirmLabel: t(lang, "เริ่มตรวจจับ", "Start detection"),
                  cancelLabel: t(lang, "ยกเลิก", "Cancel"),
                  testId: "vd-credit-confirm-detect-variants",
                  onConfirm: () => detectVariantsMutation.mutate({ seriesId }),
                })
              }
            >
              {detectVariantsMutation.isPending ? (
                <Loader2
                  aria-hidden="true"
                  className="h-3.5 w-3.5 animate-spin"
                />
              ) : (
                <Wand2 aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              {t(lang, "ตรวจจับ variant/แฝด", "Detect variants/twins")}
            </Button>
          )}
        </div>
      </div>

      {/* Top-level 2-column layout (fix-round-4): the reference/import panel
          must start at the SAME vertical level as the character card grid,
          not below it — so the split is at the outermost level, not just
          around the "selected character detail" sub-section. The left
          column carries the manifest, character grid, detail, and
          add-character form; the right column is the sticky reference
          panel, matching Media Studio's own persistent-sidebar convention. */}
      <div
        className={cn(
          "grid gap-4",
          showReferencePanelColumn
            ? "md:grid-cols-[minmax(0,1fr)_320px]"
            : "md:grid-cols-1"
        )}
      >
        <div className="flex flex-col gap-4">
          {/* Manifest summary */}
          {manifest && (
            <Card>
              <CardContent className="flex flex-wrap items-center gap-4 py-3 text-sm">
                <span className="font-medium">
                  {t(lang, "แมนิเฟสต์สต็อก", "Stock manifest")}
                </span>
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                  {t(lang, "อนุมัติ", "Approved")}: {manifest.approvedCount}
                </span>
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Clock aria-hidden="true" className="h-4 w-4" />
                  {t(lang, "รอดำเนินการ", "Pending")}: {manifest.pendingCount}
                </span>
                <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                  <AlertTriangle aria-hidden="true" className="h-4 w-4" />
                  {t(lang, "ต้องรีเฟรช", "Stale")}: {manifest.staleCount}
                </span>
              </CardContent>
            </Card>
          )}

          {/* Roster: full-width responsive card grid — every character is visible
          and individually droppable at once (fix-round-3, Section A). Reuses
          the same breakpoint convention as `VerticalDramaContactSheetPicker.tsx`
          rather than inventing a new one. Click-to-select still drives the
          detail column below, but is no longer required to assign a
          reference — any visible card accepts a drop directly. */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-sm">
                  {t(lang, "ตัวละครในซีรีย์", "Series characters")}
                </CardTitle>
                {/* Set B (`vd-stuck-generation-and-lost-characters` plan) —
                additive filter chip, off by default (full roster still
                shown), only rendered when there's at least one row to jump
                to. */}
                {needsSetupCount > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant={showOnlyNeedsSetup ? "default" : "outline"}
                    className="gap-1.5 text-xs"
                    aria-pressed={showOnlyNeedsSetup}
                    onClick={() => setShowOnlyNeedsSetup(v => !v)}
                  >
                    {t(
                      lang,
                      `เฉพาะที่ต้องตั้งค่า (${needsSetupCount})`,
                      `Needs setup only (${needsSetupCount})`
                    )}
                  </Button>
                )}
                {!readOnly && repairableLegacyLookCount > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant={showOnlyLegacyLookRepairs ? "default" : "outline"}
                    className="gap-1.5 text-xs"
                    aria-pressed={showOnlyLegacyLookRepairs}
                    onClick={() => {
                      setShowOnlyLegacyLookRepairs(value => !value);
                      setShowOnlyNeedsSetup(false);
                    }}
                    title={t(
                      lang,
                      "แสดงตัวละครและลุคทั้งหมดที่สามารถส่งให้ AI จัดมาตรฐานใหม่ได้",
                      "Show all characters and looks that can be standardized by AI"
                    )}
                  >
                    <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
                    {t(
                      lang,
                      `ส่งให้ AI จัดมาตรฐาน (${repairableLegacyLookCount})`,
                      `Standardize with AI (${repairableLegacyLookCount})`
                    )}
                  </Button>
                )}
                {/* `vd-character-identity-repair` plan, Phase 3.4 —
                discoverable but not alarming: a plain outline button beside
                the needs-setup chip, not a badge/count (this is a proposal
                workflow, not something with an urgent number to surface). */}
                {!readOnly && characters.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs"
                    onClick={() => setIsMergeReviewOpen(true)}
                  >
                    <Merge aria-hidden="true" className="h-3.5 w-3.5" />
                    {t(lang, "รวมตัวละครซ้ำ", "Merge duplicates")}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-3">
              {characters.length === 0 ? (
                <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                  {t(lang, "ยังไม่มีตัวละคร", "No characters yet")}
                </p>
              ) : visibleRosterEntries.length === 0 ? (
                <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                  {t(
                    lang,
                    "ไม่มีตัวละครที่ต้องตั้งค่าแล้ว",
                    "No characters need setup anymore"
                  )}
                </p>
              ) : (
                <ul
                  className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                  aria-label={t(lang, "รายชื่อตัวละคร", "Character list")}
                >
                  {visibleRosterEntries.map(
                    ({
                      character: c,
                      variants,
                      shareFaceSourceName,
                    }: VdRosterEntry<VdCharacterListItem>) => {
                      const active = c.characterId === effectiveSelectedId;
                      const generatingThis = isImageGeneratingFor(
                        c.characterId
                      );
                      const generatingSheetThis = isSheetGeneratingFor(
                        c.characterId
                      );
                      const isDropTarget =
                        dragOverCharacterId === c.characterId;
                      const isAssigningThis =
                        assigningCharacterId === c.characterId;
                      const confirmingThisCharacterDelete =
                        confirmingDeleteCharacterId === c.characterId;
                      const deletingThisCharacter =
                        deleteCharacterMutation.isPending &&
                        deleteCharacterMutation.variables?.characterId ===
                          c.characterId;
                      const portraitAsset = getCharacterCardPortraitAsset(
                        c.characterId
                      );
                      const thumbnailUrl = portraitAsset?.thumbnailUrl ?? null;
                      const portraitAssetLinkId =
                        portraitAsset?.assetLinkId ?? null;
                      const confirmingThisPortraitDelete =
                        portraitAssetLinkId !== null &&
                        confirmingDeleteAssetLinkId === portraitAssetLinkId;
                      const deletingThisPortrait =
                        deleteAssetMutation.isPending &&
                        deleteAssetMutation.variables?.assetLinkId ===
                          portraitAssetLinkId;
                      return (
                        <li key={c.characterId}>
                          <div
                            className={cn(
                              "group relative flex flex-col gap-2 overflow-hidden rounded-lg border p-2.5 transition-colors",
                              active
                                ? "border-purple-400 bg-purple-50/60 ring-2 ring-purple-100"
                                : "border-border hover:border-muted-foreground/40",
                              isDropTarget &&
                                "border-sky-400 bg-sky-50/70 ring-2 ring-sky-200"
                            )}
                            onClick={() =>
                              setSelectedCharacterId(c.characterId)
                            }
                            onDragOver={event => {
                              if (readOnly) return;
                              event.preventDefault();
                              event.dataTransfer.dropEffect = "copy";
                              setDragOverCharacterId(c.characterId);
                            }}
                            onDragLeave={() =>
                              setDragOverCharacterId(prev =>
                                prev === c.characterId ? null : prev
                              )
                            }
                            onDrop={event => {
                              event.preventDefault();
                              setDragOverCharacterId(null);
                              if (readOnly) return;
                              const { input, error } =
                                readDroppedImageInput(event);
                              if (error) {
                                if (error.kind === "unsupported-file-type") {
                                  toast.error(
                                    t(
                                      lang,
                                      "รองรับเฉพาะไฟล์ภาพ",
                                      "Only image files are supported"
                                    )
                                  );
                                } else {
                                  toast.error(
                                    t(
                                      lang,
                                      `ไฟล์ภาพใหญ่เกินไป (สูงสุด ${Math.round(error.maxBytes / (1024 * 1024))}MB)`,
                                      `Image is too large (max ${Math.round(error.maxBytes / (1024 * 1024))}MB)`
                                    )
                                  );
                                }
                                return;
                              }
                              if (!input) {
                                toast.error(
                                  t(
                                    lang,
                                    "ไม่พบภาพที่ลากมา — ลองใหม่อีกครั้ง",
                                    "No draggable image found — please try again"
                                  )
                                );
                                return;
                              }
                              if (input.kind === "url") {
                                void assignDroppedReference(
                                  c.characterId,
                                  input.url
                                );
                              } else {
                                void readFileAsDataUrl(input.file).then(
                                  dataUrl =>
                                    assignDroppedReference(
                                      c.characterId,
                                      dataUrl
                                    )
                                );
                              }
                            }}
                          >
                            <div className="flex items-start gap-2.5">
                              {thumbnailUrl ? (
                                <div className="group/portrait relative shrink-0">
                                  <button
                                    type="button"
                                    aria-label={t(
                                      lang,
                                      `ดูภาพขยายของ ${c.name}`,
                                      `View full-size image of ${c.name}`
                                    )}
                                    onClick={event => {
                                      event.stopPropagation();
                                      setLightboxImage({
                                        src: thumbnailUrl,
                                        alt: c.name,
                                      });
                                    }}
                                    className="block rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
                                  >
                                    <AuthenticatedMediaImage
                                      src={thumbnailUrl}
                                      alt=""
                                      className="aspect-[9/16] w-28 rounded-md border border-border object-cover"
                                    />
                                  </button>
                                  {/* Card-level delete (2026-07-11): lets the
                                user clear the current portrait so the next
                                "regenerate" no longer identity-locks onto a
                                face they no longer want — previously delete
                                only existed buried in the side "Character
                                references" panel. Reuses the exact same
                                `deleteAssetMutation` +
                                `confirmingDeleteAssetLinkId` 2-step confirm
                                the side panel already uses; keyed by
                                `assetLinkId`, so it stays unambiguous even
                                though the state is shared across this card,
                                the variant chips below, and the side panel. */}
                                  {!readOnly &&
                                    portraitAssetLinkId &&
                                    (confirmingThisPortraitDelete ? (
                                      <div
                                        className="absolute right-1 top-1 flex items-center gap-1 rounded-md bg-background/95 p-1 shadow"
                                        onClick={event =>
                                          event.stopPropagation()
                                        }
                                      >
                                        <Button
                                          type="button"
                                          size="icon"
                                          variant="ghost"
                                          className="h-6 w-6"
                                          disabled={mutating}
                                          aria-label={t(
                                            lang,
                                            "ยกเลิก",
                                            "Cancel"
                                          )}
                                          title={t(lang, "ยกเลิก", "Cancel")}
                                          onClick={event => {
                                            event.stopPropagation();
                                            setConfirmingDeleteAssetLinkId(
                                              null
                                            );
                                          }}
                                        >
                                          <X
                                            aria-hidden="true"
                                            className="h-3.5 w-3.5"
                                          />
                                        </Button>
                                        <Button
                                          type="button"
                                          size="icon"
                                          variant="destructive"
                                          className="h-6 w-6"
                                          disabled={mutating}
                                          aria-label={t(
                                            lang,
                                            "ยืนยันลบภาพนี้",
                                            "Confirm delete this image"
                                          )}
                                          title={t(
                                            lang,
                                            "ยืนยันลบภาพนี้",
                                            "Confirm delete this image"
                                          )}
                                          onClick={event => {
                                            event.stopPropagation();
                                            setConfirmingDeleteAssetLinkId(
                                              null
                                            );
                                            deleteAssetMutation.mutate({
                                              seriesId,
                                              assetLinkId: portraitAssetLinkId,
                                            });
                                          }}
                                        >
                                          {deletingThisPortrait ? (
                                            <Loader2
                                              aria-hidden="true"
                                              className="h-3.5 w-3.5 animate-spin"
                                            />
                                          ) : (
                                            <Trash2
                                              aria-hidden="true"
                                              className="h-3.5 w-3.5"
                                            />
                                          )}
                                        </Button>
                                      </div>
                                    ) : (
                                      <Button
                                        type="button"
                                        size="icon"
                                        variant="secondary"
                                        className="absolute right-1 top-1 h-6 w-6 opacity-0 shadow transition-opacity group-hover/portrait:opacity-100 focus-visible:opacity-100"
                                        disabled={mutating}
                                        aria-label={t(
                                          lang,
                                          `ลบภาพตัวละครนี้ (${c.name})`,
                                          `Delete this character's image (${c.name})`
                                        )}
                                        title={t(
                                          lang,
                                          "ลบภาพตัวละครนี้",
                                          "Delete this character's image"
                                        )}
                                        onClick={event => {
                                          event.stopPropagation();
                                          setConfirmingDeleteAssetLinkId(
                                            portraitAssetLinkId
                                          );
                                        }}
                                      >
                                        <Trash2
                                          aria-hidden="true"
                                          className="h-3.5 w-3.5"
                                        />
                                      </Button>
                                    ))}
                                </div>
                              ) : (
                                <span className="flex aspect-[9/16] w-16 shrink-0 items-center justify-center rounded-md border border-dashed border-border/70 bg-muted/20 text-muted-foreground/70">
                                  <User
                                    aria-hidden="true"
                                    className="h-5 w-5"
                                  />
                                </span>
                              )}
                              <button
                                type="button"
                                aria-pressed={active}
                                aria-label={t(
                                  lang,
                                  `เลือกตัวละคร ${c.name}`,
                                  `Select character ${c.name}`
                                )}
                                onClick={() =>
                                  setSelectedCharacterId(c.characterId)
                                }
                                className="flex min-w-0 flex-1 flex-col gap-1 rounded-md pt-0.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
                              >
                                <span
                                  className={cn(
                                    "truncate text-sm",
                                    active ? "font-semibold" : "font-medium"
                                  )}
                                >
                                  {c.name}
                                </span>
                                {(getCanonicalRoleLabel(c.roleTier, lang) ||
                                  c.role) && (
                                  <Badge
                                    variant="outline"
                                    className="w-fit max-w-full whitespace-normal break-words text-left text-[10px]"
                                  >
                                    {getCanonicalRoleLabel(c.roleTier, lang) ??
                                      c.role}
                                  </Badge>
                                )}
                                {c.roleReviewStatus === "needs_role_review" && (
                                  <Badge
                                    variant="outline"
                                    className="w-fit max-w-full whitespace-normal break-words text-left border-amber-300 bg-amber-50 text-[10px] text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
                                  >
                                    {t(
                                      lang,
                                      "ต้องตรวจบทบาท",
                                      "Role review needed"
                                    )}
                                  </Badge>
                                )}
                                {/* Set B (`vd-stuck-generation-and-lost-
                              characters` plan) — distinct from the amber
                              role-review badge above: this one is driven by
                              `needsSetup`/`needsSetupReasons` (DNA/portrait
                              completeness), not `roleReviewStatus`, so the
                              two can independently show/hide. */}
                                {c.needsSetup && (
                                  <Badge
                                    variant="outline"
                                    className="w-fit max-w-full whitespace-normal break-words text-left border-fuchsia-300 bg-fuchsia-50 text-[10px] text-fuchsia-700 dark:border-fuchsia-800 dark:bg-fuchsia-950/30 dark:text-fuchsia-300"
                                  >
                                    {needsSetupBadgeLabel(
                                      lang,
                                      c.needsSetupReasons ?? []
                                    )}
                                  </Badge>
                                )}
                                {c.data?.source === "system_suggested_look" && (
                                  <Badge
                                    variant="outline"
                                    className="w-fit max-w-full whitespace-normal break-words text-left border-amber-300 bg-amber-50 text-[10px] text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
                                  >
                                    {t(
                                      lang,
                                      "ลุคใหม่ที่ระบบแนะนำจากช็อต",
                                      "Look suggested from a shot"
                                    )}
                                  </Badge>
                                )}
                                {c.data?.source === "system_suggested_look" &&
                                Array.isArray(
                                  c.data.suggestedFromShotNumbers
                                ) &&
                                c.data.suggestedFromShotNumbers.length > 0 ? (
                                  <span className="text-[10px] text-amber-700 dark:text-amber-300">
                                    {t(
                                      lang,
                                      `จากช็อต ${c.data.suggestedFromShotNumbers.join(", ")}`,
                                      `From shot(s) ${c.data.suggestedFromShotNumbers.join(", ")}`
                                    )}
                                  </span>
                                ) : null}
                                {/* Phase E — twin annotation: a character that
                              shares its face reference with another
                              (independent) character in the roster, e.g.
                              identical siblings. Omitted entirely if the
                              source character can't be resolved from the
                              current list rather than showing broken text. */}
                                {shareFaceSourceName && (
                                  <Badge
                                    variant="outline"
                                    className="w-fit max-w-full gap-1 border-sky-200 bg-sky-50 text-[10px] text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300"
                                  >
                                    <Users
                                      aria-hidden="true"
                                      className="h-3 w-3 shrink-0"
                                    />
                                    <span className="min-w-0 truncate">
                                      {t(
                                        lang,
                                        `ฝาแฝดกับ ${shareFaceSourceName}`,
                                        `Twin of ${shareFaceSourceName}`
                                      )}
                                    </span>
                                  </Badge>
                                )}
                                {/* Phase E — discoverability hint when this
                              character is a parent with variant looks
                              (outfit/age-stage rows nested below). */}
                                {variants.length > 0 && (
                                  <Badge
                                    variant="outline"
                                    className="w-fit max-w-full whitespace-normal break-words text-left text-[10px] text-muted-foreground"
                                  >
                                    {t(
                                      lang,
                                      `${variants.length} ลุค`,
                                      `${variants.length} looks`
                                    )}
                                  </Badge>
                                )}
                                {/* Per-character ethnicity/region override
                              (planning/vd-per-character-ethnicity/plan.md) —
                              ONE compact chip, only when explicitly set, so
                              a user scanning the roster can see at a glance
                              which characters are Thai/Western/etc. without
                              crowding the already-dense card (deliberately
                              not shown for the common unset case). */}
                                {(() => {
                                  const regionBadgeLabel =
                                    getCharacterRegionBadgeLabel(
                                      c.data as
                                        | Record<string, unknown>
                                        | null
                                        | undefined,
                                      lang
                                    );
                                  return regionBadgeLabel ? (
                                    <Badge
                                      variant="outline"
                                      className="w-fit max-w-full whitespace-normal break-words text-left text-[10px] text-muted-foreground"
                                    >
                                      {regionBadgeLabel}
                                    </Badge>
                                  ) : null;
                                })()}
                              </button>
                            </div>

                            {!readOnly &&
                            canRepairLegacyCharacterLook(c.data) ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="w-full gap-1.5 text-[11px]"
                                disabled={repairLegacyLookMutation.isPending}
                                aria-label={t(
                                  lang,
                                  `จัดมาตรฐานรายละเอียดของ ${c.name} ด้วย AI`,
                                  `Standardize ${c.name}'s look details with AI`
                                )}
                                title={t(
                                  lang,
                                  "ส่งข้อมูลตัวละครทั้งหมดให้ LLM ออกแบบรายละเอียดภาพใหม่ โดยคงใบหน้า รูปร่าง และอายุเดิม",
                                  "Send the complete character data to the LLM to redesign visual details while preserving face, body, and age"
                                )}
                                onClick={event => {
                                  event.stopPropagation();
                                  repairLegacyLookMutation.mutate({
                                    seriesId,
                                    characterId: c.characterId,
                                  });
                                }}
                                data-testid={`vd-repair-character-${c.characterId}`}
                              >
                                {repairLegacyLookMutation.isPending &&
                                repairLegacyLookMutation.variables
                                  ?.characterId === c.characterId ? (
                                  <Loader2
                                    aria-hidden="true"
                                    className="h-3 w-3 animate-spin"
                                  />
                                ) : (
                                  <Sparkles
                                    aria-hidden="true"
                                    className="h-3 w-3"
                                  />
                                )}
                                {t(
                                  lang,
                                  canRepairLegacyCharacterLook(c.data)
                                    ? "ซ่อมรายละเอียดด้วย AI"
                                    : "จัดมาตรฐานใหม่ด้วย AI",
                                  canRepairLegacyCharacterLook(c.data)
                                    ? "Repair details with AI"
                                    : "Redesign with AI"
                                )}
                              </Button>
                            ) : null}

                            {/* Phase E — variant chips: each row shares this
                          same person's identity but has its own portrait
                          (different outfit/age-stage look). Nested under the
                          parent's card instead of rendering as separate
                          top-level roster items. Clicking a chip reuses the
                          exact same selection call as clicking a top-level
                          card (`setSelectedCharacterId`), just
                          `stopPropagation`-ed so it doesn't also trigger the
                          parent card's own onClick. */}
                            {variants.length > 0 && (
                              <div
                                className="flex flex-wrap gap-1.5 border-t border-dashed border-border pt-2"
                                aria-label={t(
                                  lang,
                                  `ลุคของ ${c.name}`,
                                  `${c.name}'s looks`
                                )}
                              >
                                {variants.map(v => {
                                  const variantActive =
                                    v.characterId === effectiveSelectedId;
                                  const variantPortraitAsset =
                                    getCharacterCardPortraitAsset(
                                      v.characterId
                                    );
                                  const variantThumbnailUrl =
                                    variantPortraitAsset?.thumbnailUrl ?? null;
                                  const variantAssetLinkId =
                                    variantPortraitAsset?.assetLinkId ?? null;
                                  const confirmingThisVariantDelete =
                                    variantAssetLinkId !== null &&
                                    confirmingDeleteAssetLinkId ===
                                      variantAssetLinkId;
                                  const deletingThisVariant =
                                    deleteAssetMutation.isPending &&
                                    deleteAssetMutation.variables
                                      ?.assetLinkId === variantAssetLinkId;
                                  const variantLabel =
                                    v.variantLabel ??
                                    t(lang, "ตัวแปร", "Variant");
                                  const variantSummary =
                                    resolveCharacterLookSummary({
                                      data: v.data,
                                      variantLabel,
                                    });
                                  const variantPromptSummary =
                                    resolveCharacterLookPromptSummary({
                                      data: v.data,
                                    });
                                  const variantLookDesignStatus =
                                    v.data?.lookDesignStatus === "ready" ||
                                    v.data?.lookDesignStatus === "review"
                                      ? v.data.lookDesignStatus
                                      : undefined;
                                  const variantSlotPending =
                                    v.data?.slotStatus === "pending";
                                  const isVariantDropTarget =
                                    dragOverCharacterId === v.characterId;
                                  const confirmingThisVariantCharacterDelete =
                                    confirmingDeleteCharacterId ===
                                    v.characterId;
                                  const deletingThisVariantCharacter =
                                    deleteCharacterMutation.isPending &&
                                    deleteCharacterMutation.variables
                                      ?.characterId === v.characterId;
                                  /* Open the per-look re-render dialog
                                (`planning/vd-look-image-not-replace-primary/
                                plan.md` §4C). Shared by the pencil badge ON
                                the look image and the chip's own generate
                                button — the badge exists because the chip
                                button alone was a 20px unlabeled icon that
                                nobody read as "edit this look's image". */
                                  const openLookRenderDialogForVariant = () => {
                                    if (!requireModelSelected()) return;
                                    if (!requireMcpConnectionOrToast()) return;
                                    if (!requireHermesConnectionOrToast())
                                      return;
                                    const parentPortraitAsset =
                                      getCharacterCardPortraitAsset(
                                        c.characterId
                                      );
                                    // Keep this field independent from the
                                    // persisted look prompt. Generate uses the
                                    // saved prompt as its canonical source on
                                    // the server; this textarea is only an
                                    // optional one-off addition for this image.
                                    setLookRenderInstruction("");
                                    setLookRenderReferenceChoice("auto");
                                    setLookRenderDialog({
                                      lookCharacterId: v.characterId,
                                      lookLabel: variantLabel,
                                      promptSummary:
                                        variantPromptSummary ?? null,
                                      baseCharacterName: c.name,
                                      primaryAssetLinkId:
                                        parentPortraitAsset?.assetLinkId ??
                                        null,
                                      primaryThumbnailUrl:
                                        parentPortraitAsset?.thumbnailUrl ??
                                        null,
                                      lookAssetLinkId: variantAssetLinkId,
                                      lookThumbnailUrl: variantThumbnailUrl,
                                    });
                                  };
                                  const openLookPromptEditorForVariant = () => {
                                    if (readOnly) return;
                                    const originalPrompt =
                                      resolveCharacterLookPrompt(v.data);
                                    setLookPromptInput(originalPrompt);
                                    setLookPromptDialog({
                                      characterId: v.characterId,
                                      characterName: c.name,
                                      lookLabel: variantLabel,
                                      originalPrompt,
                                    });
                                  };
                                  return (
                                    /* Card-level image controls (2026-07-11):
                                  a variant chip used to be ONE `<button>`
                                  covering the whole pill (thumbnail + label)
                                  that only selected the look. It now needs
                                  its OWN nested interactive controls
                                  (expand, delete) on the thumbnail plus a
                                  separately focusable "select" affordance —
                                  real `<button>`s can't nest, so this
                                  outermost element is a plain `<div>` (mouse
                                  convenience `onClick` for background/gap
                                  clicks, stopPropagation-ed away by every
                                  nested control) with the real keyboard-
                                  reachable "select this look" affordance
                                  living on the label `<button>` below —
                                  mirrors how the main portrait above already
                                  splits "view image" and "select character"
                                  into sibling buttons instead of one. */
                                    <div
                                      key={v.characterId}
                                      className={cn(
                                        "group/variant relative flex w-full min-w-0 items-start gap-2 rounded-lg border bg-muted/20 p-1.5 transition-colors",
                                        variantActive
                                          ? "border-purple-400 bg-purple-50/60 ring-1 ring-purple-100"
                                          : "border-border hover:border-muted-foreground/40",
                                        isVariantDropTarget &&
                                          "border-sky-400 bg-sky-50/70 ring-2 ring-sky-200"
                                      )}
                                      onClick={() =>
                                        setSelectedCharacterId(v.characterId)
                                      }
                                      onDragOver={event => {
                                        if (readOnly) return;
                                        event.preventDefault();
                                        event.stopPropagation();
                                        event.dataTransfer.dropEffect = "copy";
                                        setDragOverCharacterId(v.characterId);
                                      }}
                                      onDragLeave={event => {
                                        event.stopPropagation();
                                        setDragOverCharacterId(prev =>
                                          prev === v.characterId ? null : prev
                                        );
                                      }}
                                      onDrop={event => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        setDragOverCharacterId(null);
                                        if (readOnly) return;
                                        const { input, error } =
                                          readDroppedImageInput(event);
                                        if (error) {
                                          if (
                                            error.kind ===
                                            "unsupported-file-type"
                                          ) {
                                            toast.error(
                                              t(
                                                lang,
                                                "รองรับเฉพาะไฟล์ภาพ",
                                                "Only image files are supported"
                                              )
                                            );
                                          } else {
                                            toast.error(
                                              t(
                                                lang,
                                                `ไฟล์ภาพใหญ่เกินไป (สูงสุด ${Math.round(error.maxBytes / (1024 * 1024))}MB)`,
                                                `Image is too large (max ${Math.round(error.maxBytes / (1024 * 1024))}MB)`
                                              )
                                            );
                                          }
                                          return;
                                        }
                                        if (!input) {
                                          toast.error(
                                            t(
                                              lang,
                                              "ไม่พบภาพที่ลากมา — ลองใหม่อีกครั้ง",
                                              "No draggable image found — please try again"
                                            )
                                          );
                                          return;
                                        }
                                        if (input.kind === "url") {
                                          void assignDroppedReference(
                                            v.characterId,
                                            input.url
                                          );
                                        } else {
                                          void readFileAsDataUrl(
                                            input.file
                                          ).then(dataUrl =>
                                            assignDroppedReference(
                                              v.characterId,
                                              dataUrl
                                            )
                                          );
                                        }
                                      }}
                                    >
                                      <div className="relative shrink-0">
                                        {variantThumbnailUrl ? (
                                          <button
                                            type="button"
                                            aria-label={t(
                                              lang,
                                              `ดูภาพขยายลุค ${variantLabel} ของ ${c.name}`,
                                              `View full-size image of ${c.name}'s ${variantLabel} look`
                                            )}
                                            onClick={event => {
                                              event.stopPropagation();
                                              setLightboxImage({
                                                src: variantThumbnailUrl,
                                                alt: variantLabel,
                                              });
                                            }}
                                            className="block rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
                                          >
                                            <AuthenticatedMediaImage
                                              src={variantThumbnailUrl}
                                              alt=""
                                              className="aspect-[9/16] h-20 w-14 shrink-0 rounded object-cover"
                                            />
                                          </button>
                                        ) : (
                                          <span className="flex aspect-[9/16] h-20 w-14 shrink-0 items-center justify-center rounded border border-dashed border-border text-muted-foreground">
                                            <User
                                              aria-hidden="true"
                                              className="h-5 w-5"
                                            />
                                          </span>
                                        )}
                                        {/* Always-visible "edit this look's
                                      image" badge, sitting ON the image where
                                      users look for it. Opens the same
                                      re-render dialog as the chip's generate
                                      button. */}
                                        {!readOnly && (
                                          <button
                                            type="button"
                                            disabled={
                                              mutating ||
                                              isImageGeneratingFor(
                                                v.characterId
                                              )
                                            }
                                            aria-label={t(
                                              lang,
                                              `แก้ไข/สร้างภาพใหม่ของลุค ${variantLabel}`,
                                              `Edit / regenerate the ${variantLabel} look image`
                                            )}
                                            title={t(
                                              lang,
                                              "แก้ไขภาพลุคนี้ — พิมพ์บรรยายภาพใหม่ + เลือกภาพอ้างอิง",
                                              "Edit this look's image — describe the new image + pick a reference"
                                            )}
                                            onClick={event => {
                                              event.stopPropagation();
                                              openLookRenderDialogForVariant();
                                            }}
                                            className="absolute -bottom-1 -left-1 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-md hover:bg-muted disabled:opacity-50"
                                            data-testid={`vd-look-edit-image-${v.characterId}`}
                                          >
                                            {isImageGeneratingFor(
                                              v.characterId
                                            ) ? (
                                              <Loader2
                                                aria-hidden="true"
                                                className="h-3 w-3 animate-spin"
                                              />
                                            ) : (
                                              <Pencil
                                                aria-hidden="true"
                                                className="h-3 w-3"
                                              />
                                            )}
                                          </button>
                                        )}
                                        {!readOnly &&
                                          variantAssetLinkId &&
                                          (confirmingThisVariantDelete ? (
                                            <div
                                              className="absolute -right-1 -top-1 z-10 flex items-center gap-0.5 rounded border border-border bg-background p-0.5 shadow-md"
                                              onClick={event =>
                                                event.stopPropagation()
                                              }
                                            >
                                              <Button
                                                type="button"
                                                size="icon"
                                                variant="ghost"
                                                className="h-5 w-5"
                                                disabled={mutating}
                                                aria-label={t(
                                                  lang,
                                                  "ยกเลิก",
                                                  "Cancel"
                                                )}
                                                title={t(
                                                  lang,
                                                  "ยกเลิก",
                                                  "Cancel"
                                                )}
                                                onClick={event => {
                                                  event.stopPropagation();
                                                  setConfirmingDeleteAssetLinkId(
                                                    null
                                                  );
                                                }}
                                              >
                                                <X
                                                  aria-hidden="true"
                                                  className="h-3 w-3"
                                                />
                                              </Button>
                                              <Button
                                                type="button"
                                                size="icon"
                                                variant="destructive"
                                                className="h-5 w-5"
                                                disabled={mutating}
                                                aria-label={t(
                                                  lang,
                                                  "ยืนยันลบภาพนี้",
                                                  "Confirm delete this image"
                                                )}
                                                title={t(
                                                  lang,
                                                  "ยืนยันลบภาพนี้",
                                                  "Confirm delete this image"
                                                )}
                                                onClick={event => {
                                                  event.stopPropagation();
                                                  setConfirmingDeleteAssetLinkId(
                                                    null
                                                  );
                                                  deleteAssetMutation.mutate({
                                                    seriesId,
                                                    assetLinkId:
                                                      variantAssetLinkId,
                                                  });
                                                }}
                                              >
                                                {deletingThisVariant ? (
                                                  <Loader2
                                                    aria-hidden="true"
                                                    className="h-3 w-3 animate-spin"
                                                  />
                                                ) : (
                                                  <Trash2
                                                    aria-hidden="true"
                                                    className="h-3 w-3"
                                                  />
                                                )}
                                              </Button>
                                            </div>
                                          ) : (
                                            <Button
                                              type="button"
                                              size="icon"
                                              variant="secondary"
                                              className="absolute -right-1 -top-1 h-5 w-5 opacity-0 shadow transition-opacity group-hover/variant:opacity-100 focus-visible:opacity-100"
                                              disabled={mutating}
                                              aria-label={t(
                                                lang,
                                                `ลบภาพลุค ${variantLabel} ของ ${c.name}`,
                                                `Delete ${c.name}'s ${variantLabel} look image`
                                              )}
                                              title={t(
                                                lang,
                                                "ลบภาพลุคนี้",
                                                "Delete this look's image"
                                              )}
                                              onClick={event => {
                                                event.stopPropagation();
                                                setConfirmingDeleteAssetLinkId(
                                                  variantAssetLinkId
                                                );
                                              }}
                                            >
                                              <Trash2
                                                aria-hidden="true"
                                                className="h-3 w-3"
                                              />
                                            </Button>
                                          ))}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <button
                                          type="button"
                                          aria-pressed={variantActive}
                                          aria-label={t(
                                            lang,
                                            `เลือกลุค ${variantLabel} ของ ${c.name}`,
                                            `Select ${c.name}'s ${variantLabel} look`
                                          )}
                                          title={variantLabel}
                                          onClick={event => {
                                            event.stopPropagation();
                                            setSelectedCharacterId(
                                              v.characterId
                                            );
                                          }}
                                          className="block w-full min-w-0 rounded text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
                                        >
                                          <span
                                            className={cn(
                                              "block truncate whitespace-nowrap text-xs leading-snug",
                                              variantActive
                                                ? "font-semibold"
                                                : "font-medium"
                                            )}
                                          >
                                            {variantLabel}
                                          </span>
                                          {variantSummary ? (
                                            <span className="mt-1 block truncate whitespace-nowrap text-[10px] leading-snug text-muted-foreground">
                                              {variantSummary}
                                            </span>
                                          ) : null}
                                          <span className="mt-1 flex min-w-0 items-center gap-1 overflow-hidden">
                                            <Badge
                                              variant="secondary"
                                              className="shrink-0 px-1.5 py-0 text-[9px] font-normal"
                                            >
                                              {v.variantType === "age_stage"
                                                ? t(
                                                    lang,
                                                    "ช่วงวัย",
                                                    "Age stage"
                                                  )
                                                : t(lang, "ชุด", "Outfit")}
                                            </Badge>
                                            {variantLookDesignStatus ? (
                                              <Badge
                                                variant="outline"
                                                className="shrink-0 px-1.5 py-0 text-[9px] font-normal"
                                              >
                                                {variantLookDesignStatus ===
                                                "ready"
                                                  ? t(lang, "พร้อมใช้", "Ready")
                                                  : t(
                                                      lang,
                                                      "ตรวจสอบ",
                                                      "Review"
                                                    )}
                                              </Badge>
                                            ) : null}
                                          </span>
                                        </button>
                                        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
                                          {!readOnly ? (
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant="outline"
                                              className="h-6 gap-1 px-1.5 text-[10px]"
                                              aria-label={t(
                                                lang,
                                                `แก้ไข prompt ลุค ${variantLabel}`,
                                                `Edit ${variantLabel} look prompt`
                                              )}
                                              title={t(
                                                lang,
                                                "แก้ไขรายละเอียด prompt เต็มของลุค",
                                                "Edit the full look prompt"
                                              )}
                                              onClick={event => {
                                                event.stopPropagation();
                                                openLookPromptEditorForVariant();
                                              }}
                                              data-testid={`vd-edit-look-prompt-${v.characterId}`}
                                            >
                                              <Pencil
                                                aria-hidden="true"
                                                className="h-3 w-3"
                                              />
                                              {t(
                                                lang,
                                                "แก้ไข prompt",
                                                "Edit prompt"
                                              )}
                                            </Button>
                                          ) : null}
                                          {variantSlotPending ? (
                                            <Badge
                                              variant="secondary"
                                              className="text-[9px]"
                                            >
                                              {t(
                                                lang,
                                                "รอสร้างลุคจาก Tie-in",
                                                "Tie-in look slot pending"
                                              )}
                                            </Badge>
                                          ) : null}
                                          {!readOnly &&
                                          canRepairLegacyCharacterLook(
                                            v.data
                                          ) ? (
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant="outline"
                                              className="h-6 shrink-0 px-1.5 text-[10px]"
                                              disabled={
                                                repairLegacyLookMutation.isPending
                                              }
                                              aria-label={t(
                                                lang,
                                                `ซ่อมรายละเอียดลุค ${variantLabel} ด้วย AI`,
                                                `Repair ${variantLabel} look details with AI`
                                              )}
                                              title={t(
                                                lang,
                                                canRepairLegacyCharacterLook(
                                                  v.data
                                                )
                                                  ? "แปลงข้อความจากบทให้เป็นรายละเอียดเสื้อผ้า ผม รองเท้า และเครื่องประดับ โดยคงตัวละครเดิม"
                                                  : "เรียก LLM ใหม่เพื่อจัดมาตรฐานชุด ผม รองเท้า และเครื่องประดับ โดยคงตัวละครเดิม",
                                                canRepairLegacyCharacterLook(
                                                  v.data
                                                )
                                                  ? "Convert episode evidence into outfit, hair, footwear, and accessory details while preserving the same character"
                                                  : "Ask the LLM to redesign the outfit, hair, footwear, and accessories while preserving the same character"
                                              )}
                                              onClick={event => {
                                                event.stopPropagation();
                                                repairLegacyLookMutation.mutate(
                                                  {
                                                    seriesId,
                                                    characterId: v.characterId,
                                                  }
                                                );
                                              }}
                                              data-testid={`vd-repair-look-${v.characterId}`}
                                            >
                                              {repairLegacyLookMutation.isPending &&
                                              repairLegacyLookMutation.variables
                                                ?.characterId ===
                                                v.characterId ? (
                                                <Loader2
                                                  aria-hidden="true"
                                                  className="mr-1 h-3 w-3 animate-spin"
                                                />
                                              ) : (
                                                <Sparkles
                                                  aria-hidden="true"
                                                  className="mr-1 h-3 w-3"
                                                />
                                              )}
                                              {t(
                                                lang,
                                                canRepairLegacyCharacterLook(
                                                  v.data
                                                )
                                                  ? "ซ่อมด้วย AI"
                                                  : "จัดมาตรฐานใหม่ด้วย AI",
                                                canRepairLegacyCharacterLook(
                                                  v.data
                                                )
                                                  ? "Repair with AI"
                                                  : "Redesign with AI"
                                              )}
                                            </Button>
                                          ) : null}
                                          {/* `planning/vd-character-look-one-step-
                                    flow/plan.md` (2026-07-17) — per-look
                                    generate/regenerate affordance: the modal
                                    already auto-fires this on submit when it
                                    safely can, but this chip button is the
                                    retry path for whenever it couldn't (no
                                    model, no parent portrait yet at the time)
                                    plus ordinary regeneration afterward.

                                    `planning/vd-look-image-not-replace-primary
                                    /plan.md` §4C — it now opens the per-look
                                    re-render dialog instead of firing blind,
                                    so the user can type a fresh image brief
                                    and choose WHICH image conditions the
                                    render (the base character's primary, or
                                    this look's own current image). The dialog
                                    ends at the same guard functions + direct
                                    generation call as the roster card's "auto"
                                    shortcuts — still never the preview
                                    wizard. */}
                                          {!readOnly && (
                                            <Button
                                              type="button"
                                              size="icon"
                                              variant="ghost"
                                              className="h-5 w-5 shrink-0"
                                              disabled={
                                                mutating ||
                                                isImageGeneratingFor(
                                                  v.characterId
                                                ) ||
                                                !selectedImageModelId
                                              }
                                              aria-label={t(
                                                lang,
                                                `สร้างภาพลุค ${variantLabel} ของ ${c.name}`,
                                                `Generate ${c.name}'s ${variantLabel} look image`
                                              )}
                                              title={
                                                selectedImageModelId
                                                  ? t(
                                                      lang,
                                                      "แก้ไข/สร้างภาพลุคใหม่",
                                                      "Edit / regenerate look image"
                                                    )
                                                  : t(
                                                      lang,
                                                      "เลือกโมเดลภาพก่อนสร้าง",
                                                      "Select an image model first"
                                                    )
                                              }
                                              onClick={event => {
                                                event.stopPropagation();
                                                openLookRenderDialogForVariant();
                                              }}
                                            >
                                              {isImageGeneratingFor(
                                                v.characterId
                                              ) ? (
                                                <Loader2
                                                  aria-hidden="true"
                                                  className="h-3 w-3 animate-spin"
                                                />
                                              ) : (
                                                <ImagePlus
                                                  aria-hidden="true"
                                                  className="h-3 w-3"
                                                />
                                              )}
                                            </Button>
                                          )}
                                          {/* W2 delete-CHARACTER for this variant
                                    row (distinct from the portrait-image
                                    delete on the thumbnail above) — same
                                    2-step inline confirm convention as the
                                    top-level card's own delete-character
                                    button. */}
                                          {confirmingThisVariantCharacterDelete ? (
                                            <div
                                              className="flex shrink-0 items-center gap-0.5"
                                              onClick={event =>
                                                event.stopPropagation()
                                              }
                                            >
                                              <Button
                                                type="button"
                                                size="icon"
                                                variant="ghost"
                                                className="h-5 w-5"
                                                disabled={mutating}
                                                aria-label={t(
                                                  lang,
                                                  "ยกเลิก",
                                                  "Cancel"
                                                )}
                                                title={t(
                                                  lang,
                                                  "ยกเลิก",
                                                  "Cancel"
                                                )}
                                                onClick={() =>
                                                  setConfirmingDeleteCharacterId(
                                                    null
                                                  )
                                                }
                                              >
                                                <X
                                                  aria-hidden="true"
                                                  className="h-3 w-3"
                                                />
                                              </Button>
                                              <Button
                                                type="button"
                                                size="icon"
                                                variant="destructive"
                                                className="h-5 w-5"
                                                disabled={mutating}
                                                aria-label={t(
                                                  lang,
                                                  `ยืนยันลบลุค ${variantLabel} ของ ${c.name}`,
                                                  `Confirm delete ${c.name}'s ${variantLabel} look`
                                                )}
                                                title={t(
                                                  lang,
                                                  "ยืนยันลบลุคนี้ทั้งตัว",
                                                  "Confirm delete this look"
                                                )}
                                                onClick={() => {
                                                  setConfirmingDeleteCharacterId(
                                                    null
                                                  );
                                                  deleteCharacterMutation.mutate(
                                                    {
                                                      seriesId,
                                                      characterId:
                                                        v.characterId,
                                                    }
                                                  );
                                                }}
                                              >
                                                {deletingThisVariantCharacter ? (
                                                  <Loader2
                                                    aria-hidden="true"
                                                    className="h-3 w-3 animate-spin"
                                                  />
                                                ) : (
                                                  <Trash2
                                                    aria-hidden="true"
                                                    className="h-3 w-3"
                                                  />
                                                )}
                                              </Button>
                                            </div>
                                          ) : (
                                            <Button
                                              type="button"
                                              size="icon"
                                              variant="ghost"
                                              className="h-5 w-5 shrink-0 opacity-0 transition-opacity group-hover/variant:opacity-100 focus-visible:opacity-100"
                                              disabled={mutating}
                                              aria-label={t(
                                                lang,
                                                `ลบลุค ${variantLabel} ของ ${c.name}`,
                                                `Delete ${c.name}'s ${variantLabel} look`
                                              )}
                                              title={t(
                                                lang,
                                                "ลบลุคนี้ทั้งตัว",
                                                "Delete this look"
                                              )}
                                              onClick={event => {
                                                event.stopPropagation();
                                                setConfirmingDeleteCharacterId(
                                                  v.characterId
                                                );
                                              }}
                                            >
                                              <Trash2
                                                aria-hidden="true"
                                                className="h-3 w-3"
                                              />
                                            </Button>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {!readOnly && (
                              <div className="flex flex-wrap items-center justify-end gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="w-full justify-center text-xs"
                                  aria-label={t(
                                    lang,
                                    "ไปยัง สร้างและแก้ไขตัวละคร",
                                    "Go to create and edit character"
                                  )}
                                  data-testid={`vd-character-editor-jump-${c.characterId}`}
                                  onClick={event => {
                                    event.stopPropagation();
                                    jumpToCharacterEditor(c.characterId);
                                  }}
                                >
                                  {t(
                                    lang,
                                    "ไปยัง สร้างและแก้ไขตัวละคร",
                                    "Go to create and edit character"
                                  )}
                                </Button>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 shrink-0"
                                  disabled={
                                    mutating ||
                                    generatingThis ||
                                    !selectedImageModelId
                                  }
                                  aria-label={t(
                                    lang,
                                    "สร้างภาพตัวละคร",
                                    "Generate character image"
                                  )}
                                  title={
                                    selectedImageModelId
                                      ? t(
                                          lang,
                                          "สร้างภาพตัวละคร",
                                          "Generate character image"
                                        )
                                      : t(
                                          lang,
                                          "เลือกโมเดลภาพก่อนสร้าง",
                                          "Select an image model first"
                                        )
                                  }
                                  onClick={() =>
                                    startCharacterPromptPreview(c.characterId)
                                  }
                                >
                                  {generatingThis ? (
                                    <Loader2
                                      aria-hidden="true"
                                      className="h-3.5 w-3.5 animate-spin"
                                    />
                                  ) : (
                                    <Sparkles
                                      aria-hidden="true"
                                      className="h-3.5 w-3.5"
                                    />
                                  )}
                                </Button>
                                {/* Roster-card "auto" shortcut (vertical-drama-
                              character-sheet-consolidation plan, Phase C):
                              fires the merged `generateSheetMutation`
                              directly with `sheetType: "auto"` (today's
                              default turnaround behavior) — no room for a
                              14-option dropdown on a small card, and no
                              preview step (matches how the unified detail-
                              panel button below also skips preview). Open
                              the detail panel via the card itself to pick a
                              specific format instead. */}
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 shrink-0"
                                  disabled={
                                    mutating ||
                                    generatingSheetThis ||
                                    !selectedImageModelId
                                  }
                                  aria-label={t(
                                    lang,
                                    "สร้างชีทตัวละคร (อัตโนมัติ)",
                                    "Generate character sheet (auto)"
                                  )}
                                  title={
                                    selectedImageModelId
                                      ? t(
                                          lang,
                                          "สร้างชีทตัวละคร (อัตโนมัติ) — เข้าไปในแผงรายละเอียดเพื่อเลือกรูปแบบอื่น",
                                          "Generate character sheet (auto) — open the detail panel to pick a specific format"
                                        )
                                      : t(
                                          lang,
                                          "เลือกโมเดลภาพก่อนสร้าง",
                                          "Select an image model first"
                                        )
                                  }
                                  onClick={() => {
                                    if (!requireModelSelected()) return;
                                    if (!requireMcpConnectionOrToast()) return;
                                    if (!requireHermesConnectionOrToast())
                                      return;
                                    confirmCharacterCreditAction(
                                      c.characterId,
                                      t(
                                        lang,
                                        "ยืนยันสร้างชีทตัวละคร",
                                        "Confirm character sheet generation"
                                      ),
                                      t(
                                        lang,
                                        "การสร้างชีทตัวละครใช้ AI และอาจหักเครดิต ต้องการดำเนินการต่อหรือไม่?",
                                        "Generating a character sheet uses AI and may spend credits. Continue?"
                                      ),
                                      t(lang, "สร้างชีท", "Generate sheet"),
                                      () =>
                                        generateSheetMutation.mutate({
                                          seriesId,
                                          characterId: c.characterId,
                                          sheetType: "auto",
                                          sheetLanguage,
                                          ...(selectedEditImageModelId
                                            ? { selectedEditImageModelId }
                                            : {}),
                                          // Always sent — see the matching comment
                                          // on `generatePortraitCandidateBatchMutation.mutate`
                                          // above for why the conditional spread was
                                          // removed.
                                          selectedImageModelId,
                                          ...(imageModelUsesMcp &&
                                          mcpConnectionId
                                            ? { mcpConnectionId }
                                            : {}),
                                          ...(imageModelUsesMcp &&
                                          mcpConnectionId &&
                                          mcpSharedGroupId != null
                                            ? {
                                                sharedGroupId: mcpSharedGroupId,
                                              }
                                            : {}),
                                          ...(imageModelUsesHermes &&
                                          hermesConnectionId
                                            ? { hermesConnectionId }
                                            : {}),
                                        })
                                    );
                                  }}
                                >
                                  {generatingSheetThis ? (
                                    <Loader2
                                      aria-hidden="true"
                                      className="h-3.5 w-3.5 animate-spin"
                                    />
                                  ) : (
                                    <Grid3x3
                                      aria-hidden="true"
                                      className="h-3.5 w-3.5"
                                    />
                                  )}
                                </Button>
                                {/* W2 "เพิ่มลุค" (plan: vertical-drama-twin-
                              variant-completeness, F6) — only on BASE
                              characters (no `sharesFaceWithCharacterId`;
                              `c.parentCharacterId` is always unset here since
                              `buildCharacterRosterEntries` already filters
                              variant rows out of the top-level list). */}
                                {!c.sharesFaceWithCharacterId && (
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 shrink-0"
                                    disabled={mutating}
                                    aria-label={t(
                                      lang,
                                      `เพิ่มลุคให้ ${c.name}`,
                                      `Add a look for ${c.name}`
                                    )}
                                    title={t(lang, "เพิ่มลุค", "Add look")}
                                    onClick={() =>
                                      openVariantDialog({
                                        characterId: c.characterId,
                                        name: c.name,
                                      })
                                    }
                                  >
                                    <Shirt
                                      aria-hidden="true"
                                      className="h-3.5 w-3.5"
                                    />
                                  </Button>
                                )}
                                {/* W2 delete-CHARACTER (distinct from the
                              portrait-image delete button above this card's
                              thumbnail) — 2-step inline confirm, same
                              convention as `confirmingDeleteAssetLinkId`.
                              Available on every top-level card (base
                              characters AND twins); `deleteCharacter` itself
                              throws `PRECONDITION_FAILED` (surfaced via the
                              shared `onError` toast) when this character
                              still has variants/twins pointing at it. */}
                                {confirmingThisCharacterDelete ? (
                                  <>
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7 shrink-0"
                                      disabled={mutating}
                                      aria-label={t(lang, "ยกเลิก", "Cancel")}
                                      title={t(lang, "ยกเลิก", "Cancel")}
                                      onClick={() =>
                                        setConfirmingDeleteCharacterId(null)
                                      }
                                    >
                                      <X
                                        aria-hidden="true"
                                        className="h-3.5 w-3.5"
                                      />
                                    </Button>
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="destructive"
                                      className="h-7 w-7 shrink-0"
                                      disabled={mutating}
                                      aria-label={t(
                                        lang,
                                        `ยืนยันลบตัวละคร ${c.name}`,
                                        `Confirm delete character ${c.name}`
                                      )}
                                      title={t(
                                        lang,
                                        "ยืนยันลบตัวละครนี้ทั้งตัว",
                                        "Confirm delete this character"
                                      )}
                                      onClick={() => {
                                        setConfirmingDeleteCharacterId(null);
                                        deleteCharacterMutation.mutate({
                                          seriesId,
                                          characterId: c.characterId,
                                        });
                                      }}
                                    >
                                      {deletingThisCharacter ? (
                                        <Loader2
                                          aria-hidden="true"
                                          className="h-3.5 w-3.5 animate-spin"
                                        />
                                      ) : (
                                        <Trash2
                                          aria-hidden="true"
                                          className="h-3.5 w-3.5"
                                        />
                                      )}
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 shrink-0"
                                    disabled={mutating}
                                    aria-label={t(
                                      lang,
                                      `ลบตัวละคร ${c.name}`,
                                      `Delete character ${c.name}`
                                    )}
                                    title={t(
                                      lang,
                                      "ลบตัวละครนี้ทั้งตัว",
                                      "Delete this character"
                                    )}
                                    onClick={() =>
                                      setConfirmingDeleteCharacterId(
                                        c.characterId
                                      )
                                    }
                                  >
                                    <Trash2
                                      aria-hidden="true"
                                      className="h-3.5 w-3.5"
                                    />
                                  </Button>
                                )}
                              </div>
                            )}

                            {/* Optional "additional details" hint for the
                          portrait generate button above — compact single-line
                          input since the roster card is narrow (`sm:grid-
                          cols-2 lg:grid-cols-3`, no room for a multi-row
                          textarea; the wider detail panel below gets a full
                          Textarea instead). Keyed by characterId so typing in
                          one card never leaks into another's field (see
                          `customInstructionByCharacter` doc comment).
                          planning/vertical-drama-character-custom-
                          instruction/plan.md */}
                            {!readOnly && (
                              <Input
                                value={
                                  customInstructionByCharacter[c.characterId] ??
                                  ""
                                }
                                onChange={e =>
                                  setCustomInstructionByCharacter(prev => ({
                                    ...prev,
                                    [c.characterId]: e.target.value,
                                  }))
                                }
                                maxLength={500}
                                className="h-7 text-xs"
                                placeholder={t(
                                  lang,
                                  VD_COPY.th
                                    .characterCustomInstructionPlaceholder,
                                  VD_COPY.en
                                    .characterCustomInstructionPlaceholder
                                )}
                                aria-label={t(
                                  lang,
                                  VD_COPY.th.characterCustomInstructionLabel,
                                  VD_COPY.en.characterCustomInstructionLabel
                                )}
                              />
                            )}

                            {/* Rendered here only when this card's character is NOT the
                          currently-selected one — the detail column below has
                          its own copy (more width) for the selected character,
                          so this avoids showing the same confirmation twice. */}
                            {pendingCharacterPromptPreview &&
                              pendingCharacterPromptPreview.characterId ===
                                c.characterId &&
                              effectiveSelectedId !== c.characterId && (
                                <MediaPromptPreview
                                  prompt={
                                    pendingCharacterPromptPreview.portraitPrompt
                                  }
                                  skillName={t(
                                    lang,
                                    "สร้างภาพตัวละคร",
                                    "Generate character image"
                                  )}
                                  skillCategory="image_generation"
                                  mediaParams={{
                                    ...(pendingCharacterPromptPreview.model
                                      ? {
                                          model:
                                            pendingCharacterPromptPreview.model,
                                        }
                                      : {}),
                                    ...(pendingCharacterPromptPreview.negativePrompt
                                      ? {
                                          negativePrompt:
                                            pendingCharacterPromptPreview.negativePrompt,
                                        }
                                      : {}),
                                  }}
                                  isExecuting={generateImageMutation.isPending}
                                  onConfirm={handleCharacterPromptConfirm}
                                  onCancel={handleCharacterPromptCancel}
                                />
                              )}

                            {pendingCharacterPromptPreview &&
                              pendingCharacterPromptPreview.characterId ===
                                c.characterId &&
                              effectiveSelectedId !== c.characterId && (
                                <PortraitLeadBeautyWarnings
                                  warnings={
                                    pendingCharacterPromptPreview.warnings
                                  }
                                  heading={t(
                                    lang,
                                    "AI ยอมรับ prompt นี้แม้ตัวนำยังดูธรรมดาไปหน่อย — แก้ prompt หรือสร้างใหม่ได้ถ้าอยากให้เด่นกว่านี้",
                                    "AI accepted this prompt even though the lead reads a little plain — edit the prompt or regenerate for a more camera-ready look."
                                  )}
                                />
                              )}

                            {(isDropTarget || isAssigningThis) && (
                              <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-white/80 px-2 text-center text-xs font-medium text-sky-700">
                                {isAssigningThis ? (
                                  <span className="flex items-center gap-1.5">
                                    <Loader2
                                      aria-hidden="true"
                                      className="h-3.5 w-3.5 animate-spin"
                                    />
                                    {t(lang, "กำลังนำเข้า…", "Importing…")}
                                  </span>
                                ) : (
                                  t(
                                    lang,
                                    "วางที่นี่เพื่อกำหนดอ้างอิง",
                                    "Drop to assign reference"
                                  )
                                )}
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    }
                  )}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Selected character detail */}
          <div className="flex flex-col gap-3">
            {!selectedCharacter ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                  <User
                    aria-hidden="true"
                    className="h-8 w-8 text-muted-foreground"
                  />
                  <p className="text-sm text-muted-foreground">
                    {characters.length === 0
                      ? t(
                          lang,
                          "เพิ่มตัวละครแรกเพื่อเริ่มสร้างสต็อกอ้างอิง",
                          "Add the first character to start the reference stock."
                        )
                      : t(
                          lang,
                          "เลือกตัวละครเพื่อดูอ้างอิง",
                          "Select a character to view references."
                        )}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                      {/* Variant/twin disambiguation (vertical-drama-
                      character-sheet-consolidation plan, Phase C): a variant
                      row (`parentCharacterId` set — same person, different
                      outfit/age-stage look) has the exact same `.name` as its
                      parent, so showing just `{name}` here was indistinguish-
                      able from viewing the parent itself. A twin
                      (`sharesFaceWithCharacterId` set — a different,
                      independent character that shares a face reference)
                      already got a badge on the roster card, but not here —
                      added for parity. */}
                      {(() => {
                        const isVariant = Boolean(
                          selectedCharacter.parentCharacterId
                        );
                        const parentName = isVariant
                          ? (characters.find(
                              (other: VdCharacterListItem) =>
                                other.characterId ===
                                selectedCharacter.parentCharacterId
                            )?.name ?? selectedCharacter.name)
                          : null;
                        const variantLabel =
                          selectedCharacter.variantLabel ??
                          t(lang, "ตัวแปร", "Variant");
                        const twinSourceName =
                          selectedCharacter.twinCharacterName ??
                          (selectedCharacter.sharesFaceWithCharacterId
                            ? characters.find(
                                (other: VdCharacterListItem) =>
                                  other.characterId ===
                                  selectedCharacter.sharesFaceWithCharacterId
                              )?.name
                            : characters.find(
                                (other: VdCharacterListItem) =>
                                  other.twinCharacterId === selectedCharacter.characterId ||
                                  other.sharesFaceWithCharacterId === selectedCharacter.characterId
                              )?.name);
                        return (
                          <>
                            <User aria-hidden="true" className="h-4 w-4" />
                            {isVariant ? (
                              <span className="flex min-w-0 items-center gap-1">
                                <span>{parentName}</span>
                                <span
                                  aria-hidden="true"
                                  className="text-muted-foreground"
                                >
                                  ›
                                </span>
                                <span>{variantLabel}</span>
                              </span>
                            ) : (
                              selectedCharacter.name
                            )}
                            {(getCanonicalRoleLabel(
                              selectedCharacter.roleTier,
                              lang
                            ) ||
                              selectedCharacter.role) && (
                              <Badge variant="outline" className="text-[10px]">
                                {getCanonicalRoleLabel(
                                  selectedCharacter.roleTier,
                                  lang
                                ) ?? selectedCharacter.role}
                              </Badge>
                            )}
                            {selectedCharacter.roleReviewStatus ===
                              "needs_role_review" && (
                              <Badge
                                variant="outline"
                                className="border-amber-300 bg-amber-50 text-[10px] text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
                              >
                                {t(lang, "ต้องตรวจบทบาท", "Role review needed")}
                              </Badge>
                            )}
                            {/* Set B (`vd-stuck-generation-and-lost-
                            characters` plan) — distinct from the amber
                            role-review badge above, see the roster-row
                            instance's own comment for why. */}
                            {selectedCharacter.needsSetup && (
                              <Badge
                                variant="outline"
                                className="border-fuchsia-300 bg-fuchsia-50 text-[10px] text-fuchsia-700 dark:border-fuchsia-800 dark:bg-fuchsia-950/30 dark:text-fuchsia-300"
                              >
                                {needsSetupBadgeLabel(
                                  lang,
                                  selectedCharacter.needsSetupReasons ?? []
                                )}
                              </Badge>
                            )}
                            {isVariant && (
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px]",
                                  selectedCharacter.variantType === "age_stage"
                                    ? "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300"
                                    : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                                )}
                              >
                                {selectedCharacter.variantType === "age_stage"
                                  ? t(lang, "ช่วงอายุ", "Age stage")
                                  : t(lang, "ชุด/ลุค", "Outfit")}
                              </Badge>
                            )}
                            {twinSourceName && (
                              <Badge
                                variant="outline"
                                className="gap-1 border-sky-200 bg-sky-50 text-[10px] text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300"
                              >
                                <Users
                                  aria-hidden="true"
                                  className="h-3 w-3 shrink-0"
                                />
                                {t(
                                  lang,
                                  `ฝาแฝดกับ ${twinSourceName}`,
                                  `Twin of ${twinSourceName}`
                                )}
                              </Badge>
                            )}
                          </>
                        );
                      })()}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2 text-xs text-muted-foreground">
                    <p>
                      {t(lang, "คีย์", "Key")}:{" "}
                      <code className="font-mono">
                        {selectedCharacter.characterKey}
                      </code>
                    </p>
                    {(() => {
                      const description =
                        extractCharacterDescriptionForDisplay(
                          selectedCharacter.data as
                            | Record<string, unknown>
                            | null
                            | undefined
                        ) ??
                        findBibleCharacterDescription(
                          seriesBible,
                          selectedCharacter.name
                        );
                      return description ? (
                        <p className="whitespace-pre-wrap text-foreground/80">
                          {description}
                        </p>
                      ) : (
                        <p className="italic">
                          {t(
                            lang,
                            "ยังไม่มีคำอธิบายตัวละคร",
                            "No character description yet"
                          )}
                        </p>
                      );
                    })()}
                    {(() => {
                      const data =
                        (selectedCharacter.data as Record<
                          string,
                          unknown
                        > | null) ?? null;
                      const summary = resolveCharacterLookSummary({ data });
                      return summary ? (
                        <p className="min-w-0 rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                          <span className="font-medium">
                            {t(lang, "สรุปลุค:", "Look summary:")}
                          </span>{" "}
                          <span className="inline-block max-w-full truncate align-bottom">
                            {summary}
                          </span>
                        </p>
                      ) : null;
                    })()}

                    <section
                      className="rounded-md border border-violet-200 bg-violet-50/40 p-3 dark:border-violet-900 dark:bg-violet-950/20"
                      data-testid="vd-character-twin-relationship"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-medium text-foreground">
                            {t(lang, "ความสัมพันธ์แฝด", "Twin relationship")}
                          </p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {selectedCharacter.twinRelationshipStatus === "linked"
                              ? t(
                                  lang,
                                  `เชื่อมกับ ${selectedCharacter.twinCharacterName ?? "ตัวละครแฝด"} แล้ว`,
                                  `Linked with ${selectedCharacter.twinCharacterName ?? "twin character"}`
                                )
                              : t(
                                  lang,
                                  "ใช้ใบหน้า อายุ และโครงหน้าเดียวกัน แต่ยังปรับเสื้อผ้า ทรงผม และนิสัยแยกกันได้",
                                  "Shares face, age, and facial structure while clothing, hair, and personality stay independent."
                                )}
                          </p>
                        </div>
                        {selectedCharacter.twinRelationshipStatus === "linked" && (
                          <Badge variant="outline" className="border-violet-300 bg-violet-100 text-[10px] text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300">
                            {t(lang, "DNA ส่วนร่วมทำงาน", "Shared DNA active")}
                          </Badge>
                        )}
                      </div>
                      {selectedCharacter.twinRelationshipStatus !== "linked" && !selectedCharacter.parentCharacterId && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Select value={twinLinkTargetId || undefined} onValueChange={setTwinLinkTargetId}>
                            <SelectTrigger className="h-8 min-w-[220px] flex-1 text-xs">
                              <SelectValue placeholder={t(lang, "เลือกตัวละครแฝดที่มีอยู่", "Select existing twin character")} />
                            </SelectTrigger>
                            <SelectContent>
                              {characters
                                .filter((candidate: VdCharacterListItem) => candidate.characterId !== selectedCharacter.characterId && !candidate.parentCharacterId)
                                .map((candidate: VdCharacterListItem) => (
                                  <SelectItem key={candidate.characterId} value={candidate.characterId}>
                                    {candidate.name}{candidate.role ? ` — ${candidate.role}` : ""}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!twinLinkTargetId || linkCharacterTwinsMutation.isPending}
                            onClick={() =>
                              linkCharacterTwinsMutation.mutate({
                                seriesId,
                                sourceCharacterId: selectedCharacter.characterId,
                                twinCharacterId: twinLinkTargetId,
                              })
                            }
                          >
                            {linkCharacterTwinsMutation.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Users className="mr-1 h-3 w-3" />}
                            {t(lang, "เชื่อมเป็นแฝด", "Link as twins")}
                          </Button>
                        </div>
                      )}
                      <p className="mt-2 text-[10px] text-muted-foreground">
                        {t(lang, "การเชื่อมนี้ไม่สร้างภาพและไม่ใช้เครดิต ระบบจะอ่าน DNA ล่าสุดอีกครั้งเมื่อสร้าง Prompt/ภาพ", "Linking is credit-free; prompt/image generation reloads the latest DNA before starting.")}
                      </p>
                    </section>

                    {(() => {
                      const characterId = selectedCharacter.characterId;
                      const data =
                        (selectedCharacter.data as Record<
                          string,
                          unknown
                        > | null) ?? null;
                      const visualBible = characterVisualBibleFromData(data);
                      const savedForm = characterIdentityDnaFormFromData(data);
                      const form = identityDnaFormFor(characterId);
                      const dna = readCharacterIdentityDna(data);
                      const saving =
                        updateCharacterIdentityDnaMutation.isPending &&
                        updateCharacterIdentityDnaMutation.variables
                          ?.characterId === characterId;
                      const hasUnsavedChanges =
                        Boolean(form && savedForm) &&
                        JSON.stringify(form) !== JSON.stringify(savedForm);
                      const stale = visualBible
                        ? isCharacterIdentityDnaStale(visualBible)
                        : false;
                      const source = visualBible?.identityDnaSource;
                      const sourceLabel =
                        source === "user_edited"
                          ? t(lang, "แก้ไขโดยผู้ใช้", "User edited")
                          : source === "ai_generated"
                            ? t(lang, "สร้างโดย AI", "AI generated")
                            : t(
                                lang,
                                "DNA เดิม/ยังไม่ระบุแหล่งที่มา",
                                "Legacy DNA"
                              );
                      const readOnlyItems = dna
                        ? [
                            ["designIntent", dna.designIntent],
                            ["beautyArchetype", dna.beautyArchetype],
                            ["publicMask", dna.publicMask],
                            ["hiddenTruth", dna.hiddenTruth],
                            ["narrativePromise", dna.narrativePromise],
                            ["costumeGrammar", dna.costumeGrammar],
                            ["forbiddenDrift", dna.forbiddenDrift.join(" · ")],
                            [
                              "scores",
                              `${dna.scores.thresholdStatus} — ${dna.scores.rationale}`,
                            ],
                          ]
                        : [];

                      if (!form || !visualBible) {
                        return (
                          <div
                            className="rounded-md border border-dashed bg-muted/20 p-3"
                            data-testid="vd-character-dna-empty"
                          >
                            <p className="font-medium text-foreground">
                              {t(
                                lang,
                                "Character DNA — ยังไม่มีข้อมูลหลักที่ใช้สร้างภาพ",
                                "Character DNA — no canonical image identity yet"
                              )}
                            </p>
                            <p className="mt-1 text-[11px]">
                              {t(
                                lang,
                                "กรุณาสร้าง Preview ตัวละครก่อน จึงจะแสดงและแก้ไข DNA ได้",
                                "Generate a character preview first to create editable DNA."
                              )}
                            </p>
                          </div>
                        );
                      }

                      return (
                        <details
                          className="group flex flex-col gap-3 rounded-md border border-sky-200 bg-sky-50/40 p-3 dark:border-sky-900 dark:bg-sky-950/20"
                          data-testid="vd-character-dna-editor"
                        >
                          <summary className="flex cursor-pointer list-none items-start gap-2 select-none [&::-webkit-details-marker]:hidden">
                            <ChevronDown
                              aria-hidden="true"
                              className="mt-0.5 h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
                            />
                            <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="text-xs font-medium text-foreground">
                                  {t(
                                    lang,
                                    "Character DNA — ข้อมูลหลักที่ใช้สร้างภาพ",
                                    "Character DNA — canonical image identity"
                                  )}
                                </p>
                                <p className="mt-1 text-[11px]">
                                  {t(
                                    lang,
                                    "ข้อมูลส่วนนี้คือ DNA ที่ระบบใช้เป็นหลักในการสร้าง Prompt และภาพตัวละคร",
                                    "These values are the primary DNA used to create character prompts and images."
                                  )}
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Badge variant="outline">{sourceLabel}</Badge>
                                {stale && (
                                  <Badge
                                    variant="outline"
                                    className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
                                  >
                                    {t(
                                      lang,
                                      "Prompt/ภาพอาจเก่า",
                                      "Prompt/portrait may be stale"
                                    )}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </summary>

                          <div className="grid gap-2 sm:grid-cols-2">
                            <div className="flex flex-col gap-1">
                              <Label
                                htmlFor="vd-character-dna-age"
                                className="text-xs text-foreground"
                              >
                                {t(
                                  lang,
                                  "อายุ/ช่วงอายุ Canonical ที่ใช้สร้างภาพ",
                                  "Canonical age used by generation"
                                )}
                              </Label>
                              <Input
                                id="vd-character-dna-age"
                                value={form.ageRange}
                                disabled={readOnly || saving}
                                onChange={event =>
                                  updateIdentityDnaForm(characterId, {
                                    ageRange: event.target.value,
                                  })
                                }
                                maxLength={255}
                              />
                            </div>
                            <div className="flex flex-col justify-end gap-1 text-[11px]">
                              <span>
                                {t(lang, "DNA revision", "DNA revision")}:{" "}
                                {readCharacterIdentityDnaRevision(visualBible)}
                              </span>
                              <span>
                                {t(lang, "สร้างโดยโมเดล", "Model")}:{" "}
                                {String(visualBible.model ?? "-")} ·{" "}
                                {String(visualBible.createdAt ?? "-")}
                              </span>
                            </div>
                          </div>

                          <div className="grid gap-2 md:grid-cols-2">
                            {VD_CHARACTER_IDENTITY_DNA_FIELDS.map(
                              ([field, labelTh, labelEn]) => {
                                const fieldKey =
                                  field as keyof VdCharacterIdentityDnaFormState["faceIdentity"];
                                return (
                                  <div
                                    className="flex flex-col gap-1"
                                    key={field}
                                  >
                                    <Label
                                      htmlFor={`vd-character-dna-${field}`}
                                      className="text-xs text-foreground"
                                    >
                                      {t(lang, labelTh, labelEn)}
                                    </Label>
                                    <Textarea
                                      id={`vd-character-dna-${field}`}
                                      value={form.faceIdentity[fieldKey]}
                                      disabled={readOnly || saving}
                                      rows={2}
                                      maxLength={1000}
                                      onChange={event =>
                                        updateIdentityDnaForm(characterId, {
                                          faceIdentity: {
                                            [fieldKey]: event.target.value,
                                          } as Partial<
                                            VdCharacterIdentityDnaFormState["faceIdentity"]
                                          >,
                                        })
                                      }
                                    />
                                  </div>
                                );
                              }
                            )}
                          </div>

                          <div className="rounded border bg-background/70 p-2 text-[11px]">
                            <p className="font-medium text-foreground">
                              {t(
                                lang,
                                "Story/Design DNA — อ่านอย่างเดียว",
                                "Story/Design DNA — read-only"
                              )}
                            </p>
                            <div className="mt-1 grid gap-1 sm:grid-cols-2">
                              {readOnlyItems.map(([key, value]) => (
                                <p key={key} className="whitespace-pre-wrap">
                                  <span className="font-medium text-foreground">
                                    {key}:{" "}
                                  </span>
                                  {value}
                                </p>
                              ))}
                            </div>
                          </div>

                          {stale && (
                            <p className="flex items-start gap-1.5 rounded border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                              <AlertTriangle
                                aria-hidden="true"
                                className="mt-0.5 h-3.5 w-3.5 shrink-0"
                              />
                              {t(
                                lang,
                                "DNA ถูกแก้ไขแล้ว Prompt/ภาพเดิมอาจยังไม่ตรง ให้กดสร้าง Prompt ใหม่เมื่อพร้อม",
                                "DNA changed. The existing prompt/portrait may be stale; generate a new prompt when ready."
                              )}
                            </p>
                          )}

                          {!readOnly && (
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                disabled={!hasUnsavedChanges || saving}
                                onClick={() =>
                                  handleSaveIdentityDna(characterId)
                                }
                                data-testid="vd-character-dna-save"
                              >
                                {saving && (
                                  <Loader2
                                    aria-hidden="true"
                                    className="mr-2 h-3.5 w-3.5 animate-spin"
                                  />
                                )}
                                {t(
                                  lang,
                                  "บันทึก Character DNA",
                                  "Save Character DNA"
                                )}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={!hasUnsavedChanges || saving}
                                onClick={() =>
                                  setIdentityDnaFormDrafts(prev => {
                                    const next = { ...prev };
                                    delete next[characterId];
                                    return next;
                                  })
                                }
                              >
                                {t(lang, "ยกเลิก", "Cancel")}
                              </Button>
                            </div>
                          )}
                        </details>
                      );
                    })()}

                    <div className="flex flex-col gap-1.5 rounded-md border bg-muted/20 p-2">
                      <Label
                        htmlFor="vd-selected-role-tier"
                        className="text-xs font-medium text-foreground"
                      >
                        {t(
                          lang,
                          "บทบาทในเรื่อง (กำหนดให้ชัดเจน)",
                          "Canonical narrative role"
                        )}
                      </Label>
                      <Select
                        value={selectedCharacter.roleTier ?? ""}
                        onValueChange={value => {
                          const roleTier = value as RoleTier;
                          updateCharacterRoleMutation.mutate({
                            seriesId,
                            characterId: selectedCharacter.characterId,
                            roleTier,
                            narrativeRole: roleTierToNarrativeRole(roleTier),
                            roleProvenance: "user_confirmed",
                            roleReviewStatus: "ready",
                          });
                        }}
                        disabled={
                          readOnly || updateCharacterRoleMutation.isPending
                        }
                      >
                        <SelectTrigger
                          id="vd-selected-role-tier"
                          className="h-9 text-xs"
                        >
                          <SelectValue
                            placeholder={t(
                              lang,
                              "เลือก นางเอก/พระเอก/ตัวร้าย/ตัวประกอบ",
                              "Choose lead / villain / supporting"
                            )}
                          />
                        </SelectTrigger>
                        <SelectContent className="max-h-[min(70vh,32rem)]">
                          {ROLE_TIER_VALUES.map(tier => (
                            <SelectItem key={tier} value={tier}>
                              {getCanonicalRoleLabel(tier, lang) ?? tier}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground">
                        {selectedCharacter.roleReviewStatus ===
                        "needs_role_review"
                          ? t(
                              lang,
                              "ยังไม่ได้ยืนยัน บทบาทนี้จะกำหนด DNA และหน้าตาที่ Skill ใช้สร้างภาพ",
                              "Not confirmed yet. This role drives the DNA and visual design used by the Skill."
                            )
                          : t(
                              lang,
                              "ยืนยันแล้วโดยผู้ใช้ — Skill จะใช้บทบาทนี้เป็นข้อมูลอ้างอิงหลัก",
                              "User-confirmed. The Skill treats this role as authoritative."
                            )}
                      </p>
                    </div>

                    {/* Skill-first per-character casting controls. The
                    additional-details field is intentionally outside the
                    dropdowns and is sent as a higher-priority user fact to
                    the visual-bible skill. */}
                    {(() => {
                      const characterId = selectedCharacter.characterId;
                      const form = castingPreferencesFormFor(characterId);
                      const saving =
                        updateCharacterCastingMutation.isPending &&
                        updateCharacterCastingMutation.variables
                          ?.characterId === characterId;
                      return (
                        <div
                          className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3"
                          data-testid="vd-character-casting-preferences"
                        >
                          <div>
                            <p className="text-xs font-medium text-foreground">
                              {t(
                                lang,
                                "Casting และภาพลักษณ์ตัวละคร",
                                "Casting & character look"
                              )}
                            </p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {t(
                                lang,
                                "ใช้บทบาท แกนเรื่อง ภาษา และตลาดของซีรีย์ร่วมกับตัวเลือกนี้เพื่อสร้างหน้าตาที่เหมาะกับตัวละคร ไม่ใช่การสุ่มหน้าตา",
                                "The Skill combines this with the character role, story spine, language, and series market to cast a coherent face—not a random face."
                              )}
                            </p>
                          </div>
                          <Label
                            htmlFor="vd-selected-casting-region"
                            className="text-xs"
                          >
                            {t(
                              lang,
                              "เชื้อชาติหรือภูมิภาค (Casting Region)",
                              "Ethnicity or region (Casting Region)"
                            )}
                          </Label>
                          <Select
                            value={form.region}
                            onValueChange={value =>
                              updateCastingPreferencesForm(characterId, {
                                region:
                                  value as VerticalDramaCharacterCastingFormState["region"],
                              })
                            }
                            disabled={readOnly}
                          >
                            <SelectTrigger
                              id="vd-selected-casting-region"
                              className="h-9 text-xs"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-[min(70vh,32rem)]">
                              <SelectItem value="auto">
                                {t(
                                  lang,
                                  "อัตโนมัติ — ให้ AI วิเคราะห์จากเรื่อง",
                                  "Auto — let AI analyze the story"
                                )}
                              </SelectItem>
                              {VERTICAL_DRAMA_CHARACTER_CASTING_REGIONS.map(
                                region => (
                                  <SelectItem key={region} value={region}>
                                    {lang === "th"
                                      ? VERTICAL_DRAMA_CHARACTER_CASTING_REGION_LABELS_TH[
                                          region
                                        ]
                                      : VERTICAL_DRAMA_CHARACTER_CASTING_REGION_LABELS_EN[
                                          region
                                        ]}
                                  </SelectItem>
                                )
                              )}
                            </SelectContent>
                          </Select>
                          <p className="text-[11px] text-muted-foreground">
                            {t(
                              lang,
                              "อัตโนมัติจะพิจารณา locale, setting, กลุ่มผู้ชม, บทบาท และ visual culture ของซีรีย์ก่อนตัดสินใจ",
                              "Auto considers the series locale, setting, audience, character role, and visual culture before deciding."
                            )}
                          </p>
                          <Label
                            htmlFor="vd-selected-casting-look"
                            className="text-xs"
                          >
                            {t(
                              lang,
                              "แนวหน้าตานักแสดง (Casting Look)",
                              "Casting look"
                            )}
                          </Label>
                          <Select
                            value={form.look}
                            onValueChange={value =>
                              updateCastingPreferencesForm(characterId, {
                                look: value as VerticalDramaCharacterCastingFormState["look"],
                              })
                            }
                            disabled={readOnly}
                          >
                            <SelectTrigger
                              id="vd-selected-casting-look"
                              className="h-9 text-xs"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-[min(70vh,32rem)]">
                              <SelectItem value="auto">
                                {t(
                                  lang,
                                  "อัตโนมัติ — วิเคราะห์จากตัวละคร",
                                  "Auto — analyze the character"
                                )}
                              </SelectItem>
                              {VERTICAL_DRAMA_CHARACTER_CASTING_LOOKS.map(
                                look => (
                                  <SelectItem key={look} value={look}>
                                    {lang === "th"
                                      ? VERTICAL_DRAMA_CHARACTER_CASTING_LOOK_LABELS_TH[
                                          look
                                        ]
                                      : VERTICAL_DRAMA_CHARACTER_CASTING_LOOK_LABELS_EN[
                                          look
                                        ]}
                                  </SelectItem>
                                )
                              )}
                            </SelectContent>
                          </Select>
                          <p className="text-[11px] text-muted-foreground">
                            {t(
                              lang,
                              "อัตโนมัติจะเลือกความน่าดึงดูดให้เหมาะกับ role tier, อายุ, บุคลิก และตลาดของเรื่อง",
                              "Auto selects an appealing look that fits the role tier, age, personality, and series market."
                            )}
                          </p>
                          <Label
                            htmlFor="vd-selected-casting-details"
                            className="text-xs"
                          >
                            {t(
                              lang,
                              "หมายเหตุ Casting เพิ่มเติม (ไม่ใช่ Canonical DNA)",
                              "Additional casting notes (not canonical DNA)"
                            )}
                          </Label>
                          <Textarea
                            id="vd-selected-casting-details"
                            value={form.additionalDetails}
                            disabled={readOnly}
                            onChange={e =>
                              updateCastingPreferencesForm(characterId, {
                                additionalDetails: e.target.value,
                              })
                            }
                            maxLength={800}
                            rows={4}
                            placeholder={t(
                              lang,
                              "เช่น ลูกครึ่งไทย-ญี่ปุ่น หรือหน้าคม ดูฉลาดแต่เป็นมิตร",
                              "e.g. Asian-American; natural, not model-like; sharp, intelligent, and friendly"
                            )}
                          />
                          <p className="text-[11px] text-muted-foreground">
                            {t(
                              lang,
                              "ใช้สำหรับหมายเหตุประกอบเท่านั้น — หากต้องการแก้อายุหรือใบหน้า ให้แก้ในส่วน Character DNA ด้านบน",
                              "Use as supporting notes only — edit age or facial identity in Character DNA above"
                            )}
                          </p>
                          <p className="rounded border border-primary/20 bg-primary/5 p-2 text-[11px] font-medium text-primary">
                            {t(
                              lang,
                              "Priority: หมายเหตุนี้มีผลกับแนว Casting แต่ไม่สามารถเปลี่ยน Canonical อายุหรือ Identity DNA ได้",
                              "Priority: these notes guide casting but cannot change canonical age or Identity DNA."
                            )}
                          </p>
                          {!readOnly && (
                            <div>
                              <Button
                                type="button"
                                size="sm"
                                disabled={saving}
                                onClick={() =>
                                  handleSaveCastingPreferences(characterId)
                                }
                                data-testid="vd-character-casting-save"
                              >
                                {saving ? (
                                  <Loader2
                                    aria-hidden="true"
                                    className="mr-2 h-3.5 w-3.5 animate-spin"
                                  />
                                ) : null}
                                {t(
                                  lang,
                                  "บันทึกข้อมูล Casting",
                                  "Save casting preferences"
                                )}
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {isCharacterReferenceDisclosureExpanded && (
                      <div
                        id="vd-character-reference-disclosure-content"
                        data-testid="vd-character-reference-disclosure-content"
                        className="flex flex-col gap-3"
                      >
                        {/* Reference-image picker (vertical-drama-reference-
                    picker-outfit-lock plan, Phase D3) — shows which
                    `primary_portrait` asset(s) are available as the
                    identity-lock reference for the NEXT generate call, and
                    which one is currently selected (explicit override, or
                    the same asset the backend would auto-pick). Rendered
                    UNCONDITIONALLY (not gated on `!readOnly`) so a
                    read-only viewer still sees what would be used, for
                    transparency — only the click-to-select interaction is
                    disabled when `readOnly`. Renders nothing when there are
                    no candidates at all (nothing to show/pick). */}
                        {(() => {
                          const referenceCandidates = buildReferenceCandidates(
                            assets,
                            selectedCharacter,
                            charactersById
                          );
                          if (referenceCandidates.length === 0) return null;
                          const selectedReferenceAssetLinkId =
                            referenceOverrideByCharacter[
                              selectedCharacter.characterId
                            ] ?? undefined;
                          // Read the MAIN image from the same resolver the card
                          // thumbnail uses, so the "ภาพหลัก" badge always marks the
                          // picture actually on screen rather than a second guess
                          // at it.
                          const mainPortraitAssetLinkId =
                            resolveCharacterCardPortraitAsset(
                              assets,
                              selectedCharacter.characterId
                            )?.assetLinkId ?? null;
                          return (
                            <div className="mt-1 flex flex-col gap-1">
                              <span className="text-[11px] font-medium text-foreground/80">
                                {t(
                                  lang,
                                  "ภาพอ้างอิงตัวตน",
                                  "Identity reference"
                                )}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {t(
                                  lang,
                                  "ภาพหลักใหม่จะไม่ใช้ภาพเดิมเป็น reference เว้นแต่เลือกภาพนี้เอง",
                                  "A new main portrait will not use the old image unless you select a reference here."
                                )}
                              </span>
                              <div className="flex flex-wrap items-start gap-2">
                                {referenceCandidates.map(candidate => {
                                  const isSelected =
                                    candidate.assetLinkId ===
                                    selectedReferenceAssetLinkId;
                                  // The MAIN image is whichever asset the card
                                  // thumbnail resolves to — same function, so the
                                  // badge can never disagree with the picture the
                                  // user is looking at. Distinct from
                                  // `isSelected`, which is only the identity-lock
                                  // reference for the NEXT generation.
                                  const isMainImage =
                                    candidate.sourceLabel === "own" &&
                                    mainPortraitAssetLinkId != null &&
                                    candidate.assetLinkId ===
                                      mainPortraitAssetLinkId;
                                  return (
                                    <div
                                      key={candidate.assetLinkId}
                                      className="flex flex-col items-center gap-0.5"
                                    >
                                      <button
                                        type="button"
                                        disabled={readOnly}
                                        aria-pressed={isSelected}
                                        aria-label={t(
                                          lang,
                                          "เลือกภาพนี้เป็นภาพอ้างอิงตัวตน",
                                          "Select this identity reference image"
                                        )}
                                        className={cn(
                                          "flex flex-col items-center gap-0.5",
                                          readOnly
                                            ? "cursor-default"
                                            : "cursor-pointer"
                                        )}
                                        onClick={() => {
                                          if (readOnly) return;
                                          setReferenceOverrideByCharacter(
                                            prev => ({
                                              ...prev,
                                              [selectedCharacter.characterId]:
                                                candidate.assetLinkId,
                                            })
                                          );
                                        }}
                                      >
                                        <AuthenticatedMediaImage
                                          src={candidate.thumbnailUrl}
                                          alt=""
                                          className={cn(
                                            "h-10 w-10 rounded border border-border object-cover",
                                            isSelected &&
                                              "border-primary ring-2 ring-primary"
                                          )}
                                        />
                                        {candidate.sourceLabel !== "own" &&
                                          candidate.sourceName && (
                                            <span className="max-w-[48px] truncate text-center text-[9px] text-muted-foreground">
                                              {t(
                                                lang,
                                                `จาก ${candidate.sourceName}`,
                                                `from ${candidate.sourceName}`
                                              )}
                                            </span>
                                          )}
                                      </button>
                                      {/* The control that was missing entirely
                                  (`planning/vd-character-primary-portrait-
                                  control/plan.md`): every one of these tiles is
                                  stored as a `primary_portrait`, so without an
                                  explicit action there was no way to say which
                                  one the character actually uses. Only offered
                                  on this character's OWN images — promoting
                                  another character's portrait would be a
                                  different (and wrong) operation. */}
                                      {isMainImage ? (
                                        <span className="rounded bg-primary/10 px-1 text-[9px] font-medium text-primary">
                                          {t(lang, "ภาพหลัก", "Main")}
                                        </span>
                                      ) : (
                                        !readOnly &&
                                        candidate.sourceLabel === "own" && (
                                          <button
                                            type="button"
                                            disabled={
                                              setPrimaryPortraitMutation.isPending
                                            }
                                            className="rounded px-1 text-[9px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
                                            title={t(
                                              lang,
                                              "ใช้ภาพนี้เป็นภาพหลักของตัวละคร",
                                              "Use this as the character's main image"
                                            )}
                                            onClick={() =>
                                              setPrimaryPortraitMutation.mutate(
                                                {
                                                  seriesId,
                                                  characterId:
                                                    selectedCharacter.characterId,
                                                  assetLinkId:
                                                    candidate.assetLinkId,
                                                }
                                              )
                                            }
                                          >
                                            {t(
                                              lang,
                                              "ตั้งเป็นหลัก",
                                              "Set main"
                                            )}
                                          </button>
                                        )
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Optional "additional details" hint for the portrait
                    generate button below — sent as `customInstruction` on
                    `previewCharacterPrompt` so repeated clicks vary the
                    generated prompt instead of producing near-identical
                    images every time (planning/vertical-drama-character-
                    custom-instruction/plan.md). Shares
                    `customInstructionByCharacter` state, keyed by
                    characterId, with the roster-card compact input above. */}
                        {!readOnly && (
                          <div className="mt-1 flex flex-col gap-1">
                            <Label
                              htmlFor="vd-character-custom-instruction"
                              className="text-xs"
                            >
                              {t(
                                lang,
                                VD_COPY.th.characterCustomInstructionLabel,
                                VD_COPY.en.characterCustomInstructionLabel
                              )}
                            </Label>
                            <Textarea
                              id="vd-character-custom-instruction"
                              value={
                                customInstructionByCharacter[
                                  selectedCharacter.characterId
                                ] ?? ""
                              }
                              onChange={e =>
                                setCustomInstructionByCharacter(prev => ({
                                  ...prev,
                                  [selectedCharacter.characterId]:
                                    e.target.value,
                                }))
                              }
                              maxLength={500}
                              rows={2}
                              placeholder={t(
                                lang,
                                VD_COPY.th
                                  .characterCustomInstructionPlaceholder,
                                VD_COPY.en.characterCustomInstructionPlaceholder
                              )}
                            />
                          </div>
                        )}

                        {!readOnly &&
                          selectedCharacterSupportsCandidateBatch && (
                            <section
                              className="rounded-lg border bg-muted/30 p-3"
                              role="radiogroup"
                              aria-labelledby="vd-portrait-candidate-count-label"
                            >
                              <p
                                id="vd-portrait-candidate-count-label"
                                className="mb-2 text-sm font-medium"
                              >
                                {t(
                                  lang,
                                  "เลือกจำนวนใบหน้าให้ระบบสร้างพร้อมกัน",
                                  "Choose how many different faces to generate together"
                                )}
                              </p>
                              <Grid
                                columns={{
                                  minWidth: 108,
                                  max: 5,
                                  repeat: "fit",
                                }}
                                gap={2}
                              >
                                {VD_PORTRAIT_CANDIDATE_COUNTS.map(count => {
                                  const selected =
                                    (portraitCandidateCountByCharacter[
                                      selectedCharacter.characterId
                                    ] ?? 3) === count;
                                  return (
                                    <SelectableCard
                                      key={count}
                                      label={t(
                                        lang,
                                        `${count} ภาพ`,
                                        `${count} image${count > 1 ? "s" : ""}`
                                      )}
                                      isSelected={selected}
                                      onChange={isSelected => {
                                        if (!isSelected) return;
                                        setPortraitCandidateCountByCharacter(
                                          prev => ({
                                            ...prev,
                                            [selectedCharacter.characterId]:
                                              count,
                                          })
                                        );
                                      }}
                                      padding={2}
                                      variant={selected ? "blue" : "muted"}
                                    >
                                      {/* Plain display span — MUST NOT carry an
                                  interactive role. `SelectableCard` makes the
                                  whole card clickable via `useClickableContainer`,
                                  which treats any child matching
                                  `[role="radio"]`/button/etc. as a nested
                                  interactive element and DELIBERATELY swallows
                                  the container click for it. A `role="radio"`
                                  here therefore ate every click that landed on
                                  the number (i.e. the obvious target), so
                                  changing the count "was very hard" — you could
                                  only hit the thin card padding around it.
                                  Accessibility is already provided by the
                                  card's own hidden checkbox (`aria-label`). */}
                                      <span className="block text-center text-sm font-semibold">
                                        {count}
                                      </span>
                                    </SelectableCard>
                                  );
                                })}
                              </Grid>
                              <p className="mt-2 text-xs text-muted-foreground">
                                {t(
                                  lang,
                                  "แต่ละภาพเป็นคนละใบหน้า คุณภาพและเสน่ห์ระดับเดียวกัน ค่าเริ่มต้น 3 ภาพ",
                                  "Each option is a different person with the same casting quality. Default: 3."
                                )}
                              </p>
                            </section>
                          )}

                        {!readOnly && !selectedImageModelId && (
                          /* Explicit "you must pick a model" notice — the
                        generate button below is already disabled with a
                        hover tooltip, but that alone was too subtle
                        (product feedback 2026-07-15). Additive, not a
                        replacement for the disabled-button guard. */
                          <div
                            className="mt-1 flex flex-wrap items-center gap-2 rounded-md border border-amber-400/60 bg-amber-50 px-2.5 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                            data-testid="vd-character-image-model-required-notice"
                          >
                            <AlertTriangle
                              aria-hidden="true"
                              className="h-3.5 w-3.5"
                            />
                            <span>
                              {t(
                                lang,
                                "ยังไม่ได้เลือกโมเดลภาพ — กรุณาเลือกโมเดลก่อนจึงจะสร้างภาพได้",
                                "No image model selected — choose a model before you can generate."
                              )}
                            </span>
                            <button
                              type="button"
                              onClick={() => setIsModelDialogOpen(true)}
                              className="ml-auto rounded-md border border-amber-400/60 bg-background px-2 py-1 text-[11px] font-medium hover:bg-amber-100 dark:hover:bg-amber-950/60"
                            >
                              {t(lang, "เลือกโมเดล", "Select model")}
                            </button>
                          </div>
                        )}
                        {!readOnly && (
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="gap-2"
                              onClick={() => setModelDialogTarget("create")}
                              title={t(
                                lang,
                                "ใช้ตอนสร้างภาพใหม่ที่ยังไม่มีภาพอ้างอิง (text-to-image)",
                                "Used for a new image with no reference yet (text-to-image)"
                              )}
                            >
                              <Sparkles
                                aria-hidden="true"
                                className="h-3.5 w-3.5"
                              />
                              {selectedImageModelId
                                ? `${t(lang, "โมเดลสร้างภาพใหม่", "New image")}: ${
                                    imageModels.find(
                                      m => m.modelId === selectedImageModelId
                                    )?.name ?? selectedImageModelId
                                  }`
                                : t(
                                    lang,
                                    "เลือกโมเดลสร้างภาพใหม่",
                                    "Choose new-image model"
                                  )}
                            </Button>
                            {/* Second slot — `planning/vd-character-image-edit-
                        model/plan.md`. A model that is excellent at
                        text-to-image (gpt-image-2) can be poor at
                        image-to-image, which is what every look/twin/
                        regeneration actually runs. The server picks between
                        the two based on whether a reference is really
                        attached; leaving this empty keeps the single-model
                        behavior. */}
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="gap-2"
                              onClick={() => setModelDialogTarget("edit")}
                              title={t(
                                lang,
                                "ใช้ตอนแก้ไข/ต่อยอดจากภาพเดิม เช่น เพิ่มลุคใหม่ หรือสร้างซ้ำ (image-to-image)",
                                "Used when editing from an existing image — new looks, regenerations (image-to-image)"
                              )}
                            >
                              <ImagePlus
                                aria-hidden="true"
                                className="h-3.5 w-3.5"
                              />
                              {selectedEditImageModelId
                                ? `${t(lang, "โมเดลแก้ไขภาพ", "Edit image")}: ${
                                    imageModels.find(
                                      m =>
                                        m.modelId === selectedEditImageModelId
                                    )?.name ?? selectedEditImageModelId
                                  }`
                                : t(
                                    lang,
                                    "เลือกโมเดลแก้ไขภาพ (ไม่บังคับ)",
                                    "Choose edit model (optional)"
                                  )}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              className="gap-2"
                              disabled={
                                mutating ||
                                isImageGeneratingFor(
                                  selectedCharacter.characterId
                                ) ||
                                !selectedImageModelId
                              }
                              title={
                                selectedImageModelId
                                  ? undefined
                                  : t(
                                      lang,
                                      "เลือกโมเดลภาพก่อนสร้าง",
                                      "Select an image model first"
                                    )
                              }
                              onClick={() =>
                                startCharacterPromptPreview(
                                  selectedCharacter.characterId
                                )
                              }
                            >
                              {isImageGeneratingFor(
                                selectedCharacter.characterId
                              ) ? (
                                <Loader2
                                  aria-hidden="true"
                                  className="h-3.5 w-3.5 animate-spin"
                                />
                              ) : (
                                <Sparkles
                                  aria-hidden="true"
                                  className="h-3.5 w-3.5"
                                />
                              )}
                              {t(
                                lang,
                                selectedCharacterSupportsCandidateBatch
                                  ? `สร้างตัวเลือก ${portraitCandidateCountByCharacter[selectedCharacter.characterId] ?? 3} ภาพ`
                                  : "สร้างภาพตัวละคร",
                                selectedCharacterSupportsCandidateBatch
                                  ? `Generate ${portraitCandidateCountByCharacter[selectedCharacter.characterId] ?? 3} candidates`
                                  : "Generate character image"
                              )}
                            </Button>
                            {/* Unified sheet-format select + single generate
                        button (vertical-drama-character-sheet-consolidation
                        plan, Phase C) — replaces the previous two buttons
                        ("สร้างชีทตัวละคร"/turnaround and "Character Sheet
                        แบบเต็ม"/full_combined), which used the same wording
                        and icon and confused users. `selectedSheetType`
                        defaults to `"auto"` (backend resolves that to
                        `"turnaround"`, preserving the old default button's
                        behavior). No preview step, matching how "Character
                        Sheet แบบเต็ม" already worked (direct-confirm) — kept
                        simple across all 14 possible formats. */}
                            <Select
                              value={selectedSheetType}
                              onValueChange={value =>
                                setSelectedSheetType(
                                  value as VdCharacterSheetType
                                )
                              }
                              disabled={readOnly}
                            >
                              <SelectTrigger
                                className="h-8 w-[210px] text-xs"
                                data-testid="vd-sheet-type-select"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {SHEET_TYPE_OPTIONS.map(opt => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {t(lang, opt.labelTh, opt.labelEn)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="gap-2"
                              disabled={
                                mutating ||
                                isSheetGeneratingFor(
                                  selectedCharacter.characterId
                                ) ||
                                !selectedImageModelId
                              }
                              title={
                                selectedImageModelId
                                  ? undefined
                                  : t(
                                      lang,
                                      "เลือกโมเดลภาพก่อนสร้าง",
                                      "Select an image model first"
                                    )
                              }
                              onClick={() => {
                                if (!requireModelSelected()) return;
                                if (!requireMcpConnectionOrToast()) return;
                                if (!requireHermesConnectionOrToast()) return;
                                confirmCharacterCreditAction(
                                  selectedCharacter.characterId,
                                  t(
                                    lang,
                                    "ยืนยันสร้างชีทตัวละคร",
                                    "Confirm character sheet generation"
                                  ),
                                  t(
                                    lang,
                                    "การสร้างชีทตัวละครใช้ AI และอาจหักเครดิต ต้องการดำเนินการต่อหรือไม่?",
                                    "Generating a character sheet uses AI and may spend credits. Continue?"
                                  ),
                                  t(lang, "สร้างชีท", "Generate sheet"),
                                  () =>
                                    generateSheetMutation.mutate({
                                      seriesId,
                                      characterId:
                                        selectedCharacter.characterId,
                                      sheetType: selectedSheetType,
                                      sheetLanguage,
                                      ...(selectedEditImageModelId
                                        ? { selectedEditImageModelId }
                                        : {}),
                                      // Same "รายละเอียดเพิ่มเติม" textarea the
                                      // portrait button reads — a sheet is just as
                                      // valid a target for a framing/composition brief
                                      // (`planning/vd-character-full-body-framing/
                                      // plan.md` C5; it used to be dropped here).
                                      ...((
                                        customInstructionByCharacter[
                                          selectedCharacter.characterId
                                        ] ?? ""
                                      ).trim()
                                        ? {
                                            customInstruction: (
                                              customInstructionByCharacter[
                                                selectedCharacter.characterId
                                              ] ?? ""
                                            ).trim(),
                                          }
                                        : {}),
                                      // Always sent — see the matching comment on
                                      // `generatePortraitCandidateBatchMutation.mutate` above.
                                      selectedImageModelId,
                                      // Sheets retain the established identity
                                      // reference behavior; only main portrait
                                      // regeneration defaults to no reference.
                                      referencePolicy: "auto",
                                      ...(imageModelUsesMcp && mcpConnectionId
                                        ? { mcpConnectionId }
                                        : {}),
                                      ...(imageModelUsesMcp &&
                                      mcpConnectionId &&
                                      mcpSharedGroupId != null
                                        ? { sharedGroupId: mcpSharedGroupId }
                                        : {}),
                                      ...(imageModelUsesHermes &&
                                      hermesConnectionId
                                        ? { hermesConnectionId }
                                        : {}),
                                      // Reference-image-picker (Phase D3) — same
                                      // override/omit rule as `generateImageMutation`
                                      // above.
                                      ...(referenceOverrideByCharacter[
                                        selectedCharacter.characterId
                                      ]
                                        ? {
                                            referenceAssetLinkId:
                                              referenceOverrideByCharacter[
                                                selectedCharacter.characterId
                                              ],
                                          }
                                        : {}),
                                    })
                                );
                              }}
                              data-testid="vd-generate-character-sheet"
                            >
                              {isSheetGeneratingFor(
                                selectedCharacter.characterId
                              ) ? (
                                <Loader2
                                  aria-hidden="true"
                                  className="h-3.5 w-3.5 animate-spin"
                                />
                              ) : (
                                <Grid3x3
                                  aria-hidden="true"
                                  className="h-3.5 w-3.5"
                                />
                              )}
                              {t(
                                lang,
                                "สร้างชีทตัวละคร",
                                "Generate character sheet"
                              )}
                            </Button>
                            {videoSafeStartFramesEnabled && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="gap-2"
                                disabled={
                                  mutating ||
                                  isAnglePackGeneratingFor(
                                    selectedCharacter.characterId
                                  ) ||
                                  isSheetGeneratingFor(
                                    selectedCharacter.characterId
                                  ) ||
                                  !selectedImageModelId
                                }
                                title={t(
                                  lang,
                                  "สร้างภาพอ้างอิงหน้า/ซ้ายสามส่วน/ขวาสามส่วน แล้วอนุมัติแยกแต่ละช่อง",
                                  "Generate front, left 3/4, and right 3/4 identity references for separate approval."
                                )}
                                onClick={() => {
                                  if (!requireModelSelected()) return;
                                  if (!requireMcpConnectionOrToast()) return;
                                  if (!requireHermesConnectionOrToast()) return;
                                  confirmCharacterCreditAction(
                                    selectedCharacter.characterId,
                                    t(
                                      lang,
                                      "ยืนยันสร้างชุดมุมตัวละคร",
                                      "Confirm character angle-pack generation"
                                    ),
                                    t(
                                      lang,
                                      "การสร้างชุดมุมตัวละครใช้ AI และอาจหักเครดิต ต้องการดำเนินการต่อหรือไม่?",
                                      "Generating character reference angles uses AI and may spend credits. Continue?"
                                    ),
                                    t(
                                      lang,
                                      "สร้างชุดมุม",
                                      "Generate angle pack"
                                    ),
                                    () =>
                                      generateAnglePackMutation.mutate({
                                        seriesId,
                                        characterId:
                                          selectedCharacter.characterId,
                                        selectedImageModelId,
                                        ...(selectedEditImageModelId
                                          ? { selectedEditImageModelId }
                                          : {}),
                                        ...(imageModelUsesMcp && mcpConnectionId
                                          ? { mcpConnectionId }
                                          : {}),
                                        ...(imageModelUsesMcp &&
                                        mcpConnectionId &&
                                        mcpSharedGroupId != null
                                          ? {
                                              sharedGroupId: mcpSharedGroupId,
                                            }
                                          : {}),
                                        ...(imageModelUsesHermes &&
                                        hermesConnectionId
                                          ? { hermesConnectionId }
                                          : {}),
                                        ...(referenceOverrideByCharacter[
                                          selectedCharacter.characterId
                                        ]
                                          ? {
                                              referenceAssetLinkId:
                                                referenceOverrideByCharacter[
                                                  selectedCharacter.characterId
                                                ],
                                            }
                                          : {}),
                                      })
                                  );
                                }}
                                data-testid="vd-generate-character-angle-pack"
                              >
                                {isAnglePackGeneratingFor(
                                  selectedCharacter.characterId
                                ) ? (
                                  <Loader2
                                    aria-hidden="true"
                                    className="h-3.5 w-3.5 animate-spin"
                                  />
                                ) : (
                                  <ScanFace
                                    aria-hidden="true"
                                    className="h-3.5 w-3.5"
                                  />
                                )}
                                {t(
                                  lang,
                                  "สร้างชุดมุม 3 มุม",
                                  "Generate 3-angle pack"
                                )}
                              </Button>
                            )}
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <span>{t(lang, "ภาษา:", "Language:")}</span>
                              <button
                                type="button"
                                className={cn(
                                  "rounded px-1.5 py-0.5",
                                  sheetLanguage === "en"
                                    ? "bg-primary text-primary-foreground"
                                    : "hover:bg-muted"
                                )}
                                onClick={() => setSheetLanguage("en")}
                                data-testid="vd-sheet-language-en"
                              >
                                EN
                              </button>
                              <button
                                type="button"
                                className={cn(
                                  "rounded px-1.5 py-0.5",
                                  sheetLanguage === "th"
                                    ? "bg-primary text-primary-foreground"
                                    : "hover:bg-muted"
                                )}
                                onClick={() => setSheetLanguage("th")}
                                data-testid="vd-sheet-language-th"
                              >
                                TH
                              </button>
                            </div>
                          </div>
                        )}

                        {characterPromptJobQuery.data?.waitingReason ===
                          "provider_capacity" &&
                          characterPromptJob?.characterId ===
                            selectedCharacter.characterId && (
                            <div
                              className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
                              role="status"
                              aria-live="polite"
                              data-testid="vd-character-prompt-capacity-waiting"
                            >
                              <Clock
                                aria-hidden="true"
                                className="mt-0.5 h-4 w-4 shrink-0"
                              />
                              <span>
                                {t(
                                  lang,
                                  "งาน prompt อยู่ในคิวและกำลังรอ capacity ของผู้ให้บริการ ระบบจะทำต่ออัตโนมัติ ไม่ต้องกดสร้างซ้ำ",
                                  "The prompt job is queued while the provider capacity is busy. It will continue automatically; do not submit it again."
                                )}
                              </span>
                            </div>
                          )}

                        {/* Prompt-preview confirmation (fix-round-3, Section C) — also
                      rendered here (not just in the roster card grid) since this
                      action button set lives in the detail column and the
                      matching card may be scrolled out of view. */}
                        {pendingCharacterPromptPreview &&
                          pendingCharacterPromptPreview.characterId ===
                            selectedCharacter.characterId && (
                            <MediaPromptPreview
                              prompt={
                                pendingCharacterPromptPreview.portraitPrompt
                              }
                              skillName={t(
                                lang,
                                "สร้างภาพตัวละคร",
                                "Generate character image"
                              )}
                              skillCategory="image_generation"
                              mediaParams={{
                                ...(pendingCharacterPromptPreview.model
                                  ? {
                                      model:
                                        pendingCharacterPromptPreview.model,
                                    }
                                  : {}),
                                ...(pendingCharacterPromptPreview.negativePrompt
                                  ? {
                                      negativePrompt:
                                        pendingCharacterPromptPreview.negativePrompt,
                                    }
                                  : {}),
                              }}
                              isExecuting={generateImageMutation.isPending}
                              onConfirm={handleCharacterPromptConfirm}
                              onCancel={handleCharacterPromptCancel}
                            />
                          )}

                        {pendingCharacterPromptPreview &&
                          pendingCharacterPromptPreview.characterId ===
                            selectedCharacter.characterId && (
                            <PortraitLeadBeautyWarnings
                              warnings={pendingCharacterPromptPreview.warnings}
                              heading={t(
                                lang,
                                "AI ยอมรับ prompt นี้แม้ตัวนำยังดูธรรมดาไปหน่อย — แก้ prompt หรือสร้างใหม่ได้ถ้าอยากให้เด่นกว่านี้",
                                "AI accepted this prompt even though the lead reads a little plain — edit the prompt or regenerate for a more camera-ready look."
                              )}
                            />
                          )}

                        {selectedPortraitCandidateBatches.length > 0 &&
                          (() => {
                            const candidateResults = (
                              <section
                                ref={
                                  candidateResultsPlacement ===
                                  "reference-inline"
                                    ? portraitCandidateResultsRef
                                    : undefined
                                }
                                tabIndex={
                                  candidateResultsPlacement ===
                                  "reference-inline"
                                    ? -1
                                    : undefined
                                }
                                data-testid={
                                  candidateResultsPlacement ===
                                  "reference-inline"
                                    ? "vd-reference-casting-results"
                                    : undefined
                                }
                                className="rounded-xl border bg-card p-3"
                                aria-label={t(
                                  lang,
                                  "ตัวเลือกภาพหลักของตัวละคร",
                                  "Character primary portrait candidates"
                                )}
                                aria-live="polite"
                              >
                                <header className="mb-3">
                                  <h3 className="text-sm font-semibold">
                                    {t(
                                      lang,
                                      "เลือกใบหน้าที่จะใช้เป็นตัวละครหลัก",
                                      "Choose the face to become this character"
                                    )}
                                  </h3>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {t(
                                      lang,
                                      selectedPortraitCandidateBatches.some(
                                        batch => batch.referenceGuided
                                      )
                                        ? "ทุกภาพเป็นคนใหม่สำหรับ casting ไม่ใช่บุคคลในภาพอ้างอิง การเลือกมีผลเฉพาะการตั้งภาพหลักของตัวละครนี้"
                                        : "ทุกภาพเป็นคนละใบหน้า แต่รักษาคุณภาพ เสน่ห์ และภาษาภาพระดับเดียวกัน การเลือกจะมีผลกับงานสร้างครั้งถัดไปเท่านั้น",
                                      selectedPortraitCandidateBatches.some(
                                        batch => batch.referenceGuided
                                      )
                                        ? "Every option is a new fictional casting person, not anyone in the references. Choosing one only sets this character's primary portrait."
                                        : "Every option is a different person with the same visual quality and magnetism. Your choice affects future generations only."
                                    )}
                                  </p>
                                </header>

                                {selectedPortraitCandidateBatches.map(
                                  (batch, batchIndex) => {
                                    const activeBatch =
                                      portraitCandidateBatches[
                                        selectedCharacter.characterId
                                      ];
                                    const isActive =
                                      activeBatch?.batchId === batch.batchId;
                                    const isPreviewOnly =
                                      isActive &&
                                      batch.candidates.every(
                                        candidate =>
                                          candidate.status === "previewed"
                                      );
                                    // Once this batch has a winner, the faces the user
                                    // did NOT pick collapse behind a toggle — they were
                                    // showing up next to the chosen one everywhere and
                                    // made "which face is this character?" genuinely hard
                                    // to answer at a glance.
                                    const candidateVisibility =
                                      resolvePortraitCandidateVisibility({
                                        candidates: batch.candidates,
                                        expanded: expandedCandidateBatchIds.has(
                                          batch.batchId
                                        ),
                                      });
                                    return (
                                      <section
                                        key={batch.batchId}
                                        className={cn(
                                          "py-3",
                                          batchIndex > 0 && "border-t"
                                        )}
                                        aria-label={
                                          isActive
                                            ? t(
                                                lang,
                                                "ชุดตัวเลือกล่าสุด",
                                                "Newest candidate batch"
                                              )
                                            : t(
                                                lang,
                                                "ตัวเลือกที่บันทึกไว้",
                                                "Saved alternatives"
                                              )
                                        }
                                      >
                                        <header className="mb-2 flex flex-wrap items-start justify-between gap-2">
                                          <span className="text-xs font-medium">
                                            {isActive
                                              ? t(
                                                  lang,
                                                  "ชุดล่าสุด",
                                                  "Newest batch"
                                                )
                                              : t(
                                                  lang,
                                                  "ตัวเลือกก่อนหน้า",
                                                  "Earlier alternatives"
                                                )}
                                          </span>
                                          {batch.model && (
                                            <Badge variant="outline">
                                              {batch.model}
                                            </Badge>
                                          )}
                                        </header>
                                        {batch.sharedVisualLanguage && (
                                          <p className="mb-3 text-xs text-muted-foreground">
                                            {batch.sharedVisualLanguage}
                                          </p>
                                        )}
                                        {batch.castingAgeProfile && (
                                          <p className="mb-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100">
                                            {t(
                                              lang,
                                              `ช่วงอายุภาพ casting: ${batch.castingAgeProfile.label} ปี — ใช้ช่วงเดียวกันทุกตัวเลือก (${batch.castingAgeProfile.rationale ?? "อิงจาก DNA/บทบาทของตัวละคร"})`,
                                              `Casting age band: ${batch.castingAgeProfile.label} years — shared by every candidate (${batch.castingAgeProfile.rationale ?? "derived from the character DNA/role"}).`
                                            )}
                                          </p>
                                        )}

                                        {isActive && (
                                          <PortraitLeadBeautyWarnings
                                            warnings={batch.warnings}
                                            heading={t(
                                              lang,
                                              "AI ยอมรับภาพชุดนี้แม้ prompt ตัวนำยังดูธรรมดาไปหน่อย — สร้างใหม่หรือแก้ prompt ได้ถ้าอยากให้เด่นกว่านี้",
                                              "AI accepted this batch even though the lead prompt reads a little plain — regenerate or edit the prompt for a more camera-ready look."
                                            )}
                                          />
                                        )}

                                        <Grid
                                          columns={{
                                            minWidth: 142,
                                            max: 5,
                                            repeat: "fit",
                                          }}
                                          gap={3}
                                        >
                                          {candidateVisibility.visible.map(
                                            candidate => {
                                              const isSelected =
                                                candidate.status === "selected";
                                              const canSelect =
                                                Boolean(candidate.imageUrl) &&
                                                [
                                                  "completed",
                                                  "selected",
                                                  "superseded",
                                                ].includes(candidate.status);
                                              return (
                                                <Card
                                                  key={candidate.assetLinkId}
                                                  className={cn(
                                                    "overflow-hidden",
                                                    isSelected &&
                                                      "ring-2 ring-primary"
                                                  )}
                                                >
                                                  <AspectRatio ratio={9 / 16}>
                                                    {candidate.imageUrl ? (
                                                      <button
                                                        type="button"
                                                        className="h-full w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
                                                        onClick={() =>
                                                          setLightboxImage({
                                                            src: candidate.imageUrl!,
                                                            alt: t(
                                                              lang,
                                                              `ตัวเลือกใบหน้าที่ ${candidate.index + 1}`,
                                                              `Face candidate ${candidate.index + 1}`
                                                            ),
                                                          })
                                                        }
                                                        aria-label={t(
                                                          lang,
                                                          `ดูตัวเลือกที่ ${candidate.index + 1} แบบขยาย`,
                                                          `View candidate ${candidate.index + 1} full size`
                                                        )}
                                                      >
                                                        <AuthenticatedMediaImage
                                                          src={
                                                            candidate.imageUrl
                                                          }
                                                          alt={t(
                                                            lang,
                                                            `ตัวเลือกใบหน้าที่ ${candidate.index + 1}`,
                                                            `Face candidate ${candidate.index + 1}`
                                                          )}
                                                          className="h-full w-full object-cover"
                                                        />
                                                      </button>
                                                    ) : (
                                                      <section
                                                        className="flex h-full items-center justify-center bg-muted p-3 text-center"
                                                        aria-busy={
                                                          candidate.status ===
                                                            "queued" ||
                                                          candidate.status ===
                                                            "submitting"
                                                        }
                                                      >
                                                        {candidate.status ===
                                                        "failed" ? (
                                                          <p
                                                            role="alert"
                                                            className="text-xs text-destructive"
                                                          >
                                                            {candidate.errorMessage ??
                                                              t(
                                                                lang,
                                                                "สร้างภาพไม่สำเร็จ",
                                                                "Generation failed"
                                                              )}
                                                          </p>
                                                        ) : candidate.status ===
                                                          "previewed" ? (
                                                          <p className="text-xs text-muted-foreground">
                                                            {candidate.visualIdentitySummary ??
                                                              t(
                                                                lang,
                                                                "พร้อมสร้างภาพ",
                                                                "Ready to render"
                                                              )}
                                                          </p>
                                                        ) : (
                                                          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                                                            <Loader2
                                                              aria-hidden="true"
                                                              className="h-4 w-4 animate-spin"
                                                            />
                                                            {t(
                                                              lang,
                                                              "กำลังสร้าง…",
                                                              "Generating…"
                                                            )}
                                                          </span>
                                                        )}
                                                      </section>
                                                    )}
                                                  </AspectRatio>
                                                  <CardContent className="space-y-2 p-3">
                                                    <header className="flex items-center justify-between gap-2">
                                                      <span className="text-xs font-semibold">
                                                        {t(
                                                          lang,
                                                          `ตัวเลือก ${candidate.index + 1}`,
                                                          `Option ${candidate.index + 1}`
                                                        )}
                                                      </span>
                                                      <Badge
                                                        variant={
                                                          isSelected
                                                            ? "default"
                                                            : "secondary"
                                                        }
                                                      >
                                                        {isSelected
                                                          ? t(
                                                              lang,
                                                              "ภาพหลัก",
                                                              "Primary"
                                                            )
                                                          : candidate.status ===
                                                              "failed"
                                                            ? t(
                                                                lang,
                                                                "ล้มเหลว",
                                                                "Failed"
                                                              )
                                                            : candidate.status ===
                                                                "previewed"
                                                              ? t(
                                                                  lang,
                                                                  "พร้อมสร้าง",
                                                                  "Ready"
                                                                )
                                                              : candidate.status ===
                                                                    "queued" ||
                                                                  candidate.status ===
                                                                    "submitting"
                                                                ? t(
                                                                    lang,
                                                                    "กำลังสร้าง",
                                                                    "Generating"
                                                                  )
                                                                : t(
                                                                    lang,
                                                                    "เลือกได้",
                                                                    "Available"
                                                                  )}
                                                      </Badge>
                                                    </header>
                                                    {candidate.portraitPrompt && (
                                                      <div className="space-y-1">
                                                        {/* `portraitPrompt` is the FULL prompt
                                              actually sent to the image model (the
                                              router submits it verbatim); the text
                                              in the card body above is only the
                                              human-readable `visualIdentitySummary`.
                                              Clamped to 4 lines for layout — the
                                              copy button always copies the FULL
                                              string, and stays available even after
                                              generation so the prompt can be reused
                                              in another tool. */}
                                                        {isPreviewOnly && (
                                                          <p className="line-clamp-4 text-[11px] text-muted-foreground">
                                                            {
                                                              candidate.portraitPrompt
                                                            }
                                                          </p>
                                                        )}
                                                        <Button
                                                          type="button"
                                                          size="sm"
                                                          variant="ghost"
                                                          className="h-6 w-full gap-1 text-[11px] text-muted-foreground"
                                                          onClick={async () => {
                                                            try {
                                                              await navigator.clipboard.writeText(
                                                                candidate.portraitPrompt ??
                                                                  ""
                                                              );
                                                              toast.success(
                                                                t(
                                                                  lang,
                                                                  "คัดลอก prompt เต็มแล้ว",
                                                                  "Full prompt copied"
                                                                )
                                                              );
                                                            } catch {
                                                              toast.error(
                                                                t(
                                                                  lang,
                                                                  "คัดลอกไม่สำเร็จ",
                                                                  "Copy failed"
                                                                )
                                                              );
                                                            }
                                                          }}
                                                        >
                                                          <Copy
                                                            aria-hidden="true"
                                                            className="h-3 w-3"
                                                          />
                                                          {t(
                                                            lang,
                                                            "คัดลอก prompt เต็ม",
                                                            "Copy full prompt"
                                                          )}
                                                        </Button>
                                                      </div>
                                                    )}
                                                    <Button
                                                      type="button"
                                                      size="sm"
                                                      variant={
                                                        isSelected
                                                          ? "secondary"
                                                          : "default"
                                                      }
                                                      className="w-full"
                                                      role="radio"
                                                      aria-checked={isSelected}
                                                      aria-pressed={isSelected}
                                                      disabled={
                                                        !canSelect ||
                                                        isSelected ||
                                                        selectPortraitCandidateMutation.isPending
                                                      }
                                                      onClick={() =>
                                                        selectPortraitCandidateMutation.mutate(
                                                          {
                                                            seriesId,
                                                            characterId:
                                                              selectedCharacter.characterId,
                                                            assetLinkId:
                                                              candidate.assetLinkId,
                                                          }
                                                        )
                                                      }
                                                    >
                                                      {isSelected
                                                        ? t(
                                                            lang,
                                                            "ใช้อยู่เป็นภาพหลัก",
                                                            "Current primary"
                                                          )
                                                        : t(
                                                            lang,
                                                            "ใช้ภาพนี้เป็นภาพหลัก",
                                                            "Use as primary"
                                                          )}
                                                    </Button>
                                                    {/* Set A fix #3: per-candidate
                                            Cancel/Retry for a stuck
                                            queued/submitting or a terminal
                                            failed candidate — the batch
                                            footer below only covers the
                                            pre-submission (`isPreviewOnly`)
                                            state. */}
                                                    {[
                                                      "queued",
                                                      "submitting",
                                                      "failed",
                                                    ].includes(
                                                      candidate.status
                                                    ) && (
                                                      <div className="flex gap-2">
                                                        <Button
                                                          type="button"
                                                          size="sm"
                                                          variant="outline"
                                                          className="flex-1"
                                                          disabled={
                                                            (deleteAssetMutation.isPending &&
                                                              deleteAssetMutation
                                                                .variables
                                                                ?.assetLinkId ===
                                                                candidate.assetLinkId) ||
                                                            retryingPortraitCandidateAssetIds.has(
                                                              candidate.assetLinkId
                                                            )
                                                          }
                                                          onClick={() =>
                                                            cancelPortraitCandidate(
                                                              selectedCharacter.characterId,
                                                              candidate.assetLinkId
                                                            )
                                                          }
                                                        >
                                                          {deleteAssetMutation.isPending &&
                                                          deleteAssetMutation
                                                            .variables
                                                            ?.assetLinkId ===
                                                            candidate.assetLinkId ? (
                                                            <Loader2
                                                              aria-hidden="true"
                                                              className="h-3.5 w-3.5 animate-spin"
                                                            />
                                                          ) : (
                                                            t(
                                                              lang,
                                                              "ยกเลิก",
                                                              "Cancel"
                                                            )
                                                          )}
                                                        </Button>
                                                        {candidate.status ===
                                                          "failed" && (
                                                          <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="secondary"
                                                            className="flex-1"
                                                            disabled={
                                                              retryingPortraitCandidateAssetIds.has(
                                                                candidate.assetLinkId
                                                              ) ||
                                                              (deleteAssetMutation.isPending &&
                                                                deleteAssetMutation
                                                                  .variables
                                                                  ?.assetLinkId ===
                                                                  candidate.assetLinkId)
                                                            }
                                                            onClick={() =>
                                                              retryPortraitCandidate(
                                                                selectedCharacter.characterId,
                                                                candidate.assetLinkId,
                                                                batch.referenceGuided
                                                              )
                                                            }
                                                          >
                                                            {retryingPortraitCandidateAssetIds.has(
                                                              candidate.assetLinkId
                                                            ) ? (
                                                              <Loader2
                                                                aria-hidden="true"
                                                                className="h-3.5 w-3.5 animate-spin"
                                                              />
                                                            ) : (
                                                              t(
                                                                lang,
                                                                "ลองใหม่",
                                                                "Retry"
                                                              )
                                                            )}
                                                          </Button>
                                                        )}
                                                      </div>
                                                    )}
                                                  </CardContent>
                                                </Card>
                                              );
                                            }
                                          )}
                                        </Grid>

                                        {candidateVisibility.isResolved &&
                                          batch.candidates.length > 1 && (
                                            <button
                                              type="button"
                                              className="mt-2 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                                              onClick={() =>
                                                toggleCandidateBatchExpanded(
                                                  batch.batchId
                                                )
                                              }
                                            >
                                              {candidateVisibility.hiddenCount >
                                              0
                                                ? t(
                                                    lang,
                                                    `แสดงตัวเลือกที่ไม่ได้เลือก (${candidateVisibility.hiddenCount})`,
                                                    `Show ${candidateVisibility.hiddenCount} unpicked option${
                                                      candidateVisibility.hiddenCount ===
                                                      1
                                                        ? ""
                                                        : "s"
                                                    }`
                                                  )
                                                : t(
                                                    lang,
                                                    "ซ่อนตัวเลือกที่ไม่ได้เลือก",
                                                    "Hide unpicked options"
                                                  )}
                                            </button>
                                          )}

                                        {isPreviewOnly && (
                                          <footer className="mt-3 flex flex-wrap items-center gap-2">
                                            <Button
                                              type="button"
                                              size="sm"
                                              onClick={() =>
                                                handlePortraitCandidateBatchConfirm(
                                                  selectedCharacter.characterId
                                                )
                                              }
                                              disabled={
                                                generatePortraitCandidateBatchMutation.isPending ||
                                                !selectedImageModelId
                                              }
                                              title={
                                                selectedImageModelId
                                                  ? undefined
                                                  : t(
                                                      lang,
                                                      "เลือกโมเดลภาพก่อนสร้าง",
                                                      "Select an image model first"
                                                    )
                                              }
                                            >
                                              {generatePortraitCandidateBatchMutation.isPending && (
                                                <Loader2
                                                  aria-hidden="true"
                                                  className="mr-2 h-4 w-4 animate-spin"
                                                />
                                              )}
                                              {t(
                                                lang,
                                                `สร้างทั้ง ${batch.candidates.length} ภาพ`,
                                                `Generate all ${batch.candidates.length} images`
                                              )}
                                            </Button>
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant="ghost"
                                              onClick={() =>
                                                handlePortraitCandidateBatchCancel(
                                                  selectedCharacter.characterId
                                                )
                                              }
                                            >
                                              {t(lang, "ยกเลิก", "Cancel")}
                                            </Button>
                                            <span className="text-xs text-muted-foreground">
                                              {t(
                                                lang,
                                                "Prompt และ DNA ชุดนี้อ่านอย่างเดียว หากต้องการเปลี่ยนรายละเอียด ให้แก้ช่องคำอธิบายแล้วสร้าง Preview ใหม่",
                                                "This prompt and DNA batch is read-only. Change the brief and generate a new preview to revise it."
                                              )}
                                            </span>
                                          </footer>
                                        )}
                                      </section>
                                    );
                                  }
                                )}
                              </section>
                            );
                            if (
                              candidateResultsPlacement ===
                                "reference-inline" &&
                              portraitCandidateResultsMount
                            ) {
                              return createPortal(
                                candidateResults,
                                portraitCandidateResultsMount
                              );
                            }
                            return candidateResults;
                          })()}

                        {(() => {
                          const portrait =
                            generatedImageUrls[selectedCharacter.characterId];
                          const turnaround =
                            generatedTurnaroundUrls[
                              selectedCharacter.characterId
                            ];
                          const sheet =
                            generatedSheetUrls[selectedCharacter.characterId];
                          if (!portrait && !turnaround && !sheet) return null;
                          return (
                            <div className="mt-2 flex flex-wrap gap-4">
                              {portrait && (
                                <div className="flex flex-col items-center gap-1">
                                  <button
                                    type="button"
                                    aria-label={t(
                                      lang,
                                      "ดูภาพขยาย",
                                      "View full-size image"
                                    )}
                                    onClick={() =>
                                      setLightboxImage({
                                        src: portrait.imageUrl,
                                        alt: t(
                                          lang,
                                          "ภาพตัวละครที่สร้างขึ้น",
                                          "Generated character portrait"
                                        ),
                                      })
                                    }
                                    className="rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
                                  >
                                    {/* Portrait is a known 9:16 vertical render (the
                                    prompt always requests "9:16") — a fixed
                                    aspect box lets it display bigger without
                                    layout jump before it loads. */}
                                    <AuthenticatedMediaImage
                                      src={portrait.imageUrl}
                                      alt={t(
                                        lang,
                                        "ภาพตัวละครที่สร้างขึ้น",
                                        "Generated character portrait"
                                      )}
                                      className="aspect-[9/16] w-36 rounded-md border border-border object-cover"
                                    />
                                  </button>
                                  <span className="text-[10px]">
                                    {t(lang, "ภาพตัวละคร", "Portrait")}
                                  </span>
                                </div>
                              )}
                              {turnaround && (
                                <div className="flex flex-col items-center gap-1">
                                  <button
                                    type="button"
                                    aria-label={t(
                                      lang,
                                      "ดูภาพขยาย",
                                      "View full-size image"
                                    )}
                                    onClick={() =>
                                      setLightboxImage({
                                        src: turnaround.imageUrl,
                                        alt: t(
                                          lang,
                                          "ชีทตัวละคร (มุมมองหลายด้าน)",
                                          "Character sheet (multi-angle turnaround)"
                                        ),
                                      })
                                    }
                                    className="rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
                                  >
                                    {/* Turnaround/character-sheet is a multi-angle
                                    composite, not 9:16 — let it keep its own
                                    aspect ratio (`object-contain`) instead of
                                    force-cropping it into a portrait box. */}
                                    <AuthenticatedMediaImage
                                      src={turnaround.imageUrl}
                                      alt={t(
                                        lang,
                                        "ชีทตัวละคร (มุมมองหลายด้าน)",
                                        "Character sheet (multi-angle turnaround)"
                                      )}
                                      className="max-h-56 max-w-56 rounded-md border border-border object-contain"
                                    />
                                  </button>
                                  <span className="text-[10px]">
                                    {t(lang, "ชีทตัวละคร", "Character sheet")}
                                  </span>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-6 gap-1 px-2 text-[10px]"
                                    disabled={
                                      splittingResultKey ===
                                      `turnaround::${selectedCharacter.characterId}`
                                    }
                                    onClick={() =>
                                      void splitGeneratedResultIntoTiles(
                                        selectedCharacter.characterId,
                                        "turnaround",
                                        turnaround.imageUrl
                                      )
                                    }
                                  >
                                    {splittingResultKey ===
                                    `turnaround::${selectedCharacter.characterId}` ? (
                                      <Loader2
                                        aria-hidden="true"
                                        className="h-3 w-3 animate-spin"
                                      />
                                    ) : (
                                      <Grid3x3
                                        aria-hidden="true"
                                        className="h-3 w-3"
                                      />
                                    )}
                                    {t(lang, "ตัดภาพ 3x3", "Split 3x3")}
                                  </Button>
                                  {turnaroundSplitTiles[
                                    selectedCharacter.characterId
                                  ] && (
                                    <div className="mt-1 grid grid-cols-3 gap-1">
                                      {turnaroundSplitTiles[
                                        selectedCharacter.characterId
                                      ].map(tile => (
                                        <button
                                          key={tile.index}
                                          type="button"
                                          aria-label={t(
                                            lang,
                                            `ดูภาพขยายช่องที่ ${tile.index + 1}`,
                                            `View full-size tile ${tile.index + 1}`
                                          )}
                                          onClick={() =>
                                            setLightboxImage({
                                              src: tile.dataUrl,
                                              alt: `Tile ${tile.index + 1}`,
                                            })
                                          }
                                          className="rounded border border-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
                                        >
                                          <AuthenticatedMediaImage
                                            src={tile.dataUrl}
                                            alt=""
                                            className="h-10 w-10 rounded object-cover"
                                          />
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                              {sheet && (
                                <div className="flex flex-col items-center gap-1">
                                  <button
                                    type="button"
                                    aria-label={t(
                                      lang,
                                      "ดูภาพขยาย",
                                      "View full-size image"
                                    )}
                                    onClick={() =>
                                      setLightboxImage({
                                        src: sheet.imageUrl,
                                        alt: t(
                                          lang,
                                          "ชีทตัวละคร (Design Bible)",
                                          "Character sheet (Design Bible)"
                                        ),
                                      })
                                    }
                                    className="rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
                                  >
                                    <AuthenticatedMediaImage
                                      src={sheet.imageUrl}
                                      alt={t(
                                        lang,
                                        "ชีทตัวละคร (Design Bible)",
                                        "Character sheet (Design Bible)"
                                      )}
                                      className="max-h-56 max-w-56 rounded-md border border-border object-contain"
                                    />
                                  </button>
                                  <span className="text-[10px]">
                                    {t(
                                      lang,
                                      "ชีทตัวละคร (Design Bible)",
                                      "Character sheet (Design Bible)"
                                    )}
                                  </span>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-6 gap-1 px-2 text-[10px]"
                                    disabled={
                                      splittingResultKey ===
                                      `sheet::${selectedCharacter.characterId}`
                                    }
                                    onClick={() =>
                                      void splitGeneratedResultIntoTiles(
                                        selectedCharacter.characterId,
                                        "sheet",
                                        sheet.imageUrl
                                      )
                                    }
                                  >
                                    {splittingResultKey ===
                                    `sheet::${selectedCharacter.characterId}` ? (
                                      <Loader2
                                        aria-hidden="true"
                                        className="h-3 w-3 animate-spin"
                                      />
                                    ) : (
                                      <Grid3x3
                                        aria-hidden="true"
                                        className="h-3 w-3"
                                      />
                                    )}
                                    {t(lang, "ตัดภาพ 3x3", "Split 3x3")}
                                  </Button>
                                  {sheetSplitTiles[
                                    selectedCharacter.characterId
                                  ] && (
                                    <div className="mt-1 grid grid-cols-3 gap-1">
                                      {sheetSplitTiles[
                                        selectedCharacter.characterId
                                      ].map(tile => (
                                        <button
                                          key={tile.index}
                                          type="button"
                                          aria-label={t(
                                            lang,
                                            `ดูภาพขยายช่องที่ ${tile.index + 1}`,
                                            `View full-size tile ${tile.index + 1}`
                                          )}
                                          onClick={() =>
                                            setLightboxImage({
                                              src: tile.dataUrl,
                                              alt: `Tile ${tile.index + 1}`,
                                            })
                                          }
                                          className="rounded border border-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
                                        >
                                          <AuthenticatedMediaImage
                                            src={tile.dataUrl}
                                            alt=""
                                            className="h-10 w-10 rounded object-cover"
                                          />
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* W12-B voice chain — per-character voice casting. Gated on
                    `voiceChainEnabled` (flag off -> byte-identical, nothing
                    below renders at all). */}
                {voiceChainEnabled && (
                  <VerticalDramaCharacterVoiceCastingCard
                    lang={lang}
                    characterName={selectedCharacter.name}
                    readOnly={readOnly}
                    voiceConfig={selectedCharacterVoiceConfig}
                    voices={voiceCatalog}
                    voicesLoading={voiceCatalogQuery.isLoading}
                    casting={
                      setVoiceConfigMutation.isPending &&
                      setVoiceConfigMutation.variables?.characterId ===
                        selectedCharacter.characterId &&
                      setVoiceConfigMutation.variables?.voiceConfig !== null
                    }
                    clearing={
                      setVoiceConfigMutation.isPending &&
                      setVoiceConfigMutation.variables?.characterId ===
                        selectedCharacter.characterId &&
                      setVoiceConfigMutation.variables?.voiceConfig === null
                    }
                    onCast={entry =>
                      handleCastVoice(selectedCharacter.characterId, entry)
                    }
                    onClear={() =>
                      handleClearVoice(selectedCharacter.characterId)
                    }
                    onPreview={() =>
                      handlePreviewVoice(selectedCharacter.characterId)
                    }
                    previewing={previewingVoiceCharacterIds.has(
                      selectedCharacter.characterId
                    )}
                    previewAudioUrl={
                      voicePreviewUrlByCharacterId[
                        selectedCharacter.characterId
                      ] ?? null
                    }
                    previewCreditCost={
                      voicePreviewCreditCostByCharacterId[
                        selectedCharacter.characterId
                      ] ?? null
                    }
                    speechProfile={selectedCharacterSpeechProfile}
                    onSaveStyleHints={
                      characterProfilesEnabled
                        ? hints =>
                            handleSaveStyleHints(
                              selectedCharacter.characterId,
                              selectedCharacterVoiceConfig,
                              hints
                            )
                        : undefined
                    }
                    savingStyleHints={
                      setVoiceConfigMutation.isPending &&
                      setVoiceConfigMutation.variables?.characterId ===
                        selectedCharacter.characterId &&
                      setVoiceConfigMutation.variables?.voiceConfig !== null
                    }
                  />
                )}

                {/* F132F `verticalDramaCharacterProfiles` (spec 132 §7.3,
                    added 2026-07-09) — speech-profile editing sub-section.
                    Gated on `characterProfilesEnabled` (flag off ->
                    byte-identical, nothing below renders at all). */}
                {characterProfilesEnabled &&
                  (() => {
                    const characterId = selectedCharacter.characterId;
                    const form = speechProfileFormFor(characterId);
                    const saving =
                      updateCharacterMutation.isPending &&
                      updateCharacterMutation.variables?.characterId ===
                        characterId;
                    return (
                      <Card data-testid="vd-speech-profile-card">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">
                            {t(lang, "โปรไฟล์เสียงพูด", "Speech profile")}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-3">
                          {!selectedCharacterSpeechProfile && (
                            <p
                              className="text-xs text-muted-foreground"
                              data-testid="vd-speech-profile-empty-hint"
                            >
                              {t(
                                lang,
                                "ยังไม่มีโปรไฟล์เสียงพูด — กรอกด้านล่างเพื่อสร้างใหม่",
                                "No profile yet — fill in the fields below to create one"
                              )}
                            </p>
                          )}
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="flex flex-col gap-1.5">
                              <Label className="text-xs">
                                {t(lang, "ความเร็วในการพูด", "Speaking speed")}
                              </Label>
                              <Select
                                value={form.speakingSpeed}
                                onValueChange={value =>
                                  updateSpeechProfileForm(characterId, {
                                    speakingSpeed:
                                      value as VdSpeechProfileFormState["speakingSpeed"],
                                  })
                                }
                                disabled={readOnly}
                              >
                                <SelectTrigger className="h-9 text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {VD_SPEECH_PROFILE_SPEAKING_SPEEDS.map(
                                    value => (
                                      <SelectItem key={value} value={value}>
                                        {value}
                                      </SelectItem>
                                    )
                                  )}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <Label className="text-xs">
                                {t(lang, "ระดับคำศัพท์", "Vocabulary level")}
                              </Label>
                              <Select
                                value={form.vocabularyLevel}
                                onValueChange={value =>
                                  updateSpeechProfileForm(characterId, {
                                    vocabularyLevel:
                                      value as VdSpeechProfileFormState["vocabularyLevel"],
                                  })
                                }
                                disabled={readOnly}
                              >
                                <SelectTrigger className="h-9 text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {VD_SPEECH_PROFILE_VOCABULARY_LEVELS.map(
                                    value => (
                                      <SelectItem key={value} value={value}>
                                        {value}
                                      </SelectItem>
                                    )
                                  )}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <Label className="text-xs">
                                {t(
                                  lang,
                                  "ความยาวประโยคทั่วไป",
                                  "Typical sentence length"
                                )}
                              </Label>
                              <Select
                                value={form.typicalSentenceLength}
                                onValueChange={value =>
                                  updateSpeechProfileForm(characterId, {
                                    typicalSentenceLength:
                                      value as VdSpeechProfileFormState["typicalSentenceLength"],
                                  })
                                }
                                disabled={readOnly}
                              >
                                <SelectTrigger className="h-9 text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {VD_SPEECH_PROFILE_SENTENCE_LENGTHS.map(
                                    value => (
                                      <SelectItem key={value} value={value}>
                                        {value}
                                      </SelectItem>
                                    )
                                  )}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <Label className="text-xs">
                                {t(lang, "การใช้อุปมา", "Metaphor usage")}
                              </Label>
                              <Select
                                value={form.metaphorUsage}
                                onValueChange={value =>
                                  updateSpeechProfileForm(characterId, {
                                    metaphorUsage:
                                      value as VdSpeechProfileFormState["metaphorUsage"],
                                  })
                                }
                                disabled={readOnly}
                              >
                                <SelectTrigger className="h-9 text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {VD_SPEECH_PROFILE_METAPHOR_USAGE.map(
                                    value => (
                                      <SelectItem key={value} value={value}>
                                        {value}
                                      </SelectItem>
                                    )
                                  )}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <Label className="text-xs">
                              {t(lang, "อารมณ์หลัก", "Emotional default")}
                            </Label>
                            <Input
                              value={form.emotionalDefault}
                              disabled={readOnly}
                              placeholder={t(
                                lang,
                                "เช่น เย็นชาแต่แฝงความกังวล",
                                "e.g. brittle sarcasm masking fear"
                              )}
                              onChange={e =>
                                updateSpeechProfileForm(characterId, {
                                  emotionalDefault: e.target.value,
                                })
                              }
                            />
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <Label className="text-xs">
                              {t(
                                lang,
                                "หน้าที่ของบทพูดทั่วไป",
                                "Common line function"
                              )}
                            </Label>
                            <Input
                              value={form.commonLineFunction}
                              disabled={readOnly}
                              placeholder={t(
                                lang,
                                "เช่น กวนใจก่อนเข้าเรื่องจริง",
                                "e.g. deflects with humor then pivots to the real ask"
                              )}
                              onChange={e =>
                                updateSpeechProfileForm(characterId, {
                                  commonLineFunction: e.target.value,
                                })
                              }
                            />
                          </div>

                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="flex flex-col gap-1.5">
                              <Label className="text-xs">
                                {t(
                                  lang,
                                  "รูปแบบต้องห้าม (บรรทัดละ 1 รายการ)",
                                  "Forbidden style (one per line)"
                                )}
                              </Label>
                              <Textarea
                                rows={3}
                                value={form.forbiddenStyleText}
                                disabled={readOnly}
                                onChange={e =>
                                  updateSpeechProfileForm(characterId, {
                                    forbiddenStyleText: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <Label className="text-xs">
                                {t(
                                  lang,
                                  "คำพูดติดปาก (บรรทัดละ 1 รายการ)",
                                  "Signature phrases (one per line)"
                                )}
                              </Label>
                              <Textarea
                                rows={3}
                                value={form.signaturePhrasesText}
                                disabled={readOnly}
                                onChange={e =>
                                  updateSpeechProfileForm(characterId, {
                                    signaturePhrasesText: e.target.value,
                                  })
                                }
                              />
                            </div>
                          </div>

                          {!readOnly && (
                            <div>
                              <Button
                                type="button"
                                size="sm"
                                disabled={saving}
                                onClick={() =>
                                  handleSaveSpeechProfile(characterId)
                                }
                                data-testid="vd-speech-profile-save"
                              >
                                {saving ? (
                                  <Loader2
                                    aria-hidden="true"
                                    className="mr-2 h-3.5 w-3.5 animate-spin"
                                  />
                                ) : null}
                                {t(
                                  lang,
                                  "บันทึกโปรไฟล์เสียงพูด",
                                  "Save speech profile"
                                )}
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })()}

                {/* One dialog, two slots — `modelDialogTarget` decides which
                    selection it shows and which one `handleSelectImageModel`
                    writes back to. */}
                <ModelSelectorDialog
                  open={isModelDialogOpen}
                  onOpenChange={open =>
                    setModelDialogTarget(open ? modelDialogTarget : null)
                  }
                  models={imageModels}
                  selectedModelId={
                    modelDialogTarget === "edit"
                      ? selectedEditImageModelId
                      : selectedImageModelId
                  }
                  onSelect={handleSelectImageModel}
                  mediaType="image"
                  isLoading={imageModelsQuery.isLoading}
                  loadError={imageModelsQuery.isError}
                  onRetry={() => void imageModelsQuery.refetch()}
                />

                {/* MCP-connection picker — shown only when the selected image
                    model is MCP-transport (e.g. Higgsfield/Magnific), mirroring
                    `VerticalDramaEpisodePage.tsx`'s own row + guard toast. */}
                {imageModelUsesMcp && (
                  <Card>
                    <CardContent className="py-3">
                      <McpConnectionPicker
                        value={mcpConnectionId}
                        onChange={handleSelectMcpConnection}
                        sharedGroupId={mcpSharedGroupId}
                        onSharedGroupChange={setMcpSharedGroupId}
                        assetType="image"
                        providerKey={
                          // Whichever of the two picks is the MCP one — the
                          // panel shows this row when EITHER needs MCP (see
                          // `imageModelUsesMcp`), so reading only the
                          // text-to-image slot would leave the picker without
                          // a provider when only the edit model is MCP.
                          resolveMediaModelTransportConfig({
                            provider: selectedImageModelRecord?.provider,
                            modelId:
                              selectedImageModelRecord?.modelId ??
                              selectedImageModelId,
                            configJson: selectedImageModelRecord?.configJson as
                              | Record<string, unknown>
                              | undefined,
                          }).providerKey ??
                          (selectedEditImageModelId
                            ? (resolveMediaModelTransportConfig({
                                provider:
                                  selectedEditImageModelRecord?.provider,
                                modelId:
                                  selectedEditImageModelRecord?.modelId ??
                                  selectedEditImageModelId,
                                configJson:
                                  selectedEditImageModelRecord?.configJson as
                                    | Record<string, unknown>
                                    | undefined,
                              }).providerKey ?? undefined)
                            : undefined)
                        }
                      />
                    </CardContent>
                  </Card>
                )}

                {/* Feature 135 — Hermes/Grok connection picker, mutually
                    exclusive with the MCP picker above (a model row resolves
                    to exactly one transport). */}
                {imageModelUsesHermes && (
                  <Card>
                    <CardContent className="py-3 space-y-2">
                      <HermesConnectionPicker
                        value={hermesConnectionId}
                        onChange={handleSelectHermesConnection}
                        assetType="image"
                      />
                      {!hermesConnectionId ? (
                        <p
                          className="text-xs text-amber-600"
                          data-testid="hermes-connection-required-hint"
                        >
                          {t(
                            lang,
                            "เลือกบัญชี Grok ก่อน",
                            "Select a Grok connection first"
                          )}
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                )}

                <section
                  className="rounded-lg border border-primary/20 bg-primary/5 p-3"
                  id={CHARACTER_EDITOR_SECTION_ID}
                  data-testid="vd-character-reference-disclosure"
                >
                  <Button
                    type="button"
                    variant="ghost"
                    className="flex h-auto w-full items-center justify-between gap-3 p-0 text-left hover:bg-transparent"
                    aria-expanded={isCharacterReferenceDisclosureExpanded}
                    aria-controls="vd-character-reference-disclosure-content vd-character-reference-assets"
                    data-testid="vd-character-reference-disclosure-toggle"
                    onClick={() => {
                      if (!selectedCharacter) return;
                      setReferenceDisclosureOverrideByCharacter(prev => ({
                        ...prev,
                        [selectedCharacter.characterId]:
                          !isCharacterReferenceDisclosureExpanded,
                      }));
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">
                        {t(
                          lang,
                          "สร้างหรือแก้ไขภาพตัวละคร",
                          "Create or edit character images"
                        )}
                      </span>
                      <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                        {selectedCharacterHasPrimaryPortrait
                          ? t(
                              lang,
                              "มีภาพหลักแล้ว — เปิดเพื่อเปลี่ยนภาพหลักหรือสร้างชุด Casting ใหม่",
                              "A primary portrait is set — open to change it or create a new casting batch."
                            )
                          : t(
                              lang,
                              "ยังไม่มีภาพหลัก — เปิดเพื่อเลือกภาพอ้างอิงหรือสร้างชุด Casting",
                              "No primary portrait yet — open to choose a reference or create a casting batch."
                            )}
                      </span>
                    </span>
                    <ChevronDown
                      aria-hidden="true"
                      className={cn(
                        "h-4 w-4 shrink-0 transition-transform",
                        isCharacterReferenceDisclosureExpanded && "rotate-180"
                      )}
                    />
                  </Button>
                  {isCharacterReferenceDisclosureExpanded && (
                    <Card id="vd-character-reference-assets" className="mt-3">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">
                          {t(lang, "อ้างอิงของตัวละคร", "Character references")}{" "}
                          ({selectedAssets.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-2">
                        {!readOnly && selectedCharacter && (
                          <section
                            className="mb-3 rounded-lg border border-dashed bg-muted/20 p-3"
                            aria-labelledby="vd-reference-generate-label"
                            data-testid="vd-reference-generate-section"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p
                                  id="vd-reference-generate-label"
                                  className="text-sm font-medium"
                                >
                                  {t(
                                    lang,
                                    "สร้างภาพอ้างอิงใหม่ (Text to image)",
                                    "Generate new reference images (Text to image)"
                                  )}
                                </p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {t(
                                    lang,
                                    "ถ้ามีภาพอ้างอิง ระบบจะใช้เป็น guideline เพื่อสร้างคนใหม่สำหรับ casting เท่านั้น ไม่ clone บุคคลในภาพ และคุณเลือกภาพหลักได้ภายหลัง",
                                    "When references are attached, they are guideline-only: the result is a new person for casting, not a clone of anyone in the images. Choose one result as primary afterward."
                                  )}
                                </p>
                              </div>
                              {!selectedImageModelId && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setIsModelDialogOpen(true)}
                                  data-testid="vd-reference-select-image-model"
                                >
                                  {t(
                                    lang,
                                    "เลือกโมเดลภาพ",
                                    "Select image model"
                                  )}
                                </Button>
                              )}
                            </div>
                            <div
                              className="mt-3 rounded-md border border-sky-200 bg-sky-50 p-3 text-xs text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100"
                              data-testid="vd-reference-casting-options"
                            >
                              <p className="font-medium">
                                {t(
                                  lang,
                                  "ตัวเลือกสร้างคนใหม่จากภาพอ้างอิง (ไม่บังคับ)",
                                  "Optional new-person casting options"
                                )}
                              </p>
                              <p className="mt-1">
                                {t(
                                  lang,
                                  "ภาพที่แนบไม่จำเป็นต้องมี (ใช้ได้สูงสุด 6 ภาพ) ระบบจะใช้เฉพาะแนวโครงหน้า/ความยาวผมตามที่เหมาะสม และจะไม่สร้างบุคคลให้เหมือนภาพอ้างอิง",
                                  "References are optional (up to 6). The skill uses them only as visual guidance such as face shape or hair length; it will not recreate the person."
                                )}
                              </p>
                              <p className="mt-1 font-medium">
                                {t(
                                  lang,
                                  "ตัวเลือก lock/ท่าทาง/ระยะกล้องจะมีผลเมื่อมีภาพอ้างอิงเท่านั้น หากไม่มีภาพ ระบบจะใช้ flow เดิม",
                                  "Lock, pose, and framing options apply only when references are attached. Without references, the existing flow is used."
                                )}
                              </p>
                              <section
                                className="mt-3 rounded-md border border-dashed bg-background/70 p-3"
                                aria-label={t(
                                  lang,
                                  "เพิ่มภาพอ้างอิงสำหรับ Casting",
                                  "Add casting reference images"
                                )}
                                data-testid="vd-reference-casting-image-picker"
                              >
                                <ImageSourcePicker
                                  value={castingReferencePickerUrls}
                                  onChange={urls =>
                                    void handleCastingReferencePickerChange(
                                      selectedCharacter.characterId,
                                      urls
                                    )
                                  }
                                  maxImages={6}
                                  isUploading={
                                    cardUploadMutation.isPending ||
                                    castingReferenceSyncingCharacterId ===
                                      selectedCharacter.characterId
                                  }
                                  onUpload={uploadCastingReferenceFiles}
                                  label={t(
                                    lang,
                                    "ภาพอ้างอิงสำหรับ Casting (ไม่บังคับ)",
                                    "Casting reference images (optional)"
                                  )}
                                  helpText={t(
                                    lang,
                                    "ลากไฟล์จากเครื่อง หรือเลือกรูปจาก Library/Media History ได้สูงสุด 6 ภาพ ภาพหลักปัจจุบันจะถูกเก็บไว้และลบจากชุดอ้างอิงไม่ได้",
                                    "Drop files from your device or choose images from Library/Media History, up to 6 images. The current primary portrait is preserved and cannot be removed from this set."
                                  )}
                                  language={lang}
                                  disabled={
                                    mutating ||
                                    castingReferenceSyncingCharacterId ===
                                      selectedCharacter.characterId
                                  }
                                />
                              </section>
                              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                                <label className="flex items-center gap-2 sm:col-span-3">
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-input"
                                    checked={
                                      castingLockClothingByCharacter[
                                        selectedCharacter.characterId
                                      ] ?? false
                                    }
                                    onChange={event =>
                                      setCastingLockClothingByCharacter(
                                        prev => ({
                                          ...prev,
                                          [selectedCharacter.characterId]:
                                            event.target.checked,
                                        })
                                      )
                                    }
                                    data-testid="vd-reference-lock-clothing"
                                  />
                                  <span>
                                    {t(
                                      lang,
                                      "ล็อกเสื้อผ้าตามภาพอ้างอิง",
                                      "Lock clothing to the references"
                                    )}
                                  </span>
                                </label>
                                <div>
                                  <Label
                                    htmlFor="vd-reference-pose-mode"
                                    className="text-xs"
                                  >
                                    {t(lang, "ท่าทาง", "Pose")}
                                  </Label>
                                  <Select
                                    value={
                                      castingPoseModeByCharacter[
                                        selectedCharacter.characterId
                                      ] ?? "auto_natural"
                                    }
                                    onValueChange={value =>
                                      setCastingPoseModeByCharacter(prev => ({
                                        ...prev,
                                        [selectedCharacter.characterId]:
                                          value as
                                            | "auto_natural"
                                            | "lock_reference",
                                      }))
                                    }
                                  >
                                    <SelectTrigger
                                      id="vd-reference-pose-mode"
                                      className="mt-1 h-8 bg-background"
                                    >
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="auto_natural">
                                        {t(lang, "ท่าธรรมชาติ", "Natural pose")}
                                      </SelectItem>
                                      <SelectItem value="lock_reference">
                                        {t(
                                          lang,
                                          "ล็อกท่าตามภาพ",
                                          "Lock reference pose"
                                        )}
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="sm:col-span-2">
                                  <Label
                                    htmlFor="vd-reference-camera-framing"
                                    className="text-xs"
                                  >
                                    {t(lang, "ระยะ/มุมกล้อง", "Camera framing")}
                                  </Label>
                                  <Select
                                    value={
                                      castingCameraFramingByCharacter[
                                        selectedCharacter.characterId
                                      ] ?? "half_body"
                                    }
                                    onValueChange={value =>
                                      setCastingCameraFramingByCharacter(
                                        prev => ({
                                          ...prev,
                                          [selectedCharacter.characterId]:
                                            value as NonNullable<
                                              VdPreviewCharacterPromptInput["castingCameraFraming"]
                                            >,
                                        })
                                      )
                                    }
                                  >
                                    <SelectTrigger
                                      id="vd-reference-camera-framing"
                                      className="mt-1 h-8 bg-background"
                                    >
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="full_body">
                                        {t(lang, "เต็มตัว", "Full body")}
                                      </SelectItem>
                                      <SelectItem value="three_quarter">
                                        {t(lang, "สามส่วน", "Three-quarter")}
                                      </SelectItem>
                                      <SelectItem value="half_body">
                                        {t(lang, "ครึ่งตัว", "Half body")}
                                      </SelectItem>
                                      <SelectItem value="medium_close_up">
                                        {t(
                                          lang,
                                          "ใกล้ระดับกลาง",
                                          "Medium close-up"
                                        )}
                                      </SelectItem>
                                      <SelectItem value="close_up">
                                        {t(lang, "ใกล้ใบหน้า", "Close-up")}
                                      </SelectItem>
                                      <SelectItem value="extreme_close_up">
                                        {t(lang, "ใกล้มาก", "Extreme close-up")}
                                      </SelectItem>
                                      <SelectItem value="wide_environmental">
                                        {t(
                                          lang,
                                          "กว้างเห็นสภาพแวดล้อม",
                                          "Wide environmental"
                                        )}
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            </div>
                            <div className="mt-3 flex flex-col gap-2">
                              <Label
                                htmlFor="vd-reference-custom-instruction"
                                className="text-xs"
                              >
                                {t(
                                  lang,
                                  VD_COPY.th.characterCustomInstructionLabel,
                                  VD_COPY.en.characterCustomInstructionLabel
                                )}
                              </Label>
                              <Textarea
                                id="vd-reference-custom-instruction"
                                value={
                                  customInstructionByCharacter[
                                    selectedCharacter.characterId
                                  ] ?? ""
                                }
                                onChange={event =>
                                  setCustomInstructionByCharacter(prev => ({
                                    ...prev,
                                    [selectedCharacter.characterId]:
                                      event.target.value,
                                  }))
                                }
                                maxLength={500}
                                rows={2}
                                placeholder={t(
                                  lang,
                                  "เช่น ใส่ชุดนักศึกษามัธยมปลายของไทย, เสื้อผ้าลำลองแนวสาวชนบท, ยืนเห็นเต็มตัวถึงรองเท้า",
                                  "e.g. Thai high-school uniform, rural casual clothing, full-body stance down to the shoes"
                                )}
                              />
                            </div>
                            <div
                              className="mt-3"
                              role="radiogroup"
                              aria-labelledby="vd-reference-candidate-count-label"
                            >
                              <p
                                id="vd-reference-candidate-count-label"
                                className="mb-2 text-xs font-medium"
                              >
                                {t(
                                  lang,
                                  "จำนวนภาพใหม่",
                                  "Number of new images"
                                )}
                              </p>
                              <Grid
                                columns={{
                                  minWidth: 64,
                                  max: 5,
                                  repeat: "fit",
                                }}
                                gap={2}
                              >
                                {VD_PORTRAIT_CANDIDATE_COUNTS.map(count => {
                                  const selected =
                                    (portraitCandidateCountByCharacter[
                                      selectedCharacter.characterId
                                    ] ?? 3) === count;
                                  return (
                                    <SelectableCard
                                      key={count}
                                      label={t(
                                        lang,
                                        `${count} ภาพ`,
                                        `${count} image${count > 1 ? "s" : ""}`
                                      )}
                                      isSelected={selected}
                                      onChange={isSelected => {
                                        if (!isSelected) return;
                                        setPortraitCandidateCountByCharacter(
                                          prev => ({
                                            ...prev,
                                            [selectedCharacter.characterId]:
                                              count,
                                          })
                                        );
                                      }}
                                      padding={2}
                                      variant={selected ? "blue" : "muted"}
                                    >
                                      <span className="block text-center text-xs font-semibold">
                                        {count}
                                      </span>
                                    </SelectableCard>
                                  );
                                })}
                              </Grid>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              className="mt-3 gap-2"
                              disabled={
                                mutating ||
                                isImageGeneratingFor(
                                  selectedCharacter.characterId
                                ) ||
                                !selectedImageModelId
                              }
                              onClick={() =>
                                startCharacterPromptPreview(
                                  selectedCharacter.characterId,
                                  {
                                    forceCandidateBatch: true,
                                    castingReferenceAssetLinkIds:
                                      projectCastingReferenceAssetLinkIds(
                                        selectedAssets,
                                        selectedCharacter.characterId
                                      ),
                                  }
                                )
                              }
                              data-testid="vd-reference-generate-candidates"
                            >
                              {isImageGeneratingFor(
                                selectedCharacter.characterId
                              ) ? (
                                <Loader2
                                  aria-hidden="true"
                                  className="h-3.5 w-3.5 animate-spin"
                                />
                              ) : (
                                <Sparkles
                                  aria-hidden="true"
                                  className="h-3.5 w-3.5"
                                />
                              )}
                              {t(
                                lang,
                                `สร้าง ${portraitCandidateCountByCharacter[selectedCharacter.characterId] ?? 3} ภาพใหม่`,
                                `Generate ${portraitCandidateCountByCharacter[selectedCharacter.characterId] ?? 3} new images`
                              )}
                            </Button>
                            {hasReferenceGuidedPortraitCandidates && (
                              <p
                                className="mt-2 text-xs text-muted-foreground"
                                data-testid="vd-reference-casting-results-hint"
                              >
                                {t(
                                  lang,
                                  "ผลลัพธ์จะแสดงต่อจากปุ่มนี้ทันที เพื่อให้เลือกภาพหลักได้ในจุดเดียวกัน",
                                  "Results appear directly below this button so you can choose the primary portrait without leaving this section."
                                )}
                              </p>
                            )}
                            <div
                              ref={setPortraitCandidateResultsMount}
                              className={cn(
                                "mt-3",
                                !hasReferenceGuidedPortraitCandidates &&
                                  "hidden"
                              )}
                              data-testid="vd-reference-casting-results-mount"
                            />
                          </section>
                        )}
                        {selectedAssets.length === 0 ? (
                          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                            {t(
                              lang,
                              "ยังไม่มีอ้างอิงสำหรับตัวละครนี้",
                              "No references for this character yet."
                            )}
                          </p>
                        ) : (
                          <ul className="flex flex-col gap-2">
                            {selectedAssets.map(asset => {
                              const busyThis =
                                deleteAssetMutation.isPending &&
                                deleteAssetMutation.variables?.assetLinkId ===
                                  asset.assetLinkId;
                              // Only the freshly-generated asset from this session has a
                              // resolvable URL — matched by characterId + mediaAssetId.
                              // Older/imported assets fall back to the plain-text label.
                              // Checks both the portrait cache and the character-sheet
                              // cache, since both mutations link into the same asset
                              // list, distinguished by `asset.role`.
                              const generatedForCharacter =
                                generatedImageUrls[asset.characterId];
                              const turnaroundForCharacter =
                                generatedTurnaroundUrls[asset.characterId];
                              const sheetForCharacter =
                                generatedSheetUrls[asset.characterId];
                              const isTurnaroundRoleAsset =
                                asset.role === "character_sheet_turnaround";
                              // `"character_sheet_full"` (the pre-existing full-
                              // combined sheet) and `"character_design_bible"`
                              // (the 11 new Character Design Bible formats, e.g.
                              // color_palette / material_fabric — several of
                              // which carry no face at all) are ALSO multi-panel
                              // infographic pages, not 9:16 portrait crops —
                              // widened from turnaround-only (vertical-drama-
                              // character-sheet-consolidation plan, Phase C).
                              const isSheetRoleAsset =
                                asset.role === "character_sheet_full" ||
                                asset.role === "character_design_bible";
                              const isMultiPanelSheetAsset =
                                isTurnaroundRoleAsset || isSheetRoleAsset;
                              // Prefer the durable, server-joined `thumbnailUrl`
                              // (survives reload) — the session-local generate
                              // caches are only a fallback for the brief window
                              // before a refetch has picked it up.
                              const sessionCachedUrl = isTurnaroundRoleAsset
                                ? turnaroundForCharacter &&
                                  String(asset.mediaAssetId) ===
                                    turnaroundForCharacter.mediaAssetId
                                  ? turnaroundForCharacter.imageUrl
                                  : null
                                : isSheetRoleAsset
                                  ? sheetForCharacter &&
                                    String(asset.mediaAssetId) ===
                                      sheetForCharacter.mediaAssetId
                                    ? sheetForCharacter.imageUrl
                                    : null
                                  : generatedForCharacter &&
                                      String(asset.mediaAssetId) ===
                                        generatedForCharacter.mediaAssetId
                                    ? generatedForCharacter.imageUrl
                                    : null;
                              const thumbnailUrl =
                                asset.thumbnailUrl ?? sessionCachedUrl;
                              const mainPortraitAssetLinkId = selectedCharacter
                                ? (resolveCharacterCardPortraitAsset(
                                    assets,
                                    selectedCharacter.characterId
                                  )?.assetLinkId ?? null)
                                : null;
                              const isMainImage =
                                asset.role === "primary_portrait" &&
                                asset.assetLinkId === mainPortraitAssetLinkId;
                              const candidateStatus =
                                asset.portraitCandidate?.status;
                              const canPromoteToPrimary =
                                Boolean(asset.mediaAssetId) &&
                                (asset.role === "primary_portrait" ||
                                  (Boolean(asset.portraitCandidate) &&
                                    [
                                      "completed",
                                      "selected",
                                      "superseded",
                                    ].includes(candidateStatus ?? "")));
                              const thumbnailAlt = isMultiPanelSheetAsset
                                ? t(
                                    lang,
                                    "ชีทตัวละคร (มุมมองหลายด้าน)",
                                    "Character sheet (multi-angle turnaround)"
                                  )
                                : t(
                                    lang,
                                    "ภาพตัวละครที่สร้างขึ้น",
                                    "Generated character portrait"
                                  );
                              return (
                                <li
                                  key={asset.assetLinkId}
                                  className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border p-2"
                                >
                                  {thumbnailUrl && (
                                    <button
                                      type="button"
                                      aria-label={t(
                                        lang,
                                        "ดูภาพขยาย",
                                        "View full-size image"
                                      )}
                                      onClick={() =>
                                        setLightboxImage({
                                          src: thumbnailUrl,
                                          alt: thumbnailAlt,
                                        })
                                      }
                                      className="shrink-0 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
                                    >
                                      <AuthenticatedMediaImage
                                        src={thumbnailUrl}
                                        alt={thumbnailAlt}
                                        className={cn(
                                          "rounded-md border border-border",
                                          isMultiPanelSheetAsset
                                            ? "max-h-24 max-w-24 object-contain"
                                            : "aspect-[9/16] w-16 object-cover"
                                        )}
                                      />
                                    </button>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium">
                                      {asset.assetType}
                                      {asset.role ? ` · ${asset.role}` : ""}
                                    </p>
                                    {thumbnailUrl ? (
                                      <p className="truncate text-xs text-muted-foreground">
                                        {t(lang, "ที่มา", "Source")}:{" "}
                                        {asset.source}
                                        {asset.containsHumanFace
                                          ? ` · ${t(lang, "มีใบหน้า", "Has face")}`
                                          : ""}
                                      </p>
                                    ) : (
                                      <p className="truncate text-xs text-muted-foreground">
                                        {t(lang, "มีเดีย", "Media")} #
                                        {asset.mediaAssetId ?? "—"} ·{" "}
                                        {t(lang, "ที่มา", "Source")}:{" "}
                                        {asset.source}
                                        {asset.containsHumanFace
                                          ? ` · ${t(lang, "มีใบหน้า", "Has face")}`
                                          : ""}
                                      </p>
                                    )}
                                    {asset.rejectionReason && (
                                      <p className="mt-0.5 text-xs text-destructive">
                                        {t(lang, "เหตุผล", "Reason")}:{" "}
                                        {asset.rejectionReason}
                                      </p>
                                    )}
                                  </div>
                                  {!readOnly &&
                                    (isMainImage ? (
                                      <Badge
                                        variant="secondary"
                                        className="shrink-0 text-xs"
                                      >
                                        {t(lang, "ภาพหลัก", "Main image")}
                                      </Badge>
                                    ) : canPromoteToPrimary ? (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-7 shrink-0 px-2 text-xs"
                                        disabled={
                                          setPrimaryPortraitMutation.isPending
                                        }
                                        title={t(
                                          lang,
                                          "ใช้ภาพนี้แทนภาพหลัก โดยเก็บภาพหลักเดิมไว้เป็นภาพอ้างอิง",
                                          "Use this as the main image and keep the previous main image as a reference"
                                        )}
                                        onClick={() =>
                                          setPrimaryPortraitMutation.mutate({
                                            seriesId,
                                            characterId:
                                              selectedCharacter.characterId,
                                            assetLinkId: asset.assetLinkId,
                                          })
                                        }
                                        data-testid={`vd-reference-set-primary-${asset.assetLinkId}`}
                                      >
                                        {setPrimaryPortraitMutation.isPending &&
                                        setPrimaryPortraitMutation.variables
                                          ?.assetLinkId ===
                                          asset.assetLinkId ? (
                                          <Loader2
                                            aria-hidden="true"
                                            className="mr-1 h-3.5 w-3.5 animate-spin"
                                          />
                                        ) : null}
                                        {t(
                                          lang,
                                          "ตั้งเป็นภาพหลัก",
                                          "Set as main"
                                        )}
                                      </Button>
                                    ) : null)}
                                  {!readOnly &&
                                    (confirmingDeleteAssetLinkId ===
                                    asset.assetLinkId ? (
                                      <div className="flex items-center gap-1">
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="ghost"
                                          className="h-7 px-2 text-xs"
                                          disabled={mutating}
                                          onClick={() =>
                                            setConfirmingDeleteAssetLinkId(null)
                                          }
                                        >
                                          {t(lang, "ยกเลิก", "Cancel")}
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="destructive"
                                          className="h-7 gap-1 px-2 text-xs"
                                          disabled={mutating}
                                          onClick={() => {
                                            setConfirmingDeleteAssetLinkId(
                                              null
                                            );
                                            deleteAssetMutation.mutate({
                                              seriesId,
                                              assetLinkId: asset.assetLinkId,
                                            });
                                          }}
                                        >
                                          {busyThis ? (
                                            <Loader2
                                              aria-hidden="true"
                                              className="h-3.5 w-3.5 animate-spin"
                                            />
                                          ) : (
                                            <Trash2
                                              aria-hidden="true"
                                              className="h-3.5 w-3.5"
                                            />
                                          )}
                                          {t(
                                            lang,
                                            "ยืนยันลบ",
                                            "Confirm delete"
                                          )}
                                        </Button>
                                      </div>
                                    ) : (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 gap-1 px-2 text-muted-foreground hover:text-destructive"
                                        disabled={mutating}
                                        aria-label={t(
                                          lang,
                                          "ลบภาพอ้างอิงนี้",
                                          "Delete this reference"
                                        )}
                                        onClick={() =>
                                          setConfirmingDeleteAssetLinkId(
                                            asset.assetLinkId
                                          )
                                        }
                                      >
                                        <Trash2
                                          aria-hidden="true"
                                          className="h-3.5 w-3.5"
                                        />
                                        {t(lang, "ลบ", "Delete")}
                                      </Button>
                                    ))}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </section>
              </>
            )}
          </div>

          {!readOnly && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  {t(lang, "เพิ่มตัวละคร", "Add character")}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 sm:max-w-md">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="vd-char-name" className="text-xs">
                    {t(lang, "ชื่อ", "Name")}
                  </Label>
                  <Input
                    id="vd-char-name"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder={t(lang, "เช่น มินา", "e.g. Mina")}
                    maxLength={255}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="vd-char-key" className="text-xs">
                    {t(lang, "คีย์ (ตัวระบุ)", "Key (identifier)")}
                  </Label>
                  <Input
                    id="vd-char-key"
                    value={newKey}
                    onChange={e => setNewKey(e.target.value)}
                    placeholder="mina_lead"
                    maxLength={64}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="vd-char-role" className="text-xs">
                    {t(
                      lang,
                      "อาชีพ/คำอธิบายบทบาท",
                      "Occupation / role description"
                    )}
                  </Label>
                  <Input
                    id="vd-char-role"
                    value={newRole}
                    onChange={e => setNewRole(e.target.value)}
                    placeholder={t(lang, "นางเอก", "Protagonist")}
                    maxLength={100}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="vd-char-role-tier" className="text-xs">
                    {t(
                      lang,
                      "บทบาทในเรื่อง (ใช้สร้างภาพ)",
                      "Narrative role (drives visual design)"
                    )}
                  </Label>
                  <Select
                    value={newRoleTier}
                    onValueChange={value => setNewRoleTier(value as RoleTier)}
                  >
                    <SelectTrigger
                      id="vd-char-role-tier"
                      className="h-9 text-xs"
                    >
                      <SelectValue
                        placeholder={t(
                          lang,
                          "เลือก นางเอก/พระเอก/ตัวร้าย/ตัวประกอบ",
                          "Choose lead / villain / supporting"
                        )}
                      />
                    </SelectTrigger>
                    <SelectContent className="max-h-[min(70vh,32rem)]">
                      {ROLE_TIER_VALUES.map(tier => (
                        <SelectItem key={tier} value={tier}>
                          {getCanonicalRoleLabel(tier, lang) ?? tier}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    {t(
                      lang,
                      "หากไม่เลือก ระบบจะแจ้งให้ตรวจบทบาทก่อนสร้างภาพ",
                      "If omitted, the system will flag the character for role review before image generation."
                    )}
                  </p>
                </div>
                <div className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3">
                  <div>
                    <p className="text-xs font-medium text-foreground">
                      {t(
                        lang,
                        "Casting และภาพลักษณ์ตัวละคร",
                        "Casting & character look"
                      )}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {t(
                        lang,
                        "หากไม่เลือก ระบบจะให้ Skill วิเคราะห์จากเรื่องและตลาดอย่างเป็นเหตุเป็นผล",
                        "If left on Auto, the Skill reasons from the story and market context."
                      )}
                    </p>
                  </div>
                  <Label
                    htmlFor="vd-new-character-casting-region"
                    className="text-xs"
                  >
                    {t(
                      lang,
                      "เชื้อชาติหรือภูมิภาค (Casting Region)",
                      "Ethnicity or region (Casting Region)"
                    )}
                  </Label>
                  <Select
                    value={newCastingPreferences.region}
                    onValueChange={value =>
                      setNewCastingPreferences(prev => ({
                        ...prev,
                        region:
                          value as VerticalDramaCharacterCastingFormState["region"],
                      }))
                    }
                  >
                    <SelectTrigger
                      id="vd-new-character-casting-region"
                      className="h-9 text-xs"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-[min(70vh,32rem)]">
                      <SelectItem value="auto">
                        {t(
                          lang,
                          "อัตโนมัติ — ให้ AI วิเคราะห์จากเรื่อง",
                          "Auto — let AI analyze the story"
                        )}
                      </SelectItem>
                      {VERTICAL_DRAMA_CHARACTER_CASTING_REGIONS.map(region => (
                        <SelectItem key={region} value={region}>
                          {lang === "th"
                            ? VERTICAL_DRAMA_CHARACTER_CASTING_REGION_LABELS_TH[
                                region
                              ]
                            : VERTICAL_DRAMA_CHARACTER_CASTING_REGION_LABELS_EN[
                                region
                              ]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    {t(
                      lang,
                      "อัตโนมัติจะพิจารณา locale, setting, กลุ่มผู้ชม, บทบาท และ visual culture ของซีรีย์ก่อนตัดสินใจ",
                      "Auto considers the series locale, setting, audience, character role, and visual culture before deciding."
                    )}
                  </p>
                  <Label
                    htmlFor="vd-new-character-casting-look"
                    className="text-xs"
                  >
                    {t(lang, "แนวหน้าตานักแสดง (Casting Look)", "Casting look")}
                  </Label>
                  <Select
                    value={newCastingPreferences.look}
                    onValueChange={value =>
                      setNewCastingPreferences(prev => ({
                        ...prev,
                        look: value as VerticalDramaCharacterCastingFormState["look"],
                      }))
                    }
                  >
                    <SelectTrigger
                      id="vd-new-character-casting-look"
                      className="h-9 text-xs"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-[min(70vh,32rem)]">
                      <SelectItem value="auto">
                        {t(
                          lang,
                          "อัตโนมัติ — วิเคราะห์จากตัวละคร",
                          "Auto — analyze the character"
                        )}
                      </SelectItem>
                      {VERTICAL_DRAMA_CHARACTER_CASTING_LOOKS.map(look => (
                        <SelectItem key={look} value={look}>
                          {lang === "th"
                            ? VERTICAL_DRAMA_CHARACTER_CASTING_LOOK_LABELS_TH[
                                look
                              ]
                            : VERTICAL_DRAMA_CHARACTER_CASTING_LOOK_LABELS_EN[
                                look
                              ]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    {t(
                      lang,
                      "อัตโนมัติจะเลือกความน่าดึงดูดให้เหมาะกับ role tier, อายุ, บุคลิก และตลาดของเรื่อง",
                      "Auto selects an appealing look that fits the role tier, age, personality, and series market."
                    )}
                  </p>
                  <Label
                    htmlFor="vd-new-character-casting-details"
                    className="text-xs"
                  >
                    {t(
                      lang,
                      "รายละเอียด Casting เพิ่มเติม (ถ้ามี)",
                      "Additional Casting Details (optional)"
                    )}
                  </Label>
                  <Textarea
                    id="vd-new-character-casting-details"
                    value={newCastingPreferences.additionalDetails}
                    onChange={e =>
                      setNewCastingPreferences(prev => ({
                        ...prev,
                        additionalDetails: e.target.value,
                      }))
                    }
                    maxLength={800}
                    rows={4}
                    placeholder={t(
                      lang,
                      "เช่น ลูกครึ่งไทย-ญี่ปุ่น หรือหน้าคม ดูฉลาดแต่เป็นมิตร",
                      "e.g. Asian-American; natural, not model-like; sharp, intelligent, and friendly"
                    )}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {t(
                      lang,
                      "ตัวอย่าง: ลูกครึ่งไทย-ญี่ปุ่น · Asian-American · ดูเป็นสาวธรรมชาติ ไม่เหมือนนางแบบ · Korean drama casting แต่เป็น American character",
                      "Examples: Thai-Japanese mixed · Asian-American · natural, not model-like · Korean-drama casting but an American character"
                    )}
                  </p>
                  <p className="rounded border border-primary/20 bg-primary/5 p-2 text-[11px] font-medium text-primary">
                    {t(
                      lang,
                      "Priority: รายละเอียดช่องนี้มีผลสูงกว่าตัวเลือก Region และ Casting Look แต่ยังต้องสอดคล้องกับอายุ บทบาท ความปลอดภัย และ identity lock",
                      "Priority: these details override Region and Casting Look, while still respecting age, role, safety, and identity lock."
                    )}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="mt-1 gap-2"
                  disabled={
                    mutating || newName.trim() === "" || newKey.trim() === ""
                  }
                  onClick={() =>
                    createMutation.mutate({
                      seriesId,
                      name: newName.trim(),
                      characterKey: newKey.trim(),
                      role: newRole.trim() || undefined,
                      roleTier: newRoleTier || undefined,
                      castingPreferences:
                        buildVerticalDramaCharacterCastingPreferences(
                          newCastingPreferences
                        ),
                    })
                  }
                >
                  {createMutation.isPending ? (
                    <Loader2
                      aria-hidden="true"
                      className="h-4 w-4 animate-spin"
                    />
                  ) : (
                    <Plus aria-hidden="true" className="h-4 w-4" />
                  )}
                  {t(lang, "เพิ่มตัวละคร", "Add character")}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
        {/* End left column. Persistent right-side sidebar column: Library /
            Media History / grid-cutter reference picker — mirrors Media
            Studio's own persistent-sidebar convention, starting at the SAME
            vertical level as the character grid above (fix-round-4), not
            below the detail/add-character content. Only rendered when a
            character is selected and mutations are allowed. */}
        {showReferencePanelColumn && selectedCharacter && (
          <div
            data-testid="vd-character-reference-panel-column"
            data-collapsed="false"
            className="flex flex-col gap-2 md:sticky md:top-4 md:min-h-0"
          >
            {/* Rich reference picker: Library / History / grid cutter + drag-drop.
                    Resolves Library/History/cutter drops to a canonical media_assets
                    row itself (see resolveMediaAssetForImport) and links immediately —
                    no manual "Media asset ID" entry anywhere in this flow. */}
            <VerticalDramaCharacterReferencePanel
              seriesId={seriesId}
              characterId={selectedCharacter.characterId}
              isLinking={linkMutation.isPending}
              onLinkMediaAssetId={mediaAssetId =>
                linkMutation.mutate({
                  seriesId,
                  characterId: selectedCharacter.characterId,
                  mediaAssetId,
                  assetType: "character_reference",
                  // `role` must be "primary_portrait" — same as
                  // `assignDroppedReference`'s drag-onto-card path below.
                  // Upload/drop through this panel targets a specific
                  // character, so — same as dragging onto the card — it
                  // must set/replace that character's portrait, not just
                  // add an untagged row to "ภาพตัวละครนี้" that never
                  // surfaces on the card (bug repro 2026-07-06, series 4
                  // คุณหญิงเบญจวรรณ: uploading via the "อัปโหลดภาพ" button
                  // linked the asset but never updated the card image
                  // because `role` was left null here).
                  role: "primary_portrait",
                  source: "imported",
                })
              }
            />
          </div>
        )}
      </div>

      {/* W2 "เพิ่มลุค" dialog (plan: vertical-drama-twin-variant-
      completeness, F6) — manual counterpart of the AI-only
      `detectCharacterVariantsNow`/`reconcileCharacterVariantPlan` path (see
      `createCharacterVariant`'s doc comment, `server/routers/
      verticalDramaCharacters.ts`). */}
      <Dialog
        open={variantDialogCharacter !== null}
        onOpenChange={open => {
          if (!open) closeVariantDialog();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t(
                lang,
                `เพิ่มลุคให้ ${variantDialogCharacter?.name ?? ""}`,
                `Add a look for ${variantDialogCharacter?.name ?? ""}`
              )}
            </DialogTitle>
            <DialogDescription>
              {t(
                lang,
                "สร้างตัวละคร variant ใหม่ — คนเดิม หน้าเดิม แค่ลุค/ช่วงวัยต่างออกไป มีภาพอ้างอิงของตัวเอง",
                "Creates a new variant character — same person, same identity, just a different look/life-stage, with its own reference image."
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="vd-variant-label" className="text-xs">
                {t(lang, "ชื่อลุค", "Look name")}
              </Label>
              <Input
                id="vd-variant-label"
                value={variantLabelInput}
                onChange={e => setVariantLabelInput(e.target.value)}
                placeholder={t(lang, "เช่น ชุดทำงาน", "e.g. Work outfit")}
                maxLength={64}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="vd-variant-type" className="text-xs">
                {t(lang, "ประเภทลุค", "Look type")}
              </Label>
              <Select
                value={variantTypeInput}
                onValueChange={value =>
                  setVariantTypeInput(value as "outfit" | "age_stage")
                }
              >
                <SelectTrigger id="vd-variant-type" className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="outfit">
                    {t(lang, "ชุด/ลุค (outfit)", "Outfit")}
                  </SelectItem>
                  <SelectItem value="age_stage">
                    {t(lang, "ช่วงอายุ (age_stage)", "Age stage")}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {variantTypeInput === "outfit"
                  ? t(
                      lang,
                      "ชุด/ลุค (outfit) — หน้าเหมือนเดิม 100% เปลี่ยนเฉพาะการแต่งตัว",
                      "Outfit — face stays 100% identical, only the clothing changes."
                    )
                  : t(
                      lang,
                      "ช่วงอายุ (age_stage) — คนเดิมต่างวัย หน้าอ้างอิงหลวมๆ ไม่ล็อก 100%",
                      "Age stage — same person at a different life stage; the face reference is loose, not locked 100%."
                    )}
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="vd-variant-description" className="text-xs">
                {t(lang, "คำอธิบาย (ไม่บังคับ)", "Description (optional)")}
              </Label>
              <Textarea
                id="vd-variant-description"
                value={variantDescriptionInput}
                onChange={e => setVariantDescriptionInput(e.target.value)}
                maxLength={2000}
                rows={3}
                placeholder={
                  variantTypeInput === "outfit"
                    ? t(
                        lang,
                        "อธิบายชุด/สไตล์ที่ต้องการ เช่น ชุดยูนิฟอร์มสีขาว มัดผมหางม้า",
                        "Describe the outfit/style, e.g. white uniform, hair in a ponytail"
                      )
                    : t(
                        lang,
                        "อธิบายช่วงวัย/ลักษณะที่เปลี่ยนไป เช่น วัยกลางคน ผมสั้นแซมสีเทา",
                        "Describe the life-stage/appearance change, e.g. middle-aged, short greying hair"
                      )
                }
              />
            </div>
            {/* Ephemeral per-generation visual brief — framing/composition
            direction for the image this dialog is about to generate, NOT a
            persisted fact about the look (that is the description field
            above). Sent as `customInstruction`; before
            `planning/vd-character-full-body-framing/plan.md` C1 there was no
            way at all to ask a look's image for a different shot size. */}
            <div className="flex flex-col gap-1">
              <Label htmlFor="vd-variant-image-instruction" className="text-xs">
                {t(
                  lang,
                  "รายละเอียดภาพ/กรอบภาพ (ไม่บังคับ)",
                  "Image framing details (optional)"
                )}
              </Label>
              <Textarea
                id="vd-variant-image-instruction"
                value={variantImageInstructionInput}
                onChange={e => setVariantImageInstructionInput(e.target.value)}
                maxLength={500}
                rows={2}
                placeholder={t(
                  lang,
                  "เช่น ภาพเต็มตัว เห็นตั้งแต่หัวจรดเท้า / ทำเป็น style sheet หลายท่า",
                  "e.g. full-body, head to toe / a multi-pose style sheet"
                )}
              />
              <p className="text-[11px] text-muted-foreground">
                {t(
                  lang,
                  "ใช้กับภาพที่กำลังจะสร้างเท่านั้น — ไม่ถูกบันทึกเป็นข้อมูลของลุค",
                  "Applies to the image about to be generated only — not saved as look data."
                )}
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">
                {t(
                  lang,
                  "ภาพอ้างอิง (ไม่บังคับ)",
                  "Reference image (optional)"
                )}
              </Label>
              <div
                onDragOver={event => {
                  event.preventDefault();
                  setVariantReferenceDragOver(true);
                }}
                onDragLeave={() => setVariantReferenceDragOver(false)}
                onDrop={event => {
                  setVariantReferenceDragOver(false);
                  variantReferenceHandlers.handleDrop(event);
                }}
                className={cn(
                  "flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-3 text-center text-xs text-muted-foreground transition-colors",
                  variantReferenceDragOver
                    ? "border-purple-400 bg-purple-50/60"
                    : "border-border"
                )}
              >
                {variantReferencePreviewUrl ? (
                  <AuthenticatedMediaImage
                    src={variantReferencePreviewUrl}
                    alt=""
                    className="aspect-[9/16] h-20 w-14 rounded object-cover"
                  />
                ) : variantReferenceResolving ? (
                  <Loader2
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin"
                  />
                ) : (
                  <UploadCloud aria-hidden="true" className="h-4 w-4" />
                )}
                <span>
                  {t(lang, "ลากภาพมาวาง หรือ", "Drag an image here, or")}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs"
                  disabled={variantReferenceResolving}
                  onClick={() => variantReferenceInputRef.current?.click()}
                >
                  <UploadCloud aria-hidden="true" className="h-3.5 w-3.5" />
                  {t(lang, "อัปโหลดภาพ", "Upload image")}
                </Button>
                <input
                  ref={variantReferenceInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={variantReferenceHandlers.handleFileInput}
                />
              </div>
            </div>
            {/* `planning/vd-character-look-one-step-flow/plan.md`
            (2026-07-17) — transparency row: previews exactly what "เพิ่มลุค"
            below is about to do, using the SAME pure decision
            (`decideVariantAutoGenerateImage`) `createVariantMutation`'s
            `onSuccess` uses to actually fire it, so the hint can never
            silently disagree with the real behavior. Hidden entirely when
            the user already picked their own reference image — that upload
            becomes the look's portrait directly, no generation involved. */}
            {!variantReferenceMediaAssetId &&
              variantDialogCharacter &&
              (() => {
                const parent = (characters as VdCharacterListItem[]).find(
                  candidate =>
                    candidate.characterId === variantDialogCharacter.characterId
                );
                const hintDecision = decideVariantAutoGenerateImage({
                  hasReferenceMediaAssetId: false,
                  parentNeedsSetupReasons: parent?.needsSetupReasons,
                  selectedImageModelId,
                });
                return hintDecision.fire ? (
                  <p className="flex items-start gap-1.5 rounded-md bg-muted/50 px-2 py-1.5 text-[11px] text-muted-foreground">
                    <Sparkles
                      aria-hidden="true"
                      className="mt-0.5 h-3 w-3 shrink-0"
                    />
                    {t(
                      lang,
                      `ระบบจะสร้างภาพลุคให้อัตโนมัติด้วยโมเดล ${selectedImageModelRecord?.name ?? selectedImageModelId} โดยใช้ภาพหลักเป็นภาพอ้างอิงใบหน้า`,
                      `The look's image will be generated automatically with ${selectedImageModelRecord?.name ?? selectedImageModelId}, using the main portrait as the face reference.`
                    )}
                  </p>
                ) : (
                  <p className="flex items-start gap-1.5 rounded-md border border-amber-400/60 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                    <AlertTriangle
                      aria-hidden="true"
                      className="mt-0.5 h-3 w-3 shrink-0"
                    />
                    {hintDecision.reason === "missing_parent_portrait"
                      ? t(
                          lang,
                          "ยังไม่มีภาพหลักของตัวละคร — จะไม่สร้างภาพลุคอัตโนมัติจนกว่าจะมีภาพหลักไว้เป็นภาพอ้างอิงใบหน้า",
                          "No main portrait yet — the look's image won't auto-generate until one exists to use as the face reference."
                        )
                      : t(
                          lang,
                          "ยังไม่ได้เลือกโมเดลภาพ — จะไม่สร้างภาพลุคอัตโนมัติจนกว่าจะเลือกโมเดล",
                          "No image model selected — the look's image won't auto-generate until you choose one."
                        )}
                  </p>
                );
              })()}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={closeVariantDialog}>
              {t(lang, "ยกเลิก", "Cancel")}
            </Button>
            <Button
              type="button"
              className="gap-2"
              disabled={
                !variantDialogCharacter ||
                variantLabelInput.trim() === "" ||
                createVariantMutation.isPending
              }
              onClick={() => {
                if (!variantDialogCharacter) return;
                const parent = (characters as VdCharacterListItem[]).find(
                  candidate =>
                    candidate.characterId === variantDialogCharacter.characterId
                );
                const decision = decideVariantAutoGenerateImage({
                  hasReferenceMediaAssetId: Boolean(
                    variantReferenceMediaAssetId
                  ),
                  parentNeedsSetupReasons: parent?.needsSetupReasons,
                  selectedImageModelId,
                });
                const createVariant = () =>
                  createVariantMutation.mutate(
                    buildCreateCharacterVariantInput({
                      seriesId,
                      parentCharacterId: variantDialogCharacter.characterId,
                      variantLabel: variantLabelInput,
                      variantType: variantTypeInput,
                      customDescription: variantDescriptionInput,
                      referenceMediaAssetId: variantReferenceMediaAssetId,
                    })
                  );
                if (!decision.fire) {
                  createVariant();
                  return;
                }
                confirmCharacterCreditAction(
                  variantDialogCharacter.characterId,
                  t(
                    lang,
                    "ยืนยันเพิ่มลุคและสร้างภาพ",
                    "Confirm look creation and image generation"
                  ),
                  t(
                    lang,
                    "การเพิ่มลุคนี้จะสร้างภาพด้วย AI ต่อทันทีและอาจหักเครดิต ต้องการดำเนินการต่อหรือไม่?",
                    "Adding this look will immediately generate an AI image and may spend credits. Continue?"
                  ),
                  t(lang, "เพิ่มลุคและสร้างภาพ", "Add look and generate image"),
                  createVariant
                );
              }}
            >
              {createVariantMutation.isPending ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <Plus aria-hidden="true" className="h-4 w-4" />
              )}
              {t(lang, "เพิ่มลุค", "Add look")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Per-look re-render dialog (`planning/vd-look-image-not-replace-
      primary/plan.md` §4C) — "สร้างภาพใหม่ของลุคนี้": type a fresh image brief
      and choose which image conditions the render. Everything it produces is
      linked onto the LOOK's own row by the shared poll->link flow, never onto
      the base character. */}
      <Dialog
        open={lookRenderDialog !== null}
        onOpenChange={open => {
          if (!open) closeLookRenderDialog();
        }}
      >
        <DialogContent className="min-w-0 w-[calc(100%-2rem)] max-w-md max-h-[calc(100vh-2rem)] overflow-x-hidden overflow-y-auto sm:max-w-lg">
          <DialogHeader className="min-w-0">
            <DialogTitle>
              {t(
                lang,
                `สร้างภาพใหม่ของลุค "${lookRenderDialog?.lookLabel ?? ""}"`,
                `Generate a new image for the "${lookRenderDialog?.lookLabel ?? ""}" look`
              )}
            </DialogTitle>
            <DialogDescription>
              {t(
                lang,
                `ภาพใหม่จะไปแทนภาพของลุคนี้เท่านั้น — ภาพหลักของ ${lookRenderDialog?.baseCharacterName ?? ""} ไม่ถูกแตะต้อง`,
                `The new image replaces this look's image only — ${lookRenderDialog?.baseCharacterName ?? ""}'s main image is left untouched.`
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-w-0 w-full max-w-full flex-col gap-3">
            <div className="min-w-0 w-full max-w-full rounded-md border bg-muted/30 px-3 py-2 text-xs">
              <p className="font-medium text-foreground">
                {t(
                  lang,
                  "ใช้ prompt หลักของลุค",
                  "Using the look's main prompt"
                )}
              </p>
              <p className="mt-1 truncate text-muted-foreground">
                {lookRenderDialog?.promptSummary ??
                  t(
                    lang,
                    "ยังไม่มีสรุปลุค — ระบบจะใช้ข้อมูลลุคที่บันทึกไว้",
                    "No look summary yet — the saved look data will be used"
                  )}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t(
                  lang,
                  "เป็นข้อมูลชุดเดียวกับที่เปิดดูใน แก้ไข prompt",
                  "This is the same source shown in Edit prompt"
                )}
              </p>
            </div>
            <div className="flex min-w-0 w-full max-w-full flex-col gap-1">
              <Label htmlFor="vd-look-render-instruction" className="text-xs">
                {t(
                  lang,
                  "คำแนะนำเพิ่มเติมสำหรับภาพนี้ (ไม่เปลี่ยน prompt หลัก)",
                  "Additional instruction for this image (does not change the main prompt)"
                )}
              </Label>
              <Textarea
                id="vd-look-render-instruction"
                value={lookRenderInstruction}
                onChange={e => setLookRenderInstruction(e.target.value)}
                maxLength={500}
                rows={3}
                className="min-h-56 w-full min-w-0 max-w-full resize-y font-mono text-xs leading-relaxed"
                placeholder={t(
                  lang,
                  "เช่น ภาพเต็มตัวกลางถนนตอนกลางคืน มือถือร่มสีดำ มองมาที่กล้อง",
                  "e.g. full-body on a street at night, holding a black umbrella, looking at camera"
                )}
              />
              <p className="text-[11px] text-muted-foreground">
                {t(
                  lang,
                  "ปล่อยว่างได้ ระบบจะใช้ prompt หลักของลุคโดยตรง; หากกรอกจะใช้เพิ่มเฉพาะครั้งนี้ และไม่ถูกบันทึกเป็นข้อมูลของลุค",
                  "Leave blank to use the look's main prompt directly; text entered here is added only for this render and is not saved as look data."
                )}
              </p>
            </div>
            <div className="flex min-w-0 w-full max-w-full flex-col gap-1.5">
              <Label className="text-xs">
                {t(lang, "ภาพอ้างอิงที่จะใช้", "Reference image to use")}
              </Label>
              <div className="grid min-w-0 w-full max-w-full grid-cols-3 gap-2">
                {(
                  [
                    {
                      choice: "auto" as const,
                      thumbnailUrl: null,
                      available: true,
                      labelTh: "อัตโนมัติ",
                      labelEn: "Automatic",
                    },
                    {
                      choice: "primary" as const,
                      thumbnailUrl:
                        lookRenderDialog?.primaryThumbnailUrl ?? null,
                      available: Boolean(lookRenderDialog?.primaryAssetLinkId),
                      labelTh: "ภาพหลัก (primary)",
                      labelEn: "Main image (primary)",
                    },
                    {
                      choice: "look" as const,
                      thumbnailUrl: lookRenderDialog?.lookThumbnailUrl ?? null,
                      available: Boolean(lookRenderDialog?.lookAssetLinkId),
                      labelTh: "ภาพเดิมของลุคนี้",
                      labelEn: "This look's current image",
                    },
                  ] as const
                ).map(option => (
                  <button
                    key={option.choice}
                    type="button"
                    disabled={!option.available}
                    aria-pressed={lookRenderReferenceChoice === option.choice}
                    onClick={() => setLookRenderReferenceChoice(option.choice)}
                    className={cn(
                      "flex w-full min-w-0 max-w-full flex-col items-center gap-1 overflow-hidden rounded-md border p-1.5 text-[11px] transition-colors disabled:opacity-40",
                      lookRenderReferenceChoice === option.choice
                        ? "border-purple-400 bg-purple-50/60 ring-1 ring-purple-200"
                        : "border-border hover:border-muted-foreground/40"
                    )}
                    data-testid={`vd-look-render-reference-${option.choice}`}
                  >
                    <div className="flex aspect-[9/16] w-full min-w-0 items-center justify-center overflow-hidden rounded bg-muted">
                      {option.thumbnailUrl ? (
                        <AuthenticatedMediaImage
                          src={option.thumbnailUrl}
                          alt={t(lang, option.labelTh, option.labelEn)}
                          className="block h-full max-h-full w-full max-w-full object-cover"
                        />
                      ) : (
                        <Sparkles
                          aria-hidden="true"
                          className="h-4 w-4 text-muted-foreground"
                        />
                      )}
                    </div>
                    <span className="w-full min-w-0 truncate text-center leading-tight">
                      {t(lang, option.labelTh, option.labelEn)}
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {lookRenderReferenceChoice === "primary"
                  ? t(
                      lang,
                      "ล็อกใบหน้าจากภาพหลัก แต่ปล่อยให้ชุด/ทรงผมเปลี่ยนตามคำบรรยายด้านบน",
                      "Locks the face from the main image while leaving outfit/hair free to follow the brief above."
                    )
                  : lookRenderReferenceChoice === "look"
                    ? t(
                        lang,
                        "ต่อยอดจากภาพเดิมของลุคนี้ — คงชุดและใบหน้าเดิมไว้",
                        "Iterates on this look's current image — keeps its outfit and face."
                      )
                    : t(
                        lang,
                        "ให้ระบบเลือกภาพอ้างอิงเอง (ภาพของลุคนี้ถ้ามี ไม่งั้นภาพหลัก)",
                        "Let the server pick (this look's own image if it has one, otherwise the main image)."
                      )}
              </p>
            </div>
          </div>
          <DialogFooter className="min-w-0">
            <Button
              type="button"
              variant="ghost"
              onClick={closeLookRenderDialog}
            >
              {t(lang, "ยกเลิก", "Cancel")}
            </Button>
            <Button
              type="button"
              className="gap-2"
              disabled={!lookRenderDialog || generateImageMutation.isPending}
              onClick={() => {
                if (!lookRenderDialog) return;
                if (!requireModelSelected()) return;
                if (!requireMcpConnectionOrToast()) return;
                if (!requireHermesConnectionOrToast()) return;
                const request = buildLookRenderRequestFields({
                  lookCharacterId: lookRenderDialog.lookCharacterId,
                  instruction: lookRenderInstruction,
                  referenceChoice: lookRenderReferenceChoice,
                  primaryAssetLinkId: lookRenderDialog.primaryAssetLinkId,
                  lookAssetLinkId: lookRenderDialog.lookAssetLinkId,
                });
                confirmCharacterCreditAction(
                  request.characterId,
                  t(lang, "ยืนยันสร้างภาพลุค", "Confirm look image generation"),
                  t(
                    lang,
                    "การสร้างภาพลุคใช้ AI และอาจหักเครดิต ต้องการดำเนินการต่อหรือไม่?",
                    "Generating the look image uses AI and may spend credits. Continue?"
                  ),
                  t(lang, "สร้างภาพลุค", "Generate look image"),
                  () => {
                    closeLookRenderDialog();
                    fireDirectCharacterImageGeneration(
                      request.characterId,
                      request.customInstruction ?? "",
                      request.referenceAssetLinkId
                    );
                  }
                );
              }}
            >
              {generateImageMutation.isPending ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus aria-hidden="true" className="h-4 w-4" />
              )}
              {t(lang, "สร้างภาพลุค", "Generate look image")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={lookPromptDialog !== null}
        onOpenChange={open => {
          if (!open && !updateLookPromptMutation.isPending) {
            closeLookPromptDialog();
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil aria-hidden="true" className="h-4 w-4" />
              {t(lang, "แก้ไข prompt ของลุค", "Edit look prompt")}
            </DialogTitle>
            <DialogDescription>
              {t(
                lang,
                "แก้ไขเฉพาะรายละเอียดภาพ เสื้อผ้า ทรงผม เมกอัป รองเท้า และเครื่องประดับ ใบหน้า รูปร่าง และอายุของตัวละครจะยังคงเดิม",
                "Edit only the visual details: clothing, hair, makeup, footwear, and accessories. The character's face, body, and age remain unchanged."
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-muted/30 px-3 py-2 text-xs">
              <span className="font-medium text-foreground">
                {lookPromptDialog?.characterName}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                {lookPromptDialog?.lookLabel}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vd-look-prompt-editor">
                {t(lang, "รายละเอียด prompt เต็ม", "Full prompt details")}
              </Label>
              <Textarea
                id="vd-look-prompt-editor"
                value={lookPromptInput}
                onChange={event => setLookPromptInput(event.target.value)}
                maxLength={2000}
                rows={14}
                className="min-h-56 w-full min-w-0 max-w-full resize-y font-mono text-xs leading-relaxed"
                placeholder={t(
                  lang,
                  "เช่น เสื้อเชิ้ตผ้าลินินสีครีม แขนพับ กางเกงทรงตรง รองเท้าหนังเรียบ ทรงผมและเมกอัปเหมาะกับฉาก...",
                  "Example: cream linen shirt with rolled sleeves, straight-leg trousers, simple leather shoes, scene-appropriate hair and makeup..."
                )}
                data-testid="vd-look-prompt-editor"
              />
              <p className="text-[11px] text-muted-foreground">
                {t(
                  lang,
                  `${lookPromptInput.length}/2000 ตัวอักษร · หลังบันทึก ระบบจะติดสถานะให้ตรวจสอบ เพื่อป้องกันการเขียนทับโดยอัตโนมัติ`,
                  `${lookPromptInput.length}/2000 characters · After saving, the look is marked for review so automatic repair will not overwrite it.`
                )}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={closeLookPromptDialog}
              disabled={updateLookPromptMutation.isPending}
            >
              {t(lang, "ยกเลิก", "Cancel")}
            </Button>
            <Button
              type="button"
              className="gap-2"
              onClick={handleSaveLookPrompt}
              disabled={
                updateLookPromptMutation.isPending ||
                !lookPromptInput.trim() ||
                lookPromptInput.trim() ===
                  lookPromptDialog?.originalPrompt.trim()
              }
              data-testid="vd-save-look-prompt"
            >
              {updateLookPromptMutation.isPending ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
              )}
              {t(lang, "บันทึก prompt", "Save prompt")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImageLightbox
        images={lightboxImage ? [lightboxImage] : []}
        open={lightboxImage !== null}
        onClose={() => setLightboxImage(null)}
      />

      <VerticalDramaCharacterMergeReviewDialog
        seriesId={seriesId}
        lang={lang}
        open={isMergeReviewOpen}
        onOpenChange={setIsMergeReviewOpen}
      />
    </section>
  );
}

export default VerticalDramaCharacterStockPanel;
