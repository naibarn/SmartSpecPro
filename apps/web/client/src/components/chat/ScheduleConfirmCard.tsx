import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Bell, Clock, Calendar, Check, X, Edit2, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ParsedSchedule {
  prompt: string;
  cronExpression?: string | null;
  scheduledAt?: string | null;
  isRecurring: boolean;
  emailNotify: boolean;
  description?: string;
  timezone?: string;
}

interface ScheduleConfirmCardProps {
  parsed: ParsedSchedule;
  conversationId?: number;
  model?: string;
  onConfirmed: () => void;
  onCancel: () => void;
}

export function ScheduleConfirmCard({
  parsed,
  conversationId,
  model,
  onConfirmed,
  onCancel,
}: ScheduleConfirmCardProps) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ParsedSchedule>(parsed);

  const createMutation = trpc.scheduledMessages.create.useMutation({
    onSuccess: () => {
      toast.success("Schedule created successfully!");
      onConfirmed();
    },
    onError: (err) => {
      toast.error(`Failed to create schedule: ${err.message}`);
    },
  });

  const handleConfirm = () => {
    createMutation.mutate({
      prompt: form.prompt,
      cronExpression: form.cronExpression,
      scheduledAt: form.scheduledAt,
      isRecurring: form.isRecurring,
      emailNotify: form.emailNotify,
      description: form.description,
      modelId: model,
      conversationId: conversationId,
      timezone: form.timezone || "Asia/Bangkok",
    });
  };

  const formatCron = (cron: string | null | undefined) => {
    if (!cron) return "One-time";
    const parts = cron.split(" ");
    if (parts.length !== 5) return cron;
    const [min, hour, , , dow] = parts;
    const time = `${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
    if (dow === "1-5") return `Weekdays at ${time}`;
    if (dow === "*") return `Daily at ${time}`;
    return cron;
  };

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3 my-2 max-w-md">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Bell className="h-4 w-4 text-primary" />
        Schedule Alert
      </div>

      {!editing ? (
        <>
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium">
                {form.isRecurring ? formatCron(form.cronExpression) : "One-time"}
              </span>
            </div>
            {form.scheduledAt && (
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{new Date(form.scheduledAt).toLocaleString()}</span>
              </div>
            )}
            <p className="text-muted-foreground text-xs mt-1">
              {form.description || form.prompt.slice(0, 150)}
            </p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Email: {form.emailNotify ? "Yes" : "No"}</span>
              <span>TZ: {form.timezone || "Asia/Bangkok"}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={handleConfirm}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              Confirm
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setEditing(true)}
            >
              <Edit2 className="h-3 w-3" />
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={onCancel}
            >
              <X className="h-3 w-3" />
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <div>
            <Label className="text-xs">Prompt</Label>
            <Input
              value={form.prompt}
              onChange={(e) => setForm({ ...form, prompt: e.target.value })}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">
              {form.isRecurring ? "Cron Expression" : "Scheduled At (ISO)"}
            </Label>
            <Input
              value={form.isRecurring ? (form.cronExpression || "") : (form.scheduledAt || "")}
              onChange={(e) =>
                form.isRecurring
                  ? setForm({ ...form, cronExpression: e.target.value })
                  : setForm({ ...form, scheduledAt: e.target.value })
              }
              className="h-8 text-xs"
              placeholder={form.isRecurring ? "0 8 * * *" : "2026-02-01T08:00:00+07:00"}
            />
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Input
              value={form.description || ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="h-8 text-xs"
            />
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                checked={form.emailNotify}
                onCheckedChange={(v) => setForm({ ...form, emailNotify: v })}
              />
              <Label className="text-xs">Email</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.isRecurring}
                onCheckedChange={(v) => setForm({ ...form, isRecurring: v })}
              />
              <Label className="text-xs">Recurring</Label>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={() => setEditing(false)}>
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
