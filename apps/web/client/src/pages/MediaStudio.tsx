/**
 * Media Studio Page - SmartSpec Pro
 * Full-featured media generation interface with reference images, Auto Prompt, and history
 */

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sparkles,
  Image,
  Video,
  Music,
  Wand2,
  Zap,
  Download,
  Clock,
  ChevronLeft,
  RefreshCw,
  X,
  Upload,
  ImagePlus,
  Loader2,
  Check,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Trash2,
  ExternalLink,
  Palette,
  Settings,
  Bot,
  History,
  Layers,
  User,
  ScanFace,
  Maximize2,
  Copy,
  CheckCircle,
  Search,
  Languages,
  Mic,
  Grid2X2,
  Scissors,
  AlertCircle,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import ModelSelectorDialog from "@/components/media/ModelSelectorDialog";
import { usePushToTalk } from "@/hooks/usePushToTalk";

import DynamicSkillForm, { type SkillInputSchema, type StyleAction } from "@/components/media/DynamicSkillForm";
import {
  COMMON_GRIDS,
  detectGrid,
  splitImage,
  createSplitPreview,
  downloadSplitImage,
  downloadAllSplitImages,
  type SplitResult,
  type DetectedGrid,
} from "@/lib/imageGridSplitter";

type MediaType = "image" | "video" | "audio";

interface ReferenceImage {
  url: string;
  name: string;
}

interface GeneratedMedia {
  id: string;
  type: MediaType;
  url: string;
  prompt: string;
  model: string;
  createdAt: string;
  creditsUsed?: number;
}

// Track individual image generation tasks for progressive preview
interface GenerationTask {
  id: string;
  index: number;
  status: 'queued' | 'generating' | 'completed' | 'error';
  url?: string;
  error?: string;
}

interface StyleOption {
  id: string;
  name: string;
  description: string;
}

interface StyleCategory {
  id: string;
  name: string;
  styles: StyleOption[];
}

// Per-tab state structure - each tab has independent controls
interface TabState {
  prompt: string;
  enhancedPrompt: string;
  referenceImages: ReferenceImage[];
  selectedSkillId: string;
  useAdvancedMode: boolean;
  dynamicFormValues: Record<string, any>;
  selectedStyleCategory: string;
  selectedStyle: string;
  selectedVfxCategory: string;
  selectedVfxEffect: string;
  realisticSkin: boolean;
  faceLock: boolean;
  modelInputValues: Record<string, any>;
  selectedModel: string;
  numImages: number;
  aspectRatio: string;
  duration: number;
  selectedLlmModel: string;
  skillInitialized: boolean;
  modelInitialized: boolean;
}

// Default state for each tab
const createDefaultTabState = (mediaType: MediaType): TabState => ({
  prompt: "",
  enhancedPrompt: "",
  referenceImages: [],
  selectedSkillId: "",
  useAdvancedMode: false,
  dynamicFormValues: {},
  selectedStyleCategory: "",
  selectedStyle: "",
  selectedVfxCategory: "",
  selectedVfxEffect: "",
  realisticSkin: false,
  faceLock: false,
  modelInputValues: {},
  selectedModel: "",
  numImages: 1,
  aspectRatio: mediaType === "video" ? (localStorage.getItem("smartspec_aspect_video") || "16:9") : (localStorage.getItem("smartspec_aspect_image") || "1:1"),
  duration: parseInt(localStorage.getItem("smartspec_duration_video") || "5", 10),
  selectedLlmModel: "",
  skillInitialized: false,
  modelInitialized: false,
});

// Default prompt for Upscale style - auto-fills when user selects "upscale"
const UPSCALE_DEFAULT_PROMPT = "Upscale and enhance this low-resolution image to high clarity while maintaining the original identity and natural appearance. Restore fine textures, edges, and micro-details without inventing unrealistic features. Remove noise, artifacts, and compression blocks. Do not change the pose, lighting, clothing, or background. Keep the improvement subtle, natural, and faithful to the original.";

/**
 * Parse skill output for "both" mode (image_video_generation skills)
 * Extracts header (title, character, environment) + image prompts vs video prompts
 */
function parseSkillOutputForBothMode(content: string): { imagePrompt: string; videoPrompt: string } | null {
  // Detect image prompts section (English or Thai) - match **Image Prompts:** or **Prompt สร้างภาพ:**
  const imagePromptPatterns = [
    /\*\*Image Prompts:?\*\*/i,
    /\*\*Prompt สร้างภาพ:?\*\*/i,
  ];

  // Detect video prompts section (English or Thai)
  const videoPromptPatterns = [
    /\*\*Video Prompts:?\*\*/i,
    /\*\*Prompt สร้างวิดีโอ:?\*\*/i,
  ];

  // Find the positions of image and video sections
  let imageStart = -1;
  let videoStart = -1;

  for (const pattern of imagePromptPatterns) {
    const match = content.search(pattern);
    if (match !== -1 && (imageStart === -1 || match < imageStart)) {
      imageStart = match;
    }
  }

  for (const pattern of videoPromptPatterns) {
    const match = content.search(pattern);
    if (match !== -1 && (videoStart === -1 || match < videoStart)) {
      videoStart = match;
    }
  }

  // If both sections not found, return null (don't split)
  if (imageStart === -1 || videoStart === -1) {
    return null;
  }

  // Extract header (everything before the first prompt section)
  const firstSectionStart = Math.min(imageStart, videoStart);
  const header = content.substring(0, firstSectionStart).trim();

  // Determine section order and extract prompts
  let imageSection: string;
  let videoSection: string;

  if (imageStart < videoStart) {
    // Image section comes first
    imageSection = content.substring(imageStart, videoStart).trim();
    videoSection = content.substring(videoStart).trim();
  } else {
    // Video section comes first
    videoSection = content.substring(videoStart, imageStart).trim();
    imageSection = content.substring(imageStart).trim();
  }

  // Combine header with each section
  const imagePrompt = `${header}\n\n${imageSection}`;
  const videoPrompt = `${header}\n\n${videoSection}`;

  return { imagePrompt, videoPrompt };
}

export default function MediaStudio() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  // Active tab state
  const [activeTab, setActiveTab] = useState<MediaType>("image");

  // Per-tab state - each tab has independent controls
  const [tabStates, setTabStates] = useState<Record<MediaType, TabState>>(() => ({
    image: createDefaultTabState("image"),
    video: createDefaultTabState("video"),
    audio: createDefaultTabState("audio"),
  }));

  // Helper to update a specific field in the current tab's state
  const updateTabState = useCallback(<K extends keyof TabState>(field: K, value: TabState[K]) => {
    setTabStates(prev => ({
      ...prev,
      [activeTab]: { ...prev[activeTab], [field]: value }
    }));
  }, [activeTab]);

  // Helper to update multiple fields at once
  const updateTabStateMultiple = useCallback((updates: Partial<TabState>) => {
    setTabStates(prev => ({
      ...prev,
      [activeTab]: { ...prev[activeTab], ...updates }
    }));
  }, [activeTab]);

  // Derived state from current tab (for easier access)
  const currentTabState = tabStates[activeTab];
  const prompt = currentTabState.prompt;
  const enhancedPrompt = currentTabState.enhancedPrompt;
  const referenceImages = currentTabState.referenceImages;
  const selectedSkillId = currentTabState.selectedSkillId;
  const useAdvancedMode = currentTabState.useAdvancedMode;
  const dynamicFormValues = currentTabState.dynamicFormValues;
  const selectedStyleCategory = currentTabState.selectedStyleCategory;
  const selectedStyle = currentTabState.selectedStyle;
  const selectedVfxCategory = currentTabState.selectedVfxCategory;
  const selectedVfxEffect = currentTabState.selectedVfxEffect;
  const realisticSkin = currentTabState.realisticSkin;
  const faceLock = currentTabState.faceLock;
  const modelInputValues = currentTabState.modelInputValues;
  const selectedModel = currentTabState.selectedModel;
  const numImages = currentTabState.numImages;
  const aspectRatio = currentTabState.aspectRatio;
  const duration = currentTabState.duration;
  const selectedLlmModel = currentTabState.selectedLlmModel;
  const skillInitialized = currentTabState.skillInitialized;
  const modelInitialized = currentTabState.modelInitialized;

  // Setter functions that update the current tab's state
  const setPrompt = useCallback((value: string | ((prev: string) => string)) => {
    setTabStates(prev => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        prompt: typeof value === 'function' ? value(prev[activeTab].prompt) : value
      }
    }));
  }, [activeTab]);

  const setEnhancedPrompt = useCallback((value: string | ((prev: string) => string)) => {
    setTabStates(prev => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        enhancedPrompt: typeof value === 'function' ? value(prev[activeTab].enhancedPrompt) : value
      }
    }));
  }, [activeTab]);

  const setReferenceImages = useCallback((value: ReferenceImage[] | ((prev: ReferenceImage[]) => ReferenceImage[])) => {
    setTabStates(prev => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        referenceImages: typeof value === 'function' ? value(prev[activeTab].referenceImages) : value
      }
    }));
  }, [activeTab]);

  const setSelectedSkillId = useCallback((value: string) => updateTabState('selectedSkillId', value), [updateTabState]);
  const setUseAdvancedMode = useCallback((value: boolean) => updateTabState('useAdvancedMode', value), [updateTabState]);
  const setDynamicFormValues = useCallback((value: Record<string, any>) => updateTabState('dynamicFormValues', value), [updateTabState]);
  const setSelectedStyleCategory = useCallback((value: string) => updateTabState('selectedStyleCategory', value), [updateTabState]);
  const setSelectedStyle = useCallback((value: string) => updateTabState('selectedStyle', value), [updateTabState]);
  const setSelectedVfxCategory = useCallback((value: string) => updateTabState('selectedVfxCategory', value), [updateTabState]);
  const setSelectedVfxEffect = useCallback((value: string) => updateTabState('selectedVfxEffect', value), [updateTabState]);
  const setRealisticSkin = useCallback((value: boolean) => updateTabState('realisticSkin', value), [updateTabState]);
  const setFaceLock = useCallback((value: boolean) => updateTabState('faceLock', value), [updateTabState]);
  const setModelInputValues = useCallback((value: Record<string, any> | ((prev: Record<string, any>) => Record<string, any>)) => {
    setTabStates(prev => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        modelInputValues: typeof value === 'function' ? value(prev[activeTab].modelInputValues) : value
      }
    }));
  }, [activeTab]);
  const setSelectedModel = useCallback((value: string) => updateTabState('selectedModel', value), [updateTabState]);
  const setNumImages = useCallback((value: number) => updateTabState('numImages', value), [updateTabState]);
  const setAspectRatio = useCallback((value: string) => updateTabState('aspectRatio', value), [updateTabState]);
  const setDuration = useCallback((value: number) => updateTabState('duration', value), [updateTabState]);
  const setSelectedLlmModel = useCallback((value: string) => updateTabState('selectedLlmModel', value), [updateTabState]);
  const setSkillInitialized = useCallback((value: boolean) => updateTabState('skillInitialized', value), [updateTabState]);
  const setModelInitialized = useCallback((value: boolean) => updateTabState('modelInitialized', value), [updateTabState]);

  // Loading state (global)
  const [isEnhancing, setIsEnhancing] = useState(false);

  // Split prompts for image_video_generation skills with outputType="both"
  const [imageTabPrompt, setImageTabPrompt] = useState<string | null>(null);
  const [videoTabPrompt, setVideoTabPrompt] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Ref to track current prompt textarea value (for reliable history storage)
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Generation state (global - shows results from any tab)
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedMedia, setGeneratedMedia] = useState<GeneratedMedia[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // Track multiple generation tasks for progressive preview (when count > 1)
  const [generationTasks, setGenerationTasks] = useState<GenerationTask[]>([]);
  // Track session start time to filter out old failed tasks from History Gallery
  const [sessionStartTime] = useState<Date>(() => new Date());

  // Dialog states (global)
  const [showStyleDialog, setShowStyleDialog] = useState(false);
  const [showVfxDialog, setShowVfxDialog] = useState(false);
  const [showSkillDialog, setShowSkillDialog] = useState(false);

  // Translation state (global)
  const [translatedText, setTranslatedText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [translationCopied, setTranslationCopied] = useState(false);
  const translateMutation = trpc.translation.translate.useMutation({
    onSuccess: (data) => {
      setTranslatedText(data.translatedText);
      setShowTranslation(true);
      setIsTranslating(false);
    },
    onError: (err: any) => {
      toast.error(err.message || 'Translation failed');
      setIsTranslating(false);
    },
  });

  // Push-to-talk (uses current tab's prompt)
  const { isRecording: isPttRecording, isTranscribing: isPttTranscribing, startRecording: pttStart, stopRecording: pttStop } = usePushToTalk({
    onTranscription: (text) => {
      if (enhancedPrompt) {
        setEnhancedPrompt((prev) => prev ? `${prev} ${text}` : text);
      } else {
        setPrompt((prev) => prev ? `${prev} ${text}` : text);
      }
    },
    onError: (err) => toast.error(err),
  });

  // Model selection dialog state
  const [showModelDialog, setShowModelDialog] = useState(false);

  // Drag & drop state
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Image lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<{
    url: string;
    prompt: string;
    model?: string;
    createdAt?: string;
  } | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // Grid split state
  const [showSplitDialog, setShowSplitDialog] = useState(false);
  const [splitImageUrl, setSplitImageUrl] = useState<string | null>(null);
  const [splitGridRows, setSplitGridRows] = useState(2);
  const [splitGridCols, setSplitGridCols] = useState(2);
  const [splitPreviewUrl, setSplitPreviewUrl] = useState<string | null>(null);
  const [splitResults, setSplitResults] = useState<SplitResult[]>([]);
  const [isSplitting, setIsSplitting] = useState(false);
  const [detectedGrid, setDetectedGrid] = useState<DetectedGrid | null>(null);
  const [isDetectingGrid, setIsDetectingGrid] = useState(false);

  // LLM model search (UI state, not per-tab)
  const [llmModelSearch, setLlmModelSearch] = useState("");

  // API queries
  const { data: credits } = trpc.credits.balance.useQuery();
  const { data: styleCategories } = trpc.skills.getStyleCategories.useQuery();
  const { data: vfxCategories } = trpc.skills.getVFXCategories.useQuery();
  // Fetch user-visible skills (respects per-user visibility settings)
  const { data: userVisibleSkillsRaw } = trpc.skills.getUserVisibleSkills.useQuery({});
  // Map to the shape expected by SkillSelectorDialog and skill selection logic
  const skillsList = useMemo(() => {
    if (!userVisibleSkillsRaw?.skills) return undefined;
    return userVisibleSkillsRaw.skills.map((s) => ({
      id: s.slug,
      name: s.name,
      description: s.description || "",
      icon: s.icon || "sparkles",
      // Map DB category (underscored) to type (hyphenated) for compatibility
      type: (s.category || "other").replace(/_/g, "-"),
      creditMultiplier: Number(s.creditMultiplier) || 1,
      enabledByDefault: s.enabledByDefault ?? true,
      priority: s.priority ?? 50,
      hasSkillFile: false,
      // executionMode determines which endpoint to use:
      // "enhance-prompt" -> enhancePrompt endpoint
      // "llm-only" or undefined -> executeCustomSkill endpoint
      executionMode: s.executionMode || "llm-only",
    }));
  }, [userVisibleSkillsRaw]);
  const { data: mediaModels } = trpc.mediaModels.list.useQuery({ type: activeTab });
  const { data: mediaHistory } = trpc.media.listTasks.useQuery({
    limit: 50,
    mediaType: activeTab,
    daysAgo: 7
  });

  // Query for skill input schema (for dynamic form)
  const { data: skillSchemaData } = trpc.skills.getInputSchema.useQuery(
    { skillId: selectedSkillId },
    { enabled: !!selectedSkillId }
  );
  const skillSchema = skillSchemaData?.hasSchema ? skillSchemaData.schema as SkillInputSchema : null;

  // Query for vision-capable LLM models (for Auto Prompt model selection)
  const { data: visionModels } = trpc.skills.getVisionModels.useQuery();

  // Query for skill's default model configuration
  const { data: skillConfig } = trpc.skills.getSkillConfig.useQuery(
    { skillId: selectedSkillId },
    { enabled: !!selectedSkillId }
  );

  // Mutations
  const uploadMutation = trpc.ai.upload.useMutation();
  const executeSkillMutation = trpc.chat.executeSkill.useMutation();
  const enhancePromptMutation = trpc.skills.enhancePrompt.useMutation();
  const executeCustomSkillMutation = trpc.skills.executeCustomSkill.useMutation();

  // Auth redirect
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [isLoading, isAuthenticated, setLocation]);

  // Set model from localStorage or default when models load
  useEffect(() => {
    if (modelInitialized) return;
    if (!mediaModels?.models || mediaModels.models.length === 0) return;

    // 1. Check localStorage for last used model for this media type
    const storageKey = `smartspec_model_${activeTab}`;
    const savedModelId = localStorage.getItem(storageKey);

    if (savedModelId) {
      // Verify the saved model still exists
      const savedModel = mediaModels.models.find(m => m.modelId === savedModelId);
      if (savedModel) {
        setSelectedModel(savedModelId);
        setModelInitialized(true);
        return;
      }
    }

    // 2. Fallback: select first model (sorted by priority in API)
    setSelectedModel(mediaModels.models[0].modelId);
    setModelInitialized(true);
  }, [mediaModels, activeTab, modelInitialized]);

  // Save selected model to localStorage when user changes it
  useEffect(() => {
    if (modelInitialized && selectedModel) {
      const storageKey = `smartspec_model_${activeTab}`;
      localStorage.setItem(storageKey, selectedModel);
    }
  }, [selectedModel, activeTab, modelInitialized]);

  // Reset dynamic model input values when model changes, populate with defaults
  useEffect(() => {
    if (!selectedModel || !mediaModels?.models) {
      setModelInputValues({});
      return;
    }
    const model = mediaModels.models.find(m => m.modelId === selectedModel);
    const config = model?.configJson as any;
    if (!config?.inputFields) {
      setModelInputValues({});
      return;
    }
    const defaults: Record<string, any> = {};
    for (const field of config.inputFields) {
      if (field.default !== undefined) {
        defaults[field.key] = field.default;
      }
    }
    setModelInputValues(defaults);

    // Reset aspect ratio if current value is not supported by the new model
    const arField = config.inputFields.find((f: any) => f.key === "aspect_ratio");
    const arOptions = arField?.options?.map((o: any) => o.value) as string[] | undefined;
    const modelAr = model?.aspectRatios as string[] | null;
    const supportedAr = arOptions || (modelAr?.length ? modelAr : null);
    if (supportedAr) {
      if (!supportedAr.includes(aspectRatio)) {
        const defaultAr = arField?.default || supportedAr[0] || "1:1";
        setAspectRatio(defaultAr);
      }
    }
  }, [selectedModel, mediaModels, activeTab, aspectRatio, setAspectRatio]);

  // Save aspect ratio to localStorage when changed (per-tab)
  useEffect(() => {
    const storageKey = activeTab === "video" ? "smartspec_aspect_video" : "smartspec_aspect_image";
    localStorage.setItem(storageKey, aspectRatio);
  }, [aspectRatio, activeTab]);

  // Save duration to localStorage when changed
  useEffect(() => {
    localStorage.setItem("smartspec_duration_video", tabStates.video.duration.toString());
  }, [tabStates.video.duration]);

  // Smart skill selection: localStorage > priority > type match > first enabled
  useEffect(() => {
    if (!skillsList || skillsList.length === 0) return;

    // Map media type to skill types (API returns hyphenated type field like "image-generation")
    const typeMap: Record<string, string[]> = {
      image: ["image-generation", "prompt-enhancement"],
      video: ["video-generation", "prompt-enhancement"],
      audio: ["audio-generation", "sound-effects"],
    };
    const matchingTypes = typeMap[activeTab] || [];

    // 1. Check localStorage for last selected skill for this media type
    const storageKey = `smartspec_last_skill_${activeTab}`;
    const savedSkillId = localStorage.getItem(storageKey);

    if (savedSkillId) {
      // Verify the saved skill still exists and matches the current tab's type
      const savedSkill = skillsList.find(s => s.id === savedSkillId);
      // Only use saved skill if it matches the current tab's type
      if (savedSkill && matchingTypes.includes(savedSkill.type)) {
        setSelectedSkillId(savedSkillId);
        setSkillInitialized(true);
        return;
      }
    }

    // 2. Find skills matching media type, sorted by priority (higher = better)
    // Note: skillsList already filtered by enabledOnly: true in the query
    const matchingSkills = skillsList
      .filter(s => matchingTypes.includes(s.type))
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));

    if (matchingSkills.length > 0) {
      setSelectedSkillId(matchingSkills[0].id);
      setSkillInitialized(true);
      return;
    }

    // 3. Fallback: select first skill by priority
    const sortedSkills = [...skillsList].sort((a, b) => (b.priority || 0) - (a.priority || 0));

    if (sortedSkills.length > 0) {
      setSelectedSkillId(sortedSkills[0].id);
    }
    setSkillInitialized(true);
  }, [skillsList, activeTab]);

  // Save selected skill to localStorage when user changes it (after initial load)
  // Only save if the selected skill matches the current tab's type to prevent cross-tab pollution
  useEffect(() => {
    if (skillInitialized && selectedSkillId && skillsList) {
      const typeMap: Record<string, string[]> = {
        image: ["image-generation", "prompt-enhancement"],
        video: ["video-generation", "prompt-enhancement"],
        audio: ["audio-generation", "sound-effects"],
      };
      const matchingTypes = typeMap[activeTab] || [];

      // Find the selected skill and verify it matches the current tab
      const skill = skillsList.find(s => s.id === selectedSkillId);
      if (skill && matchingTypes.includes(skill.type)) {
        const storageKey = `smartspec_last_skill_${activeTab}`;
        localStorage.setItem(storageKey, selectedSkillId);
      }
    }
  }, [selectedSkillId, activeTab, skillInitialized, skillsList]);

  // Sync split prompts when switching tabs (for image_video_generation skills with outputType="both")
  useEffect(() => {
    if (activeTab === "image" && imageTabPrompt) {
      setEnhancedPrompt(imageTabPrompt);
    } else if (activeTab === "video" && videoTabPrompt) {
      setEnhancedPrompt(videoTabPrompt);
    }
    // Don't clear enhancedPrompt when switching to a tab without split prompt
    // User may have typed their own prompt
  }, [activeTab, imageTabPrompt, videoTabPrompt, setEnhancedPrompt]);

  // Reset dynamic form values when skill changes (per-tab)
  useEffect(() => {
    setDynamicFormValues({});
    // Advanced Mode is OFF by default - user must enable it manually
  }, [selectedSkillId, setDynamicFormValues]);

  // Track if user has manually selected a model (to avoid overriding their choice)
  const [llmModelManuallySet, setLlmModelManuallySet] = useState(false);

  // Set default LLM model when skill config loads (from Skills Management default)
  // Only set default if user hasn't manually selected a model
  useEffect(() => {
    if (llmModelManuallySet) return; // Don't override user's manual selection

    if (skillConfig?.defaultModel) {
      setSelectedLlmModel(skillConfig.defaultModel);
    } else if (visionModels?.models?.length && !selectedLlmModel) {
      // Fallback to first available vision model
      const defaultModel = visionModels.models.find(m => m.isDefault) || visionModels.models[0];
      setSelectedLlmModel(defaultModel.id);
    }
  }, [skillConfig, visionModels, llmModelManuallySet]);

  // Reference image limits per tab (video allows more for storyboards)
  const maxReferenceImages = activeTab === "video" ? 25 : 5;

  // Handle file upload for reference images
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Limit reference images based on tab (video: 25, others: 5)
    const remainingSlots = maxReferenceImages - referenceImages.length;
    const filesToUpload = Array.from(files).slice(0, remainingSlots);

    for (const file of filesToUpload) {
      if (!file.type.startsWith("image/")) {
        continue;
      }

      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const result = await uploadMutation.mutateAsync({
          fileName: file.name,
          fileType: file.type,
          fileBase64: base64,
        });

        setReferenceImages(prev => [...prev, { url: result.url, name: file.name }]);
      } catch (error) {
        console.error("Upload failed:", error);
      }
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Remove reference image
  const removeReferenceImage = (index: number) => {
    setReferenceImages(prev => prev.filter((_, i) => i !== index));
  };

  // Add generated media as reference
  const addAsReference = (media: GeneratedMedia) => {
    if (referenceImages.length >= 5) {
      return;
    }
    setReferenceImages(prev => [...prev, { url: media.url, name: `generated-${media.id}` }]);
  };

  // Add history task image as reference
  const addHistoryAsReference = (task: { id: string; resultUrl?: string }) => {
    if (referenceImages.length >= 5 || !task.resultUrl) {
      return;
    }
    setReferenceImages(prev => [...prev, { url: task.resultUrl!, name: `history-${task.id}` }]);
  };

  // Drag & drop handlers for reference images
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);

    const url = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
    if (url && referenceImages.length < maxReferenceImages) {
      // Check if it's an image URL
      if (url.match(/\.(jpg|jpeg|png|gif|webp|svg)/i) || url.includes("blob:") || url.startsWith("http")) {
        setReferenceImages(prev => [...prev, { url, name: `dropped-${Date.now()}` }]);
      }
    }
  };

  // Handle drag start for history images
  const handleHistoryDragStart = (e: React.DragEvent, url: string) => {
    e.dataTransfer.setData("text/uri-list", url);
    e.dataTransfer.setData("text/plain", url);
    e.dataTransfer.effectAllowed = "copy";
  };

  // Check if a Settings field has a duplicate in Advanced Mode schema
  // Returns true if the field exists in schema and Advanced Mode is enabled
  const isFieldDisabledByAdvancedMode = useCallback((fieldName: string): boolean => {
    if (!useAdvancedMode || !skillSchema) return false;

    // Fields that should NEVER be disabled by Advanced mode
    // These are always controlled via Settings panel and filtered out from Advanced form
    const alwaysEnabledFields = ["aspectRatio"];
    if (alwaysEnabledFields.includes(fieldName)) return false;

    // Map Settings field names to possible schema field IDs
    const fieldMappings: Record<string, string[]> = {
      "style": ["styleCategory", "styleName", "style"],
      "vfx": ["vfxCategory", "vfxEffect", "vfx"],
      "realisticSkin": ["realisticSkin", "realistic_skin"],
      "faceLock": ["faceLock", "face_lock"],
    };

    const schemaFieldIds = fieldMappings[fieldName] || [fieldName];

    // Check if any of the mapped field IDs exist in schema
    for (const section of skillSchema.sections) {
      for (const field of section.fields) {
        if (schemaFieldIds.includes(field.id)) {
          return true;
        }
      }
    }
    return false;
  }, [useAdvancedMode, skillSchema]);

  // Auto Prompt - enhance prompt using selected skill with LLM
  // Works with: text only, images only, or text + images
  // Passes all selected options: style, VFX, realistic skin, face lock, etc.
  // When using advanced mode with dynamic form, uses form values instead
  const handleAutoPrompt = async () => {
    // Allow either text or images (or both) - check both direct and form values
    // In Advanced Mode: combine main Prompt with "Your Idea" (request field) for expanded context
    const mainPrompt = prompt.trim();
    const advancedRequest = useAdvancedMode ? (dynamicFormValues.request as string || "") : "";

    // Combine both fields: Prompt is primary, Your Idea expands on it
    let userIdea = "";
    if (mainPrompt && advancedRequest) {
      userIdea = `${mainPrompt}\n\nAdditional details: ${advancedRequest}`;
    } else {
      userIdea = mainPrompt || advancedRequest;
    }

    if (!userIdea && referenceImages.length === 0) return;

    setIsEnhancing(true);
    try {
      // Determine if we should use custom skill execution or the specialized enhancePrompt endpoint
      // Skills with executionMode: "enhance-prompt" use the specialized enhancePrompt endpoint
      // All other skills use executeCustomSkill which sends skill.md content as system prompt
      const useEnhancePromptEndpoint = currentSkill?.executionMode === "enhance-prompt";

      const isCustomSkill = selectedSkillId && !useEnhancePromptEndpoint;

      if (isCustomSkill) {
        // Use executeCustomSkill for custom skills like viral-talking-objects
        // This sends the skill's content as system prompt to the LLM
        // Works in both Basic Mode (userIdea only) and Advanced Mode (with form values)
        const mappedValues: Record<string, any> = {};

        if (useAdvancedMode && skillSchema) {
          // Advanced Mode: map form values to API parameters
          const outputMapping = skillSchema.outputMapping || {};
          Object.entries(dynamicFormValues).forEach(([key, value]) => {
            const mappedKey = outputMapping[key] || key;
            if (value !== undefined && value !== "" && value !== null) {
              mappedValues[mappedKey] = value;
            }
          });
        }

        // Add the user's prompt/idea (works for both Basic and Advanced Mode)
        if (userIdea) {
          mappedValues.userIdea = userIdea;
          // In Basic Mode, also pass as 'topic' since many skills expect this field
          if (!useAdvancedMode) {
            mappedValues.topic = userIdea;
            // In Basic Mode, also pass default language settings
            // This ensures skills know to use English output format by default
            mappedValues.promptLanguage = "en";
            mappedValues.dialogueLanguage = "en";
          }
        }

        const result = await executeCustomSkillMutation.mutateAsync({
          skillId: selectedSkillId,
          userInputs: mappedValues,
          model: selectedLlmModel || undefined,
          referenceImages: referenceImages.map(r => r.url),
        });

        if (result.success && result.content) {
          // Check if outputType="both" - try to parse and split prompts for Image/Video tabs
          // Note: outputType may be undefined if user didn't change from default (especially in Basic Mode)
          const outputType = dynamicFormValues?.outputType as string | undefined;
          // Default to "both" if not explicitly set (matches ui.schema.json default for viral-talking-objects)
          const effectiveOutputType = outputType ?? "both";

          if (effectiveOutputType === "both") {
            // Try to parse and split the content for image and video tabs
            const parsed = parseSkillOutputForBothMode(result.content);

            if (parsed) {
              // Store split prompts for each tab
              setImageTabPrompt(parsed.imagePrompt);
              setVideoTabPrompt(parsed.videoPrompt);

              // Set the appropriate prompt based on current tab
              if (activeTab === "image") {
                setEnhancedPrompt(parsed.imagePrompt);
              } else if (activeTab === "video") {
                setEnhancedPrompt(parsed.videoPrompt);
              } else {
                setEnhancedPrompt(result.content);
              }

              toast.success(`Skill "${result.skillName}" executed successfully`, {
                description: `Credits: ${result.creditsUsed}. Prompts split for Image and Video tabs.`,
              });
            } else {
              // Parsing failed (no image/video sections found), use full content
              setEnhancedPrompt(result.content);
              setImageTabPrompt(null);
              setVideoTabPrompt(null);
              toast.success(`Skill "${result.skillName}" executed successfully`, {
                description: `Credits used: ${result.creditsUsed}`,
              });
            }
          } else {
            // Use the skill's generated content as the prompt (normal mode)
            setEnhancedPrompt(result.content);
            setImageTabPrompt(null);
            setVideoTabPrompt(null);
            toast.success(`Skill "${result.skillName}" executed successfully`, {
              description: `Credits used: ${result.creditsUsed}`,
            });
          }
        } else {
          toast.error("Skill execution returned empty", {
            description: "The LLM did not generate content. Try different inputs.",
          });
        }
      } else {
        // Use the default enhancePrompt for image-prompt-engineer skill
        let requestData;

        // Get maxPromptLength from selected media model's configJson
        // Default to 2000 if not set in model config
        const modelData = mediaModels?.models?.find(m => m.modelId === selectedModel);
        const modelConfig = modelData?.configJson as any;
        const modelMaxPromptLength = modelConfig?.maxPromptLength || 2000;

        if (useAdvancedMode && skillSchema) {
          // Use dynamic form values with output mapping
          const mappedValues: Record<string, any> = {};
          const outputMapping = skillSchema.outputMapping || {};

          // Map form values to API parameters
          Object.entries(dynamicFormValues).forEach(([key, value]) => {
            const mappedKey = outputMapping[key] || key;
            if (value !== undefined && value !== "" && value !== null) {
              mappedValues[mappedKey] = value;
            }
          });

          requestData = {
            userInput: userIdea || "Create a prompt based on the reference images",
            referenceImages: referenceImages.map(r => r.url),
            // Include selected LLM model for Auto Prompt (from Advanced Mode selector)
            ...(selectedLlmModel ? { model: selectedLlmModel } : {}),
            // Pass maxPromptLength from selected media model so skill generates shorter prompts
            maxPromptLength: modelMaxPromptLength,
            ...mappedValues,
          };
        } else {
          // Use simple mode values - only send enabled fields with values
          // Check if field is disabled by Advanced Mode before including
          const isAspectRatioEnabled = !isFieldDisabledByAdvancedMode("aspectRatio");
          const isStyleEnabled = !isFieldDisabledByAdvancedMode("style");
          const isVfxEnabled = !isFieldDisabledByAdvancedMode("vfx");
          const isRealisticSkinEnabled = !isFieldDisabledByAdvancedMode("realisticSkin");
          const isFaceLockEnabled = !isFieldDisabledByAdvancedMode("faceLock");

          requestData = {
            userInput: userIdea || "Create a prompt based on the reference images",
            referenceImages: referenceImages.map(r => r.url),
            // Include selected LLM model for Auto Prompt (from Advanced Mode selector)
            ...(selectedLlmModel ? { model: selectedLlmModel } : {}),
            // Pass maxPromptLength from selected media model so skill generates shorter prompts
            maxPromptLength: modelMaxPromptLength,
            // Style options (only if enabled and has value)
            ...(isStyleEnabled && selectedStyleCategory ? { styleCategory: selectedStyleCategory } : {}),
            ...(isStyleEnabled && selectedStyle ? { styleName: selectedStyle } : {}),
            // VFX options (only if enabled and has value)
            ...(isVfxEnabled && selectedVfxCategory ? { vfxCategory: selectedVfxCategory } : {}),
            ...(isVfxEnabled && selectedVfxEffect ? { vfxEffect: selectedVfxEffect } : {}),
            // Advanced options (only if enabled and is true)
            ...(isRealisticSkinEnabled && realisticSkin ? { realisticSkin: true } : {}),
            ...(isFaceLockEnabled && faceLock ? { faceLock: true } : {}),
            // Other options (only if enabled)
            ...(isAspectRatioEnabled ? { aspectRatio } : {}),
            language: "en" as const,
          };
        }

        const result = await enhancePromptMutation.mutateAsync(requestData);

        if (result.success && result.promptEn) {
          // Use the enhanced English prompt
          setEnhancedPrompt(result.promptEn);
        } else {
          // Handle case where result is returned but no prompt generated
          toast.error("Auto Prompt returned empty", {
            description: result.error || "The LLM did not generate a prompt. Try a different input.",
          });
        }
      }
    } catch (error: any) {
      console.error("Auto prompt failed:", error);
      // Show user-friendly error message
      const errorMessage = error?.message || error?.data?.message || "Failed to generate prompt";
      if (errorMessage.includes("Unable to generate") || errorMessage.includes("different text")) {
        toast.error("Auto Prompt could not generate a prompt", {
          description: "Please try changing the text or image and try again",
        });
      } else {
        toast.error("Auto Prompt failed", {
          description: errorMessage,
        });
      }
    } finally {
      setIsEnhancing(false);
    }
  };

  // Handle special style actions from DynamicSkillForm (e.g., "upscale" auto-fills prompt)
  const handleStyleAction = useCallback((action: StyleAction) => {
    if (action === "upscale") {
      // Auto-fill the prompt with upscale-specific text
      if (useAdvancedMode) {
        setDynamicFormValues(prev => ({
          ...prev,
          request: UPSCALE_DEFAULT_PROMPT,
        }));
      } else {
        setPrompt(UPSCALE_DEFAULT_PROMPT);
      }
      toast.success("Prompt auto-filled for Upscale", {
        description: "Optimize the prompt for image enhancement",
      });
    }
  }, [useAdvancedMode]);

  // Get current skill info
  const currentSkill = skillsList?.find(s => s.id === selectedSkillId);

  // Generate media with loop for multiple images
  const handleGenerate = async () => {
    // IMPORTANT: Read current textarea value directly from ref to ensure we capture
    // any edits made after Auto Prompt, regardless of React state timing
    const currentTextareaValue = promptTextareaRef.current?.value ?? "";

    // Use the current textarea value as the final prompt if available
    // This ensures any user edits after Auto Prompt are captured
    const advancedFallback = useAdvancedMode ? (dynamicFormValues.request as string || "") : "";
    const combinedFallback = prompt || advancedFallback;
    const stateBasedPrompt = enhancedPrompt || combinedFallback;

    // Prefer textarea ref value (most current) over state (may be stale)
    const finalPrompt = currentTextareaValue.trim() || stateBasedPrompt;

    if (!finalPrompt?.trim()) {
      return;
    }

    // Determine how many images to generate
    const imageCount = activeTab === "image" ? numImages : 1;

    // Initialize generation tasks for progressive preview
    const initialTasks: GenerationTask[] = Array.from({ length: imageCount }, (_, i) => ({
      id: `task-${Date.now()}-${i}`,
      index: i,
      status: 'queued' as const,
    }));
    setGenerationTasks(initialTasks);
    setIsGenerating(true);

    // Prepare common params
    const mediaTypeFallback = activeTab === "image"
      ? "image-generation"
      : activeTab === "video"
      ? "video-generation"
      : "audio-generation";
    const isPromptSkill = currentSkill?.type === "prompt-enhancement" ||
                          currentSkill?.type === "prompt_enhancement" ||
                          currentSkill?.type === "image-video-generation";
    const skillId = (!selectedSkillId || isPromptSkill) ? mediaTypeFallback : selectedSkillId;

    // When Advanced Mode is ON, use aspectRatio from dynamicFormValues (if set)
    const currentAspectRatio = aspectRatio;
    const finalAspectRatio = useAdvancedMode && dynamicFormValues.aspectRatio
      ? dynamicFormValues.aspectRatio
      : currentAspectRatio;

    // Build extra params from dynamic model input fields
    const selectedModelData = mediaModels?.models?.find(m => m.modelId === selectedModel);
    const rawConfig = selectedModelData?.configJson;
    const modelConfig = (typeof rawConfig === "string" ? (() => { try { return JSON.parse(rawConfig); } catch { return null; } })() : rawConfig) as any;
    const extraParams: Record<string, any> = {};
    const apiConfig: Record<string, string> = {};
    let usedModelSpecificImageKey = false; // Track if we used model-specific key for images

    if (modelConfig) {
      // Populate apiConfig from configJson
      if (modelConfig.apiEndpoint) apiConfig.endpoint = modelConfig.apiEndpoint;
      if (modelConfig.apiPayloadFormat) apiConfig.payload_format = modelConfig.apiPayloadFormat;
      if (modelConfig.kieModelId) apiConfig.kie_model_id = modelConfig.kieModelId;

      // Populate extraParams from dynamic input field values
      for (const field of (modelConfig.inputFields || [])) {
        const val = modelInputValues[field.key];
        if (val !== undefined && val !== null && val !== "") {
          // Skip fields handled by standard params (aspect_ratio, aspect.ratio, duration)
          if (field.key === "aspect_ratio" || field.key === "aspect.ratio") continue;
          if (field.key === "duration" && activeTab === "video") continue;
          extraParams[field.key] = val;
        }
      }

      // Find inputField with type "image_urls" and add reference images with correct key
      // This ensures KIE AI models receive images with the key they expect (e.g., "image_input")
      const imageUrlsField = (modelConfig.inputFields || []).find((f: any) => f.type === "image_urls");
      if (imageUrlsField && referenceImages.length > 0) {
        extraParams[imageUrlsField.key] = referenceImages.map(r => r.url);
        usedModelSpecificImageKey = true;
      }
    }

    // Loop through each image generation with delay
    let successCount = 0;
    for (let i = 0; i < imageCount; i++) {
      // Update task status to 'generating'
      setGenerationTasks(prev =>
        prev.map((t, idx) => idx === i ? { ...t, status: 'generating' as const } : t)
      );

      try {
        const result = await executeSkillMutation.mutateAsync({
          skillId,
          prompt: finalPrompt,
          model: selectedModel,
          aspectRatio: finalAspectRatio,
          numImages: 1, // Always 1 per call for progressive loading
          duration: activeTab === "video" ? (modelInputValues.duration ? Number(modelInputValues.duration) : duration) : undefined,
          // Only use referenceImageUrls as fallback when model doesn't define specific image_urls field
          referenceImageUrls: (!usedModelSpecificImageKey && referenceImages.length > 0) ? referenceImages.map(r => r.url) : undefined,
          ...(Object.keys(extraParams).length > 0 ? { extraParams } : {}),
          ...(Object.keys(apiConfig).length > 0 ? { apiConfig } : {}),
          ...(modelInputValues.resolution ? { resolution: modelInputValues.resolution } : {}),
        } as any);

        if (result.success) {
          const url = result.resultUrl || result.resultUrls?.[0];
          if (url) {
            // Update task with completed status and URL
            setGenerationTasks(prev =>
              prev.map((t, idx) => idx === i ? { ...t, status: 'completed' as const, url } : t)
            );

            // Add to generated media
            const newMedia: GeneratedMedia = {
              id: `${Date.now()}-${Math.random()}`,
              type: activeTab,
              url,
              prompt: finalPrompt,
              model: selectedModel,
              createdAt: new Date().toISOString(),
              creditsUsed: result.creditsUsed,
            };
            setGeneratedMedia(prev => [newMedia, ...prev]);

            // Set first completed image as preview
            if (successCount === 0) {
              setPreviewUrl(url);
            }
            successCount++;

            // Auto-detect grid for image results (only for first image)
            if (activeTab === "image" && i === 0) {
              detectGrid(url).then((detected) => {
                if (detected && detected.confidence >= 0.7) {
                  toast.info(
                    `Grid detected! Click the grid icon to split into ${detected.rows * detected.cols} images.`,
                    {
                      duration: 5000,
                      action: {
                        label: "Split Now",
                        onClick: () => openSplitDialog(url),
                      },
                    }
                  );
                }
              }).catch(() => {
                // Silently ignore detection errors
              });
            }
          }
        } else {
          console.error(`Generation ${i + 1} failed:`, result.error);
          setGenerationTasks(prev =>
            prev.map((t, idx) => idx === i ? { ...t, status: 'error' as const, error: result.error } : t)
          );
        }
      } catch (error: any) {
        console.error(`Generation ${i + 1} error:`, error);
        setGenerationTasks(prev =>
          prev.map((t, idx) => idx === i ? { ...t, status: 'error' as const, error: error?.message || 'Unknown error' } : t)
        );
      }

      // Add delay between generations (except for last one)
      if (i < imageCount - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Note: Prompt is intentionally NOT cleared after generation
    // Users can manually clear using the "Clear" button if needed

    setIsGenerating(false);
  };

  // Download media (with CORS fallback)
  const downloadMedia = async (url: string, filename: string) => {
    try {
      // Try fetch with CORS first
      const response = await fetch(url, { mode: 'cors' });
      if (response.ok) {
        const blob = await response.blob();
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
        return;
      }
    } catch (error) {
      console.log("CORS fetch failed, trying fallback:", error);
    }

    // Fallback: Open in new tab (user can right-click to save)
    window.open(url, "_blank");
  };

  // Open image in lightbox
  const openLightbox = (url: string, prompt: string, model?: string, createdAt?: string) => {
    setLightboxImage({ url, prompt, model, createdAt });
    setLightboxOpen(true);
    setCopiedPrompt(false);
  };

  // Copy prompt to clipboard
  const copyPrompt = async (prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  // Use prompt from lightbox (copy to input)
  const usePromptFromLightbox = () => {
    if (lightboxImage?.prompt) {
      setPrompt(lightboxImage.prompt);
      setEnhancedPrompt("");
      setImageTabPrompt(null);
      setVideoTabPrompt(null);
      setLightboxOpen(false);
    }
  };

  // Open split dialog with auto-detection
  const openSplitDialog = async (imageUrl: string) => {
    setSplitImageUrl(imageUrl);
    setSplitResults([]);
    setSplitPreviewUrl(null);
    setShowSplitDialog(true);

    // Auto-detect grid
    setIsDetectingGrid(true);
    try {
      const detected = await detectGrid(imageUrl);
      if (detected) {
        setDetectedGrid(detected);
        setSplitGridRows(detected.rows);
        setSplitGridCols(detected.cols);
        // Generate preview with detected grid
        const preview = await createSplitPreview(imageUrl, detected.rows, detected.cols);
        setSplitPreviewUrl(preview);
      } else {
        setDetectedGrid(null);
        // Default to 2x2
        setSplitGridRows(2);
        setSplitGridCols(2);
        const preview = await createSplitPreview(imageUrl, 2, 2);
        setSplitPreviewUrl(preview);
      }
    } catch (error) {
      console.error("Grid detection failed:", error);
      setDetectedGrid(null);
    } finally {
      setIsDetectingGrid(false);
    }
  };

  // Update split preview when grid changes
  const updateSplitPreview = async (rows: number, cols: number) => {
    if (!splitImageUrl) return;
    setSplitGridRows(rows);
    setSplitGridCols(cols);
    try {
      const preview = await createSplitPreview(splitImageUrl, rows, cols);
      setSplitPreviewUrl(preview);
      setSplitResults([]); // Clear previous results
    } catch (error) {
      console.error("Failed to create preview:", error);
    }
  };

  // Execute the split
  const executeSplit = async () => {
    if (!splitImageUrl) return;
    setIsSplitting(true);
    try {
      const results = await splitImage(splitImageUrl, splitGridRows, splitGridCols);
      setSplitResults(results);
      toast.success(`Split into ${results.length} images`);
    } catch (error) {
      console.error("Split failed:", error);
      toast.error("Failed to split image");
    } finally {
      setIsSplitting(false);
    }
  };

  // Download a single split image
  const handleDownloadSplit = (result: SplitResult) => {
    downloadSplitImage(result, `split-image`);
  };

  // Download all split images
  const handleDownloadAllSplits = async () => {
    if (splitResults.length === 0) return;
    toast.info(`Downloading ${splitResults.length} images...`);
    await downloadAllSplitImages(splitResults, `split-image`);
  };

  // Add split image as reference
  const addSplitAsReference = async (result: SplitResult) => {
    if (referenceImages.length >= maxReferenceImages) {
      toast.error(`Maximum ${maxReferenceImages} reference images`);
      return;
    }
    try {
      // Upload the split image
      const uploadResult = await uploadMutation.mutateAsync({
        fileName: `split-image-${result.index + 1}.jpg`,
        fileType: "image/jpeg",
        fileBase64: result.dataUrl,
      });
      setReferenceImages((prev) => [
        ...prev,
        { url: uploadResult.url, name: `Split ${result.index + 1}` },
      ]);
      toast.success("Added as reference image");
    } catch (error) {
      console.error("Failed to upload split image:", error);
      toast.error("Failed to add as reference");
    }
  };

  // Add all split images to video tab reference
  const addAllSplitsToVideoReference = async () => {
    if (splitResults.length === 0) return;

    // Get video tab's current reference images count
    const videoReferenceCount = tabStates.video.referenceImages.length;
    const videoMaxImages = 25;
    const availableSlots = videoMaxImages - videoReferenceCount;

    if (availableSlots <= 0) {
      toast.error("Video tab reference images is full (max 25)");
      return;
    }

    const imagesToAdd = splitResults.slice(0, availableSlots);
    toast.info(`Adding ${imagesToAdd.length} images to Video reference...`);

    try {
      const uploadedImages: ReferenceImage[] = [];

      for (const result of imagesToAdd) {
        const uploadResult = await uploadMutation.mutateAsync({
          fileName: `split-image-${result.index + 1}.jpg`,
          fileType: "image/jpeg",
          fileBase64: result.dataUrl,
        });
        uploadedImages.push({ url: uploadResult.url, name: `Split ${result.index + 1}` });
      }

      // Update video tab's reference images directly
      setTabStates(prev => ({
        ...prev,
        video: {
          ...prev.video,
          referenceImages: [...prev.video.referenceImages, ...uploadedImages]
        }
      }));

      toast.success(`Added ${uploadedImages.length} images to Video reference`);
    } catch (error) {
      console.error("Failed to upload split images:", error);
      toast.error("Failed to add images to Video reference");
    }
  };

  // Get model credit cost using pricing tiers from configJson
  const getModelCost = () => {
    if (!mediaModels?.models) return 10;
    const model = mediaModels.models.find(m => m.modelId === selectedModel);
    if (!model) return 10;

    const config = model.configJson as any;
    const baseCost = model.creditCost || 10;

    // If no pricing tiers, use legacy calculation
    if (!config?.pricingTiers) {
      if (activeTab === "image") return baseCost * numImages;
      if (activeTab === "video") return baseCost * Math.ceil(duration / 5);
      return baseCost;
    }

    // Build tier key from current selections
    const pricingFields = (config.inputFields || []).filter((f: any) => f.affectsPricing);
    let tierKey = "default";

    if (config.pricingFormula === "matrix" && pricingFields.length > 0) {
      const parts: string[] = [];
      const fieldOrder: Record<string, number> = { resolution: 0, quality: 1, duration: 2 };
      const sorted = [...pricingFields].sort((a: any, b: any) => (fieldOrder[a.key] ?? 99) - (fieldOrder[b.key] ?? 99));
      for (const field of sorted) {
        const val = modelInputValues[field.key] ?? field.default;
        if (val !== undefined) {
          const s = String(val);
          parts.push(field.key === "duration" && !s.endsWith("s") ? `${s}s` : s);
        }
      }
      tierKey = parts.length > 0 ? parts.join("-") : "default";
    } else if (config.pricingFormula === "per_duration") {
      const dur = modelInputValues.duration ?? duration;
      tierKey = dur ? `${dur}s` : "default";
    } else if (config.pricingFormula === "flat") {
      const res = modelInputValues.resolution;
      tierKey = res && config.pricingTiers[res] !== undefined ? res : "default";
    }

    const tierCost = config.pricingTiers[tierKey] ?? baseCost;
    const multiplier = activeTab === "image" ? numImages : 1;
    return tierCost * multiplier;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20">
      {/* Header */}
      <header className="bg-white/70 backdrop-blur-xl border-b sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/dashboard")}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold">Media Studio</h1>
                  <p className="text-xs text-muted-foreground">Create AI-powered media</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="gap-1">
                <Zap className="h-3 w-3" />
                {credits?.credits || 0} credits
              </Badge>
              <Button variant="outline" size="sm" onClick={() => setLocation("/media-history")}>
                <History className="h-4 w-4 mr-1" />
                History
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel - Controls */}
          <div className="lg:col-span-2 space-y-4">
            {/* Media Type Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as MediaType)}>
              <TabsList className="w-full">
                <TabsTrigger value="image" className="flex-1 gap-2">
                  <Image className="h-4 w-4" />
                  Image
                </TabsTrigger>
                <TabsTrigger value="video" className="flex-1 gap-2">
                  <Video className="h-4 w-4" />
                  Video
                </TabsTrigger>
                <TabsTrigger value="audio" className="flex-1 gap-2">
                  <Music className="h-4 w-4" />
                  Audio
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Prompt Input */}
            <div className="bg-white/70 backdrop-blur rounded-xl border p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Prompt</h3>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{getModelCost()} credits</Badge>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={isPttRecording ? "destructive" : "outline"}
                          size="sm"
                          onPointerDown={pttStart}
                          onPointerUp={pttStop}
                          onPointerLeave={isPttRecording ? pttStop : undefined}
                          disabled={isPttTranscribing}
                        >
                          {isPttTranscribing ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Mic className={cn("h-4 w-4", isPttRecording && "animate-pulse")} />
                          )}
                          <span className="ml-1">{isPttRecording ? "Recording..." : "Mic"}</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Hold to record voice (Speech-to-Text)</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const text = enhancedPrompt || prompt;
                            if (!text.trim()) return;
                            setIsTranslating(true);
                            setShowTranslation(false);
                            translateMutation.mutate({ text });
                          }}
                          disabled={!(enhancedPrompt || prompt).trim() || isTranslating}
                        >
                          {isTranslating ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Languages className="h-4 w-4" />
                          )}
                          <span className="ml-1">Translate</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Translate prompt (EN ↔ your language)</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleAutoPrompt}
                          disabled={(!prompt.trim() && referenceImages.length === 0) || isEnhancing}
                        >
                          {isEnhancing ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Wand2 className="h-4 w-4" />
                          )}
                          <span className="ml-1">Auto Prompt</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Enhance your prompt with AI (PromptDepth Pro v8.9)</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Works with text, images, or both
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  {/* Clear Prompt Button */}
                  {(prompt.trim() || enhancedPrompt) && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setPrompt("");
                              setEnhancedPrompt("");
                              setImageTabPrompt(null);
                              setVideoTabPrompt(null);
                            }}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-4 w-4" />
                            <span className="ml-1">Clear</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Clear prompt</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </div>

              <Textarea
                ref={promptTextareaRef}
                value={enhancedPrompt || prompt}
                onChange={(e) => {
                  if (enhancedPrompt) {
                    setEnhancedPrompt(e.target.value);
                  } else {
                    setPrompt(e.target.value);
                  }
                }}
                placeholder={`Describe the ${activeTab} you want to create...`}
                className="min-h-[120px] resize-y"
              />

              {/* Character Count */}
              {(() => {
                const currentPromptLength = (enhancedPrompt || prompt).length;
                const modelData = mediaModels?.models?.find(m => m.modelId === selectedModel);
                const config = modelData?.configJson as any;
                const maxLength = config?.maxPromptLength || 2000;
                const isOverLimit = currentPromptLength > maxLength;
                const isNearLimit = currentPromptLength > maxLength * 0.95;

                return (
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className={cn(
                      isOverLimit && "text-red-600 font-medium",
                      isNearLimit && !isOverLimit && "text-amber-600"
                    )}>
                      {currentPromptLength.toLocaleString()} / {maxLength.toLocaleString()} characters
                    </span>
                    {isOverLimit && (
                      <span className="text-red-600 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Exceeds model limit
                      </span>
                    )}
                    {isNearLimit && !isOverLimit && (
                      <span className="text-amber-600 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Approaching limit
                      </span>
                    )}
                  </div>
                );
              })()}

              {enhancedPrompt && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Check className="h-4 w-4 text-green-500" />
                  <span>Prompt enhanced{(imageTabPrompt || videoTabPrompt) ? " (split for tabs)" : ""}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEnhancedPrompt("");
                      setImageTabPrompt(null);
                      setVideoTabPrompt(null);
                    }}
                  >
                    Clear
                  </Button>
                </div>
              )}

              {/* Translation Popup */}
              {showTranslation && translatedText && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-blue-700">Translation</span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => {
                          navigator.clipboard.writeText(translatedText);
                          setTranslationCopied(true);
                          setTimeout(() => setTranslationCopied(false), 2000);
                        }}
                      >
                        {translationCopied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                        <span className="ml-1">{translationCopied ? 'Copied' : 'Copy'}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => setShowTranslation(false)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-blue-900 whitespace-pre-wrap">{translatedText}</p>
                </div>
              )}

              {/* Reference Images with Drop Zone */}
              <div
                className={cn(
                  "space-y-2 p-3 rounded-lg border-2 border-dashed transition-all",
                  isDraggingOver
                    ? "border-purple-500 bg-purple-50"
                    : "border-gray-200 hover:border-gray-300"
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">
                    Reference Images ({referenceImages.length}/{maxReferenceImages})
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={referenceImages.length >= 5 || uploadMutation.isPending}
                  >
                    {uploadMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ImagePlus className="h-4 w-4" />
                    )}
                    <span className="ml-1">Add Image</span>
                  </Button>
                </div>

                {referenceImages.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {referenceImages.map((img, idx) => (
                      <div key={idx} className="relative group">
                        <img
                          src={img.url}
                          alt={img.name}
                          className="h-16 w-16 rounded-lg object-cover border"
                        />
                        <button
                          onClick={() => removeReferenceImage(idx)}
                          className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <Badge
                          variant="secondary"
                          className="absolute bottom-0 left-0 text-[10px] px-1"
                        >
                          {idx + 1}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-4 text-muted-foreground">
                    <Upload className="h-4 w-4 mr-2" />
                    <span className="text-sm">Drop images here or click Add Image</span>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Drag from History Gallery below or upload images for style transfer / img2img
                </p>
              </div>

              {/* Generate Button - Primary location under Prompt */}
              <Button
                onClick={handleGenerate}
                disabled={!(enhancedPrompt || prompt || (useAdvancedMode ? dynamicFormValues.request as string : ""))?.trim() || isGenerating || (credits?.credits || 0) < getModelCost()}
                className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
                size="lg"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5 mr-2" />
                    Generate {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
                  </>
                )}
              </Button>

              {(credits?.credits || 0) < getModelCost() && (
                <p className="text-sm text-red-500 text-center">
                  Not enough credits.{" "}
                  <button onClick={() => setLocation("/credits")} className="underline">
                    Buy more
                  </button>
                </p>
              )}
            </div>

            {/* Settings */}
            <div className="bg-white/70 backdrop-blur rounded-xl border p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                <h3 className="font-semibold">Settings</h3>
              </div>

              <p className="text-xs text-muted-foreground">
                Select all desired options below before clicking Auto Prompt to generate an enhanced prompt.
              </p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Model Selection */}
                <div className="space-y-1 col-span-2 md:col-span-1">
                  <label className="text-sm text-muted-foreground">Model</label>
                  <Button
                    variant="outline"
                    className="w-full justify-start h-auto min-h-10 py-2"
                    onClick={() => setShowModelDialog(true)}
                  >
                    <Bot className="h-4 w-4 mr-2" />
                    <span className="flex-1 text-left break-words whitespace-normal">
                      {selectedModel
                        ? mediaModels?.models?.find((m) => m.modelId === selectedModel)?.name || "Select model"
                        : "Select model"}
                    </span>
                    {selectedModel && mediaModels?.models?.find((m) => m.modelId === selectedModel) && (
                      <Badge variant="outline" className="ml-2 text-xs shrink-0">
                        {getModelCost()}c
                      </Badge>
                    )}
                  </Button>
                  <ModelSelectorDialog
                    open={showModelDialog}
                    onOpenChange={setShowModelDialog}
                    models={mediaModels?.models || []}
                    providers={mediaModels?.providers || []}
                    selectedModelId={selectedModel}
                    onSelect={setSelectedModel}
                    mediaType={activeTab}
                    isLoading={!mediaModels}
                  />
                </div>

                {/* Aspect Ratio — uses model-specific options from configJson when available (not for audio) */}
                {activeTab !== "audio" && (() => {
                  const modelData = mediaModels?.models?.find(m => m.modelId === selectedModel);
                  const config = modelData?.configJson as any;
                  const arField = config?.inputFields?.find((f: any) => f.key === "aspect_ratio");
                  const arOptions = arField?.options as { value: string; label: string }[] | undefined;
                  // Also check model's top-level aspectRatios array
                  const modelAspectRatios = modelData?.aspectRatios as string[] | null;
                  const defaultOptions = [
                    { value: "1:1", label: "1:1 (Square)" },
                    { value: "16:9", label: "16:9 (Landscape)" },
                    { value: "9:16", label: "9:16 (Portrait)" },
                    { value: "4:3", label: "4:3" },
                    { value: "3:4", label: "3:4" },
                  ];
                  const options = arOptions
                    || (modelAspectRatios?.length ? modelAspectRatios.map(r => ({ value: r, label: r })) : null)
                    || defaultOptions;
                  const isDisabled = isFieldDisabledByAdvancedMode("aspectRatio");
                  return (
                    <div className="space-y-1">
                      <label className={cn("text-sm text-muted-foreground", isDisabled && "opacity-50")}>
                        Aspect Ratio
                        {arField?.affectsPricing && <span className="ml-1 text-xs text-amber-500">($)</span>}
                        {isDisabled && <span className="ml-1 text-xs text-purple-500">(use Advanced)</span>}
                      </label>
                      <Select
                        value={aspectRatio}
                        onValueChange={setAspectRatio}
                        disabled={isDisabled}
                      >
                        <SelectTrigger className={cn(isDisabled && "opacity-50")}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {options.filter(opt => opt.value != null && opt.value !== "").map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })()}

                {/* Number of Images (for image only) */}
                {activeTab === "image" && (
                  <div className="space-y-1">
                    <label className="text-sm text-muted-foreground">Count</label>
                    <Select value={String(numImages)} onValueChange={(v) => setNumImages(Number(v))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4].map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n} image{n > 1 ? "s" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Duration (for video only) — uses model-specific options from configJson when available */}
                {activeTab === "video" && (() => {
                  const modelData = mediaModels?.models?.find(m => m.modelId === selectedModel);
                  const config = modelData?.configJson as any;
                  const durationField = config?.inputFields?.find((f: any) => f.key === "duration");
                  const durationOptions = durationField?.options as { value: string; label: string }[] | undefined;
                  const currentVal = String(modelInputValues.duration ?? duration);
                  return (
                    <div className="space-y-1">
                      <label className="text-sm text-muted-foreground">
                        Duration
                        {durationField?.affectsPricing && <span className="ml-1 text-xs text-amber-500">($)</span>}
                      </label>
                      <Select
                        value={currentVal}
                        onValueChange={(v) => {
                          setDuration(Number(v));
                          setModelInputValues(prev => ({ ...prev, duration: v }));
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {durationOptions
                            ? durationOptions.filter(opt => opt.value != null && opt.value !== "").map((opt) => (
                                <SelectItem key={String(opt.value)} value={String(opt.value)}>
                                  {opt.label}
                                </SelectItem>
                              ))
                            : [5, 10, 15, 20].map((d) => (
                                <SelectItem key={d} value={String(d)}>
                                  {d} seconds
                                </SelectItem>
                              ))
                          }
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })()}

                {/* Dynamic Model Input Fields from configJson */}
                {(() => {
                  const modelData = mediaModels?.models?.find(m => m.modelId === selectedModel);
                  const config = modelData?.configJson as any;
                  const fields = config?.inputFields || [];
                  // Filter out fields already handled by standard UI (aspect_ratio, duration for video)
                  // Handle both aspect_ratio and aspect.ratio naming conventions
                  const dynamicFields = fields.filter((f: any) => {
                    if (f.key === "aspect_ratio" || f.key === "aspect.ratio") return false;
                    if (f.key === "duration" && activeTab === "video") return false;
                    if (f.type === "image_urls" || f.type === "video_urls" || f.type === "audio_urls") return false;
                    return true;
                  });
                  if (dynamicFields.length === 0) return null;
                  return dynamicFields.map((field: any) => (
                    <div key={field.key} className="space-y-1">
                      <label className="text-sm text-muted-foreground">
                        {field.label}
                        {field.affectsPricing && <span className="ml-1 text-xs text-amber-500">($)</span>}
                      </label>
                      {field.type === "select" && field.options ? (
                        <Select
                          value={String(modelInputValues[field.key] ?? field.default ?? field.options?.[0]?.value ?? "")}
                          onValueChange={(v) => setModelInputValues(prev => ({ ...prev, [field.key]: v }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {field.options.filter((opt: any) => opt.value != null && opt.value !== "").map((opt: any) => (
                              <SelectItem key={String(opt.value)} value={String(opt.value)}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : field.type === "boolean" ? (
                        <div className="flex items-center gap-2 h-10">
                          <Switch
                            checked={!!modelInputValues[field.key]}
                            onCheckedChange={(v) => setModelInputValues(prev => ({ ...prev, [field.key]: v }))}
                          />
                          <span className="text-sm">{modelInputValues[field.key] ? "On" : "Off"}</span>
                        </div>
                      ) : field.type === "number" ? (
                        <Input
                          type="number"
                          value={modelInputValues[field.key] ?? field.default ?? ""}
                          onChange={(e) => setModelInputValues(prev => ({ ...prev, [field.key]: Number(e.target.value) }))}
                        />
                      ) : (
                        <Input
                          type="text"
                          placeholder={field.label}
                          value={modelInputValues[field.key] ?? ""}
                          onChange={(e) => setModelInputValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                        />
                      )}
                    </div>
                  ));
                })()}

                {/* Style Selection (not for audio) */}
                {activeTab !== "audio" && (
                <div className="space-y-1">
                  <label className={cn(
                    "text-sm text-muted-foreground",
                    isFieldDisabledByAdvancedMode("style") && "opacity-50"
                  )}>
                    Style
                    {isFieldDisabledByAdvancedMode("style") && (
                      <span className="ml-1 text-xs text-purple-500">(use Advanced)</span>
                    )}
                  </label>
                  <Dialog open={showStyleDialog} onOpenChange={setShowStyleDialog}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn("w-full justify-start", isFieldDisabledByAdvancedMode("style") && "opacity-50")}
                        disabled={isFieldDisabledByAdvancedMode("style")}
                      >
                        <Palette className="h-4 w-4 mr-2" />
                        {selectedStyle || "Select Style"}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Choose Style</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 mt-4">
                        {styleCategories?.map((category: StyleCategory) => (
                          <div key={category.id} className="space-y-2">
                            <h4 className="font-medium text-sm text-muted-foreground">
                              {category.id}. {category.name}
                            </h4>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                              {category.styles.map((style: StyleOption) => (
                                <button
                                  key={style.id}
                                  onClick={() => {
                                    setSelectedStyleCategory(category.id);
                                    setSelectedStyle(style.name);
                                    setShowStyleDialog(false);
                                    // Auto-fill prompt for Upscale style
                                    if (style.name === "Upscale") {
                                      setPrompt(UPSCALE_DEFAULT_PROMPT);
                                      toast.success("Prompt auto-filled for Upscale", {
                                        description: "Optimize the prompt for image enhancement",
                                      });
                                    }
                                  }}
                                  className={cn(
                                    "text-left px-3 py-2 rounded-lg border text-sm transition-colors",
                                    selectedStyle === style.name
                                      ? "border-purple-500 bg-purple-50"
                                      : "hover:bg-gray-50"
                                  )}
                                >
                                  <div className="font-medium">{style.name}</div>
                                  <div className="text-xs text-muted-foreground truncate">
                                    {style.description}
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
                )}
              </div>

              {/* VFX and Advanced Options (for image only) */}
              {activeTab === "image" && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
                  {/* VFX Selection */}
                  <div className="space-y-1">
                    <label className={cn(
                      "text-sm text-muted-foreground",
                      isFieldDisabledByAdvancedMode("vfx") && "opacity-50"
                    )}>
                      VFX Effect
                      {isFieldDisabledByAdvancedMode("vfx") && (
                        <span className="ml-1 text-xs text-purple-500">(use Advanced)</span>
                      )}
                    </label>
                    <Dialog open={showVfxDialog} onOpenChange={setShowVfxDialog}>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn("w-full justify-start", isFieldDisabledByAdvancedMode("vfx") && "opacity-50")}
                          disabled={isFieldDisabledByAdvancedMode("vfx")}
                        >
                          <Layers className="h-4 w-4 mr-2" />
                          {selectedVfxEffect || "Select VFX"}
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Choose VFX Effect</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 mt-4">
                          {vfxCategories?.map((category: any) => (
                            <div key={category.id} className="space-y-2">
                              <h4 className="font-medium text-sm text-muted-foreground">
                                {category.id}. {category.name}
                              </h4>
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {category.effects?.map((effect: any) => (
                                  <button
                                    key={effect.id}
                                    onClick={() => {
                                      setSelectedVfxCategory(category.id);
                                      setSelectedVfxEffect(effect.name);
                                      setShowVfxDialog(false);
                                    }}
                                    className={cn(
                                      "text-left px-3 py-2 rounded-lg border text-sm transition-colors",
                                      selectedVfxEffect === effect.name
                                        ? "border-blue-500 bg-blue-50"
                                        : "hover:bg-gray-50"
                                    )}
                                  >
                                    <div className="font-medium">{effect.name}</div>
                                    <div className="text-xs text-muted-foreground line-clamp-2">
                                      {effect.promptText?.slice(0, 50)}...
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>

                  {/* Realistic Skin Toggle */}
                  <div className="space-y-1">
                    <label className={cn(
                      "text-sm text-muted-foreground",
                      isFieldDisabledByAdvancedMode("realisticSkin") && "opacity-50"
                    )}>
                      Realistic Skin
                      {isFieldDisabledByAdvancedMode("realisticSkin") && (
                        <span className="ml-1 text-xs text-purple-500">(use Advanced)</span>
                      )}
                    </label>
                    <div className={cn(
                      "flex items-center space-x-2 h-10 px-3 border rounded-md",
                      isFieldDisabledByAdvancedMode("realisticSkin") && "opacity-50"
                    )}>
                      <Switch
                        id="realistic-skin"
                        checked={realisticSkin}
                        onCheckedChange={setRealisticSkin}
                        disabled={isFieldDisabledByAdvancedMode("realisticSkin")}
                      />
                      <Label htmlFor="realistic-skin" className="text-sm">
                        <User className="h-4 w-4 inline mr-1" />
                        {realisticSkin ? "On" : "Off"}
                      </Label>
                    </div>
                  </div>

                  {/* Face Lock Toggle */}
                  <div className="space-y-1">
                    <label className={cn(
                      "text-sm text-muted-foreground",
                      isFieldDisabledByAdvancedMode("faceLock") && "opacity-50"
                    )}>
                      Face Lock
                      {isFieldDisabledByAdvancedMode("faceLock") && (
                        <span className="ml-1 text-xs text-purple-500">(use Advanced)</span>
                      )}
                    </label>
                    <div className={cn(
                      "flex items-center space-x-2 h-10 px-3 border rounded-md",
                      isFieldDisabledByAdvancedMode("faceLock") && "opacity-50"
                    )}>
                      <Switch
                        id="face-lock"
                        checked={faceLock}
                        onCheckedChange={setFaceLock}
                        disabled={isFieldDisabledByAdvancedMode("faceLock")}
                      />
                      <Label htmlFor="face-lock" className="text-sm">
                        <ScanFace className="h-4 w-4 inline mr-1" />
                        {faceLock ? "On" : "Off"}
                      </Label>
                    </div>
                  </div>

                  {/* Clear Style/VFX */}
                  {(selectedStyle || selectedVfxEffect) && (
                    <div className="space-y-1">
                      <label className="text-sm text-muted-foreground">Clear</label>
                      <Button
                        variant="outline"
                        className="w-full h-10"
                        onClick={() => {
                          setSelectedStyle("");
                          setSelectedStyleCategory("");
                          setSelectedVfxEffect("");
                          setSelectedVfxCategory("");
                        }}
                      >
                        <X className="h-4 w-4 mr-2" />
                        Clear Options
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Skill Selector */}
              <div className="pt-4 border-t space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wand2 className="h-4 w-4 text-purple-500" />
                    <label className="text-sm font-medium">Auto Prompt Skill</label>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSkillDialog(true)}
                    className="text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                  >
                    Change Skill
                  </Button>
                </div>

                {/* Current Skill Display */}
                <div
                  className="flex items-center gap-3 p-3 rounded-xl border-2 border-purple-200 bg-purple-50/50 cursor-pointer hover:border-purple-300 transition-colors"
                  onClick={() => setShowSkillDialog(true)}
                >
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shrink-0">
                    <Wand2 className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-purple-900">
                        {currentSkill?.name || "No Skill Selected"}
                      </span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-purple-100 text-purple-700">
                        Active
                      </Badge>
                    </div>
                    <p className="text-xs text-purple-600/80 truncate">
                      {currentSkill?.description || "Click to select a skill for enhancing your prompts"}
                    </p>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  This skill will be used when you click "Auto Prompt" to enhance your input
                </p>

                <Dialog open={showSkillDialog} onOpenChange={setShowSkillDialog}>
                  <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-purple-500" />
                        Select Auto Prompt Skill
                      </DialogTitle>
                    </DialogHeader>

                    {!skillsList ? (
                      <div className="flex items-center justify-center py-12">
                        <RefreshCw className="h-8 w-8 animate-spin text-purple-500" />
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Search */}
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Search skills..."
                            className="pl-9"
                            onChange={(e) => {
                              const q = e.target.value.toLowerCase();
                              // filter is handled inline below
                              (e.target as any).dataset.query = q;
                              e.target.dispatchEvent(new Event('input', { bubbles: true }));
                            }}
                          />
                        </div>

                        {/* Skill Cards */}
                        {(() => {
                          const tabTypes: Record<string, string[]> = {
                            image: ["image-generation", "image-video-generation", "prompt-enhancement"],
                            video: ["video-generation", "image-video-generation", "prompt-enhancement"],
                            audio: ["audio-generation", "sound-effects"],
                          };
                          const matchTypes = tabTypes[activeTab] || [];
                          const filtered = (skillsList || [])
                            .filter((s) => matchTypes.includes(s.type))
                            .sort((a, b) => (b.priority ?? 50) - (a.priority ?? 50));

                          if (filtered.length === 0) {
                            return (
                              <div className="text-center py-12 text-muted-foreground">
                                <Wand2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                                <p>No skills available for {activeTab}</p>
                              </div>
                            );
                          }

                          return (
                            <div className="grid gap-2">
                              {filtered.map((skill) => (
                                <button
                                  key={skill.id}
                                  onClick={() => {
                                    setSelectedSkillId(skill.id);
                                    setShowSkillDialog(false);
                                  }}
                                  className={cn(
                                    "w-full text-left p-4 rounded-xl border-2 transition-all duration-200",
                                    skill.id === selectedSkillId
                                      ? "border-purple-500 bg-purple-50/50 ring-2 ring-purple-200"
                                      : "border-gray-200 hover:border-purple-300 hover:bg-purple-50/30"
                                  )}
                                >
                                  <div className="flex items-start gap-3">
                                    <div className={cn(
                                      "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                                      skill.id === selectedSkillId
                                        ? "bg-gradient-to-br from-purple-500 to-pink-500 text-white"
                                        : "bg-gray-100 text-gray-600"
                                    )}>
                                      <Wand2 className="h-4 w-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-semibold">{skill.name}</span>
                                        {skill.id === selectedSkillId && (
                                          <Badge className="bg-purple-500 text-white text-[10px] px-1.5 py-0">Selected</Badge>
                                        )}
                                      </div>
                                      {skill.description && (
                                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{skill.description}</p>
                                      )}
                                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 mt-2">
                                        {skill.type.replace(/-/g, " ")}
                                      </Badge>
                                    </div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </DialogContent>
                </Dialog>

                {/* Advanced Mode Toggle - shown when skill has schema */}
                {skillSchema && (
                  <div className="flex items-center justify-between pt-3 border-t">
                    <div className="flex items-center gap-2">
                      <Settings className="h-4 w-4 text-blue-500" />
                      <label className="text-sm font-medium">Advanced Mode</label>
                      <Badge variant="outline" className="text-[10px]">
                        {skillSchema.title}
                      </Badge>
                    </div>
                    <Switch
                      checked={useAdvancedMode}
                      onCheckedChange={setUseAdvancedMode}
                    />
                  </div>
                )}
              </div>

              {/* Dynamic Skill Form - shown in advanced mode */}
              {useAdvancedMode && skillSchema && (
                <div className="bg-white/70 backdrop-blur rounded-xl border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Settings className="h-4 w-4 text-blue-500" />
                      <h3 className="font-semibold">Skill Parameters</h3>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {skillSchema.title}
                    </Badge>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {skillSchema.description || "Configure skill parameters for precise control"}
                  </p>

                  {/* LLM Model Selector for Auto Prompt */}
                  <div className="space-y-1.5 pt-2 border-t">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-purple-500" />
                      Auto Prompt Model
                      {skillConfig?.defaultModel && (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          default: {skillConfig.defaultModel.split('/').pop()}
                        </Badge>
                      )}
                    </label>
                    <Select
                      value={selectedLlmModel || undefined}
                      onValueChange={(value) => {
                        setSelectedLlmModel(value);
                        setLlmModelManuallySet(true); // Mark as user's manual choice
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select LLM model...">
                          {selectedLlmModel && visionModels?.models?.find(m => m.id === selectedLlmModel)?.name
                            ? `${visionModels.models.find(m => m.id === selectedLlmModel)?.name} (${visionModels.models.find(m => m.id === selectedLlmModel)?.providerDisplayName})`
                            : selectedLlmModel || "Select LLM model..."}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        {/* Search input */}
                        <div className="sticky top-0 bg-white p-2 border-b z-10">
                          <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder="Search models..."
                              value={llmModelSearch}
                              onChange={(e) => setLlmModelSearch(e.target.value)}
                              className="pl-8 h-8"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            />
                          </div>
                        </div>
                        <ScrollArea className="max-h-[240px]">
                          {visionModels?.models
                            ?.filter((model) => {
                              if (!llmModelSearch) return true;
                              const search = llmModelSearch.toLowerCase();
                              return (
                                model.name.toLowerCase().includes(search) ||
                                model.id.toLowerCase().includes(search) ||
                                model.providerDisplayName?.toLowerCase().includes(search)
                              );
                            })
                            .map((model) => (
                              <SelectItem key={model.id} value={model.id}>
                                {model.name} ({model.providerDisplayName})
                                {model.isDefault && " • default"}
                              </SelectItem>
                            ))}
                          {visionModels?.models?.filter((model) => {
                            if (!llmModelSearch) return true;
                            const search = llmModelSearch.toLowerCase();
                            return (
                              model.name.toLowerCase().includes(search) ||
                              model.id.toLowerCase().includes(search) ||
                              model.providerDisplayName?.toLowerCase().includes(search)
                            );
                          }).length === 0 && (
                            <div className="py-4 text-center text-sm text-muted-foreground">
                              No models found
                            </div>
                          )}
                        </ScrollArea>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Select the LLM model for prompt enhancement. Vision-capable models can analyze reference images.
                    </p>
                  </div>

                  <DynamicSkillForm
                    schema={skillSchema}
                    language="en"
                    values={dynamicFormValues}
                    onChange={setDynamicFormValues}
                    excludeFields={["aspectRatio", "aspect_ratio"]}
                    onImageUpload={async (files) => {
                      const urls: string[] = [];
                      for (const file of Array.from(files)) {
                        if (!file.type.startsWith("image/")) continue;
                        try {
                          const base64 = await new Promise<string>((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve(String(reader.result));
                            reader.onerror = reject;
                            reader.readAsDataURL(file);
                          });
                          const result = await uploadMutation.mutateAsync({
                            fileName: file.name,
                            fileType: file.type,
                            fileBase64: base64,
                          });
                          urls.push(result.url);
                          setReferenceImages(prev => [...prev, { url: result.url, name: file.name }]);
                        } catch (error) {
                          console.error("Upload failed:", error);
                        }
                      }
                      return urls;
                    }}
                    referenceImages={referenceImages}
                    onRemoveImage={removeReferenceImage}
                    isUploading={uploadMutation.isPending}
                    onStyleAction={handleStyleAction}
                  />

                  {/* Auto Prompt Button (inside Skills Parameters) */}
                  <div className="pt-3 border-t">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full gap-2 border-purple-200 hover:border-purple-400 hover:bg-purple-50"
                            onClick={handleAutoPrompt}
                            disabled={(!prompt.trim() && !dynamicFormValues.request && referenceImages.length === 0) || isEnhancing}
                          >
                            {isEnhancing ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Wand2 className="h-4 w-4 text-purple-500" />
                            )}
                            <span>Auto Prompt</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Generate enhanced prompt using Advanced Mode settings</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              )}
            </div>

            {/* Generated Media History */}
            {generatedMedia.length > 0 && (
              <div className="bg-white/70 backdrop-blur rounded-xl border p-4 space-y-3 overflow-hidden">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Generated Media</h3>
                  <Badge variant="outline">{generatedMedia.length} items</Badge>
                </div>

                <ScrollArea className="h-[200px] overflow-hidden">
                  <div className="grid grid-cols-4 gap-2 pr-2">
                    {generatedMedia.map((media) => (
                      <div
                        key={media.id}
                        className="relative group cursor-pointer"
                        onClick={() => setPreviewUrl(media.url)}
                      >
                        {media.type === "image" ? (
                          <img
                            src={media.url}
                            alt={media.prompt}
                            className="w-full aspect-square object-cover rounded-lg border"
                          />
                        ) : media.type === "video" ? (
                          <div className="w-full aspect-square bg-gray-100 rounded-lg border flex items-center justify-center">
                            <Video className="h-6 w-6 text-gray-400" />
                          </div>
                        ) : (
                          <div className="w-full aspect-square bg-gray-100 rounded-lg border flex items-center justify-center">
                            <Music className="h-6 w-6 text-gray-400" />
                          </div>
                        )}

                        {/* Hover Actions */}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-1">
                          {media.type === "image" && referenceImages.length < maxReferenceImages && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-white hover:bg-white/20"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      addAsReference(media);
                                    }}
                                  >
                                    <ImagePlus className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Use as reference</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-white hover:bg-white/20"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    downloadMedia(media.url, `generated-${media.type}-${media.id}.${media.type === "image" ? "png" : media.type === "video" ? "mp4" : "mp3"}`);
                                  }}
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Download</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>

          {/* Right Panel - Preview */}
          <div className="space-y-4">
            <div className="bg-white/70 backdrop-blur rounded-xl border p-4 sticky top-24 z-10">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                Preview
                {isGenerating && generationTasks.length > 1 && (
                  <Badge variant="secondary" className="text-xs">
                    {generationTasks.filter(t => t.status === 'completed').length}/{generationTasks.length}
                  </Badge>
                )}
              </h3>

              {/* Progressive Grid Preview for multiple images */}
              {generationTasks.length > 1 && (isGenerating || generationTasks.some(t => t.status !== 'queued')) ? (
                <div className={cn(
                  "grid gap-2 mb-4",
                  generationTasks.length === 2 && "grid-cols-2",
                  generationTasks.length === 3 && "grid-cols-3",
                  generationTasks.length === 4 && "grid-cols-2",
                )}>
                  {generationTasks.map((task) => (
                    <div
                      key={task.id}
                      className="relative aspect-square bg-gradient-to-br from-gray-100 to-gray-50 rounded-lg overflow-hidden group"
                    >
                      {task.status === 'queued' && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                          <div className="w-8 h-8 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center mb-1">
                            <span className="text-xs font-medium">{task.index + 1}</span>
                          </div>
                          <span className="text-xs">Queued</span>
                        </div>
                      )}
                      {task.status === 'generating' && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <Loader2 className="h-8 w-8 animate-spin text-purple-500 mb-1" />
                          <span className="text-xs text-muted-foreground">Generating #{task.index + 1}</span>
                        </div>
                      )}
                      {task.status === 'completed' && task.url && (
                        <>
                          <img
                            src={task.url}
                            alt={`Generated ${task.index + 1}`}
                            className="w-full h-full object-cover cursor-pointer"
                            onClick={() => {
                              const media = generatedMedia.find(m => m.url === task.url);
                              openLightbox(task.url!, media?.prompt || prompt || "", media?.model || selectedModel, media?.createdAt);
                            }}
                          />
                          {/* Hover overlay */}
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-white hover:bg-white/20"
                              onClick={() => {
                                const media = generatedMedia.find(m => m.url === task.url);
                                openLightbox(task.url!, media?.prompt || prompt || "", media?.model || selectedModel, media?.createdAt);
                              }}
                            >
                              <Maximize2 className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-white hover:bg-white/20"
                              onClick={() => downloadMedia(task.url!, `generated-${task.index + 1}.png`)}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                          {/* Success indicator */}
                          <div className="absolute top-1 right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                            <Check className="h-3 w-3 text-white" />
                          </div>
                        </>
                      )}
                      {task.status === 'error' && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-destructive">
                          <AlertCircle className="h-8 w-8 mb-1" />
                          <span className="text-xs">Error</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                /* Single Image Preview (original behavior) */
                <div className="aspect-square bg-gradient-to-br from-gray-100 to-gray-50 rounded-xl flex items-center justify-center overflow-hidden relative group">
                  {isGenerating ? (
                    <div className="text-center">
                      <Loader2 className="h-12 w-12 animate-spin text-purple-500 mx-auto mb-4" />
                      <p className="text-sm text-muted-foreground">Creating your {activeTab}...</p>
                    </div>
                  ) : previewUrl ? (
                    activeTab === "image" ? (
                      <>
                        <img
                          src={previewUrl}
                          alt="Preview"
                          className="w-full h-full object-contain cursor-pointer"
                          onClick={() => {
                            // Find the matching generated media for prompt info
                            const media = generatedMedia.find(m => m.url === previewUrl);
                            openLightbox(previewUrl, media?.prompt || prompt || "", media?.model || selectedModel, media?.createdAt);
                          }}
                        />
                        {/* Expand button overlay */}
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-12 w-12 text-white hover:bg-white/20"
                            onClick={() => {
                              const media = generatedMedia.find(m => m.url === previewUrl);
                              openLightbox(previewUrl, media?.prompt || prompt || "", media?.model || selectedModel, media?.createdAt);
                            }}
                          >
                            <Maximize2 className="h-6 w-6" />
                          </Button>
                        </div>
                      </>
                    ) : activeTab === "video" ? (
                      <video
                        src={previewUrl}
                        controls
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <audio src={previewUrl} controls className="w-full" />
                    )
                  ) : (
                    <div className="text-center text-muted-foreground">
                      <Sparkles className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No content generated yet</p>
                    </div>
                  )}
                </div>
              )}

              {previewUrl && !isGenerating && (
                <div className="flex gap-2 mt-4">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => downloadMedia(previewUrl, `generated-${activeTab}.${activeTab === "image" ? "png" : activeTab === "video" ? "mp4" : "mp3"}`)}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                  {activeTab === "image" && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            onClick={() => openSplitDialog(previewUrl)}
                          >
                            <Grid2X2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Split Grid Image</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => window.open(previewUrl, "_blank")}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            {/* History Gallery - Draggable Images */}
            <div className="pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <History className="h-4 w-4" />
                  History Gallery
                </h3>
                <Badge variant="outline" className="text-xs">
                  Drag to use as reference
                </Badge>
              </div>

              <ScrollArea className="h-[350px] pr-3">
                {/* Image Grid for completed tasks */}
                <div className="grid grid-cols-3 gap-2 mb-4 pb-2">
                  {mediaHistory?.tasks
                    ?.filter((task) => task.status === "completed" && task.resultUrl && task.mediaType === "image")
                    .map((task) => (
                      <div
                        key={task.id}
                        className="relative group cursor-grab active:cursor-grabbing"
                        draggable
                        onDragStart={(e) => handleHistoryDragStart(e, task.resultUrl!)}
                        onClick={() => setPreviewUrl(task.resultUrl!)}
                      >
                        <img
                          src={task.resultUrl}
                          alt={task.prompt?.slice(0, 30)}
                          className="w-full aspect-square object-cover rounded-lg border hover:border-purple-400 transition-colors"
                        />
                        {/* Hover overlay */}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex flex-col items-center justify-center gap-1">
                          {/* Expand/View button */}
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-white hover:bg-white/20"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openLightbox(task.resultUrl!, task.prompt || "", task.model, task.createdAt);
                                  }}
                                >
                                  <Maximize2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>View & Copy Prompt</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          {referenceImages.length < maxReferenceImages && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-white hover:bg-white/20"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      addHistoryAsReference(task);
                                    }}
                                  >
                                    <ImagePlus className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Use as reference</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-white hover:bg-white/20"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openSplitDialog(task.resultUrl!);
                                  }}
                                >
                                  <Grid2X2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Split Grid</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-white hover:bg-white/20"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    downloadMedia(task.resultUrl!, `${task.id}.png`);
                                  }}
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Download</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>
                    ))}
                </div>

                {/* Pending/Processing Tasks - Only show failed tasks from current session */}
                <div className="space-y-2">
                  {mediaHistory?.tasks
                    ?.filter((task) => {
                      // Always show processing/pending tasks
                      if (task.status === "processing" || task.status === "pending") return true;
                      // Show failed tasks only if they failed during this session
                      if (task.status === "failed") {
                        return task.createdAt && new Date(task.createdAt) >= sessionStartTime;
                      }
                      // Hide completed tasks without resultUrl and old failed tasks
                      return false;
                    })
                    .map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50"
                      >
                        <div className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                          task.mediaType === "image" ? "bg-purple-100" :
                          task.mediaType === "video" ? "bg-blue-100" : "bg-orange-100"
                        )}>
                          {task.status === "processing" ? (
                            <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                          ) : task.mediaType === "image" ? (
                            <Image className="h-5 w-5 text-purple-500" />
                          ) : task.mediaType === "video" ? (
                            <Video className="h-5 w-5 text-blue-500" />
                          ) : (
                            <Music className="h-5 w-5 text-orange-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {task.prompt?.slice(0, 25)}...
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {task.status === "processing" ? (
                              <span className="text-blue-500">Processing...</span>
                            ) : task.status === "failed" ? (
                              <span className="text-red-500">Failed</span>
                            ) : (
                              <span className="text-yellow-500">Pending</span>
                            )}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>

                {(!mediaHistory?.tasks || mediaHistory.tasks.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No history yet. Generate some images!
                  </p>
                )}
              </ScrollArea>
            </div>
          </div>
        </div>
      </main>

      {/* Image Lightbox Dialog */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="!max-w-[95vw] !w-[95vw] max-h-[95vh] p-0 overflow-hidden">
          <DialogTitle className="sr-only">Image Preview</DialogTitle>
          <div className="flex flex-col h-full">
            {/* Image - Large preview almost full screen */}
            <div className="flex-1 bg-black/95 flex items-center justify-center p-2 min-h-[60vh]">
              {lightboxImage && (
                <img
                  src={lightboxImage.url}
                  alt="Full size preview"
                  className="max-w-full max-h-[80vh] object-contain cursor-zoom-in"
                  onClick={() => window.open(lightboxImage.url, "_blank")}
                  title="Click to open full size in new tab"
                />
              )}
            </div>

            {/* Info Panel */}
            <div className="bg-white p-4 space-y-3">
              {/* Model & Date */}
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4" />
                  <span>{lightboxImage?.model || "Unknown model"}</span>
                </div>
                {lightboxImage?.createdAt && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <span>{new Date(lightboxImage.createdAt).toLocaleString()}</span>
                  </div>
                )}
              </div>

              {/* Prompt */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Prompt</label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => lightboxImage && copyPrompt(lightboxImage.prompt)}
                    className="h-8 gap-1"
                  >
                    {copiedPrompt ? (
                      <>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span className="text-green-600">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        <span>Copy</span>
                      </>
                    )}
                  </Button>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-sm max-h-[120px] overflow-y-auto">
                  {lightboxImage?.prompt || "No prompt available"}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={usePromptFromLightbox}
                >
                  <Wand2 className="h-4 w-4 mr-2" />
                  Use This Prompt
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => lightboxImage && downloadMedia(lightboxImage.url, `generated-image-${Date.now()}.png`)}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
                <Button
                  variant="outline"
                  onClick={() => lightboxImage && window.open(lightboxImage.url, "_blank")}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Grid Split Dialog */}
      <Dialog open={showSplitDialog} onOpenChange={setShowSplitDialog}>
        <DialogContent className="!max-w-[900px] !w-[90vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scissors className="h-5 w-5" />
              Split Grid Image
            </DialogTitle>
          </DialogHeader>

          <div className="flex gap-6">
            {/* Left: Preview - Fixed width */}
            <div className="w-[350px] shrink-0 space-y-3">
              <label className="text-sm font-medium">Preview</label>
              <div className="w-[350px] h-[350px] bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center">
                {isDetectingGrid ? (
                  <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-purple-500 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Detecting grid...</p>
                  </div>
                ) : splitPreviewUrl ? (
                  <img
                    src={splitPreviewUrl}
                    alt="Split preview"
                    className="max-w-full max-h-full object-contain"
                  />
                ) : splitImageUrl ? (
                  <img
                    src={splitImageUrl}
                    alt="Original"
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">No image selected</p>
                )}
              </div>

              {detectedGrid && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                  <div className="flex items-center gap-2 text-green-700">
                    <Check className="h-4 w-4" />
                    <span>
                      Auto-detected: {detectedGrid.rows}x{detectedGrid.cols} grid
                      ({detectedGrid.cellWidth}x{detectedGrid.cellHeight}px cells)
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Controls - Fixed width */}
            <div className="w-[450px] shrink-0 space-y-4">
              {/* Aspect Ratio Guide */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                <p className="font-medium text-blue-800 mb-2">Recommended Grid Sizes by Aspect Ratio</p>
                <div className="grid grid-cols-4 gap-2 text-blue-700 text-xs">
                  <div>
                    <p className="font-medium">16:9</p>
                    <p>2x4, 2x5</p>
                  </div>
                  <div>
                    <p className="font-medium">9:16</p>
                    <p>4x2, 5x2</p>
                  </div>
                  <div>
                    <p className="font-medium">1:1</p>
                    <p>2x2, 3x3</p>
                  </div>
                  <div>
                    <p className="font-medium">4:3</p>
                    <p>2x3, 3x4</p>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Grid Size</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {COMMON_GRIDS.map((grid) => (
                    <Button
                      key={`${grid.rows}x${grid.cols}`}
                      variant={splitGridRows === grid.rows && splitGridCols === grid.cols ? "default" : "outline"}
                      size="sm"
                      className="text-[11px] h-8 px-2"
                      onClick={() => updateSplitPreview(grid.rows, grid.cols)}
                    >
                      {grid.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Custom grid input */}
              <div className="flex items-center gap-3">
                <div className="w-20">
                  <label className="text-xs text-muted-foreground mb-1 block">Rows</label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={splitGridRows}
                    onChange={(e) => {
                      const rows = Math.min(10, Math.max(1, parseInt(e.target.value) || 1));
                      updateSplitPreview(rows, splitGridCols);
                    }}
                    className="h-9"
                  />
                </div>
                <span className="text-muted-foreground pt-5">×</span>
                <div className="w-20">
                  <label className="text-xs text-muted-foreground mb-1 block">Cols</label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={splitGridCols}
                    onChange={(e) => {
                      const cols = Math.min(10, Math.max(1, parseInt(e.target.value) || 1));
                      updateSplitPreview(splitGridRows, cols);
                    }}
                    className="h-9"
                  />
                </div>
                <div className="flex-1 pt-5">
                  <Button
                    className="w-full"
                    onClick={executeSplit}
                    disabled={isSplitting || !splitImageUrl}
                  >
                    {isSplitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Splitting...
                      </>
                    ) : (
                      <>
                        <Scissors className="h-4 w-4 mr-2" />
                        Split ({splitGridRows * splitGridCols})
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Split Results */}
              {splitResults.length > 0 && (
                <div className="space-y-3 border-t pt-4">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Results ({splitResults.length} images)</label>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={addAllSplitsToVideoReference}>
                        <Video className="h-4 w-4 mr-1" />
                        Add to Video Reference
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleDownloadAllSplits}>
                        <Download className="h-4 w-4 mr-1" />
                        Download All
                      </Button>
                    </div>
                  </div>
                  <ScrollArea className="h-[180px]">
                    <div className="grid grid-cols-5 gap-2 pr-2">
                      {splitResults.map((result) => (
                        <div
                          key={result.index}
                          className="relative group aspect-square rounded-lg overflow-hidden border hover:border-purple-400 transition-colors"
                        >
                          <img
                            src={result.dataUrl}
                            alt={`Split ${result.index + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-white hover:bg-white/20"
                                    onClick={() => handleDownloadSplit(result)}
                                  >
                                    <Download className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Download</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            {referenceImages.length < maxReferenceImages && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7 text-white hover:bg-white/20"
                                      onClick={() => addSplitAsReference(result)}
                                    >
                                      <ImagePlus className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Use as Reference</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                          <div className="absolute bottom-0 right-0 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded-tl">
                            {result.index + 1}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
