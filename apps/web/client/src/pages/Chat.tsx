import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { ChatSidebar, ChatView, MemoryPanel, SkillSettings, ArtifactPanel, SchedulePanel, type Artifact } from "@/components/chat";
import { FinanceHub } from "@/components/finance/FinanceHub";
import FinanceAccessGate from "@/components/finance/FinanceAccessGate";
import { CanvasPane } from "@/components/chat/canvas/CanvasPane";
import { HelpButton } from "@/components/help";
import { BrowserSessionSummaryCard } from "@/components/browser-session/BrowserSessionSummaryCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DashboardSectionHeader,
  DashboardSurface,
} from "@/components/dashboard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, PanelLeftClose, Brain, Wand2, Layers, Bell, Menu, MonitorPlay, Loader2, Send, Users, Play, X, ChevronDown, ChevronUp, ReceiptText } from "lucide-react";
import { AgencyPickerModal } from "@/components/agency/AgencyPickerModal";
import { useAgencyStream } from "@/hooks/useAgencyStream";
import { AgencyChatStream } from "@/components/agency/AgencyChatStream";
import { DesktopAgencyHandoffLinks } from "@/features/desktop-host/agencies/DesktopAgencyHandoffLinks";
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
import { LocaleToggle } from "@/components/LocaleToggle";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { buildWorkpackEntrypointHref } from "@/lib/workpackNavigation";


type RightPanel = "none" | "memory" | "skills" | "artifacts" | "schedule" | "canvas" | "finance";
type AgencyRunPhase = "idle" | "connecting" | "running" | "completed" | "failed";

export default function Chat() {
  const { isLoading, isAuthenticated, user } = useAuth();
  const { t } = useScopedTranslation('chat');
  const [, setLocation] = useLocation();

  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 1024);
  const [rightPanel, setRightPanel] = useState<RightPanel>("none");
  const [agencyPickerOpen, setAgencyPickerOpen] = useState(false);
  const [targetAgency, setTargetAgency] = useState<{ id: string; name: string } | null>(null);
  const [agencySuggestion, setAgencySuggestion] = useState<{ agencyId: string; agencyName: string } | null>(null);
  const [agencyInput, setAgencyInput] = useState("");
  const [agencyRunPhase, setAgencyRunPhase] = useState<AgencyRunPhase>("idle");
  const [agencyPanelCollapsed, setAgencyPanelCollapsed] = useState(false);
  const agencyStream = useAgencyStream({
    onRunFinished: () => {
      setAgencyRunPhase("completed");
    },
    onError: () => {
      setAgencyRunPhase("failed");
    },
  });

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

  // Agency trigger data for auto-detection in chat
  const { data: agencyTriggersData } = (trpc as any).agency?.listTriggers?.useQuery?.(undefined, {
    staleTime: 60_000,
  }) ?? { data: undefined };
  // Fetch messages to extract artifacts
  const { data: messagesData } = trpc.chat.getMessages.useQuery(
    { conversationId: selectedConversationId!, limit: 100 },
    { enabled: !!selectedConversationId }
  );
  const createLiveBrowserSessionMutation = trpc.liveBrowser.createSession.useMutation();
  const sendLiveBrowserCommandMutation = trpc.liveBrowser.sendCommand.useMutation();
  const { data: tenantFlags } = trpc.tenantFeatureFlags.getFeatureFlags.useQuery(undefined, {
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
  const saveAssistantMessageMutation = trpc.chat.saveAssistantMessage.useMutation();
  const mirrorFinanceActivity = async (message: {
    content: string;
    artifacts: Array<{
      id: string;
      type: "markdown" | "table" | "chart";
      title?: string;
      content: string | string[];
      metadata?: Record<string, unknown>;
    }>;
  }) => {
    if (!selectedConversationId) {
      return;
    }

    await saveAssistantMessageMutation.mutateAsync({
      conversationId: selectedConversationId,
      content: message.content,
      artifacts: message.artifacts,
    });
    utils.chat.getMessages.invalidate({ conversationId: selectedConversationId });
  };

  const browserSessionArtifacts = useMemo(
    () => (messagesData || [])
      .flatMap((message) => (message.artifacts || []))
      .map((artifact) => parseBrowserSessionArtifact(artifact.metadata?.browserSession))
      .filter((artifact) => artifact !== null),
    [messagesData],
  );
  const latestBrowserSessionArtifact = browserSessionArtifacts.at(-1) ?? null;
  const activeBrowserSessionArtifact = browserSessionArtifactOverride ?? latestBrowserSessionArtifact;
  const chatBrowserSessionEnabled = Boolean(
    tenantFlags?.chatBrowserSessionEntry
      && tenantFlags.liveBrowser,
  );

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

  const createPersonalConversationMutation = trpc.chat.createPersonalConversation.useMutation({
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
    } else if (panel === "finance") {
      setRightPanel("finance");
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
      originLabel: t('chat.browserSession'),
      sourceId: String(conversationId),
      returnContext: {
        path: `/chat?c=${conversationId}&browserSessionId=${encodeURIComponent(sessionId)}`,
        label: t('chat.browserSession.returnLabel'),
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
          title: t('chat.browserSession'),
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
      t('chat.browserSession.returned'),
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

  const createConversationWithDefaultModel = async (title = t('chat.newChat')) => {
    return createConversationMutation.mutateAsync({
      title,
    });
  };

  const activateConversation = (conversationId: number, options?: { closeSidebar?: boolean }) => {
    setSelectedConversationId(conversationId);
    setRightPanel("none");
    setLocation(`/chat?c=${conversationId}`);
    if (options?.closeSidebar ?? window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  };

  const ensureConversationId = async () => {
    if (selectedConversationId) {
      return selectedConversationId;
    }
    const result = await createConversationWithDefaultModel();
    activateConversation(result.id);
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
      t('chat.browserSession.opened'),
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
    // Agency auto-detection from trigger phrases
    if (!targetAgency) {
      const agencyList = agencyTriggersData?.agencies ?? [];
      if (agencyList.length > 0 && message.length >= 3) {
        for (const agency of agencyList) {
          const phrases: string[] = (agency as any).triggerPhrases ?? [];
          for (const phrase of phrases) {
            try {
              if (new RegExp(phrase, "i").test(message)) {
                setAgencySuggestion({ agencyId: (agency as any).id, agencyName: (agency as any).name });
                break;
              }
            } catch { /* invalid regex */ }
          }
          if (agencySuggestion) break;
        }
      }
    }

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

  const handleAgencySend = () => {
    if (!targetAgency || !agencyInput.trim() || agencyStream.isStreaming) return;
    setAgencyRunPhase("connecting");
    setAgencyPanelCollapsed(false);
    agencyStream.connect({
      agencyId: targetAgency.id,
      message: agencyInput.trim(),
    });
    setAgencyInput("");
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
      setBrowserCommandNotice(t('chat.browserSession.queued'));
    } catch (error) {
      setBrowserCommandNotice(
        error instanceof Error ? error.message : t('chat.browserSession.queueFailed'),
      );
    } finally {
      setBrowserCommandBusy(false);
    }
  };

  const handleNewChat = async () => {
    try {
      const result = await createConversationWithDefaultModel();
      activateConversation(result.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("chat.createConversationFailed"));
    }
  };

  const handleNewPersonalChat = async () => {
    try {
      const result = await createPersonalConversationMutation.mutateAsync({
        title: t("chat.startPersonalChat"),
      });
      activateConversation(result.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("chat.createConversationFailed"));
    }
  };

  const handleOpenTeamRoom = (teamId: string) => {
    setLocation(`/teams/${teamId}`);
  };

  const upsertMemoryMutation = trpc.memory.upsertEntityMemory.useMutation();

  // Create new chat continuing the same project, with summary from previous chat
  const handleNewChatFromProject = async (projectId: string, summary: string) => {
    const result = await createConversationMutation.mutateAsync({
      title: `${projectId} - continued`,
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
    setLocation(`/chat?c=${result.id}`);
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

  useEffect(() => {
    if (agencyStream.isStreaming) {
      setAgencyRunPhase((current) => (current === "running" ? current : "running"));
    }
  }, [agencyStream.isStreaming]);

  useEffect(() => {
    if (agencyStream.error) {
      setAgencyRunPhase((current) => (current === "connecting" || current === "running" ? "failed" : current));
    }
  }, [agencyStream.error]);

  useEffect(() => {
    if (!agencyStream.isStreaming && agencyStream.messages.length > 0 && !agencyStream.error) {
      setAgencyRunPhase((current) => (current === "connecting" || current === "running" ? "completed" : current));
    }
  }, [agencyStream.isStreaming, agencyStream.messages.length, agencyStream.error]);

  const agencyStatusLabel = (() => {
    switch (agencyRunPhase) {
      case "connecting": return t('agency.status.connecting');
      case "running":    return t('agency.status.running');
      case "completed":  return t('agency.status.completed');
      case "failed":     return t('agency.status.failed');
      default:           return t('agency.status.ready');
    }
  })();

  const agencyStatusTone =
    agencyRunPhase === "failed"
      ? "border-red-200 bg-red-100 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
      : agencyRunPhase === "completed"
        ? "border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
        : agencyRunPhase === "running" || agencyRunPhase === "connecting"
          ? "border-indigo-200 bg-indigo-100 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-200"
          : "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200";

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
            {t('common.back')}
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
          <h1 className="text-lg font-semibold hidden sm:block">{t('chat.title')}</h1>
        </div>
        <div className="flex items-center gap-1">
          <LocaleToggle className="hidden xl:inline-flex" />
          <HelpButton page="/chat" variant="ghost" size="sm" />
          <Button
            variant={rightPanel === "skills" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setRightPanel(rightPanel === "skills" ? "none" : "skills")}
            className="gap-2"
            disabled={!selectedConversationId}
          >
            <Wand2 className="h-4 w-4" />
            <span className="hidden sm:inline">{t('chat.skills')}</span>
          </Button>
          <Button
            variant={rightPanel === "artifacts" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setRightPanel(rightPanel === "artifacts" ? "none" : "artifacts")}
            className="gap-2"
            disabled={!selectedConversationId || artifacts.length === 0}
          >
            <Layers className="h-4 w-4" />
            <span className="hidden sm:inline">{t('chat.artifacts')}</span>
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
            <span className="hidden sm:inline">{t('chat.alerts')}</span>
          </Button>
          <Button
            variant={rightPanel === "memory" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setRightPanel(rightPanel === "memory" ? "none" : "memory")}
            className="gap-2"
          >
            <Brain className="h-4 w-4" />
            <span className="hidden sm:inline">{t('chat.memory')}</span>
          </Button>
          <Button
            variant={rightPanel === "finance" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setRightPanel(rightPanel === "finance" ? "none" : "finance")}
            className="gap-2"
          >
            <ReceiptText className="h-4 w-4" />
            <span className="hidden sm:inline">{t('chat.finance')}</span>
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
                {latestBrowserSessionArtifact?.summary.primaryActionLabel ?? t('chat.openBrowserSession')}
              </span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAgencyPickerOpen(true)}
            className="gap-2"
            title={t('chat.runAgencyInline')}
          >
            <Play className="h-4 w-4" />
            <span className="hidden sm:inline">{t('chat.runAgency')}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/agencies")}
            className="gap-2"
          >
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">{t('chat.agencies')}</span>
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
              activateConversation(id, { closeSidebar: true });
              setSidebarOpen(false);
            }}
            onNewChat={handleNewChat}
            onNewPersonalChat={handleNewPersonalChat}
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
              onSelectConversation={(id) => activateConversation(id, { closeSidebar: false })}
              onNewChat={handleNewChat}
              onNewPersonalChat={handleNewPersonalChat}
              onOpenTeamRoom={handleOpenTeamRoom}
            />
          )}
        </div>

        {/* Sidebar Toggle for Desktop */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="hidden lg:flex h-full w-5 items-center justify-center hover:bg-primary/10 transition-colors group border-r"
          title={sidebarOpen ? t('chat.hideSidebar') : t('chat.showSidebar')}
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
                        {t('chat.browserSession')}
                      </p>
                      <p className="text-sm font-semibold text-slate-900">
                        {t('chat.browserSessionDescription')}
                      </p>
                      <p className="text-xs text-slate-600">
                        {t('chat.browserSessionHint')}
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
                        {t('chat.startBrowserSession')}
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
                        {t('chat.quickBrowserInstruction')}
                        </p>
                        <p className="mt-1 text-xs text-slate-600">
                          {t('chat.quickBrowserInstructionDesc')}
                        </p>
                      </div>
                      <Select
                        value={browserCommandSkillId}
                        onValueChange={(value) => handleBrowserCommandSkillChange(value as typeof browserCommandSkillId)}
                      >
                        <SelectTrigger className="bg-white">
                          <SelectValue placeholder={t('chat.chooseBrowserSkill')} />
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
                        placeholder={t('chat.browserInstructionPlaceholder')}
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
                        {browserCommandBusy ? t('chat.queuingInstruction') : t('chat.sendBrowserInstruction')}
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
                  onRunAgency={() => setAgencyPickerOpen(true)}
                  onOpenFinancePanel={() => setRightPanel("finance")}
                />
                {/* Agency suggestion card (auto-detected) */}
                {agencySuggestion && !targetAgency && (
                  <div className="mx-auto max-w-3xl px-4 pb-2">
                    <div className="flex items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm dark:border-indigo-800 dark:bg-indigo-950">
                      <Users className="h-4 w-4 shrink-0 text-indigo-600" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-indigo-900 dark:text-indigo-100">
                          {t('chat.agencyDetected', { name: agencySuggestion.agencyName })}
                        </p>
                        <p className="text-xs text-indigo-600 dark:text-indigo-300 mt-0.5">
                          {t('chat.agencyDetectedHint')}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        className="shrink-0 bg-indigo-600 hover:bg-indigo-700"
                        onClick={() => {
                          setTargetAgency({ id: agencySuggestion.agencyId, name: agencySuggestion.agencyName });
                          setAgencySuggestion(null);
                          setAgencyRunPhase("idle");
                          setAgencyPanelCollapsed(false);
                        }}
                      >
                          {t('chat.useAgency')}
                      </Button>
                      <Button size="sm" variant="ghost" className="shrink-0" onClick={() => setAgencySuggestion(null)}>
                        {t('chat.dismiss')}
                      </Button>
                    </div>
                  </div>
                )}
                {/* Inline agency run panel */}
                {targetAgency && (
                  <div className="sticky bottom-0 z-20 border-t bg-indigo-50/80 px-4 py-3 shadow-[0_-8px_24px_rgba(79,70,229,0.08)] backdrop-blur dark:bg-indigo-950/80">
                    <div className="mx-auto max-w-3xl space-y-3">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-indigo-600" />
                        <span className="text-sm font-medium text-indigo-900 dark:text-indigo-100">
                          {targetAgency.name}
                        </span>
                        <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5", agencyStatusTone)}>
                          {agencyStatusLabel}
                        </Badge>
                        <div className="ml-auto flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            onClick={() => setAgencyPanelCollapsed((value) => !value)}
                            title={agencyPanelCollapsed ? t('chat.expandAgencyPanel') : t('chat.collapseAgencyPanel')}
                          >
                            {agencyPanelCollapsed ? (
                              <ChevronDown className="h-3 w-3" />
                            ) : (
                              <ChevronUp className="h-3 w-3" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            onClick={() => {
                              setTargetAgency(null);
                              setAgencyInput("");
                              setAgencyRunPhase("idle");
                              setAgencyPanelCollapsed(false);
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      {!agencyPanelCollapsed ? (
                        <>
                          <p className="text-xs text-muted-foreground">
                            {t('chat.agencyPanelHint')}
                          </p>
                          <div className="rounded-md border border-indigo-200 bg-white/70 px-3 py-3 shadow-sm dark:border-indigo-900 dark:bg-slate-950/40">
                            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-700 dark:text-indigo-300">
                                  Desktop handoff
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Open this agency in Desktop Host for governed local package sync,
                                  Pi preparation, and Agency Swarm execution.
                                </p>
                              </div>
                              <DesktopAgencyHandoffLinks
                                agencyId={targetAgency.id}
                                runId={selectedConversationId ? `chat-${selectedConversationId}` : undefined}
                              />
                            </div>
                          </div>
                          {/* Agency stream output */}
                          {agencyStream.messages.length > 0 ? (
                            <div className="max-h-[300px] overflow-y-auto rounded-md border bg-background p-3">
                              <AgencyChatStream
                                messages={agencyStream.messages}
                                activeAgent={agencyStream.activeAgent}
                                isStreaming={agencyStream.isStreaming}
                                error={agencyStream.error}
                                creditsUsed={agencyStream.creditsUsed}
                                activityEvents={agencyStream.activityEvents}
                                toolCalls={agencyStream.toolCalls}
                                guardrailEvents={agencyStream.guardrailEvents}
                                pendingApproval={agencyStream.pendingApproval}
                                isPollingFallback={agencyStream.isPollingFallback}
                                hybridSummary={agencyStream.hybridSummary ?? null}
                                stepAttemptSnapshots={agencyStream.stepAttemptSnapshots ?? []}
                              />
                            </div>
                          ) : (
                            <div className="rounded-md border border-dashed bg-background/70 px-4 py-6 text-sm text-muted-foreground">
                              {t('chat.agencyNoActivity')}
                            </div>
                          )}
                          {agencyStream.error && (
                            <p className="text-xs text-destructive">{agencyStream.error}</p>
                          )}
                          {/* Agency input */}
                          <div className="flex gap-2">
                            <Textarea
                              value={agencyInput}
                              onChange={(e) => setAgencyInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  handleAgencySend();
                                }
                              }}
                              placeholder={t('chat.agencyMessagePlaceholder', { name: targetAgency.name })}
                              className="min-h-[44px] max-h-[120px] resize-none flex-1"
                              rows={1}
                              disabled={agencyStream.isStreaming || agencyRunPhase === "connecting"}
                            />
                            <Button
                              onClick={handleAgencySend}
                              disabled={!agencyInput.trim() || agencyStream.isStreaming || agencyRunPhase === "connecting"}
                              className="h-11 shrink-0 bg-indigo-600 px-4 hover:bg-indigo-700"
                            >
                              {agencyRunPhase === "connecting" || agencyStream.isStreaming ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Send className="h-4 w-4" />
                              )}
                              <span className="ml-2">
                                {agencyRunPhase === "completed"
                                  ? t('chat.runAgain')
                                  : agencyRunPhase === "failed"
                                    ? t('chat.retry')
                                    : agencyRunPhase === "connecting"
                                      ? t('chat.connecting')
                                      : agencyStream.isStreaming
                                        ? t('chat.running')
                                        : t('chat.startRun')}
                              </span>
                            </Button>
                          </div>
                          {agencyStream.isStreaming && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              <span>{t('chat.agencyRunning', { agent: agencyStream.activeAgent || "" })}</span>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center gap-2 rounded-md border border-dashed bg-background/70 px-4 py-2 text-xs text-muted-foreground shadow-sm">
                          <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5", agencyStatusTone)}>
                            {agencyStatusLabel}
                          </Badge>
                          <span className="font-medium text-foreground">{targetAgency.name}</span>
                          <span>
                            {t('chat.agencyPanelCollapsed')}
                            {agencyStream.isStreaming && agencyStream.activeAgent ? ` ${t('chat.currentAgent', { agent: agencyStream.activeAgent })}` : ""}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <DashboardSurface className="mx-auto flex max-w-xl flex-col items-center gap-4 p-8 text-center">
              <DashboardSectionHeader
                eyebrow={t('chat.conversationEyebrow')}
                title={t('chat.welcomeTitle')}
                description={t('chat.welcomeDescription')}
              />
              <Button onClick={handleNewChat} size="lg" className="mt-2">
                {t('chat.startNewChat')}
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
                      {t('chat.startBrowserSession')}
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
                  {t('chat.exploreAgencies')}
                </Button>
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  className="gap-2"
                  onClick={() => setLocation(buildWorkpackEntrypointHref({
                    entrypoint: "chat",
                    surface: "intake",
                  }))}
                >
                  <Layers className="h-4 w-4" />
                  Open Workpack Intake
                </Button>
              </div>
            </DashboardSurface>
          )}
        </div>

        {/* Right Panel (Memory or Skills) */}
        <div
          data-testid="chat-right-panel"
          aria-hidden={rightPanel === "none"}
          className={cn(
            "flex h-full min-h-0 flex-shrink-0 flex-col overflow-hidden transition-all duration-200",
            rightPanel !== "none"
              ? "w-full translate-x-0 border-l sm:w-[26rem] lg:w-[36rem] xl:w-[40rem]"
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
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <SkillSettings
                conversationId={selectedConversationId}
                onClose={() => setRightPanel("none")}
              />
            </div>
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
          {rightPanel === "finance" && (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                    {t("chat.finance")}
                  </p>
                  <h2 className="truncate text-base font-semibold text-slate-900">
                    {t("dashboard:finance.title")}
                  </h2>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setRightPanel("none")}
                  className="h-9 w-9 shrink-0 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  aria-label={t("chat.dismiss")}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <FinanceAccessGate className="min-h-0 flex-1 overflow-y-auto p-3">
                <FinanceHub
                  surface="panel"
                  conversationId={selectedConversationId}
                  onCreatePersonalChat={handleNewPersonalChat}
                  onMirrorFinanceActivity={mirrorFinanceActivity}
                />
              </FinanceAccessGate>
            </div>
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

      <AgencyPickerModal
        open={agencyPickerOpen}
        onClose={() => setAgencyPickerOpen(false)}
        onSelect={(agency) => {
          setAgencyPickerOpen(false);
          setTargetAgency({ id: agency.id, name: agency.name });
          setAgencyRunPhase("idle");
          setAgencyPanelCollapsed(false);
        }}
      />
    </div>
  );
}
