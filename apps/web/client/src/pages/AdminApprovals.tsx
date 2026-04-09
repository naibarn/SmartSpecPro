import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { LocaleToggle } from "@/components/LocaleToggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronLeft,
  Wand2,
  Bot,
  GitBranch,
  Clock,
} from "lucide-react";

const TYPE_META: Record<
  string,
  { label: string; icon: typeof Wand2; style: string }
> = {
  skill: {
    label: "Skill",
    icon: Wand2,
    style: "bg-purple-100 text-purple-700",
  },
  agency: {
    label: "Agency",
    icon: Bot,
    style: "bg-indigo-100 text-indigo-700",
  },
  template: {
    label: "Template",
    icon: GitBranch,
    style: "bg-teal-100 text-teal-700",
  },
};

interface PendingItem {
  type: "skill" | "agency" | "template";
  id: string;
  name: string;
  description: string | null;
  ownerName: string | null;
  requestedAt: string | null;
}

export default function AdminApprovals() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("all");
  const [rejectTarget, setRejectTarget] = useState<PendingItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const isAdmin = user?.role === "admin";

  const utils = trpc.useUtils();

  // Counts for tab badges
  const { data: counts } = trpc.adminOps.pendingApprovalCounts.useQuery(
    undefined,
    {
      enabled: !!isAdmin,
      refetchInterval: 30_000,
    }
  );

  // Unified list (all tab)
  const { data: allData, isLoading: allLoading } =
    trpc.adminOps.pendingApprovalList.useQuery(
      { limit: 100, offset: 0 },
      { enabled: !!isAdmin && activeTab === "all" }
    );

  // Per-type queries (only fetch when tab is active)
  const { data: skillsData, isLoading: skillsLoading } =
    trpc.adminOps.pendingApprovalList.useQuery(
      { limit: 100, offset: 0, type: "skill" },
      { enabled: !!isAdmin && activeTab === "skills" }
    );
  const { data: agenciesData, isLoading: agenciesLoading } =
    trpc.adminOps.pendingApprovalList.useQuery(
      { limit: 100, offset: 0, type: "agency" },
      { enabled: !!isAdmin && activeTab === "agencies" }
    );
  const { data: templatesData, isLoading: templatesLoading } =
    trpc.adminOps.pendingApprovalList.useQuery(
      { limit: 100, offset: 0, type: "template" },
      { enabled: !!isAdmin && activeTab === "templates" }
    );

  // Mutations
  const approveSkillMut = trpc.skills.approveSkill.useMutation({
    onSuccess: invalidateAll,
  });
  const rejectSkillMut = trpc.skills.rejectSkill.useMutation({
    onSuccess: invalidateAll,
  });
  const approveAgencyMut = trpc.agency.adminApproveAgency.useMutation({
    onSuccess: invalidateAll,
  });
  const rejectAgencyMut = trpc.agency.adminRejectAgency.useMutation({
    onSuccess: invalidateAll,
  });
  const approveTemplateMut = trpc.workflow.adminApproveTemplate.useMutation({
    onSuccess: invalidateAll,
  });
  const rejectTemplateMut = trpc.workflow.adminRejectTemplate.useMutation({
    onSuccess: invalidateAll,
  });

  function invalidateAll() {
    utils.adminOps.pendingApprovalCounts.invalidate();
    utils.adminOps.pendingApprovalList.invalidate();
    utils.skills.listPending.invalidate();
    utils.agency.adminListPendingAgencies.invalidate();
    utils.workflow.adminListPendingTemplates.invalidate();
    setRejectTarget(null);
    setRejectReason("");
  }

  function handleApprove(item: PendingItem) {
    if (item.type === "skill")
      approveSkillMut.mutate({ skillId: Number(item.id) });
    else if (item.type === "agency")
      approveAgencyMut.mutate({ agencyId: item.id });
    else if (item.type === "template")
      approveTemplateMut.mutate({ templateId: Number(item.id) });
  }

  function handleRejectConfirm() {
    if (!rejectTarget) return;
    const reason = rejectReason.trim() || undefined;
    if (rejectTarget.type === "skill")
      rejectSkillMut.mutate({ skillId: Number(rejectTarget.id), reason });
    else if (rejectTarget.type === "agency")
      rejectAgencyMut.mutate({ agencyId: rejectTarget.id, reason });
    else if (rejectTarget.type === "template")
      rejectTemplateMut.mutate({ templateId: Number(rejectTarget.id), reason });
  }

  const isAnyMutating =
    approveSkillMut.isPending ||
    rejectSkillMut.isPending ||
    approveAgencyMut.isPending ||
    rejectAgencyMut.isPending ||
    approveTemplateMut.isPending ||
    rejectTemplateMut.isPending;

  function getTabData(): { items: PendingItem[]; loading: boolean } {
    switch (activeTab) {
      case "skills":
        return {
          items: (skillsData?.items ?? []) as PendingItem[],
          loading: skillsLoading,
        };
      case "agencies":
        return {
          items: (agenciesData?.items ?? []) as PendingItem[],
          loading: agenciesLoading,
        };
      case "templates":
        return {
          items: (templatesData?.items ?? []) as PendingItem[],
          loading: templatesLoading,
        };
      default:
        return {
          items: (allData?.items ?? []) as PendingItem[],
          loading: allLoading,
        };
    }
  }

  if (!isAdmin) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Admin access required.</p>
      </div>
    );
  }

  const { items, loading } = getTabData();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-amber-50/20 to-orange-50/10">
      {/* Header */}
      <header className="bg-white/70 backdrop-blur-xl border-b border-gray-200/50 sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/dashboard")}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Admin
              </Button>
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-200/50">
                  <ClipboardCheck className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold">Approvals</h1>
                  <p className="text-xs text-muted-foreground">
                    Review publish requests
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:justify-end">
              <LocaleToggle className="shrink-0" />
              {(counts?.total ?? 0) > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <Clock className="h-3 w-3" />
                  {counts!.total} pending
                </Badge>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="px-4 sm:px-6 lg:px-8 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all" className="gap-1.5">
              All
              {(counts?.total ?? 0) > 0 && (
                <Badge
                  variant="destructive"
                  className="ml-1 h-5 px-1.5 text-[10px]"
                >
                  {counts!.total}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="skills" className="gap-1.5">
              <Wand2 className="h-3.5 w-3.5" />
              Skills
              {(counts?.skills ?? 0) > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-1 h-5 px-1.5 text-[10px]"
                >
                  {counts!.skills}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="agencies" className="gap-1.5">
              <Bot className="h-3.5 w-3.5" />
              Agencies
              {(counts?.agencies ?? 0) > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-1 h-5 px-1.5 text-[10px]"
                >
                  {counts!.agencies}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-1.5">
              <GitBranch className="h-3.5 w-3.5" />
              Templates
              {(counts?.templates ?? 0) > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-1 h-5 px-1.5 text-[10px]"
                >
                  {counts!.templates}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Shared content for all tabs */}
          {["all", "skills", "agencies", "templates"].map(tab => (
            <TabsContent key={tab} value={tab} className="mt-4">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : items.length === 0 ? (
                <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-xl bg-white/50">
                  <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-300" />
                  <p className="text-lg font-medium text-slate-600">
                    All caught up!
                  </p>
                  <p className="text-sm text-slate-500 mt-1">
                    No items waiting for approval.
                  </p>
                </div>
              ) : (
                <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {activeTab === "all" && (
                          <TableHead className="w-24">Type</TableHead>
                        )}
                        <TableHead>Name</TableHead>
                        <TableHead>Owner</TableHead>
                        <TableHead>Requested</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map(item => {
                        const meta = TYPE_META[item.type] ?? TYPE_META.skill;
                        const TypeIcon = meta.icon;
                        return (
                          <TableRow key={`${item.type}-${item.id}`}>
                            {activeTab === "all" && (
                              <TableCell>
                                <Badge
                                  variant="secondary"
                                  className={`gap-1 text-[10px] ${meta.style}`}
                                >
                                  <TypeIcon className="h-3 w-3" />
                                  {meta.label}
                                </Badge>
                              </TableCell>
                            )}
                            <TableCell>
                              <div>
                                <p className="font-medium text-sm">
                                  {item.name}
                                </p>
                                {item.description && (
                                  <p className="text-xs text-muted-foreground line-clamp-1 max-w-sm">
                                    {item.description}
                                  </p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm">
                                {item.ownerName || "Unknown"}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="text-xs text-muted-foreground">
                                {item.requestedAt
                                  ? new Date(
                                      item.requestedAt
                                    ).toLocaleDateString()
                                  : "—"}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                                  disabled={isAnyMutating}
                                  onClick={() => handleApprove(item)}
                                >
                                  <CheckCircle2 className="mr-1 h-3 w-3" />
                                  Approve
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-red-600 border-red-300 hover:bg-red-50"
                                  disabled={isAnyMutating}
                                  onClick={() => {
                                    setRejectTarget(item);
                                    setRejectReason("");
                                  }}
                                >
                                  <XCircle className="mr-1 h-3 w-3" />
                                  Reject
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </main>

      {/* Reject dialog */}
      <Dialog
        open={!!rejectTarget}
        onOpenChange={open => {
          if (!open) {
            setRejectTarget(null);
            setRejectReason("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Reject {rejectTarget ? TYPE_META[rejectTarget.type]?.label : ""}
            </DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting{" "}
              <strong>{rejectTarget?.name}</strong>. The owner will be notified
              and can re-submit after making changes.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason for rejection (optional but recommended)..."
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectTarget(null);
                setRejectReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isAnyMutating}
              onClick={handleRejectConfirm}
            >
              {isAnyMutating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="mr-2 h-4 w-4" />
              )}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
