/**
 * InviteCodeDashboard — Admin stats overview for the invite code system
 * Shows summary cards, charts, top codes, top referrers, disabled user stats
 */

import { trpc } from "@/lib/trpc";
import { useI18n } from "@/lib/i18n";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import {
  Ticket,
  Users,
  Coins,
  TrendingUp,
  ShieldAlert,
  Ban,
  CheckCircle,
  Clock,
  Trophy,
  UserCheck,
  Fingerprint,
} from "lucide-react";

const trendChartConfig: ChartConfig = {
  registrations: { label: "Registrations", color: "hsl(var(--chart-1))" },
  creditsGiven: { label: "Credits Given", color: "hsl(var(--chart-2))" },
};

const topCodesChartConfig: ChartConfig = {
  currentUses: { label: "Uses", color: "hsl(var(--chart-1))" },
};

export default function InviteCodeDashboard() {
  const { t } = useI18n();
  const { data, isLoading } = trpc.inviteCode.getStats.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!data) return null;

  const { summary, topCodes, topReferrers, dailyTrend, disabledStats, fraudDetection } = data;

  const conversionRate = summary.activeCodes > 0
    ? Math.round((summary.totalRegistrations / Math.max(summary.activeCodes, 1)) * 100) / 100
    : 0;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={Ticket}
          label={t("invite.stats.totalCodes")}
          value={summary.totalCodes}
          sub={`${summary.adminCodes} admin / ${summary.userCodes} user`}
          color="purple"
        />
        <StatCard
          icon={CheckCircle}
          label={t("invite.stats.activeCodes")}
          value={summary.activeCodes}
          sub={`${summary.expiredCodes} ${t("invite.stats.expired")} / ${summary.exhaustedCodes} ${t("invite.stats.exhausted")}`}
          color="green"
        />
        <StatCard
          icon={Users}
          label={t("invite.stats.totalRegistrations")}
          value={summary.totalRegistrations}
          sub={`~${conversionRate} ${t("invite.stats.avgPerCode")}`}
          color="blue"
        />
        <StatCard
          icon={Coins}
          label={t("invite.stats.totalBonusCredits")}
          value={(summary.totalCreditsToUsers + summary.totalCreditsToOwners).toLocaleString()}
          sub={`${summary.totalCreditsToUsers.toLocaleString()} ${t("invite.stats.toUsers")} / ${summary.totalCreditsToOwners.toLocaleString()} ${t("invite.stats.toReferrers")}`}
          color="amber"
        />
      </div>

      {/* Disabled Users + Fraud Detection */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={Ban}
          label={t("invite.stats.disabledUsers")}
          value={disabledStats.totalDisabled}
          sub={t("invite.stats.viaInviteCodes")}
          color="red"
        />
        <StatCard
          icon={Clock}
          label={t("invite.stats.inactiveDisabled")}
          value={disabledStats.inactive}
          sub={t("invite.stats.autoDisabledInactivity")}
          color="orange"
        />
        <StatCard
          icon={ShieldAlert}
          label={t("invite.stats.fraudDisabled")}
          value={disabledStats.fraud}
          sub={t("invite.stats.blockedSuspicious")}
          color="red"
        />
        <StatCard
          icon={Fingerprint}
          label={t("invite.stats.multiAccountDevices")}
          value={fraudDetection.devicesWithMultipleAccounts}
          sub={`${fraudDetection.devicesAtLimit} ${t("invite.stats.atOverLimit")}`}
          color="orange"
        />
      </div>

      {/* Registration Trend Chart */}
      {dailyTrend.length > 0 && (
        <div className="bg-white rounded-xl border p-4">
          <h4 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-purple-500" />
            {t("invite.stats.registrationTrend")}
          </h4>
          <ChartContainer config={trendChartConfig} className="h-[250px] w-full">
            <AreaChart data={dailyTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => new Date(v).toLocaleDateString("en", { month: "short", day: "numeric" })}
                fontSize={11}
              />
              <YAxis fontSize={11} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                type="monotone"
                dataKey="registrations"
                stroke="var(--color-registrations)"
                fill="var(--color-registrations)"
                fillOpacity={0.2}
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="creditsGiven"
                stroke="var(--color-creditsGiven)"
                fill="var(--color-creditsGiven)"
                fillOpacity={0.1}
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Codes by Usage */}
        {topCodes.length > 0 && (
          <div className="bg-white rounded-xl border p-4">
            <h4 className="font-semibold text-sm mb-4 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />
              {t("invite.stats.topCodes")}
            </h4>
            <ChartContainer config={topCodesChartConfig} className="h-[220px] w-full">
              <BarChart
                data={topCodes.map((c) => ({
                  name: c.label || c.code,
                  currentUses: c.currentUses,
                }))}
                layout="vertical"
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" fontSize={11} />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={100}
                  fontSize={11}
                  tickFormatter={(v) => (v.length > 12 ? v.slice(0, 12) + "..." : v)}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="currentUses" fill="var(--color-currentUses)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartContainer>
          </div>
        )}

        {/* Top Referrers */}
        {topReferrers.length > 0 && (
          <div className="bg-white rounded-xl border p-4">
            <h4 className="font-semibold text-sm mb-4 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-green-500" />
              {t("invite.stats.topReferrers")}
            </h4>
            <div className="space-y-3">
              {topReferrers.map((r, i) => (
                <div key={r.ownerId} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      i === 0 ? "bg-amber-100 text-amber-700" :
                      i === 1 ? "bg-gray-100 text-gray-700" :
                      i === 2 ? "bg-orange-100 text-orange-700" :
                      "bg-gray-50 text-gray-500"
                    }`}>
                      {i + 1}
                    </span>
                    <div>
                      <p className="font-medium">{r.ownerName || "Unknown"}</p>
                      <p className="text-xs text-gray-500">{r.ownerEmail}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{r.referralCount} {t("invite.stats.referrals")}</p>
                    {r.bonusCreditsForOwner > 0 && (
                      <p className="text-xs text-green-600">
                        +{r.referralCount * r.bonusCreditsForOwner} credits
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Empty state */}
      {summary.totalCodes === 0 && (
        <div className="text-center py-12 text-gray-500">
          <Ticket className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{t("invite.stats.noCodesYet")}</p>
          <p className="text-sm">{t("invite.stats.createFirst")}</p>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  sub: string;
  color: "purple" | "green" | "blue" | "amber" | "red" | "orange";
}) {
  const colors = {
    purple: "bg-purple-50 text-purple-600",
    green: "bg-green-50 text-green-600",
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    orange: "bg-orange-50 text-orange-600",
  };

  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 rounded-lg ${colors[color]}`}>
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-xs text-gray-500 font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{sub}</p>
    </div>
  );
}
