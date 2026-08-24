import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Loader2,
  ListChecks,
  Save,
  ServerCog,
  ShieldCheck,
  TestTube2,
} from "lucide-react";

import { trpc } from "../../lib/trpc";
import { DashboardCard } from "../dashboard";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Checkbox } from "../ui/checkbox";
import { toast } from "sonner";

type Source = "database" | "environment" | "mixed" | "not_configured";

const DEFAULT_HOSTNAMES = "smartaihub.app\nwww.smartaihub.app";

export default function PublicContactProtectionSettingsPanel() {
  const { i18n } = useTranslation();
  const isThai =
    i18n.resolvedLanguage?.startsWith("th") || i18n.language?.startsWith("th");
  const utils = trpc.useUtils();
  const settingsQuery =
    trpc.systemSettings.publicContactProtection.get.useQuery();
  const updateMutation =
    trpc.systemSettings.publicContactProtection.update.useMutation({
      onSuccess: async () => {
        await Promise.all([
          settingsQuery.refetch(),
          utils.feedback.publicContactConfig.invalidate(),
        ]);
        toast.success(
          isThai
            ? "บันทึกการป้องกันฟอร์มสำเร็จ"
            : "Public contact protection saved"
        );
      },
      onError: error => {
        toast.error(error.message);
      },
    });

  const [siteKey, setSiteKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [allowedHostnames, setAllowedHostnames] = useState(DEFAULT_HOSTNAMES);
  const [clearSecret, setClearSecret] = useState(false);

  useEffect(() => {
    const settings = settingsQuery.data;
    if (!settings) return;
    setSiteKey(settings.siteKey);
    setAllowedHostnames(settings.allowedHostnames.join("\n"));
    setSecretKey("");
    setClearSecret(false);
  }, [settingsQuery.data]);

  const normalizedHostnames = useMemo(
    () =>
      Array.from(
        new Set(
          allowedHostnames
            .split(/[\n,]/)
            .map(value => value.trim().toLowerCase())
            .filter(Boolean)
        )
      ),
    [allowedHostnames]
  );

  const sourceLabel = (source: Source) => {
    if (source === "database")
      return isThai ? "ฐานข้อมูล / UI" : "Database / UI";
    if (source === "environment") return isThai ? "Environment" : "Environment";
    if (source === "mixed")
      return isThai ? "ผสม: UI + Environment" : "Mixed: UI + Environment";
    return isThai ? "ยังไม่ได้ตั้งค่า" : "Not configured";
  };

  const handleSave = () => {
    updateMutation.mutate({
      siteKey: siteKey.trim(),
      secretKey: secretKey.trim() || undefined,
      clearSecret,
      allowedHostnames: normalizedHostnames,
    });
  };

  const settings = settingsQuery.data;
  const isConfigured = Boolean(settings?.configured);
  const isLoading = settingsQuery.isLoading;

  return (
    <div className="space-y-6">
      <DashboardCard
        leading={<ShieldCheck className="h-5 w-5 text-emerald-600" />}
        title={
          isThai ? "การป้องกันฟอร์มติดต่อสาธารณะ" : "Public Contact Protection"
        }
        description={
          isThai
            ? "ตั้งค่า Cloudflare Turnstile สำหรับผู้เยี่ยมชมที่ยังไม่ได้เข้าสู่ระบบ ข้อมูลจะถูกตรวจสอบฝั่ง server ก่อนสร้าง Feedback ticket"
            : "Configure Cloudflare Turnstile for visitors who are not signed in. The server verifies the request before creating a Feedback ticket."
        }
        bodyClassName="space-y-6"
      >
        <Alert
          className={
            isConfigured
              ? "border-emerald-200 bg-emerald-50"
              : "border-amber-200 bg-amber-50"
          }
        >
          {isConfigured ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          )}
          <AlertTitle>
            {isConfigured
              ? isThai
                ? "พร้อมป้องกันข้อความจากผู้เยี่ยมชม"
                : "Protection is ready"
              : isThai
                ? "ยังตั้งค่าไม่ครบ"
                : "Setup is incomplete"}
          </AlertTitle>
          <AlertDescription>
            {isConfigured
              ? isThai
                ? "Anonymous submissions ต้องผ่าน Turnstile, rate limit และ replay protection ก่อนส่งเข้า Feedback Hub"
                : "Anonymous submissions must pass Turnstile, rate limits, and replay protection before entering Feedback Hub."
              : isThai
                ? "ใน production ระบบจะปฏิเสธ anonymous submission จนกว่าจะตั้งค่า Site Key, Secret Key และ hostname ครบ"
                : "In production, anonymous submissions are rejected until the Site Key, Secret Key, and hostname are configured."}
          </AlertDescription>
        </Alert>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatusItem
            label={isThai ? "สถานะรวม" : "Overall status"}
            value={
              isConfigured
                ? isThai
                  ? "พร้อมใช้งาน"
                  : "Ready"
                : isThai
                  ? "ยังไม่พร้อม"
                  : "Not ready"
            }
            ready={isConfigured}
          />
          <StatusItem
            label="Site Key"
            value={settings ? sourceLabel(settings.sources.siteKey) : "—"}
            ready={Boolean(settings?.siteKey)}
          />
          <StatusItem
            label="Secret Key"
            value={
              settings?.secretKeyConfigured
                ? isThai
                  ? "บันทึกแล้ว (ซ่อนค่า)"
                  : "Configured (masked)"
                : isThai
                  ? "ยังไม่มี"
                  : "Missing"
            }
            ready={Boolean(settings?.secretKeyConfigured)}
          />
          <StatusItem
            label={isThai ? "Hostname" : "Hostnames"}
            value={
              settings?.allowedHostnames.length
                ? `${settings.allowedHostnames.length} ${isThai ? "รายการ" : "configured"}`
                : isThai
                  ? "ยังไม่มี"
                  : "Missing"
            }
            ready={Boolean(settings?.allowedHostnames.length)}
          />
        </div>

        <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
          <div className="flex items-start gap-3">
            <ListChecks className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <p className="font-semibold text-foreground">
                  {isThai
                    ? "Checklist ที่ Admin ต้องทำให้ครบ"
                    : "Admin go-live checklist"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {isThai
                    ? "ทำตามลำดับนี้เพื่อป้องกันการตั้งค่าตกหล่นก่อนเปิดรับข้อความจากผู้ที่ยังไม่ได้สมัครสมาชิก"
                    : "Complete these steps in order before accepting messages from visitors who are not signed in."}
                </p>
              </div>

              <div className="space-y-2">
                <ChecklistRow
                  number="1"
                  icon={<ServerCog className="h-4 w-4" />}
                  title={
                    isThai
                      ? "ตรวจ Server ก่อนตั้งค่าผ่าน UI"
                      : "Check the server prerequisites"
                  }
                  description={
                    isThai
                      ? "ให้ผู้ดูแล deployment ตรวจว่า LLM_ENCRYPTION_KEY และ Redis ถูกตั้งค่าใน server แล้ว ค่านี้ไม่ใช่รหัสจาก Cloudflare และห้ามใส่ในช่องด้านล่าง"
                      : "Ask the deployment/hosting administrator to confirm LLM_ENCRYPTION_KEY and Redis are configured on the server. These are not Cloudflare keys and must not be pasted below."
                  }
                  status={isThai ? "ตรวจจาก Server" : "Check on server"}
                  ready={false}
                  neutral
                />
                <ChecklistRow
                  number="2"
                  icon={<KeyRound className="h-4 w-4" />}
                  title={
                    isThai
                      ? "สร้าง Turnstile Widget และขอรหัส"
                      : "Create the Turnstile widget and get the keys"
                  }
                  description={
                    isThai
                      ? "เข้า Cloudflare Dashboard → Turnstile → Add site/widget แล้วคัดลอก Site Key กับ Secret Key"
                      : "Open Cloudflare Dashboard → Turnstile → Add site/widget, then copy the Site Key and Secret Key."
                  }
                  status={
                    settings?.siteKey && settings.secretKeyConfigured
                      ? isThai
                        ? "ครบแล้ว"
                        : "Complete"
                      : isThai
                        ? "รอดำเนินการ"
                        : "Pending"
                  }
                  ready={Boolean(
                    settings?.siteKey && settings.secretKeyConfigured
                  )}
                />
                <ChecklistRow
                  number="3"
                  icon={<Globe2 className="h-4 w-4" />}
                  title={
                    isThai
                      ? "ตรวจ hostname ให้ตรงกับเว็บไซต์จริง"
                      : "Match the hostnames to the live site"
                  }
                  description={
                    isThai
                      ? "เพิ่มเฉพาะ hostname เช่น smartaihub.app และ www.smartaihub.app ไม่ใส่ https:// หรือ path"
                      : "Add only hostnames such as smartaihub.app and www.smartaihub.app. Do not include https:// or a path."
                  }
                  status={
                    settings?.allowedHostnames.length
                      ? isThai
                        ? `${settings.allowedHostnames.length} รายการ`
                        : `${settings.allowedHostnames.length} configured`
                      : isThai
                        ? "ยังไม่มี"
                        : "Missing"
                  }
                  ready={Boolean(settings?.allowedHostnames.length)}
                />
                <ChecklistRow
                  number="4"
                  icon={<Save className="h-4 w-4" />}
                  title={
                    isThai
                      ? "บันทึกและตรวจสถานะรวม"
                      : "Save and confirm the overall status"
                  }
                  description={
                    isThai
                      ? "กรอกค่าครบแล้วกด บันทึกและใช้ทันที จากนั้นตรวจว่าขึ้น พร้อมใช้งาน สีเขียว"
                      : "After entering all values, click Save and apply. Confirm that the overall status changes to Ready."
                  }
                  status={
                    isConfigured
                      ? isThai
                        ? "พร้อมใช้งาน"
                        : "Ready"
                      : isThai
                        ? "ยังไม่พร้อม"
                        : "Not ready"
                  }
                  ready={isConfigured}
                />
                <ChecklistRow
                  number="5"
                  icon={<TestTube2 className="h-4 w-4" />}
                  title={
                    isThai
                      ? "ทดสอบแบบผู้เยี่ยมชมจริง"
                      : "Test as a real anonymous visitor"
                  }
                  description={
                    isThai
                      ? "เปิดหน้าติดต่อใน Incognito/Private Window ส่งข้อความทดสอบ แล้วตรวจว่า ticket เข้า Feedback Hub ของ Admin และไม่เกิด error"
                      : "Open the contact page in an Incognito/Private Window, submit a test message, and confirm the ticket reaches the Admin Feedback Hub without errors."
                  }
                  status={isThai ? "ต้องทดสอบเอง" : "Manual check"}
                  ready={false}
                  neutral
                />
              </div>

              <p className="text-xs text-muted-foreground">
                {isThai
                  ? "หากขั้นตอนที่ 1 ยังไม่ผ่าน อย่าเปิดรับ anonymous contact ใน production เพราะระบบจะปฏิเสธคำขอเมื่อการป้องกันตั้งค่าไม่ครบ"
                  : "If step 1 is not confirmed, do not enable anonymous contact in production. The server will reject requests when protection is incomplete."}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-sm text-slate-700">
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
            <div className="space-y-2">
              <p className="font-semibold text-slate-900">
                {isThai
                  ? "ขั้นตอนขอรหัสจาก Cloudflare"
                  : "How to get the keys from Cloudflare"}
              </p>
              <ol className="list-decimal space-y-1 pl-5">
                <li>
                  {isThai
                    ? "เข้าสู่ระบบ Cloudflare แล้วเปิดเมนู Turnstile"
                    : "Sign in to Cloudflare and open Turnstile."}
                </li>
                <li>
                  {isThai
                    ? "กด Add site / Add widget และตั้งชื่อ เช่น SmartAIHub Public Contact"
                    : "Choose Add site / Add widget and name it, for example SmartAIHub Public Contact."}
                </li>
                <li>
                  {isThai
                    ? "เพิ่ม hostname เป็น smartaihub.app และ www.smartaihub.app"
                    : "Add smartaihub.app and www.smartaihub.app as allowed hostnames."}
                </li>
                <li>
                  {isThai
                    ? "คัดลอก Site Key และ Secret Key มาใส่ในแบบฟอร์มด้านล่าง"
                    : "Copy the Site Key and Secret Key into the form below."}
                </li>
              </ol>
              <a
                href="https://dash.cloudflare.com/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline"
              >
                {isThai
                  ? "เปิด Cloudflare Dashboard"
                  : "Open Cloudflare Dashboard"}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="public-contact-site-key">Site Key</Label>
            <Input
              id="public-contact-site-key"
              value={siteKey}
              onChange={event => setSiteKey(event.target.value)}
              placeholder="0x4AAAA..."
              autoComplete="off"
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              {isThai
                ? "ค่านี้เป็น public key ใช้ฝั่ง browser ได้ แต่ต้องตรงกับ widget ที่สร้างใน Cloudflare"
                : "This is the public key used by the browser and must match the Cloudflare widget."}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="public-contact-secret-key">Secret Key</Label>
            <Input
              id="public-contact-secret-key"
              type="password"
              value={secretKey}
              onChange={event => {
                setSecretKey(event.target.value);
                setClearSecret(false);
              }}
              placeholder={
                settings?.secretKeyConfigured
                  ? isThai
                    ? "มีค่าอยู่แล้ว — เว้นว่างเพื่อคงค่าเดิม"
                    : "Already configured — leave blank to keep it"
                  : "0x4AAAA..."
              }
              autoComplete="new-password"
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              {isThai
                ? "ระบบจะเข้ารหัสก่อนเก็บลงฐานข้อมูล และจะไม่แสดงค่ากลับมาใน UI"
                : "Encrypted before storage and never returned to the UI."}
            </p>
            {settings?.secretKeyConfigured ? (
              <label className="flex items-center gap-2 text-xs text-amber-700">
                <Checkbox
                  checked={clearSecret}
                  onCheckedChange={value => setClearSecret(value === true)}
                />
                {isThai
                  ? "ลบ Secret Key ที่บันทึกไว้"
                  : "Clear the stored Secret Key"}
              </label>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="public-contact-hostnames">
            {isThai ? "Allowed hostnames" : "Allowed hostnames"}
          </Label>
          <textarea
            id="public-contact-hostnames"
            value={allowedHostnames}
            onChange={event => setAllowedHostnames(event.target.value)}
            rows={3}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="smartaihub.app\nwww.smartaihub.app"
          />
          <p className="text-xs text-muted-foreground">
            {isThai
              ? "ใส่ hostname ทีละบรรทัด ห้ามใส่ https://, path หรือ slash เช่น smartaihub.app"
              : "One hostname per line. Do not include https://, paths, or slashes, for example smartaihub.app."}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div className="text-xs text-muted-foreground">
            {settings
              ? `${isThai ? "แหล่งค่ารวม" : "Overall source"}: ${sourceLabel(settings.source)}`
              : ""}
          </div>
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending || settingsQuery.isLoading}
          >
            {updateMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {isThai ? "บันทึกและใช้ทันที" : "Save and apply"}
          </Button>
        </div>
      </DashboardCard>

      <DashboardCard
        leading={<AlertTriangle className="h-5 w-5 text-amber-600" />}
        title={
          isThai
            ? "สิ่งที่ยังต้องตั้งค่าบน Server"
            : "Infrastructure values still belong on the server"
        }
        description={
          isThai
            ? "สองค่านี้ไม่ใช่รหัสจาก Cloudflare แต่เป็นความลับของระบบที่ UI ไม่ควรจัดเก็บแทน"
            : "These are not Cloudflare keys; they are infrastructure secrets that should not be managed as browser-visible settings."
        }
        bodyClassName="space-y-3 text-sm"
      >
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>
            <code>LLM_ENCRYPTION_KEY</code> —{" "}
            {isThai
              ? "กุญแจหลักสำหรับถอดรหัส Secret Key ในฐานข้อมูล ห้ามเปลี่ยนโดยไม่วางแผนย้ายข้อมูล"
              : "the master key used to decrypt the stored Secret Key; do not rotate it without a data migration plan."}
          </li>
          <li>
            <code>REDIS_URL</code>{" "}
            {isThai
              ? "หรือ Redis provider ที่ระบบใช้อยู่ — ใช้เก็บ rate limit และ replay protection แบบกระจาย"
              : "or the configured Redis provider — used for distributed rate limits and replay protection."}
          </li>
        </ul>
      </DashboardCard>
    </div>
  );
}

function StatusItem({
  label,
  value,
  ready,
}: {
  label: string;
  value: string;
  ready: boolean;
}) {
  return (
    <div className="rounded-xl border bg-slate-50/70 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-center gap-2 text-sm font-medium">
        <Badge variant={ready ? "default" : "secondary"}>{value}</Badge>
      </div>
    </div>
  );
}

function ChecklistRow({
  number,
  icon,
  title,
  description,
  status,
  ready,
  neutral = false,
}: {
  number: string;
  icon: ReactNode;
  title: string;
  description: string;
  status: string;
  ready: boolean;
  neutral?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/80 p-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {number}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          <p className="font-medium text-foreground">{title}</p>
          <Badge
            variant={neutral ? "secondary" : ready ? "default" : "destructive"}
          >
            {status}
          </Badge>
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}
