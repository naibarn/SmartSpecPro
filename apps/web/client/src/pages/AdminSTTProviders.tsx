/**
 * Admin STT Providers — Configure Speech-to-Text providers
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { LocaleToggle } from "@/components/LocaleToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  Mic,
  ExternalLink,
  Check,
  Eye,
  EyeOff,
  Save,
  Trash2,
  TestTube2,
  Loader2,
} from "lucide-react";

export default function AdminSTTProviders() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [editId, setEditId] = useState<number | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);

  const { data: providers, refetch } = trpc.sttProviders.list.useQuery(
    undefined,
    {
      enabled: isAuthenticated && user?.role === "admin",
    }
  );
  const { data: templates } = trpc.sttProviders.templates.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "admin",
  });

  const upsertMutation = trpc.sttProviders.upsert.useMutation({
    onSuccess: () => {
      toast.success("STT provider saved");
      refetch();
      setEditId(null);
      setApiKey("");
    },
    onError: (err: any) => toast.error(err.message),
  });
  const deleteMutation = trpc.sttProviders.delete.useMutation({
    onSuccess: () => {
      toast.success("STT provider removed");
      refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });
  const toggleMutation = trpc.sttProviders.toggleEnabled.useMutation({
    onSuccess: () => refetch(),
    onError: (err: any) => toast.error(err.message),
  });
  const testMutation = trpc.sttProviders.testConnection.useMutation({
    onSuccess: data => {
      if (data.success) toast.success(data.message);
      else toast.error(data.message);
    },
    onError: (err: any) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Access denied</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20">
      {/* Header */}
      <header className="bg-white/70 backdrop-blur-xl border-b border-gray-200/50 sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/dashboard")}
                className="text-gray-600"
              >
                <ChevronLeft className="w-5 h-5 mr-1" />
                Back
              </Button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                  <Mic className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">
                    Speech-to-Text Providers
                  </h1>
                  <p className="text-sm text-gray-500">
                    Configure STT providers for voice transcription
                  </p>
                </div>
              </div>
            </div>
            <LocaleToggle className="shrink-0" />
          </div>
        </div>
      </header>

      <main className="px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Provider cards */}
        {(templates || []).map(tpl => {
          const configured = providers?.find(
            (p: any) => p.providerName === tpl.providerName
          );
          const isEditing = editId === (configured?.id ?? -1);

          return (
            <div
              key={tpl.providerName}
              className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg shadow-purple-500/5 p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      configured?.hasApiKey ? "bg-green-100" : "bg-gray-100"
                    }`}
                  >
                    <Mic
                      className={`w-6 h-6 ${configured?.hasApiKey ? "text-green-600" : "text-gray-400"}`}
                    />
                  </div>
                  <div>
                    <div className="font-bold text-gray-900 text-lg">
                      {tpl.displayName}
                    </div>
                    <div className="text-sm text-gray-500">
                      {tpl.description}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {configured?.hasApiKey && (
                    <Badge
                      variant="outline"
                      className="text-green-600 border-green-600"
                    >
                      <Check className="w-3 h-3 mr-1" />
                      Configured
                    </Badge>
                  )}
                  {configured && (
                    <button
                      onClick={() =>
                        toggleMutation.mutate({ id: configured.id })
                      }
                      className={`relative w-11 h-6 rounded-full transition-colors ${
                        configured.isEnabled ? "bg-green-500" : "bg-gray-300"
                      }`}
                    >
                      <div
                        className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                          configured.isEnabled
                            ? "translate-x-5"
                            : "translate-x-0"
                        }`}
                      />
                    </button>
                  )}
                </div>
              </div>

              {/* Info row */}
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 mb-4">
                <span>
                  Model:{" "}
                  <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">
                    {tpl.defaultModel}
                  </code>
                </span>
                <span>
                  Cost:{" "}
                  <strong
                    className={
                      tpl.creditCostPerMinute === 0
                        ? "text-green-600"
                        : "text-gray-700"
                    }
                  >
                    {tpl.creditCostPerMinute === 0
                      ? "Free"
                      : `${tpl.creditCostPerMinute} credits/min`}
                  </strong>
                </span>
                <a
                  href={tpl.signupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-600 hover:underline flex items-center gap-1"
                >
                  Get API Key <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* Edit area */}
              {isEditing ? (
                <div className="space-y-3 border-t border-gray-200 pt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      API Key
                    </label>
                    <div className="relative">
                      <Input
                        type={showApiKey ? "text" : "password"}
                        placeholder="Enter API key..."
                        value={apiKey}
                        onChange={e => setApiKey(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showApiKey ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        upsertMutation.mutate({
                          id: configured?.id,
                          providerName: tpl.providerName,
                          displayName: tpl.displayName,
                          description: tpl.description,
                          baseUrl: tpl.baseUrl,
                          defaultModel: tpl.defaultModel,
                          apiKey: apiKey || undefined,
                          isEnabled: true,
                          configJson: {
                            signupUrl: tpl.signupUrl,
                            creditCostPerMinute: tpl.creditCostPerMinute,
                          },
                        });
                      }}
                      disabled={upsertMutation.isPending}
                      className="bg-purple-600 hover:bg-purple-700"
                    >
                      {upsertMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4 mr-1" />
                      )}
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditId(null);
                        setApiKey("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 border-t border-gray-200 pt-4">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditId(configured?.id ?? -1);
                      setApiKey("");
                    }}
                  >
                    {configured?.hasApiKey ? "Update Key" : "Configure"}
                  </Button>
                  {configured?.hasApiKey && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          testMutation.mutate({ id: configured.id })
                        }
                        disabled={testMutation.isPending}
                      >
                        {testMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <TestTube2 className="w-4 h-4 mr-1" />
                        )}
                        Test Connection
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-500 hover:text-red-700"
                        onClick={() =>
                          deleteMutation.mutate({ id: configured.id })
                        }
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Usage info */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <Mic className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-blue-900 mb-2">How it works</h3>
              <ul className="text-sm text-blue-700 list-disc list-inside space-y-1">
                <li>Configure at least one STT provider above</li>
                <li>
                  Users can press the microphone button in Chat to dictate
                </li>
                <li>
                  Audio is sent to the first enabled provider for transcription
                </li>
                <li>
                  Credits are deducted based on the provider's cost per minute
                </li>
                <li>
                  Groq offers free Whisper transcription — recommended to start
                </li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
