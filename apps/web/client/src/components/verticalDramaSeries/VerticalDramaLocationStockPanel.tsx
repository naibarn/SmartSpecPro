/**
 * VerticalDramaLocationStockPanel (Location Visual Bible — dedicated series
 * tab, mirrors `VerticalDramaCharacterStockPanel.tsx`'s own tab).
 *
 * The durable per-series LOCATION roster: a flat card grid (thumbnail, name,
 * truncated description) plus a detail view for the selected location that
 * lets a user edit name/description and run the same preview -> generate ->
 * approve establishing-plate flow `VerticalDramaLocationsBibleCard` (buried
 * inside `VerticalDramaStoryboardPanel.tsx`'s per-episode storyboard view)
 * already ships — reimplemented here (not imported; that component is not
 * exported, and this feature's own established convention is to duplicate
 * small per-surface logic rather than share it across the character/location
 * systems, see e.g. `verticalDramaLocations.ts`'s own top-of-file doc
 * comment) so it stands on its own as a first-class tab instead of being
 * buried inside one episode's storyboard.
 *
 * Deliberately much simpler than `VerticalDramaCharacterStockPanel.tsx`: no
 * variants/twins, no voice/speech-profile sections, no model-picker/MCP
 * plumbing (this feature's router always renders with `DEFAULT_MODELS.image`
 * — see `verticalDramaLocations.ts`'s `generateLocationImage`), no
 * character-sheet/turnaround UI, no drag-drop Library/History sidebar
 * picker. Locations are a flat roster with at most one approved
 * establishing-plate reference each in this phase.
 *
 * Consumes only `trpc.verticalDramaLocations.*`. There is currently no
 * "create location" procedure on that router — the roster is populated
 * entirely by the Create-Series Wizard's `bible.locationsDraft` seed (see
 * `CreateSeriesWizard.tsx`) and, in future, an on-demand detection pass (see
 * the reserved header slot below) — so this panel never renders an "add
 * location" control.
 */

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  Clock,
  Loader2,
  MapPin,
  Save,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { useVerticalDramaLang } from "@/components/verticalDramaSeries/verticalDramaCopy";
import { ImageLightbox } from "@/components/chat/media/ImageLightbox";

/* -------------------------------------------------------------------------- */
/* Localized copy                                                             */
/* -------------------------------------------------------------------------- */

type Lang = "th" | "en";
const t = (lang: Lang, th: string, en: string) => (lang === "th" ? th : en);

/* -------------------------------------------------------------------------- */
/* Pure helpers (exported for direct unit testing — this codebase's                                     */
/* convention for these large panel components: test extracted pure          */
/* helpers, not full component renders — see e.g.                            */
/* `VerticalDramaCharacterStockPanel.guessImageMimeTypeFromUrl.test.ts`).     */
/* -------------------------------------------------------------------------- */

/**
 * Best-effort mimeType from a resolved location-render task's `resultUrl`
 * extension — duplicated (not cross-imported) from
 * `VerticalDramaCharacterStockPanel.tsx`'s `guessImageMimeTypeFromUrl` /
 * `VerticalDramaStoryboardPanel.tsx`'s `guessLocationImageMimeTypeFromUrl`,
 * matching this feature's established "duplicate small helpers, keep
 * surfaces decoupled" convention. Falls back to `"image/jpeg"` (the most
 * common provider output) when the extension is missing/unrecognized.
 */
export function guessLocationImageMimeTypeFromUrl(url: string): string {
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

/** Shared error-message resolution for every mutation's `onError` in this
 *  panel — extracted to a pure, exported function so it's independently
 *  testable without needing a full component render. Byte-identical
 *  convention to `VerticalDramaCharacterStockPanel.tsx`'s own
 *  `resolveVdCharacterMutationErrorMessage`. */
export function resolveLocationMutationErrorMessage(
  err: { message?: string } | null | undefined,
  lang: Lang,
): string {
  return err?.message ?? t(lang, "เกิดข้อผิดพลาด", "Something went wrong");
}

/** Bilingual summary toast copy for a `detectLocationsNow` success response —
 *  same "0 gets its own 'nothing found' message" convention as
 *  `VerticalDramaCharacterStockPanel.tsx`'s own
 *  `buildDetectCharacterVariantsSummaryMessage`, since "Created 0, reused 0"
 *  reads like a failure even though the call succeeded. */
export function buildDetectLocationsSummaryMessage(
  lang: Lang,
  result: { locationsCreated: number; locationsReused: number },
): string {
  if (result.locationsCreated === 0 && result.locationsReused === 0) {
    return t(lang, "ไม่พบฉากใหม่จากเนื้อเรื่องปัจจุบัน", "No new locations found in the current story");
  }
  return t(
    lang,
    `สร้างฉากใหม่ ${result.locationsCreated} รายการ, ใช้ฉากเดิม ${result.locationsReused} รายการ`,
    `Created ${result.locationsCreated} location(s), matched ${result.locationsReused} existing`,
  );
}

/**
 * Which URL a location card/detail view should render as its thumbnail:
 * the durable APPROVED reference (`primaryReferenceUrl`) always wins when
 * present, else an in-session just-rendered candidate awaiting approval,
 * else `null` (caller renders a `MapPin` placeholder). Pure/exported so the
 * fallback precedence is independently testable.
 */
export function resolveLocationCardThumbnailUrl(
  location: { primaryReferenceUrl?: string },
  candidateImageUrl?: string | null,
): string | null {
  // `||`, not `??`, is deliberate: unlike a free-text error message (where an
  // explicit empty string is a legitimate distinct value — see
  // `resolveLocationMutationErrorMessage`), a URL field is never
  // meaningfully an empty string, so treating "" as "absent" here is the
  // safer/more defensive read.
  return location.primaryReferenceUrl || candidateImageUrl || null;
}

/**
 * Reorder a location's candidate-image gallery so the current primary (if
 * any) always renders FIRST, keeping the rest of the list in whatever order
 * the caller passed in (the backend already returns newest-updated-first —
 * see `verticalDramaLocationStock.ts`'s `listLocationAssets`). The primary
 * is not always the newest candidate (the whole point of an explicit pick is
 * that it STAYS pinned even after newer candidates are generated), so this
 * reorder is the only thing that guarantees it is also the most visually
 * prominent one. Pure/exported so the ordering rule is independently
 * testable without a full component render — same convention as this file's
 * other extracted pure helpers.
 */
export function sortLocationCandidatesForGallery<T extends { isPrimary: boolean }>(assets: T[]): T[] {
  const primary = assets.filter(a => a.isPrimary);
  const rest = assets.filter(a => !a.isPrimary);
  return [...primary, ...rest];
}

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Browser-facing projection of a location roster row, mirroring
 * `verticalDramaLocations.ts`'s `locationRowToDto`. `primaryReferenceAssetLinkId`
 * is OPTIONAL and NOT part of the `list` DTO as of this panel's own initial
 * build (a companion backend dispatch running in parallel may add it later —
 * see this file's own top-of-file doc comment) — left optional/`undefined`-
 * safe here on purpose so this panel compiles and degrades gracefully
 * whether or not that field exists at runtime: present, it lets asset
 * management (delete/mark-stale/reject) apply to a location's pre-existing
 * approved reference; absent, only a reference approved THIS session
 * (tracked locally, see `approvedAssetLinkByLocationId`) can be managed.
 */
interface VdLocationListItem {
  locationId: string;
  seriesId: string;
  locationKey: string;
  name: string;
  description: string;
  primaryReferenceUrl?: string;
  primaryReferenceAssetLinkId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * One candidate `establishing_plate` image for a location, as returned by
 * `trpc.verticalDramaLocations.listLocationAssets` — mirrors
 * `verticalDramaLocations.ts`'s router-level DTO for that procedure
 * (`assetLinkId`/`mediaAssetId` stringified, same convention as every other
 * id on this panel's types).
 */
interface VdLocationAssetCandidate {
  assetLinkId: string;
  mediaAssetId: string;
  url: string;
  approved: boolean;
  isPrimary: boolean;
  updatedAt: string;
}

export interface VerticalDramaLocationStockPanelProps {
  seriesId: string;
  /** When true (archived series), all mutating controls are disabled. */
  readOnly?: boolean;
  className?: string;
}

/* -------------------------------------------------------------------------- */
/* Panel                                                                      */
/* -------------------------------------------------------------------------- */

export function VerticalDramaLocationStockPanel({
  seriesId,
  readOnly = false,
  className,
}: VerticalDramaLocationStockPanelProps) {
  const lang = useVerticalDramaLang();
  const utils = trpc.useUtils();

  const listQuery = trpc.verticalDramaLocations.list.useQuery(
    { seriesId },
    { enabled: Boolean(seriesId), staleTime: 15_000 },
  );
  const locations = (listQuery.data?.locations ?? []) as VdLocationListItem[];

  const onError = (err: { message?: string }) =>
    toast.error(resolveLocationMutationErrorMessage(err, lang));

  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt?: string } | null>(null);

  /**
   * Invalidates the roster AND (when a location is selected) that location's
   * candidate-image gallery — called after every mutation that can change
   * which asset is approved/primary/deleted for a location, so
   * `listLocationAssets`'s `isPrimary` flag never drifts out of sync with
   * `list`'s own `primaryReferenceUrl`/`primaryReferenceAssetLinkId`.
   */
  const invalidate = () => {
    void utils.verticalDramaLocations.list.invalidate({ seriesId });
    if (selectedLocationId) {
      void utils.verticalDramaLocations.listLocationAssets.invalidate({
        seriesId,
        locationId: selectedLocationId,
      });
    }
  };

  /** Per-location edit draft for name/description — Record-keyed-by-id,
   *  deliberately NOT synced via a `useEffect` on selection change (same
   *  convention/rationale as `VerticalDramaCharacterStockPanel.tsx`'s own
   *  `speechProfileFormFor`): reading always falls back to the persisted
   *  server value when no local draft exists yet for that location. */
  const [editDrafts, setEditDrafts] = useState<Record<string, { name: string; description: string }>>({});
  const editDraftFor = (locationId: string): { name: string; description: string } => {
    const draft = editDrafts[locationId];
    if (draft) return draft;
    const location = locations.find((l) => l.locationId === locationId);
    return { name: location?.name ?? "", description: location?.description ?? "" };
  };
  const updateEditDraft = (locationId: string, patch: Partial<{ name: string; description: string }>) => {
    setEditDrafts((prev) => ({ ...prev, [locationId]: { ...editDraftFor(locationId), ...patch } }));
  };

  const updateLocationMutation = trpc.verticalDramaLocations.updateLocation.useMutation({ onError });

  /** "ตรวจจับฉากตอนนี้" (`detectLocationsNow`) — a real, slow LLM call
   *  (seconds, costs credits), so it's deliberately NOT folded into any
   *  per-card `mutating` flag; its own button carries its own `isPending`
   *  spinner. Byte-identical convention to
   *  `VerticalDramaCharacterStockPanel.tsx`'s own `detectVariantsMutation`. */
  const detectLocationsMutation = trpc.verticalDramaLocations.detectLocationsNow.useMutation({
    onSuccess: (res) => {
      invalidate();
      toast.success(buildDetectLocationsSummaryMessage(lang, res));
    },
    onError,
  });

  const handleSaveEdit = (location: VdLocationListItem) => {
    const draft = editDraftFor(location.locationId);
    const name = draft.name.trim();
    if (!name) {
      toast.error(t(lang, "กรุณาระบุชื่อสถานที่", "Enter a location name"));
      return;
    }
    updateLocationMutation.mutate(
      { seriesId, locationId: location.locationId, name, description: draft.description },
      {
        onSuccess: () => {
          setEditDrafts((prev) => {
            const next = { ...prev };
            delete next[location.locationId];
            return next;
          });
          invalidate();
          toast.success(t(lang, "บันทึกแล้ว", "Saved"));
        },
      },
    );
  };

  /* ---- Generate/approve establishing-plate flow — the EXACT 4-mutation ----
   * approve-gated flow `VerticalDramaLocationsBibleCard` ships (preview ->
   * generate -> poll -> explicit approve), keyed by `locationId` directly
   * (simpler than that card's `locationKey` join — this panel reads straight
   * off the roster, no storyboard `distinct_locations` join needed). */
  const previewMutation = trpc.verticalDramaLocations.previewLocationPrompt.useMutation({ onError });
  const generateMutation = trpc.verticalDramaLocations.generateLocationImage.useMutation({ onError });
  // No hook-level `onError` on the resolve/link/approve trio — all three are
  // only ever awaited inside `handleApprove`'s own try/catch below, which
  // already surfaces exactly one toast on failure; a hook-level `onError`
  // here would double-toast the same failure (same convention as
  // `VerticalDramaLocationsBibleCard`).
  const resolveMutation = trpc.verticalDramaLocations.resolveMediaAssetForImport.useMutation();
  const linkMutation = trpc.verticalDramaLocations.linkAsset.useMutation();
  const approveMutation = trpc.verticalDramaLocations.approveAsset.useMutation();

  const [previewByLocationId, setPreviewByLocationId] = useState<
    Record<string, { prompt: string; negativePrompt?: string }>
  >({});
  const [pendingPreviewLocationId, setPendingPreviewLocationId] = useState<string | null>(null);
  const [renderingLocationId, setRenderingLocationId] = useState<string | null>(null);
  const [candidateByLocationId, setCandidateByLocationId] = useState<
    Record<string, { imageUrl: string; approving?: boolean }>
  >({});
  /** `locationId` -> `assetLinkId` for a reference approved THIS session —
   *  the only source of a manageable `assetLinkId` until the backend's
   *  `list` DTO carries `primaryReferenceAssetLinkId` for pre-existing
   *  approved references (see `VdLocationListItem`'s own doc comment). */
  const [approvedAssetLinkByLocationId, setApprovedAssetLinkByLocationId] = useState<Record<string, string>>({});

  /** Poll a submitted location-image render task to completion — same
   *  `utils.media.getTask.fetch` loop shape (120 attempts, 2.5s interval) as
   *  `VerticalDramaLocationsBibleCard`'s own `pollLocationImageTask`. */
  async function pollLocationImageTask(taskId: string, locationId: string) {
    try {
      for (let attempt = 0; attempt < 120; attempt++) {
        const task = await utils.media.getTask.fetch({ taskId });
        const status = (task as { status?: string } | null)?.status;
        if (status === "completed") {
          const resultUrl = (task as { resultUrl?: string } | null)?.resultUrl;
          if (!resultUrl) {
            toast.error(
              t(lang, "สร้างภาพสำเร็จแต่ไม่พบ URL ผลลัพธ์", "Generation completed but no result URL."),
            );
            return;
          }
          // Auto-persist the instant generation completes (2026-07-13 fix) —
          // previously this only parked `resultUrl` as a local-state candidate
          // awaiting a SEPARATE manual "approve" click, so a user who
          // navigated away before approving silently lost the image (and the
          // credits they paid for it — it never reached the media_assets
          // library or the location roster). Now the resolve->link->approve
          // chain runs immediately, so a generated image is durable the
          // moment it finishes, matching how the character system auto-links
          // its portraits. The candidate is still shown briefly (below) so
          // the thumbnail appears during the short persist; `persistGenerated
          // LocationImage` clears it and refreshes the roster/gallery on
          // success, or leaves it in place (with the manual "approve" button
          // as a retry) if the persist itself fails.
          setCandidateByLocationId((prev) => ({ ...prev, [locationId]: { imageUrl: resultUrl } }));
          await persistGeneratedLocationImage(locationId, resultUrl);
          return;
        }
        if (status === "failed") {
          const errorMessage = (task as { errorMessage?: string } | null)?.errorMessage;
          toast.error(
            t(
              lang,
              `สร้างภาพล้มเหลว${errorMessage ? `: ${errorMessage}` : ""}`,
              `Generation failed${errorMessage ? `: ${errorMessage}` : ""}`,
            ),
          );
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
      toast.error(
        t(lang, "สร้างภาพใช้เวลานานเกินไป ลองตรวจสอบภายหลัง", "Generation is taking too long — check back later."),
      );
    } finally {
      setRenderingLocationId((current) => (current === locationId ? null : current));
    }
  }

  const handlePreview = (location: VdLocationListItem) => {
    setPendingPreviewLocationId(location.locationId);
    previewMutation.mutate(
      { seriesId, locationId: location.locationId },
      {
        onSuccess: (res) => {
          setPreviewByLocationId((prev) => ({
            ...prev,
            [location.locationId]: { prompt: res.establishingPlatePrompt, negativePrompt: res.negativePrompt },
          }));
          setPendingPreviewLocationId(null);
        },
        onError: () => setPendingPreviewLocationId(null),
      },
    );
  };

  const handleGenerate = (location: VdLocationListItem) => {
    const preview = previewByLocationId[location.locationId];
    if (!preview) return;
    setRenderingLocationId(location.locationId);
    generateMutation.mutate(
      {
        seriesId,
        locationId: location.locationId,
        approvedPrompt: preview.prompt,
        ...(preview.negativePrompt ? { approvedNegativePrompt: preview.negativePrompt } : {}),
      },
      {
        onSuccess: (res) => void pollLocationImageTask(res.taskId, location.locationId),
        onError: () => setRenderingLocationId((current) => (current === location.locationId ? null : current)),
      },
    );
  };

  /** The persist chain: import the rendered URL into the media_assets
   *  library, link it as this location's establishing-plate asset, and
   *  approve it — the exact steps that make a generated image durable. Shared
   *  by the automatic post-generation persist (`pollLocationImageTask`) and
   *  the manual "approve" retry button (`handleApprove`). Marks the candidate
   *  `approving` for the button spinner; on success clears the candidate +
   *  preview and refreshes the roster/gallery; on failure leaves the
   *  candidate in place so the manual button can retry. Never throws. */
  const persistGeneratedLocationImage = async (locationId: string, imageUrl: string): Promise<void> => {
    setCandidateByLocationId((prev) => ({ ...prev, [locationId]: { imageUrl, approving: true } }));
    try {
      const resolved = await resolveMutation.mutateAsync({
        seriesId,
        source: "url",
        url: imageUrl,
        mimeType: guessLocationImageMimeTypeFromUrl(imageUrl),
      });
      const linked = await linkMutation.mutateAsync({
        seriesId,
        locationId,
        mediaAssetId: resolved.mediaAssetId,
        assetType: "location_reference",
        role: "establishing_plate",
        source: "generated",
      });
      await approveMutation.mutateAsync({ seriesId, assetLinkId: linked.asset.assetLinkId });
      setApprovedAssetLinkByLocationId((prev) => ({ ...prev, [locationId]: linked.asset.assetLinkId }));
      setCandidateByLocationId((prev) => {
        const next = { ...prev };
        delete next[locationId];
        return next;
      });
      setPreviewByLocationId((prev) => {
        const next = { ...prev };
        delete next[locationId];
        return next;
      });
      invalidate();
      void utils.verticalDramaLocations.listLocationAssets.invalidate({ seriesId, locationId });
      toast.success(t(lang, "บันทึกภาพสถานที่แล้ว", "Location reference saved"));
    } catch (err) {
      // Persist failed — keep the candidate visible with the manual "approve"
      // button as a retry (the paid render is NOT lost, it's still the
      // candidate URL), and surface why.
      toast.error(err instanceof Error ? err.message : t(lang, "บันทึกภาพไม่สำเร็จ", "Failed to save image"));
      setCandidateByLocationId((prev) => ({ ...prev, [locationId]: { imageUrl, approving: false } }));
    }
  };

  const handleApprove = async (location: VdLocationListItem) => {
    const candidate = candidateByLocationId[location.locationId];
    if (!candidate) return;
    await persistGeneratedLocationImage(location.locationId, candidate.imageUrl);
  };

  /* ---- Basic asset management (delete / reject / mark stale) ----
   * Only usable once an `assetLinkId` is resolvable — either from THIS
   * session's own approve flow above, or (once the backend adds it) the
   * roster row's own `primaryReferenceAssetLinkId` — see
   * `VdLocationListItem`'s own doc comment. */
  const resolveAssetLinkId = (location: VdLocationListItem): string | undefined =>
    approvedAssetLinkByLocationId[location.locationId] ?? location.primaryReferenceAssetLinkId;

  const clearLocationSessionState = (locationId: string) => {
    setCandidateByLocationId((prev) => {
      const next = { ...prev };
      delete next[locationId];
      return next;
    });
    setPreviewByLocationId((prev) => {
      const next = { ...prev };
      delete next[locationId];
      return next;
    });
    setApprovedAssetLinkByLocationId((prev) => {
      const next = { ...prev };
      delete next[locationId];
      return next;
    });
  };

  const transitionAssetMutation = trpc.verticalDramaLocations.transitionAsset.useMutation({ onError });
  const markStaleMutation = trpc.verticalDramaLocations.markStale.useMutation({ onError });
  const deleteAssetMutation = trpc.verticalDramaLocations.deleteAsset.useMutation({ onError });
  const [confirmingDeleteLocationId, setConfirmingDeleteLocationId] = useState<string | null>(null);

  /* ---- Multiple candidates, pick a primary (Location Visual Bible Phase C) ----
   * `listLocationAssets` is the durable-side companion to the in-session
   * `candidateByLocationId`/`approvedAssetLinkByLocationId` state above: it
   * surfaces EVERY approved-or-pending `establishing_plate` candidate for
   * the selected location (not just the newest), each flagged `isPrimary`
   * per the backend's marker-resolution rule (see
   * `verticalDramaLocationStock.ts`). Only queried once a location is
   * selected — `locationId: selectedLocationId ?? ""` is a placeholder
   * input the query never actually runs with, since `enabled` gates it. */
  const assetsQuery = trpc.verticalDramaLocations.listLocationAssets.useQuery(
    { seriesId, locationId: selectedLocationId ?? "" },
    { enabled: Boolean(seriesId) && Boolean(selectedLocationId), staleTime: 10_000 },
  );
  const candidatesForSelected = sortLocationCandidatesForGallery(
    (assetsQuery.data?.assets ?? []) as VdLocationAssetCandidate[],
  );

  const setPrimaryMutation = trpc.verticalDramaLocations.setPrimaryLocationAsset.useMutation({ onError });
  const handleSetPrimary = (location: VdLocationListItem, candidate: VdLocationAssetCandidate) => {
    if (candidate.isPrimary) return;
    setPrimaryMutation.mutate(
      { seriesId, locationId: location.locationId, assetLinkId: candidate.assetLinkId },
      {
        onSuccess: () => {
          invalidate();
          toast.success(t(lang, "ตั้งเป็นภาพหลักแล้ว", "Set as primary reference"));
        },
      },
    );
  };

  const handleReject = (location: VdLocationListItem) => {
    const assetLinkId = resolveAssetLinkId(location);
    if (!assetLinkId) return;
    transitionAssetMutation.mutate(
      { seriesId, assetLinkId, to: "rejected" },
      {
        onSuccess: () => {
          clearLocationSessionState(location.locationId);
          invalidate();
          toast.success(t(lang, "ปฏิเสธภาพอ้างอิงแล้ว", "Reference rejected"));
        },
      },
    );
  };

  const handleMarkStale = (location: VdLocationListItem) => {
    const assetLinkId = resolveAssetLinkId(location);
    if (!assetLinkId) return;
    markStaleMutation.mutate(
      { seriesId, assetLinkIds: [assetLinkId] },
      {
        onSuccess: () => {
          clearLocationSessionState(location.locationId);
          invalidate();
          toast.success(t(lang, "ทำเครื่องหมายว่าล้าสมัยแล้ว", "Marked stale"));
        },
      },
    );
  };

  const handleDelete = (location: VdLocationListItem) => {
    const assetLinkId = resolveAssetLinkId(location);
    if (!assetLinkId) return;
    deleteAssetMutation.mutate(
      { seriesId, assetLinkId },
      {
        onSuccess: () => {
          clearLocationSessionState(location.locationId);
          setConfirmingDeleteLocationId(null);
          invalidate();
          toast.success(t(lang, "ลบภาพอ้างอิงแล้ว", "Reference deleted"));
        },
      },
    );
  };

  const selectedLocation = locations.find((l) => l.locationId === selectedLocationId) ?? null;
  const candidateForSelected = selectedLocation ? candidateByLocationId[selectedLocation.locationId] : undefined;
  const previewForSelected = selectedLocation ? previewByLocationId[selectedLocation.locationId] : undefined;
  const isRenderingSelected = selectedLocation ? renderingLocationId === selectedLocation.locationId : false;
  const isPreviewLoadingSelected = selectedLocation ? pendingPreviewLocationId === selectedLocation.locationId : false;
  const detailThumbnailUrl = selectedLocation
    ? resolveLocationCardThumbnailUrl(selectedLocation, candidateForSelected?.imageUrl)
    : null;
  const detailHasApprovedReference = Boolean(selectedLocation?.primaryReferenceUrl);
  const resolvedAssetLinkIdForSelected = selectedLocation ? resolveAssetLinkId(selectedLocation) : undefined;

  if (listQuery.isLoading) {
    return (
      <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3", className)} aria-busy="true">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (listQuery.isError) {
    return (
      <Card className={cn("border-destructive/40", className)}>
        <CardContent role="alert" className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
            {listQuery.error?.message ?? t(lang, "โหลดสถานที่ไม่สำเร็จ", "Failed to load locations")}
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
      aria-label={t(lang, "สถานที่ในซีรีย์", "Series locations")}
      className={cn("flex flex-col gap-4", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-muted-foreground">
          {t(lang, "สถานที่ในซีรีย์", "Series locations")}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {/* "ตรวจจับฉากตอนนี้" — manual on-demand whole-series location
              detection, mirroring `VerticalDramaCharacterStockPanel.tsx`'s
              own "ตรวจจับ variant/แฝดตอนนี้" button. Real LLM call (seconds,
              costs credits) — button carries its own `isPending` spinner. */}
          {!readOnly && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              disabled={detectLocationsMutation.isPending}
              aria-label={t(lang, "ตรวจจับฉากตอนนี้", "Detect scenes now")}
              title={t(
                lang,
                "สแกนเนื้อเรื่องปัจจุบันหาฉากใหม่ (ใช้ LLM จริง อาจใช้เวลาสักครู่)",
                "Scans the current story for new locations (real LLM call, may take a moment)",
              )}
              onClick={() => detectLocationsMutation.mutate({ seriesId })}
              data-testid="vd-location-detect-now"
            >
              {detectLocationsMutation.isPending ? (
                <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wand2 aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              {t(lang, "ตรวจจับฉากตอนนี้", "Detect scenes now")}
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t(lang, "รายชื่อสถานที่", "Location roster")}</CardTitle>
        </CardHeader>
        <CardContent className="p-3">
          {locations.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">
              {t(
                lang,
                "ยังไม่มีสถานที่ — สถานที่จะถูกสร้างจากข้อมูลตอนสร้างซีรีย์ หรือจากเนื้อเรื่องที่สร้างขึ้น",
                "No locations yet — locations are seeded when the series is created, or generated from the story.",
              )}
            </p>
          ) : (
            <ul
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
              aria-label={t(lang, "รายชื่อสถานที่", "Location list")}
            >
              {locations.map((location) => {
                const active = location.locationId === selectedLocationId;
                const candidate = candidateByLocationId[location.locationId];
                const thumbnailUrl = resolveLocationCardThumbnailUrl(location, candidate?.imageUrl);
                return (
                  <li key={location.locationId}>
                    <button
                      type="button"
                      onClick={() => setSelectedLocationId(location.locationId)}
                      className={cn(
                        "flex w-full flex-col gap-2 rounded-lg border p-2.5 text-left transition-colors",
                        active
                          ? "border-purple-400 bg-purple-50/60 ring-2 ring-purple-100 dark:bg-purple-950/20"
                          : "border-border hover:border-muted-foreground/40",
                      )}
                      data-testid={`vd-location-card-${location.locationId}`}
                    >
                      <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-muted/30">
                        {thumbnailUrl ? (
                          <img src={thumbnailUrl} alt={location.name} className="h-full w-full object-cover" />
                        ) : (
                          <MapPin aria-hidden="true" className="h-6 w-6 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{location.name}</p>
                        {location.description ? (
                          <p className="line-clamp-2 text-xs text-muted-foreground">{location.description}</p>
                        ) : null}
                      </div>
                      {location.primaryReferenceUrl ? (
                        <Badge
                          variant="outline"
                          className="w-fit gap-1 border-emerald-400/60 px-1.5 py-0 text-[9px] text-emerald-700 dark:text-emerald-400"
                        >
                          <Check aria-hidden="true" className="h-2.5 w-2.5" />
                          {t(lang, "มีภาพอ้างอิงแล้ว", "Reference set")}
                        </Badge>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {selectedLocation ? (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
            <CardTitle className="text-sm">{t(lang, "รายละเอียดสถานที่", "Location detail")}</CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setSelectedLocationId(null)}
              aria-label={t(lang, "ปิด", "Close")}
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 p-3 sm:flex-row sm:items-start">
            <div className="flex h-32 w-full shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-muted/30 sm:w-56">
              {detailThumbnailUrl ? (
                <button
                  type="button"
                  className="block h-full w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
                  onClick={() => setLightboxImage({ src: detailThumbnailUrl, alt: selectedLocation.name })}
                  aria-label={t(
                    lang,
                    `ดูภาพขยายของ ${selectedLocation.name}`,
                    `View full-size image of ${selectedLocation.name}`,
                  )}
                >
                  <img src={detailThumbnailUrl} alt="" className="h-full w-full object-cover" />
                </button>
              ) : (
                <MapPin aria-hidden="true" className="h-8 w-8 text-muted-foreground" />
              )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="vd-location-name" className="text-xs font-medium text-muted-foreground">
                  {t(lang, "ชื่อสถานที่", "Location name")}
                </Label>
                <Input
                  id="vd-location-name"
                  value={editDraftFor(selectedLocation.locationId).name}
                  onChange={(e) => updateEditDraft(selectedLocation.locationId, { name: e.target.value })}
                  disabled={readOnly}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="vd-location-description" className="text-xs font-medium text-muted-foreground">
                  {t(lang, "คำอธิบาย", "Description")}
                </Label>
                <Textarea
                  id="vd-location-description"
                  rows={3}
                  value={editDraftFor(selectedLocation.locationId).description}
                  onChange={(e) => updateEditDraft(selectedLocation.locationId, { description: e.target.value })}
                  disabled={readOnly}
                />
              </div>
              {!readOnly && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-fit gap-1.5"
                  onClick={() => handleSaveEdit(selectedLocation)}
                  disabled={updateLocationMutation.isPending}
                >
                  {updateLocationMutation.isPending ? (
                    <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save aria-hidden="true" className="h-3.5 w-3.5" />
                  )}
                  {t(lang, "บันทึก", "Save")}
                </Button>
              )}

              {/* Candidate-image gallery (Location Visual Bible Phase C) —
                  every approved-or-pending `establishing_plate` candidate
                  for this location, current primary highlighted. Rendered
                  UNCONDITIONALLY (not gated on `!readOnly`) so a read-only
                  viewer still sees what's available — same convention as
                  the character panel's own reference-image picker
                  (`VerticalDramaCharacterStockPanel.tsx`'s "Rendered
                  UNCONDITIONALLY... only the click-to-select interaction is
                  disabled when readOnly"). Renders nothing while loading or
                  when there are no candidates yet. */}
              {assetsQuery.isLoading ? (
                <div className="flex gap-2 border-t pt-3">
                  <Skeleton className="h-14 w-14 rounded" />
                  <Skeleton className="h-14 w-14 rounded" />
                </div>
              ) : candidatesForSelected.length > 0 ? (
                <div className="flex flex-col gap-1.5 border-t pt-3">
                  <span className="text-[11px] font-medium text-foreground/80">
                    {t(
                      lang,
                      `ภาพผู้สมัครทั้งหมด (${candidatesForSelected.length})`,
                      `All candidates (${candidatesForSelected.length})`,
                    )}
                  </span>
                  <div className="flex flex-wrap items-start gap-2">
                    {candidatesForSelected.map((candidate) => (
                      <button
                        key={candidate.assetLinkId}
                        type="button"
                        disabled={readOnly || candidate.isPrimary || setPrimaryMutation.isPending}
                        aria-pressed={candidate.isPrimary}
                        aria-label={
                          candidate.isPrimary
                            ? t(lang, "ภาพหลักปัจจุบัน", "Current primary image")
                            : t(lang, "ตั้งเป็นภาพหลัก", "Set as primary image")
                        }
                        className={cn(
                          "flex flex-col items-center gap-0.5",
                          readOnly || candidate.isPrimary ? "cursor-default" : "cursor-pointer",
                        )}
                        onClick={() => handleSetPrimary(selectedLocation, candidate)}
                        data-testid={`vd-location-candidate-${candidate.assetLinkId}`}
                      >
                        <span className="relative block">
                          <img
                            src={candidate.url}
                            alt=""
                            className={cn(
                              "h-14 w-14 rounded border border-border object-cover",
                              candidate.isPrimary && "border-emerald-400 ring-2 ring-emerald-300",
                            )}
                          />
                          {candidate.isPrimary && (
                            <span className="absolute -right-1 -top-1 rounded-full bg-emerald-500 p-0.5 text-white">
                              <Check aria-hidden="true" className="h-2.5 w-2.5" />
                            </span>
                          )}
                        </span>
                        {!candidate.approved && (
                          <span className="text-[9px] text-muted-foreground">
                            {t(lang, "รอตรวจสอบ", "Pending")}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Generate/approve + basic asset management — see this
                  file's own top-of-file doc comment for why this mirrors
                  `VerticalDramaLocationsBibleCard`'s exact 4-mutation flow.
                  An in-progress preview/generate/approve cycle ALWAYS takes
                  priority over the "primary already set" management view
                  (Phase C reorder) — otherwise a location that already has
                  a primary could never reach the generate flow again,
                  permanently capping it at one candidate. */}
              {!readOnly && (
                <div className="flex flex-col gap-1.5 border-t pt-3">
                  {candidateForSelected ? (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2">
                        <img
                          src={candidateForSelected.imageUrl}
                          alt=""
                          className="h-14 w-14 shrink-0 rounded border border-border object-cover"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          {t(
                            lang,
                            "ตรวจสอบภาพที่สร้างแล้วกด “อนุมัติ” เพื่อเพิ่มเป็นภาพผู้สมัคร (เลือกภาพหลักได้ในแกลเลอรีด้านบน)",
                            "Review the rendered image, then approve to add it as a candidate (pick the primary from the gallery above).",
                          )}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="w-fit gap-1.5"
                        onClick={() => void handleApprove(selectedLocation)}
                        disabled={candidateForSelected.approving}
                        data-testid={`vd-location-approve-${selectedLocation.locationId}`}
                      >
                        {candidateForSelected.approving ? (
                          <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check aria-hidden="true" className="h-3.5 w-3.5" />
                        )}
                        {t(lang, "อนุมัติภาพนี้", "Approve this image")}
                      </Button>
                    </div>
                  ) : previewForSelected ? (
                    <div className="flex flex-col gap-1.5">
                      <p className="rounded border border-border/60 bg-muted/30 p-1.5 text-[11px] text-muted-foreground">
                        {previewForSelected.prompt}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="w-fit gap-1.5"
                        onClick={() => handleGenerate(selectedLocation)}
                        disabled={isRenderingSelected}
                        data-testid={`vd-location-generate-image-${selectedLocation.locationId}`}
                      >
                        {isRenderingSelected ? (
                          <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
                        )}
                        {isRenderingSelected
                          ? t(lang, "กำลังสร้าง…", "Generating…")
                          : t(lang, "สร้างภาพ (มีค่าใช้จ่าย)", "Generate image (paid)")}
                      </Button>
                    </div>
                  ) : (
                    <>
                      {detailHasApprovedReference && (
                        <div className="flex flex-col gap-1.5">
                          <p className="text-[11px] text-muted-foreground">
                            {t(lang, "มีภาพอ้างอิงหลักแล้ว", "A primary reference image is set")}
                          </p>
                          {resolvedAssetLinkIdForSelected ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="gap-1.5"
                                onClick={() => handleMarkStale(selectedLocation)}
                                disabled={markStaleMutation.isPending}
                                data-testid={`vd-location-mark-stale-${selectedLocation.locationId}`}
                              >
                                <Clock aria-hidden="true" className="h-3.5 w-3.5" />
                                {t(lang, "ทำเครื่องหมายล้าสมัย", "Mark stale")}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="gap-1.5"
                                onClick={() => handleReject(selectedLocation)}
                                disabled={transitionAssetMutation.isPending}
                                data-testid={`vd-location-reject-${selectedLocation.locationId}`}
                              >
                                <X aria-hidden="true" className="h-3.5 w-3.5" />
                                {t(lang, "ปฏิเสธ", "Reject")}
                              </Button>
                              {confirmingDeleteLocationId === selectedLocation.locationId ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[11px] text-muted-foreground">
                                    {t(lang, "ยืนยันการลบ?", "Confirm delete?")}
                                  </span>
                                  <Button
                                    type="button"
                                    size="icon-sm"
                                    variant="ghost"
                                    onClick={() => setConfirmingDeleteLocationId(null)}
                                    aria-label={t(lang, "ยกเลิก", "Cancel")}
                                  >
                                    <X aria-hidden="true" className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    type="button"
                                    size="icon-sm"
                                    variant="destructive"
                                    onClick={() => handleDelete(selectedLocation)}
                                    disabled={deleteAssetMutation.isPending}
                                    aria-label={t(lang, "ยืนยันลบภาพนี้", "Confirm delete this image")}
                                    data-testid={`vd-location-confirm-delete-${selectedLocation.locationId}`}
                                  >
                                    {deleteAssetMutation.isPending ? (
                                      <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="gap-1.5 text-destructive"
                                  onClick={() => setConfirmingDeleteLocationId(selectedLocation.locationId)}
                                  data-testid={`vd-location-delete-${selectedLocation.locationId}`}
                                >
                                  <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                                  {t(lang, "ลบ", "Delete")}
                                </Button>
                              )}
                            </div>
                          ) : (
                            <p className="text-[11px] text-muted-foreground">
                              {t(
                                lang,
                                "จัดการภาพนี้ไม่ได้ในตอนนี้ (สร้างไว้ก่อนหน้าเซสชันนี้)",
                                "Can't manage this reference yet (created before this session)",
                              )}
                            </p>
                          )}
                        </div>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="w-fit gap-1.5"
                        onClick={() => handlePreview(selectedLocation)}
                        disabled={isPreviewLoadingSelected}
                        data-testid={`vd-location-preview-prompt-${selectedLocation.locationId}`}
                      >
                        {isPreviewLoadingSelected ? (
                          <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Wand2 aria-hidden="true" className="h-3.5 w-3.5" />
                        )}
                        {detailHasApprovedReference
                          ? t(lang, "สร้างภาพเพิ่ม", "Generate another")
                          : t(lang, "สร้าง prompt", "Generate prompt")}
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <ImageLightbox
        images={lightboxImage ? [lightboxImage] : []}
        open={lightboxImage !== null}
        onClose={() => setLightboxImage(null)}
      />
    </section>
  );
}
