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
} from "lucide-react";

interface Provider {
  id: number;
  providerName: string;
  displayName: string;
  description: string | null;
  baseUrl: string | null;
  hasApiKey: boolean;
  defaultModel: string | null;
  availableModels: Array<{
    id: string;
    name: string;
    contextLength?: number;
  }> | null;
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
      setTestResult({ id, ...result });
      setTimeout(() => setTestResult(null), 5000);
    },
    onError: (error: any, id) => {
      setTestResult({ id, success: false, message: error.message });
      setTimeout(() => setTestResult(null), 5000);
    },
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
    setIsCreateDialogOpen(true);
  };

  const handleEdit = (provider: Provider) => {
    setEditingProvider(provider);
    setFormData({
      displayName: provider.displayName,
      description: provider.description || "",
      baseUrl: provider.baseUrl || "",
      apiKey: "", // Don't pre-fill API key
      defaultModel: provider.defaultModel || "",
      isEnabled: provider.isEnabled,
    });
  };

  const handleSave = () => {
    if (editingProvider) {
      updateMutation.mutate({
        id: editingProvider.id,
        ...formData,
        apiKey: formData.apiKey || undefined, // Only send if changed
      });
    } else if (selectedTemplate) {
      createMutation.mutate({
        providerName: selectedTemplate.providerName,
        ...formData,
      });
    }
  };

  const getProviderIcon = (providerName: string) => {
    switch (providerName) {
      case "openai":
        return <Bot className="h-5 w-5" />;
      case "anthropic":
        return <Bot className="h-5 w-5" />;
      case "google":
        return <Globe className="h-5 w-5" />;
      case "groq":
        return <Zap className="h-5 w-5" />;
      case "ollama":
        return <Server className="h-5 w-5" />;
      default:
        return <Bot className="h-5 w-5" />;
    }
  };

  // Filter out templates that are already configured
  const configuredProviderNames = providers.map(p => p.providerName);
  const availableTemplates = templates.filter(t => !configuredProviderNames.includes(t.providerName));

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
          Configure API keys and settings for LLM providers
        </p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Providers</CardDescription>
              <CardTitle className="text-2xl">{stats.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Configured</CardDescription>
              <CardTitle className="text-2xl">{stats.configured}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Enabled</CardDescription>
              <CardTitle className="text-2xl">{stats.enabled}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Ready to Use</CardDescription>
              <CardTitle className="text-2xl text-green-600">{stats.ready}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Configured Providers */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Configured Providers</h2>
        {providers.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No providers configured yet. Add a provider from the templates below.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {providers.map((provider) => (
              <Card key={provider.id} className={!provider.isEnabled ? "opacity-60" : ""}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="p-2 rounded-lg bg-muted">
                        {getProviderIcon(provider.providerName)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold">{provider.displayName}</h3>
                          <Badge variant={provider.isEnabled ? "default" : "secondary"}>
                            {provider.isEnabled ? "Enabled" : "Disabled"}
                          </Badge>
                          {provider.hasApiKey ? (
                            <Badge variant="outline" className="text-green-600 border-green-600">
                              <Key className="h-3 w-3 mr-1" />
                              API Key Set
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                              <Key className="h-3 w-3 mr-1" />
                              No API Key
                            </Badge>
                          )}
                          {testResult?.id === provider.id && (
                            <Badge variant={testResult.success ? "default" : "destructive"}>
                              {testResult.success ? (
                                <Check className="h-3 w-3 mr-1" />
                              ) : (
                                <X className="h-3 w-3 mr-1" />
                              )}
                              {testResult.message}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Provider: {provider.providerName}
                        </p>
                        {provider.baseUrl && (
                          <p className="text-sm text-muted-foreground">
                            Base URL: {provider.baseUrl}
                          </p>
                        )}
                        {provider.defaultModel && (
                          <p className="text-sm text-muted-foreground">
                            Default Model: {provider.defaultModel}
                          </p>
                        )}
                        {provider.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {provider.description}
                          </p>
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
                        onClick={() => testMutation.mutate(provider.id)}
                        disabled={!provider.hasApiKey || testMutation.isPending}
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
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => setDeleteConfirm(provider)}
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingProvider ? `Edit ${editingProvider.displayName}` : `Add ${selectedTemplate?.displayName}`}
            </DialogTitle>
            <DialogDescription>
              Configure the provider settings and API key
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
          </div>
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

      {/* Delete Confirmation */}
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
    </div>
  );
}
