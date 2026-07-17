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
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Grid3x3,
  ImagePlus,
  Loader2,
  Merge,
  Plus,
  Shirt,
  Sparkles,
  Trash2,
  UploadCloud,
  User,
  UserPlus,
  Users,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";

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
import { trpc } from "@/lib/trpc";
import { useVerticalDramaLang } from "@/components/verticalDramaSeries/verticalDramaCopy";
import { VD_COPY } from "@/components/verticalDramaSeries/verticalDramaWorkspaceCopy";
import { VerticalDramaCharacterReferencePanel } from "@/components/verticalDramaSeries/VerticalDramaCharacterReferencePanel";
import { VerticalDramaCharacterVoiceCastingCard } from "@/components/verticalDramaSeries/VerticalDramaCharacterVoiceCastingCard";
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
import { readDroppedImageInput, readFileAsDataUrl } from "@/components/media/ImageSourcePicker";
import ModelSelectorDialog, {
  type MediaModel,
} from "@/components/media/ModelSelectorDialog";
import { McpConnectionPicker } from "@/components/media/McpConnectionPicker";
import { HermesConnectionPicker } from "@/components/media/HermesConnectionPicker";
import { formatHermesErrorForToast, presentHermesError } from "@/lib/hermesErrorPresentation";
import { MediaPromptPreview } from "@/components/chat/MediaPromptPreview";
import { ImageLightbox } from "@/components/chat/media/ImageLightbox";
import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { Grid } from "@astryxdesign/core/Grid";
import { SelectableCard } from "@astryxdesign/core/SelectableCard";
import { resolveMediaModelTransportConfig } from "@shared/mediaModelTransport";
import { splitImage, type SplitResult } from "@/lib/imageGridSplitter";
import type {
  VerticalDramaCharacterAsset,
  VdCharacterNeedsSetupReason,
} from "@shared/verticalDramaSeries/characterAssets";
import type { VerticalDramaApprovedCharacterDesignSnapshot } from "@shared/verticalDramaSeries/characterProfile";
import {
  VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS,
  VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_LABELS_EN,
  VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_LABELS_TH,
  normalizeTargetAudienceRegion,
  type VerticalDramaTargetAudienceRegion,
} from "@shared/verticalDramaSeries/targetAudienceRegion";
import {
  ROLE_TIER_LABELS,
  ROLE_TIER_VALUES,
  roleTierToNarrativeRole,
  type RoleTier,
} from "@shared/verticalDramaSeries/narrativeRole";
import {
  isCharacterLockPolicyFailureMessage,
  VD_CHARACTER_LOCK_MAX_SOFTEN_LEVEL,
} from "@shared/verticalDramaSeries/characterLock";

function getCanonicalRoleLabel(
  roleTier: string | null | undefined,
  lang: "th" | "en",
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
  reasons: readonly VdCharacterNeedsSetupReason[],
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

/** Best-effort localStorage access. Reads/writes here are only a CONVENIENCE
 *  cache (remembered model/MCP-connection defaults) — never the source of
 *  truth. They MUST NOT throw: `localStorage.setItem` raises
 *  `QuotaExceededError` when the origin's storage is full (common for heavy
 *  users) and `getItem`/`setItem` raise `SecurityError` in
 *  sandboxed/blocked-storage contexts. An unguarded throw here used to abort
 *  the whole click handler BEFORE the real (state/mutation) action fired.
 *  Swallow the error and let the real action proceed. */
function safeStorageGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* quota exceeded / storage blocked — cache is best-effort, ignore */
  }
}

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
export const HERMES_CONNECTION_ID_STORAGE_KEY = "smartspec_hermes_connection_id";

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
      (nextTime === existingTime && a.state === "approved" && existing.state !== "approved")
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
  const approved = portraitAssets.find(a => a.state === "approved");
  const latestGenerated = [...portraitAssets]
    .filter(a => a.state === "generated" || a.state === "imported")
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )[0];
  const chosen = approved ?? latestGenerated;
  if (chosen?.thumbnailUrl) {
    return { thumbnailUrl: chosen.thumbnailUrl, assetLinkId: chosen.assetLinkId };
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
        sourceName: isTwinOfThis ? entry.name : (entry.variantLabel ?? entry.name),
      }))
    );
  }

  return candidates;
}

/**
 * Mirrors the backend's `getPrimaryPortraitUrl` selection ordering exactly
 * (approved-first, then newest-updated — same rule
 * {@link resolveCharacterCardPortraitAsset} already applies for the roster
 * card thumbnail) so the picker's default/pre-selected candidate always
 * matches today's auto-resolution behavior byte-for-byte until the user
 * actively picks a different one. Returns `null` when the character has no
 * `primary_portrait` of its own yet (matches the real "no reference
 * attached" auto behavior for a brand-new variant/twin — see
 * {@link buildReferenceCandidates}'s doc comment).
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

/** Minimum shape `buildCharacterRosterEntries` needs from a character DTO
 *  (planning/vertical-drama-character-variants/plan.md Phase E) — kept
 *  separate from the full `characterRowToDto` response shape so this stays
 *  testable with plain fixtures rather than the full tRPC response type. */
export interface VdRosterCharacterFields {
  characterId: string;
  name: string;
  parentCharacterId?: string;
  variantLabel?: string;
  sharesFaceWithCharacterId?: string;
  /** Set B (`vd-stuck-generation-and-lost-characters` plan) — DTO
   *  completeness signal (`characterRowToDto`'s `needsSetup`/
   *  `needsSetupReasons`); optional here so plain fixtures without it keep
   *  working. */
  needsSetup?: boolean;
  needsSetupReasons?: VdCharacterNeedsSetupReason[];
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
      shareFaceSourceName: c.sharesFaceWithCharacterId
        ? characters.find(other => other.characterId === c.sharesFaceWithCharacterId)?.name
        : undefined,
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
export function filterRosterEntriesNeedingSetup<T extends VdRosterCharacterFields>(
  entries: VdRosterEntry<T>[]
): VdRosterEntry<T>[] {
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

/** Exact payload shape `verticalDramaCharacters.createCharacterTwin` expects
 *  (`server/routers/verticalDramaCharacters.ts`, ~line 1057) — same rationale
 *  as `VdCreateCharacterVariantInput` above for why this isn't imported from
 *  the router file directly. */
export interface VdCreateCharacterTwinInput {
  seriesId: string;
  sharesFaceWithCharacterId: string;
  name: string;
  role?: string;
  customDescription?: string;
  referenceMediaAssetId?: string;
}

/** Builds the `createCharacterTwin` mutation payload from the "เพิ่มแฝด"
 *  dialog's raw form state — same trim/omit-when-empty convention as
 *  `buildCreateCharacterVariantInput` above. */
export function buildCreateCharacterTwinInput(params: {
  seriesId: string;
  sharesFaceWithCharacterId: string;
  name: string;
  role: string;
  customDescription: string;
  referenceMediaAssetId: string | null;
}): VdCreateCharacterTwinInput {
  const name = params.name.trim();
  const role = params.role.trim();
  const customDescription = params.customDescription.trim();
  return {
    seriesId: params.seriesId,
    sharesFaceWithCharacterId: params.sharesFaceWithCharacterId,
    name,
    ...(role ? { role } : {}),
    ...(customDescription ? { customDescription } : {}),
    ...(params.referenceMediaAssetId
      ? { referenceMediaAssetId: params.referenceMediaAssetId }
      : {}),
  };
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
  customInstruction?: string;
  portraitCandidateCount?: number;
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
  customInstruction: string;
  portraitCandidateCount?: number;
}): VdPreviewCharacterPromptInput {
  const customInstruction = params.customInstruction.trim();
  return {
    seriesId: params.seriesId,
    characterId: params.characterId,
    ...(customInstruction ? { customInstruction } : {}),
    ...(params.portraitCandidateCount
      ? { portraitCandidateCount: params.portraitCandidateCount }
      : {}),
  };
}

export function isFirstPortraitCandidateEligible(
  character: {
    characterId: string;
    parentCharacterId?: string;
    sharesFaceWithCharacterId?: string;
    data?: Record<string, unknown>;
  },
  assets: VerticalDramaCharacterAsset[],
): boolean {
  if (character.parentCharacterId || character.sharesFaceWithCharacterId) return false;
  // Legacy stories may already contain a saved visual bible even though no
  // portrait was ever rendered. Candidate casting is gated by the actual
  // primary portrait lifecycle, not by that legacy planning snapshot.
  return !assets.some(
    (asset) =>
      asset.characterId === character.characterId && asset.role === "primary_portrait",
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
  candidates: VdPortraitCandidateUiItem[];
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
  mcpConnectionId?: string;
  sharedGroupId?: number;
  /** Feature 135 — Hermes/Grok media worker transport. Mutually exclusive
   *  with `mcpConnectionId` (a model row resolves to exactly one transport). */
  hermesConnectionId?: string;
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
  imageModelUsesMcp: boolean;
  mcpConnectionId?: string | null;
  sharedGroupId?: number | null;
  /** Feature 135 — Hermes/Grok media worker transport gate, sibling of
   *  `imageModelUsesMcp`. */
  imageModelUsesHermes?: boolean;
  hermesConnectionId?: string | null;
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
      ...(params.imageModelUsesMcp && params.mcpConnectionId
        ? { mcpConnectionId: params.mcpConnectionId }
        : {}),
      ...(params.imageModelUsesMcp && params.mcpConnectionId && params.sharedGroupId != null
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
  return err?.message ?? t(lang, "เกิดข้อผิดพลาด", "Something went wrong");
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
  return (
    /เลือกโมเดลภาพ/.test(message) ||
    /image model/i.test(message)
  );
}

function extractCharacterDescriptionForDisplay(
  data: Record<string, unknown> | null | undefined
): string | undefined {
  if (!data) return undefined;
  const parts: string[] = [];
  if (typeof data.personality === "string" && data.personality.trim()) {
    parts.push(`Personality: ${data.personality.trim()}`);
  }
  if (typeof data.backstory === "string" && data.backstory.trim()) {
    parts.push(`Backstory: ${data.backstory.trim()}`);
  }
  if (typeof data.identityLock === "string" && data.identityLock.trim()) {
    parts.push(`Identity lock: ${data.identityLock.trim()}`);
  }
  if (Array.isArray(data.wardrobeRules)) {
    const rules = data.wardrobeRules.filter(
      (rule): rule is string =>
        typeof rule === "string" && rule.trim().length > 0
    );
    if (rules.length > 0) parts.push(`Wardrobe rules: ${rules.join("; ")}`);
  }
  return parts.length > 0 ? parts.join(" | ") : undefined;
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
    if (bibleName.includes(characterName) || characterName.includes(bibleName)) {
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
    (VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS as readonly string[]).includes(rawRegion)
      ? rawRegion
      : "";
  const ethnicityText = typeof data?.ethnicityText === "string" ? data.ethnicityText : "";
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
    ...(form.region ? { region: form.region as VerticalDramaTargetAudienceRegion } : {}),
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
): { region: VerticalDramaTargetAudienceRegion | null; ethnicityText: string | null } {
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
  const ethnicityText = typeof data?.ethnicityText === "string" ? data.ethnicityText.trim() : "";
  if (ethnicityText) return ethnicityText;
  const rawRegion = data?.region;
  if (
    typeof rawRegion === "string" &&
    (VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS as readonly string[]).includes(rawRegion)
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
  lang: Lang,
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
  saved: VdPortraitCandidateUiItem | undefined,
): VdPortraitCandidateUiItem {
  if (!saved) return candidate;
  const merged: VdPortraitCandidateUiItem = {
    ...candidate,
    ...(saved.taskId && !candidate.taskId ? { taskId: saved.taskId } : {}),
    ...(saved.imageUrl && !candidate.imageUrl ? { imageUrl: saved.imageUrl } : {}),
  };
  if (saved.status === "selected" || saved.status === "superseded") {
    return { ...merged, status: saved.status };
  }
  const inMemoryIsTerminal = VD_PORTRAIT_CANDIDATE_TERMINAL_STATUSES.has(candidate.status);
  if (!inMemoryIsTerminal && (saved.status === "failed" || saved.status === "completed")) {
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
  assetLinkId: string,
): VdPortraitCandidateUiBatch {
  return {
    ...batch,
    candidates: batch.candidates.filter(candidate => candidate.assetLinkId !== assetLinkId),
  };
}

/**
 * Set A fix #4 gate. `generatePortraitCandidateBatch`'s server input has no
 * `softenLevel` field yet (verified against
 * `server/routers/verticalDramaCharacters.ts:909-920`, 2026-07-16) — unlike
 * `generateStartFrameImage`/`generateShotImageAction`, which do accept one
 * and drive `pollStartFrameTask`'s auto-soften in
 * `VerticalDramaEpisodePage.tsx`. Until the server candidate-submit path
 * accepts a `softenLevel`, this always returns `false`, so a
 * policy-classified candidate failure surfaces its message on the card and
 * relies on the manual Retry button (fix #3) instead of an automatic
 * resubmit.
 *
 * TODO(soften): once the server accepts `softenLevel` on
 * `generatePortraitCandidateBatch`, flip `PORTRAIT_CANDIDATE_SOFTEN_SUPPORTED`
 * to `true`, thread a `softenLevel` parameter through
 * `pollPortraitCandidateTask` (mirroring `pollStartFrameTask`'s signature),
 * and resubmit via `generatePortraitCandidateBatchMutation` with
 * `softenLevel + 1` exactly like `pollStartFrameTask` does.
 */
const PORTRAIT_CANDIDATE_SOFTEN_SUPPORTED = false;
export function shouldAutoSoftenPortraitCandidate(
  errorMessage: string | undefined,
  softenLevel: number,
): boolean {
  return (
    PORTRAIT_CANDIDATE_SOFTEN_SUPPORTED &&
    isCharacterLockPolicyFailureMessage(errorMessage) &&
    softenLevel < VD_CHARACTER_LOCK_MAX_SOFTEN_LEVEL
  );
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
  className,
}: VerticalDramaCharacterStockPanelProps) {
  const lang = useVerticalDramaLang();
  const utils = trpc.useUtils();

  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(
    null
  );
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
      const setTiles = kind === "turnaround" ? setTurnaroundSplitTiles : setSheetSplitTiles;
      setTiles(prev => ({ ...prev, [characterId]: results }));
    } catch {
      toast.error(
        t(lang, "ตัดภาพไม่สำเร็จ — ตรวจสอบ URL ของภาพ", "Failed to split the image — check the image URL.")
      );
    } finally {
      setSplittingResultKey(current => (current === resultKey ? null : current));
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
   *  clobbers another character's choice; absent key = "use auto-
   *  resolution" (today's exact default backend behavior, unchanged).
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
  const [portraitCandidateCountByCharacter, setPortraitCandidateCountByCharacter] =
    useState<Record<string, number>>({});
  const [portraitCandidateBatches, setPortraitCandidateBatches] = useState<
    Record<string, VdPortraitCandidateUiBatch>
  >({});
  const [pollingPortraitCandidateAssetIds, setPollingPortraitCandidateAssetIds] =
    useState<Set<string>>(new Set());
  const resumedPortraitCandidateTasksRef = useRef<Set<string>>(new Set());
  /** Set A fix #3: assetLinkIds currently mid-Retry (from the fresh
   *  single-candidate preview call through the batch-submit mutation) — used
   *  only to disable that one candidate's Retry button against double-clicks
   *  while the round-trip is in flight. */
  const [retryingPortraitCandidateAssetIds, setRetryingPortraitCandidateAssetIds] =
    useState<Set<string>>(new Set());

  /** Persistent right-side sidebar column (Library / History / Grid cutter
   *  reference picker) — mirrors Media Studio's own collapsible right panel
   *  (`isRightPanelCollapsed` in MediaStudio.tsx) so the pattern reads the
   *  same across pages. Defaults to expanded whenever a character is
   *  selected; collapsing it reclaims horizontal space for the detail card. */
  const [isReferencePanelCollapsed, setIsReferencePanelCollapsed] =
    useState(false);

  /** Model picker for the two "Generate" actions (portrait + character sheet),
   *  mirroring Media Studio's own model-selector-before-generate UX. Persisted
   *  to localStorage (same convention as MediaStudio.tsx's own
   *  `smartspec_video_voice_model` / `smartspec_video_music_model` keys) so
   *  the user doesn't have to re-pick a model every single generate. */
  const [isModelDialogOpen, setIsModelDialogOpen] = useState(false);
  const [selectedImageModelId, setSelectedImageModelId] = useState(
    () => safeStorageGet(VD_CHARACTER_IMAGE_MODEL_STORAGE_KEY) || ""
  );
  const handleSelectImageModel = (modelId: string) => {
    setSelectedImageModelId(modelId);
    safeStorageSet(VD_CHARACTER_IMAGE_MODEL_STORAGE_KEY, modelId);
  };
  const imageModelsQuery = trpc.mediaModels.list.useQuery({ type: "image" });
  const imageModels = (imageModelsQuery.data?.models ?? []) as MediaModel[];
  const selectedImageModelRecord = imageModels.find(
    m => m.modelId === selectedImageModelId
  );
  /** Whether the currently-selected image model is MCP-transport (e.g.
   *  `higgsfield/*`, `magnific-mcp/*`) — mirrors
   *  `VerticalDramaEpisodePage.tsx`'s own `imageModelUsesMcp` derivation so
   *  the character tab shows the same MCP-connection picker + guard the
   *  episode workspace already has. */
  const imageModelUsesMcp =
    Boolean(selectedImageModelId) &&
    resolveMediaModelTransportConfig({
      provider: selectedImageModelRecord?.provider,
      modelId: selectedImageModelRecord?.modelId ?? selectedImageModelId,
      configJson: selectedImageModelRecord?.configJson as Record<string, unknown> | undefined,
    }).transport === "mcp";
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
    Boolean(selectedImageModelId) &&
    resolveMediaModelTransportConfig({
      provider: selectedImageModelRecord?.provider,
      modelId: selectedImageModelRecord?.modelId ?? selectedImageModelId,
      configJson: selectedImageModelRecord?.configJson as Record<string, unknown> | undefined,
    }).transport === "hermes_worker";
  const [hermesConnectionId, setHermesConnectionIdState] = useState<string | null>(
    readStoredHermesConnectionId
  );
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
    (seriesQuery.data?.series as { bible?: Record<string, unknown> | null } | undefined)
      ?.bible ?? null;
  /** Chip shown in this panel's header so users always know what
   *  region/ethnicity default is currently applied to generated character
   *  images (series settings tab is where it's changed). */
  const targetAudienceRegion = normalizeTargetAudienceRegion(
    seriesBible?.targetAudienceRegion,
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
  const voiceCatalogQuery = trpc.verticalDramaCharacters.listVoiceCatalog.useQuery(
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
        toast.success(t(lang, "บันทึกโปรไฟล์เสียงพูดแล้ว", "Speech profile saved"));
      },
      onError,
    });

  const updateCharacterRoleMutation =
    trpc.verticalDramaCharacters.updateCharacter.useMutation({
      onSuccess: () => {
        invalidate();
        toast.success(t(lang, "บันทึกบทบาทตัวละครแล้ว", "Narrative role saved"));
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

  const speechProfileFormFor = (characterId: string): VdSpeechProfileFormState => {
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
    const parsed = speechProfileSchema.safeParse(formStateToSpeechProfile(form));
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

  /** Per-character ethnicity/region override — save mutation
   *  (planning/vd-per-character-ethnicity/plan.md). A dedicated hook (rather
   *  than reusing `updateCharacterMutation`/`updateCharacterRoleMutation`)
   *  so its own `isPending`/`variables` can drive this section's Save button
   *  independently, same "one hook per editing sub-section" convention as
   *  the two above. */
  const updateCharacterRegionMutation =
    trpc.verticalDramaCharacters.updateCharacter.useMutation({
      onSuccess: () => {
        invalidate();
        toast.success(t(lang, "บันทึกเชื้อชาติ/ภูมิภาคของตัวละครแล้ว", "Character ethnicity/region saved"));
      },
      onError,
    });

  /** Draft-form buffer for the region/ethnicity controls, keyed by
   *  characterId — same "local draft > persisted fallback, never reset on
   *  selection change" convention as `speechProfileFormDrafts` above. */
  const [regionOverrideFormDrafts, setRegionOverrideFormDrafts] = useState<
    Record<string, VdRegionOverrideFormState>
  >({});

  const regionOverrideFormFor = (characterId: string): VdRegionOverrideFormState => {
    const existingDraft = regionOverrideFormDrafts[characterId];
    if (existingDraft) return existingDraft;
    const character = characters.find(
      (c: VdCharacterListItem) => c.characterId === characterId
    );
    return regionOverrideFormFromCharacterData(
      (character?.data as Record<string, unknown> | null | undefined) ?? undefined
    );
  };

  const updateRegionOverrideForm = (
    characterId: string,
    patch: Partial<VdRegionOverrideFormState>
  ) => {
    setRegionOverrideFormDrafts(prev => ({
      ...prev,
      [characterId]: { ...regionOverrideFormFor(characterId), ...patch },
    }));
  };

  const handleSaveRegionOverride = (characterId: string) => {
    const form = regionOverrideFormFor(characterId);
    updateCharacterRegionMutation.mutate({
      seriesId,
      characterId,
      ...buildCharacterRegionOverrideUpdateFields(form),
    });
  };

  /** New-character "Add character" card draft state (create surface — see
   *  `newName`/`newRole`/`newRoleTier` above). Separate from
   *  `regionOverrideFormDrafts` (which is for the per-character EDIT
   *  surface, keyed by an existing characterId) since there is no
   *  characterId yet for a not-yet-created character. */
  const [newRegionOverride, setNewRegionOverride] =
    useState<VdRegionOverrideFormState>(VD_REGION_OVERRIDE_FORM_DEFAULTS);

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
  const [voicePreviewCreditCostByCharacterId, setVoicePreviewCreditCostByCharacterId] =
    useState<Record<string, number>>({});

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
              t(lang, "สร้างตัวอย่างเสียงสำเร็จแต่ไม่พบ URL ผลลัพธ์", "Preview completed but no result URL.")
            );
            return;
          }
          setVoicePreviewUrlByCharacterId(prev => ({ ...prev, [characterId]: resultUrl }));
          return;
        }
        if (status === "failed") {
          const errorMessage = (task as { errorMessage?: string } | null)?.errorMessage;
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
        t(lang, "สร้างตัวอย่างเสียงใช้เวลานานเกินไป ลองตรวจสอบภายหลัง", "Preview is taking too long — check back later.")
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

  const handleCastVoice = (characterId: string, entry: VerticalDramaVoiceCatalogEntry) => {
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
        setNewRegionOverride(VD_REGION_OVERRIDE_FORM_DEFAULTS);
        setSelectedCharacterId(res.character.characterId);
        invalidate();
        toast.success(t(lang, "เพิ่มตัวละครแล้ว", "Character added"));
      },
      onError,
    });

  const linkMutation = trpc.verticalDramaCharacters.linkAsset.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success(t(lang, "นำเข้าอ้างอิงแล้ว", "Reference imported"));
    },
    onError,
  });

  const deleteAssetMutation = trpc.verticalDramaCharacters.deleteAsset.useMutation({
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
  const [variantReferenceMediaAssetId, setVariantReferenceMediaAssetId] =
    useState<string | null>(null);
  const [variantReferencePreviewUrl, setVariantReferencePreviewUrl] =
    useState<string | null>(null);
  const [variantReferenceResolving, setVariantReferenceResolving] =
    useState(false);
  const [variantReferenceDragOver, setVariantReferenceDragOver] =
    useState(false);
  const variantReferenceInputRef = useRef<HTMLInputElement>(null);

  const openVariantDialog = (character: { characterId: string; name: string }) => {
    setVariantDialogCharacter(character);
    setVariantLabelInput("");
    setVariantTypeInput("outfit");
    setVariantDescriptionInput("");
    setVariantReferenceMediaAssetId(null);
    setVariantReferencePreviewUrl(null);
  };
  const closeVariantDialog = () => setVariantDialogCharacter(null);

  /** "เพิ่มแฝด" dialog — same open/closed convention as the variant dialog
   *  above, holding the SOURCE (face-sharing) character it was opened for. */
  const [twinDialogCharacter, setTwinDialogCharacter] = useState<{
    characterId: string;
    name: string;
  } | null>(null);
  const [twinNameInput, setTwinNameInput] = useState("");
  const [twinRoleInput, setTwinRoleInput] = useState("");
  const [twinDescriptionInput, setTwinDescriptionInput] = useState("");
  const [twinReferenceMediaAssetId, setTwinReferenceMediaAssetId] = useState<
    string | null
  >(null);
  const [twinReferencePreviewUrl, setTwinReferencePreviewUrl] = useState<
    string | null
  >(null);
  const [twinReferenceResolving, setTwinReferenceResolving] = useState(false);
  const [twinReferenceDragOver, setTwinReferenceDragOver] = useState(false);
  const twinReferenceInputRef = useRef<HTMLInputElement>(null);

  const openTwinDialog = (character: { characterId: string; name: string }) => {
    setTwinDialogCharacter(character);
    setTwinNameInput("");
    setTwinRoleInput("");
    setTwinDescriptionInput("");
    setTwinReferenceMediaAssetId(null);
    setTwinReferencePreviewUrl(null);
  };
  const closeTwinDialog = () => setTwinDialogCharacter(null);

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
          t(lang, "เพิ่มลุคแล้ว กำลังสร้างภาพลุค...", "Look added. Generating the look's image...")
        );
        fireDirectCharacterImageGeneration(res.character.characterId);
      },
      onError,
    });

  const createTwinMutation =
    trpc.verticalDramaCharacters.createCharacterTwin.useMutation({
      onSuccess: res => {
        invalidate();
        setSelectedCharacterId(res.character.characterId);
        toast.success(t(lang, "เพิ่มแฝดแล้ว", "Twin added"));
        closeTwinDialog();
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
        invalidate();
        toast.success(buildDetectCharacterVariantsSummaryMessage(lang, res));
      },
      onError,
    });

  /**
   * Poll a submitted character portrait/sheet generation task
   * (`generateCharacterImage`/`generateCharacterSheet` return `{taskId,
   * ...promptMeta}` — async submit, matching how every other real
   * image/video generation in the app works, so it shows in Media History
   * with correct credit deduction) until it completes, then finalize via the
   * same already-tested resolve-then-link flow the Library/History picker
   * uses: `resolveMediaAssetForImport` -> `linkAsset`.
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
    try {
      for (
        let attempt = 0;
        attempt < VD_CHARACTER_IMAGE_POLL_MAX_ATTEMPTS;
        attempt++
      ) {
        const task = await utils.media.getTask.fetch({ taskId });
        const status = (task as { status?: string } | null)?.status;
        if (status === "completed") {
          const resultUrl = (task as { resultUrl?: string } | null)?.resultUrl;
          if (!resultUrl) {
            toast.error(
              t(lang, "สร้างภาพสำเร็จแต่ไม่พบ URL ผลลัพธ์", "Generation completed but no result URL.")
            );
            return;
          }
          let resolved: { mediaAssetId: string };
          try {
            resolved = await cardResolveMutation.mutateAsync({
              seriesId,
              source: "url",
              url: resultUrl,
              mimeType: guessImageMimeTypeFromUrl(resultUrl),
            });
            await linkMutation.mutateAsync({
              seriesId,
              characterId,
              mediaAssetId: resolved.mediaAssetId,
              assetType: "character_reference",
              role,
              source: "generated",
              ...(metadata ? { metadata } : {}),
            });
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
            [characterId]: { imageUrl: resultUrl, mediaAssetId: resolved.mediaAssetId },
          }));
          const roleLabelTh =
            role === "primary_portrait"
              ? "ภาพตัวละคร"
              : role === "character_sheet_turnaround"
                ? "ชีทตัวละคร"
                : role === "character_sheet_full"
                  ? "Character Sheet แบบเต็ม"
                  : (sheetTypeLabelFromMetadata(metadata, "th") ??
                    "ชีท Character Design Bible");
          const roleLabelEn =
            role === "primary_portrait"
              ? "Character image"
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
          const failedTask = task as { errorMessage?: string; errorCode?: string } | null;
          const errorMessage = failedTask?.errorMessage;
          // Feature 135 section-10 review fix: prefer the typed hermes
          // presentation (reads `MediaTask.errorCode`, section-06) when this
          // was a hermes_ task; every other/legacy task falls through to the
          // exact pre-existing bilingual "<generic>: <errorMessage>" format.
          const hermesPresentation = presentHermesError(failedTask);
          toast.error(
            hermesPresentation
              ? formatHermesErrorForToast(hermesPresentation, lang)
              : t(lang, `สร้างภาพล้มเหลว${errorMessage ? `: ${errorMessage}` : ""}`, `Generation failed${errorMessage ? `: ${errorMessage}` : ""}`)
          );
          return;
        }
        await new Promise(resolve =>
          setTimeout(resolve, VD_CHARACTER_IMAGE_POLL_INTERVAL_MS)
        );
      }
      toast.error(
        t(lang, "สร้างภาพใช้เวลานานเกินไป ลองตรวจสอบภายหลัง", "Generation is taking too long — check back later.")
      );
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
        if (res.dnaPersistenceStatus === "failed" && res.dnaPersistenceWarning) {
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
      onError: onImageModelError,
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
   */
  const fireDirectCharacterImageGeneration = (characterId: string) => {
    generateImageMutation.mutate({
      seriesId,
      characterId,
      selectedImageModelId,
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
        if (res.dnaPersistenceStatus === "failed" && res.dnaPersistenceWarning) {
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
      onError: onImageModelError,
    });

  const settlePortraitCandidateMutation =
    trpc.verticalDramaCharacters.settlePortraitCandidate.useMutation();

  const updatePortraitCandidateUi = (
    characterId: string,
    assetLinkId: string,
    patch: Partial<VdPortraitCandidateUiItem>,
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
    taskId?: string,
  ) {
    if (pollingPortraitCandidateAssetIds.has(assetLinkId)) return;
    setPollingPortraitCandidateAssetIds(prev => new Set(prev).add(assetLinkId));
    try {
      for (
        let attempt = 0;
        attempt < VD_CHARACTER_IMAGE_POLL_MAX_ATTEMPTS;
        attempt += 1
      ) {
        const result = await settlePortraitCandidateMutation.mutateAsync({
          seriesId,
          assetLinkId,
          ...(taskId ? { taskId } : {}),
        });
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
          // Set A fix #4: `shouldAutoSoftenPortraitCandidate` mirrors
          // `pollStartFrameTask`'s auto-soften gate (VerticalDramaEpisodePage.tsx)
          // but is currently ALWAYS `false` — the server's
          // `generatePortraitCandidateBatch` input has no `softenLevel` field
          // yet (see that function's own doc comment / `TODO(soften)`), so no
          // auto-resubmit fires here. A policy-classified failure still gets
          // its own toast pointing at the manual Retry button below instead
          // of a silent generic failure message.
          const willAutoSoften = shouldAutoSoftenPortraitCandidate(
            result.errorMessage,
            0,
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
        await new Promise(resolve =>
          setTimeout(resolve, VD_CHARACTER_IMAGE_POLL_INTERVAL_MS)
        );
      }
      // Set A fix #1: previously this only toasted, leaving the card frozen
      // on "กำลังสร้าง…" forever — now also patches a terminal `failed`
      // status (with a Retry button available once rendered) via
      // `buildPortraitCandidateTimeoutPatch`.
      updatePortraitCandidateUi(
        characterId,
        assetLinkId,
        buildPortraitCandidateTimeoutPatch(lang),
      );
      toast.error(
        t(
          lang,
          "ภาพตัวเลือกใช้เวลานานเกินไป ระบบจะเก็บงานไว้ให้ตรวจสอบภายหลัง",
          "Candidate generation is taking longer than expected; the task remains saved for later review."
        )
      );
    } catch (error) {
      // Same Set A fix #1 rationale: a thrown poll error (network failure,
      // etc.) must also leave a terminal state, not just an errorMessage on
      // an otherwise still-"queued"-looking card.
      updatePortraitCandidateUi(characterId, assetLinkId, {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Polling failed",
      });
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
            result.candidates.map(candidate => [candidate.assetLinkId, candidate]),
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
              candidate.taskId,
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
        toast.success(
          t(
            lang,
            "เลือกภาพหลักและล็อก Character DNA แล้ว",
            "Primary portrait selected and Character DNA locked."
          )
        );
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
      onError,
    });

  /** Which character is currently waiting on `previewCharacterPromptMutation`
   *  — tracked separately from the mutation's own `variables` purely for
   *  clarity/parity with the rest of this file's per-character loading-state
   *  pattern. Cleared as soon as the preview resolves (success or error). */
  const [pendingPreviewTarget, setPendingPreviewTarget] = useState<{
    characterId: string;
  } | null>(null);

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
    } | null>(null);

  /** Entry point for the portrait generate button (card grid + selected-
   *  character detail panel) — replaces the previous direct
   *  `generateImageMutation` call. Still gates on `requireModelSelected()`
   *  exactly as before; only inserts the preview fetch in between "click"
   *  and "real mutation fires". */
  const startCharacterPromptPreview = (characterId: string) => {
    if (!requireModelSelected()) return;
    if (!requireMcpConnectionOrToast()) return;
    if (!requireHermesConnectionOrToast()) return;
    const character = characters.find(
      (candidate: VdCharacterListItem) => candidate.characterId === characterId
    );
    const useCandidateBatch = Boolean(
      character && isFirstPortraitCandidateEligible(character, assets)
    );
    if (useCandidateBatch) setSelectedCharacterId(characterId);
    setPendingPreviewTarget({ characterId });
    previewCharacterPromptMutation.mutate(
      buildPreviewCharacterPromptInput({
        seriesId,
        characterId,
        customInstruction: customInstructionByCharacter[characterId] ?? "",
        ...(useCandidateBatch
          ? {
              portraitCandidateCount:
                portraitCandidateCountByCharacter[characterId] ?? 3,
            }
          : {}),
      }),
      {
        onSuccess: res => {
          setPendingPreviewTarget(null);
          if (res.mode === "candidate_batch") {
            setPendingCharacterPromptPreview(null);
            setPortraitCandidateBatches(prev => ({
              ...prev,
              [characterId]: {
                batchId: res.batchId,
                characterId,
                sharedVisualLanguage: res.sharedVisualLanguage,
                model: res.model,
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
          });
        },
        onError: () => {
          setPendingPreviewTarget(null);
        },
      }
    );
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
      imageModelUsesMcp,
      mcpConnectionId,
      sharedGroupId: mcpSharedGroupId,
      imageModelUsesHermes,
      hermesConnectionId,
      referenceAssetLinkId: referenceOverrideByCharacter[characterId] ?? null,
    });
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
      ...(imageModelUsesHermes && hermesConnectionId ? { hermesConnectionId } : {}),
    });
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
  const cancelPortraitCandidate = (characterId: string, assetLinkId: string) => {
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
  const retryPortraitCandidate = (characterId: string, assetLinkId: string) => {
    if (!requireModelSelected()) return;
    if (!requireMcpConnectionOrToast()) return;
    if (!requireHermesConnectionOrToast()) return;
    setRetryingPortraitCandidateAssetIds(prev => new Set(prev).add(assetLinkId));
    const clearRetrying = () =>
      setRetryingPortraitCandidateAssetIds(prev => {
        if (!prev.has(assetLinkId)) return prev;
        const next = new Set(prev);
        next.delete(assetLinkId);
        return next;
      });
    previewCharacterPromptMutation.mutate(
      buildPreviewCharacterPromptInput({
        seriesId,
        characterId,
        customInstruction: customInstructionByCharacter[characterId] ?? "",
        portraitCandidateCount: 1,
      }),
      {
        onSuccess: res => {
          if (res.mode !== "candidate_batch" || res.candidates.length === 0) {
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
              candidates: res.candidates.map(candidate => ({
                assetLinkId: candidate.assetLinkId,
                candidateId: candidate.candidateId,
                index: candidate.index,
                portraitPrompt: candidate.portraitPrompt,
                negativePrompt: candidate.negativePrompt,
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
            ...(imageModelUsesMcp && mcpConnectionId ? { mcpConnectionId } : {}),
            ...(imageModelUsesMcp && mcpConnectionId && mcpSharedGroupId != null
              ? { sharedGroupId: mcpSharedGroupId }
              : {}),
            ...(imageModelUsesHermes && hermesConnectionId ? { hermesConnectionId } : {}),
          });
          clearRetrying();
        },
        onError: clearRetrying,
      }
    );
  };

  const isPreviewLoadingFor = (characterId: string) =>
    previewCharacterPromptMutation.isPending &&
    pendingPreviewTarget?.characterId === characterId;

  const isImageGeneratingFor = (characterId: string) =>
    isPreviewLoadingFor(characterId) ||
    (generateImageMutation.isPending &&
      generateImageMutation.variables?.characterId === characterId) ||
    pollingCharacters.has(pollingCharacterKey(characterId, "primary_portrait")) ||
    (portraitCandidateBatches[characterId]?.candidates.some(candidate =>
      ["submitting", "queued"].includes(candidate.status)
    ) ?? false);

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

  /** Resolves a dropped/uploaded image (a `data:` URL from a file/grid-cutter
   *  tile, or an already-hosted URL from Library/History) into a canonical
   *  `media_assets` id, via `resolveMediaAssetForImport` — same 2-branch
   *  resolution `assignDroppedReference` below already performed inline;
   *  extracted here so the "เพิ่มลุค"/"เพิ่มแฝด" dialogs' optional reference-
   *  image attach (W2, plan: vertical-drama-twin-variant-completeness) can
   *  reuse the EXACT same resolution without also calling `linkAsset` — those
   *  dialogs create the character first and pass `referenceMediaAssetId` to
   *  `createCharacterVariant`/`createCharacterTwin`, which best-effort-link
   *  it themselves server-side. */
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

  /** Factory for the "เพิ่มลุค"/"เพิ่มแฝด" dialogs' reference-image drop
   *  zone + upload-button handlers — parameterized by that dialog's own
   *  `mediaAssetId`/`previewUrl`/`resolving` setters so the variant and twin
   *  dialogs can each get their own independent instance without duplicating
   *  the drag/drop validation + resolve-and-store logic twice. Mirrors
   *  `VerticalDramaCharacterReferencePanel`'s own drop-zone + "อัปโหลดภาพ"
   *  button validation copy exactly (unsupported type / too-large / no-image
   *  messages), just resolving to a stored `mediaAssetId` instead of
   *  immediately linking it (no character exists yet to link onto). */
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
    const handleFileInput = (
      event: React.ChangeEvent<HTMLInputElement>
    ) => {
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
  const twinReferenceHandlers = makeReferenceAttachHandlers(
    setTwinReferenceMediaAssetId,
    setTwinReferencePreviewUrl,
    setTwinReferenceResolving
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
        candidate.taskId,
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
  /** `vd-character-identity-repair` plan, Phase 3.4 — "รวมตัวละครซ้ำ" review
   *  dialog visibility. The dialog owns its own analyze/merge mutations;
   *  this panel only needs to know whether it's open. */
  const [isMergeReviewOpen, setIsMergeReviewOpen] = useState(false);
  const visibleRosterEntries = useMemo(
    () =>
      showOnlyNeedsSetup
        ? filterRosterEntriesNeedingSetup(rosterEntries)
        : rosterEntries,
    [showOnlyNeedsSetup, rosterEntries]
  );
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
      | (VdCharacterListItem & { voiceConfig?: VerticalDramaCharacterVoiceConfig })
      | null
  )?.voiceConfig;
  /** F132F (spec 132 §7.3, added 2026-07-09) — tolerant parse of the
   *  selected character's `data.speechProfile` (a free-form jsonb payload
   *  server-side, so a malformed/legacy value must never crash this panel —
   *  `safeParse` degrades to `undefined`, which the editing sub-section
   *  below renders as "no profile yet" rather than throwing). */
  const selectedCharacterData = (selectedCharacter?.data ?? null) as
    | Record<string, unknown>
    | null;
  const selectedCharacterSpeechProfileParse = selectedCharacterData?.speechProfile
    ? speechProfileSchema.safeParse(selectedCharacterData.speechProfile)
    : null;
  const selectedCharacterSpeechProfile: VerticalDramaSpeechProfile | undefined =
    selectedCharacterSpeechProfileParse?.success
      ? selectedCharacterSpeechProfileParse.data
      : undefined;
  /** Show the persistent right-side reference-panel column only when there's
   *  a character to attach references to and mutations are allowed — matches
   *  the condition that previously gated mounting `VerticalDramaCharacterReferencePanel`
   *  at all (`!readOnly`), just now also driving the 3-column grid shape. */
  const showReferencePanelColumn = Boolean(selectedCharacter) && !readOnly;
  const selectedAssets = dedupeCharacterAssetsForDisplay(
    assets.filter(
      a => effectiveSelectedId != null && a.characterId === effectiveSelectedId
    )
  );
  const selectedCharacterSupportsCandidateBatch = Boolean(
    selectedCharacter && isFirstPortraitCandidateEligible(selectedCharacter, assets)
  );
  const selectedPortraitCandidateBatches = useMemo(() => {
    if (!selectedCharacter) return [] as VdPortraitCandidateUiBatch[];
    const characterId = selectedCharacter.characterId;
    const durableAssets = [...assets]
      .filter(
        asset => asset.characterId === characterId && Boolean(asset.portraitCandidate)
      )
      .sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      );
    const groups = new Map<string, VdPortraitCandidateUiBatch>();
    for (const asset of durableAssets) {
      const candidate = asset.portraitCandidate!;
      const batch: VdPortraitCandidateUiBatch = groups.get(candidate.batchId) ?? {
        batchId: candidate.batchId,
        characterId,
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
        durable?.candidates.map(candidate => [candidate.assetLinkId, candidate]) ?? [],
      );
      groups.set(active.batchId, {
        ...active,
        candidates: active.candidates
          .map(candidate =>
            mergeDurablePortraitCandidateStatus(
              candidate,
              durableByAssetId.get(candidate.assetLinkId),
            ),
          )
          .sort((left, right) => left.index - right.index),
      });
    }

    const ordered = [...groups.values()].map(batch => ({
      ...batch,
      candidates: [...batch.candidates].sort((left, right) => left.index - right.index),
    }));
    if (!active) return ordered;
    return [
      groups.get(active.batchId)!,
      ...ordered.filter(batch => batch.batchId !== active.batchId),
    ];
  }, [assets, portraitCandidateBatches, selectedCharacter]);
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
    createTwinMutation.isPending ||
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
  if (listQuery.isError) {
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
            {t(lang, "กลุ่มผู้ชมเป้าหมาย", "Target audience")}: {targetAudienceRegionLabel}
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
              onClick={() => detectVariantsMutation.mutate({ seriesId })}
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
            ? isReferencePanelCollapsed
              ? "md:grid-cols-[minmax(0,1fr)_3.5rem]"
              : "md:grid-cols-[minmax(0,1fr)_320px]"
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
                    const generatingThis = isImageGeneratingFor(c.characterId);
                    const generatingSheetThis = isSheetGeneratingFor(
                      c.characterId
                    );
                    const isDropTarget = dragOverCharacterId === c.characterId;
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
                          onClick={() => setSelectedCharacterId(c.characterId)}
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
                              void assignDroppedReference(c.characterId, input.url);
                            } else {
                              void readFileAsDataUrl(input.file).then(dataUrl =>
                                assignDroppedReference(c.characterId, dataUrl)
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
                                  <img
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
                                {!readOnly && portraitAssetLinkId && (
                                  confirmingThisPortraitDelete ? (
                                    <div
                                      className="absolute right-1 top-1 flex items-center gap-1 rounded-md bg-background/95 p-1 shadow"
                                      onClick={event => event.stopPropagation()}
                                    >
                                      <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        className="h-6 w-6"
                                        disabled={mutating}
                                        aria-label={t(lang, "ยกเลิก", "Cancel")}
                                        title={t(lang, "ยกเลิก", "Cancel")}
                                        onClick={event => {
                                          event.stopPropagation();
                                          setConfirmingDeleteAssetLinkId(null);
                                        }}
                                      >
                                        <X aria-hidden="true" className="h-3.5 w-3.5" />
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
                                          setConfirmingDeleteAssetLinkId(null);
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
                                          <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
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
                                      <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                                    </Button>
                                  )
                                )}
                              </div>
                            ) : (
                              <span className="flex aspect-[9/16] w-16 shrink-0 items-center justify-center rounded-md border border-dashed border-border/70 bg-muted/20 text-muted-foreground/70">
                                <User aria-hidden="true" className="h-5 w-5" />
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
                              {(getCanonicalRoleLabel(c.roleTier, lang) || c.role) && (
                                <Badge
                                  variant="outline"
                                  className="w-fit max-w-full whitespace-normal break-words text-left text-[10px]"
                                >
                                  {getCanonicalRoleLabel(c.roleTier, lang) ?? c.role}
                                </Badge>
                              )}
                              {c.roleReviewStatus === "needs_role_review" && (
                                <Badge variant="outline" className="w-fit max-w-full whitespace-normal break-words text-left border-amber-300 bg-amber-50 text-[10px] text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                                  {t(lang, "ต้องตรวจบทบาท", "Role review needed")}
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
                                      `ใช้ใบหน้าเดียวกับ ${shareFaceSourceName}`,
                                      `Shares face with ${shareFaceSourceName}`
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
                                const regionBadgeLabel = getCharacterRegionBadgeLabel(
                                  c.data as Record<string, unknown> | null | undefined,
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
                                  getCharacterCardPortraitAsset(v.characterId);
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
                                const isVariantDropTarget =
                                  dragOverCharacterId === v.characterId;
                                const confirmingThisVariantCharacterDelete =
                                  confirmingDeleteCharacterId ===
                                  v.characterId;
                                const deletingThisVariantCharacter =
                                  deleteCharacterMutation.isPending &&
                                  deleteCharacterMutation.variables
                                    ?.characterId === v.characterId;
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
                                      "group/variant relative flex max-w-[10rem] items-center gap-1.5 rounded-md border px-1.5 py-1 transition-colors",
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
                                          <img
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
                                    <button
                                      type="button"
                                      aria-pressed={variantActive}
                                      aria-label={t(
                                        lang,
                                        `เลือกลุค ${variantLabel} ของ ${c.name}`,
                                        `Select ${c.name}'s ${variantLabel} look`
                                      )}
                                      onClick={event => {
                                        event.stopPropagation();
                                        setSelectedCharacterId(v.characterId);
                                      }}
                                      className="min-w-0 flex-1 truncate rounded text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
                                    >
                                      <span
                                        className={cn(
                                          "truncate text-xs",
                                          variantActive
                                            ? "font-semibold"
                                            : "font-medium"
                                        )}
                                      >
                                        {variantLabel}
                                      </span>
                                    </button>
                                    {/* `planning/vd-character-look-one-step-
                                    flow/plan.md` (2026-07-17) — per-look
                                    generate/regenerate affordance: the modal
                                    already auto-fires this on submit when it
                                    safely can, but this chip button is the
                                    retry path for whenever it couldn't (no
                                    model, no parent portrait yet at the time)
                                    plus ordinary regeneration afterward. Same
                                    guard functions + direct-generation call
                                    as the roster card's own "auto" shortcuts
                                    above — never opens the preview wizard. */}
                                    {!readOnly && (
                                      <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        className="h-5 w-5 shrink-0"
                                        disabled={
                                          mutating ||
                                          isImageGeneratingFor(v.characterId) ||
                                          !selectedImageModelId
                                        }
                                        aria-label={t(
                                          lang,
                                          `สร้างภาพลุค ${variantLabel} ของ ${c.name}`,
                                          `Generate ${c.name}'s ${variantLabel} look image`
                                        )}
                                        title={
                                          selectedImageModelId
                                            ? t(lang, "สร้างภาพลุค", "Generate look image")
                                            : t(
                                                lang,
                                                "เลือกโมเดลภาพก่อนสร้าง",
                                                "Select an image model first"
                                              )
                                        }
                                        onClick={event => {
                                          event.stopPropagation();
                                          if (!requireModelSelected()) return;
                                          if (!requireMcpConnectionOrToast()) return;
                                          if (!requireHermesConnectionOrToast())
                                            return;
                                          fireDirectCharacterImageGeneration(
                                            v.characterId
                                          );
                                        }}
                                      >
                                        {isImageGeneratingFor(v.characterId) ? (
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
                                          title={t(lang, "ยกเลิก", "Cancel")}
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
                                            deleteCharacterMutation.mutate({
                                              seriesId,
                                              characterId: v.characterId,
                                            });
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
                                );
                              })}
                            </div>
                          )}

                          {!readOnly && (
                            <div className="flex flex-wrap items-center justify-end gap-1">
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
                                  if (!requireHermesConnectionOrToast()) return;
                                  generateSheetMutation.mutate({
                                    seriesId,
                                    characterId: c.characterId,
                                    sheetType: "auto",
                                    sheetLanguage,
                                    // Always sent — see the matching comment
                                    // on `generatePortraitCandidateBatchMutation.mutate`
                                    // above for why the conditional spread was
                                    // removed.
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
                              {/* W2 "เพิ่มลุค"/"เพิ่มแฝด" (plan: vertical-
                              drama-twin-variant-completeness, F6) — only on
                              BASE characters (no `sharesFaceWithCharacterId`;
                              `c.parentCharacterId` is always unset here since
                              `buildCharacterRosterEntries` already filters
                              variant rows out of the top-level list, see that
                              function's own doc comment). A twin is an
                              independent person, not itself a face-source for
                              a further look/twin, so it doesn't get these. */}
                              {!c.sharesFaceWithCharacterId && (
                                <>
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
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 shrink-0"
                                    disabled={mutating}
                                    aria-label={t(
                                      lang,
                                      `เพิ่มแฝดของ ${c.name}`,
                                      `Add a twin for ${c.name}`
                                    )}
                                    title={t(lang, "เพิ่มแฝด", "Add twin")}
                                    onClick={() =>
                                      openTwinDialog({
                                        characterId: c.characterId,
                                        name: c.name,
                                      })
                                    }
                                  >
                                    <UserPlus
                                      aria-hidden="true"
                                      className="h-3.5 w-3.5"
                                    />
                                  </Button>
                                </>
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
                                VD_COPY.th.characterCustomInstructionPlaceholder,
                                VD_COPY.en.characterCustomInstructionPlaceholder
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
                  })}
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
                          selectedCharacter.sharesFaceWithCharacterId
                            ? characters.find(
                                (other: VdCharacterListItem) =>
                                  other.characterId ===
                                  selectedCharacter.sharesFaceWithCharacterId
                              )?.name
                            : undefined;
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
                            {(getCanonicalRoleLabel(selectedCharacter.roleTier, lang) || selectedCharacter.role) && (
                              <Badge variant="outline" className="text-[10px]">
                                {getCanonicalRoleLabel(selectedCharacter.roleTier, lang) ?? selectedCharacter.role}
                              </Badge>
                            )}
                            {selectedCharacter.roleReviewStatus === "needs_role_review" && (
                              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[10px] text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
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
                                  `ใช้ใบหน้าร่วมกับ ${twinSourceName}`,
                                  `Shares face with ${twinSourceName}`
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

                    <div className="flex flex-col gap-1.5 rounded-md border bg-muted/20 p-2">
                      <Label htmlFor="vd-selected-role-tier" className="text-xs font-medium text-foreground">
                        {t(lang, "บทบาทในเรื่อง (กำหนดให้ชัดเจน)", "Canonical narrative role")}
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
                        disabled={readOnly || updateCharacterRoleMutation.isPending}
                      >
                        <SelectTrigger id="vd-selected-role-tier" className="h-9 text-xs">
                          <SelectValue placeholder={t(lang, "เลือก นางเอก/พระเอก/ตัวร้าย/ตัวประกอบ", "Choose lead / villain / supporting")} />
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
                        {selectedCharacter.roleReviewStatus === "needs_role_review"
                          ? t(lang, "ยังไม่ได้ยืนยัน บทบาทนี้จะกำหนด DNA และหน้าตาที่ Skill ใช้สร้างภาพ", "Not confirmed yet. This role drives the DNA and visual design used by the Skill.")
                          : t(lang, "ยืนยันแล้วโดยผู้ใช้ — Skill จะใช้บทบาทนี้เป็นข้อมูลอ้างอิงหลัก", "User-confirmed. The Skill treats this role as authoritative.")}
                      </p>
                    </div>

                    {/* Per-character ethnicity/region override
                    (planning/vd-per-character-ethnicity/plan.md) — a
                    9-preset dropdown plus a free-text override (free text
                    wins, enforced server-side by
                    `resolveCharacterTargetAudienceRegion`). Fixes the
                    reported "ชื่อไทยแต่หน้าฝรั่ง" confusion: this is what
                    drives the AI-generated FACE ethnicity for THIS
                    character specifically; leaving both empty inherits the
                    series-level default shown above ("กลุ่มผู้ชมเป้าหมาย"). */}
                    {(() => {
                      const characterId = selectedCharacter.characterId;
                      const form = regionOverrideFormFor(characterId);
                      const saving =
                        updateCharacterRegionMutation.isPending &&
                        updateCharacterRegionMutation.variables?.characterId ===
                          characterId;
                      return (
                        <div
                          className="flex flex-col gap-1.5 rounded-md border bg-muted/20 p-2"
                          data-testid="vd-character-region-override"
                        >
                          <Label
                            htmlFor="vd-selected-region"
                            className="text-xs font-medium text-foreground"
                          >
                            {t(lang, "เชื้อชาติ/ภูมิภาคของตัวละคร", "Character ethnicity/region")}
                          </Label>
                          <Select
                            value={form.region || VD_REGION_UNSET_SENTINEL}
                            onValueChange={value =>
                              updateRegionOverrideForm(characterId, {
                                region: value === VD_REGION_UNSET_SENTINEL ? "" : value,
                              })
                            }
                            disabled={readOnly}
                          >
                            <SelectTrigger id="vd-selected-region" className="h-9 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-[min(70vh,32rem)]">
                              <SelectItem value={VD_REGION_UNSET_SENTINEL}>
                                {t(lang, "ไม่ระบุ / ใช้ค่าเริ่มต้นของซีรีย์", "Unset / use series default")}
                              </SelectItem>
                              {VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS.map(region => (
                                <SelectItem key={region} value={region}>
                                  {lang === "th"
                                    ? VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_LABELS_TH[region]
                                    : VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_LABELS_EN[region]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Label
                            htmlFor="vd-selected-ethnicity-text"
                            className="text-xs"
                          >
                            {t(lang, "หรือระบุเอง (เช่น ลูกครึ่งไทย-ญี่ปุ่น, คนเหนือ)", "Or specify freely (e.g. Thai-Japanese mixed, Northern Thai)")}
                          </Label>
                          <Input
                            id="vd-selected-ethnicity-text"
                            value={form.ethnicityText}
                            disabled={readOnly}
                            onChange={e =>
                              updateRegionOverrideForm(characterId, {
                                ethnicityText: e.target.value,
                              })
                            }
                            placeholder={t(lang, "ลูกครึ่งไทย-ญี่ปุ่น", "Thai-Japanese mixed")}
                            maxLength={80}
                          />
                          <p className="text-[11px] text-muted-foreground">
                            {t(
                              lang,
                              "กำหนดหน้าตา (เชื้อชาติ) ที่ AI ใช้สร้างภาพตัวละครนี้โดยเฉพาะ ข้อความที่กรอกเองจะมีผลเหนือกว่าตัวเลือกด้านบน หากปล่อยว่างทั้งคู่ ระบบจะใช้ค่าเริ่มต้นของซีรีย์",
                              "Drives the AI-generated face/ethnicity for this character specifically. Free text (if filled) always wins over the dropdown. Leave both empty to use the series default."
                            )}
                          </p>
                          {!readOnly && (
                            <div>
                              <Button
                                type="button"
                                size="sm"
                                disabled={saving}
                                onClick={() => handleSaveRegionOverride(characterId)}
                                data-testid="vd-character-region-save"
                              >
                                {saving ? (
                                  <Loader2
                                    aria-hidden="true"
                                    className="mr-2 h-3.5 w-3.5 animate-spin"
                                  />
                                ) : null}
                                {t(lang, "บันทึกเชื้อชาติ/ภูมิภาค", "Save ethnicity/region")}
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })()}

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
                      const defaultReferenceAssetLinkId =
                        resolveDefaultReferenceAssetLinkId(
                          assets,
                          selectedCharacter.characterId
                        );
                      const selectedReferenceAssetLinkId =
                        referenceOverrideByCharacter[
                          selectedCharacter.characterId
                        ] ?? defaultReferenceAssetLinkId ?? undefined;
                      return (
                        <div className="mt-1 flex flex-col gap-1">
                          <span className="text-[11px] font-medium text-foreground/80">
                            {t(lang, "ภาพอ้างอิงตัวตน", "Identity reference")}
                          </span>
                          <div className="flex flex-wrap items-start gap-2">
                            {referenceCandidates.map(candidate => {
                              const isSelected =
                                candidate.assetLinkId ===
                                selectedReferenceAssetLinkId;
                              return (
                                <button
                                  key={candidate.assetLinkId}
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
                                    setReferenceOverrideByCharacter(prev => ({
                                      ...prev,
                                      [selectedCharacter.characterId]:
                                        candidate.assetLinkId,
                                    }));
                                  }}
                                >
                                  <img
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
                              [selectedCharacter.characterId]: e.target.value,
                            }))
                          }
                          maxLength={500}
                          rows={2}
                          placeholder={t(
                            lang,
                            VD_COPY.th.characterCustomInstructionPlaceholder,
                            VD_COPY.en.characterCustomInstructionPlaceholder
                          )}
                        />
                      </div>
                    )}

                    {!readOnly && selectedCharacterSupportsCandidateBatch && (
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
                        <Grid columns={{ minWidth: 108, max: 5, repeat: "fit" }} gap={2}>
                          {[1, 2, 3, 4, 5].map(count => {
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
                                  setPortraitCandidateCountByCharacter(prev => ({
                                    ...prev,
                                    [selectedCharacter.characterId]: count,
                                  }));
                                }}
                                padding={2}
                                variant={selected ? "blue" : "muted"}
                              >
                                <span
                                  role="radio"
                                  aria-checked={selected}
                                  className="block text-center text-sm font-semibold"
                                >
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
                          onClick={() => setIsModelDialogOpen(true)}
                        >
                          <Sparkles
                            aria-hidden="true"
                            className="h-3.5 w-3.5"
                          />
                          {selectedImageModelId
                            ? `${t(lang, "โมเดล", "Model")}: ${
                                imageModels.find(
                                  m => m.modelId === selectedImageModelId
                                )?.name ?? selectedImageModelId
                              }`
                            : t(
                                lang,
                                "เลือกโมเดลสร้างภาพ",
                                "Choose image model"
                              )}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="gap-2"
                          disabled={
                            mutating ||
                            isImageGeneratingFor(selectedCharacter.characterId) ||
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
                            setSelectedSheetType(value as VdCharacterSheetType)
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
                            isSheetGeneratingFor(selectedCharacter.characterId) ||
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
                            generateSheetMutation.mutate({
                              seriesId,
                              characterId: selectedCharacter.characterId,
                              sheetType: selectedSheetType,
                              sheetLanguage,
                              // Always sent — see the matching comment on
                              // `generatePortraitCandidateBatchMutation.mutate` above.
                              selectedImageModelId,
                              ...(imageModelUsesMcp && mcpConnectionId ? { mcpConnectionId } : {}),
                              ...(imageModelUsesMcp && mcpConnectionId && mcpSharedGroupId != null
                                ? { sharedGroupId: mcpSharedGroupId }
                                : {}),
                              ...(imageModelUsesHermes && hermesConnectionId ? { hermesConnectionId } : {}),
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
                            });
                          }}
                          data-testid="vd-generate-character-sheet"
                        >
                          {isSheetGeneratingFor(selectedCharacter.characterId) ? (
                            <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Grid3x3 aria-hidden="true" className="h-3.5 w-3.5" />
                          )}
                          {t(lang, "สร้างชีทตัวละคร", "Generate character sheet")}
                        </Button>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <span>{t(lang, "ภาษา:", "Language:")}</span>
                          <button
                            type="button"
                            className={cn(
                              "rounded px-1.5 py-0.5",
                              sheetLanguage === "en" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
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
                              sheetLanguage === "th" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                            )}
                            onClick={() => setSheetLanguage("th")}
                            data-testid="vd-sheet-language-th"
                          >
                            TH
                          </button>
                        </div>
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
                          prompt={pendingCharacterPromptPreview.portraitPrompt}
                          skillName={t(
                            lang,
                            "สร้างภาพตัวละคร",
                            "Generate character image"
                          )}
                          skillCategory="image_generation"
                          mediaParams={{
                            ...(pendingCharacterPromptPreview.model
                              ? { model: pendingCharacterPromptPreview.model }
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

                    {selectedPortraitCandidateBatches.length > 0 && (
                      <section
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
                              "ทุกภาพเป็นคนละใบหน้า แต่รักษาคุณภาพ เสน่ห์ และภาษาภาพระดับเดียวกัน การเลือกจะมีผลกับงานสร้างครั้งถัดไปเท่านั้น",
                              "Every option is a different person with the same visual quality and magnetism. Your choice affects future generations only."
                            )}
                          </p>
                        </header>

                        {selectedPortraitCandidateBatches.map((batch, batchIndex) => {
                          const activeBatch =
                            portraitCandidateBatches[selectedCharacter.characterId];
                          const isActive = activeBatch?.batchId === batch.batchId;
                          const isPreviewOnly =
                            isActive &&
                            batch.candidates.every(candidate => candidate.status === "previewed");
                          return (
                            <section
                              key={batch.batchId}
                              className={cn(
                                "py-3",
                                batchIndex > 0 && "border-t"
                              )}
                              aria-label={
                                isActive
                                  ? t(lang, "ชุดตัวเลือกล่าสุด", "Newest candidate batch")
                                  : t(lang, "ตัวเลือกที่บันทึกไว้", "Saved alternatives")
                              }
                            >
                              <header className="mb-2 flex flex-wrap items-start justify-between gap-2">
                                <span className="text-xs font-medium">
                                  {isActive
                                    ? t(lang, "ชุดล่าสุด", "Newest batch")
                                    : t(lang, "ตัวเลือกก่อนหน้า", "Earlier alternatives")}
                                </span>
                                {batch.model && (
                                  <Badge variant="outline">{batch.model}</Badge>
                                )}
                              </header>
                              {batch.sharedVisualLanguage && (
                                <p className="mb-3 text-xs text-muted-foreground">
                                  {batch.sharedVisualLanguage}
                                </p>
                              )}

                              <Grid
                                columns={{ minWidth: 142, max: 5, repeat: "fit" }}
                                gap={3}
                              >
                                {batch.candidates.map(candidate => {
                                  const isSelected = candidate.status === "selected";
                                  const canSelect =
                                    Boolean(candidate.imageUrl) &&
                                    ["completed", "selected", "superseded"].includes(
                                      candidate.status
                                    );
                                  return (
                                    <Card
                                      key={candidate.assetLinkId}
                                      className={cn(
                                        "overflow-hidden",
                                        isSelected && "ring-2 ring-primary"
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
                                            <img
                                              src={candidate.imageUrl}
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
                                              candidate.status === "queued" ||
                                              candidate.status === "submitting"
                                            }
                                          >
                                            {candidate.status === "failed" ? (
                                              <p role="alert" className="text-xs text-destructive">
                                                {candidate.errorMessage ??
                                                  t(lang, "สร้างภาพไม่สำเร็จ", "Generation failed")}
                                              </p>
                                            ) : candidate.status === "previewed" ? (
                                              <p className="text-xs text-muted-foreground">
                                                {candidate.visualIdentitySummary ??
                                                  t(lang, "พร้อมสร้างภาพ", "Ready to render")}
                                              </p>
                                            ) : (
                                              <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                                                <Loader2
                                                  aria-hidden="true"
                                                  className="h-4 w-4 animate-spin"
                                                />
                                                {t(lang, "กำลังสร้าง…", "Generating…")}
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
                                            variant={isSelected ? "default" : "secondary"}
                                          >
                                            {isSelected
                                              ? t(lang, "ภาพหลัก", "Primary")
                                              : candidate.status === "failed"
                                                ? t(lang, "ล้มเหลว", "Failed")
                                                : candidate.status === "previewed"
                                                  ? t(lang, "พร้อมสร้าง", "Ready")
                                                  : candidate.status === "queued" ||
                                                      candidate.status === "submitting"
                                                    ? t(lang, "กำลังสร้าง", "Generating")
                                                    : t(lang, "เลือกได้", "Available")}
                                          </Badge>
                                        </header>
                                        {candidate.portraitPrompt && isPreviewOnly && (
                                          <p className="line-clamp-4 text-[11px] text-muted-foreground">
                                            {candidate.portraitPrompt}
                                          </p>
                                        )}
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant={isSelected ? "secondary" : "default"}
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
                                            selectPortraitCandidateMutation.mutate({
                                              seriesId,
                                              characterId: selectedCharacter.characterId,
                                              assetLinkId: candidate.assetLinkId,
                                            })
                                          }
                                        >
                                          {isSelected
                                            ? t(lang, "ใช้อยู่เป็นภาพหลัก", "Current primary")
                                            : t(lang, "ใช้ภาพนี้เป็นภาพหลัก", "Use as primary")}
                                        </Button>
                                        {/* Set A fix #3: per-candidate
                                            Cancel/Retry for a stuck
                                            queued/submitting or a terminal
                                            failed candidate — the batch
                                            footer below only covers the
                                            pre-submission (`isPreviewOnly`)
                                            state. */}
                                        {["queued", "submitting", "failed"].includes(
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
                                                  deleteAssetMutation.variables
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
                                              deleteAssetMutation.variables
                                                ?.assetLinkId ===
                                                candidate.assetLinkId ? (
                                                <Loader2
                                                  aria-hidden="true"
                                                  className="h-3.5 w-3.5 animate-spin"
                                                />
                                              ) : (
                                                t(lang, "ยกเลิก", "Cancel")
                                              )}
                                            </Button>
                                            {candidate.status === "failed" && (
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
                                                    deleteAssetMutation.variables
                                                      ?.assetLinkId ===
                                                      candidate.assetLinkId)
                                                }
                                                onClick={() =>
                                                  retryPortraitCandidate(
                                                    selectedCharacter.characterId,
                                                    candidate.assetLinkId
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
                                                  t(lang, "ลองใหม่", "Retry")
                                                )}
                                              </Button>
                                            )}
                                          </div>
                                        )}
                                      </CardContent>
                                    </Card>
                                  );
                                })}
                              </Grid>

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
                        })}
                      </section>
                    )}

                    {(() => {
                      const portrait =
                        generatedImageUrls[selectedCharacter.characterId];
                      const turnaround =
                        generatedTurnaroundUrls[selectedCharacter.characterId];
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
                                <img
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
                                <img
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
                                  <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Grid3x3 aria-hidden="true" className="h-3 w-3" />
                                )}
                                {t(lang, "ตัดภาพ 3x3", "Split 3x3")}
                              </Button>
                              {turnaroundSplitTiles[selectedCharacter.characterId] && (
                                <div className="mt-1 grid grid-cols-3 gap-1">
                                  {turnaroundSplitTiles[selectedCharacter.characterId].map(tile => (
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
                                      <img
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
                                aria-label={t(lang, "ดูภาพขยาย", "View full-size image")}
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
                                <img
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
                                  splittingResultKey === `sheet::${selectedCharacter.characterId}`
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
                                  <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Grid3x3 aria-hidden="true" className="h-3 w-3" />
                                )}
                                {t(lang, "ตัดภาพ 3x3", "Split 3x3")}
                              </Button>
                              {sheetSplitTiles[selectedCharacter.characterId] && (
                                <div className="mt-1 grid grid-cols-3 gap-1">
                                  {sheetSplitTiles[selectedCharacter.characterId].map(tile => (
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
                                      <img
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
                    onCast={entry => handleCastVoice(selectedCharacter.characterId, entry)}
                    onClear={() => handleClearVoice(selectedCharacter.characterId)}
                    onPreview={() => handlePreviewVoice(selectedCharacter.characterId)}
                    previewing={previewingVoiceCharacterIds.has(selectedCharacter.characterId)}
                    previewAudioUrl={voicePreviewUrlByCharacterId[selectedCharacter.characterId] ?? null}
                    previewCreditCost={
                      voicePreviewCreditCostByCharacterId[selectedCharacter.characterId] ?? null
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
                {characterProfilesEnabled && (() => {
                  const characterId = selectedCharacter.characterId;
                  const form = speechProfileFormFor(characterId);
                  const saving =
                    updateCharacterMutation.isPending &&
                    updateCharacterMutation.variables?.characterId === characterId;
                  return (
                    <Card data-testid="vd-speech-profile-card">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">
                          {t(lang, "โปรไฟล์เสียงพูด", "Speech profile")}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-3">
                        {!selectedCharacterSpeechProfile && (
                          <p className="text-xs text-muted-foreground" data-testid="vd-speech-profile-empty-hint">
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
                                  speakingSpeed: value as VdSpeechProfileFormState["speakingSpeed"],
                                })
                              }
                              disabled={readOnly}
                            >
                              <SelectTrigger className="h-9 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {VD_SPEECH_PROFILE_SPEAKING_SPEEDS.map(value => (
                                  <SelectItem key={value} value={value}>
                                    {value}
                                  </SelectItem>
                                ))}
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
                                  vocabularyLevel: value as VdSpeechProfileFormState["vocabularyLevel"],
                                })
                              }
                              disabled={readOnly}
                            >
                              <SelectTrigger className="h-9 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {VD_SPEECH_PROFILE_VOCABULARY_LEVELS.map(value => (
                                  <SelectItem key={value} value={value}>
                                    {value}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <Label className="text-xs">
                              {t(lang, "ความยาวประโยคทั่วไป", "Typical sentence length")}
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
                                {VD_SPEECH_PROFILE_SENTENCE_LENGTHS.map(value => (
                                  <SelectItem key={value} value={value}>
                                    {value}
                                  </SelectItem>
                                ))}
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
                                  metaphorUsage: value as VdSpeechProfileFormState["metaphorUsage"],
                                })
                              }
                              disabled={readOnly}
                            >
                              <SelectTrigger className="h-9 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {VD_SPEECH_PROFILE_METAPHOR_USAGE.map(value => (
                                  <SelectItem key={value} value={value}>
                                    {value}
                                  </SelectItem>
                                ))}
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
                            {t(lang, "หน้าที่ของบทพูดทั่วไป", "Common line function")}
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
                              {t(lang, "รูปแบบต้องห้าม (บรรทัดละ 1 รายการ)", "Forbidden style (one per line)")}
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
                              {t(lang, "คำพูดติดปาก (บรรทัดละ 1 รายการ)", "Signature phrases (one per line)")}
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
                              onClick={() => handleSaveSpeechProfile(characterId)}
                              data-testid="vd-speech-profile-save"
                            >
                              {saving ? (
                                <Loader2 aria-hidden="true" className="mr-2 h-3.5 w-3.5 animate-spin" />
                              ) : null}
                              {t(lang, "บันทึกโปรไฟล์เสียงพูด", "Save speech profile")}
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })()}

                <ModelSelectorDialog
                  open={isModelDialogOpen}
                  onOpenChange={setIsModelDialogOpen}
                  models={imageModels}
                  selectedModelId={selectedImageModelId}
                  onSelect={handleSelectImageModel}
                  mediaType="image"
                  isLoading={imageModelsQuery.isLoading}
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
                          resolveMediaModelTransportConfig({
                            provider: selectedImageModelRecord?.provider,
                            modelId: selectedImageModelRecord?.modelId ?? selectedImageModelId,
                            configJson: selectedImageModelRecord?.configJson as
                              | Record<string, unknown>
                              | undefined,
                          }).providerKey ?? undefined
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
                        <p className="text-xs text-amber-600" data-testid="hermes-connection-required-hint">
                          {t(lang, "เลือกบัญชี Grok ก่อน", "Select a Grok connection first")}
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                )}

                {/* Reference asset list */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      {t(lang, "อ้างอิงของตัวละคร", "Character references")} (
                      {selectedAssets.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-2">
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
                                  <img
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
                                    {t(lang, "ที่มา", "Source")}: {asset.source}
                                    {asset.containsHumanFace
                                      ? ` · ${t(lang, "มีใบหน้า", "Has face")}`
                                      : ""}
                                  </p>
                                ) : (
                                  <p className="truncate text-xs text-muted-foreground">
                                    {t(lang, "มีเดีย", "Media")} #
                                    {asset.mediaAssetId ?? "—"} ·{" "}
                                    {t(lang, "ที่มา", "Source")}: {asset.source}
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
                                        setConfirmingDeleteAssetLinkId(null);
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
                                      {t(lang, "ยืนยันลบ", "Confirm delete")}
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
                    {t(lang, "อาชีพ/คำอธิบายบทบาท", "Occupation / role description")}
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
                    {t(lang, "บทบาทในเรื่อง (ใช้สร้างภาพ)", "Narrative role (drives visual design)")}
                  </Label>
                  <Select value={newRoleTier} onValueChange={value => setNewRoleTier(value as RoleTier)}>
                    <SelectTrigger id="vd-char-role-tier" className="h-9 text-xs">
                      <SelectValue placeholder={t(lang, "เลือก นางเอก/พระเอก/ตัวร้าย/ตัวประกอบ", "Choose lead / villain / supporting")} />
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
                    {t(lang, "หากไม่เลือก ระบบจะแจ้งให้ตรวจบทบาทก่อนสร้างภาพ", "If omitted, the system will flag the character for role review before image generation.")}
                  </p>
                </div>
                <div className="flex flex-col gap-1.5 rounded-md border bg-muted/20 p-2">
                  <Label htmlFor="vd-char-region" className="text-xs font-medium text-foreground">
                    {t(lang, "เชื้อชาติ/ภูมิภาคของตัวละคร", "Character ethnicity/region")}
                  </Label>
                  <Select
                    value={newRegionOverride.region || VD_REGION_UNSET_SENTINEL}
                    onValueChange={value =>
                      setNewRegionOverride(prev => ({
                        ...prev,
                        region: value === VD_REGION_UNSET_SENTINEL ? "" : value,
                      }))
                    }
                  >
                    <SelectTrigger id="vd-char-region" className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-[min(70vh,32rem)]">
                      <SelectItem value={VD_REGION_UNSET_SENTINEL}>
                        {t(lang, "ไม่ระบุ / ใช้ค่าเริ่มต้นของซีรีย์", "Unset / use series default")}
                      </SelectItem>
                      {VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS.map(region => (
                        <SelectItem key={region} value={region}>
                          {lang === "th"
                            ? VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_LABELS_TH[region]
                            : VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_LABELS_EN[region]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Label htmlFor="vd-char-ethnicity-text" className="text-xs">
                    {t(lang, "หรือระบุเอง (เช่น ลูกครึ่งไทย-ญี่ปุ่น, คนเหนือ)", "Or specify freely (e.g. Thai-Japanese mixed, Northern Thai)")}
                  </Label>
                  <Input
                    id="vd-char-ethnicity-text"
                    value={newRegionOverride.ethnicityText}
                    onChange={e =>
                      setNewRegionOverride(prev => ({
                        ...prev,
                        ethnicityText: e.target.value,
                      }))
                    }
                    placeholder={t(lang, "ลูกครึ่งไทย-ญี่ปุ่น", "Thai-Japanese mixed")}
                    maxLength={80}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {t(
                      lang,
                      "กำหนดหน้าตา (เชื้อชาติ) ที่ AI ใช้สร้างภาพตัวละครนี้โดยเฉพาะ ข้อความที่กรอกเองจะมีผลเหนือกว่าตัวเลือกด้านบน หากปล่อยว่างทั้งคู่ ระบบจะใช้ค่าเริ่มต้นของซีรีย์",
                      "Drives the AI-generated face/ethnicity for this character specifically. Free text (if filled) always wins over the dropdown. Leave both empty to use the series default."
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
                      ...buildCharacterRegionOverrideCreateFields(newRegionOverride),
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
            data-collapsed={isReferencePanelCollapsed ? "true" : "false"}
            className={cn(
              "md:sticky md:top-4 md:min-h-0",
              isReferencePanelCollapsed
                ? "md:flex md:h-fit md:justify-start"
                : "flex flex-col gap-2"
            )}
          >
            {isReferencePanelCollapsed ? (
              <div className="flex min-h-14 items-start justify-end rounded-xl border border-border bg-card p-2 shadow-sm md:h-full md:w-14">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-lg"
                  aria-label={t(
                    lang,
                    "เปิด panel อ้างอิงด้านขวา",
                    "Expand reference panel"
                  )}
                  title={t(
                    lang,
                    "เปิด panel อ้างอิงด้านขวา",
                    "Expand reference panel"
                  )}
                  data-testid="vd-character-reference-panel-toggle"
                  onClick={() => setIsReferencePanelCollapsed(false)}
                >
                  <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 rounded-lg"
                    aria-label={t(
                      lang,
                      "ยุบ panel อ้างอิงด้านขวา",
                      "Collapse reference panel"
                    )}
                    title={t(
                      lang,
                      "ยุบ panel อ้างอิงด้านขวา",
                      "Collapse reference panel"
                    )}
                    data-testid="vd-character-reference-panel-toggle"
                    onClick={() => setIsReferencePanelCollapsed(true)}
                  >
                    <ChevronRight aria-hidden="true" className="h-4 w-4" />
                  </Button>
                </div>

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
              </>
            )}
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
            <div className="flex flex-col gap-1">
              <Label className="text-xs">
                {t(lang, "ภาพอ้างอิง (ไม่บังคับ)", "Reference image (optional)")}
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
                  <img
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

      {/* W2 "เพิ่มแฝด" dialog — manual counterpart of `createCharacterTwin`
      (`server/routers/verticalDramaCharacters.ts`), same pattern as the
      variant dialog above. */}
      <Dialog
        open={twinDialogCharacter !== null}
        onOpenChange={open => {
          if (!open) closeTwinDialog();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t(
                lang,
                `เพิ่มแฝดของ ${twinDialogCharacter?.name ?? ""}`,
                `Add a twin for ${twinDialogCharacter?.name ?? ""}`
              )}
            </DialogTitle>
            <DialogDescription>
              {t(
                lang,
                "สร้างตัวละครใหม่ที่เป็นคนละคน (ชื่อ/id ของตัวเอง) แต่ใช้ใบหน้าเดียวกัน — เช่น พี่น้องแฝด",
                "Creates a brand-new, independent character (its own name/id) that shares the same face reference — e.g. identical siblings."
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="vd-twin-name" className="text-xs">
                {t(lang, "ชื่อ", "Name")}
              </Label>
              <Input
                id="vd-twin-name"
                value={twinNameInput}
                onChange={e => setTwinNameInput(e.target.value)}
                placeholder={t(lang, "เช่น มีนา", "e.g. Mina")}
                maxLength={255}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="vd-twin-role" className="text-xs">
                {t(lang, "บทบาท (ไม่บังคับ)", "Role (optional)")}
              </Label>
              <Input
                id="vd-twin-role"
                value={twinRoleInput}
                onChange={e => setTwinRoleInput(e.target.value)}
                placeholder={t(lang, "น้องสาวฝาแฝด", "Twin sister")}
                maxLength={100}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="vd-twin-description" className="text-xs">
                {t(lang, "คำอธิบาย (ไม่บังคับ)", "Description (optional)")}
              </Label>
              <Textarea
                id="vd-twin-description"
                value={twinDescriptionInput}
                onChange={e => setTwinDescriptionInput(e.target.value)}
                maxLength={2000}
                rows={3}
                placeholder={t(
                  lang,
                  "อธิบายจุดที่ทำให้แฝดคนนี้ดูต่างจากตัวต้นแบบ เช่น ทรงผม สไตล์เสื้อผ้า",
                  "Describe what makes this twin look distinct from the source, e.g. hairstyle, clothing style"
                )}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">
                {t(lang, "ภาพอ้างอิง (ไม่บังคับ)", "Reference image (optional)")}
              </Label>
              <div
                onDragOver={event => {
                  event.preventDefault();
                  setTwinReferenceDragOver(true);
                }}
                onDragLeave={() => setTwinReferenceDragOver(false)}
                onDrop={event => {
                  setTwinReferenceDragOver(false);
                  twinReferenceHandlers.handleDrop(event);
                }}
                className={cn(
                  "flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-3 text-center text-xs text-muted-foreground transition-colors",
                  twinReferenceDragOver
                    ? "border-purple-400 bg-purple-50/60"
                    : "border-border"
                )}
              >
                {twinReferencePreviewUrl ? (
                  <img
                    src={twinReferencePreviewUrl}
                    alt=""
                    className="aspect-[9/16] h-20 w-14 rounded object-cover"
                  />
                ) : twinReferenceResolving ? (
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
                  disabled={twinReferenceResolving}
                  onClick={() => twinReferenceInputRef.current?.click()}
                >
                  <UploadCloud aria-hidden="true" className="h-3.5 w-3.5" />
                  {t(lang, "อัปโหลดภาพ", "Upload image")}
                </Button>
                <input
                  ref={twinReferenceInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={twinReferenceHandlers.handleFileInput}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={closeTwinDialog}>
              {t(lang, "ยกเลิก", "Cancel")}
            </Button>
            <Button
              type="button"
              className="gap-2"
              disabled={
                !twinDialogCharacter ||
                twinNameInput.trim() === "" ||
                createTwinMutation.isPending
              }
              onClick={() => {
                if (!twinDialogCharacter) return;
                createTwinMutation.mutate(
                  buildCreateCharacterTwinInput({
                    seriesId,
                    sharesFaceWithCharacterId: twinDialogCharacter.characterId,
                    name: twinNameInput,
                    role: twinRoleInput,
                    customDescription: twinDescriptionInput,
                    referenceMediaAssetId: twinReferenceMediaAssetId,
                  })
                );
              }}
            >
              {createTwinMutation.isPending ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <Plus aria-hidden="true" className="h-4 w-4" />
              )}
              {t(lang, "เพิ่มแฝด", "Add twin")}
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
