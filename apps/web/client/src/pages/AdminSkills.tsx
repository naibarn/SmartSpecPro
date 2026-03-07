import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Brain,
  Plus,
  Trash2,
  RefreshCw,
  FolderOpen,
  Upload,
  Search,
  Edit,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  Sparkles,
  Image,
  Video,
  Music,
  Code,
  FileText,
  Globe,
  Bot,
  Zap,
  FolderSync,
  Check,
  ChevronsUpDown,
  Lock,
  Clock,
  Users,
  X,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import {
  getAllowedExecutionModesForSkillCategory,
  getMediaModelTypeForSkillCategory,
  getRecommendedExecutionModeForSkillCategory,
  isExecutionModeCompatibleWithSkillCategory,
} from "@shared/skills/skillCategoryMetadata";

// Skill interface matching database schema
interface Skill {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  version: string | null;
  author: string | null;
  icon: string | null;
  tags: string[];
  folderPath: string | null;
  isAutoTrigger: boolean;
  triggerPatterns: string[];
  isEnabled: boolean;
  enabledByDefault: boolean;
  visibleByDefault: boolean;
  creditMultiplier: number;
  priority: number;
  availableModels: string[] | null;
  defaultModel: string | null;
  llmModelId: string | null;
  preferredProviderId: number | null;
  strictProviderPin: boolean;
  systemPrompt: string | null;
  skillContent: string | null;
  knowledgebase: string | null;
  configJson: Record<string, unknown> | null;
  executionMode: "llm-only" | "media-generate" | "enhance-prompt" | "python" | null;
  marketplaceContent?: string | null;
  importSource: string | null;
  importedFromZip: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
  visibility: "private" | "pending_approval" | "public" | "rejected";
  tenantId: string | null;
  approvedBy: number | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  ownerName?: string | null;
}

interface FolderInfo {
  slug: string;
  hasSkillMd: boolean;
  hasPython: boolean;
  hasJs: boolean;
  metadata?: {
    name?: string;
    description?: string;
    category?: string;
    version?: string;
  };
  existsInDb: boolean;
}

// Category icon mapping
const categoryIcons: Record<string, typeof Sparkles> = {
  image_generation: Image,
  image_prompt_generation: Sparkles,
  video_generation: Video,
  video_prompt_generation: Sparkles,
  image_video_generation: Video,
  audio_generation: Music,
  article_generation: FileText,
  sound_effects: Music,
  prompt_enhancement: Sparkles,
  code_assistant: Code,
  document_analysis: FileText,
  web_search: Globe,
  chat_assistant: Bot,
  automation: Zap,
  other: Brain,
};

// Category labels
const categoryLabels: Record<string, string> = {
  image_generation: "Image Generation",
  image_prompt_generation: "Create Prompt for Image Generation",
  video_generation: "Video Generation",
  video_prompt_generation: "Create Prompt for Video Generation",
  image_video_generation: "Image/Video Generation",
  audio_generation: "Audio Generation",
  article_generation: "Article Generation",
  sound_effects: "Sound Effects",
  prompt_enhancement: "Prompt Enhancement",
  code_assistant: "Code Assistant",
  document_analysis: "Document Analysis",
  web_search: "Web Search",
  data_analysis: "Data Analysis",
  translation: "Translation",
  summarization: "Summarization",
  chat_assistant: "Chat Assistant",
  automation: "Automation",
  other: "Other",
};

const executionModeLabels: Record<
  "llm-only" | "media-generate" | "enhance-prompt" | "python",
  string
> = {
  "llm-only": "LLM Only (Custom Skill - uses skill.md as system prompt)",
  "enhance-prompt": "Enhance Prompt (specialized prompt enhancement endpoint)",
  "media-generate": "Media Generate (LLM prompt + media API)",
  python: "Python (runs python/skill.py via subprocess)",
};

function getExecutionModeHelperText(
  category: string,
  executionMode: "llm-only" | "media-generate" | "enhance-prompt" | "python" | null | undefined,
): string {
  if (executionMode === "media-generate") {
    const mediaType = getMediaModelTypeForSkillCategory(category);
    if (mediaType === "audio") {
      return "LLM generates structured audio prompt JSON, then auto-calls the audio API.";
    }
    if (mediaType === "video") {
      return "LLM generates optimized video prompt JSON, then auto-calls the video generation API.";
    }
    return "LLM generates optimized prompt JSON, then auto-calls the media generation API.";
  }
  if (executionMode === "enhance-prompt") {
    return "Uses the specialized prompt-enhancement endpoint for prompt-creation skills.";
  }
  if (executionMode === "python") {
    return "Runs python/skill.py as subprocess. Input: JSON stdin. Output: JSON stdout {success, output}.";
  }
  return "Uses skill.md content as system prompt for LLM (default).";
}

function getMediaModelsForCategory(
  category: string,
  imageModels?: { models?: any[] },
  videoModels?: { models?: any[] },
  audioModels?: { models?: any[] },
): any[] {
  const mediaType = getMediaModelTypeForSkillCategory(category);
  if (mediaType === "image") return imageModels?.models || [];
  if (mediaType === "video") return videoModels?.models || [];
  if (mediaType === "audio") return audioModels?.models || [];
  if (mediaType === "image-video") {
    return [...(imageModels?.models || []), ...(videoModels?.models || [])];
  }
  return [];
}

export default function AdminSkills() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const zipInputRef = useRef<HTMLInputElement>(null);

  // UI state
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false);
  const [isZipDialogOpen, setIsZipDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [showEnabledOnly, setShowEnabledOnly] = useState(false);
  const [activeTab, setActiveTab] = useState("skills");
  const [rejectingSkill, setRejectingSkill] = useState<Skill | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // ZIP import state
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [zipSlug, setZipSlug] = useState("");

  // New skill form state
  const [newSkillData, setNewSkillData] = useState({
    slug: "",
    name: "",
    description: "",
    category: "other",
    version: "1.0.0",
    author: "",
    icon: "sparkles",
    tags: [] as string[],
    isAutoTrigger: false,
    triggerPatterns: [] as string[],
    isEnabled: true,
    enabledByDefault: true,
    visibleByDefault: true,
    creditMultiplier: 1.0,
    priority: 50,
    systemPrompt: "",
    skillContent: "",
    marketplaceContent: "",
    visibility: "private" as "private" | "public",
  });

  // Check auth — any authenticated user can access, not just admins
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!authLoading && !user) {
      setLocation("/");
    }
  }, [user, authLoading, setLocation]);

  // Fetch skills from database
  const { data: skills, isLoading } = trpc.skills.listFromDb.useQuery({
    category: filterCategory !== "all" ? filterCategory : undefined,
    search: searchQuery || undefined,
    enabledOnly: showEnabledOnly || undefined,
  });

  // Fetch categories
  const { data: categories } = trpc.skills.getCategories.useQuery();

  // Fetch vision-capable LLM models for default model selection
  const { data: visionModels } = trpc.skills.getVisionModels.useQuery();
  const { data: llmProvidersData } = trpc.llmProviders.list.useQuery();
  const systemDefaultLlmModel = visionModels?.models?.find((model) => model.isDefault) || visionModels?.models?.[0];
  const systemDefaultLlmLabel = systemDefaultLlmModel
    ? `Use system default (${systemDefaultLlmModel.id})`
    : "Use system default";

  // Fetch media models (image/video/audio) for media-generate skills
  const { data: imageModels } = trpc.mediaModels.list.useQuery({ type: "image" });
  const { data: videoModels } = trpc.mediaModels.list.useQuery({ type: "video" });
  const { data: audioModels } = trpc.mediaModels.list.useQuery({ type: "audio" });

  // Fetch pending skills for admin approval tab
  const { data: pendingSkills } = trpc.skills.listPending.useQuery(undefined, {
    enabled: !!isAdmin,
  });

  // Fetch groups for sharing (used in edit dialog)
  const { data: userGroups } = trpc.groups.list.useQuery(
    { scope: "my_groups" } as any,
    { enabled: !!editingSkill }
  );

  // Fetch shared groups for the currently editing skill
  const { data: sharedGroups } = trpc.skills.getSkillGroups.useQuery(
    { skillId: editingSkill?.id ?? 0 },
    { enabled: !!editingSkill && editingSkill.visibility === "private" }
  );

  // Scan folders
  const { data: folders, refetch: refetchFolders } = trpc.skills.scanFolders.useQuery(undefined, {
    enabled: activeTab === "import",
  });

  // Create skill mutation
  const createMutation = trpc.skills.create.useMutation({
    onSuccess: () => {
      utils.skills.listFromDb.invalidate();
      setIsCreateDialogOpen(false);
      resetNewSkillForm();
      toast({
        title: "Skill Created",
        description: "The skill has been created successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create skill",
        variant: "destructive",
      });
    },
  });

  // Update skill mutation
  const updateMutation = trpc.skills.update.useMutation({
    onSuccess: () => {
      utils.skills.listFromDb.invalidate();
      setEditingSkill(null);
      toast({
        title: "Skill Updated",
        description: "The skill has been updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update skill",
        variant: "destructive",
      });
    },
  });

  // Delete skill mutation
  const deleteMutation = trpc.skills.delete.useMutation({
    onSuccess: () => {
      utils.skills.listFromDb.invalidate();
      toast({
        title: "Skill Deleted",
        description: "The skill has been permanently deleted",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete skill",
        variant: "destructive",
      });
    },
  });

  // Regenerate marketplace content mutation
  const regenerateMarketplaceMutation = trpc.skills.regenerateMarketplaceContent.useMutation({
    onSuccess: (data) => {
      if (editingSkill && data.marketplaceContent) {
        setEditingSkill({ ...editingSkill, marketplaceContent: data.marketplaceContent });
      }
      toast({
        title: "Marketplace Content Regenerated",
        description: "Content has been generated from skill file.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to regenerate",
        variant: "destructive",
      });
    },
  });

  // Import folder mutation
  const importFolderMutation = trpc.skills.importFolder.useMutation({
    onSuccess: (data) => {
      utils.skills.listFromDb.invalidate();
      refetchFolders();
      toast({
        title: "Skill Imported",
        description: `Successfully imported "${data.name}" from folder`,
      });
    },
    onError: (error) => {
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import skill from folder",
        variant: "destructive",
      });
    },
  });

  // Import ZIP mutation
  const importZipMutation = trpc.skills.importZip.useMutation({
    onSuccess: (data: any) => {
      utils.skills.listFromDb.invalidate();
      refetchFolders();
      setIsZipDialogOpen(false);
      setZipFile(null);
      setZipSlug("");
      const formatLabel = data.importFormat === "claude" ? "Claude/OpenCode Skill" : "Custom GPT";
      const extras = [];
      if (data.hasPython) extras.push("Python");
      if (data.hasJs) extras.push("JavaScript");
      if (data.knowledgeFilesCount > 0) extras.push(`${data.knowledgeFilesCount} knowledge files`);
      toast({
        title: `${formatLabel} Imported`,
        description: `Successfully imported "${data.name}"${extras.length > 0 ? ` with ${extras.join(", ")}` : ""}`,
      });
    },
    onError: (error) => {
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import from ZIP",
        variant: "destructive",
      });
    },
  });

  // Approve skill mutation (admin only)
  const approveMutation = trpc.skills.approveSkill.useMutation({
    onSuccess: () => {
      utils.skills.listFromDb.invalidate();
      utils.skills.listPending.invalidate();
      toast({
        title: "Skill Approved",
        description: "The skill is now publicly visible to all users.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to approve skill",
        variant: "destructive",
      });
    },
  });

  // Reject skill mutation (admin only)
  const rejectMutation = trpc.skills.rejectSkill.useMutation({
    onSuccess: () => {
      utils.skills.listFromDb.invalidate();
      utils.skills.listPending.invalidate();
      setRejectingSkill(null);
      setRejectReason("");
      toast({
        title: "Skill Rejected",
        description: "The skill owner has been notified.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reject skill",
        variant: "destructive",
      });
    },
  });

  // Share with groups mutation
  const shareWithGroupsMutation = trpc.skills.shareWithGroups.useMutation({
    onSuccess: () => {
      if (editingSkill) {
        utils.skills.getSkillGroups.invalidate({ skillId: editingSkill.id });
      }
      toast({
        title: "Group Added",
        description: "The skill is now shared with the selected group.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to share with group",
        variant: "destructive",
      });
    },
  });

  // Unshare group mutation
  const unshareGroupMutation = trpc.skills.unshareGroup.useMutation({
    onSuccess: () => {
      if (editingSkill) {
        utils.skills.getSkillGroups.invalidate({ skillId: editingSkill.id });
      }
      toast({
        title: "Group Removed",
        description: "The group no longer has access to this skill.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove group sharing",
        variant: "destructive",
      });
    },
  });

  const resetNewSkillForm = () => {
    setNewSkillData({
      slug: "",
      name: "",
      description: "",
      category: "other",
      version: "1.0.0",
      author: "",
      icon: "sparkles",
      tags: [],
      isAutoTrigger: false,
      triggerPatterns: [],
      isEnabled: true,
      enabledByDefault: true,
      visibleByDefault: true,
      creditMultiplier: 1.0,
      priority: 50,
      systemPrompt: "",
      skillContent: "",
      marketplaceContent: "",
      visibility: "private",
    });
  };

  const handleCreateSkill = () => {
    createMutation.mutate({
      ...newSkillData,
      description: newSkillData.description || undefined,
      author: newSkillData.author || undefined,
      systemPrompt: newSkillData.systemPrompt || undefined,
      skillContent: newSkillData.skillContent || undefined,
      marketplaceContent: newSkillData.marketplaceContent || undefined,
      visibility: newSkillData.visibility,
    });
  };

  const handleUpdateSkill = () => {
    if (!editingSkill) return;
    updateMutation.mutate({
      id: editingSkill.id,
      name: editingSkill.name,
      description: editingSkill.description || undefined,
      category: editingSkill.category,
      version: editingSkill.version || undefined,
      author: editingSkill.author || undefined,
      icon: editingSkill.icon || undefined,
      tags: editingSkill.tags,
      isAutoTrigger: editingSkill.isAutoTrigger,
      triggerPatterns: editingSkill.triggerPatterns,
      isEnabled: editingSkill.isEnabled,
      enabledByDefault: editingSkill.enabledByDefault,
      visibleByDefault: editingSkill.visibleByDefault,
      creditMultiplier: editingSkill.creditMultiplier,
      priority: editingSkill.priority,
      defaultModel: editingSkill.defaultModel,
      llmModelId: editingSkill.llmModelId ?? editingSkill.defaultModel,
      preferredProviderId: editingSkill.preferredProviderId ?? null,
      strictProviderPin: editingSkill.strictProviderPin ?? false,
      executionMode: editingSkill.executionMode || "llm-only",
      systemPrompt: editingSkill.systemPrompt,
      skillContent: editingSkill.skillContent,
      marketplaceContent: editingSkill.marketplaceContent,
      knowledgebase: editingSkill.knowledgebase,
      visibility: (editingSkill.visibility === "rejected" || editingSkill.visibility === "private")
        ? "private"
        : "public" as "private" | "public",
    });
  };

  const handleZipUpload = async () => {
    if (!zipFile || !zipSlug) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string)?.split(",")[1];
      if (base64) {
        importZipMutation.mutate({
          fileName: zipFile.name,
          base64Content: base64,
          slug: zipSlug,
        });
      }
    };
    reader.readAsDataURL(zipFile);
  };

  const getCategoryIcon = (category: string) => {
    const Icon = categoryIcons[category] || Brain;
    return <Icon className="h-4 w-4" />;
  };

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20 px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setLocation("/dashboard")}
        className="text-gray-600 mb-4"
      >
        <ChevronLeft className="w-5 h-5 mr-1" />
        Back to Dashboard
      </Button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Skills Management</h1>
          <p className="text-muted-foreground">
            Manage AI agent skills, import from folders or Custom GPTs
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsZipDialogOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Import ZIP
          </Button>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Skill
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="skills">
            <Brain className="mr-2 h-4 w-4" />
            Skills ({skills?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="import">
            <FolderSync className="mr-2 h-4 w-4" />
            Import Folders
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="pending">
              <Clock className="mr-2 h-4 w-4" />
              Pending Approval
              {pendingSkills && pendingSkills.length > 0 && (
                <Badge className="ml-2" variant="destructive">
                  {pendingSkills.length}
                </Badge>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="skills" className="space-y-6">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Search & Filter
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="search">Search</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="search"
                      placeholder="Name, description..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select value={filterCategory} onValueChange={setFilterCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="All categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories?.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name} ({cat.count})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Status</Label>
                  <div className="flex items-center gap-2 pt-2">
                    <Switch
                      checked={showEnabledOnly}
                      onCheckedChange={setShowEnabledOnly}
                    />
                    <span className="text-sm">Enabled only</span>
                  </div>
                </div>

                <div className="flex items-end">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchQuery("");
                      setFilterCategory("all");
                      setShowEnabledOnly(false);
                    }}
                  >
                    Reset Filters
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Skills List */}
          <Card>
            <CardHeader>
              <CardTitle>Skills Library</CardTitle>
              <CardDescription>
                {skills?.length || 0} skill(s) in database
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Visibility</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Auto-Trigger</TableHead>
                      <TableHead>Credits</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {skills?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center text-muted-foreground">
                          No skills found. Create one or import from folders.
                        </TableCell>
                      </TableRow>
                    ) : (
                      skills?.map((skill) => (
                        <TableRow key={skill.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getCategoryIcon(skill.category)}
                              <div>
                                <div className="font-medium">{skill.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {skill.slug}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {(skill as any).ownerName || "System"}
                            </span>
                          </TableCell>
                          <TableCell>
                            {(skill as any).visibility === "private" && (
                              <Badge variant="outline" className="border-gray-400 text-gray-600">
                                <Lock className="mr-1 h-3 w-3" />
                                Private
                              </Badge>
                            )}
                            {(skill as any).visibility === "pending_approval" && (
                              <Badge variant="outline" className="border-amber-500 text-amber-600 bg-amber-50">
                                <Clock className="mr-1 h-3 w-3" />
                                Pending Approval
                              </Badge>
                            )}
                            {(skill as any).visibility === "public" && (
                              <Badge variant="outline" className="border-green-500 text-green-600 bg-green-50">
                                <Globe className="mr-1 h-3 w-3" />
                                Public
                              </Badge>
                            )}
                            {(skill as any).visibility === "rejected" && (
                              <Badge variant="outline" className="border-red-500 text-red-600 bg-red-50">
                                <XCircle className="mr-1 h-3 w-3" />
                                Rejected
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {categoryLabels[skill.category] || skill.category}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {skill.isAutoTrigger ? (
                              <Badge className="bg-purple-100 text-purple-800">
                                <Zap className="mr-1 h-3 w-3" />
                                Auto
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">Manual</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className={skill.creditMultiplier > 1 ? "text-orange-600 font-medium" : ""}>
                              {skill.creditMultiplier}x
                            </span>
                          </TableCell>
                          <TableCell>{skill.priority}</TableCell>
                          <TableCell>
                            {skill.isEnabled ? (
                              <Badge variant="outline" className="border-green-500 text-green-500">
                                <CheckCircle2 className="mr-1 h-3 w-3" />
                                Enabled
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-red-500 text-red-500">
                                <XCircle className="mr-1 h-3 w-3" />
                                Disabled
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {skill.importSource || "manual"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {(isAdmin || skill.createdBy === Number(user?.id)) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    setEditingSkill((() => {
                                      const normalizedExecutionMode = isExecutionModeCompatibleWithSkillCategory(
                                        skill.category,
                                        (skill as any).executionMode ?? "llm-only",
                                      )
                                        ? ((skill as any).executionMode ?? "llm-only")
                                        : (getRecommendedExecutionModeForSkillCategory(skill.category) || "llm-only");
                                      return {
                                        ...(skill as any),
                                        triggerPatterns: ((skill as any).triggerPatterns || []).map((pattern: any) =>
                                          typeof pattern === "string" ? pattern : pattern?.pattern || ""
                                        ),
                                        executionMode: normalizedExecutionMode,
                                        marketplaceContent: (skill as any).marketplaceContent ?? null,
                                      } as Skill;
                                    })())
                                  }
                                >
                                  <Edit className="h-3 w-3" />
                                </Button>
                              )}
                              {(isAdmin || skill.createdBy === Number(user?.id)) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => deleteMutation.mutate({ id: skill.id })}
                                >
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="import" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5" />
                Skill Folders
              </CardTitle>
              <CardDescription>
                Skill folders found in /skills directory. Import them into the database.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex justify-end mb-4">
                <Button variant="outline" onClick={() => refetchFolders()}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Scan Folders
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Folder</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Has skill.md</TableHead>
                    <TableHead>Has Python</TableHead>
                    <TableHead>Has JS</TableHead>
                    <TableHead>In Database</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(!folders || folders.length === 0) ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        No skill folders found. Create folders in /skills directory.
                      </TableCell>
                    </TableRow>
                  ) : (
                    folders.map((folder) => (
                      <TableRow key={folder.slug}>
                        <TableCell className="font-mono">{folder.slug}</TableCell>
                        <TableCell>
                          {folder.metadata?.name || folder.slug}
                        </TableCell>
                        <TableCell>
                          {folder.hasSkillMd ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell>
                          {folder.hasPython ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell>
                          {folder.hasJs ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell>
                          {folder.existsInDb ? (
                            <Badge variant="outline" className="border-green-500 text-green-500">
                              Imported
                            </Badge>
                          ) : (
                            <Badge variant="outline">Not imported</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {folder.existsInDb ? (
                            <span className="text-muted-foreground text-sm">Already imported</span>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => importFolderMutation.mutate({ slug: folder.slug })}
                              disabled={importFolderMutation.isPending}
                            >
                              <FolderSync className="mr-2 h-3 w-3" />
                              Import
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pending Approval Tab — Admin Only */}
        {isAdmin && (
          <TabsContent value="pending" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Skills Pending Approval
                </CardTitle>
                <CardDescription>
                  Review and approve or reject user-submitted public skills.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(!pendingSkills || pendingSkills.length === 0) ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No skills pending approval.
                        </TableCell>
                      </TableRow>
                    ) : (
                      pendingSkills.map((skill: any) => (
                        <TableRow key={skill.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getCategoryIcon(skill.category)}
                              <div>
                                <div className="font-medium">{skill.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {skill.slug}
                                </div>
                                {skill.description && (
                                  <div className="text-xs text-muted-foreground mt-0.5 max-w-[300px] truncate">
                                    {skill.description}
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {skill.ownerName || "Unknown"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {categoryLabels[skill.category] || skill.category}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {new Date(skill.createdAt).toLocaleDateString()}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-green-600 border-green-300 hover:bg-green-50"
                                onClick={() => approveMutation.mutate({ skillId: skill.id })}
                                disabled={approveMutation.isPending}
                              >
                                <CheckCircle2 className="mr-1 h-3 w-3" />
                                Approve
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-red-600 border-red-300 hover:bg-red-50"
                                onClick={() => setRejectingSkill(skill)}
                              >
                                <XCircle className="mr-1 h-3 w-3" />
                                Reject
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Reject Skill Dialog */}
      <Dialog open={!!rejectingSkill} onOpenChange={() => { setRejectingSkill(null); setRejectReason(""); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Skill</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting "{rejectingSkill?.name}". The skill owner will be notified.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="reject-reason">Rejection Reason *</Label>
              <Textarea
                id="reject-reason"
                placeholder="Please provide a reason for rejection..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectingSkill(null); setRejectReason(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (rejectingSkill && rejectReason.trim()) {
                  rejectMutation.mutate({
                    skillId: rejectingSkill.id,
                    reason: rejectReason.trim(),
                  });
                }
              }}
              disabled={!rejectReason.trim() || rejectMutation.isPending}
            >
              {rejectMutation.isPending ? "Rejecting..." : "Reject Skill"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Skill Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Skill</DialogTitle>
            <DialogDescription>
              Add a new AI agent skill to the database
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="slug">Slug *</Label>
                <Input
                  id="slug"
                  placeholder="my-skill"
                  value={newSkillData.slug}
                  onChange={(e) => {
                    const slug = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-");
                    setNewSkillData({ ...newSkillData, slug });
                  }}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Lowercase letters, numbers, and dashes only
                </p>
              </div>
              <div>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  placeholder="My Skill"
                  value={newSkillData.name}
                  onChange={(e) =>
                    setNewSkillData({ ...newSkillData, name: e.target.value })
                  }
                />
              </div>
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="Brief description of what this skill does"
                value={newSkillData.description}
                onChange={(e) =>
                  setNewSkillData({ ...newSkillData, description: e.target.value })
                }
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label>Category</Label>
                <Select
                  value={newSkillData.category}
                  onValueChange={(value) =>
                    setNewSkillData({ ...newSkillData, category: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(categoryLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="priority">Priority</Label>
                <Input
                  id="priority"
                  type="number"
                  min={0}
                  max={100}
                  value={newSkillData.priority}
                  onChange={(e) =>
                    setNewSkillData({ ...newSkillData, priority: parseInt(e.target.value) || 50 })
                  }
                />
              </div>

              <div>
                <Label htmlFor="creditMultiplier">Credit Multiplier</Label>
                <Input
                  id="creditMultiplier"
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={newSkillData.creditMultiplier}
                  onChange={(e) =>
                    setNewSkillData({ ...newSkillData, creditMultiplier: parseFloat(e.target.value) || 1 })
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Visibility</Label>
              <Select
                value={newSkillData.visibility || "private"}
                onValueChange={(v) =>
                  setNewSkillData({ ...newSkillData, visibility: v as "private" | "public" })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private (only you and shared groups)</SelectItem>
                  <SelectItem value="public">Public (requires admin approval)</SelectItem>
                </SelectContent>
              </Select>
              {newSkillData.visibility === "public" && !isAdmin && (
                <p className="text-xs text-muted-foreground">
                  Public skills require admin approval before becoming visible to all users.
                </p>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="flex items-center gap-2">
                <Switch
                  checked={newSkillData.isAutoTrigger}
                  onCheckedChange={(checked) =>
                    setNewSkillData({ ...newSkillData, isAutoTrigger: checked })
                  }
                />
                <Label>Auto-Trigger</Label>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={newSkillData.isEnabled}
                    onCheckedChange={(checked) =>
                      setNewSkillData({ ...newSkillData, isEnabled: checked })
                    }
                  />
                  <Label>Enabled</Label>
                </div>
                <p className="text-xs text-muted-foreground ml-11">Enable or disable this skill globally. When off, no user can see or use it.</p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={newSkillData.visibleByDefault}
                    onCheckedChange={(checked) =>
                      setNewSkillData({
                        ...newSkillData,
                        visibleByDefault: checked,
                        ...(!checked && { enabledByDefault: false }),
                      })
                    }
                  />
                  <Label>Visible by Default</Label>
                </div>
                <p className="text-xs text-muted-foreground ml-11">New users will see this skill in their list automatically.</p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={newSkillData.enabledByDefault}
                    onCheckedChange={(checked) =>
                      setNewSkillData({ ...newSkillData, enabledByDefault: checked })
                    }
                    disabled={!newSkillData.visibleByDefault}
                  />
                  <Label className={!newSkillData.visibleByDefault ? "text-muted-foreground" : ""}>Enabled by Default</Label>
                </div>
                <p className="text-xs text-muted-foreground ml-11">Auto-trigger in new conversations. Requires Visible by Default.</p>
              </div>
            </div>

            <div>
              <Label htmlFor="systemPrompt">System Prompt</Label>
              <Textarea
                id="systemPrompt"
                placeholder="The system prompt for this skill..."
                value={newSkillData.systemPrompt}
                onChange={(e) =>
                  setNewSkillData({ ...newSkillData, systemPrompt: e.target.value })
                }
                rows={4}
                className="font-mono text-sm"
              />
            </div>

            <div>
              <Label htmlFor="skillContent">Skill Content (Markdown)</Label>
              <Textarea
                id="skillContent"
                placeholder="# Skill Instructions&#10;&#10;..."
                value={newSkillData.skillContent}
                onChange={(e) =>
                  setNewSkillData({ ...newSkillData, skillContent: e.target.value })
                }
                rows={6}
                className="font-mono text-sm"
              />
            </div>

            <div>
              <Label htmlFor="marketplaceContent">Marketplace Content (Public)</Label>
              <p className="text-xs text-muted-foreground mb-1">Curated documentation shown on the Marketplace page. Does not expose internal skill details.</p>
              <Textarea
                id="marketplaceContent"
                placeholder={"## Overview\nBrief description of what this skill does.\n\n### Key Features\n- Feature 1\n- Feature 2\n\n## Quick Start\nHow to use this skill.\n\n## Input\nWhat the skill expects.\n\n## Output\nWhat the skill produces."}
                value={newSkillData.marketplaceContent}
                onChange={(e) =>
                  setNewSkillData({ ...newSkillData, marketplaceContent: e.target.value })
                }
                rows={8}
                className="font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateSkill}
              disabled={!newSkillData.slug || !newSkillData.name || createMutation.isPending}
            >
              {createMutation.isPending ? "Creating..." : "Create Skill"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Skill Dialog */}
      {editingSkill && (
        <Dialog open={!!editingSkill} onOpenChange={() => setEditingSkill(null)}>
          <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Skill</DialogTitle>
              <DialogDescription>
                Update skill configuration for "{editingSkill.slug}"
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Slug</Label>
                  <Input value={editingSkill.slug} disabled className="bg-muted" />
                </div>
                <div>
                  <Label htmlFor="edit-name">Name</Label>
                  <Input
                    id="edit-name"
                    value={editingSkill.name}
                    onChange={(e) =>
                      setEditingSkill({ ...editingSkill, name: e.target.value })
                    }
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="edit-description">Description</Label>
                <Input
                  id="edit-description"
                  value={editingSkill.description || ""}
                  onChange={(e) =>
                    setEditingSkill({ ...editingSkill, description: e.target.value })
                  }
                />
              </div>

              {/* Visibility Selector */}
              <div className="space-y-2">
                <Label>Visibility</Label>
                <Select
                  value={editingSkill.visibility === "pending_approval" ? "public" : editingSkill.visibility === "rejected" ? "private" : editingSkill.visibility}
                  onValueChange={(v) =>
                    setEditingSkill({ ...editingSkill, visibility: v as any })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">Private (only you and shared groups)</SelectItem>
                    <SelectItem value="public">Public (requires admin approval)</SelectItem>
                  </SelectContent>
                </Select>
                {editingSkill.visibility === "public" && !isAdmin && (
                  <p className="text-xs text-muted-foreground">
                    Public skills require admin approval before becoming visible to all users.
                  </p>
                )}
                {editingSkill.visibility === "pending_approval" && (
                  <p className="text-xs text-amber-600">
                    This skill is currently awaiting admin approval.
                  </p>
                )}
              </div>

              {/* Rejection Reason */}
              {editingSkill.visibility === "rejected" && editingSkill.rejectionReason && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
                  <strong>Rejection reason:</strong> {editingSkill.rejectionReason}
                </div>
              )}

              {/* Group Sharing Section — only shown for private skills */}
              {editingSkill.visibility === "private" && (
                <div className="space-y-3 border rounded-lg p-4">
                  <Label className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Shared with Groups
                  </Label>
                  {/* Currently shared groups */}
                  <div className="flex flex-wrap gap-2">
                    {sharedGroups && sharedGroups.length > 0 ? (
                      sharedGroups.map((group: any) => (
                        <Badge
                          key={group.id}
                          variant="secondary"
                          className="flex items-center gap-1 pl-3 pr-1 py-1"
                        >
                          <span>{group.name}</span>
                          <span className="text-xs text-muted-foreground ml-1">
                            ({group.memberCount} members)
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0 ml-1 hover:bg-destructive/20 rounded-full"
                            onClick={() =>
                              unshareGroupMutation.mutate({
                                skillId: editingSkill.id,
                                groupId: group.id,
                              })
                            }
                            disabled={unshareGroupMutation.isPending}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </Badge>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground italic">
                        Not shared with any groups yet.
                      </p>
                    )}
                  </div>
                  {/* Add group selector */}
                  {userGroups && userGroups.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Select
                        onValueChange={(groupId) => {
                          shareWithGroupsMutation.mutate({
                            skillId: editingSkill.id,
                            groupIds: [parseInt(groupId)],
                          });
                        }}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Add a group..." />
                        </SelectTrigger>
                        <SelectContent>
                          {(userGroups as any[])
                            .filter(
                              (g: any) =>
                                !sharedGroups?.some(
                                  (sg: any) => sg.id === g.id
                                )
                            )
                            .map((group: any) => (
                              <SelectItem
                                key={group.id}
                                value={String(group.id)}
                              >
                                {group.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Label>Category</Label>
                <Select
                  value={editingSkill.category}
                  onValueChange={(value) => {
                    const nextExecutionMode = isExecutionModeCompatibleWithSkillCategory(
                      value,
                      editingSkill.executionMode,
                    )
                      ? (editingSkill.executionMode || getRecommendedExecutionModeForSkillCategory(value) || "llm-only")
                      : (getRecommendedExecutionModeForSkillCategory(value) || "llm-only");
                    setEditingSkill({
                      ...editingSkill,
                      category: value,
                      executionMode: nextExecutionMode,
                      defaultModel: null,
                      llmModelId: null,
                      preferredProviderId: null,
                      strictProviderPin: false,
                    });
                  }}
                >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(categoryLabels).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="edit-priority">Priority</Label>
                  <Input
                    id="edit-priority"
                    type="number"
                    min={0}
                    max={100}
                    value={editingSkill.priority}
                    onChange={(e) =>
                      setEditingSkill({ ...editingSkill, priority: parseInt(e.target.value) || 50 })
                    }
                  />
                </div>

                <div>
                  <Label htmlFor="edit-creditMultiplier">Credit Multiplier</Label>
                  <Input
                    id="edit-creditMultiplier"
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={editingSkill.creditMultiplier}
                    onChange={(e) =>
                      setEditingSkill({ ...editingSkill, creditMultiplier: parseFloat(e.target.value) || 1 })
                    }
                  />
                </div>
              </div>

              {/* Execution Mode */}
              <div className="space-y-2">
                <Label>Execution Mode</Label>
                <Select
                  value={editingSkill.executionMode || "llm-only"}
                  onValueChange={(value) =>
                    setEditingSkill({
                      ...editingSkill,
                      executionMode: value as "llm-only" | "media-generate" | "enhance-prompt" | "python",
                      defaultModel: null,
                      llmModelId: null,
                      preferredProviderId: null,
                      strictProviderPin: false,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getAllowedExecutionModesForSkillCategory(editingSkill.category).map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {executionModeLabels[mode]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {getExecutionModeHelperText(editingSkill.category, editingSkill.executionMode)}
                </p>
              </div>

              {/* Default Model — show media models for media-generate, LLM models for llm-only */}
              <div className="space-y-2 pt-2 border-t">
                {editingSkill.executionMode === "media-generate" ? (
                  <>
                    <Label className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-orange-500" />
                      Default Media Model
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                          {editingSkill.defaultModel
                            ? (() => {
                                const models = getMediaModelsForCategory(
                                  editingSkill.category,
                                  imageModels,
                                  videoModels,
                                  audioModels,
                                );
                                const found = models?.find((m: any) => m.modelId === editingSkill.defaultModel);
                                return found ? `${found.name} (${found.provider})` : editingSkill.defaultModel;
                              })()
                            : <span className="text-muted-foreground">Auto (highest priority model)</span>}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[450px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search media models..." />
                          <CommandList className="max-h-[300px] overflow-y-auto">
                            <CommandEmpty>No model found.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                value="__auto__"
                                onSelect={() => setEditingSkill({ ...editingSkill, defaultModel: null })}
                              >
                                <Check className={`mr-2 h-4 w-4 ${!editingSkill.defaultModel ? "opacity-100" : "opacity-0"}`} />
                                <span className="text-muted-foreground">Auto (highest priority model)</span>
                              </CommandItem>
                              {getMediaModelsForCategory(
                                editingSkill.category,
                                imageModels,
                                videoModels,
                                audioModels,
                              )?.map((model: any) => (
                                <CommandItem
                                  key={model.modelId}
                                  value={`${model.name} ${model.modelId} ${model.provider}`}
                                  onSelect={() => setEditingSkill({ ...editingSkill, defaultModel: model.modelId })}
                                >
                                  <Check className={`mr-2 h-4 w-4 ${editingSkill.defaultModel === model.modelId ? "opacity-100" : "opacity-0"}`} />
                                  <span>{model.name}</span>
                                  <span className="ml-1 text-xs text-muted-foreground">({model.provider})</span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <p className="text-xs text-muted-foreground">
                      The media generation model used when this skill creates media output.
                    </p>
                  </>
                ) : (
                  <>
                    <Label className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-purple-500" />
                      Default LLM Model (Auto Prompt)
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                          {(editingSkill.llmModelId || editingSkill.defaultModel)
                            ? (() => {
                                const selectedModel = editingSkill.llmModelId || editingSkill.defaultModel;
                                const found = visionModels?.models?.find((m) => m.id === selectedModel);
                                return found ? `${found.name} (${found.providerDisplayName})` : selectedModel;
                              })()
                            : <span className="text-muted-foreground">{systemDefaultLlmLabel}</span>}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[450px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search LLM models..." />
                          <CommandList className="max-h-[300px] overflow-y-auto">
                            <CommandEmpty>No model found.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                value="__system_default__"
                                onSelect={() => setEditingSkill({ ...editingSkill, defaultModel: null, llmModelId: null })}
                              >
                                <Check className={`mr-2 h-4 w-4 ${!(editingSkill.llmModelId || editingSkill.defaultModel) ? "opacity-100" : "opacity-0"}`} />
                                <span className="text-muted-foreground">{systemDefaultLlmLabel}</span>
                              </CommandItem>
                              {visionModels?.models?.map((model) => (
                                <CommandItem
                                  key={model.id}
                                  value={`${model.name} ${model.id} ${model.providerDisplayName}`}
                                  onSelect={() => setEditingSkill({ ...editingSkill, defaultModel: model.id, llmModelId: model.id })}
                                >
                                  <Check className={`mr-2 h-4 w-4 ${(editingSkill.llmModelId || editingSkill.defaultModel) === model.id ? "opacity-100" : "opacity-0"}`} />
                                  <span>{model.name}</span>
                                  <span className="ml-1 text-xs text-muted-foreground">({model.providerDisplayName})</span>
                                  {model.isDefault && (
                                    <Badge variant="secondary" className="ml-1 text-[10px] h-4">default</Badge>
                                  )}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <p className="text-xs text-muted-foreground">
                      The LLM model used for Auto Prompt in Media Studio. Users can override in Advanced Mode.
                    </p>

                    <div className="mt-3 space-y-2 rounded-md border p-3">
                      <Label>Preferred LLM Provider (optional)</Label>
                      <Select
                        value={editingSkill.preferredProviderId ? String(editingSkill.preferredProviderId) : "__auto__"}
                        onValueChange={(value) =>
                          setEditingSkill({
                            ...editingSkill,
                            preferredProviderId: value === "__auto__" ? null : Number(value),
                            ...(value === "__auto__" ? { strictProviderPin: false } : {}),
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Auto route (no provider pin)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__auto__">Auto route (no provider pin)</SelectItem>
                          {(llmProvidersData || []).map((provider: { id: number; displayName: string; providerName: string }) => (
                            <SelectItem key={provider.id} value={String(provider.id)}>
                              {provider.displayName} ({provider.providerName})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <div className="flex items-center justify-between pt-1">
                        <div>
                          <Label className="text-sm">Strict Provider Pin</Label>
                          <p className="text-xs text-muted-foreground">
                            If enabled, this skill will fail instead of falling back to another provider.
                          </p>
                        </div>
                        <Switch
                          checked={editingSkill.strictProviderPin}
                          onCheckedChange={(checked) =>
                            setEditingSkill({ ...editingSkill, strictProviderPin: checked })
                          }
                          disabled={!editingSkill.preferredProviderId}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2 rounded-lg border border-border/80 dark:border-border bg-muted/30 dark:bg-muted/20 p-4">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={editingSkill.isAutoTrigger}
                    onCheckedChange={(checked) =>
                      setEditingSkill({ ...editingSkill, isAutoTrigger: checked })
                    }
                  />
                  <div>
                    <Label className="text-sm font-medium">Auto-Trigger</Label>
                    <p className="text-xs text-muted-foreground">Automatically activate on matching messages.</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Switch
                    checked={editingSkill.isEnabled}
                    onCheckedChange={(checked) =>
                      setEditingSkill({ ...editingSkill, isEnabled: checked })
                    }
                  />
                  <div>
                    <Label className="text-sm font-medium">Enabled</Label>
                    <p className="text-xs text-muted-foreground">Enable or disable this skill globally.</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Switch
                    checked={editingSkill.visibleByDefault}
                    onCheckedChange={(checked) =>
                      setEditingSkill({
                        ...editingSkill,
                        visibleByDefault: checked,
                        ...(!checked && { enabledByDefault: false }),
                      })
                    }
                  />
                  <div>
                    <Label className="text-sm font-medium">Visible by Default</Label>
                    <p className="text-xs text-muted-foreground">New users see this skill automatically.</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Switch
                    checked={editingSkill.enabledByDefault}
                    onCheckedChange={(checked) =>
                      setEditingSkill({ ...editingSkill, enabledByDefault: checked })
                    }
                    disabled={!editingSkill.visibleByDefault}
                  />
                  <div>
                    <Label className={`text-sm font-medium ${!editingSkill.visibleByDefault ? "text-muted-foreground" : ""}`}>Enabled by Default</Label>
                    <p className="text-xs text-muted-foreground">Auto-trigger in new conversations. Requires Visible.</p>
                  </div>
                </div>
              </div>

              {/* Trigger Patterns */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Trigger Patterns (Regex)</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs dark:border-muted-foreground/40 dark:text-foreground"
                    onClick={() =>
                      setEditingSkill({
                        ...editingSkill,
                        triggerPatterns: [...editingSkill.triggerPatterns, ""],
                      })
                    }
                  >
                    + Add Pattern
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Each pattern is a case-insensitive regex. Use <code className="bg-muted px-1 rounded">|</code> for alternatives.
                  e.g. <code className="bg-muted px-1 rounded">สร้างพรอมต์|enhance prompt|image prompt</code>
                </p>
                {editingSkill.triggerPatterns.length === 0 && (
                  <p className="text-xs text-muted-foreground italic py-2">No trigger patterns defined. Add patterns for auto-trigger to work.</p>
                )}
                <div className="space-y-2">
                  {editingSkill.triggerPatterns.map((pattern, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        value={pattern}
                        onChange={(e) => {
                          const updated = [...editingSkill.triggerPatterns];
                          updated[idx] = e.target.value;
                          setEditingSkill({ ...editingSkill, triggerPatterns: updated });
                        }}
                        placeholder="regex pattern, e.g. สร้างพรอมต์|enhance prompt"
                        className="font-mono text-sm"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0 text-destructive hover:text-destructive"
                        onClick={() => {
                          const updated = editingSkill.triggerPatterns.filter((_, i) => i !== idx);
                          setEditingSkill({ ...editingSkill, triggerPatterns: updated });
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label htmlFor="edit-systemPrompt">System Prompt</Label>
                <Textarea
                  id="edit-systemPrompt"
                  value={editingSkill.systemPrompt || ""}
                  onChange={(e) =>
                    setEditingSkill({ ...editingSkill, systemPrompt: e.target.value })
                  }
                  rows={4}
                  className="font-mono text-sm"
                />
              </div>

              <div>
                <Label htmlFor="edit-skillContent">Skill Content (Markdown)</Label>
                <Textarea
                  id="edit-skillContent"
                  value={editingSkill.skillContent || ""}
                  onChange={(e) =>
                    setEditingSkill({ ...editingSkill, skillContent: e.target.value })
                  }
                  rows={6}
                  className="font-mono text-sm"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="edit-marketplaceContent">Marketplace Content (Public)</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="dark:border-muted-foreground/40 dark:text-foreground"
                    onClick={() => editingSkill && regenerateMarketplaceMutation.mutate({ id: editingSkill.id })}
                    disabled={regenerateMarketplaceMutation.isPending}
                  >
                    {regenerateMarketplaceMutation.isPending ? "Generating..." : "Regenerate from Skill Content"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mb-1">Curated documentation shown on the Marketplace page. Does not expose internal skill details.</p>
                <Textarea
                  id="edit-marketplaceContent"
                  placeholder={"## Overview\nBrief description of what this skill does.\n\n### Key Features\n- Feature 1\n- Feature 2\n\n## Quick Start\nHow to use this skill.\n\n## Input\nWhat the skill expects.\n\n## Output\nWhat the skill produces."}
                  value={editingSkill.marketplaceContent || ""}
                  onChange={(e) =>
                    setEditingSkill({ ...editingSkill, marketplaceContent: e.target.value })
                  }
                  rows={8}
                  className="font-mono text-sm"
                />
              </div>

              {editingSkill.knowledgebase && (
                <div>
                  <Label>Knowledgebase</Label>
                  <Textarea
                    value={editingSkill.knowledgebase}
                    onChange={(e) =>
                      setEditingSkill({ ...editingSkill, knowledgebase: e.target.value })
                    }
                    rows={4}
                    className="font-mono text-sm"
                  />
                </div>
              )}

              {editingSkill.folderPath && (
                <div>
                  <Label>Folder Path</Label>
                  <Input value={editingSkill.folderPath} disabled className="bg-muted" />
                </div>
              )}
            </div>
            <DialogFooter className="border-t pt-4">
              <Button variant="outline" onClick={() => setEditingSkill(null)} className="dark:border-muted-foreground/40 dark:text-foreground dark:hover:bg-muted">
                Cancel
              </Button>
              <Button
                onClick={handleUpdateSkill}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Import ZIP Dialog */}
      <Dialog open={isZipDialogOpen} onOpenChange={setIsZipDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Skill from ZIP</DialogTitle>
            <DialogDescription className="space-y-2">
              <span className="block">Supports two formats:</span>
              <span className="block text-xs">
                <strong>1. Claude/OpenCode:</strong> ZIP with skill.md, python/, js/ folders
              </span>
              <span className="block text-xs">
                <strong>2. Custom GPT:</strong> ZIP with system prompt + knowledge files
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="zipSlug">Skill Slug *</Label>
              <Input
                id="zipSlug"
                placeholder="my-custom-gpt"
                value={zipSlug}
                onChange={(e) => {
                  const slug = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-");
                  setZipSlug(slug);
                }}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Unique identifier for this skill
              </p>
            </div>

            <div>
              <Label>ZIP File *</Label>
              <div className="mt-2">
                <input
                  ref={zipInputRef}
                  type="file"
                  accept=".zip"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setZipFile(file);
                  }}
                />
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => zipInputRef.current?.click()}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {zipFile ? zipFile.name : "Select ZIP file"}
                </Button>
              </div>
            </div>

            {zipFile && (
              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm">
                  <span className="font-medium">File:</span> {zipFile.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium">Size:</span> {(zipFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsZipDialogOpen(false);
              setZipFile(null);
              setZipSlug("");
            }}>
              Cancel
            </Button>
            <Button
              onClick={handleZipUpload}
              disabled={!zipFile || !zipSlug || importZipMutation.isPending}
            >
              {importZipMutation.isPending ? "Importing..." : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
