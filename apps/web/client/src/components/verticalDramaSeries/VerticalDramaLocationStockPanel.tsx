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
 * variants/twins, no voice/speech-profile sections, no character-sheet/
 * turnaround UI, no drag-drop Library/History sidebar picker. Locations are a
 * flat roster with one primary establishing plate plus additive camera-view
 * coverage images (reverse, side, and detail) managed from the selected
 * location detail card.
 *
 * It DOES carry an image-model picker (model-picker parity plan) mirroring
 * `VerticalDramaCharacterStockPanel.tsx`'s own: `trpc.mediaModels.list`,
 * `ModelSelectorDialog`, and (for MCP-transport models) `McpConnectionPicker`
 * — the SAME reusable components the character tab uses, not new ones.
 * Like the character tab's `requireModelSelected()` hard gate, this panel
 * ALSO force-blocks generation until a model is picked — an unselected
 * model no longer silently falls back to `DEFAULT_MODELS.image`
 * server-side; the client-side gate opens the picker dialog instead (see
 * `requireModelSelected()` below, cloned from the character tab's own).
 *
 * Consumes only `trpc.verticalDramaLocations.*`. There is currently no
 * "create location" procedure on that router — the roster is populated
 * entirely by the Create-Series Wizard's `bible.locationsDraft` seed (see
 * `CreateSeriesWizard.tsx`) and, in future, an on-demand detection pass (see
 * the reserved header slot below) — so this panel never renders an "add
 * location" control.
 */

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Camera,
  Check,
  Clock,
  Expand,
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
import { AuthenticatedMediaImage } from "@/components/media/AuthenticatedMediaImage";
import { trpc } from "@/lib/trpc";
import { useVerticalDramaLang } from "@/components/verticalDramaSeries/verticalDramaCopy";
import { ImageLightbox } from "@/components/chat/media/ImageLightbox";
import ModelSelectorDialog, {
  type MediaModel,
} from "@/components/media/ModelSelectorDialog";
import { McpConnectionPicker } from "@/components/media/McpConnectionPicker";
import { HermesConnectionPicker } from "@/components/media/HermesConnectionPicker";
import { useVerticalDramaCreditConfirmation } from "@/components/verticalDramaSeries/VerticalDramaCreditConfirmDialog";
import {
  formatHermesErrorForToast,
  presentHermesError,
} from "@/lib/hermesErrorPresentation";
import { resolveMediaModelTransportConfig } from "@shared/mediaModelTransport";
import { safeStorageGet, safeStorageSet } from "@/lib/safeLocalStorage";
import {
  VERTICAL_DRAMA_LOCATION_CAMERA_PRESETS,
  getVerticalDramaLocationCameraViewLabel,
  type VerticalDramaLocationCameraPreset,
  type VerticalDramaLocationCameraView,
  type VerticalDramaLocationCoverageRole,
} from "@shared/verticalDramaSeries/locationAssets";

/* -------------------------------------------------------------------------- */
/* Localized copy                                                             */
/* -------------------------------------------------------------------------- */

type Lang = "th" | "en";
const t = (lang: Lang, th: string, en: string) => (lang === "th" ? th : en);

/* -------------------------------------------------------------------------- */
/* Image-model picker (model-picker parity plan) — mirrors                   */
/* `VerticalDramaCharacterStockPanel.tsx`'s own storage-key + MCP-connection  */
/* localStorage helpers byte-for-byte (duplicated, not imported, per this    */
/* feature's established "duplicate small per-surface helpers" convention).  */
/* -------------------------------------------------------------------------- */

/** Own dedicated localStorage key (deliberately NOT the character tab's own
 *  `smartspec_vd_character_image_model` key) so a user can pick a different
 *  default model per surface — locations and characters have different
 *  cost/quality tradeoffs (e.g. establishing plates rarely need the same
 *  identity-lock fidelity a character portrait does). */
const VD_LOCATION_IMAGE_MODEL_STORAGE_KEY = "smartspec_vd_location_image_model";

/** Shared MCP-connection localStorage key — same key
 *  `VerticalDramaCharacterStockPanel.tsx`/`VerticalDramaEpisodePage.tsx` read/
 *  write, so a connection picked on any surface carries over automatically. */
const MCP_CONNECTION_ID_STORAGE_KEY = "smartspec_mcp_connection_id";

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
 *  `MCP_CONNECTION_ID_STORAGE_KEY` above (shared with
 *  `VerticalDramaCharacterStockPanel.tsx`/`VerticalDramaEpisodePage.tsx`).
 *  Exported (unlike the MCP helpers above) so the storage contract is
 *  directly unit-testable. */
export const HERMES_CONNECTION_ID_STORAGE_KEY =
  "smartspec_hermes_connection_id";

export function readStoredHermesConnectionId(): string | null {
  return safeStorageGet(HERMES_CONNECTION_ID_STORAGE_KEY);
}

export function storeHermesConnectionId(connectionId: string | null): void {
  if (connectionId) {
    safeStorageSet(HERMES_CONNECTION_ID_STORAGE_KEY, connectionId);
  } else {
    safeStorageRemove(HERMES_CONNECTION_ID_STORAGE_KEY);
  }
}

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
  lang: Lang
): string {
  // Feature 135 section-10 review fix: a `[HERMES_X] ...` prefixed message
  // (pinned server wire convention, `shared/hermesMedia.ts`) renders via
  // `presentHermesError`/`formatHermesErrorForToast` instead of leaking the
  // raw bracketed English string; every other message (including an
  // explicit empty string) is unaffected — `presentHermesError` returns
  // `null` for them.
  const presentation = presentHermesError(err ?? null);
  if (presentation) return formatHermesErrorForToast(presentation, lang);
  return err?.message ?? t(lang, "เกิดข้อผิดพลาด", "Something went wrong");
}

/** True when `generateLocationImage`'s `onError` message indicates the
 *  server rejected the request over `selectedImageModelId` — the fail-
 *  closed "no model selected" `BAD_REQUEST` thrown by
 *  `resolveEpisodeImageModelId`/its location-router equivalent (server:
 *  `verticalDramaLocations.ts`), or its sibling "unknown"/"disabled" model
 *  messages. Byte-identical convention to
 *  `VerticalDramaCharacterStockPanel.tsx`'s own
 *  `isImageModelSelectionError`. */
export function isLocationImageModelSelectionError(
  err: { message?: string } | null | undefined
): boolean {
  const message = err?.message ?? "";
  return /เลือกโมเดลภาพ/.test(message) || /image model/i.test(message);
}

/** Bilingual summary toast copy for a `detectLocationsNow` success response —
 *  same "0 gets its own 'nothing found' message" convention as
 *  `VerticalDramaCharacterStockPanel.tsx`'s own
 *  `buildDetectCharacterVariantsSummaryMessage`, since "Created 0, reused 0"
 *  reads like a failure even though the call succeeded. */
export function buildDetectLocationsSummaryMessage(
  lang: Lang,
  result: { locationsCreated: number; locationsReused: number }
): string {
  if (result.locationsCreated === 0 && result.locationsReused === 0) {
    return t(
      lang,
      "ไม่พบฉากใหม่จากเนื้อเรื่องปัจจุบัน",
      "No new locations found in the current story"
    );
  }
  return t(
    lang,
    `สร้างฉากใหม่ ${result.locationsCreated} รายการ, ใช้ฉากเดิม ${result.locationsReused} รายการ`,
    `Created ${result.locationsCreated} location(s), matched ${result.locationsReused} existing`
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
  candidateImageUrl?: string | null
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
export function sortLocationCandidatesForGallery<
  T extends { isPrimary: boolean },
>(assets: T[]): T[] {
  const primary = assets.filter(a => a.isPrimary);
  const rest = assets.filter(a => !a.isPrimary);
  return [...primary, ...rest];
}

const CAMERA_PRESET_LABELS: Record<
  VerticalDramaLocationCameraPreset,
  [string, string]
> = {
  wide_shot: ["Wide Shot", "ภาพกว้าง"],
  extreme_wide_shot: ["Extreme Wide Shot", "ภาพกว้างมาก"],
  eye_level_shot: ["Eye-Level Shot", "ระดับสายตา"],
  low_angle_shot: ["Low Angle Shot", "มุมเงย"],
  high_angle_shot: ["High Angle Shot", "มุมกด"],
  birds_eye_top_down: ["Bird's-Eye / Top-Down", "มุมสูงจากด้านบน"],
  worms_eye_view: ["Worm's-Eye View", "มุมต่ำมาก"],
  over_the_shoulder: ["Over-the-Shoulder", "ข้ามไหล่"],
  point_of_view: ["Point-of-View", "มุมมองตัวละคร"],
  three_quarter_view: ["Three-Quarter View", "สามส่วน"],
  profile_shot: ["Profile Shot", "ด้านข้างโปรไฟล์"],
  front_view: ["Front View", "ด้านหน้า"],
  rear_back_shot: ["Rear / Back Shot", "ด้านหลัง"],
  dutch_angle: ["Dutch Angle", "มุมเอียง"],
  insert_detail_shot: ["Insert / Detail Shot", "ภาพแทรก/รายละเอียด"],
  custom: ["Custom view", "กำหนดเอง"],
};

export function buildLocationCameraView(params: {
  preset?: string | null;
  directive?: string | null;
}): VerticalDramaLocationCameraView | undefined {
  const preset = params.preset?.trim();
  const directive = params.directive?.trim();
  if (!preset && !directive) return undefined;
  const knownPreset =
    preset &&
    (VERTICAL_DRAMA_LOCATION_CAMERA_PRESETS as readonly string[]).includes(
      preset
    )
      ? (preset as VerticalDramaLocationCameraPreset)
      : undefined;
  const presetLabel = knownPreset
    ? CAMERA_PRESET_LABELS[knownPreset][0]
    : undefined;
  const label =
    knownPreset && directive
      ? `${presetLabel} — ${directive}`
      : directive || presetLabel || preset || "Custom view";
  return {
    ...(preset ? { preset } : {}),
    label,
    ...(directive ? { directive } : {}),
  };
}

/**
 * Builds the transport-connection fields for `generateLocationImage`'s
 * mutation input — extracted so the conditional-spread rule is directly
 * unit-testable without mounting the component (Feature 135, section-10
 * §4.4). Mirrors `VerticalDramaCharacterStockPanel.tsx`'s own
 * `buildCharacterPromptConfirmPayload` transport-field rule: `mcpConnectionId`
 * (+ `sharedGroupId`) iff `imageModelUsesMcp && mcpConnectionId`;
 * `hermesConnectionId` iff `imageModelUsesHermes && hermesConnectionId` AND
 * the MCP fields were not emitted (a model row resolves to exactly one
 * transport, so the two are always mutually exclusive in practice — this
 * guard just makes that invariant hold even if a caller passed both flags).
 */
export function buildLocationGenerateImageTransportFields(params: {
  imageModelUsesMcp: boolean;
  mcpConnectionId?: string | null;
  sharedGroupId?: number | null;
  imageModelUsesHermes: boolean;
  hermesConnectionId?: string | null;
}): {
  mcpConnectionId?: string;
  sharedGroupId?: number;
  hermesConnectionId?: string;
} {
  const usesMcp = params.imageModelUsesMcp && Boolean(params.mcpConnectionId);
  return {
    ...(usesMcp ? { mcpConnectionId: params.mcpConnectionId as string } : {}),
    ...(usesMcp && params.sharedGroupId != null
      ? { sharedGroupId: params.sharedGroupId }
      : {}),
    ...(params.imageModelUsesHermes && params.hermesConnectionId && !usesMcp
      ? { hermesConnectionId: params.hermesConnectionId }
      : {}),
  };
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
  slotStatus?: "pending";
  slotReason?: string;
  primaryReferenceUrl?: string;
  primaryReferenceAssetLinkId?: string;
  cameraVariants?: Array<{
    variantId: string;
    label: string;
    role: string;
    url: string;
    approved: boolean;
  }>;
  createdAt: string;
  updatedAt: string;
}

/**
 * One candidate location image for a location, as returned by
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
  role?: string;
  metadata?: Record<string, unknown> | null;
  updatedAt: string;
}

type LocationGenerationMetadata = {
  mode: "text_to_image" | "image_to_image";
  editInstruction?: string;
  sourceAssetLinkId?: string;
  cameraView?: VerticalDramaLocationCameraView;
};

type VdLocationMediaModel = MediaModel & {
  maxReferenceImages?: number;
};

function getLocationModelMaxReferenceImages(
  model: VdLocationMediaModel | undefined
): number | undefined {
  if (!model) return undefined;
  if (typeof model.maxReferenceImages === "number")
    return model.maxReferenceImages;
  const config = model.configJson;
  if (!config || typeof config !== "object" || Array.isArray(config))
    return undefined;
  const record = config as Record<string, unknown>;
  const nested = record.imageCapabilities;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const nestedLimit = (nested as Record<string, unknown>).maxReferenceImages;
    if (typeof nestedLimit === "number") return nestedLimit;
  }
  const limit = record.maxReferenceImages ?? record.referenceImageLimit;
  return typeof limit === "number" ? limit : undefined;
}

type LocationAnalysisSummary = {
  locationsCreated: number;
  locationsReused: number;
  createdLocations?: unknown[];
  reusedLocations?: unknown[];
};

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
  const { requestConfirmation, creditConfirmDialog } =
    useVerticalDramaCreditConfirmation();
  const utils = trpc.useUtils();

  const listQuery = trpc.verticalDramaLocations.list.useQuery(
    { seriesId },
    { enabled: Boolean(seriesId), staleTime: 15_000 }
  );
  const locations = (listQuery.data?.locations ?? []) as VdLocationListItem[];

  const onError = (err: { message?: string }) =>
    toast.error(resolveLocationMutationErrorMessage(err, lang));
  const [locationAnalysisJobId, setLocationAnalysisJobId] = useState<
    string | null
  >(null);
  const [locationAnalysisResult, setLocationAnalysisResult] =
    useState<LocationAnalysisSummary | null>(null);
  const interactiveJobStatusProcedure =
    trpc.verticalDramaSeries.getInteractiveJobStatus;
  const locationAnalysisJobQuery = interactiveJobStatusProcedure?.useQuery(
    {
      jobId: locationAnalysisJobId ?? "00000000-0000-0000-0000-000000000000",
      scopeKey: `series:${seriesId}`,
    },
    {
      enabled: Boolean(locationAnalysisJobId),
      refetchInterval: locationAnalysisJobId ? 2000 : false,
      staleTime: 0,
    }
  ) ?? { data: undefined };
  useEffect(() => {
    const job = locationAnalysisJobQuery.data;
    if (!job || !locationAnalysisJobId) return;
    if (job.status === "succeeded") {
      const result = job.result as LocationAnalysisSummary;
      setLocationAnalysisResult(result);
      setLocationAnalysisJobId(null);
      invalidate();
      toast.success(buildDetectLocationsSummaryMessage(lang, result));
    } else if (job.status === "failed") {
      setLocationAnalysisJobId(null);
      onError({ message: job.error ?? "Location analysis failed" });
    }
  }, [lang, locationAnalysisJobId, locationAnalysisJobQuery.data]);

  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    null
  );
  const [lightboxImage, setLightboxImage] = useState<{
    src: string;
    alt?: string;
  } | null>(null);

  /** Make the view-management UI discoverable on first load. Previously the
   * detail card (including the camera-view selector) stayed hidden until the
   * user guessed that a roster card was clickable. Preserve an explicit close
   * action by only auto-selecting when the current selection is absent or no
   * longer exists. */
  useEffect(() => {
    if (locations.length === 0) {
      setSelectedLocationId(null);
      return;
    }
    setSelectedLocationId(current =>
      current && locations.some(location => location.locationId === current)
        ? current
        : locations[0].locationId
    );
  }, [locations]);

  /** Model picker for the "Generate image" action, mirroring
   *  `VerticalDramaCharacterStockPanel.tsx`'s own model-selector-before-
   *  generate UX (same `ModelSelectorDialog`/`McpConnectionPicker`
   *  components, not new ones). Persisted to localStorage under this panel's
   *  own dedicated key (see `VD_LOCATION_IMAGE_MODEL_STORAGE_KEY` above) so
   *  the user doesn't have to re-pick a model every generate. Unlike the
   *  character tab, an empty selection is never force-blocked here — see
   *  this file's own top-of-file doc comment. */
  const [isModelDialogOpen, setIsModelDialogOpen] = useState(false);
  const [selectedImageModelId, setSelectedImageModelId] = useState(
    () => safeStorageGet(VD_LOCATION_IMAGE_MODEL_STORAGE_KEY) || ""
  );
  const handleSelectImageModel = (modelId: string) => {
    setSelectedImageModelId(modelId);
    safeStorageSet(VD_LOCATION_IMAGE_MODEL_STORAGE_KEY, modelId);
  };
  /** Same toast as `onError`, plus reopens the model-picker dialog when the
   *  server rejected the request specifically for a missing/invalid
   *  `selectedImageModelId` (see `isLocationImageModelSelectionError`). In
   *  normal use `requireModelSelected()` (below) already blocks the click
   *  before `generateMutation` ever fires, so this is a defense-in-depth
   *  path (stale selection, model disabled between pick and generate,
   *  etc.) — never swallows the server's bilingual message. Byte-identical
   *  convention to `VerticalDramaCharacterStockPanel.tsx`'s own
   *  `onImageModelError`. */
  const onImageModelError = (err: { message?: string }) => {
    onError(err);
    if (isLocationImageModelSelectionError(err)) setIsModelDialogOpen(true);
  };
  const imageModelsQuery = trpc.mediaModels.list.useQuery({ type: "image" });
  const imageModels = (imageModelsQuery.data?.models ??
    []) as VdLocationMediaModel[];
  const selectedImageModelRecord = imageModels.find(
    m => m.modelId === selectedImageModelId
  );
  const selectedImageModelMaxReferenceImages =
    getLocationModelMaxReferenceImages(selectedImageModelRecord);
  /** Whether the currently-selected image model is MCP-transport (e.g.
   *  `higgsfield/*`, `magnific-mcp/*`) — byte-identical derivation to
   *  `VerticalDramaCharacterStockPanel.tsx`'s own `imageModelUsesMcp`. */
  const imageModelUsesMcp =
    Boolean(selectedImageModelId) &&
    resolveMediaModelTransportConfig({
      provider: selectedImageModelRecord?.provider,
      modelId: selectedImageModelRecord?.modelId ?? selectedImageModelId,
      configJson: selectedImageModelRecord?.configJson as
        | Record<string, unknown>
        | undefined,
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
  /** Blocks generation client-side with a toast instead of silently falling
   *  back to a server default model — cloned from
   *  `VerticalDramaCharacterStockPanel.tsx`'s own `requireModelSelected()`
   *  (same copy, same "open the picker dialog" follow-up). Called before
   *  `requireMcpConnectionOrToast()` in every generate entry point, matching
   *  the character tab's gate ordering. */
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

  /** Blocks generation client-side with a toast instead of letting the
   *  server throw BAD_REQUEST — same convention as
   *  `VerticalDramaCharacterStockPanel.tsx`'s own
   *  `requireMcpConnectionOrToast`. */
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
   *  above; mutually exclusive with it (a model row resolves to exactly one
   *  transport). */
  const imageModelUsesHermes =
    Boolean(selectedImageModelId) &&
    resolveMediaModelTransportConfig({
      provider: selectedImageModelRecord?.provider,
      modelId: selectedImageModelRecord?.modelId ?? selectedImageModelId,
      configJson: selectedImageModelRecord?.configJson as
        | Record<string, unknown>
        | undefined,
    }).transport === "hermes_worker";
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
  const [editDrafts, setEditDrafts] = useState<
    Record<string, { name: string; description: string }>
  >({});
  const editDraftFor = (
    locationId: string
  ): { name: string; description: string } => {
    const draft = editDrafts[locationId];
    if (draft) return draft;
    const location = locations.find(l => l.locationId === locationId);
    return {
      name: location?.name ?? "",
      description: location?.description ?? "",
    };
  };
  const updateEditDraft = (
    locationId: string,
    patch: Partial<{ name: string; description: string }>
  ) => {
    setEditDrafts(prev => ({
      ...prev,
      [locationId]: { ...editDraftFor(locationId), ...patch },
    }));
  };

  const updateLocationMutation =
    trpc.verticalDramaLocations.updateLocation.useMutation({ onError });

  /** "ตรวจจับฉากตอนนี้" (`detectLocationsNow`) — a real, slow LLM call
   *  (seconds, costs credits), so it's deliberately NOT folded into any
   *  per-card `mutating` flag; its own button carries its own `isPending`
   *  spinner. Byte-identical convention to
   *  `VerticalDramaCharacterStockPanel.tsx`'s own `detectVariantsMutation`. */
  const detectLocationsMutation =
    trpc.verticalDramaLocations.detectLocationsNow.useMutation({
      onSuccess: res => {
        if ("jobId" in res) {
          setLocationAnalysisJobId(res.jobId);
          return;
        }
        const completed = res as LocationAnalysisSummary;
        setLocationAnalysisResult(completed);
        invalidate();
        toast.success(buildDetectLocationsSummaryMessage(lang, completed));
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
      {
        seriesId,
        locationId: location.locationId,
        name,
        description: draft.description,
      },
      {
        onSuccess: () => {
          setEditDrafts(prev => {
            const next = { ...prev };
            delete next[location.locationId];
            return next;
          });
          invalidate();
          toast.success(t(lang, "บันทึกแล้ว", "Saved"));
        },
      }
    );
  };

  /* ---- Generate/approve establishing-plate flow — the EXACT 4-mutation ----
   * approve-gated flow `VerticalDramaLocationsBibleCard` ships (preview ->
   * generate -> poll -> explicit approve), keyed by `locationId` directly
   * (simpler than that card's `locationKey` join — this panel reads straight
   * off the roster, no storyboard `distinct_locations` join needed). */
  const previewMutation =
    trpc.verticalDramaLocations.previewLocationPrompt.useMutation({ onError });
  const generateMutation =
    trpc.verticalDramaLocations.generateLocationImage.useMutation({
      onError: onImageModelError,
    });
  // No hook-level `onError` on the resolve/link/approve trio — all three are
  // only ever awaited inside `handleApprove`'s own try/catch below, which
  // already surfaces exactly one toast on failure; a hook-level `onError`
  // here would double-toast the same failure (same convention as
  // `VerticalDramaLocationsBibleCard`).
  const resolveMutation =
    trpc.verticalDramaLocations.resolveMediaAssetForImport.useMutation();
  const linkMutation = trpc.verticalDramaLocations.linkAsset.useMutation();
  const approveMutation =
    trpc.verticalDramaLocations.approveAsset.useMutation();

  const [previewByLocationId, setPreviewByLocationId] = useState<
    Record<
      string,
      {
        prompt: string;
        coverageRole?: VerticalDramaLocationCoverageRole;
        cameraView?: VerticalDramaLocationCameraView;
      }
    >
  >({});
  const [coverageRoleByLocationId, setCoverageRoleByLocationId] = useState<
    Record<string, VerticalDramaLocationCoverageRole>
  >({});
  const [cameraPresetByLocationId, setCameraPresetByLocationId] = useState<
    Record<string, string>
  >({});
  const [cameraDirectiveByLocationId, setCameraDirectiveByLocationId] =
    useState<Record<string, string>>({});
  const [pendingPreviewLocationId, setPendingPreviewLocationId] = useState<
    string | null
  >(null);
  const [renderingLocationId, setRenderingLocationId] = useState<string | null>(
    null
  );
  const [candidateByLocationId, setCandidateByLocationId] = useState<
    Record<string, { imageUrl: string; approving?: boolean }>
  >({});
  const [generationMetadataByLocationId, setGenerationMetadataByLocationId] =
    useState<Record<string, LocationGenerationMetadata>>({});
  const [editInstructionByLocationId, setEditInstructionByLocationId] =
    useState<Record<string, string>>({});
  /** `locationId` -> `assetLinkId` for a reference approved THIS session —
   *  the only source of a manageable `assetLinkId` until the backend's
   *  `list` DTO carries `primaryReferenceAssetLinkId` for pre-existing
   *  approved references (see `VdLocationListItem`'s own doc comment). */
  const [approvedAssetLinkByLocationId, setApprovedAssetLinkByLocationId] =
    useState<Record<string, string>>({});

  /** Poll a submitted location-image render task to completion — same
   *  `utils.media.getTask.fetch` loop shape (120 attempts, 2.5s interval) as
   *  `VerticalDramaLocationsBibleCard`'s own `pollLocationImageTask`. */
  async function pollLocationImageTask(
    taskId: string,
    locationId: string,
    generationMetadata: LocationGenerationMetadata
  ) {
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
                "สร้างภาพสำเร็จแต่ไม่พบ URL ผลลัพธ์",
                "Generation completed but no result URL."
              )
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
          setCandidateByLocationId(prev => ({
            ...prev,
            [locationId]: { imageUrl: resultUrl },
          }));
          await persistGeneratedLocationImage(
            locationId,
            resultUrl,
            generationMetadata
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
          // was a hermes_ task; every other/legacy task keeps the exact
          // pre-existing bilingual "<generic>: <errorMessage>" format.
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
        await new Promise(resolve => setTimeout(resolve, 2500));
      }
      toast.error(
        t(
          lang,
          "สร้างภาพใช้เวลานานเกินไป ลองตรวจสอบภายหลัง",
          "Generation is taking too long — check back later."
        )
      );
    } finally {
      setRenderingLocationId(current =>
        current === locationId ? null : current
      );
    }
  }

  const handlePreview = (location: VdLocationListItem) => {
    const coverageRole = coverageRoleByLocationId[location.locationId];
    const cameraView = buildLocationCameraView({
      preset: cameraPresetByLocationId[location.locationId],
      directive: cameraDirectiveByLocationId[location.locationId],
    });
    if (cameraView?.preset === "custom" && !cameraView.directive) {
      toast.error(
        t(
          lang,
          "กรุณาระบุรายละเอียดมุมกล้องแบบกำหนดเอง",
          "Describe the custom camera view first"
        )
      );
      return;
    }
    requestConfirmation({
      title: t(
        lang,
        "ยืนยันสร้าง prompt สถานที่",
        "Confirm location prompt generation"
      ),
      description: t(
        lang,
        "การทำงานนี้ใช้ AI เพื่อสร้าง prompt และอาจหักเครดิต ต้องการดำเนินการต่อหรือไม่?",
        "This uses AI to generate a location prompt and may spend credits. Continue?"
      ),
      confirmLabel: t(lang, "สร้าง prompt", "Generate prompt"),
      cancelLabel: t(lang, "ยกเลิก", "Cancel"),
      testId: `vd-credit-confirm-location-prompt-${location.locationId}`,
      onConfirm: () => {
        setPendingPreviewLocationId(location.locationId);
        previewMutation.mutate(
          {
            seriesId,
            locationId: location.locationId,
            ...(coverageRole ? { coverageRole } : {}),
            ...(cameraView ? { cameraView } : {}),
            ...(selectedImageModelId ? { selectedImageModelId } : {}),
          },
          {
            onSuccess: res => {
              setPreviewByLocationId(prev => ({
                ...prev,
                [location.locationId]: {
                  prompt: res.establishingPlatePrompt,
                  ...(coverageRole ? { coverageRole } : {}),
                  ...(cameraView ? { cameraView } : {}),
                },
              }));
              setPendingPreviewLocationId(null);
            },
            onError: () => setPendingPreviewLocationId(null),
          }
        );
      },
    });
  };

  const handleGenerate = (location: VdLocationListItem) => {
    const preview = previewByLocationId[location.locationId];
    if (!preview) return;
    if (!requireModelSelected()) return;
    if (!requireMcpConnectionOrToast()) return;
    if (!requireHermesConnectionOrToast()) return;
    requestConfirmation({
      title: t(
        lang,
        "ยืนยันสร้างภาพสถานที่",
        "Confirm location image generation"
      ),
      description: t(
        lang,
        "การทำงานนี้จะสร้างภาพสถานที่ด้วย AI และมีค่าใช้จ่ายเครดิต ต้องการดำเนินการต่อหรือไม่?",
        "This generates a location image with AI and spends credits. Continue?"
      ),
      confirmLabel: t(lang, "สร้างภาพ", "Generate image"),
      cancelLabel: t(lang, "ยกเลิก", "Cancel"),
      testId: `vd-credit-confirm-location-image-${location.locationId}`,
      onConfirm: () => {
        setRenderingLocationId(location.locationId);
        const generationMetadata: LocationGenerationMetadata = {
          mode: "text_to_image",
          ...(preview.cameraView ? { cameraView: preview.cameraView } : {}),
        };
        setGenerationMetadataByLocationId(prev => ({
          ...prev,
          [location.locationId]: generationMetadata,
        }));
        generateMutation.mutate(
          {
            seriesId,
            locationId: location.locationId,
            approvedPrompt: preview.prompt,
            ...(preview.coverageRole
              ? { coverageRole: preview.coverageRole }
              : {}),
            ...(preview.cameraView ? { cameraView: preview.cameraView } : {}),
            // Always sent (never conditionally spread) — the server now
            // REJECTS image generation without an explicit
            // `selectedImageModelId` (fail-closed, no more silent
            // `DEFAULT_MODELS.image` fallback). Safe to assert non-empty here:
            // `requireModelSelected()` above already returned early when it was
            // blank.
            selectedImageModelId,
            ...buildLocationGenerateImageTransportFields({
              imageModelUsesMcp,
              mcpConnectionId,
              sharedGroupId: mcpSharedGroupId,
              imageModelUsesHermes,
              hermesConnectionId,
            }),
          },
          {
            onSuccess: res =>
              void pollLocationImageTask(
                res.taskId,
                location.locationId,
                generationMetadata
              ),
            onError: () =>
              setRenderingLocationId(current =>
                current === location.locationId ? null : current
              ),
          }
        );
      },
    });
  };

  const handleEditExistingImage = (location: VdLocationListItem) => {
    const editInstruction =
      editInstructionByLocationId[location.locationId]?.trim();
    if (!editInstruction) {
      toast.error(
        t(
          lang,
          "กรุณาระบุสิ่งที่ต้องการแก้ไขภาพ",
          "Describe what should be changed in the image"
        )
      );
      return;
    }
    if (
      !location.primaryReferenceAssetLinkId ||
      !location.primaryReferenceUrl
    ) {
      toast.error(
        t(
          lang,
          "ไม่พบภาพหลักหรือรหัสภาพหลัก กรุณารีเฟรชข้อมูลสถานที่ก่อนแก้ไขภาพ",
          "The primary image or its asset link is unavailable. Refresh the location data before editing."
        )
      );
      return;
    }
    if (!requireModelSelected()) return;
    if (!requireMcpConnectionOrToast()) return;
    if (!requireHermesConnectionOrToast()) return;
    const cameraView = buildLocationCameraView({
      preset: cameraPresetByLocationId[location.locationId],
      directive: cameraDirectiveByLocationId[location.locationId],
    });
    if (cameraView?.preset === "custom" && !cameraView.directive) {
      toast.error(
        t(
          lang,
          "กรุณาระบุรายละเอียดมุมกล้องแบบกำหนดเอง",
          "Describe the custom camera view first"
        )
      );
      return;
    }
    const generationMetadata: LocationGenerationMetadata = {
      mode: "image_to_image",
      editInstruction,
      sourceAssetLinkId: location.primaryReferenceAssetLinkId,
      ...(cameraView ? { cameraView } : {}),
    };
    requestConfirmation({
      title: t(lang, "ยืนยันแก้ไขภาพเดิม", "Confirm existing-image edit"),
      description: t(
        lang,
        "ระบบจะใช้ภาพหลักเดิมเป็นภาพอ้างอิงและสร้างภาพผู้สมัครใหม่ โดยจะไม่เปลี่ยนภาพหลักจนกว่าคุณจะเลือกเอง",
        "The current primary image will be used as the reference and a new candidate will be created. The primary image will not change until you choose it."
      ),
      confirmLabel: t(lang, "แก้ไขภาพด้วย AI", "Edit image with AI"),
      cancelLabel: t(lang, "ยกเลิก", "Cancel"),
      testId: `vd-credit-confirm-location-image-edit-${location.locationId}`,
      onConfirm: () => {
        setRenderingLocationId(location.locationId);
        setGenerationMetadataByLocationId(prev => ({
          ...prev,
          [location.locationId]: generationMetadata,
        }));
        generateMutation.mutate(
          {
            seriesId,
            locationId: location.locationId,
            editInstruction,
            selectedImageModelId,
            ...(cameraView ? { cameraView } : {}),
            ...buildLocationGenerateImageTransportFields({
              imageModelUsesMcp,
              mcpConnectionId,
              sharedGroupId: mcpSharedGroupId,
              imageModelUsesHermes,
              hermesConnectionId,
            }),
          },
          {
            onSuccess: res =>
              void pollLocationImageTask(
                res.taskId,
                location.locationId,
                generationMetadata
              ),
            onError: () =>
              setRenderingLocationId(current =>
                current === location.locationId ? null : current
              ),
          }
        );
      },
    });
  };

  /** The persist chain: import the rendered URL into the media_assets
   *  library, link it as this location's establishing-plate asset, and
   *  approve it — the exact steps that make a generated image durable. Shared
   *  by the automatic post-generation persist (`pollLocationImageTask`) and
   *  the manual "approve" retry button (`handleApprove`). Marks the candidate
   *  `approving` for the button spinner; on success clears the candidate +
   *  preview and refreshes the roster/gallery; on failure leaves the
   *  candidate in place so the manual button can retry. Never throws. */
  const persistGeneratedLocationImage = async (
    locationId: string,
    imageUrl: string,
    generationMetadata?: LocationGenerationMetadata
  ): Promise<void> => {
    setCandidateByLocationId(prev => ({
      ...prev,
      [locationId]: { imageUrl, approving: true },
    }));
    try {
      const resolved = await resolveMutation.mutateAsync({
        seriesId,
        source: "url",
        url: imageUrl,
        mimeType: guessLocationImageMimeTypeFromUrl(imageUrl),
      });
      const metadata = {
        generationMode: generationMetadata?.mode ?? "text_to_image",
        ...(generationMetadata?.editInstruction
          ? { editInstruction: generationMetadata.editInstruction }
          : {}),
        ...(generationMetadata?.sourceAssetLinkId
          ? { sourceAssetLinkId: generationMetadata.sourceAssetLinkId }
          : {}),
        ...(generationMetadata?.cameraView
          ? { cameraView: generationMetadata.cameraView }
          : {}),
        ...(previewByLocationId[locationId]?.cameraView
          ? { cameraView: previewByLocationId[locationId].cameraView }
          : {}),
      };
      const linked = await linkMutation.mutateAsync({
        seriesId,
        locationId,
        mediaAssetId: resolved.mediaAssetId,
        assetType: "location_reference",
        role:
          previewByLocationId[locationId]?.coverageRole ??
          (previewByLocationId[locationId]?.cameraView
            ? "other"
            : "establishing_plate"),
        source: "generated",
        metadata,
        ...(generationMetadata?.sourceAssetLinkId
          ? { preservePrimaryAssetLinkId: generationMetadata.sourceAssetLinkId }
          : {}),
      });
      await approveMutation.mutateAsync({
        seriesId,
        assetLinkId: linked.asset.assetLinkId,
      });
      setApprovedAssetLinkByLocationId(prev => ({
        ...prev,
        [locationId]: linked.asset.assetLinkId,
      }));
      setCandidateByLocationId(prev => {
        const next = { ...prev };
        delete next[locationId];
        return next;
      });
      setPreviewByLocationId(prev => {
        const next = { ...prev };
        delete next[locationId];
        return next;
      });
      setGenerationMetadataByLocationId(prev => {
        const next = { ...prev };
        delete next[locationId];
        return next;
      });
      setEditInstructionByLocationId(prev => {
        const next = { ...prev };
        delete next[locationId];
        return next;
      });
      invalidate();
      void utils.verticalDramaLocations.listLocationAssets.invalidate({
        seriesId,
        locationId,
      });
      toast.success(
        t(lang, "บันทึกภาพสถานที่แล้ว", "Location reference saved")
      );
    } catch (err) {
      // Persist failed — keep the candidate visible with the manual "approve"
      // button as a retry (the paid render is NOT lost, it's still the
      // candidate URL), and surface why.
      toast.error(
        err instanceof Error
          ? err.message
          : t(lang, "บันทึกภาพไม่สำเร็จ", "Failed to save image")
      );
      setCandidateByLocationId(prev => ({
        ...prev,
        [locationId]: { imageUrl, approving: false },
      }));
    }
  };

  const handleApprove = async (location: VdLocationListItem) => {
    const candidate = candidateByLocationId[location.locationId];
    if (!candidate) return;
    await persistGeneratedLocationImage(
      location.locationId,
      candidate.imageUrl,
      generationMetadataByLocationId[location.locationId]
    );
  };

  /* ---- Basic asset management (delete / reject / mark stale) ----
   * Only usable once an `assetLinkId` is resolvable — either from THIS
   * session's own approve flow above, or (once the backend adds it) the
   * roster row's own `primaryReferenceAssetLinkId` — see
   * `VdLocationListItem`'s own doc comment. */
  const resolveAssetLinkId = (
    location: VdLocationListItem
  ): string | undefined =>
    approvedAssetLinkByLocationId[location.locationId] ??
    location.primaryReferenceAssetLinkId;

  const clearLocationSessionState = (locationId: string) => {
    setCandidateByLocationId(prev => {
      const next = { ...prev };
      delete next[locationId];
      return next;
    });
    setPreviewByLocationId(prev => {
      const next = { ...prev };
      delete next[locationId];
      return next;
    });
    setApprovedAssetLinkByLocationId(prev => {
      const next = { ...prev };
      delete next[locationId];
      return next;
    });
    setGenerationMetadataByLocationId(prev => {
      const next = { ...prev };
      delete next[locationId];
      return next;
    });
    setEditInstructionByLocationId(prev => {
      const next = { ...prev };
      delete next[locationId];
      return next;
    });
  };

  const transitionAssetMutation =
    trpc.verticalDramaLocations.transitionAsset.useMutation({ onError });
  const markStaleMutation = trpc.verticalDramaLocations.markStale.useMutation({
    onError,
  });
  const deleteAssetMutation =
    trpc.verticalDramaLocations.deleteAsset.useMutation({ onError });
  const [confirmingDeleteLocationId, setConfirmingDeleteLocationId] = useState<
    string | null
  >(null);

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
    {
      enabled: Boolean(seriesId) && Boolean(selectedLocationId),
      staleTime: 10_000,
    }
  );
  const candidatesForSelected = sortLocationCandidatesForGallery(
    (assetsQuery.data?.assets ?? []) as VdLocationAssetCandidate[]
  );

  const setPrimaryMutation =
    trpc.verticalDramaLocations.setPrimaryLocationAsset.useMutation({
      onError,
    });
  const handleSetPrimary = (
    location: VdLocationListItem,
    candidate: VdLocationAssetCandidate
  ) => {
    if (candidate.isPrimary) return;
    setPrimaryMutation.mutate(
      {
        seriesId,
        locationId: location.locationId,
        assetLinkId: candidate.assetLinkId,
      },
      {
        onSuccess: () => {
          invalidate();
          toast.success(
            t(lang, "ตั้งเป็นภาพหลักแล้ว", "Set as primary reference")
          );
        },
      }
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
      }
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
      }
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
      }
    );
  };

  const selectedLocation =
    locations.find(l => l.locationId === selectedLocationId) ?? null;
  const candidateForSelected = selectedLocation
    ? candidateByLocationId[selectedLocation.locationId]
    : undefined;
  const previewForSelected = selectedLocation
    ? previewByLocationId[selectedLocation.locationId]
    : undefined;
  const isRenderingSelected = selectedLocation
    ? renderingLocationId === selectedLocation.locationId
    : false;
  const isPreviewLoadingSelected = selectedLocation
    ? pendingPreviewLocationId === selectedLocation.locationId
    : false;
  const detailThumbnailUrl = selectedLocation
    ? resolveLocationCardThumbnailUrl(
        selectedLocation,
        candidateForSelected?.imageUrl
      )
    : null;
  const detailHasApprovedReference = Boolean(
    selectedLocation?.primaryReferenceUrl
  );
  const resolvedAssetLinkIdForSelected = selectedLocation
    ? resolveAssetLinkId(selectedLocation)
    : undefined;

  if (listQuery.isLoading) {
    return (
      <div
        className={cn(
          "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3",
          className
        )}
        aria-busy="true"
      >
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  // Fatal only on a FIRST-load failure — same guard as
  // `VerticalDramaCharacterStockPanel`; cached locations stay renderable when
  // a background refetch fails.
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
              t(lang, "โหลดสถานที่ไม่สำเร็จ", "Failed to load locations")}
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
      {creditConfirmDialog}
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
                "Scans the current story for new locations (real LLM call, may take a moment)"
              )}
              onClick={() =>
                requestConfirmation({
                  title: t(
                    lang,
                    "ยืนยันตรวจจับสถานที่",
                    "Confirm location detection"
                  ),
                  description: t(
                    lang,
                    "การทำงานนี้ใช้ LLM วิเคราะห์เรื่องและอาจหักเครดิต ต้องการดำเนินการต่อหรือไม่?",
                    "This uses an LLM to analyze the story and may spend credits. Continue?"
                  ),
                  confirmLabel: t(lang, "เริ่มตรวจจับ", "Start detection"),
                  cancelLabel: t(lang, "ยกเลิก", "Cancel"),
                  testId: "vd-credit-confirm-detect-locations",
                  onConfirm: () => detectLocationsMutation.mutate({ seriesId }),
                })
              }
              data-testid="vd-location-detect-now"
            >
              {detectLocationsMutation.isPending ? (
                <Loader2
                  aria-hidden="true"
                  className="h-3.5 w-3.5 animate-spin"
                />
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
          <CardTitle className="text-sm">
            {t(lang, "รายชื่อสถานที่", "Location roster")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3">
          {locations.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">
              {t(
                lang,
                "ยังไม่มีสถานที่ — สถานที่จะถูกสร้างจากข้อมูลตอนสร้างซีรีย์ หรือจากเนื้อเรื่องที่สร้างขึ้น",
                "No locations yet — locations are seeded when the series is created, or generated from the story."
              )}
            </p>
          ) : (
            <ul
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
              aria-label={t(lang, "รายชื่อสถานที่", "Location list")}
            >
              {locations.map(location => {
                const active = location.locationId === selectedLocationId;
                const candidate = candidateByLocationId[location.locationId];
                const thumbnailUrl = resolveLocationCardThumbnailUrl(
                  location,
                  candidate?.imageUrl
                );
                return (
                  <li key={location.locationId}>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedLocationId(location.locationId)
                        }
                        className={cn(
                          "flex w-full flex-col gap-2 rounded-lg border p-2.5 text-left transition-colors",
                          active
                            ? "border-purple-400 bg-purple-50/60 ring-2 ring-purple-100 dark:bg-purple-950/20"
                            : "border-border hover:border-muted-foreground/40"
                        )}
                        data-testid={`vd-location-card-${location.locationId}`}
                      >
                        <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-muted/30">
                          {thumbnailUrl ? (
                            <AuthenticatedMediaImage
                              src={thumbnailUrl}
                              alt={location.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <MapPin
                              aria-hidden="true"
                              className="h-6 w-6 text-muted-foreground"
                            />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {location.name}
                          </p>
                          {location.description ? (
                            <p className="line-clamp-2 text-xs text-muted-foreground">
                              {location.description}
                            </p>
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
                        {location.slotStatus === "pending" ? (
                          <Badge variant="secondary" className="w-fit text-[9px]">
                            {t(lang, "รอสร้างภาพฉากจาก Tie-in", "Tie-in scene slot pending")}
                          </Badge>
                        ) : null}
                        {location.cameraVariants?.length ? (
                          <div
                            className="flex items-center gap-1.5"
                            data-testid={`vd-location-card-variants-${location.locationId}`}
                          >
                            <span className="text-[10px] font-medium text-sky-700 dark:text-sky-300">
                              {t(
                                lang,
                                `มุมย่อย ${location.cameraVariants.length} มุม`,
                                `${location.cameraVariants.length} reusable views`
                              )}
                            </span>
                            <span className="flex -space-x-1">
                              {location.cameraVariants
                                .slice(0, 4)
                                .map(variant => (
                                  <AuthenticatedMediaImage
                                    key={variant.variantId}
                                    src={variant.url}
                                    alt={variant.label}
                                    title={variant.label}
                                    className="h-6 w-8 rounded border-2 border-background object-cover"
                                  />
                                ))}
                            </span>
                          </div>
                        ) : null}
                        <span
                          className={cn(
                            "flex items-center gap-1 text-[10px] font-medium",
                            active
                              ? "text-purple-700 dark:text-purple-300"
                              : "text-sky-700 dark:text-sky-300"
                          )}
                        >
                          <Camera aria-hidden="true" className="h-3 w-3" />
                          {active
                            ? t(
                                lang,
                                "กำลังจัดการมุมมองด้านล่าง",
                                "View manager opened below"
                              )
                            : t(
                                lang,
                                "กดเพื่อดู/เพิ่มมุมมองสถานที่",
                                "Select to view/add location angles"
                              )}
                        </span>
                      </button>
                      {thumbnailUrl ? (
                        <button
                          type="button"
                          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white shadow-sm hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                          onClick={() =>
                            setLightboxImage({
                              src: thumbnailUrl,
                              alt: location.name,
                            })
                          }
                          aria-label={t(
                            lang,
                            `ดูภาพขยายของ ${location.name}`,
                            `View full-size image of ${location.name}`
                          )}
                          title={t(lang, "ขยายภาพเต็มจอ", "Open full screen")}
                          data-testid={`vd-location-card-fullscreen-${location.locationId}`}
                        >
                          <Expand aria-hidden="true" className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
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
            <CardTitle className="text-sm">
              {t(lang, "รายละเอียดสถานที่", "Location detail")}
            </CardTitle>
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
          <div
            className="mx-3 mb-1 flex flex-col gap-1 rounded-md border border-sky-200 bg-sky-50/70 px-3 py-2 dark:border-sky-900 dark:bg-sky-950/20"
            data-testid={`vd-location-view-manager-${selectedLocation.locationId}`}
          >
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-sky-900 dark:text-sky-100">
              <Camera aria-hidden="true" className="h-4 w-4" />
              {t(lang, "มุมมองของสถานที่", "Location camera views")}
              <Badge variant="outline" className="text-[10px]">
                {t(lang, "ภาพหลัก + มุมเพิ่มเติม", "Primary + coverage views")}
              </Badge>
            </div>
            <p className="text-[11px] text-sky-800/80 dark:text-sky-200/80">
              {t(
                lang,
                "เลือกมุมมาตรฐานหรือกำหนดจุดมองเฉพาะสถานที่ แล้วสร้างภาพเพิ่ม ภาพทั้งหมดจะถูกเก็บไว้กับสถานที่เดียวกันและเลือกใช้ใน storyboard ได้",
                "Choose a standard camera grammar or describe a location-specific viewpoint, then generate an additional image. All views stay attached to this location and can be selected in the storyboard."
              )}
            </p>
          </div>
          <CardContent className="flex flex-col gap-4 p-3 sm:flex-row sm:items-start">
            <div className="flex h-32 w-full shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-muted/30 sm:w-56">
              {detailThumbnailUrl ? (
                <button
                  type="button"
                  className="block h-full w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
                  onClick={() =>
                    setLightboxImage({
                      src: detailThumbnailUrl,
                      alt: selectedLocation.name,
                    })
                  }
                  aria-label={t(
                    lang,
                    `ดูภาพขยายของ ${selectedLocation.name}`,
                    `View full-size image of ${selectedLocation.name}`
                  )}
                >
                  <AuthenticatedMediaImage
                    src={detailThumbnailUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </button>
              ) : (
                <MapPin
                  aria-hidden="true"
                  className="h-8 w-8 text-muted-foreground"
                />
              )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <div className="grid gap-1.5">
                <Label
                  htmlFor="vd-location-name"
                  className="text-xs font-medium text-muted-foreground"
                >
                  {t(lang, "ชื่อสถานที่", "Location name")}
                </Label>
                <Input
                  id="vd-location-name"
                  value={editDraftFor(selectedLocation.locationId).name}
                  onChange={e =>
                    updateEditDraft(selectedLocation.locationId, {
                      name: e.target.value,
                    })
                  }
                  disabled={readOnly}
                />
              </div>
              <div className="grid gap-1.5">
                <Label
                  htmlFor="vd-location-description"
                  className="text-xs font-medium text-muted-foreground"
                >
                  {t(lang, "คำอธิบาย", "Description")}
                </Label>
                <Textarea
                  id="vd-location-description"
                  rows={3}
                  value={editDraftFor(selectedLocation.locationId).description}
                  onChange={e =>
                    updateEditDraft(selectedLocation.locationId, {
                      description: e.target.value,
                    })
                  }
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
                    <Loader2
                      aria-hidden="true"
                      className="h-3.5 w-3.5 animate-spin"
                    />
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
                      `คลังภาพฉาก — ภาพหลักและมุมย่อย (${candidatesForSelected.length})`,
                      `Scene image library — primary and reusable views (${candidatesForSelected.length})`
                    )}
                  </span>
                  <div className="flex flex-wrap items-start gap-2">
                    {candidatesForSelected.map(candidate => (
                      <button
                        key={candidate.assetLinkId}
                        type="button"
                        disabled={
                          readOnly ||
                          candidate.isPrimary ||
                          candidate.role !== "establishing_plate" ||
                          setPrimaryMutation.isPending
                        }
                        aria-pressed={candidate.isPrimary}
                        aria-label={
                          candidate.isPrimary
                            ? t(
                                lang,
                                "ภาพหลักปัจจุบัน",
                                "Current primary image"
                              )
                            : candidate.role !== "establishing_plate"
                              ? t(
                                  lang,
                                  "ภาพ coverage (เลือกเป็นภาพหลักไม่ได้)",
                                  "Coverage image (not primary)"
                                )
                              : t(
                                  lang,
                                  "ตั้งเป็นภาพหลัก",
                                  "Set as primary image"
                                )
                        }
                        className={cn(
                          "flex flex-col items-center gap-0.5",
                          readOnly ||
                            candidate.isPrimary ||
                            candidate.role !== "establishing_plate"
                            ? "cursor-default"
                            : "cursor-pointer"
                        )}
                        onClick={() =>
                          handleSetPrimary(selectedLocation, candidate)
                        }
                        data-testid={`vd-location-candidate-${candidate.assetLinkId}`}
                      >
                        <span className="relative block">
                          <AuthenticatedMediaImage
                            src={candidate.url}
                            alt=""
                            className={cn(
                              "h-14 w-14 rounded border border-border object-cover",
                              candidate.isPrimary &&
                                "border-emerald-400 ring-2 ring-emerald-300"
                            )}
                          />
                          {candidate.isPrimary && (
                            <span className="absolute -right-1 -top-1 rounded-full bg-emerald-500 p-0.5 text-white">
                              <Check
                                aria-hidden="true"
                                className="h-2.5 w-2.5"
                              />
                            </span>
                          )}
                        </span>
                        {!candidate.approved && (
                          <span className="text-[9px] text-muted-foreground">
                            {t(lang, "รอตรวจสอบ", "Pending")}
                          </span>
                        )}
                        {candidate.role &&
                        candidate.role !== "establishing_plate" ? (
                          <span className="text-[9px] text-sky-700 dark:text-sky-300">
                            {getVerticalDramaLocationCameraViewLabel({
                              role: candidate.role,
                              metadata: candidate.metadata,
                            })}
                          </span>
                        ) : null}
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
                  <div className="flex flex-wrap items-center gap-2">
                    <Label
                      htmlFor={`vd-location-camera-role-${selectedLocation.locationId}`}
                      className="text-xs text-muted-foreground"
                    >
                      {t(lang, "มุมกล้องของสถานที่", "Location camera view")}
                    </Label>
                    <select
                      id={`vd-location-camera-role-${selectedLocation.locationId}`}
                      value={
                        coverageRoleByLocationId[selectedLocation.locationId] ??
                        cameraPresetByLocationId[selectedLocation.locationId] ??
                        ""
                      }
                      onChange={event => {
                        const value = event.target.value;
                        const legacyRole = [
                          "reverse_angle",
                          "side_angle",
                          "detail_corner",
                        ].includes(value);
                        setCoverageRoleByLocationId(prev => {
                          const next = { ...prev };
                          if (legacyRole)
                            next[selectedLocation.locationId] =
                              value as VerticalDramaLocationCoverageRole;
                          else delete next[selectedLocation.locationId];
                          return next;
                        });
                        setCameraPresetByLocationId(prev => {
                          const next = { ...prev };
                          if (!legacyRole && value)
                            next[selectedLocation.locationId] = value;
                          else delete next[selectedLocation.locationId];
                          return next;
                        });
                        if (legacyRole || !value) {
                          setCameraDirectiveByLocationId(prev => {
                            const next = { ...prev };
                            delete next[selectedLocation.locationId];
                            return next;
                          });
                        }
                        setPreviewByLocationId(prev => {
                          const next = { ...prev };
                          delete next[selectedLocation.locationId];
                          return next;
                        });
                      }}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                      data-testid={`vd-location-camera-role-${selectedLocation.locationId}`}
                    >
                      <option value="">
                        {t(
                          lang,
                          "ภาพหลัก / มุมสร้างบริบท",
                          "Primary / establishing"
                        )}
                      </option>
                      <option value="reverse_angle">
                        {t(lang, "มุมย้อน / Reverse view", "Reverse view")}
                      </option>
                      <option value="side_angle">
                        {t(lang, "มุมด้านข้าง / Lateral view", "Lateral view")}
                      </option>
                      <option value="detail_corner">
                        {t(lang, "มุมรายละเอียด / Detail view", "Detail view")}
                      </option>
                      <optgroup
                        label={t(
                          lang,
                          "มุมกล้องมาตรฐาน",
                          "Standard camera grammar"
                        )}
                      >
                        {VERTICAL_DRAMA_LOCATION_CAMERA_PRESETS.filter(
                          preset => preset !== "custom"
                        ).map(preset => (
                          <option key={preset} value={preset}>
                            {
                              CAMERA_PRESET_LABELS[preset][
                                lang === "th" ? 1 : 0
                              ]
                            }
                          </option>
                        ))}
                      </optgroup>
                      <option value="custom">
                        {t(lang, "กำหนดเอง / Custom view", "Custom view")}
                      </option>
                    </select>
                    {cameraPresetByLocationId[selectedLocation.locationId] ? (
                      <Input
                        value={
                          cameraDirectiveByLocationId[
                            selectedLocation.locationId
                          ] ?? ""
                        }
                        onChange={event => {
                          const directive = event.target.value;
                          setCameraDirectiveByLocationId(prev => ({
                            ...prev,
                            [selectedLocation.locationId]: directive,
                          }));
                          setPreviewByLocationId(prev => {
                            const next = { ...prev };
                            delete next[selectedLocation.locationId];
                            return next;
                          });
                        }}
                        placeholder={t(
                          lang,
                          "ระบุจุด/ทิศ/องค์ประกอบ เช่น โต๊ะริมหน้าต่าง หรือใต้น้ำเหนือปะการัง",
                          "Describe the place-specific view, e.g. table by the window or underwater above the coral"
                        )}
                        className="min-w-64 flex-1 text-xs"
                        maxLength={1000}
                        aria-label={t(
                          lang,
                          "รายละเอียดมุมกล้องเฉพาะสถานที่",
                          "Location-specific camera directive"
                        )}
                        data-testid={`vd-location-camera-directive-${selectedLocation.locationId}`}
                      />
                    ) : null}
                  </div>
                  {/* Image-model picker (model-picker parity plan) — shown
                      above every generate-flow state (fresh/preview/candidate)
                      so the model (and its per-model credit cost, shown inside
                      the dialog) is visible BEFORE the paid "Generate image"
                      step below, mirroring where the character tab surfaces
                      its own picker relative to its generate button. */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => setIsModelDialogOpen(true)}
                      data-testid={`vd-location-choose-model-${selectedLocation.locationId}`}
                    >
                      <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
                      {selectedImageModelId
                        ? `${t(lang, "โมเดล", "Model")}: ${selectedImageModelRecord?.name ?? selectedImageModelId}`
                        : t(lang, "เลือกโมเดลสร้างภาพ", "Choose image model")}
                    </Button>
                  </div>

                  {!selectedImageModelId && (
                    /* Explicit "you must pick a model" notice — the
                      generate button below is already disabled with a
                      hover tooltip, but that alone was too subtle
                      (product feedback 2026-07-15). Additive, not a
                      replacement for the disabled-button guard. */
                    <div
                      className="flex flex-wrap items-center gap-2 rounded-md border border-amber-400/60 bg-amber-50 px-2.5 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                      data-testid={`vd-location-image-model-required-notice-${selectedLocation.locationId}`}
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

                  {imageModelUsesMcp && (
                    <McpConnectionPicker
                      value={mcpConnectionId}
                      onChange={handleSelectMcpConnection}
                      sharedGroupId={mcpSharedGroupId}
                      onSharedGroupChange={setMcpSharedGroupId}
                      assetType="image"
                      providerKey={
                        resolveMediaModelTransportConfig({
                          provider: selectedImageModelRecord?.provider,
                          modelId:
                            selectedImageModelRecord?.modelId ??
                            selectedImageModelId,
                          configJson: selectedImageModelRecord?.configJson as
                            | Record<string, unknown>
                            | undefined,
                        }).providerKey ?? undefined
                      }
                    />
                  )}

                  {/* Feature 135 — Hermes/Grok connection picker, mutually
                      exclusive with the MCP picker above. */}
                  {imageModelUsesHermes && (
                    <div className="space-y-1">
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
                    </div>
                  )}

                  {detailHasApprovedReference && (
                    <div className="flex flex-col gap-2 rounded-md border border-sky-300/70 bg-sky-50/70 p-3 dark:bg-sky-950/20">
                      <div className="flex items-center gap-2">
                        <Wand2
                          aria-hidden="true"
                          className="h-4 w-4 text-sky-600"
                        />
                        <Label
                          htmlFor={`vd-location-edit-instruction-${selectedLocation.locationId}`}
                        >
                          {t(
                            lang,
                            "แก้ไขภาพเดิมด้วย image-to-image",
                            "Edit existing image with image-to-image"
                          )}
                        </Label>
                      </div>
                      <Textarea
                        id={`vd-location-edit-instruction-${selectedLocation.locationId}`}
                        value={
                          editInstructionByLocationId[
                            selectedLocation.locationId
                          ] ?? ""
                        }
                        onChange={event =>
                          setEditInstructionByLocationId(prev => ({
                            ...prev,
                            [selectedLocation.locationId]: event.target.value,
                          }))
                        }
                        placeholder={t(
                          lang,
                          "ระบุเฉพาะสิ่งที่ต้องการแก้ เช่น เปลี่ยนโต๊ะเป็นโต๊ะไม้สีเข้ม แต่คงหน้าต่าง ผังห้อง และแสงเดิมไว้",
                          "Describe only the requested change, e.g. replace the desk with dark wood while preserving the windows, layout, and lighting."
                        )}
                        maxLength={1200}
                        rows={3}
                        disabled={isRenderingSelected}
                        data-testid={`vd-location-edit-instruction-${selectedLocation.locationId}`}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        {t(
                          lang,
                          "ภาพหลักเดิมจะถูกใช้เป็นภาพอ้างอิง ระบบจะสร้างภาพผู้สมัครใหม่และคงภาพหลักเดิมไว้จนกว่าจะเลือกเปลี่ยนเอง",
                          "The current primary image is the source reference. A new candidate is created while the current primary stays unchanged until you choose to replace it."
                        )}
                      </p>
                      {selectedImageModelMaxReferenceImages === 0 ? (
                        <p className="text-xs text-destructive">
                          {t(
                            lang,
                            "โมเดลนี้ไม่รองรับ image-to-image กรุณาเลือกโมเดลที่รองรับภาพอ้างอิง",
                            "This model does not support image-to-image references. Choose a compatible model."
                          )}
                        </p>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        className="w-fit gap-1.5"
                        onClick={() =>
                          handleEditExistingImage(selectedLocation)
                        }
                        disabled={
                          isRenderingSelected ||
                          !editInstructionByLocationId[
                            selectedLocation.locationId
                          ]?.trim() ||
                          !selectedImageModelId ||
                          selectedImageModelMaxReferenceImages === 0
                        }
                        data-testid={`vd-location-edit-existing-image-${selectedLocation.locationId}`}
                      >
                        {isRenderingSelected ? (
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
                        {isRenderingSelected
                          ? t(lang, "กำลังแก้ไขภาพ…", "Editing image…")
                          : t(
                              lang,
                              "แก้ไขภาพเดิมด้วย AI",
                              "Edit existing image with AI"
                            )}
                      </Button>
                    </div>
                  )}

                  {candidateForSelected ? (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2">
                        <AuthenticatedMediaImage
                          src={candidateForSelected.imageUrl}
                          alt=""
                          className="h-14 w-14 shrink-0 rounded border border-border object-cover"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          {t(
                            lang,
                            "ตรวจสอบภาพที่สร้างแล้วกด “อนุมัติ” เพื่อเพิ่มเป็นภาพผู้สมัคร (เลือกภาพหลักได้ในแกลเลอรีด้านบน)",
                            "Review the rendered image, then approve to add it as a candidate (pick the primary from the gallery above)."
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
                          <Loader2
                            aria-hidden="true"
                            className="h-3.5 w-3.5 animate-spin"
                          />
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
                        disabled={isRenderingSelected || !selectedImageModelId}
                        title={
                          selectedImageModelId
                            ? undefined
                            : t(
                                lang,
                                "เลือกโมเดลภาพก่อนสร้าง",
                                "Select an image model first"
                              )
                        }
                        data-testid={`vd-location-generate-image-${selectedLocation.locationId}`}
                      >
                        {isRenderingSelected ? (
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
                        {isRenderingSelected
                          ? t(lang, "กำลังสร้าง…", "Generating…")
                          : t(
                              lang,
                              "สร้างภาพ (มีค่าใช้จ่าย)",
                              "Generate image (paid)"
                            )}
                      </Button>
                    </div>
                  ) : (
                    <>
                      {detailHasApprovedReference && (
                        <div className="flex flex-col gap-1.5">
                          <p className="text-[11px] text-muted-foreground">
                            {t(
                              lang,
                              "มีภาพอ้างอิงหลักแล้ว",
                              "A primary reference image is set"
                            )}
                          </p>
                          {resolvedAssetLinkIdForSelected ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="gap-1.5"
                                onClick={() =>
                                  handleMarkStale(selectedLocation)
                                }
                                disabled={markStaleMutation.isPending}
                                data-testid={`vd-location-mark-stale-${selectedLocation.locationId}`}
                              >
                                <Clock
                                  aria-hidden="true"
                                  className="h-3.5 w-3.5"
                                />
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
                              {confirmingDeleteLocationId ===
                              selectedLocation.locationId ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[11px] text-muted-foreground">
                                    {t(lang, "ยืนยันการลบ?", "Confirm delete?")}
                                  </span>
                                  <Button
                                    type="button"
                                    size="icon-sm"
                                    variant="ghost"
                                    onClick={() =>
                                      setConfirmingDeleteLocationId(null)
                                    }
                                    aria-label={t(lang, "ยกเลิก", "Cancel")}
                                  >
                                    <X
                                      aria-hidden="true"
                                      className="h-3.5 w-3.5"
                                    />
                                  </Button>
                                  <Button
                                    type="button"
                                    size="icon-sm"
                                    variant="destructive"
                                    onClick={() =>
                                      handleDelete(selectedLocation)
                                    }
                                    disabled={deleteAssetMutation.isPending}
                                    aria-label={t(
                                      lang,
                                      "ยืนยันลบภาพนี้",
                                      "Confirm delete this image"
                                    )}
                                    data-testid={`vd-location-confirm-delete-${selectedLocation.locationId}`}
                                  >
                                    {deleteAssetMutation.isPending ? (
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
                                  size="sm"
                                  variant="outline"
                                  className="gap-1.5 text-destructive"
                                  onClick={() =>
                                    setConfirmingDeleteLocationId(
                                      selectedLocation.locationId
                                    )
                                  }
                                  data-testid={`vd-location-delete-${selectedLocation.locationId}`}
                                >
                                  <Trash2
                                    aria-hidden="true"
                                    className="h-3.5 w-3.5"
                                  />
                                  {t(lang, "ลบ", "Delete")}
                                </Button>
                              )}
                            </div>
                          ) : (
                            <p className="text-[11px] text-muted-foreground">
                              {t(
                                lang,
                                "จัดการภาพนี้ไม่ได้ในตอนนี้ (สร้างไว้ก่อนหน้าเซสชันนี้)",
                                "Can't manage this reference yet (created before this session)"
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
                          <Loader2
                            aria-hidden="true"
                            className="h-3.5 w-3.5 animate-spin"
                          />
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

      <ModelSelectorDialog
        open={isModelDialogOpen}
        onOpenChange={setIsModelDialogOpen}
        models={imageModels}
        selectedModelId={selectedImageModelId}
        onSelect={handleSelectImageModel}
        mediaType="image"
        isLoading={imageModelsQuery.isLoading}
        loadError={imageModelsQuery.isError}
        onRetry={() => void imageModelsQuery.refetch()}
      />

      <ImageLightbox
        images={lightboxImage ? [lightboxImage] : []}
        open={lightboxImage !== null}
        onClose={() => setLightboxImage(null)}
      />
    </section>
  );
}
