/**
 * UserLlmKeysPanel — manages user-provided LLM API keys (OpenAI, Anthropic, etc.)
 *
 * Keys are stored server-side with AES-256-GCM encryption via trpc.userApiKeys.*
 * The raw key is NEVER returned to the client — only a keyHint (last 4 chars).
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Key, Trash2, CheckCircle2, Pencil, Plus, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const LLM_PROVIDERS = [
  { id: "openai" as const, label: "OpenAI" },
  { id: "anthropic" as const, label: "Anthropic" },
  { id: "deepseek" as const, label: "DeepSeek" },
  { id: "google" as const, label: "Google AI" },
  { id: "openrouter" as const, label: "OpenRouter" },
] as const;

type ProviderId = (typeof LLM_PROVIDERS)[number]["id"];

export function UserLlmKeysPanel() {
  const [editingProvider, setEditingProvider] = useState<ProviderId | null>(
    null,
  );
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<ProviderId | null>(null);

  const utils = trpc.useUtils();
  const policyQuery = trpc.userApiKeys.getPolicy.useQuery();
  const listQuery = trpc.userApiKeys.listKeys.useQuery();
  const selfServiceAllowed = policyQuery.data?.allowed ?? false;

  const setKeyMutation = trpc.userApiKeys.setKey.useMutation({
    onSuccess: (_data, variables) => {
      toast.success(`${variables.provider} key saved`);
      setApiKeyInput("");
      setEditingProvider(null);
      utils.userApiKeys.listKeys.invalidate();
    },
    onError: (error) => {
      if (error.message?.includes("disabled by admin")) {
        toast.error("Admin has disabled personal LLM API keys");
        return;
      }
      toast.error(error.message?.includes("UNAUTHORIZED") ? "Please log in" : "Failed to save key");
    },
  });

  const deleteKeyMutation = trpc.userApiKeys.deleteKey.useMutation({
    onSuccess: (_data, variables) => {
      toast.success(`${variables.provider} key removed`);
      setConfirmDelete(null);
      utils.userApiKeys.listKeys.invalidate();
    },
    onError: (error) => {
      toast.error(error.message?.includes("UNAUTHORIZED") ? "Please log in" : "Failed to delete key");
    },
  });

  const configuredMap = new Map(
    (listQuery.data ?? []).map((k) => [k.provider, k]),
  );

  function handleSave(provider: ProviderId) {
    if (!selfServiceAllowed) return;
    if (!apiKeyInput.trim()) return;
    setKeyMutation.mutate({ provider, apiKey: apiKeyInput.trim() });
  }

  function handleDelete(provider: ProviderId) {
    setConfirmDelete(provider);
  }

  function confirmDeleteKey() {
    if (confirmDelete) {
      deleteKeyMutation.mutate({ provider: confirmDelete });
      setConfirmDelete(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Key className="w-5 h-5 text-blue-600" />
          <CardTitle>LLM API Keys</CardTitle>
        </div>
        <CardDescription>
          {selfServiceAllowed
            ? "Add your own API keys to use LLM providers directly. Keys are encrypted at rest and never exposed after saving."
            : "Personal LLM API keys are currently disabled by admin for this workspace."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {listQuery.isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        )}
        {listQuery.isError && (
          <div className="flex items-center gap-2 text-sm text-red-600">
            <AlertCircle className="w-4 h-4" />
            Failed to load API keys
          </div>
        )}
        {!listQuery.isLoading && !listQuery.isError && !policyQuery.isLoading && !selfServiceAllowed && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Admin has disabled personal LLM API keys for this workspace. This section will become available only after an admin enables it.
          </div>
        )}
        {!listQuery.isLoading && !listQuery.isError && (
        selfServiceAllowed ? (
        <div className="space-y-3">
          {LLM_PROVIDERS.map(({ id, label }) => {
            const config = configuredMap.get(id);
            const isEditing = editingProvider === id;

            return (
              <div
                key={id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-medium text-sm">{label}</span>
                  {config ? (
                    <Badge
                      variant="outline"
                      className="text-green-600 border-green-300"
                    >
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      ...{config.keyHint}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-gray-500">
                      Not configured
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {isEditing && selfServiceAllowed ? (
                    <>
                      <Input
                        type="password"
                        placeholder="Paste API key"
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        className="w-60 h-8 text-sm"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSave(id);
                          if (e.key === "Escape") {
                            setEditingProvider(null);
                            setApiKeyInput("");
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        onClick={() => handleSave(id)}
                        disabled={
                          !apiKeyInput.trim() || setKeyMutation.isPending
                        }
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingProvider(null);
                          setApiKeyInput("");
                        }}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      {selfServiceAllowed ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingProvider(id);
                            setApiKeyInput("");
                          }}
                        >
                          {config ? (
                            <>
                              <Pencil className="w-3 h-3 mr-1" /> Edit
                            </>
                          ) : (
                            <>
                              <Plus className="w-3 h-3 mr-1" /> Add Key
                            </>
                          )}
                        </Button>
                      ) : (
                        <Badge variant="secondary" className="text-gray-500">
                          Disabled by admin
                        </Badge>
                      )}
                      {config && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => handleDelete(id)}
                          disabled={deleteKeyMutation.isPending}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        ) : null
        )}
      </CardContent>

      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove API Key</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete your {confirmDelete} API key. Any active requests using this key will fail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteKey}>Delete Key</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
