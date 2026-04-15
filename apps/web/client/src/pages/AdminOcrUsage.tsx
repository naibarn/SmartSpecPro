/**
 * Admin OCR Usage Dashboard — /admin/ocr-usage
 */

import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardCard, DashboardKpiCard } from "@/components/dashboard";
import { LocaleToggle } from "@/components/LocaleToggle";
import { useAuth } from "@/_core/hooks/useAuth";
import { ChevronLeft, Loader2, TrendingUp, Zap, Clock } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function AdminOcrUsage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [days, setDays] = useState(30);
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const [tenantId, setTenantId] = useState<string>("");
  const ocrSourceLabels = useMemo<Record<string, string>>(() => ({
    library_upload: "Document Management (Upload)",
    library_replace: "Document Management (Replace)",
    finance_ocr: "Finance (Income/Expense)",
    chat_ocr: "Chat (Attachment OCR)",
    "library.ocr": "Document OCR",
    "finance.ocr": "Finance OCR",
    "chat.ocr": "Chat OCR",
    unknown: "Unknown",
  }), []);

  const { data, isLoading, refetch } = trpc.credits.adminOcrUsageSummary.useQuery({
    days,
    limit: pageSize,
    offset: page * pageSize,
    tenantId: tenantId || undefined,
  });
  const { data: tenants } = trpc.systemSettings.listTenants.useQuery();
  const { data: userDetail } = trpc.credits.adminOcrUsageUser.useQuery(
    { userId: selectedUserId ?? 0, days },
    { enabled: !!selectedUserId },
  );

  const series = useMemo(() => {
    if (!data) return [];
    if (period === "weekly") return data.weekly ?? [];
    if (period === "monthly") return data.monthly ?? [];
    return data.daily ?? [];
  }, [data, period]);
  const userSeries = useMemo(() => {
    if (!userDetail) return [];
    if (period === "weekly") return userDetail.weekly ?? [];
    if (period === "monthly") return userDetail.monthly ?? [];
    return userDetail.daily ?? [];
  }, [period, userDetail]);

  useEffect(() => {
    setPage(0);
    setSelectedUserId(null);
  }, [tenantId, days]);

  const handleExportCsv = () => {
    if (!data?.users?.length) return;

    const resolveCsvValue = (value: unknown) => {
      if (value === null || value === undefined) return "";
      const raw = String(value);
      if (raw.includes("\"") || raw.includes(",") || raw.includes("\n")) {
        return `"${raw.replace(/"/g, "\"\"")}"`;
      }
      return raw;
    };

    const rows = data.users.map((row) => [
      row.userId,
      row.name ?? "",
      row.email ?? "",
      Math.round(Number(row.credits || 0)),
      Math.round(Number(row.count || 0)),
      row.lastUsedAt ? new Date(row.lastUsedAt).toISOString() : "",
    ]);

    const header = ["userId", "name", "email", "credits", "requests", "lastUsedAt"];
    const csv = [
      header.map(resolveCsvValue).join(","),
      ...rows.map((row) => row.map(resolveCsvValue).join(",")),
    ].join("\n");

    const fileTenant = tenantId ? `tenant-${tenantId}` : "all-tenants";
    const fileDate = new Date().toISOString().slice(0, 10);
    const fileName = `ocr-usage-${fileTenant}-${days}d-${fileDate}.csv`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/20">
      <header className="bg-white/70 backdrop-blur-xl border-b border-gray-200/50 sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 sm:gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/admin/monitoring")}
                className="text-gray-600 px-2 sm:px-3"
              >
                <ChevronLeft className="w-5 h-5 mr-1" />
                <span className="hidden sm:inline">Back</span>
              </Button>
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-gray-900">OCR Usage (Admin)</h1>
                <p className="text-xs sm:text-sm text-gray-500 hidden sm:block">
                  Overview of OCR activity and credit usage across users.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <LocaleToggle className="hidden sm:inline-flex" />
              {user?.email ? (
                <span className="text-xs text-gray-500 hidden sm:inline">Signed in: {user.email}</span>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <DashboardCard
          title="Filters"
          description="Adjust the time window for OCR usage stats."
          bodyClassName="p-4 flex flex-wrap items-center gap-3"
        >
          <Input
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
            className="w-28"
          />
          <div className="min-w-[220px]">
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">All tenants</option>
              {(tenants ?? []).map((tenant) => (
                <option key={tenant.id} value={String(tenant.id)}>
                  {tenant.name}
                  {tenant.domain ? ` (${tenant.domain})` : ""}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={() => refetch()} variant="outline">Refresh</Button>
          <Button onClick={handleExportCsv} variant="outline" disabled={!data?.users?.length}>
            Export CSV
          </Button>
        </DashboardCard>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <DashboardKpiCard
            icon={Zap}
            value={data?.totals?.credits?.toString() ?? "0"}
            label={`OCR credits (${days}d)`}
            className="p-4"
            iconContainerClassName="bg-blue-50"
            iconClassName="text-blue-600"
          />
          <DashboardKpiCard
            icon={Clock}
            value={data?.totals?.count?.toString() ?? "0"}
            label={`OCR requests (${days}d)`}
            className="p-4"
            iconContainerClassName="bg-amber-50"
            iconClassName="text-amber-600"
          />
          <DashboardKpiCard
            icon={TrendingUp}
            value={
              data?.totals?.count
                ? (data.totals.credits / data.totals.count).toFixed(2)
                : "0.00"
            }
            label="Avg credits / request"
            className="p-4"
            iconContainerClassName="bg-emerald-50"
            iconClassName="text-emerald-600"
          />
        </div>

        <DashboardCard
          title="OCR Credits Trend"
          description="Credits consumed by OCR over time."
          bodyClassName="p-6"
        >
          <div className="mb-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={period === "daily" ? "default" : "outline"}
              onClick={() => setPeriod("daily")}
            >
              Daily
            </Button>
            <Button
              type="button"
              size="sm"
              variant={period === "weekly" ? "default" : "outline"}
              onClick={() => setPeriod("weekly")}
            >
              Weekly
            </Button>
            <Button
              type="button"
              size="sm"
              variant={period === "monthly" ? "default" : "outline"}
              onClick={() => setPeriod("monthly")}
            >
              Monthly
            </Button>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series}>
                <defs>
                  <linearGradient id="adminOcrCreditsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="periodStart" tickFormatter={(value) => new Date(value).toLocaleDateString()} />
                <YAxis />
                <Tooltip
                  formatter={(value: number) => Math.round(Number(value))}
                  labelFormatter={(label) => new Date(label).toLocaleString()}
                />
                <Area
                  type="monotone"
                  dataKey="credits"
                  stroke="#6366f1"
                  fill="url(#adminOcrCreditsGradient)"
                  name="credits"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </DashboardCard>

        <DashboardCard
          title="Top OCR Users"
          description="Users sorted by OCR credit usage."
          bodyClassName="p-6"
        >
          {selectedUserId && userDetail ? (
            <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-indigo-900">Selected user detail</div>
                  <div className="text-xs text-indigo-700">
                    Credits: {Math.round(Number(userDetail.totals?.credits || 0))} ·
                    Requests: {Math.round(Number(userDetail.totals?.count || 0))}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setSelectedUserId(null)}>
                  Clear selection
                </Button>
              </div>
              <div className="mt-3 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={userSeries}>
                    <defs>
                      <linearGradient id="userOcrCreditsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0f766e" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#0f766e" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="periodStart" tickFormatter={(value) => new Date(value).toLocaleDateString()} />
                    <YAxis />
                    <Tooltip
                      formatter={(value: number) => Math.round(Number(value))}
                      labelFormatter={(label) => new Date(label).toLocaleString()}
                    />
                    <Area
                      type="monotone"
                      dataKey="credits"
                      stroke="#0f766e"
                      fill="url(#userOcrCreditsGradient)"
                      name="credits"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-700">
                <div className="rounded-lg border border-indigo-100 bg-white p-3">
                  <div className="text-xs font-semibold text-slate-600 mb-2">By Source</div>
                  <div className="space-y-1">
                    {(userDetail.bySource ?? []).map((row: any) => (
                      <div key={`user-source-${row.source}`} className="flex items-center justify-between">
                        <span>{ocrSourceLabels[row.source] || row.source}</span>
                        <span className="font-medium">{Math.round(Number(row.credits || 0))}</span>
                      </div>
                    ))}
                    {(userDetail.bySource ?? []).length === 0 && (
                      <div className="text-slate-400">No OCR usage yet.</div>
                    )}
                  </div>
                </div>
                <div className="rounded-lg border border-indigo-100 bg-white p-3">
                  <div className="text-xs font-semibold text-slate-600 mb-2">By Provider</div>
                  <div className="space-y-1">
                    {(userDetail.byProvider ?? []).map((row: any) => (
                      <div key={`user-provider-${row.source}`} className="flex items-center justify-between">
                        <span>{row.source}</span>
                        <span className="font-medium">{Math.round(Number(row.credits || 0))}</span>
                      </div>
                    ))}
                    {(userDetail.byProvider ?? []).length === 0 && (
                      <div className="text-slate-400">No OCR usage yet.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading OCR usage…
            </div>
          ) : (
            <>
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b">
                      <th className="py-2 pr-4">User</th>
                      <th className="py-2 pr-4">Credits</th>
                      <th className="py-2 pr-4">Requests</th>
                      <th className="py-2 pr-4">Last Used</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.users ?? []).map((row) => (
                      <tr
                        key={`user-${row.userId}`}
                        className="border-b last:border-0 cursor-pointer hover:bg-slate-50"
                        onClick={() => setSelectedUserId(row.userId)}
                      >
                        <td className="py-2 pr-4">
                          <div className="font-medium text-slate-900">{row.name || `User #${row.userId}`}</div>
                          <div className="text-xs text-slate-500">{row.email}</div>
                        </td>
                        <td className="py-2 pr-4">{Math.round(Number(row.credits || 0))}</td>
                        <td className="py-2 pr-4">{Math.round(Number(row.count || 0))}</td>
                        <td className="py-2 pr-4">
                          {row.lastUsedAt ? new Date(row.lastUsedAt).toLocaleString() : "—"}
                        </td>
                      </tr>
                    ))}
                    {(data?.users ?? []).length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-slate-400">
                          No OCR usage recorded yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((prev) => Math.max(0, prev - 1))}
                  disabled={page === 0}
                >
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((prev) => prev + 1)}
                  disabled={(data?.users ?? []).length < pageSize}
                >
                  Next
                </Button>
                <span className="text-xs text-slate-500">Page {page + 1}</span>
              </div>
            </>
          )}
        </DashboardCard>
      </main>
    </div>
  );
}
