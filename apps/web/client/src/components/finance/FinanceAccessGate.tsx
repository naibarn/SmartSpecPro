import { useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Lock, ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import {
  clearPrivateVaultAccessToken,
  setPrivateVaultAccessToken,
} from "@/lib/privateVault";
import { type FinanceVaultAccessState, useFinanceVaultAccess } from "@/components/finance/useFinanceVaultAccess";

export interface FinanceAccessGateProps {
  children: ReactNode;
  className?: string;
}

export interface FinanceAccessGateContentProps {
  access: FinanceVaultAccessState;
  children: ReactNode;
  className?: string;
  backHref?: string;
  backLabel?: string;
}

export function FinanceAccessGateContent({
  access,
  children,
  className,
  backHref,
  backLabel,
}: FinanceAccessGateContentProps) {
  const { t } = useScopedTranslation(["settings", "common"]);
  const [, setLocation] = useLocation();
  const [unlockPin, setUnlockPin] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const unlockMutation = trpc.users.unlockPrivateVault.useMutation({
    onSuccess: (result) => {
      const token = String(result.token);
      setPrivateVaultAccessToken(token);
      access.setPrivateVaultTokenState(token);
      setUnlockPin("");
      setUnlockError(null);
      toast.success(t("privateVault.unlocked"));
    },
    onError: (error) => {
      const message = error.message || t("privateVault.invalidToken");
      setUnlockError(message);
      toast.error(message);
      clearPrivateVaultAccessToken();
      access.setPrivateVaultTokenState(null);
    },
  });

  const helperMessage = useMemo(() => {
    if (!access.privateVaultEnabled) {
      return t("privateVault.description");
    }
    if (unlockError) {
      return unlockError;
    }
    return t("privateVault.unlockDescription");
  }, [access.privateVaultEnabled, unlockError, t]);

  if (access.isLoading) {
    return (
      <div className={className}>
        <div className="flex min-h-[280px] items-center justify-center rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
          <div className="flex items-center gap-3 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>{t("privateVault.loading")}</span>
          </div>
        </div>
      </div>
    );
  }

  if (access.hasAccess) {
    return <>{children}</>;
  }

  return (
    <div className={className}>
      <div className="relative overflow-hidden rounded-[28px] border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-slate-50 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400" />
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-800">
              <ShieldCheck className="h-3.5 w-3.5" />
              {t("privateVault.eyebrow")}
            </div>
            <h3 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">
              {t("privateVault.unlockTitle")}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {helperMessage}
            </p>
          </div>
          <div className="flex items-center justify-center rounded-[24px] border border-amber-200 bg-white p-4 shadow-sm">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <Lock className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <Input
            type="password"
            inputMode="numeric"
            value={unlockPin}
            onChange={(event) => setUnlockPin(event.target.value.replace(/\s+/g, ""))}
            placeholder={t("privateVault.pinPlaceholder")}
            className="h-12 rounded-2xl bg-white"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                const pin = unlockPin.trim();
                if (!pin) {
                  toast.error(t("privateVault.enterPin"));
                  return;
                }
                unlockMutation.mutate({ pin });
              }}
              disabled={unlockMutation.isPending || !unlockPin.trim()}
              className="h-12 min-w-[140px] rounded-2xl bg-slate-900 px-5 text-white hover:bg-slate-800"
            >
              {unlockMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Lock className="mr-2 h-4 w-4" />
              )}
              {t("privateVault.unlock")}
            </Button>
            <Button
              variant="outline"
              className="h-12 rounded-2xl px-5"
              onClick={() => setLocation("/settings?tab=privateVault")}
            >
              {t("documentManagement.privateVault.managePin")}
            </Button>
            {backHref ? (
              <Button
                variant="ghost"
                className="h-12 rounded-2xl px-5 text-slate-700"
                onClick={() => setLocation(backHref)}
              >
                {backLabel ?? t("common.back")}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function FinanceAccessGate({ children, className }: FinanceAccessGateProps) {
  const access = useFinanceVaultAccess();
  return (
    <FinanceAccessGateContent access={access} className={className}>
      {children}
    </FinanceAccessGateContent>
  );
}

export default FinanceAccessGate;
