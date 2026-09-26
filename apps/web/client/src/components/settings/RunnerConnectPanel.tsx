import { ArrowRight, ShieldCheck } from "lucide-react";

/** Compatibility shell for settings surfaces that still reference the old panel. */
export function RunnerConnectPanel() {
  return (
    <section className="rounded-2xl border border-violet-200 bg-white p-6 shadow-sm">
      <header className="flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 text-violet-700">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <section>
          <h2 className="text-xl font-semibold text-slate-950">
            เชื่อมต่อ SmartAIHub Runner
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            เปิดจาก Runner แล้วกดยอมรับบนหน้าที่ผ่านการ login
            ระบบจะจัดการการเชื่อมต่อให้อัตโนมัติ
          </p>
          <a
            href="/runners/connect"
            className="mt-4 inline-flex items-center rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800"
          >
            เปิดหน้าการเชื่อมต่อ Runner
            <ArrowRight className="ml-2 h-4 w-4" />
          </a>
        </section>
      </header>
    </section>
  );
}
