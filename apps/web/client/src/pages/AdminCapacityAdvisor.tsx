import { Activity, ArrowLeft, Gauge, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { CapacityAdvisorPanel } from "@/components/admin/CapacityAdvisorPanel";

/**
 * Dedicated decision surface for Admin capacity reviews.
 *
 * Keep this separate from Server Monitoring: Monitoring answers "what is
 * unhealthy right now?", while this page answers "is the current Home Server
 * still adequate and what should we do next?".
 */
export default function AdminCapacityAdvisor() {
  const [, setLocation] = useLocation();

  return (
    <main className="min-h-screen bg-slate-50/70 text-slate-950">
      <div className="border-b bg-white">
        <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={() => setLocation("/admin/dashboard")}
              aria-label="กลับไป Command Center"
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Command Center
            </Button>
            <div className="hidden h-7 w-px bg-border sm:block" />
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                <Gauge className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
                  Admin Capacity Advisor
                </p>
                <h1 className="truncate text-xl font-bold sm:text-2xl">
                  ประเมินความพร้อมของระบบ
                </h1>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span>
              คำแนะนำเท่านั้น · ระบบไม่เปลี่ยนโครงสร้างพื้นฐานอัตโนมัติ
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mb-6 rounded-3xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-indigo-50 p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <Activity className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" />
            <div>
              <h2 className="font-semibold text-slate-900">
                หน้านี้ใช้ตอบคำถามอะไร?
              </h2>
              <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">
                ดูว่าระบบ Home Server ยังรองรับการใช้งานปัจจุบันหรือไม่
                โดยเริ่มจาก
                <span className="font-semibold text-slate-900">
                  {" "}
                  คำตัดสินและสิ่งที่ควรทำต่อ{" "}
                </span>
                ก่อน แล้วค่อยเปิดรายละเอียด CPU, RAM, พื้นที่จัดเก็บ, temporary
                files, queue และงานเบื้องหลังเมื่อจำเป็น
              </p>
            </div>
          </div>
        </div>

        <CapacityAdvisorPanel />
      </div>
    </main>
  );
}
