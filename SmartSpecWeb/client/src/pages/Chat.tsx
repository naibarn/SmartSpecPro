import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { ChatSidebar, ChatView, MemoryPanel, SkillSettings, ArtifactPanel, MediaGenerationPanel, type Artifact } from "@/components/chat";
import { Button } from "@/components/ui/button";
import { ChevronLeft, PanelLeftClose, PanelLeft, Brain, Wand2, Layers, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type RightPanel = "none" | "memory" | "skills" | "artifacts" | "generate";

export default function Chat() {
  const { isLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rightPanel, setRightPanel] = useState<RightPanel>("none");

  const utils = trpc.useUtils();

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

  // Create new conversation
  const handleNewChat = async () => {
    const result = await createConversationMutation.mutateAsync({
      title: "New Chat",
    });
    setSelectedConversationId(result.id);
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
      <div className="flex h-14 items-center justify-between border-b bg-background px-4">
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
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden"
          >
            {sidebarOpen ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeft className="h-4 w-4" />
            )}
          </Button>
          <h1 className="text-lg font-semibold">AI Chat</h1>
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
        {/* Sidebar */}
        <div
          className={cn(
            "w-80 flex-shrink-0 transition-all duration-200",
            sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0 lg:w-0"
          )}
        >
          {sidebarOpen && (
            <ChatSidebar
              selectedConversationId={selectedConversationId}
              onSelectConversation={setSelectedConversationId}
              onNewChat={handleNewChat}
            />
          )}
        </div>

        {/* Sidebar Toggle for Desktop */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="hidden lg:flex h-full w-1 items-center justify-center hover:bg-primary/10 transition-colors"
          title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
        >
          <div className="h-8 w-1 rounded-full bg-border" />
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
            "w-80 flex-shrink-0 border-l transition-all duration-200 overflow-hidden",
            rightPanel !== "none" ? "translate-x-0" : "translate-x-full w-0 border-l-0"
          )}
        >
          {rightPanel === "memory" && (
            <MemoryPanel onClose={() => setRightPanel("none")} />
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
            <MediaGenerationPanel
              conversationId={selectedConversationId ?? undefined}
              onClose={() => setRightPanel("none")}
            />
          )}
        </div>
      </div>
    </div>
  );
}
