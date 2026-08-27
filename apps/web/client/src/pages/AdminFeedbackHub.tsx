import { useState, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm/ConfirmProvider";
import {
  AuthenticatedAttachmentImage,
  getAuthenticatedAttachmentUrl,
  openAuthenticatedAttachment,
} from "@/components/feedback/AuthenticatedAttachmentImage";
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
import { Dialog, DialogContent } from "@smartspec/ui/src/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@smartspec/ui/src/components/ui/collapsible";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
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
  Copy,
  Stethoscope,
} from "lucide-react";

const EMPTY_TICKETS: never[] = [];

function formatTicketTitle(
  title: string,
  reporterEmail?: string | null,
  reporterId?: number | null
): string {
  const label =
    reporterEmail || (reporterId != null ? `user #${reporterId}` : "");
  if (!label || title.startsWith(`[${label}]`)) return title;
  return `[${label}] ${title}`;
}

export default function AdminFeedbackHub() {
  const { confirm } = useConfirm();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const [statusFilter, setStatusFilter] = useState<string | undefined>(
    undefined
  );
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);
  // Source of the ticket: real user feedback ("human") vs auto-filed system
  // error reports ("system"). Default to "human" so genuine user feedback is
  // surfaced first instead of being buried under machine-generated noise.
  const [sourceFilter, setSourceFilter] = useState<
    "human" | "system" | undefined
  >("human");
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [optimisticallyReadTicketIds, setOptimisticallyReadTicketIds] =
    useState<Set<number>>(() => new Set());
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [ticketOrderIds, setTicketOrderIds] = useState<number[]>([]);
  const ticketFilterKey = [
    statusFilter ?? "",
    typeFilter ?? "",
    sourceFilter ?? "all",
    unreadOnly ? "unread" : "all",
  ].join("|");
  const previousTicketFilterKeyRef = useRef(ticketFilterKey);

  // Deep-link: auto-select ticket from ?ticketId=X
  useEffect(() => {
    const params = new URLSearchParams(search);
    const ticketIdParam = params.get("ticketId");
    if (ticketIdParam) {
      const id = parseInt(ticketIdParam, 10);
      if (!isNaN(id)) setSelectedTicketId(id);
    }
  }, [search]);

  const selectTicket = (ticketId: number) => {
    setSelectedTicketId(ticketId);
    setLocation(`/admin/feedback-hub?ticketId=${ticketId}`);
  };
  const [commentText, setCommentText] = useState("");
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [replyUploading, setReplyUploading] = useState(false);
  const [isInternal, setIsInternal] = useState(false);
  const [overdueAlertOpen, setOverdueAlertOpen] = useState(false);
  const lastOverdueAlertAtRef = useRef<number | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const statsQuery = trpc.feedback.stats.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  const ticketsQuery = trpc.feedback.list.useQuery(
    {
      status: statusFilter as any,
      ticketType: typeFilter as any,
      submittedByType: sourceFilter,
      unreadOnly,
      // Load the full human-feedback queue (currently under 100 tickets) so
      // the left-hand scroll can reach older reports instead of silently
      // truncating the list at the first 50 rows.
      limit: 100,
    },
    { refetchInterval: 60_000 }
  );
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
      setReplyFiles([]);
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
  const markReadMutation = trpc.feedback.markRead.useMutation({
    onSuccess: () => {
      ticketsQuery.refetch();
      statsQuery.refetch();
    },
    onError: (err, variables) => {
      if (variables?.ticketId != null) {
        setOptimisticallyReadTicketIds(current => {
          const next = new Set(current);
          next.delete(variables.ticketId);
          return next;
        });
      }
      toast.error(err.message || "Failed to mark ticket as read");
    },
  });
  const markAllReadMutation = trpc.feedback.markAllRead.useMutation({
    onSuccess: result => {
      setOptimisticallyReadTicketIds(current => {
        const next = new Set(current);
        (ticketsQuery.data ?? []).forEach(ticket => next.add(ticket.id));
        return next;
      });
      ticketsQuery.refetch();
      statsQuery.refetch();
      toast.success(
        result.marked > 0
          ? `อ่านแล้ว ${result.marked} รายการ`
          : "ไม่มีรายการค้างที่ยังไม่ได้อ่าน"
      );
    },
    onError: err => toast.error(err.message || "Failed to mark all as read"),
  });
  const closeTicketMutation = trpc.feedback.closeTicket.useMutation({
    onSuccess: () => {
      ticketsQuery.refetch();
      ticketDetailQuery.refetch();
      statsQuery.refetch();
      toast.success("Ticket closed");
    },
    onError: err => toast.error(err.message || "Failed to close ticket"),
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
  // Keep the empty fallback referentially stable. When the query is still
  // loading or fails (for example, an unrelated 402 from a browser
  // extension), a fresh [] here would retrigger the ordering effect forever
  // and crash React with error #185.
  const tickets = ticketsQuery.data ?? EMPTY_TICKETS;
  const detail = ticketDetailQuery.data;
  const detailError = ticketDetailQuery.error;

  const attachmentsList = ((detail as any)?.attachments ?? []) as any[];
  const affectedUsers = ((detail as any)?.affectedUsers ?? []) as Array<{
    id: number;
    email: string | null;
  }>;
  const reporter = ((detail as any)?.reporter ?? null) as {
    id: number;
    email: string | null;
  } | null;
  const imageAttachments = attachmentsList.filter((att: any) =>
    att.mimeType?.startsWith("image/")
  );
  const ticketAttachments = attachmentsList.filter(
    (att: any) => !att.commentId
  );
  const isTicketRead = (ticket: any) =>
    ticket.status === "closed" ||
    Boolean(ticket.isRead) ||
    optimisticallyReadTicketIds.has(ticket.id);

  // Keep the server's order stable during the current session. A refetch can
  // add new tickets, but reading a ticket must not make every existing row
  // jump around underneath the admin. Changing a filter starts a new list.
  useEffect(() => {
    const incomingIds = tickets.map(ticket => ticket.id);
    setTicketOrderIds(previousIds => {
      if (previousTicketFilterKeyRef.current !== ticketFilterKey) {
        previousTicketFilterKeyRef.current = ticketFilterKey;
        return incomingIds;
      }
      const incomingIdSet = new Set(incomingIds);
      const retainedIds = previousIds.filter(id => incomingIdSet.has(id));
      const knownIds = new Set(previousIds);
      const newIds = incomingIds.filter(id => !knownIds.has(id));
      return [...newIds, ...retainedIds];
    });
  }, [tickets, ticketFilterKey]);

  const ticketsById = new Map(tickets.map(ticket => [ticket.id, ticket]));
  const orderedTickets = ticketOrderIds
    .map(ticketId => ticketsById.get(ticketId))
    .filter((ticket): ticket is (typeof tickets)[number] => Boolean(ticket));
  const visibleTickets =
    orderedTickets.length > 0 || tickets.length === 0
      ? orderedTickets
      : tickets;

  const uploadReplyFiles = async (ticketId: number): Promise<number[]> => {
    if (replyFiles.length === 0) return [];
    setReplyUploading(true);
    try {
      const formData = new FormData();
      formData.append("ticketId", String(ticketId));
      formData.append("purpose", "reply");
      replyFiles.forEach(file => formData.append("files", file));
      const csrfToken =
        document.cookie
          .split("; ")
          .find(cookie => cookie.startsWith("csrf_token="))
          ?.split("=")[1] ?? "";
      const response = await fetch("/api/feedback/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
        headers: { "x-csrf-token": csrfToken },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Image upload failed");
      }
      return (payload?.attachments ?? [])
        .map((attachment: any) => attachment.id)
        .filter((id: unknown): id is number => typeof id === "number");
    } finally {
      setReplyUploading(false);
    }
  };

  const handleSendComment = async () => {
    if (
      !selectedTicketId ||
      (!commentText.trim() && replyFiles.length === 0) ||
      addCommentMutation.isPending ||
      replyUploading
    )
      return;
    let attachmentIds: number[] = [];
    try {
      attachmentIds = await uploadReplyFiles(selectedTicketId);
      await addCommentMutation.mutateAsync({
        ticketId: selectedTicketId,
        content: commentText,
        isInternal,
        attachmentIds,
      });
    } catch (error) {
      if (attachmentIds.length > 0) {
        await Promise.allSettled(
          attachmentIds.map(attachmentId =>
            deleteAttachmentMutation.mutateAsync({ attachmentId })
          )
        );
      }
      if (error instanceof Error && !addCommentMutation.error) {
        toast.error(error.message || "Failed to send comment");
      }
    }
  };

  const openLightbox = (attachmentId: number) => {
    const idx = imageAttachments.findIndex((a: any) => a.id === attachmentId);
    setLightboxIndex(idx >= 0 ? idx : 0);
    setLightboxOpen(true);
  };

  const navigateLightbox = (direction: "prev" | "next") => {
    if (imageAttachments.length === 0) return;
    setLightboxIndex(prev => {
      if (direction === "prev") {
        return prev === 0 ? imageAttachments.length - 1 : prev - 1;
      }
      return prev === imageAttachments.length - 1 ? 0 : prev + 1;
    });
  };

  // Keyboard navigation for the lightbox (Escape is handled by the Dialog
  // itself; we only need Arrow keys here).
  useEffect(() => {
    if (!lightboxOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") navigateLightbox("prev");
      if (e.key === "ArrowRight") navigateLightbox("next");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxOpen, imageAttachments.length]);

  useEffect(() => {
    if (!selectedTicketId) return;
    setOptimisticallyReadTicketIds(current => {
      if (current.has(selectedTicketId)) return current;
      const next = new Set(current);
      next.add(selectedTicketId);
      return next;
    });
    markReadMutation.mutate({ ticketId: selectedTicketId });
    // Marking a ticket read is intentionally tied to opening its detail view.
    // The local state changes immediately; the server re-checks admin scope
    // before persisting the receipt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTicketId]);

  useEffect(() => {
    const checkOverdueUnread = () => {
      if ((stats?.overdueUnread ?? 0) <= 0) return;
      const now = Date.now();
      const lastShown = lastOverdueAlertAtRef.current;
      if (lastShown == null || now - lastShown >= 30 * 60 * 1000) {
        lastOverdueAlertAtRef.current = now;
        setOverdueAlertOpen(true);
      }
    };
    checkOverdueUnread();
    const interval = window.setInterval(checkOverdueUnread, 30_000);
    return () => window.clearInterval(interval);
  }, [stats?.overdueUnread]);

  // `contextJson` is a loosely-typed json column — it may be a full
  // DiagnosticsBundle (see client/src/lib/systemErrorMonitor.ts), an older
  // ad-hoc shape, or null. Extract known fields defensively; never throw.
  const contextJson = (detail as any)?.contextJson ?? null;
  const isAutoReport =
    contextJson &&
    typeof contextJson === "object" &&
    (contextJson as any)?.kind === "system_auto_report";

  const diagnostics =
    contextJson && typeof contextJson === "object" && !isAutoReport
      ? {
          capturedAt: (contextJson as any).capturedAt as string | undefined,
          traceId: (contextJson as any).primaryError?.traceId as
            | string
            | undefined,
          path: (contextJson as any).primaryError?.path as string | undefined,
          code: (contextJson as any).primaryError?.code as string | undefined,
          httpStatus: (contextJson as any).primaryError?.httpStatus as
            | number
            | undefined,
          message: (contextJson as any).primaryError?.message as
            | string
            | undefined,
          pageUrl: (contextJson as any).page?.url as string | undefined,
          userAgent: (contextJson as any).client?.userAgent as
            | string
            | undefined,
        }
      : null;

  // Flat shape written by `server/services/systemAutoReportService.ts` — see
  // `ReportSystemFailureParams`/`contextJson` in that file for the exact
  // fields. Kept separate from `diagnostics` (the client-side
  // "system_error_report" bundle shape) since the two shapes don't overlap.
  const autoReportDiagnostics = isAutoReport
    ? {
        source: (contextJson as any)?.source as string | undefined,
        occurrences: (contextJson as any)?.occurrences as number | undefined,
        firstSeenAt: (contextJson as any)?.firstSeenAt as string | undefined,
        lastSeenAt: (contextJson as any)?.lastSeenAt as string | undefined,
        traceId: (contextJson as any)?.traceId as string | undefined,
        path: (contextJson as any)?.path as string | undefined,
        jobId: (contextJson as any)?.jobId as string | undefined,
        errorMessage: (contextJson as any)?.errorMessage as string | undefined,
        stack: (contextJson as any)?.stack as string | undefined,
        affectedUserIds: Array.isArray((contextJson as any)?.affectedUserIds)
          ? ((contextJson as any).affectedUserIds as unknown[])
              .filter((v): v is number => typeof v === "number")
              .join(", ")
          : undefined,
      }
    : null;

  const handleCopyTraceId = (traceId: string) => {
    navigator.clipboard.writeText(traceId);
    toast.success("Copied traceId");
  };

  const buildAiBundle = () => {
    if (!detail) return "";
    const d = detail as any;
    const lines: string[] = [];
    lines.push(
      `# Error Report: ${formatTicketTitle(d.title, d.reporter?.email, d.reporter?.id ?? d.submittedBy)}`
    );
    lines.push(
      `- Ticket: #${d.id} | Type: ${d.ticketType} | Status: ${d.status} | Created: ${
        d.createdAt ? new Date(d.createdAt).toISOString() : ""
      }`
    );
    lines.push(
      `- Reporter: user id ${d.submittedBy ?? "unknown"} (tenant ${
        d.tenantId ?? "unknown"
      })`
    );
    if (d.reporter?.email) {
      lines.push(`- Reporter email: ${d.reporter.email}`);
    }
    lines.push("");
    lines.push("## User Description");
    lines.push(d.description || "(none)");
    lines.push("");
    lines.push("## Diagnostics (JSON)");
    lines.push("```json");
    lines.push(JSON.stringify(contextJson ?? null, null, 2));
    lines.push("```");
    lines.push("");
    lines.push("## Attachments");
    if (attachmentsList.length === 0) {
      lines.push("- (none)");
    } else {
      for (const att of attachmentsList) {
        lines.push(
          `- ${att.fileName} (${att.mimeType ?? "unknown"}, ${
            att.fileSize ?? "?"
          } bytes)`
        );
      }
    }
    lines.push("");
    lines.push("## Instruction");
    lines.push(
      "Analyze the diagnostics above and identify the most likely root cause. " +
        "The primaryError and recentErrors contain tRPC path, HTTP status, error " +
        "code/message, and traceId. Suggest where to look in server logs using " +
        "the traceId."
    );
    return lines.join("\n");
  };

  const handleCopyForAi = () => {
    const bundle = buildAiBundle();
    if (!bundle) return;
    navigator.clipboard.writeText(bundle);
    toast.success("Copied AI-analysis bundle to clipboard");
  };

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

  // Absolute local datetime (vs. `formatDate`'s relative "Xm ago" style) —
  // used for auto-report firstSeenAt/lastSeenAt where an exact timestamp is
  // more useful than a relative one.
  const formatDateTime = (d: string | Date | null | undefined) => {
    if (!d) return "";
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString();
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
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20">
      {/* Header */}
      <header className="shrink-0 bg-white/70 backdrop-blur-xl border-b sticky top-0 z-10">
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
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left: Ticket list */}
        <div className="flex w-[400px] min-h-0 flex-col border-r bg-white/50">
          {/* Source tabs — separate genuine user feedback from auto system reports */}
          <div className="p-3 pb-0 flex gap-1">
            {(
              [
                { key: "human", label: "User Feedback", count: stats?.human },
                { key: "system", label: "System / Auto", count: stats?.system },
                { key: undefined, label: "All", count: stats?.total },
              ] as const
            ).map(tab => {
              const active = sourceFilter === tab.key;
              return (
                <button
                  key={tab.label}
                  type="button"
                  onClick={() => setSourceFilter(tab.key)}
                  className={`flex-1 text-xs font-medium rounded-md px-2 py-1.5 transition-colors ${
                    active
                      ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                      : "text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-800/50"
                  }`}
                >
                  {tab.label}
                  {tab.count != null && (
                    <span className="ml-1 opacity-70">({tab.count})</span>
                  )}
                </button>
              );
            })}
          </div>

          <div
            className="mx-3 mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950"
            aria-live="polite"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <span>ยังไม่ได้อ่าน</span>
                <span className="rounded-full bg-amber-600 px-2 py-0.5 text-xs text-white">
                  {stats?.unread ?? 0}
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                variant={unreadOnly ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={() => setUnreadOnly(current => !current)}
              >
                {unreadOnly ? "ทั้งหมด" : "รายการค้าง"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={
                  markAllReadMutation.isPending || (stats?.unread ?? 0) === 0
                }
                onClick={() => markAllReadMutation.mutate()}
              >
                {markAllReadMutation.isPending ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : null}
                อ่านทั้งหมด
              </Button>
            </div>
            {(stats?.overdueUnread ?? 0) > 0 && (
              <p className="mt-1 text-xs font-medium text-red-700">
                ค้างเกิน 2 ชั่วโมง {stats?.overdueUnread} รายการ
              </p>
            )}
          </div>

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
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="p-2 space-y-1">
              {visibleTickets.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No tickets found
                </div>
              )}
              {visibleTickets.map((ticket: any) => {
                const ticketIsRead = isTicketRead(ticket);
                const ticketIsAutoReport =
                  ticket.title?.startsWith("[Auto]") ||
                  ticket.contextJson?.kind === "system_auto_report";
                const ticketOccurrences = ticket.contextJson?.occurrences as
                  | number
                  | undefined;
                return (
                  <div
                    key={ticket.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`เปิด ticket ${ticket.id}${ticketIsRead ? "" : " ยังไม่ได้อ่าน"}`}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedTicketId === ticket.id
                        ? "bg-blue-50 border border-blue-200"
                        : !ticketIsRead
                          ? "border border-amber-200 bg-amber-50/70 hover:bg-amber-100/70"
                          : "hover:bg-gray-50 border border-transparent"
                    }`}
                    onClick={() => selectTicket(ticket.id)}
                    onKeyDown={event => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectTicket(ticket.id);
                      }
                    }}
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
                      {!ticketIsRead && (
                        <Badge className="bg-amber-600 px-1.5 py-0 text-[10px] text-white hover:bg-amber-700">
                          ยังไม่ได้อ่าน
                        </Badge>
                      )}
                      {ticket.priority === "critical" && (
                        <Badge className="text-[10px] px-1.5 py-0 bg-red-100 text-red-800 hover:bg-red-200">
                          Urgent
                        </Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        #{ticket.id}
                      </span>
                    </div>
                    <div className="font-medium text-sm truncate flex items-center gap-1.5">
                      {ticketIsAutoReport && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0 shrink-0"
                        >
                          Auto
                          {ticketOccurrences != null &&
                            ticketOccurrences > 1 &&
                            ` ×${ticketOccurrences}`}
                        </Badge>
                      )}
                      <span className="truncate">
                        {formatTicketTitle(
                          ticket.title,
                          ticket.reporterEmail,
                          ticket.submittedBy
                        )}
                      </span>
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
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Ticket detail */}
        <div className="flex min-h-0 flex-1 flex-col">
          {selectedTicketId && ticketDetailQuery.isLoading ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin opacity-60" />
                <p className="text-sm">Loading ticket #{selectedTicketId}...</p>
              </div>
            </div>
          ) : selectedTicketId && detailError ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground p-6">
              <div className="text-center max-w-md">
                <AlertCircle className="h-10 w-10 mx-auto mb-3 text-destructive opacity-80" />
                <p className="text-sm font-medium text-foreground">
                  Unable to load ticket #{selectedTicketId}
                </p>
                <p className="text-xs mt-2 break-words">
                  {detailError.message ||
                    "The ticket may no longer exist or you may not have access to it."}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => ticketDetailQuery.refetch()}
                >
                  Retry
                </Button>
              </div>
            </div>
          ) : !selectedTicketId || !detail ? (
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
                      {detail.priority === "critical" && (
                        <Badge className="bg-red-100 text-red-800 hover:bg-red-200">
                          Urgent
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        #{detail.id}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground border rounded px-1.5 py-0.5">
                        Ticket ID: {detail.id}
                      </span>
                    </div>
                    <h2 className="text-lg font-semibold">
                      {formatTicketTitle(
                        detail.title,
                        reporter?.email,
                        reporter?.id ?? detail.submittedBy
                      )}
                    </h2>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
                      <span>Created {formatDate(detail.createdAt)}</span>
                      {reporter && (
                        <span>
                          Reporter: {reporter.email ?? `user #${reporter.id}`}
                        </span>
                      )}
                      {detail.respondedAt && (
                        <span className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3 text-green-500" />
                          Responded {formatDate(detail.respondedAt)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status actions */}
                  <div className="flex flex-col items-end gap-1.5">
                    {detail.status !== "closed" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-rose-300 text-rose-700 hover:bg-rose-50"
                        disabled={closeTicketMutation.isPending}
                        onClick={async () => {
                          const confirmed = await confirm({
                            title: "Close this ticket?",
                            description:
                              "Closed tickets cannot receive replies or new attachments.",
                            confirmText: "Close ticket",
                            cancelText: "Cancel",
                            tone: "danger",
                          });
                          if (confirmed)
                            closeTicketMutation.mutate({
                              ticketId: detail.id,
                            });
                        }}
                      >
                        ปิดงาน
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={handleCopyForAi}
                    >
                      <Copy className="h-3 w-3" />
                      คัดลอกสำหรับ AI
                    </Button>
                    <div className="flex gap-1.5 flex-wrap justify-end">
                      {(
                        [
                          "triaged",
                          "in_progress",
                          "resolved",
                          "closed",
                        ] as const
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
              </div>

              {/* Detail body + comments */}
              <ScrollArea className="min-h-0 flex-1">
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

                  {/* Diagnostics */}
                  {contextJson && (
                    <div className="bg-white rounded-lg p-4 border">
                      <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                        <Stethoscope className="h-3.5 w-3.5" />
                        ข้อมูลวินิจฉัย
                      </h3>
                      {diagnostics && (
                        <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5 text-xs mb-3">
                          {diagnostics.traceId && (
                            <>
                              <dt className="text-muted-foreground">traceId</dt>
                              <dd className="flex items-center gap-1.5 min-w-0">
                                <span className="font-mono truncate">
                                  {diagnostics.traceId}
                                </span>
                                <button
                                  onClick={() =>
                                    handleCopyTraceId(diagnostics.traceId!)
                                  }
                                  className="text-muted-foreground hover:text-foreground shrink-0"
                                  title="Copy traceId"
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                              </dd>
                            </>
                          )}
                          {diagnostics.path && (
                            <>
                              <dt className="text-muted-foreground">path</dt>
                              <dd className="font-mono truncate">
                                {diagnostics.path}
                              </dd>
                            </>
                          )}
                          {diagnostics.code && (
                            <>
                              <dt className="text-muted-foreground">code</dt>
                              <dd>{diagnostics.code}</dd>
                            </>
                          )}
                          {diagnostics.httpStatus != null && (
                            <>
                              <dt className="text-muted-foreground">
                                httpStatus
                              </dt>
                              <dd>{diagnostics.httpStatus}</dd>
                            </>
                          )}
                          {diagnostics.message && (
                            <>
                              <dt className="text-muted-foreground">message</dt>
                              <dd className="whitespace-pre-wrap break-words">
                                {diagnostics.message}
                              </dd>
                            </>
                          )}
                          {diagnostics.pageUrl && (
                            <>
                              <dt className="text-muted-foreground">
                                page.url
                              </dt>
                              <dd className="truncate">
                                {diagnostics.pageUrl}
                              </dd>
                            </>
                          )}
                          {diagnostics.userAgent && (
                            <>
                              <dt className="text-muted-foreground">
                                userAgent
                              </dt>
                              <dd className="truncate">
                                {diagnostics.userAgent}
                              </dd>
                            </>
                          )}
                          {diagnostics.capturedAt && (
                            <>
                              <dt className="text-muted-foreground">
                                capturedAt
                              </dt>
                              <dd>{formatDate(diagnostics.capturedAt)}</dd>
                            </>
                          )}
                        </dl>
                      )}
                      {autoReportDiagnostics && (
                        <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5 text-xs mb-3">
                          {autoReportDiagnostics.source && (
                            <>
                              <dt className="text-muted-foreground">source</dt>
                              <dd className="font-mono truncate">
                                {autoReportDiagnostics.source}
                              </dd>
                            </>
                          )}
                          {autoReportDiagnostics.occurrences != null && (
                            <>
                              <dt className="text-muted-foreground">
                                occurrences
                              </dt>
                              <dd>{autoReportDiagnostics.occurrences}</dd>
                            </>
                          )}
                          {autoReportDiagnostics.firstSeenAt && (
                            <>
                              <dt className="text-muted-foreground">
                                firstSeenAt
                              </dt>
                              <dd>
                                {formatDateTime(
                                  autoReportDiagnostics.firstSeenAt
                                )}
                              </dd>
                            </>
                          )}
                          {autoReportDiagnostics.lastSeenAt && (
                            <>
                              <dt className="text-muted-foreground">
                                lastSeenAt
                              </dt>
                              <dd>
                                {formatDateTime(
                                  autoReportDiagnostics.lastSeenAt
                                )}
                              </dd>
                            </>
                          )}
                          {autoReportDiagnostics.traceId && (
                            <>
                              <dt className="text-muted-foreground">traceId</dt>
                              <dd className="flex items-center gap-1.5 min-w-0">
                                <span className="font-mono truncate">
                                  {autoReportDiagnostics.traceId}
                                </span>
                                <button
                                  onClick={() =>
                                    handleCopyTraceId(
                                      autoReportDiagnostics.traceId!
                                    )
                                  }
                                  className="text-muted-foreground hover:text-foreground shrink-0"
                                  title="Copy traceId"
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                              </dd>
                            </>
                          )}
                          {autoReportDiagnostics.path && (
                            <>
                              <dt className="text-muted-foreground">path</dt>
                              <dd className="font-mono truncate">
                                {autoReportDiagnostics.path}
                              </dd>
                            </>
                          )}
                          {autoReportDiagnostics.jobId && (
                            <>
                              <dt className="text-muted-foreground">jobId</dt>
                              <dd className="font-mono truncate">
                                {autoReportDiagnostics.jobId}
                              </dd>
                            </>
                          )}
                          {autoReportDiagnostics.errorMessage && (
                            <>
                              <dt className="text-muted-foreground">
                                errorMessage
                              </dt>
                              <dd className="whitespace-pre-wrap break-words">
                                {autoReportDiagnostics.errorMessage}
                              </dd>
                            </>
                          )}
                          {autoReportDiagnostics.affectedUserIds && (
                            <>
                              <dt className="text-muted-foreground">
                                affected users
                              </dt>
                              <dd className="min-w-0">
                                {affectedUsers.length > 0 ? (
                                  <div className="space-y-0.5">
                                    {affectedUsers.map(affectedUser => (
                                      <div
                                        key={affectedUser.id}
                                        className="break-all"
                                      >
                                        {affectedUser.email ??
                                          `user #${affectedUser.id}`}
                                        {affectedUser.email && (
                                          <span className="text-muted-foreground">
                                            {` (user #${affectedUser.id})`}
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="truncate">
                                    {autoReportDiagnostics.affectedUserIds}
                                  </span>
                                )}
                              </dd>
                            </>
                          )}
                        </dl>
                      )}
                      {autoReportDiagnostics?.stack && (
                        <Collapsible>
                          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                            <ChevronDown className="h-3 w-3" />
                            Stack trace
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-2 text-[10px] leading-relaxed">
                              {autoReportDiagnostics.stack}
                            </pre>
                          </CollapsibleContent>
                        </Collapsible>
                      )}
                      <Collapsible>
                        <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                          <ChevronDown className="h-3 w-3" />
                          Raw JSON
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-2 text-[10px] leading-relaxed">
                            {JSON.stringify(contextJson, null, 2)}
                          </pre>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  )}

                  {/* Attachments */}
                  {ticketAttachments.length > 0 && (
                    <div className="bg-white rounded-lg p-4 border">
                      <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                        <Paperclip className="h-3.5 w-3.5" />
                        Attachments ({ticketAttachments.length})
                      </h3>
                      <div className="grid grid-cols-2 gap-2">
                        {ticketAttachments.map((att: any) => {
                          const isImage = att.mimeType?.startsWith("image/");
                          return (
                            <div
                              key={att.id}
                              className="flex items-center gap-2 p-2 rounded-lg border hover:bg-muted/50 transition-colors group"
                            >
                              {isImage ? (
                                <button
                                  type="button"
                                  onClick={() => openLightbox(att.id)}
                                  className="flex items-center gap-2 flex-1 min-w-0 text-left"
                                >
                                  <div className="h-[120px] w-[120px] rounded overflow-hidden bg-muted shrink-0">
                                    <AuthenticatedAttachmentImage
                                      src={att.resolvedUrl ?? att.fileUrl}
                                      alt={att.fileName}
                                      className="w-full h-full object-contain"
                                    />
                                  </div>
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
                                  <Eye className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
                                </button>
                              ) : (
                                <a
                                  href={
                                    getAuthenticatedAttachmentUrl(
                                      att.resolvedUrl ?? att.fileUrl
                                    ) ?? "#"
                                  }
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={event => {
                                    event.preventDefault();
                                    void openAuthenticatedAttachment(
                                      att.resolvedUrl ?? att.fileUrl
                                    ).catch(() => undefined);
                                  }}
                                  className="flex items-center gap-2 flex-1 min-w-0"
                                >
                                  <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shrink-0">
                                    <FileText className="h-5 w-5 text-muted-foreground" />
                                  </div>
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
                              )}
                              <button
                                type="button"
                                onClick={async () => {
                                  const confirmed = await confirm({
                                    title: "Delete this attachment?",
                                    tone: "danger",
                                  });
                                  if (confirmed) {
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
                          {c.attachments?.filter((attachment: any) =>
                            attachment.mimeType?.startsWith("image/")
                          ).length > 0 && (
                            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                              {c.attachments
                                .filter((attachment: any) =>
                                  attachment.mimeType?.startsWith("image/")
                                )
                                .map((attachment: any) => (
                                  <button
                                    key={attachment.id}
                                    type="button"
                                    className="group overflow-hidden rounded-lg border bg-muted text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    onClick={() => openLightbox(attachment.id)}
                                    aria-label={`เปิดภาพแนบ ${attachment.fileName}`}
                                  >
                                    <AuthenticatedAttachmentImage
                                      src={
                                        attachment.resolvedUrl ??
                                        attachment.fileUrl
                                      }
                                      alt={attachment.fileName}
                                      className="h-32 w-full object-contain transition-transform group-hover:scale-105"
                                    />
                                    <span className="block truncate px-2 py-1 text-[10px] text-muted-foreground">
                                      {attachment.fileName}
                                    </span>
                                  </button>
                                ))}
                            </div>
                          )}
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
              {detail.status === "closed" ? (
                <div className="border-t bg-slate-100 p-4 text-center text-sm font-medium text-slate-600">
                  งานนี้ปิดแล้ว ไม่สามารถ reply หรือแนบไฟล์เพิ่มได้
                </div>
              ) : (
                <div className="border-t bg-white/50 p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-3">
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
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-blue-700 hover:text-blue-900">
                      <Paperclip className="h-3.5 w-3.5" />
                      แนบภาพ ({replyFiles.length}/{5})
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        className="sr-only"
                        disabled={replyUploading || replyFiles.length >= 5}
                        onChange={event => {
                          const selected = Array.from(event.target.files ?? [])
                            .filter(file => file.type.startsWith("image/"))
                            .slice(0, 5 - replyFiles.length);
                          setReplyFiles(current => [...current, ...selected]);
                          event.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                  {replyFiles.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {replyFiles.map((file, index) => (
                        <span
                          key={`${file.name}-${index}`}
                          className="flex max-w-full items-center gap-1 rounded-md border bg-blue-50 px-2 py-1 text-xs text-blue-900"
                        >
                          <span className="max-w-[220px] truncate">
                            {file.name}
                          </span>
                          <button
                            type="button"
                            className="rounded p-0.5 hover:bg-blue-100"
                            aria-label={`ลบภาพ ${file.name}`}
                            onClick={() =>
                              setReplyFiles(current =>
                                current.filter(
                                  (_, fileIndex) => fileIndex !== index
                                )
                              )
                            }
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
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
                        (!commentText.trim() && replyFiles.length === 0) ||
                        addCommentMutation.isPending ||
                        replyUploading
                      }
                      onClick={() => void handleSendComment()}
                    >
                      {addCommentMutation.isPending || replyUploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Generic overdue unread alert — intentionally omits ticket titles. */}
              <Dialog
                open={overdueAlertOpen}
                onOpenChange={setOverdueAlertOpen}
              >
                <DialogContent className="max-w-md">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />
                    <div>
                      <h2 className="text-lg font-semibold">
                        มีรายการค้างที่ยังไม่ได้อ่าน
                      </h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        มีรายการ feedback ค้างที่ยังไม่ได้อ่านเกิน 2 ชั่วโมง
                        กรุณาเข้าไปอ่านรายการที่ค้าง
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    className="mt-4 w-full"
                    onClick={() => {
                      setUnreadOnly(true);
                      setSourceFilter(undefined);
                      setOverdueAlertOpen(false);
                    }}
                  >
                    ไปอ่านรายการค้าง
                  </Button>
                </DialogContent>
              </Dialog>

              {/* Image attachment lightbox */}
              <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
                <DialogContent className="h-[100dvh] w-[100vw] max-w-none rounded-none p-0 overflow-hidden flex flex-col">
                  {imageAttachments[lightboxIndex] && (
                    <>
                      <div className="relative flex-1 min-h-0 bg-black flex items-center justify-center overflow-hidden">
                        {imageAttachments.length > 1 && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="absolute left-3 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70 text-white"
                              onClick={() => navigateLightbox("prev")}
                            >
                              <ChevronLeft className="w-6 h-6" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="absolute right-3 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70 text-white"
                              onClick={() => navigateLightbox("next")}
                            >
                              <ChevronRight className="w-6 h-6" />
                            </Button>
                          </>
                        )}
                        <AuthenticatedAttachmentImage
                          key={imageAttachments[lightboxIndex].id}
                          src={
                            imageAttachments[lightboxIndex].resolvedUrl ??
                            imageAttachments[lightboxIndex].fileUrl
                          }
                          alt={imageAttachments[lightboxIndex].fileName}
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div className="flex-shrink-0 px-5 py-3 bg-background border-t flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {imageAttachments[lightboxIndex].fileName}
                          </p>
                          {imageAttachments.length > 1 && (
                            <p className="text-xs text-muted-foreground">
                              {lightboxIndex + 1} / {imageAttachments.length}
                            </p>
                          )}
                        </div>
                        <a
                          href={
                            getAuthenticatedAttachmentUrl(
                              imageAttachments[lightboxIndex].resolvedUrl ??
                                imageAttachments[lightboxIndex].fileUrl
                            ) ?? "#"
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={event => {
                            event.preventDefault();
                            void openAuthenticatedAttachment(
                              imageAttachments[lightboxIndex].resolvedUrl ??
                                imageAttachments[lightboxIndex].fileUrl
                            ).catch(() => undefined);
                          }}
                          className="text-xs text-blue-600 hover:underline shrink-0"
                        >
                          เปิดในแท็บใหม่
                        </a>
                      </div>
                    </>
                  )}
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
