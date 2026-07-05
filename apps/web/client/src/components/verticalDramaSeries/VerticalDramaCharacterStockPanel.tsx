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
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { useVerticalDramaLang } from "@/components/verticalDramaSeries/verticalDramaCopy";
import {
  readDroppedImageUrl,
  VerticalDramaCharacterReferencePanel,
} from "@/components/verticalDramaSeries/VerticalDramaCharacterReferencePanel";
import ModelSelectorDialog, {
  type MediaModel,
} from "@/components/media/ModelSelectorDialog";
import { MediaPromptPreview } from "@/components/chat/MediaPromptPreview";
import { ImageLightbox } from "@/components/chat/media/ImageLightbox";
import type { VerticalDramaCharacterAsset } from "@shared/verticalDramaSeries/characterAssets";

/**
 * Best-effort character description for display — mirrors the server-side
 * `extractCharacterDescription` in `server/routers/verticalDramaCharacters.ts`
 * (kept in sync deliberately; there is no single `description` field, only a
 * free-form `data` payload with personality/backstory/identityLock/wardrobeRules).
 */
const VD_CHARACTER_IMAGE_MODEL_STORAGE_KEY =
  "smartspec_vd_character_image_model";

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
  className?: string;
}

/* -------------------------------------------------------------------------- */
/* Panel                                                                       */
/* -------------------------------------------------------------------------- */

export function VerticalDramaCharacterStockPanel({
  seriesId,
  readOnly = false,
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

  const invalidate = () =>
    utils.verticalDramaCharacters.listCharacters.invalidate({ seriesId });

  const onError = (err: { message?: string }) =>
    toast.error(
      err?.message ?? t(lang, "เกิดข้อผิดพลาด", "Something went wrong")
    );

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
            mimeType: "image/png",
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
      });
    } else {
      generateTurnaroundMutation.mutate({
        seriesId,
        characterId,
        approvedPrompt: editedPrompt,
        ...(negativePrompt ? { approvedNegativePrompt: negativePrompt } : {}),
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
  /** Show the persistent right-side reference-panel column only when there's
   *  a character to attach references to and mutations are allowed — matches
   *  the condition that previously gated mounting `VerticalDramaCharacterReferencePanel`
   *  at all (`!readOnly`), just now also driving the 3-column grid shape. */
  const showReferencePanelColumn = Boolean(selectedCharacter) && !readOnly;
  const selectedAssets = assets.filter(
    a => effectiveSelectedId != null && a.characterId === effectiveSelectedId
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
                  {characters.map((c: (typeof characters)[number]) => {
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
                            const url = readDroppedImageUrl(event);
                            if (!url) {
                              toast.error(
                                t(
                                  lang,
                                  "ไม่พบภาพที่ลากมา — ลองใหม่อีกครั้ง",
                                  "No draggable image found — please try again"
                                )
                              );
                              return;
                            }
                            void assignDroppedReference(c.characterId, url);
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
                            </button>
                          </div>

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
                          onClick={() =>
                            generateSheetMutation.mutate({
                              seriesId,
                              characterId: selectedCharacter.characterId,
                              sheetLanguage,
                            })
                          }
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
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>

                <ModelSelectorDialog
                  open={isModelDialogOpen}
                  onOpenChange={setIsModelDialogOpen}
                  models={imageModels}
                  selectedModelId={selectedImageModelId}
                  onSelect={handleSelectImageModel}
                  mediaType="image"
                  isLoading={imageModelsQuery.isLoading}
                />

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
