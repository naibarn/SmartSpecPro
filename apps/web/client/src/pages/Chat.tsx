import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { ChatSidebar, ChatView, MemoryPanel, SkillSettings, ArtifactPanel, MediaGenerationPanel, SchedulePanel, type Artifact } from "@/components/chat";
import { Button } from "@/components/ui/button";
import { ChevronLeft, PanelLeftClose, PanelLeft, Brain, Wand2, Layers, Sparkles, Bell, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";


type RightPanel = "none" | "memory" | "skills" | "artifacts" | "generate" | "schedule";

export default function Chat() {
  const { isLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 1024);
  const [rightPanel, setRightPanel] = useState<RightPanel>("none");

  // Deep-link state from GlobalAlerts (e.g. /chat?dm=123&dmName=John)
  const [initialDmUserId, setInitialDmUserId] = useState<number | null>(null);
  const [initialDmUserName, setInitialDmUserName] = useState<string>("");
  const [initialAlertId, setInitialAlertId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  // Get available models from LLM providers (for default model)
  const { data: modelsData } = trpc.llmProviders.availableModels.useQuery();

  // Fetch messages to extract artifacts
  const { data: messagesData } = trpc.chat.getMessages.useQuery(
    { conversationId: selectedConversationId!, limit: 100 },
    { enabled: !!selectedConversationId }
  );

  // Extract artifacts from messages
  const artifacts: Artifact[] = (messagesData || [])
    .flatMap((m) => (m.artifacts as Artifact[]) || [])
    .filter((a): a is Artifact => !!a && typeof a === "object");

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

    if (dm) {
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

  // Create new conversation with default model from LLM Provider
  const handleNewChat = async () => {
    // Find the default model from LLM Provider settings
    const defaultModel = modelsData?.models?.find(m => m.isDefault);

    const result = await createConversationMutation.mutateAsync({
      title: "New Chat",
      model: defaultModel?.id, // Use default model from LLM Provider
    });
    setSelectedConversationId(result.id);
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
              <MessageCircle className="h-5 w-5" />
            )}
          </Button>
          <h1 className="text-lg font-semibold hidden sm:block">AI Chat</h1>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant={rightPanel === "generate" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setRightPanel(rightPanel === "generate" ? "none" : "generate")}
            className="gap-2"
          >
            <Sparkles className="h-4 w-4" />
            <span className="hidden sm:inline">Generate</span>
          </Button>
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
        {/* Mobile sidebar drawer */}
        {sidebarOpen && (
          <div
            className="fixed left-0 z-40 w-80 bg-background lg:hidden"
            style={{ top: "3.5rem", height: "calc(100dvh - 3.5rem)" }}
          >
            <ChatSidebar
              selectedConversationId={selectedConversationId}
              onSelectConversation={(id) => {
                setSelectedConversationId(id);
                setSidebarOpen(false);
              }}
              onNewChat={handleNewChat}
            />
          </div>
        )}
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
            <ChatView
              conversationId={selectedConversationId}
              onTitleUpdate={handleTitleUpdate}
            />
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
            </div>
          )}
        </div>

        {/* Right Panel (Memory or Skills) */}
        <div
          className={cn(
            "w-full sm:w-96 lg:w-[28rem] flex-shrink-0 border-l transition-all duration-200 overflow-hidden",
            rightPanel !== "none" ? "translate-x-0" : "translate-x-full w-0 border-l-0"
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
          {rightPanel === "generate" && (
            <MediaGenerationPanel />
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
