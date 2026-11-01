import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";

export function Spec224EconomicLedgerSetup() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [debitAccountId, setDebitAccountId] = useState("");
  const [creditAccountId, setCreditAccountId] = useState("");
  const isAdmin = user?.role === "admin";
  const accountsQuery = trpc.economicControlPlane.listSpec224LedgerAccounts.useQuery(
    { currency: "USD" }, { enabled: isAdmin, retry: false },
  );
  const configure = trpc.economicControlPlane.configureSpec224LedgerAccounts.useMutation({
    onSuccess: async () => {
      toast.success("บันทึกบัญชี Ledger สำหรับ Development Run แล้ว");
      await utils.economicControlPlane.listSpec224LedgerAccounts.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const provision = trpc.economicControlPlane.provisionLedgerAccount.useMutation({
    onSuccess: async () => {
      toast.success("สร้างบัญชี Ledger ยอดเริ่มต้น 0 แล้ว");
      await utils.economicControlPlane.listSpec224LedgerAccounts.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  if (!isAdmin) return null;
  const accounts = accountsQuery.data?.accounts ?? [];
  const configured = accountsQuery.data?.configured;

  return (
    <section className="mt-3 rounded-md border border-[var(--color-border)] p-3" aria-label="SPEC-224 Ledger configuration">
      <p className="text-sm font-semibold">บัญชี Ledger สำหรับงบ Development Run (USD)</p>
      <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
        เป็นการบันทึกการสำรองงบใน Ledger ของ tenant เท่านั้น ไม่เติมเงิน ไม่เพิ่ม budget cap และไม่เรียกเก็บเงินจริง
      </p>
      {accountsQuery.isLoading ? <p className="mt-2 text-xs">กำลังตรวจบัญชี…</p> : null}
      {accountsQuery.error ? <p className="mt-2 text-xs text-rose-700" role="alert">ตรวจบัญชีไม่ได้: {accountsQuery.error.message}</p> : null}
      {configured ? <p className="mt-2 text-xs text-emerald-800" role="status">ตั้งค่าแล้ว · {configured.debitAccountId} → {configured.creditAccountId}</p> : (
        <p className="mt-2 text-xs text-amber-800" role="status">ยังไม่ได้ตั้งค่าบัญชีสำหรับ tenant นี้ จึงยังเริ่ม Run ที่มีงบไม่ได้</p>
      )}
      {accounts.length > 0 ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="text-xs">บัญชีต้นทาง (Debit)
            <select className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-background p-2" value={debitAccountId || configured?.debitAccountId || ""} onChange={event => setDebitAccountId(event.target.value)}>
              <option value="">เลือกบัญชี</option>
              {accounts.map(account => <option key={account.id} value={account.id}>{account.accountType} · {account.ownerRef} · {account.id}</option>)}
            </select>
          </label>
          <label className="text-xs">บัญชีปลายทางสำรอง (Credit)
            <select className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-background p-2" value={creditAccountId || configured?.creditAccountId || ""} onChange={event => setCreditAccountId(event.target.value)}>
              <option value="">เลือกบัญชี</option>
              {accounts.map(account => <option key={account.id} value={account.id}>{account.accountType} · {account.ownerRef} · {account.id}</option>)}
            </select>
          </label>
          <Button type="button" className="sm:col-span-2" disabled={!debitAccountId || !creditAccountId || debitAccountId === creditAccountId || configure.isPending} onClick={() => configure.mutate({ currency: "USD", debitAccountId, creditAccountId })}>
            {configure.isPending ? "กำลังบันทึก…" : "บันทึกคู่บัญชีสำหรับ tenant นี้"}
          </Button>
        </div>
      ) : null}
      {accounts.length === 0 && !accountsQuery.isLoading && !accountsQuery.error ? (
        <div className="mt-2 rounded-md bg-[var(--color-surface-secondary)] p-2 text-xs">
          <p>ยังไม่มีบัญชี USD ที่เปิดใช้งานใน tenant นี้ หากต้องการให้ระบบเตรียมบัญชีว่างสองบัญชี (ยอดเริ่มต้น 0) ให้กดสร้างด้านล่าง แล้วเลือกและบันทึกคู่บัญชี</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={provision.isPending} onClick={() => provision.mutate({ ownerType: "tenant", accountType: "spec224_reserve_debit", currency: "USD", idempotencyKey: `spec224-ledger-debit:${user?.currentTenantId ?? "tenant"}` })}>สร้างบัญชีต้นทาง · 0 USD</Button>
            <Button type="button" variant="outline" size="sm" disabled={provision.isPending} onClick={() => provision.mutate({ ownerType: "tenant", accountType: "spec224_reserve_credit", currency: "USD", idempotencyKey: `spec224-ledger-credit:${user?.currentTenantId ?? "tenant"}` })}>สร้างบัญชีพักสำรอง · 0 USD</Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
