import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";

export function Spec224EconomicLedgerSetup({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const isAdmin = user?.role === "admin";
  const accountsQuery =
    trpc.economicControlPlane.listSpec224LedgerAccounts.useQuery(
      { currency: "USD" },
      { enabled: isAdmin, retry: false }
    );
  const ensure =
    trpc.economicControlPlane.ensureSpec224LedgerAccounts.useMutation({
      onSuccess: async result => {
        toast.success(
          result.initialized
            ? "ตั้งค่าบัญชีระบบสำหรับจองงบ Run แล้ว"
            : "บัญชีระบบสำหรับจองงบ Run พร้อมใช้งานแล้ว"
        );
        await utils.economicControlPlane.listSpec224LedgerAccounts.invalidate();
      },
      onError: error => toast.error(error.message),
    });

  if (!isAdmin) return null;
  const configured = accountsQuery.data?.configured;

  if (compact) {
    if (configured) return null;
    return (
      <section className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs" aria-label="ตั้งค่าก่อนทำงานเดิมต่อ">
        <p className="font-medium text-amber-950">ทำงานเดิมต่อไม่ได้: ต้องตั้งค่าบัญชีบันทึกงบภายในก่อน</p>
        <p className="mt-1 text-amber-900">ตั้งค่าเสร็จแล้ว ปุ่ม “ทำงานเดิมต่อ” จะกดได้ · ขั้นตอนนี้ไม่เติมหรือหักเครดิตผู้ใช้</p>
        {accountsQuery.error ? (
          <p className="mt-1 text-rose-700" role="alert">ตรวจความพร้อมไม่สำเร็จ: {accountsQuery.error.message}</p>
        ) : accountsQuery.isLoading ? (
          <p className="mt-1" role="status">กำลังตรวจความพร้อม…</p>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            disabled={ensure.isPending}
            onClick={() => ensure.mutate({ currency: "USD" })}
          >
            {ensure.isPending ? "กำลังตั้งค่า…" : "ตั้งค่าบัญชีระบบอัตโนมัติ"}
          </Button>
        )}
      </section>
    );
  }

  return (
    <section
      className="mt-3 rounded-md border border-[var(--color-border)] p-3"
      aria-label="SPEC-224 run budget accounting"
    >
      <p className="text-sm font-semibold">การบันทึกงบ Development Run</p>
      <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
        ระบบจัดการบัญชีบันทึกการจองงบภายในให้อัตโนมัติ ไม่ต้องเลือก Debit/Credit
        เอง
        บัญชีนี้ไม่ใช่กระเป๋าเครดิตผู้ใช้และไม่มีการเติมหรือหักยอดเครดิตจากขั้นตอนนี้
        การเรียกเก็บเครดิตจริงต้องอ้างอิง usage receipt
        ที่ตรวจสอบได้ผ่านระบบเครดิตหลัก ส่วน budget cap เป็นเพียงเพดานควบคุม Run
      </p>
      {accountsQuery.isLoading ? (
        <p className="mt-2 text-xs">กำลังตรวจความพร้อม…</p>
      ) : null}
      {accountsQuery.error ? (
        <p className="mt-2 text-xs text-rose-700" role="alert">
          ตรวจความพร้อมไม่ได้: {accountsQuery.error.message}
        </p>
      ) : null}
      {configured ? (
        <p className="mt-2 text-xs text-emerald-800" role="status">
          บัญชีระบบสำหรับบันทึกการจองงบพร้อมใช้งาน
        </p>
      ) : !accountsQuery.isLoading && !accountsQuery.error ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-xs text-amber-800" role="status">
            ต้องตั้งค่าบัญชีบันทึกงบภายในครั้งแรก
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={ensure.isPending}
            onClick={() => ensure.mutate({ currency: "USD" })}
          >
            {ensure.isPending ? "กำลังตั้งค่า…" : "ตั้งค่าบัญชีระบบอัตโนมัติ"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
