import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { LocaleToggle } from "@/components/LocaleToggle";
import { Badge } from "@smartspec/ui/src/components/ui/badge";
import { Button } from "@smartspec/ui/src/components/ui/button";
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
  User,
  Paperclip,
  FileText,
  Download,
} from "lucide-react";

export default function MyFeedback() {
  const [, setLocation] = useLocation();
  const search = useSearch();
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

  const ticketsQuery = trpc.feedback.myTickets.useQuery({
    limit: 50,
    offset: 0,
  });
  const ticketDetailQuery = trpc.feedback.myTicketDetail.useQuery(
    { id: selectedTicketId! },
    { enabled: !!selectedTicketId }
  );

  const tickets = ticketsQuery.data ?? [];
  const detail = ticketDetailQuery.data;

  const typeIcons: Record<string, React.ReactNode> = {
    bug: <Bug className="h-3.5 w-3.5" />,
    feature_request: <Lightbulb className="h-3.5 w-3.5" />,
    observation: <Eye className="h-3.5 w-3.5" />,
    question: <HelpCircle className="h-3.5 w-3.5" />,
  };

  const typeColor: Record<string, string> = {
    bug: "bg-red-100 text-red-800",
    feature_request: "bg-purple-100 text-purple-800",
    observation: "bg-blue-100 text-blue-800",
    question: "bg-green-100 text-green-800",
  };

  const statusColor: Record<string, string> = {
    new: "bg-blue-100 text-blue-800",
    triaged: "bg-yellow-100 text-yellow-800",
    in_progress: "bg-orange-100 text-orange-800",
    resolved: "bg-green-100 text-green-800",
    closed: "bg-gray-100 text-gray-800",
    duplicate: "bg-gray-100 text-gray-500",
    deferred: "bg-gray-100 text-gray-600",
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
                  <h1 className="text-lg font-bold">My Feedback</h1>
                  <p className="text-xs text-muted-foreground">
                    View your submitted tickets & replies
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <LocaleToggle className="shrink-0" />
              <Badge variant="secondary">{tickets.length} tickets</Badge>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex h-[calc(100vh-65px)]">
        {/* Left: Ticket list */}
        <div className="w-[380px] border-r bg-white/50 flex flex-col">
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {tickets.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No feedback submitted yet</p>
                  <p className="text-xs mt-1">
                    Use the Feedback button to report issues
                  </p>
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
                  </div>
                  <div className="font-medium text-sm truncate">
                    {ticket.title}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(ticket.createdAt)}
                    </span>
                    {ticket.respondedAt && (
                      <span className="text-[10px] text-green-600 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Replied
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
            <ScrollArea className="flex-1">
              <div className="p-6 max-w-3xl mx-auto space-y-4">
                {/* Header */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
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
                  <h2 className="text-xl font-semibold">{detail.title}</h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Submitted {formatDate(detail.createdAt)}
                  </p>
                </div>

                {/* Description */}
                {detail.description && (
                  <div className="bg-white rounded-lg p-4 border">
                    <p className="text-sm whitespace-pre-wrap">
                      {detail.description}
                    </p>
                  </div>
                )}

                {/* Resolution notes */}
                {detail.resolutionNotes && (
                  <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                    <h3 className="text-sm font-medium text-green-800 mb-1 flex items-center gap-1">
                      <CheckCircle className="h-4 w-4" />
                      Resolution
                    </h3>
                    <p className="text-sm text-green-700 whitespace-pre-wrap">
                      {detail.resolutionNotes}
                    </p>
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
                          <a
                            key={att.id}
                            href={att.resolvedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 p-2 rounded-lg border hover:bg-muted/50 transition-colors group"
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
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Comments / Replies */}
                <div>
                  <h3 className="text-sm font-medium mb-3">
                    Replies ({(detail as any).comments?.length ?? 0})
                  </h3>
                  <div className="space-y-3">
                    {(detail as any).comments?.map((c: any) => (
                      <div
                        key={c.id}
                        className="bg-blue-50 rounded-lg p-4 border border-blue-100"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-6 h-6 rounded-full bg-blue-200 flex items-center justify-center">
                            <User className="h-3.5 w-3.5 text-blue-700" />
                          </div>
                          <span className="text-xs font-medium text-blue-800">
                            {c.authorType === "ai"
                              ? "AI Assistant"
                              : "Support Team"}
                          </span>
                          <span className="text-[10px] text-muted-foreground ml-auto">
                            {formatDate(c.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">
                          {c.content}
                        </p>
                      </div>
                    ))}
                    {((detail as any).comments?.length ?? 0) === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <p className="text-sm">No replies yet</p>
                        <p className="text-xs mt-1">
                          Our team will review your feedback shortly
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  );
}
