import { useState } from "react";
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
  Calendar,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function SchedulePanel() {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCron, setEditCron] = useState("");

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
  });

  const deleteMutation = trpc.scheduledMessages.delete.useMutation({
    onSuccess: () => {
      utils.scheduledMessages.list.invalidate();
      toast.success("Schedule deleted");
      setDeleteId(null);
    },
  });

  const updateMutation = trpc.scheduledMessages.update.useMutation({
    onSuccess: () => {
      utils.scheduledMessages.list.invalidate();
      toast.success("Schedule updated");
      setEditingId(null);
    },
    onError: (err) => toast.error(err.message),
  });

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

  const formatCron = (cron: string | null) => {
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
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => utils.scheduledMessages.list.invalidate()}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

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
            </div>
          ) : (
            items.map((item) => {
              const isExpanded = expandedId === item.id;
              const isEditing = editingId === item.id;

              return (
                <div
                  key={item.id}
                  className={cn(
                    "rounded-lg border transition-colors",
                    isExpanded ? "bg-card shadow-sm" : "hover:bg-muted/50"
                  )}
                >
                  {/* Header - always visible, clickable to expand */}
                  <div
                    className="flex items-start gap-2 p-3 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm leading-snug">
                        {item.description || item.prompt.slice(0, 80)}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", statusColor(item.status))}>
                          {item.status}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatCron(item.cronExpression)}
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
                              Cron Expression {editCron && <span className="text-muted-foreground font-normal">({formatCron(editCron)})</span>}
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
                            <span className="ml-1 font-mono">{item.cronExpression || "One-time"}</span>
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

      {/* Following Section */}
      <FollowSection />

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

function FollowSection() {
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [dmUserId, setDmUserId] = useState<number | null>(null);
  const [dmUserName, setDmUserName] = useState("");

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
  });

  const unfollowMutation = trpc.follows.unfollow.useMutation({
    onSuccess: () => {
      utils.follows.getFollowing.invalidate();
      toast.success("Unfollowed user");
    },
  });

  const blockMutation = trpc.follows.block.useMutation({
    onSuccess: () => {
      utils.follows.getFollowing.invalidate();
      utils.follows.getFollowers.invalidate();
      toast.success("User blocked");
    },
  });

  if (dmUserId) {
    return (
      <DirectMessagePanel
        userId={dmUserId}
        userName={dmUserName}
        onBack={() => setDmUserId(null)}
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

function DirectMessagePanel({ userId, userName, onBack }: { userId: number; userName: string; onBack: () => void }) {
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
