import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  Settings,
  Key,
  Check,
  X,
  Plus,
  Pencil,
  Trash2,
  TestTube,
  Loader2,
  Server,
  Zap,
  Globe,
  Bot,
  Cpu,
  Layers,
  DollarSign,
  Copy,
  GripVertical,
  RefreshCw,
  Download,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";

interface ModelVersion {
  id: string;
  name: string;
  contextLength?: number;
  pricing?: {
    input: number;
    output: number;
  };
}

interface Provider {
  id: number;
  providerName: string;
  displayName: string;
  description: string | null;
  baseUrl: string | null;
  hasApiKey: boolean;
  defaultModel: string | null;
  availableModels: ModelVersion[] | null;
  configJson: Record<string, any> | null;
  isEnabled: boolean;
  sortOrder: number;
}

interface ProviderTemplate {
  providerName: string;
  displayName: string;
  description: string;
  baseUrl: string;
  defaultModel: string;
}

export default function AdminLLMProviders() {
  const queryClient = useQueryClient();
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ProviderTemplate | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Provider | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; success: boolean; message: string } | null>(null);
  const [activeTab, setActiveTab] = useState("settings");
  const [syncResult, setSyncResult] = useState<any>(null);
  const [isBrowseDialogOpen, setIsBrowseDialogOpen] = useState(false);
  const [browseSearch, setBrowseSearch] = useState("");
  const [browseProvider, setBrowseProvider] = useState("");
  const [selectedModelsToImport, setSelectedModelsToImport] = useState<string[]>([]);
  
  // Model editing state
  const [editingModels, setEditingModels] = useState<ModelVersion[]>([]);
  const [newModel, setNewModel] = useState<ModelVersion>({ id: "", name: "" });
  const [deleteModelConfirm, setDeleteModelConfirm] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    displayName: "",
    description: "",
    baseUrl: "",
    apiKey: "",
    defaultModel: "",
    isEnabled: false,
  });

  // Queries
  const { data: providers = [], isLoading } = useQuery({
    queryKey: ["llmProviders", "adminList"],
    queryFn: () => trpc.llmProviders.adminList.query(),
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["llmProviders", "templates"],
    queryFn: () => trpc.llmProviders.templates.query(),
  });

  const { data: stats } = useQuery({
    queryKey: ["llmProviders", "stats"],
    queryFn: () => trpc.llmProviders.stats.query(),
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: any) => trpc.llmProviders.create.mutate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["llmProviders"] });
      setIsCreateDialogOpen(false);
      setSelectedTemplate(null);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => trpc.llmProviders.update.mutate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["llmProviders"] });
      setEditingProvider(null);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => trpc.llmProviders.delete.mutate({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["llmProviders"] });
      setDeleteConfirm(null);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: number) => trpc.llmProviders.toggleEnabled.mutate({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["llmProviders"] });
    },
  });

  const testMutation = useMutation({
    mutationFn: (id: number) => trpc.llmProviders.testConnection.mutate({ id }),
    onSuccess: (result, id) => {
      setTestResult({ id, success: result.success, message: result.message });
      setTimeout(() => setTestResult(null), 5000);
    },
    onError: (error, id) => {
      setTestResult({ id, success: false, message: error.message });
      setTimeout(() => setTestResult(null), 5000);
    },
  });

  // Sync mutations
  const syncProviderMutation = useMutation({
    mutationFn: (id: number) => trpc.llmProviders.syncProvider.mutate({ id }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["llmProviders"] });
      setSyncResult(result);
      setTimeout(() => setSyncResult(null), 10000);
    },
    onError: (error) => {
      setSyncResult({ success: false, error: error.message });
      setTimeout(() => setSyncResult(null), 10000);
    },
  });

  const syncAllMutation = useMutation({
    mutationFn: () => trpc.llmProviders.syncAll.mutate(),
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ["llmProviders"] });
      const totalAdded = results.reduce((sum: number, r: any) => sum + r.modelsAdded, 0);
      const totalRemoved = results.reduce((sum: number, r: any) => sum + r.modelsRemoved, 0);
      setSyncResult({
        success: true,
        message: `Synced ${results.length} providers: +${totalAdded} models, -${totalRemoved} removed`,
        results,
      });
      setTimeout(() => setSyncResult(null), 10000);
    },
    onError: (error) => {
      setSyncResult({ success: false, error: error.message });
      setTimeout(() => setSyncResult(null), 10000);
    },
  });

  const importModelsMutation = useMutation({
    mutationFn: (data: { providerId: number; modelIds: string[] }) =>
      trpc.llmProviders.importModels.mutate(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["llmProviders"] });
      setSelectedModelsToImport([]);
      setIsBrowseDialogOpen(false);
    },
  });

  // Browse OpenRouter models query
  const { data: browseData, isLoading: isBrowseLoading, refetch: refetchBrowse } = useQuery({
    queryKey: ["llmProviders", "browseOpenRouterModels", browseSearch, browseProvider],
    queryFn: () => trpc.llmProviders.browseOpenRouterModels.query({
      search: browseSearch || undefined,
      provider: browseProvider || undefined,
    }),
    enabled: isBrowseDialogOpen,
  });

  const resetForm = () => {
    setFormData({
      displayName: "",
      description: "",
      baseUrl: "",
      apiKey: "",
      defaultModel: "",
      isEnabled: false,
    });
    setEditingModels([]);
    setActiveTab("settings");
  };

  const handleCreateFromTemplate = (template: ProviderTemplate) => {
    setSelectedTemplate(template);
    setFormData({
      displayName: template.displayName,
      description: template.description,
      baseUrl: template.baseUrl,
      apiKey: "",
      defaultModel: template.defaultModel,
      isEnabled: false,
    });
    setEditingModels([]);
    setIsCreateDialogOpen(true);
  };

  const handleEdit = (provider: Provider) => {
    setEditingProvider(provider);
    setFormData({
      displayName: provider.displayName,
      description: provider.description || "",
      baseUrl: provider.baseUrl || "",
      apiKey: "",
      defaultModel: provider.defaultModel || "",
      isEnabled: provider.isEnabled,
    });
    setEditingModels(provider.availableModels || []);
    setActiveTab("settings");
  };

  const handleSave = () => {
    const payload = {
      ...formData,
      availableModels: editingModels.length > 0 ? editingModels : undefined,
      apiKey: formData.apiKey || undefined,
    };

    if (editingProvider) {
      updateMutation.mutate({
        id: editingProvider.id,
        ...payload,
      });
    } else if (selectedTemplate) {
      createMutation.mutate({
        providerName: selectedTemplate.providerName,
        ...payload,
      });
    }
  };

  const handleAddModel = () => {
    if (!newModel.id.trim() || !newModel.name.trim()) return;
    
    // Check for duplicate
    if (editingModels.some(m => m.id === newModel.id)) {
      return;
    }
    
    setEditingModels([...editingModels, { ...newModel }]);
    setNewModel({ id: "", name: "" });
  };

  const handleUpdateModel = (index: number, field: keyof ModelVersion, value: any) => {
    const updated = [...editingModels];
    updated[index] = { ...updated[index], [field]: value };
    setEditingModels(updated);
  };

  const handleDeleteModel = (modelId: string) => {
    setEditingModels(editingModels.filter(m => m.id !== modelId));
    setDeleteModelConfirm(null);
  };

  const handleDuplicateModel = (model: ModelVersion) => {
    const newId = `${model.id}-copy`;
    setEditingModels([...editingModels, { ...model, id: newId, name: `${model.name} (Copy)` }]);
  };

  const getProviderIcon = (providerName: string) => {
    switch (providerName) {
      case "openai":
        return <Bot className="h-5 w-5" />;
      case "anthropic":
        return <Bot className="h-5 w-5 text-orange-500" />;
      case "google":
        return <Globe className="h-5 w-5 text-blue-500" />;
      case "groq":
        return <Zap className="h-5 w-5 text-yellow-500" />;
      case "ollama":
        return <Server className="h-5 w-5 text-gray-500" />;
      case "openrouter":
        return <Layers className="h-5 w-5 text-purple-500" />;
      case "deepseek":
        return <Cpu className="h-5 w-5 text-cyan-500" />;
      case "minimax":
        return <Bot className="h-5 w-5 text-pink-500" />;
      case "qwen":
        return <Bot className="h-5 w-5 text-green-500" />;
      case "zhipu":
        return <Bot className="h-5 w-5 text-red-500" />;
      default:
        return <Bot className="h-5 w-5" />;
    }
  };

  // Filter out templates that are already configured
  const configuredProviderNames = providers.map(p => p.providerName);
  const availableTemplates = templates.filter(t => !configuredProviderNames.includes(t.providerName));

  // Calculate total models
  const totalModels = providers.reduce((sum, p) => sum + (p.availableModels?.length || 0), 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Settings className="h-8 w-8" />
          LLM Provider Configuration
        </h1>
        <p className="text-muted-foreground mt-2">
          Configure API keys, settings, and model versions for LLM providers
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Providers</CardDescription>
            <CardTitle className="text-2xl">{stats?.total || providers.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Configured</CardDescription>
            <CardTitle className="text-2xl">{stats?.configured || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Enabled</CardDescription>
            <CardTitle className="text-2xl text-green-600">{stats?.enabled || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ready</CardDescription>
            <CardTitle className="text-2xl text-blue-600">{stats?.ready || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Models</CardDescription>
            <CardTitle className="text-2xl text-purple-600">{totalModels}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Sync Result Notification */}
      {syncResult && (
        <div className={`mb-4 p-4 rounded-lg flex items-center gap-3 ${
          syncResult.success ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
        }`}>
          {syncResult.success ? (
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          ) : (
            <XCircle className="h-5 w-5 text-red-600" />
          )}
          <div className="flex-1">
            {syncResult.message || (
              syncResult.success ? (
                <span>
                  Synced <strong>{syncResult.provider}</strong>: 
                  +{syncResult.modelsAdded} added, -{syncResult.modelsRemoved} removed, 
                  ~{syncResult.modelsUpdated} updated. Total: {syncResult.totalModels} models
                </span>
              ) : (
                <span className="text-red-600">Sync failed: {syncResult.error}</span>
              )
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setSyncResult(null)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Configured Providers */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Configured Providers</h2>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsBrowseDialogOpen(true)}
            >
              <Search className="h-4 w-4 mr-2" />
              Browse Models
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncAllMutation.mutate()}
              disabled={syncAllMutation.isPending}
            >
              {syncAllMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sync All from OpenRouter
            </Button>
          </div>
        </div>
        {providers.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No providers configured yet. Add one from the templates below.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {providers.map((provider) => (
              <Card key={provider.id} className={provider.isEnabled ? "border-green-200" : ""}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-muted">
                        {getProviderIcon(provider.providerName)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold">{provider.displayName}</h3>
                          {provider.isEnabled ? (
                            <Badge variant="default" className="bg-green-600">Enabled</Badge>
                          ) : (
                            <Badge variant="secondary">Disabled</Badge>
                          )}
                          {provider.hasApiKey && (
                            <Badge variant="outline" className="text-blue-600 border-blue-600">
                              <Key className="h-3 w-3 mr-1" />
                              API Key Set
                            </Badge>
                          )}
                          {provider.availableModels && provider.availableModels.length > 0 && (
                            <Badge variant="outline" className="text-purple-600 border-purple-600">
                              <Cpu className="h-3 w-3 mr-1" />
                              {provider.availableModels.length} Models
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{provider.description}</p>
                        <div className="flex flex-wrap gap-4 mt-2 text-xs text-muted-foreground">
                          <span><strong>Provider:</strong> {provider.providerName}</span>
                          {provider.baseUrl && <span><strong>Base URL:</strong> {provider.baseUrl}</span>}
                          {provider.defaultModel && <span><strong>Default Model:</strong> {provider.defaultModel}</span>}
                        </div>
                        
                        {/* Show available models preview */}
                        {provider.availableModels && provider.availableModels.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1">
                            {provider.availableModels.slice(0, 5).map((model) => (
                              <Badge key={model.id} variant="secondary" className="text-xs">
                                {model.name}
                              </Badge>
                            ))}
                            {provider.availableModels.length > 5 && (
                              <Badge variant="secondary" className="text-xs">
                                +{provider.availableModels.length - 5} more
                              </Badge>
                            )}
                          </div>
                        )}
                        
                        {/* Test result */}
                        {testResult?.id === provider.id && (
                          <div className={`mt-2 text-sm ${testResult.success ? "text-green-600" : "text-red-600"}`}>
                            {testResult.success ? <Check className="inline h-4 w-4 mr-1" /> : <X className="inline h-4 w-4 mr-1" />}
                            {testResult.message}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={provider.isEnabled}
                        onCheckedChange={() => toggleMutation.mutate(provider.id)}
                        disabled={toggleMutation.isPending}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => syncProviderMutation.mutate(provider.id)}
                        disabled={syncProviderMutation.isPending}
                        title="Sync Models from OpenRouter"
                      >
                        {syncProviderMutation.isPending && syncProviderMutation.variables === provider.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => testMutation.mutate(provider.id)}
                        disabled={!provider.hasApiKey || testMutation.isPending}
                        title="Test Connection"
                      >
                        {testMutation.isPending && testMutation.variables === provider.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <TestTube className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(provider)}
                        title="Edit Provider"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => setDeleteConfirm(provider)}
                        title="Delete Provider"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add New Provider */}
      {availableTemplates.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Add New Provider</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {availableTemplates.map((template) => (
              <Card
                key={template.providerName}
                className="cursor-pointer hover:border-primary transition-colors"
                onClick={() => handleCreateFromTemplate(template)}
              >
                <CardContent className="py-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-muted">
                      {getProviderIcon(template.providerName)}
                    </div>
                    <div>
                      <h3 className="font-semibold">{template.displayName}</h3>
                      <p className="text-sm text-muted-foreground">
                        {template.description}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Edit/Create Dialog */}
      <Dialog
        open={!!editingProvider || isCreateDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditingProvider(null);
            setIsCreateDialogOpen(false);
            setSelectedTemplate(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingProvider ? `Edit ${editingProvider.displayName}` : `Add ${selectedTemplate?.displayName}`}
            </DialogTitle>
            <DialogDescription>
              Configure the provider settings, API key, and available models
            </DialogDescription>
          </DialogHeader>
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="settings">Settings</TabsTrigger>
              <TabsTrigger value="models">
                Models
                {editingModels.length > 0 && (
                  <Badge variant="secondary" className="ml-2">{editingModels.length}</Badge>
                )}
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="settings" className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="baseUrl">Base URL</Label>
                <Input
                  id="baseUrl"
                  value={formData.baseUrl}
                  onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                  placeholder="https://api.example.com/v1"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apiKey">
                  API Key
                  {editingProvider?.hasApiKey && (
                    <span className="text-muted-foreground ml-2">(leave empty to keep current)</span>
                  )}
                </Label>
                <Input
                  id="apiKey"
                  type="password"
                  value={formData.apiKey}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                  placeholder={editingProvider?.hasApiKey ? "••••••••" : "Enter API key"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="defaultModel">Default Model</Label>
                <Input
                  id="defaultModel"
                  value={formData.defaultModel}
                  onChange={(e) => setFormData({ ...formData, defaultModel: e.target.value })}
                  placeholder="e.g., gpt-4o-mini"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="isEnabled"
                  checked={formData.isEnabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, isEnabled: checked })}
                />
                <Label htmlFor="isEnabled">Enable Provider</Label>
              </div>
            </TabsContent>
            
            <TabsContent value="models" className="py-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">Available Models</h3>
                    <p className="text-sm text-muted-foreground">
                      Define the models available for this provider
                    </p>
                  </div>
                  <Badge variant="outline">{editingModels.length} models</Badge>
                </div>
                
                {/* Add new model form */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Add New Model</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Model ID *</Label>
                        <Input
                          placeholder="e.g., gpt-4o-2024-11-20"
                          value={newModel.id}
                          onChange={(e) => setNewModel({ ...newModel, id: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Display Name *</Label>
                        <Input
                          placeholder="e.g., GPT-4o (Nov 2024)"
                          value={newModel.name}
                          onChange={(e) => setNewModel({ ...newModel, name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Context Length</Label>
                        <Input
                          type="number"
                          placeholder="e.g., 128000"
                          value={newModel.contextLength || ""}
                          onChange={(e) => setNewModel({ ...newModel, contextLength: e.target.value ? parseInt(e.target.value) : undefined })}
                        />
                      </div>
                      <div className="flex items-end">
                        <Button onClick={handleAddModel} disabled={!newModel.id.trim() || !newModel.name.trim()}>
                          <Plus className="h-4 w-4 mr-1" />
                          Add
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                {/* Models table */}
                {editingModels.length > 0 ? (
                  <div className="border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[40px]"></TableHead>
                          <TableHead>Model ID</TableHead>
                          <TableHead>Display Name</TableHead>
                          <TableHead className="w-[120px]">Context</TableHead>
                          <TableHead className="w-[100px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {editingModels.map((model, index) => (
                          <TableRow key={model.id}>
                            <TableCell>
                              <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={model.id}
                                onChange={(e) => handleUpdateModel(index, "id", e.target.value)}
                                className="h-8 font-mono text-sm"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={model.name}
                                onChange={(e) => handleUpdateModel(index, "name", e.target.value)}
                                className="h-8"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                value={model.contextLength || ""}
                                onChange={(e) => handleUpdateModel(index, "contextLength", e.target.value ? parseInt(e.target.value) : undefined)}
                                className="h-8"
                                placeholder="-"
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDuplicateModel(model)}
                                  title="Duplicate"
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-600"
                                  onClick={() => setDeleteModelConfirm(model.id)}
                                  title="Delete"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                      <Cpu className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No models defined yet.</p>
                      <p className="text-sm">Add models to make them available for selection in the app.</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>
          </Tabs>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditingProvider(null);
                setIsCreateDialogOpen(false);
                setSelectedTemplate(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingProvider ? "Save Changes" : "Add Provider"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Provider Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Provider</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deleteConfirm?.displayName}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Model Confirmation */}
      <AlertDialog open={!!deleteModelConfirm} onOpenChange={() => setDeleteModelConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Model</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this model from the list?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteModelConfirm && handleDeleteModel(deleteModelConfirm)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Browse OpenRouter Models Dialog */}
      <Dialog open={isBrowseDialogOpen} onOpenChange={setIsBrowseDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Browse OpenRouter Models
            </DialogTitle>
            <DialogDescription>
              Discover and import models from OpenRouter's catalog of 420+ models
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <Input
                placeholder="Search models..."
                value={browseSearch}
                onChange={(e) => setBrowseSearch(e.target.value)}
                className="w-full"
              />
            </div>
            <select
              className="px-3 py-2 border rounded-md bg-background"
              value={browseProvider}
              onChange={(e) => setBrowseProvider(e.target.value)}
            >
              <option value="">All Providers</option>
              {browseData?.providers.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetchBrowse()}
              disabled={isBrowseLoading}
            >
              {isBrowseLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>

          <div className="text-sm text-muted-foreground mb-2">
            {browseData ? (
              <span>
                Showing {browseData.filteredCount} of {browseData.totalCount} models
                {selectedModelsToImport.length > 0 && (
                  <span className="ml-2 text-primary">
                    • {selectedModelsToImport.length} selected
                  </span>
                )}
              </span>
            ) : (
              <span>Loading models...</span>
            )}
          </div>

          <div className="flex-1 overflow-auto border rounded-md">
            {isBrowseLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : browseData?.models.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                No models found
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        checked={selectedModelsToImport.length === browseData?.models.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedModelsToImport(browseData?.models.map(m => m.id) || []);
                          } else {
                            setSelectedModelsToImport([]);
                          }
                        }}
                      />
                    </TableHead>
                    <TableHead>Model ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Context</TableHead>
                    <TableHead className="text-right">Input $/1M</TableHead>
                    <TableHead className="text-right">Output $/1M</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {browseData?.models.slice(0, 100).map((model) => (
                    <TableRow
                      key={model.id}
                      className={selectedModelsToImport.includes(model.id) ? "bg-primary/5" : ""}
                    >
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedModelsToImport.includes(model.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedModelsToImport([...selectedModelsToImport, model.id]);
                            } else {
                              setSelectedModelsToImport(selectedModelsToImport.filter(id => id !== model.id));
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{model.id}</TableCell>
                      <TableCell>{model.name}</TableCell>
                      <TableCell className="text-right">
                        {model.contextLength ? `${(model.contextLength / 1000).toFixed(0)}K` : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {model.pricing?.input ? `$${model.pricing.input.toFixed(2)}` : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {model.pricing?.output ? `$${model.pricing.output.toFixed(2)}` : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {browseData && browseData.models.length > 100 && (
              <div className="p-4 text-center text-sm text-muted-foreground border-t">
                Showing first 100 models. Use search to find specific models.
              </div>
            )}
          </div>

          <DialogFooter className="mt-4">
            <div className="flex-1 text-sm text-muted-foreground">
              Select a provider to import models to:
              <select
                className="ml-2 px-2 py-1 border rounded-md bg-background"
                id="importTargetProvider"
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.displayName}</option>
                ))}
              </select>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setIsBrowseDialogOpen(false);
                setSelectedModelsToImport([]);
                setBrowseSearch("");
                setBrowseProvider("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                const select = document.getElementById("importTargetProvider") as HTMLSelectElement;
                const providerId = parseInt(select?.value || "0");
                if (providerId && selectedModelsToImport.length > 0) {
                  importModelsMutation.mutate({
                    providerId,
                    modelIds: selectedModelsToImport,
                  });
                }
              }}
              disabled={selectedModelsToImport.length === 0 || importModelsMutation.isPending}
            >
              {importModelsMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Import {selectedModelsToImport.length} Models
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
