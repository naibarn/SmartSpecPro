/**
 * Credits Page - SmartAIHub
 * Credit management and purchase interface
 */

import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { formatNumber } from '@smartspec/shared';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { TransactionDetailDialog } from '@/components/analytics/TransactionDetailDialog';
import MyInviteCode from '@/components/user/MyInviteCode';
import { LocaleToggle } from '@/components/LocaleToggle';
import {
  DashboardCard,
  DashboardKpiCard,
  DashboardSurface,
} from '@/components/dashboard';
import { useScopedTranslation } from '@/i18n/useScopedTranslation';
import {
  Zap,
  CreditCard,
  ChevronLeft,
  ChevronDown,
  Check,
  TrendingUp,
  Clock,
  DollarSign,
  Package,
  Star,
  Sparkles,
  ArrowRight,
  Download,
  Loader2,
  RefreshCw,
  MessageCircle,
  Image,
  Film,
  Volume2,
  Database,
  Search,
  Mic,
  Globe,
  Lightbulb,
  Bell,
  Shield,
  Eye,
  Coins,
  Bot,
  type LucideIcon,
} from 'lucide-react';
import {
  CREDIT_TRANSACTION_SOURCE_TYPES,
  type CreditTransactionOriginSurface,
  type CreditTransactionSourceType,
  inferCreditTransactionSourceType,
  resolveCreditTransactionOriginSurface,
} from '@/lib/creditTransactionSource';

export default function Credits() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const { t, i18n } = useScopedTranslation('billing');
  const [, setLocation] = useLocation();
  const [selectedPackage, setSelectedPackage] = useState<number | null>(null);
  const [pendingCheckoutPackage, setPendingCheckoutPackage] = useState<any | null>(null);
  const [buyCreditsExpanded, setBuyCreditsExpanded] = useState(false);
  const [page, setPage] = useState(0);
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const pageSize = 20;

  // Fetch real data from API
  const { data: balance } = trpc.credits.balance.useQuery();
  const { data: history, isLoading: historyLoading, refetch: refetchHistory } = trpc.credits.history.useQuery({
    limit: pageSize,
    offset: page * pageSize,
    sourceType: sourceFilter ? (sourceFilter as CreditTransactionSourceType) : undefined,
  });
  const { data: usageStats } = trpc.credits.stats.useQuery({ days: 30 });
  const { data: packages, isLoading: packagesLoading } = trpc.packages.list.useQuery();
  const topupMutation = trpc.billing.createTopupCheckout.useMutation({
    onError: (error) => {
      toast.error(error.message || "ไม่สามารถสร้างรายการชำระเงินได้");
    },
  });
  type SourcePresentation = {
    label: string;
    color: string;
    icon: LucideIcon;
  };
  const sourceLabels = useMemo<Record<CreditTransactionSourceType, SourcePresentation>>(() => ({
    chat: { label: t('credits.sources.chat'), color: "bg-blue-100 text-blue-700", icon: MessageCircle },
    skill: { label: t('credits.sources.skill'), color: "bg-blue-100 text-blue-700", icon: Sparkles },
    media_image: { label: t('credits.sources.mediaImage'), color: "bg-cyan-100 text-cyan-700", icon: Image },
    media_video: { label: t('credits.sources.mediaVideo'), color: "bg-red-100 text-red-700", icon: Film },
    media_audio: { label: t('credits.sources.mediaAudio'), color: "bg-orange-100 text-orange-700", icon: Volume2 },
    indexing: { label: t('credits.sources.indexing'), color: "bg-green-100 text-green-700", icon: Database },
    rag: { label: t('credits.sources.search'), color: "bg-teal-100 text-teal-700", icon: Search },
    stt: { label: t('credits.sources.stt'), color: "bg-cyan-100 text-cyan-700", icon: Mic },
    translation: { label: t('credits.sources.translate'), color: "bg-cyan-100 text-cyan-700", icon: Globe },
    brainstorm: { label: t('credits.sources.brainstorm'), color: "bg-amber-100 text-amber-700", icon: Lightbulb },
    scheduler: { label: t('credits.sources.alert'), color: "bg-yellow-100 text-yellow-700", icon: Bell },
    admin: { label: t('credits.sources.admin'), color: "bg-gray-100 text-gray-700", icon: Shield },
    agency: { label: t('credits.sources.agency'), color: "bg-teal-100 text-teal-700", icon: Eye },
    creator_revenue: { label: t('credits.sources.creatorRevenue'), color: "bg-amber-100 text-amber-700", icon: Coins },
    other: { label: t('credits.sources.other'), color: "bg-slate-100 text-slate-700", icon: Zap },
    tts: { label: t('credits.sources.tts'), color: "bg-orange-100 text-orange-700", icon: Volume2 },
    browser_automation: { label: t('credits.sources.automation'), color: "bg-sky-100 text-sky-700", icon: Bot },
    worker_runtime: { label: t('credits.sources.workerRuntime'), color: "bg-emerald-100 text-emerald-700", icon: Bot },
    widget_chat: { label: t('credits.sources.widgetChat'), color: "bg-indigo-100 text-indigo-700", icon: MessageCircle },
    webhook_chat: { label: t('credits.sources.webhookChat'), color: "bg-violet-100 text-violet-700", icon: MessageCircle },
    webhook_trigger: { label: t('credits.sources.webhookTrigger'), color: "bg-purple-100 text-purple-700", icon: Bell },
    api_skill: { label: t('credits.sources.apiSkill'), color: "bg-fuchsia-100 text-fuchsia-700", icon: Sparkles },
    api_agency: { label: t('credits.sources.apiAgency'), color: "bg-teal-100 text-teal-700", icon: Eye },
    api_job: { label: t('credits.sources.apiJob'), color: "bg-emerald-100 text-emerald-700", icon: Bot },
    api_media: { label: t('credits.sources.apiMedia'), color: "bg-rose-100 text-rose-700", icon: Film },
    api_presentation: { label: t('credits.sources.apiPresentation'), color: "bg-sky-100 text-sky-700", icon: Image },
    api_video_project: { label: t('credits.sources.apiVideoProject'), color: "bg-red-100 text-red-700", icon: Film },
    api_chat: { label: t('credits.sources.apiChat'), color: "bg-blue-100 text-blue-700", icon: MessageCircle },
    api_mcp: { label: t('credits.sources.apiMcp'), color: "bg-lime-100 text-lime-700", icon: Bot },
  }), [t]);
  const originSurfaceLabels = useMemo<Record<CreditTransactionOriginSurface, string>>(() => ({
    media_studio: t('credits.sources.mediaStudio'),
  }), [t]);
  const getSourcePresentation = (transaction: {
    sourceType?: unknown;
    description?: unknown;
    metadata?: Record<string, unknown> | null;
    skillSlug?: unknown;
  }) => {
    const effectiveSourceType = inferCreditTransactionSourceType(transaction);
    const sourceInfo = effectiveSourceType ? sourceLabels[effectiveSourceType] : null;
    const originSurface = resolveCreditTransactionOriginSurface(transaction);
    const originLabel = originSurface ? originSurfaceLabels[originSurface] : null;

    return {
      sourceInfo,
      originLabel,
    };
  };

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation('/login');
    }
  }, [isLoading, isAuthenticated, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/20 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const handleBuyPackage = (pkg: any) => {
    setSelectedPackage(pkg.id);
    setPendingCheckoutPackage(pkg);
  };

  const handleConfirmTopupCheckout = (pkg: any, paymentMethod: "promptpay" | "card") => {
    const payload = {
      credits: Number(pkg.credits),
      basePrice: Number(pkg.priceUsd),
      currency: "THB",
      packageCode: `credit-package-${pkg.id}`,
      description: pkg.name || `Credit top-up (${pkg.credits} credits)`,
      paymentMethod,
    };
    const topupQuery = new URLSearchParams({
      view: "topup",
      credits: String(payload.credits),
      basePrice: String(payload.basePrice),
      packageCode: payload.packageCode,
      description: payload.description,
      packageLabel: pkg.name || `${pkg.credits} credits`,
      paymentMethod,
    }).toString();

    topupMutation.mutate(payload, {
      onSuccess: async (result) => {
        toast.success("สร้างรายการชำระเงินสำเร็จ");
        setPendingCheckoutPackage(null);

        const paymentUrl = result?.payment?.rawResponseJson?.paymentUrl;
        if (typeof paymentUrl === "string" && paymentUrl.trim()) {
          window.location.href = paymentUrl;
          return;
        }

        if (result?.invoice?.id) {
          setLocation(`/billing/invoices/${result.invoice.id}?${topupQuery}`);
          return;
        }

        setLocation(`/billing?${topupQuery}`);
      },
    });
  };


  // Format date and time for display
  const formatDateTime = (date: Date | string) => {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    const intlLocale = (i18n.language || 'en').startsWith('th') ? 'th-TH' : 'en-US';
    const timeStr = d.toLocaleTimeString(intlLocale, { hour: '2-digit', minute: '2-digit' });

    if (diffMins < 1) return t('credits.time.justNow');
    if (diffMins < 60) return t('credits.time.minutesAgo', { count: diffMins });
    if (diffHours < 24) return t('credits.time.hoursAgo', { count: diffHours, time: timeStr });
    if (diffDays === 1) return t('credits.time.yesterday', { time: timeStr });
    if (diffDays < 7) return t('credits.time.daysAgo', { count: diffDays, time: timeStr });
    return `${d.toLocaleDateString(intlLocale)} ${timeStr}`;
  };

  const stats = [
    {
      label: 'credits.stats.currentBalance',
      value: (balance?.credits ?? user.credits ?? 0).toString(),
      icon: Zap,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-50',
    },
    {
      label: 'credits.stats.totalPurchased',
      value: (usageStats?.totalPurchased ?? 0).toString(),
      icon: Package,
      color: 'text-blue-500',
      bgColor: 'bg-blue-50',
    },
    {
      label: 'credits.stats.transactions',
      value: (usageStats?.transactionCount ?? 0).toString(),
      icon: DollarSign,
      color: 'text-green-500',
      bgColor: 'bg-green-50',
    },
    {
      label: 'credits.stats.creditsUsed30d',
      value: (usageStats?.totalUsage ?? 0).toString(),
      icon: TrendingUp,
      color: 'text-blue-500',
      bgColor: 'bg-blue-50',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/20">
      {/* Header */}
      <header className="bg-white/70 backdrop-blur-xl border-b border-gray-200/50 sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 sm:gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation('/dashboard')}
                className="text-gray-600 px-2 sm:px-3"
              >
                <ChevronLeft className="w-5 h-5 mr-1" />
                <span className="hidden sm:inline">{t('common.back')}</span>
              </Button>
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center flex-shrink-0">
                  <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg sm:text-xl font-bold text-gray-900">{t('credits.title')}</h1>
                  <p className="text-xs sm:text-sm text-gray-500 hidden sm:block">{t('credits.description')}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <LocaleToggle className="hidden sm:inline-flex" />
              <div className="flex items-center gap-1.5 sm:gap-2 bg-yellow-50 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg">
                <Zap className="w-4 h-4 text-yellow-500" />
                <span className="font-semibold text-gray-900 text-sm sm:text-base">{user.credits ?? 0}</span>
                <span className="text-xs sm:text-sm text-gray-500">{t('credits.unit')}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 sm:px-6 lg:px-8 py-8">
        {/* Referral Code Widget */}
        <div className="mb-6">
          <MyInviteCode />
        </div>

        {/* Stats Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
        >
          {stats.map((stat, index) => (
            <DashboardKpiCard
              key={index}
              icon={stat.icon}
              value={stat.value}
              label={t(stat.label)}
              className="p-6"
              iconContainerClassName={stat.bgColor}
              iconClassName={stat.color}
            />
          ))}
        </motion.div>

        {/* Credit Packages — Collapsible */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          {/* Collapsible header */}
          <button
            className="w-full flex items-center justify-between mb-4 group cursor-pointer"
            onClick={() => setBuyCreditsExpanded(!buyCreditsExpanded)}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-white" />
              </div>
              <div className="text-left">
                <h2 className="text-2xl font-bold text-gray-900">{t('credits.buyCredits.title')}</h2>
                {!buyCreditsExpanded && (
                  <p className="text-sm text-gray-500">{t('credits.buyCredits.collapsed', { count: packages?.length ?? 0 })}</p>
                )}
                {buyCreditsExpanded && (
                  <p className="text-sm text-gray-600">{t('credits.buyCredits.descriptionExpanded')}</p>
                )}
              </div>
            </div>
            <motion.div
              animate={{ rotate: buyCreditsExpanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="w-6 h-6 text-gray-400 group-hover:text-gray-600" />
            </motion.div>
          </button>

          {/* Collapsed summary card */}
          {!buyCreditsExpanded && (
            <div
              className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 p-4 cursor-pointer hover:border-blue-200 transition-colors shadow-lg"
              onClick={() => setBuyCreditsExpanded(true)}
            >
              <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Sparkles className="w-4 h-4 text-blue-500" />
                    <span className="text-sm font-medium">{t('credits.buyCredits.browse', { count: packages?.length ?? 0 })}</span>
                  </div>
                <ArrowRight className="w-4 h-4 text-blue-400" />
              </div>
            </div>
          )}

          {/* Expandable content */}
          <motion.div
            initial={false}
            animate={{
              height: buyCreditsExpanded ? 'auto' : 0,
              opacity: buyCreditsExpanded ? 1 : 0,
            }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
          {packagesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
          ) : !packages || packages.length === 0 ? (
            <div className="text-center py-12 bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">{t('credits.buyCredits.noPackages')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 pt-2">
              {packages.map((pkg) => (
                <motion.div
                  key={pkg.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.05 }}
                  className={`relative bg-white/70 backdrop-blur-xl rounded-2xl border-2 p-4 shadow-lg transition-all cursor-pointer ${
                    selectedPackage === pkg.id
                      ? 'border-blue-500 shadow-blue-500/20'
                      : pkg.isFeatured
                      ? 'border-blue-300'
                      : 'border-white/50 hover:border-blue-200'
                  }`}
                  onClick={() => setSelectedPackage(pkg.id)}
                >
                {pkg.isFeatured && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                    <span className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5">
                      <Star className="w-2.5 h-2.5" />
                      {t('credits.buyCredits.best')}
                    </span>
                  </div>
                )}

                  <div className="text-center mb-3">
                    <div className={`w-12 h-12 mx-auto rounded-xl bg-gradient-to-br ${
                      pkg.isFeatured ? 'from-blue-500 to-cyan-500' : 'from-green-500 to-emerald-500'
                    } flex items-center justify-center mb-3`}>
                      <DollarSign className="w-6 h-6 text-white" />
                    </div>
                    <div className="text-2xl font-bold text-gray-900 mb-0.5">
                      ${pkg.priceUsd}
                    </div>
                    <div className="text-xs text-gray-500">{t('credits.buyCredits.oneTime')}</div>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center justify-center gap-1.5 text-gray-700">
                      <Zap className="w-4 h-4 text-yellow-500" />
                      <span className="text-sm font-bold">{formatNumber(pkg.credits)}</span>
                    </div>
                    <div className="text-xs text-center text-gray-500">
                      {t('credits.buyCredits.perThousand', { amount: ((pkg.pricePerCredit ?? 0) * 1000).toFixed(2) })}
                    </div>
                  </div>

                  <Button
                    size="sm"
                    className={`w-full text-xs ${
                      pkg.isFeatured
                        ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
                        : 'bg-gray-900 text-white'
                    }`}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleBuyPackage(pkg);
                    }}
                    disabled={topupMutation.isPending}
                  >
                    {topupMutation.isPending && selectedPackage === pkg.id ? (
                      <>
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        กำลังสร้างรายการ
                      </>
                    ) : (
                      <>
                        {t('credits.buyCredits.cta')}
                        <ArrowRight className="w-3 h-3 ml-1" />
                      </>
                    )}
                  </Button>
                </motion.div>
              ))}
            </div>
          )}
          </motion.div>
        </motion.div>

        {/* Creator Earnings */}
        <CreatorEarningsSection />

        {/* Transaction History */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <DashboardCard
            eyebrow={t('credits.transactionHistory.eyebrow')}
            title={t('credits.transactionHistory.title')}
            description={t('credits.transactionHistory.description')}
            trailing={(
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={sourceFilter}
                  onChange={(e) => { setSourceFilter(e.target.value); setPage(0); }}
                  className="flex-1 sm:flex-none text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="">{t('credits.transactionHistory.allSources')}</option>
                  {CREDIT_TRANSACTION_SOURCE_TYPES.map((key) => (
                    <option key={key} value={key}>{sourceLabels[key].label}</option>
                  ))}
                </select>
                <Button variant="outline" size="sm" onClick={() => refetchHistory()}>
                  <RefreshCw className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">{t('common.refresh')}</span>
                </Button>
              </div>
            )}
            bodyClassName="p-0"
          >
            {historyLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              </div>
            ) : !history || history.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">{t('credits.transactionHistory.empty')}</p>
              </div>
            ) : (
              <>
                {/* ── Mobile card list (hidden on sm+) ── */}
                <div className="sm:hidden divide-y divide-gray-100">
                  {history.map((transaction: any) => {
                    const { sourceInfo: srcInfo, originLabel } = getSourcePresentation(transaction);
                    const SrcIcon = srcInfo?.icon ?? Zap;
                    const dateStr = transaction.createdAt
                      ? new Date(transaction.createdAt).toISOString().slice(0, 10)
                      : undefined;
                    const typeBadgeClass =
                      transaction.type === 'purchase' || transaction.type === 'bonus'
                        ? 'bg-green-100 text-green-700'
                        : transaction.type === 'usage'
                        ? 'bg-blue-100 text-blue-700'
                        : transaction.type === 'refund'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-gray-100 text-gray-700';
                    return (
                      <div key={transaction.id} className="px-4 py-3 hover:bg-gray-50/50 transition-colors">
                        {/* Row 1: badges + amount */}
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${typeBadgeClass}`}>
                              {transaction.type === 'purchase' ? <><CreditCard className="w-3 h-3" /> Purchase</>
                                : transaction.type === 'usage' ? <><Zap className="w-3 h-3" /> Usage</>
                                : transaction.type === 'bonus' ? <><Sparkles className="w-3 h-3" /> Bonus</>
                                : <><Package className="w-3 h-3" /> {transaction.type}</>}
                            </span>
                            {srcInfo ? (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${srcInfo.color}`}>
                                <SrcIcon className="w-3 h-3" />
                                {originLabel ? `${srcInfo.label} • ${originLabel}` : srcInfo.label}
                              </span>
                            ) : originLabel ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                                <Zap className="w-3 h-3" />
                                {originLabel}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">&mdash;</span>
                            )}
                          </div>
                          <span className={`text-base font-bold flex-shrink-0 ${transaction.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {transaction.amount > 0 ? '+' : ''}{transaction.amount}
                          </span>
                        </div>
                        {/* Row 2: description */}
                        <div className="text-sm font-medium text-gray-900 truncate mb-1">
                          {transaction.description}
                        </div>
                        {/* Row 3: date + balance + audit */}
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>{formatDateTime(transaction.createdAt)}</span>
                          <div className="flex items-center gap-2">
                            {transaction.balanceAfter != null && (
                              <span>{t('credits.transactionHistory.balanceAfter', { balance: transaction.balanceAfter })}</span>
                            )}
                            {transaction.traceId ? (
                              <TransactionDetailDialog
                                traceId={transaction.traceId}
                                txId={transaction.id}
                                date={dateStr}
                              />
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ── Desktop table (hidden on mobile) ── */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50/50 border-b border-gray-100">
                      <tr>
                        <th className="px-4 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{t('credits.table.type')}</th>
                        <th className="px-4 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{t('credits.table.source')}</th>
                        <th className="px-4 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{t('credits.table.description')}</th>
                        <th className="px-4 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{t('credits.table.details')}</th>
                        <th className="px-4 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">{t('credits.table.credits')}</th>
                        <th className="px-4 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">{t('credits.table.balance')}</th>
                        <th className="px-4 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{t('credits.table.date')}</th>
                        <th className="px-4 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">{t('credits.table.audit')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {history.map((transaction: any) => {
                        const { sourceInfo: srcInfo, originLabel } = getSourcePresentation(transaction);
                        const SrcIcon = srcInfo?.icon ?? Zap;
                        const dateStr = transaction.createdAt
                          ? new Date(transaction.createdAt).toISOString().slice(0, 10)
                          : undefined;
                        return (
                          <tr key={transaction.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                                transaction.type === 'purchase' || transaction.type === 'bonus' ? 'bg-green-100 text-green-700'
                                  : transaction.type === 'usage' ? 'bg-blue-100 text-blue-700'
                                  : transaction.type === 'refund' ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-gray-100 text-gray-700'
                              }`}>
                              {transaction.type === 'purchase' ? <><CreditCard className="w-3 h-3" /> {t('credits.transactionType.purchase')}</>
                                : transaction.type === 'usage' ? <><Zap className="w-3 h-3" /> {t('credits.transactionType.usage')}</>
                                : transaction.type === 'bonus' ? <><Sparkles className="w-3 h-3" /> {t('credits.transactionType.bonus')}</>
                                : <><Package className="w-3 h-3" /> {t('credits.transactionType.other')}</>}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {srcInfo ? (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${srcInfo.color}`}>
                                  <SrcIcon className="w-3 h-3" />{originLabel ? `${srcInfo.label} • ${originLabel}` : srcInfo.label}
                                </span>
                              ) : originLabel ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                                  <Zap className="w-3 h-3" />{originLabel}
                                </span>
                              ) : <span className="text-xs text-gray-400">&mdash;</span>}
                            </td>
                            <td className="px-4 py-3 max-w-[280px]">
                              <span className="text-sm font-medium text-gray-900 block truncate">{transaction.description}</span>
                              {transaction.conversationTitle && (
                                <a href={`/chat/${transaction.conversationId}`} className="text-xs text-blue-600 hover:text-blue-800 mt-0.5 flex items-center gap-1 truncate">
                                  <MessageCircle className="w-3 h-3 flex-shrink-0" />
                                  <span className="truncate">{transaction.conversationTitle}</span>
                                </a>
                              )}
                              {transaction.skillSlug && !transaction.metadata?.skill && (
                                <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                                  <Sparkles className="w-3 h-3 flex-shrink-0" />{transaction.skillSlug}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {transaction.metadata && (
                                <div className="text-xs text-gray-500 space-y-0.5">
                                  {transaction.metadata.provider && <div className="flex items-center gap-1"><span className="font-medium">{t('credits.meta.provider')}:</span><span className="text-gray-700 font-semibold">{String(transaction.metadata.provider)}</span></div>}
                                  {(transaction.metadata.model || transaction.metadata.modelId) && (
                                    <div className="flex items-center gap-1">
                                      <span className="font-medium">{t('credits.meta.model')}:</span>
                                      <span className="text-gray-700">{String(transaction.metadata.model || transaction.metadata.modelId).split('/').pop()}</span>
                                    </div>
                                  )}
                                  {transaction.metadata.operation && <div className="flex items-center gap-1"><span className="font-medium">{t('credits.meta.operation')}:</span><span className="text-gray-700">{String(transaction.metadata.operation)}</span></div>}
                                  {(transaction.metadata.phase || transaction.metadata.stage) && (
                                    <div className="flex items-center gap-1">
                                      <span className="font-medium">{t('credits.meta.stage')}:</span>
                                      <span className="text-gray-700">
                                        {transaction.metadata.phase ? `P${transaction.metadata.phase}` : ""}
                                        {transaction.metadata.phase && transaction.metadata.stage ? " / " : ""}
                                        {transaction.metadata.stage ? String(transaction.metadata.stage) : ""}
                                      </span>
                                    </div>
                                  )}
                                  {(transaction.metadata.deckId || transaction.metadata.slideNumber) && (
                                    <div className="flex items-center gap-1">
                                      <span className="font-medium">{t('credits.meta.job')}:</span>
                                      <span className="text-gray-700">
                                        {transaction.metadata.deckId ? `${t('credits.meta.deck')} #${transaction.metadata.deckId}` : ""}
                                        {transaction.metadata.slideNumber ? ` • ${t('credits.meta.slide')} ${transaction.metadata.slideNumber}` : ""}
                                      </span>
                                    </div>
                                  )}
                                  {(transaction.metadata.taskId || transaction.metadata.mediaTaskId) && (
                                    <div className="flex items-center gap-1"><span className="font-medium">{t('credits.meta.task')}:</span><span className="text-gray-700">{String(transaction.metadata.taskId || transaction.metadata.mediaTaskId)}</span></div>
                                  )}
                                  {(transaction.metadata.inputTokens || transaction.metadata.tokensUsed) && (
                                    <div className="flex items-center gap-1">
                                      <span className="font-medium">{t('credits.meta.tokens')}:</span>
                                      <span className="text-gray-700">{transaction.metadata.inputTokens && transaction.metadata.outputTokens ? `${transaction.metadata.inputTokens}\u2192${transaction.metadata.outputTokens}` : transaction.metadata.tokensUsed}</span>
                                    </div>
                                  )}
                                  {transaction.metadata.skill && <div className="flex items-center gap-1"><span className="font-medium">{t('credits.meta.skill')}:</span><span className="text-gray-700">{String(transaction.metadata.skill)}</span></div>}
                                  {transaction.metadata.referenceImageCount > 0 && <div className="flex items-center gap-1"><span className="font-medium">{t('credits.meta.images')}:</span><span className="text-gray-700">{transaction.metadata.referenceImageCount}</span></div>}
                                  {transaction.metadata.mediaType && <div className="flex items-center gap-1"><span className="font-medium">{t('credits.meta.media')}:</span><span className="text-gray-700">{String(transaction.metadata.mediaType)}</span></div>}
                                  {transaction.metadata.billingBasis && (
                                    <div className="flex items-center gap-1"><span className="font-medium">{t('credits.meta.billing')}:</span><span className="text-gray-700">{String(transaction.metadata.billingBasis)}</span></div>
                                  )}
                                  {transaction.metadata.promptPreview && (
                                    <div className="flex items-start gap-1">
                                      <span className="font-medium mt-0.5">{t('credits.meta.prompt')}:</span>
                                      <span className="text-gray-700 line-clamp-2">{String(transaction.metadata.promptPreview)}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={`text-sm font-semibold ${transaction.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {transaction.amount > 0 ? '+' : ''}{transaction.amount}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="text-sm text-gray-900">{transaction.balanceAfter}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-sm text-gray-500">{formatDateTime(transaction.createdAt)}</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {transaction.traceId ? (
                                <TransactionDetailDialog traceId={transaction.traceId} txId={transaction.id} date={dateStr} />
                              ) : <span className="text-xs text-gray-300">&mdash;</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-t border-gray-100">
                  <div className="text-sm text-gray-500">
                    {t('credits.pagination.page', { page: page + 1, count: history?.length || 0 })}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}>
                      {t('common.previous')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setPage(page + 1)} disabled={!history || history.length < pageSize}>
                      {t('common.next')}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </DashboardCard>
        </motion.div>
      </main>

      <Dialog open={!!pendingCheckoutPackage} onOpenChange={(open) => !open && !topupMutation.isPending && setPendingCheckoutPackage(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>เลือกวิธีชำระเงิน</DialogTitle>
            <DialogDescription>
              เลือกช่องทางชำระสำหรับแพ็กเกจเครดิตที่คุณเลือก ระบบจะสร้างรายการชำระของ Beam ตามวิธีที่เลือก
            </DialogDescription>
          </DialogHeader>
          {pendingCheckoutPackage ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Selected package</div>
                <div className="mt-2 text-xl font-semibold text-slate-900">
                  {pendingCheckoutPackage.name || `${formatNumber(Number(pendingCheckoutPackage.credits || 0))} credits`}
                </div>
                <div className="mt-2 text-sm text-slate-600">
                  {formatNumber(Number(pendingCheckoutPackage.credits || 0))} เครดิต · ${pendingCheckoutPackage.priceUsd}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <button
                  type="button"
                  className="rounded-2xl border-2 border-cyan-300 bg-cyan-50 p-5 text-left transition hover:border-cyan-400 hover:bg-cyan-100/70"
                  onClick={() => handleConfirmTopupCheckout(pendingCheckoutPackage, "promptpay")}
                  disabled={topupMutation.isPending}
                >
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-cyan-500 p-3 text-white">
                      <Zap className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900">PromptPay QR</div>
                      <div className="text-sm text-slate-600">แนะนำสำหรับการโอนครั้งเดียว</div>
                    </div>
                  </div>
                  <div className="mt-4 text-sm text-slate-600">
                    ระบบจะสร้าง QR Code ของ Beam ให้คุณสแกนจ่ายได้ทันทีบนหน้าถัดไป
                  </div>
                </button>

                <button
                  type="button"
                  className="rounded-2xl border-2 border-slate-200 bg-white p-5 text-left transition hover:border-slate-300 hover:bg-slate-50"
                  onClick={() => handleConfirmTopupCheckout(pendingCheckoutPackage, "card")}
                  disabled={topupMutation.isPending}
                >
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-slate-900 p-3 text-white">
                      <CreditCard className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900">บัตรเครดิต / เดบิต</div>
                      <div className="text-sm text-slate-600">ไปที่หน้า Beam checkout</div>
                    </div>
                  </div>
                  <div className="mt-4 text-sm text-slate-600">
                    ระบบจะพาคุณไปหน้า Beam เพื่อกรอกข้อมูลบัตรและชำระเงินให้เสร็จ
                  </div>
                </button>
              </div>

              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  onClick={() => setPendingCheckoutPackage(null)}
                  disabled={topupMutation.isPending}
                >
                  ยกเลิก
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreatorEarningsSection() {
  const { t } = useScopedTranslation('billing');
  const { data: dashboard, isLoading } = (trpc as any).agency.getCreatorDashboard.useQuery(
    undefined,
    { staleTime: 60_000 },
  );

  if (isLoading || !dashboard || dashboard.totalSettlements === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="mb-8"
    >
      <div className="flex items-center gap-2 mb-4">
        <Coins className="w-5 h-5 text-amber-500" />
        <h2 className="text-xl font-bold text-gray-900">{t('credits.creatorEarnings.title')}</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <DashboardSurface className="p-4">
          <p className="text-sm text-muted-foreground">{t('credits.creatorEarnings.totalEarned')}</p>
          <p className="text-2xl font-bold text-amber-600">
            {formatNumber(dashboard.totalEarned)} {t('credits.unit')}
          </p>
        </DashboardSurface>
        <DashboardSurface className="p-4">
          <p className="text-sm text-muted-foreground">{t('credits.creatorEarnings.last30Days')}</p>
          <p className="text-2xl font-bold text-green-600">
            {formatNumber(dashboard.last30Days.earned)} {t('credits.unit')}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {t('credits.creatorEarnings.runs', { count: dashboard.last30Days.count })}
          </p>
        </DashboardSurface>
        <DashboardSurface className="p-4">
          <p className="text-sm text-muted-foreground">{t('credits.creatorEarnings.totalRuns')}</p>
          <p className="text-2xl font-bold">
            {formatNumber(dashboard.totalSettlements)}
          </p>
        </DashboardSurface>
      </div>
      {dashboard.byEntity.length > 0 && (
        <DashboardSurface className="mt-4 overflow-hidden">
          <div className="border-b px-4 py-2">
            <p className="text-sm font-medium text-muted-foreground">{t('credits.creatorEarnings.breakdownTitle')}</p>
          </div>
          <div className="divide-y">
            {dashboard.byEntity.slice(0, 5).map((e: any) => {
              const entityTypeKey = `credits.creatorEarnings.entities.${e.entityType}`;
              const entityTypeLabel = t(entityTypeKey);
              return (
                <div
                  key={`${e.entityType}-${e.entityId}`}
                  className="flex items-center justify-between px-4 py-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="capitalize text-muted-foreground">
                      {entityTypeLabel === entityTypeKey ? e.entityType : entityTypeLabel}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {e.entityId.slice(0, 8)}...
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-medium text-amber-600">
                      {formatNumber(e.totalEarned)} credits
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {t('credits.creatorEarnings.runs', { count: e.runCount })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </DashboardSurface>
      )}
    </motion.div>
  );
}
