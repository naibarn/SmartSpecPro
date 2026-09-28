import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Loader2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";

import { DashboardCard } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { trpc } from "../../lib/trpc";

export default function VerticalDramaEnhancedRuntimeSettingsPanel() {
  const { i18n } = useTranslation();
  const isThai = i18n.resolvedLanguage?.startsWith("th") || i18n.language?.startsWith("th");
  const [enabled, setEnabled] = useState(false);
  const [authoringModelId, setAuthoringModelId] = useState("");
  const query = trpc.systemSettings.getVerticalDramaEnhancedRuntimeSettings.useQuery();
  const update = trpc.systemSettings.updateVerticalDramaEnhancedRuntimeSettings.useMutation({
    onSuccess: () => {
      toast.success(isThai ? "บันทึก Enhanced Runtime สำเร็จ" : "Enhanced Runtime settings saved");
      void query.refetch();
    },
    onError: error => toast.error(error.message),
  });
  const approve = trpc.systemSettings.approveVerticalDramaEnhancedRuntime.useMutation({
    onSuccess: () => {
      toast.success(isThai ? "อนุมัติ runtime ปัจจุบันแล้ว" : "Current runtime approved");
      void query.refetch();
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (!query.data) return;
    setEnabled(query.data.settings.enabled);
    setAuthoringModelId(query.data.settings.authoringModelId);
  }, [query.data]);

  const runtime = query.data?.runtime;
  const runtimeProbeReady = Boolean(
    runtime?.bridgeAvailable &&
    runtime.manifestHash &&
    runtime.manifestHash !== "unknown" &&
    runtime.sdkVersion &&
    runtime.sdkVersion !== "unknown" &&
    runtime.adapterVersion &&
    runtime.adapterVersion !== "unknown",
  );

  return (
    <DashboardCard
      className="mb-6 overflow-hidden border-violet-200"
      title={isThai ? "Vertical Drama Enhanced Runtime" : "Vertical Drama Enhanced Runtime"}
      description={isThai
        ? "ตั้งค่าผ่าน UI/ฐานข้อมูลเท่านั้น ไม่อ่าน configuration ของ Enhanced จาก .env"
        : "UI/database-managed configuration. Enhanced does not use .env configuration."}
      leading={<ShieldCheck className="h-5 w-5 text-violet-600" />}
    >
      {query.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <section className="space-y-4">
          <label className="flex items-center justify-between gap-4 rounded-lg border border-violet-100 bg-violet-50/50 px-4 py-3">
            <span>
              <span className="block text-sm font-medium">{isThai ? "เปิดใช้งาน Enhanced Runtime" : "Enable Enhanced Runtime"}</span>
              <span className="block text-xs text-muted-foreground">{isThai ? "เป็น platform kill switch; tenant flags ยังต้องเปิดแยก" : "Platform kill switch; tenant rollout flags are still required separately."}</span>
            </span>
            <Switch checked={enabled} onCheckedChange={setEnabled} disabled={update.isPending} />
          </label>

          <section className="space-y-2">
            <Label htmlFor="vertical-drama-enhanced-authoring-model">
              {isThai ? "Prompt Authoring Model (Vision + Structured Output)" : "Prompt Authoring Model (Vision + Structured Output)"}
            </Label>
            <Select value={authoringModelId || undefined} onValueChange={setAuthoringModelId}>
              <SelectTrigger id="vertical-drama-enhanced-authoring-model">
                <SelectValue placeholder={isThai ? "เลือกโมเดล Vision + Structured Output" : "Select a Vision + Structured Output model"} />
              </SelectTrigger>
              <SelectContent>
                {(query.data?.authoringModels ?? []).map(model => (
                  <SelectItem key={`${model.provider}:${model.id}`} value={model.id}>
                    {model.id} · {model.provider}{model.supportsStructuredOutputs ? " · structured" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {isThai ? "ต้องรองรับทั้ง Vision และ Structured Output และแยกจาก image/video model" : "The authoring model must support Vision and Structured Output and remains separate from image/video target models."}
            </p>
          </section>

          <section className="rounded-lg border px-4 py-3 text-xs">
            <p className="mb-2 font-medium">{isThai ? "Runtime readiness" : "Runtime readiness"}</p>
            <p className="flex items-center gap-2">
              {runtime?.bridgeAvailable ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
              {isThai ? "OpenAI Agents SDK bridge" : "OpenAI Agents SDK bridge"}
            </p>
            <p className="flex items-center gap-2">
              {runtime?.manifestHashApproved ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
              {isThai ? "Skill manifest approval" : "Skill manifest approval"}
            </p>
            <p className="mt-2 font-mono text-[10px] text-muted-foreground break-all">
              SDK {runtime?.sdkVersion ?? "unknown"} · Adapter {runtime?.adapterVersion ?? "unknown"} · Manifest {runtime?.manifestHash ?? "unknown"}
            </p>
            {runtime?.manifestHash && runtime.manifestHash !== "unknown" && !runtime.bridgeAvailable ? (
              <p className="mt-2 text-amber-700">
                {isThai
                  ? "พบ skill manifest แล้ว แต่ local bridge ยังไม่พร้อม กรุณาติดตั้งด้วย uv ตามคู่มือ แล้ว restart node-api ก่อนอนุมัติ"
                  : "The skill manifest is present, but the local bridge is unavailable. Install it with uv as documented, then restart node-api before approval."}
              </p>
            ) : null}
          </section>

          <section className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => update.mutate({ enabled, authoringModelId })} disabled={update.isPending || !authoringModelId}>
              {update.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isThai ? "บันทึกการตั้งค่า" : "Save settings"}
            </Button>
            <Button type="button" variant="outline" onClick={() => approve.mutate()} disabled={approve.isPending || !runtimeProbeReady}>
              {approve.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              {isThai ? "อนุมัติ runtime ปัจจุบัน" : "Approve current runtime"}
            </Button>
          </section>
          <p className="text-xs text-amber-700">
            {isThai ? "หลังจากนี้ต้องเปิด UI/Jobs/Apply flags ของ tenant ใน Admin → Tenants → Feature Flags ด้วย" : "After this, enable the tenant UI/Jobs/Apply flags under Admin → Tenants → Feature Flags."}
          </p>
        </section>
      )}
    </DashboardCard>
  );
}
