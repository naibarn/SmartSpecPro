import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Coins, RefreshCw, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

function localDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatCredits(value: number): string {
  return `${value.toLocaleString()} เครดิต`;
}

function formatDate(value: Date | string): string {
  return new Date(value).toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function SkillRevenueReport() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const isAdmin = user?.role === "admin";
  const isTenantAdmin = user?.role === "domain_admin";
  const today = useMemo(() => new Date(), []);
  const [startDate, setStartDate] = useState(() =>
    localDateValue(new Date(today.getFullYear(), today.getMonth(), 1))
  );
  const [endDate, setEndDate] = useState(() => localDateValue(today));

  const report = trpc.skills.getRevenueReport.useQuery(
    {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      limit: 200,
    },
    { enabled: isAdmin || isTenantAdmin, staleTime: 30_000 }
  );

  if (authLoading || !user || (!isAdmin && !isTenantAdmin)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const rows = report.data?.rows ?? [];
  const summary = report.data?.summary ?? {
    runCount: 0,
    tenantCredits: 0,
    skillOwnerCredits: 0,
    totalCredits: 0,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20 px-4 py-6 sm:px-6 lg:px-8">
      <main className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/dashboard")}
              className="mb-3 -ml-2"
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              กลับ Dashboard
            </Button>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-amber-100 p-3 text-amber-700">
                <Coins className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">
                  รายได้จากการใช้ Skill
                </h1>
                <p className="text-sm text-slate-600">
                  {isAdmin
                    ? "ภาพรวมรายได้ของระบบทั้งหมด"
                    : "รายได้ของ tenant นี้จากการ run skill"}
                </p>
              </div>
            </div>
          </div>
          <Badge variant="outline" className="w-fit gap-1.5 px-3 py-1.5">
            <ShieldCheck className="h-4 w-4" />
            {isAdmin
              ? "System Admin · ทุก tenant"
              : "Tenant Admin · tenant ปัจจุบัน"}
          </Badge>
        </header>

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                ตั้งแต่วันที่
                <Input
                  type="date"
                  value={startDate}
                  onChange={event => setStartDate(event.target.value)}
                  className="mt-1"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                ถึงวันที่
                <Input
                  type="date"
                  value={endDate}
                  onChange={event => setEndDate(event.target.value)}
                  className="mt-1"
                />
              </label>
            </div>
            <Button
              variant="outline"
              onClick={() => void report.refetch()}
              disabled={report.isFetching}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${report.isFetching ? "animate-spin" : ""}`}
              />
              รีเฟรช
            </Button>
          </div>
          {report.error && (
            <p className="mt-3 text-sm text-red-600">
              โหลดรายงานไม่สำเร็จ: {report.error.message}
            </p>
          )}
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">รายได้ Tenant</p>
            <p className="mt-2 text-2xl font-bold text-blue-700">
              {formatCredits(summary.tenantCredits)}
            </p>
          </div>
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">รายได้เจ้าของ Skill</p>
            <p className="mt-2 text-2xl font-bold text-emerald-700">
              {formatCredits(summary.skillOwnerCredits)}
            </p>
          </div>
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">รวมสุทธิในช่วงเวลา</p>
            <p className="mt-2 text-2xl font-bold text-amber-700">
              {formatCredits(summary.totalCredits)}
            </p>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="flex flex-col gap-1 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">
                รายการธุรกรรมรายได้
              </h2>
              <p className="text-sm text-slate-500">
                {summary.runCount.toLocaleString()} รายการทั้งหมด · แสดง{" "}
                {rows.length.toLocaleString()} รายการ · รายการ refund
                จะแสดงเป็นยอดติดลบ
              </p>
            </div>
            {report.data?.scope === "tenant" && (
              <Badge variant="secondary">tenant scope</Badge>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">เวลา</th>
                  <th className="px-5 py-3">Skill</th>
                  <th className="px-5 py-3">ผู้รับ</th>
                  <th className="px-5 py-3 text-right">Tenant</th>
                  <th className="px-5 py-3 text-right">เจ้าของ Skill</th>
                  <th className="px-5 py-3 text-right">รวม</th>
                  <th className="px-5 py-3">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map(row => {
                  const sign = row.status === "reversed" ? -1 : 1;
                  const tenantAmount = sign * row.tenantCredits;
                  const ownerAmount = sign * row.skillOwnerCredits;
                  const totalAmount = sign * row.totalCredits;
                  return (
                    <tr key={row.id} className="align-top hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                        {formatDate(row.createdAt)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-medium text-slate-900">
                          {row.skillName || row.skillSlug}
                        </div>
                        <div className="font-mono text-xs text-slate-500">
                          {row.skillSlug}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-600">
                        <div>
                          Tenant:{" "}
                          {row.tenantOwnerName ||
                            row.tenantOwnerEmail ||
                            (row.tenantOwnerId
                              ? `#${row.tenantOwnerId}`
                              : "ไม่ระบุ")}
                        </div>
                        <div>
                          Skill:{" "}
                          {row.skillOwnerName ||
                            row.skillOwnerEmail ||
                            (row.skillOwnerId
                              ? `#${row.skillOwnerId}`
                              : "ไม่ระบุ")}
                        </div>
                        <div>tenant scope: {row.tenantId || "system"}</div>
                        <div className="font-mono text-[11px] text-slate-400">
                          run: {row.runId}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-right font-medium text-blue-700">
                        {tenantAmount > 0 ? "+" : ""}
                        {formatCredits(tenantAmount)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-right font-medium text-emerald-700">
                        {ownerAmount > 0 ? "+" : ""}
                        {formatCredits(ownerAmount)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-right font-semibold text-amber-700">
                        {totalAmount > 0 ? "+" : ""}
                        {formatCredits(totalAmount)}
                      </td>
                      <td className="px-5 py-4">
                        <Badge
                          variant={
                            row.status === "reversed"
                              ? "destructive"
                              : "outline"
                          }
                        >
                          {row.status === "reversed" ? "Refunded" : "Settled"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
                {!report.isLoading && rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-12 text-center text-slate-500"
                    >
                      ไม่พบรายการในช่วงเวลาที่เลือก
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
