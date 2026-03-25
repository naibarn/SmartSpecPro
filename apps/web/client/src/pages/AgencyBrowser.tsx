import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useAgencyList } from "@/hooks/useAgencyQuery";
import { useTenantFeatureFlags } from "@/hooks/useTenantFeatureFlag";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Users,
  Plus,
  Search,
  Loader2,
  MessageSquare,
  Edit,
  Trash2,
  ChevronLeft,
  Lock,
  Globe,
  Share2,
  X,
  Clock,
  XCircle,
  Send,
  AlertTriangle,
  Sparkles,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AgencyTemplateModal } from "@/components/agency/AgencyTemplateModal";
import { formatPublishingReadiness, type SocialPublishingPageOption } from "@/types/social";
import type { HybridOrchestrationPlan, HybridPlanPayload } from "@shared/orchestration/hybridOrchestration";

interface AgencyItem {
  id: string;
  name: string;
  description?: string;
  status?: string;
  agentCount?: number;
  creditMultiplier?: number;
  creatorFeeCredits?: number;
  canEdit?: boolean;
  ownerName?: string | null;
  ownerEmail?: string | null;
  visibility?: string;
  sharedGroupCount?: number;
  requestedPublishAt?: string | null;
  rejectionReason?: string | null;
}

function buildAgencyHybridPreviewPayload(agency: AgencyItem): HybridPlanPayload {
  const description = agency.description?.trim();
  const draft = [
    `Design a hybrid orchestration for ${agency.name}.`,
    description ? `Context: ${description}` : null,
    "Use workflow for control and commit safety, and use the swarm for parallel reasoning and critique.",
  ]
    .filter((part): part is string => Boolean(part))
    .join(" ");

  const plan: HybridOrchestrationPlan = {
    mode: "hybrid",
    blendMode: "balanced-mixed",
    summary: `Starter hybrid blueprint for ${agency.name}.`,
    workflowAnchor: "workflow-planner",
    swarmRoles: ["explorer", "critic", "synthesizer"],
    requiresApproval: true,
    reason: "agency_overview_shortcut",
    stages: [
      {
        id: "workflow-intake",
        type: "intake",
        owner: "workflow",
        title: "Lock scope and constraints",
        description: "Turn the agency request into a deterministic brief and acceptance criteria.",
        inputs: ["user message", "agency context"],
        outputs: ["orchestration brief", "acceptance criteria"],
      },
      {
        id: "swarm-explore",
        type: "explore",
        owner: "swarm",
        title: "Explore alternatives in parallel",
        description: "Generate options, critique trade-offs, and surface edge cases.",
        inputs: ["orchestration brief"],
        outputs: ["option set", "risks", "recommended path"],
      },
      {
        id: "workflow-validate",
        type: "validate",
        owner: "workflow",
        title: "Validate and reconcile",
        description: "Merge the strongest option into a commit-ready plan.",
        inputs: ["option set", "risks", "recommended path"],
        outputs: ["validated execution plan", "guardrail checks"],
      },
      {
        id: "human-approval",
        type: "approval",
        owner: "human",
        title: "Approve or adjust",
        description: "Review the proposal before execution.",
        inputs: ["validated execution plan", "guardrail checks"],
        outputs: ["approval decision"],
        gate: "required",
      },
      {
        id: "workflow-commit",
        type: "commit",
        owner: "workflow",
        title: "Commit the final action",
        description: "Execute the approved plan and record the result.",
        inputs: ["approval decision"],
        outputs: ["published result", "audit record"],
      },
    ],
  };

  return { draft, plan };
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  published: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  archived: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

const VISIBILITY_CONFIG: Record<string, { icon: typeof Lock; labelKey: string; style: string }> = {
  private: {
    icon: Lock,
    labelKey: "browser.visibility.private",
    style: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  },
  shared: {
    icon: Users,
    labelKey: "browser.visibility.shared",
    style: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200",
  },
  public: {
    icon: Globe,
    labelKey: "browser.visibility.public",
    style: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200",
  },
  pending_approval: {
    icon: Clock,
    labelKey: "browser.visibility.pendingApproval",
    style: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200",
  },
  rejected: {
    icon: XCircle,
    labelKey: "browser.visibility.rejected",
    style: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200",
  },
};

function AgencyShareDialog({
  agencyId,
  agencyName,
  open,
  onOpenChange,
}: {
  agencyId: string;
  agencyName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("agency");
  const [groupSearch, setGroupSearch] = useState("");
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);

  const utils = trpc.useUtils();

  const { data: sharedData, isLoading: loadingShared } =
    trpc.agency.listAgencyGroups.useQuery(
      { agencyId },
      { enabled: open },
    );

  const { data: groupsData, isLoading: loadingGroups } =
    trpc.groups.list.useQuery(undefined, { enabled: open });

  const shareMutation = trpc.agency.shareAgencyWithGroups.useMutation({
    onSuccess: () => {
      utils.agency.listAgencyGroups.invalidate({ agencyId });
      utils.agency.list.invalidate();
      setSelectedGroupIds([]);
    },
  });

  const unshareMutation = trpc.agency.unshareAgencyGroup.useMutation({
    onSuccess: () => {
      utils.agency.listAgencyGroups.invalidate({ agencyId });
      utils.agency.list.invalidate();
    },
  });

  const sharedGroups = (sharedData?.groups ?? []) as { id: number; name: string; description?: string | null }[];
  const sharedGroupIds = new Set(sharedGroups.map((g) => g.id));

  // groups.list returns an array directly (not wrapped in { groups })
  const allGroups = (Array.isArray(groupsData) ? groupsData : []) as { id: number; name: string; description?: string | null }[];
  const availableGroups = allGroups.filter(
    (g) =>
      !sharedGroupIds.has(g.id) &&
      (!groupSearch || g.name.toLowerCase().includes(groupSearch.toLowerCase())),
  );

  const toggleGroup = (id: number) => {
    setSelectedGroupIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleShare = () => {
    if (selectedGroupIds.length > 0) {
      shareMutation.mutate({ agencyId, groupIds: selectedGroupIds });
    }
  };

  const handleUnshare = (groupId: number) => {
    unshareMutation.mutate({ agencyId, groupId });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("browser.shareDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("browser.shareDialog.description", { name: agencyName })}
          </DialogDescription>
        </DialogHeader>

        {/* Currently shared groups */}
        {loadingShared ? (
          <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : sharedGroups.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t("browser.shareDialog.sharedWith")}</p>
            <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">
              {sharedGroups.map((g) => (
                <Badge
                  key={g.id}
                  variant="secondary"
                  className="gap-1 pr-1 bg-blue-50 text-blue-700 hover:bg-blue-100"
                >
                  {g.name}
                  <button
                    className="ml-1 rounded-full p-0.5 hover:bg-blue-200 transition-colors"
                    onClick={() => handleUnshare(g.id)}
                    disabled={unshareMutation.isPending}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-1">{t("browser.shareDialog.notShared")}</p>
        )}

        {/* Add groups */}
        <div className="space-y-2 border-t pt-3">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t("browser.shareDialog.addGroups")}</p>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={groupSearch}
              onChange={(e) => setGroupSearch(e.target.value)}
              placeholder={t("browser.shareDialog.searchGroups")}
              className="pl-8 h-8 text-sm"
            />
          </div>

          {loadingGroups ? (
            <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("browser.shareDialog.loadingGroups")}
            </div>
          ) : availableGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              {allGroups.length === 0 ? t("browser.shareDialog.noGroupsAvailable") : t("browser.shareDialog.noMatchingGroups")}
            </p>
          ) : (
            <div className="max-h-40 overflow-y-auto space-y-1 rounded-md border p-1">
              {availableGroups.map((g) => (
                <label
                  key={g.id}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer transition-colors",
                    selectedGroupIds.includes(g.id) ? "bg-indigo-50" : "hover:bg-slate-50",
                  )}
                >
                  <Checkbox
                    checked={selectedGroupIds.includes(g.id)}
                    onCheckedChange={() => toggleGroup(g.id)}
                  />
                  <span className="text-sm">{g.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t("browser.shareDialog.close")}
          </Button>
          <Button
            size="sm"
            disabled={selectedGroupIds.length === 0 || shareMutation.isPending}
            onClick={handleShare}
          >
            {shareMutation.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            {t("browser.shareDialog.shareWith", { count: selectedGroupIds.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AgencyBrowser() {
  const { t } = useTranslation("agency");
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [shareTarget, setShareTarget] = useState<{ id: string; name: string } | null>(null);
  const [publishTarget, setPublishTarget] = useState<{ id: string; name: string; creatorFee?: number } | null>(null);

  // Feature flag is enforced server-side: agency.list throws NOT_FOUND
  // when AGENCY_SWARM_ENABLED is false
  const { data: agencies, isLoading, isError } = useAgencyList();
  const tenantFlags = useTenantFeatureFlags();
  const metaChannelsEnabled = tenantFlags.META_CHANNELS_ENABLED;
  const { data: publishingPages = [], isLoading: publishingPagesLoading } = trpc.socialPublishing.listPages.useQuery(
    undefined,
    {
      enabled: metaChannelsEnabled && isAuthenticated && !authLoading && !isLoading && !isError,
    },
  );
  const utils = trpc.useUtils();
  const deleteMutation = trpc.agency.delete.useMutation({
    onSuccess: () => {
      utils.agency.list.invalidate();
      setDeleteTarget(null);
    },
  });

  const requestPublishMutation = trpc.agency.requestPublish.useMutation({
    onSuccess: () => {
      utils.agency.list.invalidate();
      setPublishTarget(null);
    },
  });

  const cancelPublishMutation = trpc.agency.cancelPublishRequest.useMutation({
    onSuccess: () => {
      utils.agency.list.invalidate();
    },
  });
  const createHybridPreviewTokenMutation = trpc.hybridOrchestration.createPreviewToken.useMutation();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  // Redirect to dashboard if agency feature is disabled
  useEffect(() => {
    if (!isLoading && isError) {
      setLocation("/dashboard");
    }
  }, [isLoading, isError, setLocation]);

  const handleOpenHybridPreview = (agency: AgencyItem) => {
    void (async () => {
      try {
        const payload = buildAgencyHybridPreviewPayload(agency);
        const result = await createHybridPreviewTokenMutation.mutateAsync({
          agencyId: agency.id,
          payload,
          sourceSurface: "agency-browser",
        });
        setLocation(`/agencies/${agency.id}/hybrid-preview?hybridPreviewToken=${encodeURIComponent(result.token)}`);
      } catch {
        // Toasts are handled by the surrounding mutation UI; keep the flow quiet here.
      }
    })();
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-indigo-50/30 to-purple-50/20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const agencyList = (agencies as unknown as { agencies: AgencyItem[] } | undefined)?.agencies ?? [];
  const filtered = agencyList.filter(
    (a) =>
      !search ||
      a.name?.toLowerCase().includes(search.toLowerCase()) ||
      a.description?.toLowerCase().includes(search.toLowerCase()),
  );
  const socialPublishingSummary = (() => {
    if (!metaChannelsEnabled) {
      return null;
    }

    const pages = publishingPages as SocialPublishingPageOption[];
    const total = pages.length;
    const readyCount = pages.filter((page) => page.publishingReady !== false).length;
    const blockedPages = pages.filter((page) => page.publishingReady === false);

    if (publishingPagesLoading) {
      return {
        label: t("browser.social.checkingReadiness"),
        detail: t("browser.social.loadingPages"),
        tone: "bg-slate-100 text-slate-600 border-slate-200",
        title: t("browser.social.loadingTitle"),
      };
    }

    if (total === 0) {
      return {
        label: t("browser.social.notConnected"),
        detail: t("browser.social.connectPage"),
        tone: "bg-slate-100 text-slate-600 border-slate-200",
        title: t("browser.social.notConnectedTitle"),
      };
    }

    if (blockedPages.length === 0) {
      return {
        label: t("browser.social.readyToPublish"),
        detail: t("browser.social.pagesReady", { count: total }),
        tone: "bg-emerald-100 text-emerald-700 border-emerald-200",
        title: t("browser.social.pagesReadyTitle", { count: total }),
      };
    }

    return {
      label: t("browser.social.partialReady", { ready: readyCount, total }),
      detail: t("browser.social.pagesNeedAccess", { count: blockedPages.length }),
      tone: "bg-amber-100 text-amber-700 border-amber-200",
      title: blockedPages
        .map((page) => `${page.label}: ${formatPublishingReadiness(page.publishingIssueCode)}`)
        .join(" • "),
    };
  })();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-purple-50/20">
      <AgencyTemplateModal open={isModalOpen} onOpenChange={setIsModalOpen} />

      {/* Sticky Header */}
      <header className="bg-white/70 backdrop-blur-xl border-b border-gray-200/50 sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between">
            {/* Left: Back + Branding */}
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/dashboard")}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                {t("browser.back")}
              </Button>
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-200/50">
                  <Users className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold">{t("browser.header.title")}</h1>
                  <p className="text-xs text-muted-foreground">{t("browser.header.subtitle")}</p>
                </div>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="gap-1 hidden sm:flex">
                <Users className="h-3 w-3" />
                {t("browser.header.teamsCount", { count: agencyList.length })}
              </Badge>
              <Button
                variant="outline"
                onClick={() => setLocation("/agencies/marketplace")}
              >
                <Globe className="mr-2 h-4 w-4" />
                {t("browser.header.marketplace")}
              </Button>
              <Button onClick={() => setIsModalOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                {t("browser.header.createAgency")}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-4 sm:px-6 lg:px-8 py-6">
        {/* Search */}
        <div className="relative mb-6 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("browser.searchPlaceholder")}
            className="pl-9 bg-white/80"
          />
        </div>

        {socialPublishingSummary && (
          <div className="mb-6 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white/75 px-4 py-3 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800">{t("browser.social.facebookAutoPost")}</p>
              <p className="text-xs text-slate-500">{socialPublishingSummary.detail}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="secondary"
                className={cn("gap-1", socialPublishingSummary.tone)}
                title={socialPublishingSummary.title}
              >
                <Send className="h-3 w-3" />
                {socialPublishingSummary.label}
              </Badge>
              <Button variant="outline" size="sm" onClick={() => setLocation("/social/publishing")}>
                {t("browser.social.openPublishing")}
              </Button>
            </div>
          </div>
        )}

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground border-2 border-dashed border-slate-200 rounded-xl bg-white/50">
            <Users className="mx-auto mb-4 h-12 w-12 text-slate-300" />
            <p className="text-lg font-medium text-slate-600">{t("browser.empty.title")}</p>
            <p className="text-sm mt-1 text-slate-500">
              {search
                ? t("browser.empty.searchHint")
                : t("browser.empty.createHint")}
            </p>
            {!search && (
              <Button className="mt-6" variant="outline" onClick={() => setIsModalOpen(true)}>
                {t("browser.empty.browseTemplates")}
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((agency) => {
              const vis = VISIBILITY_CONFIG[agency.visibility || "private"] ?? VISIBILITY_CONFIG.private;
              const VisIcon = vis.icon;

              return (
                <div
                  key={agency.id}
                  className="group cursor-pointer rounded-xl border border-slate-200 bg-white p-5 transition-all hover:border-indigo-300 hover:shadow-md hover:-translate-y-1"
                  onClick={() => setLocation(agency.canEdit ? `/agencies/${agency.id}/edit` : `/agencies/${agency.id}`)}
                >
                  {/* Title + Status */}
                  <div className="mb-1 flex items-start justify-between">
                    <h3 className="font-semibold text-slate-800 text-lg leading-tight">{agency.name}</h3>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[10px] uppercase tracking-wider font-bold shrink-0 ml-2",
                        STATUS_STYLES[agency.status || ""] || "",
                      )}
                    >
                      {agency.status || "draft"}
                    </Badge>
                  </div>

                  {/* Owner */}
                  <div className="flex items-center gap-1.5 mb-2">
                    {agency.canEdit ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                        <Edit className="h-2.5 w-2.5" />
                        {t("browser.card.owner")}
                      </span>
                    ) : agency.ownerName ? (
                      <span className="text-xs text-slate-400">{t("browser.card.by", { name: agency.ownerName })}</span>
                    ) : null}
                  </div>

                  {/* Description */}
                  {agency.description && (
                    <p className="mb-3 line-clamp-2 text-sm text-slate-600 leading-relaxed">
                      {agency.description}
                    </p>
                  )}

                  {/* Visibility badge + rejection reason */}
                  <div className="mb-3 flex flex-wrap items-center gap-1.5">
                    <Badge
                      variant="secondary"
                      className={cn("text-[10px] gap-1 font-medium", vis.style)}
                    >
                      <VisIcon className="h-3 w-3" />
                      {t(vis.labelKey)}
                      {agency.visibility === "shared" && (agency.sharedGroupCount ?? 0) > 0 && (
                        <span className="ml-0.5">{agency.sharedGroupCount}</span>
                      )}
                    </Badge>
                    {agency.visibility === "rejected" && agency.rejectionReason && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 text-[10px] text-red-600 cursor-help">
                              <AlertTriangle className="h-3 w-3" />
                              View reason
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-xs">
                            <p className="text-xs">{agency.rejectionReason}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>

                  {/* Publish CTA banner — prominent action for eligible agencies */}
                  {agency.canEdit && agency.status === "published" && agency.visibility !== "public" && agency.visibility !== "pending_approval" && (
                    <button
                      className="w-full flex items-center gap-2 mb-3 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50/80 hover:bg-amber-100 transition-colors text-left"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPublishTarget({ id: agency.id, name: agency.name, creatorFee: agency.creatorFeeCredits ?? 0 });
                      }}
                    >
                      <div className="w-7 h-7 rounded-full bg-amber-200/60 flex items-center justify-center shrink-0">
                        <Send className="h-3.5 w-3.5 text-amber-700" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-amber-800">
                          {agency.visibility === "rejected" ? "Re-submit for Approval" : "Request Public Publish"}
                        </p>
                        <p className="text-[10px] text-amber-600 leading-tight">Submit to Marketplace for admin review</p>
                      </div>
                    </button>
                  )}

                  {/* Pending approval banner */}
                  {agency.canEdit && agency.visibility === "pending_approval" && (
                    <div className="flex items-center justify-between mb-3 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50/80">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 text-amber-600 animate-spin" />
                        <span className="text-xs font-medium text-amber-700">Awaiting admin review...</span>
                      </div>
                      <button
                        className="text-[10px] font-medium text-amber-600 hover:text-amber-800 underline"
                        disabled={cancelPublishMutation.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          cancelPublishMutation.mutate({ agencyId: agency.id });
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {agency.canEdit && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mb-3 w-full justify-between border-indigo-200 bg-indigo-50/70 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLocation(`/agencies/${agency.id}/review`);
                      }}
                    >
                      <span className="flex items-center gap-2">
                        <Sparkles className="h-3.5 w-3.5" />
                        Evaluate Agency
                      </span>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  )}

                  {agency.canEdit && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mb-3 w-full justify-between border-violet-200 bg-violet-50/70 text-violet-700 hover:bg-violet-100 hover:text-violet-800"
                      disabled={createHybridPreviewTokenMutation.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenHybridPreview(agency);
                      }}
                    >
                      <span className="flex items-center gap-2">
                        <Sparkles className="h-3.5 w-3.5" />
                        Hybrid Orchestrate
                      </span>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  )}

                  {agency.canEdit && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mb-3 w-full justify-between border-cyan-200 bg-cyan-50/70 text-cyan-700 hover:bg-cyan-100 hover:text-cyan-800"
                      disabled={createHybridPreviewTokenMutation.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenHybridPreview(agency);
                      }}
                    >
                      <span className="flex items-center gap-2">
                        <RefreshCw className="h-3.5 w-3.5" />
                        Regenerate Preview Token
                      </span>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  )}

                  {/* Footer: agent count + actions */}
                  <div className="flex items-center justify-between mt-auto">
                    <div className="flex items-center gap-3 text-xs font-medium text-slate-500 bg-slate-50 px-2 py-1.5 rounded-md">
                      <span className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" />
                        {agency.agentCount ?? 0} agents
                      </span>
                    </div>

                    <div className="flex gap-1.5">
                      {agency.status === "published" && (
                        <Button
                          variant="secondary"
                          size="icon"
                          className="h-8 w-8 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 hover:text-indigo-800"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLocation(`/agencies/${agency.id}`);
                          }}
                          title="Chat with agency"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {agency.canEdit && (
                        <>
                          <Button
                            variant="secondary"
                            size="icon"
                            className="h-8 w-8 bg-amber-50 hover:bg-amber-100 text-amber-700 hover:text-amber-800"
                            onClick={(e) => {
                              e.stopPropagation();
                              setLocation(`/agencies/${agency.id}/review`);
                            }}
                            title="Open review center"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="secondary"
                            size="icon"
                            className="h-8 w-8 bg-blue-50 hover:bg-blue-100 text-blue-600 hover:text-blue-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShareTarget({ id: agency.id, name: agency.name });
                            }}
                            title="Share agency"
                          >
                            <Share2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="secondary"
                            size="icon"
                            className="h-8 w-8 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900"
                            onClick={(e) => {
                              e.stopPropagation();
                              setLocation(`/agencies/${agency.id}/edit`);
                            }}
                            title="Edit agency"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="secondary"
                            size="icon"
                            className="h-8 w-8 bg-red-50 hover:bg-red-100 text-red-500 hover:text-red-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget({ id: agency.id, name: agency.name });
                            }}
                            title="Delete agency"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Share dialog */}
      {shareTarget && (
        <AgencyShareDialog
          agencyId={shareTarget.id}
          agencyName={shareTarget.name}
          open={!!shareTarget}
          onOpenChange={(open) => { if (!open) setShareTarget(null); }}
        />
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Agency</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This will archive the agency and it will no longer appear in your list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate({ id: deleteTarget.id });
                }
              }}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Publish request confirmation dialog */}
      <AlertDialog open={!!publishTarget} onOpenChange={(open) => { if (!open) setPublishTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Request Public Publishing</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Submit <strong>{publishTarget?.name}</strong> for admin review to be published on the public marketplace.
                </p>
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 space-y-1.5">
                  <p className="font-medium flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4" />
                    What happens next:
                  </p>
                  <ul className="list-disc pl-5 space-y-0.5 text-xs">
                    <li>An admin will review your agency for quality and compliance</li>
                    <li>If approved, it will appear on the public Agencies Marketplace</li>
                    <li>Creator fee: <strong>{publishTarget?.creatorFee ?? 0} credits</strong> per use</li>
                    <li>You&apos;ll be notified of the decision</li>
                  </ul>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={requestPublishMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={requestPublishMutation.isPending}
              onClick={() => {
                if (publishTarget) {
                  requestPublishMutation.mutate({ agencyId: publishTarget.id });
                }
              }}
            >
              {requestPublishMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Submit for Review
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
