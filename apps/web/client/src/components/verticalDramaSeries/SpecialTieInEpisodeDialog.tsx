import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronsUpDown,
  Expand,
  ImagePlus,
  Loader2,
  MapPin,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AuthenticatedMediaImage } from "@/components/media/AuthenticatedMediaImage";
import { useVerticalDramaCreditConfirmation } from "@/components/verticalDramaSeries/VerticalDramaCreditConfirmDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { trpc } from "@/lib/trpc";
import {
  clearSpecialTieInEpisodeDraft,
  hasMeaningfulSpecialTieInDraft,
  readSpecialTieInEpisodeDraft,
  specialTieInEpisodeDraftKey,
  writeSpecialTieInEpisodeDraft,
  type SpecialTieInEpisodeDraftValues,
} from "@/lib/specialTieInEpisodeDraft";
import {
  buildSpecialTieInMarketplaceProductBrief,
  canAddSpecialReferences,
  resolveSpecialTieInCharacterId,
  shouldLoadSpecialTieInHistory,
  type SpecialTieInStartMode,
  toggleBoundedSelection,
} from "@/lib/specialTieInUi";
import {
  specialTieInInputSchema,
  SPECIAL_TIE_IN_DURATIONS_SECONDS,
  type SpecialModelSnapshot,
  type SpecialTieInInput,
} from "@shared/verticalDramaSeries/specialTieInContracts";
import type {
  MarketplaceReviewIdea,
  MarketplaceReviewIdeaInput,
} from "@shared/marketplaceReviewIdeas/contracts";
import {
  footageBrollPlacementSchema,
  footageGuideSchema,
  mediaSourceManifestSchema,
  type FootageBrollPlacement,
  type MediaSourceManifest,
} from "@shared/verticalDramaMedia/contracts";

type ReferenceType = "product" | "location" | "store" | "mixed";
type ShotDialogueDraft = NonNullable<SpecialTieInInput["shotDialogues"]>;
type DialogueSpeakerCharacter = {
  characterId?: string | number;
  id?: string | number;
  name?: string;
  characterName?: string;
};

function dialogueSpeakerLabel(
  speakerCharacterId: string,
  characters: readonly DialogueSpeakerCharacter[]
): string {
  const character = characters.find(
    option => resolveSpecialTieInCharacterId(option) === speakerCharacterId
  );
  return character?.name ?? character?.characterName ?? speakerCharacterId;
}

function formatShotDialogueDrafts(
  drafts: ShotDialogueDraft,
  characters: readonly DialogueSpeakerCharacter[] = []
): string {
  return drafts
    .flatMap(shot =>
      shot.dialogueLines.map(
        line =>
          `${dialogueSpeakerLabel(line.speakerCharacterId, characters)}: ${line.line}`
      )
    )
    .join("\n");
}

function updateShotDialogueLine(
  drafts: ShotDialogueDraft,
  shotIndex: number,
  lineIndex: number,
  value: string
): ShotDialogueDraft {
  return drafts.map((shot, currentShotIndex) =>
    currentShotIndex !== shotIndex
      ? shot
      : {
          ...shot,
          dialogueLines: shot.dialogueLines.map((line, currentLineIndex) =>
            currentLineIndex === lineIndex ? { ...line, line: value } : line
          ),
        }
  );
}

function hasCompleteShotDialogueDrafts(drafts: ShotDialogueDraft): boolean {
  return (
    drafts.length === 9 &&
    drafts.every(
      (shot, index) =>
        shot.shotNumber === index + 1 &&
        shot.dialogueLines.length >= 1 &&
        shot.dialogueLines.length <= 3 &&
        shot.dialogueLines.every(line => line.line.trim().length > 0)
    )
  );
}

export function areSpecialTieInDialogueSpeakersSelected(input: {
  characters: Array<{
    characterId?: string | number;
    id?: string | number;
    name?: string;
    characterName?: string;
  }>;
  speakerCharacterIds: string[];
  shotDialogueDrafts: ShotDialogueDraft;
}): boolean {
  const selectedSpeakerIds = new Set(input.speakerCharacterIds);
  return input.shotDialogueDrafts.every(shot =>
    shot.dialogueLines.every(line =>
      input.characters.some(character => {
        const characterId = resolveSpecialTieInCharacterId(character);
        const characterName = character.name ?? character.characterName ?? "";
        return (
          selectedSpeakerIds.has(characterId) &&
          (characterId === line.speakerCharacterId ||
            characterName === line.speakerCharacterId)
        );
      })
    )
  );
}

/** The legacy dialogue summary is capped at 12 lines; shotDialogues carries the full 9-shot script. */
export function limitSpecialTieInDialogueLines<T>(lines: readonly T[]): T[] {
  return lines.slice(0, 12);
}

type Reference = {
  mediaAssetId: string;
  source: "upload" | "marketplace_capture" | "series_asset";
  role?: "product" | "location" | "store";
  label?: string;
  previewUrl?: string;
  provenance?: Record<string, unknown>;
};

export function buildSpecialTieInSceneHref(
  seriesId: string,
  locationKey: string
): string {
  return `/drama-series/${seriesId}?tab=scenes&locationKey=${encodeURIComponent(locationKey)}`;
}

export function SpecialTieInSceneLink({
  lang,
  seriesId,
  locationKey,
}: {
  lang: "th" | "en";
  seriesId: string;
  locationKey: string;
}) {
  return (
    <Button asChild variant="outline">
      <a
        href={buildSpecialTieInSceneHref(seriesId, locationKey)}
        target="_blank"
        rel="noopener noreferrer"
      >
        {lang === "th"
          ? "เปิดหน้าฉากเพื่อสร้างภาพ"
          : "Open Scenes to generate image"}
      </a>
    </Button>
  );
}

function referenceTypeForReviewSubject(
  subjectType: MarketplaceReviewIdeaInput["reviewSubjectType"],
  current: ReferenceType,
): ReferenceType {
  switch (subjectType) {
    case "restaurant":
      return "store";
    case "place":
    case "tourist_attraction":
      return "location";
    case "documentary":
      return current;
    default:
      return "product";
  }
}

function referenceRoleForType(
  referenceType: ReferenceType,
): Reference["role"] | undefined {
  return referenceType === "mixed" ? undefined : referenceType;
}

type SceneSuggestion = {
  sceneLabel: string;
  description: string;
  candidates: Array<{
    locationId: string;
    locationKey: string;
    name: string;
    score: number;
  }>;
};

type IdeaHistoryResumeSnapshot = {
  productSource: "marketplace_capture" | "upload";
  reviewSubjectType?: MarketplaceReviewIdeaInput["reviewSubjectType"];
  presentationStyle?: MarketplaceReviewIdeaInput["presentationStyle"];
  storyStructure?: MarketplaceReviewIdeaInput["storyStructure"];
  productBrief?: string;
  direction?: string;
  referenceImages: Array<{
    mediaAssetId: string;
    imageId?: string;
    url: string;
    label?: string;
  }>;
  selectedCharacterIds: string[];
  dialogueMode: "none" | "character_dialogue";
};

type IdeaHistoryRun = {
  runId: string;
  productId?: string;
  selectedIdeaId?: string | null;
  resume?: IdeaHistoryResumeSnapshot | null;
  ideas: MarketplaceReviewIdea[];
};

export const DEFAULT_SPECIAL_TIE_IN_DIALOGUE_MODE =
  "character_dialogue" as const;

function getPresentationStyleLabel(
  value: MarketplaceReviewIdea["presentationStyle"],
  lang: "th" | "en"
) {
  if (!value) return null;
  const labels: Record<
    NonNullable<MarketplaceReviewIdea["presentationStyle"]>,
    string
  > = {
    story_tie_in: lang === "th" ? "เล่า Tie-in ในเรื่อง" : "Story tie-in",
    direct_product_pitch:
      lang === "th" ? "แนะนำสินค้าตรง ๆ" : "Direct product pitch",
    unboxing: lang === "th" ? "เปิดกล่อง/ทดลองใช้" : "Unboxing",
    feature_explainer:
      lang === "th" ? "สาธิตคุณสมบัติ" : "Feature demonstration",
    problem_solution: lang === "th" ? "ปัญหาและทางออก" : "Problem to solution",
    experience_review:
      lang === "th" ? "รีวิวประสบการณ์จริง" : "Firsthand experience review",
    documentary: lang === "th" ? "เล่าแบบสารคดี" : "Documentary style",
  };
  return labels[value];
}

function getStoryStructureLabel(
  value: MarketplaceReviewIdea["storyStructure"],
  lang: "th" | "en"
) {
  if (!value) return null;
  const labels: Record<
    NonNullable<MarketplaceReviewIdea["storyStructure"]>,
    string
  > = {
    three_act: lang === "th" ? "3 องก์" : "Three act",
    problem_solution: lang === "th" ? "ปัญหา → วิธีแก้" : "Problem–solution",
    aida: "AIDA",
    before_after_bridge:
      lang === "th" ? "ก่อน → หลัง → สะพานเชื่อม" : "Before–after–bridge",
    hero_journey: lang === "th" ? "เส้นทางตัวละคร" : "Hero’s journey",
  };
  return labels[value];
}

export function resolveSpecialTieInDialogueMode(
  initialInput?: Pick<SpecialTieInInput, "dialogueMode"> | null
): "none" | "character_dialogue" {
  return initialInput?.dialogueMode ?? DEFAULT_SPECIAL_TIE_IN_DIALOGUE_MODE;
}

export function hasResolvedSpecialTieInPrimaryScene(input: {
  hasMarketplaceIdea: boolean;
  sceneLocationKey?: string | null;
}): boolean {
  return !input.hasMarketplaceIdea || Boolean(input.sceneLocationKey?.trim());
}

type FootageBrollAsset = {
  manifest: MediaSourceManifest;
  previewUrl: string;
  thumbnailUrl?: string | null;
};

export function resolveSpecialTieInActionState(input: {
  createMutationPending: boolean;
  finalSubmitPending: boolean;
  materializeMutationPending: boolean;
}) {
  return {
    finalSubmitPending: input.createMutationPending || input.finalSubmitPending,
    materializeReferencesPending: input.materializeMutationPending,
  };
}

/**
 * Keep a model selection usable when reference or dialogue settings cause the
 * server-side catalog to return a different compatible model set.
 */
export function resolveSpecialTieInModelSelection<T extends { modelId: string }>(
  selectedModelId: string,
  models: readonly T[],
): string {
  return models.some(model => model.modelId === selectedModelId)
    ? selectedModelId
    : (models[0]?.modelId ?? "");
}

function parseEditableDialogueScript(
  script: string,
  fallback: MarketplaceReviewIdea["dialogue"]
): MarketplaceReviewIdea["dialogue"] {
  const parsed = script
    .split(/\r?\n/)
    .map(line => line.trim())
    .map(line => {
      const separator = line.indexOf(":");
      if (separator <= 0) return null;
      const speaker = line.slice(0, separator).trim();
      const spokenLine = line.slice(separator + 1).trim();
      return speaker && spokenLine ? { speaker, line: spokenLine } : null;
    })
    .filter((line): line is { speaker: string; line: string } => Boolean(line))
    .slice(0, 12);
  return parsed.length > 0 ? parsed : fallback;
}

type CharacterPortraitAsset = {
  characterId?: string;
  assetType?: string;
  role?: string;
  approved?: boolean;
  state?: string;
  thumbnailUrl?: string;
  updatedAt?: string;
};

export function isUsableSpecialTieInPortrait(
  asset: CharacterPortraitAsset | undefined
) {
  return Boolean(
    asset?.characterId &&
    asset.thumbnailUrl &&
    asset.assetType === "character_reference" &&
    (asset.role === "primary_portrait" ||
      asset.role === "primary_reference" ||
      asset.role === "casting_reference") &&
    (asset.approved === true ||
      asset.state === "approved" ||
      asset.state === "generated" ||
      asset.state === "imported")
  );
}

type PublicMediaModel = {
  modelId: string;
  name?: string | null;
  provider?: string | null;
  aspectRatios?: string[] | null;
  durations?: number[] | null;
  supportsStartFrame?: boolean;
  maxReferenceImages?: number | null;
  nativeAudioDialogue?: boolean;
};

type IdeaLlmModel = {
  modelId: string;
  label: string;
  provider: string;
  isRecommended: boolean;
  isDefault: boolean;
};

function SpecialTieInModelCombobox({
  models,
  value,
  onValueChange,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  ariaLabel,
  disabled = false,
}: {
  models: SpecialModelSnapshot[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  ariaLabel: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selectedModel = models.find(model => model.modelId === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled || models.length === 0}
          className="h-auto min-h-9 w-full justify-between gap-2 text-left font-normal"
        >
          <span className="min-w-0 flex-1 truncate">
            {(selectedModel?.label ?? selectedModel?.modelId ?? value) ||
              placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(28rem,calc(100vw-2rem))] p-0"
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className="max-h-[min(60vh,28rem)]">
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            {models.map(model => (
              <CommandItem
                key={model.modelId}
                value={`${model.label ?? model.modelId} ${model.modelId} ${model.provider}`}
                onSelect={() => {
                  onValueChange(model.modelId);
                  setOpen(false);
                }}
              >
                <Check
                  className={`mr-2 h-4 w-4 ${value === model.modelId ? "opacity-100" : "opacity-0"}`}
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {model.label ?? model.modelId}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    9:16 · {model.provider}
                    {model.supportedDurationsSeconds.length > 0
                      ? ` · ${model.supportedDurationsSeconds.join(", ")}s`
                      : ""}
                    {model.maxReferenceImages != null
                      ? ` · ${model.maxReferenceImages} refs`
                      : ""}
                  </span>
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function IdeaLlmModelCombobox({
  models,
  value,
  onValueChange,
  lang,
  disabled = false,
}: {
  models: IdeaLlmModel[];
  value: string;
  onValueChange: (value: string) => void;
  lang: "th" | "en";
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = models.find(model => model.modelId === value);
  const selectedLabel =
    value === "auto"
      ? lang === "th"
        ? "อัตโนมัติ (แนะนำ)"
        : "Automatic (recommended)"
      : (selected?.label ?? value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={
            lang === "th" ? "เลือก LLM สร้างไอเดีย" : "Select idea LLM"
          }
          disabled={disabled}
          className="h-auto min-h-9 w-full justify-between gap-2 text-left font-normal"
        >
          <span className="min-w-0 flex-1 truncate">{selectedLabel}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(30rem,calc(100vw-2rem))] p-0"
      >
        <Command>
          <CommandInput
            placeholder={
              lang === "th" ? "ค้นหา LLM สร้างไอเดีย..." : "Search idea LLMs..."
            }
          />
          <CommandList className="max-h-[min(60vh,28rem)]">
            <CommandEmpty>
              {lang === "th"
                ? "ไม่พบ LLM ที่เลือกได้"
                : "No eligible LLM found"}
            </CommandEmpty>
            <CommandItem
              value="auto automatic recommended"
              onSelect={() => {
                onValueChange("auto");
                setOpen(false);
              }}
            >
              <Check
                className={`mr-2 h-4 w-4 ${value === "auto" ? "opacity-100" : "opacity-0"}`}
              />
              <span>
                <span className="block font-medium">
                  {lang === "th"
                    ? "อัตโนมัติ (แนะนำ)"
                    : "Automatic (recommended)"}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {lang === "th"
                    ? "ระบบเลือกจาก model ที่ admin แนะนำและพร้อมใช้งาน"
                    : "Choose from admin-recommended, routable models"}
                </span>
              </span>
            </CommandItem>
            {models.map(model => (
              <CommandItem
                key={model.modelId}
                value={`${model.label} ${model.modelId} ${model.provider}`}
                onSelect={() => {
                  onValueChange(model.modelId);
                  setOpen(false);
                }}
              >
                <Check
                  className={`mr-2 h-4 w-4 ${value === model.modelId ? "opacity-100" : "opacity-0"}`}
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {model.label}
                    {model.isRecommended ? (
                      <Badge variant="secondary" className="ml-2">
                        {lang === "th" ? "แนะนำ" : "Recommended"}
                      </Badge>
                    ) : null}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {model.provider}
                    {model.isDefault
                      ? ` · ${lang === "th" ? "ค่าเริ่มต้น" : "default"}`
                      : ""}
                  </span>
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

async function sha256Fingerprint(value: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const bytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(value)
    );
    return Array.from(new Uint8Array(bytes))
      .map(byte => byte.toString(16).padStart(2, "0"))
      .join("");
  }
  // Browser crypto is available in supported production browsers. This
  // deterministic fallback keeps the editor usable in older test harnesses;
  // the server still validates the resulting prepare payload and source revision.
  return "0".repeat(64);
}

export function SpecialTieInEpisodeDialog({
  lang,
  seriesId,
  open,
  onOpenChange,
  onCreated,
  onOpenCharacterSettings,
  initialInput,
  initialMode = "resume",
  onSubmitInput,
}: {
  lang: "th" | "en";
  seriesId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (episodeId: string) => void;
  onOpenCharacterSettings?: () => void;
  initialInput?: SpecialTieInInput | null;
  initialMode?: SpecialTieInStartMode;
  onSubmitInput?: (input: SpecialTieInInput) => Promise<void>;
}) {
  const { user } = useAuth();
  const isEditingExistingEpisode = Boolean(initialInput || onSubmitInput);
  const utils = trpc.useUtils();
  const [idea, setIdea] = useState("");
  const [presentationStyle, setPresentationStyle] =
    useState<MarketplaceReviewIdeaInput["presentationStyle"]>("varied");
  const [reviewSubjectType, setReviewSubjectType] = useState<
    MarketplaceReviewIdeaInput["reviewSubjectType"]
  >("product");
  const [storyStructure, setStoryStructure] =
    useState<MarketplaceReviewIdeaInput["storyStructure"]>("varied");
  const [referenceType, setReferenceType] = useState<ReferenceType>("product");
  const [references, setReferences] = useState<Reference[]>([]);
  const [characterIds, setCharacterIds] = useState<string[]>([]);
  const [speakerCharacterIds, setSpeakerCharacterIds] = useState<string[]>([]);
  const [durationSeconds, setDurationSeconds] = useState(10);
  const [dialogueMode, setDialogueMode] = useState<
    "none" | "character_dialogue"
  >(() => resolveSpecialTieInDialogueMode(initialInput));
  const [dialogueBrief, setDialogueBrief] = useState("");
  const [shotDialogueDrafts, setShotDialogueDrafts] =
    useState<ShotDialogueDraft>([]);
  const [allowAdditionalCharacters, setAllowAdditionalCharacters] =
    useState(false);
  const [lockCharacterReferences, setLockCharacterReferences] = useState(true);
  const [lockReferenceImages, setLockReferenceImages] = useState(true);
  const [imageModelId, setImageModelId] = useState("");
  const [videoModelId, setVideoModelId] = useState("");
  const [ideaLlmModelId, setIdeaLlmModelId] = useState("auto");
  const [marketplaceOpen, setMarketplaceOpen] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null
  );
  const [pendingImageIds, setPendingImageIds] = useState<string[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    null
  );
  const [sceneSuggestions, setSceneSuggestions] = useState<SceneSuggestion[]>(
    []
  );
  const [sceneChoiceByLabel, setSceneChoiceByLabel] = useState<
    Record<string, string>
  >({});
  const [selectedSceneLocationKey, setSelectedSceneLocationKey] = useState<
    string | null
  >(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMaterializingReferences, setIsMaterializingReferences] =
    useState(false);
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(
    null
  );
  const [ideaHistory, setIdeaHistory] = useState<IdeaHistoryRun[]>([]);
  const historyHydratedRef = useRef(false);
  const [ideaGenerationJobId, setIdeaGenerationJobId] = useState<string | null>(
    null
  );
  const [ideaGenerationJobScopeKey, setIdeaGenerationJobScopeKey] =
    useState<string | null>(null);
  const [freshIdeaRunId, setFreshIdeaRunId] = useState<string | null>(null);
  const [showIdeaHistory, setShowIdeaHistory] = useState(false);
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [selectedMarketplaceIdea, setSelectedMarketplaceIdea] =
    useState<MarketplaceReviewIdea | null>(null);
  const [footageAssetId, setFootageAssetId] = useState<number | null>(null);
  const [footageFileName, setFootageFileName] = useState("");
  const [footagePreviewUrl, setFootagePreviewUrl] = useState<string | null>(
    null
  );
  const [footageAnalysisJobId, setFootageAnalysisJobId] = useState<
    string | null
  >(null);
  const [footagePrepareJobId, setFootagePrepareJobId] = useState<string | null>(
    null
  );
  const [footageTrimStartMs, setFootageTrimStartMs] = useState(0);
  const [footageTrimEndMs, setFootageTrimEndMs] = useState(0);
  const [footageFullscreen, setFootageFullscreen] = useState(false);
  const [brollAssetId, setBrollAssetId] = useState("");
  const [brollStartMs, setBrollStartMs] = useState(0);
  const [brollEndMs, setBrollEndMs] = useState(5000);
  const [brollSourceInMs, setBrollSourceInMs] = useState(0);
  const [brollPlacements, setBrollPlacements] = useState<
    FootageBrollPlacement[]
  >([]);
  const [brollRenderJobId, setBrollRenderJobId] = useState<string | null>(null);
  const [brollFullscreen, setBrollFullscreen] = useState(false);
  const debouncedProductQuery = useDebouncedValue(productQuery, 300);
  const { requestConfirmation, cancelConfirmation, creditConfirmDialog } =
    useVerticalDramaCreditConfirmation();
  const draftKey = useMemo(
    () =>
      specialTieInEpisodeDraftKey({
        tenantId: user?.currentTenantId,
        userId: user?.id,
        seriesId,
      }),
    [seriesId, user?.currentTenantId, user?.id]
  );
  const [draftHydratedKey, setDraftHydratedKey] = useState<string | null>(null);
  const [draftRestoredAt, setDraftRestoredAt] = useState<number | null>(null);
  const [draftSaved, setDraftSaved] = useState<boolean | null>(null);
  const draftValues = useMemo<SpecialTieInEpisodeDraftValues>(
    () => ({
      idea,
      presentationStyle,
      reviewSubjectType,
      storyStructure,
      referenceType,
      references,
      characterIds,
      speakerCharacterIds,
      durationSeconds: durationSeconds as SpecialTieInEpisodeDraftValues["durationSeconds"],
      dialogueMode,
      dialogueBrief,
      shotDialogueDrafts,
      allowAdditionalCharacters,
      lockCharacterReferences,
      lockReferenceImages,
      imageModelId,
      videoModelId,
      ideaLlmModelId,
      productQuery,
      selectedProductId,
      pendingImageIds,
      selectedLocationId,
      sceneSuggestions,
      sceneChoiceByLabel,
      selectedSceneLocationKey,
      selectedIdeaId,
      selectedMarketplaceIdea,
      footageAssetId,
      footageFileName,
      footageAnalysisJobId,
      footagePrepareJobId,
      footageTrimStartMs,
      footageTrimEndMs,
      brollAssetId,
      brollStartMs,
      brollEndMs,
      brollSourceInMs,
      brollPlacements,
      brollRenderJobId,
    }),
    [
      idea,
      presentationStyle,
      reviewSubjectType,
      storyStructure,
      referenceType,
      references,
      characterIds,
      speakerCharacterIds,
      durationSeconds,
      dialogueMode,
      dialogueBrief,
      shotDialogueDrafts,
      allowAdditionalCharacters,
      lockCharacterReferences,
      lockReferenceImages,
      imageModelId,
      videoModelId,
      ideaLlmModelId,
      productQuery,
      selectedProductId,
      pendingImageIds,
      selectedLocationId,
      sceneSuggestions,
      sceneChoiceByLabel,
      selectedSceneLocationKey,
      selectedIdeaId,
      selectedMarketplaceIdea,
      footageAssetId,
      footageFileName,
      footageAnalysisJobId,
      footagePrepareJobId,
      footageTrimStartMs,
      footageTrimEndMs,
      brollAssetId,
      brollStartMs,
      brollEndMs,
      brollSourceInMs,
      brollPlacements,
      brollRenderJobId,
    ]
  );

  useEffect(() => {
    if (!open) {
      setDraftHydratedKey(null);
      setDraftRestoredAt(null);
      setDraftSaved(null);
      return;
    }
    // Episode edits have their own server-backed source of truth.
    if (isEditingExistingEpisode) {
      setDraftHydratedKey(null);
      setDraftRestoredAt(null);
      return;
    }

    const saved = readSpecialTieInEpisodeDraft(draftKey);
    if (saved) {
      // The local form draft is newer than the optional server idea-history
      // resume snapshot. Keep that snapshot from replacing these edits.
      historyHydratedRef.current = true;
      const draft = saved.values;
      setIdea(draft.idea);
      setPresentationStyle(draft.presentationStyle);
      setReviewSubjectType(draft.reviewSubjectType);
      setStoryStructure(draft.storyStructure);
      setReferenceType(draft.referenceType);
      setReferences(draft.references);
      setCharacterIds(draft.characterIds);
      setSpeakerCharacterIds(draft.speakerCharacterIds);
      setDurationSeconds(draft.durationSeconds);
      setDialogueMode(draft.dialogueMode);
      setDialogueBrief(draft.dialogueBrief);
      setShotDialogueDrafts(draft.shotDialogueDrafts);
      setAllowAdditionalCharacters(draft.allowAdditionalCharacters);
      setLockCharacterReferences(draft.lockCharacterReferences);
      setLockReferenceImages(draft.lockReferenceImages);
      setImageModelId(draft.imageModelId);
      setVideoModelId(draft.videoModelId);
      setIdeaLlmModelId(draft.ideaLlmModelId);
      setProductQuery(draft.productQuery);
      setSelectedProductId(draft.selectedProductId);
      setPendingImageIds(draft.pendingImageIds);
      setSelectedLocationId(draft.selectedLocationId);
      setSceneSuggestions(draft.sceneSuggestions);
      setSceneChoiceByLabel(draft.sceneChoiceByLabel);
      setSelectedSceneLocationKey(draft.selectedSceneLocationKey);
      setSelectedIdeaId(draft.selectedIdeaId);
      setSelectedMarketplaceIdea(draft.selectedMarketplaceIdea);
      setFootageAssetId(draft.footageAssetId);
      setFootageFileName(draft.footageFileName);
      setFootageAnalysisJobId(draft.footageAnalysisJobId);
      setFootagePrepareJobId(draft.footagePrepareJobId);
      setFootageTrimStartMs(draft.footageTrimStartMs);
      setFootageTrimEndMs(draft.footageTrimEndMs);
      setBrollAssetId(draft.brollAssetId);
      setBrollStartMs(draft.brollStartMs);
      setBrollEndMs(draft.brollEndMs);
      setBrollSourceInMs(draft.brollSourceInMs);
      setBrollPlacements(draft.brollPlacements);
      setBrollRenderJobId(draft.brollRenderJobId);
      setMarketplaceOpen(draft.pendingImageIds.length > 0);
      setDraftRestoredAt(saved.savedAt);
    } else {
      setDraftRestoredAt(null);
    }
    setDraftHydratedKey(draftKey);
  }, [open, draftKey, isEditingExistingEpisode]);

  useEffect(() => {
    if (
      !open ||
      !draftKey ||
      draftHydratedKey !== draftKey ||
      isEditingExistingEpisode
    )
      return;
    setDraftSaved(writeSpecialTieInEpisodeDraft(draftKey, draftValues));
  }, [open, draftKey, draftHydratedKey, draftValues, isEditingExistingEpisode]);

  useEffect(() => {
    if (!open) cancelConfirmation();
  }, [cancelConfirmation, open]);

  const charactersQuery = trpc.verticalDramaCharacters.listCharacters.useQuery(
    { seriesId },
    { enabled: open }
  );
  const modelsQuery =
    trpc.verticalDramaEpisodes.listSpecialTieInModels.useQuery(
      {
        durationSeconds: durationSeconds as 8 | 10 | 12 | 15 | 20 | 24 | 30,
        aspectRatio: "9:16",
        dialogueMode,
        referenceType,
        referenceImageCount: Math.max(1, references.length),
        characterReferenceCount: characterIds.length,
      },
      { enabled: open }
    );
  const ideaLlmModelsQuery =
    trpc.verticalDramaEpisodes.listMarketplaceReviewIdeaModels.useQuery(
      undefined,
      { enabled: open, staleTime: 30_000, refetchOnWindowFocus: false }
    );
  const publicImageModelsQuery = trpc.mediaModels.list.useQuery(
    { type: "image", verticalDramaReady: true },
    { enabled: open, staleTime: 30_000, refetchOnWindowFocus: false }
  );
  const publicVideoModelsQuery = trpc.mediaModels.list.useQuery(
    { type: "video", verticalDramaReady: true },
    { enabled: open, staleTime: 30_000, refetchOnWindowFocus: false }
  );
  const productsQuery = trpc.marketplaceCapture.listProducts.useInfiniteQuery(
    {
      limit: 20,
      cursor: null,
      query: debouncedProductQuery.trim() || undefined,
      ownerOnly: false,
      platform: "all",
      sortMode: "updated",
    },
    {
      enabled: open && marketplaceOpen,
      initialCursor: null,
      getNextPageParam: lastPage =>
        Array.isArray(lastPage)
          ? undefined
          : (lastPage.nextCursor ?? undefined),
      refetchOnWindowFocus: false,
    }
  );
  const imagesQuery =
    trpc.marketplaceCapture.listProductImages.useInfiniteQuery(
      {
        productId: selectedProductId,
        limit: 30,
        cursor: null,
        ownerOnly: false,
        platform: "all",
      },
      {
        enabled: open && marketplaceOpen && Boolean(selectedProductId),
        initialCursor: null,
        getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
        refetchOnWindowFocus: false,
      }
    );
  const locationsQuery = trpc.verticalDramaLocations.list.useQuery(
    { seriesId },
    {
      enabled:
        open &&
        (referenceType === "location" ||
          referenceType === "store" ||
          referenceType === "mixed" ||
          Boolean(selectedMarketplaceIdea) ||
          sceneSuggestions.length > 0),
      staleTime: 15_000,
    }
  );
  const locationAssetsQuery =
    trpc.verticalDramaLocations.listLocationAssets.useQuery(
      { seriesId, locationId: selectedLocationId ?? "" },
      {
        enabled: open && Boolean(selectedLocationId),
        staleTime: 10_000,
      }
    );
  const uploadMutation = trpc.ai.upload.useMutation();
  const registerUploadMutation =
    trpc.verticalDramaSeries.registerUploadedSourceMedia.useMutation();
  const materializeMutation =
    trpc.verticalDramaEpisodes.materializeSpecialMarketplaceImage.useMutation();
  const createMutation =
    trpc.verticalDramaEpisodes.createSpecialTieInEpisode.useMutation();
  // Feature 174 bridge: keep the existing Special Tie-in input and create a
  // shared commercial object in the background. Catalog failure must never
  // block episode creation or spend a second generation attempt.
  const ensureCommercialObjectReferenceMutation =
    trpc.verticalDramaSeries.ensureCommercialObjectReference.useMutation();
  const generateIdeasMutation =
    trpc.verticalDramaEpisodes.generateMarketplaceReviewIdeas.useMutation();
  const selectIdeaMutation =
    trpc.verticalDramaEpisodes.selectMarketplaceReviewIdea.useMutation();
  const resolveSceneMutation =
    trpc.verticalDramaEpisodes.resolveMarketplaceReviewScene.useMutation();
  const footageAnalysisMutation =
    trpc.verticalDramaEpisodes.enqueueSpecialTieInFootageAnalysis.useMutation();
  const footagePrepareMutation =
    trpc.verticalDramaEpisodes.enqueueSpecialTieInFootagePreparation.useMutation();
  const brollRenderMutation =
    trpc.verticalDramaEpisodes.enqueueSpecialTieInFootageBrollRender.useMutation();
  const brollAssetsQuery =
    trpc.verticalDramaEpisodes.listSpecialTieInFootageAssets.useQuery(
      { seriesId },
      {
        enabled: open && Boolean(footagePrepareJobId),
        staleTime: 15_000,
        refetchOnWindowFocus: false,
      }
    );
  const brollRenderJobQuery =
    trpc.verticalDramaEpisodes.getSpecialTieInFootageJob.useQuery(
      { jobId: brollRenderJobId ?? "pending-footage-broll-render" },
      {
        enabled: open && Boolean(brollRenderJobId),
        refetchInterval: query => {
          const status = query.state.data?.status;
          return brollRenderJobId &&
            ![
              "completed",
              "published",
              "failed",
              "canceled",
              "expired",
            ].includes(status ?? "")
            ? 2500
            : false;
        },
        refetchOnWindowFocus: false,
      }
    );
  const footageAnalysisJobQuery =
    trpc.verticalDramaEpisodes.getSpecialTieInFootageJob.useQuery(
      { jobId: footageAnalysisJobId ?? "pending-footage-analysis" },
      {
        enabled: open && Boolean(footageAnalysisJobId),
        refetchInterval: query => {
          const status = query.state.data?.status;
          return footageAnalysisJobId &&
            ![
              "completed",
              "published",
              "failed",
              "canceled",
              "expired",
              "quarantined",
            ].includes(status ?? "")
            ? 2500
            : false;
        },
        refetchOnWindowFocus: false,
      }
    );
  const footagePrepareJobQuery =
    trpc.verticalDramaEpisodes.getSpecialTieInFootageJob.useQuery(
      { jobId: footagePrepareJobId ?? "pending-footage-prepare" },
      {
        enabled: open && Boolean(footagePrepareJobId),
        refetchInterval: query => {
          const status = query.state.data?.status;
          return footagePrepareJobId &&
            ![
              "completed",
              "published",
              "failed",
              "canceled",
              "expired",
            ].includes(status ?? "")
            ? 2500
            : false;
        },
        refetchOnWindowFocus: false,
      }
    );
  const ideaHistoryQuery =
    trpc.verticalDramaEpisodes.listMarketplaceReviewIdeas.useQuery(
      { seriesId, productId: selectedProductId ?? undefined },
      {
        enabled: shouldLoadSpecialTieInHistory({
          open,
          initialInput,
          initialMode,
        }),
        // Resume must see the idea run created by the previous episode, not a
        // still-fresh React Query snapshot from an older editor session.
        staleTime: 0,
        refetchOnMount: "always",
        refetchOnWindowFocus: false,
      }
    );
  const currentIdeaGenerationScopeKey = selectedProductId
    ? `marketplace-review-ideas:${seriesId}:${selectedProductId}`
    : `marketplace-review-ideas:${seriesId}:${reviewSubjectType}:pending`;
  const ideaGenerationJobQuery =
    trpc.verticalDramaSeries.getInteractiveJobStatus.useQuery(
      {
        jobId:
          ideaGenerationJobId ?? "00000000-0000-0000-0000-000000000000",
        scopeKey: ideaGenerationJobScopeKey ?? currentIdeaGenerationScopeKey,
      },
      {
        enabled: open && Boolean(ideaGenerationJobId),
        refetchInterval: query => {
          const status = query.state.data?.status;
          return ideaGenerationJobId &&
            !["succeeded", "failed"].includes(status ?? "")
            ? 2000
            : false;
        },
        staleTime: 0,
        refetchOnWindowFocus: false,
      }
    );
  const footageAnalysisOutput = footageAnalysisJobQuery.data?.outputJson as
    | {
        guide?: {
          probe?: { durationMs?: number | null };
          status?: { guide?: string; warnings?: string[] };
        };
      }
    | null
    | undefined;
  const footageDurationMs = Number(
    footageAnalysisOutput?.guide?.probe?.durationMs ?? 0
  );
  const footageAnalysisDone = ["published", "completed"].includes(
    footageAnalysisJobQuery.data?.status ?? ""
  );
  const footagePrepared = ["completed", "published"].includes(
    footagePrepareJobQuery.data?.status ?? ""
  );
  const preparedSource = mediaSourceManifestSchema.safeParse(
    (
      footagePrepareJobQuery.data?.outputJson as
        | { preparedSource?: unknown }
        | null
        | undefined
    )?.preparedSource
  );
  const preparedDurationMs =
    preparedSource.success && preparedSource.data.durationMs != null
      ? preparedSource.data.durationMs
      : footageDurationMs;
  const brollAssets = (brollAssetsQuery.data?.assets ??
    []) as FootageBrollAsset[];
  const brollOutput = brollRenderJobQuery.data?.outputJson as
    | { outputUrl?: string }
    | null
    | undefined;
  const brollOutputUrl =
    typeof brollOutput?.outputUrl === "string" ? brollOutput.outputUrl : null;

  useEffect(() => {
    if (!open || !initialInput) return;
    setIdea(initialInput.idea);
    setReferenceType(initialInput.referenceType);
    setReferences(initialInput.referenceImages);
    setCharacterIds(initialInput.characterIds);
    setSpeakerCharacterIds(initialInput.speakerCharacterIds);
    setDurationSeconds(initialInput.durationSeconds);
    setDialogueMode(initialInput.dialogueMode);
    setDialogueBrief(initialInput.dialogueBrief ?? "");
    setShotDialogueDrafts(initialInput.shotDialogues ?? []);
    setAllowAdditionalCharacters(initialInput.allowAdditionalCharacters);
    setLockCharacterReferences(initialInput.lockCharacterReferences);
    setLockReferenceImages(initialInput.lockReferenceImages);
    setImageModelId(initialInput.imageModelId);
    setVideoModelId(initialInput.videoModelId);
    setIdeaLlmModelId("auto");
    setSelectedMarketplaceIdea(initialInput.marketplaceReviewIdea ?? null);
    setSelectedSceneLocationKey(initialInput.sceneLocationKey ?? null);
    setSceneSuggestions([]);
    if (initialInput.footage) {
      setFootageAssetId(
        Number(initialInput.footage.sourceMediaAssetId.replace(/^media-/, ""))
      );
      setFootageAnalysisJobId(initialInput.footage.analysisJobId);
      setFootagePrepareJobId(initialInput.footage.prepareJobId);
      setFootageTrimEndMs(initialInput.footage.guide.probe.durationMs ?? 0);
    }
    if (initialInput.broll) {
      setBrollPlacements(initialInput.broll.placements);
      setBrollRenderJobId(initialInput.broll.renderJobId ?? null);
    }
  }, [open, initialInput]);

  useEffect(() => {
    if (footageAssetId && !footagePreviewUrl) {
      const source = brollAssets.find(
        asset => asset.manifest.assetId === `media-${footageAssetId}`
      );
      if (source?.previewUrl) setFootagePreviewUrl(source.previewUrl);
    }
  }, [brollAssets, footageAssetId, footagePreviewUrl]);

  useEffect(() => {
    if (!open) {
      setFootageAssetId(null);
      setFootageFileName("");
      setFootagePreviewUrl(null);
      setFootageAnalysisJobId(null);
      setFootagePrepareJobId(null);
      setFootageTrimStartMs(0);
      setFootageTrimEndMs(0);
      setFootageFullscreen(false);
      setBrollAssetId("");
      setBrollStartMs(0);
      setBrollEndMs(5000);
      setBrollSourceInMs(0);
      setBrollPlacements([]);
      setBrollRenderJobId(null);
      setBrollFullscreen(false);
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (footagePreviewUrl?.startsWith("blob:"))
        URL.revokeObjectURL(footagePreviewUrl);
    };
  }, [footagePreviewUrl]);

  const characters = (charactersQuery.data?.characters ??
    charactersQuery.data ??
    []) as Array<{
    characterId?: string | number;
    id?: string | number;
    name?: string;
    characterName?: string;
  }>;
  const characterPortraitById = useMemo(() => {
    const assets = (
      (
        charactersQuery.data as
          | { manifest?: { assets?: CharacterPortraitAsset[] } }
          | undefined
      )?.manifest?.assets ?? []
    ).filter(asset => isUsableSpecialTieInPortrait(asset));
    const portraitByCharacterId = new Map<string, CharacterPortraitAsset>();
    for (const asset of [...assets].sort((left, right) => {
      if (left.approved !== right.approved) return left.approved ? -1 : 1;
      return (
        new Date(right.updatedAt ?? 0).getTime() -
        new Date(left.updatedAt ?? 0).getTime()
      );
    })) {
      if (asset.characterId && !portraitByCharacterId.has(asset.characterId)) {
        portraitByCharacterId.set(asset.characterId, asset);
      }
    }
    return portraitByCharacterId;
  }, [charactersQuery.data]);
  const products = (productsQuery.data?.pages ?? []).flatMap(page =>
    Array.isArray(page) ? page : page.items
  );
  const selectedProduct = products.find(
    product => String(product.id) === selectedProductId
  );
  const hasMarketplaceProductContext =
    reviewSubjectType === "product" && Boolean(selectedProductId);
  const requiresUploadedProductBrief =
    reviewSubjectType === "product" &&
    !hasMarketplaceProductContext &&
    references.length > 0;
  const productImages = (imagesQuery.data?.pages ?? []).flatMap(
    page => page.images
  );
  const locations = locationsQuery.data?.locations ?? [];
  const selectedLocation = locations.find(
    location => String(location.locationId) === selectedLocationId
  );
  const selectedSceneLocation = locations.find(
    location => location.locationKey === selectedSceneLocationKey
  );
  const approvedLocationAssets = (
    locationAssetsQuery.data?.assets ?? []
  ).filter(asset => asset.approved && asset.mediaAssetId);
  const selectedCharacterIdsWithoutUsablePortrait = characterIds.filter(
    id => !characterPortraitById.has(id)
  );
  const fallbackImageModels = useMemo<SpecialModelSnapshot[]>(() => {
    const models = (publicImageModelsQuery.data?.models ??
      []) as unknown as PublicMediaModel[];
    return models
      .filter(
        model =>
          (!model.aspectRatios?.length ||
            model.aspectRatios.includes("9:16")) &&
          (model.maxReferenceImages == null ||
            model.maxReferenceImages >=
              Math.max(1, references.length) + characterIds.length)
      )
      .map(model => ({
        modelId: model.modelId,
        label: model.name ?? model.modelId,
        provider: model.provider ?? "unknown",
        providerModel: model.modelId,
        catalogVersion: "public-media-models-fallback",
        supportedDurationsSeconds: [],
        supportedAspectRatios: model.aspectRatios?.length
          ? model.aspectRatios
          : ["9:16"],
        supportsReferenceConditioning: (model.maxReferenceImages ?? 1) > 0,
        maxReferenceImages: model.maxReferenceImages ?? undefined,
        supportsDialogueAudio: false,
      }));
  }, [
    characterIds.length,
    publicImageModelsQuery.data?.models,
    references.length,
  ]);
  const fallbackVideoModels = useMemo<SpecialModelSnapshot[]>(() => {
    const models = (publicVideoModelsQuery.data?.models ??
      []) as unknown as PublicMediaModel[];
    return models
      .filter(
        model =>
          (!model.aspectRatios?.length ||
            model.aspectRatios.includes("9:16")) &&
          (!model.durations?.length ||
            model.durations.includes(durationSeconds)) &&
          (model.maxReferenceImages == null ||
            model.maxReferenceImages >=
              Math.max(1, references.length) + characterIds.length) &&
          model.supportsStartFrame === true &&
          (dialogueMode === "none" || model.nativeAudioDialogue === true)
      )
      .map(model => ({
        modelId: model.modelId,
        label: model.name ?? model.modelId,
        provider: model.provider ?? "unknown",
        providerModel: model.modelId,
        catalogVersion: "public-media-models-fallback",
        supportedDurationsSeconds: model.durations ?? [],
        supportedAspectRatios: model.aspectRatios?.length
          ? model.aspectRatios
          : ["9:16"],
        supportsReferenceConditioning: (model.maxReferenceImages ?? 1) > 0,
        maxReferenceImages: model.maxReferenceImages ?? undefined,
        supportsDialogueAudio: model.nativeAudioDialogue === true,
      }));
  }, [
    dialogueMode,
    durationSeconds,
    characterIds.length,
    publicVideoModelsQuery.data?.models,
    references.length,
  ]);
  const imageModels = modelsQuery.data?.imageModels?.length
    ? modelsQuery.data.imageModels
    : fallbackImageModels;
  const videoModels = modelsQuery.data?.videoModels?.length
    ? modelsQuery.data.videoModels
    : fallbackVideoModels;
  const usingPublicModelFallback =
    !modelsQuery.data?.imageModels?.length ||
    !modelsQuery.data?.videoModels?.length;
  const selectedImageModelIsValid = imageModels.some(
    model => model.modelId === imageModelId
  );
  const selectedVideoModelIsValid = videoModels.some(
    model => model.modelId === videoModelId
  );
  const shotDialogueSpeakersAreSelected =
    areSpecialTieInDialogueSpeakersSelected({
      characters,
      speakerCharacterIds,
      shotDialogueDrafts,
    });
  const canSubmit =
    idea.trim().length > 0 &&
    idea.trim().length <= 12000 &&
    references.length >= 1 &&
    references.length <= 3 &&
    selectedImageModelIsValid &&
    selectedVideoModelIsValid &&
    selectedCharacterIdsWithoutUsablePortrait.length === 0 &&
    (!footageAssetId ||
      ["completed", "published"].includes(
        footagePrepareJobQuery.data?.status ?? ""
      )) &&
    !(
      dialogueMode === "character_dialogue" && speakerCharacterIds.length === 0
    ) &&
    (dialogueMode === "none" ||
      (hasCompleteShotDialogueDrafts(shotDialogueDrafts) &&
        shotDialogueSpeakersAreSelected));
  const submitBlockers = [
    idea.trim().length === 0
      ? lang === "th"
        ? "ใส่ไอเดียหรือเลือกไอเดียที่สร้างไว้"
        : "Enter an idea or select a generated idea"
      : null,
    references.length === 0
      ? lang === "th"
        ? "เพิ่มภาพสินค้า/สถานที่อย่างน้อย 1 ภาพ"
        : "Add at least one product or location image"
      : references.length > 3
        ? lang === "th"
          ? "ลดภาพอ้างอิงให้เหลือไม่เกิน 3 ภาพ"
          : "Reduce references to no more than 3 images"
        : null,
    characterIds.length === 0
      ? lang === "th"
        ? "เลือกตัวละครอย่างน้อย 1 คน"
        : "Select at least one character"
      : null,
    selectedCharacterIdsWithoutUsablePortrait.length > 0
      ? lang === "th"
        ? "เพิ่มภาพตัวละครที่พร้อมใช้งานให้ตัวละครที่เลือก"
        : "Add a usable portrait for each selected character"
      : null,
    !selectedImageModelIsValid
      ? lang === "th"
        ? "เลือกรุ่นสร้างภาพที่รองรับ"
        : "Choose a compatible image model"
      : null,
    !selectedVideoModelIsValid
      ? lang === "th"
        ? "เลือกรุ่นสร้างวิดีโอที่รองรับ"
        : "Choose a compatible video model"
      : null,
    footageAssetId &&
    !["completed", "published"].includes(
      footagePrepareJobQuery.data?.status ?? ""
    )
      ? lang === "th"
        ? "รอเตรียม Footage ให้เสร็จ หรือเอา Footage ออก"
        : "Finish preparing the footage or remove it"
      : null,
    dialogueMode === "character_dialogue" && speakerCharacterIds.length === 0
      ? lang === "th"
        ? "เลือกผู้พูดอย่างน้อย 1 คน"
        : "Select at least one speaker"
      : null,
    dialogueMode === "character_dialogue" && !selectedMarketplaceIdea
      ? lang === "th"
        ? "สร้างไอเดีย 3 ใบ แล้วเลือก 1 ใบ เพื่อสร้างบทพูดครบ 9 ช็อต"
        : "Generate 3 ideas and select one to create the required 9-shot dialogue"
      : null,
    dialogueMode === "character_dialogue" &&
    selectedMarketplaceIdea &&
    !hasCompleteShotDialogueDrafts(shotDialogueDrafts)
      ? lang === "th"
        ? "ตรวจบทพูดให้ครบทั้ง 9 ช็อต (ช็อตละ 1–3 บรรทัด)"
        : "Complete dialogue for all 9 shots (1–3 lines per shot)"
      : null,
    dialogueMode === "character_dialogue" &&
    !shotDialogueSpeakersAreSelected &&
    hasCompleteShotDialogueDrafts(shotDialogueDrafts)
      ? lang === "th"
        ? "เลือกตัวละครที่ตรงกับผู้พูดในบทพูด"
        : "Select the characters used as dialogue speakers"
      : null,
  ].filter((blocker): blocker is string => Boolean(blocker));
  const ideaGenerationBlockers = [
    references.length === 0
      ? lang === "th"
        ? "เลือกภาพอ้างอิงอย่างน้อย 1 ภาพจากเครื่อง, ฉาก หรือ Marketplace Capture"
        : "Choose at least one reference image from your device, scenes, or Marketplace Capture"
      : null,
    requiresUploadedProductBrief && !idea.trim()
      ? lang === "th"
        ? "ใส่รายละเอียดสินค้าที่ตรวจสอบได้ หรือเลือกข้อมูลจาก Marketplace"
        : "Add verifiable product details or choose Marketplace product data"
      : null,
    characterIds.length === 0
      ? lang === "th"
        ? "เลือกตัวละครอย่างน้อย 1 คน"
        : "Select at least one character"
      : null,
    footageAssetId &&
    !["completed", "published"].includes(
      footagePrepareJobQuery.data?.status ?? ""
    )
      ? lang === "th"
        ? "เตรียม Footage ให้เสร็จก่อนสร้างไอเดีย"
        : "Finish preparing the footage before generating ideas"
      : null,
  ].filter((blocker): blocker is string => Boolean(blocker));
  const actionState = resolveSpecialTieInActionState({
    createMutationPending: createMutation.isPending,
    finalSubmitPending: isSubmitting,
    materializeMutationPending: isMaterializingReferences,
  });

  useEffect(() => {
    setImageModelId(current =>
      resolveSpecialTieInModelSelection(current, imageModels),
    );
    setVideoModelId(current =>
      resolveSpecialTieInModelSelection(current, videoModels),
    );
  }, [imageModels, videoModels]);

  useEffect(() => {
    const fallbackDuration = modelsQuery.data?.fallbackVideoDurationSeconds;
    if (
      !modelsQuery.isLoading &&
      videoModels.length === 0 &&
      typeof fallbackDuration === "number" &&
      fallbackDuration !== durationSeconds
    ) {
      setDurationSeconds(fallbackDuration);
    }
  }, [
    durationSeconds,
    modelsQuery.data,
    modelsQuery.isLoading,
    videoModels.length,
  ]);

  useEffect(() => {
    if (!ideaHistoryQuery.data) return;
    const nextHistory = ideaHistoryQuery.data.map(
      (run: {
        id: string;
        productId?: string;
        selectedIdeaId?: string | null;
        resume?: IdeaHistoryResumeSnapshot | null;
        ideas: MarketplaceReviewIdea[];
      }) => ({
        runId: run.id,
        productId: run.productId,
        selectedIdeaId: run.selectedIdeaId,
        resume: run.resume,
        ideas: run.ideas,
      })
    );
    setIdeaHistory(nextHistory);
    setFreshIdeaRunId(current =>
      current && nextHistory.some(run => run.runId === current)
        ? current
        : nextHistory[0]?.runId ?? null
    );
  }, [ideaHistoryQuery.data]);

  useEffect(() => {
    if (!open) {
      historyHydratedRef.current = false;
      return;
    }
    if (
      historyHydratedRef.current ||
      initialInput ||
      initialMode !== "resume" ||
      ideaHistoryQuery.isFetching ||
      !ideaHistoryQuery.data?.length
    ) {
      return;
    }
    const latest = ideaHistoryQuery.data[0] as {
      id: string;
      productId?: string;
      selectedIdeaId?: string | null;
      resume?: IdeaHistoryResumeSnapshot | null;
      ideas: MarketplaceReviewIdea[];
    };
    const selectedIdea = latest.selectedIdeaId
      ? latest.ideas.find(ideaItem => ideaItem.ideaId === latest.selectedIdeaId)
      : undefined;
    if (selectedIdea && charactersQuery.isLoading) return;
    historyHydratedRef.current = true;
    const resume = latest.resume;
    if (resume) {
      const restoredCharacterIds = resume.selectedCharacterIds.slice(0, 4);
      setCharacterIds(restoredCharacterIds);
      setSpeakerCharacterIds([]);
      setDialogueMode(resume.dialogueMode);
      setReviewSubjectType(resume.reviewSubjectType ?? "product");
      setPresentationStyle(resume.presentationStyle ?? "varied");
      setStoryStructure(resume.storyStructure ?? "varied");
      setReferences(
        resume.referenceImages.slice(0, 3).map(reference => ({
          mediaAssetId: reference.mediaAssetId,
          source: resume.productSource,
          role: "product",
          label: reference.label,
          previewUrl: reference.url,
          provenance: {
            marketplaceProductId:
              resume.productSource === "marketplace_capture"
                ? latest.productId
                : undefined,
            marketplaceImageId: reference.imageId,
          },
        }))
      );
      if (resume.productSource === "marketplace_capture" && latest.productId) {
        setSelectedProductId(latest.productId);
      } else if (resume.productBrief) {
        setIdea(resume.productBrief);
      }
    }
    setSelectedIdeaId(latest.selectedIdeaId ?? null);
    if (selectedIdea) {
      setSelectedMarketplaceIdea(selectedIdea);
      setIdea(selectedIdea.episodeStory);
      const restoredCharacterIds =
        latest.resume?.selectedCharacterIds.slice(0, 4) ?? [];
      const selectedCharacterIdSet = new Set(restoredCharacterIds);
      const candidateShotLines = selectedIdea.shotDialogues.flatMap(
        shot => shot.lines
      );
      const matchedSpeakerIds = characters
        .filter(
          character =>
            selectedCharacterIdSet.has(
              resolveSpecialTieInCharacterId(character)
            ) &&
            candidateShotLines.some(line => line.speaker === character.name)
        )
        .slice(0, 3)
        .map(resolveSpecialTieInCharacterId)
        .filter(Boolean);
      setCharacterIds(current =>
        Array.from(new Set([...current, ...matchedSpeakerIds])).slice(0, 4)
      );
      setSpeakerCharacterIds(matchedSpeakerIds);
      const shotDrafts = selectedIdea.shotDialogues.map(shot => ({
        shotNumber: shot.shotNumber,
        dialogueLines: shot.lines.map(line => ({
          speakerCharacterId: line.speaker,
          line: line.line,
          ...(line.delivery ? { delivery: line.delivery } : {}),
        })),
      }));
      setShotDialogueDrafts(shotDrafts);
      setDialogueBrief(
        shotDrafts.some(shot => shot.dialogueLines.length > 0)
          ? formatShotDialogueDrafts(shotDrafts, characters)
          : selectedIdea.dialogueScript
      );
    }
  }, [
    historyHydratedRef,
    ideaHistoryQuery.data,
    ideaHistoryQuery.isFetching,
    initialInput,
    open,
    characters,
    charactersQuery.isLoading,
    initialMode,
  ]);

  useEffect(() => {
    const job = ideaGenerationJobQuery.data;
    if (!job || !ideaGenerationJobId) return;
    if (job.status === "succeeded") {
      const result = job.result as {
        runId?: string;
        ideas?: MarketplaceReviewIdea[];
      };
      if (!result?.runId || !Array.isArray(result.ideas) || result.ideas.length !== 3) {
        setIdeaGenerationJobId(null);
        setIdeaGenerationJobScopeKey(null);
        toast.error(
          lang === "th"
            ? "งานสร้างไอเดียเสร็จแต่ผลลัพธ์ไม่ครบ 3 ใบ ระบบไม่แสดงผลที่ไม่สมบูรณ์"
            : "Idea generation finished with an incomplete result; it was not shown."
        );
        return;
      }
      setIdeaHistory(current => [
        {
          runId: result.runId!,
          productId: selectedProductId ?? undefined,
          selectedIdeaId: null,
          ideas: result.ideas!,
        },
        ...current.filter(run => run.runId !== result.runId),
      ]);
      setFreshIdeaRunId(result.runId);
      setSelectedIdeaId(null);
      setSelectedMarketplaceIdea(null);
      setShotDialogueDrafts([]);
      setSceneSuggestions([]);
      setSelectedSceneLocationKey(null);
      setShowIdeaHistory(false);
      setIdeaGenerationJobId(null);
      setIdeaGenerationJobScopeKey(null);
      toast.success(
        lang === "th"
          ? "สร้างไอเดียซีรีย์ 3 ใบแล้ว"
          : "Generated 3 series ideas"
      );
    } else if (job.status === "failed") {
      setIdeaGenerationJobId(null);
      setIdeaGenerationJobScopeKey(null);
      toast.error(
        job.error ??
          (lang === "th"
            ? "สร้างไอเดียไม่สำเร็จ ระบบยังไม่สร้างผลลัพธ์บางส่วน"
            : "Could not generate ideas; no partial result was created.")
      );
    }
  }, [
    ideaGenerationJobId,
    ideaGenerationJobScopeKey,
    ideaGenerationJobQuery.data,
    lang,
  ]);

  const selectedCharacters = useMemo(
    () => new Set(characterIds),
    [characterIds]
  );
  const ideaRunsToShow = useMemo(() => {
    if (freshIdeaRunId) {
      const freshRun = ideaHistory.find(run => run.runId === freshIdeaRunId);
      return showIdeaHistory ? ideaHistory : freshRun ? [freshRun] : [];
    }
    return showIdeaHistory ? ideaHistory : [];
  }, [freshIdeaRunId, ideaHistory, showIdeaHistory]);
  const previousIdeaRunCount = freshIdeaRunId
    ? Math.max(0, ideaHistory.length - 1)
    : ideaHistory.length;
  const toggleCharacter = (id: string) => {
    setCharacterIds(current => {
      if (current.includes(id)) {
        setSpeakerCharacterIds(speakers =>
          speakers.filter(speaker => speaker !== id)
        );
        return current.filter(value => value !== id);
      }
      return toggleBoundedSelection(current, id, 4);
    });
  };

  const uploadReference = async (file: File, reservedCount = 0) => {
    if (!file.type.startsWith("image/"))
      throw new Error(
        lang === "th" ? "รองรับเฉพาะไฟล์ภาพ" : "Only image files are supported"
      );
    if (!canAddSpecialReferences(references.length + reservedCount))
      throw new Error(
        lang === "th"
          ? "เลือกภาพอ้างอิงได้ไม่เกิน 3 ภาพ"
          : "Choose up to 3 reference images"
      );
    const previewUrl = await readAsDataUrl(file);
    const uploaded = await uploadMutation.mutateAsync({
      fileName: file.name,
      fileType: file.type,
      fileBase64: previewUrl,
    });
    const managed = await registerUploadMutation.mutateAsync({
      storageKey: uploaded.key,
      mediaType: "image",
      mimeType: file.type,
    });
    setReferences(current => [
      ...current,
      {
        mediaAssetId: String(managed.mediaAssetId),
        source: "upload",
        role:
          referenceType === "location" || referenceType === "store"
            ? referenceType
            : "product",
        label: file.name,
        previewUrl,
        provenance: { source: "user_upload", managed: true },
      },
    ]);
  };

  const uploadReferenceFiles = async (files: File[]) => {
    let reservedCount = 0;
    for (const file of files) {
      try {
        await uploadReference(file, reservedCount);
        reservedCount += 1;
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Upload failed"
        );
      }
    }
  };

  const uploadFootage = async (file: File) => {
    if (!file.type.startsWith("video/")) {
      throw new Error(
        lang === "th"
          ? "รองรับเฉพาะไฟล์วิดีโอ"
          : "Only video files are supported"
      );
    }
    if (file.size > 2 * 1024 * 1024 * 1024) {
      throw new Error(
        lang === "th"
          ? "ไฟล์วิดีโอต้องมีขนาดไม่เกิน 2 GB"
          : "Video must be 2 GB or smaller"
      );
    }
    const initResponse = await fetch("/api/media-jobs/upload/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type,
        fileSize: file.size,
      }),
    });
    if (!initResponse.ok)
      throw new Error(
        lang === "th"
          ? "เริ่มอัปโหลด Footage ไม่สำเร็จ"
          : "Could not initialize footage upload"
      );
    const init = (await initResponse.json()) as {
      method?: string;
      assetId?: string;
      key?: string;
      uploadUrl?: string;
    };
    let mediaAssetId: string | number | undefined;
    let previewUrl: string | undefined;
    if (
      init.method === "presigned" &&
      init.assetId &&
      init.key &&
      init.uploadUrl
    ) {
      const putResponse = await fetch(init.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putResponse.ok)
        throw new Error(
          lang === "th"
            ? "อัปโหลด Footage ไป Storage ไม่สำเร็จ"
            : "Could not upload footage to storage"
        );
      const completeResponse = await fetch("/api/media-jobs/upload/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          assetId: init.assetId,
          key: init.key,
          contentType: file.type,
          fileSize: file.size,
        }),
      });
      if (!completeResponse.ok)
        throw new Error(
          lang === "th"
            ? "ยืนยัน Footage ไม่สำเร็จ"
            : "Could not finalize footage upload"
        );
      const complete = (await completeResponse.json()) as {
        mediaAssetId?: string;
        uri?: string;
      };
      mediaAssetId = complete.mediaAssetId;
      previewUrl = complete.uri;
    } else {
      // Local-storage fallback retains the existing authenticated upload path.
      const dataUrl = await readAsDataUrl(file);
      const uploaded = await uploadMutation.mutateAsync({
        fileName: file.name,
        fileType: file.type,
        fileBase64: dataUrl,
      });
      const managed = await registerUploadMutation.mutateAsync({
        storageKey: uploaded.key,
        mediaType: "video",
        mimeType: file.type,
      });
      mediaAssetId = managed.mediaAssetId;
      previewUrl = uploaded.url;
    }
    if (!mediaAssetId)
      throw new Error(
        lang === "th"
          ? "ไม่พบ Media Asset หลังอัปโหลด"
          : "No managed media asset was returned"
      );
    setFootageAssetId(Number(mediaAssetId));
    setFootageFileName(file.name);
    setFootagePreviewUrl(previewUrl ?? URL.createObjectURL(file));
    setFootageAnalysisJobId(null);
    setFootagePrepareJobId(null);
    setFootageTrimStartMs(0);
    setFootageTrimEndMs(0);
  };

  const analyzeFootage = async () => {
    if (!footageAssetId) return;
    const result = await footageAnalysisMutation.mutateAsync({
      seriesId,
      mediaAssetId: footageAssetId,
      requestedLanguage: lang === "th" ? "th" : "en",
      transcriptionPolicy: "preferred",
      analysisProfile: "standard",
    });
    setFootageAnalysisJobId(result.job?.id ?? null);
    setFootagePrepareJobId(null);
  };

  const prepareFootage = async () => {
    if (!footageAssetId || !footageAnalysisJobQuery.data) return;
    const guide = (
      footageAnalysisJobQuery.data.outputJson as {
        guide?: {
          sourceRevision?: string;
          probe?: { durationMs?: number | null };
          silenceRanges?: Array<{ startMs: number; endMs: number }>;
        };
      } | null
    )?.guide;
    const durationMs = Math.max(
      1000,
      Number(guide?.probe?.durationMs ?? footageTrimEndMs ?? 60_000)
    );
    const endMs = Math.min(
      durationMs,
      Math.max(footageTrimEndMs || durationMs, footageTrimStartMs + 1000)
    );
    const startMs = Math.min(Math.max(0, footageTrimStartMs), endMs - 1000);
    const approvalFingerprint = await sha256Fingerprint(
      `${footageAssetId}:${guide?.sourceRevision ?? footageAnalysisJobQuery.data.id}:${startMs}:${endMs}:preserve:9:16_cover`
    );
    const result = await footagePrepareMutation.mutateAsync({
      seriesId,
      mediaAssetId: footageAssetId,
      analysisRevision:
        guide?.sourceRevision ?? footageAnalysisJobQuery.data.id,
      segments: [
        {
          sourceInMs: startMs,
          sourceOutMs: endMs,
          keep: true,
          reason: "user_approved_primary_window",
        },
      ],
      silenceRanges: guide?.silenceRanges ?? [],
      removeDeadAir: true,
      baseAudioPolicy: "preserve",
      fitPolicy: "9:16_cover",
      maxDurationMs: Math.min(90_000, endMs - startMs),
      approvalFingerprint,
    });
    setFootagePrepareJobId(result.job?.id ?? null);
  };

  const addBrollPlacement = () => {
    const asset = brollAssets.find(
      item => item.manifest.assetId === brollAssetId
    );
    const startMs = Math.max(0, Math.round(brollStartMs));
    const endMs = Math.min(preparedDurationMs, Math.round(brollEndMs));
    if (!asset) {
      toast.error(
        lang === "th"
          ? "เลือกวิดีโอ B-roll ก่อน"
          : "Choose a B-roll video first"
      );
      return;
    }
    if (
      !preparedSource.success ||
      preparedDurationMs <= 0 ||
      endMs <= startMs
    ) {
      toast.error(
        lang === "th"
          ? "ช่วงเวลาวาง B-roll ไม่ถูกต้อง"
          : "The B-roll placement range is invalid"
      );
      return;
    }
    if (brollPlacements.length >= 32) {
      toast.error(
        lang === "th"
          ? "เพิ่ม B-roll ได้ไม่เกิน 32 ช่วง"
          : "You can add at most 32 B-roll placements"
      );
      return;
    }
    const durationMs = endMs - startMs;
    const parsed = footageBrollPlacementSchema.safeParse({
      storyBeatId: `special-tie-in-beat-${Date.now()}-${brollPlacements.length + 1}`,
      startMs,
      endMs,
      sourceMediaAssetId: asset.manifest.assetId,
      sourceInMs: Math.max(0, Math.round(brollSourceInMs)),
      sourceOutMs: Math.max(1, Math.round(brollSourceInMs) + durationMs),
      placementMode: "cutaway",
      fitMode: "cover",
      baseAudioPolicy: "preserve",
      brollAudioPolicy: "mute",
    });
    if (!parsed.success) {
      toast.error(
        parsed.error.issues[0]?.message ??
          (lang === "th"
            ? "ข้อมูล B-roll ไม่ถูกต้อง"
            : "Invalid B-roll placement")
      );
      return;
    }
    setBrollPlacements(current => [...current, parsed.data]);
    setBrollStartMs(Math.min(preparedDurationMs, endMs));
    setBrollEndMs(Math.min(preparedDurationMs, endMs + 5000));
  };

  const renderBroll = async () => {
    if (
      !preparedSource.success ||
      !selectedMarketplaceIdea ||
      brollPlacements.length === 0
    ) {
      toast.error(
        lang === "th"
          ? "เลือกไอเดีย ตรวจเรื่อง และเพิ่มตำแหน่ง B-roll ก่อน render"
          : "Select and review an idea, then add a B-roll placement before rendering"
      );
      return;
    }
    const assetManifest = brollPlacements
      .map(
        placement =>
          brollAssets.find(
            item => item.manifest.assetId === placement.sourceMediaAssetId
          )?.manifest
      )
      .filter((asset): asset is MediaSourceManifest => Boolean(asset));
    if (
      assetManifest.length !==
      new Set(brollPlacements.map(placement => placement.sourceMediaAssetId))
        .size
    ) {
      toast.error(
        lang === "th"
          ? "ไม่พบ source ของ B-roll บางรายการ กรุณาโหลดรายการใหม่"
          : "Some B-roll sources are unavailable; refresh the list"
      );
      return;
    }
    try {
      const storyRevisionId = await sha256Fingerprint(
        JSON.stringify({
          idea: idea.trim(),
          dialogueBrief: dialogueBrief.trim(),
          dialogueMode,
          characterIds,
          selectedIdeaId,
        })
      );
      const result = await brollRenderMutation.mutateAsync({
        seriesId,
        preparedSource: preparedSource.data,
        preparedRevision: preparedSource.data.sourceRevision,
        baseDurationMs: preparedDurationMs,
        placements: brollPlacements,
        storyRevisionId,
        shotPlanRevisionId: `special-tie-in-9-shot-${storyRevisionId}`,
        assetManifest,
      });
      setBrollRenderJobId(result.job?.id ?? null);
      toast.success(
        lang === "th"
          ? "ส่งงาน render B-roll ให้ Worker แล้ว"
          : "B-roll render was sent to the Worker"
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : lang === "th"
            ? "ส่งงาน render B-roll ไม่สำเร็จ"
            : "Could not start B-roll render"
      );
    }
  };

  const generateMarketplaceIdeas = async (directionOverride?: string) => {
    const visualReferenceImages = references.map(reference => ({
      mediaAssetId: reference.mediaAssetId,
      ...(reference.source === "marketplace_capture"
        ? { imageId: String(reference.provenance?.marketplaceImageId ?? "") }
        : {}),
      label: reference.label,
    }));
    const usingMarketplaceProduct = hasMarketplaceProductContext;
    if (references.length === 0) {
      toast.error(
        lang === "th"
          ? "เลือกภาพอ้างอิงของหัวข้อรีวิวอย่างน้อย 1 ภาพก่อน"
          : "Choose at least one image reference for the review subject first"
      );
      return;
    }
    if (requiresUploadedProductBrief && !idea.trim()) {
      toast.error(
        lang === "th"
          ? "กรุณาใส่รายละเอียดสินค้าที่ตรวจสอบได้ก่อนสร้างไอเดีย"
          : "Add verifiable product details before generating ideas"
      );
      return;
    }
    if (
      footageAssetId &&
      !["completed", "published"].includes(
        footagePrepareJobQuery.data?.status ?? ""
      )
    ) {
      toast.error(
        lang === "th"
          ? "สร้าง Footage พร้อมใช้ให้เสร็จก่อนสร้างไอเดีย"
          : "Prepare the footage before generating ideas"
      );
      return;
    }
    if (characterIds.length === 0) {
      toast.error(
        lang === "th"
          ? "เลือกตัวละครที่จะใช้สร้างไอเดียอย่างน้อย 1 คน"
          : "Choose at least one character for the idea"
      );
      return;
    }
    try {
      const result = await generateIdeasMutation.mutateAsync({
        seriesId,
        productId: usingMarketplaceProduct ? selectedProductId ?? undefined : undefined,
        productSource: usingMarketplaceProduct
          ? "marketplace_capture"
          : "upload",
        referenceImages: visualReferenceImages,
        dialogueMode,
        presentationStyle,
        reviewSubjectType,
        storyStructure,
        selectedCharacterIds: characterIds.slice(0, 4),
        ...(dialogueMode === "character_dialogue" && speakerCharacterIds.length > 0
          ? { speakerCharacterIds: speakerCharacterIds.slice(0, 3) }
          : {}),
        customerJourney: usingMarketplaceProduct
          ? selectedProduct?.supportingInsights ?? undefined
          : undefined,
        footageGuide: footageGuideSchema.safeParse(footageAnalysisOutput?.guide)
          .success
          ? footageAnalysisOutput?.guide
          : undefined,
        direction:
          directionOverride !== undefined
            ? directionOverride.trim().slice(0, 2_000) || undefined
            : selectedMarketplaceIdea || !idea.trim()
              ? undefined
              : idea.trim().slice(0, 2_000),
        productBrief:
          !usingMarketplaceProduct && idea.trim()
            ? idea.trim().slice(0, 8_000)
            : undefined,
        llmModelId: ideaLlmModelId === "auto" ? undefined : ideaLlmModelId,
        variationSeed: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      });
      setIdeaGenerationJobScopeKey(result.scopeKey);
      setIdeaGenerationJobId(result.jobId);
      toast.info(
        lang === "th"
          ? "รับงานแล้ว ระบบกำลังตรวจและสร้างไอเดียครบ 9 ช็อตให้"
          : "Request accepted; the system is generating and validating all 9 shots."
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : lang === "th"
            ? "สร้างไอเดียไม่สำเร็จ"
            : "Could not generate ideas"
      );
    }
  };

  const generateIdeasFromMarketplaceProduct = () => {
    if (!selectedProduct) {
      toast.error(
        lang === "th"
          ? "เลือกสินค้าจาก Marketplace Capture ก่อน"
          : "Choose a Marketplace Capture product first"
      );
      return;
    }
    const productBrief = buildSpecialTieInMarketplaceProductBrief(selectedProduct);
    if (!productBrief.trim()) {
      toast.error(
        lang === "th"
          ? "สินค้านี้ยังไม่มีข้อมูลเพียงพอสำหรับสร้าง Product Brief"
          : "This product does not have enough information for a Product Brief"
      );
      return;
    }
    setIdea(productBrief);
    setSelectedMarketplaceIdea(null);
    void generateMarketplaceIdeas(productBrief);
  };

  const chooseMarketplaceIdea = async (
    runId: string,
    candidate: MarketplaceReviewIdea
  ) => {
    try {
      const result = await selectIdeaMutation.mutateAsync({
        seriesId,
        runId,
        ideaId: candidate.ideaId,
        ...(characterIds.length > 0
          ? { selectedCharacterIds: characterIds.slice(0, 4) }
          : {}),
      });
      const suggestions = (result.slotRequests.sceneSuggestions ??
        []) as SceneSuggestion[];
      const normalizedPrimaryLabel = candidate.scene.location
        .trim()
        .toLocaleLowerCase();
      const primaryScene = result.slotRequests.scenes.find(
        scene =>
          scene.label.trim().toLocaleLowerCase() === normalizedPrimaryLabel
      );
      setSceneSuggestions(suggestions);
      setSceneChoiceByLabel({});
      setSelectedSceneLocationKey(primaryScene?.locationKey ?? null);
      setSelectedIdeaId(candidate.ideaId);
      setSelectedMarketplaceIdea(candidate);
      setIdea(candidate.episodeStory);
      const selectedCharacterIdSet = new Set(characterIds);
      const candidateShotLines = candidate.shotDialogues.flatMap(
        shot => shot.lines
      );
      const matchedSpeakerIds = characters
        .filter(
          character =>
            selectedCharacterIdSet.has(
              resolveSpecialTieInCharacterId(character)
            ) &&
            candidateShotLines.some(line => line.speaker === character.name)
        )
        .slice(0, 3)
        .map(resolveSpecialTieInCharacterId)
        .filter(Boolean);
      setCharacterIds(current =>
        Array.from(new Set([...current, ...matchedSpeakerIds])).slice(0, 4)
      );
      setSpeakerCharacterIds(matchedSpeakerIds);
      setDialogueMode(
        candidateShotLines.length > 0 ? "character_dialogue" : "none"
      );
      const shotDrafts = candidate.shotDialogues.map(shot => ({
        shotNumber: shot.shotNumber,
        dialogueLines: shot.lines.map(line => ({
          speakerCharacterId: line.speaker,
          line: line.line,
          ...(line.delivery ? { delivery: line.delivery } : {}),
        })),
      }));
      setShotDialogueDrafts(shotDrafts);
      setDialogueBrief(
        candidateShotLines.length > 0
          ? formatShotDialogueDrafts(shotDrafts, characters)
          : candidate.dialogueScript
      );
      toast.success(
        lang === "th"
          ? `เลือกไอเดียแล้ว กรุณาเลือกฉากเดิมหรือสร้างฉากใหม่ ${suggestions.length} รายการก่อนสร้างตอน`
          : `Idea selected. Choose an existing scene or add ${suggestions.length} scene(s) before creating the episode.`
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : lang === "th"
            ? "เลือกไอเดียไม่สำเร็จ"
            : "Could not select idea"
      );
    }
  };

  const resolveSceneSuggestion = async (
    suggestion: SceneSuggestion,
    decision: "reuse" | "create",
    locationId?: string
  ) => {
    try {
      const result = await resolveSceneMutation.mutateAsync({
        seriesId,
        decision,
        ...(locationId ? { locationId: Number(locationId) } : {}),
        sceneLabel: suggestion.sceneLabel,
        description: suggestion.description,
      });
      await utils.verticalDramaLocations.list.invalidate({ seriesId });
      const normalizedLabel = suggestion.sceneLabel.trim().toLocaleLowerCase();
      if (
        selectedMarketplaceIdea?.scene.location.trim().toLocaleLowerCase() ===
        normalizedLabel
      ) {
        setSelectedSceneLocationKey(result.locationKey);
      }
      setSceneSuggestions(current =>
        current.filter(
          item => item.sceneLabel.trim().toLocaleLowerCase() !== normalizedLabel
        )
      );
      toast.success(
        lang === "th"
          ? decision === "reuse"
            ? "ใช้ฉากเดิมแล้ว"
            : "สร้างฉากใหม่แล้ว"
          : decision === "reuse"
            ? "Existing scene selected"
            : "New scene created"
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : lang === "th"
            ? "บันทึกการเลือกฉากไม่สำเร็จ"
            : "Could not save the scene decision"
      );
    }
  };

  const confirmMarketplaceImages = async () => {
    if (!selectedProductId || pendingImageIds.length === 0) return;
    if (!canAddSpecialReferences(references.length, pendingImageIds.length)) {
      toast.error(
        lang === "th"
          ? "รวมภาพอ้างอิงได้ไม่เกิน 3 ภาพ"
          : "The total number of references cannot exceed 3"
      );
      return;
    }
    setIsMaterializingReferences(true);
    try {
      const added: Reference[] = [];
      for (const imageId of pendingImageIds) {
        const result = await materializeMutation.mutateAsync({
          seriesId,
          productId: selectedProductId,
          imageId,
        });
        added.push({
          mediaAssetId: result.mediaAssetId,
          source: "marketplace_capture",
          role:
            referenceType === "location" || referenceType === "store"
              ? referenceType
              : "product",
          label: result.label,
          previewUrl:
            result.url ??
            productImages.find(image => String(image.id) === imageId)?.url,
          provenance: result.provenance,
        });
      }
      setReferences(current => [...current, ...added]);
      setPendingImageIds([]);
      setMarketplaceOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : lang === "th"
            ? "เพิ่มภาพจาก Marketplace ไม่สำเร็จ"
            : "Could not add Marketplace images"
      );
    } finally {
      setIsMaterializingReferences(false);
    }
  };

  const submit = async () => {
    if (resolveSceneMutation.isPending) {
      toast.info(
        lang === "th"
          ? "กำลังบันทึกฉากที่เลือก กรุณารอสักครู่"
          : "Saving the selected scene. Please wait."
      );
      return;
    }
    if (
      !hasResolvedSpecialTieInPrimaryScene({
        hasMarketplaceIdea: Boolean(selectedMarketplaceIdea),
        sceneLocationKey: selectedSceneLocationKey,
      })
    ) {
      toast.error(
        lang === "th"
          ? "กรุณาเลือกหรือสร้างฉากหลักก่อนสร้างตอน ส่วนฉากเสริมเป็นตัวเลือก ไม่บังคับ"
          : "Choose or create the main scene before creating the episode. Extra scenes are optional."
      );
      return;
    }
    const resolveSelectedSpeaker = (speakerValue: string) => {
      const selectedMatch = characters.find(character => {
        const id = resolveSpecialTieInCharacterId(character);
        const name = character.name ?? character.characterName ?? id;
        return (
          speakerCharacterIds.includes(id) &&
          (id === speakerValue || name === speakerValue)
        );
      });
      const fallbackMatch = characters.find(character => {
        const id = resolveSpecialTieInCharacterId(character);
        const name = character.name ?? character.characterName ?? id;
        return id === speakerValue || name === speakerValue;
      });
      const character = selectedMatch ?? fallbackMatch;
      if (!character) return null;
      const id = resolveSpecialTieInCharacterId(character);
      return { id, name: character.name ?? character.characterName ?? id };
    };
    const submittedShotDialogues =
      dialogueMode === "character_dialogue"
        ? shotDialogueDrafts.map(shot => ({
            shotNumber: shot.shotNumber,
            dialogueLines: shot.dialogueLines.map(line => {
              const character = resolveSelectedSpeaker(line.speakerCharacterId);
              if (!character) throw new Error(`ไม่พบตัวละครผู้พูด: ${line.speakerCharacterId}`);
              return {
                speakerCharacterId: character.id,
                line: line.line.trim(),
                ...(line.delivery ? { delivery: line.delivery } : {}),
              };
            }),
          }))
        : undefined;
    if (
      dialogueMode === "character_dialogue" &&
      (!submittedShotDialogues || !hasCompleteShotDialogueDrafts(shotDialogueDrafts))
    ) {
      toast.error(
        lang === "th"
          ? "บทพูดต้องครบ 9 ช็อต โดยแต่ละช็อตมี 1–3 บรรทัด"
          : "Dialogue must cover all 9 shots with 1–3 lines per shot"
      );
      return;
    }
    const reviewedMarketplaceIdea = selectedMarketplaceIdea
      ? {
          ...selectedMarketplaceIdea,
          episodeStory: idea.trim(),
          dialogueScript:
            dialogueMode === "character_dialogue"
              ? formatShotDialogueDrafts(shotDialogueDrafts, characters)
              : "",
          dialogue:
            dialogueMode === "character_dialogue"
              ? limitSpecialTieInDialogueLines(
                  shotDialogueDrafts.flatMap(shot =>
                    shot.dialogueLines.map(line => ({
                    speaker:
                      resolveSelectedSpeaker(line.speakerCharacterId)?.name ??
                      line.speakerCharacterId,
                    line: line.line.trim(),
                    ...(line.delivery ? { delivery: line.delivery } : {}),
                    }))
                  )
                )
              : [],
          shotDialogues:
            dialogueMode === "character_dialogue"
              ? shotDialogueDrafts.map(shot => ({
                  shotNumber: shot.shotNumber,
                  lines: shot.dialogueLines.map(line => ({
                    speaker:
                      resolveSelectedSpeaker(line.speakerCharacterId)?.name ??
                      line.speakerCharacterId,
                    line: line.line.trim(),
                    ...(line.delivery ? { delivery: line.delivery } : {}),
                  })),
                }))
              : Array.from({ length: 9 }, (_, index) => ({
                  shotNumber: index + 1,
                  lines: [],
                })),
        }
      : undefined;
    const storyRevisionId = selectedMarketplaceIdea
      ? await sha256Fingerprint(
          JSON.stringify({
            idea: idea.trim(),
            dialogueBrief: dialogueBrief.trim(),
            dialogueMode,
            characterIds,
            selectedIdeaId,
          })
        )
      : null;
    const parsed = specialTieInInputSchema.safeParse({
      schemaVersion: 1,
      idea,
      referenceType,
      referenceImages: references,
      characterIds,
      durationSeconds,
      aspectRatio: "9:16",
      imageModelId,
      videoModelId,
      dialogueMode,
      dialogueBrief:
        dialogueMode === "character_dialogue"
          ? formatShotDialogueDrafts(shotDialogueDrafts, characters)
          : undefined,
      speakerCharacterIds,
      shotDialogues: submittedShotDialogues,
      allowAdditionalCharacters,
      lockCharacterReferences,
      lockReferenceImages,
      sceneLocationKey: selectedSceneLocationKey ?? undefined,
      marketplaceReviewIdea: reviewedMarketplaceIdea,
      footage: (() => {
        const guide = footageGuideSchema.safeParse(
          footageAnalysisOutput?.guide
        );
        if (
          !footageAssetId ||
          !footageAnalysisJobId ||
          !footagePrepareJobId ||
          !guide.success
        )
          return undefined;
        return {
          sourceMediaAssetId: `media-${footageAssetId}`,
          analysisJobId: footageAnalysisJobId,
          prepareJobId: footagePrepareJobId,
          sourceRevision: guide.data.sourceRevision,
          guide: guide.data,
        };
      })(),
      broll: (() => {
        if (!preparedSource.success || brollPlacements.length === 0)
          return undefined;
        const assetManifest = brollPlacements
          .map(
            placement =>
              brollAssets.find(
                asset => asset.manifest.assetId === placement.sourceMediaAssetId
              )?.manifest
          )
          .filter((asset): asset is MediaSourceManifest => Boolean(asset));
        if (
          assetManifest.length !==
          new Set(
            brollPlacements.map(placement => placement.sourceMediaAssetId)
          ).size
        )
          return undefined;
        return {
          preparedSource: preparedSource.data,
          preparedRevision: preparedSource.data.sourceRevision,
          baseDurationMs: preparedDurationMs,
          placements: brollPlacements,
          storyRevisionId: storyRevisionId ?? "special-tie-in-story-reviewed",
          shotPlanRevisionId: `special-tie-in-9-shot-${storyRevisionId ?? "reviewed"}`,
          assetManifest,
          renderJobId: brollRenderJobId ?? undefined,
        };
      })(),
    });
    if (!parsed.success) {
      toast.error(
        parsed.error.issues[0]?.message ??
          (lang === "th"
            ? "กรอกข้อมูลให้ครบถ้วน"
            : "Complete the required fields")
      );
      return;
    }
    if (
      selectedProductId &&
      references.some(reference => reference.source === "marketplace_capture")
    ) {
      void ensureCommercialObjectReferenceMutation
        .mutateAsync({
          seriesId,
          name: selectedProduct?.productName?.trim() || "Marketplace product",
          marketplaceProductId: selectedProductId,
          mediaAssetIds: references
            .filter(reference => reference.source === "marketplace_capture")
            .map(reference => reference.mediaAssetId),
        })
        .catch(error => {
          console.warn("[special-tie-in] object catalog bridge skipped", error);
        });
    }
    setIsSubmitting(true);
    try {
      if (onSubmitInput) {
        await onSubmitInput(parsed.data);
        toast.success(
          lang === "th"
            ? "บันทึกโจทย์แล้ว ระบบกำลังสร้าง prompt ใหม่"
            : "Brief saved; prompts are being regenerated"
        );
        onOpenChange(false);
        return;
      }
      const result = await createMutation.mutateAsync({
        seriesId,
        createIntentId: crypto.randomUUID(),
        input: parsed.data,
      });
      // The new episode's idea run is now the latest resumable work. Mark the
      // cached list stale so a later explicit "โหลดงานเดิม" cannot reuse an
      // older snapshot from before this episode was created.
      void utils.verticalDramaEpisodes.listMarketplaceReviewIdeas.invalidate({
        seriesId,
      });
      toast.success(
        lang === "th"
          ? "สร้างตอนพิเศษแล้ว ระบบกำลังสร้าง prompt"
          : "Special episode created; prompts are being generated"
      );
      onOpenChange(false);
      clearSpecialTieInEpisodeDraft(draftKey);
      setDraftRestoredAt(null);
      onCreated?.(String(result.episodeId));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : lang === "th"
            ? "สร้างตอนพิเศษไม่สำเร็จ"
            : "Could not create special episode"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const requestSubmitConfirmation = () => {
    if (resolveSceneMutation.isPending) {
      toast.info(
        lang === "th"
          ? "กำลังบันทึกฉากที่เลือก กรุณารอสักครู่"
          : "Saving the selected scene. Please wait."
      );
      return;
    }
    if (
      !hasResolvedSpecialTieInPrimaryScene({
        hasMarketplaceIdea: Boolean(selectedMarketplaceIdea),
        sceneLocationKey: selectedSceneLocationKey,
      })
    ) {
      toast.error(
        lang === "th"
          ? "กรุณาเลือกหรือสร้างฉากหลักก่อนสร้างตอน ส่วนฉากเสริมเป็นตัวเลือก ไม่บังคับ"
          : "Choose or create the main scene before creating the episode. Extra scenes are optional."
      );
      return;
    }
    const isEdit = Boolean(onSubmitInput);
    requestConfirmation({
      title:
        lang === "th"
          ? isEdit
            ? "ยืนยันบันทึกและสร้าง Prompt ใหม่"
            : "ยืนยันสร้างตอนพิเศษและ Prompt"
          : isEdit
            ? "Confirm save and regenerate prompts"
            : "Confirm special episode and prompt creation",
      description:
        lang === "th"
          ? `ระบบจะ${isEdit ? "บันทึกข้อมูลและสร้าง Prompt ใหม่" : "สร้างตอนพิเศษและสร้าง Prompt"} โดยใช้ตัวละคร ${characterIds.length} คน ภาพอ้างอิง ${references.length} ภาพ ความยาวช็อตละ ${durationSeconds} วินาที${selectedMarketplaceIdea?.title ? ` จากไอเดีย “${selectedMarketplaceIdea.title}”` : ""} ต้องการดำเนินการต่อหรือไม่?`
          : `${isEdit ? "The brief will be saved and prompts regenerated" : "A special episode and prompts will be created"} with ${characterIds.length} character(s), ${references.length} reference image(s), and ${durationSeconds}-second shots${selectedMarketplaceIdea?.title ? ` from “${selectedMarketplaceIdea.title}”` : ""}. Continue?`,
      confirmLabel: lang === "th" ? "ยืนยันและดำเนินการ" : "Confirm and continue",
      cancelLabel: lang === "th" ? "ยกเลิก" : "Cancel",
      testId: "special-tie-in-submit-confirmation",
      onConfirm: () => void submit(),
    });
  };

  const reset = () => {
    setIdea("");
    setPresentationStyle("varied");
    setReviewSubjectType("product");
    setStoryStructure("varied");
    setReferenceType("product");
    setReferences([]);
    setCharacterIds([]);
    setSpeakerCharacterIds([]);
    setDurationSeconds(10);
    setDialogueMode(DEFAULT_SPECIAL_TIE_IN_DIALOGUE_MODE);
    setDialogueBrief("");
    setShotDialogueDrafts([]);
    setAllowAdditionalCharacters(false);
    setLockCharacterReferences(true);
    setLockReferenceImages(true);
    setImageModelId("");
    setVideoModelId("");
    setIdeaLlmModelId("auto");
    setMarketplaceOpen(false);
    setProductQuery("");
    setPendingImageIds([]);
    setSelectedProductId(null);
    setSelectedLocationId(null);
    setIsSubmitting(false);
    setIsMaterializingReferences(false);
    setIdeaHistory([]);
    setIdeaGenerationJobId(null);
    setIdeaGenerationJobScopeKey(null);
    setFreshIdeaRunId(null);
    setShowIdeaHistory(false);
    historyHydratedRef.current = false;
    setSelectedIdeaId(null);
    setSelectedMarketplaceIdea(null);
    setSceneSuggestions([]);
    setSceneChoiceByLabel({});
    setSelectedSceneLocationKey(null);
    setFootageAssetId(null);
    setFootageFileName("");
    setFootagePreviewUrl(null);
    setFootageAnalysisJobId(null);
    setFootagePrepareJobId(null);
    setFootageTrimStartMs(0);
    setFootageTrimEndMs(0);
    setFootageFullscreen(false);
    setBrollAssetId("");
    setBrollStartMs(0);
    setBrollEndMs(5000);
    setBrollSourceInMs(0);
    setBrollPlacements([]);
    setBrollRenderJobId(null);
    setBrollFullscreen(false);
    setLightbox(null);
  };

  const discardSavedDraft = () => {
    clearSpecialTieInEpisodeDraft(draftKey);
    reset();
    historyHydratedRef.current = true;
    setDraftRestoredAt(null);
    setDraftSaved(true);
    setDraftHydratedKey(draftKey);
  };

  const addExistingLocationAsset = (asset: {
    mediaAssetId: string;
    url?: string | null;
    role?: string | null;
  }) => {
    if (!canAddSpecialReferences(references.length)) return;
    if (
      references.some(
        reference => reference.mediaAssetId === asset.mediaAssetId
      )
    )
      return;
    const role = referenceType === "store" ? "store" : "location";
    setReferences(current => [
      ...current,
      {
        mediaAssetId: asset.mediaAssetId,
        source: "series_asset",
        role,
        label: selectedLocation?.name ?? role,
        previewUrl: asset.url ?? undefined,
        provenance: {
          source: "series_location",
          locationId: selectedLocationId,
          locationKey: selectedLocation?.locationKey,
          approved: true,
        },
      },
    ]);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={value => {
        if (!value) {
          if (
            !isEditingExistingEpisode &&
            draftKey &&
            draftHydratedKey === draftKey
          ) {
            setDraftSaved(writeSpecialTieInEpisodeDraft(draftKey, draftValues));
          }
          reset();
          setDraftHydratedKey(null);
          setDraftRestoredAt(null);
          setDraftSaved(null);
        }
        onOpenChange(value);
      }}
    >
      <>
        <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-2rem)] max-w-none overflow-y-auto p-4 sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)] sm:p-6 lg:w-[96vw] lg:max-w-[96vw] xl:w-[94vw] xl:max-w-[94vw]">
        <DialogHeader>
          <DialogTitle>
            {lang === "th"
              ? "สร้างตอนพิเศษ Tie-in"
              : "Create special tie-in episode"}
          </DialogTitle>
          <DialogDescription>
            {lang === "th"
              ? "ใช้สำหรับสินค้า สถานที่ หรือร้านค้า ระบบจะสร้าง prompt ภาพเริ่มต้นและวิดีโอให้อัตโนมัติ โดยไม่ดึงเนื้อเรื่องจากภาพรวม"
              : "For product, location, or store tie-ins. Prompts for start frames and video are generated automatically without using the normal Overview story."}
          </DialogDescription>
        </DialogHeader>

        {!isEditingExistingEpisode &&
        Boolean(draftKey) &&
        draftHydratedKey === draftKey &&
        (draftRestoredAt !== null ||
          hasMeaningfulSpecialTieInDraft(draftValues)) ? (
          <section
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs"
            role="status"
          >
            <p className="text-muted-foreground">
              {draftSaved === false
                ? lang === "th"
                  ? "บันทึกฉบับร่างในเบราว์เซอร์นี้ไม่สำเร็จ"
                  : "This browser could not save the draft"
                : draftSaved === null
                  ? lang === "th"
                    ? "กำลังบันทึกฉบับร่างอัตโนมัติ..."
                    : "Saving draft automatically…"
                  : draftRestoredAt !== null
                    ? lang === "th"
                      ? "กู้คืนฉบับร่างแล้ว · บันทึกอัตโนมัติในเบราว์เซอร์นี้"
                      : "Draft restored · automatically saved in this browser"
                    : lang === "th"
                      ? "บันทึกฉบับร่างอัตโนมัติในเบราว์เซอร์นี้แล้ว"
                      : "Draft is saved automatically in this browser"}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={discardSavedDraft}
            >
              {lang === "th" ? "ล้างฉบับร่าง" : "Discard draft"}
            </Button>
          </section>
        ) : null}

        <section
          className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3"
          aria-labelledby="special-tie-in-footage-heading"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 id="special-tie-in-footage-heading" className="font-medium">
                {lang === "th" ? "Footage จริงของผู้ใช้" : "Your real footage"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {lang === "th"
                  ? "อัปโหลดก่อน แล้วให้ Worker วิเคราะห์/ตัดช่วงที่เลือก เพื่อให้เรื่อง Tie-in สอดคล้องกับภาพจริง"
                  : "Upload first, then let the Worker analyze and prepare the usable footage before writing the tie-in story."}
              </p>
            </div>
            <Badge
              variant={footagePrepared ? "secondary" : "outline"}
              role="status"
            >
              {footagePrepared
                ? lang === "th"
                  ? "พร้อมใช้"
                  : "Prepared"
                : footageAnalysisJobId
                  ? lang === "th"
                    ? "กำลังทำงาน"
                    : "Processing"
                  : lang === "th"
                    ? "ยังไม่มี footage"
                    : "No footage"}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={
                uploadMutation.isPending || registerUploadMutation.isPending
              }
              onClick={() =>
                document
                  .getElementById("special-tie-in-footage-upload")
                  ?.click()
              }
            >
              <Upload className="mr-2 h-4 w-4" />
              {lang === "th" ? "อัปโหลด Footage จริง" : "Upload real footage"}
            </Button>
            <input
              id="special-tie-in-footage-upload"
              className="hidden"
              type="file"
              accept="video/*"
              onChange={event => {
                const file = event.target.files?.[0];
                event.currentTarget.value = "";
                if (file)
                  void uploadFootage(file).catch(error =>
                    toast.error(
                      error instanceof Error ? error.message : "Upload failed"
                    )
                  );
              }}
            />
            {footageAssetId ? (
              <Button
                type="button"
                variant="secondary"
                disabled={footageAnalysisMutation.isPending}
                onClick={() =>
                  void analyzeFootage().catch(error =>
                    toast.error(
                      error instanceof Error ? error.message : "Analysis failed"
                    )
                  )
                }
              >
                {footageAnalysisMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {lang === "th" ? "วิเคราะห์ Footage" : "Analyze footage"}
              </Button>
            ) : null}
          </div>
          {footagePreviewUrl ? (
            <div className="grid gap-3 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
              <div className="relative overflow-hidden rounded-md border bg-black">
                <video
                  className="aspect-[9/16] max-h-64 w-full object-contain"
                  src={footagePreviewUrl}
                  controls
                  preload="metadata"
                  aria-label={footageFileName || "Footage preview"}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="absolute right-2 top-2"
                  onClick={() => setFootageFullscreen(true)}
                >
                  <Expand className="mr-1 h-3.5 w-3.5" />
                  {lang === "th" ? "ดูเต็มจอ" : "Fullscreen"}
                </Button>
              </div>
              <div className="space-y-3 text-sm">
                <p className="truncate font-medium">{footageFileName}</p>
                <p className="text-xs text-muted-foreground" role="status">
                  {footageAnalysisJobQuery.data
                    ? `${lang === "th" ? "ผลวิเคราะห์" : "Analysis"}: ${footageAnalysisJobQuery.data.status}`
                    : lang === "th"
                      ? "ยังไม่ได้วิเคราะห์"
                      : "Not analyzed yet"}
                </p>
                {footageAnalysisDone ? (
                  <div className="space-y-2 rounded-md border p-2">
                    <p className="text-xs">
                      {lang === "th"
                        ? "ช่วงตัดหลัก (มิลลิวินาที)"
                        : "Primary trim window (milliseconds)"}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        aria-label={
                          lang === "th"
                            ? "เริ่มต้น footage มิลลิวินาที"
                            : "Footage start milliseconds"
                        }
                        type="number"
                        min={0}
                        value={footageTrimStartMs}
                        onChange={event =>
                          setFootageTrimStartMs(
                            Math.max(0, Number(event.target.value) || 0)
                          )
                        }
                      />
                      <Input
                        aria-label={
                          lang === "th"
                            ? "สิ้นสุด footage มิลลิวินาที"
                            : "Footage end milliseconds"
                        }
                        type="number"
                        min={1000}
                        value={footageTrimEndMs || footageDurationMs || ""}
                        onChange={event =>
                          setFootageTrimEndMs(
                            Math.max(0, Number(event.target.value) || 0)
                          )
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        footagePrepareMutation.isPending || footagePrepared
                      }
                      onClick={() =>
                        void prepareFootage().catch(error =>
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : "Preparation failed"
                          )
                        )
                      }
                    >
                      {footagePrepareMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      {footagePrepared
                        ? lang === "th"
                          ? "Footage พร้อมใช้แล้ว"
                          : "Footage prepared"
                        : lang === "th"
                          ? "สร้าง Footage พร้อมใช้"
                          : "Prepare footage"}
                    </Button>
                  </div>
                ) : null}
                {footageAnalysisOutput?.guide?.status?.warnings?.length ? (
                  <p
                    className="text-xs text-amber-700 dark:text-amber-400"
                    role="alert"
                  >
                    {lang === "th"
                      ? "ผลวิเคราะห์บางส่วนยังไม่สมบูรณ์ ระบบจะแนบคำเตือนไปกับไอเดีย"
                      : "Some analysis is partial; its warnings remain attached to the idea input."}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>

        {footagePrepared && preparedSource.success ? (
          <section
            className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3"
            aria-labelledby="special-tie-in-broll-heading"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 id="special-tie-in-broll-heading" className="font-medium">
                  {lang === "th"
                    ? "วางวีดีโอ B-roll จาก AI/คลังวีดีโอ"
                    : "Place AI/library video B-roll"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {lang === "th"
                    ? `เลือกวีดีโอแล้วกำหนดจุดเริ่ม–จบใน Footage ที่ตัดแล้ว (${(preparedDurationMs / 1000).toFixed(1)} วินาที) ระบบจะส่งงานหนักให้ Worker`
                    : `Choose a video and set its start/end on the prepared footage (${(preparedDurationMs / 1000).toFixed(1)}s). Heavy rendering runs on the Worker.`}
                </p>
              </div>
              <Badge variant="outline">{brollPlacements.length}/32</Badge>
            </div>
            <div className="grid gap-2 md:grid-cols-[minmax(0,1.4fr)_minmax(7rem,0.6fr)_minmax(7rem,0.6fr)_minmax(7rem,0.6fr)_auto] md:items-end">
              <div className="space-y-1">
                <Label htmlFor="special-tie-in-broll-source">
                  {lang === "th" ? "วีดีโอ B-roll" : "B-roll video"}
                </Label>
                <select
                  id="special-tie-in-broll-source"
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={brollAssetId}
                  onChange={event => setBrollAssetId(event.target.value)}
                  disabled={
                    brollAssetsQuery.isLoading || brollAssets.length === 0
                  }
                >
                  <option value="">
                    {brollAssetsQuery.isLoading
                      ? lang === "th"
                        ? "กำลังโหลด…"
                        : "Loading…"
                      : lang === "th"
                        ? "เลือกวีดีโอที่พร้อมใช้"
                        : "Select an available video"}
                  </option>
                  {brollAssets.map(asset => (
                    <option
                      key={asset.manifest.assetId}
                      value={asset.manifest.assetId}
                    >
                      {asset.manifest.fileName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="special-tie-in-broll-start">
                  {lang === "th" ? "เริ่ม (ms)" : "Start (ms)"}
                </Label>
                <Input
                  id="special-tie-in-broll-start"
                  type="number"
                  min={0}
                  max={Math.max(0, preparedDurationMs - 1000)}
                  value={brollStartMs}
                  onChange={event =>
                    setBrollStartMs(Number(event.target.value) || 0)
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="special-tie-in-broll-end">
                  {lang === "th" ? "จบ (ms)" : "End (ms)"}
                </Label>
                <Input
                  id="special-tie-in-broll-end"
                  type="number"
                  min={1000}
                  max={preparedDurationMs}
                  value={brollEndMs}
                  onChange={event =>
                    setBrollEndMs(Number(event.target.value) || 0)
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="special-tie-in-broll-source-in">
                  {lang === "th" ? "เริ่ม source (ms)" : "Source in (ms)"}
                </Label>
                <Input
                  id="special-tie-in-broll-source-in"
                  type="number"
                  min={0}
                  value={brollSourceInMs}
                  onChange={event =>
                    setBrollSourceInMs(Number(event.target.value) || 0)
                  }
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={addBrollPlacement}
                disabled={!brollAssetId || brollAssetsQuery.isError}
              >
                <span aria-hidden="true">+</span>
                {lang === "th" ? "เพิ่มช่วง" : "Add"}
              </Button>
            </div>
            {brollAssetsQuery.isError ? (
              <p className="text-xs text-destructive" role="alert">
                {lang === "th"
                  ? "โหลดวีดีโอ B-roll ไม่สำเร็จ กรุณาลองใหม่"
                  : "Could not load B-roll videos. Try again."}
              </p>
            ) : null}
            {brollAssets.length === 0 &&
            !brollAssetsQuery.isLoading &&
            !brollAssetsQuery.isError ? (
              <p className="text-xs text-muted-foreground" role="status">
                {lang === "th"
                  ? "ยังไม่พบวีดีโอที่เป็น managed media และมี checksum สำหรับใช้เป็น B-roll"
                  : "No managed, checksum-backed videos are available for B-roll."}
              </p>
            ) : null}
            {brollPlacements.length > 0 ? (
              <div className="space-y-2 rounded-md border bg-background p-2">
                <p className="text-xs font-medium">
                  {lang === "th" ? "ตำแหน่งที่เลือก" : "Selected placements"}
                </p>
                {brollPlacements.map((placement, index) => (
                  <div
                    key={placement.storyBeatId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border px-2 py-1 text-xs"
                  >
                    <span>
                      {index + 1}.{" "}
                      {brollAssets.find(
                        asset =>
                          asset.manifest.assetId ===
                          placement.sourceMediaAssetId
                      )?.manifest.fileName ?? placement.sourceMediaAssetId}
                    </span>
                    <span>
                      {placement.startMs}–{placement.endMs} ms
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setBrollPlacements(current =>
                          current.filter(
                            item => item.storyBeatId !== placement.storyBeatId
                          )
                        )
                      }
                    >
                      {lang === "th" ? "ลบ" : "Remove"}
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => void renderBroll()}
                disabled={
                  brollRenderMutation.isPending ||
                  brollPlacements.length === 0 ||
                  !selectedMarketplaceIdea
                }
              >
                {brollRenderMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {lang === "th"
                  ? "Render B-roll ตามเรื่องที่ตรวจแล้ว"
                  : "Render B-roll for reviewed story"}
              </Button>
              {!selectedMarketplaceIdea ? (
                <span className="text-xs text-amber-700 dark:text-amber-400">
                  {lang === "th"
                    ? "ต้องเลือกและตรวจไอเดียละครก่อน"
                    : "Select and review a series idea first."}
                </span>
              ) : null}
              {brollRenderJobQuery.data ? (
                <span className="text-xs text-muted-foreground" role="status">
                  {lang === "th"
                    ? `สถานะ Worker: ${brollRenderJobQuery.data.status}`
                    : `Worker status: ${brollRenderJobQuery.data.status}`}
                </span>
              ) : null}
            </div>
            {brollOutputUrl ? (
              <div className="relative max-w-sm overflow-hidden rounded-md border bg-black">
                <video
                  className="aspect-[9/16] max-h-80 w-full object-contain"
                  src={brollOutputUrl}
                  controls
                  preload="metadata"
                  aria-label="Rendered B-roll preview"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="absolute right-2 top-2"
                  onClick={() => setBrollFullscreen(true)}
                >
                  <Expand className="mr-1 h-3.5 w-3.5" />
                  {lang === "th" ? "ดูเต็มจอ" : "Fullscreen"}
                </Button>
              </div>
            ) : null}
          </section>
        ) : null}

        <div className="space-y-5 md:grid md:grid-cols-12 md:gap-6 md:space-y-0">
          <div className="space-y-5 md:col-span-7">
            <div className="space-y-2">
              <Label htmlFor="special-tie-in-idea">
                {selectedMarketplaceIdea
                  ? lang === "th"
                    ? "เรื่องละคร (แก้ไขได้ก่อนสร้าง 9 ช็อต)"
                    : "Episode story (edit before creating 9 shots)"
                  : lang === "th"
                    ? "ไอเดียหรือโจทย์"
                    : "Idea or brief"}
              </Label>
              {selectedMarketplaceIdea ? (
                <p className="text-xs text-muted-foreground">
                  {lang === "th"
                    ? "ตรวจความต่อเนื่องของเหตุการณ์ การกระทำ และการ tie-in ให้เรียบร้อยก่อนสร้างตอนพิเศษและ Prompt"
                    : "Review the story flow, actions, and tie-in before creating the special episode and prompts."}
                </p>
              ) : null}
              <Textarea
                id="special-tie-in-idea"
                value={idea}
                onChange={event => setIdea(event.target.value)}
                maxLength={12000}
                rows={selectedMarketplaceIdea ? 12 : 6}
                placeholder={
                  lang === "th"
                    ? selectedMarketplaceIdea
                      ? "เรื่องละครที่เลือกจะแสดงตรงนี้ แก้ไขเนื้อหาได้ก่อนสร้าง 9 ช็อต…"
                      : "ระบุทิศทางเรื่องหรือข้อเท็จจริงที่ยืนยันได้เพิ่มเติม (ไม่บังคับ)…"
                    : "Describe what should happen in the special episode…"
                }
              />
              {!selectedMarketplaceIdea ? (
                <p className="text-xs text-muted-foreground">
                  {lang === "th"
                    ? requiresUploadedProductBrief
                      ? "สำหรับสินค้าแนบภาพอัปโหลด กรุณาระบุข้อมูลสินค้าใต้ภาพที่ยืนยันได้ ส่วนร้าน สถานที่ แอป และวัตถุชนิดอื่นสามารถเว้นว่างได้ ระบบจะไม่เดาราคา เวลาเปิดบริการ ฟีเจอร์ หรือข้อเท็จจริงที่มองไม่เห็น"
                      : "แนบภาพได้หลายมุมและเว้นช่องนี้ว่างได้ ระบบจะใช้ภาพเป็น reference ในขั้นสร้างภาพ และไม่เดาราคา เวลาเปิดบริการ ฟีเจอร์ หรือข้อเท็จจริงที่มองไม่เห็น"
                    : requiresUploadedProductBrief
                      ? "For uploaded product images, provide verifiable product details. Other subjects such as places, restaurants, apps, and objects can use image-only references."
                      : "Attach multiple angles or leave this blank. Images are forwarded as visual references; the system will not guess unseen prices, hours, features, or facts."
                  }
                </p>
              ) : null}
              <p className="text-right text-xs text-muted-foreground">
                {idea.length}/12000
              </p>
            </div>

            {selectedMarketplaceIdea ? (
              <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
                <Label htmlFor="special-tie-in-dialogue-script">
                  {lang === "th"
                    ? "บทสนทนารวมทั้ง 9 ช็อต (อ่านต่อเนื่องก่อนสร้าง storyboard)"
                    : "Complete dialogue across all nine shots (review before storyboard creation)"}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {lang === "th"
                    ? "AI จะอ่านบททั้ง 9 ช็อตต่อเนื่องก่อนแสดงให้ตรวจ คุณแก้ข้อความในช่องของแต่ละช็อตด้านล่างได้ บทที่แก้จะอัปเดตภาพรวมและถูกใช้สร้าง storyboard โดยตรง ไม่มีคะแนนความเป็นธรรมชาติมาขวางการสร้าง"
                    : "AI reviews all nine shots as one scene before showing the draft. Edit any line in its shot field below; the overview updates and the edited dialogue goes directly into the storyboard. No naturalness score blocks creation."}
                </p>
                <Textarea
                  id="special-tie-in-dialogue-script"
                  value={dialogueBrief}
                  readOnly
                  maxLength={12000}
                  rows={10}
                  placeholder={
                    lang === "th"
                      ? "พิมพ์ชนก: (ก้มเก็บของเล่น) ...\nลุงชาญ: ลองชิ้นนี้ดูไหม"
                      : "Character: (stage direction) ..."
                  }
                />
                <p className="text-right text-xs text-muted-foreground">
                  {dialogueBrief.length}/12000
                </p>
              </div>
            ) : null}

            {selectedMarketplaceIdea && dialogueMode === "character_dialogue" ? (
              <div className="space-y-3 rounded-md border border-primary/40 bg-primary/5 p-3">
                <div>
                  <Label>
                    {lang === "th"
                      ? "แก้ไขบทพูดรายช็อตก่อนสร้าง storyboard"
                      : "Edit dialogue by shot before storyboard creation"}
                  </Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {lang === "th"
                      ? "ตรวจลำดับและบริบทของทั้งฉาก แล้วแก้รายละเอียดรายช็อตได้ บทฉบับล่าสุดจะถูกส่งต่อโดยตรง"
                      : "Review the full scene flow, then fine-tune any shot. The latest dialogue is sent directly to storyboard creation."}
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {shotDialogueDrafts.map((shot, shotIndex) => (
                    <div key={shot.shotNumber} className="space-y-2 rounded-md border bg-background p-3">
                      <p className="text-sm font-medium">
                        {lang === "th" ? `ช็อต ${shot.shotNumber}` : `Shot ${shot.shotNumber}`}
                      </p>
                      {shot.dialogueLines.map((line, lineIndex) => (
                        <div key={`${shot.shotNumber}-${lineIndex}`} className="space-y-1">
                          <p className="text-xs text-muted-foreground">
                            {dialogueSpeakerLabel(
                              line.speakerCharacterId,
                              characters
                            )}
                          </p>
                          <Textarea
                            value={line.line}
                            rows={2}
                            maxLength={2000}
                            onChange={event => {
                              const updatedDrafts = updateShotDialogueLine(
                                shotDialogueDrafts,
                                shotIndex,
                                lineIndex,
                                event.target.value
                              );
                              setShotDialogueDrafts(updatedDrafts);
                              setDialogueBrief(
                                formatShotDialogueDrafts(
                                  updatedDrafts,
                                  characters
                                )
                              );
                            }}
                          />
                          {shot.dialogueLines.length > 1 ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                const updatedDrafts = shotDialogueDrafts.map(
                                  (currentShot, currentShotIndex) =>
                                    currentShotIndex !== shotIndex
                                      ? currentShot
                                      : {
                                          ...currentShot,
                                          dialogueLines:
                                            currentShot.dialogueLines.filter(
                                              (_, currentLineIndex) =>
                                                currentLineIndex !== lineIndex
                                            ),
                                        }
                                );
                                setShotDialogueDrafts(updatedDrafts);
                                setDialogueBrief(
                                  formatShotDialogueDrafts(
                                    updatedDrafts,
                                    characters
                                  )
                                );
                              }}
                            >
                              <Trash2 className="mr-1 h-3.5 w-3.5" />
                              {lang === "th" ? "ลบบรรทัด" : "Remove line"}
                            </Button>
                          ) : null}
                        </div>
                      ))}
                      {shot.dialogueLines.length < 3 ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const lastSpeakerId =
                              shot.dialogueLines.at(-1)?.speakerCharacterId ??
                              speakerCharacterIds[0] ??
                              "";
                            const nextSpeakerId =
                              speakerCharacterIds.find(
                                speakerId => speakerId !== lastSpeakerId
                              ) ?? lastSpeakerId;
                            const updatedDrafts = shotDialogueDrafts.map(
                              (currentShot, currentShotIndex) =>
                                currentShotIndex !== shotIndex
                                  ? currentShot
                                  : {
                                      ...currentShot,
                                      dialogueLines: [
                                        ...currentShot.dialogueLines,
                                        {
                                          speakerCharacterId: nextSpeakerId,
                                          line: "",
                                        },
                                      ],
                                    }
                            );
                            setShotDialogueDrafts(updatedDrafts);
                            setDialogueBrief(
                              formatShotDialogueDrafts(
                                updatedDrafts,
                                characters
                              )
                            );
                          }}
                        >
                          <Plus className="mr-1 h-3.5 w-3.5" />
                          {lang === "th" ? "เพิ่มบรรทัด" : "Add line"}
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
                {!hasCompleteShotDialogueDrafts(shotDialogueDrafts) ? (
                  <p className="text-xs font-medium text-destructive">
                    {lang === "th"
                      ? "บทพูดยังไม่ครบทั้ง 9 ช็อต หรือมีบรรทัดที่ยังว่าง"
                      : "Dialogue is incomplete: fill every line across all 9 shots."}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>
                {lang === "th" ? "ประเภทสิ่งอ้างอิง" : "Reference type"}
              </Label>
              <Select
                value={referenceType}
                onValueChange={value => {
                  const nextType = value as ReferenceType;
                  setReferenceType(nextType);
                  const role = referenceRoleForType(nextType);
                  if (role) {
                    setReferences(current =>
                      current.map(reference => ({ ...reference, role }))
                    );
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="product">
                    {lang === "th" ? "สินค้า" : "Product"}
                  </SelectItem>
                  <SelectItem value="location">
                    {lang === "th" ? "สถานที่" : "Location"}
                  </SelectItem>
                  <SelectItem value="store">
                    {lang === "th" ? "ร้านค้า" : "Store"}
                  </SelectItem>
                  <SelectItem value="mixed">
                    {lang === "th" ? "ผสม" : "Mixed"}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div
              className="space-y-2"
              onDragOver={event => event.preventDefault()}
              onDrop={event => {
                event.preventDefault();
                const files = Array.from(event.dataTransfer.files ?? []);
                if (files.length) void uploadReferenceFiles(files);
              }}
            >
              <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                {lang === "th"
                  ? "ลากภาพหลายมุมมาวางที่นี่ หรือเลือกหลายภาพจากเครื่อง/Marketplace Capture"
                  : "Drop multiple angles here, or choose several images from your device/Marketplace Capture"}
              </p>
              <div className="flex items-center justify-between">
                <Label>
                  {lang === "th"
                    ? "ภาพอ้างอิงหัวข้อ (สินค้า/วัตถุ/ร้าน/สถานที่/หน้าจอ)"
                    : "Review references (product/object/venue/place/screens)"}
                </Label>
                <Badge variant="outline">{references.length}/3</Badge>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {references.map(reference => (
                  <div
                    key={reference.mediaAssetId}
                    className="flex items-center justify-between rounded-md border p-2 text-xs md:flex-col md:items-stretch"
                  >
                    {reference.previewUrl ? (
                      <div className="relative">
                        <AuthenticatedMediaImage
                          src={reference.previewUrl}
                          alt={reference.label ?? reference.source}
                          className="mr-2 h-24 w-24 shrink-0 rounded object-cover md:mb-2 md:mr-0 md:h-44 md:w-full"
                          loadingLabel={
                            lang === "th"
                              ? "กำลังโหลดภาพ..."
                              : "Loading image..."
                          }
                          errorLabel={
                            lang === "th"
                              ? "โหลดภาพไม่สำเร็จ"
                              : "Image unavailable"
                          }
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="secondary"
                          className="absolute right-2 top-2 h-10 w-10"
                          aria-label={
                            lang === "th"
                              ? "ขยายภาพเต็มจอ"
                              : "Open image fullscreen"
                          }
                          title={
                            lang === "th"
                              ? "ขยายภาพเต็มจอ"
                              : "Open image fullscreen"
                          }
                          onClick={() =>
                            setLightbox({
                              src: reference.previewUrl!,
                              alt: reference.label ?? reference.source,
                            })
                          }
                        >
                          <Expand className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <ImagePlus
                        aria-hidden="true"
                        className="mr-2 h-5 w-5 shrink-0 text-muted-foreground"
                      />
                    )}
                    <span className="min-w-0 truncate md:block">
                      {reference.label ?? reference.source}
                      <span className="block text-[10px] text-muted-foreground">
                        {reference.source === "marketplace_capture"
                          ? "Marketplace Capture"
                          : reference.source === "series_asset"
                            ? "Scenes"
                            : lang === "th"
                              ? "อัปโหลด"
                              : "Upload"}
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="md:self-end"
                      onClick={() =>
                        setReferences(current =>
                          current.filter(
                            item => item.mediaAssetId !== reference.mediaAssetId
                          )
                        )
                      }
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={
                    references.length >= 3 ||
                    uploadMutation.isPending ||
                    registerUploadMutation.isPending
                  }
                  onClick={() =>
                    document.getElementById("special-tie-in-upload")?.click()
                  }
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {lang === "th"
                    ? "ลาก/เลือกภาพจากเครื่อง"
                    : "Drop/choose upload"}
                </Button>
                <input
                  id="special-tie-in-upload"
                  className="hidden"
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={event => {
                    const files = Array.from(event.currentTarget.files ?? []);
                    event.currentTarget.value = "";
                    if (files.length) void uploadReferenceFiles(files);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={references.length >= 3}
                  onClick={() => setMarketplaceOpen(true)}
                >
                  <ImagePlus className="mr-2 h-4 w-4" />
                  {lang === "th"
                    ? "เลือกจาก Marketplace Capture"
                    : "Choose from Marketplace Capture"}
                </Button>
              </div>
            </div>

            <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Label>
                    {lang === "th"
                      ? "Skill: สร้างไอเดียรีวิวและเรื่องเล่าแบบซีรีย์"
                      : "Skill: review and story ideas for a series"}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {lang === "th"
                      ? "เลือกประเภทหัวข้อรีวิว แนวการเล่า และโครงสร้างเรื่อง ระบบจะสร้าง 3 ไอเดียจากข้อมูลกับภาพอ้างอิง"
                      : "Choose what is being reviewed, the presentation style, and story structure. Ideas use the supplied details and visual references."}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={
                    generateIdeasMutation.isPending ||
                    Boolean(ideaGenerationJobId) ||
                    characterIds.length === 0
                  }
                  onClick={() => void generateMarketplaceIdeas()}
                >
                  {generateIdeasMutation.isPending || ideaGenerationJobId ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {lang === "th" ? "สร้างไอเดีย 3 ใบ" : "Generate 3 ideas"}
                </Button>
                {hasMarketplaceProductContext ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={
                      !selectedProduct ||
                      generateIdeasMutation.isPending ||
                      Boolean(ideaGenerationJobId) ||
                      characterIds.length === 0
                    }
                    onClick={generateIdeasFromMarketplaceProduct}
                  >
                    {generateIdeasMutation.isPending || ideaGenerationJobId ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-2 h-4 w-4" />
                    )}
                    {lang === "th" ? "ใช้ Product Brief สร้างไอเดีย" : "Use Product Brief"}
                  </Button>
                ) : null}
              </div>
              {hasMarketplaceProductContext ? (
                <p className="text-xs text-muted-foreground">
                  {lang === "th"
                    ? "ดึงข้อมูลสินค้าและแนวคิด AI ที่บันทึกไว้มาเติมโจทย์ให้อัตโนมัติ โดยไม่ใช้ราคาและโปรโมชัน"
                    : "Automatically use saved product details and AI concepts as the brief, without prices or promotions."}
                </p>
              ) : null}
              <fieldset className="grid gap-2 sm:grid-cols-2">
                <fieldset className="min-w-0 space-y-1 sm:col-span-2">
                  <Label htmlFor="special-tie-in-review-subject-type">
                    {lang === "th"
                      ? "ประเภทหัวข้อรีวิว/เนื้อหา"
                      : "Review subject or content type"}
                  </Label>
                  <Select
                    value={reviewSubjectType}
                    onValueChange={value => {
                      const nextType =
                        value as MarketplaceReviewIdeaInput["reviewSubjectType"];
                      const nextReferenceType = referenceTypeForReviewSubject(
                        nextType,
                        referenceType,
                      );
                      setReviewSubjectType(nextType);
                      setReferenceType(nextReferenceType);
                      const role = referenceRoleForType(nextReferenceType);
                      if (role) {
                        setReferences(current =>
                          current.map(reference => ({ ...reference, role }))
                        );
                      }
                      if (nextType !== "product") setSelectedProductId(null);
                    }}
                  >
                    <SelectTrigger id="special-tie-in-review-subject-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="product">
                        {lang === "th" ? "สินค้า/ผลิตภัณฑ์" : "Product"}
                      </SelectItem>
                      <SelectItem value="object">
                        {lang === "th" ? "วัตถุ/อุปกรณ์" : "Object or equipment"}
                      </SelectItem>
                      <SelectItem value="restaurant">
                        {lang === "th" ? "ร้านอาหาร" : "Restaurant"}
                      </SelectItem>
                      <SelectItem value="place">
                        {lang === "th" ? "สถานที่/ธุรกิจบริการ" : "Place or venue"}
                      </SelectItem>
                      <SelectItem value="tourist_attraction">
                        {lang === "th" ? "สถานที่ท่องเที่ยว" : "Tourist attraction"}
                      </SelectItem>
                      <SelectItem value="documentary">
                        {lang === "th" ? "สารคดี/หัวข้อข้อมูล" : "Documentary or topic"}
                      </SelectItem>
                      <SelectItem value="app">
                        {lang === "th" ? "แอป" : "App"}
                      </SelectItem>
                      <SelectItem value="software">
                        {lang === "th" ? "โปรแกรม/ซอฟต์แวร์" : "Software"}
                      </SelectItem>
                      <SelectItem value="work_system">
                        {lang === "th" ? "ระบบงาน/เวิร์กโฟลว์" : "Work system or workflow"}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {lang === "th"
                      ? reviewSubjectType === "product" &&
                        !hasMarketplaceProductContext
                        ? "แนบภาพสินค้าได้หลายมุม และระบุรายละเอียดที่ยืนยันได้ ส่วนวัตถุ ร้านอาหาร สถานที่ แอป และระบบงานใช้ภาพอย่างเดียวได้"
                        : "แนบภาพหลายมุมได้ เช่น สินค้า วัตถุ ร้านอาหาร สถานที่ หรือภาพหน้าจอ; รายละเอียดเพิ่มเติมช่วยให้เรื่องตรงข้อเท็จจริงยิ่งขึ้น"
                      : reviewSubjectType === "product" &&
                        !hasMarketplaceProductContext
                        ? "Attach multiple product angles and add verifiable details. Objects, restaurants, places, apps, and work systems can use image-only references."
                        : "Attach multiple angles of a product, object, restaurant, place, or app screen; additional details improve factual accuracy."}
                  </p>
                </fieldset>
                <fieldset className="min-w-0 space-y-1">
                  <Label htmlFor="special-tie-in-presentation-style">
                    {lang === "th"
                      ? "แนวการนำเสนอ/รีวิว"
                      : "Presentation or review style"}
                  </Label>
                  <Select
                    value={presentationStyle}
                    onValueChange={value =>
                      setPresentationStyle(
                        value as MarketplaceReviewIdeaInput["presentationStyle"]
                      )
                    }
                  >
                    <SelectTrigger id="special-tie-in-presentation-style">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="varied">
                        {lang === "th"
                          ? "คละรูปแบบใน 3 ไอเดีย (แนะนำ)"
                          : "Mix styles across 3 ideas (recommended)"}
                      </SelectItem>
                      <SelectItem value="story_tie_in">
                        {lang === "th"
                          ? "เล่า Tie-in ให้สินค้าเป็นส่วนหนึ่งของเรื่อง"
                          : "Natural story tie-in"}
                      </SelectItem>
                      <SelectItem value="direct_product_pitch">
                        {lang === "th"
                          ? "พูดแนะนำหัวข้อรีวิวตรง ๆ แบบมีข้อมูลรองรับ"
                          : "Direct, evidence-based recommendation"}
                      </SelectItem>
                      <SelectItem value="unboxing">
                        {lang === "th"
                          ? "เปิดกล่อง/สำรวจครั้งแรก ทดลองใช้หรือพาชม"
                          : "First look, unbox, try, or tour"}
                      </SelectItem>
                      <SelectItem value="feature_explainer">
                        {lang === "th"
                          ? "สาธิตคุณสมบัติ ขั้นตอน หรือจุดเด่น"
                          : "Explain features, workflow, or highlights"}
                      </SelectItem>
                      <SelectItem value="problem_solution">
                        {lang === "th"
                          ? "เริ่มจากปัญหา แล้วเล่าว่าหัวข้อรีวิวเกี่ยวข้องอย่างไร"
                          : "Start with a problem, then show how the subject relates"}
                      </SelectItem>
                      <SelectItem value="experience_review">
                        {lang === "th"
                          ? "รีวิวจากประสบการณ์ตรง"
                          : "Firsthand experience review"}
                      </SelectItem>
                      <SelectItem value="documentary">
                        {lang === "th" ? "เล่าแบบสารคดี" : "Documentary style"}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {lang === "th"
                      ? "เลือกรูปแบบเดียวให้ทั้งชุด หรือให้ 3 ไอเดียใช้คนละรูปแบบ"
                      : "Choose one style for all ideas, or mix styles across the three."}
                  </p>
                </fieldset>
                <fieldset className="min-w-0 space-y-1">
                  <Label htmlFor="special-tie-in-story-structure">
                    {lang === "th" ? "โครงสร้างการเล่าเรื่อง" : "Story structure"}
                  </Label>
                  <Select
                    value={storyStructure}
                    onValueChange={value =>
                      setStoryStructure(
                        value as MarketplaceReviewIdeaInput["storyStructure"]
                      )
                    }
                  >
                    <SelectTrigger id="special-tie-in-story-structure">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="varied">
                        {lang === "th"
                          ? "คละโครงสร้างใน 3 ไอเดีย (แนะนำ)"
                          : "Mix structures across 3 ideas (recommended)"}
                      </SelectItem>
                      <SelectItem value="three_act">
                        {lang === "th"
                          ? "3 องก์: เปิดเรื่อง → อุปสรรค → คลี่คลาย"
                          : "Three act: setup → obstacle → resolution"}
                      </SelectItem>
                      <SelectItem value="problem_solution">
                        {lang === "th"
                          ? "ปัญหา → วิธีแก้ → ผลลัพธ์"
                          : "Problem → solution → outcome"}
                      </SelectItem>
                      <SelectItem value="aida">
                        {lang === "th"
                          ? "AIDA: ดึงดูด → สนใจ → เห็นประโยชน์ → ชวนพิจารณา"
                          : "AIDA: attention → interest → desire → gentle action"}
                      </SelectItem>
                      <SelectItem value="before_after_bridge">
                        {lang === "th"
                          ? "ก่อน → หลัง → จุดเชื่อมการเปลี่ยนแปลง"
                          : "Before → after → bridge"}
                      </SelectItem>
                      <SelectItem value="hero_journey">
                        {lang === "th"
                          ? "เส้นทางตัวละคร: เป้าหมาย → อุปสรรค → เปลี่ยนแปลง"
                          : "Hero’s journey: goal → obstacle → change"}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {lang === "th"
                      ? "ระบบจะแสดงป้ายกำกับแนวที่ใช้จริงบนการ์ดไอเดีย"
                      : "Each idea card will show the structure used."}
                  </p>
                </fieldset>
              </fieldset>
              {ideaGenerationBlockers.length > 0 ? (
                <p
                  className="text-xs text-amber-800 dark:text-amber-300"
                  role="status"
                >
                  {lang === "th"
                    ? `ยังสร้างไอเดียไม่ได้: ${ideaGenerationBlockers.join(" · ")}`
                    : `Ideas cannot be generated yet: ${ideaGenerationBlockers.join(" · ")}`}
                </p>
              ) : null}
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(16rem,24rem)] sm:items-end">
                <p className="text-xs text-muted-foreground">
                  {lang === "th"
                    ? "ค่าเริ่มต้นเป็นอัตโนมัติ ระบบจะเลือก LLM ที่ admin แนะนำและพร้อมใช้งานให้เอง"
                    : "Automatic is the default; the system chooses an available admin-recommended LLM."}
                </p>
                <div className="space-y-1">
                  <Label className="text-xs">
                    {lang === "th"
                      ? "LLM สำหรับสร้างไอเดีย"
                      : "LLM for idea generation"}
                  </Label>
                  <div data-testid="special-tie-in-idea-llm-model">
                    <IdeaLlmModelCombobox
                      models={
                        (ideaLlmModelsQuery.data?.models ??
                          []) as IdeaLlmModel[]
                      }
                      value={ideaLlmModelId}
                      onValueChange={setIdeaLlmModelId}
                      lang={lang}
                      disabled={
                        ideaLlmModelsQuery.isLoading ||
                        ideaLlmModelsQuery.isError
                      }
                    />
                  </div>
                  {ideaLlmModelsQuery.isError ? (
                    <p className="text-xs text-destructive" role="alert">
                      {lang === "th"
                        ? "โหลดรายการ LLM ไม่สำเร็จ ระบบยังลองเลือกอัตโนมัติได้เมื่อกดสร้าง"
                        : "Could not load LLM options; automatic selection will still be attempted."}
                    </p>
                  ) : null}
                </div>
              </div>
              {ideaHistory.length > 0 ? (
                <div className="space-y-3" aria-live="polite">
                  <p className="text-xs font-medium text-muted-foreground">
                    {freshIdeaRunId
                      ? lang === "th"
                        ? "ไอเดียรอบล่าสุด — เลือก 1 ใบจาก 3 ใบ"
                        : "Latest idea round — choose 1 of 3"
                      : lang === "th"
                        ? "ประวัติไอเดีย — กดขยายเพื่อดู"
                        : "Idea history — expand to view"}
                  </p>
                  {ideaRunsToShow.map((run, runIndex) => (
                    <div key={run.runId} className="space-y-2">
                      {showIdeaHistory && runIndex > 0 ? (
                        <p className="text-xs font-medium text-muted-foreground">
                          {lang === "th"
                            ? `รอบก่อนหน้า ${runIndex}`
                            : `Previous round ${runIndex}`}
                        </p>
                      ) : null}
                      <div className="grid gap-2 lg:grid-cols-3">
                        {run.ideas.map((candidate, ideaIndex) => {
                          const selected = selectedIdeaId === candidate.ideaId;
                          return (
                            <button
                              key={candidate.ideaId}
                              type="button"
                              aria-pressed={selected}
                              className={`rounded-md border bg-background p-3 text-left transition-colors ${selected ? "border-primary ring-2 ring-primary/30" : "hover:border-primary/60"}`}
                              onClick={() =>
                                void chooseMarketplaceIdea(run.runId, candidate)
                              }
                            >
                              <span className="mb-2 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                {lang === "th"
                                  ? `ไอเดียที่ ${ideaIndex + 1}`
                                  : `Idea ${ideaIndex + 1}`}
                              </span>
                              <span className="block font-medium">
                                {candidate.title}
                              </span>
                              {candidate.presentationStyle ||
                              candidate.storyStructure ? (
                                <span className="mt-2 flex flex-wrap gap-1">
                                  {candidate.presentationStyle ? (
                                    <Badge variant="secondary">
                                      {getPresentationStyleLabel(
                                        candidate.presentationStyle,
                                        lang
                                      )}
                                    </Badge>
                                  ) : null}
                                  {candidate.storyStructure ? (
                                    <Badge variant="outline">
                                      {getStoryStructureLabel(
                                        candidate.storyStructure,
                                        lang
                                      )}
                                    </Badge>
                                  ) : null}
                                </span>
                              ) : null}
                              <span className="mt-1 block text-xs text-muted-foreground">
                                {candidate.logline}
                              </span>
                              <span className="mt-3 block text-[11px] font-medium uppercase tracking-wide text-primary">
                                {lang === "th" ? "เรื่องละคร" : "Episode story"}
                              </span>
                              <span className="mt-1 block max-h-36 overflow-y-auto whitespace-pre-wrap text-xs leading-5">
                                {candidate.episodeStory || candidate.logline}
                              </span>
                              <span className="mt-3 block text-[11px] font-medium uppercase tracking-wide text-primary">
                                {dialogueMode === "none"
                                  ? lang === "th"
                                    ? "ท่าทางและการกระทำ (ไม่มีบทพูด)"
                                    : "Actions and body language (no dialogue)"
                                  : lang === "th"
                                    ? "บทพูดและท่าทาง"
                                    : "Dialogue and actions"}
                              </span>
                              <span className="mt-1 block max-h-80 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                                {dialogueMode === "none"
                                  ? candidate.actions.join("\n")
                                  : candidate.shotDialogues.length > 0
                                    ? candidate.shotDialogues.map(shot => (
                                        <span
                                          key={shot.shotNumber}
                                          className="mt-2 block first:mt-0"
                                        >
                                          <span className="block font-medium text-foreground">
                                            {lang === "th"
                                              ? `ช็อต ${shot.shotNumber}`
                                              : `Shot ${shot.shotNumber}`}
                                          </span>
                                          {shot.lines.map((line, lineIndex) => (
                                            <span
                                              key={`${shot.shotNumber}-${lineIndex}`}
                                              className="block"
                                            >
                                              {line.speaker}: {line.line}
                                            </span>
                                          ))}
                                        </span>
                                      ))
                                    : candidate.dialogueScript ||
                                      candidate.dialogue
                                        .map(
                                          line => `${line.speaker}: ${line.line}`
                                        )
                                        .join("\n")}
                              </span>
                              {candidate.shotDialogues.length === 9 &&
                              candidate.shotDialogues.every(
                                (shot, index) =>
                                  shot.shotNumber === index + 1 &&
                                  shot.lines.length >= 1 &&
                                  shot.lines.length <= 3 &&
                                  shot.lines.every(
                                    line => line.line.trim().length > 0
                                  )
                              ) ? (
                                <Badge variant="secondary" className="mt-2">
                                  {lang === "th"
                                    ? "บทพูดครบ 9 ช็อต"
                                    : "Dialogue complete for 9 shots"}
                                </Badge>
                              ) : null}
                              <span className="mt-2 block text-xs text-muted-foreground">
                                {candidate.scene.location} ·{" "}
                                {candidate.productMentionReason}
                              </span>
                              {candidate.lookSlotRequests.length ||
                              candidate.sceneSlotRequests.length ? (
                                <Badge variant="outline" className="mt-2">
                                  {lang === "th"
                                    ? `เพิ่ม slot ลุค ${candidate.lookSlotRequests.length} / ฉาก ${candidate.sceneSlotRequests.length}`
                                    : `Add ${candidate.lookSlotRequests.length} look / ${candidate.sceneSlotRequests.length} scene slots`}
                                </Badge>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {previousIdeaRunCount > 0 || !freshIdeaRunId ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowIdeaHistory(current => !current)}
                    >
                      {showIdeaHistory
                        ? lang === "th"
                          ? "ซ่อนประวัติรอบก่อน"
                          : "Hide previous rounds"
                        : lang === "th"
                          ? `ดูประวัติไอเดีย (${previousIdeaRunCount} รอบ)`
                          : `View idea history (${previousIdeaRunCount})`}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>

            {sceneSuggestions.length > 0 ? (
              <section
                className="space-y-3 rounded-md border border-amber-300/70 bg-amber-50/50 p-3 dark:bg-amber-950/10"
                aria-labelledby="special-scene-choice-heading"
              >
                <div className="space-y-1">
                  <h3
                    id="special-scene-choice-heading"
                    className="font-medium text-amber-950 dark:text-amber-100"
                  >
                    {lang === "th" ? "เลือกหรือสร้างฉาก" : "Choose or add a scene"}
                  </h3>
                  <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
                    {lang === "th"
                      ? "เลือกหรือสร้างฉากหลักก่อนสร้างตอน ส่วนฉากเสริมเป็นตัวเลือก ไม่บังคับ"
                      : "Choose or create the main scene before creating the episode. Extra scenes are optional."}
                  </p>
                </div>
                {sceneSuggestions.map(suggestion => {
                  const isPrimaryScene =
                    suggestion.sceneLabel.trim().toLocaleLowerCase() ===
                    selectedMarketplaceIdea?.scene.location
                      .trim()
                      .toLocaleLowerCase();
                  return (
                    <div
                      key={suggestion.sceneLabel}
                      className="space-y-2 rounded-md border bg-background p-3"
                    >
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {suggestion.sceneLabel}
                        <Badge variant={isPrimaryScene ? "default" : "secondary"}>
                          {isPrimaryScene
                            ? lang === "th"
                              ? "ฉากหลัก"
                              : "Main scene"
                            : lang === "th"
                              ? "ฉากเสริม"
                              : "Extra scene"}
                        </Badge>
                      </p>
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Select
                          value={sceneChoiceByLabel[suggestion.sceneLabel] ?? ""}
                          disabled={resolveSceneMutation.isPending}
                          onValueChange={value => {
                            setSceneChoiceByLabel(current => ({
                              ...current,
                              [suggestion.sceneLabel]: value,
                            }));
                            void resolveSceneSuggestion(
                              suggestion,
                              "reuse",
                              value
                            );
                          }}
                        >
                          <SelectTrigger className="min-w-64 flex-1">
                            <SelectValue
                              placeholder={
                                lang === "th"
                                  ? "เลือกฉากที่มีอยู่ในซีรีย์"
                                  : "Select an existing series scene"
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {locations.map(location => {
                              const imageUrl = location.primaryReferenceUrl;
                              return (
                                <SelectItem
                                  key={String(location.locationId)}
                                  value={String(location.locationId)}
                                  className="py-2"
                                >
                                  <span className="flex items-center gap-2">
                                    {imageUrl ? (
                                      <AuthenticatedMediaImage
                                        src={imageUrl}
                                        alt={location.name}
                                        className="h-12 w-16 shrink-0 rounded object-cover"
                                        loadingLabel={
                                          lang === "th"
                                            ? "กำลังโหลดภาพฉาก..."
                                            : "Loading scene image..."
                                        }
                                        errorLabel={
                                          lang === "th"
                                            ? "โหลดภาพฉากไม่สำเร็จ"
                                            : "Scene image unavailable"
                                        }
                                      />
                                    ) : (
                                      <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
                                        <MapPin className="h-5 w-5" aria-hidden="true" />
                                      </span>
                                    )}
                                    <span className="min-w-0">
                                      <span className="block truncate">
                                        {location.name ?? location.locationKey}
                                      </span>
                                      {!imageUrl ? (
                                        <span className="block text-xs text-muted-foreground">
                                          {lang === "th"
                                            ? "ยังไม่มีภาพฉาก"
                                            : "No scene image yet"}
                                        </span>
                                      ) : null}
                                    </span>
                                  </span>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                      {!locationsQuery.isLoading && locations.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          {lang === "th"
                            ? "ซีรีย์นี้ยังไม่มีฉากในคลัง กดสร้างฉากใหม่เพื่อเพิ่มฉากนี้"
                            : "This series has no saved scenes yet. Add this scene to continue."}
                        </p>
                      ) : null}
                      {suggestion.candidates.map(candidate => (
                        <div
                          key={candidate.locationKey}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2"
                        >
                          <span className="text-sm">
                            {candidate.name}
                            <Badge variant="secondary" className="ml-2">
                              {Math.round(candidate.score * 100)}%
                            </Badge>
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={resolveSceneMutation.isPending}
                            onClick={() =>
                              void resolveSceneSuggestion(
                                suggestion,
                                "reuse",
                                candidate.locationId
                              )
                            }
                          >
                            {lang === "th" ? "ใช้ฉากเดิม" : "Reuse scene"}
                          </Button>
                        </div>
                      ))}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={resolveSceneMutation.isPending}
                      onClick={() =>
                        void resolveSceneSuggestion(suggestion, "create")
                      }
                    >
                      {lang === "th" ? "สร้างฉากใหม่" : "Create new scene"}
                    </Button>
                    </div>
                  );
                })}
              </section>
            ) : null}

            {selectedMarketplaceIdea && selectedSceneLocationKey ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 p-3">
                <div className="flex min-w-0 items-center gap-3">
                  {selectedSceneLocation?.primaryReferenceUrl ? (
                    <AuthenticatedMediaImage
                      src={selectedSceneLocation.primaryReferenceUrl}
                      alt={selectedSceneLocation.name}
                      className="h-16 w-24 shrink-0 rounded object-cover"
                      loadingLabel={
                        lang === "th"
                          ? "กำลังโหลดภาพฉาก..."
                          : "Loading scene image..."
                      }
                      errorLabel={
                        lang === "th"
                          ? "โหลดภาพฉากไม่สำเร็จ"
                          : "Scene image unavailable"
                      }
                    />
                  ) : (
                    <span className="flex h-16 w-24 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
                      <MapPin className="h-6 w-6" aria-hidden="true" />
                    </span>
                  )}
                  <p className="min-w-0 text-sm text-muted-foreground">
                    <span className="block font-medium text-foreground">
                      {selectedSceneLocation?.name ??
                        selectedMarketplaceIdea.scene.location}
                    </span>
                    {selectedSceneLocation?.primaryReferenceUrl
                      ? lang === "th"
                        ? "ผูกฉากนี้กับตอนแล้ว"
                        : "This scene is linked to the episode."
                      : lang === "th"
                        ? "ฉากนี้ยังไม่มีภาพ คุณสามารถสร้างภาพต่อในแท็บฉาก"
                        : "This scene has no image yet. Generate one in the Scenes tab."}
                  </p>
                </div>
                <SpecialTieInSceneLink
                  lang={lang}
                  seriesId={seriesId}
                  locationKey={selectedSceneLocationKey}
                />
              </div>
            ) : null}

            {referenceType === "location" ||
            referenceType === "store" ||
            referenceType === "mixed" ? (
              <div className="space-y-2 rounded-md border p-3">
                <Label>
                  {lang === "th"
                    ? "เลือกฉาก/สถานที่เดิมที่อนุมัติแล้ว (ไม่บังคับ)"
                    : "Choose an existing approved scene/location (optional)"}
                </Label>
                <Select
                  value={selectedLocationId ?? ""}
                  onValueChange={value => setSelectedLocationId(value)}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        locationsQuery.isLoading
                          ? "Loading…"
                          : lang === "th"
                            ? "เลือกสถานที่"
                            : "Select a location"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map(location => (
                      <SelectItem
                        key={String(location.locationId)}
                        value={String(location.locationId)}
                      >
                        {location.name ?? location.locationKey}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedLocationId ? (
                  <div className="grid gap-2 sm:grid-cols-3">
                    {approvedLocationAssets.map(asset => (
                      <Button
                        key={asset.mediaAssetId}
                        type="button"
                        variant="outline"
                        className="h-auto justify-start p-2 text-left text-xs"
                        disabled={references.length >= 3}
                        onClick={() => addExistingLocationAsset(asset)}
                      >
                        {asset.url ? (
                          <AuthenticatedMediaImage
                            src={asset.url}
                            alt={selectedLocation?.name ?? "location"}
                            className="mr-2 h-10 w-10 rounded object-cover"
                            loadingLabel={
                              lang === "th"
                                ? "กำลังโหลดภาพ..."
                                : "Loading image..."
                            }
                            errorLabel={
                              lang === "th"
                                ? "โหลดภาพไม่สำเร็จ"
                                : "Image unavailable"
                            }
                          />
                        ) : null}
                        <span>
                          {lang === "th"
                            ? "เพิ่มภาพฉากนี้"
                            : "Add this scene image"}
                          <span className="block text-[10px] text-muted-foreground">
                            {asset.role ?? "approved reference"} ·{" "}
                            {asset.approved ? "approved" : "QC"}
                          </span>
                        </span>
                      </Button>
                    ))}
                  </div>
                ) : null}
                {selectedLocationId &&
                !locationAssetsQuery.isLoading &&
                approvedLocationAssets.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {lang === "th"
                      ? "สถานที่นี้ยังไม่มีภาพที่อนุมัติแล้ว ให้แนบภาพใหม่แทน"
                      : "This location has no approved image; upload a new reference instead."}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>
                {lang === "th"
                  ? "ตัวละครจากซีรีย์ (เลือกได้สูงสุด 4 คน)"
                  : "Series characters (up to 4)"}
              </Label>
              {selectedCharacterIdsWithoutUsablePortrait.length > 0 ? (
                <div
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive"
                  role="alert"
                >
                  <span>
                    {lang === "th"
                      ? "ตัวละครที่เลือกยังไม่มีภาพที่พร้อมใช้งาน กรุณาเพิ่มภาพตัวละครก่อนสร้างตอนพิเศษ"
                      : "A selected character has no usable portrait. Add a character portrait before creating the special episode."}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-destructive/40 text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      onOpenChange(false);
                      onOpenCharacterSettings?.();
                    }}
                  >
                    {lang === "th"
                      ? "ตั้งค่าภาพตัวละคร"
                      : "Configure character portrait"}
                  </Button>
                </div>
              ) : null}
              <div className="grid gap-2 sm:grid-cols-2">
                {characters.map((character, characterIndex) => {
                  const id = resolveSpecialTieInCharacterId(character);
                  if (!id) return null;
                  const portraitUrl =
                    characterPortraitById.get(id)?.thumbnailUrl;
                  const hasUsablePortrait = Boolean(portraitUrl);
                  const selected = selectedCharacters.has(id);
                  return (
                    <div
                      key={id}
                      role="checkbox"
                      aria-checked={selected}
                      aria-label={String(
                        character.name ?? character.characterName ?? id
                      )}
                      tabIndex={0}
                      onClick={event => {
                        const target = event.target as HTMLElement;
                        if (target.closest("button, input, label")) return;
                        toggleCharacter(id);
                      }}
                      onKeyDown={event => {
                        if (event.currentTarget !== event.target) return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          toggleCharacter(id);
                        }
                      }}
                      className={`flex min-h-16 cursor-pointer items-center gap-2 rounded-md border p-2 text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "border-primary bg-primary/5 ring-1 ring-primary/30" : ""}`}
                    >
                      <Checkbox
                        id={`special-tie-in-character-${id}`}
                        checked={selected}
                        onClick={event => event.stopPropagation()}
                        onCheckedChange={() => toggleCharacter(id)}
                      />
                      {portraitUrl ? (
                        <button
                          type="button"
                          className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={
                            lang === "th"
                              ? `ขยายภาพตัวละคร ${character.name ?? character.characterName ?? id} เต็มจอ`
                              : `Open ${character.name ?? character.characterName ?? id} portrait fullscreen`
                          }
                          title={
                            lang === "th"
                              ? "แตะเพื่อขยายภาพเต็มจอ"
                              : "Tap to open fullscreen"
                          }
                          onClick={event => {
                            event.preventDefault();
                            event.stopPropagation();
                            setLightbox({
                              src: portraitUrl,
                              alt:
                                character.name ?? character.characterName ?? id,
                            });
                          }}
                        >
                          <AuthenticatedMediaImage
                            src={portraitUrl}
                            alt=""
                            className="h-14 w-12 rounded-md object-cover"
                            loading={characterIndex < 12 ? "eager" : "lazy"}
                            loadingLabel={
                              lang === "th"
                                ? "กำลังโหลดภาพคน..."
                                : "Loading portrait..."
                            }
                            errorLabel={
                              lang === "th"
                                ? "โหลดภาพไม่สำเร็จ"
                                : "Could not load image"
                            }
                            retryLabel={lang === "th" ? "ลองใหม่" : "Retry"}
                          />
                        </button>
                      ) : (
                        <span className="flex h-14 w-12 shrink-0 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
                          {lang === "th" ? "ไม่มีภาพ" : "No image"}
                        </span>
                      )}
                      <label
                        htmlFor={`special-tie-in-character-${id}`}
                        id={`special-tie-in-character-label-${id}`}
                        className="min-w-0 flex-1 cursor-pointer truncate"
                      >
                        {character.name ?? character.characterName ?? id}
                        <span className="block text-xs text-muted-foreground">
                          {selected
                            ? lang === "th"
                              ? "เลือกใช้ในตอนนี้"
                              : "Selected for this episode"
                            : !hasUsablePortrait
                              ? lang === "th"
                                ? "เพิ่มภาพตัวละครก่อนสร้าง"
                                : "Add a character portrait before creating"
                              : lang === "th"
                                ? "แตะเพื่อเลือก"
                                : "Tap to select"}
                        </span>
                      </label>
                      {selected ? (
                        <Badge variant="secondary" className="shrink-0">
                          {lang === "th" ? "เลือกแล้ว" : "Selected"}
                        </Badge>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-5 md:col-span-5">
            <div className="grid gap-4 md:grid-cols-1 xl:grid-cols-2">
              <div className="space-y-2">
                <Label>
                  {lang === "th" ? "ความยาวต่อช็อต" : "Duration per shot"}
                </Label>
                <Select
                  value={String(durationSeconds)}
                  onValueChange={value => setDurationSeconds(Number(value))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SPECIAL_TIE_IN_DURATIONS_SECONDS.map(value => (
                      <SelectItem key={value} value={String(value)}>
                        {value} {lang === "th" ? "วินาที" : "seconds"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{lang === "th" ? "โหมดบทพูด" : "Dialogue mode"}</Label>
                <Select
                  value={dialogueMode}
                  onValueChange={value => {
                    const next = value as "none" | "character_dialogue";
                    setDialogueMode(next);
                    if (next === "none") setSpeakerCharacterIds([]);
                    setFreshIdeaRunId(null);
                    setSelectedIdeaId(null);
                    if (selectedMarketplaceIdea) setIdea("");
                    setSelectedMarketplaceIdea(null);
                    setDialogueBrief("");
                    setShotDialogueDrafts([]);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      {lang === "th" ? "ไม่มีบทพูด" : "No dialogue"}
                    </SelectItem>
                    <SelectItem value="character_dialogue">
                      {lang === "th" ? "ให้ตัวละครพูด" : "Character dialogue"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {dialogueMode === "character_dialogue" ? (
              <div className="space-y-2">
                <Label>
                  {lang === "th"
                    ? "ผู้พูด (เลือกได้สูงสุด 3 คน)"
                    : "Speakers (up to 3)"}
                </Label>
                <div className="grid gap-2 md:grid-cols-1 xl:grid-cols-2">
                  {characters
                    .filter(character =>
                      selectedCharacters.has(
                        resolveSpecialTieInCharacterId(character)
                      )
                    )
                    .map(character => {
                      const id = resolveSpecialTieInCharacterId(character);
                      if (!id) return null;
                      return (
                        <label
                          key={id}
                          className="flex items-center gap-2 rounded-md border p-2 text-sm"
                        >
                          <Checkbox
                            checked={speakerCharacterIds.includes(id)}
                            onCheckedChange={checked =>
                              setSpeakerCharacterIds(current =>
                                checked
                                  ? toggleBoundedSelection(current, id, 3)
                                  : current.filter(value => value !== id)
                              )
                            }
                          />
                          <span>
                            {character.name ?? character.characterName ?? id}
                          </span>
                        </label>
                      );
                    })}
                </div>
                {!selectedMarketplaceIdea ? (
                  <Textarea
                    value={dialogueBrief}
                    onChange={event => setDialogueBrief(event.target.value)}
                    maxLength={3000}
                    rows={3}
                    placeholder={
                      lang === "th"
                        ? "แนวทางบทพูด (ไม่บังคับ)…"
                        : "Dialogue guidance (optional)…"
                    }
                  />
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {lang === "th"
                    ? selectedMarketplaceIdea
                      ? "เลือกผู้พูดด้านล่างเพื่อผูกบทเข้ากับตัวละครที่อนุมัติแล้ว หากต้องการล็อกประโยคตรงตัว ให้ขึ้นต้นด้วย EXACT:"
                      : "หากต้องการล็อกบทพูดตรงตัว ให้ขึ้นต้นแต่ละบรรทัดด้วย EXACT: ส่วนข้อความอื่นถือเป็นแนวทางให้ skill"
                    : "To lock exact dialogue, prefix each line with EXACT:. Other text is guidance for the skill."}
                </p>
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-1 xl:grid-cols-2">
              <div className="space-y-2">
                <Label>
                  {lang === "th"
                    ? "Model สร้างภาพ (เฉพาะตอนนี้)"
                    : "Image model (episode only)"}
                </Label>
                <div data-testid="special-tie-in-image-model">
                  <SpecialTieInModelCombobox
                    models={imageModels}
                    value={imageModelId}
                    onValueChange={setImageModelId}
                    placeholder={
                      modelsQuery.isLoading ? "Loading…" : "Select model"
                    }
                    searchPlaceholder={
                      lang === "th"
                        ? "ค้นหา model สร้างภาพ..."
                        : "Search image models..."
                    }
                    emptyLabel={
                      lang === "th"
                        ? "ไม่พบ model สร้างภาพ"
                        : "No image models found"
                    }
                    ariaLabel={
                      lang === "th"
                        ? "เลือก model สร้างภาพ"
                        : "Select image model"
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>
                  {lang === "th"
                    ? "Model สร้างวิดีโอ (เฉพาะตอนนี้)"
                    : "Video model (episode only)"}
                </Label>
                <div data-testid="special-tie-in-video-model">
                  <SpecialTieInModelCombobox
                    models={videoModels}
                    value={videoModelId}
                    onValueChange={setVideoModelId}
                    placeholder={
                      modelsQuery.isLoading ? "Loading…" : "Select model"
                    }
                    searchPlaceholder={
                      lang === "th"
                        ? "ค้นหา model สร้างวีดีโอ..."
                        : "Search video models..."
                    }
                    emptyLabel={
                      lang === "th"
                        ? "ไม่พบ model สร้างวีดีโอ"
                        : "No video models found"
                    }
                    ariaLabel={
                      lang === "th"
                        ? "เลือก model สร้างวีดีโอ"
                        : "Select video model"
                    }
                  />
                </div>
              </div>
            </div>
            {modelsQuery.isError && !usingPublicModelFallback ? (
              <p className="text-sm text-destructive" role="alert">
                {lang === "th"
                  ? "โหลดรายการ model สำหรับตอนพิเศษไม่สำเร็จ กรุณาลองใหม่"
                  : "Could not load special tie-in models. Try again."}
              </p>
            ) : modelsQuery.isError && usingPublicModelFallback ? (
              <p
                className="text-sm text-amber-700 dark:text-amber-400"
                role="status"
              >
                {lang === "th"
                  ? "ใช้รายการ model กลางชั่วคราว เลือกได้ตามรายการที่แสดง"
                  : "Using the public model catalog temporarily; choose from the models shown."}
              </p>
            ) : !modelsQuery.isLoading &&
              (imageModels.length === 0 || videoModels.length === 0) ? (
              <p className="text-sm text-destructive" role="alert">
                {lang === "th"
                  ? "ยังไม่มี model ที่รองรับ 9:16 และการตั้งค่านี้"
                  : "No models support 9:16 and the current settings."}
              </p>
            ) : imageModelId && !selectedImageModelIsValid ? (
              <p className="text-sm text-destructive" role="alert">
                {lang === "th"
                  ? "model สร้างภาพเดิมไม่รองรับภาพอ้างอิง/สัดส่วนนี้ กรุณาเลือกใหม่"
                  : "The selected image model is incompatible with these references. Choose another."}
              </p>
            ) : videoModelId && !selectedVideoModelIsValid ? (
              <p className="text-sm text-destructive" role="alert">
                {lang === "th"
                  ? "model สร้างวิดีโอเดิมไม่รองรับความยาว/บทพูดนี้ กรุณาเลือกใหม่"
                  : "The selected video model is incompatible with this duration/dialogue mode. Choose another."}
              </p>
            ) : null}

            <div className="grid gap-2 md:grid-cols-1 xl:grid-cols-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={allowAdditionalCharacters}
                  onCheckedChange={value =>
                    setAllowAdditionalCharacters(Boolean(value))
                  }
                />
                {lang === "th"
                  ? "อนุญาตตัวละคร/ตัวประกอบเพิ่ม"
                  : "Allow extra characters"}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={lockCharacterReferences}
                  onCheckedChange={value =>
                    setLockCharacterReferences(Boolean(value))
                  }
                />
                {lang === "th" ? "ล็อกภาพคน" : "Lock people"}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={lockReferenceImages}
                  onCheckedChange={value =>
                    setLockReferenceImages(Boolean(value))
                  }
                />
                {lang === "th"
                  ? "ล็อกภาพสินค้า/สถานที่"
                  : "Lock product/location references"}
              </label>
            </div>
          </div>
        </div>

        {!canSubmit && !actionState.finalSubmitPending && submitBlockers.length > 0 ? (
          <div
            className="space-y-1 text-xs text-destructive"
            role="status"
            aria-live="polite"
          >
            <p className="font-medium">
              {lang === "th"
                ? "ยังสร้างตอนพิเศษไม่ได้ ต้องทำรายการต่อไปนี้ให้ครบ:"
                : "The special episode is not ready. Complete these items:"}
            </p>
            <ul className="list-inside list-disc">
              {submitBlockers.map(blocker => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {lang === "th" ? "ยกเลิก" : "Cancel"}
          </Button>
          <Button
            type="button"
            disabled={!canSubmit || actionState.finalSubmitPending}
            onClick={requestSubmitConfirmation}
          >
            {actionState.finalSubmitPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {onSubmitInput
              ? lang === "th"
                ? "บันทึกและสร้าง Prompt ใหม่"
                : "Save and regenerate prompts"
              : lang === "th"
                ? "สร้างตอนพิเศษและ Prompt"
                : "Create episode & prompts"}
          </Button>
        </DialogFooter>

        <Dialog open={marketplaceOpen} onOpenChange={setMarketplaceOpen}>
          <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-2rem)] max-w-none overflow-y-auto p-4 sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)] sm:p-6 lg:w-[94vw] lg:max-w-[94vw]">
            <DialogHeader>
              <DialogTitle>
                {lang === "th"
                  ? "เลือกภาพจาก Marketplace Capture"
                  : "Choose Marketplace Capture images"}
              </DialogTitle>
              <DialogDescription>
                {lang === "th"
                  ? "ค้นหาสินค้า เลือกรายการ แล้วเลือกภาพที่ต้องการ ระบบจะนำเข้าเป็น managed media ให้เอง"
                  : "Search a product, open it, then choose exact images. They are imported as managed media."}
              </DialogDescription>
            </DialogHeader>
            <div className="md:grid md:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1.5fr)] md:gap-6">
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={productQuery}
                    onChange={event => setProductQuery(event.target.value)}
                    placeholder={
                      lang === "th" ? "ค้นหารายการสินค้า…" : "Search products…"
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void productsQuery.refetch()}
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground" role="status">
                  {lang === "th"
                    ? `พบ ${products.length} รายการ${productsQuery.hasNextPage ? "ขึ้นไป" : ""}`
                    : `${products.length} product${products.length === 1 ? "" : "s"} shown${productsQuery.hasNextPage ? " so far" : ""}`}
                </p>
                <div className="grid gap-2 lg:grid-cols-2">
                  {products.map((product: any) => (
                    <Button
                      key={product.id}
                      type="button"
                      variant={
                        selectedProductId === String(product.id)
                          ? "secondary"
                          : "outline"
                      }
                      className="h-auto min-h-14 justify-start gap-2 overflow-hidden p-2 text-left"
                      onClick={() => {
                        setSelectedProductId(String(product.id));
                        setPendingImageIds([]);
                      }}
                    >
                      {product.imageUrl || product.imageUrls?.[0] ? (
                        <AuthenticatedMediaImage
                          src={product.imageUrl ?? product.imageUrls[0]}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded object-cover"
                          loadingLabel={
                            lang === "th"
                              ? "กำลังโหลดภาพ..."
                              : "Loading image..."
                          }
                          errorLabel={
                            lang === "th" ? "ไม่พบภาพ" : "Image unavailable"
                          }
                        />
                      ) : (
                        <ImagePlus className="h-5 w-5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 truncate">
                        {product.productName ?? product.name ?? product.id}
                      </span>
                    </Button>
                  ))}
                </div>
                {productsQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground" role="status">
                    {lang === "th"
                      ? "กำลังค้นหาสินค้า…"
                      : "Searching products…"}
                  </p>
                ) : productsQuery.isError ? (
                  <p className="text-sm text-destructive" role="alert">
                    {lang === "th"
                      ? "ค้นหารายการสินค้าไม่สำเร็จ กรุณาลองใหม่"
                      : "Product search failed. Try again."}
                  </p>
                ) : products.length === 0 ? (
                  <p className="text-sm text-muted-foreground" role="status">
                    {lang === "th"
                      ? "ไม่พบสินค้า ลองเปลี่ยนคำค้นหา"
                      : "No products found. Try another search."}
                  </p>
                ) : null}
                {productsQuery.hasNextPage ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={productsQuery.isFetchingNextPage}
                    onClick={() => void productsQuery.fetchNextPage()}
                  >
                    {productsQuery.isFetchingNextPage
                      ? lang === "th"
                        ? "กำลังโหลด…"
                        : "Loading…"
                      : lang === "th"
                        ? "โหลดสินค้าเพิ่มเติม"
                        : "Load more products"}
                  </Button>
                ) : null}
              </div>

              <div className="mt-5 space-y-3 md:mt-0">
                {selectedProductId ? (
                  <div className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {lang === "th"
                          ? "เลือกภาพสินค้านี้"
                          : "Choose product images"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {selectedProduct?.productName ?? selectedProductId}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      {pendingImageIds.length}/
                      {Math.max(0, 3 - references.length)}
                    </Badge>
                  </div>
                ) : null}
                {selectedProductId ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {productImages.map((image: any) => {
                      const selected = pendingImageIds.includes(
                        String(image.id)
                      );
                      return (
                        <div
                          key={image.id}
                          className={`relative overflow-hidden rounded-md border text-left transition-shadow ${selected ? "border-primary ring-2 ring-primary" : "hover:border-primary/60"}`}
                        >
                          <button
                            type="button"
                            aria-pressed={selected}
                            aria-label={`${selected ? "Remove" : "Select"} ${image.imageType ?? "Marketplace image"}`}
                            className="block w-full focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={() =>
                              setPendingImageIds(current =>
                                selected
                                  ? current.filter(
                                      id => id !== String(image.id)
                                    )
                                  : current.length >= 3 - references.length
                                    ? current
                                    : [...current, String(image.id)]
                              )
                            }
                          >
                            <AuthenticatedMediaImage
                              src={image.url}
                              alt={image.imageType ?? "Marketplace image"}
                              className="aspect-square w-full object-cover"
                              loadingLabel={
                                lang === "th"
                                  ? "กำลังโหลดภาพ..."
                                  : "Loading image..."
                              }
                              errorLabel={
                                lang === "th"
                                  ? "โหลดภาพไม่สำเร็จ"
                                  : "Image unavailable"
                              }
                            />
                          </button>
                          <Button
                            type="button"
                            size="icon"
                            variant="secondary"
                            className="absolute right-1 top-1 h-7 w-7"
                            aria-label={
                              lang === "th"
                                ? "ขยายภาพสินค้าเต็มจอ"
                                : "Open product image fullscreen"
                            }
                            title={
                              lang === "th"
                                ? "ขยายภาพเต็มจอ"
                                : "Open fullscreen"
                            }
                            onClick={() =>
                              setLightbox({
                                src: image.url,
                                alt: image.imageType ?? "Marketplace image",
                              })
                            }
                          >
                            <Expand className="h-4 w-4" />
                          </Button>
                          <span className="flex items-center justify-between gap-1 p-2 text-xs">
                            <span className="truncate">
                              {image.imageType ?? "image"}
                            </span>
                            {selected ? (
                              <Badge
                                variant="secondary"
                                className="shrink-0 px-1.5 py-0 text-[10px]"
                              >
                                {lang === "th" ? "เลือกแล้ว" : "Selected"}
                              </Badge>
                            ) : null}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {lang === "th"
                      ? "เลือกรายการสินค้าเพื่อดูภาพ"
                      : "Choose a product to view its images"}
                  </p>
                )}
                {selectedProductId && imagesQuery.isError ? (
                  <p className="text-sm text-destructive" role="alert">
                    {lang === "th"
                      ? "โหลดภาพสินค้าไม่สำเร็จ กรุณาลองใหม่"
                      : "Could not load product images. Try again."}
                  </p>
                ) : selectedProductId && imagesQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground" role="status">
                    {lang === "th" ? "กำลังโหลดภาพ…" : "Loading images…"}
                  </p>
                ) : selectedProductId &&
                  !imagesQuery.isLoading &&
                  productImages.length === 0 ? (
                  <p className="text-sm text-muted-foreground" role="status">
                    {lang === "th"
                      ? "ไม่พบภาพที่เลือกได้สำหรับสินค้านี้"
                      : "No selectable images were found for this product."}
                  </p>
                ) : null}
                {selectedProductId && imagesQuery.hasNextPage ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={imagesQuery.isFetchingNextPage}
                    onClick={() => void imagesQuery.fetchNextPage()}
                  >
                    {imagesQuery.isFetchingNextPage
                      ? lang === "th"
                        ? "กำลังโหลด…"
                        : "Loading…"
                      : lang === "th"
                        ? "โหลดภาพเพิ่มเติม"
                        : "Load more images"}
                  </Button>
                ) : null}
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setMarketplaceOpen(false)}
              >
                {lang === "th" ? "ยกเลิก" : "Cancel"}
              </Button>
              <Button
                type="button"
                disabled={
                  pendingImageIds.length === 0 ||
                  materializeMutation.isPending ||
                  isMaterializingReferences
                }
                onClick={() => void confirmMarketplaceImages()}
              >
                {isMaterializingReferences || materializeMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {lang === "th" ? "เพิ่มภาพที่เลือก" : "Add selected images"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={footageFullscreen} onOpenChange={setFootageFullscreen}>
          <DialogContent className="max-w-[95vw] p-3">
            <DialogTitle className="sr-only">
              {lang === "th" ? "Footage เต็มจอ" : "Fullscreen footage"}
            </DialogTitle>
            {footagePreviewUrl ? (
              <video
                className="max-h-[88dvh] w-full object-contain"
                src={footagePreviewUrl}
                controls
                autoPlay
                aria-label={footageFileName || "Footage preview"}
              />
            ) : null}
          </DialogContent>
        </Dialog>
        <Dialog open={brollFullscreen} onOpenChange={setBrollFullscreen}>
          <DialogContent className="max-w-[95vw] p-3">
            <DialogTitle className="sr-only">
              {lang === "th" ? "B-roll เต็มจอ" : "Fullscreen B-roll"}
            </DialogTitle>
            {brollOutputUrl ? (
              <video
                className="max-h-[88dvh] w-full object-contain"
                src={brollOutputUrl}
                controls
                autoPlay
                aria-label="Rendered B-roll preview"
              />
            ) : null}
          </DialogContent>
        </Dialog>
        <Dialog
          open={Boolean(lightbox)}
          onOpenChange={value => !value && setLightbox(null)}
        >
          <DialogContent className="flex max-h-[95dvh] max-w-[95vw] items-center justify-center p-3">
            <DialogTitle className="sr-only">
              {lang === "th" ? "ภาพขยาย" : "Expanded image"}
            </DialogTitle>
            {lightbox ? (
              <AuthenticatedMediaImage
                src={lightbox.src}
                alt={lightbox.alt}
                className="max-h-[88dvh] max-w-full object-contain"
                loadingLabel={
                  lang === "th" ? "กำลังโหลดภาพ..." : "Loading image..."
                }
                errorLabel={
                  lang === "th" ? "โหลดภาพไม่สำเร็จ" : "Image unavailable"
                }
              />
            ) : null}
          </DialogContent>
        </Dialog>
        </DialogContent>
        {creditConfirmDialog}
      </>
    </Dialog>
  );
}
