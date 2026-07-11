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

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Grid3x3,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  User,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { VerticalDramaCharacterReferencePanel } from "@/components/verticalDramaSeries/VerticalDramaCharacterReferencePanel";
import { VerticalDramaCharacterVoiceCastingCard } from "@/components/verticalDramaSeries/VerticalDramaCharacterVoiceCastingCard";
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
import { MediaPromptPreview } from "@/components/chat/MediaPromptPreview";
import { ImageLightbox } from "@/components/chat/media/ImageLightbox";
import { resolveMediaModelTransportConfig } from "@shared/mediaModelTransport";
import { splitImage, type SplitResult } from "@/lib/imageGridSplitter";
import type { VerticalDramaCharacterAsset } from "@shared/verticalDramaSeries/characterAssets";
import {
  VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_LABELS_EN,
  VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_LABELS_TH,
  normalizeTargetAudienceRegion,
} from "@shared/verticalDramaSeries/targetAudienceRegion";

/**
 * Best-effort character description for display — mirrors the server-side
 * `extractCharacterDescription` in `server/routers/verticalDramaCharacters.ts`
 * (kept in sync deliberately; there is no single `description` field, only a
 * free-form `data` payload with personality/backstory/identityLock/wardrobeRules).
 */
const VD_CHARACTER_IMAGE_MODEL_STORAGE_KEY =
  "smartspec_vd_character_image_model";

/** Shared MCP-connection localStorage key — same key
 *  `VerticalDramaEpisodePage.tsx` reads/writes, so a connection picked on
 *  either surface carries over automatically. */
const MCP_CONNECTION_ID_STORAGE_KEY = "smartspec_mcp_connection_id";

function readStoredMcpConnectionId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(MCP_CONNECTION_ID_STORAGE_KEY) || null;
}

function storeMcpConnectionId(connectionId: string | null): void {
  if (typeof window === "undefined") return;
  if (connectionId) {
    window.localStorage.setItem(MCP_CONNECTION_ID_STORAGE_KEY, connectionId);
  } else {
    window.localStorage.removeItem(MCP_CONNECTION_ID_STORAGE_KEY);
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
/* Localized copy                                                             */
/* -------------------------------------------------------------------------- */

type Lang = "th" | "en";
const t = (lang: Lang, th: string, en: string) => (lang === "th" ? th : en);


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
  /** Tracks which character+role pairs are between "task submitted" and
   *  "task completed" — `generateImageMutation.isPending`/`generateTurnaroundMutation.isPending`
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
  const pollingCharacterKey = (
    characterId: string,
    role: "primary_portrait" | "character_sheet_turnaround" | "character_sheet_full"
  ) => `${characterId}::${role}`;

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
    () => localStorage.getItem(VD_CHARACTER_IMAGE_MODEL_STORAGE_KEY) || ""
  );
  const handleSelectImageModel = (modelId: string) => {
    setSelectedImageModelId(modelId);
    localStorage.setItem(VD_CHARACTER_IMAGE_MODEL_STORAGE_KEY, modelId);
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
  const handleSelectMcpConnection = (connectionId: string | null) => {
    setMcpConnectionIdState(connectionId);
    storeMcpConnectionId(connectionId);
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
    toast.error(
      err?.message ?? t(lang, "เกิดข้อผิดพลาด", "Something went wrong")
    );

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

  /**
   * Poll a submitted character portrait/turnaround generation task
   * (`generateCharacterImage`/`generateCharacterTurnaround` now return
   * `{taskId, ...promptMeta}` — async submit, matching how every other real
   * image/video generation in the app works, so it shows in Media History
   * with correct credit deduction) until it completes, then finalize via the
   * same already-tested resolve-then-link flow the Library/History picker
   * uses: `resolveMediaAssetForImport` -> `linkAsset`.
   */
  async function pollCharacterImageTask(
    taskId: string,
    characterId: string,
    role: "primary_portrait" | "character_sheet_turnaround" | "character_sheet_full",
    promptCreditsUsed: number
  ) {
    const key = pollingCharacterKey(characterId, role);
    setPollingCharacters(prev => new Set(prev).add(key));
    try {
      for (let attempt = 0; attempt < 120; attempt++) {
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
          const resolved = await cardResolveMutation.mutateAsync({
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
          });
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
            role === "primary_portrait" ? "ภาพตัวละคร" : role === "character_sheet_turnaround" ? "ชีทตัวละคร" : "Character Sheet แบบเต็ม";
          const roleLabelEn =
            role === "primary_portrait" ? "Character image" : role === "character_sheet_turnaround" ? "Character sheet" : "Full character sheet";
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
          const errorMessage = (task as { errorMessage?: string } | null)?.errorMessage;
          toast.error(
            t(lang, `สร้างภาพล้มเหลว${errorMessage ? `: ${errorMessage}` : ""}`, `Generation failed${errorMessage ? `: ${errorMessage}` : ""}`)
          );
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 2500));
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
        void pollCharacterImageTask(
          res.taskId,
          variables.characterId,
          "primary_portrait",
          res.creditsUsed.promptGeneration
        );
      },
      onError,
    });

  /**
   * "Character sheet" / multi-angle turnaround reference — a sibling mutation
   * to `generateCharacterImage` (same async-submit response shape: `{taskId,
   * ...promptMeta}`). Tagged `role: "character_sheet_turnaround"` when linked
   * into stock via `pollCharacterImageTask`.
   */
  const generateTurnaroundMutation =
    trpc.verticalDramaCharacters.generateCharacterTurnaround.useMutation({
      onSuccess: (
        res: { taskId: string; creditsUsed?: { promptGeneration?: number } },
        variables: { characterId: string }
      ) => {
        void pollCharacterImageTask(
          res.taskId,
          variables.characterId,
          "character_sheet_turnaround",
          res.creditsUsed?.promptGeneration ?? 0
        );
      },
      onError,
    });

  /**
   * Full-spec Character Sheet — a THIRD, separate generation mode alongside
   * portrait/turnaround (confirmed product decision: additive, not a
   * replacement for the existing turnaround button). One multi-panel
   * infographic image (portrait + turnaround + expressions + outfit + a
   * stats sidebar). Does not go through the preview-prompt gate the other
   * two actions use (see below) — a simpler direct-confirm flow, since this
   * combines multiple already-approved-elsewhere prompt fields rather than
   * needing its own separate preview text.
   */
  const generateSheetMutation =
    trpc.verticalDramaCharacters.generateCharacterSheet.useMutation({
      onSuccess: (
        res: { taskId: string; creditsUsed?: { promptGeneration?: number } },
        variables: { characterId: string }
      ) => {
        void pollCharacterImageTask(
          res.taskId,
          variables.characterId,
          "character_sheet_full",
          res.creditsUsed?.promptGeneration ?? 0
        );
      },
      onError,
    });

  /**
   * Prompt-preview confirmation step (spec fix-round-3, Section C): both the
   * portrait ("Generate character image") and turnaround ("Generate
   * character sheet") actions must show the actual LLM-produced prompt for
   * user approval BEFORE any image-render credit is spent. `previewCharacterPrompt`
   * runs only the (already credit-gated) prompt-generation LLM leg and
   * returns both `portraitPrompt` and `turnaroundPrompt` from a single call —
   * reused for whichever action the user triggered. The real
   * `generateCharacterImage` / `generateCharacterTurnaround` mutation is only
   * invoked from `handleCharacterPromptConfirm`, with `approvedPrompt` set,
   * so the backend skips its own internal prompt-generation call and never
   * double-charges the same spend.
   */
  const previewCharacterPromptMutation =
    trpc.verticalDramaCharacters.previewCharacterPrompt.useMutation({
      onError,
    });

  /** Which character+action is currently waiting on `previewCharacterPromptMutation`
   *  — tracked separately from the mutation's own `variables` because that
   *  shared mutation carries no `action` discriminator (one call returns both
   *  prompts), but the two generate buttons on a card need independent
   *  loading spinners. Cleared as soon as the preview resolves (success or
   *  error). */
  const [pendingPreviewTarget, setPendingPreviewTarget] = useState<{
    characterId: string;
    action: "image" | "turnaround";
  } | null>(null);

  /** Populated once `previewCharacterPromptMutation` resolves — drives the
   *  inline `MediaPromptPreview` card. Cleared on confirm or cancel. */
  const [pendingCharacterPromptPreview, setPendingCharacterPromptPreview] =
    useState<{
      characterId: string;
      action: "image" | "turnaround";
      portraitPrompt: string;
      turnaroundPrompt: string;
      negativePrompt?: string;
      model?: string;
    } | null>(null);

  /** Entry point for both generate buttons (card grid + selected-character
   *  detail panel) — replaces the previous direct `generateImageMutation` /
   *  `generateTurnaroundMutation` calls. Still gates on `requireModelSelected()`
   *  exactly as before; only inserts the preview fetch in between "click" and
   *  "real mutation fires". */
  const startCharacterPromptPreview = (
    characterId: string,
    action: "image" | "turnaround"
  ) => {
    if (!requireModelSelected()) return;
    if (!requireMcpConnectionOrToast()) return;
    setPendingPreviewTarget({ characterId, action });
    previewCharacterPromptMutation.mutate(
      { seriesId, characterId },
      {
        onSuccess: res => {
          setPendingPreviewTarget(null);
          setPendingCharacterPromptPreview({
            characterId,
            action,
            portraitPrompt: res.portraitPrompt,
            turnaroundPrompt: res.turnaroundPrompt,
            negativePrompt: res.negativePrompt,
            model: res.model,
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
    const { characterId, action, negativePrompt } =
      pendingCharacterPromptPreview;
    setPendingCharacterPromptPreview(null);
    if (action === "image") {
      generateImageMutation.mutate({
        seriesId,
        characterId,
        approvedPrompt: editedPrompt,
        ...(negativePrompt ? { approvedNegativePrompt: negativePrompt } : {}),
        ...(selectedImageModelId ? { selectedImageModelId } : {}),
        ...(imageModelUsesMcp && mcpConnectionId ? { mcpConnectionId } : {}),
      });
    } else {
      generateTurnaroundMutation.mutate({
        seriesId,
        characterId,
        approvedPrompt: editedPrompt,
        ...(negativePrompt ? { approvedNegativePrompt: negativePrompt } : {}),
        ...(selectedImageModelId ? { selectedImageModelId } : {}),
        ...(imageModelUsesMcp && mcpConnectionId ? { mcpConnectionId } : {}),
      });
    }
  };

  /** User cancelled the preview — clear state only, no mutation call, no
   *  credit spent (the preview's own prompt-generation credit was already
   *  charged by `previewCharacterPromptMutation` itself; that is the single
   *  charge the plan accepts as the cost of showing the preview at all). */
  const handleCharacterPromptCancel = () =>
    setPendingCharacterPromptPreview(null);

  const isPreviewLoadingFor = (
    characterId: string,
    action: "image" | "turnaround"
  ) =>
    previewCharacterPromptMutation.isPending &&
    pendingPreviewTarget?.characterId === characterId &&
    pendingPreviewTarget.action === action;

  const isImageGeneratingFor = (characterId: string) =>
    isPreviewLoadingFor(characterId, "image") ||
    (generateImageMutation.isPending &&
      generateImageMutation.variables?.characterId === characterId) ||
    pollingCharacters.has(pollingCharacterKey(characterId, "primary_portrait"));

  const isTurnaroundGeneratingFor = (characterId: string) =>
    isPreviewLoadingFor(characterId, "turnaround") ||
    (generateTurnaroundMutation.isPending &&
      generateTurnaroundMutation.variables?.characterId === characterId) ||
    pollingCharacters.has(
      pollingCharacterKey(characterId, "character_sheet_turnaround")
    );

  const isSheetGeneratingFor = (characterId: string) =>
    (generateSheetMutation.isPending &&
      generateSheetMutation.variables?.characterId === characterId) ||
    pollingCharacters.has(
      pollingCharacterKey(characterId, "character_sheet_full")
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

  const assignDroppedReference = async (characterId: string, url: string) => {
    setAssigningCharacterId(characterId);
    try {
      let mediaAssetId: string;
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
        mediaAssetId = resolved.mediaAssetId;
      } else {
        const resolved = await cardResolveMutation.mutateAsync({
          seriesId,
          source: "url",
          url,
          mimeType: "image/jpeg",
        });
        mediaAssetId = resolved.mediaAssetId;
      }
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

  const characters = listQuery.data?.characters ?? [];
  const manifest = listQuery.data?.manifest;
  const assets = (manifest?.assets ?? []) as VerticalDramaCharacterAsset[];

  /**
   * Best-effort roster-card thumbnail for a character: the `primary_portrait`
   * asset in `approved` state if present, else the most recently updated
   * `primary_portrait` still in `generated` (pending) state. Prefers the
   * durable `thumbnailUrl` projection (LEFT JOIN onto `media_assets.originalUrl`,
   * populated server-side); falls back to this session's freshly-generated
   * image cache (`generatedImageUrls`), matched by `mediaAssetId`, for the
   * rare race where the asset list hasn't reflected a just-linked asset yet.
   */
  const getCharacterCardThumbnail = (characterId: string): string | null => {
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
    if (chosen?.thumbnailUrl) return chosen.thumbnailUrl;
    const cached = generatedImageUrls[characterId];
    if (
      cached &&
      (!chosen || String(chosen.mediaAssetId) === cached.mediaAssetId)
    ) {
      return cached.imageUrl;
    }
    return null;
  };

  // Auto-select the first character once data loads.
  type VdCharacterListItem = (typeof characters)[number];

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
  // Deliberately does NOT include the per-character generate/poll flags
  // (`generateImageMutation.isPending` etc., `pollingCharacters`) — those
  // gate only THAT character's own generate buttons (via
  // `isImageGeneratingFor`/`isTurnaroundGeneratingFor`/`isSheetGeneratingFor`
  // below), so generating one character's image never blocks starting
  // another character's generation concurrently.
  const mutating =
    createMutation.isPending ||
    linkMutation.isPending ||
    deleteAssetMutation.isPending;

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
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-muted-foreground">
          {t(lang, "ตัวละครในซีรีย์", "Series characters")}
        </span>
        <Badge variant="outline" className="gap-1 text-xs font-normal">
          {t(lang, "กลุ่มผู้ชมเป้าหมาย", "Target audience")}: {targetAudienceRegionLabel}
        </Badge>
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
              <CardTitle className="text-sm">
                {t(lang, "ตัวละครในซีรีย์", "Series characters")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              {characters.length === 0 ? (
                <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                  {t(lang, "ยังไม่มีตัวละคร", "No characters yet")}
                </p>
              ) : (
                <ul
                  className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
                  aria-label={t(lang, "รายชื่อตัวละคร", "Character list")}
                >
                  {rosterEntries.map(
                    ({
                      character: c,
                      variants,
                      shareFaceSourceName,
                    }: VdRosterEntry<VdCharacterListItem>) => {
                    const active = c.characterId === effectiveSelectedId;
                    const generatingThis = isImageGeneratingFor(c.characterId);
                    const generatingTurnaroundThis = isTurnaroundGeneratingFor(
                      c.characterId
                    );
                    const isDropTarget = dragOverCharacterId === c.characterId;
                    const isAssigningThis =
                      assigningCharacterId === c.characterId;
                    const thumbnailUrl = getCharacterCardThumbnail(
                      c.characterId
                    );
                    return (
                      <li key={c.characterId}>
                        <div
                          className={cn(
                            "group relative flex flex-col gap-2 rounded-lg border p-2.5 transition-colors",
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
                                className="shrink-0 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
                              >
                                <img
                                  src={thumbnailUrl}
                                  alt=""
                                  className="aspect-[9/16] w-28 rounded-md border border-border object-cover"
                                />
                              </button>
                            ) : (
                              <span className="flex aspect-[9/16] w-28 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground">
                                <User aria-hidden="true" className="h-8 w-8" />
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
                              {c.role && (
                                <Badge
                                  variant="outline"
                                  className="w-fit text-[10px]"
                                >
                                  {c.role}
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
                                  className="w-fit gap-1 border-sky-200 bg-sky-50 text-[10px] text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300"
                                >
                                  <Users
                                    aria-hidden="true"
                                    className="h-3 w-3 shrink-0"
                                  />
                                  <span className="truncate">
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
                                  className="w-fit text-[10px] text-muted-foreground"
                                >
                                  {t(
                                    lang,
                                    `${variants.length} ลุค`,
                                    `${variants.length} looks`
                                  )}
                                </Badge>
                              )}
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
                                const variantThumbnailUrl =
                                  getCharacterCardThumbnail(v.characterId);
                                const variantLabel =
                                  v.variantLabel ??
                                  t(lang, "ตัวแปร", "Variant");
                                return (
                                  <button
                                    key={v.characterId}
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
                                    className={cn(
                                      "flex max-w-[7.5rem] items-center gap-1.5 rounded-md border px-1.5 py-1 text-left transition-colors",
                                      variantActive
                                        ? "border-purple-400 bg-purple-50/60 ring-1 ring-purple-100"
                                        : "border-border hover:border-muted-foreground/40"
                                    )}
                                  >
                                    {variantThumbnailUrl ? (
                                      <img
                                        src={variantThumbnailUrl}
                                        alt=""
                                        className="aspect-[9/16] h-9 w-6 shrink-0 rounded object-cover"
                                      />
                                    ) : (
                                      <span className="flex aspect-[9/16] h-9 w-6 shrink-0 items-center justify-center rounded border border-dashed border-border text-muted-foreground">
                                        <User
                                          aria-hidden="true"
                                          className="h-3 w-3"
                                        />
                                      </span>
                                    )}
                                    <span
                                      className={cn(
                                        "truncate text-[10px]",
                                        variantActive
                                          ? "font-semibold"
                                          : "font-medium"
                                      )}
                                    >
                                      {variantLabel}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {!readOnly && (
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 shrink-0"
                                disabled={mutating || generatingThis}
                                aria-label={t(
                                  lang,
                                  "สร้างภาพตัวละคร",
                                  "Generate character image"
                                )}
                                title={t(
                                  lang,
                                  "สร้างภาพตัวละคร",
                                  "Generate character image"
                                )}
                                onClick={() =>
                                  startCharacterPromptPreview(
                                    c.characterId,
                                    "image"
                                  )
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
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 shrink-0"
                                disabled={mutating || generatingTurnaroundThis}
                                aria-label={t(
                                  lang,
                                  "สร้างชีทตัวละคร",
                                  "Generate character sheet"
                                )}
                                title={t(
                                  lang,
                                  "สร้างชีทตัวละคร (มุมมองหลายด้าน)",
                                  "Generate character sheet (multi-angle turnaround)"
                                )}
                                onClick={() =>
                                  startCharacterPromptPreview(
                                    c.characterId,
                                    "turnaround"
                                  )
                                }
                              >
                                {generatingTurnaroundThis ? (
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
                            </div>
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
                                  pendingCharacterPromptPreview.action ===
                                  "image"
                                    ? pendingCharacterPromptPreview.portraitPrompt
                                    : pendingCharacterPromptPreview.turnaroundPrompt
                                }
                                skillName={
                                  pendingCharacterPromptPreview.action ===
                                  "image"
                                    ? t(
                                        lang,
                                        "สร้างภาพตัวละคร",
                                        "Generate character image"
                                      )
                                    : t(
                                        lang,
                                        "สร้างชีทตัวละคร",
                                        "Generate character sheet"
                                      )
                                }
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
                                isExecuting={
                                  pendingCharacterPromptPreview.action ===
                                  "image"
                                    ? generateImageMutation.isPending
                                    : generateTurnaroundMutation.isPending
                                }
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
                    <CardTitle className="flex items-center gap-2 text-base">
                      <User aria-hidden="true" className="h-4 w-4" />
                      {selectedCharacter.name}
                      {selectedCharacter.role && (
                        <Badge variant="outline" className="text-[10px]">
                          {selectedCharacter.role}
                        </Badge>
                      )}
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
                            isImageGeneratingFor(selectedCharacter.characterId)
                          }
                          onClick={() =>
                            startCharacterPromptPreview(
                              selectedCharacter.characterId,
                              "image"
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
                            "สร้างภาพตัวละคร",
                            "Generate character image"
                          )}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="gap-2"
                          disabled={
                            mutating ||
                            isTurnaroundGeneratingFor(selectedCharacter.characterId)
                          }
                          onClick={() =>
                            startCharacterPromptPreview(
                              selectedCharacter.characterId,
                              "turnaround"
                            )
                          }
                        >
                          {isTurnaroundGeneratingFor(
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
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="gap-2"
                          disabled={
                            mutating ||
                            isSheetGeneratingFor(selectedCharacter.characterId)
                          }
                          onClick={() => {
                            if (!requireModelSelected()) return;
                            if (!requireMcpConnectionOrToast()) return;
                            generateSheetMutation.mutate({
                              seriesId,
                              characterId: selectedCharacter.characterId,
                              sheetLanguage,
                              ...(selectedImageModelId ? { selectedImageModelId } : {}),
                              ...(imageModelUsesMcp && mcpConnectionId ? { mcpConnectionId } : {}),
                            });
                          }}
                          data-testid="vd-generate-full-character-sheet"
                        >
                          {isSheetGeneratingFor(selectedCharacter.characterId) ? (
                            <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Grid3x3 aria-hidden="true" className="h-3.5 w-3.5" />
                          )}
                          {t(lang, "Character Sheet แบบเต็ม", "Full character sheet")}
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
                          prompt={
                            pendingCharacterPromptPreview.action === "image"
                              ? pendingCharacterPromptPreview.portraitPrompt
                              : pendingCharacterPromptPreview.turnaroundPrompt
                          }
                          skillName={
                            pendingCharacterPromptPreview.action === "image"
                              ? t(
                                  lang,
                                  "สร้างภาพตัวละคร",
                                  "Generate character image"
                                )
                              : t(
                                  lang,
                                  "สร้างชีทตัวละคร",
                                  "Generate character sheet"
                                )
                          }
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
                          isExecuting={
                            pendingCharacterPromptPreview.action === "image"
                              ? generateImageMutation.isPending
                              : generateTurnaroundMutation.isPending
                          }
                          onConfirm={handleCharacterPromptConfirm}
                          onCancel={handleCharacterPromptCancel}
                        />
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
                                      "Character Sheet แบบเต็ม",
                                      "Full character sheet"
                                    ),
                                  })
                                }
                                className="rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
                              >
                                <img
                                  src={sheet.imageUrl}
                                  alt={t(lang, "Character Sheet แบบเต็ม", "Full character sheet")}
                                  className="max-h-56 max-w-56 rounded-md border border-border object-contain"
                                />
                              </button>
                              <span className="text-[10px]">
                                {t(lang, "Character Sheet แบบเต็ม", "Full character sheet")}
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
                          // (turnaround) cache, since both mutations link into the
                          // same asset list, distinguished by `asset.role`.
                          const generatedForCharacter =
                            generatedImageUrls[asset.characterId];
                          const turnaroundForCharacter =
                            generatedTurnaroundUrls[asset.characterId];
                          const isTurnaroundAsset =
                            asset.role === "character_sheet_turnaround";
                          // Prefer the durable, server-joined `thumbnailUrl`
                          // (survives reload) — the session-local generate
                          // caches are only a fallback for the brief window
                          // before a refetch has picked it up.
                          const sessionCachedUrl = isTurnaroundAsset
                            ? turnaroundForCharacter &&
                              String(asset.mediaAssetId) ===
                                turnaroundForCharacter.mediaAssetId
                              ? turnaroundForCharacter.imageUrl
                              : null
                            : generatedForCharacter &&
                                String(asset.mediaAssetId) ===
                                  generatedForCharacter.mediaAssetId
                              ? generatedForCharacter.imageUrl
                              : null;
                          const thumbnailUrl =
                            asset.thumbnailUrl ?? sessionCachedUrl;
                          const thumbnailAlt = isTurnaroundAsset
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
                                      isTurnaroundAsset
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
                    {t(lang, "บทบาท (ไม่บังคับ)", "Role (optional)")}
                  </Label>
                  <Input
                    id="vd-char-role"
                    value={newRole}
                    onChange={e => setNewRole(e.target.value)}
                    placeholder={t(lang, "นางเอก", "Protagonist")}
                    maxLength={100}
                  />
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

      <ImageLightbox
        images={lightboxImage ? [lightboxImage] : []}
        open={lightboxImage !== null}
        onClose={() => setLightboxImage(null)}
      />
    </section>
  );
}

export default VerticalDramaCharacterStockPanel;
