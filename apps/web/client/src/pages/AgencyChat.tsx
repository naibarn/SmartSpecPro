import { useEffect, useMemo, useRef, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useAgencyStream } from "@/hooks/useAgencyStream";
import { useAgencyById } from "@/hooks/useAgencyQuery";
import { ModelPicker } from "@/components/agency/ModelPicker";
import AgencyActivityPanel from "@/components/agency/AgencyActivityPanel";
import { BrowserSessionSummaryCard } from "@/components/browser-session/BrowserSessionSummaryCard";
import { BrowserSessionLaunchSuggestionCard } from "@/components/browser-session/BrowserSessionLaunchSuggestionCard";
import { AgencyPreviewCard, type AgencyPreviewProps } from "@/components/agency/preview";
import { HelpButton } from "@/components/help";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import {
  Send,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  AlertCircle,
  Users,
  CreditCard,
  ChevronLeft,
  Bot,
  Crown,
  Settings2,
  RefreshCw,
  MonitorPlay,
  X,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { SafeMarkdown } from "@/components/chat/SafeMarkdown";
import {
  trackBrowserSessionOpened,
  trackBrowserSessionReopened,
} from "@/lib/analytics/browserSessionEvents";
import {
  buildBrowserSessionPath,
} from "@/lib/browserSessionRouting";
import {
  detectBrowserSessionLaunchSuggestion,
  type BrowserSessionLaunchSuggestion,
} from "@/lib/browserSessionInvocation";
import {
  buildBrowserSessionSummary,
  parseBrowserSessionArtifact,
  type BrowserSessionArtifact,
  type BrowserSessionLaunchContext,
} from "@shared/browserSession";
import {
  BROWSER_SKILL_PRESETS,
  buildBrowserInstruction,
  deriveBrowserSkillSelection,
  inferBrowserSkillId,
} from "@shared/browserSkills";
import type { LiveBrowserCreateSessionRequest } from "@shared/liveBrowser";


const AGENT_COLORS = [
  "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
];

function getAgentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
  }
  return AGENT_COLORS[Math.abs(hash) % AGENT_COLORS.length];
}

export default function AgencyChat() {
  const { isLoading: authLoading, isAuthenticated, user } = useAuth();
  const [, setLocation] = useLocation();
  const [matched, params] = useRoute("/agencies/:id");
  const agencyId = (params as Record<string, string>)?.id as
    | string
    | undefined;

  const [input, setInput] = useState("");
  const [panelOpen, setPanelOpen] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= 1024,
  );
  const [conversationId] = useState<string | undefined>();
  const [modelOverride, setModelOverride] = useState("");
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [recipientAgent, setRecipientAgent] = useState("");
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [runOptionsOpen, setRunOptionsOpen] = useState(false);
  const [returnBrowserSessionId, setReturnBrowserSessionId] = useState<string | null>(null);
  const [browserSessionSuggestion, setBrowserSessionSuggestion] = useState<BrowserSessionLaunchSuggestion | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();
  const { data: tenantFlags } = trpc.tenantFeatureFlags.getFeatureFlags.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const createLiveBrowserSessionMutation = trpc.liveBrowser.createSession.useMutation();
  const sendLiveBrowserCommandMutation = trpc.liveBrowser.sendCommand.useMutation();
  const [browserSessionArtifact, setBrowserSessionArtifact] = useState<BrowserSessionArtifact | null>(null);
  const [browserCommandDraft, setBrowserCommandDraft] = useState("");
  const [browserCommandSkillId, setBrowserCommandSkillId] = useState(() => inferBrowserSkillId(""));
  const [browserCommandSkillSelectionMode, setBrowserCommandSkillSelectionMode] = useState<"auto" | "manual">("auto");
  const [browserCommandBusy, setBrowserCommandBusy] = useState(false);
  const [browserCommandNotice, setBrowserCommandNotice] = useState<string | null>(null);
  const [agencyPreview, setAgencyPreview] = useState<(AgencyPreviewProps & { runId: string }) | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Feature flag is enforced server-side: agency.getById throws NOT_FOUND
  // when AGENCY_SWARM_ENABLED is false, which sets isError=true below.
  const {
    data: agency,
    isLoading: agencyLoading,
    isError: agencyError,
  } = useAgencyById(agencyId);

  const agencyBrowserSessionEnabled = Boolean(tenantFlags?.agencyBrowserSessionUi);

  const browserSessionStorageKey = useMemo(
    () => (agencyId ? `agency-browser-session:${agencyId}` : null),
    [agencyId],
  );
  const stream = useAgencyStream({
    onBrowserSession: (artifact) => {
      storeBrowserSessionArtifact(artifact);
    },
    onPreviewReady: ({ runId }) => {
      if (!agencyId || !runId) {
        return;
      }

      setPreviewLoading(true);
      utils.agency.getRunPreview.fetch({ agencyId, runId })
        .then((result) => {
          const preview = result.preview;
          if (!preview) {
            setAgencyPreview(null);
            return;
          }

          setAgencyPreview({
            previewType: preview.previewType,
            artifactId: preview.artifactId,
            intent: preview.intent,
            lifecycleState: preview.lifecycleState,
            summaryText: preview.summaryText,
            provenance: preview.provenance,
            commit: preview.commit,
            data: preview.data,
            runId,
          });
        })
        .catch((error) => {
          console.error("[AgencyChat] failed to load preview", error);
          toast.error("Failed to load preview. Please try again.");
        })
        .finally(() => setPreviewLoading(false));
    },
  });

  // Auth redirect
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  // Redirect to dashboard if agency feature is disabled (tRPC returns NOT_FOUND)
  useEffect(() => {
    if (!agencyLoading && agencyError) {
      setLocation("/dashboard");
    }
  }, [agencyLoading, agencyError, setLocation]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [stream.messages]);

  useEffect(() => {
    if (!browserSessionStorageKey || typeof window === "undefined") {
      setBrowserSessionArtifact(null);
      return;
    }

    try {
      setBrowserSessionArtifact(
        parseBrowserSessionArtifact(
          JSON.parse(window.sessionStorage.getItem(browserSessionStorageKey) ?? "null"),
        ),
      );
    } catch {
      setBrowserSessionArtifact(null);
    }
  }, [browserSessionStorageKey]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const browserSessionId = params.get("browserSessionId");
    if (!browserSessionId) {
      return;
    }

    setReturnBrowserSessionId(browserSessionId);
    window.history.replaceState({}, "", agencyId ? `/agencies/${agencyId}` : "/agencies");
  }, [agencyId]);

  const handleSend = () => {
    const message = input.trim();
    if (!message || !agencyId || stream.isStreaming) return;

    setBrowserSessionSuggestion(
      agencyBrowserSessionEnabled
        ? detectBrowserSessionLaunchSuggestion({
          message,
          originSurface: "agency",
          sourceId: agencyId,
        })
        : null,
    );
    setAgencyPreview(null);

    stream.connect({
      agencyId,
      conversationId,
      message,
      ...(modelOverride ? { modelOverride } : {}),
      ...(recipientAgent ? { recipientAgent } : {}),
      ...(additionalInstructions ? { additionalInstructions } : {}),
    });
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleRetry = () => {
    if (stream.messages.length > 0 && agencyId) {
      const lastUserMsg = [...stream.messages]
        .reverse()
        .find((m) => m.role === "user");
      if (lastUserMsg) {
        stream.connect({
          agencyId,
          conversationId,
          message: lastUserMsg.content,
          ...(modelOverride ? { modelOverride } : {}),
        });
      }
    }
  };

  const buildAgencyLaunchContext = (sessionId: string): BrowserSessionLaunchContext | null => {
    if (!agencyId) {
      return null;
    }

    return {
      originSurface: "agency",
      originLabel: "Agency",
      sourceId: agencyId,
      returnContext: {
        path: `/agencies/${agencyId}?browserSessionId=${encodeURIComponent(sessionId)}`,
        label: "Return to Agency",
      },
    };
  };

  function storeBrowserSessionArtifact(artifactInput: BrowserSessionArtifact) {
    const launchContext = artifactInput.launchContext ?? buildAgencyLaunchContext(artifactInput.sessionId) ?? undefined;
    const artifact = {
      ...artifactInput,
      launchContext,
    } satisfies BrowserSessionArtifact;

    setBrowserSessionArtifact(artifact);
    if (browserSessionStorageKey && typeof window !== "undefined") {
      window.sessionStorage.setItem(browserSessionStorageKey, JSON.stringify(artifact));
    }
    return artifact;
  }

  const persistBrowserSessionArtifact = async (sessionId: string) => {
    if (!agencyId || !user?.id) {
      return null;
    }

    const session = await utils.liveBrowser.getSession.fetch({
      sessionId,
      actor: { actorType: "user", actorId: String(user.id) },
    });
    const launchContext = buildAgencyLaunchContext(sessionId);
    const artifact = {
      sessionId,
      summary: buildBrowserSessionSummary(session, { launchContext }),
      launchContext: launchContext ?? undefined,
      updatedAt: session.lastActivityAt,
    } satisfies BrowserSessionArtifact;

    return storeBrowserSessionArtifact(artifact);
  };

  useEffect(() => {
    if (!returnBrowserSessionId || !agencyBrowserSessionEnabled) {
      return;
    }

    persistBrowserSessionArtifact(returnBrowserSessionId).finally(() => {
      setReturnBrowserSessionId(null);
    });
  }, [agencyBrowserSessionEnabled, returnBrowserSessionId]);

  useEffect(() => {
    if (!agencyBrowserSessionEnabled) {
      setBrowserSessionSuggestion(null);
    }
  }, [agencyBrowserSessionEnabled, agencyId]);

  useEffect(() => {
    setBrowserCommandDraft("");
    setBrowserCommandSkillId(inferBrowserSkillId(""));
    setBrowserCommandSkillSelectionMode("auto");
    setBrowserCommandBusy(false);
    setBrowserCommandNotice(null);
  }, [agencyId, browserSessionArtifact?.sessionId]);

  const handleBrowserCommandDraftChange = (nextValue: string) => {
    setBrowserCommandDraft(nextValue);
    const nextSelection = deriveBrowserSkillSelection({
      draft: nextValue,
      currentSkillId: browserCommandSkillId,
      selectionMode: browserCommandSkillSelectionMode,
    });
    setBrowserCommandSkillId(nextSelection.skillId);
    setBrowserCommandSkillSelectionMode(nextSelection.selectionMode);
  };

  const handleBrowserCommandSkillChange = (value: typeof browserCommandSkillId) => {
    setBrowserCommandSkillId(value);
    setBrowserCommandSkillSelectionMode("manual");
  };

  const handleOpenBrowserSession = async (options?: {
    launchPath?: "direct" | "suggested";
    launchIntent?: BrowserSessionLaunchSuggestion["launchIntent"];
    executionIntent?: LiveBrowserCreateSessionRequest["executionIntent"];
  }) => {
    if (!agencyId || !user?.id) {
      return;
    }

    const launchPath = options?.launchPath ?? "direct";
    const launchIntent = options?.launchIntent;

    if (browserSessionArtifact?.sessionId) {
      trackBrowserSessionReopened({
        origin_surface: "agency",
        compact_layout: window.innerWidth < 768,
        session_kind: "resumed",
        launch_path: launchPath,
        launch_intent: launchIntent,
      });
      const launchContext = buildAgencyLaunchContext(browserSessionArtifact.sessionId);
      setLocation(buildBrowserSessionPath(browserSessionArtifact.sessionId, launchContext));
      return;
    }

    const created = await createLiveBrowserSessionMutation.mutateAsync({
      actor: { actorType: "user", actorId: String(user.id) },
      sourceType: "agency",
      sourceId: agencyId,
      mode: "observe",
      executionIntent: options?.executionIntent,
    });
    const artifact = await persistBrowserSessionArtifact(created.sessionId);
    trackBrowserSessionOpened({
      origin_surface: "agency",
      compact_layout: window.innerWidth < 768,
      session_kind: "created",
      launch_path: launchPath,
      launch_intent: launchIntent,
    });
    setLocation(buildBrowserSessionPath(created.sessionId, artifact?.launchContext ?? buildAgencyLaunchContext(created.sessionId)));
  };

  const handleConfirmBrowserSessionSuggestion = async (
    suggestion: BrowserSessionLaunchSuggestion,
  ) => {
    setBrowserSessionSuggestion(null);
    await handleOpenBrowserSession({
      launchPath: "suggested",
      launchIntent: suggestion.launchIntent,
      executionIntent: {
        prompt: suggestion.triggerMessage,
        skillId: inferBrowserSkillId(suggestion.triggerMessage),
        discoverWebsites: suggestion.launchIntent === "research_in_browser",
      },
    });
  };

  const handleDismissBrowserSessionSuggestion = (suggestionId: string) => {
    setBrowserSessionSuggestion((current) => (
      current?.suggestionId === suggestionId ? null : current
    ));
  };

  const handleSendBrowserSessionCommand = async () => {
    if (!browserSessionArtifact?.sessionId || !agencyId || !user?.id || !browserCommandDraft.trim()) {
      return;
    }

    try {
      setBrowserCommandBusy(true);
      setBrowserCommandNotice(null);
      const actor = { actorType: "user" as const, actorId: String(user.id) };
      const session = await utils.liveBrowser.getSession.fetch({
        sessionId: browserSessionArtifact.sessionId,
        actor,
      });

      await sendLiveBrowserCommandMutation.mutateAsync({
        sessionId: session.sessionId,
        sessionVersion: session.sessionVersion,
        idempotencyKey: `agency-browser-cmd-${Date.now()}`,
        actor,
        command: {
          type: "natural_language",
          text: buildBrowserInstruction({
            goal: browserCommandDraft.trim(),
            skillId: browserCommandSkillId,
          }),
        },
      });

      await persistBrowserSessionArtifact(browserSessionArtifact.sessionId);
      setBrowserCommandDraft("");
      setBrowserCommandSkillId(inferBrowserSkillId(""));
      setBrowserCommandSkillSelectionMode("auto");
      setBrowserCommandNotice("Instruction queued for this Browser Session.");
    } catch (error) {
      setBrowserCommandNotice(
        error instanceof Error ? error.message : "Failed to queue Browser Session instruction.",
      );
    } finally {
      setBrowserCommandBusy(false);
    }
  };

  if (authLoading || agencyLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!matched || !agencyId) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Agency not found</p>
      </div>
    );
  }

  const agents = agency?.agents ?? [];
  const entryAgent = agents.find((a: any) => a.isEntryPoint) ?? agents[0];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          {/* Back button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => setLocation("/agencies")}
            title="Back to Agencies"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
              <h1 className="text-base font-semibold truncate">
                {agency?.name || "Agency"}
              </h1>
              <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0">
                {agents.length} {agents.length === 1 ? "agent" : "agents"}
              </Badge>
            </div>

            {stream.activeAgent ? (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>Active:</span>
                <Badge
                  variant="secondary"
                  className={cn(
                    "text-[10px] px-1 py-0",
                    getAgentColor(stream.activeAgent),
                  )}
                >
                  {stream.activeAgent}
                </Badge>
              </div>
            ) : agency?.description ? (
              <p className="text-xs text-muted-foreground truncate max-w-xs">
                {agency.description}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <HelpButton page="/agency" variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-foreground" />
          {agencyBrowserSessionEnabled && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleOpenBrowserSession}
              disabled={createLiveBrowserSessionMutation.isPending}
              title="Open Browser Session"
            >
              <MonitorPlay className="h-3.5 w-3.5" />
              <span className="max-w-[160px] truncate">
                {browserSessionArtifact?.summary.primaryActionLabel ?? "Open Browser Session"}
              </span>
            </Button>
          )}
          {stream.creditsUsed > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground px-2">
              <CreditCard className="h-3 w-3" />
              <span>{stream.creditsUsed} credits</span>
            </div>
          )}

          {/* Model selector */}
          <Popover open={modelPickerOpen} onOpenChange={setModelPickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                title="Override model for this conversation"
              >
                <Settings2 className="h-3.5 w-3.5" />
                {modelOverride ? (
                  <span className="max-w-[120px] truncate">{modelOverride}</span>
                ) : (
                  <span>Model</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-3">
              <div className="space-y-2">
                <p className="text-xs font-medium">Override Model</p>
                <p className="text-[11px] text-muted-foreground">
                  Use a different model for this conversation. Leave empty to use
                  each agent's configured model.
                </p>
                <ModelPicker
                  value={modelOverride}
                  onChange={(v) => {
                    setModelOverride(v);
                    setModelPickerOpen(false);
                  }}
                />
                {modelOverride && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-full text-xs text-muted-foreground"
                    onClick={() => {
                      setModelOverride("");
                      setModelPickerOpen(false);
                    }}
                  >
                    <RefreshCw className="mr-1.5 h-3 w-3" />
                    Reset to agent defaults
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Edit button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setLocation(`/agencies/${agencyId}/edit`)}
            title="Edit Agency"
          >
            <Settings2 className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setPanelOpen(!panelOpen)}
          >
            {panelOpen ? (
              <PanelRightClose className="h-4 w-4" />
            ) : (
              <PanelRightOpen className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Conversation Thread */}
        <div className="flex flex-1 flex-col min-w-0">
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4"
          >
            <div className="mx-auto max-w-3xl space-y-4">
              {agencyBrowserSessionEnabled && browserSessionArtifact ? (
                <BrowserSessionSummaryCard
                  artifact={browserSessionArtifact}
                  onOpen={(artifact) => {
                    setLocation(buildBrowserSessionPath(
                      artifact.sessionId,
                      artifact.launchContext ?? buildAgencyLaunchContext(artifact.sessionId),
                    ));
                  }}
                >
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-900/70">
                        Quick Browser Instruction
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        Describe the outcome you want or the next browser step without leaving Agency Chat.
                      </p>
                    </div>
                    <Select
                      value={browserCommandSkillId}
                      onValueChange={(value) => handleBrowserCommandSkillChange(value as typeof browserCommandSkillId)}
                    >
                      <SelectTrigger className="bg-white">
                        <SelectValue placeholder="Choose a browser skill" />
                      </SelectTrigger>
                      <SelectContent>
                        {BROWSER_SKILL_PRESETS.map((preset) => (
                          <SelectItem key={preset.id} value={preset.id}>
                            {preset.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Textarea
                      value={browserCommandDraft}
                      onChange={(event) => handleBrowserCommandDraftChange(event.target.value)}
                      placeholder="Example: Find the right site, compare choices, and continue automatically."
                      className="min-h-[88px] bg-white"
                    />
                    {browserCommandNotice ? (
                      <p className="text-xs text-slate-600">{browserCommandNotice}</p>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      className="gap-2 bg-cyan-700 text-white hover:bg-cyan-800"
                      onClick={() => void handleSendBrowserSessionCommand()}
                      disabled={!browserCommandDraft.trim() || browserCommandBusy}
                    >
                      {browserCommandBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      {browserCommandBusy ? "Queuing Instruction..." : "Send Browser Instruction"}
                    </Button>
                  </div>
                </BrowserSessionSummaryCard>
              ) : null}

              {previewLoading && !agencyPreview && (
                <div className="animate-pulse rounded-xl border bg-muted/30 p-6">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-muted" />
                    <div className="space-y-2">
                      <div className="h-4 w-40 rounded bg-muted" />
                      <div className="h-3 w-24 rounded bg-muted" />
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    <div className="h-3 w-full rounded bg-muted" />
                    <div className="h-3 w-3/4 rounded bg-muted" />
                  </div>
                </div>
              )}

              {agencyPreview && agencyId ? (
                <AgencyPreviewCard
                  preview={agencyPreview}
                  agencyId={agencyId}
                  runId={agencyPreview.runId}
                  onDismiss={() => setAgencyPreview(null)}
                  onCommitted={(result) =>
                    setAgencyPreview((prev) =>
                      prev
                        ? {
                            ...prev,
                            lifecycleState: "committed",
                            commit: {
                              ...prev.commit,
                              status: "committed",
                              available: false,
                              targetType: result.targetType,
                              targetId: result.targetId,
                            },
                          }
                        : null,
                    )
                  }
                />
              ) : null}

              {/* Empty state — show agency info + agents */}
              {stream.messages.length === 0 && !stream.isStreaming && (
                <div className="py-12 text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                    <Users className="h-7 w-7 text-primary" />
                  </div>
                  <h2 className="text-xl font-semibold">
                    {agency?.name || "Agency"}
                  </h2>
                  {agency?.description && (
                    <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
                      {agency.description}
                    </p>
                  )}

                  {agents.length > 0 && (
                    <div className="mt-6">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Team Members
                      </p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {agents.map((a: any) => (
                          <div
                            key={a.id}
                            className={cn(
                              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium",
                              getAgentColor(a.name),
                            )}
                          >
                            {a.nodeType === "supervisor" ? (
                              <Crown className="h-3 w-3" />
                            ) : (
                              <Bot className="h-3 w-3" />
                            )}
                            {a.name}
                            {a.isEntryPoint && (
                              <span className="ml-0.5 opacity-60">(entry)</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="mt-6 text-sm text-muted-foreground">
                    Send a message to start the conversation
                  </p>
                </div>
              )}

              {stream.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex",
                    msg.role === "user"
                      ? "justify-end"
                      : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[80%] rounded-lg px-4 py-2.5",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted",
                    )}
                  >
                    {msg.role === "assistant" && msg.agentName && (
                      <Badge
                        variant="secondary"
                        className={cn(
                          "mb-1.5 text-[10px] px-1.5 py-0",
                          getAgentColor(msg.agentName),
                        )}
                      >
                        {msg.agentName}
                      </Badge>
                    )}
                    {msg.role === "user" ? (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">
                        {msg.content}
                      </p>
                    ) : (
                      <div className="text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                        <SafeMarkdown>{msg.content}</SafeMarkdown>
                        {msg.isStreaming && (
                          <span className="ml-1 inline-block h-3 w-1 animate-pulse bg-current" />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {browserSessionSuggestion ? (
                <div className="mr-auto max-w-[80%]">
                  <BrowserSessionLaunchSuggestionCard
                    suggestion={browserSessionSuggestion}
                    onConfirm={handleConfirmBrowserSessionSuggestion}
                    onDismiss={handleDismissBrowserSessionSuggestion}
                  />
                </div>
              ) : null}

              {stream.error && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-destructive">
                        Error
                      </p>
                      <p className="mt-0.5 text-sm text-destructive/80">
                        {stream.error}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 border-destructive/30 text-destructive hover:bg-destructive/10"
                      onClick={handleRetry}
                      disabled={stream.isStreaming || stream.messages.length === 0}
                    >
                      Retry
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Input Bar */}
          <div className="border-t px-4 py-3">
            {(agency as any)?.creatorFeeCredits > 0 && (
              <div className="mx-auto mb-2 flex max-w-3xl items-center gap-1.5 rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                <CreditCard className="h-3.5 w-3.5 shrink-0" />
                <span>
                  Creator fee: {(agency as any).creatorFeeCredits} credits per successful run
                </span>
              </div>
            )}
            {modelOverride && (
              <div className="mx-auto mb-2 flex max-w-3xl items-center gap-1.5 rounded-md bg-blue-50 px-3 py-1.5 text-xs text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                <Settings2 className="h-3.5 w-3.5 shrink-0" />
                <span>Using model override: <strong>{modelOverride}</strong></span>
                <button
                  className="ml-auto underline underline-offset-2 hover:no-underline"
                  onClick={() => setModelOverride("")}
                >
                  Clear
                </button>
              </div>
            )}
            {/* Run options (recipient agent, additional instructions) */}
            {(recipientAgent || additionalInstructions || runOptionsOpen) && (
              <div className="mx-auto mb-2 max-w-3xl space-y-2 rounded-md border bg-muted/30 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted-foreground">Run Options</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => {
                      setRunOptionsOpen(false);
                      setRecipientAgent("");
                      setAdditionalInstructions("");
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                {agency && (agency as any).agents?.length > 1 && (
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">Target Agent</label>
                    <Select value={recipientAgent} onValueChange={setRecipientAgent}>
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue placeholder="Auto (entry point)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Auto (entry point)</SelectItem>
                        {((agency as any).agents ?? []).map((a: any) => (
                          <SelectItem key={a.id || a.name} value={a.name}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">Additional Instructions</label>
                  <Textarea
                    value={additionalInstructions}
                    onChange={(e) => setAdditionalInstructions(e.target.value)}
                    className="min-h-[32px] max-h-[80px] resize-none text-xs"
                    rows={1}
                    placeholder="Per-run instruction override (optional)"
                  />
                </div>
              </div>
            )}
            <div className="mx-auto flex max-w-3xl gap-2">
              <div className="flex flex-1 gap-1">
                {!runOptionsOpen && !recipientAgent && !additionalInstructions && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => setRunOptionsOpen(true)}
                    title="Run options (target agent, instructions)"
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>
                )}
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Message ${agency?.name ?? "agency"}… (Enter to send, Shift+Enter for new line)`}
                  className="min-h-[44px] max-h-[160px] resize-none flex-1"
                  rows={1}
                  disabled={stream.isStreaming}
                />
              </div>
              <Button
                onClick={handleSend}
                disabled={!input.trim() || stream.isStreaming}
                size="icon"
                className="h-11 w-11 shrink-0"
              >
                {stream.isStreaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Activity Panel */}
        {panelOpen && (
          <div className="hidden w-80 border-l lg:block">
            <AgencyActivityPanel
              activityEvents={stream.activityEvents}
              activeAgent={stream.activeAgent}
              isStreaming={stream.isStreaming}
              onClose={() => setPanelOpen(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
