import { useState, useCallback, useEffect } from "react";
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
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  BUILT_IN_PRESETS,
  getBuiltInPreset,
} from "@shared/presentation/aiStylePresets";
import type { SlideStylePreset } from "@shared/presentation/aiTypes";
import { AI_STYLE_PRESET_IDS } from "@shared/presentation/aiTypes";
import {
  Sparkles,
  Loader2,
  Check,
  AlertTriangle,
  X,
} from "lucide-react";

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

  // Progress state
  const [taskId, setTaskId] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  const utils = trpc.useUtils();

  // Fetch skills
  const skillsQuery = trpc.skills.getUserVisibleSkills.useQuery({ limit: 100 });
  const skills = skillsQuery.data?.skills ?? [];

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
  const showFooterInput =
    selectedPreset?.footer?.enabled && selectedPreset.footer.showCustomText;

  const canGenerate =
    topic.length >= 3 && selectedArticleSkill !== "" && !generateDraft.isPending;

  const handleGenerate = useCallback(() => {
    generateDraft.mutate(
      {
        deckId,
        expectedVersion,
        prompt: topic,
        numSlides,
        language: language as "auto" | "en" | "th",
        articleSkillId: selectedArticleSkill,
        imageSkillId: selectedImageSkill && selectedImageSkill !== "__none__" ? selectedImageSkill : undefined,
        imageModel: imageModel || undefined,
        stylePresetId: selectedPresetId as (typeof AI_STYLE_PRESET_IDS)[number],
        footerCustomText: footerText || undefined,
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
    skills,
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

  const handlePresetSelect = useCallback(
    (id: string) => {
      setSelectedPresetId(id);
      const preset = getBuiltInPreset(id);
      setFooterText(preset?.footer?.customText ?? "");
    },
    [],
  );

  const progressPercent = progress
    ? Math.max(
        0,
        Math.round(
          ((progress.phase - 1 + (progress.totalSlides > 0 ? progress.slidesCompleted / progress.totalSlides : 0)) / 6) * 100,
        ),
      )
    : 0;

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

      {/* Article skill */}
      <div className="space-y-1.5">
        <Label>Article Skill</Label>
        <Select value={selectedArticleSkill} onValueChange={setSelectedArticleSkill}>
          <SelectTrigger>
            <SelectValue placeholder="Select a skill..." />
          </SelectTrigger>
          <SelectContent>
            {skills
              .filter((s: { executionMode?: string }) => s.executionMode !== "media-generate")
              .map((s: { slug: string; name: string }) => (
                <SelectItem key={s.slug} value={s.slug}>
                  {s.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      {/* Image skill (optional) */}
      <div className="space-y-1.5">
        <Label>Image Skill (optional)</Label>
        <Select value={selectedImageSkill} onValueChange={setSelectedImageSkill}>
          <SelectTrigger>
            <SelectValue placeholder="None" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">None</SelectItem>
            {skills
              .filter((s: { executionMode?: string }) => s.executionMode === "media-generate")
              .map((s: { slug: string; name: string }) => (
                <SelectItem key={s.slug} value={s.slug}>
                  {s.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      {/* Image model (optional) */}
      <div className="space-y-1.5">
        <Label htmlFor="ai-image-model">Image Model (optional)</Label>
        <Input
          id="ai-image-model"
          placeholder="e.g., flux-2.0 (leave empty for default)"
          value={imageModel}
          onChange={(e) => setImageModel(e.target.value)}
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
              data-selected={preset.id === selectedPresetId ? "true" : "false"}
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

      {/* Footer text (conditional) */}
      {showFooterInput && (
        <div className="space-y-1.5">
          <Label htmlFor="ai-footer">Footer Text</Label>
          <Input
            id="ai-footer"
            placeholder="Enter custom footer text..."
            maxLength={200}
            value={footerText}
            onChange={(e) => setFooterText(e.target.value)}
          />
        </div>
      )}

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
                (slide: { title: string; imageStatus: string }, i: number) => (
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
            Successfully added {progress.result.slidesAdded} slides to your deck.
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
          <AlertDescription>
            {progress.error.message}
          </AlertDescription>
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Draft with AI
          </DialogTitle>
          <DialogDescription>
            Generate presentation slides from a topic using AI.
          </DialogDescription>
        </DialogHeader>

        {taskId ? progressView : configView}

        <DialogFooter>
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
