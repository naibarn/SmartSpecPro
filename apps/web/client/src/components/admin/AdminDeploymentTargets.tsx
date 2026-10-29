import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { verifyCloudflareIngressInBrowser } from "@/lib/cloudflareIngressAcceptance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, ChevronsUpDown } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { Section } from "@astryxdesign/core/Section";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Selector } from "@astryxdesign/core/Selector";
import { CloudflareImagePublication } from "./CloudflareImagePublication";
import { CloudflareMigrationPreparation } from "./CloudflareMigrationPreparation";
import { CloudflareLiveMissionStatus } from "./CloudflareLiveMissionStatus";

const PROJECT_WIKI_APP_ID = "app_project_wiki_pages";
const ENVIRONMENTS = ["preview", "staging", "production"] as const;
const CLOUDFLARE_PRODUCTION_WORKER_ID = "smartspec-cloudflare-runtime";
const STAGING_RENEWAL_PREFLIGHT_STALL_MS = 20_000;

type DeploymentTarget = {
  id: string;
  tenantId: string;
  projectId: string;
  environment: string;
  provider: string;
  deploymentTargetId: string;
  accountRef: string | null;
  workerRef: string | null;
  containerApplicationRef: string | null;
  enabled: boolean;
  provenance: string;
  runtimePolicy?: string | null;
};

type TargetFields = {
  deploymentTargetId: string;
  accountRef: string;
  workerRef: string;
  containerApplicationRef: string;
  provenance: string;
};

type TargetCredentialProbe = {
  checkedAt: string;
  error: string | null;
  accountId: string | null;
  zoneId: string | null;
  checks: Array<{ id: string; label: string; scope: string; permission: string; status: string; httpStatus: number | null; productRequirement?: string }>;
};

type ProductionDatabaseAdmissionStatus = "SUBMITTING" | "ADMISSION_REJECTED" | "ADMISSION_UNKNOWN" | "JOB_ACCEPTED" | "RUNNING" | "SUCCEEDED" | "FAILED";
type ProductionDatabaseAdmission = {
  submissionId: string;
  tunnelId: string;
  status: ProductionDatabaseAdmissionStatus;
  jobId?: string;
  errorCode?: string;
  traceId?: string;
};

type StagingConfirmation = {
  title: string;
  description: string;
  confirmLabel: string;
  run: () => Promise<unknown>;
};
type StagingActionStatus = { state: "running" | "accepted" | "succeeded" | "failed"; action: string; detail?: string; at: string };

function stagingActionFailureText(code: string, text: (en: string, th: string) => string) {
  if (code === "PRIVATE_DATABASE_RENEWAL_PLAN_CHANGED") return text(
    "The reviewed plan changed during confirmation. No renewal Job was admitted. Refresh the read-only Staging check and confirm the latest plan.",
    "แผนที่ตรวจทานเปลี่ยนระหว่างยืนยัน ระบบยังไม่ได้รับ Job ต่ออายุ ให้ตรวจ Staging แบบอ่านอย่างเดียวอีกครั้ง แล้วตรวจและยืนยันแผนล่าสุด",
  );
  if (code === "PRIVATE_DATABASE_RENEWAL_PLAN_EXPIRED") return text(
    "The confirmation window expired. No renewal Job was admitted. Refresh the read-only Staging check before confirming again.",
    "ช่วงเวลายืนยันหมดอายุ ระบบยังไม่ได้รับ Job ต่ออายุ ให้ตรวจ Staging แบบอ่านอย่างเดียวอีกครั้งก่อนยืนยันใหม่",
  );
  return code;
}

function productionDatabaseAdmissionStorageKey(scopeKey: string) {
  return `smartspec:cloudflare-production-database:${scopeKey}`;
}

function migrationMandateIdempotencyKey(tenantId: string, projectId: string) {
  const key = `smartspec:cloudflare-first-migration-mandate:${tenantId}:${projectId}`;
  try {
    const prior = sessionStorage.getItem(key);
    if (prior && /^[a-f0-9-]{36}$/i.test(prior)) return prior;
    const next = crypto.randomUUID();
    sessionStorage.setItem(key, next);
    return next;
  } catch { return `cf-migration:${crypto.randomUUID()}`; }
}

function readStoredProductionDatabaseAdmission(scopeKey: string): ProductionDatabaseAdmission | null {
  try {
    const raw = sessionStorage.getItem(productionDatabaseAdmissionStorageKey(scopeKey));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<ProductionDatabaseAdmission>;
    if (typeof value.submissionId !== "string" || typeof value.tunnelId !== "string" ||
        !["SUBMITTING", "ADMISSION_REJECTED", "ADMISSION_UNKNOWN", "JOB_ACCEPTED", "RUNNING", "SUCCEEDED", "FAILED"].includes(value.status ?? "")) return null;
    return value as ProductionDatabaseAdmission;
  } catch {
    return null;
  }
}

function storeProductionDatabaseAdmission(scopeKey: string, value: ProductionDatabaseAdmission) {
  try { sessionStorage.setItem(productionDatabaseAdmissionStorageKey(scopeKey), JSON.stringify(value)); }
  catch { /* The canonical registry remains authoritative when storage is unavailable. */ }
}

function canonicalDatabaseAdmissionStatus(status: string): ProductionDatabaseAdmissionStatus {
  if (["succeeded", "completed"].includes(status)) return "SUCCEEDED";
  if (["failed", "cancelled", "expired"].includes(status)) return "FAILED";
  if (["queued", "pending"].includes(status)) return "JOB_ACCEPTED";
  return "RUNNING";
}

function productionWorkerCanaryJobStatus(status: string | undefined, readFailed: boolean, hasJob: boolean,
  preflightReady: boolean | undefined, text: (english: string, thai: string) => string) {
  if (readFailed) return text("FAILED · status unavailable", "ล้มเหลว · อ่านสถานะไม่ได้");
  if (!hasJob) return preflightReady === true ? "READY" : preflightReady === false ? "BLOCKED" : text("CHECKING", "กำลังตรวจ");
  if (status === "succeeded") return "SUCCEEDED";
  if (status === "failed" || status === "expired" || status === "cancelled") return "FAILED";
  if (status === "queued" || status === "pending") return text("RUNNING · queued", "กำลังทำงาน · รอคิว");
  return "RUNNING";
}

function productionDatabaseAdmissionError(error: { message?: string; data?: { code?: string; traceId?: string | null } } | null | undefined) {
  const message = error?.message?.trim() ?? "";
  const errorCode = /^[A-Z0-9_:-]{1,120}$/.test(message) ? message : (error?.data?.code ?? "REQUEST_FAILED");
  const rejectedCodes = new Set(["BAD_REQUEST", "FORBIDDEN", "PRECONDITION_FAILED", "CONFLICT", "NOT_FOUND", "TOO_MANY_REQUESTS"]);
  const unknown = !error?.data || !rejectedCodes.has(error.data.code ?? "");
  return { status: unknown ? "ADMISSION_UNKNOWN" as const : "ADMISSION_REJECTED" as const,
    errorCode, traceId: error?.data?.traceId ?? undefined };
}

const EMPTY_FIELDS: TargetFields = {
  deploymentTargetId: "",
  accountRef: "",
  workerRef: "",
  containerApplicationRef: "",
  provenance: "",
};

function useText() {
  const { i18n } = useTranslation();
  const isThai = i18n.resolvedLanguage?.startsWith("th") || i18n.language?.startsWith("th");
  return (en: string, th: string) => isThai ? th : en;
}

type ScopeOption = { value: string; label: string; searchValue?: string };

const productionBindingHelp: Record<string, { en: string; th: string }> = {
  HYPERDRIVE: { en: "Connect the existing PostgreSQL host through a production Hyperdrive binding.", th: "เชื่อม PostgreSQL เครื่องเดิมผ่าน Hyperdrive binding ของ production" },
  JOB_QUEUE: { en: "Create or select the production Cloudflare Queue and bind it to the Worker.", th: "สร้างหรือเลือก Cloudflare Queue ของ production แล้วผูกกับ Worker" },
  JOB_WORKFLOW: { en: "Bind the canonical durable job Workflow used by the production worker.", th: "ผูก Workflow งานถาวรตัวหลักที่ production worker ใช้" },
  JOB_CONTAINERS: { en: "Bind the enabled Cloudflare Containers service for app workloads.", th: "ผูกบริการ Cloudflare Containers ที่เปิดใช้งานสำหรับ workload ของแอป" },
  WORKER_APP: { en: "Bind the application gateway to the Node and Python HTTP containers.", th: "ผูก application gateway เข้ากับ Node และ Python HTTP containers" },
  MEDIA_BUCKET: { en: "Bind the production media bucket used by the app.", th: "ผูก media bucket ของ production ที่แอปใช้งาน" },
  VECTOR_INDEX: { en: "Bind the production Vectorize index used by search and retrieval.", th: "ผูก Vectorize index ของ production ที่ระบบค้นหาใช้งาน" },
  CLOUDFLARE_APPLICATION_HTTP_TRAFFIC: { en: "Enable the application HTTP ingress profile after its bindings are configured.", th: "เปิด profile รับ HTTP ของแอปหลังตั้งค่า bindings ครบ" },
  NODE_HTTP: { en: "Select the production Node HTTP container profile.", th: "เลือก production profile สำหรับ Node HTTP container" },
  PYTHON_HTTP: { en: "Select the production Python HTTP container profile.", th: "เลือก production profile สำหรับ Python HTTP container" },
  CLOUDFLARE_NODE_HTTP_PROFILE: { en: "Configure the exact Node container image and startup profile.", th: "ตั้งค่า image และ startup profile ของ Node container ให้ตรง" },
  CLOUDFLARE_PYTHON_HTTP_PROFILE: { en: "Configure the exact Python container image and startup profile.", th: "ตั้งค่า image และ startup profile ของ Python container ให้ตรง" },
  AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS: { en: "Add the Cloudflare production origin to the authentication allowlist.", th: "เพิ่ม production origin ของ Cloudflare ใน allowlist ระบบยืนยันตัวตน" },
};

const optionalProductionInventoryChecks = new Set([
  "dispatchNamespaces", "kv", "workflows", "loadBalancerPools", "r2", "vectorize",
  "dns", "zoneLoadBalancers",
]);

type CloudflareTunnelOption = { id: string; name: string; status?: string };

const tunnelIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const nonProductionTunnelNamePattern = /(?:^|[\s._-])(?:dev|development|staging|preview|test|uat)(?=$|[\s._-])/i;

function tunnelStatusLabel(tunnel: CloudflareTunnelOption): string {
  const status = tunnel.status?.trim().toLowerCase();
  return status || "unknown";
}

function productionDatabaseTunnelBlocker(tunnel: CloudflareTunnelOption): string | null {
  if (!tunnelIdPattern.test(tunnel.id)) return "invalid tunnel ID";
  if (!tunnel.name.trim()) return "missing tunnel name";
  const status = tunnelStatusLabel(tunnel);
  if (status !== "healthy") return status === "unknown" ? "health status not reported" : `status ${status}`;
  if (nonProductionTunnelNamePattern.test(tunnel.name)) return "marked as non-production";
  return null;
}

function SearchableScopeSelect({
  label,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  options,
  value,
  menuSize,
  disabled = false,
  onValueChange,
}: {
  label: string;
  placeholder: string;
  searchPlaceholder: string;
  emptyMessage: string;
  options: ScopeOption[];
  value: string;
  menuSize: "tenant" | "project";
  disabled?: boolean;
  onValueChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find(option => option.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={menuSize === "project"
          ? "w-[min(42rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] p-0"
          : "w-[min(28rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] p-0"}
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map(option => (
                <CommandItem
                  key={option.value}
                  value={option.searchValue ?? `${option.label} ${option.value}`}
                  onSelect={() => {
                    onValueChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Check className={`size-4 ${value === option.value ? "opacity-100" : "opacity-0"}`} />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function CredentialReadiness({ target }: { target: DeploymentTarget }) {
  const text = useText();
  const utils = trpc.useUtils();
  const [token, setToken] = useState("");
  const [probe, setProbe] = useState<TargetCredentialProbe | null>(null);
  const identity = {
    tenantId: target.tenantId,
    projectId: target.projectId,
    environment: target.environment,
    provider: "cloudflare" as const,
  };
  const { data, isLoading, isError } = trpc.infrastructure.getDeploymentCredentialState.useQuery({
    ...identity,
  }, { enabled: target.provider === "cloudflare" });
  const saveCredential = trpc.infrastructure.saveDeploymentCredential.useMutation({
    onSuccess: async () => {
      setToken("");
      await utils.infrastructure.getDeploymentCredentialState.invalidate(identity);
    },
  });
  const revokeCredential = trpc.infrastructure.revokeDeploymentCredential.useMutation({
    onSuccess: async () => { setProbe(null); await utils.infrastructure.getDeploymentCredentialState.invalidate(identity); },
  });
  const probeCredential = trpc.infrastructure.probeCloudflareDeploymentCredential.useMutation({
    onSuccess: result => setProbe(result as TargetCredentialProbe),
  });
  const bindPlatformCredential = trpc.infrastructure.bindPlatformCloudflareCredentialProfile.useMutation({
    onSuccess: async () => {
      setProbe(null);
      await utils.infrastructure.getDeploymentCredentialState.invalidate(identity);
    },
  });
  const label = isLoading
    ? "Checking"
    : isError
      ? "Unavailable"
      : data?.status ?? "Unavailable";
  return (
    <VStack as="section" gap={2}>
      <Badge variant={data?.status === "CONFIGURED" ? "default" : "secondary"}>
        {text("Credential", "Credential")}: {label}
      </Badge>
      {data?.source === "platform-credential-center" ? <p role="status">
        {text("Using the existing encrypted platform Credential Center profile by reference. No duplicate token is stored.",
          "ใช้โปรไฟล์ Credential Center ของแพลตฟอร์มที่เข้ารหัสอยู่แล้วผ่าน reference โดยไม่เก็บ token ซ้ำ")}
      </p> : null}
      {data?.canBindPlatformCredential ? <VStack as="section" gap={1}>
        <p>{text("This verified platform-owned target can use the existing deployment profile. Binding checks the exact account, Worker, zone, tenant, project, and environment; it does not deploy or change traffic.",
          "Target นี้เป็นของแพลตฟอร์มและสามารถอ้างอิงโปรไฟล์ deployment เดิมได้ การผูกจะตรวจ account, Worker, zone, tenant, project และ environment ให้ตรงกัน โดยไม่ deploy หรือเปลี่ยน traffic")}</p>
        <Button type="button" variant="outline" disabled={bindPlatformCredential.isPending}
          onClick={() => bindPlatformCredential.mutate(identity)}>
          {bindPlatformCredential.isPending ? text("Verifying and binding…", "กำลังตรวจและผูก credential…")
            : text("Use the saved platform deployment credential", "ใช้ credential deployment ของแพลตฟอร์มที่บันทึกไว้")}
        </Button>
        {bindPlatformCredential.error ? <p role="alert">{bindPlatformCredential.error.message}</p> : null}
      </VStack> : null}
      {target.environment === "production" && data?.status === "CONFIGURED" && data.savedAt ? <p role="status">
        {text(
          "Production token copy saved here: ",
          "บันทึกสำเนา token ของ Production ไว้ที่นี่เมื่อ: ",
        )}<time dateTime={data.savedAt}>{new Date(data.savedAt).toLocaleString()}</time>{" "}
        {text(
          "Cloudflare dashboard edits do not update this encrypted copy. Save the updated token here before checking permissions or provisioning resources.",
          "การแก้ token ใน Cloudflare Dashboard ไม่ได้เปลี่ยนสำเนาเข้ารหัสนี้ ให้นำ token ที่อัปเดตแล้วมาบันทึกที่นี่ก่อนตรวจสิทธิ์หรือสร้าง resource",
        )}
      </p> : null}
      <details>
        <summary>{text("Configure target account credential", "ตั้งค่า credential ของบัญชีสำหรับ target นี้")}</summary>
        <VStack as="form" gap={2} onSubmit={event => {
          event.preventDefault();
          setProbe(null);
          saveCredential.mutate({ ...identity, token: token.trim() });
        }}>
          <p>{target.environment === "production" ? text(
            "This token is encrypted and scoped to this tenant, project, and production environment. It is never returned to the browser. Use only the exact production account credential approved for this target. Saving it does not deploy or change traffic.",
            "Token นี้จะถูกเข้ารหัสและผูกกับ tenant, project และ production environment นี้เท่านั้น ระบบจะไม่ส่ง token กลับไปยัง browser ให้ใช้เฉพาะ credential ของ production account ที่อนุมัติสำหรับ target นี้ การบันทึก token ไม่ได้ deploy หรือเปลี่ยน traffic",
          ) : text(
            "This token is encrypted and scoped to this tenant, project, and environment. It is never returned to the browser. Use a token from the dedicated non-production Mini-App Cloudflare account.",
            "Token นี้จะถูกเข้ารหัสและผูกกับ tenant, project และ environment นี้เท่านั้น ระบบจะไม่ส่ง token กลับไปยัง browser ให้ใช้ token จาก Cloudflare account สำหรับ Mini-App non-production ที่แยกไว้",
          )}</p>
          <Label htmlFor={`deployment-credential-${target.id}`}>{text("Cloudflare API token", "Cloudflare API token")}</Label>
          <Input
            id={`deployment-credential-${target.id}`}
            type="password"
            autoComplete="new-password"
            value={token}
            onChange={event => setToken(event.target.value)}
            minLength={20}
            maxLength={512}
            required
          />
          <HStack gap={2} wrap="wrap">
            <Button type="submit" disabled={saveCredential.isPending || token.trim().length < 20}>
              {saveCredential.isPending ? text("Saving…", "กำลังบันทึก…") : text("Save encrypted token", "บันทึก token แบบเข้ารหัส")}
            </Button>
            {data?.status === "CONFIGURED" ? <Button
              type="button"
              variant="destructive"
              disabled={revokeCredential.isPending}
              onClick={() => revokeCredential.mutate(identity)}
            >{text("Revoke target token", "เพิกถอน token ของ target")}</Button> : null}
          </HStack>
          {saveCredential.error || revokeCredential.error ? <p role="alert">{text("Credential update failed. No credential state was assumed.", "อัปเดต credential ไม่สำเร็จ ระบบจะไม่สมมติสถานะ credential")}</p> : null}
        </VStack>
      </details>
      {target.environment === "production" ? <VStack as="section" gap={2}>
        <p>{text(
          "Check the encrypted token attached to this exact Production target against the account and smartaihub.app zone. This is read-only; it never creates resources or changes traffic.",
          "ตรวจ token แบบเข้ารหัสที่ผูกกับ Production target นี้โดยตรงกับ account และ zone smartaihub.app การตรวจเป็นแบบอ่านอย่างเดียว ไม่สร้าง resource หรือเปลี่ยน traffic",
        )}</p>
        <Button type="button" variant="outline" disabled={data?.status !== "CONFIGURED" || probeCredential.isPending}
          onClick={() => { setProbe(null); probeCredential.mutate(identity); }}>
          {probeCredential.isPending ? text("Checking Cloudflare permissions…", "กำลังตรวจสิทธิ์ Cloudflare…") : text("Check this target’s Cloudflare access", "ตรวจสิทธิ์ Cloudflare ของ target นี้")}
        </Button>
        {probeCredential.error ? <p role="alert">{probeCredential.error.message}</p> : null}
        {probe ? <VStack as="section" gap={2} role="region" aria-label={text("Production Cloudflare permission results", "ผลตรวจสิทธิ์ Cloudflare Production")}>
          <HStack gap={2} wrap="wrap">
            <strong>{text("Permission and resource check", "ผลตรวจ permission และ resource")}</strong>
            <span>{new Date(probe.checkedAt).toLocaleString()}</span>
          </HStack>
          {probe.accountId ? <p>{text("Account ID checked", "ตรวจ Account ID")}: <code>{probe.accountId}</code></p> : null}
          {probe.zoneId ? <p>{text("smartaihub.app zone checked", "ตรวจ Zone ID ของ smartaihub.app")}: <code>{probe.zoneId}</code></p> : null}
          {probe.error ? <p role="alert">{probe.error === "credential_not_configured"
            ? text("No encrypted token is saved for this Production target. Open ‘Configure target account credential’ above and save the Cloudflare account token.", "ยังไม่มี token เข้ารหัสสำหรับ Production target นี้ เปิด ‘ตั้งค่า credential ของบัญชีสำหรับ target นี้’ ด้านบน แล้วบันทึก token ของ Cloudflare account")
            : probe.error === "target_account_id_invalid"
              ? text("The target’s Account ID is missing or malformed. Edit the Production target and enter its 32-character Cloudflare Account ID.", "Account ID ของ target ไม่มีหรือรูปแบบไม่ถูกต้อง แก้ Production target แล้วใส่ Cloudflare Account ID 32 ตัวอักษร")
              : text(`Credential check could not run: ${probe.error}`, `ตรวจ credential ไม่สำเร็จ: ${probe.error}`)}</p> : null}
          {probe.checks.length > 0 ? <VStack as="ul" gap={2}>
            {probe.checks.map(check => {
              const optionalForCurrentMigration = optionalProductionInventoryChecks.has(check.id);
              return <VStack as="li" key={check.id} gap={1}>
              <HStack gap={2} wrap="wrap">
                <strong>{check.label}</strong>
                {optionalForCurrentMigration ? <Badge variant="outline">{text("Optional for current migration", "ไม่จำเป็นต่อการย้ายรอบนี้")}</Badge> : null}
                <Badge variant={check.status === "granted" ? "default" : check.status === "product_unavailable" ? "destructive" : "secondary"}>
                  {check.status === "granted" ? text("Read access confirmed", "ยืนยันสิทธิ์อ่านแล้ว")
                    : check.status === "missing_permission" ? text("Permission missing", "ขาด permission")
                      : check.status === "resource_not_found" ? text("Resource not found", "ไม่พบ resource")
                        : check.status === "product_unavailable" ? text("Product entitlement required", "ต้องเปิดสิทธิ์ผลิตภัณฑ์") : check.status}{check.httpStatus ? ` · HTTP ${check.httpStatus}` : ""}
                </Badge>
              </HStack>
              <span>{text("Scope", "ขอบเขต")}: {check.scope} · {text("permission accepted by this API", "permission ที่ API นี้ยอมรับ")}: <code>{check.permission}</code></span>
              {check.status === "missing_permission" ? check.id === "vpcServices" ? <VStack as="section" gap={1} role="status">
                <p>{text(
                  "Cloudflare denied Workers VPC access for this account (HTTP 403). This is an account-member role, not a setting on the API token: grant the current member the account-scoped Connectivity Directory Admin role under Manage Account → Members. That role can create VPC Services and connect them to a Cloudflare Tunnel. Keep using the saved token; do not replace it just for this role.",
                  "Cloudflare ปฏิเสธสิทธิ์ Workers VPC ของ account นี้ (HTTP 403) จุดนี้เป็น role ของสมาชิก account ไม่ใช่ค่าใน API token: เพิ่ม role Connectivity Directory Admin ที่ scope ระดับ account ให้สมาชิกคนปัจจุบันใน Manage Account → Members role นี้สร้าง VPC Service และเชื่อมกับ Cloudflare Tunnel ได้ ใช้ token ที่บันทึกไว้อยู่ ไม่ต้องเปลี่ยน token เพื่อแก้ role นี้",
                )}</p>
                <a href="https://developers.cloudflare.com/fundamentals/manage-members/manage/" target="_blank" rel="noreferrer">
                  {text("Cloudflare: manage account member roles", "คู่มือ Cloudflare: จัดการ role ของสมาชิก account")}
                </a>
              </VStack> : <p role="status">{optionalForCurrentMigration ? text(
                "This is optional inventory for services not selected by the current Queue + Hyperdrive migration. Leave it unchanged unless the production workload is configured to use this service.",
                "รายการนี้เป็น inventory เสริมที่ไม่ได้เลือกใช้ใน migration แบบ Queue + Hyperdrive รอบนี้ ยังไม่ต้องเพิ่ม permission เว้นแต่ production workload จะตั้งค่าให้ใช้บริการนี้",
              ) : text(
                "Cloudflare denied this required read request. Add the listed permission to this token at the named account or zone scope, save the token, then run this check again.",
                "Cloudflare ปฏิเสธคำขออ่านที่จำเป็น ให้เพิ่ม permission ที่ระบุใน scope ของ account หรือ zone นี้ บันทึก token แล้วกดตรวจซ้ำ",
              )}</p> : null}
              {optionalForCurrentMigration && check.status === "invalid_token" ? <p role="status">{text(
                "This optional inventory endpoint did not accept the request. It is not required for the current Queue + Hyperdrive profile; do not broaden token access for it unless the workload needs this service.",
                "endpoint inventory เสริมนี้ไม่รับคำขอ แต่ไม่จำเป็นต่อ Queue + Hyperdrive profile รอบนี้ ยังไม่ต้องเพิ่มสิทธิ์ token เว้นแต่ workload ต้องใช้บริการนี้",
              )}</p> : null}
              {check.status === "resource_not_found" ? <p role="status">{text("The request reached Cloudflare, but this resource was not found in the selected account. Create or select the resource; changing token permission will not create it.", "Cloudflare รับคำขอแล้วแต่ไม่พบ resource ใน account ที่เลือก ให้สร้างหรือเลือก resource ให้ถูกต้อง การเพิ่ม permission ไม่ได้สร้าง resource")}</p> : null}
              {check.status === "product_unavailable" ? <p role="status">{check.productRequirement === "workers_paid"
                ? text("Cloudflare reports Workers Paid is required for this Containers API. If Workers Paid is already enabled, refresh the probe; this response may indicate the wrong account or a billing/product propagation issue, not a token scope.", "Cloudflare แจ้งว่า Containers API ต้องใช้ Workers Paid หากเปิด Workers Paid แล้ว ให้ตรวจใหม่ ผลนี้อาจหมายถึงเลือก account ผิดหรือสถานะ billing/product ยังไม่อัปเดต ไม่ใช่ปัญหา token scope")
                : text("Cloudflare reports Workers for Platforms is required for this endpoint. This is a product entitlement, not an API token permission.", "Cloudflare แจ้งว่า endpoint นี้ต้องใช้ Workers for Platforms เป็นสิทธิ์ผลิตภัณฑ์ ไม่ใช่ API token permission")}</p> : null}
              {check.status === "granted" ? <p>{text("Read access verified only; this does not prove write access or deployment success.", "ยืนยันเฉพาะสิทธิ์อ่าน ยังไม่ยืนยันสิทธิ์เขียนหรือผล deploy")}</p> : null}
            </VStack>;
            })}
          </VStack> : null}
          <p>{text(
            "Use the exact account/zone scopes in the consolidated Production permission packet below. Cloudflare’s token editor labels write access as Edit for account products, while DNS uses Write. Read checks do not prove edit access; existing resources may avoid a create scope.",
            "ใช้ scope ของ account/zone ตามรายการ permission รวมด้านล่าง ใน Cloudflare token editor สิทธิ์เขียนของ product ระดับ account ใช้ชื่อ Edit ส่วน DNS ใช้ Write ผลตรวจ Read ไม่ยืนยันสิทธิ์แก้ไข และ resource ที่มีอยู่แล้วอาจไม่ต้องใช้ scope สำหรับสร้าง",
          )}</p>
        </VStack> : null}
      </VStack> : null}
    </VStack>
  );
}

function TargetEditor({
  target,
  onSave,
  saving,
}: {
  target: DeploymentTarget;
  onSave: (changes: TargetFields) => void;
  saving: boolean;
}) {
  const text = useText();
  const [fields, setFields] = useState<TargetFields>({
    deploymentTargetId: target.deploymentTargetId,
    accountRef: target.accountRef ?? "",
    workerRef: target.workerRef ?? "",
    containerApplicationRef: target.containerApplicationRef ?? "",
    provenance: target.provenance,
  });
  const set = (key: keyof TargetFields) => (event: ChangeEvent<HTMLInputElement>) =>
    setFields(current => ({ ...current, [key]: event.target.value }));
  return (
    <VStack as="form" gap={2} onSubmit={event => { event.preventDefault(); onSave(fields); }}>
      <Label htmlFor={`target-id-${target.id}`}>{text("Deployment target identity", "ตัวตนของ deployment target")}</Label>
      <Input id={`target-id-${target.id}`} value={fields.deploymentTargetId} onChange={set("deploymentTargetId")} required maxLength={160} />
      <HStack gap={2} wrap="wrap">
        <VStack gap={1}><Label htmlFor={`account-${target.id}`}>{text("Cloudflare account ID (this target only)", "Cloudflare account ID (เฉพาะ target นี้)")}</Label><Input id={`account-${target.id}`} value={fields.accountRef} onChange={set("accountRef")} maxLength={255} /></VStack>
        <VStack gap={1}><Label htmlFor={`worker-${target.id}`}>{text("Worker reference", "อ้างอิง Worker")}</Label><Input id={`worker-${target.id}`} value={fields.workerRef} onChange={set("workerRef")} maxLength={255} /></VStack>
        <VStack gap={1}><Label htmlFor={`container-${target.id}`}>{text("Container application reference", "อ้างอิงแอป Container")}</Label><Input id={`container-${target.id}`} value={fields.containerApplicationRef} onChange={set("containerApplicationRef")} maxLength={255} /></VStack>
      </HStack>
      <Label htmlFor={`provenance-${target.id}`}>{text("Approval or change provenance", "หลักฐานการอนุมัติหรือ change")}</Label>
      <Input id={`provenance-${target.id}`} value={fields.provenance} onChange={set("provenance")} required maxLength={500} />
      <Button type="submit" disabled={saving || !fields.deploymentTargetId.trim() || !fields.provenance.trim()}>
        {saving ? text("Saving…", "กำลังบันทึก…") : text("Save target changes", "บันทึกการแก้ไข target")}
      </Button>
    </VStack>
  );
}

export default function AdminDeploymentTargets() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [tenantId, setTenantId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [environment, setEnvironment] = useState("");
  const [workflowRuntimeToken, setWorkflowRuntimeToken] = useState("");
  const [controlPlaneToken, setControlPlaneToken] = useState("");
  const [productionQueueJobId, setProductionQueueJobId] = useState("");
  const [stagingRenewalJobId, setStagingRenewalJobId] = useState("");
  const [productionDatabaseSubmissions, setProductionDatabaseSubmissions] = useState<Record<string, string>>({});
  const [productionDatabaseAdmissions, setProductionDatabaseAdmissions] = useState<Record<string, ProductionDatabaseAdmission>>({});
  const [productionTunnelSelections, setProductionTunnelSelections] = useState<Record<string, string>>({});
  const [fields, setFields] = useState<TargetFields>(EMPTY_FIELDS);
  const [showNonOperationalTenants, setShowNonOperationalTenants] = useState(false);
  const [mandateDialogOpen, setMandateDialogOpen] = useState(false);
  const [stagingConfirmation, setStagingConfirmation] = useState<StagingConfirmation | null>(null);
  const [stagingActionRunning, setStagingActionRunning] = useState(false);
  const [stagingActionStatus, setStagingActionStatus] = useState<StagingActionStatus | null>(null);
  const [stagingRenewalPreflightStalled, setStagingRenewalPreflightStalled] = useState(false);
  const stagingActionLock = useRef(false);
  const [savedStagingScope, setSavedStagingScope] = useState<{ tenantId: string; projectId: string } | null>(null);
  const tenantsQuery = trpc.systemSettings.listTenants.useQuery(undefined, { retry: 1, refetchOnWindowFocus: true });
  const tenantInventory = tenantsQuery.data ?? [];
  const operationalTenants = tenantInventory.filter(tenant => !tenant.selectorKind || tenant.selectorKind === "operational");
  const visibleTenants = showNonOperationalTenants ? tenantInventory : operationalTenants;
  const validTenantId = tenantId.length > 0 && tenantId.length <= 36
    && Boolean(tenantsQuery.data?.some(tenant => tenant.id === tenantId));
  const projectsQuery = trpc.infrastructure.listDeploymentTargetProjects.useQuery(
    { tenantId },
    { enabled: validTenantId },
  );
  const scope = useMemo(() => ({ tenantId, projectId, environment }), [tenantId, projectId, environment]);
  const validScope = validTenantId && Boolean(projectId) && ENVIRONMENTS.some(value => value === environment);
  const targetsQuery = trpc.infrastructure.listProviderDeploymentTargets.useQuery(
    scope,
    { enabled: validScope },
  );
  const stagingTargetsQuery = trpc.infrastructure.listProviderDeploymentTargets.useQuery(
    { tenantId, projectId, environment: "staging" },
    { enabled: validTenantId && Boolean(projectId) && environment === "production" },
  );
  const stagingDeployPreflight = trpc.infrastructure.getCloudflareStagingDeployPreflight.useQuery(
    { tenantId, projectId, environment: "staging" },
    { enabled: validScope && environment === "staging" },
  );
  const stagingRuntimeReadiness = trpc.infrastructure.getCloudflareStagingRuntimeReadiness.useQuery(
    { tenantId, projectId, environment: "staging" },
    { enabled: validScope && environment === "staging" },
  );
  const productionRuntimeReadiness = trpc.infrastructure.getCloudflareProductionRuntimeReadiness.useQuery(
    { tenantId, projectId, environment: "production" },
    { enabled: validScope && environment === "production" },
  );
  const productionProviderInventory = trpc.infrastructure.getCloudflareProductionProviderInventory.useQuery(
    { tenantId, projectId, environment: "production" },
    { enabled: validScope && environment === "production", refetchOnWindowFocus: false },
  );
  const latestProductionQueueJob = trpc.infrastructure.getLatestCloudflareProductionQueueJob.useQuery(
    { tenantId, projectId, environment: "production" },
    { enabled: validScope && environment === "production", refetchInterval: query =>
      !query.state.data || ["succeeded", "failed", "cancelled"].includes(query.state.data.status) ? false : 2_000 },
  );
  const productionQueueJob = trpc.infrastructure.getCloudflareProductionQueueJobStatus.useQuery(
    { tenantId, projectId, jobId: productionQueueJobId || latestProductionQueueJob.data?.jobId || "00000000-0000-4000-8000-000000000000", environment: "production" },
    { enabled: validScope && environment === "production" && Boolean(productionQueueJobId || latestProductionQueueJob.data?.jobId), refetchInterval: query =>
      query.state.data?.status === "succeeded" || query.state.data?.status === "failed" ? false : 2_000 },
  );
  const productionQueueJobData = productionQueueJob.data ?? latestProductionQueueJob.data;
  const latestProductionDatabaseJob = trpc.infrastructure.getLatestCloudflareProductionDatabaseJob.useQuery(
    { tenantId, projectId, environment: "production" },
    { enabled: validScope && environment === "production", refetchInterval: query =>
      !query.state.data || ["succeeded", "failed", "cancelled", "expired"].includes(query.state.data.status) ? false : 2_000 },
  );
  const productionDatabaseJobData = latestProductionDatabaseJob.data;
  const productionDatabaseObservation = productionDatabaseJobData?.reconciliation;
  const productionDatabaseGuardRecovery = productionDatabaseJobData?.status === "failed" &&
    productionDatabaseJobData.errorCode === "CLOUDFLARE_PRODUCTION_DATABASE_CREDENTIAL_UNAVAILABLE" &&
    productionDatabaseJobData.attempt === 2 && productionDatabaseJobData.maxAttempts === 2;

  const productionDatabaseProviderRecovery = productionDatabaseJobData?.status === "failed" &&
    productionDatabaseJobData.errorCode === "CLOUDFLARE_PRODUCTION_DATABASE_HTTP_400_CF_2015" &&
    productionDatabaseJobData.attempt === 3 && productionDatabaseJobData.maxAttempts === 3;
  const productionDatabaseReadbackRecovery = productionDatabaseJobData?.status === "failed" &&
    productionDatabaseObservation?.providerReadbackVerified !== true &&
    productionDatabaseJobData.errorCode === "CLOUDFLARE_PRODUCTION_HYPERDRIVE_READBACK_MISMATCH" &&
    productionDatabaseJobData.attempt === 4 && productionDatabaseJobData.maxAttempts === 4;
  const productionReadbackRecoveryResourcesVerified = (() => {
    const inventory = productionProviderInventory.data;
    const job = productionDatabaseJobData;
    const prefix = job?.planDigest?.slice(0, 12);
    if (!productionDatabaseReadbackRecovery || !inventory || !("hyperdrives" in inventory) || !prefix ||
        inventory.hyperdriveInventoryComplete !== true || inventory.vpcServiceInventoryComplete !== true ||
        inventory.tunnelInventoryComplete !== true) return false;
    const vpc = inventory.vpcServices.find(service => service.name === `smartspec-production-postgres-${prefix}` &&
      service.environment === "production" && service.type === "tcp" && service.appProtocol === "postgresql" &&
      service.tunnelId === job?.tunnelId);
    return Boolean(vpc && inventory.hyperdrives.some(config => config.name === `smartspec-production-database-${prefix}` &&
      config.environment === "production" && config.vpcServiceId === vpc.id && config.scheme === "postgres" && config.cachingDisabled === true));
  })();

  const productionScopeKey = `${tenantId}:${projectId}:production`;
  const productionIngressSubmissions=useRef(new Map<string,{submissionId:string;planDigest:string}>());
  const ingressSubmission=(key:string,planDigest:string)=>{
    let submission=productionIngressSubmissions.current.get(key);
    if(!submission)try {const value=JSON.parse(sessionStorage.getItem(key)??"null");
      if(value&&/^[a-f0-9-]{36}$/.test(value.submissionId)&&/^[a-f0-9]{64}$/.test(value.planDigest))submission=value;
    }catch{/* In-memory continuity still works when browser storage is unavailable. */}
    if(!submission)submission={submissionId:crypto.randomUUID(),planDigest};
    productionIngressSubmissions.current.set(key,submission);
    try{sessionStorage.setItem(key,JSON.stringify(submission));}catch{/* The canonical admission remains authoritative. */}
    return submission;
  };
  const productionIngressPreflight = trpc.infrastructure.getCloudflareProductionIngressPreflight.useQuery(
    {tenantId,projectId,environment:"production"}, {enabled:validScope&&environment==="production"});
  const migrationMission = trpc.infrastructure.getCloudflareMigrationMission.useQuery(
    { tenantId, projectId, environment: "production" },
    { enabled: validScope && environment === "production", refetchInterval: 10000 });
  const migrationMandatePlan = trpc.infrastructure.getCloudflareMigrationMandatePlan.useQuery(
    { tenantId, projectId, environment: "production" }, { enabled: validScope && environment === "production", retry: false });
  const migrationMandate = trpc.infrastructure.getCloudflareMigrationMandate.useQuery(
    { tenantId, projectId, environment: "production" }, { enabled: validScope && environment === "production", refetchInterval: 10000, retry: false });
  const enrollMigrationMandate = trpc.infrastructure.enrollCloudflareMigrationMandate.useMutation({
    onSuccess: async () => {
      setMandateDialogOpen(false);
      await Promise.all([migrationMission.refetch(), migrationMandate.refetch()]);
    },
    onError: () => { void migrationMandate.refetch(); },
  });
  const changeMigrationMandate = trpc.infrastructure.changeCloudflareMigrationMandate.useMutation({
    onSuccess: async () => { await Promise.all([migrationMission.refetch(), migrationMandate.refetch()]); },
  });
  const migrationMandateValue = migrationMandate.data?.mandate as { status?: string; mandateRef?: string;
    resourceBudget?: Record<string, number>; resourceUsage?: Record<string, number>; remainingResourceBudget?: Record<string, number> } | null | undefined;
  const migrationMandateHistory = trpc.infrastructure.getCloudflareMigrationMandateHistory.useQuery(
    { tenantId, projectId, environment: "production", mandateRef: migrationMandateValue?.mandateRef ?? "00000000-0000-0000-0000-000000000000" },
    { enabled: validScope && environment === "production" && Boolean(migrationMandateValue?.mandateRef), retry: false });
  const latestProductionIngressJob = trpc.infrastructure.getLatestCloudflareProductionIngressJob.useQuery(
    {tenantId,projectId,environment:"production"}, {enabled:validScope&&environment==="production",refetchInterval:query=>
      query.state.data&&! ["succeeded","failed","expired","cancelled"].includes(query.state.data.status)?2000:10000});
  const productionWorkerCanaryPreflight = trpc.infrastructure.getCloudflareProductionWorkerCanaryPreflight.useQuery(
    {tenantId,projectId,environment:"production"},{enabled:validScope&&environment==="production",refetchOnWindowFocus:false});
  const latestProductionWorkerCanaryJob = trpc.infrastructure.getLatestCloudflareProductionWorkerCanaryJob.useQuery(
    {tenantId,projectId,environment:"production"},{enabled:validScope&&environment==="production",retry:false,refetchInterval:query=>{
      if(query.state.status==="error")return Math.min(60_000,5_000*2**Math.min(query.state.fetchFailureCount,4));
      if(!query.state.data)return 15_000;
      return !["succeeded","failed","expired","cancelled"].includes(query.state.data.status)?3_000:30_000;
    }});
  const productionWorkerCanarySubmissions=useRef(new Map<string,{submissionId:string;planDigest:string}>());
  const productionWorkerCanaryMutation=trpc.infrastructure.queueCloudflareProductionWorkerCanary.useMutation({
    onSuccess:async()=>{await latestProductionWorkerCanaryJob.refetch();await productionProviderInventory.refetch();},
    onError:()=>{void latestProductionWorkerCanaryJob.refetch();},
  });
  const workerCanarySubmission=(key:string,planDigest:string)=>{
    let value=productionWorkerCanarySubmissions.current.get(key);
    if(!value)try{const saved=JSON.parse(sessionStorage.getItem(key)??"null");
      if(saved&&/^[a-f0-9-]{36}$/i.test(saved.submissionId)&&/^[a-f0-9]{64}$/.test(saved.planDigest))value=saved;
    }catch{/* Continue with in-memory idempotency if storage is disabled. */}
    if(!value)value={submissionId:crypto.randomUUID(),planDigest};
    productionWorkerCanarySubmissions.current.set(key,value);
    try{sessionStorage.setItem(key,JSON.stringify(value));}catch{/* Canonical job admission is authoritative. */}
    return value;
  };
  const previousIngressJob = latestProductionIngressJob.data;
  const acceptedIngress = previousIngressJob?.status === "succeeded" &&
    previousIngressJob.output?.productionTrafficShifted === true;
  const canReplaceTerminalIngressJob = Boolean(previousIngressJob &&
    ["failed", "expired", "cancelled"].includes(previousIngressJob.status));
  const productionIngressRollback = trpc.infrastructure.getCloudflareProductionIngressRollbackPreflight.useQuery(
    {tenantId,projectId,environment:"production",jobId:latestProductionIngressJob.data?.jobId??"00000000-0000-4000-8000-000000000000"},
    {enabled:validScope&&environment==="production"&&latestProductionIngressJob.data?.status==="succeeded"&&
      latestProductionIngressJob.data.output?.productionTrafficShifted===true});
  const productionIngressMutation = trpc.infrastructure.queueCloudflareProductionIngress.useMutation({
    onSuccess:async()=>{await latestProductionIngressJob.refetch();await productionProviderInventory.refetch();},
    onError:()=>{void latestProductionIngressJob.refetch();},
  });
  const ingressAcceptanceStarted=useRef(new Set<string>());
  const [ingressBrowserResult,setIngressBrowserResult]=useState<Record<string,string>>({});
  useEffect(()=>{
    if(!validScope||environment!=="production")return;
    const job=latestProductionIngressJob.data;
    const progress=job?.progress as {stage?:string;measured?:Record<string,unknown>}|undefined;
    const measured=progress?.measured;
    if(!job||job.status!=="running"||progress?.stage!=="AWAITING_AUTHENTICATED_ACCEPTANCE"||!measured||
      ingressAcceptanceStarted.current.has(job.jobId)||!job.requesterUserId)return;
    const {routeId,deploymentId,versionId}=measured;
    if(typeof routeId!=="string"||typeof deploymentId!=="string"||typeof versionId!=="string")return;
    ingressAcceptanceStarted.current.add(job.jobId);
    setIngressBrowserResult(current=>({...current,[job.jobId]:"checking"}));
    void verifyCloudflareIngressInBrowser({jobId:job.jobId,requesterUserId:job.requesterUserId,tenantId,
      receipt:{routeId,deploymentId,versionId}}).then(result=>{
      setIngressBrowserResult(current=>({...current,[job.jobId]:result.passed?"passed":"failed"}));
    }).catch(()=>setIngressBrowserResult(current=>({...current,[job.jobId]:"failed"})));
  },[latestProductionIngressJob.data,tenantId,validScope,environment]);

  const targets = validScope ? (targetsQuery.data ?? []) as DeploymentTarget[] : [];
  const cloudflareTargets = targets.filter(target => target.provider === "cloudflare");
  const stagingCloudflareTargets = ((stagingTargetsQuery.data ?? []) as DeploymentTarget[])
    .filter(target => target.provider === "cloudflare" && target.enabled);
  const knownProductionAccountRefs = [...new Set(stagingCloudflareTargets
    .map(target => target.accountRef?.trim())
    .filter((value): value is string => Boolean(value)))];
  const inferredProductionAccountRef = knownProductionAccountRefs.length === 1 ? knownProductionAccountRefs[0] : "";
  const currentStagingConfigRef = cloudflareTargets.find(target => target.enabled)?.runtimePolicy ?? "";
  const stagingOriginConfiguration = trpc.infrastructure.getCloudflareOriginConfiguration.useQuery({
    tenantId, projectId, environment: "staging", provider: "cloudflare", configurationRef: currentStagingConfigRef,
  }, { enabled: validScope && environment === "staging" && /^cf-origin:[a-f0-9]{64}$/.test(currentStagingConfigRef) });
  const stagingDatabaseRenewal = trpc.infrastructure.getCloudflareStagingPrivateDatabaseRenewalPreflight.useQuery({
    tenantId, projectId, environment: "staging", configurationRef: currentStagingConfigRef,
  }, { enabled: validScope && environment === "staging" && stagingOriginConfiguration.data?.status === "EXPIRED" });
  const observedStagingRenewalJobId = stagingRenewalJobId || stagingDatabaseRenewal.data?.existingJob?.jobId || "";
  const stagingRenewalJobStatus = trpc.infrastructure.getCloudflareStagingPrivateDatabaseRenewalJobStatus.useQuery({
    tenantId, projectId, environment: "staging", configurationRef: currentStagingConfigRef, jobId: observedStagingRenewalJobId,
  }, { enabled: validScope && environment === "staging" && Boolean(observedStagingRenewalJobId),
    refetchInterval: query => query.state.data && !["succeeded", "completed", "failed", "cancelled", "canceled", "expired", "dead_letter"].includes(query.state.data.status) ? 2_000 : false });
  useEffect(() => {
    const live = stagingRenewalJobStatus.data;
    const terminal = live && ["succeeded", "completed", "failed", "cancelled", "canceled", "expired", "dead_letter"].includes(live.status);
    if (terminal && stagingDatabaseRenewal.data?.existingJob?.jobId === live.jobId
      && stagingDatabaseRenewal.data.existingJob.status !== live.status && !stagingDatabaseRenewal.isFetching) {
      void stagingDatabaseRenewal.refetch();
    }
  }, [stagingRenewalJobStatus.data, stagingDatabaseRenewal.data, stagingDatabaseRenewal.isFetching]);
  useEffect(() => {
    if (!stagingDatabaseRenewal.isFetching) {
      setStagingRenewalPreflightStalled(false);
      return;
    }
    setStagingRenewalPreflightStalled(false);
    const timeout = window.setTimeout(() => setStagingRenewalPreflightStalled(true), STAGING_RENEWAL_PREFLIGHT_STALL_MS);
    return () => window.clearTimeout(timeout);
  }, [stagingDatabaseRenewal.isFetching, tenantId, projectId, currentStagingConfigRef]);
  const enabledCloudflareTargets = cloudflareTargets.filter(target => target.enabled);
  const isConflict = enabledCloudflareTargets.length > 1;
  const canCreate = validScope && !targetsQuery.isLoading && !targetsQuery.isError && !isConflict && enabledCloudflareTargets.length === 0;

  const refreshTargets = async () => {
    if (validScope) await utils.infrastructure.listProviderDeploymentTargets.invalidate(scope);
  };
  const createMutation = trpc.infrastructure.createProviderDeploymentTarget.useMutation({
    onSuccess: async () => {
      setFields(EMPTY_FIELDS);
      await refreshTargets();
    },
  });
  const updateMutation = trpc.infrastructure.updateProviderDeploymentTarget.useMutation({
    onSuccess: refreshTargets,
  });
  const disableMutation = trpc.infrastructure.disableProviderDeploymentTarget.useMutation({
    onSuccess: refreshTargets,
  });
  const stagingDeployMutation = trpc.infrastructure.queueCloudflareStagingDeploy.useMutation({
    onSuccess: async () => { await stagingDeployPreflight.refetch(); },
  });
  const stagingRenewalMutation = trpc.infrastructure.queueCloudflareStagingPrivateDatabaseRenewal.useMutation({
    onSuccess: async result => {
      setStagingRenewalJobId(result.jobId);
      await stagingDatabaseRenewal.refetch();
    },
  });
  const finalizeStagingRenewal = trpc.infrastructure.finalizeCloudflareStagingPrivateDatabaseRenewal.useMutation({
    onSuccess: async result => {
      setStagingRenewalJobId(""); await refreshTargets();
      const next = { tenantId, projectId, environment: "staging" as const, provider: "cloudflare" as const, configurationRef: result.configurationRef };
      await utils.infrastructure.getCloudflareOriginConfiguration.invalidate(next);
      await Promise.all([utils.infrastructure.getCloudflareOriginConfiguration.fetch(next), stagingDeployPreflight.refetch(), stagingRuntimeReadiness.refetch()]);
    },
  });
  const productionQueueMutation = trpc.infrastructure.prepareCloudflareProductionQueue.useMutation({
    onSuccess: async result => {
      setProductionQueueJobId(result.jobId);
      await latestProductionQueueJob.refetch();
    },
  });
  const productionDatabaseMutation = trpc.infrastructure.prepareCloudflareProductionDatabase.useMutation({
    onSuccess: async (result, variables) => {
      setProductionDatabaseSubmissions(current => ({ ...current, [productionScopeKey]: result.jobId }));
      const accepted: ProductionDatabaseAdmission = { submissionId: variables.submissionId ?? result.jobId, tunnelId: variables.tunnelId,
        status: "JOB_ACCEPTED", jobId: result.jobId };
      setProductionDatabaseAdmissions(current => ({ ...current, [productionScopeKey]: accepted }));
      storeProductionDatabaseAdmission(productionScopeKey, accepted);
      await latestProductionDatabaseJob.refetch();
    },
    onError: (error, variables) => {
      const failure = productionDatabaseAdmissionError(error);
      const admission: ProductionDatabaseAdmission = { submissionId: variables.submissionId ?? crypto.randomUUID(), tunnelId: variables.tunnelId,
        ...failure, traceId: failure.traceId ?? variables.submissionId };
      setProductionDatabaseAdmissions(current => ({ ...current, [productionScopeKey]: admission }));
      storeProductionDatabaseAdmission(productionScopeKey, admission);
      void latestProductionDatabaseJob.refetch();
    },
  });
  const resumeProductionDatabaseMutation = trpc.infrastructure.resumeExpiredCloudflareProductionDatabaseJob.useMutation({
    onSuccess: async result => {
      setProductionDatabaseSubmissions(current => ({ ...current, [productionScopeKey]: result.jobId }));
      await latestProductionDatabaseJob.refetch();
      await productionProviderInventory.refetch();
    },
  });
  useEffect(() => {
    const latestJobId = latestProductionQueueJob.data?.jobId;
    if (latestJobId && latestJobId !== productionQueueJobId) setProductionQueueJobId(latestJobId);
  }, [latestProductionQueueJob.data?.jobId, productionQueueJobId]);
  useEffect(() => {
    if (productionQueueJobData?.status === "succeeded") {
      void Promise.all([productionProviderInventory.refetch(), productionRuntimeReadiness.refetch()]);
    }
  }, [productionQueueJobData?.status]);
  useEffect(() => {
    const latestJobId = latestProductionDatabaseJob.data?.jobId;
    if (latestJobId && productionDatabaseSubmissions[productionScopeKey] !== latestJobId) {
      setProductionDatabaseSubmissions(current => ({ ...current, [productionScopeKey]: latestJobId }));
    }
  }, [latestProductionDatabaseJob.data?.jobId, productionScopeKey, productionDatabaseSubmissions]);
  useEffect(() => {
    const stored = readStoredProductionDatabaseAdmission(productionScopeKey);
    if (stored) {
      const matchingJob = productionDatabaseJobData &&
        (productionDatabaseJobData.jobId === stored.jobId || productionDatabaseJobData.jobId === stored.submissionId)
        ? productionDatabaseJobData : null;
      const reconciledStatus: ProductionDatabaseAdmissionStatus = matchingJob
        ? canonicalDatabaseAdmissionStatus(matchingJob.status)
        : stored.status === "SUBMITTING" ? "ADMISSION_UNKNOWN" : stored.status;
      const reconciled = { ...stored, status: reconciledStatus, jobId: matchingJob?.jobId ?? stored.jobId };
      setProductionDatabaseAdmissions(current => ({ ...current, [productionScopeKey]: reconciled }));
      storeProductionDatabaseAdmission(productionScopeKey, reconciled);
      if (matchingJob?.jobId) {
        setProductionDatabaseSubmissions(current => ({ ...current, [productionScopeKey]: matchingJob.jobId }));
      }
    }
  }, [productionScopeKey, productionDatabaseJobData?.jobId, productionDatabaseJobData?.status]);
  useEffect(() => {
    if (productionDatabaseJobData?.status === "succeeded") {
      void Promise.all([productionProviderInventory.refetch(), productionRuntimeReadiness.refetch()]);
    }
  }, [productionDatabaseJobData?.status]);
  const activateStagingProfile = trpc.infrastructure.activateCloudflareStagingQueueProfile.useMutation({
    onSuccess: async result => {
      setSavedStagingScope({ tenantId, projectId });
      setWorkflowRuntimeToken("");
      setControlPlaneToken("");
      await refreshTargets();
      await utils.infrastructure.listProviderDeploymentTargets.fetch(scope);
      const reboundConfiguration = {
        tenantId,
        projectId,
        environment: "staging" as const,
        provider: "cloudflare" as const,
        configurationRef: result.configurationRef,
      };
      await utils.infrastructure.getCloudflareOriginConfiguration.invalidate(reboundConfiguration);
      await Promise.all([
        utils.infrastructure.getCloudflareOriginConfiguration.fetch(reboundConfiguration),
        stagingDeployPreflight.refetch(),
        stagingRuntimeReadiness.refetch(),
      ]);
    },
  });
  const text = useText();
  const migrationStatusLabel = (status?: string) => {
    const labels: Record<string, [string, string]> = {
      ACCEPTED: ["Accepted", "ผ่านแล้ว"], VERIFIED: ["Verified", "ตรวจยืนยันแล้ว"],
      INCOMPLETE: ["Not yet verified", "ยังไม่ได้ตรวจยืนยัน"], ROLLED_BACK: ["Rolled back", "ย้อนกลับแล้ว"],
      NOT_VERIFIED: ["Not verified", "ยังไม่ได้ตรวจยืนยัน"],
    };
    const pair = status ? labels[status] : undefined;
    return pair ? text(pair[0], pair[1]) : text("Status unavailable", "ไม่มีสถานะ");
  };
  const migrationActionLabel = (action?: string) => {
    const labels: Record<string, [string, string]> = {
      MONITOR_EXISTING_CANONICAL_JOB: ["Track the current canonical job", "ติดตามงานปัจจุบันจากระบบกลาง"],
      RECONCILE_CANONICAL_LEASE: ["Reconcile the worker lease before continuing", "ตรวจสอบ lease ของ worker ก่อนทำต่อ"],
      APPLICATION_ACCEPTANCE: ["Run authenticated application acceptance", "ตรวจรับการทำงานแอปหลังเข้าสู่ระบบ"],
      BOUNDED_RUNTIME_ACCEPTANCE: ["Verify bounded Node/Python runtime", "ตรวจ runtime Node/Python แบบจำกัดขอบเขต"],
      WORKER_DEPLOYMENT_READINESS: ["Verify Worker deployment readiness", "ตรวจความพร้อมก่อน deploy Worker"],
      CREDIT_BILLING_ACCEPTANCE: ["Run synthetic Credit/Billing acceptance", "ทดสอบ Credit/Billing ด้วยข้อมูลสังเคราะห์"],
      QUEUE_RECOVERY_ACCEPTANCE: ["Run Queue/Recovery acceptance", "ทดสอบ Queue และการกู้คืนงาน"],
      PREPARE_NATIVE_ACTIVATION_PLAN: ["Prepare native activation and rollback plan", "เตรียมแผนเปิด native runtime และแผนย้อนกลับ"],
      M3_REMAINING_PARITY_ACCEPTANCE: ["Complete the remaining M3 parity checks", "ทำการตรวจ parity ของ M3 ที่เหลือให้ครบ"],
      PRESERVE_INGRESS_REPAIR_DATABASE_AND_RUNTIME: ["Preserve ingress and complete database/runtime readiness", "คงทางเข้าเดิมและเตรียมฐานข้อมูล/runtime ให้พร้อม"],
      REPAIR_PREFLIGHT_THEN_AUTHORIZE_EXACT_OPERATION: ["Repair the preflight blocker, then authorize the exact operation", "แก้ blocker ของ preflight แล้วจึงยืนยันเฉพาะงานที่ระบุ"],
    };
    const pair = action ? labels[action] : undefined;
    return pair ? text(pair[0], pair[1]) : text("Waiting for canonical mission status", "กำลังรอสถานะภารกิจจากระบบกลาง");
  };
  const ingressBlockerText=(reason:string)=>{
    const messages:Record<string,[string,string]>={
      PRODUCTION_APPROVAL_INGRESS_CONTRACT_NOT_SERVING:["The approval backend needs the ingress release before confirmation is available.","ต้องเผยแพร่ backend ที่รองรับการย้ายทางเข้าเว็บก่อน จึงจะแสดงปุ่มยืนยัน"],
      PRODUCTION_APPROVAL_INGRESS_CONTRACT_UNAVAILABLE:["The approval service contract could not be verified.","ยังตรวจสอบความพร้อมของบริการอนุมัติไม่ได้"],
      PUBLISHED_INGRESS_PROBE_ARTIFACT_REQUIRED:["The tested ingress Worker bundle must be published first.","ต้องเผยแพร่ Worker bundle ที่มีชุดตรวจ ingress ก่อน ยังไม่ต้องกดยืนยัน"],
      LINUX_ORIGIN_PRODUCTION_TRUST_NOT_CONFIGURED:["The Worker-to-Linux production connection needs configuration.","ต้องตั้งค่าการยืนยันตัวตนระหว่าง Worker กับ Linux สำหรับ Production ให้ครบก่อน"],
      RETAINED_ORIGIN_AUTH_PROBE_FAILED:["The existing Linux authentication endpoint failed its ingress probe.","การตรวจระบบยืนยันตัวตนผ่าน Linux origin ยังไม่ผ่าน ต้องแก้ก่อนเปิดทางเข้าเว็บ"],
      INGRESS_ROUTE_ALREADY_EXISTS:["A production ingress route already exists; use its receipt and rollback controls.","มี route ของ Production แล้ว ให้ดูผลการย้ายและปุ่มคืนทางเข้าเดิมด้านล่าง"],
      OWNER_SESSION_AUTHORITY_UNAVAILABLE:["The current session cannot submit approval to the authority service.","session ปัจจุบันยังส่งการยืนยันไปยังบริการอนุมัติไม่ได้ ต้องตรวจการเข้าสู่ระบบ"],
    };
    const pair=messages[reason];return pair?text(pair[0],pair[1]):text("Readiness checks must pass before the migration can start.","ต้องเตรียมระบบให้ผ่านการตรวจความพร้อมก่อนเริ่มย้าย");
  };
  const workerCanaryBlockerText=(reason:string)=>{
    if(reason==="PRODUCTION_QUEUE_ID_INVALID")return text(
      "Cloudflare returned the Production Queue, but its queue_id is missing or invalid. Consumer and DLQ verification was skipped.",
      "พบ Production Queue จาก Cloudflare แต่ไม่มี queue_id หรือรูปแบบไม่ถูกต้อง จึงยังตรวจ consumer และ DLQ ไม่ได้");
    if(reason==="PRODUCTION_QUEUE_NOT_FOUND")return text(
      "The complete Queue inventory does not contain the required Production Queue. No Queue was created.",
      "อ่านรายการ Queue ครบแล้วแต่ไม่พบ Production Queue ที่ต้องใช้ ระบบยังไม่ได้สร้าง Queue ใหม่");
    if(reason==="PRODUCTION_QUEUE_NAME_AMBIGUOUS")return text(
      "More than one Queue has the Production name, so the system cannot safely choose an ID.",
      "พบ Queue ชื่อ Production ซ้ำมากกว่าหนึ่งรายการ ระบบจึงเลือก ID อย่างปลอดภัยไม่ได้");
    if(reason.startsWith("PRODUCTION_QUEUE_CONSUMER_READ_HTTP_")||reason==="PRODUCTION_QUEUE_CONSUMER_READ_UNAVAILABLE")return text(
      "The Production Queue ID is valid, but Cloudflare did not return its consumer inventory. Check Queue read access and recheck.",
      "Queue ID ของ Production ถูกต้อง แต่ยังอ่านรายการ consumer จาก Cloudflare ไม่ได้ ให้ตรวจสิทธิ์อ่าน Queue แล้วตรวจซ้ำ");
    if(reason==="PRODUCTION_QUEUE_CONSUMER_WORKER_MISMATCH")return text(
      "The Queue consumer points to a different Worker than the approved Production Worker.",
      "Queue consumer ผูกกับ Worker คนละตัวกับ Production Worker ที่กำหนดไว้");
    if(reason==="PRODUCTION_QUEUE_DEAD_LETTER_QUEUE_MISMATCH")return text(
      "The Production Queue consumer does not reference the required dead-letter queue.",
      "Queue consumer ยังไม่ได้ผูกกับ dead-letter queue ที่กำหนดไว้");
    if(reason==="PRODUCTION_ORIGIN_CONFIGURATION_NOT_VALID_FOR_BASELINE")return text(
      "The saved Production origin configuration is expired, revoked, or does not match the active Worker baseline. Canary remains blocked until a baseline-compatible configuration is verified.",
      "origin configuration ของ Production หมดอายุ ถูกเพิกถอน หรือ digest ไม่ตรงกับ Worker baseline ปัจจุบัน ต้องยืนยัน configuration ที่เข้ากับ baseline ก่อนจึงเริ่ม Canary ได้");
    if(reason.includes("PERMISSION_DENIED_HTTP_401")||reason.includes("PERMISSION_DENIED_HTTP_403"))return text(
      "The encrypted Production credential was denied this read. Check the named Cloudflare read permission; no deployment change was attempted.",
      "credential Production ที่เข้ารหัสถูกปฏิเสธสิทธิ์อ่าน ให้ตรวจ permission ของ Cloudflare ตามรายการที่ระบุ ระบบยังไม่ได้เปลี่ยน deployment");
    if(reason.includes("PAGINATION"))return text(
      "Cloudflare returned an incomplete or inconsistent deployment page set. Retry the read-only check; no deployment change was attempted.",
      "Cloudflare ส่งหน้ารายการ deployment มาไม่ครบหรือไม่สอดคล้องกัน ให้ตรวจแบบอ่านอย่างเดียวซ้ำ ระบบยังไม่ได้เปลี่ยน deployment");
    if(reason.includes("NOT_FOUND"))return text(
      "No active Worker deployment was found to verify as the rollback baseline.",
      "ไม่พบ Worker deployment ที่กำลังทำงานเพื่อยืนยันเป็น baseline สำหรับย้อนกลับ");
    if(reason.includes("AMBIGUOUS")||reason.includes("IDENTITY_INVALID")||reason.includes("SCHEMA_INVALID"))return text(
      "The deployment response does not identify one verifiable active Worker baseline. Inspect the technical reason before proceeding.",
      "ข้อมูล deployment ยังระบุ Worker baseline ที่กำลังทำงานได้ไม่ชัดเจน ตรวจเหตุผลทางเทคนิคก่อนดำเนินการต่อ");
    if(reason.includes("WEIGHTS_INVALID"))return text(
      "The active deployment traffic weights are invalid or do not total 100%; the canary remains blocked.",
      "สัดส่วน traffic ของ deployment ปัจจุบันไม่ถูกต้องหรือรวมไม่เท่ากับ 100% จึงยังเริ่ม canary ไม่ได้");
    if(reason.includes("RELEASE_IDENTITY_MISSING"))return text(
      "The active Worker version is missing its verified release identity. The system will not guess a rollback baseline.",
      "Worker version ที่ทำงานอยู่ไม่มี release identity ที่ยืนยันได้ ระบบจะไม่คาดเดา baseline สำหรับย้อนกลับ");
    return text("Worker deployment readback is incomplete. Review the exact diagnostic below; no canary traffic was changed.",
      "อ่านข้อมูล Worker deployment กลับมาได้ไม่ครบ ตรวจ diagnostic ด้านล่าง โดยยังไม่มีการเปลี่ยน canary traffic");
  };
  const setNewField = (key: keyof TargetFields) => (event: ChangeEvent<HTMLInputElement>) =>
    setFields(current => ({ ...current, [key]: event.target.value }));
  const requestStagingConfirmation = (action: StagingConfirmation) => {
    if (stagingActionLock.current || stagingActionRunning || stagingConfirmation) return;
    setStagingActionStatus(null);
    setStagingConfirmation(action);
  };
  const confirmStagingAction = async () => {
    if (!stagingConfirmation || stagingActionLock.current) return;
    const action = stagingConfirmation;
    stagingActionLock.current = true;
    setStagingActionRunning(true);
    setStagingActionStatus({ state: "running", action: action.title, at: new Date().toISOString() });
    try {
      const result = await action.run();
      const jobId = result && typeof result === "object" && "jobId" in result && typeof result.jobId === "string"
        ? result.jobId : null;
      setStagingActionStatus({ state: jobId ? "accepted" : "succeeded", action: action.title,
        ...(jobId ? { detail: jobId } : {}), at: new Date().toISOString() });
      setStagingConfirmation(null);
    } catch (error) {
      const message = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "STAGING_ACTION_FAILED";
      setStagingActionStatus({ state: "failed", action: action.title, detail: message, at: new Date().toISOString() });
      setStagingConfirmation(null);
    } finally {
      stagingActionLock.current = false;
      setStagingActionRunning(false);
    }
  };

  return (
    <VStack as="section" gap={4}>
      {environment === "production" && validTenantId && projectId ? <CloudflareLiveMissionStatus tenantId={tenantId} projectId={projectId} /> : null}
      <VStack gap={1}>
        <h2>{text("Deployment targets", "Deployment targets")}</h2>
        <p>{text(
          "Prepare Cloudflare connections, check deployment readiness, and approve the exact production ingress operation shown below.",
          "เตรียมการเชื่อมต่อ Cloudflare ตรวจความพร้อม และยืนยันการย้ายทางเข้าเว็บ Production ตามขอบเขตที่แสดงด้านล่าง",
        )}</p>
        <p>{text("Project ID and App ID are separate identities. The registry stores project/environment scope, not an App ID.", "Project ID และ App ID เป็นคนละ identity โดย registry เก็บ scope ของ project/environment และไม่ได้เก็บ App ID")}
          {" "}{text("Project Wiki package App ID:", "Project Wiki package App ID:")} <code>{PROJECT_WIKI_APP_ID}</code>
          {" "}{text("Validate the app binding separately before deployment.", "ต้องตรวจ app binding แยกก่อน deploy")}
        </p>
        <p>{text("This registry authorizes Cloudflare only. Other providers are shown for visibility and cannot be changed here.", "registry นี้ให้สิทธิ์เฉพาะ Cloudflare ผู้ให้บริการอื่นจะแสดงเพื่อให้อ้างอิง แต่แก้ไขจากหน้านี้ไม่ได้")}</p>
      </VStack>

      <HStack gap={3} wrap="wrap" width="100%">
        <VStack gap={1} style={{ flex: "1 1 22rem", minWidth: "min(100%, 22rem)" }}>
          <Label htmlFor="deployment-tenant">{text("Authenticated tenant", "Tenant ที่ยืนยันตัวตนแล้ว")}</Label>
          <SearchableScopeSelect
            label={text("Authenticated tenant", "Tenant ที่ยืนยันตัวตนแล้ว")}
            placeholder={text("Select tenant", "เลือก tenant")}
            searchPlaceholder={text("Search tenant name, domain, or ID…", "ค้นหาชื่อ domain หรือ ID ของ tenant…")}
            emptyMessage={text("No tenant matches this search.", "ไม่พบ tenant ที่ตรงกับคำค้น")}
            options={visibleTenants.map(tenant => {
              const id = String(tenant.id);
              const domain = typeof tenant.domain === "string" ? tenant.domain : "";
              const kindLabel = tenant.selectorKind === "test" ? text("Test", "ทดสอบ")
                : tenant.selectorKind === "system" ? text("System", "ระบบ")
                : tenant.selectorKind === "inactive" ? text("Inactive", "ไม่ได้ใช้งาน") : "";
              return {
                value: id,
                label: `${tenant.name} · ${id}${kindLabel ? ` · ${kindLabel}` : ""}`,
                searchValue: `${tenant.name} ${domain} ${id}`,
              };
            })}
            value={tenantId}
            menuSize="tenant"
            disabled={(tenantsQuery.isLoading || tenantsQuery.isError) && !tenantsQuery.data}
            onValueChange={value => { setTenantId(value); setProjectId(""); setWorkflowRuntimeToken(""); setControlPlaneToken(""); }}
          />
          {tenantsQuery.isLoading ? <p role="status">{text("Loading tenant list…", "กำลังโหลดรายการ tenant…")}</p> : null}
          {tenantsQuery.isError ? <VStack gap={1} role="alert">
            <p>{text("The tenant list request failed. Saved tenant data was not changed. Retry the request.", "โหลดรายการ tenant ไม่สำเร็จ ระบบไม่ได้แก้ไขข้อมูล tenant ที่บันทึกไว้ กรุณาลองโหลดอีกครั้ง")}</p>
            <Button type="button" variant="outline" size="sm" disabled={tenantsQuery.isFetching} onClick={() => { void tenantsQuery.refetch(); }}>
              {text("Retry tenant list", "ลองโหลดรายการ tenant อีกครั้ง")}
            </Button>
          </VStack> : null}
          {tenantsQuery.isSuccess && visibleTenants.length === 0 ? <p role="status">{text(
            showNonOperationalTenants ? "No tenants are available in the returned inventory." : "No active business tenants were returned. Enable test, system, and inactive tenants below to inspect retained records.",
            showNonOperationalTenants ? "ไม่พบ tenant ในรายการที่ระบบส่งกลับมา" : "ไม่พบ tenant ธุรกิจที่ Active เปิดตัวเลือก tenant ทดสอบ ระบบ หรือไม่ใช้งานด้านล่างเพื่อดูข้อมูลที่เก็บไว้",
          )}</p> : null}
          {tenantId && !validTenantId ? <p role="status">{text("Select an existing tenant to configure deployment targets.", "เลือก tenant ที่มีอยู่ในระบบเพื่อตั้งค่า deployment target")}</p> : null}
        </VStack>
        <VStack gap={1} style={{ flex: "2 1 36rem", minWidth: "min(100%, 36rem)" }}>
          <Label htmlFor="deployment-project">{text("Canonical project", "Canonical project")}</Label>
          <SearchableScopeSelect
            label={text("Canonical project", "Canonical project")}
            placeholder={text("Select project", "เลือก project")}
            searchPlaceholder={text("Search project name or ID…", "ค้นหาชื่อหรือ ID ของ project…")}
            emptyMessage={text("No active project matches this search.", "ไม่พบ project ที่ active และตรงกับคำค้น")}
            options={(projectsQuery.data ?? []).map(project => ({ value: project.projectId, label: `${project.title} · ${project.projectType} · ${project.projectId}` }))}
            value={projectId}
            menuSize="project"
            disabled={!validTenantId || projectsQuery.isLoading}
            onValueChange={value => { setProjectId(value); setWorkflowRuntimeToken(""); setControlPlaneToken(""); }}
          />
          {validTenantId && !projectsQuery.isLoading && projectsQuery.data?.length === 0 ? <p role="status">{text("No active canonical projects were found for this tenant.", "ไม่พบ canonical project ที่ active ใน tenant นี้")}</p> : null}
        </VStack>
        <VStack gap={1} style={{ flex: "0 0 14rem", minWidth: "min(100%, 14rem)" }}>
          <Label htmlFor="deployment-environment">{text("Environment", "Environment")}</Label>
          <Select value={environment} onValueChange={value => { setEnvironment(value); setWorkflowRuntimeToken(""); setControlPlaneToken(""); }}>
            <SelectTrigger id="deployment-environment"><SelectValue placeholder={text("Select environment", "เลือก environment")} /></SelectTrigger>
            <SelectContent>{ENVIRONMENTS.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
          </Select>
        </VStack>
      </HStack>

      {validScope && environment === "production" ? <Section variant="muted" role="region" aria-label={text("Cloudflare migration control center", "ศูนย์ควบคุมการย้ายระบบ Cloudflare")}>
        <VStack gap={2}>
          <h2>{text("Cloudflare Migration Control Center", "ศูนย์ควบคุมการย้ายระบบ Cloudflare")}</h2>
          <p role="status">{text("Current milestone", "ขั้นปัจจุบัน")}: {migrationMission.data?.currentMilestone ?? text("Checking the saved migration checkpoint…", "กำลังตรวจ checkpoint การย้ายระบบ")}</p>
          <p role="status">{text("Next action", "ขั้นตอนถัดไป")}: {migrationActionLabel(migrationMission.data?.nextOperation)}</p>
          <VStack as="section" gap={1} role="group" aria-label={text("First migration mandate", "อำนาจภารกิจย้ายระบบครั้งแรก")}>
            <strong>{text("Implementation readiness", "ความพร้อมของระบบ")}: {migrationMandatePlan.isLoading
              ? text("Checking exact resources…", "กำลังตรวจทรัพยากรจริง…")
              : migrationMandatePlan.data?.ready ? text("READY · exact resources verified", "พร้อม · ตรวจทรัพยากรจริงครบแล้ว") : text("BLOCKED", "ติดเงื่อนไข")}</strong>
            {!migrationMandatePlan.data?.ready && migrationMandatePlan.data?.reason ?
              <p role="status">{text("No authorization action is available until this check passes:", "ยังไม่เปิดให้อนุมัติจนกว่าจะผ่านรายการนี้:")} <code>{migrationMandatePlan.data.reason}</code></p> : null}
            <strong>{text("Owner authorization", "การอนุมัติของ Owner")}: {migrationMandate.isError ? text("READBACK UNAVAILABLE", "อ่านสถานะไม่ได้")
              : migrationMandateValue?.status ?? text("NOT ENROLLED", "ยังไม่ได้อนุมัติ")}</strong>
            {migrationMandateValue?.status === "ACTIVE" ? <>
              <p>{text("Mandate", "อำนาจภารกิจ")}: <code>{migrationMandateValue.mandateRef}</code> · {text("Current step", "ขั้นปัจจุบัน")}: {migrationMission.data?.currentMilestone}
                · {text("Next operation", "งานถัดไป")}: {migrationActionLabel(migrationMission.data?.nextOperation)}
                · {text("Running job", "งานที่กำลังทำ")}: <code>{migrationMission.data?.activeJobId ?? text("none", "ไม่มี")}</code></p>
              <p role="status">{text("Mandate status is read back from Approval Service. Only operation grants explicitly wired to aggregate quota reservation may execute; other migration actions remain blocked until their admission and executor checks are integrated.",
                "สถานะ mandate อ่านจาก Approval Service งานจะทำงานได้เฉพาะ operation grant ที่ผูกกับการจองโควตารวมแล้ว ส่วนงานย้ายระบบอื่นยังถูกบล็อกจนกว่าจะเชื่อม admission และ executor ให้ครบ")}</p>
              <p>{text("Currently enforced operations", "งานที่บังคับใช้สิทธิ์ครบแล้ว")}: <code>credit_billing_acceptance, queue_recovery_acceptance</code></p>
              <p role="alert">{text("Worker deployment/canary, origin configuration, native runtime activation and rollback are not covered yet. The mandate cannot be enrolled as a complete-migration authorization until those paths enforce the same scoped grants and quotas.",
                "ยังไม่ครอบคลุม Worker deployment/canary, origin configuration, native runtime activation และ rollback จึงยังลงทะเบียนอำนาจสำหรับการย้ายให้ครบไม่ได้ จนกว่าเส้นทางเหล่านี้จะตรวจ scoped grant และโควตาเดียวกัน")}</p>
              <p>{text("Reserved / remaining enforceable quotas", "โควตาที่จองแล้ว / คงเหลือ")}: <code>{Object.entries(migrationMandateValue.resourceUsage ?? {}).map(([key, value]) =>
                `${key}=${value}/${migrationMandateValue.remainingResourceBudget?.[key] ?? "—"}`).join(" · ")}</code></p>
              <HStack gap={1}>
                <Button type="button" variant="outline" disabled={changeMigrationMandate.isPending} onClick={() => {
                  if (window.confirm(text("Suspend this migration mandate? New operations will be denied.", "ระงับอำนาจภารกิจนี้หรือไม่ งานใหม่จะถูกปฏิเสธ")))
                    changeMigrationMandate.mutate({ tenantId, projectId, environment: "production", mandateRef: migrationMandateValue.mandateRef!,
                      state: "suspend", reason: "Owner requested mandate suspension" });
                }}>{text("Suspend mandate", "ระงับอำนาจ")}</Button>
                <Button type="button" variant="destructive" disabled={changeMigrationMandate.isPending} onClick={() => {
                  if (window.confirm(text("Revoke this mandate permanently? It cannot be reactivated.", "เพิกถอนอำนาจภารกิจถาวรหรือไม่ ไม่สามารถเปิดกลับได้")))
                    changeMigrationMandate.mutate({ tenantId, projectId, environment: "production", mandateRef: migrationMandateValue.mandateRef!,
                      state: "revoke", reason: "Owner requested mandate revocation" });
                }}>{text("Revoke permanently", "เพิกถอนถาวร")}</Button>
              </HStack>
              <details><summary>{text("Authorization history", "ประวัติการอนุมัติ")}</summary>
                <pre>{JSON.stringify(migrationMandateHistory.data ?? { state: migrationMandateHistory.isLoading ? "LOADING" : "UNAVAILABLE" }, null, 2)}</pre>
              </details>
            </> : null}
            {migrationMandate.data && migrationMandateValue?.status == null && migrationMandatePlan.data?.ready ? <>
              <p>{text("One Owner enrollment covers only the exact resources and operations shown below. It preserves M2 ingress, Linux fallback, on-demand Containers and rollback limits. Native runtime activation is included and changes production traffic.",
                "การอนุมัติครั้งเดียวครอบคลุมเฉพาะทรัพยากรและงานที่แสดง คง M2, Linux fallback, Container แบบ on-demand และขอบเขต rollback โดยรวมการเปิด native runtime ซึ่งเปลี่ยน Production traffic")}</p>
              <p>{text("Allowed operations", "งานที่อนุญาต")}: <code>{migrationMandatePlan.data.plan.actions.join(", ")}</code></p>
              <p>{text("Exact resource IDs", "ID ทรัพยากรที่ระบุ")}: <code>{Object.entries(migrationMandatePlan.data.plan.resourceIds).map(([key, value]) => `${key}=${value}`).join(" · ")}</code></p>
              <p>{text("Enforceable resource budget", "เพดานทรัพยากรที่บังคับใช้ได้")}: <code>{Object.entries(migrationMandatePlan.data.resourceBudget).map(([key, value]) => `${key}=${value}`).join(" · ")}</code></p>
              <p role="note">{text("This is not a hard monetary cap. Check Cloudflare billing alerts separately.", "นี่ไม่ใช่เพดานค่าใช้จ่ายเงินจริง โปรดตรวจ Cloudflare billing alerts แยกต่างหาก")}</p>
              <Button type="button" disabled={enrollMigrationMandate.isPending || migrationMandatePlan.isFetching}
                onClick={() => setMandateDialogOpen(true)}>{text("Authorize Complete First Cloudflare Migration", "อนุมัติการย้าย Cloudflare ให้เสร็จสมบูรณ์")}</Button>
              {enrollMigrationMandate.error ? <p role="alert">{text("Enrollment failed:", "ลงทะเบียนไม่สำเร็จ:")} <code>{enrollMigrationMandate.error.message}</code></p> : null}
              <Dialog open={mandateDialogOpen} onOpenChange={setMandateDialogOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{text("Authorize Complete First Cloudflare Migration", "อนุมัติการย้าย Cloudflare ให้เสร็จสมบูรณ์")}</DialogTitle>
                    <DialogDescription>{text("Review the exact resource scope and operational limits. This creates one durable, revocable Owner mandate; it does not immediately change production traffic.",
                      "ตรวจขอบเขตทรัพยากรและเพดานงานก่อนยืนยัน การกดนี้สร้างอำนาจ Owner หนึ่งรายการที่เพิกถอนได้ และยังไม่เปลี่ยน production traffic ทันที")}</DialogDescription>
                  </DialogHeader>
                  <p>{text("Mission", "ภารกิจ")}: <code>{migrationMandatePlan.data.plan.missionId}</code></p>
                  <p>{text("Traffic action included", "รวมการเปลี่ยน traffic")}: <code>native_runtime_activation</code></p>
                  <p>{text("Rollback", "Rollback")}: {text("Preserve M2 and Linux; restore accepted Worker baseline after failed acceptance; Containers stay on-demand.",
                    "คง M2 และ Linux; คืน Worker baseline ที่ยอมรับแล้วเมื่อการตรวจรับไม่ผ่าน; Container เริ่มเมื่อเรียกใช้")}</p>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setMandateDialogOpen(false)}>{text("Review again", "กลับไปตรวจ")}</Button>
                    <Button type="button" disabled={enrollMigrationMandate.isPending} onClick={() => enrollMigrationMandate.mutate({
                      tenantId, projectId, environment: "production", idempotencyKey: migrationMandateIdempotencyKey(tenantId, projectId),
                      expectedPlanDigest: migrationMandatePlan.data.planDigest, plan: migrationMandatePlan.data.plan,
                    })}>{enrollMigrationMandate.isPending ? text("Enrolling…", "กำลังลงทะเบียน…") : text("Confirm one-time mandate", "ยืนยันอำนาจครั้งเดียว")}</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </> : null}
          </VStack>
          {(() => {
            const milestones = migrationMission.data?.milestones;
            const accepted = (value?: string) => value === "ACCEPTED" || value === "VERIFIED";
            const completed = [milestones?.m1, milestones?.m2, milestones?.application, milestones?.workerDeployment,
              milestones?.boundedRuntime, milestones?.creditBilling, milestones?.queueRecovery, milestones?.m3,
              milestones?.nativeActivation, milestones?.finalProductionCutover].filter(accepted).length;
            return <p role="status">{text("Verified gates", "ด่านที่ตรวจรับแล้ว")}: {completed} / 10</p>;
          })()}
          <VStack as="ol" gap={1} aria-label={text("Migration progress", "ความคืบหน้าการย้ายระบบ")}>
            <li>M1 · {migrationStatusLabel(migrationMission.data?.milestones?.m1 ?? (productionDatabaseObservation?.tenantIsolationVerified ? "ACCEPTED" : "INCOMPLETE"))}</li>
            <li>M2 · {migrationStatusLabel(migrationMission.data?.milestones?.m2 ?? (acceptedIngress ? "ACCEPTED" : "INCOMPLETE"))}</li>
            <li>{text("Authenticated application", "การตรวจรับแอปที่ยืนยันตัวตน")}: {migrationStatusLabel(migrationMission.data?.milestones?.application)}</li>
            <li>{text("Worker deployment", "การ deploy Worker")}: {migrationStatusLabel(migrationMission.data?.milestones?.workerDeployment)}</li>
            <li>{text("Bounded Node/Python runtime", "การทดสอบ runtime Node/Python แบบจำกัด")}: {migrationStatusLabel(migrationMission.data?.milestones?.boundedRuntime)}</li>
            <li>{text("Credit and billing", "เครดิตและการเรียกเก็บเงิน")}: {migrationStatusLabel(migrationMission.data?.milestones?.creditBilling)}</li>
            <li>{text("Queue and recovery", "Queue และการกู้คืนงาน")}: {migrationStatusLabel(migrationMission.data?.milestones?.queueRecovery)}</li>
            <li>M3 · {migrationStatusLabel(migrationMission.data?.milestones?.m3)}</li>
            <li>{text("Native activation", "เปิดใช้งาน native runtime")}: {migrationStatusLabel(migrationMission.data?.milestones?.nativeActivation)}</li>
            <li>{text("Final production cutover", "ตัดระบบ Production ขั้นสุดท้าย")}: {migrationStatusLabel(migrationMission.data?.milestones?.finalProductionCutover)}</li>
          </VStack>
          <p>{text("Linux remains the application fallback. The accepted Cloudflare ingress and on-demand Container policy stay unchanged during M3 tests.",
            "Linux ยังคงพร้อมเป็นระบบสำรอง และทางเข้า Cloudflare ที่ผ่านการตรวจรับแล้วจะไม่เปลี่ยนระหว่างทดสอบ M3")}</p>
          <p><a href="#cloudflare-m3-runtime-operation">{text("Continue the current M3 step", "ไปทำขั้น M3 ปัจจุบันต่อ")}</a></p>
          <details>
            <summary>{text("History and advanced diagnostics", "ประวัติและรายละเอียดทางเทคนิค")}</summary>
            <p>{text("M1 database and tenant isolation evidence, M2 ingress receipts, provider inventory, and canonical job history remain below.",
              "หลักฐานฐานข้อมูลและการแยก tenant ของ M1, receipt ทางเข้าระบบ M2, inventory ของผู้ให้บริการ และประวัติ canonical job อยู่ด้านล่าง")}</p>
            <p><a href="#cloudflare-provider-diagnostics">{text("Jump to provider and job diagnostics", "ไปยังรายละเอียด provider และ job")}</a></p>
          </details>
        </VStack>
      </Section> : null}

      <VStack gap={1}>
        <CheckboxInput
          label={text("Show test, system, and inactive tenants", "แสดง tenant ทดสอบ ระบบ และที่ไม่ได้ใช้งาน")}
          value={showNonOperationalTenants}
          onChange={checked => {
            setShowNonOperationalTenants(checked);
            if (!checked && !operationalTenants.some(tenant => tenant.id === tenantId)) {
              setTenantId(""); setProjectId(""); setWorkflowRuntimeToken(""); setControlPlaneToken("");
            }
          }}
        />
        {tenantsQuery.data ? <p role="status">{showNonOperationalTenants
          ? text(`Showing all ${tenantInventory.length} tenants, including retained test and system records.`, `แสดง tenant ทั้งหมด ${tenantInventory.length} รายการ รวมข้อมูลทดสอบและระบบที่เก็บไว้`)
          : text(`Showing ${operationalTenants.length} active business tenants; ${tenantInventory.length - operationalTenants.length} test, system, or inactive records hidden.`, `แสดง tenant ปกติที่ Active ${operationalTenants.length} รายการ · ซ่อนข้อมูลทดสอบ ระบบ หรือที่ไม่ได้ใช้งาน ${tenantInventory.length - operationalTenants.length} รายการ`)
        }</p> : null}
      </VStack>

      {validScope && environment === "production" ? <p role="status">{text(
        "Production preparation will reuse the verified Staging account when available and the repository’s fixed Worker name. Confirming creates only the destination record; it does not deploy, change DNS/routes, or move traffic. The production credential and independent cutover approval remain separate safeguards.",
        "ระบบจะดึง Cloudflare account จาก Staging ที่บันทึกไว้ และใช้ชื่อ Worker มาตรฐานของระบบ การยืนยันด้านล่างสร้างเฉพาะข้อมูลปลายทาง ยังไม่ deploy ไม่เปลี่ยน DNS/routes และไม่ย้าย traffic ส่วน credential สำหรับ Production และการอนุมัติ cutover ยังคงแยกต่างหาก",
      )}</p> : null}
      {validScope && environment === "production" && !targetsQuery.isLoading && !targetsQuery.isError && cloudflareTargets.length === 0 ? (
        <VStack as="section" gap={2}>
          <h3>{text("Prepare the Production destination", "เตรียมปลายทาง Production")}</h3>
          <p>{text(
            "The system has filled the values it can verify. Review the exact destination, then confirm once to save it. No secret is copied from Staging.",
            "ระบบเติมค่าที่ตรวจสอบได้ให้แล้ว ตรวจปลายทางด้านล่างและกดยืนยันหนึ่งครั้งเพื่อบันทึก ระบบจะไม่คัดลอก secret จาก Staging",
          )}</p>
          <VStack gap={1}>
            <p>{text("Deployment target", "ปลายทาง deployment")}: <code>{CLOUDFLARE_PRODUCTION_WORKER_ID}</code></p>
            <p>{text("Cloudflare account", "Cloudflare account")}: {stagingTargetsQuery.isLoading ? text("Reading verified Staging target…", "กำลังอ่าน target Staging…")
              : stagingTargetsQuery.isError ? text("Could not read Staging account details", "อ่านข้อมูล account จาก Staging ไม่สำเร็จ")
                : inferredProductionAccountRef ? <code>{inferredProductionAccountRef}</code>
                  : text("Not available from the selected Staging target", "ไม่พบจาก Staging target ที่เลือก")}</p>
            <p>{text("Worker", "Worker")}: <code>{CLOUDFLARE_PRODUCTION_WORKER_ID}</code></p>
            <p>{text("Container", "Container")}: {text("Not required for this Worker target", "ไม่ต้องใช้สำหรับ Worker target นี้")}</p>
          </VStack>
          {!inferredProductionAccountRef && !stagingTargetsQuery.isLoading ? <p role="alert">{text(
            "The account ID could not be verified from this project’s enabled Staging target. Select the correct tenant/project or configure its Staging target first; the system will not guess an account ID.",
            "ยืนยัน account ID จาก Staging target ที่เปิดใช้งานของ project นี้ไม่ได้ กรุณาเลือก tenant/project ให้ถูกต้อง หรือบันทึก Staging target ก่อน ระบบจะไม่เดา account ID",
          )}</p> : null}
          <p>{text(
            "After this record is saved, the next required setup is a Production-scoped Cloudflare API token. The existing credential screen will show whether it is configured. Deployment and traffic cutover still require their production grant and verified rollback/canary checks.",
            "หลังบันทึกแล้ว ขั้นถัดไปคือ token Cloudflare ที่จำกัด scope สำหรับ Production โดยเฉพาะ หน้าจอ credential เดิมจะแสดงสถานะให้ การ deploy และย้าย traffic ยังต้องมี production grant พร้อมผ่าน rollback/canary checks",
          )}</p>
          <Button type="button" disabled={!canCreate || !inferredProductionAccountRef || stagingTargetsQuery.isLoading || stagingTargetsQuery.isError || createMutation.isPending}
            onClick={() => createMutation.mutate({
              ...scope,
              provider: "cloudflare",
              deploymentTargetId: CLOUDFLARE_PRODUCTION_WORKER_ID,
              accountRef: inferredProductionAccountRef,
              workerRef: CLOUDFLARE_PRODUCTION_WORKER_ID,
              containerApplicationRef: null,
              provenance: `Production destination confirmed by admin ${new Date().toISOString()}`,
            })}>
            {createMutation.isPending ? text("Saving Production destination…", "กำลังบันทึกปลายทาง Production…")
              : text("Confirm and prepare Production destination", "ยืนยันและเตรียมปลายทาง Production")}
          </Button>
          {createMutation.error ? <p role="alert">{createMutation.error.message}</p> : null}
        </VStack>
      ) : null}
      {validScope && environment === "production" ? (
        <VStack as="section" gap={2}>
          <HStack gap={2} wrap="wrap">
            <h3>{text("Live Cloudflare production Worker readiness", "ความพร้อมของ Cloudflare production Worker ที่กำลังทำงาน")}</h3>
            <Button type="button" variant="outline" size="sm" onClick={() => void Promise.all([
              productionRuntimeReadiness.refetch(), productionProviderInventory.refetch(),
              productionIngressPreflight.refetch(),latestProductionIngressJob.refetch(),
            ])} disabled={productionRuntimeReadiness.isFetching || productionProviderInventory.isFetching}>
              {text("Check now", "ตรวจสอบตอนนี้")}
            </Button>
          </HStack>
          {productionRuntimeReadiness.isLoading ? <p role="status">{text("Checking runtime.smartaihub.app/readyz…", "กำลังตรวจ runtime.smartaihub.app/readyz…")}</p> : null}
          {productionRuntimeReadiness.isError ? <p role="alert">{text("Production Worker readiness could not be checked. This probe is read-only and does not verify deployment authority or app traffic cutover.", "ตรวจ readiness ของ production Worker ไม่สำเร็จ การตรวจนี้อ่านข้อมูลอย่างเดียว และไม่ได้ยืนยัน deployment authority หรือการย้าย app traffic")}</p> : null}
          {productionRuntimeReadiness.data ? (() => {
            const runtime = productionRuntimeReadiness.data;
            const ready = runtime.status === "READY";
            const otherUnconfigured = runtime.unconfigured.filter(binding => !runtime.missing.includes(binding));
            const ingress = runtime.applicationIngress;
            return <VStack gap={1} role={ready ? "status" : "group"} aria-label={text("Live Cloudflare production Worker readiness", "ความพร้อมของ Cloudflare production Worker ที่กำลังทำงาน")}>
              <strong>{text("Background-job Worker readiness", "ความพร้อมของ Worker สำหรับงานเบื้องหลัง")}</strong>
              <HStack gap={2} wrap="wrap">
                <Badge variant={ready ? "default" : "destructive"}>{ready ? text("Jobs ready", "ระบบงานเบื้องหลังพร้อม") : text("Jobs not ready", "ระบบงานเบื้องหลังยังไม่พร้อม")}</Badge>
                {runtime.activation ? <Badge variant="outline">{text("Worker activation", "การเปิด Worker")}: {runtime.activation === "disabled" ? text("off", "ปิดอยู่") : runtime.activation}</Badge> : null}
                {runtime.transport ? <Badge variant="outline">{text("Job transport", "ช่องทางงาน")}: {runtime.transport}</Badge> : null}
                {runtime.jobHandlerConfigured !== undefined ? <Badge variant="outline">{text("Job handler", "ตัวจัดการงาน")}: {runtime.jobHandlerConfigured ? text("configured", "ตั้งค่าแล้ว") : text("missing", "ยังไม่ตั้งค่า")}</Badge> : null}
                {runtime.controlPlaneConfigured !== undefined ? <Badge variant="outline">{text("Control plane", "control plane")}: {runtime.controlPlaneConfigured ? text("configured", "ตั้งค่าแล้ว") : text("missing", "ยังไม่ตั้งค่า")}</Badge> : null}
              </HStack>
              {runtime.missing.length > 0 ? <VStack gap={1}>
                <p>{text("Required before the Production Worker can accept jobs:", "สิ่งที่ต้องตั้งค่าก่อน Production Worker จะรับงานได้:")}</p>
                {runtime.missing.includes("HYPERDRIVE") ? <p>• {text("Connect the existing PostgreSQL database through Cloudflare Hyperdrive.", "เชื่อม PostgreSQL เครื่องเดิมผ่าน Cloudflare Hyperdrive")}</p> : null}
                {runtime.missing.includes("JOB_QUEUE") ? <p>• {text("Bind the production Cloudflare Queue used by background jobs.", "ผูก Cloudflare Queue สำหรับงานเบื้องหลังของ Production")}</p> : null}
              {runtime.missing.some(binding => !["HYPERDRIVE", "JOB_QUEUE"].includes(binding)) ? <p>{text("Additional required runtime bindings", "binding runtime ที่จำเป็นเพิ่มเติม")}: <code>{runtime.missing.filter(binding => !["HYPERDRIVE", "JOB_QUEUE"].includes(binding)).join(", ")}</code></p> : null}
              {runtime.missing.length > 0 ? <VStack as="ol" gap={1}>
                {runtime.missing.map(binding => <li key={binding}><strong>{binding}</strong>: {text(productionBindingHelp[binding]?.en ?? "Configure this binding in the production Worker.", productionBindingHelp[binding]?.th ?? "ตั้งค่า binding นี้ใน production Worker")}</li>)}
              </VStack> : null}
              </VStack> : null}
              <Divider />
              <strong>{text("Website and API traffic cutover readiness", "ความพร้อมย้าย traffic ของเว็บไซต์และ API")}</strong>
              {!ingress ? <p role="status">{text(
                "The serving Worker does not report full application-ingress readiness yet. A ready queue does not mean website/API traffic can move from Linux.",
                "Worker ที่ให้บริการยังไม่รายงานความพร้อมของ full application ingress การที่ Queue พร้อมไม่ได้แปลว่าย้ายเว็บไซต์/API ออกจาก Linux ได้แล้ว",
              )}</p> : <>
                <Badge variant={ingress.ready ? "default" : "destructive"}>{ingress.ready
                  ? text("Website/API ingress ready", "เว็บไซต์/API ingress พร้อม")
                  : text("Website/API ingress not ready", "เว็บไซต์/API ingress ยังไม่พร้อม")}</Badge>
                {ingress.missing.length > 0 ? <>
                  <p>{text("The full app path needs both on-demand Node and Python Cloudflare Containers, their exact production profiles, and the origin-auth settings below:", "เส้นทางแอปเต็มรูปแบบต้องมี Cloudflare Container แบบ on-demand ทั้ง Node และ Python, production profile ที่ตรงกัน และค่า origin-auth ตามรายการนี้")}</p>
                  <VStack as="ul" gap={1}>{ingress.missing.map(binding => <li key={binding}><strong>{binding}</strong>: {text(productionBindingHelp[binding]?.en ?? "Configure this production app-ingress setting.", productionBindingHelp[binding]?.th ?? "ตั้งค่ารายการ app-ingress ของ production นี้")}</li>)}</VStack>
                </> : null}
              </>}
              <p>{text("Job transport readiness and website/API cutover are separate checks. Containers stay on-demand; they are required for the current full HTTP app bridge, not for queue delivery alone.", "ความพร้อมของ job transport กับการย้ายเว็บไซต์/API เป็นคนละการตรวจ Container จะเริ่มตามต้องใช้ โดยจำเป็นต่อ full HTTP app bridge ปัจจุบัน แต่ไม่จำเป็นต่อการส่งงาน Queue อย่างเดียว")}</p>
              {otherUnconfigured.length > 0 ? <details><summary>{text("Optional capabilities not enabled", "ความสามารถเสริมที่ยังไม่ได้เปิด")}</summary><p>{text("These do not block the selected job transport. Add them only if the production workload needs them:", "รายการเหล่านี้ไม่บล็อกช่องทางงานที่เลือก ให้เพิ่มเมื่อ workload ต้องใช้เท่านั้น")}: <code>{otherUnconfigured.join(", ")}</code></p></details> : null}
              {runtime.reason ? <details><summary>{text("Technical diagnostics", "รายละเอียดสำหรับทีมเทคนิค")}</summary><code>{runtime.status} · {runtime.reason} · {runtime.missing.join(", ")}</code></details> : null}
              {runtime.transport === "all" ? <p>{text("No production job transport has been selected. Containers should be provisioned only for workloads that require isolated application execution.", "ยังไม่ได้เลือก job transport สำหรับ production ให้ provision Container เฉพาะ workload ที่ต้องแยก application runtime")}</p> : null}
              <p>{text("This checks the fixed production Worker endpoint only. A healthy response does not prove the approved artifact, retained-database access, authentication flows, rollback, or production traffic cutover.", "การตรวจนี้ดูเฉพาะ production Worker endpoint ที่กำหนดไว้ ผล healthy ไม่ได้ยืนยัน artifact ที่อนุมัติ การเข้าถึงฐานข้อมูลเดิม ระบบยืนยันตัวตน rollback หรือการย้าย production traffic")}</p>
              <p className="text-xs text-muted-foreground">{text("Checked", "ตรวจเมื่อ")}: {new Date(runtime.checkedAt).toLocaleString()}</p>
            </VStack>;
          })() : null}
          <Divider />
          <strong id="cloudflare-provider-diagnostics">{text("What Cloudflare has actually provisioned", "ทรัพยากรที่มีอยู่จริงบน Cloudflare")}</strong>
          {productionDatabaseObservation?.databaseConnectionVerified && productionDatabaseJobData?.jobId ?
            <CloudflareMigrationPreparation key={`migration-preparation:${scope.tenantId}:${scope.projectId}`} tenantId={scope.tenantId}
              projectId={scope.projectId} jobId={productionDatabaseJobData.jobId} databaseAccepted={productionDatabaseObservation.tenantIsolationVerified} />
            : <CloudflareImagePublication key={`${scope.tenantId}:${scope.projectId}`} tenantId={scope.tenantId} projectId={scope.projectId} />}
          {productionDatabaseObservation?.providerReadbackVerified ? <VStack gap={1} role="status" aria-label={text("Production database verification", "ผลตรวจฐานข้อมูล Production")}>
            <strong>{text("Existing VPC and Hyperdrive verified", "ตรวจยืนยัน VPC และ Hyperdrive เดิมแล้ว")}</strong>
            <p>{text("Cloudflare SQL", "SQL จาก Cloudflare")}: {productionDatabaseObservation.databaseConnectionVerified ? "PASS" : "NOT_EXECUTED"}</p>
            <p>{productionDatabaseObservation.tenantIsolationVerified ? "M1_ACCEPTED"
              : productionDatabaseObservation.databaseConnectionVerified
              ? text("Remaining: verify tenant isolation. The original failed attempt remains in history; no provisioning retry is needed for this readback.", "ขั้นที่เหลือ: ตรวจการแยกข้อมูล tenant โดยเก็บผลล้มเหลวเดิมไว้ในประวัติ ไม่ต้องรัน provisioning ซ้ำเพื่อตรวจ readback")
              : text("Remaining: verify SQL from Cloudflare and tenant isolation. No provisioning retry is needed for this readback.", "ขั้นที่เหลือ: ตรวจ SQL จาก Cloudflare และการแยกข้อมูล tenant ไม่ต้องรัน provisioning ซ้ำเพื่อตรวจ readback")}</p>
          </VStack> : null}
          <VStack as="section" gap={2} role="group" aria-label={text("Cloudflare ingress migration", "ย้ายทางเข้าเว็บไป Cloudflare")}>
            <h3>{text("Cloudflare ingress: web and API", "ทางเข้าเว็บและ API ผ่าน Cloudflare")}</h3>
            {migrationMission.data ? <VStack gap={1} role="status" aria-label={text("Migration mission", "ภารกิจย้ายระบบ")}>
              <p>{migrationMission.data.migrationMode} · {migrationMission.data.state} · {text("Next milestone", "ขั้นต่อไป")}: {migrationMission.data.currentMilestone}</p>
              <p>{text("The migration continues from its saved checkpoint across agent sessions and expired operation grants. Each production operation still needs valid scoped authority.", "ภารกิจดำเนินต่อจาก checkpoint เดิม แม้เปลี่ยน session หรือ grant ของงานหมดอายุ แต่ละ production operation ยังต้องมีสิทธิ์ตรงขอบเขตที่มีผลอยู่")}</p>
              {migrationMission.data.agentCapacity === "WAITING_AGENT_CAPACITY" ? <p>{text("Engineering is waiting for agent capacity; authorized backend jobs continue independently.", "งานพัฒนารอ agent capacity งาน backend ที่อนุมัติแล้วดำเนินต่อได้")}</p> : null}
            </VStack> : null}
            {acceptedIngress ? <VStack gap={1} role="status" aria-label="M2_ACCEPTED">
              <strong>{text("M2_ACCEPTED — Cloudflare production ingress is operating", "M2_ACCEPTED — ทางเข้าระบบ Production ผ่าน Cloudflare แล้ว")}</strong>
              <p>{text("All matching smartaihub.app HTTP traffic goes through the Worker. Node/Python/PostgreSQL remain on Linux. Database and native runtime migration are separate remaining milestones.", "HTTP ทั้งหมดที่ตรงกับ smartaihub.app/* ผ่าน Worker แล้ว Node/Python/PostgreSQL ยังอยู่ Linux งานฐานข้อมูลและย้าย runtime เป็นขั้นต่อไป ไม่ต้องยืนยัน Staging หรือ M2 ซ้ำ")}</p>
              <p>Deployment: <code>{String(previousIngressJob?.output?.deploymentId ?? "")}</code></p>
            </VStack> : null}
            {productionIngressPreflight.isLoading ? <p role="status">{text("Checking the exact route, runtime baseline, origin authentication and artifact…", "กำลังตรวจ route, baseline, ระบบยืนยันตัวตนของ origin และ artifact…")}</p> : null}
            {productionIngressPreflight.isError ? <p role="alert">{text("Ingress readiness could not be checked. Use Check now to retry.","ตรวจความพร้อมทางเข้าเว็บไม่สำเร็จ ให้กดตรวจสอบตอนนี้อีกครั้ง")}</p> : null}
            {productionIngressPreflight.data?.ready ? <>
              <p>{text("This approval routes all smartaihub.app HTTP traffic through the Cloudflare Worker to the existing Linux application. Node/Python and PostgreSQL stay on Linux during this phase.", "การยืนยันนี้ให้ HTTP ทั้งหมดของ smartaihub.app ผ่าน Cloudflare Worker ไปยังแอป Linux เดิม ในขั้นนี้ Node/Python และ PostgreSQL ยังอยู่ Linux")}</p>
              <p>{text("Origin", "Origin")}: <code>{productionIngressPreflight.data.origin}</code> · {text("Release", "รุ่น")}: <code>{productionIngressPreflight.data.artifact.sourceSha}</code></p>
              <p>{text("Route", "Route")}: <code>{productionIngressPreflight.data.routePattern}</code> · {text("Immutable artifact", "Artifact ที่ตรวจสอบแล้ว")}: <code>{productionIngressPreflight.data.artifact.artifactRef}</code> · {text("Rollback version", "รุ่นสำหรับย้อนกลับ")}: <code>{productionIngressPreflight.data.runtimeBaselineVersionId}</code></p>
              <p>{text("The job tests the candidate through runtime.smartaihub.app before attaching smartaihub.app/*. If web/auth acceptance fails, it removes the exact created route and restores the previous Worker deployment. DNS stays on its current configuration.", "งานจะทดสอบ candidate ผ่าน runtime.smartaihub.app ก่อนผูก smartaihub.app/* หากตรวจเว็บหรือระบบยืนยันตัวตนไม่ผ่าน จะถอด route ที่สร้างและคืน Worker deployment เดิม โดยใช้ DNS ปัจจุบัน")}</p>
              <p>{text("Keep this Admin page open. After route attachment it automatically checks your existing session, tenant and authenticated API, then records the result through a protected write. Failure or no result within two minutes rolls back the route. This does not log you out or change your preferences.", "เปิดหน้า Admin นี้ไว้ หลังผูก route ระบบจะตรวจ session เดิม, tenant และ API ที่ต้องล็อกอิน แล้วบันทึกผลผ่านคำขอเขียนที่ตรวจสิทธิ์ หากไม่ผ่านหรือไม่มีผลภายใน 2 นาทีจะย้อน route กลับ โดยไม่ logout หรือเปลี่ยนการตั้งค่าของคุณ")}</p>
              {canReplaceTerminalIngressJob ? <p>{text("The previous job ended. This confirmation authorizes the corrected release as a new operation; it does not reuse the expired grant or retry the old job.", "งานเดิมสิ้นสุดแล้ว การยืนยันนี้อนุมัติรุ่นที่แก้ไขเป็นคำขอใหม่ ไม่ใช้ grant ที่หมดอายุหรือลองงานเก่าซ้ำ")}</p> : null}
              <Button type="button" disabled={productionIngressMutation.isPending||latestProductionIngressJob.isLoading||latestProductionIngressJob.isError||Boolean(previousIngressJob&&!canReplaceTerminalIngressJob)} onClick={()=>{
                // A known terminal job permits a fresh Owner operation. Unknown
                // admission outcomes keep their existing key for reconciliation.
                const key=`smartaihub-production-ingress:${productionScopeKey}${canReplaceTerminalIngressJob?`:after:${previousIngressJob!.jobId}`:""}`;
                const submission=ingressSubmission(key,productionIngressPreflight.data!.ready?productionIngressPreflight.data!.planDigest:"");
                productionIngressMutation.mutate({tenantId,projectId,environment:"production",...submission,exposure:"100-percent-http-origin-bridge"});
              }}>{productionIngressMutation.isPending?text("Submitting the same ingress operation…", "กำลังส่งคำขอย้ายทางเข้าเว็บ…"):canReplaceTerminalIngressJob?text("Approve corrected Cloudflare ingress migration", "ยืนยันย้ายทางเข้าเว็บด้วยรุ่นที่แก้ไขแล้ว"):text("Approve Cloudflare ingress canary and start migration", "ยืนยัน canary ทางเข้าผ่าน Cloudflare และเริ่มย้าย")}</Button>
            </> : productionIngressPreflight.data && !acceptedIngress ? <VStack gap={1} role="status"><p>{ingressBlockerText(productionIngressPreflight.data.reason)}</p><details><summary>{text("Technical reason", "เหตุผลทางเทคนิค")}</summary><code>{productionIngressPreflight.data.reason}</code></details></VStack> : null}
            {productionIngressRollback.data?.ready&&latestProductionIngressJob.data ? <Button type="button" variant="destructive" disabled={productionIngressMutation.isPending} onClick={()=>{
              const key=`smartaihub-production-ingress-rollback:${productionScopeKey}:${latestProductionIngressJob.data!.jobId}`;
              const submission=ingressSubmission(key,productionIngressRollback.data!.ready?productionIngressRollback.data!.planDigest:"");
              productionIngressMutation.mutate({tenantId,projectId,environment:"production",...submission,
                rollbackJobId:latestProductionIngressJob.data!.jobId,exposure:"100-percent-http-origin-bridge"});
            }}>{text("Restore the previous Linux ingress", "คืนทางเข้าเดิมบน Linux")}</Button> : null}
            {productionIngressMutation.error ? <p role="alert"><code>{productionIngressMutation.error.message}</code> · {text("Retry reconciles the same stored Submission ID.", "การตรวจซ้ำใช้ Submission ID เดิม")}</p> : null}
            {latestProductionIngressJob.data ? <VStack gap={1} role="status">
              <p>{text("Ingress job", "งานย้ายทางเข้าเว็บ")}: <code>{latestProductionIngressJob.data.jobId}</code> · <strong>{latestProductionIngressJob.data.status}</strong></p>
              {ingressBrowserResult[latestProductionIngressJob.data.jobId]?<p role="status">{text("Live browser session check", "ผลตรวจ session ผ่านทางเข้าเว็บจริง")}: {ingressBrowserResult[latestProductionIngressJob.data.jobId]}</p>:null}
              {latestProductionIngressJob.data.errorCode ? <p role="alert"><code>{latestProductionIngressJob.data.errorCode}</code></p> : null}
              {latestProductionIngressJob.data.output?.productionTrafficShifted===true ? <p>{text("Worker ingress receipt", "หลักฐานทางเข้าผ่าน Worker")}: <code>{String(latestProductionIngressJob.data.output.routeId)}</code> · {text("Application runtime: Linux", "แอปยังประมวลผลบน Linux")}</p> : null}
            </VStack> : null}
          </VStack>
          <VStack as="section" gap={2} role="group" aria-label={text("Production Worker version deployment", "เผยแพร่ Worker version สำหรับ Production")}>
            <h3>{text("Cloudflare Worker Canary Deployment", "Canary Deployment ของ Cloudflare Worker")}</h3>
            <p>{text("This uses the encrypted Production target credential through the canonical job worker. It preserves the existing M2 route and Linux fallback. The approved version includes the production JOB_QUEUE and CF_VERSION_METADATA bindings; the executor verifies the queue consumer and DLQ before shifting exactly 1% of Worker requests. It does not change DNS or detach the route.",
              "ระบบใช้ credential Production ที่เข้ารหัสผ่าน canonical job worker โดยคง M2 route และ Linux fallback เดิม version ที่อนุมัติจะผูก JOB_QUEUE และ CF_VERSION_METADATA ของ Production และตรวจ queue consumer/DLQ ก่อนส่งคำขอ Worker 1% ไป version ใหม่ โดยไม่เปลี่ยน DNS หรือถอด route")}</p>
            <p role="status"><strong>{text("Canary status", "สถานะ Canary")}: {productionWorkerCanaryJobStatus(latestProductionWorkerCanaryJob.data?.status,
              Boolean(latestProductionWorkerCanaryJob.error), Boolean(latestProductionWorkerCanaryJob.data), productionWorkerCanaryPreflight.data?.ready, text)}</strong>
              {productionWorkerCanaryPreflight.data ? ` · ${productionWorkerCanaryPreflight.data.ready ? text("Preflight READY", "preflight พร้อม") : text("Preflight BLOCKED", "preflight ติดเงื่อนไข")}` : ""}</p>
            {productionProviderInventory.data&&"worker" in productionProviderInventory.data?<p>{text("Observed active Worker baseline", "Worker baseline ที่ตรวจพบ")}: {productionProviderInventory.data.worker.activeDeploymentId
              ? <><code>{productionProviderInventory.data.worker.activeDeploymentId}</code> · {productionProviderInventory.data.worker.versions.map(version=><code key={version.versionId}>{version.versionId} {version.percentage}% </code>)}</>
              : text("Not verified yet", "ยังยืนยันไม่ได้")}</p>:null}
            <Button type="button" variant="outline" disabled={productionWorkerCanaryPreflight.isFetching}
              onClick={() => void productionWorkerCanaryPreflight.refetch()}>
              {productionWorkerCanaryPreflight.isFetching ? text("Checking read-only preflight…", "กำลังตรวจ preflight แบบอ่านอย่างเดียว…") : text("Recheck read-only preflight", "ตรวจ preflight แบบอ่านอย่างเดียวอีกครั้ง")}
            </Button>
            {productionWorkerCanaryPreflight.isLoading?<p role="status">{text("Checking the active Worker, exact route, queue consumer, artifact and rollback baseline…","กำลังตรวจ Worker, route, Queue consumer, artifact และ baseline สำหรับย้อนกลับ…")}</p>:null}
            {productionWorkerCanaryPreflight.isError?<p role="alert">{text("Preflight request failed. No Cloudflare change was made. Recheck to retry the read-only request.","คำขอตรวจ preflight ล้มเหลว ยังไม่มีการเปลี่ยน Cloudflare ให้ตรวจคำขอแบบอ่านอย่างเดียวอีกครั้ง")}</p>:null}
            {productionWorkerCanaryPreflight.data?.ready?<VStack gap={1} role="status">
              <p>{text("Reviewed artifact", "Artifact ที่ตรวจสอบแล้ว")}: <code>{productionWorkerCanaryPreflight.data.artifact.artifactRef}</code> · SHA <code>{productionWorkerCanaryPreflight.data.artifact.sourceSha}</code></p>
              <p>{text("Current rollback baseline", "Baseline ปัจจุบันสำหรับย้อนกลับ")}: <code>{productionWorkerCanaryPreflight.data.rollback.deploymentId}</code> / version <code>{productionWorkerCanaryPreflight.data.rollback.versionId}</code></p>
              <p>{text("Current route remains", "คง route ปัจจุบัน")}: <code>{productionWorkerCanaryPreflight.data.routePattern}</code> → <code>{productionWorkerCanaryPreflight.data.expectedRouteScript}</code> · {text("candidate receives 1% traffic", "version ใหม่รับ traffic 1%")}</p>
              {latestProductionWorkerCanaryJob.data?.status==="succeeded"?<p>{text("Verified Worker deployment", "ยืนยัน Worker deployment แล้ว")}: <code>{String(latestProductionWorkerCanaryJob.data.output?.deploymentId??"—")}</code> · {text("version", "version")}: <code>{String(latestProductionWorkerCanaryJob.data.output?.candidateVersionId??"—")}</code> · {text("Queue consumer", "Queue consumer")}: <code>{String(latestProductionWorkerCanaryJob.data.output?.queueConsumer?.consumerId??"—")}</code></p>:null}
              {latestProductionWorkerCanaryJob.data?.status==="succeeded"?<p role="status">{text("The 1% canary is active. Promotion or rollback is a separate authorized operation.","canary 1% ทำงานแล้ว การเพิ่ม traffic หรือ rollback เป็น operation ที่ต้องอนุมัติแยก")}</p>:latestProductionWorkerCanaryJob.data&&!["failed","expired","cancelled"].includes(latestProductionWorkerCanaryJob.data.status)?<p role="status">{text("A deployment job is active. Do not submit another operation.","มีงาน deploy กำลังทำงาน ห้ามส่งงานซ้ำ")}</p>:<Button type="button" disabled={productionWorkerCanaryMutation.isPending||latestProductionWorkerCanaryJob.isLoading||latestProductionWorkerCanaryJob.isError} onClick={()=>{
                const key=`smartaihub-production-worker-canary:${productionScopeKey}${latestProductionWorkerCanaryJob.data?`:after:${latestProductionWorkerCanaryJob.data.jobId}`:""}`;
                const submission=workerCanarySubmission(key,productionWorkerCanaryPreflight.data!.planDigest);
                productionWorkerCanaryMutation.mutate({tenantId,projectId,environment:"production",...submission});
              }}>{productionWorkerCanaryMutation.isPending?text("Submitting the same bounded operation…","กำลังส่งคำขอเดิมที่จำกัดขอบเขต…"):text("Approve 1% Worker version canary","อนุมัติ canary Worker version ที่ 1%")}</Button>}
            </VStack>:productionWorkerCanaryPreflight.data?<VStack gap={1} role="status"><p>{workerCanaryBlockerText(productionWorkerCanaryPreflight.data.reason)}</p><details><summary>{text("Exact technical reason", "เหตุผลทางเทคนิค")}</summary><code>{productionWorkerCanaryPreflight.data.reason}</code></details></VStack>:null}
            {latestProductionWorkerCanaryJob.isLoading?<p role="status">{text("Loading canonical canary job…", "กำลังอ่านสถานะงาน canary จาก canonical registry…")}</p>:null}
            {latestProductionWorkerCanaryJob.isError?<VStack gap={1} role="alert"><p>{text("Unable to load canary job status. This does not mean no job exists.", "อ่านสถานะงาน canary ไม่สำเร็จ ไม่ได้แปลว่าไม่มีงานอยู่")}</p><code>{latestProductionWorkerCanaryJob.error.message}</code>
              <Button type="button" variant="outline" onClick={() => void latestProductionWorkerCanaryJob.refetch()}>{text("Retry read-only job status", "อ่านสถานะงานอีกครั้ง")}</Button></VStack>:null}
            {!latestProductionWorkerCanaryJob.isLoading&&!latestProductionWorkerCanaryJob.isError&&!latestProductionWorkerCanaryJob.data?<p role="status">{text("No canonical Worker canary job is recorded for this project.", "ยังไม่มีงาน Worker canary ใน canonical registry ของ project นี้")}</p>:null}
            {latestProductionWorkerCanaryJob.data?<VStack gap={1} role="status"><p>{text("Canonical canary job", "งาน canary ใน canonical registry")}: <code>{latestProductionWorkerCanaryJob.data.jobId}</code> · <strong>{latestProductionWorkerCanaryJob.data.status}</strong> · {text("attempt", "ครั้งที่")} {latestProductionWorkerCanaryJob.data.attempt}/{latestProductionWorkerCanaryJob.data.maxAttempts}{latestProductionWorkerCanaryJob.data.errorCode?<> · <code>{latestProductionWorkerCanaryJob.data.errorCode}</code></>:null}</p>
              {latestProductionWorkerCanaryJob.data.progress?.stage?<p>{text("Current stage", "ขั้นตอนปัจจุบัน")}: <code>{String(latestProductionWorkerCanaryJob.data.progress.stage)}</code> · {text("heartbeat", "heartbeat")}: {latestProductionWorkerCanaryJob.data.heartbeatAt?new Date(latestProductionWorkerCanaryJob.data.heartbeatAt).toLocaleString():"—"} · {text("lease until", "lease ถึง")}: {latestProductionWorkerCanaryJob.data.leaseExpiresAt?new Date(latestProductionWorkerCanaryJob.data.leaseExpiresAt).toLocaleString():"—"}</p>:null}
              {latestProductionWorkerCanaryJob.data.status==="succeeded"?<p>{text("Verified deployment receipt", "หลักฐาน deployment ที่ยืนยันแล้ว")}: <code>{String(latestProductionWorkerCanaryJob.data.output?.deploymentId??"—")}</code> · {text("version", "version")}: <code>{String(latestProductionWorkerCanaryJob.data.output?.candidateVersionId??"—")}</code> · {text("Queue consumer", "Queue consumer")}: <code>{String(latestProductionWorkerCanaryJob.data.output?.queueConsumer?.consumerId??"—")}</code></p>:null}</VStack>:null}
            {productionWorkerCanaryMutation.error?<p role="alert"><code>{productionWorkerCanaryMutation.error.message}</code> · {text("Recheck reconciles the same Submission ID.","ตรวจซ้ำจะ reconcile ด้วย Submission ID เดิม")}</p>:null}
          </VStack>
          {productionProviderInventory.isLoading ? <p role="status">{text("Reading Production queues, Hyperdrive, VPC services, Worker versions, and domain route…", "กำลังตรวจ Queue, Hyperdrive, VPC service, Worker version และ route ของ Production…")}</p> : null}
          {productionProviderInventory.isError ? <p role="alert">{text("Cloudflare resource inventory could not be read. No provider changes were made.", "อ่าน inventory ของ Cloudflare ไม่สำเร็จ และไม่มีการเปลี่ยนแปลง resource")}</p> : null}
          {productionProviderInventory.data ? (() => {
            const inventory = productionProviderInventory.data;
            if (!("accessChecks" in inventory)) {
              const reason = inventory.status === "TARGET_NOT_CONFIGURED"
                ? text("Production deployment target is not configured.", "ยังไม่ได้ตั้งค่า deployment target ของ Production")
                : inventory.status === "CREDENTIAL_NOT_CONFIGURED"
                  ? text("The scoped Production Cloudflare credential is not configured.", "ยังไม่ได้ตั้งค่า credential ของ Cloudflare สำหรับ Production")
                  : text("The Production Cloudflare credential could not be used.", "ไม่สามารถใช้ credential ของ Cloudflare สำหรับ Production ได้");
              return <VStack gap={1} role="alert"><p>{reason}</p></VStack>;
            }
            if (inventory.status !== "CHECKED") {
              const checkLabels: Record<string, { en: string; th: string; permission: string }> = {
                queues: { en: "Queue inventory", th: "รายการ Queue", permission: "Account → Queues → Read" },
                hyperdrive: { en: "Hyperdrive inventory", th: "รายการ Hyperdrive", permission: "Account → Hyperdrive → Read" },
                zone: { en: "smartaihub.app zone", th: "Zone smartaihub.app", permission: "Zone → Zone → Read" },
                routes: { en: "Worker routes", th: "Worker routes", permission: "Zone → Workers Routes → Read" },
                workerDeployments: { en: "Worker deployments", th: "Worker deployments", permission: "Account → Workers Scripts → Read" },
                workerVersions: { en: "Worker versions", th: "Worker versions", permission: "Account → Workers Scripts → Read" },
                tunnels: { en: "Cloudflare Tunnel inventory", th: "รายการ Cloudflare Tunnel", permission: "Account → Cloudflare Tunnel → Read" },
                vpcServices: { en: "Workers VPC service inventory", th: "รายการ Workers VPC service", permission: "Account → Connectivity Directory → Read" },
                containers: { en: "Cloudflare Containers inventory", th: "รายการ Cloudflare Containers", permission: "Account → Containers → Read" },
                mtlsCertificates: { en: "Legacy Staging Hyperdrive trust inventory (optional for Production VPC)", th: "รายการ trust ของ Staging Hyperdrive เดิม (ไม่จำเป็นต่อ Production VPC)", permission: "Account → SSL and Certificates → Read; Write only if migrating the existing Staging trust" },
              };
              const accessCheckRows = Object.entries(inventory.accessChecks ?? {}).flatMap(([key, value]) =>
                Array.isArray(value)
                  ? value.map((check, index) => [`${key}:${index + 1}`, key, check] as const)
                  : [[key, key, value] as const],
              );
              const databaseChecks = inventory.productionDatabaseProvisioning?.checks;
              const databaseTunnelInventoryComplete = inventory.tunnelInventoryComplete === true &&
                inventory.accessChecks.tunnels?.complete === true && databaseChecks?.tunnel?.readable === true;
              const databaseHyperdriveInventoryComplete = inventory.hyperdriveInventoryComplete === true &&
                inventory.accessChecks.hyperdrive?.complete === true && databaseChecks?.hyperdrive?.readable === true;
              const databaseVpcInventoryComplete = inventory.vpcServiceInventoryComplete === true &&
                inventory.accessChecks.vpcServices?.complete === true && databaseChecks?.vpcServices?.readable === true;
              const allDatabaseTunnels = inventory.tunnels as CloudflareTunnelOption[];
              const verifiedDatabaseTunnels = databaseTunnelInventoryComplete
                ? allDatabaseTunnels.filter(tunnel => productionDatabaseTunnelBlocker(tunnel) === null)
                : [];
              const recoveryTunnelId = productionDatabaseJobData?.tunnelId ?? "";
              const recoveryTunnel = verifiedDatabaseTunnels.find(tunnel => tunnel.id === recoveryTunnelId);
              const selectedTunnelId = recoveryTunnel
                ? recoveryTunnel.id
                : verifiedDatabaseTunnels.length === 1 ? verifiedDatabaseTunnels[0].id : "";
              const recoveryPlanPrefix = productionDatabaseJobData?.planDigest?.slice(0, 12) ?? "";
              const recoveryVpc = databaseVpcInventoryComplete && recoveryPlanPrefix
                ? inventory.vpcServices.find(service => service.environment === "production" && service.type === "tcp" &&
                    service.appProtocol === "postgresql" && service.tunnelId === recoveryTunnelId &&
                    service.name === `smartspec-production-postgres-${recoveryPlanPrefix}`)
                : undefined;
              const recoveryVpcVerified = Boolean(recoveryVpc);
              const recoveryHyperdriveVerified = productionDatabaseReadbackRecovery
                ? databaseHyperdriveInventoryComplete && Boolean(recoveryVpc) && Boolean(recoveryPlanPrefix) &&
                  inventory.hyperdrives.some(config => config.environment === "production" &&
                    config.name === `smartspec-production-database-${recoveryPlanPrefix}` && config.vpcServiceId === recoveryVpc!.id &&
                    config.scheme === "postgres" && config.cachingDisabled === true)
                : productionDatabaseProviderRecovery
                  ? databaseHyperdriveInventoryComplete && !inventory.hyperdrives.some(config => config.environment === "production" &&
                      (config.name === `smartspec-production-database-${recoveryPlanPrefix}` || config.vpcServiceId === recoveryVpc?.id))
                  : true;
              const recoveryJobEligible = Boolean(productionDatabaseJobData?.jobId === "b9ca8316-1604-4764-a769-d92f46e4c823" &&
                productionDatabaseJobData.planDigest && /^[a-f0-9]{64}$/i.test(productionDatabaseJobData.planDigest) &&
                productionDatabaseJobData.tunnelId && (productionDatabaseProviderRecovery || productionDatabaseReadbackRecovery || productionDatabaseGuardRecovery ||
                  (productionDatabaseJobData.status === "expired" && productionDatabaseJobData.operatorReviewRequired &&
                    productionDatabaseJobData.operatorReviewReason === "adapter_contract_unsupported")));
              const recoveryReady = validScope && environment === "production" && recoveryJobEligible &&
                databaseTunnelInventoryComplete && databaseHyperdriveInventoryComplete && recoveryVpcVerified &&
                recoveryHyperdriveVerified && selectedTunnelId === recoveryTunnelId;
              return <VStack gap={1} role="alert">
              <p>{text(
                `Production inventory is incomplete (${inventory.status}); an empty result does not prove that a resource is absent.`,
                `inventory ของ Production ไม่ครบ (${inventory.status}) ผลว่างจึงยังยืนยันไม่ได้ว่าไม่มี resource`,
              )}</p>
              <p>{text("Read-only Cloudflare API results (HTTP 200 means readable only):", "ผล API ของ Cloudflare แบบอ่านอย่างเดียว (HTTP 200 ยืนยันเฉพาะสิทธิ์อ่าน):")}</p>
              <VStack as="ul" gap={1}>
                {accessCheckRows.map(([rowKey, key, check]) => <li key={rowKey}>
                  <strong>{text(checkLabels[key]?.en ?? key, checkLabels[key]?.th ?? key)}{rowKey !== key ? ` ${rowKey.slice(key.length + 1)}` : ""}</strong>: {check.httpStatus === null ? text("not checked", "ยังไม่ได้ตรวจ") : `HTTP ${check.httpStatus}`}
                  {check.complete ? text(" · readable", " · อ่านได้") : text(" · incomplete or denied", " · ตรวจไม่ครบหรือถูกปฏิเสธ")}
                  {!check.complete && checkLabels[key] ? <> · {key === "mtlsCertificates"
                    ? text("optional; needed only for Staging trust migration", "เป็นทางเลือก ใช้เฉพาะเมื่อย้าย trust ของ Staging")
                    : text("required read scope", "สิทธิ์อ่านที่ต้องมี")}: <code>{checkLabels[key].permission}</code></> : null}
                </li>)}
              </VStack>
              {inventory.productionDatabaseProvisioning ? <>
                <VStack as="section" gap={1} role="group" aria-label={text("Production database recovery", "การกู้คืนฐานข้อมูล Production")}>
                  <p><strong>{text("Existing Production database job", "งานฐานข้อมูล Production เดิม")}</strong>: {productionDatabaseJobData
                    ? <><code>{productionDatabaseJobData.jobId}</code> · {productionDatabaseJobData.status} · {text("attempt", "ครั้งที่")} {productionDatabaseJobData.attempt}/{productionDatabaseJobData.maxAttempts}</>
                    : text("No canonical Production database job was found for this tenant and project.", "ไม่พบ canonical job ฐานข้อมูล Production สำหรับ tenant และ project นี้")}</p>
                  {productionDatabaseJobData?.errorCode ? <p role="alert"><code>{productionDatabaseJobData.errorCode}</code></p> : null}
                  {productionDatabaseJobData?.planDigest ? <p>{text("Original immutable plan", "แผน immutable เดิม")}: <code>{productionDatabaseJobData.planDigest}</code></p> : null}
                  {productionDatabaseProviderRecovery || productionDatabaseReadbackRecovery ? <p>{text(
                    productionDatabaseReadbackRecovery
                      ? "Readback recovery reuses the exact Hyperdrive and VPC recorded by the failed job. The provider returned an empty optional mTLS object; no resource is recreated. Worker deployment/version inventory is unrelated."
                      : "CF2015 recovery reuses the same failed Job, plan, verified VPC, and healthy production Tunnel. Worker deployment/version inventory is unrelated to this database operation.",
                    productionDatabaseReadbackRecovery
                      ? "การกู้ readback ใช้ Hyperdrive และ VPC เดิมที่บันทึกในงานเดิม โดย provider ส่งค่า mTLS ว่างซึ่งเป็น optional object ระบบจะไม่สร้าง resource ซ้ำ และ inventory ของ Worker ไม่เกี่ยวข้อง"
                      : "การกู้ CF2015 ใช้งานเดิม แผนเดิม VPC ที่ตรวจแล้ว และ Tunnel Production ที่ healthy โดย inventory ของ Worker deployment/version ไม่เกี่ยวกับงานฐานข้อมูลนี้",
                  )}</p> : null}
                  {recoveryJobEligible ? <>
                    {!databaseHyperdriveInventoryComplete ? <p role="alert">{text("Hyperdrive inventory is incomplete; recovery remains disabled until it can be reconciled.", "ตรวจรายการ Hyperdrive ไม่ครบ จึงปิดการกู้คืนจนกว่าจะตรวจสอบได้")}</p> : null}
                    {!databaseVpcInventoryComplete || !recoveryVpcVerified ? <p role="alert">{text("The exact existing Production PostgreSQL VPC service for this plan and Tunnel is not verified.", "ยังยืนยัน VPC service เดิมของแผนและ Tunnel นี้ไม่ได้")}</p> : null}
                    {databaseHyperdriveInventoryComplete && recoveryVpcVerified && !recoveryHyperdriveVerified ? <p role="alert">{text("The exact Hyperdrive from this job is not verified against its existing VPC; recovery remains disabled.", "ยังยืนยัน Hyperdrive เดิมของงานว่าผูกกับ VPC เดิมหรือไม่ จึงปิดปุ่มกู้คืน")}</p> : null}
                    {!recoveryTunnel ? <p role="alert">{text("The job's original Tunnel is missing, unhealthy, or not verified as production-capable.", "Tunnel เดิมของงานหายไป ไม่ healthy หรือยังยืนยันว่าใช้กับ Production ไม่ได้")}</p> : null}
                    {recoveryReady ? <Button type="button" disabled={resumeProductionDatabaseMutation.isPending} onClick={() => resumeProductionDatabaseMutation.mutate({
                      tenantId, projectId, jobId: productionDatabaseJobData!.jobId, tunnelId: productionDatabaseJobData!.tunnelId!, environment: "production",
                      ...((productionDatabaseGuardRecovery || productionDatabaseProviderRecovery || productionDatabaseReadbackRecovery) ? { authorizeAdditionalAttempt: true as const } : {}),
                    })}>{productionDatabaseProviderRecovery || productionDatabaseReadbackRecovery
                      ? text("Authorize recovery of existing Hyperdrive job", "อนุมัติกู้คืน Hyperdrive โดยใช้งานและ VPC เดิม")
                      : productionDatabaseGuardRecovery
                        ? text("Authorize one corrected attempt on this same job", "อนุมัติเพิ่ม 1 ครั้งให้งานเดิมหลังแก้ไข")
                        : text("Renew authorization and resume this same job", "ต่ออายุสิทธิ์และทำงานเดิมต่อ")}</Button>
                      : <p role="status">{text("Recovery is shown but disabled until the database-specific prerequisites above are verified.", "แสดงข้อมูลกู้คืนแล้ว แต่ยังปิดปุ่มจนกว่าจะยืนยันเงื่อนไขเฉพาะฐานข้อมูลด้านบนครบ")}</p>}
                  </> : null}
                  {resumeProductionDatabaseMutation.error ? <p role="alert"><code>{resumeProductionDatabaseMutation.error.message}</code></p> : null}
                </VStack>
                <p>{text("The list below is the complete scope packet for the planned production steps. Apply it in one token update; the missing read checks above are only the scopes needed to inspect those inventories. No provider changes were made by this check.", "รายการด้านล่างคือ permission ทั้งหมดสำหรับขั้นตอน production ที่วางไว้ ให้เพิ่มทั้งหมดในการแก้ token ครั้งเดียว ส่วน read ที่ขาดด้านบนมีไว้ตรวจ inventory เท่านั้น การตรวจนี้ไม่ได้เปลี่ยน resource บน Cloudflare")}</p>
                <VStack as="ul" gap={1}>{inventory.productionDatabaseProvisioning.permissionPacket.map(item => <li key={`${item.scope}:${item.permission}`}>
                  <strong>{item.scope} · <code>{item.permission}</code></strong>
                  <details><summary>{text("Exact API operations", "API operation ที่ใช้จริง")}</summary>
                    <VStack as="ul" gap={1}>{item.operations.map(operation => <li key={operation}><code>{operation}</code></li>)}</VStack>
                  </details>
                </li>)}</VStack>
              <p>{text("This Production path uses a Workers VPC Service, which owns TLS verification; its Hyperdrive origin must not include direct-origin mTLS settings. The separate Staging trust inventory is optional and matters only if the shared PostgreSQL certificate is rotated. The existing valid Origin CA certificate is reused; no certificate issuance is needed.", "เส้นทาง Production นี้ใช้ Workers VPC Service ซึ่งเป็นผู้ตรวจ TLS และห้ามใส่ direct-origin mTLS ใน Hyperdrive ส่วนการอ่าน trust ของ Staging เป็นทางเลือก ใช้เฉพาะกรณีเปลี่ยนใบรับรอง PostgreSQL ที่ใช้ร่วมกัน ระบบใช้ Origin CA certificate ที่มีและยังใช้ได้ จึงไม่ต้องออกใบใหม่")}</p>
              </> : <p>{text("Add the required read scope shown for an HTTP 403, then press Check now. No provider changes were made by this check.", "ถ้าได้ HTTP 403 ให้เพิ่มสิทธิ์อ่านตามที่แสดง แล้วกดตรวจสอบตอนนี้ การตรวจนี้ไม่ได้เปลี่ยน resource บน Cloudflare")}</p>}
              </VStack>;
            }
            const productionQueues = inventory.queues.filter(item => item.environment === "production");
            const stagingQueues = inventory.queues.filter(item => item.environment === "staging");
            const hasProductionQueue = productionQueues.some(queue => queue.name === "smartspec-canonical-job-queue-production");
            const hasProductionDeadLetterQueue = productionQueues.some(queue => queue.name === "smartspec-canonical-job-queue-production-dlq");
            const productionHyperdrives = inventory.hyperdrives.filter(item => item.environment === "production");
            const stagingHyperdrives = inventory.hyperdrives.filter(item => item.environment === "staging");
            const productionPostgresVpcs = inventory.vpcServices.filter(item => item.environment === "production" && item.type === "tcp" && item.appProtocol === "postgresql");
            const stagingPostgresVpcs = inventory.vpcServices.filter(item => item.environment === "staging" && item.type === "tcp" && item.appProtocol === "postgresql");
            const databaseTunnelInventoryComplete = inventory.status === "CHECKED" &&
              inventory.tunnelInventoryComplete === true && inventory.accessChecks.tunnels?.complete === true;
            const allDatabaseTunnels = inventory.tunnels as CloudflareTunnelOption[];
            const databaseTunnels = databaseTunnelInventoryComplete
              ? allDatabaseTunnels.filter(tunnel => productionDatabaseTunnelBlocker(tunnel) === null)
              : [];
            const unverifiedDatabaseTunnels = allDatabaseTunnels.filter(tunnel => productionDatabaseTunnelBlocker(tunnel) !== null);
            const tunnelSelectionKey = `${tenantId}:${projectId}:${inventory.accountRef ?? "unknown-account"}`;
            const savedTunnelId = productionTunnelSelections[tunnelSelectionKey] ?? "";
            const selectedSavedTunnel = databaseTunnels.find(tunnel => tunnel.id === savedTunnelId);
            const selectedDatabaseTunnelId = selectedSavedTunnel?.id ?? (databaseTunnels.length === 1 ? databaseTunnels[0].id : "");
            const submittedDatabaseJobId = productionDatabaseSubmissions[productionScopeKey] ?? "";
            const databaseAdmission = productionDatabaseAdmissions[productionScopeKey] ?? readStoredProductionDatabaseAdmission(productionScopeKey);
            const databaseJobAlreadySubmitted = Boolean(
              productionDatabaseObservation?.providerReadbackVerified ||
              productionDatabaseGuardRecovery || productionDatabaseProviderRecovery || productionDatabaseReadbackRecovery ||
              ["queued", "claimed", "preparing", "running", "uploading", "publishing", "indexing", "pending", "leased",
                "waiting_external", "retry_scheduled", "succeeded", "completed", "expired"].includes(productionDatabaseJobData?.status ?? "") ||
              ["JOB_ACCEPTED", "RUNNING", "SUCCEEDED"].includes(databaseAdmission?.status ?? ""),
            );
            const databaseAdmissionJob = productionDatabaseJobData && (!databaseAdmission ||
              productionDatabaseJobData.jobId === databaseAdmission.jobId || productionDatabaseJobData.jobId === databaseAdmission.submissionId)
              ? productionDatabaseJobData : null;
            const databaseAdmissionStatus: ProductionDatabaseAdmissionStatus | null = databaseAdmissionJob
              ? canonicalDatabaseAdmissionStatus(databaseAdmissionJob.status)
              : databaseAdmission?.status ?? null;
            const activeVersions = inventory.worker.versions;
            const verifiedRollback = activeVersions.some(version => version.checked && version.hasVerifiedReleaseIdentity);
            const nodeAndPythonIngressBound = activeVersions.some(version => version.checked &&
              version.bindingNames.includes("NODE_HTTP") && version.bindingNames.includes("PYTHON_HTTP"));
            const canRetryProductionQueueJob = ["failed", "cancelled", "expired"].includes(productionQueueJobData?.status ?? "");
            const productionResourceGaps = [
              ...(!hasProductionQueue || !hasProductionDeadLetterQueue ? [text("Production Queue and dead-letter queue", "Production Queue และ dead-letter queue")] : []),
              ...(productionHyperdrives.length === 0 ? [text("Production Hyperdrive for the retained PostgreSQL host", "Production Hyperdrive สำหรับ PostgreSQL เครื่องเดิม")] : []),
              ...(productionPostgresVpcs.length === 0 ? [text("Production PostgreSQL Workers VPC service", "Workers VPC service สำหรับ PostgreSQL Production")] : []),
              ...(!verifiedRollback ? [text("a verified Worker rollback release", "Worker release สำหรับ rollback ที่ตรวจสอบแล้ว")] : []),
              ...(!inventory.domainRoute.attached ? [text("the smartaihub.app/* Worker Route", "Worker Route smartaihub.app/*")] : []),
            ];
            return <VStack gap={1} role="group" aria-label={text("Verified Cloudflare Production resources", "ทรัพยากร Cloudflare Production ที่ตรวจแล้ว")}>
              <p><strong>{text("Production runtime configuration", "config runtime ของ Production")}</strong>: {inventory.originConfiguration.status === "NOT_CONFIGURED"
                ? text("Not saved. Production currently has no origin/runtime configuration.", "ยังไม่ได้บันทึก Production ไม่มี origin/runtime configuration")
                : inventory.originConfiguration.status === "INVALID" ? text("Stored configuration cannot be verified.", "ตรวจ config ที่บันทึกไว้ไม่ผ่าน")
                  : text(`Saved (${inventory.originConfiguration.status}).`, `บันทึกแล้ว (${inventory.originConfiguration.status})`)}</p>
              <p><strong>{text("Node and Python request ingress", "ช่องทางรับ request ของ Node และ Python")}</strong>: {nodeAndPythonIngressBound
                ? text("Both production container bindings are active.", "ผูก container ทั้งสองกับ Production แล้ว")
                : inventory.originConfiguration.applicationHttpConfigured
                  ? text(inventory.originConfiguration.applicationHttpReadyForRequests
                    ? "Configuration exists, but the current Worker version does not bind both containers."
                    : "Container image metadata exists, but request bindings are disabled (namespace-only).",
                    inventory.originConfiguration.applicationHttpReadyForRequests
                      ? "มี config แต่ Worker version ปัจจุบันยังไม่ได้ผูก container ทั้งสอง"
                      : "มี metadata ของ image แต่ยังปิด binding รับ request (namespace-only)")
                  : text("Not configured or bound in the active Worker version.", "ยังไม่ได้ตั้งค่าและผูกใน Worker version ที่ทำงานอยู่")}</p>
              <p><strong>{text("Production Queue", "Production Queue")}</strong>: {productionQueues.length > 0
                ? text(`Found ${productionQueues.length}`, `พบ ${productionQueues.length} รายการ`)
                : text(stagingQueues.length > 0 ? `Not provisioned. Only Staging exists (${stagingQueues.map(item => item.name).join(", ")}).` : "Not provisioned.", stagingQueues.length > 0 ? `ยังไม่มี Production มีเฉพาะ Staging (${stagingQueues.map(item => item.name).join(", ")})` : "ยังไม่ได้สร้าง")}</p>
              {inventory.status === "CHECKED" && (!hasProductionQueue || !hasProductionDeadLetterQueue) && enabledCloudflareTargets.length === 1 ? <VStack as="section" gap={1}>
                <p>{text(
                  "Prepare the missing Production Queue and dead-letter queue now. The server uses the encrypted credential already saved for this Production target, creates or reuses the exact queues in the Worker config, and verifies both. This does not bind or activate the Worker and cannot change traffic.",
                  "เตรียม Production Queue และ dead-letter queue ที่ยังขาด โดยใช้ credential แบบเข้ารหัสของ Production target สร้างหรือใช้ Queue ตามชื่อใน Worker config แล้วตรวจยืนยันทั้งคู่ ขั้นตอนนี้ยังไม่ผูกหรือเปิด Worker และเปลี่ยน traffic ไม่ได้",
                )}</p>
                <Button type="button" disabled={productionQueueMutation.isPending || Boolean((productionQueueJobId || productionQueueJobData) && (!productionQueueJobData || !canRetryProductionQueueJob))} onClick={() => productionQueueMutation.mutate({ tenantId, projectId, environment: "production" })}>
                  {productionQueueMutation.isPending ? text("Queueing Production setup…", "กำลังส่งงานเตรียม Production…") : productionQueueJobId
                    ? canRetryProductionQueueJob
                      ? text("Retry Production Queue setup", "ลองเตรียม Production Queue อีกครั้ง")
                      : text("Production Queue setup submitted", "ส่งงานเตรียม Production Queue แล้ว")
                    : text("Prepare Production Queue", "เตรียม Production Queue")}
                </Button>
                {productionQueueMutation.error ? <p role="alert"><code>{productionQueueMutation.error.message}</code></p> : null}
                {productionQueueJobId ? <VStack gap={1} role="status" aria-label={text("Production Queue job status", "สถานะงานเตรียม Production Queue")}>
                  <p>{text("Preparation job", "งานเตรียมระบบ")}: <code>{productionQueueJobData?.jobId ?? productionQueueJobId}</code> · {text("Status", "สถานะ")}: <strong>{productionQueueJobData?.status ?? "queued"}</strong></p>
                  {productionQueueJobData ? <p>{text("Attempt", "ครั้งที่")}: {productionQueueJobData.attempt}/{productionQueueJobData.maxAttempts}
                    {productionQueueJobData.createdAt ? <> · {text("Queued", "ส่งเข้าคิว")}: {new Date(productionQueueJobData.createdAt).toLocaleString()}</> : null}
                    {productionQueueJobData.startedAt ? <> · {text("Started", "เริ่มทำ")}: {new Date(productionQueueJobData.startedAt).toLocaleString()}</> : null}
                    {productionQueueJobData.heartbeatAt ? <> · {text("Last worker heartbeat", "worker ติดต่อครั้งล่าสุด")}: {new Date(productionQueueJobData.heartbeatAt).toLocaleString()}</> : null}
                    {productionQueueJobData.leaseExpiresAt ? <> · {text("Lease expires", "lease หมดอายุ")}: {new Date(productionQueueJobData.leaseExpiresAt).toLocaleString()}</> : null}
                  </p> : null}
                  {productionQueueJobData?.queueName ? <> · Queue: <code>{productionQueueJobData.queueName}</code></> : null}
                  {productionQueueJobData?.deadLetterQueueName ? <> · DLQ: <code>{productionQueueJobData.deadLetterQueueName}</code></> : null}
                  {productionQueueJobData?.errorCode ? <> · <code>{productionQueueJobData.errorCode}</code></> : null}
                  {productionQueueJobData?.status === "queued" ? <p>{text("The job is waiting for a worker claim. This page is tracking the existing job and will not create another one.", "งานกำลังรอ worker รับไปทำ หน้านี้ติดตาม job เดิมและจะไม่สร้างซ้ำ")}</p> : null}
                </VStack> : null}
              </VStack> : null}
              <p><strong>Production Hyperdrive</strong>: {productionHyperdrives.length > 0
                ? text(`Found ${productionHyperdrives.length}`, `พบ ${productionHyperdrives.length} รายการ`)
                : text(stagingHyperdrives.length > 0 ? `Not provisioned. Only Staging exists (${stagingHyperdrives.map(item => item.name).join(", ")}).` : "Not provisioned.", stagingHyperdrives.length > 0 ? `ยังไม่มี Production มีเฉพาะ Staging (${stagingHyperdrives.map(item => item.name).join(", ")})` : "ยังไม่ได้สร้าง")}</p>
              <p><strong>{text("Production PostgreSQL VPC service", "Workers VPC สำหรับ PostgreSQL Production")}</strong>: {productionPostgresVpcs.length > 0
                ? text(`Found ${productionPostgresVpcs.length} PostgreSQL TCP service(s).`, `พบ PostgreSQL TCP service ${productionPostgresVpcs.length} รายการ`)
                : text(stagingPostgresVpcs.length > 0 ? `Not provisioned. Only Staging exists (${stagingPostgresVpcs.map(item => item.name).join(", ")}).` : "Not provisioned.", stagingPostgresVpcs.length > 0 ? `ยังไม่มี Production มีเฉพาะ Staging (${stagingPostgresVpcs.map(item => item.name).join(", ")})` : "ยังไม่ได้สร้าง")}</p>
              {inventory.status === "CHECKED" && (productionHyperdrives.length === 0 || productionPostgresVpcs.length === 0) ? <VStack as="section" gap={1} role="group" aria-label={text("Prepare Production PostgreSQL connection", "เตรียมการเชื่อมต่อ PostgreSQL Production")}>
                <p><strong>{text("Prepare the retained PostgreSQL connection", "เตรียมการเชื่อมต่อ PostgreSQL เครื่องเดิม")}</strong></p>
                <p>{text("The system will use the selected existing Cloudflare Tunnel, create the private VPC PostgreSQL service and uncached Hyperdrive config, and verify provider readback. PostgreSQL stays on this Linux host. No public database route, Worker binding, activation, or production traffic change is made.", "ระบบจะใช้ Cloudflare Tunnel เดิมที่เลือก สร้าง private VPC PostgreSQL service และ Hyperdrive แบบปิด cache แล้วตรวจ readback โดย PostgreSQL ยังคงอยู่บน Linux เครื่องเดิม ขั้นตอนนี้ไม่สร้าง public database route ไม่ bind หรือเปิด Worker และไม่เปลี่ยน production traffic")}</p>
                <Selector
                  label={text("Existing PostgreSQL Tunnel", "Tunnel PostgreSQL เดิม")}
                  description={text("Only a complete Cloudflare inventory, a valid Tunnel ID, healthy status, and a production-capable Tunnel name allow preparation. The server rechecks the Tunnel before creating resources.", "ต้องตรวจ inventory ของ Cloudflare ครบ, Tunnel ID ถูกต้อง, สถานะ healthy และชื่อไม่ระบุว่าเป็น dev/staging/test จึงเริ่มเตรียมได้ ระบบจะตรวจ Tunnel ซ้ำก่อนสร้าง resource")}
                  options={databaseTunnels.map(tunnel => ({
                    value: tunnel.id,
                    label: tunnel.name,
                    description: `${tunnelStatusLabel(tunnel)} · ${tunnel.id}`,
                  }))}
                  value={selectedDatabaseTunnelId}
                  onChange={value => setProductionTunnelSelections(current => ({ ...current, [tunnelSelectionKey]: value }))}
                  placeholder={text("Choose a verified Tunnel", "เลือก Tunnel ที่ตรวจสอบแล้ว")}
                  emptyText={text("No verified production-capable Tunnel is available.", "ไม่พบ Tunnel ที่ตรวจสอบแล้วและเหมาะกับ Production")}
                  isDisabled={!databaseTunnelInventoryComplete || databaseTunnels.length === 0}
                  width="100%"
                />
                {!databaseTunnelInventoryComplete ? <p role="alert">{text(
                  `Cloudflare Tunnel inventory is incomplete (HTTP ${inventory.accessChecks.tunnels?.httpStatus ?? "not checked"}). Refresh the inventory before selecting a Tunnel.`,
                  `ตรวจรายการ Cloudflare Tunnel ไม่ครบ (HTTP ${inventory.accessChecks.tunnels?.httpStatus ?? "ยังไม่ได้ตรวจ"}) ให้รีเฟรช inventory ก่อนเลือก Tunnel`,
                )}</p> : databaseTunnels.length === 0 ? <p role="alert">{text(
                  "No verified production-capable Tunnel is available. Existing Tunnel records are shown below with the reason they cannot be selected; no new Tunnel is required by this screen.",
                  "ยังไม่มี Tunnel ที่ตรวจสอบแล้วและเหมาะกับ Production รายการ Tunnel เดิมแสดงด้านล่างพร้อมเหตุผลที่เลือกไม่ได้ หน้านี้ไม่ได้กำหนดให้สร้าง Tunnel ใหม่",
                )}</p> : databaseTunnels.length > 1 && !selectedDatabaseTunnelId ? <p role="status">{text(
                  "Choose the existing Tunnel that reaches the retained PostgreSQL host. The action enables after a selection.",
                  "เลือก Tunnel เดิมที่เชื่อมถึง PostgreSQL บนเครื่องเดิม ปุ่มจะเปิดให้กดหลังเลือก Tunnel",
                )}</p> : databaseTunnels.length === 1 ? <p role="status">{text("The only verified production-capable Tunnel is selected automatically.", "เลือก Tunnel ที่ตรวจสอบแล้วและเหมาะกับ Production เพียงรายการเดียวให้อัตโนมัติแล้ว")}</p> : null}
                {unverifiedDatabaseTunnels.length > 0 ? <VStack as="ul" gap={1} aria-label={text("Unavailable Tunnel reasons", "เหตุผลที่ Tunnel เดิมเลือกไม่ได้")}>
                  {unverifiedDatabaseTunnels.map(tunnel => <li key={tunnel.id}>
                    <code>{tunnel.name || text("Unnamed Tunnel", "Tunnel ไม่มีชื่อ")}</code> · <code>{tunnelStatusLabel(tunnel)}</code> · <code>{tunnel.id}</code> — {productionDatabaseTunnelBlocker(tunnel)}
                  </li>)}
                </VStack> : null}
                <Button type="button" disabled={!databaseTunnelInventoryComplete || !selectedDatabaseTunnelId || productionDatabaseMutation.isPending || databaseJobAlreadySubmitted}
                  onClick={() => {
                    const retrySameSubmission = databaseAdmission?.status === "ADMISSION_UNKNOWN" || databaseAdmission?.status === "SUBMITTING";
                    const submissionId = retrySameSubmission ? databaseAdmission.submissionId : crypto.randomUUID();
                    const tunnelId = retrySameSubmission ? databaseAdmission.tunnelId : selectedDatabaseTunnelId;
                    const submitting: ProductionDatabaseAdmission = { submissionId, tunnelId, status: "SUBMITTING" };
                    setProductionDatabaseAdmissions(current => ({ ...current, [productionScopeKey]: submitting }));
                    storeProductionDatabaseAdmission(productionScopeKey, submitting);
                    productionDatabaseMutation.mutate({ tenantId, projectId, environment: "production", tunnelId, submissionId });
                  }}>
                  {productionDatabaseMutation.isPending ? text("Submitting…", "กำลังส่งคำขอ…") : databaseJobAlreadySubmitted
                    ? text("Production database job already exists", "มีงานเตรียมฐานข้อมูล Production แล้ว")
                    : databaseAdmission?.status === "ADMISSION_UNKNOWN"
                      ? text("Reconcile the same submission", "ตรวจสอบคำขอเดิมอีกครั้ง")
                      : databaseAdmission?.status === "ADMISSION_REJECTED" || databaseAdmission?.status === "FAILED"
                        ? text("Submit a new Production database attempt", "ส่งคำขอเตรียมฐานข้อมูล Production ใหม่")
                        : text("Prepare Production database connection", "เตรียมการเชื่อมต่อฐานข้อมูล Production")}
                </Button>
                {((productionDatabaseJobData?.status === "expired" &&
                  productionDatabaseJobData.errorCode === "JOB_DEADLINE_EXPIRED" &&
                  productionDatabaseJobData.operatorReviewRequired &&
                productionDatabaseJobData.operatorReviewReason === "adapter_contract_unsupported") || productionDatabaseGuardRecovery || productionDatabaseProviderRecovery || productionDatabaseReadbackRecovery) ? <VStack gap={1} role="group" aria-label={text("Resume the same Production database job", "กู้งานเตรียมฐานข้อมูล Production เดิม") }>
                    <p role="alert">{productionDatabaseReadbackRecovery ? text(
                      "Attempt 4 created the exact Production VPC and Hyperdrive, then failed because Cloudflare returned an empty optional mTLS object. This action authorizes one bounded same-job recovery after the exact resource IDs and bindings are verified. It creates no new resource and does not change traffic; Cloudflare SQL acceptance is still required.",
                      "Attempt 4 สร้าง VPC และ Hyperdrive Production เดิมแล้ว แต่ล้มเหลวเพราะ Cloudflare ส่ง optional mTLS object ว่าง ปุ่มนี้อนุมัติกู้งานเดิมได้อีกครั้งเดียวหลังยืนยัน ID และ binding ของ resource เดิม ไม่สร้าง resource ใหม่และไม่เปลี่ยน traffic และยังต้องทดสอบ SQL จาก Cloudflare",
                    ) : productionDatabaseProviderRecovery ? text(
                      "Hyperdrive connection failed (CF2015). This action checks the healthy Tunnel, original VPC and encrypted credential, then authorizes one bounded recovery of the SAME job. It creates no new VPC and does not change production traffic. Cloudflare SQL acceptance remains required.",
                      "Hyperdrive เชื่อมต่อไม่สำเร็จ (CF2015) ระบบจะตรวจ Tunnel, VPC เดิมและ credential ที่เข้ารหัส ก่อนอนุมัติกู้งานเดิมเพิ่ม 1 ครั้ง ไม่สร้าง VPC ซ้ำและไม่เปลี่ยน traffic โดยยังต้องผ่านการทดสอบ SQL จาก Cloudflare",
                    ) : productionDatabaseGuardRecovery ? text(
                      "The credential guard incorrectly rejected a successful authorization check. The two-attempt budget is exhausted. This action explicitly authorizes one additional attempt on the same job and resource plan after the fix. It does not authorize production traffic.",
                      "ระบบตรวจ credential ตีความผลตรวจสิทธิ์สำเร็จผิดพลาด และใช้สิทธิ์เดิมครบ 2 ครั้งแล้ว ปุ่มนี้อนุมัติเพิ่มเพียง 1 ครั้งให้งานและแผนเดิมหลังแก้ไข ไม่อนุมัติการเปลี่ยน traffic",
                    ) : text(
                      "This job expired before a worker claimed it because its adapter contract was not admitted. No Cloudflare resource was created. The original grant has expired, so an authenticated Admin must renew authorization; the same Job ID and resource plan will be reused.",
                      "งานหมดอายุก่อน worker รับไปทำ เพราะระบบไม่ยอมรับ contract ของ adapter จึงยังไม่ได้สร้าง Cloudflare resource และ grant เดิมหมดอายุแล้ว Admin ที่ยืนยันตัวตนต้องต่ออายุสิทธิ์ โดยระบบจะใช้ Job ID และแผน resource เดิม",
                    )}</p>
                    <Button type="button" disabled={resumeProductionDatabaseMutation.isPending ||
                      !databaseTunnelInventoryComplete || !productionDatabaseJobData?.tunnelId ||
                      selectedDatabaseTunnelId !== productionDatabaseJobData?.tunnelId ||
                      (productionDatabaseReadbackRecovery && !productionReadbackRecoveryResourcesVerified)}
                      onClick={() => resumeProductionDatabaseMutation.mutate({ tenantId, projectId,
                        jobId: productionDatabaseJobData!.jobId, tunnelId: productionDatabaseJobData!.tunnelId!, environment: "production",
                        ...((productionDatabaseGuardRecovery || productionDatabaseProviderRecovery || productionDatabaseReadbackRecovery) ? { authorizeAdditionalAttempt: true as const } : {}) })}>
                      {resumeProductionDatabaseMutation.isPending
                        ? text("Renewing and resuming the same job…", "กำลังต่ออายุสิทธิ์และกู้งานเดิม…")
                        : productionDatabaseProviderRecovery || productionDatabaseReadbackRecovery
                          ? text("Authorize recovery of existing Hyperdrive job", "อนุมัติกู้คืน Hyperdrive โดยใช้งานและ VPC เดิม")
                          : productionDatabaseGuardRecovery
                          ? text("Authorize one corrected attempt on this same job", "อนุมัติเพิ่ม 1 ครั้งให้งานเดิมหลังแก้ไข")
                          : text("Renew authorization and resume this same job", "ต่ออายุสิทธิ์และทำงานเดิมต่อ")}
                    </Button>
                    {resumeProductionDatabaseMutation.error ? <p role="alert"><code>{resumeProductionDatabaseMutation.error.message}</code></p> : null}
                  </VStack> : null}
                {databaseAdmissionStatus || databaseAdmission?.errorCode ? <VStack gap={1} role="status" aria-label={text("Production database admission status", "ผลการรับคำขอฐานข้อมูล Production")}>
                  <p>{text("Admission status", "สถานะการรับคำขอ")}: <strong>{databaseAdmissionStatus ?? "ADMISSION_REJECTED"}</strong></p>
                  {databaseAdmission?.errorCode ? <p role="alert">{text("Stage result", "ผลขั้นตอน")}: <code>{databaseAdmission.errorCode}</code>{databaseAdmission.traceId ? <> · {text("Request ID", "Request ID")}: <code>{databaseAdmission.traceId}</code></> : null}</p> : null}
                  {databaseAdmissionStatus === "ADMISSION_UNKNOWN" ? <p>{text("The response did not prove whether the registry accepted this request. Use the button to reconcile or retry the same submission; it reuses the same ID and will not create a duplicate.", "ผลตอบกลับยังยืนยันไม่ได้ว่า registry รับคำขอแล้วหรือไม่ ให้กดตรวจสอบหรือส่งคำขอเดิมซ้ำ ระบบจะใช้ ID เดิมและไม่สร้างงานซ้ำ")}</p> : null}
                  {databaseAdmissionStatus === "JOB_ACCEPTED" || databaseAdmissionStatus === "RUNNING" ? <p>{text("Canonical registry confirmed this job. This page follows the same job and does not create duplicates.", "ยืนยัน job จาก canonical registry แล้ว หน้านี้ติดตามงานเดิมและไม่สร้างซ้ำ")}</p> : null}
                </VStack> : null}
                {productionDatabaseJobData || submittedDatabaseJobId ? <VStack gap={1} role="status" aria-label={text("Production database provisioning job", "สถานะงานเตรียมฐานข้อมูล Production")}>
                  <p>{text("Job", "งาน")}: <code>{productionDatabaseJobData?.jobId ?? submittedDatabaseJobId}</code> · {text("Status", "สถานะ")}: <strong>{productionDatabaseJobData?.status ?? "queued"}</strong>
                    {productionDatabaseJobData?.attempt ? <> · {text("Attempt", "ครั้งที่")}: {productionDatabaseJobData.attempt}/{productionDatabaseJobData.maxAttempts}</> : null}</p>
                  {productionDatabaseJobData?.errorCode ? <p role="alert"><code>{productionDatabaseJobData.errorCode}</code></p> : null}
                  {productionDatabaseJobData?.vpcService ? <p>VPC: <code>{productionDatabaseJobData.vpcService.name}</code> · <code>{productionDatabaseJobData.vpcService.id}</code> · TLS <code>{productionDatabaseJobData.vpcService.tlsVerification}</code></p> : null}
                  {productionDatabaseJobData?.hyperdrive ? <p>Hyperdrive: <code>{productionDatabaseJobData.hyperdrive.name}</code> · <code>{productionDatabaseJobData.hyperdrive.id}</code></p> : null}
                  {productionDatabaseJobData?.providerConfigurationVerified ? <p role="note">{text("Cloudflare resource readback passed. The live PostgreSQL connection and a least-privilege application role are not verified by this step.", "ตรวจ readback ของ resource บน Cloudflare ผ่านแล้ว ขั้นตอนนี้ยังไม่ได้ยืนยันการเชื่อมต่อ PostgreSQL จริงหรือ application role แบบ least-privilege")}</p> : null}
                  {productionDatabaseJobData?.status === "queued" || submittedDatabaseJobId ? <p>{text("The canonical worker will claim this same job. This page follows its status and will not create duplicates.", "canonical worker จะรับงานเดิม หน้านี้ติดตามสถานะและไม่สร้าง job ซ้ำ")}</p> : null}
                </VStack> : null}
              </VStack> : null}
              {inventory.productionDatabaseProvisioning ? <VStack as="section" gap={1} role="group" aria-label={text("Production database provisioning access", "สิทธิ์สำหรับเตรียมฐานข้อมูล Production")}>
                <p><strong>{text("Production PostgreSQL connection setup", "การเตรียมการเชื่อมต่อ PostgreSQL ของ Production")}</strong></p>
                <p>{text("Read-only permission checks for the private PostgreSQL path (HTTP 200 proves read access only):", "ผลตรวจสิทธิ์อ่านสำหรับ PostgreSQL ส่วนตัว (HTTP 200 ยืนยันเฉพาะการอ่าน):")}</p>
                <VStack as="ul" gap={1}>
                  {Object.entries(inventory.productionDatabaseProvisioning.checks ?? {}).map(([key, check]) => {
                    const info = ({
                      hyperdrive: { en: "Hyperdrive", th: "Hyperdrive", read: "Account → Hyperdrive → Read" },
                      tunnel: { en: "Cloudflare Tunnel", th: "Cloudflare Tunnel", read: "Account → Cloudflare Tunnel → Read" },
                      vpcServices: { en: "Workers VPC service", th: "Workers VPC service", read: "Account → Connectivity Directory → Read" },
                      containers: { en: "Cloudflare Containers", th: "Cloudflare Containers", read: "Account → Containers → Read" },
                      mtlsCertificates: { en: "Legacy Staging Hyperdrive trust inventory (optional for Production VPC)", th: "รายการ trust ของ Staging Hyperdrive เดิม (ไม่จำเป็นต่อ Production VPC)", read: "Account → SSL and Certificates → Read; Write only if migrating the existing Staging trust" },
                    } as const)[key as "hyperdrive" | "tunnel" | "vpcServices" | "containers" | "mtlsCertificates"] ?? { en: key, th: key, read: "Account → Connectivity Directory → Read" };
                    return <li key={key}><strong>{text(info.en, info.th)}</strong>: HTTP {check.httpStatus ?? text("not checked", "ยังไม่ได้ตรวจ")} · {check.readable ? text("readable", "อ่านได้") : key === "mtlsCertificates"
                      ? text("not required for Production VPC provisioning", "ไม่จำเป็นต่อการเตรียม Production VPC")
                      : text("read denied/incomplete", "สิทธิ์อ่านถูกปฏิเสธหรือตรวจไม่ครบ")} {!check.readable && key !== "mtlsCertificates" ? <>· {text("read scope", "สิทธิ์อ่าน")}: <code>{info.read}</code></> : null}</li>;
                  })}
                </VStack>
                <p>{text("Complete permission packet for the remaining Production setup. Select the listed account or smartaihub.app zone scope in Cloudflare API Tokens. Edit scopes apply only to the named create/change operation; verified resources are reused.", "รายการ permission รวมสำหรับขั้นตอน Production ที่เหลือ ให้เลือก scope ตาม account หรือ zone smartaihub.app ใน Cloudflare API Tokens สิทธิ์ Edit ใช้เฉพาะการสร้าง/แก้ไขตาม operation ที่ระบุ และระบบจะใช้ resource ที่ตรวจผ่านแล้วซ้ำ")}</p>
                <VStack as="ul" gap={1}>{inventory.productionDatabaseProvisioning.permissionPacket.map(item => <li key={`${item.scope}:${item.permission}`}>
                  <strong>{item.scope} · <code>{item.permission}</code></strong>
                  <details><summary>{text("Exact API operations", "API operation ที่ใช้จริง")}</summary>
                    <VStack as="ul" gap={1}>{item.operations.map(operation => <li key={operation}><code>{operation}</code></li>)}</VStack>
                  </details>
                </li>)}</VStack>
                <p>{text("Conditional only; do not add unless that exact transport/resource is selected:", "เพิ่มเฉพาะกรณีที่เลือกใช้ transport/resource ตามเงื่อนไขนี้:")}</p>
                <VStack as="ul" gap={1}>{inventory.productionDatabaseProvisioning.conditionalPermissions.map(item => <li key={`${item.scope}:${item.permission}`}>
                  <strong>{item.scope} · <code>{item.permission}</code></strong>: {item.condition}
                </li>)}</VStack>
                <p>{text("Read probes do not prove Edit access. Queue/DLQ are already verified, so no Queue Edit is needed unless inventory later proves one absent. Production Route Edit is only used by the independently authorized canary/cutover step.", "ผลตรวจ Read ไม่ยืนยันสิทธิ์ Edit โดย Queue/DLQ ผ่านการตรวจแล้ว จึงไม่ต้องใช้ Queue Edit เว้นแต่ inventory ภายหลังพบว่าขาด ส่วน Production Route Edit ใช้เฉพาะช่วง canary/cutover ที่มี authorization แยก")}</p>
              </VStack> : null}
              <p><strong>{text("Production Worker release baseline", "baseline release ของ Production Worker")}</strong>: {verifiedRollback
                ? text("A version has the expected immutable release identity.", "พบ version ที่มี immutable release identity ตรงตามระบบ")
                : text("No active version has a verified SmartAIHub source, artifact, and configuration identity; it cannot be used as a rollback baseline.", "version ที่ทำงานอยู่ยังไม่มี source, artifact และ configuration identity ที่ตรวจสอบได้ จึงใช้เป็น rollback baseline ไม่ได้")}</p>
              {activeVersions.length > 0 ? <p>{text("Active Worker bindings", "binding ของ Worker ที่ทำงานอยู่")}: <code>{[...new Set(activeVersions.flatMap(version => version.bindingNames))].join(", ") || text("none", "ไม่มี")}</code></p> : null}
              <p><strong>{text("smartaihub.app traffic route", "route ของ traffic smartaihub.app")}</strong>: {inventory.domainRoute.conflicting
                ? text("Conflicting route found; cutover must stop for review.", "พบ route ขัดแย้ง ต้องหยุด cutover เพื่อตรวจสอบ")
                : inventory.domainRoute.attached ? text("Attached to the Production Worker.", "ผูกกับ Production Worker แล้ว")
                  : text("The exact smartaihub.app/* Worker Route is not attached. DNS and Custom Domain mappings are not changed by this check.", "ยังไม่มี Worker Route แบบตรง smartaihub.app/* การตรวจนี้ไม่ได้เปลี่ยน DNS หรือ Custom Domain mapping")}</p>
              {hasProductionQueue && hasProductionDeadLetterQueue ? <p role="status">{text(
                "Production Queue and dead-letter queue are verified. Do not run Queue preparation again; they are not yet bound to the Worker.",
                "ตรวจ Production Queue และ dead-letter queue ผ่านแล้ว ไม่ต้องกดเตรียม Queue ซ้ำ ตอนนี้ยังไม่ได้ bind เข้ากับ Worker",
              )}</p> : null}
              {productionResourceGaps.length > 0 ? <p role="status">{text(
                `Remaining Production setup: ${productionResourceGaps.join(", ")}. This inventory check is read-only and has not changed traffic.`,
                `งาน Production ที่ยังเหลือ: ${productionResourceGaps.join(", ")} การตรวจ inventory นี้อ่านอย่างเดียวและยังไม่ได้เปลี่ยน traffic`,
              )}</p> : null}
              <p>{text(
                `The saved Production token can read account ${inventory.accountRef}. PostgreSQL will use a Workers VPC TCP service over the existing private Tunnel, then Hyperdrive. This avoids creating a public database DNS record or Access service token. The production token is reused; do not paste it again.`,
                `Token Production ที่บันทึกไว้อ่าน account ${inventory.accountRef} ได้ เส้นทาง PostgreSQL จะใช้ Workers VPC แบบ TCP ผ่าน Tunnel ส่วนตัวเดิม แล้วเชื่อมต่อ Hyperdrive จึงไม่ต้องสร้าง DNS สาธารณะหรือ Access service token และระบบใช้ token Production ที่บันทึกไว้แล้ว ไม่ต้องใส่ซ้ำ`,
              )}</p>
              <p>
                <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noreferrer">
                  {text("Open Cloudflare API Tokens only if a write operation reports a missing scope", "เปิดหน้า Cloudflare API Tokens เฉพาะเมื่อขั้นตอนเขียนแจ้งว่าขาดสิทธิ์")}
                </a>
              </p>
              {productionHyperdrives.length === 0 ? <p role="status">{text(
                "The retained PostgreSQL connection needs a trusted certificate matching db.smartaihub.app. This plan uses verify_full, which validates both the certificate chain and hostname; a private CA rejected by Cloudflare must be replaced with a publicly trusted or Cloudflare Origin CA certificate before the database path can pass runtime verification.",
                "การเชื่อมต่อ PostgreSQL เดิมต้องใช้ certificate ที่เชื่อถือได้และตรงกับ db.smartaihub.app แผนนี้ใช้ verify_full เพื่อตรวจทั้ง chain และ hostname หาก Cloudflare ไม่เชื่อถือ private CA ปัจจุบัน ต้องเปลี่ยนเป็น certificate จาก public CA หรือ Cloudflare Origin CA ก่อนตรวจ runtime ผ่าน",
              )} <a href="https://developers.cloudflare.com/hyperdrive/configuration/connect-to-private-database-vpc/" target="_blank" rel="noreferrer">
                {text("Cloudflare: private PostgreSQL with Workers VPC", "คู่มือ Cloudflare: เชื่อม PostgreSQL ส่วนตัวด้วย Workers VPC")}
              </a></p> : null}
              <p className="text-xs text-muted-foreground">{text("Checked", "ตรวจเมื่อ")}: {new Date(inventory.checkedAt).toLocaleString()}</p>
            </VStack>;
          })() : null}
          <Divider />
        </VStack>
      ) : null}
      {!validScope ? <p role="status">{text("Select a tenant, an active canonical project, and preview, staging, or production to inspect target authority.", "เลือก tenant, canonical project ที่ active และ preview, staging หรือ production เพื่อตรวจ target authority")}</p> : null}
      {validScope && targetsQuery.isError ? <p role="alert">{text("Target registry could not be read. The current authority state is unknown; exact-admin access may be required.", "อ่าน target registry ไม่สำเร็จ สถานะ authority ยังไม่ทราบ และอาจต้องใช้ exact-admin")}</p> : null}
      {validScope && targetsQuery.isLoading ? <p role="status">{text("Reading target registry…", "กำลังอ่าน target registry…")}</p> : null}
      {validScope && !targetsQuery.isLoading && !targetsQuery.isError && isConflict ? <p role="alert">TARGET_AUTHORITY_CONFLICT: {text("multiple enabled Cloudflare targets exist for this scope. Resolve the conflict before deployment.", "พบ Cloudflare target ที่เปิดใช้งานหลายรายการใน scope นี้ ต้องแก้ conflict ก่อน deploy")}</p> : null}
      {validScope && !targetsQuery.isLoading && !targetsQuery.isError && cloudflareTargets.length === 0 ? <p role="status">NOT_CONFIGURED: {environment === "production"
        ? text("The Production destination has not been prepared yet. Review and confirm the prepared destination above.", "ยังไม่ได้เตรียมปลายทาง Production ตรวจข้อมูลที่ระบบเตรียมไว้และกดยืนยันด้านบน")
        : text("No Cloudflare target is registered. An owner must explicitly approve and record a staging or preview target.", "ยังไม่มี Cloudflare target ที่ลงทะเบียน เจ้าของระบบต้องอนุมัติและบันทึก target สำหรับ staging หรือ preview อย่างชัดเจน")}</p> : null}
      {validScope && !targetsQuery.isLoading && !targetsQuery.isError && cloudflareTargets.length > 0 && enabledCloudflareTargets.length === 0 ? <p role="status">WAITING_TARGET_AUTHORITY: {text("Only disabled Cloudflare targets are recorded. An exact admin must review and explicitly enable one.", "มีเฉพาะ Cloudflare target ที่ปิดอยู่ exact admin ต้องตรวจและเปิดใช้งานอย่างชัดเจน")}</p> : null}

      {targets.length > 0 ? (
        <VStack as="ul" gap={2}>
          {targets.map(target => (
            <VStack as="li" key={target.id} gap={3}>
              <HStack gap={2} wrap="wrap">
                <strong>{target.deploymentTargetId}</strong>
                <Badge variant={target.enabled ? "default" : "secondary"}>{target.enabled ? text("Enabled", "เปิดใช้งาน") : text("Disabled", "ปิดใช้งาน")}</Badge>
                <Badge variant="outline">{target.provider}</Badge>
                {target.provider === "cloudflare" ? <CredentialReadiness target={target} /> : <Badge variant="secondary">{text("Cloudflare-only controls unavailable", "ไม่มี controls สำหรับผู้ให้บริการนี้")}</Badge>}
              </HStack>
              <p>{text("Scope", "ขอบเขต")}: {target.tenantId} / {target.projectId} / {target.environment}</p>
              <p>{text("Provider identity", "Provider identity")}: {target.provider} · {text("Provenance", "หลักฐานที่มา")}: {target.provenance}</p>
              {target.provider === "cloudflare" ? <>
                <details>
                  <summary>{text("Edit target", "แก้ไข target")}</summary>
                  <TargetEditor target={target} saving={updateMutation.isPending} onSave={changes => updateMutation.mutate({
                    tenantId: target.tenantId,
                    projectId: target.projectId,
                    environment: target.environment,
                    provider: "cloudflare",
                    targetRowId: target.id,
                    changes: {
                      deploymentTargetId: changes.deploymentTargetId.trim(),
                      accountRef: changes.accountRef.trim() || null,
                      workerRef: changes.workerRef.trim() || null,
                      containerApplicationRef: changes.containerApplicationRef.trim() || null,
                      provenance: changes.provenance.trim(),
                    },
                  })} />
                </details>
                <HStack gap={2}>
                  {target.enabled ? (
                    <Button variant="destructive" disabled={disableMutation.isPending} onClick={() => disableMutation.mutate({
                      tenantId: target.tenantId, projectId: target.projectId, environment: target.environment,
                      provider: "cloudflare", targetRowId: target.id,
                    })}>{text("Disable target", "ปิด target")}</Button>
                  ) : (
                    <Button disabled={updateMutation.isPending || isConflict} onClick={() => updateMutation.mutate({
                      tenantId: target.tenantId, projectId: target.projectId, environment: target.environment,
                      provider: "cloudflare", targetRowId: target.id, changes: { enabled: true },
                    })}>{text("Enable reviewed target", "เปิด target ที่ตรวจแล้ว")}</Button>
                  )}
                </HStack>
              </> : null}
              <Divider />
            </VStack>
          ))}
        </VStack>
      ) : null}

      {validScope && environment === "staging" ? (
        <VStack as="section" gap={2}>
          {stagingActionStatus ? <VStack gap={0} role={stagingActionStatus.state === "failed" ? "alert" : "status"} aria-live="polite">
            <p><strong>{stagingActionStatus.state === "running" ? text("Action started", "เริ่มดำเนินการแล้ว")
              : stagingActionStatus.state === "accepted" ? text("Canonical Job accepted", "ระบบรับ Job กลางแล้ว")
                : stagingActionStatus.state === "succeeded" ? text("Action completed", "ดำเนินการเสร็จแล้ว")
                : text("Action failed", "ดำเนินการไม่สำเร็จ")}</strong>: {stagingActionStatus.action}</p>
            {stagingActionStatus.detail ? stagingActionStatus.state === "failed"
              && stagingActionFailureText(stagingActionStatus.detail, text) !== stagingActionStatus.detail
              ? <p>{stagingActionFailureText(stagingActionStatus.detail, text)} · <code>{stagingActionStatus.detail}</code></p>
              : <p>{stagingActionStatus.state === "accepted" ? text("Job ID", "รหัส Job") : null} <code>{stagingActionStatus.detail}</code></p> : null}
            <p>{text("Updated", "อัปเดตเมื่อ")}: {new Date(stagingActionStatus.at).toLocaleString()}</p>
          </VStack> : null}
          {savedStagingScope?.tenantId === tenantId && savedStagingScope.projectId === projectId ? <p role="status">{text(
            "Staging settings saved. Continue with “Authorize and deploy to staging” below. Worker readiness changes after deployment.",
            "บันทึกการตั้งค่า Staging สำเร็จแล้ว ให้ดำเนินการ “อนุมัติและ deploy ไป staging” ด้านล่าง สถานะ Worker จะเปลี่ยนหลัง deploy",
          )}</p> : null}
          {stagingOriginConfiguration.data?.applicationPreparation ? (() => {
            const preparation = stagingOriginConfiguration.data.applicationPreparation;
            return <VStack gap={1} role="group" aria-label={text("Full Application Staging preparation", "เตรียม Staging สำหรับแอปเต็มรูปแบบ")}>
              <h3>{text("Full Application Staging candidate", "Candidate Staging สำหรับแอปเต็มรูปแบบ")}</h3>
              <p><strong>{preparation.phase === "FULL_HTTP" ? text("FULL HTTP configuration", "ตั้งค่า FULL HTTP แล้ว")
                : preparation.phase === "NAMESPACE_ONLY" ? text("NAMESPACE ONLY — not deployable as the application", "มีเฉพาะ NAMESPACE — ยัง deploy แอปไม่ได้")
                  : preparation.phase === "PRIVATE_CANARY" ? text("Private canary configuration", "ตั้งค่าเฉพาะ private canary")
                : text("Not configured", "ยังไม่ได้ตั้งค่า")}</strong> · {text("Source configuration", "config ต้นทาง")}: <code>{preparation.sourceConfigurationRef}</code></p>
              <p>{text("Status", "สถานะ")}: <code>{preparation.candidateStatus}</code> · {text("Image receipts", "receipt ของ image")}: {preparation.imageReceipts}
                · {text("Encrypted app secrets", "secret แอปที่เข้ารหัส")}: {preparation.encryptedApplicationSecrets}
                · {text("Container bindings", "binding ของ Container")}: {preparation.containerBindings}</p>
              {preparation.missingRuntimeFields.length ? <p>{text("Missing runtime configuration", "ค่าตั้งค่า runtime ที่ยังขาด")}: <code>{preparation.missingRuntimeFields.join(", ")}</code></p> : null}
              <VStack gap={0} role="alert" aria-label={text("Staging database authority required", "ต้องมีสิทธิ์ฐานข้อมูล Staging")}>
                <p><strong><code>{preparation.databaseAuthority.code}</code></strong> · {text("Full Application preparation is blocked", "ยังเตรียม Full Application ไม่ได้")}</p>
                {preparation.databaseAuthority.host ? <p>{text("Exact Staging resource", "resource Staging ที่ระบุ")}: <code>{preparation.databaseAuthority.host}/{preparation.databaseAuthority.databaseName}</code>
                  · {text("Current role", "role ปัจจุบัน")}: <code>{preparation.databaseAuthority.readOnlyProbeRole}</code> ({preparation.databaseAuthority.existingRoleAccess})</p> : null}
                <p>{text("Required scoped grants", "สิทธิ์แบบจำกัดที่ต้องมี")}: {preparation.databaseAuthority.requiredPermissions.join("; ")}</p>
                <p>{text("Must remain excluded", "ต้องไม่มีสิทธิ์ต่อไปนี้")}: {preparation.databaseAuthority.excludedPermissions.join("; ")}</p>
              </VStack>
              <p>{text("The current Prepare Staging action only prepares the existing control-plane/Queue profile. It does not create a Full HTTP candidate or deploy application traffic. No Production database credential is reused.",
                "ปุ่มเตรียม Staging ปัจจุบันเตรียมเฉพาะ profile ของ control plane/Queue เดิม ไม่ได้สร้าง Full HTTP candidate หรือ deploy traffic ของแอป และจะไม่ใช้ credential ของ Production ซ้ำ")}</p>
            </VStack>;
          })() : null}
          <HStack gap={2} wrap="wrap">
            <h3>{text("Live Cloudflare Worker readiness", "ความพร้อมของ Cloudflare Worker ที่กำลังทำงาน")}</h3>
            <Button type="button" variant="outline" size="sm" onClick={() => requestStagingConfirmation({
              title: text("Check Staging runtime readiness", "ตรวจความพร้อม runtime ของ Staging"),
              description: text("This performs a read-only request to the exact Staging Worker /readyz endpoint. It does not deploy or change traffic.", "ระบบจะเรียก /readyz ของ Staging Worker เป้าหมายแบบอ่านอย่างเดียว ไม่ deploy และไม่เปลี่ยน traffic"),
              confirmLabel: text("Run read-only check", "เริ่มตรวจแบบอ่านอย่างเดียว"),
              run: async () => { const result = await stagingRuntimeReadiness.refetch(); if (result.isError) throw new Error("STAGING_RUNTIME_READINESS_CHECK_FAILED"); return result; },
            })} disabled={stagingRuntimeReadiness.isFetching || stagingActionRunning}>
              {text("Check now", "ตรวจสอบตอนนี้")}
            </Button>
          </HStack>
          {stagingRuntimeReadiness.isLoading ? <p role="status">{text("Checking the exact staging Worker’s /readyz endpoint…", "กำลังตรวจ /readyz ของ staging Worker เป้าหมาย…")}</p> : null}
          {stagingRuntimeReadiness.isError ? <p role="alert">{text("Live runtime readiness could not be checked. Artifact deploy readiness does not prove Worker readiness.", "ตรวจความพร้อม runtime ไม่สำเร็จ การพร้อม deploy artifact ไม่ได้ยืนยันว่า Worker พร้อมใช้งาน")}</p> : null}
          {stagingRuntimeReadiness.data ? (() => {
            const runtime = stagingRuntimeReadiness.data;
            const ready = runtime.status === "READY";
            const activationRecoveryStatus = runtime.status === "ACTIVATION_DISABLED" || runtime.status === "UNAVAILABLE" ||
              runtime.status === "NOT_DEPLOYED" || runtime.status === "NOT_READY";
            const stagingConfigurationExpired = stagingOriginConfiguration.data?.status === "EXPIRED" ||
              stagingDeployPreflight.data?.reason === "STAGING_ORIGIN_CONFIGURATION_EXPIRED";
            return <VStack gap={1} role={ready ? "status" : "group"} aria-label={text("Live Cloudflare Worker readiness", "ความพร้อมของ Cloudflare Worker ที่กำลังทำงาน")}>
              <HStack gap={2} wrap="wrap">
                <Badge variant={ready ? "default" : "destructive"}>{runtime.status}</Badge>
                {runtime.activation ? <Badge variant="outline">activation: {runtime.activation}</Badge> : null}
                {runtime.transport ? <Badge variant="outline">transport: {runtime.transport}</Badge> : null}
                {runtime.jobHandlerConfigured !== undefined ? <Badge variant="outline">{text("Job handler", "ตัวจัดการงาน")}: {runtime.jobHandlerConfigured ? text("configured", "ตั้งค่าแล้ว") : text("missing", "ยังไม่ตั้งค่า")}</Badge> : null}
                {runtime.controlPlaneConfigured !== undefined ? <Badge variant="outline">{text("Control plane", "control plane")}: {runtime.controlPlaneConfigured ? text("configured", "ตั้งค่าแล้ว") : text("missing", "ยังไม่ตั้งค่า")}</Badge> : null}
              </HStack>
              {runtime.missing.length > 0 ? <p>{text("Missing runtime bindings", "binding ที่ runtime ยังขาด")}: <code>{runtime.missing.join(", ")}</code></p> : null}
              {runtime.applicationIngress ? <VStack gap={0} role="status" aria-label={text("Application HTTP ingress readiness", "ความพร้อม HTTP ingress ของแอป") }>
                <p><strong>{text("Application HTTP ingress", "HTTP ingress ของแอป")}</strong>: {runtime.applicationIngress.ready
                  ? text("READY", "พร้อมใช้งาน")
                  : runtime.applicationIngress.enabled
                    ? text("ENABLED, NOT READY", "เปิดใช้งานแล้ว แต่ยังไม่พร้อม")
                    : text("DISABLED", "ยังไม่เปิดใช้งาน")}</p>
                {runtime.applicationIngress.missing.length > 0 ? <p>{text("Missing application bindings", "binding ของแอปที่ยังขาด")}: <code>{runtime.applicationIngress.missing.join(", ")}</code></p> : null}
              </VStack> : null}
              {runtime.reason ? <p><code>{runtime.reason}</code></p> : null}
              {(stagingConfigurationExpired || activationRecoveryStatus ||
                stagingDeployPreflight.data?.reason === "STAGING_ACTIVATION_PROFILE_REQUIRED") ? (() => {
              const configRef = currentStagingConfigRef;
              const config = stagingOriginConfiguration.data;
              const activationBlocker = stagingDeployPreflight.data?.reason;
              const secretsMissing = config?.workflowRuntimeTokenConfigured === false || config?.controlPlaneTokenConfigured === false;
                const suppliedRuntimeSecrets = Boolean(workflowRuntimeToken || controlPlaneToken);
                const suppliedRuntimeSecretsValid = workflowRuntimeToken.length >= 32 && controlPlaneToken.length >= 32 &&
                  workflowRuntimeToken !== controlPlaneToken && /^[\x21-\x7e]+$/.test(workflowRuntimeToken) && /^[\x21-\x7e]+$/.test(controlPlaneToken);
                const target = enabledCloudflareTargets[0];
                const activationRequired = stagingDeployPreflight.data?.reason === "STAGING_ACTIVATION_PROFILE_REQUIRED";
                const targetAllowsActivation = enabledCloudflareTargets.length === 1 &&
                  target?.deploymentTargetId === "smartspec-cloudflare-staging" &&
                  target.workerRef === "smartspec-cloudflare-staging" && !target.containerApplicationRef;
                const configurationVerified = config?.status === "STORED" &&
                  Boolean(config?.descriptor?.nativeResources?.privateDatabase);
              return <VStack gap={2}>
                  <h4>{text("1. Prepare Staging control-plane profile", "1. เตรียม profile ของ Staging control plane")}</h4>
                  <p>{text(
                    "This action prepares the existing Queue/control-plane profile only. It does not enable Full Application HTTP ingress. After saving, continue with “Authorize and deploy to staging” below.",
                    "ปุ่มนี้เตรียมเฉพาะ Queue/control-plane profile เดิม ไม่ได้เปิด Full Application HTTP ingress เมื่อบันทึกสำเร็จ ให้ดำเนินการ “อนุมัติและ deploy ไป staging” ด้านล่าง",
                  )}</p>
                  {activationBlocker && activationBlocker !== "STAGING_ACTIVATION_PROFILE_REQUIRED" ?
                    <p role="status">{text("Configuration or deployment blocker", "สาเหตุที่ config หรือการ deploy ยังติดอยู่")}: <code>{activationBlocker}</code></p> : null}
                  {stagingConfigurationExpired ? <VStack gap={1} role="alert" aria-label={text("Staging preparation is blocked", "หยุดการเตรียม Staging") }>
                    <p><strong><code>STAGING_ORIGIN_CONFIGURATION_EXPIRED</code></strong></p>
                    <p id="staging-expired-config-help">{text(
                      "Prepare Staging is intentionally disabled: this immutable configuration and its private-database lease have expired. A fresh, verified database receipt and new configuration version are required before profile activation. Rechecking below is read-only and will not create a job or change Cloudflare resources.",
                      "ปุ่มเตรียม Staging ถูกปิดโดยตั้งใจ เพราะ immutable configuration และ lease ของฐานข้อมูล private หมดอายุแล้ว ต้องมี receipt ฐานข้อมูลชุดใหม่ที่ตรวจสอบแล้วและ configuration version ใหม่ก่อน จึงจะ activate profile ได้ ปุ่มตรวจซ้ำด้านล่างเป็นการอ่านอย่างเดียว ไม่สร้าง job และไม่เปลี่ยนทรัพยากร Cloudflare",
                    )}</p>
                    <Button type="button" variant="outline" size="sm" disabled={stagingOriginConfiguration.isFetching || stagingDeployPreflight.isFetching ||
                      stagingRuntimeReadiness.isFetching || (stagingDatabaseRenewal.isFetching && !stagingRenewalPreflightStalled) || stagingActionRunning}
                      onClick={() => requestStagingConfirmation({
                        title: text("Recheck Staging configuration", "ตรวจ config Staging ซ้ำ"),
                        description: text("Read-only: refresh the saved configuration, database lease preflight, deploy preflight, and Worker readiness. This creates no Job and changes no Cloudflare resources.", "อ่านอย่างเดียว: โหลด config, ตรวจ lease ฐานข้อมูล, deploy preflight และ readiness ของ Worker ใหม่ ไม่สร้าง Job และไม่เปลี่ยน Cloudflare resource"),
                        confirmLabel: text("Recheck now", "เริ่มตรวจซ้ำ"),
                        run: async () => {
                          if (stagingRenewalPreflightStalled) {
                            await utils.infrastructure.getCloudflareStagingPrivateDatabaseRenewalPreflight.cancel();
                          }
                          await refreshTargets();
                          const results = await Promise.all([stagingOriginConfiguration.refetch(), stagingDeployPreflight.refetch(),
                            stagingRuntimeReadiness.refetch(), stagingDatabaseRenewal.refetch()]);
                          if (results.some(result => result.isError)) throw new Error("STAGING_READ_ONLY_RECHECK_FAILED");
                          return results;
                        },
                      })}>
                      {stagingRenewalPreflightStalled
                        ? text("Retry Staging check (read-only)", "ตรวจ Staging ซ้ำ (อ่านอย่างเดียว)")
                        : text("Recheck Staging configuration (read-only)", "ตรวจ config Staging ซ้ำ (อ่านอย่างเดียว)")}
                    </Button>
                    {stagingDatabaseRenewal.isLoading ? <p role="status">{text("Checking the existing database lease and Cloudflare resource identities…", "กำลังตรวจ lease ฐานข้อมูลและรหัส resource Cloudflare เดิม…")}</p> : null}
                    {stagingRenewalPreflightStalled ? <p role="alert">{text(
                      "The read-only check has taken over 20 seconds. No renewal Job was created and no Cloudflare resources were changed. Use “Retry Staging check” above to cancel the stalled read and safely check again.",
                      "การตรวจแบบอ่านอย่างเดียวใช้เวลาเกิน 20 วินาที ยังไม่มีการสร้าง Job ต่ออายุหรือเปลี่ยน Cloudflare resource ให้กด “ตรวจ Staging ซ้ำ” ด้านบนเพื่อยกเลิกคำขออ่านที่ค้างแล้วตรวจใหม่อย่างปลอดภัย",
                    )}</p> : null}
                    {stagingDatabaseRenewal.isError ? <p role="alert"><code>PRIVATE_DATABASE_RENEWAL_PREFLIGHT_UNAVAILABLE</code> · {text("The read-only renewal check did not complete. Retry the check before authorizing anything.", "ตรวจข้อมูลก่อนต่ออายุไม่สำเร็จ ให้ตรวจซ้ำก่อนอนุมัติ")}</p> : null}
                    {stagingDatabaseRenewal.data ? (() => {
                      const renewal = stagingDatabaseRenewal.data;
                      const job = renewal.existingJob;
                      const plan = renewal.plan;
                      return <VStack gap={1} role="group" aria-label={text("Staging database lease renewal", "การต่ออายุ lease ฐานข้อมูล Staging")}>
                        <p><strong>{text("Database lease renewal", "ต่ออายุ lease ฐานข้อมูล")}</strong> · {renewal.ready ? text("READY", "พร้อมอนุมัติ") : renewal.reason}</p>
                        {!renewal.ready && renewal.failureStage ? <p role="status">{text("Blocking stage", "ขั้นตอนที่ติดปัญหา")}: <code>{renewal.failureStage}</code></p> : null}
                        {!renewal.ready && renewal.failureDetail ? <p role="status">{text("Read-only diagnostic (field and check only)", "รายละเอียดตรวจสอบแบบอ่านอย่างเดียว (แสดงเฉพาะ field และผลตรวจ)")}: <code>{renewal.failureDetail}</code></p> : null}
                        {renewal.reason === "CANONICAL_JOB_SCHEMA_NOT_READY" ? <p role="alert"><code>0416_unified_chat_thread_overview</code> · {text(
                          "The canonical Job database schema is not installed yet. No renewal policy, grant, or Job was created. Do not retry until the existing authorized migration is applied, then run the read-only recheck.",
                          "ฐานข้อมูล Job กลางยังไม่มี schema ที่จำเป็น จึงยังไม่ได้สร้าง policy, grant หรือ Job ห้ามกดซ้ำจนกว่าจะใช้ migration เดิมที่ได้รับอนุญาต แล้วจึงตรวจซ้ำแบบอ่านอย่างเดียว",
                        )}</p> : null}
                        {plan ? <>
                          <p>{text("Existing scope", "ขอบเขต resource เดิม")}: <code>{plan.sourcePlan.namespace}</code> · <code>{plan.sourceProvisionJobId}</code></p>
                          <details>
                            <summary>{text("Review exact resource IDs and lease dates", "ตรวจรหัส resource และวันหมดอายุ")}</summary>
                            <p>Hyperdrive <code>{plan.resources.hyperdriveId}</code> · CA <code>{plan.resources.caId}</code></p>
                            <p>Access App <code>{plan.resources.accessApplicationId}</code> · Policy <code>{plan.resources.accessPolicyId}</code></p>
                            <p>Service Token <code>{plan.resources.serviceTokenId}</code> · DNS record <code>{plan.resources.dnsRecordId}</code></p>
                            <p>{text("Current role lease", "lease ปัจจุบัน")}: <code>{plan.sourcePlan.configurationExpiresAt}</code></p>
                            <p>{text("New role lease", "lease ใหม่")}: <code>{plan.leaseExpiresAt}</code></p>
                            <p>{text("Current Access service-token expiry", "วันหมดอายุ Access service token ปัจจุบัน")}: <code>{plan.serviceTokenExpiresAt}</code></p>
                            <p>{text("Refresh existing service-token expiry", "ต่ออายุวันหมดอายุ service token เดิม")}: <strong>{plan.refreshServiceTokenExpiry ? text("Yes — same token and secret", "ทำ — ใช้ token และ secret เดิม") : text("No — current token already covers the lease", "ไม่ต้อง — token ปัจจุบันครอบคลุม lease แล้ว")}</strong></p>
                            <p>{text("Authorization expires", "แผนอนุมัติหมดอายุ")}: <code>{plan.authorizationExpiresAt}</code> · {text("Plan digest", "digest แผน")}: <code>{renewal.planDigest}</code></p>
                          </details>
                        </> : null}
                        {job ? <VStack gap={1} role="status">
                          {(() => {
                            const live = stagingRenewalJobStatus.data?.jobId === job.jobId ? stagingRenewalJobStatus.data : null;
                            const status = live?.status ?? job.status;
                            const statusLabel: Record<string, [string, string]> = {
                              queued: ["Queued — waiting for a worker", "เข้าคิวแล้ว — กำลังรอ worker"],
                              pending: ["Pending — waiting for dispatch", "รอส่งให้ worker"],
                              leased: ["Leased by a worker", "worker รับ lease แล้ว"],
                              claimed: ["Claimed — worker is starting", "worker รับงานแล้วและกำลังเริ่ม"],
                              preparing: ["Preparing existing resources", "กำลังตรวจ resource เดิม"],
                              running: ["Running renewal checks", "กำลังตรวจสอบการต่ออายุ"],
                              waiting_external: ["Waiting for Cloudflare or database response", "กำลังรอ Cloudflare หรือฐานข้อมูลตอบกลับ"],
                              retry_scheduled: ["Retry scheduled by the Job Control Plane", "ระบบกำหนดเวลาลองใหม่แล้ว"],
                              uploading: ["Applying the authorized provider update", "กำลังใช้การเปลี่ยนแปลงที่อนุมัติกับ provider"],
                              publishing: ["Verifying the provider update", "กำลังตรวจผลการเปลี่ยนแปลงกับ provider"],
                              indexing: ["Saving the verified receipt", "กำลังบันทึก receipt ที่ตรวจแล้ว"],
                              succeeded: ["Succeeded — receipt is ready to save", "สำเร็จ — พร้อมบันทึก receipt"],
                              completed: ["Completed", "เสร็จแล้ว"],
                              failed: ["Failed — inspect the safe error code", "ไม่สำเร็จ — ตรวจรหัสข้อผิดพลาด"],
                              cancelled: ["Cancelled", "ยกเลิกแล้ว"],
                              canceled: ["Canceled", "ยกเลิกแล้ว"],
                              expired: ["Expired before completion", "หมดเวลาก่อนเสร็จ"],
                              dead_letter: ["Stopped for operator review", "หยุดเพื่อให้ผู้ดูแลตรวจสอบ"],
                            };
                            const isActive = !["succeeded", "completed", "failed", "cancelled", "canceled", "expired", "dead_letter"].includes(status);
                            const heartbeatAt = live?.heartbeatAt ?? job.heartbeatAt;
                            const heartbeatAgeMs = heartbeatAt ? Date.now() - Date.parse(heartbeatAt) : null;
                            const leaseExpired = Boolean(live?.leaseExpiresAt && Date.parse(live.leaseExpiresAt) <= Date.now());
                            const heartbeatStale = isActive && (heartbeatAgeMs === null ? status !== "queued" && status !== "pending" : heartbeatAgeMs > 60_000);
                            const stage = live?.progressStage;
                            const elapsedFrom = live?.startedAt ?? live?.createdAt;
                            const elapsedMs = elapsedFrom ? Math.max(0, Date.now() - Date.parse(elapsedFrom)) : null;
                            const nextAction = status === "succeeded" ? "Save the verified Staging receipt"
                              : status === "failed" && job.retryable ? "Confirm one fresh Staging-only Job"
                              : status === "failed" || status === "expired" || status === "dead_letter" ? "Inspect the recorded failure before any new authorization"
                              : heartbeatStale || leaseExpired ? "Recheck canonical Job status; do not submit another Job"
                              : "Wait while the canonical Job continues; do not submit again";
                            return <>
                              <p><strong>{text("Canonical renewal Job", "Job ต่ออายุในระบบกลาง")}</strong>: <code>{job.jobId}</code></p>
                              <p><strong>{text("Current status", "สถานะปัจจุบัน")}</strong>: {(() => { const copy = statusLabel[status]; return copy ? text(copy[0], copy[1]) : status; })()}</p>
                              {stage ? <p>{text("Executor stage", "ขั้นตอน executor")}: <code>{stage}</code></p> : null}
                              {live?.progressPercent !== null && live?.progressPercent !== undefined ? <p>{text("Reported progress", "ความคืบหน้าที่รายงาน")}: {live.progressPercent}%</p> : null}
                              <p>{text("Attempt", "ครั้งที่")}: {live ? `${live.attempt}/${live.maxAttempts}` : text("Loading authoritative Job status…", "กำลังอ่านสถานะ Job จากระบบกลาง…")}</p>
                              <p>{text("Elapsed", "เวลาที่ผ่านไป")}: {elapsedMs === null ? "—" : `${Math.floor(elapsedMs / 60_000)}m ${Math.floor((elapsedMs % 60_000) / 1_000)}s`}</p>
                              {live?.lastStatusUpdateAt ? <p>{text("Last successful status update", "อัปเดตสถานะสำเร็จล่าสุด")}: {new Date(live.lastStatusUpdateAt).toLocaleString()}</p> : null}
                              <p>{text("Worker / lease", "worker / lease")}: {live?.workerId ? <code>{live.workerId}</code> : status === "queued" || status === "pending" ? text("Waiting for worker", "กำลังรอ worker") : text("Not claimed", "ยังไม่มี worker รับงาน")}{live?.leaseExpiresAt ? ` · ${leaseExpired ? text("lease expired", "lease หมดอายุ") : text("lease active", "lease ยังทำงาน")}` : ""}</p>
                              <p>{text("Last heartbeat", "heartbeat ล่าสุด")}: {heartbeatAt ? new Date(heartbeatAt).toLocaleString() : text("No heartbeat yet", "ยังไม่มี heartbeat")}{heartbeatStale ? ` · ${text("STALE", "ข้อมูลเก่า")}` : ""}</p>
                              {stagingRenewalJobStatus.isError ? <p role="alert">{text("Status connection failed. Retry read-only status; no new Job was submitted.", "เชื่อมต่ออ่านสถานะไม่สำเร็จ ให้ตรวจสถานะแบบอ่านอย่างเดียวอีกครั้ง ไม่มีการส่ง Job ใหม่")}</p> : null}
                              <p>{text("Next action", "ขั้นตอนถัดไป")}: {text(nextAction, status === "succeeded" ? "บันทึก receipt Staging ที่ตรวจแล้ว" : status === "failed" || status === "expired" || status === "dead_letter" ? "ตรวจข้อผิดพลาดก่อนอนุมัติรายการใหม่" : heartbeatStale || leaseExpired ? "ตรวจสถานะ Job เดิม ห้ามส่ง Job ซ้ำ" : "รอ Job เดิมทำงานต่อ ห้ามส่งซ้ำ")}</p>
                              <Button type="button" variant="outline" disabled={stagingRenewalJobStatus.isFetching}
                                onClick={() => void stagingRenewalJobStatus.refetch()}>
                                {stagingRenewalJobStatus.isFetching ? text("Refreshing renewal Job status…", "กำลังตรวจสถานะ Job ต่ออายุ…") : text("Refresh renewal Job status (read-only)", "ตรวจสถานะ Job ต่ออายุ (อ่านอย่างเดียว)")}
                              </Button>
                              {live?.errorCode ? <p role="alert"><code>{live.errorCode}</code></p> : null}
                            </>;
                          })()}
                          {renewal.ready && job.retryable ? <p role="alert"><code>{job.errorCode ?? "JOB_DEADLINE_EXPIRED"}</code> · {text(
                            job.retryReason === "authority_rejected_before_provider"
                              ? "The previous Job is preserved. Its exact failure was at the initial read-only authority check, with no provider/database write or receipt. The grant-to-Job identity binding is corrected; one fresh Staging-only confirmation is required."
                              : job.retryReason === "executor_binding_rejected_before_provider"
                                ? "The previous Job is preserved. Executor proof verification failed at the initial read-only checkpoint before any provider/database write or receipt. The verifier now accepts the authorized lease-renewal action; one fresh Staging-only confirmation is required."
                                : "The previous authorized Job expired before it was claimed. Readback confirms it had no execution attempt or provider checkpoint; its record is preserved. A fresh, separately confirmed Staging-only Job is required.",
                            job.retryReason === "authority_rejected_before_provider"
                              ? "เก็บ Job เดิมไว้แล้ว ความล้มเหลวเกิดตรงขั้นตรวจสิทธิ์แบบอ่านอย่างเดียวก่อนเขียน provider/ฐานข้อมูล และไม่มี receipt แก้การผูก grant กับ Job แล้ว ต้องยืนยัน Job ใหม่สำหรับ Staging อีกหนึ่งครั้ง"
                              : job.retryReason === "executor_binding_rejected_before_provider"
                                ? "เก็บ Job เดิมไว้แล้ว การตรวจลายเซ็น executor ล้มเหลวที่ขั้นแรกก่อนเขียน provider/ฐานข้อมูลหรือมี receipt แก้ verifier ให้ยอมรับ action ต่ออายุ lease ที่ได้รับอนุญาตแล้ว ต้องยืนยัน Job ใหม่สำหรับ Staging อีกหนึ่งครั้ง"
                                : "Job ที่อนุมัติก่อนหน้าหมดเวลาก่อน worker รับงาน การตรวจยืนยันว่าไม่มี execution attempt หรือ provider checkpoint และยังเก็บประวัติเดิมไว้ ต้องยืนยัน Job ใหม่สำหรับ Staging แยกอีกหนึ่งรายการ",
                          )}</p> : null}
                          {job.errorCode && !(renewal.ready && job.retryable) ? <p role="alert"><code>{job.errorCode}</code> · {job.errorCode === "PRIVATE_DATABASE_SERVICE_TOKEN_REFRESH_HTTP_403"
                            ? text("The saved Staging Cloudflare credential needs Access: Service Tokens Write. Update that existing credential's permission, then recheck; do not paste the token here.", "credential Cloudflare ของ Staging ที่บันทึกไว้ต้องมีสิทธิ์ Access: Service Tokens Write ให้ปรับสิทธิ์ของ credential เดิมแล้วตรวจซ้ำ ไม่ต้องนำ token มาวางในหน้านี้")
                            : text("Inspect this existing Job before starting another operation.", "ตรวจ Job เดิมนี้ก่อน ห้ามเริ่มซ้ำ")}</p> : null}
                          {(stagingRenewalJobStatus.data?.jobId === job.jobId ? stagingRenewalJobStatus.data.status : job.status) === "succeeded" ? <Button type="button" disabled={finalizeStagingRenewal.isPending || stagingActionRunning}
                            onClick={() => requestStagingConfirmation({
                              title: text("Save verified Staging renewal", "บันทึกผลต่ออายุ Staging ที่ตรวจแล้ว"),
                              description: text(`Save the verified result from existing Job ${job.jobId} as a new immutable Staging configuration. No new provider mutation will be started.`, `บันทึกผลที่ตรวจแล้วจาก Job ${job.jobId} เป็น config Staging แบบ immutable ชุดใหม่ โดยไม่เริ่มเปลี่ยน provider เพิ่ม`),
                              confirmLabel: text("Save new configuration", "บันทึก config ใหม่"),
                              run: () => finalizeStagingRenewal.mutateAsync({ tenantId, projectId, environment: "staging", configurationRef: currentStagingConfigRef, renewalJobId: job.jobId }),
                            })}>
                            {finalizeStagingRenewal.isPending ? text("Saving renewed configuration…", "กำลังบันทึก config ใหม่…") : text("Save verified renewal as a new Staging configuration", "บันทึก lease ที่ตรวจแล้วเป็น config Staging ชุดใหม่")}
                          </Button> : null}
                          {job.status === "failed" || job.status === "cancelled" || job.status === "dead_letter" ? <p>{job.retryable
                            ? text("This attempt is preserved. A new confirmation is available because the recorded failure is proven to be pre-mutation.", "เก็บ Job เดิมไว้แล้ว ระบบเปิดให้ยืนยันใหม่เพราะตรวจแล้วว่าความล้มเหลวเกิดก่อนการเปลี่ยนแปลง")
                            : text("This attempt is preserved. Resolve its recorded failure before requesting another lease operation.", "เก็บหลักฐานการทำงานนี้ไว้แล้ว ให้แก้สาเหตุจาก Job ก่อนขอทำรายการใหม่")}</p> : null}
                        </VStack> : null}
                        {renewal.ready && plan && (!job || job.retryable) ? <Button type="button" disabled={stagingRenewalMutation.isPending || stagingActionRunning || Date.parse(plan.authorizationExpiresAt) <= Date.now()}
                          onClick={() => requestStagingConfirmation({
                            title: text("Authorize and renew the Staging database lease", "อนุมัติและต่ออายุ lease ฐานข้อมูล Staging"),
                            description: text(
                              `${job?.retryable ? (job.retryReason === "authority_rejected_before_provider"
                                ? `The previous Job ${job.jobId} failed before any provider/database write and is preserved. `
                                : job.retryReason === "executor_binding_rejected_before_provider"
                                  ? `The previous Job ${job.jobId} failed during read-only executor proof verification before any provider/database write and is preserved. `
                                  : `The previous Job ${job.jobId} expired before claim and is preserved. `) : ""}One Staging-only Job will ${plan.refreshServiceTokenExpiry ? `refresh the expiry of the exact existing Cloudflare Access service token ${plan.resources.serviceTokenId} (Cloudflare permission: Access: Service Tokens Write; the token ID, client ID, secret and policy stay unchanged), then extend the existing read-only database role lease` : `extend the existing read-only database role lease; the current service-token expiry already covers it`} until ${plan.leaseExpiresAt}. It will verify the existing Cloudflare resource IDs, update only the role VALID UNTIL value, and save a new immutable Staging configuration after success. It will not create Cloudflare resources, change DNS/routes, or affect Production traffic.`,
                              `${job?.retryable ? (job.retryReason === "authority_rejected_before_provider"
                                ? `Job เดิม ${job.jobId} ล้มเหลวก่อนเขียน provider/ฐานข้อมูลและยังเก็บประวัติไว้ `
                                : job.retryReason === "executor_binding_rejected_before_provider"
                                  ? `Job เดิม ${job.jobId} ล้มตอนตรวจลายเซ็น executor แบบอ่านอย่างเดียวก่อนเขียน provider/ฐานข้อมูลและยังเก็บประวัติไว้ `
                                  : `Job เดิม ${job.jobId} หมดเวลาก่อน worker รับงานและยังเก็บประวัติไว้ `) : ""}จะสร้าง Job สำหรับ Staging หนึ่งรายการ${plan.refreshServiceTokenExpiry ? ` เพื่อต่ออายุวันหมดอายุของ Cloudflare Access service token เดิม ID ${plan.resources.serviceTokenId} (ต้องมีสิทธิ์ Access: Service Tokens Write โดยคง token ID, client ID, secret และ policy เดิม)` : ""} แล้วขยาย lease ของ role ฐานข้อมูลแบบอ่านอย่างเดียวถึง ${plan.leaseExpiresAt} โดยตรวจ resource เดิม เปลี่ยนเฉพาะค่า VALID UNTIL และบันทึก config immutable ชุดใหม่เมื่อสำเร็จ ไม่สร้าง Cloudflare resource ไม่เปลี่ยน DNS/route และไม่กระทบ Production`),
                            confirmLabel: text("Authorize one renewal Job", "อนุมัติ Job ต่ออายุหนึ่งรายการ"),
                            run: () => stagingRenewalMutation.mutateAsync({ tenantId, projectId, environment: "staging",
                              configurationRef: currentStagingConfigRef, planDigest: renewal.planDigest! }),
                          })}>
                          {stagingRenewalMutation.isPending ? text("Submitting the authorized renewal…", "กำลังส่งคำขอต่ออายุ…") : text("Authorize and renew the existing Staging database lease", "อนุมัติและต่ออายุ lease ฐานข้อมูล Staging เดิม")}
                        </Button> : null}
                        {stagingRenewalMutation.error ? <p role="alert">{stagingActionFailureText(stagingRenewalMutation.error.message, text)} · <code>{stagingRenewalMutation.error.message}</code></p> : null}
                        {finalizeStagingRenewal.error ? <p role="alert"><code>{finalizeStagingRenewal.error.message}</code></p> : null}
                        {stagingRenewalJobId && !job ? <p role="status">{text("Submission recorded; reconciling the same canonical Job…", "บันทึกคำขอแล้ว กำลัง reconcile canonical Job เดิม…")}: <code>{stagingRenewalJobId}</code></p> : null}
                      </VStack>;
                    })() : null}
                    </VStack> : null}
                  {stagingOriginConfiguration.data?.status === "REVOKED" ? <p role="alert"><code>STAGING_ORIGIN_CONFIGURATION_REVOKED</code> · {text("Save a new authorized immutable configuration before activation.", "บันทึก immutable configuration ชุดใหม่ที่ได้รับอนุญาตก่อน activate")}</p> : null}
                  {stagingOriginConfiguration.data && !stagingOriginConfiguration.data.descriptor?.nativeResources?.privateDatabase ? <p role="alert"><code>STAGING_PRIVATE_DATABASE_BINDING_REQUIRED</code> · {text("The stored configuration has no verified private database receipt. Complete the authorized database binding workflow before activation.", "config ไม่มี receipt ของ private database ที่ตรวจสอบแล้ว ให้ทำขั้นตอนผูก database ที่ได้รับอนุญาตก่อน activate")}</p> : null}
                  {secretsMissing ? <VStack gap={2}>
                    <p>{text(
                      "You do not need to find or copy any tokens. The server generates two separate, secure internal secrets for Staging and stores them encrypted when you click the button below.",
                      "ไม่ต้องค้นหาหรือคัดลอก token ระบบจะสร้าง secret ภายในสองค่าที่ปลอดภัยและแยกกันสำหรับ Staging พร้อมเก็บแบบเข้ารหัสเมื่อกดปุ่มด้านล่าง",
                    )}</p>
                    <details>
                      <summary>{text("Advanced: use existing internal secrets", "ขั้นสูง: ใช้ secret ภายในที่มีอยู่แล้ว")}</summary>
                      <VStack gap={2}>
                        <p id="staging-secrets-help">{text(
                          "Optional: enter two different secrets of at least 32 characters, without spaces. These secure internal runtime requests and job-control requests; they are separate from Cloudflare API tokens and R2 access keys. Leave both fields empty for automatic setup.",
                          "กรอกเฉพาะเมื่อต้องใช้ secret เดิม: ต้องเป็นคนละค่า ยาวอย่างน้อย 32 ตัวอักษรและไม่มีช่องว่าง ใช้ยืนยันคำขอภายในของ runtime และระบบควบคุมงาน แยกจาก Cloudflare API token และ R2 access key หากต้องการให้ระบบสร้างให้ ให้เว้นว่างทั้งสองช่อง",
                        )}</p>
                        <Label htmlFor="staging-workflow-runtime-token">{text("Staging workflow runtime token", "Runtime secret สำหรับ Staging")}</Label>
                        <Input id="staging-workflow-runtime-token" type="password" autoComplete="new-password" maxLength={4096} aria-describedby="staging-secrets-help" value={workflowRuntimeToken} onChange={event => setWorkflowRuntimeToken(event.target.value)} />
                        <Label htmlFor="staging-control-plane-token">{text("Staging control-plane token", "Control-plane secret สำหรับ Staging")}</Label>
                        <Input id="staging-control-plane-token" type="password" autoComplete="new-password" maxLength={4096} aria-describedby="staging-secrets-help" value={controlPlaneToken} onChange={event => setControlPlaneToken(event.target.value)} />
                        {suppliedRuntimeSecrets && !suppliedRuntimeSecretsValid ? <p role="alert">{text(
                          "Enter two different secrets of at least 32 characters without spaces, or clear both fields to use automatic setup.",
                          "กรอก secret ให้ครบสองค่า ต้องเป็นคนละค่า ยาวอย่างน้อย 32 ตัวอักษรและไม่มีช่องว่าง หรือล้างทั้งสองช่องเพื่อให้ระบบสร้างให้อัตโนมัติ",
                        )}</p> : null}
                        {suppliedRuntimeSecrets ? <Button type="button" variant="outline" disabled={stagingActionRunning} onClick={() => requestStagingConfirmation({
                          title: text("Clear the two locally entered Staging secrets", "ล้าง secret Staging ที่กรอกไว้สองค่า"),
                          description: text("This only clears the unsaved password fields in this page. It does not change saved secrets or Cloudflare resources.", "ล้างเฉพาะช่องรหัสผ่านที่ยังไม่ได้บันทึกในหน้านี้ ไม่เปลี่ยน secret ที่บันทึกแล้วหรือ Cloudflare resource"),
                          confirmLabel: text("Clear these fields", "ยืนยันล้างช่องกรอก"),
                          run: async () => { setWorkflowRuntimeToken(""); setControlPlaneToken(""); },
                        })}>
                          {text("Use automatic setup instead", "ให้ระบบตั้งค่าอัตโนมัติแทน")}
                        </Button> : null}
                      </VStack>
                    </details>
                  </VStack> : <p>{text(
                    "The internal secrets are already saved securely. The server will reuse them without generating replacements.",
                    "มี secret ภายในที่บันทึกไว้อย่างปลอดภัยแล้ว ระบบจะใช้ค่าเดิมโดยไม่สร้างใหม่",
                  )}</p>}
                  {stagingOriginConfiguration.isError ? <p role="alert"><code>{activationBlocker && activationBlocker.startsWith("STAGING_") ? activationBlocker : "STAGING_ORIGIN_CONFIGURATION_UNAVAILABLE"}</code> · {text("Stored configuration or its resource receipts could not be verified. Use the authorized origin-configuration repair path, then refresh this registry.", "ตรวจสอบ config หรือ resource receipt ที่บันทึกไว้ไม่สำเร็จ ให้ใช้ขั้นตอนซ่อม origin-configuration ที่ได้รับอนุญาต แล้วรีเฟรช registry")}</p> : null}
                  <Button type="button" aria-describedby={stagingConfigurationExpired ? "staging-expired-config-help" : undefined}
                    variant={stagingConfigurationExpired ? "outline" : "default"}
                    disabled={!activationRequired || !targetAllowsActivation || !configurationVerified || !/^cf-origin:[a-f0-9]{64}$/.test(configRef) || activateStagingProfile.isPending || stagingActionRunning ||
                    stagingOriginConfiguration.isLoading || !config || stagingOriginConfiguration.isError ||
                    (secretsMissing && suppliedRuntimeSecrets && !suppliedRuntimeSecretsValid)}
                    onClick={() => requestStagingConfirmation({
                      title: text("Prepare Staging control-plane profile", "เตรียม profile ของ Staging control plane"),
                      description: text("Save a new immutable Queue/control-plane Staging configuration and securely reuse or generate its internal secrets. This does not prepare Full Application HTTP ingress, deploy a Worker, change DNS/routes, or affect Production traffic.", "บันทึก Queue/control-plane Staging config แบบ immutable และใช้หรือสร้าง secret ภายในอย่างปลอดภัย ขั้นตอนนี้ไม่ได้เตรียม Full Application HTTP ingress ไม่ deploy Worker ไม่เปลี่ยน DNS/route และไม่กระทบ Production traffic"),
                      confirmLabel: text("Prepare Staging", "ยืนยันเตรียม Staging"),
                      run: () => activateStagingProfile.mutateAsync({ tenantId, projectId, environment: "staging", provider: "cloudflare", configurationRef: configRef,
                        ...(secretsMissing && suppliedRuntimeSecrets ? { workflowRuntimeToken, controlPlaneToken } : {}) }),
                    })}>
                    {activateStagingProfile.isPending ? text("Preparing Staging…", "กำลังเตรียม Staging…") : secretsMissing
                      ? suppliedRuntimeSecrets ? text("Use supplied secrets and prepare Staging control-plane profile", "ใช้ secret ที่ระบุและเตรียม Staging control-plane profile")
                        : text("Generate secrets and prepare Staging control-plane profile", "สร้าง secret และเตรียม Staging control-plane profile อัตโนมัติ")
                      : text("Prepare Staging control-plane profile with saved secrets", "เตรียม Staging control-plane profile ด้วย secret ที่บันทึกไว้")}
                  </Button>
                  <p>{text("This step saves Staging settings only. Deployment and production traffic retain their separate approval steps.", "ขั้นตอนนี้บันทึกการตั้งค่า Staging เท่านั้น การ deploy และเปิด traffic production ยังใช้การอนุมัติแยกตามเดิม")}</p>
                  {!activationRequired && configurationVerified ? <p role="status">{text("The stored configuration is verified. The server preflight has not identified profile activation as the current blocker.", "ตรวจ config ที่บันทึกไว้แล้ว แต่ server preflight ยังไม่ได้ระบุว่าการ activate profile เป็น blocker ปัจจุบัน")}</p> : null}
                  {activateStagingProfile.error ? <p role="alert"><code>{activateStagingProfile.error.message}</code></p> : null}
                </VStack>;
              })() : null}
              {runtime.transport === "all" ? <p>{text("No job transport has been selected yet. The missing list reflects the Worker’s current all-transports profile; Containers are only needed for workloads that require isolated execution.", "ยังไม่ได้เลือก transport สำหรับงาน รายการที่ขาดอ้างอิง profile ที่เปิดตรวจทุก transport ในขณะนี้ และต้องใช้ Containers เฉพาะงานที่ต้องแยก runtime เท่านั้น")}</p> : null}
              <p>{text("This live probe is separate from the deploy preflight below. A successful artifact deployment does not mean app traffic has moved from the Linux origin.", "ผลตรวจ runtime นี้แยกจาก preflight ด้านล่าง การ deploy artifact ผ่านไม่ได้แปลว่า traffic ของแอปย้ายจาก Linux origin แล้ว")}</p>
              <p className="text-xs text-muted-foreground">{text("Checked", "ตรวจเมื่อ")}: {new Date(runtime.checkedAt).toLocaleString()}</p>
            </VStack>;
          })() : null}
          <Divider />
          <h3>{text("2. Authorize and deploy to Staging", "2. อนุมัติและ deploy ไป Staging")}</h3>
          {stagingDeployPreflight.isLoading ? <p role="status">{text("Checking published artifact, saved configuration, and rollback state…", "กำลังตรวจ artifact, config ที่บันทึกไว้ และสถานะ rollback…")}</p> : null}
          {stagingDeployPreflight.isError ? <p role="alert">{text("Staging deploy readiness could not be verified.", "ตรวจความพร้อม deploy staging ไม่สำเร็จ")}</p> : null}
          {stagingDeployPreflight.data ? <>
            {stagingDeployPreflight.data.ready && stagingDeployPreflight.data.artifact && stagingDeployPreflight.data.baseline ? <>
              <p>{text("Candidate", "รุ่นที่จะ deploy")}: <code>{stagingDeployPreflight.data.artifact.sourceSha}</code> · <code>{stagingDeployPreflight.data.artifact.artifactRef}</code></p>
              <p>{text("Verified rollback baseline", "รุ่น rollback ที่ตรวจสอบแล้ว")}: <code>{stagingDeployPreflight.data.baseline.deploymentId}</code> · <code>{stagingDeployPreflight.data.baseline.sourceSha}</code></p>
              <p>{text(
                "One owner action opens a four-hour campaign for up to four staging jobs, bound to this exact candidate, configuration, target, executor, and verified rollback release. Every job receives a fresh one-job grant. A different artifact or configuration requires new owner authorization. This cannot change production DNS or routes.",
                "การอนุมัติของ owner หนึ่งครั้งเปิด campaign 4 ชั่วโมง สูงสุด 4 staging jobs โดยผูกกับ candidate, configuration, target, executor และ rollback release ที่ตรวจแล้วชุดนี้เท่านั้น แต่ละ job ได้ grant ใหม่ที่ใช้ได้งานเดียว หาก artifact หรือ configuration เปลี่ยนต้องอนุมัติ scope ใหม่ และคำสั่งนี้เปลี่ยน DNS หรือ route ของ production ไม่ได้",
              )}</p>
              <Button type="button" disabled={stagingDeployMutation.isPending || stagingActionRunning} onClick={() => requestStagingConfirmation({
                title: text("Authorize Staging deployment campaign", "อนุมัติ campaign deploy ไป Staging"),
                description: text(`Deploy the exact reviewed candidate ${stagingDeployPreflight.data.artifact!.sourceSha} to the Staging Worker only. The current rollback baseline is ${stagingDeployPreflight.data.baseline.deploymentId}. Production DNS/routes and traffic will not change.`, `deploy candidate ${stagingDeployPreflight.data.artifact!.sourceSha} ที่ตรวจแล้วไปยัง Staging Worker เท่านั้น โดยมี rollback baseline ${stagingDeployPreflight.data.baseline.deploymentId} ไม่เปลี่ยน DNS/route หรือ traffic ของ Production`),
                confirmLabel: text("Authorize and queue Staging deploy", "อนุมัติและส่งงาน deploy Staging"),
                run: () => stagingDeployMutation.mutateAsync({ tenantId, projectId, environment: "staging" }),
              })}>
                {stagingDeployMutation.isPending ? text("Authorizing and queueing…", "กำลังตรวจสิทธิ์และส่งงาน…") : text("Authorize and deploy to staging", "อนุมัติและ deploy ไป staging")}
              </Button>
            </> : stagingDeployPreflight.data.reason === "STAGING_BOOTSTRAP_REQUIRED" && stagingDeployPreflight.data.artifact ? <>
              <p>{text("This is the first Staging deployment, so Cloudflare has no verified Staging deployment to use as a rollback baseline yet.", "นี่คือการ deploy Staging ครั้งแรก จึงยังไม่มี deployment ที่ตรวจสอบแล้วสำหรับใช้ rollback")}</p>
              <p>{text("The one-time bootstrap below is limited to this published artifact, saved origin configuration, Staging Worker, Cloudflare account, and registered executor. It allows one job, creates no production DNS or route changes, and fails closed if the Worker is already owned by a different deployment.", "bootstrap ครั้งเดียวนี้จำกัดเฉพาะ artifact, origin config ที่บันทึกไว้, Staging Worker, บัญชี Cloudflare และ executor ที่ลงทะเบียน อนุญาตเพียงหนึ่ง job ไม่เปลี่ยน DNS หรือ route ของ production และจะหยุดทันทีหาก Worker มี deployment ที่ไม่ตรงกับงานนี้")}</p>
              <p>{text("Candidate", "รุ่นที่จะ deploy")}: <code>{stagingDeployPreflight.data.artifact.sourceSha}</code> · <code>{stagingDeployPreflight.data.artifact.artifactRef}</code></p>
              <Button type="button" disabled={stagingDeployMutation.isPending || stagingActionRunning} onClick={() => requestStagingConfirmation({
                title: text("Authorize first Staging deployment", "อนุมัติ deploy Staging ครั้งแรก"),
                description: text(`Deploy the exact reviewed candidate ${stagingDeployPreflight.data.artifact!.sourceSha} to the Staging Worker only. This is a one-time bootstrap with no Production DNS/route or traffic changes.`, `deploy candidate ${stagingDeployPreflight.data.artifact!.sourceSha} ที่ตรวจแล้วไปยัง Staging Worker เท่านั้น เป็น bootstrap ครั้งเดียว ไม่เปลี่ยน DNS/route หรือ traffic ของ Production`),
                confirmLabel: text("Authorize first Staging deploy", "อนุมัติ deploy Staging ครั้งแรก"),
                run: () => stagingDeployMutation.mutateAsync({ tenantId, projectId, environment: "staging" }),
              })}>
                {stagingDeployMutation.isPending ? text("Authorizing and queueing…", "กำลังตรวจสิทธิ์และส่งงาน…") : text("Authorize one-time first Staging deployment", "อนุมัติ deploy Staging ครั้งแรก (ครั้งเดียว)")}
              </Button>
            </> : stagingDeployPreflight.data.reason === "STAGING_ACTIVATION_PROFILE_REQUIRED" ? <>
              <p role="status">{text("Complete the Staging setup above first. The deployment button becomes available after the settings are saved and verified.", "กดปุ่มเตรียม Staging ด้านบนก่อน เมื่อบันทึกและตรวจสอบการตั้งค่าผ่านแล้ว ปุ่มอนุมัติ deploy จะแสดงที่นี่")}</p>
              <details><summary>{text("Technical details", "รายละเอียดทางเทคนิค")}</summary><code>{stagingDeployPreflight.data.reason}</code></details>
            </> : <p role="status">{stagingDeployPreflight.data.reason ?? text("Staging deploy is not ready.", "staging ยังไม่พร้อม deploy")}</p>}
          </> : null}
          {stagingDeployMutation.data ? <p role="status">{text("Staging deployment queued", "ส่งงาน deploy staging แล้ว")}: <code>{stagingDeployMutation.data.jobId}</code></p> : null}
          {stagingDeployMutation.error ? <p role="alert">{stagingDeployMutation.error.message}</p> : null}
        </VStack>
      ) : null}

      {validScope && environment !== "production" ? (
        <details>
          <summary>{text("Record an explicitly approved Cloudflare target", "บันทึก Cloudflare target ที่ได้รับอนุมัติแล้ว")}</summary>
          <VStack as="form" gap={2} onSubmit={event => {
            event.preventDefault();
            createMutation.mutate({
              ...scope,
              provider: "cloudflare",
              deploymentTargetId: fields.deploymentTargetId.trim(),
              accountRef: fields.accountRef.trim() || null,
              workerRef: fields.workerRef.trim() || null,
              containerApplicationRef: fields.containerApplicationRef.trim() || null,
              provenance: fields.provenance.trim(),
            });
          }}>
            <p>{text("This form creates an enabled registry record. It does not provision a Cloudflare resource or verify runtime compatibility.", "ฟอร์มนี้สร้าง registry record ที่เปิดใช้งาน แต่ไม่ได้ provision Cloudflare resource หรือตรวจ compatibility ของ runtime")}</p>
            <Label htmlFor="new-target-id">{text("Deployment target identity", "ตัวตนของ deployment target")}</Label>
            <Input id="new-target-id" value={fields.deploymentTargetId} onChange={setNewField("deploymentTargetId")} required maxLength={160} />
            <HStack gap={2} wrap="wrap">
              <VStack gap={1}><Label htmlFor="new-target-account">{text("Cloudflare account ID (this target only)", "Cloudflare account ID (เฉพาะ target นี้)")}</Label><Input id="new-target-account" value={fields.accountRef} onChange={setNewField("accountRef")} maxLength={255} /></VStack>
              <VStack gap={1}><Label htmlFor="new-target-worker">{text("Worker reference", "อ้างอิง Worker")}</Label><Input id="new-target-worker" value={fields.workerRef} onChange={setNewField("workerRef")} maxLength={255} /></VStack>
              <VStack gap={1}><Label htmlFor="new-target-container">{text("Container application reference", "อ้างอิงแอป Container")}</Label><Input id="new-target-container" value={fields.containerApplicationRef} onChange={setNewField("containerApplicationRef")} maxLength={255} /></VStack>
            </HStack>
            <Label htmlFor="new-target-provenance">{text("Approval or change provenance", "หลักฐานการอนุมัติหรือ change")}</Label>
            <Input id="new-target-provenance" value={fields.provenance} onChange={setNewField("provenance")} required maxLength={500} />
            <Button type="submit" disabled={!canCreate || createMutation.isPending || !fields.deploymentTargetId.trim() || !fields.provenance.trim()}>
              {createMutation.isPending ? text("Recording…", "กำลังบันทึก…") : text("Record approved target", "บันทึก target ที่อนุมัติแล้ว")}
            </Button>
            {enabledCloudflareTargets.length > 0 ? <p role="status">{text("An enabled target already exists. Edit it instead of creating another active target.", "มี target ที่เปิดใช้งานอยู่แล้ว ให้แก้ไขรายการเดิมแทนการสร้าง active target ซ้ำ")}</p> : null}
          </VStack>
        </details>
      ) : null}

      {validScope && <Button variant="outline" onClick={() => void refreshTargets()} disabled={targetsQuery.isFetching}>{text("Refresh registry", "รีเฟรช registry")}</Button>}
      {createMutation.error || updateMutation.error || disableMutation.error ? <p role="alert">{text("The registry rejected the action or exact-admin authority is missing. No target state was assumed.", "registry ปฏิเสธคำสั่งหรือไม่มี exact-admin authority ระบบจะไม่สมมติสถานะ target")}</p> : null}
      <Button variant="link" onClick={() => setLocation("/admin/settings?tab=infrastructure")}>{text("Open the existing Cloudflare credential center", "เปิดศูนย์ credential Cloudflare เดิม")}</Button>
      <Dialog open={Boolean(stagingConfirmation)} onOpenChange={open => {
        if (!open && !stagingActionRunning) setStagingConfirmation(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{stagingConfirmation?.title ?? text("Confirm Staging action", "ยืนยันการทำงานของ Staging")}</DialogTitle>
            <DialogDescription>{stagingConfirmation?.description}</DialogDescription>
          </DialogHeader>
          {stagingActionRunning ? <p role="status" aria-live="polite">{text("Working… please wait. Do not click again.", "กำลังทำงาน… กรุณารอและอย่ากดซ้ำ")}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={stagingActionRunning} onClick={() => setStagingConfirmation(null)}>
              {text("Cancel", "ยกเลิก")}
            </Button>
            <Button type="button" disabled={stagingActionRunning || !stagingConfirmation} onClick={() => void confirmStagingAction()}>
              {stagingActionRunning ? text("Working…", "กำลังทำงาน…") : stagingConfirmation?.confirmLabel ?? text("Confirm", "ยืนยัน")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </VStack>
  );
}
