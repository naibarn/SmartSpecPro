import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star, Send, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface RunFeedbackCardProps {
  agencyId: string;
  runId: string;
  conversationId?: string;
  onClose: () => void;
  onSubmitted?: () => void;
}

const STAR_LABELS = ["", "Poor", "Fair", "Good", "Great", "Excellent"];

export function RunFeedbackCard({
  agencyId,
  runId,
  conversationId,
  onClose,
  onSubmitted,
}: RunFeedbackCardProps) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [whatWorked, setWhatWorked] = useState("");
  const [whatDidntWork, setWhatDidntWork] = useState("");
  const [improvementRequests, setImprovementRequests] = useState("");
  const [expanded, setExpanded] = useState(false);

  const submitMutation = trpc.agency.submitRunFeedback.useMutation({
    onSuccess: () => {
      toast.success("Feedback saved — AI advisor will analyze and suggest improvements");
      onSubmitted?.();
      onClose();
    },
    onError: () => toast.error("Failed to save feedback"),
  });

  const displayRating = hoverRating || rating;

  return (
    <div className="border rounded-lg bg-gradient-to-b from-primary/5 to-transparent p-4 space-y-3 animate-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">How was this run?</h4>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Star rating */}
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => { setRating(n); if (!expanded) setExpanded(true); }}
            onMouseEnter={() => setHoverRating(n)}
            onMouseLeave={() => setHoverRating(0)}
            className="p-0.5 transition-transform hover:scale-110"
          >
            <Star
              className={cn(
                "h-6 w-6 transition-colors",
                n <= displayRating
                  ? "fill-amber-400 text-amber-400"
                  : "text-gray-300",
              )}
            />
          </button>
        ))}
        {displayRating > 0 && (
          <span className="text-xs text-muted-foreground ml-2">
            {STAR_LABELS[displayRating]}
          </span>
        )}
      </div>

      {/* Expanded feedback form */}
      {expanded && (
        <div className="space-y-2.5 animate-in slide-in-from-top-1 duration-200">
          <div>
            <label className="text-xs font-medium text-green-700">What worked well?</label>
            <Textarea
              value={whatWorked}
              onChange={(e) => setWhatWorked(e.target.value)}
              placeholder="Results that matched your expectations..."
              rows={2}
              className="mt-1 text-xs"
              maxLength={2000}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-red-700">What didn't match expectations?</label>
            <Textarea
              value={whatDidntWork}
              onChange={(e) => setWhatDidntWork(e.target.value)}
              placeholder="Results that were off or missing..."
              rows={2}
              className="mt-1 text-xs"
              maxLength={2000}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-blue-700">What should be improved?</label>
            <Textarea
              value={improvementRequests}
              onChange={(e) => setImprovementRequests(e.target.value)}
              placeholder="Specific changes you'd like to see next time..."
              rows={2}
              className="mt-1 text-xs"
              maxLength={2000}
            />
          </div>
        </div>
      )}

      {/* Submit */}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" className="text-xs" onClick={onClose}>
          Skip
        </Button>
        <Button
          size="sm"
          className="text-xs gap-1"
          disabled={rating === 0 || submitMutation.isPending}
          onClick={() =>
            submitMutation.mutate({
              agencyId,
              runId,
              conversationId,
              rating,
              whatWorked: whatWorked || undefined,
              whatDidntWork: whatDidntWork || undefined,
              improvementRequests: improvementRequests || undefined,
            })
          }
        >
          {submitMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          Submit Feedback
        </Button>
      </div>
    </div>
  );
}
