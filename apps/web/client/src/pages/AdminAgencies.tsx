import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Bot,
  CheckCircle2,
  XCircle,
  Loader2,
  Users,
  Clock,
  ChevronLeft,
  Globe,
  Lock,
  AlertTriangle,
} from "lucide-react";

interface PendingAgency {
  id: string;
  name: string;
  description?: string | null;
  agentCount: number;
  creatorFeeCredits?: number | null;
  platformSharePct?: number | null;
  requestedPublishAt?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
}

const VISIBILITY_BADGE: Record<string, { label: string; style: string }> = {
  private: { label: "Private", style: "bg-slate-100 text-slate-600" },
  shared: { label: "Shared", style: "bg-blue-100 text-blue-700" },
  pending_approval: { label: "Pending", style: "bg-amber-100 text-amber-700" },
  public: { label: "Public", style: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Rejected", style: "bg-red-100 text-red-700" },
};

export default function AdminAgencies() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("pending");
  const [rejectingAgency, setRejectingAgency] = useState<PendingAgency | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const isAdmin = user?.role === "admin";

  const utils = trpc.useUtils();

  const { data: pendingData, isLoading: pendingLoading } =
    trpc.agency.adminListPendingAgencies.useQuery(
      { limit: 100, offset: 0 },
      { enabled: !!isAdmin },
    );

  const pendingItems = (pendingData?.items ?? []) as PendingAgency[];
  const pendingTotal = pendingData?.total ?? 0;

  const approveMutation = trpc.agency.adminApproveAgency.useMutation({
    onSuccess: () => {
      utils.agency.adminListPendingAgencies.invalidate();
    },
  });

  const rejectMutation = trpc.agency.adminRejectAgency.useMutation({
    onSuccess: () => {
      utils.agency.adminListPendingAgencies.invalidate();
      setRejectingAgency(null);
      setRejectReason("");
    },
  });

  if (!isAdmin) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-purple-50/20">
      {/* Header */}
      <header className="bg-white/70 backdrop-blur-xl border-b border-gray-200/50 sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/admin/dashboard")}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Admin
              </Button>
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-purple-200/50">
                  <Bot className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold">Agency Approvals</h1>
                  <p className="text-xs text-muted-foreground">Review agency publish requests</p>
                </div>
              </div>
            </div>
            {pendingTotal > 0 && (
              <Badge variant="destructive" className="gap-1">
                <Clock className="h-3 w-3" />
                {pendingTotal} pending
              </Badge>
            )}
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="px-4 sm:px-6 lg:px-8 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="pending" className="gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Pending Approval
              {pendingTotal > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">
                  {pendingTotal}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-4">
            {pendingLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : pendingItems.length === 0 ? (
              <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-xl bg-white/50">
                <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-300" />
                <p className="text-lg font-medium text-slate-600">All caught up!</p>
                <p className="text-sm text-slate-500 mt-1">No agencies waiting for approval.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agency</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead className="text-center">Agents</TableHead>
                      <TableHead className="text-center">Creator Fee</TableHead>
                      <TableHead>Requested</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingItems.map((agency) => (
                      <TableRow key={agency.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{agency.name}</p>
                            {agency.description && (
                              <p className="text-xs text-muted-foreground line-clamp-1 max-w-xs">
                                {agency.description}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {agency.ownerName || agency.ownerEmail || "Unknown"}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className="gap-1">
                            <Users className="h-3 w-3" />
                            {agency.agentCount}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-sm font-medium">
                            {agency.creatorFeeCredits ?? 0} cr
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {agency.requestedPublishAt
                              ? new Date(agency.requestedPublishAt).toLocaleDateString()
                              : "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                              disabled={approveMutation.isPending}
                              onClick={() => approveMutation.mutate({ agencyId: agency.id })}
                            >
                              {approveMutation.isPending ? (
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              ) : (
                                <CheckCircle2 className="mr-1 h-3 w-3" />
                              )}
                              Approve
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-600 border-red-300 hover:bg-red-50"
                              onClick={() => {
                                setRejectingAgency(agency);
                                setRejectReason("");
                              }}
                            >
                              <XCircle className="mr-1 h-3 w-3" />
                              Reject
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Reject dialog */}
      <Dialog
        open={!!rejectingAgency}
        onOpenChange={(open) => {
          if (!open) {
            setRejectingAgency(null);
            setRejectReason("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Agency</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting <strong>{rejectingAgency?.name}</strong>.
              The creator will be notified and can re-request after making changes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Textarea
              placeholder="Reason for rejection (optional but recommended)..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectingAgency(null);
                setRejectReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={rejectMutation.isPending}
              onClick={() => {
                if (rejectingAgency) {
                  rejectMutation.mutate({
                    agencyId: rejectingAgency.id,
                    reason: rejectReason.trim() || undefined,
                  });
                }
              }}
            >
              {rejectMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="mr-2 h-4 w-4" />
              )}
              Reject Agency
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
