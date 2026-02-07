import { useState, useEffect, useMemo, useRef, createContext, useContext } from "react";
import { format, isToday, isTomorrow, isSameMonth, startOfDay } from "date-fns";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Bell,
  Clock,
  Pause,
  Play,
  Trash2,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  UserPlus,
  UserMinus,
  Users,
  Search,
  MessageCircle,
  ShieldBan,
  Heart,
  Send,
  Zap,
  ArrowLeft,
  Edit2,
  Save,
  X,
  Mail,
  MailOff,
  CalendarDays,
  List,
  FileText,
  Plus,
  AlarmClock,
} from "lucide-react";
import { Calendar as CalendarWidget } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface SchedulePanelProps {
  onNavigateToChat?: (conversationId: number) => void;
  initialDmUserId?: number | null;
  initialDmUserName?: string;
  isFromAlert?: boolean;
  initialAlertId?: number | null;
}

export function SchedulePanel({ onNavigateToChat, initialDmUserId, initialDmUserName, isFromAlert, initialAlertId }: SchedulePanelProps = {}) {
  const [expandedId, setExpandedId] = useState<number | null>(initialAlertId ?? null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCron, setEditCron] = useState("");

  // Quick Reminder form state
  const [showQuickReminder, setShowQuickReminder] = useState(false);
  const [reminderText, setReminderText] = useState("");
  const [reminderDate, setReminderDate] = useState("");
  const [reminderTime, setReminderTime] = useState("");
  const [reminderRecurring, setReminderRecurring] = useState(false);
  const [reminderCron, setReminderCron] = useState("");
  const [reminderPriority, setReminderPriority] = useState<"low" | "normal" | "high" | "critical">("normal");

  // Calendar view state
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.scheduledMessages.list.useQuery({
    limit: 50,
    offset: 0,
  });

  const togglePause = trpc.scheduledMessages.togglePause.useMutation({
    onSuccess: (result) => {
      utils.scheduledMessages.list.invalidate();
      toast.success(result.status === "paused" ? "Schedule paused" : "Schedule resumed");
    },
    onError: (err) => toast.error(`Failed to toggle: ${err.message}`),
  });

  const deleteMutation = trpc.scheduledMessages.delete.useMutation({
    onSuccess: () => {
      utils.scheduledMessages.list.invalidate();
      toast.success("Schedule deleted");
      setDeleteId(null);
      // Clear expanded/editing state for the deleted item
      if (expandedId === deleteId) setExpandedId(null);
      if (editingId === deleteId) setEditingId(null);
    },
    onError: (err) => { toast.error(`Delete failed: ${err.message}`); setDeleteId(null); },
  });

  const updateMutation = trpc.scheduledMessages.update.useMutation({
    onSuccess: () => {
      utils.scheduledMessages.list.invalidate();
      toast.success("Schedule updated");
      setEditingId(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const createReminderMutation = trpc.scheduledMessages.create.useMutation({
    onSuccess: () => {
      utils.scheduledMessages.list.invalidate();
      utils.scheduledMessages.getNotificationCount.invalidate();
      toast.success("Reminder created!");
      setShowQuickReminder(false);
      setReminderText("");
      setReminderDate("");
      setReminderTime("");
      setReminderRecurring(false);
      setReminderCron("");
      setReminderPriority("normal");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleCreateReminder = () => {
    const text = reminderText.trim();
    if (!text) return;

    if (reminderRecurring) {
      if (!reminderCron.trim()) {
        toast.error("Please enter a cron expression for recurring reminders");
        return;
      }
      createReminderMutation.mutate({
        prompt: text,
        description: text.slice(0, 80),
        isSimpleReminder: true,
        isRecurring: true,
        cronExpression: reminderCron.trim(),
        emailNotify: reminderPriority === "critical",
        priority: reminderPriority,
      });
    } else {
      if (!reminderDate || !reminderTime) {
        toast.error("Please select a date and time");
        return;
      }
      const scheduledAt = new Date(`${reminderDate}T${reminderTime}`);
      if (scheduledAt <= new Date()) {
        toast.error("Reminder time must be in the future");
        return;
      }
      createReminderMutation.mutate({
        prompt: text,
        description: text.slice(0, 80),
        isSimpleReminder: true,
        isRecurring: false,
        scheduledAt: scheduledAt.toISOString(),
        emailNotify: reminderPriority === "critical",
        priority: reminderPriority,
      });
    }
  };

  const items = data?.items || [];

  const statusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-green-500/10 text-green-600 border-green-500/30";
      case "paused": return "bg-yellow-500/10 text-yellow-600 border-yellow-500/30";
      case "completed": return "bg-blue-500/10 text-blue-600 border-blue-500/30";
      case "failed": return "bg-red-500/10 text-red-600 border-red-500/30";
      default: return "";
    }
  };

  const formatScheduleTime = (item: { cronExpression: string | null; scheduledAt?: any }) => {
    if (!item.cronExpression) {
      if (!item.scheduledAt) return "One-time";
      const date = new Date(item.scheduledAt);
      if (isToday(date)) return `Today ${format(date, "HH:mm")}`;
      if (isTomorrow(date)) return `Tomorrow ${format(date, "HH:mm")}`;
      return format(date, "MMM d, HH:mm");
    }
    const parts = item.cronExpression.split(" ");
    if (parts.length !== 5) return item.cronExpression;
    const [min, hour, dom, mon, dow] = parts;
    if (dom === "*" && mon === "*" && dow === "*") return `Daily at ${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
    if (dom === "*" && mon === "*" && dow === "1-5") return `Weekdays at ${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
    if (hour.startsWith("*/")) return `Every ${hour.slice(2)} hours`;
    if (min.startsWith("*/")) return `Every ${min.slice(2)} minutes`;
    return item.cronExpression;
  };

  const formatCronOnly = (cron: string | null) => {
    if (!cron) return "One-time";
    const parts = cron.split(" ");
    if (parts.length !== 5) return cron;
    const [min, hour, dom, mon, dow] = parts;
    if (dom === "*" && mon === "*" && dow === "*") return `Daily at ${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
    if (dom === "*" && mon === "*" && dow === "1-5") return `Weekdays at ${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
    if (hour.startsWith("*/")) return `Every ${hour.slice(2)} hours`;
    if (min.startsWith("*/")) return `Every ${min.slice(2)} minutes`;
    return cron;
  };

  // Track whether deep-link highlight is active (auto-clears after 3s)
  const [highlightId, setHighlightId] = useState<number | null>(initialAlertId ?? null);

  // Auto-scroll to specific alert item from deep-link
  useEffect(() => {
    if (initialAlertId && !isLoading) {
      const el = document.getElementById(`schedule-item-${initialAlertId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      // Clear highlight ring after 3 seconds
      const timer = setTimeout(() => setHighlightId(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [initialAlertId, isLoading]);

  const startEdit = (item: any) => {
    setEditingId(item.id);
    setEditPrompt(item.prompt);
    setEditDescription(item.description || "");
    setEditCron(item.cronExpression || "");
  };

  const saveEdit = (id: number) => {
    updateMutation.mutate({
      id,
      prompt: editPrompt,
      description: editDescription || undefined,
      cronExpression: editCron || undefined,
    });
  };

  return (
    <div className="flex h-full flex-col border-l bg-muted/30">
      <div className="flex items-center justify-between border-b p-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Bell className="h-4 w-4" />
          Scheduled Alerts
          {items.length > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {items.length}
            </Badge>
          )}
        </h3>
        <div className="flex items-center gap-1">
          {/* View toggle */}
          <div className="flex items-center border rounded-md overflow-hidden mr-0.5">
            <button
              onClick={() => { setViewMode("list"); setSelectedDay(null); }}
              className={cn(
                "h-6 w-6 flex items-center justify-center transition-colors",
                viewMode === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              )}
              title="List view"
            >
              <List className="h-3 w-3" />
            </button>
            <button
              onClick={() => setViewMode("calendar")}
              className={cn(
                "h-6 w-6 flex items-center justify-center transition-colors",
                viewMode === "calendar" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              )}
              title="Calendar view"
            >
              <CalendarDays className="h-3 w-3" />
            </button>
          </div>
          <Button
            variant={showQuickReminder ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2 text-[11px] gap-1"
            onClick={() => { setShowQuickReminder(!showQuickReminder); if (viewMode === "calendar") setViewMode("list"); }}
            title="Quick reminder"
          >
            <AlarmClock className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Remind</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => utils.scheduledMessages.list.invalidate()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Quick Reminder Form */}
      {showQuickReminder && (
        <div className="border-b p-3 space-y-2 bg-muted/50">
          <div className="flex items-center gap-1.5 mb-1">
            <AlarmClock className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium">Quick Reminder</span>
            <Badge variant="outline" className="text-[9px] px-1 py-0 border-green-500/50 text-green-600">0 credits</Badge>
          </div>
          <Textarea
            placeholder="What do you want to be reminded about?&#10;e.g. ประชุมที่ตึก A ห้อง 302"
            value={reminderText}
            onChange={(e) => setReminderText(e.target.value)}
            className="text-xs min-h-[56px] resize-none"
            rows={2}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1 text-[11px] cursor-pointer">
              <input
                type="checkbox"
                checked={reminderRecurring}
                onChange={(e) => setReminderRecurring(e.target.checked)}
                className="h-3 w-3 rounded"
              />
              Recurring
            </label>
            <span className="text-[10px] text-muted-foreground">|</span>
            <div className="flex gap-1">
              {([
                { value: "low", label: "Low", color: "bg-slate-500/20 text-slate-400 border-slate-500/30", activeColor: "bg-slate-500 text-white" },
                { value: "normal", label: "Normal", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", activeColor: "bg-blue-500 text-white" },
                { value: "high", label: "High", color: "bg-amber-500/20 text-amber-400 border-amber-500/30", activeColor: "bg-amber-500 text-white" },
                { value: "critical", label: "Critical", color: "bg-red-500/20 text-red-400 border-red-500/30", activeColor: "bg-red-500 text-white" },
              ] as const).map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setReminderPriority(p.value)}
                  className={cn(
                    "px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors",
                    reminderPriority === p.value ? p.activeColor : p.color
                  )}
                  title={
                    p.value === "high" || p.value === "critical"
                      ? `${p.label} — will show full-screen alert`
                      : p.label
                  }
                >
                  {p.value === "critical" && "!! "}
                  {p.value === "high" && "! "}
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          {(reminderPriority === "high" || reminderPriority === "critical") && (
            <p className="text-[10px] text-amber-500 flex items-center gap-1">
              <Zap className="h-3 w-3" />
              {reminderPriority === "critical"
                ? "Will show full-screen alert with email notification"
                : "Will show full-screen alert when triggered"}
            </p>
          )}
          {reminderRecurring ? (
            <Input
              placeholder="Cron expression, e.g. 0 8 * * * (daily 8:00)"
              value={reminderCron}
              onChange={(e) => setReminderCron(e.target.value)}
              className="h-7 text-xs"
            />
          ) : (
            <div className="flex gap-2">
              <Input
                type="date"
                value={reminderDate}
                onChange={(e) => setReminderDate(e.target.value)}
                className="h-7 text-xs flex-1"
                min={new Date().toISOString().split("T")[0]}
              />
              <Input
                type="time"
                value={reminderTime}
                onChange={(e) => setReminderTime(e.target.value)}
                className="h-7 text-xs w-24"
              />
            </div>
          )}
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs flex-1"
              onClick={() => setShowQuickReminder(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs flex-1 gap-1"
              onClick={handleCreateReminder}
              disabled={!reminderText.trim() || createReminderMutation.isPending}
            >
              {createReminderMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Plus className="h-3 w-3" />
              )}
              Create
            </Button>
          </div>
        </div>
      )}

      {viewMode === "list" ? (
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>No scheduled alerts yet</p>
              <p className="text-xs mt-1">
                Type a scheduling request in chat, e.g.<br />
                "Every day at 8 AM, find IT news"<br />
                "แจ้งฉัน ทุกวันตอนแปดโมงเช้า"
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 text-xs gap-1"
                onClick={() => setShowQuickReminder(true)}
              >
                <AlarmClock className="h-3.5 w-3.5" />
                Create Reminder
              </Button>
            </div>
          ) : (
            items.map((item) => {
              const isExpanded = expandedId === item.id;
              const isEditing = editingId === item.id;

              return (
                <div
                  key={item.id}
                  id={`schedule-item-${item.id}`}
                  className={cn(
                    "rounded-lg border transition-colors",
                    isExpanded ? "bg-card shadow-sm" : "hover:bg-muted/50",
                    highlightId === item.id && "ring-2 ring-primary/50 animate-pulse"
                  )}
                >
                  {/* Header - always visible, clickable to expand */}
                  <div
                    className="flex items-start gap-2 p-3 cursor-pointer"
                    onClick={() => { setExpandedId(isExpanded ? null : item.id); if (editingId && editingId !== item.id) setEditingId(null); }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm leading-snug">
                        {item.description || item.prompt.slice(0, 80)}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", statusColor(item.status))}>
                          {item.status}
                        </Badge>
                        {(item as any).isSimpleReminder && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 border-purple-400 text-purple-500">
                            <AlarmClock className="h-2.5 w-2.5 mr-0.5" />
                            Reminder
                          </Badge>
                        )}
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatScheduleTime(item)}
                        </span>
                        {item.emailNotify && (
                          <Mail className="h-3 w-3 text-muted-foreground" title="Email notifications on" />
                        )}
                      </div>
                      {item.nextRunAt && item.status === "active" && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Next: {new Date(item.nextRunAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 mt-0.5">
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="border-t px-3 pb-3 space-y-3">
                      {/* Action buttons */}
                      <div className="flex items-center gap-1.5 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={(e) => { e.stopPropagation(); togglePause.mutate({ id: item.id }); }}
                          disabled={item.status === "completed" || item.status === "failed" || togglePause.isPending}
                        >
                          {item.status === "active" ? (
                            <><Pause className="h-3 w-3" /> Pause</>
                          ) : (
                            <><Play className="h-3 w-3" /> Resume</>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={(e) => { e.stopPropagation(); startEdit(item); }}
                        >
                          <Edit2 className="h-3 w-3" /> Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); setDeleteId(item.id); }}
                        >
                          <Trash2 className="h-3 w-3" /> Delete
                        </Button>
                        {item.conversationId && onNavigateToChat && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1 ml-auto"
                            onClick={(e) => { e.stopPropagation(); onNavigateToChat(item.conversationId!); }}
                          >
                            <MessageCircle className="h-3 w-3" /> View Chat
                          </Button>
                        )}
                      </div>

                      {/* Edit form */}
                      {isEditing && (
                        <div className="space-y-2 bg-muted/50 rounded-md p-2.5">
                          <div>
                            <label className="text-[10px] font-medium text-muted-foreground block mb-1">Description</label>
                            <Input
                              value={editDescription}
                              onChange={(e) => setEditDescription(e.target.value)}
                              placeholder="Short description..."
                              className="h-7 text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-medium text-muted-foreground block mb-1">Prompt</label>
                            <Textarea
                              value={editPrompt}
                              onChange={(e) => setEditPrompt(e.target.value)}
                              className="text-xs min-h-[60px]"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-medium text-muted-foreground block mb-1">
                              Cron Expression {editCron && <span className="text-muted-foreground font-normal">({formatCronOnly(editCron)})</span>}
                            </label>
                            <Input
                              value={editCron}
                              onChange={(e) => setEditCron(e.target.value)}
                              placeholder="e.g. 0 8 * * *"
                              className="h-7 text-xs font-mono"
                            />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Button
                              size="sm"
                              className="h-7 text-xs gap-1"
                              onClick={() => saveEdit(item.id)}
                              disabled={updateMutation.isPending}
                            >
                              {updateMutation.isPending ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Save className="h-3 w-3" />
                              )}
                              Save
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs gap-1"
                              onClick={() => setEditingId(null)}
                            >
                              <X className="h-3 w-3" /> Cancel
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Full prompt display */}
                      {!isEditing && (
                        <div className="bg-muted/50 rounded-md p-2">
                          <div className="flex items-center gap-1 mb-1">
                            <FileText className="h-3 w-3 text-muted-foreground" />
                            <span className="text-[10px] font-medium text-muted-foreground">Prompt</span>
                          </div>
                          <p className="text-xs whitespace-pre-wrap">{item.prompt}</p>
                        </div>
                      )}

                      {/* Schedule info */}
                      {!isEditing && (
                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                          <div>
                            <span className="text-muted-foreground">Schedule:</span>
                            <span className="ml-1 font-mono">{item.cronExpression || (item.scheduledAt ? format(new Date(item.scheduledAt), "yyyy-MM-dd HH:mm") : "One-time")}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Timezone:</span>
                            <span className="ml-1">{(item as any).timezone || "Asia/Bangkok"}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Email:</span>
                            <span className="ml-1">{item.emailNotify ? "Yes" : "No"}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Created:</span>
                            <span className="ml-1">{new Date(item.createdAt).toLocaleDateString()}</span>
                          </div>
                          {item.lastRunAt && (
                            <div className="col-span-2">
                              <span className="text-muted-foreground">Last run:</span>
                              <span className="ml-1">{new Date(item.lastRunAt).toLocaleString()}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Execution logs */}
                      <ScheduleLogs scheduleId={item.id} />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
      ) : (
        <ScheduleCalendarView
          items={items}
          isLoading={isLoading}
          calendarMonth={calendarMonth}
          onMonthChange={setCalendarMonth}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
          statusColor={statusColor}
          onAddReminder={(date, hour) => {
            setShowQuickReminder(true);
            setReminderDate(format(date, "yyyy-MM-dd"));
            if (hour !== undefined) {
              setReminderTime(`${String(hour).padStart(2, "0")}:00`);
            }
            setViewMode("list");
          }}
          onViewItem={(id) => {
            setExpandedId(id);
            setViewMode("list");
            setTimeout(() => {
              document.getElementById(`schedule-item-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 100);
          }}
        />
      )}

      {/* Following Section */}
      <FollowSection initialDmUserId={initialDmUserId} initialDmUserName={initialDmUserName} isFromAlert={isFromAlert} />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete scheduled alert?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the schedule and cancel any pending executions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) deleteMutation.mutate({ id: deleteId });
              }}
              className="bg-destructive text-destructive-foreground"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ScheduleLogs({ scheduleId }: { scheduleId: number }) {
  const { data: logs, isLoading } = trpc.scheduledMessages.getLogs.useQuery({
    scheduledMessageId: scheduleId,
    limit: 5,
  });

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-medium text-muted-foreground">Recent Executions</p>
      {isLoading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : !logs?.length ? (
        <p className="text-[10px] text-muted-foreground italic">No executions yet</p>
      ) : (
        <div className="space-y-1">
          {logs.map((log) => (
            <div key={log.id} className="flex items-start gap-1.5 text-[10px] bg-muted/30 rounded p-1.5">
              {log.status === "success" ? (
                <CheckCircle className="h-3 w-3 text-green-500 mt-0.5 shrink-0" />
              ) : (
                <XCircle className="h-3 w-3 text-red-500 mt-0.5 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <span className="text-muted-foreground">
                  {new Date(log.executedAt).toLocaleString()}
                </span>
                {log.responseContent && (
                  <p className="text-foreground mt-0.5 whitespace-pre-wrap line-clamp-3">
                    {log.responseContent.slice(0, 300)}
                  </p>
                )}
                {log.error && (
                  <p className="text-red-500 mt-0.5">{log.error}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Calendar helpers ───

const priorityDotColor = (priority: string): string => {
  switch (priority) {
    case "critical": return "bg-red-500";
    case "high": return "bg-amber-500";
    case "normal": return "bg-blue-500";
    case "low": return "bg-slate-400";
    default: return "bg-blue-500";
  }
};

const priorityBorderColor = (priority: string): string => {
  switch (priority) {
    case "critical": return "border-l-red-500 bg-red-500/10";
    case "high": return "border-l-amber-500 bg-amber-500/10";
    case "normal": return "border-l-blue-500 bg-blue-500/10";
    case "low": return "border-l-slate-400 bg-slate-400/10";
    default: return "border-l-blue-500 bg-blue-500/10";
  }
};

function getEventDates(item: any, month: Date): Date[] {
  const dates: Date[] = [];
  if (item.status === "completed" || item.status === "failed") return dates;

  // One-time: use scheduledAt
  if (!item.isRecurring && item.scheduledAt) {
    const d = new Date(item.scheduledAt);
    if (isSameMonth(d, month)) dates.push(startOfDay(d));
    return dates;
  }

  // Recurring: compute from cron
  if (item.cronExpression) {
    const parts = item.cronExpression.split(" ");
    if (parts.length === 5) {
      const [, , dom, mon, dow] = parts;
      const year = month.getFullYear();
      const m = month.getMonth();
      const daysInMonth = new Date(year, m + 1, 0).getDate();

      if (dom === "*" && mon === "*" && dow === "*") {
        for (let d = 1; d <= daysInMonth; d++) dates.push(new Date(year, m, d));
      } else if (dom === "*" && mon === "*" && dow === "1-5") {
        for (let d = 1; d <= daysInMonth; d++) {
          const date = new Date(year, m, d);
          const dayOfWeek = date.getDay();
          if (dayOfWeek >= 1 && dayOfWeek <= 5) dates.push(date);
        }
      } else if (dom !== "*" && mon === "*") {
        const day = parseInt(dom, 10);
        if (!isNaN(day) && day >= 1 && day <= daysInMonth) dates.push(new Date(year, m, day));
      } else if (item.nextRunAt) {
        const d = new Date(item.nextRunAt);
        if (isSameMonth(d, month)) dates.push(startOfDay(d));
      }
    }
  } else if (item.nextRunAt) {
    const d = new Date(item.nextRunAt);
    if (isSameMonth(d, month)) dates.push(startOfDay(d));
  }

  return dates;
}

function getItemHour(item: any): number | null {
  if (!item.isRecurring && item.scheduledAt) {
    return new Date(item.scheduledAt).getHours();
  }
  if (item.cronExpression) {
    const parts = item.cronExpression.split(" ");
    if (parts.length === 5) {
      const hour = parseInt(parts[1], 10);
      if (!isNaN(hour) && !parts[1].startsWith("*/")) return hour;
    }
  }
  return null;
}

// ─── Calendar Context & Stable DayButton ───

interface CalendarContextValue {
  eventMap: Map<string, Array<{ item: any; priority: string }>>;
  selectedDay: Date | null;
}

const CalendarContext = createContext<CalendarContextValue>({
  eventMap: new Map(),
  selectedDay: null,
});

/** Stable named component — avoids re-mount on every render (Rules of Hooks safe) */
function ScheduleDayButton({ day, modifiers, className, children, ...props }: any) {
  const { eventMap, selectedDay } = useContext(CalendarContext);
  const dateKey = format(day.date, "yyyy-MM-dd");
  const dayEvents = eventMap.get(dateKey);
  const isSelected = selectedDay && format(selectedDay, "yyyy-MM-dd") === dateKey;
  const hasCritical = dayEvents?.some((e: any) => e.priority === "critical");
  const hasHigh = dayEvents?.some((e: any) => e.priority === "high");

  const btnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (modifiers.focused) btnRef.current?.focus();
  }, [modifiers.focused]);

  return (
    <Button
      ref={btnRef}
      variant="ghost"
      size="icon"
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      className={cn(
        "data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground flex size-auto w-full min-w-(--cell-size) flex-col gap-0.5 leading-none font-normal py-1 relative",
        isSelected && "ring-2 ring-primary",
        dayEvents && dayEvents.length > 0 && !isSelected && "bg-muted/60",
        hasCritical && !isSelected && "bg-red-500/15 ring-1 ring-red-500/30",
        hasHigh && !hasCritical && !isSelected && "bg-amber-500/10",
        className,
      )}
      {...props}
    >
      <span className="text-xs leading-none">{children}</span>
      {dayEvents && dayEvents.length > 0 ? (
        <div className="flex gap-0.5 justify-center items-center min-h-[8px]">
          {dayEvents.slice(0, 3).map((e: any, i: number) => (
            <span
              key={i}
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                priorityDotColor(e.priority),
                e.priority === "critical" && "animate-pulse h-2 w-2",
              )}
            />
          ))}
          {dayEvents.length > 3 && (
            <span className="text-[7px] font-bold text-muted-foreground leading-none">
              +{dayEvents.length - 3}
            </span>
          )}
        </div>
      ) : null}
      {dayEvents && dayEvents.length > 1 && (
        <span className={cn(
          "absolute -top-0.5 -right-0.5 text-[7px] font-bold rounded-full h-3 min-w-[12px] px-0.5 flex items-center justify-center text-white z-10",
          hasCritical ? "bg-red-500" : hasHigh ? "bg-amber-500" : "bg-blue-500",
        )}>
          {dayEvents.length}
        </span>
      )}
    </Button>
  );
}

const calendarComponents = { DayButton: ScheduleDayButton };

// ─── ScheduleCalendarView ───

interface ScheduleCalendarViewProps {
  items: any[];
  isLoading: boolean;
  calendarMonth: Date;
  onMonthChange: (month: Date) => void;
  selectedDay: Date | null;
  onSelectDay: (day: Date | null) => void;
  statusColor: (status: string) => string;
  onAddReminder: (date: Date, hour?: number) => void;
  onViewItem: (id: number) => void;
}

function ScheduleCalendarView({
  items, isLoading, calendarMonth, onMonthChange,
  selectedDay, onSelectDay, statusColor, onAddReminder, onViewItem,
}: ScheduleCalendarViewProps) {

  const eventMap = useMemo(() => {
    const map = new Map<string, Array<{ item: any; priority: string }>>();
    for (const item of items) {
      if (item.status === "completed" || item.status === "failed") continue;
      const dates = getEventDates(item, calendarMonth);
      for (const date of dates) {
        const key = format(date, "yyyy-MM-dd");
        const existing = map.get(key) || [];
        existing.push({ item, priority: item.priority || "normal" });
        map.set(key, existing);
      }
    }
    return map;
  }, [items, calendarMonth]);

  const selectedDayItems = useMemo(() => {
    if (!selectedDay) return [];
    const key = format(selectedDay, "yyyy-MM-dd");
    return (eventMap.get(key) || []).map(e => e.item);
  }, [selectedDay, eventMap]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 flex-1">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-1 pt-1 shrink-0">
        <CalendarContext.Provider value={{ eventMap, selectedDay }}>
          <CalendarWidget
            mode="single"
            selected={selectedDay ?? undefined}
            onSelect={(date) => onSelectDay(date ?? null)}
            month={calendarMonth}
            onMonthChange={onMonthChange}
            className="[--cell-size:--spacing(9)] p-1.5 w-full"
            classNames={{
              root: "w-full",
              month: "flex flex-col w-full gap-2",
              day: "relative w-full h-full p-0 text-center group/day select-none",
            }}
            components={calendarComponents}
          />
        </CalendarContext.Provider>
      </div>

      {selectedDay ? (
        <DayScheduleView
          date={selectedDay}
          items={selectedDayItems}
          statusColor={statusColor}
          onAddReminder={onAddReminder}
          onViewItem={onViewItem}
          onBack={() => onSelectDay(null)}
        />
      ) : (
        <div className="px-3 py-3 text-center text-[11px] text-muted-foreground flex-1">
          <p className="mb-3 font-medium">Click a day to see its schedule</p>
          <div className="grid grid-cols-2 gap-2 text-left px-4 max-w-[280px] mx-auto">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
              <span>Critical</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0" />
              <span>High</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-500 shrink-0" />
              <span>Normal</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-400 shrink-0" />
              <span>Low</span>
            </span>
          </div>
          <div className="mt-3 pt-2 border-t border-dashed space-y-1">
            <p className="flex items-center justify-center gap-1">
              <span className="inline-block h-4 w-5 rounded bg-muted/60 border" />
              = has reminders
            </p>
            <p className="flex items-center justify-center gap-1">
              <span className="inline-block h-4 w-5 rounded bg-red-500/15 ring-1 ring-red-500/30" />
              = has critical alert
            </p>
          </div>
          {items.length === 0 && (
            <p className="mt-4 text-muted-foreground">
              No scheduled alerts yet
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── DayScheduleView ───

function DayScheduleView({ date, items, statusColor, onAddReminder, onViewItem, onBack }: {
  date: Date;
  items: any[];
  statusColor: (status: string) => string;
  onAddReminder: (date: Date, hour: number) => void;
  onViewItem: (id: number) => void;
  onBack: () => void;
}) {
  const { hourMap, unscheduledItems } = useMemo(() => {
    const map = new Map<number, any[]>();
    const unscheduled: any[] = [];
    for (const item of items) {
      const hour = getItemHour(item);
      if (hour !== null) {
        const existing = map.get(hour) || [];
        existing.push(item);
        map.set(hour, existing);
      } else {
        unscheduled.push(item);
      }
    }
    return { hourMap: map, unscheduledItems: unscheduled };
  }, [items]);

  // Show all 24 hours; items scheduled at 0-5 AM will also be visible
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="px-2 pb-2">
        <div className="flex items-center gap-2 py-2 sticky top-0 bg-background/95 backdrop-blur z-10 border-b mb-1">
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onBack}>
            <ArrowLeft className="h-3 w-3" />
          </Button>
          <span className="text-xs font-medium">{format(date, "EEE, MMM d")}</span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-auto">
            {items.length} event{items.length !== 1 ? "s" : ""}
          </Badge>
        </div>

        <div className="space-y-px">
          {hours.map((hour) => {
            const hourItems = hourMap.get(hour) || [];
            const isBusy = hourItems.length > 0;

            return (
              <div
                key={hour}
                className={cn(
                  "flex items-start gap-1.5 rounded px-1.5 py-1 group",
                  isBusy ? "bg-muted/40" : "hover:bg-muted/20 cursor-pointer"
                )}
                onClick={() => !isBusy && onAddReminder(date, hour)}
                title={isBusy ? undefined : `Add reminder at ${String(hour).padStart(2, "0")}:00`}
              >
                <span className="text-[10px] text-muted-foreground font-mono w-10 shrink-0 pt-0.5 select-none">
                  {String(hour).padStart(2, "0")}:00
                </span>
                <div className="flex-1 min-w-0">
                  {isBusy ? (
                    hourItems.map((item) => (
                      <div
                        key={item.id}
                        className={cn(
                          "text-[11px] rounded px-1.5 py-1 mb-0.5 border-l-2 cursor-pointer hover:opacity-80 transition-opacity",
                          priorityBorderColor(item.priority || "normal"),
                        )}
                        onClick={(e) => { e.stopPropagation(); onViewItem(item.id); }}
                        title="Click to view details"
                      >
                        <p className="font-medium truncate leading-snug">
                          {item.description || item.prompt?.slice(0, 50)}
                        </p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Badge variant="outline" className={cn("text-[8px] px-1 py-0", statusColor(item.status))}>
                            {item.status}
                          </Badge>
                          {item.isRecurring && (
                            <RefreshCw className="h-2.5 w-2.5 text-muted-foreground" />
                          )}
                          {(item as any).isSimpleReminder && (
                            <AlarmClock className="h-2.5 w-2.5 text-purple-500" />
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 py-0.5">
                      <Plus className="h-2.5 w-2.5" /> Add reminder
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Items with no deterministic hour (variable-interval patterns) */}
        {unscheduledItems.length > 0 && (
          <div className="mt-2 pt-2 border-t border-dashed">
            <p className="text-[10px] text-muted-foreground font-medium mb-1 px-1.5">All day / variable time</p>
            {unscheduledItems.map((item: any) => (
              <div
                key={item.id}
                className={cn(
                  "text-[11px] rounded px-1.5 py-1 mb-0.5 border-l-2 cursor-pointer hover:opacity-80 transition-opacity mx-1.5",
                  priorityBorderColor(item.priority || "normal"),
                )}
                onClick={() => onViewItem(item.id)}
                title="Click to view details"
              >
                <p className="font-medium truncate leading-snug">
                  {item.description || item.prompt?.slice(0, 50)}
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Badge variant="outline" className={cn("text-[8px] px-1 py-0", statusColor(item.status))}>
                    {item.status}
                  </Badge>
                  {item.isRecurring && <RefreshCw className="h-2.5 w-2.5 text-muted-foreground" />}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

function FollowSection({ initialDmUserId, initialDmUserName, isFromAlert }: {
  initialDmUserId?: number | null;
  initialDmUserName?: string;
  isFromAlert?: boolean;
} = {}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [dmUserId, setDmUserId] = useState<number | null>(initialDmUserId ?? null);
  const [dmUserName, setDmUserName] = useState(initialDmUserName || "");
  const [showAlertBanner, setShowAlertBanner] = useState(!!isFromAlert && !!initialDmUserId);

  const utils = trpc.useUtils();

  const { data: following } = trpc.follows.getFollowing.useQuery();
  const { data: dmCount } = trpc.follows.getUnreadDmCount.useQuery(undefined, {
    refetchInterval: 15000,
  });

  const { data: searchResults } = trpc.follows.searchUsers.useQuery(
    { query: searchQuery, limit: 5 },
    { enabled: searchQuery.length >= 2 }
  );

  const followMutation = trpc.follows.follow.useMutation({
    onSuccess: (result) => {
      utils.follows.getFollowing.invalidate();
      utils.follows.searchUsers.invalidate();
      toast.success(result.isFriend ? "You are now friends!" : "Followed user");
    },
    onError: (err) => toast.error(`Follow failed: ${err.message}`),
  });

  const unfollowMutation = trpc.follows.unfollow.useMutation({
    onSuccess: () => {
      utils.follows.getFollowing.invalidate();
      toast.success("Unfollowed user");
    },
    onError: (err) => toast.error(`Unfollow failed: ${err.message}`),
  });

  const blockMutation = trpc.follows.block.useMutation({
    onSuccess: () => {
      utils.follows.getFollowing.invalidate();
      utils.follows.getFollowers.invalidate();
      toast.success("User blocked");
    },
    onError: (err) => toast.error(`Block failed: ${err.message}`),
  });

  if (dmUserId) {
    return (
      <DirectMessagePanel
        userId={dmUserId}
        userName={dmUserName}
        onBack={() => { setDmUserId(null); setShowAlertBanner(false); }}
        isFromAlert={showAlertBanner}
        onDismissAlert={() => setShowAlertBanner(false)}
      />
    );
  }

  return (
    <div className="border-t p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          <Users className="h-3 w-3" />
          Following ({following?.length || 0})
          {(dmCount?.count || 0) > 0 && (
            <span className="bg-red-500 text-white text-[9px] font-bold rounded-full h-3.5 min-w-[14px] px-1 flex items-center justify-center">
              {dmCount!.count > 9 ? "9+" : dmCount!.count}
            </span>
          )}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => setShowSearch(!showSearch)}
        >
          {showSearch ? <XCircle className="h-3 w-3" /> : <UserPlus className="h-3 w-3" />}
        </Button>
      </div>

      {showSearch && (
        <div className="space-y-1.5">
          <div className="relative">
            <Search className="absolute left-2 top-1.5 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-7 text-xs pl-7"
            />
          </div>
          {searchResults?.map((user) => (
            <div key={user.id} className="flex items-center justify-between text-xs p-1.5 rounded hover:bg-muted">
              <div className="truncate flex items-center gap-1">
                <span className="font-medium">{user.name}</span>
                {user.isFriend && <Heart className="h-2.5 w-2.5 text-pink-500 fill-pink-500" />}
                <span className="text-muted-foreground">{user.email}</span>
              </div>
              <Button
                variant={user.isFollowing ? "outline" : "default"}
                size="sm"
                className="h-5 text-[10px] px-2"
                onClick={() =>
                  user.isFollowing
                    ? unfollowMutation.mutate({ userId: user.id })
                    : followMutation.mutate({ userId: user.id })
                }
              >
                {user.isFollowing ? <UserMinus className="h-2.5 w-2.5" /> : <UserPlus className="h-2.5 w-2.5" />}
              </Button>
            </div>
          ))}
        </div>
      )}

      {following?.map((user: any) => (
        <div key={user.id} className="flex items-center justify-between text-[11px] px-1 group">
          <div className="flex items-center gap-1 truncate">
            <span className="truncate">{user.name || user.email}</span>
            {user.isFriend && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 border-pink-400 text-pink-500">
                Friend
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100"
              onClick={() => { setDmUserId(user.id); setDmUserName(user.name || user.email); }}
              title="Send message"
            >
              <MessageCircle className="h-2.5 w-2.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 text-muted-foreground hover:text-orange-500 opacity-0 group-hover:opacity-100"
              onClick={() => blockMutation.mutate({ userId: user.id })}
              title="Block user"
            >
              <ShieldBan className="h-2.5 w-2.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100"
              onClick={() => unfollowMutation.mutate({ userId: user.id })}
              title="Unfollow"
            >
              <UserMinus className="h-2.5 w-2.5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function DirectMessagePanel({ userId, userName, onBack, isFromAlert, onDismissAlert }: {
  userId: number;
  userName: string;
  onBack: () => void;
  isFromAlert?: boolean;
  onDismissAlert?: () => void;
}) {
  const [message, setMessage] = useState("");
  const [isUrgent, setIsUrgent] = useState(false);

  const utils = trpc.useUtils();

  const { data: messages, isLoading } = trpc.follows.getMessages.useQuery(
    { userId, limit: 50 },
    { refetchInterval: 5000 }
  );

  const sendMutation = trpc.follows.sendMessage.useMutation({
    onSuccess: () => {
      setMessage("");
      setIsUrgent(false);
      utils.follows.getMessages.invalidate({ userId });
      utils.follows.getUnreadDmCount.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleSend = () => {
    const text = message.trim();
    if (!text) return;
    sendMutation.mutate({ receiverId: userId, content: text, isUrgent });
  };

  return (
    <div className="border-t flex flex-col h-64">
      {isFromAlert && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 border-b border-orange-500/30">
          <Zap className="h-3.5 w-3.5 text-orange-500 shrink-0" />
          <span className="text-[11px] font-medium text-orange-500 truncate">
            Urgent alert from {userName}
          </span>
          <button
            onClick={onDismissAlert}
            className="ml-auto text-orange-400 hover:text-orange-300 shrink-0"
            title="Dismiss alert banner"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
      <div className="flex items-center gap-2 p-2 border-b">
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onBack}>
          <ArrowLeft className="h-3 w-3" />
        </Button>
        <span className="text-xs font-medium truncate">{userName}</span>
      </div>

      <ScrollArea className="flex-1 p-2">
        <div className="space-y-1.5">
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin mx-auto mt-4" />
          ) : !messages?.length ? (
            <p className="text-[10px] text-muted-foreground text-center mt-4">No messages yet</p>
          ) : (
            messages.map((msg: any) => (
              <div
                key={msg.id}
                className={cn(
                  "text-[11px] max-w-[85%] rounded-lg px-2 py-1",
                  msg.senderId === userId
                    ? "bg-muted mr-auto"
                    : "bg-primary text-primary-foreground ml-auto",
                  msg.isUrgent && "ring-1 ring-orange-400"
                )}
              >
                {msg.isUrgent && <Zap className="h-2.5 w-2.5 inline mr-0.5 text-orange-400" />}
                {msg.content}
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <div className="p-2 border-t flex items-center gap-1">
        <Button
          variant={isUrgent ? "default" : "ghost"}
          size="sm"
          className={cn("h-6 w-6 p-0 shrink-0", isUrgent && "bg-orange-500 hover:bg-orange-600")}
          onClick={() => setIsUrgent(!isUrgent)}
          title="Urgent message"
        >
          <Zap className="h-3 w-3" />
        </Button>
        <Input
          placeholder="Message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
          className="h-7 text-xs flex-1"
        />
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 shrink-0"
          onClick={handleSend}
          disabled={!message.trim() || sendMutation.isPending}
        >
          <Send className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
