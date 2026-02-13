/**
 * StorageSettingsPanel
 *
 * Manages S3/R2/Local storage configurations.
 * Embedded inside AdminSettings as a tab panel.
 * Includes a prominent "Default Storage Provider" selector.
 */

import { useState } from "react";
import { trpc } from "../../lib/trpc";
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
  Cloud,
  Database,
  HardDrive,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";

interface StorageSetting {
  id: number;
  name: string;
  displayName: string;
  description: string | null;
  providerType: "r2" | "s3" | "local";
  endpoint: string | null;
  region: string | null;
  bucket: string | null;
  hasCredentials: boolean;
  publicUrlPrefix: string | null;
  devTunnelUrl: string | null;
  pathPrefix: string | null;
  isActive: boolean;
  configJson: Record<string, any> | null;
  lastTestedAt: string | null;
  lastTestResult: {
    success: boolean;
    message: string;
    latencyMs?: number;
  } | null;
}

export default function StorageSettingsPanel() {
  const [editingSetting, setEditingSetting] = useState<StorageSetting | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<StorageSetting | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; success: boolean; message: string } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    displayName: "",
    description: "",
    providerType: "r2" as "r2" | "s3" | "local",
    endpoint: "",
    region: "auto",
    bucket: "",
    accessKeyId: "",
    secretAccessKey: "",
    publicUrlPrefix: "",
    devTunnelUrl: "",
    pathPrefix: "uploads/",
    isActive: false,
    forcePathStyle: false,
  });

  // Queries
  const { data: settings = [], isLoading, refetch } = trpc.storageSettings.list.useQuery();

  const { data: stats } = trpc.storageSettings.stats.useQuery();

  // Error state for mutations
  const [mutationError, setMutationError] = useState<string | null>(null);

  // Mutations
  const createMutation = trpc.storageSettings.create.useMutation({
    onSuccess: () => {
      refetch();
      setIsCreateDialogOpen(false);
      resetForm();
      setMutationError(null);
    },
    onError: (error) => {
      setMutationError(error.message || "Failed to create storage configuration");
    },
  });

  const updateMutation = trpc.storageSettings.update.useMutation({
    onSuccess: () => {
      refetch();
      setEditingSetting(null);
      resetForm();
      setMutationError(null);
    },
    onError: (error) => {
      setMutationError(error.message || "Failed to update storage configuration");
    },
  });

  const deleteMutation = trpc.storageSettings.delete.useMutation({
    onSuccess: () => {
      refetch();
      setDeleteConfirm(null);
    },
  });

  const testMutation = trpc.storageSettings.testConnection.useMutation({
    onSuccess: (result, variables) => {
      setTestResult({ id: variables.id, ...result });
      refetch();
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      displayName: "",
      description: "",
      providerType: "r2",
      endpoint: "",
      region: "auto",
      bucket: "",
      accessKeyId: "",
      secretAccessKey: "",
      publicUrlPrefix: "",
      devTunnelUrl: "",
      pathPrefix: "uploads/",
      isActive: false,
      forcePathStyle: false,
    });
  };

  const handleEditSetting = (setting: StorageSetting) => {
    setEditingSetting(setting);
    setFormData({
      name: setting.name,
      displayName: setting.displayName,
      description: setting.description || "",
      providerType: setting.providerType,
      endpoint: setting.endpoint || "",
      region: setting.region || "auto",
      bucket: setting.bucket || "",
      accessKeyId: "",
      secretAccessKey: "",
      publicUrlPrefix: setting.publicUrlPrefix || "",
      devTunnelUrl: setting.devTunnelUrl || "",
      pathPrefix: setting.pathPrefix || "uploads/",
      isActive: setting.isActive,
      forcePathStyle: setting.configJson?.forcePathStyle || false,
    });
  };

  const handleSave = () => {
    const configJson: Record<string, any> = {};
    if (formData.forcePathStyle) {
      configJson.forcePathStyle = true;
    }

    if (editingSetting) {
      updateMutation.mutate({
        id: editingSetting.id,
        displayName: formData.displayName,
        description: formData.description || null,
        providerType: formData.providerType,
        endpoint: formData.endpoint || null,
        region: formData.region || null,
        bucket: formData.bucket || null,
        accessKeyId: formData.accessKeyId || undefined,
        secretAccessKey: formData.secretAccessKey || undefined,
        publicUrlPrefix: formData.publicUrlPrefix || null,
        devTunnelUrl: formData.devTunnelUrl || null,
        pathPrefix: formData.pathPrefix,
        isActive: formData.isActive,
        configJson: Object.keys(configJson).length > 0 ? configJson : null,
      });
    } else {
      createMutation.mutate({
        name: formData.name,
        displayName: formData.displayName,
        description: formData.description || undefined,
        providerType: formData.providerType,
        endpoint: formData.endpoint || undefined,
        region: formData.region,
        bucket: formData.bucket || undefined,
        accessKeyId: formData.accessKeyId || undefined,
        secretAccessKey: formData.secretAccessKey || undefined,
        publicUrlPrefix: formData.publicUrlPrefix || undefined,
        devTunnelUrl: formData.devTunnelUrl || undefined,
        pathPrefix: formData.pathPrefix,
        isActive: formData.isActive,
        configJson: Object.keys(configJson).length > 0 ? configJson : undefined,
      });
    }
  };

  const getProviderIcon = (type: string) => {
    switch (type) {
      case "r2": return <Cloud className="h-4 w-4" />;
      case "s3": return <Database className="h-4 w-4" />;
      case "local": return <HardDrive className="h-4 w-4" />;
      default: return <Cloud className="h-4 w-4" />;
    }
  };

  const getProviderBadgeColor = (type: string) => {
    switch (type) {
      case "r2": return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
      case "s3": return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "local": return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";
      default: return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";
    }
  };

  // Determine which provider is currently active
  const activeSetting = (settings as StorageSetting[]).find((s) => s.isActive);
  const activeProvider: "local" | "r2" | "s3" = activeSetting?.providerType ?? "local";

  // Handle switching the default provider
  const handleSetDefaultProvider = (provider: "local" | "r2" | "s3") => {
    if (provider === "local") {
      // Deactivate all settings — falls back to local
      const currentActive = (settings as StorageSetting[]).find((s) => s.isActive);
      if (currentActive) {
        updateMutation.mutate({
          id: currentActive.id,
          isActive: false,
        });
      }
      return;
    }

    // Find first matching provider config and activate it
    const matchingConfig = (settings as StorageSetting[]).find(
      (s) => s.providerType === provider,
    );
    if (matchingConfig) {
      updateMutation.mutate({
        id: matchingConfig.id,
        isActive: true,
      });
    }
  };

  const hasR2Config = (settings as StorageSetting[]).some((s) => s.providerType === "r2");
  const hasS3Config = (settings as StorageSetting[]).some((s) => s.providerType === "s3");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Default Storage Provider Selector */}
      <Card className="border-0 shadow-sm shadow-gray-200/50 rounded-2xl overflow-hidden">
        <CardHeader className="border-b bg-gradient-to-r from-purple-50/50 to-pink-50/30 pb-5">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Cloud className="w-5 h-5 text-purple-500" />
            Default Storage Provider
          </CardTitle>
          <CardDescription>
            Choose where files are stored. During testing, use Local. For production, switch to R2 or S3.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-3 gap-4">
            {/* Local */}
            <button
              onClick={() => handleSetDefaultProvider("local")}
              disabled={updateMutation.isPending}
              className={`relative flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all ${
                activeProvider === "local"
                  ? "border-purple-500 bg-purple-50/50 shadow-md shadow-purple-100"
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              {activeProvider === "local" && (
                <div className="absolute top-2 right-2">
                  <CheckCircle2 className="h-5 w-5 text-purple-500" />
                </div>
              )}
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                activeProvider === "local"
                  ? "bg-purple-100 text-purple-600"
                  : "bg-gray-100 text-gray-500"
              }`}>
                <HardDrive className="h-6 w-6" />
              </div>
              <div className="text-center">
                <div className="font-semibold text-sm">Local Storage</div>
                <div className="text-xs text-muted-foreground mt-1">Server filesystem</div>
              </div>
            </button>

            {/* Cloudflare R2 */}
            <button
              onClick={() => handleSetDefaultProvider("r2")}
              disabled={updateMutation.isPending || !hasR2Config}
              className={`relative flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all ${
                activeProvider === "r2"
                  ? "border-orange-500 bg-orange-50/50 shadow-md shadow-orange-100"
                  : hasR2Config
                    ? "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    : "border-gray-100 bg-gray-50/50 opacity-50 cursor-not-allowed"
              }`}
            >
              {activeProvider === "r2" && (
                <div className="absolute top-2 right-2">
                  <CheckCircle2 className="h-5 w-5 text-orange-500" />
                </div>
              )}
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                activeProvider === "r2"
                  ? "bg-orange-100 text-orange-600"
                  : "bg-gray-100 text-gray-500"
              }`}>
                <Cloud className="h-6 w-6" />
              </div>
              <div className="text-center">
                <div className="font-semibold text-sm">Cloudflare R2</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {hasR2Config ? "Configured" : "No config yet"}
                </div>
              </div>
            </button>

            {/* AWS S3 */}
            <button
              onClick={() => handleSetDefaultProvider("s3")}
              disabled={updateMutation.isPending || !hasS3Config}
              className={`relative flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all ${
                activeProvider === "s3"
                  ? "border-yellow-500 bg-yellow-50/50 shadow-md shadow-yellow-100"
                  : hasS3Config
                    ? "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    : "border-gray-100 bg-gray-50/50 opacity-50 cursor-not-allowed"
              }`}
            >
              {activeProvider === "s3" && (
                <div className="absolute top-2 right-2">
                  <CheckCircle2 className="h-5 w-5 text-yellow-500" />
                </div>
              )}
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                activeProvider === "s3"
                  ? "bg-yellow-100 text-yellow-600"
                  : "bg-gray-100 text-gray-500"
              }`}>
                <Database className="h-6 w-6" />
              </div>
              <div className="text-center">
                <div className="font-semibold text-sm">AWS S3</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {hasS3Config ? "Configured" : "No config yet"}
                </div>
              </div>
            </button>
          </div>

          {/* Current status info */}
          <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-blue-50 text-sm text-blue-700">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>
              {activeProvider === "local"
                ? "Files are stored on the server filesystem. External services cannot access uploaded files directly."
                : `Files are stored in ${activeProvider === "r2" ? "Cloudflare R2" : "AWS S3"} (${activeSetting?.displayName}). External services can access uploaded files via public URLs.`
              }
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Configurations</CardTitle>
              <Settings className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.active}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">With Credentials</CardTitle>
              <Key className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.withCredentials}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cloudflare R2</CardTitle>
              <Cloud className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.byType.r2}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Storage Configurations Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Storage Configurations</CardTitle>
            <CardDescription>
              Manage your S3-compatible object storage settings. Only one configuration can be active at a time.
            </CardDescription>
          </div>
          <Button onClick={() => setIsCreateDialogOpen(true)} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Add Storage
          </Button>
        </CardHeader>
        <CardContent>
          {settings.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Cloud className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No storage configured</p>
              <p className="text-sm">Add your first storage configuration to enable R2/S3</p>
              <Button className="mt-4" onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Storage
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Storage</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Credentials</TableHead>
                  <TableHead>Last Test</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settings.map((setting: any) => (
                  <TableRow key={setting.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                          {getProviderIcon(setting.providerType)}
                        </div>
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {setting.displayName}
                            {setting.isActive && (
                              <Badge variant="secondary" className="gap-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                <Check className="h-3 w-3" />
                                Active
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {setting.bucket || setting.name}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getProviderBadgeColor(setting.providerType)}>
                        {setting.providerType.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {setting.isActive ? (
                        <Badge variant="default" className="bg-green-500">
                          <Check className="mr-1 h-3 w-3" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <X className="mr-1 h-3 w-3" />
                          Inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {setting.hasCredentials ? (
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
                      {setting.lastTestResult ? (
                        <div className="flex items-center gap-2">
                          {setting.lastTestResult.success ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                          <span className="text-sm">
                            {setting.lastTestResult.latencyMs}ms
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
                          onClick={() => testMutation.mutate({ id: setting.id })}
                          disabled={testMutation.isPending}
                        >
                          {testMutation.isPending && testMutation.variables?.id === setting.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <TestTube className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditSetting(setting as StorageSetting)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteConfirm(setting as StorageSetting)}
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

      {/* Create/Edit Dialog */}
      <Dialog
        open={isCreateDialogOpen || !!editingSetting}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateDialogOpen(false);
            setEditingSetting(null);
            resetForm();
            setMutationError(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingSetting ? `Edit Storage - ${editingSetting.displayName}` : "Add Storage Configuration"}
            </DialogTitle>
            <DialogDescription>
              Configure S3-compatible object storage (Cloudflare R2, AWS S3, etc.)
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Error Message */}
            {mutationError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md flex items-start gap-2">
                <XCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Error</p>
                  <p className="text-sm">{mutationError}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto -mt-1 -mr-2"
                  onClick={() => setMutationError(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Identifier</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="primary"
                  disabled={!!editingSetting}
                />
                <p className="text-xs text-muted-foreground">Unique identifier (cannot be changed)</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  placeholder="Primary Storage (R2)"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Storage configuration description..."
                rows={2}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="providerType">Provider Type</Label>
              <Select
                value={formData.providerType}
                onValueChange={(value: "r2" | "s3" | "local") => setFormData({ ...formData, providerType: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="r2">Cloudflare R2</SelectItem>
                  <SelectItem value="s3">AWS S3</SelectItem>
                  <SelectItem value="local">Local Storage</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* S3/R2 Settings */}
            {formData.providerType !== "local" && (
              <>
                <div className="border-t pt-4 mt-2">
                  <h4 className="font-medium mb-4">S3 Configuration</h4>
                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="endpoint">Endpoint URL</Label>
                      <Input
                        id="endpoint"
                        value={formData.endpoint}
                        onChange={(e) => setFormData({ ...formData, endpoint: e.target.value })}
                        placeholder={formData.providerType === "r2"
                          ? "https://<account-id>.r2.cloudflarestorage.com"
                          : "https://s3.us-east-1.amazonaws.com"
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        {formData.providerType === "r2"
                          ? "Find this in your Cloudflare Dashboard > R2 > Overview"
                          : "AWS S3 endpoint for your region"
                        }
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="bucket">Bucket Name</Label>
                        <Input
                          id="bucket"
                          value={formData.bucket}
                          onChange={(e) => setFormData({ ...formData, bucket: e.target.value })}
                          placeholder="my-media-bucket"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="region">Region</Label>
                        <Input
                          id="region"
                          value={formData.region}
                          onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                          placeholder="auto"
                        />
                        <p className="text-xs text-muted-foreground">Use "auto" for R2</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="accessKeyId">
                          Access Key ID {editingSetting && "(leave empty to keep current)"}
                        </Label>
                        <Input
                          id="accessKeyId"
                          type="password"
                          value={formData.accessKeyId}
                          onChange={(e) => setFormData({ ...formData, accessKeyId: e.target.value })}
                          placeholder={editingSetting ? "••••••••" : "Enter access key"}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="secretAccessKey">
                          Secret Access Key {editingSetting && "(leave empty to keep current)"}
                        </Label>
                        <Input
                          id="secretAccessKey"
                          type="password"
                          value={formData.secretAccessKey}
                          onChange={(e) => setFormData({ ...formData, secretAccessKey: e.target.value })}
                          placeholder={editingSetting ? "••••••••" : "Enter secret key"}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* URL Settings */}
            <div className="border-t pt-4 mt-2">
              <h4 className="font-medium mb-4">URL Configuration</h4>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="publicUrlPrefix">Public URL Prefix</Label>
                  <Input
                    id="publicUrlPrefix"
                    value={formData.publicUrlPrefix}
                    onChange={(e) => setFormData({ ...formData, publicUrlPrefix: e.target.value })}
                    placeholder="https://pub-xxx.r2.dev"
                  />
                  <p className="text-xs text-muted-foreground">
                    {formData.providerType === "r2"
                      ? "R2 Public Bucket URL (enable public access in R2 settings)"
                      : "CloudFront or S3 public URL"
                    }
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="devTunnelUrl">Development Tunnel URL (Optional)</Label>
                  <Input
                    id="devTunnelUrl"
                    value={formData.devTunnelUrl}
                    onChange={(e) => setFormData({ ...formData, devTunnelUrl: e.target.value })}
                    placeholder="https://xxx.trycloudflare.com"
                  />
                  <p className="text-xs text-muted-foreground">
                    Cloudflared tunnel URL for local development
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="pathPrefix">Path Prefix</Label>
                  <Input
                    id="pathPrefix"
                    value={formData.pathPrefix}
                    onChange={(e) => setFormData({ ...formData, pathPrefix: e.target.value })}
                    placeholder="uploads/"
                  />
                  <p className="text-xs text-muted-foreground">
                    Prefix for all uploaded files (e.g., "media/", "uploads/")
                  </p>
                </div>
              </div>
            </div>

            {/* Advanced Settings */}
            <div className="border-t pt-4 mt-2">
              <h4 className="font-medium mb-4">Settings</h4>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Active</Label>
                    <p className="text-sm text-muted-foreground">
                      Use this as the primary storage configuration
                    </p>
                  </div>
                  <Switch
                    checked={formData.isActive}
                    onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                  />
                </div>

                {formData.providerType !== "local" && (
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Force Path Style</Label>
                      <p className="text-sm text-muted-foreground">
                        Use path-style URLs (required for some S3-compatible services)
                      </p>
                    </div>
                    <Switch
                      checked={formData.forcePathStyle}
                      onCheckedChange={(checked) => setFormData({ ...formData, forcePathStyle: checked })}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateDialogOpen(false);
                setEditingSetting(null);
                resetForm();
                setMutationError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                createMutation.isPending ||
                updateMutation.isPending ||
                !formData.displayName ||
                (!editingSetting && !formData.name)
              }
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {editingSetting ? "Save Changes" : "Create Storage"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Storage Configuration</AlertDialogTitle>
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
