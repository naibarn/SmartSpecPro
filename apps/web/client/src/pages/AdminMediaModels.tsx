import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "../lib/trpc";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Pencil,
  Copy,
  Trash2,
  Loader2,
  Image,
  Video,
  Music,
  Layers,
  DollarSign,
  Check,
  X,
  ChevronLeft,
  Sparkles,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Coins,
  ArrowUpDown,
  GripVertical,
  Settings2,
  Code,
  Activity,
  RefreshCw,
  RotateCcw,
} from "lucide-react";

interface MediaModel {
  id: number;
  modelId: string;
  name: string;
  description: string | null;
  modelType: "image" | "video" | "audio";
  provider: string;
  aliases: string[] | null;
  creditCost: number;
  aspectRatios: string[] | null;
  sizes: string[] | null;
  durations: number[] | null;
  voices: string[] | null;
  configJson: Record<string, any> | null;
  isEnabled: boolean;
  priority: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface FormData {
  modelId: string;
  name: string;
  description: string;
  modelType: "image" | "video" | "audio";
  provider: string;
  aliases: string;
  creditCost: number;
  aspectRatios: string;
  sizes: string;
  durations: string;
  voices: string;
  isEnabled: boolean;
  priority: number;
  // API Config (configJson)
  apiEndpoint: string;
  apiQueryEndpoint: string;
  apiPayloadFormat: string;
  kieModelId: string;
  pricingFormula: string;
  generateType: string;
  maxPromptLength: number;
  inputFieldsJson: string;
  pricingTiersJson: string;
}

const DEFAULT_FORM_DATA: FormData = {
  modelId: "",
  name: "",
  description: "",
  modelType: "image",
  provider: "kie.ai",
  aliases: "",
  creditCost: 10,
  aspectRatios: "",
  sizes: "",
  durations: "",
  voices: "",
  isEnabled: true,
  priority: 99,
  apiEndpoint: "/api/v1/jobs/createTask",
  apiQueryEndpoint: "",
  apiPayloadFormat: "market",
  kieModelId: "",
  pricingFormula: "flat",
  generateType: "",
  maxPromptLength: 2000,
  inputFieldsJson: "[]",
  pricingTiersJson: '{"default": 10}',
};

export default function AdminMediaModels() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [editingModel, setEditingModel] = useState<MediaModel | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<MediaModel | null>(null);
  const [activeTab, setActiveTab] = useState("basic");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // Debounce search query to prevent focus loss during typing
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  // Form state
  const [formData, setFormData] = useState<FormData>(DEFAULT_FORM_DATA);
  // Store original configJson when duplicating to preserve extra fields
  const [duplicateSourceConfig, setDuplicateSourceConfig] = useState<Record<string, any> | null>(null);

  // Check auth
  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) {
      setLocation("/");
    }
  }, [user, authLoading, setLocation]);

  // Queries using tRPC hooks (use debounced search to prevent focus loss)
  const { data: models = [], isLoading, refetch } = trpc.mediaModels.adminList.useQuery(
    {
      search: debouncedSearch || undefined,
      type: typeFilter !== "all" ? (typeFilter as "image" | "video" | "audio") : undefined,
      includeDisabled: true,
    },
    {
      enabled: !!user && user.role === "admin",
    }
  );

  const { data: stats } = trpc.mediaModels.stats.useQuery(undefined, {
    enabled: !!user && user.role === "admin",
  });

  const {
    data: runtimeCounters,
    isFetching: isRuntimeCountersRefreshing,
    refetch: refetchRuntimeCounters,
  } = trpc.mediaModels.runtimeCounters.useQuery(undefined, {
    enabled: !!user && user.role === "admin",
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  // Mutations
  const createMutation = trpc.mediaModels.create.useMutation({
    onSuccess: (data) => {
      // Close dialog and reset form FIRST before refetching
      setIsCreateDialogOpen(false);
      resetForm();
      toast.success("Model created", {
        description: `${data.name} has been added successfully.`,
      });
      refetch();
    },
    onError: (error) => {
      toast.error("Failed to create model", {
        description: error.message,
      });
    },
  });

  const updateMutation = trpc.mediaModels.update.useMutation({
    onSuccess: (data) => {
      setEditingModel(null);
      resetForm();
      toast.success("Model updated", {
        description: `${data.name} has been updated successfully.`,
      });
      refetch();
    },
    onError: (error) => {
      toast.error("Failed to update model", {
        description: error.message,
      });
    },
  });

  const deleteMutation = trpc.mediaModels.delete.useMutation({
    onSuccess: () => {
      setDeleteConfirm(null);
      toast.success("Model deleted");
      refetch();
    },
    onError: (error) => {
      toast.error("Failed to delete model", {
        description: error.message,
      });
    },
  });

  const toggleEnabledMutation = trpc.mediaModels.toggleEnabled.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  const resetRuntimeCountersMutation = trpc.mediaModels.resetRuntimeCounters.useMutation({
    onSuccess: () => {
      toast.success("Runtime counters reset");
      refetchRuntimeCounters();
    },
    onError: (error) => {
      toast.error("Failed to reset runtime counters", {
        description: error.message,
      });
    },
  });

  const resetForm = () => {
    setFormData(DEFAULT_FORM_DATA);
    setActiveTab("basic");
    setDuplicateSourceConfig(null);
  };

  const handleEditModel = (model: MediaModel) => {
    setEditingModel(model);
    const cfg = model.configJson || {};
    setFormData({
      modelId: model.modelId,
      name: model.name,
      description: model.description || "",
      modelType: model.modelType,
      provider: model.provider,
      aliases: (model.aliases || []).join(", "),
      creditCost: model.creditCost,
      aspectRatios: (model.aspectRatios || []).join(", "),
      sizes: (model.sizes || []).join(", "),
      durations: (model.durations || []).join(", "),
      voices: (model.voices || []).join(", "),
      isEnabled: model.isEnabled,
      priority: model.priority,
      apiEndpoint: cfg.apiEndpoint || "/api/v1/jobs/createTask",
      apiQueryEndpoint: cfg.apiQueryEndpoint || cfg.queryEndpoint || cfg.statusEndpoint || "",
      apiPayloadFormat: cfg.apiPayloadFormat || "market",
      kieModelId: cfg.kieModelId || "",
      pricingFormula: cfg.pricingFormula || "flat",
      generateType: cfg.generateType || "",
      maxPromptLength: cfg.maxPromptLength || 2000,
      inputFieldsJson: cfg.inputFields ? JSON.stringify(cfg.inputFields, null, 2) : "[]",
      pricingTiersJson: cfg.pricingTiers ? JSON.stringify(cfg.pricingTiers, null, 2) : '{"default": 10}',
    });
    setActiveTab("basic");
  };

  const handleDuplicateModel = (model: MediaModel) => {
    // Clone the model data but with modified modelId and clear editingModel to create new
    setEditingModel(null);
    const cfg = model.configJson || {};
    // Store original configJson to preserve extra fields when saving
    setDuplicateSourceConfig(cfg);
    setFormData({
      modelId: `${model.modelId}_copy`,
      name: `${model.name} (Copy)`,
      description: model.description || "",
      modelType: model.modelType,
      provider: model.provider,
      aliases: (model.aliases || []).join(", "),
      creditCost: model.creditCost,
      aspectRatios: (model.aspectRatios || []).join(", "),
      sizes: (model.sizes || []).join(", "),
      durations: (model.durations || []).join(", "),
      voices: (model.voices || []).join(", "),
      isEnabled: false, // Start disabled for safety
      priority: model.priority,
      apiEndpoint: cfg.apiEndpoint || "/api/v1/jobs/createTask",
      apiQueryEndpoint: cfg.apiQueryEndpoint || cfg.queryEndpoint || cfg.statusEndpoint || "",
      apiPayloadFormat: cfg.apiPayloadFormat || "market",
      kieModelId: cfg.kieModelId || "",
      pricingFormula: cfg.pricingFormula || "flat",
      generateType: cfg.generateType || "",
      maxPromptLength: cfg.maxPromptLength || 2000,
      inputFieldsJson: cfg.inputFields ? JSON.stringify(cfg.inputFields, null, 2) : "[]",
      pricingTiersJson: cfg.pricingTiers ? JSON.stringify(cfg.pricingTiers, null, 2) : '{"default": 10}',
    });
    setActiveTab("basic");
    setIsCreateDialogOpen(true);
    toast.info("Model duplicated", {
      description: "Please modify the Model ID before saving.",
    });
  };

  const handleSave = () => {
    const aliases = formData.aliases
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const aspectRatios = formData.aspectRatios
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const sizes = formData.sizes
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const durations = formData.durations
      .split(",")
      .map((s) => parseInt(s.trim()))
      .filter((n) => !isNaN(n));
    const voices = formData.voices
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    // Build configJson from structured fields
    let inputFields: any[] = [];
    let pricingTiers: Record<string, number> = {};
    let parseErrors: string[] = [];

    try {
      const parsed = JSON.parse(formData.inputFieldsJson);
      if (Array.isArray(parsed)) {
        inputFields = parsed;
      } else {
        parseErrors.push("Input Fields must be a JSON array");
      }
    } catch (e: any) {
      parseErrors.push(`Input Fields JSON error: ${e.message}`);
    }

    try {
      const parsed = JSON.parse(formData.pricingTiersJson);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        pricingTiers = parsed;
      } else {
        parseErrors.push("Pricing Tiers must be a JSON object");
      }
    } catch (e: any) {
      parseErrors.push(`Pricing Tiers JSON error: ${e.message}`);
    }

    // Show validation errors and abort save
    if (parseErrors.length > 0) {
      toast.error("JSON Validation Error", {
        description: parseErrors.join(" | "),
        duration: 5000,
      });
      return;
    }

    const configJson: Record<string, any> = {
      apiEndpoint: formData.apiEndpoint,
      apiQueryEndpoint: formData.apiQueryEndpoint || undefined,
      apiPayloadFormat: formData.apiPayloadFormat,
      kieModelId: formData.kieModelId || undefined,
      pricingFormula: formData.pricingFormula,
      generateType: formData.generateType || undefined,
      maxPromptLength: formData.maxPromptLength,
      inputFields,
      pricingTiers,
    };

    if (editingModel) {
      // Preserve any extra configJson keys the seed script set
      const existing = editingModel.configJson || {};
      const merged = { ...existing, ...configJson };
      updateMutation.mutate({
        id: editingModel.id,
        modelId: formData.modelId,
        name: formData.name,
        description: formData.description || null,
        modelType: formData.modelType,
        provider: formData.provider,
        aliases,
        creditCost: formData.creditCost,
        aspectRatios: aspectRatios.length > 0 ? aspectRatios : null,
        sizes: sizes.length > 0 ? sizes : null,
        durations: durations.length > 0 ? durations : null,
        voices: voices.length > 0 ? voices : null,
        configJson: merged,
        isEnabled: formData.isEnabled,
        priority: formData.priority,
      });
    } else {
      // If duplicating, merge original configJson to preserve extra fields
      const finalConfigJson = duplicateSourceConfig
        ? { ...duplicateSourceConfig, ...configJson }
        : configJson;
      createMutation.mutate({
        modelId: formData.modelId,
        name: formData.name,
        description: formData.description || undefined,
        modelType: formData.modelType,
        provider: formData.provider,
        aliases,
        creditCost: formData.creditCost,
        aspectRatios: aspectRatios.length > 0 ? aspectRatios : undefined,
        sizes: sizes.length > 0 ? sizes : undefined,
        durations: durations.length > 0 ? durations : undefined,
        voices: voices.length > 0 ? voices : undefined,
        configJson: finalConfigJson,
        isEnabled: formData.isEnabled,
        priority: formData.priority,
      });
    }
  };

  const getModelTypeIcon = (type: string) => {
    switch (type) {
      case "image":
        return <Image className="h-4 w-4" />;
      case "video":
        return <Video className="h-4 w-4" />;
      case "audio":
        return <Music className="h-4 w-4" />;
      default:
        return <Layers className="h-4 w-4" />;
    }
  };

  const getModelTypeBadgeColor = (type: string) => {
    switch (type) {
      case "image":
        return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
      case "video":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
      case "audio":
        return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      default:
        return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20 px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <Button variant="ghost" className="mb-4" onClick={() => setLocation("/dashboard")}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Sparkles className="h-8 w-8 text-primary" />
              Media AI Models
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage AI models for image, video, and audio generation skills
            </p>
          </div>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Model
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-5 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Models</CardTitle>
              <Layers className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Enabled</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.enabled}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Image</CardTitle>
              <Image className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.byType.image}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Video</CardTitle>
              <Video className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.byType.video}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Audio</CardTitle>
              <Music className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.byType.audio}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Runtime Counters */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-emerald-600" />
                Runtime Counter Observability
              </CardTitle>
              <CardDescription>
                Live counters for DB default selection and fallback behavior (auto-refresh every 5 seconds)
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => refetchRuntimeCounters()}
                disabled={isRuntimeCountersRefreshing}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${isRuntimeCountersRefreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => resetRuntimeCountersMutation.mutate()}
                disabled={resetRuntimeCountersMutation.isPending}
              >
                <RotateCcw className={`mr-2 h-4 w-4 ${resetRuntimeCountersMutation.isPending ? "animate-spin" : ""}`} />
                Reset Counters
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!runtimeCounters ? (
            <div className="text-sm text-muted-foreground">Loading runtime counters...</div>
          ) : (
            <div className="space-y-4">
              <div className="text-xs text-muted-foreground">
                Last sample: {new Date(runtimeCounters.generatedAt).toLocaleString()} | Total fallback hits:{" "}
                <span className="font-semibold text-amber-600">{runtimeCounters.fallbackTotal}</span>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <Card className="border-emerald-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Default Resolution</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>defaultFromDb</span>
                      <span className="font-semibold">{runtimeCounters.mediaLookup.defaultFromDb}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>defaultFallbackStatic</span>
                      <span className="font-semibold text-amber-600">{runtimeCounters.mediaLookup.defaultFallbackStatic}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>unknownModelRejected</span>
                      <span className="font-semibold">{runtimeCounters.mediaLookup.unknownModelRejected}</span>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-blue-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">DB Lookup Fallback</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>pricingDbMissFallback</span>
                      <span className="font-semibold text-amber-600">{runtimeCounters.mediaLookup.pricingDbMissFallback}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>metadataDbMissFallback</span>
                      <span className="font-semibold text-amber-600">{runtimeCounters.mediaLookup.metadataDbMissFallback}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>providerDefaultFallback</span>
                      <span className="font-semibold text-amber-600">{runtimeCounters.mediaResolution.providerDefaultFallback}</span>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-violet-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Provider & Registry</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>providerFromApiConfig</span>
                      <span className="font-semibold">{runtimeCounters.mediaResolution.providerFromApiConfig}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>providerFromStaticRegistry</span>
                      <span className="font-semibold">{runtimeCounters.mediaResolution.providerFromStaticRegistry}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>unknownModelRequests</span>
                      <span className="font-semibold">{runtimeCounters.mediaResolution.unknownModelRequests}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>registry.staticFallbackHits</span>
                      <span className="font-semibold text-amber-600">{runtimeCounters.modelRegistry.staticFallbackHits}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>registry.cacheHits</span>
                      <span className="font-semibold">{runtimeCounters.modelRegistry.cacheHits}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search models..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="image">Image</SelectItem>
                <SelectItem value="video">Video</SelectItem>
                <SelectItem value="audio">Audio</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Models List */}
      <Card>
        <CardHeader>
          <CardTitle>Configured Models</CardTitle>
          <CardDescription>
            These models are available for image, video, and audio generation skills. Users can
            specify model names in their prompts (e.g., "generate image with flux 2.0").
          </CardDescription>
        </CardHeader>
        <CardContent>
          {models.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No models configured</p>
              <p className="text-sm">Add your first AI model to get started</p>
              <Button className="mt-4" onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Model
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">#</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Credits</TableHead>
                  <TableHead>Aliases</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {models.map((model: any, index: number) => (
                  <TableRow key={model.id}>
                    <TableCell className="font-mono text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                          {getModelTypeIcon(model.modelType)}
                        </div>
                        <div>
                          <div className="font-medium">{model.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">
                            {model.modelId}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getModelTypeBadgeColor(model.modelType)}>
                        {model.modelType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{model.provider}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Coins className="h-3 w-3 text-amber-500" />
                        <span className="font-medium">{model.creditCost}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {(model.aliases || []).slice(0, 2).map((alias: string, i: number) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {alias}
                          </Badge>
                        ))}
                        {(model.aliases || []).length > 2 && (
                          <Badge variant="outline" className="text-xs">
                            +{(model.aliases || []).length - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {model.isEnabled ? (
                        <Badge variant="default" className="bg-green-500">
                          <Check className="mr-1 h-3 w-3" />
                          Enabled
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <X className="mr-1 h-3 w-3" />
                          Disabled
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleEnabledMutation.mutate({ id: model.id })}
                          disabled={toggleEnabledMutation.isPending}
                        >
                          {model.isEnabled ? (
                            <XCircle className="h-4 w-4 text-amber-500" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditModel(model)}
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDuplicateModel(model)}
                          title="Duplicate"
                        >
                          <Copy className="h-4 w-4 text-blue-500" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteConfirm(model)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Model Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add AI Model</DialogTitle>
            <DialogDescription>
              Add a new AI model for generation skills
            </DialogDescription>
          </DialogHeader>

          <ModelForm formData={formData} setFormData={setFormData} activeTab={activeTab} setActiveTab={setActiveTab} />

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateDialogOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || !formData.modelId || !formData.name}
            >
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Model
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Model Dialog */}
      <Dialog open={!!editingModel} onOpenChange={(open) => !open && setEditingModel(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Model - {editingModel?.name}</DialogTitle>
            <DialogDescription>Update model configuration and aliases</DialogDescription>
          </DialogHeader>

          <ModelForm formData={formData} setFormData={setFormData} activeTab={activeTab} setActiveTab={setActiveTab} />

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingModel(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending || !formData.modelId || !formData.name}
            >
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Model</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteConfirm?.name}</strong>?
              This action cannot be undone and may affect skill detection for this model.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteConfirm && deleteMutation.mutate({ id: deleteConfirm.id })}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Model Form Component
function ModelForm({
  formData,
  setFormData,
  activeTab,
  setActiveTab,
}: {
  formData: FormData;
  setFormData: (data: FormData) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}) {
  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="basic">Basic Info</TabsTrigger>
        <TabsTrigger value="aliases">Aliases</TabsTrigger>
        <TabsTrigger value="capabilities">Capabilities</TabsTrigger>
        <TabsTrigger value="apiConfig">API Config</TabsTrigger>
      </TabsList>

      <TabsContent value="basic" className="space-y-4 mt-4">
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="modelId">Model ID *</Label>
              <Input
                id="modelId"
                value={formData.modelId}
                onChange={(e) => setFormData({ ...formData, modelId: e.target.value })}
                placeholder="e.g., google-nano-banana-pro"
              />
              <p className="text-xs text-muted-foreground">
                Unique identifier used in API calls
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="name">Display Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Google Nano Banana Pro"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of the model..."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="modelType">Model Type *</Label>
              <Select
                value={formData.modelType}
                onValueChange={(value: "image" | "video" | "audio") =>
                  setFormData({ ...formData, modelType: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="image">
                    <div className="flex items-center gap-2">
                      <Image className="h-4 w-4" />
                      Image
                    </div>
                  </SelectItem>
                  <SelectItem value="video">
                    <div className="flex items-center gap-2">
                      <Video className="h-4 w-4" />
                      Video
                    </div>
                  </SelectItem>
                  <SelectItem value="audio">
                    <div className="flex items-center gap-2">
                      <Music className="h-4 w-4" />
                      Audio
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="provider">Provider</Label>
              <Input
                id="provider"
                value={formData.provider}
                onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
                placeholder="e.g., kie.ai"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="creditCost">Credit Cost</Label>
              <Input
                id="creditCost"
                type="number"
                min={0}
                value={formData.creditCost}
                onChange={(e) =>
                  setFormData({ ...formData, creditCost: parseInt(e.target.value) || 0 })
                }
              />
              <p className="text-xs text-muted-foreground">
                Credits deducted per generation
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="priority">Priority</Label>
              <Input
                id="priority"
                type="number"
                min={0}
                value={formData.priority}
                onChange={(e) =>
                  setFormData({ ...formData, priority: parseInt(e.target.value) || 99 })
                }
              />
              <p className="text-xs text-muted-foreground">
                Lower = higher priority (default model)
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enabled</Label>
              <p className="text-sm text-muted-foreground">
                Allow this model to be used for generation
              </p>
            </div>
            <Switch
              checked={formData.isEnabled}
              onCheckedChange={(checked) => setFormData({ ...formData, isEnabled: checked })}
            />
          </div>
        </div>
      </TabsContent>

      <TabsContent value="aliases" className="space-y-4 mt-4">
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="aliases">Model Aliases</Label>
            <Textarea
              id="aliases"
              value={formData.aliases}
              onChange={(e) => setFormData({ ...formData, aliases: e.target.value })}
              placeholder="nano banana pro, nano_banana_pro, google nano banana, gemini 3"
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated list of aliases for natural language detection. Users can mention
              any of these in their prompts to use this model.
            </p>
          </div>

          <Card className="bg-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Example Usage</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p className="mb-2">With these aliases, users can say:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>"Generate image of a cat with <strong>nano banana pro</strong>"</li>
                <li>"Create a video using <strong>veo 3</strong>"</li>
                <li>"Create an image with <strong>flux 2.0</strong>"</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="capabilities" className="space-y-4 mt-4">
        <div className="grid gap-4">
          {(formData.modelType === "image" || formData.modelType === "video") && (
            <div className="grid gap-2">
              <Label htmlFor="aspectRatios">Supported Aspect Ratios</Label>
              <Input
                id="aspectRatios"
                value={formData.aspectRatios}
                onChange={(e) => setFormData({ ...formData, aspectRatios: e.target.value })}
                placeholder="1:1, 16:9, 9:16, 4:3"
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated list of supported aspect ratios
              </p>
            </div>
          )}

          {formData.modelType === "image" && (
            <div className="grid gap-2">
              <Label htmlFor="sizes">Supported Sizes</Label>
              <Input
                id="sizes"
                value={formData.sizes}
                onChange={(e) => setFormData({ ...formData, sizes: e.target.value })}
                placeholder="1024x1024, 1024x1792, 1792x1024"
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated list of supported output sizes
              </p>
            </div>
          )}

          {formData.modelType === "video" && (
            <div className="grid gap-2">
              <Label htmlFor="durations">Supported Durations (seconds)</Label>
              <Input
                id="durations"
                value={formData.durations}
                onChange={(e) => setFormData({ ...formData, durations: e.target.value })}
                placeholder="5, 10, 15, 20"
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated list of supported video durations in seconds
              </p>
            </div>
          )}

          {formData.modelType === "audio" && (
            <div className="grid gap-2">
              <Label htmlFor="voices">Available Voices</Label>
              <Textarea
                id="voices"
                value={formData.voices}
                onChange={(e) => setFormData({ ...formData, voices: e.target.value })}
                placeholder="alloy, echo, fable, onyx, nova, shimmer"
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated list of available voice options
              </p>
            </div>
          )}

          {formData.modelType !== "audio" &&
            formData.modelType !== "video" &&
            formData.modelType !== "image" && (
              <div className="text-center py-8 text-muted-foreground">
                <p>Select a model type to see capability options</p>
              </div>
            )}
        </div>
      </TabsContent>

      <TabsContent value="apiConfig" className="space-y-4 mt-4">
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="apiEndpoint">API Endpoint</Label>
              <Input
                id="apiEndpoint"
                value={formData.apiEndpoint}
                onChange={(e) => setFormData({ ...formData, apiEndpoint: e.target.value })}
                placeholder="e.g., /api/v1/veo/generate"
              />
              <p className="text-xs text-muted-foreground">
                Full endpoint path from provider API documentation
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="apiPayloadFormat">Payload Format</Label>
              <Input
                id="apiPayloadFormat"
                value={formData.apiPayloadFormat}
                onChange={(e) => setFormData({ ...formData, apiPayloadFormat: e.target.value })}
                placeholder="e.g., veo, market, runway"
              />
              <p className="text-xs text-muted-foreground">
                Payload structure identifier for backend
              </p>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="apiQueryEndpoint">Query Endpoint (Status/Result)</Label>
            <Input
              id="apiQueryEndpoint"
              value={formData.apiQueryEndpoint}
              onChange={(e) => setFormData({ ...formData, apiQueryEndpoint: e.target.value })}
              placeholder="e.g., /api/v1/veo/record-info?taskId={task_id}"
            />
            <p className="text-xs text-muted-foreground">
              Optional per-model endpoint used for Fetch Result. Supports {"{task_id}"} placeholder.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="kieModelId">Kie Model ID</Label>
              <Input
                id="kieModelId"
                value={formData.kieModelId}
                onChange={(e) => setFormData({ ...formData, kieModelId: e.target.value })}
                placeholder="e.g., wan/2-6-text-to-video"
              />
              <p className="text-xs text-muted-foreground">
                Model identifier sent to Kie AI API
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="generateType">Generate Type</Label>
              <Input
                id="generateType"
                value={formData.generateType}
                onChange={(e) => setFormData({ ...formData, generateType: e.target.value })}
                placeholder="e.g., text-to-video, image-to-video"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="maxPromptLength">Max Prompt Length</Label>
              <Input
                id="maxPromptLength"
                type="number"
                value={formData.maxPromptLength}
                onChange={(e) => setFormData({ ...formData, maxPromptLength: parseInt(e.target.value) || 2000 })}
                placeholder="2000"
              />
              <p className="text-xs text-muted-foreground">
                Maximum characters allowed for prompts. Shows warning in Media Studio when exceeded.
              </p>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="pricingFormula">Pricing Formula</Label>
            <Select
              value={formData.pricingFormula}
              onValueChange={(value) => setFormData({ ...formData, pricingFormula: value })}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="flat">Flat (single price or by resolution)</SelectItem>
                <SelectItem value="per_duration">Per Duration (5s, 10s...)</SelectItem>
                <SelectItem value="matrix">Matrix (resolution x duration)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="pricingTiersJson">
              Pricing Tiers (JSON)
            </Label>
            <Textarea
              id="pricingTiersJson"
              value={formData.pricingTiersJson}
              onChange={(e) => setFormData({ ...formData, pricingTiersJson: e.target.value })}
              placeholder='{"720p-5s": 350, "1080p-10s": 1050}'
              rows={4}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Tier key → credit cost. Keys depend on pricing formula (e.g., "720p-5s" for matrix, "5s" for per_duration, "default" for flat).
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="inputFieldsJson">
              Input Fields (JSON)
            </Label>
            <Textarea
              id="inputFieldsJson"
              value={formData.inputFieldsJson}
              onChange={(e) => setFormData({ ...formData, inputFieldsJson: e.target.value })}
              placeholder='[{"key":"duration","label":"Duration","type":"select","options":[{"value":"5","label":"5s"}],"default":"5","affectsPricing":true}]'
              rows={8}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Defines dynamic UI controls in Media Studio. Each field: key, label, type (select/boolean/number/text/image_urls), options, default, affectsPricing.
            </p>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}
