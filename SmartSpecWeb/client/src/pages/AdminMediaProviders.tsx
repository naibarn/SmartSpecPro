import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "../lib/trpc";
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
  Settings,
  Key,
  Check,
  X,
  Plus,
  Pencil,
  Trash2,
  TestTube,
  Loader2,
  Image,
  Video,
  Music,
  Layers,
  DollarSign,
  Copy,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronLeft,
  Sparkles,
  Star,
  Zap,
} from "lucide-react";

interface ModelVersion {
  id: string;
  name: string;
  type: "image" | "video" | "audio";
  description?: string;
  pricing?: {
    perGeneration?: number;
    perSecond?: number;
    perMinute?: number;
  };
}

interface Provider {
  id: number;
  providerName: string;
  displayName: string;
  description: string | null;
  providerType: "image" | "video" | "audio" | "multimodal";
  baseUrl: string | null;
  hasApiKey: boolean;
  defaultModel: string | null;
  availableModels: ModelVersion[] | null;
  configJson: Record<string, any> | null;
  isEnabled: boolean;
  isPrimary: boolean;
  priority: number;
  sortOrder: number;
  lastTestedAt: string | null;
  lastTestResult: {
    success: boolean;
    message: string;
    latencyMs?: number;
    balance?: number;
  } | null;
}

interface ProviderTemplate {
  providerName: string;
  displayName: string;
  description: string;
  providerType: "image" | "video" | "audio" | "multimodal";
  baseUrl: string;
  defaultModel: string;
  availableModels?: ModelVersion[];
}

export default function AdminMediaProviders() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ProviderTemplate | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Provider | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; success: boolean; message: string } | null>(null);
  const [activeTab, setActiveTab] = useState("settings");

  // Model editing state
  const [editingModels, setEditingModels] = useState<ModelVersion[]>([]);
  const [newModel, setNewModel] = useState<ModelVersion>({ id: "", name: "", type: "image" });
  const [deleteModelConfirm, setDeleteModelConfirm] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    displayName: "",
    description: "",
    providerType: "multimodal" as "image" | "video" | "audio" | "multimodal",
    baseUrl: "",
    apiKey: "",
    defaultModel: "",
    isEnabled: false,
    isPrimary: false,
    priority: 0,
  });

  // Check auth
  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) {
      setLocation("/");
    }
  }, [user, authLoading, setLocation]);

  // Queries using tRPC hooks
  const { data: providers = [], isLoading, refetch } = trpc.mediaProviders.adminList.useQuery(undefined, {
    enabled: !!user && user.role === "admin",
  });

  const { data: templates = [] } = trpc.mediaProviders.templates.useQuery(undefined, {
    enabled: !!user && user.role === "admin",
  });

  const { data: stats } = trpc.mediaProviders.stats.useQuery(undefined, {
    enabled: !!user && user.role === "admin",
  });

  // Mutations
  const createMutation = trpc.mediaProviders.create.useMutation({
    onSuccess: () => {
      refetch();
      setIsCreateDialogOpen(false);
      setSelectedTemplate(null);
      resetForm();
    },
  });

  const updateMutation = trpc.mediaProviders.update.useMutation({
    onSuccess: () => {
      refetch();
      setEditingProvider(null);
      resetForm();
    },
  });

  const deleteMutation = trpc.mediaProviders.delete.useMutation({
    onSuccess: () => {
      refetch();
      setDeleteConfirm(null);
    },
  });

  const testMutation = trpc.mediaProviders.testConnection.useMutation({
    onSuccess: (result, variables) => {
      setTestResult({ id: variables.id, ...result });
      refetch();
    },
  });

  const resetForm = () => {
    setFormData({
      displayName: "",
      description: "",
      providerType: "multimodal",
      baseUrl: "",
      apiKey: "",
      defaultModel: "",
      isEnabled: false,
      isPrimary: false,
      priority: 0,
    });
    setEditingModels([]);
    setActiveTab("settings");
  };

  const handleSelectTemplate = (template: ProviderTemplate) => {
    setSelectedTemplate(template);
    setFormData({
      displayName: template.displayName,
      description: template.description,
      providerType: template.providerType,
      baseUrl: template.baseUrl,
      apiKey: "",
      defaultModel: template.defaultModel,
      isEnabled: false,
      isPrimary: false,
      priority: 0,
    });
    setEditingModels(template.availableModels || []);
  };

  const handleEditProvider = (provider: Provider) => {
    setEditingProvider(provider);
    setFormData({
      displayName: provider.displayName,
      description: provider.description || "",
      providerType: provider.providerType,
      baseUrl: provider.baseUrl || "",
      apiKey: "",
      defaultModel: provider.defaultModel || "",
      isEnabled: provider.isEnabled,
      isPrimary: provider.isPrimary,
      priority: provider.priority,
    });
    setEditingModels(provider.availableModels || []);
    setActiveTab("settings");
  };

  const handleSave = () => {
    if (editingProvider) {
      updateMutation.mutate({
        id: editingProvider.id,
        displayName: formData.displayName,
        description: formData.description || undefined,
        providerType: formData.providerType,
        baseUrl: formData.baseUrl || undefined,
        apiKey: formData.apiKey || undefined,
        defaultModel: formData.defaultModel || undefined,
        availableModels: editingModels.length > 0 ? editingModels : undefined,
        isEnabled: formData.isEnabled,
        isPrimary: formData.isPrimary,
        priority: formData.priority,
      });
    } else if (selectedTemplate) {
      createMutation.mutate({
        providerName: selectedTemplate.providerName,
        displayName: formData.displayName,
        description: formData.description || undefined,
        providerType: formData.providerType,
        baseUrl: formData.baseUrl || undefined,
        apiKey: formData.apiKey || undefined,
        defaultModel: formData.defaultModel || undefined,
        availableModels: editingModels.length > 0 ? editingModels : undefined,
        isEnabled: formData.isEnabled,
        isPrimary: formData.isPrimary,
        priority: formData.priority,
      });
    }
  };

  const handleAddModel = () => {
    if (!newModel.id || !newModel.name) return;
    setEditingModels([...editingModels, { ...newModel }]);
    setNewModel({ id: "", name: "", type: "image" });
  };

  const handleRemoveModel = (modelId: string) => {
    setEditingModels(editingModels.filter(m => m.id !== modelId));
    setDeleteModelConfirm(null);
  };

  const getProviderTypeIcon = (type: string) => {
    switch (type) {
      case "image": return <Image className="h-4 w-4" />;
      case "video": return <Video className="h-4 w-4" />;
      case "audio": return <Music className="h-4 w-4" />;
      case "multimodal": return <Layers className="h-4 w-4" />;
      default: return <Layers className="h-4 w-4" />;
    }
  };

  const getProviderTypeBadgeColor = (type: string) => {
    switch (type) {
      case "image": return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
      case "video": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
      case "audio": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      case "multimodal": return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
      default: return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";
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
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <Button
          variant="ghost"
          className="mb-4"
          onClick={() => setLocation("/dashboard")}
        >
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Sparkles className="h-8 w-8 text-primary" />
              Media Providers
            </h1>
            <p className="text-muted-foreground mt-1">
              Configure API keys for image, video, and audio generation services
            </p>
          </div>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Provider
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Providers</CardTitle>
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
              <CardTitle className="text-sm font-medium">With API Key</CardTitle>
              <Key className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.withApiKey}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Multimodal</CardTitle>
              <Zap className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.byType.multimodal}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Providers List */}
      <Card>
        <CardHeader>
          <CardTitle>Configured Providers</CardTitle>
          <CardDescription>
            Manage your media generation API providers. Primary providers are used first, with fallback to others based on priority.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {providers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No providers configured</p>
              <p className="text-sm">Add your first media provider to get started</p>
              <Button className="mt-4" onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Provider
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>API Key</TableHead>
                  <TableHead>Last Test</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {providers.map((provider) => (
                  <TableRow key={provider.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                          {getProviderTypeIcon(provider.providerType)}
                        </div>
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {provider.displayName}
                            {provider.isPrimary && (
                              <Badge variant="secondary" className="gap-1">
                                <Star className="h-3 w-3" />
                                Primary
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {provider.providerName}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getProviderTypeBadgeColor(provider.providerType)}>
                        {provider.providerType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {provider.isEnabled ? (
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
                    <TableCell>
                      {provider.hasApiKey ? (
                        <Badge variant="outline" className="text-green-600">
                          <Key className="mr-1 h-3 w-3" />
                          Configured
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-600">
                          <Key className="mr-1 h-3 w-3" />
                          Not Set
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {provider.lastTestResult ? (
                        <div className="flex items-center gap-2">
                          {provider.lastTestResult.success ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                          <span className="text-sm">
                            {provider.lastTestResult.latencyMs}ms
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">Never</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => testMutation.mutate({ id: provider.id })}
                          disabled={testMutation.isPending}
                        >
                          {testMutation.isPending && testMutation.variables?.id === provider.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <TestTube className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditProvider(provider as Provider)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteConfirm(provider as Provider)}
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

      {/* Create Provider Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Media Provider</DialogTitle>
            <DialogDescription>
              Select a provider template to configure
            </DialogDescription>
          </DialogHeader>

          {!selectedTemplate ? (
            <div className="grid gap-4 py-4">
              {templates.map((template) => (
                <Card
                  key={template.providerName}
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() => handleSelectTemplate(template)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                          {getProviderTypeIcon(template.providerType)}
                        </div>
                        <div>
                          <CardTitle className="text-lg">{template.displayName}</CardTitle>
                          <Badge className={getProviderTypeBadgeColor(template.providerType)}>
                            {template.providerType}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{template.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <ProviderForm
              formData={formData}
              setFormData={setFormData}
              editingModels={editingModels}
              setEditingModels={setEditingModels}
              newModel={newModel}
              setNewModel={setNewModel}
              deleteModelConfirm={deleteModelConfirm}
              setDeleteModelConfirm={setDeleteModelConfirm}
              handleAddModel={handleAddModel}
              handleRemoveModel={handleRemoveModel}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              isNew={true}
            />
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (selectedTemplate) {
                  setSelectedTemplate(null);
                  resetForm();
                } else {
                  setIsCreateDialogOpen(false);
                }
              }}
            >
              {selectedTemplate ? "Back" : "Cancel"}
            </Button>
            {selectedTemplate && (
              <Button
                onClick={handleSave}
                disabled={createMutation.isPending || !formData.displayName}
              >
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Provider
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Provider Dialog */}
      <Dialog open={!!editingProvider} onOpenChange={(open) => !open && setEditingProvider(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Provider - {editingProvider?.displayName}</DialogTitle>
            <DialogDescription>
              Update provider configuration and API keys
            </DialogDescription>
          </DialogHeader>

          <ProviderForm
            formData={formData}
            setFormData={setFormData}
            editingModels={editingModels}
            setEditingModels={setEditingModels}
            newModel={newModel}
            setNewModel={setNewModel}
            deleteModelConfirm={deleteModelConfirm}
            setDeleteModelConfirm={setDeleteModelConfirm}
            handleAddModel={handleAddModel}
            handleRemoveModel={handleRemoveModel}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            isNew={false}
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingProvider(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending || !formData.displayName}
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
            <AlertDialogTitle>Delete Provider</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteConfirm?.displayName}</strong>?
              This action cannot be undone.
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

      {/* Test Result Toast */}
      {testResult && (
        <div className="fixed bottom-4 right-4 z-50">
          <Card className={testResult.success ? "border-green-500" : "border-red-500"}>
            <CardContent className="flex items-center gap-3 p-4">
              {testResult.success ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500" />
              )}
              <div>
                <p className="font-medium">
                  {testResult.success ? "Connection Successful" : "Connection Failed"}
                </p>
                <p className="text-sm text-muted-foreground">{testResult.message}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setTestResult(null)}>
                <X className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// Provider Form Component
function ProviderForm({
  formData,
  setFormData,
  editingModels,
  setEditingModels,
  newModel,
  setNewModel,
  deleteModelConfirm,
  setDeleteModelConfirm,
  handleAddModel,
  handleRemoveModel,
  activeTab,
  setActiveTab,
  isNew,
}: {
  formData: any;
  setFormData: (data: any) => void;
  editingModels: ModelVersion[];
  setEditingModels: (models: ModelVersion[]) => void;
  newModel: ModelVersion;
  setNewModel: (model: ModelVersion) => void;
  deleteModelConfirm: string | null;
  setDeleteModelConfirm: (id: string | null) => void;
  handleAddModel: () => void;
  handleRemoveModel: (id: string) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isNew: boolean;
}) {
  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="settings">Settings</TabsTrigger>
        <TabsTrigger value="models">Models ({editingModels.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="settings" className="space-y-4 mt-4">
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="displayName">Display Name</Label>
            <Input
              id="displayName"
              value={formData.displayName}
              onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
              placeholder="e.g., Kie AI"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Provider description..."
              rows={2}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="providerType">Provider Type</Label>
            <Select
              value={formData.providerType}
              onValueChange={(value) => setFormData({ ...formData, providerType: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="multimodal">Multimodal (Image + Video + Audio)</SelectItem>
                <SelectItem value="image">Image Only</SelectItem>
                <SelectItem value="video">Video Only</SelectItem>
                <SelectItem value="audio">Audio Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="baseUrl">API Base URL</Label>
            <Input
              id="baseUrl"
              value={formData.baseUrl}
              onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
              placeholder="https://api.example.com/v1"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="apiKey">
              API Key {!isNew && "(leave empty to keep current)"}
            </Label>
            <Input
              id="apiKey"
              type="password"
              value={formData.apiKey}
              onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
              placeholder={isNew ? "Enter your API key" : "••••••••"}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="defaultModel">Default Model</Label>
            <Select
              value={formData.defaultModel}
              onValueChange={(value) => setFormData({ ...formData, defaultModel: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select default model" />
              </SelectTrigger>
              <SelectContent>
                {editingModels.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name} ({model.type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="priority">Priority (lower = higher priority for failover)</Label>
            <Input
              id="priority"
              type="number"
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enabled</Label>
              <p className="text-sm text-muted-foreground">
                Allow this provider to be used for generation
              </p>
            </div>
            <Switch
              checked={formData.isEnabled}
              onCheckedChange={(checked) => setFormData({ ...formData, isEnabled: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Primary Provider</Label>
              <p className="text-sm text-muted-foreground">
                Use as the primary provider for its type
              </p>
            </div>
            <Switch
              checked={formData.isPrimary}
              onCheckedChange={(checked) => setFormData({ ...formData, isPrimary: checked })}
            />
          </div>
        </div>
      </TabsContent>

      <TabsContent value="models" className="mt-4 max-h-[50vh] overflow-y-auto pr-2">
        <div className="space-y-4">
          {/* Add new model */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Add Model</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <Input
                  placeholder="Model ID"
                  value={newModel.id}
                  onChange={(e) => setNewModel({ ...newModel, id: e.target.value })}
                />
                <Input
                  placeholder="Display Name"
                  value={newModel.name}
                  onChange={(e) => setNewModel({ ...newModel, name: e.target.value })}
                />
                <Select
                  value={newModel.type}
                  onValueChange={(value: "image" | "video" | "audio") =>
                    setNewModel({ ...newModel, type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="image">Image</SelectItem>
                    <SelectItem value="video">Video</SelectItem>
                    <SelectItem value="audio">Audio</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Input
                placeholder="Description (optional)"
                value={newModel.description || ""}
                onChange={(e) => setNewModel({ ...newModel, description: e.target.value })}
              />
              <Button onClick={handleAddModel} disabled={!newModel.id || !newModel.name} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Add Model
              </Button>
            </CardContent>
          </Card>

          {/* Models list */}
          <div className="space-y-2">
            {editingModels.map((model) => (
            <Card key={model.id}>
              <CardContent className="flex items-center justify-between p-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded bg-muted">
                    {model.type === "image" && <Image className="h-4 w-4" />}
                    {model.type === "video" && <Video className="h-4 w-4" />}
                    {model.type === "audio" && <Music className="h-4 w-4" />}
                  </div>
                  <div>
                    <p className="font-medium">{model.name}</p>
                    <p className="text-xs text-muted-foreground">{model.id}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{model.type}</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteModelConfirm(model.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          </div>
        </div>

        {/* Delete model confirmation */}
        <AlertDialog
          open={!!deleteModelConfirm}
          onOpenChange={(open) => !open && setDeleteModelConfirm(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Model</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove this model from the provider?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteModelConfirm && handleRemoveModel(deleteModelConfirm)}
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TabsContent>
    </Tabs>
  );
}
