import { useEffect, useState, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useAgencyStream } from "@/hooks/useAgencyStream";
import { useAgencyById } from "@/hooks/useAgencyQuery";
import AgencyActivityPanel from "@/components/agency/AgencyActivityPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Send,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  AlertCircle,
  Users,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
    });
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
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

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-muted-foreground" />
          <div>
            <h1 className="text-lg font-semibold">
              {agency?.name || "Agency"}
            </h1>
            {stream.activeAgent && (
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
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {stream.creditsUsed > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <CreditCard className="h-3 w-3" />
              <span>{stream.creditsUsed} credits</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
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
        <div className="flex flex-1 flex-col">
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4"
          >
            <div className="mx-auto max-w-3xl space-y-4">
              {stream.messages.length === 0 && !stream.isStreaming && (
                <div className="py-16 text-center text-muted-foreground">
                  <Users className="mx-auto mb-4 h-12 w-12 opacity-50" />
                  <p className="text-lg font-medium">
                    Start a conversation
                  </p>
                  <p className="text-sm">
                    Send a message to begin interacting with this
                    agency.
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
                      "max-w-[80%] rounded-lg px-4 py-2",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted",
                    )}
                  >
                    {msg.role === "assistant" && msg.agentName && (
                      <Badge
                        variant="secondary"
                        className={cn(
                          "mb-1 text-[10px] px-1 py-0",
                          getAgentColor(msg.agentName),
                        )}
                      >
                        {msg.agentName}
                      </Badge>
                    )}
                    <p className="whitespace-pre-wrap text-sm">
                      {msg.content}
                      {msg.isStreaming && (
                        <span className="ml-1 inline-block h-3 w-1 animate-pulse bg-current" />
                      )}
                    </p>
                  </div>
                </div>
              ))}

              {stream.error && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{stream.error}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto"
                    onClick={() => {
                      if (stream.messages.length > 0) {
                        const lastUserMsg = [...stream.messages]
                          .reverse()
                          .find((m) => m.role === "user");
                        if (lastUserMsg && agencyId) {
                          stream.connect({
                            agencyId,
                            conversationId,
                            message: lastUserMsg.content,
                          });
                        }
                      }
                    }}
                  >
                    Retry
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Input Bar */}
          <div className="border-t p-4">
            {agency?.creatorFeeCredits > 0 && (
              <div className="mx-auto mb-2 flex max-w-3xl items-center gap-1.5 rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                <CreditCard className="h-3.5 w-3.5" />
                <span>
                  Creator fee: {agency.creatorFeeCredits} credits per successful
                  run (separate from LLM costs)
                </span>
              </div>
            )}
            <div className="mx-auto flex max-w-3xl gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Send a message..."
                className="min-h-[44px] max-h-[120px] resize-none"
                rows={1}
                disabled={stream.isStreaming}
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || stream.isStreaming}
                size="icon"
                className="shrink-0"
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
          <div className="hidden w-80 lg:block">
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
