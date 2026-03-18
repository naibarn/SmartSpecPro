import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@smartspec/ui/components/tabs";
import { Badge } from "@smartspec/ui/components/badge";
import { Button } from "@smartspec/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@smartspec/ui/components/card";
import { Input } from "@smartspec/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@smartspec/ui/components/select";

export default function AdminFeedbackHub() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [commentText, setCommentText] = useState("");

  const statsQuery = trpc.feedback.stats.useQuery();
  const ticketsQuery = trpc.feedback.list.useQuery({
    status: statusFilter as any,
    limit: 50,
  });
  const ticketDetailQuery = trpc.feedback.getTicket.useQuery(
    { id: selectedTicketId! },
    { enabled: !!selectedTicketId },
  );

  const addCommentMutation = trpc.feedback.addComment.useMutation({
    onSuccess: () => {
      setCommentText("");
      ticketDetailQuery.refetch();
    },
  });
  const updateStatusMutation = trpc.feedback.updateStatus.useMutation({
    onSuccess: () => {
      ticketsQuery.refetch();
      ticketDetailQuery.refetch();
      statsQuery.refetch();
    },
  });

  const stats = statsQuery.data;
  const tickets = ticketsQuery.data ?? [];

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

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Feedback Hub</h1>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats?.total ?? 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-blue-600">New</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-blue-600">{stats?.new ?? 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-yellow-600">Triaged</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-yellow-600">{stats?.triaged ?? 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-orange-600">In Progress</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-orange-600">{stats?.inProgress ?? 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-green-600">Resolved</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{stats?.resolved ?? 0}</div></CardContent>
        </Card>
      </div>

      <div className="flex gap-6">
        {/* Ticket List */}
        <div className="flex-1 space-y-3">
          <div className="flex gap-2 mb-4">
            <Select value={statusFilter ?? "all"} onValueChange={(v) => setStatusFilter(v === "all" ? undefined : v)}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filter by status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="triaged">Triaged</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {tickets.map((ticket: any) => (
            <Card
              key={ticket.id}
              className={`cursor-pointer transition-colors ${selectedTicketId === ticket.id ? "border-primary" : "hover:border-muted-foreground/20"}`}
              onClick={() => setSelectedTicketId(ticket.id)}
            >
              <CardContent className="py-3">
                <div className="flex items-center gap-2 mb-1">
                  <Badge className={typeColor[ticket.ticketType] ?? ""}>{ticket.ticketType}</Badge>
                  <Badge variant="outline" className={statusColor[ticket.status] ?? ""}>{ticket.status}</Badge>
                  <span className="text-xs text-muted-foreground">#{ticket.id}</span>
                </div>
                <div className="font-medium text-sm">{ticket.title}</div>
                {ticket.autoCategory && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Auto: {ticket.autoCategory} / {ticket.autoPriority}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Ticket Detail */}
        {selectedTicketId && ticketDetailQuery.data && (
          <div className="w-[400px] border rounded-lg p-4 space-y-4">
            <div>
              <h3 className="font-semibold">{ticketDetailQuery.data.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{ticketDetailQuery.data.description}</p>
            </div>

            {/* Status Actions */}
            <div className="flex gap-2 flex-wrap">
              {["triaged", "in_progress", "resolved", "closed"].map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={ticketDetailQuery.data.status === s ? "default" : "outline"}
                  onClick={() => updateStatusMutation.mutate({ ticketId: selectedTicketId, status: s as any })}
                >
                  {s.replace("_", " ")}
                </Button>
              ))}
            </div>

            {/* Comments */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Comments</h4>
              {(ticketDetailQuery.data as any).comments?.map((c: any) => (
                <div key={c.id} className="bg-muted rounded p-2 text-sm">
                  <div className="text-xs text-muted-foreground mb-1">
                    {c.authorType} {c.isInternal ? "(internal)" : ""}
                  </div>
                  {c.content}
                </div>
              ))}
            </div>

            {/* Add Comment */}
            <div className="flex gap-2">
              <Input
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Add comment..."
              />
              <Button
                size="sm"
                disabled={!commentText.trim()}
                onClick={() => addCommentMutation.mutate({ ticketId: selectedTicketId, content: commentText })}
              >
                Send
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
