/**
 * AgencyEscalationCard — Shown when the intent router determines a request
 * is too complex for a single skill and should be delegated to an agency swarm.
 *
 * Displays the routing reason and lets the user confirm or handle in chat.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Bot, ArrowRight, MessageSquare, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export interface AgencyEscalationCardProps {
  /** Original user message */
  message: string;
  /** Why the system decided to escalate */
  reason: string;
  /** Task profile modalities detected */
  modalities?: string[];
  /** Task complexity level */
  complexity?: string;
  /** Called when user wants to proceed with agency */
  onDelegateToAgency: (agencyId: string, conversationId: string) => void;
  /** Called when user wants to keep it as normal chat */
  onKeepInChat: () => void;
}

export function AgencyEscalationCard({
  message,
  reason,
  modalities = [],
  complexity,
  onDelegateToAgency,
  onKeepInChat,
}: AgencyEscalationCardProps) {
  const [isLoading, setIsLoading] = useState(false);

  // Fetch available agencies for the user
  const { data: agencyData } = trpc.agency.list.useQuery(
    { status: "published" },
    { staleTime: 60_000 },
  );
  const agencyList = agencyData?.agencies as Array<{ id: string; name: string }> | undefined;

  const handleDelegate = async () => {
    if (!agencyList || agencyList.length === 0) {
      toast.error("No agencies available. Please create one in the Agency Builder.");
      return;
    }

    setIsLoading(true);
    try {
      // Pick the first available agency (or a suitable one based on capabilities)
      const agency = agencyList[0];
      onDelegateToAgency(agency.id, "");
    } catch {
      toast.error("Failed to delegate to agency");
    } finally {
      setIsLoading(false);
    }
  };

  const modalityLabels = modalities
    .filter((m) => m !== "text")
    .map((m) =>
      m === "image" ? "Image" :
      m === "video" ? "Video" :
      m === "audio" ? "Audio" : m
    );

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30 p-4 space-y-3 max-w-xl">
      <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
        <Bot className="h-4 w-4" />
        <span>Complex Task Detected</span>
      </div>

      <p className="text-sm text-muted-foreground">
        This request requires multiple steps
        {modalityLabels.length > 0 && (
          <> ({modalityLabels.join(" + ")} generation)</>
        )}
        {complexity === "multi_deliverable" && " with multiple deliverables"}.
        An AI Agency can handle this more effectively.
      </p>

      {reason && (
        <p className="text-xs text-muted-foreground/70 italic">
          Routing: {reason}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={handleDelegate}
          disabled={isLoading || !agencyList?.length}
          className="gap-1.5"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Delegating...
            </>
          ) : (
            <>
              <ArrowRight className="h-3.5 w-3.5" />
              Delegate to Agency
            </>
          )}
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={onKeepInChat}
          className="gap-1.5"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Keep in Chat
        </Button>
      </div>
    </div>
  );
}
