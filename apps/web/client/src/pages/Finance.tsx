import { useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { motion } from "framer-motion";
import { BarChart3, ChevronLeft, MessageSquare, Sparkles, Wallet } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HelpButton } from "@/components/help";
import { LocaleToggle } from "@/components/LocaleToggle";
import { FinanceHub } from "@/components/finance/FinanceHub";
import FinanceAccessGate from "@/components/finance/FinanceAccessGate";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";

function resolveConversationId(search: string, fallbackId: number | null): number | null {
  const params = new URLSearchParams(search);
  const raw = params.get("c");
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallbackId;
}

export default function FinancePage() {
  const { t } = useScopedTranslation(["dashboard", "common", "nav"]);
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();

  const personalConversationQuery = trpc.chat.getPersonalConversation.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const createPersonalConversationMutation = trpc.chat.createPersonalConversation.useMutation({
    onSuccess: (conversation) => {
      setLocation(`/finance?c=${conversation.id}`);
    },
  });

  const conversationId = useMemo(
    () => resolveConversationId(search, personalConversationQuery.data?.id ?? null),
    [personalConversationQuery.data?.id, search],
  );

  const handleCreatePersonalChat = async () => {
    await createPersonalConversationMutation.mutateAsync({
      title: t("dashboard:finance.title"),
    });
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.12),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.10),_transparent_28%),linear-gradient(180deg,_#f8fbff_0%,_#f7fafc_45%,_#eef2ff_100%)]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1560px] flex-col px-4 py-4 md:px-6 md:py-6">
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 rounded-[28px] border border-white/70 bg-white/85 px-5 py-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="rounded-full bg-sky-100 px-3 py-1 text-sky-800 hover:bg-sky-100">
                  <Wallet className="mr-1 h-3.5 w-3.5" />
                  {t("dashboard:finance.eyebrow")}
                </Badge>
                <Badge variant="outline" className="rounded-full border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
                  <Sparkles className="mr-1 h-3.5 w-3.5" />
                  {t("dashboard:finance.page.personalBadge", "Personal finance")}
                </Badge>
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
                {t("dashboard:finance.page.title", "Finance workspace")}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
                {t(
                  "dashboard:finance.page.description",
                  "Track income, expenses, receipts, recurring items, and monthly trends in a single private workspace."
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <LocaleToggle className="hidden sm:inline-flex" />
              <HelpButton page="/finance" variant="outline" size="sm" />
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setLocation("/finance/reports")}
              >
                <BarChart3 className="h-4 w-4" />
                {t("dashboard:finance.page.reportsButton", "Reports")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-2"
                onClick={() => setLocation("/chat?panel=finance")}
              >
                <MessageSquare className="h-4 w-4" />
                {t("dashboard:finance.page.backToChat", "Open chat")}
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
              {t("dashboard:finance.page.badge1", "Voice input")}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
              {t("dashboard:finance.page.badge2", "OCR receipts")}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
              {t("dashboard:finance.page.badge3", "Monthly report")}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
              {t("dashboard:finance.page.badge4", "Private vault")}
            </span>
          </div>
        </motion.header>

        <FinanceAccessGate className="flex-1">
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 }}
            className="flex-1"
          >
            <FinanceHub
              surface="page"
              conversationId={conversationId}
              onCreatePersonalChat={handleCreatePersonalChat}
              onOpenFinancePanel={() => setLocation("/chat?panel=finance")}
            />
          </motion.section>
        </FinanceAccessGate>

        <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
          <Button variant="ghost" size="sm" className="gap-2 px-0 text-slate-600" onClick={() => setLocation("/dashboard")}>
            <ChevronLeft className="h-4 w-4" />
            {t("common.back")}
          </Button>
          <span>{t("dashboard:finance.page.footer", "Private finance workspace")}</span>
          <span className="opacity-0">.</span>
        </div>
      </div>
    </div>
  );
}
