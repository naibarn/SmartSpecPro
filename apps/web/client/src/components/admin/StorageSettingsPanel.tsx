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
import { DashboardCard, DashboardKpiCard } from "@/components/dashboard";
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
  BookOpen,
  ChevronDown,
  ChevronRight,
  ExternalLink,
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
  const [showR2Guide, setShowR2Guide] = useState(false);
  const [showS3Guide, setShowS3Guide] = useState(false);

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
      <DashboardCard
        className="overflow-hidden"
        leading={<Cloud className="w-5 h-5 text-purple-500" />}
        title="Default Storage Provider"
        description="Choose where files are stored. During testing, use Local. For production, switch to R2 or S3."
        bodyClassName="pt-6"
      >
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
      </DashboardCard>

      {/* Setup Guides */}
      <DashboardCard
        className="overflow-hidden"
        leading={<BookOpen className="w-5 h-5 text-blue-500" />}
        title="Storage Setup Guides"
        description="Step-by-step instructions for configuring Cloudflare R2 or AWS S3 storage, including required CORS settings for direct file uploads."
        bodyClassName="pt-6 space-y-4"
      >
          {/* Cloudflare R2 Guide */}
          <div className="rounded-lg border border-orange-200 bg-orange-50/30 overflow-hidden">
            <button
              onClick={() => setShowR2Guide(!showR2Guide)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-orange-50/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                  <Cloud className="h-4 w-4 text-orange-600" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-orange-900">Cloudflare R2 Setup Guide</p>
                  <p className="text-xs text-orange-600">S3-compatible object storage by Cloudflare</p>
                </div>
              </div>
              {showR2Guide ? (
                <ChevronDown className="h-4 w-4 text-orange-500" />
              ) : (
                <ChevronRight className="h-4 w-4 text-orange-500" />
              )}
            </button>
            {showR2Guide && (
              <div className="px-4 pb-4 space-y-4 text-sm border-t border-orange-200 pt-4">
                <ol className="space-y-4 text-orange-900 list-decimal pl-5">
                  <li>
                    <p className="font-semibold">Create R2 Bucket</p>
                    <ul className="mt-1 space-y-1 text-xs text-orange-700 list-disc pl-4">
                      <li>Go to <a href="https://dash.cloudflare.com" target="_blank" rel="noopener noreferrer" className="underline font-medium inline-flex items-center gap-0.5">Cloudflare Dashboard <ExternalLink className="h-3 w-3" /></a></li>
                      <li>Navigate to <strong>R2 Object Storage</strong> &gt; <strong>Create bucket</strong></li>
                      <li>Choose a bucket name (e.g., <code className="bg-orange-100 px-1 rounded">my-media</code>) and location</li>
                    </ul>
                  </li>
                  <li>
                    <p className="font-semibold">Create API Token</p>
                    <ul className="mt-1 space-y-1 text-xs text-orange-700 list-disc pl-4">
                      <li>Go to <strong>R2</strong> &gt; <strong>Manage R2 API Tokens</strong> &gt; <strong>Create API token</strong></li>
                      <li>Permission: <code className="bg-orange-100 px-1 rounded">Object Read & Write</code></li>
                      <li>Specify bucket: select your bucket name</li>
                      <li>Click <strong>Create API Token</strong></li>
                      <li>Copy the <strong>Access Key ID</strong> and <strong>Secret Access Key</strong> (shown only once)</li>
                    </ul>
                  </li>
                  <li>
                    <p className="font-semibold">Get S3 API Endpoint</p>
                    <ul className="mt-1 space-y-1 text-xs text-orange-700 list-disc pl-4">
                      <li>Go to <strong>R2</strong> &gt; your bucket &gt; <strong>Settings</strong></li>
                      <li>Copy the <strong>S3 API</strong> endpoint URL:</li>
                      <li><code className="bg-orange-100 px-1.5 py-0.5 rounded text-xs">https://&lt;account-id&gt;.r2.cloudflarestorage.com</code></li>
                    </ul>
                  </li>
                  <li>
                    <p className="font-semibold">Enable Public Access <span className="font-normal text-orange-600">(Optional but recommended)</span></p>
                    <ul className="mt-1 space-y-1 text-xs text-orange-700 list-disc pl-4">
                      <li>Go to <strong>R2</strong> &gt; your bucket &gt; <strong>Settings</strong> &gt; <strong>Public access</strong></li>
                      <li>Enable the <strong>R2.dev subdomain</strong> or connect a custom domain</li>
                      <li>Copy the public URL to use as <strong>Public URL Prefix</strong></li>
                    </ul>
                  </li>
                  <li>
                    <p className="font-semibold text-red-700">Configure CORS <span className="font-normal text-red-600">(Required for direct uploads)</span></p>
                    <ul className="mt-1 space-y-1 text-xs text-orange-700 list-disc pl-4">
                      <li>Go to <strong>R2</strong> &gt; your bucket &gt; <strong>Settings</strong> &gt; <strong>CORS Policy</strong></li>
                      <li>Click <strong>Add CORS policy</strong> and paste this JSON:</li>
                    </ul>
                    <pre className="mt-2 p-3 rounded-md bg-gray-900 text-green-400 text-xs overflow-x-auto font-mono leading-relaxed">{`[
  {
    "AllowedOrigins": ["https://your-domain.com"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type", "Content-Length"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]`}</pre>
                    <p className="mt-1.5 text-xs text-red-600 font-medium">
                      Replace <code className="bg-red-100 px-1 rounded">your-domain.com</code> with your actual domain. Without CORS, large file uploads will fail silently.
                    </p>
                  </li>
                  <li>
                    <p className="font-semibold">Fill in the Storage Form</p>
                    <ul className="mt-1 space-y-1 text-xs text-orange-700 list-disc pl-4">
                      <li>Provider Type: <code className="bg-orange-100 px-1 rounded">Cloudflare R2</code></li>
                      <li>Endpoint URL: the S3 API endpoint from step 3</li>
                      <li>Bucket: your bucket name</li>
                      <li>Region: <code className="bg-orange-100 px-1 rounded">auto</code></li>
                      <li>Access Key ID & Secret: from step 2</li>
                      <li>Public URL Prefix: from step 4 (if enabled)</li>
                      <li>Click <strong>Test Connection</strong> to verify everything works</li>
                    </ul>
                  </li>
                </ol>
              </div>
            )}
          </div>

          {/* AWS S3 Guide */}
          <div className="rounded-lg border border-yellow-200 bg-yellow-50/30 overflow-hidden">
            <button
              onClick={() => setShowS3Guide(!showS3Guide)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-yellow-50/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-yellow-100 flex items-center justify-center">
                  <Database className="h-4 w-4 text-yellow-600" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-yellow-900">AWS S3 Setup Guide</p>
                  <p className="text-xs text-yellow-600">Amazon Simple Storage Service</p>
                </div>
              </div>
              {showS3Guide ? (
                <ChevronDown className="h-4 w-4 text-yellow-500" />
              ) : (
                <ChevronRight className="h-4 w-4 text-yellow-500" />
              )}
            </button>
            {showS3Guide && (
              <div className="px-4 pb-4 space-y-4 text-sm border-t border-yellow-200 pt-4">
                <ol className="space-y-4 text-yellow-900 list-decimal pl-5">
                  <li>
                    <p className="font-semibold">Create S3 Bucket</p>
                    <ul className="mt-1 space-y-1 text-xs text-yellow-700 list-disc pl-4">
                      <li>Go to <a href="https://console.aws.amazon.com/s3/" target="_blank" rel="noopener noreferrer" className="underline font-medium inline-flex items-center gap-0.5">AWS S3 Console <ExternalLink className="h-3 w-3" /></a></li>
                      <li>Click <strong>Create bucket</strong></li>
                      <li>Choose a bucket name and AWS Region (e.g., <code className="bg-yellow-100 px-1 rounded">us-east-1</code>)</li>
                      <li>Uncheck <strong>"Block all public access"</strong> if you want public URLs</li>
                    </ul>
                  </li>
                  <li>
                    <p className="font-semibold">Create IAM Access Key</p>
                    <ul className="mt-1 space-y-1 text-xs text-yellow-700 list-disc pl-4">
                      <li>Go to <a href="https://console.aws.amazon.com/iam/" target="_blank" rel="noopener noreferrer" className="underline font-medium inline-flex items-center gap-0.5">AWS IAM Console <ExternalLink className="h-3 w-3" /></a> &gt; <strong>Users</strong> &gt; <strong>Create user</strong></li>
                      <li>Attach policy: <code className="bg-yellow-100 px-1 rounded">AmazonS3FullAccess</code> (or a custom policy for your bucket only)</li>
                      <li>Go to <strong>Security credentials</strong> &gt; <strong>Create access key</strong></li>
                      <li>Use case: <strong>"Application running outside AWS"</strong></li>
                      <li>Copy the <strong>Access Key ID</strong> and <strong>Secret Access Key</strong></li>
                    </ul>
                  </li>
                  <li>
                    <p className="font-semibold text-red-700">Configure CORS on S3 Bucket <span className="font-normal text-red-600">(Required for direct uploads)</span></p>
                    <ul className="mt-1 space-y-1 text-xs text-yellow-700 list-disc pl-4">
                      <li>Go to <strong>S3</strong> &gt; your bucket &gt; <strong>Permissions</strong> &gt; <strong>Cross-origin resource sharing (CORS)</strong></li>
                      <li>Click <strong>Edit</strong> and paste this JSON:</li>
                    </ul>
                    <pre className="mt-2 p-3 rounded-md bg-gray-900 text-green-400 text-xs overflow-x-auto font-mono leading-relaxed">{`[
  {
    "AllowedOrigins": ["https://your-domain.com"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type", "Content-Length"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]`}</pre>
                    <p className="mt-1.5 text-xs text-red-600 font-medium">
                      Replace <code className="bg-red-100 px-1 rounded">your-domain.com</code> with your actual domain. Without CORS, large file uploads will fail silently.
                    </p>
                  </li>
                  <li>
                    <p className="font-semibold">Optional: Create CloudFront Distribution</p>
                    <ul className="mt-1 space-y-1 text-xs text-yellow-700 list-disc pl-4">
                      <li>For faster file delivery, create a <a href="https://console.aws.amazon.com/cloudfront/" target="_blank" rel="noopener noreferrer" className="underline font-medium inline-flex items-center gap-0.5">CloudFront distribution <ExternalLink className="h-3 w-3" /></a></li>
                      <li>Set origin to your S3 bucket</li>
                      <li>Use the CloudFront URL as <strong>Public URL Prefix</strong></li>
                    </ul>
                  </li>
                  <li>
                    <p className="font-semibold">Fill in the Storage Form</p>
                    <ul className="mt-1 space-y-1 text-xs text-yellow-700 list-disc pl-4">
                      <li>Provider Type: <code className="bg-yellow-100 px-1 rounded">AWS S3</code></li>
                      <li>Endpoint URL: <code className="bg-yellow-100 px-1 rounded">https://s3.&lt;region&gt;.amazonaws.com</code></li>
                      <li>Bucket: your bucket name</li>
                      <li>Region: your AWS region (e.g., <code className="bg-yellow-100 px-1 rounded">us-east-1</code>)</li>
                      <li>Access Key ID & Secret: from step 2</li>
                      <li>Public URL Prefix: CloudFront URL or S3 public URL</li>
                      <li>Force Path Style: <code className="bg-yellow-100 px-1 rounded">OFF</code> (AWS S3 uses virtual-hosted style)</li>
                      <li>Click <strong>Test Connection</strong> to verify everything works</li>
                    </ul>
                  </li>
                </ol>
              </div>
            )}
          </div>
      </DashboardCard>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <DashboardKpiCard icon={Settings} label="Total Configurations" value={stats.total} />
          <DashboardKpiCard icon={CheckCircle2} label="Active" value={stats.active} iconClassName="text-green-500" />
          <DashboardKpiCard icon={Key} label="With Credentials" value={stats.withCredentials} />
          <DashboardKpiCard icon={Cloud} label="Cloudflare R2" value={stats.byType.r2} iconClassName="text-orange-500" />
        </div>
      )}

      {/* Storage Configurations Table */}
      <DashboardCard
        className="overflow-hidden"
        title="Storage Configurations"
        description="Manage your S3-compatible object storage settings. Only one configuration can be active at a time."
        trailing={<Button onClick={() => setIsCreateDialogOpen(true)} size="sm"><Plus className="mr-2 h-4 w-4" />Add Storage</Button>}
      >
        <div className="overflow-x-auto">
          <div className="sr-only">Storage configurations table</div>
        </div>
        <div className="overflow-x-auto">
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
        </div>
      </DashboardCard>

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

            {/* CORS Warning */}
            {formData.providerType !== "local" && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 text-sm space-y-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-600" />
                  <div className="space-y-2">
                    <p className="font-semibold text-amber-800">CORS Configuration Required</p>
                    <p className="text-xs text-amber-700">
                      {formData.providerType === "r2"
                        ? "You must configure CORS on your R2 bucket for direct file uploads to work. Go to Cloudflare Dashboard > R2 > your bucket > Settings > CORS Policy."
                        : "You must configure CORS on your S3 bucket for direct file uploads to work. Go to AWS S3 Console > your bucket > Permissions > Cross-origin resource sharing (CORS)."
                      }
                    </p>
                    <pre className="p-2 rounded bg-gray-900 text-green-400 text-xs overflow-x-auto font-mono leading-relaxed">{`[{"AllowedOrigins":["https://your-domain.com"],
  "AllowedMethods":["PUT","GET","HEAD"],
  "AllowedHeaders":["Content-Type","Content-Length"],
  "ExposeHeaders":["ETag"],"MaxAgeSeconds":3600}]`}</pre>
                    <p className="text-xs text-amber-600">
                      Replace <code className="bg-amber-100 px-1 rounded">your-domain.com</code> with your actual domain. Without this, uploads over 100MB will fail.
                    </p>
                  </div>
                </div>
              </div>
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
          <DashboardCard className={testResult.success ? "border-green-500" : "border-red-500"} bodyClassName="flex items-center gap-3 p-4">
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
          </DashboardCard>
        </div>
      )}
    </div>
  );
}
