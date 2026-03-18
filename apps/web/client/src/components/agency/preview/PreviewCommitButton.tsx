import { useState } from "react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Check,
  Loader2,
  Save,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { useLocation } from "wouter";

interface PreviewCommitButtonProps {
  agencyId: string;
  runId: string;
  artifactId: string;
  commitToken: string;
  commitAvailable: boolean;
  commitStatus: string;
  lifecycleState: string;
  previewType: string;
  targetType: string | null;
  targetId: string | null;
  onCommitted?: (result: { targetType: string; targetId: string }) => void;
}

export function PreviewCommitButton({
  agencyId,
  runId,
  artifactId,
  commitToken,
  commitAvailable,
  commitStatus,
  lifecycleState,
  previewType,
  targetType,
  targetId,
  onCommitted,
}: PreviewCommitButtonProps) {
  const [, setLocation] = useLocation();
  const [localStatus, setLocalStatus] = useState<
    "idle" | "committing" | "committed" | "error"
  >("idle");

  const commitMutation = trpc.agency.commitPreview.useMutation({
    onSuccess: (result) => {
      setLocalStatus("committed");
      if (onCommitted && result.targetType && result.targetId) {
        onCommitted({
          targetType: result.targetType,
          targetId: result.targetId,
        });
      }

      // Deck commit → redirect to presentation editor
      if (
        previewType === "deck" &&
        result.targetType === "presentation_deck" &&
        result.targetId
      ) {
        try {
          const parsed = JSON.parse(result.targetId);
          if (parsed.libraryItemId) {
            toast.success("Presentation created — opening editor...");
            setLocation(
              `/presentation-editor/${parsed.libraryItemId}`,
            );
            return;
          }
        } catch {
          // targetId might not be JSON, fall through to default toast
        }
      }

      // Library commit → toast with "View in Library" action
      if (result.targetType === "library_item" && result.targetId) {
        toast.success(commitSuccessMessage(previewType), {
          action: {
            label: "View in Library →",
            onClick: () => setLocation("/library"),
          },
        });
        return;
      }

      toast.success(commitSuccessMessage(previewType));
    },
    onError: (err) => {
      setLocalStatus("error");
      toast.error(err.message || "Failed to commit preview");
    },
  });

  const isCommitted =
    localStatus === "committed" || commitStatus === "committed";
  const isExpired = lifecycleState === "expired_preview";
  const isCommitting =
    localStatus === "committing" || commitMutation.isPending;

  if (isCommitted) {
    return (
      <Button variant="outline" size="sm" disabled className="gap-2">
        <Check className="h-4 w-4 text-green-600" />
        Saved to {targetLabel(previewType, targetType)}
      </Button>
    );
  }

  if (isExpired) {
    return (
      <Button variant="outline" size="sm" disabled className="gap-2">
        <Clock className="h-4 w-4 text-amber-500" />
        Preview Expired
      </Button>
    );
  }

  if (localStatus === "error") {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-2 border-red-200 text-red-700 hover:bg-red-50"
        onClick={() => {
          setLocalStatus("idle");
        }}
      >
        <AlertTriangle className="h-4 w-4" />
        Retry Save
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      className="gap-2"
      disabled={!commitAvailable || isCommitting}
      onClick={() => {
        setLocalStatus("committing");
        commitMutation.mutate({
          agencyId,
          runId,
          artifactId,
          commitToken,
        });
      }}
    >
      {isCommitting ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Save className="h-4 w-4" />
      )}
      {isCommitting ? "Saving..." : commitLabel(previewType)}
    </Button>
  );
}

function commitLabel(previewType: string): string {
  switch (previewType) {
    case "deck":
      return "Save as Presentation";
    case "research":
      return "Save to Library";
    case "storyboard":
      return "Save to Library";
    case "comparison":
      return "Save to Library";
    case "media_prompt":
      return "Save Prompt";
    case "text_content":
      return "Save to Library";
    default:
      return "Save";
  }
}

function commitSuccessMessage(previewType: string): string {
  switch (previewType) {
    case "deck":
      return "Presentation created successfully";
    case "research":
      return "Research report saved to Library";
    case "storyboard":
      return "Storyboard saved to Library";
    case "comparison":
      return "Comparison saved to Library";
    case "media_prompt":
      return "Media prompt saved";
    case "text_content":
      return "Content saved to Library";
    default:
      return "Saved successfully";
  }
}

function targetLabel(
  previewType: string,
  targetType: string | null,
): string {
  if (targetType === "presentation_deck") return "Presentations";
  switch (previewType) {
    case "deck":
      return "Presentations";
    default:
      return "Library";
  }
}
