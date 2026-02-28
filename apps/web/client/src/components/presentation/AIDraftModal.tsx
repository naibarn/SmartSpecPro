import { useState, useCallback, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  BUILT_IN_PRESETS,
  getBuiltInPreset,
} from "@shared/presentation/aiStylePresets";
import type { SlideStylePreset } from "@shared/presentation/aiTypes";
import { AI_STYLE_PRESET_IDS } from "@shared/presentation/aiTypes";
import { SearchableCombobox } from "./SearchableCombobox";
import { ImageModelCombobox } from "./ImageModelCombobox";
import DynamicSkillForm from "@/components/media/DynamicSkillForm";
import type { SkillInputSchema } from "@/components/media/DynamicSkillForm";
import {
  Sparkles,
  Loader2,
  Check,
  AlertTriangle,
  X,
  Settings2,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AIDraftModalProps {
  isOpen: boolean;
  onClose: () => void;
  deckId: number;
  expectedVersion: number;
  currentSlideCount: number;
}

export function AIDraftModal({
  isOpen,
  onClose,
  deckId,
  expectedVersion,
  currentSlideCount,
}: AIDraftModalProps) {
  // Config state
  const [topic, setTopic] = useState("");
  const [numSlides, setNumSlides] = useState(5);
  const [language, setLanguage] = useState("auto");
  const [selectedArticleSkill, setSelectedArticleSkill] = useState("");
  const [selectedImageSkill, setSelectedImageSkill] = useState("");
  const [imageModel, setImageModel] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState("dark-professional");
  const [footerText, setFooterText] = useState("");

  // Dynamic skill form params
  const [articleSkillParams, setArticleSkillParams] = useState<Record<string, any>>({});

  // Advanced style overrides (undefined = use preset default)
  const [headerEnabled, setHeaderEnabled] = useState<boolean | undefined>(undefined);
  const [showDeckTitle, setShowDeckTitle] = useState<boolean | undefined>(undefined);
  const [footerEnabled, setFooterEnabled] = useState<boolean | undefined>(undefined);
  const [showPageNumber, setShowPageNumber] = useState<boolean | undefined>(undefined);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Progress state
  const [taskId, setTaskId] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  const utils = trpc.useUtils();

  // Fetch skills
  const skillsQuery = trpc.skills.getUserVisibleSkills.useQuery({ limit: 100 });
  const skills = skillsQuery.data?.skills ?? [];

  // Fetch skill input schema for dynamic form
  const skillSchemaQuery = trpc.skills.getInputSchema.useQuery(
    { skillId: selectedArticleSkill },
    { enabled: selectedArticleSkill !== "", staleTime: 300_000 },
  );
  const skillSchema = skillSchemaQuery.data?.hasSchema
    ? (skillSchemaQuery.data.schema as SkillInputSchema)
    : null;

  // Restore saved selections from localStorage when skills load
  useEffect(() => {
    if (skills.length === 0) return;
    const savedArticle = localStorage.getItem("smartspec_aiDraft_articleSkill");
    if (
      savedArticle &&
      !selectedArticleSkill &&
      skills.some(
        (s: { slug: string; executionMode?: string }) =>
          s.slug === savedArticle && s.executionMode !== "media-generate",
      )
    ) {
      setSelectedArticleSkill(savedArticle);
    }
    const savedImage = localStorage.getItem("smartspec_aiDraft_imageSkill");
    if (
      savedImage &&
      !selectedImageSkill &&
      (savedImage === "__none__" ||
        skills.some((s: { slug: string }) => s.slug === savedImage))
    ) {
      setSelectedImageSkill(savedImage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skills.length]);

  // Restore saved image model from localStorage
  useEffect(() => {
    const savedModel = localStorage.getItem("smartspec_aiDraft_imageModel");
    if (savedModel && !imageModel) {
      setImageModel(savedModel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Memoize skill lists for comboboxes
  const articleSkillItems = useMemo(
    () =>
      skills
        .filter(
          (s: { executionMode?: string }) =>
            s.executionMode !== "media-generate",
        )
        .map((s: { slug: string; name: string; description?: string }) => ({
          value: s.slug,
          label: s.name,
          description: s.description,
        })),
    [skills],
  );

  const imageSkillItems = useMemo(
    () => [
      { value: "__none__", label: "None" },
      ...skills
        .filter(
          (s: { executionMode?: string }) =>
            s.executionMode === "media-generate",
        )
        .map((s: { slug: string; name: string; description?: string }) => ({
          value: s.slug,
          label: s.name,
          description: s.description,
        })),
    ],
    [skills],
  );

  // Mutations
  const generateDraft = trpc.presentation.ai.generateDraft.useMutation();
  const cancelDraft = trpc.presentation.ai.cancelDraft.useMutation();

  // Polling progress
  const progressQuery = trpc.presentation.ai.getDraftProgress.useQuery(
    { taskId: taskId! },
    {
      enabled: taskId !== null && !completed,
      refetchInterval: 2000,
    },
  );
  const progress = progressQuery.data;

  // Track completion
  useEffect(() => {
    if (progress?.completed && !completed) {
      setCompleted(true);
    }
  }, [progress?.completed, completed]);

  const selectedPreset = getBuiltInPreset(selectedPresetId);

  const canGenerate =
    topic.length >= 3 &&
    selectedArticleSkill !== "" &&
    !generateDraft.isPending;

  const handleGenerate = useCallback(() => {
    // Build style overrides (only include fields explicitly changed by user)
    const overrides: Record<string, boolean> = {};
    if (headerEnabled !== undefined) overrides.headerEnabled = headerEnabled;
    if (showDeckTitle !== undefined) overrides.showDeckTitle = showDeckTitle;
    if (footerEnabled !== undefined) overrides.footerEnabled = footerEnabled;
    if (showPageNumber !== undefined) overrides.showPageNumber = showPageNumber;
    const hasOverrides = Object.keys(overrides).length > 0;

    generateDraft.mutate(
      {
        deckId,
        expectedVersion,
        prompt: topic,
        numSlides,
        language: language as "auto" | "en" | "th",
        articleSkillId: selectedArticleSkill,
        imageSkillId:
          selectedImageSkill && selectedImageSkill !== "__none__"
            ? selectedImageSkill
            : undefined,
        imageModel: imageModel || undefined,
        stylePresetId: selectedPresetId as (typeof AI_STYLE_PRESET_IDS)[number],
        footerCustomText: footerText || undefined,
        styleOverrides: hasOverrides ? overrides : undefined,
        articleSkillParams:
          Object.keys(articleSkillParams).length > 0
            ? articleSkillParams
            : undefined,
      },
      {
        onSuccess: (data) => {
          setTaskId(data.taskId);
          setCompleted(false);
        },
        onError: (err) => {
          toast.error(err.message || "Failed to start generation");
        },
      },
    );
  }, [
    generateDraft,
    deckId,
    expectedVersion,
    topic,
    numSlides,
    language,
    selectedArticleSkill,
    selectedImageSkill,
    imageModel,
    selectedPresetId,
    footerText,
    headerEnabled,
    showDeckTitle,
    footerEnabled,
    showPageNumber,
    articleSkillParams,
  ]);

  const handleCancel = useCallback(() => {
    if (taskId) {
      cancelDraft.mutate({ taskId });
    }
  }, [cancelDraft, taskId]);

  const handleClose = useCallback(() => {
    if (completed && progress?.result) {
      utils.presentation.getDeck.invalidate({ deckId });
    }
    setTaskId(null);
    setCompleted(false);
    onClose();
  }, [completed, progress, utils, deckId, onClose]);

  const handlePresetSelect = useCallback((id: string) => {
    setSelectedPresetId(id);
    const preset = getBuiltInPreset(id);
    setFooterText(preset?.footer?.customText ?? "");
    // Reset overrides so they follow the new preset defaults
    setHeaderEnabled(undefined);
    setShowDeckTitle(undefined);
    setFooterEnabled(undefined);
    setShowPageNumber(undefined);
  }, []);

  const progressPercent = progress
    ? Math.max(
        0,
        Math.round(
          ((progress.phase -
            1 +
            (progress.totalSlides > 0
              ? progress.slidesCompleted / progress.totalSlides
              : 0)) /
            6) *
            100,
        ),
      )
    : 0;

  // Computed effective values for advanced toggles
  const effectiveHeaderEnabled =
    headerEnabled ?? selectedPreset?.header?.enabled ?? false;
  const effectiveShowDeckTitle =
    showDeckTitle ?? selectedPreset?.header?.showDeckTitle ?? false;
  const effectiveFooterEnabled =
    footerEnabled ?? selectedPreset?.footer?.enabled ?? false;
  const effectiveShowPageNumber =
    showPageNumber ?? selectedPreset?.footer?.showPageNumber ?? false;

  // Config phase
  const configView = (
    <div className="space-y-4">
      {/* Topic */}
      <div className="space-y-1.5">
        <Label htmlFor="ai-topic">Topic</Label>
        <textarea
          id="ai-topic"
          className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[80px] w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          placeholder="Describe what your presentation should be about..."
          maxLength={1000}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
      </div>

      {/* Slide count */}
      <div className="space-y-1.5">
        <Label>Number of slides: {numSlides}</Label>
        <Slider
          min={1}
          max={10}
          step={1}
          value={[numSlides]}
          onValueChange={(v) => setNumSlides(v[0])}
        />
      </div>

      {/* Language */}
      <div className="space-y-1.5">
        <Label>Language</Label>
        <Select value={language} onValueChange={setLanguage}>
          <SelectTrigger>
            <SelectValue placeholder="Select language" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto-detect</SelectItem>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="th">Thai</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Article skill (searchable) */}
      <div className="space-y-1.5">
        <Label>Article Skill</Label>
        <SearchableCombobox
          items={articleSkillItems}
          value={selectedArticleSkill}
          onValueChange={(v) => {
            setSelectedArticleSkill(v);
            setArticleSkillParams({});
            localStorage.setItem("smartspec_aiDraft_articleSkill", v);
          }}
          placeholder="Select article skill..."
          searchPlaceholder="Search skills..."
          emptyMessage="No article skills found."
        />
      </div>

      {/* Dynamic skill form fields */}
      {skillSchema && (
        <div className="rounded-md border border-muted bg-muted/30 p-3">
          <DynamicSkillForm
            schema={skillSchema}
            language={language === "th" ? "th" : "en"}
            values={articleSkillParams}
            onChange={setArticleSkillParams}
            excludeFields={["topic", "prompt", "subject"]}
            className="space-y-3"
          />
        </div>
      )}

      {/* Image skill (searchable, optional) */}
      <div className="space-y-1.5">
        <Label>Image Skill (optional)</Label>
        <SearchableCombobox
          items={imageSkillItems}
          value={selectedImageSkill || "__none__"}
          onValueChange={(v) => {
            setSelectedImageSkill(v);
            localStorage.setItem("smartspec_aiDraft_imageSkill", v);
          }}
          placeholder="None"
          searchPlaceholder="Search image skills..."
          emptyMessage="No image skills found."
        />
      </div>

      {/* Image model (searchable from DB) */}
      <div className="space-y-1.5">
        <Label>Image Model (optional)</Label>
        <ImageModelCombobox
          value={imageModel}
          onValueChange={(v) => {
            setImageModel(v);
            if (v) {
              localStorage.setItem("smartspec_aiDraft_imageModel", v);
            } else {
              localStorage.removeItem("smartspec_aiDraft_imageModel");
            }
          }}
        />
      </div>

      {/* Style preset selector */}
      <div className="space-y-1.5">
        <Label>Style Preset</Label>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {BUILT_IN_PRESETS.map((preset: SlideStylePreset) => (
            <div
              key={preset.id}
              data-preset-id={preset.id}
              data-selected={
                preset.id === selectedPresetId ? "true" : "false"
              }
              role="radio"
              aria-checked={preset.id === selectedPresetId}
              aria-label={preset.name}
              tabIndex={0}
              className={`flex w-[120px] shrink-0 cursor-pointer flex-col items-center gap-1 rounded-lg border-2 p-2 transition-colors ${
                preset.id === selectedPresetId
                  ? "border-blue-500 ring-2 ring-blue-500"
                  : "border-transparent hover:border-gray-300"
              }`}
              onClick={() => handlePresetSelect(preset.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handlePresetSelect(preset.id);
                }
              }}
            >
              <div className="flex gap-1">
                <div
                  className="h-4 w-4 rounded-full border"
                  style={{ backgroundColor: preset.colors.background }}
                />
                <div
                  className="h-4 w-4 rounded-full border"
                  style={{ backgroundColor: preset.colors.primary }}
                />
                <div
                  className="h-4 w-4 rounded-full border"
                  style={{ backgroundColor: preset.colors.secondary }}
                />
                <div
                  className="h-4 w-4 rounded-full border"
                  style={{ backgroundColor: preset.colors.text }}
                />
              </div>
              <span className="text-xs font-medium">{preset.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Advanced style options */}
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger className="flex w-full items-center gap-1.5 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <Settings2 className="h-3.5 w-3.5" />
          <span>Advanced Style Options</span>
          <ChevronDown
            className={cn(
              "ml-auto h-3.5 w-3.5 transition-transform",
              advancedOpen && "rotate-180",
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="ml-2 space-y-3 border-l-2 border-muted pl-3 pt-3">
            {/* Header section */}
            <div className="flex items-center justify-between">
              <Label className="text-sm">Show Header</Label>
              <Switch
                checked={effectiveHeaderEnabled}
                onCheckedChange={setHeaderEnabled}
              />
            </div>
            {effectiveHeaderEnabled && (
              <div className="flex items-center justify-between pl-4">
                <Label className="text-sm text-muted-foreground">
                  Show Deck Title
                </Label>
                <Switch
                  checked={effectiveShowDeckTitle}
                  onCheckedChange={setShowDeckTitle}
                />
              </div>
            )}

            {/* Footer section */}
            <div className="flex items-center justify-between">
              <Label className="text-sm">Show Footer</Label>
              <Switch
                checked={effectiveFooterEnabled}
                onCheckedChange={setFooterEnabled}
              />
            </div>
            {effectiveFooterEnabled && (
              <>
                <div className="flex items-center justify-between pl-4">
                  <Label className="text-sm text-muted-foreground">
                    Show Page Number
                  </Label>
                  <Switch
                    checked={effectiveShowPageNumber}
                    onCheckedChange={setShowPageNumber}
                  />
                </div>
                <div className="space-y-1 pl-4">
                  <Label
                    htmlFor="ai-footer"
                    className="text-sm text-muted-foreground"
                  >
                    Custom Footer Text
                  </Label>
                  <Input
                    id="ai-footer"
                    placeholder="Enter custom footer text..."
                    maxLength={200}
                    value={footerText}
                    onChange={(e) => setFooterText(e.target.value)}
                  />
                </div>
              </>
            )}

            {/* Future: Logo, Watermark */}
            <div className="flex items-center justify-between opacity-50">
              <Label className="text-sm text-muted-foreground">
                Logo / Watermark
              </Label>
              <span className="text-xs text-muted-foreground">Coming soon</span>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Non-empty deck warning */}
      {currentSlideCount > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {currentSlideCount} slides will be added at the end of your deck.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );

  // Progress phase
  const progressView = (
    <div className="space-y-4">
      {progress && !progress.completed && (
        <>
          <div className="text-sm font-medium">
            Phase {progress.phase}/6: {progress.phaseLabel}
          </div>
          <Progress value={progressPercent} />
          {progress.slidePreview.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {progress.slidePreview.map(
                (
                  slide: { title: string; imageStatus: string },
                  i: number,
                ) => (
                  <div
                    key={i}
                    className="rounded border p-2 text-center text-xs"
                  >
                    <div className="font-medium">{slide.title}</div>
                    <div className="text-muted-foreground">
                      {slide.imageStatus === "done" ? (
                        <Check className="mx-auto h-3 w-3 text-green-500" />
                      ) : (
                        <Loader2 className="mx-auto h-3 w-3 animate-spin" />
                      )}
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </>
      )}

      {progress?.completed && progress.result && !progress.cancelled && (
        <Alert className="border-green-500">
          <Check className="h-4 w-4 text-green-500" />
          <AlertDescription>
            Successfully added {progress.result.slidesAdded} slides to your
            deck.
            {progress.result.warnings?.length > 0 && (
              <ul className="mt-1 list-disc pl-4 text-xs">
                {progress.result.warnings.map((w: string, i: number) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}

      {progress?.completed && progress.cancelled && (
        <Alert className="border-amber-500">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertDescription>
            Generation cancelled. No slides were added.
          </AlertDescription>
        </Alert>
      )}

      {progress?.error && (
        <Alert className="border-red-500">
          <X className="h-4 w-4 text-red-500" />
          <AlertDescription>{progress.error.message}</AlertDescription>
        </Alert>
      )}

      {!progress && taskId && (
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Starting generation...
        </div>
      )}
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Draft with AI
          </DialogTitle>
          <DialogDescription>
            Generate presentation slides from a topic using AI.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {taskId ? progressView : configView}
        </div>

        <DialogFooter className="shrink-0 border-t px-6 pt-4 pb-6">
          {!taskId && (
            <Button
              onClick={handleGenerate}
              disabled={!canGenerate}
              aria-label="Generate slides"
            >
              {generateDraft.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1 h-3.5 w-3.5" />
              )}
              Generate
            </Button>
          )}

          {taskId && !completed && (
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={cancelDraft.isPending}
              aria-label="Cancel generation"
            >
              {cancelDraft.isPending ? "Cancelling..." : "Cancel"}
            </Button>
          )}

          {taskId && completed && !progress?.error && (
            <Button onClick={handleClose} aria-label="Close">
              Close
            </Button>
          )}

          {taskId && progress?.error && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setTaskId(null);
                  setCompleted(false);
                }}
              >
                Retry
              </Button>
              <Button onClick={handleClose}>Close</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
