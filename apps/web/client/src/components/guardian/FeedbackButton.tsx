import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@smartspec/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@smartspec/ui/components/dialog";
import { Input } from "@smartspec/ui/components/input";
import { Textarea } from "@smartspec/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@smartspec/ui/components/select";
import { toast } from "sonner";
import { MessageSquarePlus } from "lucide-react";

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [ticketType, setTicketType] = useState<string>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const submitMutation = trpc.feedback.submit.useMutation({
    onSuccess: () => {
      toast.success("Feedback submitted! Thank you.");
      setOpen(false);
      setTitle("");
      setDescription("");
      setTicketType("bug");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to submit feedback");
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="fixed bottom-4 right-4 z-50 rounded-full shadow-lg gap-2"
        >
          <MessageSquarePlus className="h-4 w-4" />
          Feedback
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send Feedback</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Select value={ticketType} onValueChange={setTicketType}>
            <SelectTrigger>
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bug">Bug Report</SelectItem>
              <SelectItem value="feature_request">Feature Request</SelectItem>
              <SelectItem value="observation">Observation</SelectItem>
              <SelectItem value="question">Question</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Textarea
            placeholder="Describe in detail..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
          />
          <Button
            className="w-full"
            disabled={!title.trim() || submitMutation.isPending}
            onClick={() =>
              submitMutation.mutate({
                ticketType: ticketType as any,
                title: title.trim(),
                description: description.trim() || undefined,
              })
            }
          >
            {submitMutation.isPending ? "Submitting..." : "Submit Feedback"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
