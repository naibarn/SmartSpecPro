import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { LocaleToggle } from "@/components/LocaleToggle";
import { Badge } from "@smartspec/ui/src/components/ui/badge";
import { Button } from "@smartspec/ui/src/components/ui/button";
import { Input } from "@smartspec/ui/src/components/ui/input";
import { Textarea } from "@smartspec/ui/src/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@smartspec/ui/src/components/ui/select";
import { ScrollArea } from "@smartspec/ui/src/components/ui/scroll-area";
import {
  ChevronLeft,
  MessageSquare,
  Bug,
  Lightbulb,
  Eye,
  HelpCircle,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  Send,
  Lock,
  Paperclip,
  FileText,
  Download,
  X,
} from "lucide-react";

export default function AdminFeedbackHub() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const [statusFilter, setStatusFilter] = useState<string | undefined>(
    undefined
  );
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);

  // Deep-link: auto-select ticket from ?ticketId=X
  useEffect(() => {
    const params = new URLSearchParams(search);
    const ticketIdParam = params.get("ticketId");
    if (ticketIdParam) {
      const id = parseInt(ticketIdParam, 10);
      if (!isNaN(id)) setSelectedTicketId(id);
    }
  }, [search]);
  const [commentText, setCommentText] = useState("");
  const [isInternal, setIsInternal] = useState(false);

  const statsQuery = trpc.feedback.stats.useQuery();
  const ticketsQuery = trpc.feedback.list.useQuery({
    status: statusFilter as any,
    ticketType: typeFilter as any,
    limit: 50,
  });
  const ticketDetailQuery = trpc.feedback.getTicket.useQuery(
    { id: selectedTicketId! },
    { enabled: !!selectedTicketId }
  );

  const deleteAttachmentMutation = trpc.feedback.deleteAttachment.useMutation({
    onSuccess: () => {
      ticketDetailQuery.refetch();
    },
  });

  const addCommentMutation = trpc.feedback.addComment.useMutation({
    onSuccess: () => {
      setCommentText("");
      ticketDetailQuery.refetch();
      toast.success(
        isInternal
          ? "Internal note added"
          : "Reply sent — user will be notified"
      );
    },
    onError: err => {
      toast.error(err.message || "Failed to send comment");
    },
  });
  const updateStatusMutation = trpc.feedback.updateStatus.useMutation({
    onSuccess: () => {
      ticketsQuery.refetch();
      ticketDetailQuery.refetch();
      statsQuery.refetch();
      toast.success("Status updated");
    },
  });

  const stats = statsQuery.data;
  const tickets = ticketsQuery.data ?? [];
  const detail = ticketDetailQuery.data;

  const typeIcons: Record<string, React.ReactNode> = {
    bug: <Bug className="h-3.5 w-3.5" />,
    feature_request: <Lightbulb className="h-3.5 w-3.5" />,
    observation: <Eye className="h-3.5 w-3.5" />,
    question: <HelpCircle className="h-3.5 w-3.5" />,
  };

  const typeColor: Record<string, string> = {
    bug: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    feature_request:
      "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
    observation:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    question:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  };

  const statusColor: Record<string, string> = {
    new: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    triaged:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    in_progress:
      "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    resolved:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    closed: "bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-400",
    duplicate:
      "bg-gray-100 text-gray-500 dark:bg-gray-800/50 dark:text-gray-500",
    deferred:
      "bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-500",
  };

  const statusLabel: Record<string, string> = {
    new: "New",
    triaged: "Triaged",
    in_progress: "In Progress",
    resolved: "Resolved",
    closed: "Closed",
    duplicate: "Duplicate",
    deferred: "Deferred",
  };

  const formatDate = (d: string | Date | null) => {
    if (!d) return "";
    const date = new Date(d);
    const now = Date.now();
    const diff = now - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20">
      {/* Header */}
      <header className="bg-white/70 backdrop-blur-xl border-b sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/dashboard")}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                  <MessageSquare className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold">Feedback Hub</h1>
                  <p className="text-xs text-muted-foreground">
                    Manage user feedback & reports
                  </p>
                </div>
              </div>
            </div>

            {/* Stats badges */}
            <div className="flex flex-wrap items-center gap-2">
              <LocaleToggle className="shrink-0" />
              <Badge variant="secondary" className="gap-1">
                {stats?.total ?? 0} total
              </Badge>
              <Badge className="gap-1 bg-blue-100 text-blue-800 hover:bg-blue-200">
                {stats?.new ?? 0} new
              </Badge>
              <Badge className="gap-1 bg-orange-100 text-orange-800 hover:bg-orange-200">
                {stats?.inProgress ?? 0} active
              </Badge>
              <Badge className="gap-1 bg-green-100 text-green-800 hover:bg-green-200">
                {stats?.resolved ?? 0} resolved
              </Badge>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex h-[calc(100vh-65px)]">
        {/* Left: Ticket list */}
        <div className="w-[400px] border-r bg-white/50 flex flex-col">
          {/* Filters */}
          <div className="p-3 border-b flex gap-2">
            <Select
              value={statusFilter ?? "all"}
              onValueChange={v => setStatusFilter(v === "all" ? undefined : v)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="triaged">Triaged</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={typeFilter ?? "all"}
              onValueChange={v => setTypeFilter(v === "all" ? undefined : v)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="bug">Bug</SelectItem>
                <SelectItem value="feature_request">Feature Request</SelectItem>
                <SelectItem value="observation">Observation</SelectItem>
                <SelectItem value="question">Question</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Ticket list */}
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {tickets.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No tickets found
                </div>
              )}
              {tickets.map((ticket: any) => (
                <div
                  key={ticket.id}
                  className={`p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedTicketId === ticket.id
                      ? "bg-blue-50 border border-blue-200"
                      : "hover:bg-gray-50 border border-transparent"
                  }`}
                  onClick={() => setSelectedTicketId(ticket.id)}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <Badge
                      className={`text-[10px] px-1.5 py-0 gap-1 ${typeColor[ticket.ticketType] ?? ""}`}
                    >
                      {typeIcons[ticket.ticketType]}
                      {ticket.ticketType.replace("_", " ")}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 ${statusColor[ticket.status] ?? ""}`}
                    >
                      {statusLabel[ticket.status] ?? ticket.status}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      #{ticket.id}
                    </span>
                  </div>
                  <div className="font-medium text-sm truncate">
                    {ticket.title}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(ticket.createdAt)}
                    </span>
                    {ticket.autoCategory && (
                      <span className="text-[10px] text-muted-foreground">
                        AI: {ticket.autoCategory}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Right: Ticket detail */}
        <div className="flex-1 flex flex-col">
          {!selectedTicketId || !detail ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Select a ticket to view details</p>
              </div>
            </div>
          ) : (
            <>
              {/* Detail header */}
              <div className="p-4 border-b bg-white/50">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={typeColor[detail.ticketType] ?? ""}>
                        {typeIcons[detail.ticketType]}
                        <span className="ml-1">
                          {detail.ticketType.replace("_", " ")}
                        </span>
                      </Badge>
                      <Badge
                        variant="outline"
                        className={statusColor[detail.status] ?? ""}
                      >
                        {statusLabel[detail.status] ?? detail.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        #{detail.id}
                      </span>
                    </div>
                    <h2 className="text-lg font-semibold">{detail.title}</h2>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
                      <span>Created {formatDate(detail.createdAt)}</span>
                      {detail.respondedAt && (
                        <span className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3 text-green-500" />
                          Responded {formatDate(detail.respondedAt)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status actions */}
                  <div className="flex gap-1.5 flex-wrap justify-end">
                    {(
                      ["triaged", "in_progress", "resolved", "closed"] as const
                    ).map(s => (
                      <Button
                        key={s}
                        size="sm"
                        variant={detail.status === s ? "default" : "outline"}
                        className="h-7 text-xs"
                        disabled={updateStatusMutation.isPending}
                        onClick={() =>
                          updateStatusMutation.mutate({
                            ticketId: selectedTicketId,
                            status: s,
                          })
                        }
                      >
                        {statusLabel[s]}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Detail body + comments */}
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-4">
                  {/* Description */}
                  {detail.description && (
                    <div className="bg-white rounded-lg p-4 border">
                      <h3 className="text-sm font-medium mb-2">Description</h3>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {detail.description}
                      </p>
                    </div>
                  )}

                  {/* Steps to reproduce */}
                  {detail.stepsToReproduce && (
                    <div className="bg-white rounded-lg p-4 border">
                      <h3 className="text-sm font-medium mb-2">
                        Steps to Reproduce
                      </h3>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {detail.stepsToReproduce}
                      </p>
                    </div>
                  )}

                  {/* Expected vs Actual */}
                  {(detail.expectedBehavior || detail.actualBehavior) && (
                    <div className="grid grid-cols-2 gap-4">
                      {detail.expectedBehavior && (
                        <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                          <h3 className="text-sm font-medium mb-2 text-green-800">
                            Expected
                          </h3>
                          <p className="text-sm text-green-700 whitespace-pre-wrap">
                            {detail.expectedBehavior}
                          </p>
                        </div>
                      )}
                      {detail.actualBehavior && (
                        <div className="bg-red-50 rounded-lg p-4 border border-red-100">
                          <h3 className="text-sm font-medium mb-2 text-red-800">
                            Actual
                          </h3>
                          <p className="text-sm text-red-700 whitespace-pre-wrap">
                            {detail.actualBehavior}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* AI Analysis */}
                  {detail.autoSummary && (
                    <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-100">
                      <h3 className="text-sm font-medium mb-2 text-indigo-800 flex items-center gap-1">
                        <AlertCircle className="h-3.5 w-3.5" />
                        AI Analysis
                      </h3>
                      <p className="text-sm text-indigo-700 whitespace-pre-wrap">
                        {detail.autoSummary}
                      </p>
                      {(detail.autoCategory || detail.autoPriority) && (
                        <div className="flex gap-2 mt-2">
                          {detail.autoCategory && (
                            <Badge variant="secondary" className="text-xs">
                              Category: {detail.autoCategory}
                            </Badge>
                          )}
                          {detail.autoPriority && (
                            <Badge variant="secondary" className="text-xs">
                              Priority: {detail.autoPriority}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Attachments */}
                  {((detail as any).attachments?.length ?? 0) > 0 && (
                    <div className="bg-white rounded-lg p-4 border">
                      <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                        <Paperclip className="h-3.5 w-3.5" />
                        Attachments ({(detail as any).attachments.length})
                      </h3>
                      <div className="grid grid-cols-2 gap-2">
                        {(detail as any).attachments.map((att: any) => {
                          const isImage = att.mimeType?.startsWith("image/");
                          return (
                            <div
                              key={att.id}
                              className="flex items-center gap-2 p-2 rounded-lg border hover:bg-muted/50 transition-colors group"
                            >
                              <a
                                href={att.resolvedUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 flex-1 min-w-0"
                              >
                                {isImage ? (
                                  <div className="w-10 h-10 rounded overflow-hidden bg-muted shrink-0">
                                    <img
                                      src={att.resolvedUrl}
                                      alt={att.fileName}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                ) : (
                                  <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shrink-0">
                                    <FileText className="h-5 w-5 text-muted-foreground" />
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium truncate">
                                    {att.fileName}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">
                                    {att.fileSize
                                      ? `${(att.fileSize / 1024).toFixed(0)} KB`
                                      : ""}
                                  </p>
                                </div>
                                <Download className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
                              </a>
                              <button
                                onClick={() => {
                                  if (confirm("Delete this attachment?")) {
                                    deleteAttachmentMutation.mutate({
                                      attachmentId: att.id,
                                    });
                                  }
                                }}
                                className="text-muted-foreground hover:text-destructive p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                title="Delete attachment"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Comments */}
                  <div>
                    <h3 className="text-sm font-medium mb-3">
                      Comments ({(detail as any).comments?.length ?? 0})
                    </h3>
                    <div className="space-y-2">
                      {(detail as any).comments?.map((c: any) => (
                        <div
                          key={c.id}
                          className={`rounded-lg p-3 text-sm ${
                            c.isInternal
                              ? "bg-yellow-50 border border-yellow-200"
                              : c.authorType === "human" &&
                                  c.authorId !== detail.submittedBy
                                ? "bg-blue-50 border border-blue-100"
                                : "bg-white border"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-xs font-medium">
                              {c.authorType === "ai" ? "AI Assistant" : "Admin"}
                            </span>
                            {c.isInternal && (
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1 py-0 gap-0.5 text-yellow-700 border-yellow-300"
                              >
                                <Lock className="h-2.5 w-2.5" />
                                Internal
                              </Badge>
                            )}
                            <span className="text-[10px] text-muted-foreground ml-auto">
                              {formatDate(c.createdAt)}
                            </span>
                          </div>
                          <p className="whitespace-pre-wrap">{c.content}</p>
                        </div>
                      ))}
                      {((detail as any).comments?.length ?? 0) === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-4">
                          No comments yet
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </ScrollArea>

              {/* Comment input */}
              <div className="border-t bg-white/50 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isInternal}
                      onChange={e => setIsInternal(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <Lock className="h-3 w-3 text-yellow-600" />
                    Internal note (not visible to user)
                  </label>
                </div>
                <div className="flex gap-2">
                  <Textarea
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                    placeholder={
                      isInternal
                        ? "Add internal note..."
                        : "Reply to user (they will be notified)..."
                    }
                    className="min-h-[60px] resize-none text-sm"
                    rows={2}
                  />
                  <Button
                    size="sm"
                    className="self-end"
                    disabled={
                      !commentText.trim() || addCommentMutation.isPending
                    }
                    onClick={() =>
                      addCommentMutation.mutate({
                        ticketId: selectedTicketId,
                        content: commentText,
                        isInternal,
                      })
                    }
                  >
                    {addCommentMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
