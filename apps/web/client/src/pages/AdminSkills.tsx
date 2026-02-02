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
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";

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
  systemPrompt: string | null;
  skillContent: string | null;
  knowledgebase: string | null;
  configJson: Record<string, unknown> | null;
  executionMode: string | null;
  importSource: string | null;
  importedFromZip: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
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
  video_generation: Video,
  audio_generation: Music,
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
  video_generation: "Video Generation",
  audio_generation: "Audio Generation",
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
  });

  // Check auth
  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) {
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

  // Fetch media models (image/video/audio) for media-generate skills
  const { data: imageModels } = trpc.mediaModels.list.useQuery({ type: "image" });
  const { data: videoModels } = trpc.mediaModels.list.useQuery({ type: "video" });

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
      executionMode: editingSkill.executionMode || "llm-only",
      systemPrompt: editingSkill.systemPrompt,
      skillContent: editingSkill.skillContent,
      marketplaceContent: editingSkill.marketplaceContent,
      knowledgebase: editingSkill.knowledgebase,
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

  if (authLoading || !user || user.role !== "admin") {
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
                        <TableCell colSpan={8} className="text-center text-muted-foreground">
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
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditingSkill(skill)}
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteMutation.mutate({ id: skill.id })}
                              >
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
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
      </Tabs>

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

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Label>Category</Label>
                  <Select
                    value={editingSkill.category}
                    onValueChange={(value) =>
                      setEditingSkill({ ...editingSkill, category: value })
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
                    setEditingSkill({ ...editingSkill, executionMode: value, defaultModel: null })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="llm-only">LLM Only (text response)</SelectItem>
                    <SelectItem value="media-generate">Media Generate (LLM prompt + media API)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {editingSkill.executionMode === "media-generate"
                    ? "LLM generates optimized prompt JSON, then auto-calls media generation API."
                    : "LLM generates text response only (default)."}
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
                                const models = editingSkill.category === "image_generation" ? imageModels?.models : videoModels?.models;
                                const found = models?.find((m: any) => m.modelId === editingSkill.defaultModel);
                                return found ? `${found.name} (${found.provider})` : editingSkill.defaultModel;
                              })()
                            : <span className="text-muted-foreground">Auto (highest priority model)</span>}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[400px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search models..." />
                          <CommandList className="max-h-[200px] overflow-y-auto">
                            <CommandEmpty>No model found.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                value="__auto__"
                                onSelect={() => setEditingSkill({ ...editingSkill, defaultModel: null })}
                              >
                                <Check className={`mr-2 h-4 w-4 ${!editingSkill.defaultModel ? "opacity-100" : "opacity-0"}`} />
                                <span className="text-muted-foreground">Auto (highest priority model)</span>
                              </CommandItem>
                              {(editingSkill.category === "image_generation" ? imageModels?.models : videoModels?.models)?.map((model: any) => (
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
                      The media generation model used when this skill creates images/videos.
                    </p>
                  </>
                ) : (
                  <>
                    <Label className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-purple-500" />
                      Default LLM Model (Auto Prompt)
                    </Label>
                    <Select
                      value={editingSkill.defaultModel || "__system_default__"}
                      onValueChange={(value) =>
                        setEditingSkill({ ...editingSkill, defaultModel: value === "__system_default__" ? null : value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select default model..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__system_default__">
                          <span className="text-muted-foreground">Use system default (openai/gpt-4o)</span>
                        </SelectItem>
                        {visionModels?.models?.map((model) => (
                          <SelectItem key={model.id} value={model.id}>
                            <div className="flex items-center gap-2">
                              <span>{model.name}</span>
                              <span className="text-xs text-muted-foreground">
                                ({model.providerDisplayName})
                              </span>
                              {model.isDefault && (
                                <Badge variant="secondary" className="text-[10px] h-4">
                                  provider default
                                </Badge>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      The LLM model used for Auto Prompt in Media Studio. Users can override in Advanced Mode.
                    </p>
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
