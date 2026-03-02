import { useEffect, useState, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useAgencyStream } from "@/hooks/useAgencyStream";
import { useAgencyById } from "@/hooks/useAgencyQuery";
import { ModelPicker } from "@/components/agency/ModelPicker";
import AgencyActivityPanel from "@/components/agency/AgencyActivityPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
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
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { SafeMarkdown } from "@/components/chat/SafeMarkdown";

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
  const { isLoading: authLoading, isAuthenticated } = useAuth();
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
  const scrollRef = useRef<HTMLDivElement>(null);

  // Feature flag is enforced server-side: agency.getById throws NOT_FOUND
  // when AGENCY_SWARM_ENABLED is false, which sets isError=true below.
  const {
    data: agency,
    isLoading: agencyLoading,
    isError: agencyError,
  } = useAgencyById(agencyId);

  const stream = useAgencyStream();

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

  const handleSend = () => {
    if (!input.trim() || !agencyId || stream.isStreaming) return;
    stream.connect({
      agencyId,
      conversationId,
      message: input.trim(),
      ...(modelOverride ? { modelOverride } : {}),
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
            <div className="mx-auto flex max-w-3xl gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Message ${agency?.name ?? "agency"}… (Enter to send, Shift+Enter for new line)`}
                className="min-h-[44px] max-h-[160px] resize-none"
                rows={1}
                disabled={stream.isStreaming}
              />
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
