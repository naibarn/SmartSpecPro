import { useLocation } from "wouter";
import { CheckSquare, ChevronLeft, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard";
import { HelpButton } from "@/components/help";
import { LocaleToggle } from "@/components/LocaleToggle";
import FinanceSlipRulesPanel from "@/components/admin/FinanceSlipRulesPanel";
import { useAuth } from "@/contexts/AuthContext";

export default function AdminFinanceRules() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  if (!user || user.role !== "admin") {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
      <div className="mx-auto flex min-h-screen w-full max-w-[1560px] flex-col px-4 py-4 md:px-6 md:py-6">
        <header className="mb-4 rounded-[28px] border border-white/70 bg-white/85 px-5 py-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <Button
                variant="ghost"
                size="sm"
                className="mb-3 -ml-2 gap-2 px-0 text-slate-600 hover:bg-transparent hover:text-slate-900"
                onClick={() => setLocation("/admin/settings")}
              >
                <ChevronLeft className="h-4 w-4" />
                Back to admin settings
              </Button>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                  Merchant pins
                </span>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                  Slip mapping
                </span>
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
                Finance Rules
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
                Search merchants that already exist in the system, pin the important ones, and keep reusable slip rules in one place without mixing them into OCR routing.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <LocaleToggle className="hidden sm:inline-flex" />
              <HelpButton page="/admin/settings" variant="outline" size="sm" />
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setLocation("/admin/settings")}>
                <CheckSquare className="h-4 w-4" />
                OCR settings
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
              Search / pin merchants
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
              Slip presets
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
              No OCR keys here
            </span>
          </div>
        </header>

        <DashboardCard
          className="mb-4 overflow-hidden"
          leading={<Search className="w-5 h-5 text-blue-600" />}
          title="Merchant search & pinning"
          description="Use the full page to search existing merchants faster, review aliases, and pin the ones that should be suggested first."
          bodyClassName="p-6"
        >
          <p className="text-sm leading-6 text-slate-600">
            This page is the fastest place to manage merchant-specific suggestions. The top search area is intentionally full width so admins can scan and pin merchants without the distraction of OCR routing controls.
          </p>
        </DashboardCard>

        <div className="flex-1">
          <FinanceSlipRulesPanel />
        </div>
      </div>
    </div>
  );
}
