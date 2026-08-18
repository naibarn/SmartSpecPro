import { useMemo, useState } from "react";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

export default function McpAgentPairingApprove() {
  const { user } = useAuth();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const pairingId = params.get("pairing_id") ?? "";
  const userCode = params.get("user_code") ?? "";
  const [state, setState] = useState<"idle" | "working" | "approved" | "error">("idle");
  const [message, setMessage] = useState("");

  async function approve() {
    setState("working");
    setMessage("");
    try {
      const response = await fetch("/api/mcp/pairing/approve", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pairing_id: pairingId, user_code: userCode }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error?.message || "อนุมัติการเชื่อมต่อไม่สำเร็จ");
      setState("approved");
      setMessage("อนุมัติแล้ว กลับไปที่ Hermes ได้เลย");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "อนุมัติการเชื่อมต่อไม่สำเร็จ");
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-12 text-slate-900">
      <section className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-full bg-sky-100 p-3 text-sky-700"><ShieldCheck className="h-6 w-6" /></div>
          <div>
            <h1 className="text-2xl font-semibold">เชื่อมต่อ Hermes กับ SmartAIHub</h1>
            <p className="text-sm text-slate-500">บัญชี: {user?.email || user?.name || "บัญชีที่ login อยู่"}</p>
          </div>
        </div>
        <p className="mb-6 text-sm leading-6 text-slate-600">Hermes จะได้รับสิทธิ์เฉพาะที่แสดงในคำขอ และ token จะถูกผูกกับอุปกรณ์นี้ ไม่ใช่ cookie หรือรหัสผ่านของคุณ</p>
        <div className="mb-6 rounded-xl bg-slate-50 p-4 text-sm">
          <div>รหัสคำขอ: <span className="font-mono">{userCode || "ไม่พบรหัส"}</span></div>
          <div className="mt-1 text-slate-500">สิทธิ์จะถูกจำกัดตามการตั้งค่า MCP ของแอป</div>
        </div>
        {state === "approved" ? <div className="flex items-center gap-2 text-emerald-700"><CheckCircle2 className="h-5 w-5" />{message}</div> : <Button onClick={approve} disabled={state === "working" || (!pairingId && !userCode)}>{state === "working" ? "กำลังอนุมัติ…" : "อนุมัติและเชื่อมต่อ"}</Button>}
        {state === "error" && <p className="mt-4 text-sm text-red-600">{message}</p>}
      </section>
    </main>
  );
}
