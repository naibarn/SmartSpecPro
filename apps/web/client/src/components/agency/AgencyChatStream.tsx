import { useState } from "react";
import { cn } from "@/lib/utils";
import { SafeMarkdown } from "@/components/chat/SafeMarkdown";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Loader2,
  CheckCircle,
  XCircle,
  StopCircle,
  Info,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import type {
  AgencyStreamMessage,
  AgencyActivityEvent,
  ToolCallState,
  GuardrailEvent,
  ApprovalRequest,
} from "@/hooks/useAgencyStream";

export interface AgencyChatStreamProps {
  messages: AgencyStreamMessage[];
  activeAgent: string | null;
  isStreaming: boolean;
  error: string | null;
  creditsUsed: number;
  activityEvents: AgencyActivityEvent[];
  toolCalls: ToolCallState[];
  guardrailEvents: GuardrailEvent[];
  pendingApproval: ApprovalRequest | null;
  isPollingFallback: boolean;
  onCancel?: (mode: "immediate" | "after_turn") => void;
  onApprovalSubmit?: (approvalKey: string, approved: boolean, feedback?: string) => void;
  onRetrySSE?: () => void;
  getAgentColor?: (name: string) => string;
}

function defaultAgentColor(_name: string): string {
  return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
}

export function AgencyChatStream({
  messages,
  isStreaming,
  activityEvents,
  toolCalls,
  guardrailEvents,
  pendingApproval,
  isPollingFallback,
  onCancel,
  onApprovalSubmit,
  onRetrySSE,
  getAgentColor = defaultAgentColor,
}: AgencyChatStreamProps) {
  const [rejectFeedback, setRejectFeedback] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  // Find the index of the last streaming message for inline tool display
  const activeToolCalls = toolCalls.filter((tc) => tc.status === "running");

  return (
    <div className="space-y-4">
        {/* Polling fallback banner */}
        {isPollingFallback && (
          <div
            data-testid="polling-fallback-banner"
            className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300"
          >
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span>Live streaming unavailable. Using polling updates.</span>
            {onRetrySSE && (
              <button
                className="ml-auto underline underline-offset-2 hover:no-underline"
                onClick={onRetrySSE}
              >
                Retry SSE
              </button>
            )}
          </div>
        )}

        {/* Messages */}
        {messages.map((msg, idx) => (
          <div key={msg.id}>
            <div
              className={cn(
                "flex",
                msg.role === "user" ? "justify-end" : "justify-start",
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
                      <span
                        data-testid="typing-cursor"
                        className="ml-1 inline-block h-3 w-1 animate-pulse bg-current"
                      />
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Inline tool calls after streaming assistant messages */}
            {msg.role === "assistant" && msg.isStreaming && activeToolCalls.length > 0 && (
              <div className="ml-4 mt-2 space-y-1">
                {activeToolCalls.map((tc) => (
                  <ToolCallItem key={tc.toolCallId} toolCall={tc} />
                ))}
              </div>
            )}

          </div>
        ))}

        {/* Completed tool calls display */}
        {toolCalls.length > 0 && !isStreaming && (
          <div className="space-y-1">
            {toolCalls.map((tc) => (
              <ToolCallItem key={tc.toolCallId} toolCall={tc} />
            ))}
          </div>
        )}

        {/* Agent switch badges */}
        {activityEvents
          .filter((e) => e.type === "agent_switch")
          .map((e, i) => (
            <div
              key={`switch-${i}`}
              className="flex justify-center"
            >
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] px-2 py-0.5",
                  getAgentColor(e.agentName),
                )}
              >
                {e.agentName} took over
              </Badge>
            </div>
          ))}

        {/* Guardrail alerts */}
        {guardrailEvents.map((ge, i) => (
          <div
            key={`guardrail-${i}`}
            data-testid="guardrail-alert"
            className={cn(
              "flex items-center gap-2 rounded-md border px-3 py-2 text-xs",
              ge.action === "blocked"
                ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
                : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
            )}
          >
            {ge.action === "blocked" ? (
              <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            )}
            <span>
              <strong>{ge.guardrailName}</strong> — {ge.action}
            </span>
          </div>
        ))}

        {/* Approval card */}
        {pendingApproval && (
          <div
            data-testid="approval-card"
            className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950"
          >
            <div className="flex items-center gap-2 mb-2">
              <UserCheck className="h-4 w-4 text-blue-600" />
              {pendingApproval.agentName && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {pendingApproval.agentName}
                </Badge>
              )}
              <span className="text-xs font-medium text-blue-800 dark:text-blue-200">
                Approval Required
              </span>
            </div>
            <p className="text-sm text-blue-900 dark:text-blue-100 mb-3">
              {pendingApproval.summary}
            </p>
            {showRejectInput && (
              <Textarea
                value={rejectFeedback}
                onChange={(e) => setRejectFeedback(e.target.value)}
                placeholder="Reason for rejection (optional)"
                className="mb-2 min-h-[60px] text-xs"
              />
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  onApprovalSubmit?.(pendingApproval.approvalKey, true);
                }}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  if (!showRejectInput) {
                    setShowRejectInput(true);
                    return;
                  }
                  onApprovalSubmit?.(
                    pendingApproval.approvalKey,
                    false,
                    rejectFeedback || undefined,
                  );
                  setShowRejectInput(false);
                  setRejectFeedback("");
                }}
              >
                Reject
              </Button>
            </div>
          </div>
        )}

        {/* Cancel button */}
        {isStreaming && onCancel && (
          <div className="flex justify-center" data-testid="cancel-button-wrapper">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <StopCircle className="h-3.5 w-3.5" />
                  Cancel
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => onCancel("immediate")}>
                  Cancel Now
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onCancel("after_turn")}>
                  Cancel After Turn
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
    </div>
  );
}

function ToolCallItem({ toolCall }: { toolCall: ToolCallState }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {toolCall.status === "running" && (
        <Loader2 className="h-3.5 w-3.5 animate-spin" data-testid="tool-spinner" />
      )}
      {toolCall.status === "success" && (
        <CheckCircle className="h-3.5 w-3.5 text-green-600" data-testid="tool-success" />
      )}
      {toolCall.status === "error" && (
        <XCircle className="h-3.5 w-3.5 text-red-600" data-testid="tool-error" />
      )}
      <span className="font-medium">{toolCall.toolName}</span>
      {toolCall.progressMessage && (
        <span className="text-muted-foreground/70">{toolCall.progressMessage}</span>
      )}
    </div>
  );
}
