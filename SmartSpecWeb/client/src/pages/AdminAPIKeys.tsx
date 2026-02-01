import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Key,
  Plus,
  Trash2,
  RefreshCw,
  Copy,
  CheckCircle2,
  XCircle,
  Activity,
  Calendar,
  Eye,
  EyeOff,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface APIKey {
  id: string;
  name: string;
  key: string;
  key_prefix: string;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
  last_used_at: string | null;
  usage_count: number;
  rate_limit: number | null;
}

interface APIKeyUsage {
  date: string;
  requests: number;
  errors: number;
}

export default function AdminAPIKeys() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [deleteKeyId, setDeleteKeyId] = useState<string | null>(null);
  const [viewingUsage, setViewingUsage] = useState<string | null>(null);
  const [showKey, setShowKey] = useState<string | null>(null);
  const [newKeyData, setNewKeyData] = useState({
    name: "",
    expires_in_days: 365,
    rate_limit: 100,
  });

  // Fetch API keys
  const { data: apiKeys, isLoading } = useQuery({
    queryKey: ["api-keys"],
    queryFn: async () => {
      const response = await fetch("/api/v1/api-keys", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch API keys");
      return response.json() as Promise<APIKey[]>;
    },
  });

  // Fetch usage for specific key
  const { data: usage } = useQuery({
    queryKey: ["api-key-usage", viewingUsage],
    queryFn: async () => {
      if (!viewingUsage) return null;
      const response = await fetch(`/api/v1/api-keys/${viewingUsage}/usage`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch usage");
      return response.json() as Promise<APIKeyUsage[]>;
    },
    enabled: !!viewingUsage,
  });

  // Create API key
  const createMutation = useMutation({
    mutationFn: async (data: typeof newKeyData) => {
      const response = await fetch("/api/v1/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to create API key");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      setIsCreateDialogOpen(false);
      setNewKeyData({ name: "", expires_in_days: 365, rate_limit: 100 });
      toast({
        title: "API Key Created",
        description: "Make sure to copy your API key now. You won't be able to see it again!",
      });
      setShowKey(data.key);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create API key",
        variant: "destructive",
      });
    },
  });

  // Rotate API key
  const rotateMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/v1/api-keys/${id}/rotate`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to rotate API key");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast({
        title: "API Key Rotated",
        description: "New key generated. Old key is now invalid.",
      });
      setShowKey(data.key);
    },
  });

  // Delete API key
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/v1/api-keys/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to delete API key");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      setDeleteKeyId(null);
      toast({
        title: "API Key Deleted",
        description: "The API key has been permanently deleted",
      });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied to clipboard",
      description: "API key copied successfully",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20 px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">API Keys Management</h1>
          <p className="text-muted-foreground">
            Create and manage API keys for external integrations
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create API Key
        </Button>
      </div>

      {/* API Keys List */}
      <Card>
        <CardHeader>
          <CardTitle>Active API Keys</CardTitle>
          <CardDescription>Manage your API keys and monitor their usage</CardDescription>
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
                  <TableHead>Key Prefix</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Rate Limit</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apiKeys?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      No API keys found. Create one to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  apiKeys?.map((key) => (
                    <TableRow key={key.id}>
                      <TableCell className="font-medium">{key.name}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {key.key_prefix}...
                      </TableCell>
                      <TableCell>
                        {key.is_active ? (
                          <Badge variant="outline" className="border-green-500 text-green-500">
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-red-500 text-red-500">
                            <XCircle className="mr-1 h-3 w-3" />
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setViewingUsage(key.id)}
                        >
                          <Activity className="mr-1 h-3 w-3" />
                          {key.usage_count?.toLocaleString() || 0}
                        </Button>
                      </TableCell>
                      <TableCell>{key.rate_limit || "Unlimited"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {key.expires_at
                          ? new Date(key.expires_at).toLocaleDateString()
                          : "Never"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(key.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => rotateMutation.mutate(key.id)}
                          >
                            <RefreshCw className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteKeyId(key.id)}
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

      {/* Create API Key Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New API Key</DialogTitle>
            <DialogDescription>
              Generate a new API key for external integrations
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Key Name</Label>
              <Input
                id="name"
                placeholder="Production API Key"
                value={newKeyData.name}
                onChange={(e) =>
                  setNewKeyData({ ...newKeyData, name: e.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor="expires">Expires In (Days)</Label>
              <Input
                id="expires"
                type="number"
                value={newKeyData.expires_in_days}
                onChange={(e) =>
                  setNewKeyData({
                    ...newKeyData,
                    expires_in_days: parseInt(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <Label htmlFor="rate_limit">Rate Limit (requests/minute)</Label>
              <Input
                id="rate_limit"
                type="number"
                value={newKeyData.rate_limit}
                onChange={(e) =>
                  setNewKeyData({
                    ...newKeyData,
                    rate_limit: parseInt(e.target.value),
                  })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate(newKeyData)}
              disabled={!newKeyData.name || createMutation.isPending}
            >
              {createMutation.isPending ? "Creating..." : "Create API Key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Show New Key Dialog */}
      {showKey && (
        <Dialog open={!!showKey} onOpenChange={() => setShowKey(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Your New API Key</DialogTitle>
              <DialogDescription>
                Make sure to copy this key now. You won't be able to see it again!
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <code className="text-sm font-mono break-all">{showKey}</code>
              </div>
              <Button
                onClick={() => copyToClipboard(showKey)}
                className="w-full"
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy to Clipboard
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteKeyId} onOpenChange={() => setDeleteKeyId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete API Key?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the API key
              and all services using it will stop working.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteKeyId && deleteMutation.mutate(deleteKeyId)}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Usage Dialog */}
      {viewingUsage && (
        <Dialog open={!!viewingUsage} onOpenChange={() => setViewingUsage(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>API Key Usage</DialogTitle>
              <DialogDescription>Recent usage statistics</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {usage?.map((day, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{day.date}</p>
                      <p className="text-xs text-muted-foreground">
                        {day.requests} requests, {day.errors} errors
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline">
                    {((day.errors / day.requests) * 100).toFixed(1)}% error rate
                  </Badge>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
