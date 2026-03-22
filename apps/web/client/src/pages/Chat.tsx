import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { ChatSidebar, ChatView, MemoryPanel, SkillSettings, ArtifactPanel, SchedulePanel, type Artifact } from "@/components/chat";
import { CanvasPane } from "@/components/chat/canvas/CanvasPane";
import { HelpButton } from "@/components/help";
import { BrowserSessionSummaryCard } from "@/components/browser-session/BrowserSessionSummaryCard";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, PanelLeftClose, Brain, Wand2, Layers, Bell, Menu, MonitorPlay, Loader2, Send, Users } from "lucide-react";
import { cn } from "@/lib/utils";
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
import { liveBrowserSessionSchema } from "@shared/liveBrowser";
import {
  BROWSER_SKILL_PRESETS,
  buildBrowserInstruction,
  deriveBrowserSkillSelection,
  inferBrowserSkillId,
} from "@shared/browserSkills";
import type { LiveBrowserCreateSessionRequest } from "@shared/liveBrowser";


type RightPanel = "none" | "memory" | "skills" | "artifacts" | "schedule" | "canvas";

export default function Chat() {
  const { isLoading, isAuthenticated, user } = useAuth();
  const [, setLocation] = useLocation();

  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 1024);
  const [rightPanel, setRightPanel] = useState<RightPanel>("none");

  // Deep-link state from GlobalAlerts (e.g. /chat?dm=123&dmName=John)
  const [initialDmUserId, setInitialDmUserId] = useState<number | null>(null);
  const [initialDmUserName, setInitialDmUserName] = useState<string>("");
  const [initialAlertId, setInitialAlertId] = useState<number | null>(null);
  const [returnBrowserSessionId, setReturnBrowserSessionId] = useState<string | null>(null);
  const [browserSessionSuggestion, setBrowserSessionSuggestion] = useState<BrowserSessionLaunchSuggestion | null>(null);
  const [browserSessionArtifactOverride, setBrowserSessionArtifactOverride] = useState<BrowserSessionArtifact | null>(null);
  const [browserCommandDraft, setBrowserCommandDraft] = useState("");
  const [browserCommandSkillId, setBrowserCommandSkillId] = useState(() => inferBrowserSkillId(""));
  const [browserCommandSkillSelectionMode, setBrowserCommandSkillSelectionMode] = useState<"auto" | "manual">("auto");
  const [browserCommandBusy, setBrowserCommandBusy] = useState(false);
  const [browserCommandNotice, setBrowserCommandNotice] = useState<string | null>(null);

  const utils = trpc.useUtils();

  // Get available models from LLM providers (for default model)
  const { data: modelsData } = trpc.llmProviders.availableModels.useQuery();
  // Fetch messages to extract artifacts
  const { data: messagesData } = trpc.chat.getMessages.useQuery(
    { conversationId: selectedConversationId!, limit: 100 },
    { enabled: !!selectedConversationId }
  );
  const createLiveBrowserSessionMutation = trpc.liveBrowser.createSession.useMutation();
  const sendLiveBrowserCommandMutation = trpc.liveBrowser.sendCommand.useMutation();
  const saveAssistantMessageMutation = trpc.chat.saveAssistantMessage.useMutation();

  const browserSessionArtifacts = useMemo(
    () => (messagesData || [])
      .flatMap((message) => (message.artifacts || []))
      .map((artifact) => parseBrowserSessionArtifact(artifact.metadata?.browserSession))
      .filter((artifact) => artifact !== null),
    [messagesData],
  );
  const latestBrowserSessionArtifact = browserSessionArtifacts.at(-1) ?? null;
  const activeBrowserSessionArtifact = browserSessionArtifactOverride ?? latestBrowserSessionArtifact;
  const chatBrowserSessionEnabled = true;

  // Extract artifacts from messages
  const artifacts: Artifact[] = (messagesData || [])
    .flatMap((m) => (m.artifacts as Artifact[]) || [])
    .filter((a): a is Artifact => !!a && typeof a === "object" && !a.metadata?.browserSession);

  // Create conversation mutation
  const createConversationMutation = trpc.chat.createConversation.useMutation({
    onSuccess: (data) => {
      setSelectedConversationId(data.id);
      utils.chat.listConversations.invalidate();
    },
  });

  // Update conversation mutation
  const updateConversationMutation = trpc.chat.updateConversation.useMutation({
    onSuccess: () => {
      utils.chat.listConversations.invalidate();
    },
  });

  // Redirect if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [isLoading, isAuthenticated, setLocation]);

  // Parse URL search params for deep-linking from GlobalAlerts
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const dm = params.get("dm");
    const dmName = params.get("dmName");
    const panel = params.get("panel");

    const alertId = params.get("alertId");
    const conversationId = params.get("c");
    const browserSessionId = params.get("browserSessionId");

    if (conversationId) {
      setSelectedConversationId(Number(conversationId));
      if (browserSessionId) {
        setReturnBrowserSessionId(browserSessionId);
      }
      window.history.replaceState({}, "", "/chat");
    } else if (dm) {
      setInitialDmUserId(Number(dm));
      setInitialDmUserName(dmName || "User");
      setRightPanel("schedule");
      window.history.replaceState({}, "", "/chat");
    } else if (panel === "schedule") {
      setRightPanel("schedule");
      if (alertId) setInitialAlertId(Number(alertId));
      window.history.replaceState({}, "", "/chat");
    }
  }, []);

  const buildChatLaunchContext = (
    sessionId: string,
    conversationId: number | null = selectedConversationId,
  ): BrowserSessionLaunchContext | null => {
    if (!conversationId) {
      return null;
    }

    return {
      originSurface: "chat",
      originLabel: "Chat",
      sourceId: String(conversationId),
      returnContext: {
        path: `/chat?c=${conversationId}&browserSessionId=${encodeURIComponent(sessionId)}`,
        label: "Return to Chat",
      },
    };
  };

  const buildChatBrowserSessionArtifact = async (
    sessionId: string,
    launchContext: BrowserSessionLaunchContext | null,
    conversationId: number | null = selectedConversationId,
  ): Promise<BrowserSessionArtifact | null> => {
    if (!conversationId || !user?.id) {
      return null;
    }

    const actor = {
      actorType: "user" as const,
      actorId: String(user.id),
    };
    const session = liveBrowserSessionSchema.parse(await utils.liveBrowser.getSession.fetch({
      sessionId,
      actor,
    }));
    return {
      sessionId: session.sessionId,
      summary: buildBrowserSessionSummary(session, { launchContext }),
      launchContext: launchContext ?? undefined,
      updatedAt: session.lastActivityAt,
    } satisfies BrowserSessionArtifact;
  };

  const persistBrowserSessionSummary = async (
    sessionId: string,
    launchContext: BrowserSessionLaunchContext | null,
    content: string,
    conversationId: number | null = selectedConversationId,
  ) => {
    const artifact = await buildChatBrowserSessionArtifact(sessionId, launchContext, conversationId);
    if (!conversationId || !artifact) {
      return;
    }
    setBrowserSessionArtifactOverride(artifact);

    await saveAssistantMessageMutation.mutateAsync({
      conversationId,
      content,
      artifacts: [
        {
          id: `browser-session-${artifact.sessionId}-${artifact.updatedAt ?? "latest"}`,
          type: "markdown",
          title: "Browser Session",
          content: artifact.summary.statusLine,
          metadata: {
            browserSession: {
              sessionId: artifact.sessionId,
              summary: artifact.summary,
              launchContext: artifact.launchContext,
              updatedAt: artifact.updatedAt,
            },
          },
        },
      ],
    });
    utils.chat.getMessages.invalidate({ conversationId });
  };

  useEffect(() => {
    if (!returnBrowserSessionId || !selectedConversationId) {
      return;
    }

    const launchContext = buildChatLaunchContext(returnBrowserSessionId);
    persistBrowserSessionSummary(
      returnBrowserSessionId,
      launchContext,
      "Browser Session returned to Chat.",
    ).finally(() => {
      setReturnBrowserSessionId(null);
    });
  }, [returnBrowserSessionId, selectedConversationId]);

  useEffect(() => {
    setBrowserSessionSuggestion(null);
  }, [selectedConversationId, chatBrowserSessionEnabled]);

  useEffect(() => {
    setBrowserSessionArtifactOverride(null);
    setBrowserCommandDraft("");
    setBrowserCommandSkillId(inferBrowserSkillId(""));
    setBrowserCommandSkillSelectionMode("auto");
    setBrowserCommandNotice(null);
    setBrowserCommandBusy(false);
  }, [selectedConversationId]);

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

  const createConversationWithDefaultModel = async (title = "New Chat") => {
    const defaultModel = modelsData?.models?.find(m => m.isDefault);
    return createConversationMutation.mutateAsync({
      title,
      model: defaultModel?.id,
    });
  };

  const ensureConversationId = async () => {
    if (selectedConversationId) {
      return selectedConversationId;
    }
    const result = await createConversationWithDefaultModel();
    setSelectedConversationId(result.id);
    return result.id;
  };

  const handleOpenBrowserSession = async (options?: {
    launchPath?: "direct" | "suggested";
    launchIntent?: BrowserSessionLaunchSuggestion["launchIntent"];
    executionIntent?: LiveBrowserCreateSessionRequest["executionIntent"];
  }) => {
    if (!user?.id) {
      return;
    }

    const conversationId = await ensureConversationId();
    const launchPath = options?.launchPath ?? "direct";
    const launchIntent = options?.launchIntent;

    if (
      latestBrowserSessionArtifact?.sessionId
      && latestBrowserSessionArtifact.launchContext?.sourceId === String(conversationId)
    ) {
      trackBrowserSessionReopened({
        origin_surface: "chat",
        compact_layout: window.innerWidth < 768,
        session_kind: "resumed",
        launch_path: launchPath,
        launch_intent: launchIntent,
      });
      const launchContext = buildChatLaunchContext(latestBrowserSessionArtifact.sessionId, conversationId);
      setLocation(buildBrowserSessionPath(latestBrowserSessionArtifact.sessionId, launchContext));
      return;
    }

    const actor = {
      actorType: "user" as const,
      actorId: String(user.id),
    };
    const created = await createLiveBrowserSessionMutation.mutateAsync({
      actor,
      sourceType: "chat",
      sourceId: String(conversationId),
      mode: "observe",
      executionIntent: options?.executionIntent,
    });
    const launchContext = buildChatLaunchContext(created.sessionId, conversationId);
    await persistBrowserSessionSummary(
      created.sessionId,
      launchContext,
      "Opened Browser Session from Chat.",
      conversationId,
    );
    trackBrowserSessionOpened({
      origin_surface: "chat",
      compact_layout: window.innerWidth < 768,
      session_kind: "created",
      launch_path: launchPath,
      launch_intent: launchIntent,
    });
    setLocation(buildBrowserSessionPath(created.sessionId, launchContext));
  };

  const handleUserMessageSent = (message: string) => {
    if (!selectedConversationId || !chatBrowserSessionEnabled) {
      setBrowserSessionSuggestion(null);
      return;
    }

    setBrowserSessionSuggestion(
      detectBrowserSessionLaunchSuggestion({
        message,
        originSurface: "chat",
        sourceId: String(selectedConversationId),
      }),
    );
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
    if (!activeBrowserSessionArtifact?.sessionId || !selectedConversationId || !user?.id || !browserCommandDraft.trim()) {
      return;
    }

    try {
      setBrowserCommandBusy(true);
      setBrowserCommandNotice(null);
      const actor = {
        actorType: "user" as const,
        actorId: String(user.id),
      };
      const session = await utils.liveBrowser.getSession.fetch({
        sessionId: activeBrowserSessionArtifact.sessionId,
        actor,
      });

      await sendLiveBrowserCommandMutation.mutateAsync({
        sessionId: session.sessionId,
        sessionVersion: session.sessionVersion,
        idempotencyKey: `chat-browser-cmd-${Date.now()}`,
        actor,
        command: {
          type: "natural_language",
          text: buildBrowserInstruction({
            goal: browserCommandDraft.trim(),
            skillId: browserCommandSkillId,
          }),
        },
      });

      const refreshedArtifact = await buildChatBrowserSessionArtifact(
        activeBrowserSessionArtifact.sessionId,
        activeBrowserSessionArtifact.launchContext ?? buildChatLaunchContext(activeBrowserSessionArtifact.sessionId),
      );
      if (refreshedArtifact) {
        setBrowserSessionArtifactOverride(refreshedArtifact);
      }
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

  const handleNewChat = async () => {
    const result = await createConversationWithDefaultModel();
    setSelectedConversationId(result.id);
  };

  const handleOpenTeamRoom = (teamId: string) => {
    setLocation(`/teams/${teamId}`);
  };

  const upsertMemoryMutation = trpc.memory.upsertEntityMemory.useMutation();

  // Create new chat continuing the same project, with summary from previous chat
  const handleNewChatFromProject = async (projectId: string, summary: string) => {
    const defaultModel = modelsData?.models?.find(m => m.isDefault);

    const result = await createConversationMutation.mutateAsync({
      title: `${projectId} - continued`,
      model: defaultModel?.id,
      projectId,
      systemPrompt: summary
        ? `Context from previous conversation in project "${projectId}":\n\n${summary}`
        : undefined,
    });

    // Save the summary as a visible entity memory so user can verify it in the Memory panel
    if (summary) {
      try {
        const summaryLines = summary.split("\n").filter(l => l.trim());
        const facts = summaryLines.length > 0
          ? summaryLines.map(l => l.replace(/^[-•]\s*/, "").trim()).filter(Boolean).slice(0, 20)
          : [summary.slice(0, 1000)];

        await upsertMemoryMutation.mutateAsync({
          entityType: "project",
          entityName: `${projectId} — context carried over`,
          facts,
          sourceConversationId: result.id,
          importance: 8,
          source: "auto",
          projectId: projectId,
        });
        // Invalidate memory cache so MemoryPanel shows the new memory immediately
        utils.memory.getEntityMemories.invalidate();
      } catch {
        // Non-critical — summary is still in systemPrompt
      }
    }

    setSelectedConversationId(result.id);
    // Open Memory panel so user can see the carried-over context
    setRightPanel("memory");
  };

  // Handle title update
  const handleTitleUpdate = (title: string) => {
    if (selectedConversationId) {
      updateConversationMutation.mutate({
        id: selectedConversationId,
        title,
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Top Bar */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-4 z-50 relative">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/dashboard")}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden"
          >
            {sidebarOpen ? (
              <PanelLeftClose className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </Button>
          <h1 className="text-lg font-semibold hidden sm:block">AI Chat</h1>
        </div>
        <div className="flex items-center gap-1">
          <HelpButton page="/chat" variant="ghost" size="sm" />
          <Button
            variant={rightPanel === "skills" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setRightPanel(rightPanel === "skills" ? "none" : "skills")}
            className="gap-2"
            disabled={!selectedConversationId}
          >
            <Wand2 className="h-4 w-4" />
            <span className="hidden sm:inline">Skills</span>
          </Button>
          <Button
            variant={rightPanel === "artifacts" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setRightPanel(rightPanel === "artifacts" ? "none" : "artifacts")}
            className="gap-2"
            disabled={!selectedConversationId || artifacts.length === 0}
          >
            <Layers className="h-4 w-4" />
            <span className="hidden sm:inline">Artifacts</span>
            {artifacts.length > 0 && (
              <span className="text-xs bg-primary/20 px-1.5 rounded-full">
                {artifacts.length}
              </span>
            )}
          </Button>
          <Button
            variant={rightPanel === "schedule" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setRightPanel(rightPanel === "schedule" ? "none" : "schedule")}
            className="gap-2"
          >
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Alerts</span>
          </Button>
          <Button
            variant={rightPanel === "memory" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setRightPanel(rightPanel === "memory" ? "none" : "memory")}
            className="gap-2"
          >
            <Brain className="h-4 w-4" />
            <span className="hidden sm:inline">Memory</span>
          </Button>
          {chatBrowserSessionEnabled && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleOpenBrowserSession()}
              className="gap-2"
              disabled={createLiveBrowserSessionMutation.isPending}
            >
              <MonitorPlay className="h-4 w-4" />
              <span className="hidden sm:inline">
                {latestBrowserSessionArtifact?.summary.primaryActionLabel ?? "Open Browser Session"}
              </span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/agencies")}
            className="gap-2"
          >
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Agencies</span>
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar - mobile: overlay drawer, desktop: inline */}
        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 top-14 z-30 bg-black/40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        {/* Mobile sidebar drawer — always in DOM, slides in/out via CSS */}
        <div
          className={cn(
            "fixed left-0 z-40 w-80 bg-background transition-transform duration-300 ease-in-out lg:hidden",
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          )}
          style={{ top: "3.5rem", height: "calc(100dvh - 3.5rem)" }}
        >
          <ChatSidebar
            selectedConversationId={selectedConversationId}
            onSelectConversation={(id) => {
              setSelectedConversationId(id);
              setSidebarOpen(false);
            }}
            onNewChat={handleNewChat}
            onOpenTeamRoom={handleOpenTeamRoom}
          />
        </div>
        {/* Desktop sidebar inline */}
        <div
          className={cn(
            "hidden lg:block w-80 flex-shrink-0 overflow-hidden transition-all duration-200",
            !sidebarOpen && "w-0"
          )}
        >
          {sidebarOpen && (
            <ChatSidebar
              selectedConversationId={selectedConversationId}
              onSelectConversation={(id) => setSelectedConversationId(id)}
              onNewChat={handleNewChat}
              onOpenTeamRoom={handleOpenTeamRoom}
            />
          )}
        </div>

        {/* Sidebar Toggle for Desktop */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="hidden lg:flex h-full w-5 items-center justify-center hover:bg-primary/10 transition-colors group border-r"
          title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
        >
          <div className="h-8 w-1.5 rounded-full bg-border group-hover:bg-primary/40 transition-colors" />
        </button>

        {/* Chat View */}
        <div className="flex-1 overflow-hidden">
          {selectedConversationId ? (
            <div className="flex h-full flex-col">
              {chatBrowserSessionEnabled && !activeBrowserSessionArtifact ? (
                <div className="border-b border-cyan-100 bg-cyan-50/20 px-4 py-3">
                  <div className="flex flex-col gap-3 rounded-xl border border-cyan-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-900/70">
                        Browser Session
                      </p>
                      <p className="text-sm font-semibold text-slate-900">
                        Let AI work in a live browser directly from this chat.
                      </p>
                      <p className="text-xs text-slate-600">
                        Start a Browser Session to let AI discover sites, navigate pages, and continue working while you stay in Chat.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        className="gap-2 bg-cyan-700 text-white hover:bg-cyan-800"
                        onClick={() => void handleOpenBrowserSession()}
                        disabled={createLiveBrowserSessionMutation.isPending}
                      >
                        {createLiveBrowserSessionMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <MonitorPlay className="h-4 w-4" />
                        )}
                        Start Browser Session
                      </Button>
                      <HelpButton page="/chat" topic="browser-session" variant="ghost" size="sm" />
                    </div>
                  </div>
                </div>
              ) : null}
              {chatBrowserSessionEnabled && activeBrowserSessionArtifact ? (
                <div className="border-b border-cyan-100 bg-cyan-50/30 px-4 py-3">
                  <BrowserSessionSummaryCard
                    artifact={activeBrowserSessionArtifact}
                    onOpen={(artifact) => {
                      const launchContext = artifact.launchContext ?? buildChatLaunchContext(artifact.sessionId);
                      setLocation(buildBrowserSessionPath(artifact.sessionId, launchContext));
                    }}
                  >
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-900/70">
                          Quick Browser Instruction
                        </p>
                        <p className="mt-1 text-xs text-slate-600">
                          Describe the next result you want or the step AI should take without leaving Chat.
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
                        placeholder="Example: Find the best site for this task, compare options, and continue."
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
                </div>
              ) : null}
              <div className="min-h-0 flex-1 overflow-hidden">
                <ChatView
                  conversationId={selectedConversationId}
                  onTitleUpdate={handleTitleUpdate}
                  browserSessionSuggestion={browserSessionSuggestion}
                  showBrowserSessionEntry={chatBrowserSessionEnabled}
                  onStartBrowserSession={() => void handleOpenBrowserSession()}
                  browserSessionEntryPending={createLiveBrowserSessionMutation.isPending}
                  onUserMessageSent={handleUserMessageSent}
                  onConfirmBrowserSessionSuggestion={handleConfirmBrowserSessionSuggestion}
                  onDismissBrowserSessionSuggestion={handleDismissBrowserSessionSuggestion}
                />
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <div className="text-center">
                <h2 className="text-2xl font-semibold">Welcome to AI Chat</h2>
                <p className="mt-2 text-muted-foreground">
                  Start a new conversation or select one from the sidebar
                </p>
              </div>
              <Button onClick={handleNewChat} size="lg" className="mt-4">
                Start New Chat
              </Button>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {chatBrowserSessionEnabled ? (
                  <>
                    <Button
                      type="button"
                      size="lg"
                      variant="outline"
                      className="gap-2"
                      onClick={() => void handleOpenBrowserSession()}
                      disabled={createLiveBrowserSessionMutation.isPending}
                    >
                      {createLiveBrowserSessionMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <MonitorPlay className="h-4 w-4" />
                      )}
                      Start Browser Session
                    </Button>
                    <HelpButton page="/chat" topic="browser-session" size="default" />
                  </>
                ) : null}
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  className="gap-2"
                  onClick={() => setLocation("/agencies")}
                >
                  <Users className="h-4 w-4" />
                  Explore Agencies
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel (Memory or Skills) */}
        <div
          data-testid="chat-right-panel"
          aria-hidden={rightPanel === "none"}
          className={cn(
            "flex h-full min-h-0 flex-shrink-0 flex-col overflow-hidden transition-all duration-200",
            rightPanel !== "none"
              ? "w-full translate-x-0 border-l sm:w-96 lg:w-[28rem]"
              : "pointer-events-none w-0 translate-x-full border-l-0"
          )}
        >
          {rightPanel === "memory" && (
            <MemoryPanel
              onClose={() => setRightPanel("none")}
              conversationId={selectedConversationId}
              onNewChatFromProject={handleNewChatFromProject}
            />
          )}
          {rightPanel === "skills" && selectedConversationId && (
            <SkillSettings
              conversationId={selectedConversationId}
              onClose={() => setRightPanel("none")}
            />
          )}
          {rightPanel === "artifacts" && (
            <ArtifactPanel
              artifacts={artifacts}
              onClose={() => setRightPanel("none")}
            />
          )}
          {rightPanel === "canvas" && selectedConversationId && (
            <CanvasPane
              conversationId={selectedConversationId}
              onClose={() => setRightPanel("none")}
            />
          )}
          {rightPanel === "schedule" && (
            <SchedulePanel
              onNavigateToChat={(id) => {
                setSelectedConversationId(id);
                setRightPanel("none");
              }}
              initialDmUserId={initialDmUserId}
              initialDmUserName={initialDmUserName}
              isFromAlert={!!initialDmUserId}
              initialAlertId={initialAlertId}
            />
          )}
        </div>
      </div>
    </div>
  );
}
