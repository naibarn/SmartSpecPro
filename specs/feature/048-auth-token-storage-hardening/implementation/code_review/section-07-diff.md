diff --git a/apps/web/client/src/components/settings/UserLlmKeysPanel.tsx b/apps/web/client/src/components/settings/UserLlmKeysPanel.tsx
new file mode 100644
index 00000000..a3a12a78
--- /dev/null
+++ b/apps/web/client/src/components/settings/UserLlmKeysPanel.tsx
@@ -0,0 +1,194 @@
+/**
+ * UserLlmKeysPanel — manages user-provided LLM API keys (OpenAI, Anthropic, etc.)
+ *
+ * Keys are stored server-side with AES-256-GCM encryption via trpc.userApiKeys.*
+ * The raw key is NEVER returned to the client — only a keyHint (last 4 chars).
+ */
+
+import { useState } from "react";
+import { trpc } from "@/lib/trpc";
+import {
+  Card,
+  CardContent,
+  CardDescription,
+  CardHeader,
+  CardTitle,
+} from "@/components/ui/card";
+import { Badge } from "@/components/ui/badge";
+import { Button } from "@/components/ui/button";
+import { Input } from "@/components/ui/input";
+import { Key, Trash2, CheckCircle2, Pencil, Plus } from "lucide-react";
+import { toast } from "sonner";
+
+const LLM_PROVIDERS = [
+  { id: "openai" as const, label: "OpenAI" },
+  { id: "anthropic" as const, label: "Anthropic" },
+  { id: "deepseek" as const, label: "DeepSeek" },
+  { id: "google" as const, label: "Google AI" },
+  { id: "openrouter" as const, label: "OpenRouter" },
+] as const;
+
+type ProviderId = (typeof LLM_PROVIDERS)[number]["id"];
+
+export function UserLlmKeysPanel() {
+  const [editingProvider, setEditingProvider] = useState<ProviderId | null>(
+    null,
+  );
+  const [apiKeyInput, setApiKeyInput] = useState("");
+
+  const listQuery = trpc.userApiKeys.listKeys.useQuery();
+
+  const setKeyMutation = trpc.userApiKeys.setKey.useMutation({
+    onSuccess: (_data, variables) => {
+      toast.success(`${variables.provider} key saved`);
+      setApiKeyInput("");
+      setEditingProvider(null);
+      listQuery.refetch();
+    },
+    onError: (error) => {
+      toast.error(error.message || "Failed to save key");
+    },
+  });
+
+  const deleteKeyMutation = trpc.userApiKeys.deleteKey.useMutation({
+    onSuccess: (_data, variables) => {
+      toast.success(`${variables.provider} key removed`);
+      listQuery.refetch();
+    },
+    onError: (error) => {
+      toast.error(error.message || "Failed to delete key");
+    },
+  });
+
+  const configuredMap = new Map(
+    (listQuery.data ?? []).map((k) => [k.provider, k]),
+  );
+
+  function handleSave(provider: ProviderId) {
+    if (!apiKeyInput.trim()) return;
+    setKeyMutation.mutate({ provider, apiKey: apiKeyInput.trim() });
+  }
+
+  function handleDelete(provider: ProviderId) {
+    deleteKeyMutation.mutate({ provider });
+  }
+
+  return (
+    <Card>
+      <CardHeader>
+        <div className="flex items-center gap-2">
+          <Key className="w-5 h-5 text-blue-600" />
+          <CardTitle>LLM API Keys</CardTitle>
+        </div>
+        <CardDescription>
+          Add your own API keys to use LLM providers directly. Keys are
+          encrypted at rest and never exposed after saving.
+        </CardDescription>
+      </CardHeader>
+      <CardContent>
+        <div className="space-y-3">
+          {LLM_PROVIDERS.map(({ id, label }) => {
+            const config = configuredMap.get(id);
+            const isEditing = editingProvider === id;
+
+            return (
+              <div
+                key={id}
+                className="flex items-center justify-between gap-3 rounded-lg border p-3"
+              >
+                <div className="flex items-center gap-3 min-w-0">
+                  <span className="font-medium text-sm">{label}</span>
+                  {config ? (
+                    <Badge
+                      variant="outline"
+                      className="text-green-600 border-green-300"
+                    >
+                      <CheckCircle2 className="w-3 h-3 mr-1" />
+                      ...{config.keyHint}
+                    </Badge>
+                  ) : (
+                    <Badge variant="secondary" className="text-gray-500">
+                      Not configured
+                    </Badge>
+                  )}
+                </div>
+
+                <div className="flex items-center gap-2">
+                  {isEditing ? (
+                    <>
+                      <Input
+                        type="password"
+                        placeholder="Paste API key"
+                        value={apiKeyInput}
+                        onChange={(e) => setApiKeyInput(e.target.value)}
+                        className="w-60 h-8 text-sm"
+                        onKeyDown={(e) => {
+                          if (e.key === "Enter") handleSave(id);
+                          if (e.key === "Escape") {
+                            setEditingProvider(null);
+                            setApiKeyInput("");
+                          }
+                        }}
+                      />
+                      <Button
+                        size="sm"
+                        onClick={() => handleSave(id)}
+                        disabled={
+                          !apiKeyInput.trim() || setKeyMutation.isPending
+                        }
+                      >
+                        Save
+                      </Button>
+                      <Button
+                        size="sm"
+                        variant="ghost"
+                        onClick={() => {
+                          setEditingProvider(null);
+                          setApiKeyInput("");
+                        }}
+                      >
+                        Cancel
+                      </Button>
+                    </>
+                  ) : (
+                    <>
+                      <Button
+                        size="sm"
+                        variant="outline"
+                        onClick={() => {
+                          setEditingProvider(id);
+                          setApiKeyInput("");
+                        }}
+                      >
+                        {config ? (
+                          <>
+                            <Pencil className="w-3 h-3 mr-1" /> Edit
+                          </>
+                        ) : (
+                          <>
+                            <Plus className="w-3 h-3 mr-1" /> Add Key
+                          </>
+                        )}
+                      </Button>
+                      {config && (
+                        <Button
+                          size="sm"
+                          variant="ghost"
+                          className="text-red-600 hover:text-red-700"
+                          onClick={() => handleDelete(id)}
+                          disabled={deleteKeyMutation.isPending}
+                        >
+                          <Trash2 className="w-3 h-3" />
+                        </Button>
+                      )}
+                    </>
+                  )}
+                </div>
+              </div>
+            );
+          })}
+        </div>
+      </CardContent>
+    </Card>
+  );
+}
diff --git a/apps/web/client/src/pages/Settings.tsx b/apps/web/client/src/pages/Settings.tsx
index 9fc1dcf5..1d305fc2 100644
--- a/apps/web/client/src/pages/Settings.tsx
+++ b/apps/web/client/src/pages/Settings.tsx
@@ -60,6 +60,7 @@ import { QRCodeSVG } from 'qrcode.react';
 import { GoogleDrivePanel } from '@/components/settings/GoogleDrivePanel';
 import { OneDrivePanel } from '@/components/settings/OneDrivePanel';
 import { UserAPIKeysPanel } from '@/components/settings/UserAPIKeysPanel';
+import { UserLlmKeysPanel } from '@/components/settings/UserLlmKeysPanel';
 import { BudgetPanel } from '@/components/settings/BudgetPanel';
 import { PersonasPanel } from '@/components/settings/PersonasPanel';
 import { UserAutomationPreferencesPanel } from '@/components/settings/UserAutomationPreferencesPanel';
@@ -1393,6 +1394,7 @@ export default function Settings() {
               {activeTab === 'api' && (
                 <div className="space-y-6">
                   <UserAPIKeysPanel />
+                  <UserLlmKeysPanel />
 
                   {/* Context7 API Key */}
                   <div className="border-t border-gray-200 pt-6 mt-6">
diff --git a/apps/web/client/src/services/authService.ts b/apps/web/client/src/services/authService.ts
index 28c8a0f4..b036caa6 100644
--- a/apps/web/client/src/services/authService.ts
+++ b/apps/web/client/src/services/authService.ts
@@ -301,53 +301,3 @@ export async function initializeAuth(): Promise<void> {
   await verifyToken();
 }
 
-// ============================================
-// API Key Management
-// TODO: Move API keys to server-side encrypted store (crypto.ts AES-256-GCM)
-// ============================================
-
-export type LLMProvider = 'openrouter' | 'openai' | 'anthropic' | 'deepseek' | 'google';
-
-export async function setApiKey(provider: LLMProvider, apiKey: string): Promise<void> {
-  try {
-    if (hasTauri()) {
-      await safeInvoke('set_api_key', { provider, apiKey });
-      return;
-    }
-  } catch { /* fallback */ }
-  sessionStorage.setItem(`smartspec_apikey_${provider}`, apiKey);
-}
-
-export async function getApiKey(provider: LLMProvider): Promise<string | null> {
-  try {
-    if (hasTauri()) {
-      return await safeInvoke<string | null>('get_api_key', { provider });
-    }
-  } catch { /* fallback */ }
-  return sessionStorage.getItem(`smartspec_apikey_${provider}`);
-}
-
-export async function deleteApiKey(provider: LLMProvider): Promise<void> {
-  try {
-    if (hasTauri()) {
-      await safeInvoke('delete_api_key', { provider });
-      return;
-    }
-  } catch { /* fallback */ }
-  sessionStorage.removeItem(`smartspec_apikey_${provider}`);
-}
-
-export async function listStoredApiKeys(): Promise<string[]> {
-  try {
-    if (hasTauri()) {
-      return await safeInvoke<string[]>('list_stored_api_keys');
-    }
-  } catch { /* fallback */ }
-  const providers: LLMProvider[] = ['openrouter', 'openai', 'anthropic', 'deepseek', 'google'];
-  return providers.filter(p => !!sessionStorage.getItem(`smartspec_apikey_${p}`));
-}
-
-export async function hasApiKey(provider: LLMProvider): Promise<boolean> {
-  const key = await getApiKey(provider);
-  return key !== null && key.length > 0;
-}
