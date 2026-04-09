/**
 * Dashboard Page - SmartAIHub
 * User dashboard after login
 */

import { useEffect, useState, useMemo, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { HelpButton } from "@/components/help";
import { LocaleToggle } from "@/components/LocaleToggle";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { formatRelativeTime } from "@/i18n/formatters";
import type { UserRole } from "@smartspec/shared";
import { detectPlatform } from "@smartspec/shared";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { useAgencyList } from "@/hooks/useAgencyQuery";
import { getResolvedMenuItems } from "@/hooks/useMenuItems";
import { useTenantFeatureFlags } from "@/hooks/useTenantFeatureFlag";
import { useDesktopHostStatus } from "@/features/desktop-host/useDesktopHostStatus";
import { DesktopReleasePanel } from "@/features/desktop-releases/DesktopReleasePanel";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { JobCard } from "@/components/chat/JobCard";
import { FinanceHub } from "@/components/finance/FinanceHub";
import FinanceAccessGate from "@/components/finance/FinanceAccessGate";
import {
  DashboardSectionHeader,
  DashboardStatCard,
  dashboardCardBodyClass,
  dashboardCardDescriptionClass,
  dashboardCardTitleClass,
  dashboardCardTitleLgClass,
  dashboardCardTitleXlClass,
  dashboardMetaLineClass,
  dashboardMetaPillClass,
} from "@/components/dashboard/dashboardPrimitives";
import {
  Sparkles,
  Image,
  Video,
  Music,
  CreditCard,
  LogOut,
  Clock,
  Zap,
  ChevronRight,
  Plus,
  MessageSquare,
  Users,
  Activity,
  ExternalLink,
  Layers,
  FileText,
  Menu,
  X,
  Workflow,
  ArrowUpRight,
  ArrowDownRight,
  Coins,
  AlertCircle,
  CheckCircle2,
  Loader2,
  BarChart3,
  MessagesSquare,
  CheckCircle,
  Share2,
  MessageCircleMore,
  MonitorPlay,
  Send,
  ShieldCheck,
  Filter,
  Download,
  ReceiptText,
} from "lucide-react";

type ReviewAgencySummary = {
  id: string;
  name: string;
};

type ReviewDashboardReview = {
  id: number;
  agencyId: string;
  agencyName: string;
  rating: number;
  suggestionsCount: number;
  overallAssessment: string | null;
  createdAt: string;
};

type ReviewDashboardImprovement = {
  id: number;
  agencyId: string;
  agencyName: string;
  changeType: string;
  description: string;
  createdAt: string;
};

type ReviewDashboardData = {
  overview: {
    totalAgencies: number;
    reviewedAgencies: number;
    reviewCount: number;
    averageRating: number;
    averageObjectiveAlignment: number;
    reviewCoverage: number;
  };
  recentReviews: ReviewDashboardReview[];
  recentImprovements: ReviewDashboardImprovement[];
};

type AnalyticsSummaryResponse = {
  period: {
    start: string;
    end: string;
    days: number;
  };
  usage: {
    total_requests: number;
    total_credits: number;
    total_cost_usd: number;
    avg_credits_per_request: number;
    avg_cost_per_request_usd: number;
  };
  payments: {
    total_paid_usd: number;
    total_credits_purchased: number;
    payment_count: number;
  };
  by_provider: Record<
    string,
    {
      requests: number;
      credits: number;
      cost_usd: number;
    }
  >;
  by_model: Record<
    string,
    {
      requests: number;
      credits: number;
      cost_usd: number;
    }
  >;
  by_day: Record<
    string,
    {
      requests: number;
      credits: number;
      cost_usd: number;
    }
  >;
};

type AnalyticsTimeSeriesResponse = {
  granularity: string;
  period_days: number;
  data_points: number;
  data: Array<{
    timestamp: string;
    requests: number;
    credits: number;
    cost_usd: number;
  }>;
};

type DashboardNoticeTone = "critical" | "warning" | "positive";

type DashboardNotice = {
  key: string;
  title: string;
  detail: string;
  tone: DashboardNoticeTone;
  ctaLabel?: string;
  ctaHref?: string;
};

type DashboardShortcut = {
  label: string;
  href: string;
  icon: typeof Sparkles;
  description: string;
  color: string;
};

const consolidatedAdminOpsIds = new Set([
  "admin-overview",
  "admin-ops",
  "admin-services",
  "admin-monitoring",
  "admin-audit-logs",
  "admin-orchestration-logs",
  "admin-queues",
  "admin-queues-llm",
  "admin-queues-media",
  "admin-scheduled-jobs",
  "admin-notifications",
  "admin-alert-rules",
  "admin-docker",
  "admin-glitchtip",
  "admin-guardian",
]);

export default function Dashboard() {
  const { t, locale } = useScopedTranslation(["dashboard", "common", "media"]);
  // Subscribe to nav namespace so sidebar labels re-render on language change
  useScopedTranslation("nav");
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const { tenant, isLoading: tenantLoading } = useTenant();
  const [, setLocation] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedReviewAgencyId, setSelectedReviewAgencyId] =
    useState<string>("all");

  // Fetch real media tasks for recent activity
  const { data: mediaTasksData } = trpc.media.listTasks.useQuery(
    { limit: 10 },
    { enabled: isAuthenticated }
  );

  // Credit stats (30 days)
  const { data: creditStats } = trpc.credits.stats.useQuery(
    { days: 30 },
    { enabled: isAuthenticated }
  );

  // Recent credit transactions
  const { data: recentTransactions } = trpc.credits.history.useQuery(
    { limit: 8 },
    { enabled: isAuthenticated }
  );

  // Recent chat conversations
  const { data: chatData } = trpc.chat.listConversations.useQuery(
    { limit: 20 },
    { enabled: isAuthenticated }
  );

  // Resolve the locked personal finance conversation directly so it does not depend on pagination.
  const { data: personalFinanceConversationData } = trpc.chat.getPersonalConversation.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const createPersonalConversationMutation = trpc.chat.createPersonalConversation.useMutation();

  // Fetch active workflows
  const { data: activeWorkflows } = trpc.workflow.list.useQuery(
    { limit: 5, status: "running" },
    { enabled: isAuthenticated }
  );

  // Fetch pending approvals
  const { data: pendingApprovals } = trpc.approvals.getPending.useQuery(
    { limit: 5 },
    { enabled: isAuthenticated }
  );

  // Submit approval decision mutation
  const submitDecisionMutation = trpc.approvals.submitDecision.useMutation();

  // Menu visibility (must be before any early return to satisfy Rules of Hooks)
  const platform = detectPlatform();
  const { data: menuOverrides } =
    trpc.systemSettings.getMenuVisibility.useQuery(
      { platform: platform as "web" | "desktop" },
      { staleTime: 60_000 }
    );

  // Tenant feature flags for menu gating
  const tenantFlags = useTenantFeatureFlags();
  const isAdminLike = user?.role === "admin" || user?.role === "domain_admin";
  const desktopGovernanceEnabled =
    isAuthenticated && tenantFlags.desktopHostEnabled && isAdminLike;
  const desktopGovernanceStatus = useDesktopHostStatus(
    desktopGovernanceEnabled,
    "tenant"
  );
  const desktopGovernancePath =
    user?.role === "admin" ? "/admin/desktop-host" : "/domain-admin/desktop-host";
  const { data: agencyListData } = useAgencyList();

  const { data: agencyReviewDashboardRaw } =
    trpc.agency.reviewDashboard.useQuery(undefined, {
      enabled: isAuthenticated && !tenantLoading,
      refetchInterval: 60_000,
    });
  const agencyReviewDashboard = agencyReviewDashboardRaw as
    | ReviewDashboardData
    | undefined;

  const { data: analyticsSummary } = useQuery<AnalyticsSummaryResponse>({
    queryKey: ["dashboard-analytics-summary", user?.id],
    queryFn: async () => {
      const params = new URLSearchParams({ days: "30" });
      const response = await fetch(`/api/v1/analytics/summary?${params}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch dashboard analytics summary");
      }
      return response.json() as Promise<AnalyticsSummaryResponse>;
    },
    enabled: isAuthenticated,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const { data: analyticsTimeSeries } = useQuery<AnalyticsTimeSeriesResponse>({
    queryKey: ["dashboard-analytics-time-series", user?.id],
    queryFn: async () => {
      const params = new URLSearchParams({ days: "7", granularity: "day" });
      const response = await fetch(`/api/v1/analytics/time-series?${params}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch dashboard analytics time series");
      }
      return response.json() as Promise<AnalyticsTimeSeriesResponse>;
    },
    enabled: isAuthenticated,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [isLoading, isAuthenticated, setLocation]);

  if (isLoading || tenantLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-sky-50/30 to-slate-100/20 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-slate-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const userRole = (user.role || "user") as UserRole;
  const mainMenuItems = getResolvedMenuItems(
    userRole,
    "main",
    menuOverrides,
    tenantFlags
  );
  const adminMenuItems = getResolvedMenuItems(
    userRole,
    "admin",
    menuOverrides,
    tenantFlags
  );
  const domainMenuItems = getResolvedMenuItems(
    userRole,
    "domain-admin",
    menuOverrides,
    tenantFlags
  );
  const adminOpsMenuItems = adminMenuItems.filter(item =>
    consolidatedAdminOpsIds.has(item.id)
  );
  const adminDirectMenuItems = adminMenuItems.filter(
    item => !consolidatedAdminOpsIds.has(item.id)
  );
  const adminCommandCenterItem =
    adminMenuItems.find(item => item.id === "admin-overview") ??
    adminOpsMenuItems[0] ??
    null;
  const adminOpsSecondaryCount = Math.max(
    0,
    adminOpsMenuItems.length - (adminCommandCenterItem ? 1 : 0)
  );
  const socialSidebarItems = [
    {
      id: "social-channels",
      label: t("dashboard:socialMenu.channels"),
      icon: Share2,
      href: "/social/channels",
    },
    {
      id: "social-inbox",
      label: t("dashboard:socialMenu.inbox"),
      icon: MessageCircleMore,
      href: "/social/inbox",
    },
    {
      id: "social-publishing",
      label: t("dashboard:socialMenu.publishing"),
      icon: Send,
      href: "/social/publishing",
    },
    {
      id: "social-moderation",
      label: t("dashboard:socialMenu.moderation"),
      icon: ShieldCheck,
      href: "/social/moderation",
    },
    {
      id: "social-automation",
      label: t("dashboard:socialMenu.automation"),
      icon: Workflow,
      href: "/social/automation",
    },
  ].filter(item => !mainMenuItems.some(menuItem => menuItem.id === item.id));
  const mainMenuSectionLabels = {
    documents: t("dashboard:sections.documents"),
    social: t("dashboard:sections.social"),
  } as const;

  const formatDashboardRelativeTime = (
    value: string | Date | null | undefined
  ) => {
    if (!value) return t("dashboard:meta.justNow");

    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return t("dashboard:meta.justNow");

    return formatRelativeTime(parsed, locale);
  };

  const formatMediaTypeLabel = (value: string | null | undefined) => {
    switch (value) {
      case "image":
        return t("image");
      case "video":
        return t("video");
      case "audio":
        return t("audio");
      default:
        return t("historyPage.status.unknown");
    }
  };

  // Calculate real stats from media tasks
  const tasks = mediaTasksData?.tasks || [];
  const totalTasks = mediaTasksData?.total || 0;

  const analyticsPoints = analyticsTimeSeries?.data ?? [];
  const analyticsUsageCredits = Math.abs(
    analyticsSummary?.usage.total_credits ?? creditStats?.totalUsage ?? 0
  );
  const analyticsRequestCount =
    analyticsSummary?.usage.total_requests ??
    creditStats?.transactionCount ??
    0;
  const analyticsAvgCostPerRequest =
    analyticsSummary?.usage.avg_cost_per_request_usd ?? 0;
  const analyticsAvgCreditsPerRequest =
    analyticsSummary?.usage.avg_credits_per_request ?? 0;
  const analyticsPaidUsd = analyticsSummary?.payments.total_paid_usd ?? 0;

  const totalConversations = chatData?.total || 0;

  const stats = [
    {
      label: t("dashboard:stats.creditsAvailable"),
      value: (user.credits ?? 0).toLocaleString(),
      icon: Zap,
      color: "text-yellow-500",
      bg: "bg-yellow-50",
    },
    {
      label: t("dashboard:stats.thirtyDayUsage"),
      value: analyticsUsageCredits.toLocaleString(),
      icon: BarChart3,
      color: "text-red-500",
      bg: "bg-red-50",
      sub:
        analyticsPaidUsd > 0
          ? t("dashboard:stats.paidAmount", {
              amount: analyticsPaidUsd.toFixed(2),
            })
          : undefined,
    },
    {
      label: t("dashboard:stats.requests"),
      value: analyticsRequestCount.toLocaleString(),
      icon: MessagesSquare,
      color: "text-teal-500",
      bg: "bg-teal-50",
      sub:
        analyticsAvgCostPerRequest > 0
          ? t("dashboard:stats.averageAmount", {
              amount: analyticsAvgCostPerRequest.toFixed(3),
            })
          : undefined,
    },
    {
      label: t("dashboard:stats.recentMediaJobs"),
      value: totalTasks.toLocaleString(),
      icon: Image,
      color: "text-slate-500",
      bg: "bg-slate-100",
      sub:
        totalTasks > tasks.length
          ? t("dashboard:stats.recentShown", { count: tasks.length })
          : undefined,
    },
  ];

  const reviewOverview = agencyReviewDashboard?.overview;
  const recentReviews = agencyReviewDashboard?.recentReviews ?? [];
  const recentImprovements = agencyReviewDashboard?.recentImprovements ?? [];
  const reviewAgencies = agencyListData?.agencies ?? [];
  const selectedReviewAgency =
    selectedReviewAgencyId === "all"
      ? null
      : ((reviewAgencies as ReviewAgencySummary[]).find(
          agency => agency.id === selectedReviewAgencyId
        ) ?? null);
  const filteredRecentReviews = selectedReviewAgency
    ? recentReviews.filter(
        review => review.agencyId === selectedReviewAgency.id
      )
    : recentReviews;
  const filteredRecentImprovements = selectedReviewAgency
    ? recentImprovements.filter(
        item => item.agencyId === selectedReviewAgency.id
      )
    : recentImprovements;

  const latestActivityAt = useMemo(() => {
    const timestamps = [
      analyticsSummary?.period.end,
      analyticsPoints[analyticsPoints.length - 1]?.timestamp,
      recentTransactions?.[0]?.createdAt,
      tasks[0]?.createdAt,
      chatData?.conversations?.[0]?.updatedAt,
      reviewOverview ? recentReviews[0]?.createdAt : null,
    ].filter(Boolean) as string[];

    if (timestamps.length === 0) return null;

    const latestTimestamp =
      timestamps
        .map(timestamp => new Date(timestamp).getTime())
        .filter(timestamp => !Number.isNaN(timestamp))
        .sort((a, b) => b - a)[0] ?? null;

    return latestTimestamp ? new Date(latestTimestamp).toISOString() : null;
  }, [
    analyticsPoints,
    analyticsSummary?.period.end,
    chatData?.conversations,
    recentReviews,
    recentTransactions,
    reviewOverview,
    tasks,
  ]);

  const recentTaskStats = useMemo(() => {
    const completed = tasks.filter(task => task.status === "completed").length;
    const processing = tasks.filter(
      task => task.status === "processing"
    ).length;
    const failed = tasks.filter(task => task.status === "failed").length;
    const total = tasks.length;
    const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const attentionRatio =
      total > 0 ? Math.round(((processing + failed) / total) * 100) : 0;

    return {
      completed,
      processing,
      failed,
      total,
      successRate,
      attentionRatio,
    };
  }, [tasks]);

  const usageMomentum = useMemo(() => {
    if (analyticsPoints.length === 0) {
      return {
        label: t("dashboard:momentum.noData"),
        value: 0,
        delta: null as number | null,
        trend: "neutral" as const,
      };
    }

    const firstHalf = analyticsPoints.slice(
      0,
      Math.max(1, Math.floor(analyticsPoints.length / 2))
    );
    const secondHalf = analyticsPoints.slice(
      Math.max(1, Math.floor(analyticsPoints.length / 2))
    );
    const firstHalfAvg =
      firstHalf.reduce((sum, point) => sum + Math.abs(point.credits), 0) /
      firstHalf.length;
    const secondHalfAvg =
      secondHalf.reduce((sum, point) => sum + Math.abs(point.credits), 0) /
      secondHalf.length;
    const delta =
      firstHalfAvg > 0
        ? ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100
        : null;

    return {
      label:
        delta === null
          ? t("dashboard:momentum.insufficientHistory")
          : delta > 0
            ? t("dashboard:momentum.rising")
            : delta < 0
              ? t("dashboard:momentum.easing")
              : t("dashboard:momentum.steady"),
      value: secondHalfAvg,
      delta,
      trend:
        delta === null
          ? "neutral"
          : delta > 0
            ? "warning"
            : delta < 0
              ? "positive"
              : "neutral",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyticsPoints, t]);

  const topProvider = useMemo(() => {
    const providers = Object.entries(analyticsSummary?.by_provider ?? {})
      .map(([provider, value]) => ({ provider, ...value }))
      .sort((left, right) => right.credits - left.credits);
    return providers[0] ?? null;
  }, [analyticsSummary?.by_provider]);

  const attentionNotices = useMemo<DashboardNotice[]>(() => {
    const notices: DashboardNotice[] = [];
    const lowCreditsThreshold = 250;

    if ((pendingApprovals?.requests?.length ?? 0) > 0) {
      notices.push({
        key: "approvals",
        title: t("dashboard:notices.pendingApprovals", {
          count: pendingApprovals?.requests.length ?? 0,
        }),
        detail: t("dashboard:notices.pendingApprovalsDetail"),
        tone: "critical",
        ctaLabel: t("dashboard:notices.reviewApprovals"),
        ctaHref: "#pending-approvals",
      });
    }

    if (recentTaskStats.failed > 0) {
      notices.push({
        key: "failed-media",
        title: t("dashboard:notices.failedGenerations", {
          count: recentTaskStats.failed,
        }),
        detail: t("dashboard:notices.failedGenerationsDetail"),
        tone: "warning",
        ctaLabel: t("dashboard:notices.openMediaHistory"),
        ctaHref: "/media-history",
      });
    }

    if ((activeWorkflows?.workflows?.length ?? 0) > 0) {
      notices.push({
        key: "workflows",
        title: t("dashboard:notices.workflowsRunning", {
          count: activeWorkflows?.workflows.length ?? 0,
        }),
        detail: t("dashboard:notices.workflowsRunningDetail"),
        tone: "warning",
        ctaLabel: t("dashboard:notices.openWorkflows"),
        ctaHref: "/workflows",
      });
    }

    if ((user.credits ?? 0) <= lowCreditsThreshold) {
      notices.push({
        key: "credits",
        title: t("dashboard:notices.creditsLow"),
        detail: t("dashboard:notices.creditsLowDetail"),
        tone: "critical",
        ctaLabel: t("dashboard:notices.buyCredits"),
        ctaHref: "/credits",
      });
    }

    if (reviewOverview && reviewOverview.reviewCoverage < 0.75) {
      notices.push({
        key: "review-coverage",
        title: t("dashboard:notices.reviewCoverage"),
        detail: t("dashboard:notices.reviewCoverageDetail"),
        tone: "warning",
        ctaLabel: t("dashboard:notices.openReviewCenter"),
        ctaHref: "/agencies",
      });
    }

    if (notices.length === 0) {
      notices.push({
        key: "healthy",
        title: t("dashboard:notices.allHealthy"),
        detail: t("dashboard:notices.allHealthyDetail"),
        tone: "positive",
      });
    }

    return notices.slice(0, 4);
  }, [
    activeWorkflows?.workflows?.length,
    pendingApprovals?.requests?.length,
    recentTaskStats.failed,
    reviewOverview,
    user.credits,
  ]);

  const nextBestActions = useMemo<DashboardShortcut[]>(() => {
    const actions: DashboardShortcut[] = [];

    if (user.role === "admin" || user.role === "domain_admin") {
      actions.push({
        label: tenantFlags.desktopHostEnabled
          ? "Desktop governance"
          : t("dashboard:nextBestActions.manageDesktopReleases"),
        href: tenantFlags.desktopHostEnabled
          ? user.role === "admin"
            ? "/admin/desktop-host"
            : "/domain-admin/desktop-host"
          : "/desktop-host",
        icon: tenantFlags.desktopHostEnabled ? MonitorPlay : Download,
        description: tenantFlags.desktopHostEnabled
          ? "See enrolled desktop devices, last contact, and access restrictions."
          : t("dashboard:nextBestActions.manageDesktopReleasesDetail"),
        color: "from-slate-700 to-indigo-700",
      });
    }

    if ((pendingApprovals?.requests?.length ?? 0) > 0) {
      actions.push({
        label: t("dashboard:nextBestActions.reviewApprovals"),
        href: "#pending-approvals",
        icon: AlertCircle,
        description: t("dashboard:nextBestActions.reviewApprovalsDetail"),
        color: "from-slate-700 to-amber-700",
      });
    }

    if ((activeWorkflows?.workflows?.length ?? 0) > 0) {
      actions.push({
        label: t("dashboard:nextBestActions.openWorkflows"),
        href: "/workflows",
        icon: Workflow,
        description: t("dashboard:nextBestActions.openWorkflowsDetail"),
        color: "from-slate-700 to-sky-700",
      });
    }

    if (recentTaskStats.failed > 0) {
      actions.push({
        label: t("dashboard:nextBestActions.inspectFailures"),
        href: "/media-history",
        icon: AlertCircle,
        description: t("dashboard:nextBestActions.inspectFailuresDetail"),
        color: "from-slate-700 to-red-700",
      });
    }

    if ((user.credits ?? 0) <= 250) {
      actions.push({
        label: t("dashboard:nextBestActions.refillCredits"),
        href: "/credits",
        icon: CreditCard,
        description: t("dashboard:nextBestActions.refillCreditsDetail"),
        color: "from-slate-700 to-emerald-700",
      });
    }

    if ((chatData?.conversations?.length ?? 0) > 0) {
      actions.push({
        label: t("dashboard:nextBestActions.continueChat"),
        href: "/chat",
        icon: MessageSquare,
        description: t("dashboard:nextBestActions.continueChatDetail"),
        color: "from-slate-700 to-cyan-700",
      });
    }

    if ((analyticsSummary?.usage.total_requests ?? 0) > 0) {
      actions.push({
        label: t("dashboard:nextBestActions.inspectSpend"),
        href: "/credits",
        icon: BarChart3,
        description: t("dashboard:nextBestActions.inspectSpendDetail"),
        color: "from-slate-700 to-indigo-700",
      });
    }

    if ((reviewOverview?.reviewCoverage ?? 0) < 0.75 && reviewOverview) {
      actions.push({
        label: t("dashboard:nextBestActions.openReviewCenter"),
        href: "/agencies",
        icon: Users,
        description: t("dashboard:nextBestActions.openReviewCenterDetail"),
        color: "from-slate-700 to-blue-700",
      });
    }

    if (actions.length === 0) {
      actions.push({
        label: t("dashboard:nextBestActions.startMediaStudio"),
        href: "/media-studio",
        icon: Sparkles,
        description: t("dashboard:nextBestActions.startMediaStudioDetail"),
        color: "from-slate-700 to-slate-900",
      });
    }

    return actions.slice(0, 4);
  }, [
    activeWorkflows?.workflows?.length,
    analyticsSummary?.usage.total_requests,
    chatData?.conversations?.length,
    pendingApprovals?.requests?.length,
    recentTaskStats.failed,
    reviewOverview,
    tenantFlags.desktopHostEnabled,
    user.role,
    user.credits,
  ]);

  const desktopGovernanceSummary = useMemo(() => {
    const devices = desktopGovernanceStatus.status?.devices ?? [];
    let online = 0;
    let stale = 0;
    let restricted = 0;
    let withRoots = 0;

    for (const device of devices) {
      const presenceStatus = device.presence?.status ?? "offline";
      if (presenceStatus === "online") {
        online += 1;
      } else if (presenceStatus === "stale") {
        stale += 1;
      }

      if ((device.accessState ?? "active") !== "active") {
        restricted += 1;
      }

      if ((device.localRoots?.length ?? 0) > 0) {
        withRoots += 1;
      }
    }

    return {
      total: devices.length,
      online,
      stale,
      restricted,
      withRoots,
      reportedAt: desktopGovernanceStatus.status?.generatedAt ?? null,
    };
  }, [desktopGovernanceStatus.status]);

  const sparklineMax = useMemo(() => {
    const values = analyticsPoints.map(point => Math.abs(point.credits));
    return Math.max(1, ...values);
  }, [analyticsPoints]);

  const topRecentTransaction = recentTransactions?.[0] ?? null;
  const personalFinanceConversation = personalFinanceConversationData ?? null;
  const latestConversation = chatData?.conversations?.[0] ?? null;
  const urgentNoticeCount = attentionNotices.filter(
    notice => notice.tone !== "positive"
  ).length;
  const healthTone =
    attentionNotices[0]?.tone === "critical"
      ? "critical"
      : attentionNotices[0]?.tone === "warning"
        ? "warning"
        : "positive";
  const navigateTo = (target: string) => {
    if (target.startsWith("#")) {
      document
        .querySelector(target)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setLocation(target);
  };

  const quickActions = [
    {
      label: t("dashboard:quickActions.mediaStudio"),
      icon: Sparkles,
      href: "/media-studio",
      color: "from-slate-700 to-slate-900",
    },
    {
      label: t("dashboard:quickActions.chat"),
      icon: MessageSquare,
      href: "/chat",
      color: "from-slate-700 to-cyan-700",
    },
    {
      label: t("dashboard:quickActions.finance"),
      icon: ReceiptText,
      href: "/chat?panel=finance",
      color: "from-slate-700 to-emerald-700",
    },
    {
      label: t("dashboard:quickActions.documentManagement"),
      icon: FileText,
      href: "/document-management",
      color: "from-slate-700 to-sky-700",
    },
    {
      label: t("dashboard:quickActions.presentations"),
      icon: Layers,
      href: "/presentations",
      color: "from-slate-700 to-indigo-700",
    },
    {
      label: t("dashboard:quickActions.agencies"),
      icon: Users,
      href: "/agencies",
      color: "from-slate-700 to-blue-700",
    },
    {
      label: t("dashboard:quickActions.buyCredits"),
      icon: CreditCard,
      href: "/credits",
      color: "from-slate-700 to-emerald-700",
    },
  ];

  // Status badge config
  const statusConfig: Record<
    string,
    { label: string; bg: string; text: string; icon: typeof CheckCircle2 }
  > = {
    completed: {
      label: t("dashboard:status.completed"),
      bg: "bg-green-100",
      text: "text-green-700",
      icon: CheckCircle2,
    },
    processing: {
      label: t("dashboard:status.processing"),
      bg: "bg-blue-100",
      text: "text-blue-700",
      icon: Loader2,
    },
    pending: {
      label: t("dashboard:status.pending"),
      bg: "bg-yellow-100",
      text: "text-yellow-700",
      icon: Clock,
    },
    failed: {
      label: t("dashboard:status.failed"),
      bg: "bg-red-100",
      text: "text-red-700",
      icon: AlertCircle,
    },
    cancelled: {
      label: t("dashboard:status.cancelled"),
      bg: "bg-gray-100",
      text: "text-gray-600",
      icon: X,
    },
  };

  // Transaction type config
  const txTypeConfig: Record<
    string,
    { label: string; icon: typeof Coins; color: string }
  > = {
    usage: {
      label: t("dashboard:transactionType.usage"),
      icon: ArrowDownRight,
      color: "text-red-500",
    },
    purchase: {
      label: t("dashboard:transactionType.purchase"),
      icon: ArrowUpRight,
      color: "text-green-500",
    },
    bonus: {
      label: t("dashboard:transactionType.bonus"),
      icon: Zap,
      color: "text-yellow-500",
    },
    refund: {
      label: t("dashboard:transactionType.refund"),
      icon: ArrowUpRight,
      color: "text-blue-500",
    },
    adjustment: {
      label: t("dashboard:transactionType.adjustment"),
      icon: Coins,
      color: "text-gray-500",
    },
    subscription: {
      label: t("dashboard:transactionType.subscription"),
      icon: CreditCard,
      color: "text-slate-500",
    },
  };

  const renderMainMenuItems = (
    items: typeof mainMenuItems,
    isMobile: boolean
  ) => {
    const rows: ReactNode[] = [];
    const childItemsByParent = new Map<string, typeof items>();
    items.forEach(item => {
      if (!item.parentId) return;
      const existing = childItemsByParent.get(item.parentId) ?? [];
      existing.push(item);
      childItemsByParent.set(item.parentId, existing);
    });

    let documentsSectionRendered = false;

    items.forEach(item => {
      if (item.parentId) {
        return;
      }

      if (item.section === "documents" && !documentsSectionRendered) {
        rows.push(
          <div
            key={`${isMobile ? "mobile" : "desktop"}-section-documents`}
            className="pt-3 mt-3 border-t border-gray-200"
          >
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">
              {mainMenuSectionLabels.documents}
            </div>
          </div>
        );
        documentsSectionRendered = true;
      }

      rows.push(
        <button
          key={item.id}
          onClick={() => {
            if (item.external) {
              window.open(item.path, "_blank", "noopener,noreferrer");
            } else {
              setLocation(item.path);
            }
            if (isMobile) {
              setSidebarOpen(false);
            }
          }}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all text-sm ${
            item.id === "dashboard"
              ? "bg-gradient-to-r from-slate-700/10 to-sky-700/10 text-slate-800"
              : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          <item.IconComponent className="w-4 h-4 flex-shrink-0" />
          <span className="font-medium truncate">{item.label}</span>
          {item.external && (
            <ExternalLink className="w-3 h-3 ml-auto flex-shrink-0" />
          )}
        </button>
      );

      const childItems = childItemsByParent.get(item.id) ?? [];
      childItems.forEach(childItem => {
        rows.push(
          <button
            key={childItem.id}
            onClick={() => {
              if (childItem.external) {
                window.open(childItem.path, "_blank", "noopener,noreferrer");
              } else {
                setLocation(childItem.path);
              }
              if (isMobile) {
                setSidebarOpen(false);
              }
            }}
            className="w-full flex items-center gap-3 pl-9 pr-3 py-2 rounded-lg text-left transition-all text-sm text-gray-500 hover:bg-gray-100"
          >
            <childItem.IconComponent className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="font-medium truncate">{childItem.label}</span>
            {childItem.external && (
              <ExternalLink className="w-3 h-3 ml-auto flex-shrink-0" />
            )}
          </button>
        );
      });
    });

    return rows;
  };

  const renderAdminDirectMenuItems = (
    items: typeof adminDirectMenuItems,
    isMobile: boolean
  ) =>
    items.map(item => (
      <button
        key={item.id}
        onClick={() => {
          if (item.external) {
            window.open(item.path, "_blank", "noopener,noreferrer");
          } else {
            setLocation(item.path);
          }
          if (isMobile) {
            setSidebarOpen(false);
          }
        }}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left text-slate-600 hover:bg-slate-100 text-sm transition-colors"
      >
        <item.IconComponent className="w-4 h-4 flex-shrink-0" />
        <span className="font-medium truncate">{item.label}</span>
        {item.external && (
          <ExternalLink className="w-3 h-3 ml-auto flex-shrink-0" />
        )}
      </button>
    ));

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_28%),radial-gradient(circle_at_85%_12%,rgba(14,165,233,0.10),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(15,23,42,0.06),transparent_26%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-300/70 to-transparent" />
      <div className="pointer-events-none absolute -left-24 top-32 h-72 w-72 rounded-full bg-sky-400/10 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-1/3 h-80 w-80 rounded-full bg-indigo-400/8 blur-3xl" />
      {/* Mobile menu button */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="fixed top-4 left-4 z-50 lg:hidden rounded-2xl border border-slate-200/80 bg-white/85 p-2.5 shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl"
      >
        <Menu className="w-5.5 h-5.5 text-slate-700" />
      </button>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-white/95 border-r border-slate-200/80 flex flex-col shadow-[0_24px_70px_rgba(15,23,42,0.12)] backdrop-blur-xl">
            <div className="flex items-center justify-between p-4">
              <span className="font-semibold text-slate-900">
                {tenant?.name || t("dashboard:title")}
              </span>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
              {renderMainMenuItems(mainMenuItems, true)}

              {socialSidebarItems.length > 0 && (
                <div className="pt-3 mt-3 border-t border-slate-200">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-3 mb-2">
                    {mainMenuSectionLabels.social}
                  </div>
                  {socialSidebarItems.map(item => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setLocation(item.href);
                        setSidebarOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left text-slate-600 hover:bg-slate-100 text-sm transition-colors"
                    >
                      <item.icon className="w-4 h-4 flex-shrink-0" />
                      <span className="font-medium truncate">{item.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {(adminCommandCenterItem || adminDirectMenuItems.length > 0) && (
                <div className="pt-3 mt-3 border-t border-slate-200">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-3 mb-2">
                    {t("common:admin")}
                  </div>
                  {adminCommandCenterItem && (
                    <div>
                      <div className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                        {t("dashboard:admin.systemMonitoring")}
                      </div>
                      <button
                        onClick={() => {
                          if (adminCommandCenterItem.external) {
                            window.open(
                              adminCommandCenterItem.path,
                              "_blank",
                              "noopener,noreferrer"
                            );
                          } else {
                            setLocation(adminCommandCenterItem.path);
                          }
                          setSidebarOpen(false);
                        }}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3 text-left transition-colors hover:bg-slate-100"
                      >
                        <div className="flex items-center gap-3 text-slate-700">
                          <adminCommandCenterItem.IconComponent className="w-4 h-4 flex-shrink-0" />
                          <span className="font-medium truncate">
                            {adminCommandCenterItem.label}
                          </span>
                          <ChevronRight className="w-4 h-4 ml-auto flex-shrink-0 text-slate-400" />
                        </div>
                        <p className="mt-2 text-xs leading-5 text-slate-500">
                          {t(
                            "dashboard:admin.systemMonitoringMobileDescription"
                          )}
                        </p>
                        {adminOpsSecondaryCount > 0 && (
                          <p className="mt-1 text-[11px] text-slate-400">
                            {t("dashboard:admin.monitoringToolsGrouped", {
                              count: adminOpsSecondaryCount,
                            })}
                          </p>
                        )}
                      </button>
                    </div>
                  )}
                  {adminDirectMenuItems.length > 0 && (
                    <div
                      className={
                        adminCommandCenterItem ? "mt-2 space-y-1" : "space-y-1"
                      }
                    >
                      <div className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                        {t("dashboard:admin.tools")}
                      </div>
                      {renderAdminDirectMenuItems(adminDirectMenuItems, true)}
                    </div>
                  )}
                </div>
              )}

              {domainMenuItems.length > 0 && (
                <div className="pt-3 mt-3 border-t border-slate-200">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-3 mb-2">
                    {user.role === "admin"
                      ? t("dashboard:admin.tenantManagement")
                      : t("dashboard:admin.domainAdmin")}
                  </div>
                  {domainMenuItems.map(item => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setLocation(item.path);
                        setSidebarOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left text-slate-600 hover:bg-slate-100 text-sm transition-colors"
                    >
                      <item.IconComponent className="w-4 h-4 flex-shrink-0" />
                      <span className="font-medium truncate">{item.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </nav>
            <div className="p-4 border-t border-gray-200">
              <div className="mb-3">
                <LocaleToggle className="w-full justify-center" />
              </div>
              <Button
                variant="ghost"
                onClick={() => {
                  logout();
                  setSidebarOpen(false);
                }}
                className="w-full justify-start text-slate-600 hover:text-red-600 text-sm"
              >
                <LogOut className="w-4 h-4 mr-3" />
                {t("dashboard:signOut")}
              </Button>
            </div>
          </aside>
        </div>
      )}

      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-white/95 backdrop-blur-xl border-r border-slate-200/80 shadow-[0_24px_70px_rgba(15,23,42,0.08)] hidden lg:flex lg:flex-col">
        <div className="flex items-center gap-3 p-6 pb-4">
          {tenant?.logoUrl ? (
            <img
              src={tenant.logoUrl}
              alt={tenant.name || t("dashboard:title")}
              className="w-10 h-10 object-contain rounded-xl"
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-sky-700 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
          )}
          <span className="text-xl font-semibold text-slate-900">
            {tenant?.name || t("dashboard:title")}
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto px-6 space-y-1">
          {renderMainMenuItems(mainMenuItems, false)}

          {socialSidebarItems.length > 0 && (
            <div className="pt-3 mt-3 border-t border-slate-200">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-3 mb-2">
                {mainMenuSectionLabels.social}
              </div>
              {socialSidebarItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => setLocation(item.href)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all text-slate-600 hover:bg-slate-100 text-sm"
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  <span className="font-medium truncate">{item.label}</span>
                </button>
              ))}
            </div>
          )}

          {(adminCommandCenterItem || adminDirectMenuItems.length > 0) && (
            <div className="pt-3 mt-3 border-t border-slate-200">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-3 mb-2">
                {t("common:admin")}
              </div>
              {adminCommandCenterItem && (
                <div>
                  <div className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    {t("dashboard:admin.systemMonitoring")}
                  </div>
                  <button
                    onClick={() => {
                      if (adminCommandCenterItem.external) {
                        window.open(
                          adminCommandCenterItem.path,
                          "_blank",
                          "noopener,noreferrer"
                        );
                      } else {
                        setLocation(adminCommandCenterItem.path);
                      }
                    }}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3 text-left transition-all hover:bg-slate-100"
                  >
                    <div className="flex items-center gap-3 text-slate-700">
                      <adminCommandCenterItem.IconComponent className="w-4 h-4 flex-shrink-0" />
                      <span className="font-medium truncate">
                        {adminCommandCenterItem.label}
                      </span>
                      <ChevronRight className="w-4 h-4 ml-auto flex-shrink-0 text-slate-400" />
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      {t("dashboard:admin.systemMonitoringDescription")}
                    </p>
                    {adminOpsSecondaryCount > 0 && (
                      <p className="mt-1 text-[11px] text-slate-400">
                        {t("dashboard:admin.monitoringToolsGroupedInside", {
                          count: adminOpsSecondaryCount,
                        })}
                      </p>
                    )}
                  </button>
                </div>
              )}
              {adminDirectMenuItems.length > 0 && (
                <div
                  className={
                    adminCommandCenterItem ? "mt-2 space-y-1" : "space-y-1"
                  }
                >
                  <div className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    {t("dashboard:admin.tools")}
                  </div>
                  {renderAdminDirectMenuItems(adminDirectMenuItems, false)}
                </div>
              )}
            </div>
          )}

          {domainMenuItems.length > 0 && (
            <div className="pt-3 mt-3 border-t border-slate-200">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-3 mb-2">
                {user.role === "admin"
                  ? t("dashboard:admin.tenantManagement")
                  : t("dashboard:admin.domainAdmin")}
              </div>
              {domainMenuItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => setLocation(item.path)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all text-slate-600 hover:bg-slate-100 text-sm"
                >
                  <item.IconComponent className="w-4 h-4 flex-shrink-0" />
                  <span className="font-medium truncate">{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </nav>

        <div className="p-6 pt-4 border-t border-gray-200">
          <div className="mb-3">
            <LocaleToggle className="w-full justify-center" />
          </div>
          <Button
            variant="ghost"
            onClick={logout}
            className="w-full justify-start text-slate-600 hover:text-red-600 text-sm"
          >
            <LogOut className="w-4 h-4 mr-3" />
            {t("dashboard:signOut")}
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="relative z-10 lg:ml-64 px-5 py-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-[1600px]">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-3xl font-bold text-slate-900">
                    {t("dashboard:welcome", { name: user.name.split(" ")[0] })}
                  </h1>
                  <Badge
                    variant="secondary"
                    className={`gap-1.5 border ${
                      healthTone === "critical"
                        ? "border-red-200 bg-red-50 text-red-700"
                        : healthTone === "warning"
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {healthTone === "critical"
                      ? t("dashboard:healthBadge.critical")
                      : healthTone === "warning"
                        ? t("dashboard:healthBadge.warning")
                        : t("dashboard:healthBadge.healthy")}
                    {urgentNoticeCount > 0 ? ` · ${urgentNoticeCount}` : ""}
                  </Badge>
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  {t("dashboard:subtitle")}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className={dashboardMetaPillClass}>
                    {t("dashboard:meta.updated", {
                      time: formatDashboardRelativeTime(latestActivityAt),
                    })}
                  </span>
                  <span className={dashboardMetaPillClass}>
                    {t("dashboard:meta.analyticsWindow", {
                      days: analyticsSummary?.period.days ?? 30,
                    })}
                  </span>
                  {latestConversation && (
                    <span className={dashboardMetaPillClass}>
                      {t("dashboard:meta.latestChat", {
                        time: formatDashboardRelativeTime(
                          latestConversation.updatedAt
                        ),
                      })}
                    </span>
                  )}
                  {topRecentTransaction && (
                    <span className={dashboardMetaPillClass}>
                      {t("dashboard:meta.latestCredit", {
                        time: formatDashboardRelativeTime(
                          topRecentTransaction.createdAt
                        ),
                      })}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <LocaleToggle />
                <HelpButton page="/dashboard" variant="outline" size="sm" />
                <a
                  href="/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-2.5 text-sm font-medium text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white hover:text-slate-900"
                >
                  <ExternalLink className="w-4 h-4" />
                  {t("dashboard:websitePreview")}
                </a>
              </div>
            </div>
          </motion.div>

          {/* Priority Snapshot */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="mb-8 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]"
          >
            <div className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-slate-500 via-sky-500 to-emerald-400" />
              <DashboardSectionHeader
                eyebrow={t("dashboard:prioritySnapshot.eyebrow")}
                title={t("dashboard:prioritySnapshot.title")}
                description={t("dashboard:prioritySnapshot.description")}
                trailing={
                  <Badge
                    variant="secondary"
                    className="gap-1.5 border-slate-200 bg-slate-50 px-3 py-1 text-slate-700 shadow-sm"
                  >
                    <Activity className="h-3 w-3" />
                    {urgentNoticeCount > 0
                      ? t("dashboard:prioritySnapshot.activeSignals", {
                          count: urgentNoticeCount,
                        })
                      : t("dashboard:prioritySnapshot.noBlockers")}
                  </Badge>
                }
              />

              <div className="mt-4 space-y-3">
                {attentionNotices.map(notice => {
                  const toneClass =
                    notice.tone === "critical"
                      ? "border-red-200 bg-red-50/80 text-red-700"
                      : notice.tone === "warning"
                        ? "border-amber-200 bg-amber-50/80 text-amber-700"
                        : "border-emerald-200 bg-emerald-50/80 text-emerald-700";
                  const detailClass =
                    notice.tone === "positive"
                      ? "text-emerald-600"
                      : "text-slate-600";

                  return (
                    <div
                      key={notice.key}
                      className={`rounded-2xl border p-4 shadow-sm transition-transform duration-200 hover:-translate-y-0.5 ${toneClass}`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className={dashboardCardTitleClass}>
                            {notice.title}
                          </p>
                          <p
                            className={`mt-1 ${dashboardCardDescriptionClass} ${detailClass}`}
                          >
                            {notice.detail}
                          </p>
                        </div>
                        {notice.ctaHref && notice.ctaLabel ? (
                          <Button
                            variant={
                              notice.tone === "positive" ? "outline" : "default"
                            }
                            size="sm"
                            className={
                              notice.tone === "critical"
                                ? "bg-red-600 text-white hover:bg-red-700"
                                : notice.tone === "warning"
                                  ? "bg-amber-600 text-white hover:bg-amber-700"
                                  : ""
                            }
                            onClick={() => navigateTo(notice.ctaHref!)}
                          >
                            {notice.ctaLabel}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-slate-500 via-sky-500 to-slate-300" />
              <DashboardSectionHeader
                eyebrow={t("dashboard:nextBestActions.eyebrow")}
                title={t("dashboard:nextBestActions.title")}
                description={t("dashboard:nextBestActions.description")}
                trailing={
                  <Badge
                    variant="secondary"
                    className="gap-1 border-slate-200 bg-slate-50 text-slate-700 shadow-sm"
                  >
                    <ChevronRight className="h-3 w-3" />
                    {t("dashboard:nextBestActions.ready", {
                      count: nextBestActions.length,
                    })}
                  </Badge>
                }
              />

              <div className="mt-4 space-y-2">
                {nextBestActions.map(action => (
                  <button
                    key={action.label}
                    onClick={() => navigateTo(action.href)}
                    className="group flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white/90 px-4 py-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50"
                  >
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${action.color} shadow-sm shadow-slate-200`}
                    >
                      <action.icon className="h-5 w-5 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={dashboardCardTitleClass}>{action.label}</p>
                      <p className={`mt-0.5 ${dashboardCardDescriptionClass}`}>
                        {action.description}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-700" />
                  </button>
                ))}
              </div>
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.09 }}
            className="mb-8"
          >
            <FinanceAccessGate>
              <FinanceHub
                surface="dashboard"
                compact
                conversationId={personalFinanceConversation?.id ?? null}
                onCreatePersonalChat={async () => {
                  const created = await createPersonalConversationMutation.mutateAsync({
                    title: t("dashboard:finance.title"),
                  });
                  navigateTo(`/chat?c=${created.id}&panel=finance`);
                }}
                onOpenFinancePanel={() => navigateTo("/chat?panel=finance")}
              />
            </FinanceAccessGate>
          </motion.section>

          {desktopGovernanceEnabled && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.09 }}
              className="mb-8"
            >
              <div className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-slate-700 via-indigo-500 to-sky-500" />
                <DashboardSectionHeader
                  eyebrow={t("dashboard:admin.desktopGovernanceEyebrow")}
                  title={t("dashboard:admin.desktopGovernance")}
                  description={t("dashboard:admin.desktopGovernanceDescription")}
                  trailing={
                    <div className="flex flex-wrap items-center gap-2">
                      {desktopGovernanceSummary.reportedAt && (
                        <Badge
                          variant="secondary"
                          className="gap-1 border-slate-200 bg-slate-50 text-slate-700 shadow-sm"
                        >
                          <Clock className="h-3 w-3" />
                          {t("dashboard:admin.desktopGovernanceLastCheck", {
                            time: formatDashboardRelativeTime(
                              desktopGovernanceSummary.reportedAt
                            ),
                          })}
                        </Badge>
                      )}
                      <Button
                        size="sm"
                        onClick={() => navigateTo(desktopGovernancePath)}
                      >
                        {t("dashboard:admin.desktopGovernanceOpen")}
                      </Button>
                    </div>
                  }
                />

                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                      {t("dashboard:admin.desktopGovernanceDevices")}
                    </p>
                    <div className="mt-2 flex items-end gap-2">
                      <span className="text-2xl font-semibold text-slate-900">
                        {desktopGovernanceSummary.total}
                      </span>
                    </div>
                    <p className={`mt-2 ${dashboardCardBodyClass}`}>
                      {t("dashboard:admin.desktopGovernanceDevicesDescription")}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                      {t("dashboard:admin.desktopGovernanceConnected")}
                    </p>
                    <div className="mt-2 flex items-end gap-2">
                      <span className="text-2xl font-semibold text-slate-900">
                        {desktopGovernanceStatus.isLoading
                          ? "…"
                          : desktopGovernanceSummary.online}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                        {t("dashboard:admin.desktopGovernanceStale", {
                          count: desktopGovernanceSummary.stale,
                        })}
                      </span>
                    </div>
                    <p className={`mt-2 ${dashboardCardBodyClass}`}>
                      {t("dashboard:admin.desktopGovernanceConnectedDescription")}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                      {t("dashboard:admin.desktopGovernanceRestricted")}
                    </p>
                    <div className="mt-2 flex items-end gap-2">
                      <span className="text-2xl font-semibold text-slate-900">
                        {desktopGovernanceStatus.isLoading
                          ? "…"
                          : desktopGovernanceSummary.restricted}
                      </span>
                    </div>
                    <p className={`mt-2 ${dashboardCardBodyClass}`}>
                      {t("dashboard:admin.desktopGovernanceRestrictedDescription")}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                      {t("dashboard:admin.desktopGovernanceRoots")}
                    </p>
                    <div className="mt-2 flex items-end gap-2">
                      <span className="text-2xl font-semibold text-slate-900">
                        {desktopGovernanceStatus.isLoading
                          ? "…"
                          : desktopGovernanceSummary.withRoots}
                      </span>
                    </div>
                    <p className={`mt-2 ${dashboardCardBodyClass}`}>
                      {t("dashboard:admin.desktopGovernanceRootsDescription")}
                    </p>
                  </div>
                </div>

                {desktopGovernanceStatus.error ? (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-800">
                    {t("dashboard:admin.desktopGovernanceUnavailable")}
                  </div>
                ) : null}
              </div>
            </motion.section>
          )}

          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-8"
          >
            <DesktopReleasePanel variant="dashboard" enabled={isAuthenticated} />
          </motion.section>

          {/* Trend & Health */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14 }}
            className="mb-8 rounded-[28px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl"
          >
            <DashboardSectionHeader
              eyebrow={t("dashboard:trendHealth.eyebrow")}
              title={t("dashboard:trendHealth.title")}
              description={t("dashboard:trendHealth.description")}
              trailing={
                <Badge
                  variant="secondary"
                  className="gap-1.5 border-slate-200 bg-slate-50 px-3 py-1 text-slate-700 shadow-sm"
                >
                  <Clock className="h-3 w-3" />
                  {latestActivityAt
                    ? t("dashboard:trendHealth.updated", {
                        time: formatDashboardRelativeTime(latestActivityAt),
                      })
                    : t("dashboard:trendHealth.liveView")}
                </Badge>
              }
            />

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                  {t("dashboard:stats.usageMomentum")}
                </p>
                <div className="mt-2 flex items-end gap-2">
                  <span className="text-2xl font-semibold text-slate-900">
                    {usageMomentum.delta === null
                      ? "—"
                      : `${usageMomentum.delta > 0 ? "+" : ""}${usageMomentum.delta.toFixed(0)}%`}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      usageMomentum.trend === "critical"
                        ? "bg-red-100 text-red-700"
                        : usageMomentum.trend === "warning"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {usageMomentum.label}
                  </span>
                </div>
                <p className={`mt-2 ${dashboardCardBodyClass}`}>
                  {analyticsPoints.length > 0
                    ? t("dashboard:stats.datapoints", {
                        count: analyticsPoints.length,
                      })
                    : t("dashboard:stats.noDatapoints")}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                  {t("dashboard:stats.costPerRequest")}
                </p>
                <div className="mt-2 flex items-end gap-2">
                  <span className="text-2xl font-semibold text-slate-900">
                    ${analyticsAvgCostPerRequest.toFixed(3)}
                  </span>
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">
                    {t("dashboard:stats.creditsAverage", {
                      count: Math.round(
                        analyticsAvgCreditsPerRequest
                      ).toLocaleString(),
                    })}
                  </span>
                </div>
                <p className={`mt-2 ${dashboardCardBodyClass}`}>
                  {t("dashboard:stats.requestsInWindow", {
                    count: analyticsRequestCount.toLocaleString(),
                  })}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                  {t("dashboard:stats.recentMediaSuccess")}
                </p>
                <div className="mt-2 flex items-end gap-2">
                  <span className="text-2xl font-semibold text-slate-900">
                    {recentTaskStats.total > 0
                      ? `${recentTaskStats.successRate}%`
                      : "—"}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                    {t("dashboard:stats.completedRatio", {
                      completed: recentTaskStats.completed,
                      total: recentTaskStats.total || 0,
                    })}
                  </span>
                </div>
                <p className={`mt-2 ${dashboardCardBodyClass}`}>
                  {t("dashboard:stats.recentQueueSummary", {
                    processing: recentTaskStats.processing,
                    failed: recentTaskStats.failed,
                  })}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className={dashboardCardTitleClass}>
                    {t("dashboard:trendHealth.sparklineTitle")}
                  </p>
                  <p className={dashboardCardDescriptionClass}>
                    {t("dashboard:trendHealth.creditBarHint")}
                  </p>
                </div>
                {topProvider && (
                  <Badge
                    variant="outline"
                    className="border-slate-200 bg-slate-50 text-slate-700"
                  >
                    {t("dashboard:trendHealth.topProvider", {
                      provider: topProvider.provider,
                    })}
                  </Badge>
                )}
              </div>
              {analyticsPoints.length > 0 ? (
                <div className="mt-4 flex h-28 items-end gap-2">
                  {analyticsPoints.map(point => {
                    const height = Math.max(
                      8,
                      Math.round((Math.abs(point.credits) / sparklineMax) * 100)
                    );
                    return (
                      <div
                        key={point.timestamp}
                        className="flex h-full flex-1 flex-col items-center justify-end gap-2"
                      >
                        <div className="flex w-full flex-1 items-end">
                          <div
                            className="w-full rounded-t-xl bg-gradient-to-t from-slate-700 via-sky-500 to-emerald-400 shadow-md shadow-sky-500/15"
                            style={{ height: `${height}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-slate-400">
                          {new Date(point.timestamp).toLocaleDateString(
                            locale,
                            { weekday: "short" }
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  {t("dashboard:trendHealth.noData")}
                </div>
              )}
            </div>
          </motion.section>

          {/* Stats Grid */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8"
          >
            {stats.map((stat, index) => (
              <DashboardStatCard
                key={index}
                icon={stat.icon}
                value={stat.value}
                label={stat.label}
                iconContainerClassName={stat.bg}
                iconClassName={stat.color}
                badge={
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-1 text-xs font-medium text-slate-500 sm:px-2">
                    {user.plan.toUpperCase()}
                  </span>
                }
                subLabel={
                  "sub" in stat && stat.sub ? (
                    <span className="rounded bg-slate-50 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                      {stat.sub}
                    </span>
                  ) : undefined
                }
              />
            ))}
          </motion.div>

          {agencyReviewDashboard && (
            <section className="mb-8 grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
              <div className="rounded-[28px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
                <DashboardSectionHeader
                  eyebrow={t("dashboard:review.eyebrow")}
                  title={t("dashboard:review.improvementLoop")}
                  description={t("dashboard:review.description")}
                  trailing={
                    <Badge
                      variant="secondary"
                      className="self-start gap-1 border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700 shadow-sm"
                    >
                      <Activity className="h-3 w-3" />
                      {reviewOverview?.reviewCoverage
                        ? t("dashboard:review.coverage", {
                            percent: Math.round(
                              reviewOverview.reviewCoverage * 100
                            ),
                          })
                        : t("dashboard:review.noReviewsYet")}
                    </Badge>
                  }
                  titleClassName={dashboardCardTitleLgClass}
                />

                <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <Filter className="h-4 w-4" />
                    <label htmlFor="agency-review-filter">
                      {t("dashboard:filterByAgency")}
                    </label>
                  </div>
                  <select
                    id="agency-review-filter"
                    value={selectedReviewAgencyId}
                    onChange={e => setSelectedReviewAgencyId(e.target.value)}
                    className="min-w-[220px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none ring-0 focus:border-slate-400"
                  >
                    <option value="all">{t("dashboard:allAgencies")}</option>
                    {reviewAgencies.map((agency: any) => (
                      <option key={agency.id} value={agency.id}>
                        {agency.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    {
                      label: t("dashboard:review.metrics.agencies"),
                      value: reviewOverview?.totalAgencies ?? 0,
                      tone: "from-white to-slate-50/80",
                    },
                    {
                      label: t("dashboard:review.metrics.reviewed"),
                      value: reviewOverview?.reviewedAgencies ?? 0,
                      tone: "from-white to-slate-50/80",
                    },
                    {
                      label: t("dashboard:review.metrics.averageRating"),
                      value: reviewOverview
                        ? reviewOverview.averageRating.toFixed(1)
                        : "0.0",
                      tone: "from-white to-slate-50/80",
                    },
                    {
                      label: t("dashboard:review.metrics.averageAlignment"),
                      value: reviewOverview
                        ? `${Math.round(reviewOverview.averageObjectiveAlignment * 100)}%`
                        : "0%",
                      tone: "from-white to-slate-50/80",
                    },
                  ].map(metric => (
                    <div
                      key={metric.label}
                      className={`rounded-2xl border border-slate-200 bg-gradient-to-br ${metric.tone} p-4 shadow-sm`}
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                        {metric.label}
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-slate-900">
                        {metric.value}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-5">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <p className={dashboardCardTitleLgClass}>
                        {t("dashboard:review.recentReviews")}
                      </p>
                      <p className={dashboardCardDescriptionClass}>
                        {selectedReviewAgency
                          ? t("dashboard:review.latestForAgency", {
                              name: selectedReviewAgency.name,
                            })
                          : t("dashboard:review.latestAcrossTenant")}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLocation("/agencies")}
                    >
                      {t("dashboard:review.agencies")}
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {filteredRecentReviews.length > 0 ? (
                      filteredRecentReviews.map(review => (
                        <div
                          key={review.id}
                          className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 px-4 py-4 shadow-sm"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p
                                className={
                                  dashboardCardTitleClass + " truncate"
                                }
                              >
                                {review.agencyName}
                              </p>
                              <Badge
                                variant="secondary"
                                className="border-slate-200 bg-slate-50 text-slate-700 text-xs px-2 py-0.5"
                              >
                                {review.rating}/5
                              </Badge>
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                              {review.overallAssessment ||
                                t("dashboard:review.manualReviewCompleted")}
                            </p>
                          </div>
                          <div className="shrink-0 space-y-2 text-right text-xs leading-5 text-slate-500">
                            <div>
                              <p>
                                {formatDashboardRelativeTime(review.createdAt)}
                              </p>
                              <p>
                                {t("dashboard:review.suggestions", {
                                  count: review.suggestionsCount,
                                })}
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1.5 border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                              onClick={() =>
                                setLocation(
                                  `/agencies/${review.agencyId}/review`
                                )
                              }
                            >
                              {t("dashboard:review.open")}
                              <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-4 text-sm text-slate-500">
                        {selectedReviewAgency
                          ? t("dashboard:review.noneForAgency", {
                              name: selectedReviewAgency.name,
                            })
                          : t("dashboard:review.noneYet")}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
                <DashboardSectionHeader
                  eyebrow={t("dashboard:review.recentImprovementsEyebrow")}
                  title={t("dashboard:review.appliedChanges")}
                  description={t(
                    "dashboard:review.recentImprovementsDescription"
                  )}
                  trailing={
                    <Badge
                      variant="secondary"
                      className="border-slate-200 bg-slate-50 text-slate-700"
                    >
                      <Sparkles className="h-3 w-3" />
                      {recentImprovements.length}
                    </Badge>
                  }
                  titleClassName={dashboardCardTitleLgClass}
                />

                <div className="mt-5 space-y-2">
                  {filteredRecentImprovements.length > 0 ? (
                    filteredRecentImprovements.map(item => (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p
                              className={dashboardCardTitleClass + " truncate"}
                            >
                              {item.agencyName}
                            </p>
                            <p className={dashboardCardDescriptionClass}>
                              {item.description}
                            </p>
                          </div>
                          <div className="shrink-0 flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className="border-slate-200 bg-white text-slate-700"
                            >
                              {item.changeType}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1.5 px-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                              onClick={() =>
                                setLocation(`/agencies/${item.agencyId}/review`)
                              }
                            >
                              {t("dashboard:review.center")}
                              <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-slate-400">
                          {formatDashboardRelativeTime(item.createdAt)}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-4 text-sm text-slate-500">
                      {selectedReviewAgency
                        ? t("dashboard:review.noImprovementForAgency", {
                            name: selectedReviewAgency.name,
                          })
                        : t("dashboard:review.noHistory")}
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Workspace Shortcuts */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-8"
          >
            <DashboardSectionHeader
              eyebrow={t("dashboard:quickActions.eyebrow")}
              title={t("dashboard:quickActions.titleAttr")}
              description={t("dashboard:quickActions.description")}
              trailing={
                <p className="hidden max-w-md text-right text-sm leading-6 text-slate-500 lg:block">
                  {t("dashboard:quickActions.subtitle")}
                </p>
              }
              titleClassName={`mt-1 ${dashboardCardTitleXlClass}`}
            />
            <p className="mb-4 text-sm leading-6 text-slate-500 lg:hidden">
              {t("dashboard:quickActions.subtitle")}
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {quickActions.map((action, index) => (
                <button
                  key={index}
                  onClick={() => setLocation(action.href)}
                  className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-5 text-left shadow-[0_18px_45px_rgba(15,23,42,0.06)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_26px_60px_rgba(15,23,42,0.10)]"
                >
                  <div
                    className={`absolute inset-0 bg-gradient-to-br ${action.color} opacity-0 transition-opacity duration-300 group-hover:opacity-[0.08]`}
                  />
                  <div
                    className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${action.color} flex items-center justify-center mb-4 shadow-lg shadow-black/10`}
                  >
                    <action.icon className="w-6 h-6 text-white" />
                  </div>
                  <div className={dashboardCardTitleClass}>{action.label}</div>
                  <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-slate-600" />
                </button>
              ))}
            </div>
          </motion.div>

          {/* Workflow and Approvals Grid */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8"
          >
            {/* Active Workflows Section */}
            <div className="rounded-[28px] border border-slate-200/80 bg-white/90 p-6 shadow-[0_18px_45px_rgba(15,23,42,0.06)] backdrop-blur-xl">
              <DashboardSectionHeader
                eyebrow={t("dashboard:activeWorkflows.eyebrow")}
                title={t("dashboard:activeWorkflows.title")}
                description={t("dashboard:activeWorkflows.description")}
                trailing={
                  activeWorkflows?.workflows &&
                  activeWorkflows.workflows.length > 0 ? (
                    <Badge
                      variant="secondary"
                      className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm"
                    >
                      {t("dashboard:activeWorkflows.running", {
                        count: activeWorkflows.workflows.length,
                      })}
                    </Badge>
                  ) : null
                }
              />
              <div className="mt-4">
                {activeWorkflows?.workflows &&
                activeWorkflows.workflows.length > 0 ? (
                  <div className="space-y-3">
                    {activeWorkflows.workflows.map((workflow: any) => (
                      <JobCard
                        key={workflow.execution_id}
                        executionId={workflow.execution_id}
                        workflowName={workflow.workflow_name}
                        initialStatus={workflow.status}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-500">
                    <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className={dashboardCardTitleClass}>
                      {t("dashboard:activeWorkflows.empty")}
                    </p>
                    <p className={`mt-1 ${dashboardCardDescriptionClass}`}>
                      {t("dashboard:activeWorkflows.emptyHint")}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Pending Approvals Section */}
            <div
              id="pending-approvals"
              className="rounded-[28px] border border-slate-200/80 bg-white/90 p-6 shadow-[0_18px_45px_rgba(15,23,42,0.06)] backdrop-blur-xl"
            >
              <DashboardSectionHeader
                eyebrow={t("dashboard:pendingApprovals.eyebrow")}
                title={t("dashboard:pendingApprovals.title")}
                description={t("dashboard:pendingApprovals.description")}
                trailing={
                  pendingApprovals?.requests &&
                  pendingApprovals.requests.length > 0 ? (
                    <Badge
                      variant="secondary"
                      className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm"
                    >
                      {t("dashboard:pendingApprovals.pendingCount", {
                        count: pendingApprovals.requests.length,
                      })}
                    </Badge>
                  ) : null
                }
              />

              <div className="mt-4">
                {pendingApprovals?.requests &&
                pendingApprovals.requests.length > 0 ? (
                  <div className="space-y-3">
                    {pendingApprovals.requests.map((request: any) => (
                      <div
                        key={request.id}
                        className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className={dashboardCardTitleClass}>
                              {request.title}
                            </p>
                            {request.description && (
                              <p
                                className={`mt-1 ${dashboardCardDescriptionClass}`}
                              >
                                {request.description}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-2">
                              <span
                                className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                  request.risk_level === "high"
                                    ? "bg-red-100 text-red-600"
                                    : "bg-amber-100 text-amber-600"
                                }`}
                              >
                                {request.request_type}
                              </span>
                              {request.expires_at && (
                                <span className="text-xs text-slate-500">
                                  {t("dashboard:pendingApprovals.expires", {
                                    time: new Date(
                                      request.expires_at
                                    ).toLocaleString(locale),
                                  })}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2 ml-4">
                            <Button
                              onClick={() => {
                                submitDecisionMutation.mutate({
                                  requestId: request.id,
                                  decision: "approved",
                                });
                              }}
                              variant="default"
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 text-white"
                            >
                              {t("dashboard:workflow.approve")}
                            </Button>
                            <Button
                              onClick={() => {
                                submitDecisionMutation.mutate({
                                  requestId: request.id,
                                  decision: "rejected",
                                });
                              }}
                              variant="destructive"
                              size="sm"
                            >
                              {t("dashboard:workflow.reject")}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-500">
                    <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className={dashboardCardTitleClass}>
                      {t("dashboard:pendingApprovals.empty")}
                    </p>
                    <p className={`mt-1 ${dashboardCardDescriptionClass}`}>
                      {t("dashboard:pendingApprovals.emptyHint")}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* Two-column layout: Recent Activity + Sidebar */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8"
          >
            {/* Recent Media Generations */}
            <div className="lg:col-span-2">
              <DashboardSectionHeader
                eyebrow={t("dashboard:recentMedia.eyebrow")}
                title={t("dashboard:recentMedia.title")}
                description={t("dashboard:recentMedia.description")}
                trailing={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLocation("/media-history")}
                    className="text-slate-700"
                  >
                    {t("dashboard:recentMedia.viewAll")}{" "}
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                }
                titleClassName={dashboardCardTitleXlClass}
              />
              <div className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/90 shadow-[0_18px_45px_rgba(15,23,42,0.06)] backdrop-blur-xl">
                {tasks.length === 0 ? (
                  <div className="p-6 text-center text-slate-400">
                    <Image className="w-10 h-10 mx-auto mb-3 opacity-50" />
                    <p className={dashboardCardDescriptionClass}>
                      {t("dashboard:recentMedia.empty")}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 text-slate-700"
                      onClick={() => setLocation("/media-studio")}
                    >
                      {t("dashboard:recentMedia.cta")}
                    </Button>
                  </div>
                ) : (
                  tasks.slice(0, 6).map((task, index) => {
                    const sc =
                      statusConfig[task.status] || statusConfig.pending;
                    const StatusIcon = sc.icon;
                    const typeIcon =
                      task.mediaType === "image"
                        ? Image
                        : task.mediaType === "video"
                          ? Video
                          : Music;
                    const TypeIcon = typeIcon;
                    const typeBg =
                      task.mediaType === "image"
                        ? "bg-sky-100 text-sky-600"
                        : task.mediaType === "video"
                          ? "bg-blue-100 text-blue-600"
                          : "bg-orange-100 text-orange-600";

                    return (
                      <div
                        key={task.id || index}
                        className={`flex items-center gap-4 px-4 py-3 transition-colors hover:bg-slate-50/70 ${
                          index !== Math.min(tasks.length, 6) - 1
                            ? "border-b border-gray-100"
                            : ""
                        }`}
                      >
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${typeBg}`}
                        >
                          <TypeIcon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div
                            className={dashboardCardTitleClass + " truncate"}
                          >
                            {task.prompt?.slice(0, 60) ||
                              t("dashboard:recentMedia.generatedType", {
                                type: formatMediaTypeLabel(task.mediaType),
                              })}
                          </div>
                          <div className={dashboardMetaLineClass}>
                            <span>{formatMediaTypeLabel(task.mediaType)}</span>
                            <span className="text-slate-300">|</span>
                            <span className="font-mono text-slate-600">
                              {task.model || t("unknownModel")}
                            </span>
                            {(task.creditsUsed ?? 0) > 0 && (
                              <>
                                <span className="text-slate-300">|</span>
                                <span className="flex items-center gap-0.5 text-amber-600">
                                  <Zap className="w-3 h-3" />{" "}
                                  {task.creditsUsed ?? 0}
                                </span>
                              </>
                            )}
                            <span className="text-slate-300">|</span>
                            <span>
                              {formatDashboardRelativeTime(task.createdAt)}
                            </span>
                          </div>
                        </div>
                        <span
                          className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full flex-shrink-0 ${sc.bg} ${sc.text}`}
                        >
                          <StatusIcon
                            className={`w-3 h-3 ${task.status === "processing" ? "animate-spin" : ""}`}
                          />
                          {sc.label}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Sidebar: Recent Conversations */}
            <div>
              <DashboardSectionHeader
                eyebrow={t("dashboard:recentChats.eyebrow")}
                title={t("dashboard:recentChats.title")}
                description={t("dashboard:recentChats.description")}
                trailing={
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="secondary"
                      className="border-slate-200 bg-slate-50 text-slate-700"
                    >
                      {t("dashboard:recentChats.totalCount", {
                        count: totalConversations,
                      })}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setLocation("/chat")}
                      className="text-slate-700 text-xs px-2"
                    >
                      {t("dashboard:recentChats.open")}{" "}
                      <ChevronRight className="w-3 h-3 ml-0.5" />
                    </Button>
                  </div>
                }
              />
              <div className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/90 shadow-[0_18px_45px_rgba(15,23,42,0.06)] backdrop-blur-xl">
                {!chatData?.conversations ||
                chatData.conversations.length === 0 ? (
                  <div className="p-6 text-center text-slate-400">
                    <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className={dashboardCardDescriptionClass}>
                      {t("dashboard:recentChats.empty")}
                    </p>
                  </div>
                ) : (
                  chatData.conversations.slice(0, 5).map((conv, index) => (
                    <button
                      key={conv.id}
                      onClick={() => setLocation("/chat")}
                      className={`w-full text-left px-4 py-3 transition-colors hover:bg-slate-50/70 ${
                        index !== Math.min(chatData.conversations.length, 5) - 1
                          ? "border-b border-gray-100"
                          : ""
                      }`}
                    >
                      <div className={dashboardCardTitleClass + " truncate"}>
                        {conv.title || t("dashboard:recentChats.untitled")}
                      </div>
                      <div className={dashboardMetaLineClass}>
                        <span>
                          {t("dashboard:recentChats.messageCount", {
                            count: conv.messageCount,
                          })}
                        </span>
                        {Number(conv.totalCreditsUsed) > 0 && (
                          <>
                            <span className="text-slate-300">|</span>
                            <span className="flex items-center gap-0.5 text-amber-600">
                              <Zap className="w-3 h-3" />{" "}
                              {Math.round(Number(conv.totalCreditsUsed))}
                            </span>
                          </>
                        )}
                        <span className="text-slate-300">|</span>
                        <span>
                          {formatDashboardRelativeTime(conv.updatedAt)}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </motion.div>

          {/* Credit Transactions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mb-8"
          >
            <DashboardSectionHeader
              eyebrow={t("dashboard:creditTransactions.eyebrow")}
              title={t("dashboard:creditTransactions.title")}
              description={t("dashboard:creditTransactions.description")}
              trailing={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLocation("/credits")}
                  className="text-slate-700"
                >
                  {t("dashboard:recentMedia.viewAll")}{" "}
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              }
              titleClassName={dashboardCardTitleXlClass}
            />
            <div className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/90 shadow-[0_18px_45px_rgba(15,23,42,0.06)] backdrop-blur-xl">
              {!recentTransactions || recentTransactions.length === 0 ? (
                <div className="p-6 text-center text-slate-400">
                  <Coins className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p className={dashboardCardDescriptionClass}>
                    {t("dashboard:creditTransactions.empty")}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {recentTransactions.slice(0, 6).map((tx: any) => {
                    const tc = txTypeConfig[tx.type] || txTypeConfig.adjustment;
                    const TxIcon = tc.icon;
                    const isPositive = tx.amount > 0;
                    return (
                      <div
                        key={tx.id}
                        className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-slate-50/70"
                      >
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                            isPositive ? "bg-green-100" : "bg-red-50"
                          }`}
                        >
                          <TxIcon className={`w-4 h-4 ${tc.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div
                            className={dashboardCardTitleClass + " truncate"}
                          >
                            {tx.description || tc.label}
                          </div>
                          <div className={dashboardMetaLineClass}>
                            <span className="capitalize">{tc.label}</span>
                            {tx.balanceAfter !== undefined &&
                              tx.balanceAfter !== null && (
                                <>
                                  <span className="text-slate-300">|</span>
                                  <span className={dashboardMetaPillClass}>
                                    {t(
                                      "dashboard:creditTransactions.balanceAfter",
                                      {
                                        balance: Number(
                                          tx.balanceAfter
                                        ).toLocaleString(),
                                      }
                                    )}
                                  </span>
                                </>
                              )}
                            {tx.metadata?.model && (
                              <>
                                <span className="text-slate-300">|</span>
                                <span className="font-mono text-slate-600">
                                  {tx.metadata.model}
                                </span>
                              </>
                            )}
                            <span className="text-slate-300">|</span>
                            <span>
                              {formatDashboardRelativeTime(tx.createdAt)}
                            </span>
                          </div>
                        </div>
                        <div
                          className={`text-sm font-semibold leading-6 flex-shrink-0 ${isPositive ? "text-green-600" : "text-red-500"}`}
                        >
                          {isPositive ? "+" : ""}
                          {tx.amount.toLocaleString()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>

          {/* Floating Action Button */}
          <button className="fixed bottom-8 right-8 w-14 h-14 bg-gradient-to-r from-slate-700 to-slate-900 rounded-full shadow-lg shadow-slate-500/20 flex items-center justify-center text-white hover:shadow-xl hover:shadow-slate-500/30 transition-all duration-300 lg:hidden">
            <Plus className="w-6 h-6" />
          </button>
        </div>
      </main>
    </div>
  );
}
