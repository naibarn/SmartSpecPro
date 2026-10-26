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
import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Selector } from "@astryxdesign/core/Selector";

const PROJECT_WIKI_APP_ID = "app_project_wiki_pages";
const ENVIRONMENTS = ["preview", "staging", "production"] as const;
const CLOUDFLARE_PRODUCTION_WORKER_ID = "smartspec-cloudflare-runtime";

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

function productionDatabaseAdmissionStorageKey(scopeKey: string) {
  return `smartspec:cloudflare-production-database:${scopeKey}`;
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
  const [productionDatabaseSubmissions, setProductionDatabaseSubmissions] = useState<Record<string, string>>({});
  const [productionDatabaseAdmissions, setProductionDatabaseAdmissions] = useState<Record<string, ProductionDatabaseAdmission>>({});
  const [productionTunnelSelections, setProductionTunnelSelections] = useState<Record<string, string>>({});
  const [fields, setFields] = useState<TargetFields>(EMPTY_FIELDS);
  const [showNonOperationalTenants, setShowNonOperationalTenants] = useState(false);
  const [savedStagingScope, setSavedStagingScope] = useState<{ tenantId: string; projectId: string } | null>(null);
  const tenantsQuery = trpc.systemSettings.listTenants.useQuery();
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
  const productionDatabaseGuardRecovery = productionDatabaseJobData?.status === "failed" &&
    productionDatabaseJobData.errorCode === "CLOUDFLARE_PRODUCTION_DATABASE_CREDENTIAL_UNAVAILABLE" &&
    productionDatabaseJobData.attempt === 2 && productionDatabaseJobData.maxAttempts === 2;

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
  const latestProductionIngressJob = trpc.infrastructure.getLatestCloudflareProductionIngressJob.useQuery(
    {tenantId,projectId,environment:"production"}, {enabled:validScope&&environment==="production",refetchInterval:query=>
      query.state.data&&! ["succeeded","failed","expired","cancelled"].includes(query.state.data.status)?2000:10000});
  const previousIngressJob = latestProductionIngressJob.data;
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
  const setNewField = (key: keyof TargetFields) => (event: ChangeEvent<HTMLInputElement>) =>
    setFields(current => ({ ...current, [key]: event.target.value }));

  return (
    <VStack as="section" gap={4}>
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
            onValueChange={value => { setTenantId(value); setProjectId(""); setWorkflowRuntimeToken(""); setControlPlaneToken(""); }}
          />
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
          <strong>{text("What Cloudflare has actually provisioned", "ทรัพยากรที่มีอยู่จริงบน Cloudflare")}</strong>
          <VStack as="section" gap={2} role="group" aria-label={text("Cloudflare ingress migration", "ย้ายทางเข้าเว็บไป Cloudflare")}>
            <h3>{text("Cloudflare ingress: web and API", "ทางเข้าเว็บและ API ผ่าน Cloudflare")}</h3>
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
            </> : productionIngressPreflight.data ? <VStack gap={1} role="status"><p>{ingressBlockerText(productionIngressPreflight.data.reason)}</p><details><summary>{text("Technical reason", "เหตุผลทางเทคนิค")}</summary><code>{productionIngressPreflight.data.reason}</code></details></VStack> : null}
            {productionIngressRollback.data?.ready&&latestProductionIngressJob.data ? <Button type="button" disabled={productionIngressMutation.isPending} onClick={()=>{
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
              return <VStack gap={1} role="alert">
              <p>{text(
                `Production inventory is incomplete (${inventory.status}); an empty result does not prove that a resource is absent.`,
                `inventory ของ Production ไม่ครบ (${inventory.status}) ผลว่างจึงยังยืนยันไม่ได้ว่าไม่มี resource`,
              )}</p>
              <p>{text("Read-only Cloudflare API results (HTTP 200 means readable only):", "ผล API ของ Cloudflare แบบอ่านอย่างเดียว (HTTP 200 ยืนยันเฉพาะสิทธิ์อ่าน):")}</p>
              <VStack as="ul" gap={1}>
                {(Object.entries(inventory.accessChecks) as Array<[string, { httpStatus: number | null; complete: boolean }]>).map(([key, check]) => <li key={key}>
                  <strong>{text(checkLabels[key]?.en ?? key, checkLabels[key]?.th ?? key)}</strong>: {check.httpStatus === null ? text("not checked", "ยังไม่ได้ตรวจ") : `HTTP ${check.httpStatus}`}
                  {check.complete ? text(" · readable", " · อ่านได้") : text(" · incomplete or denied", " · ตรวจไม่ครบหรือถูกปฏิเสธ")}
                  {!check.complete && checkLabels[key] ? <> · {key === "mtlsCertificates"
                    ? text("optional; needed only for Staging trust migration", "เป็นทางเลือก ใช้เฉพาะเมื่อย้าย trust ของ Staging")
                    : text("required read scope", "สิทธิ์อ่านที่ต้องมี")}: <code>{checkLabels[key].permission}</code></> : null}
                </li>)}
              </VStack>
              {inventory.productionDatabaseProvisioning ? <>
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
              productionDatabaseGuardRecovery ||
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
                  productionDatabaseJobData.operatorReviewReason === "adapter_contract_unsupported") || productionDatabaseGuardRecovery) ? <VStack gap={1} role="group" aria-label={text("Resume the same Production database job", "กู้งานเตรียมฐานข้อมูล Production เดิม") }>
                    <p role="alert">{productionDatabaseGuardRecovery ? text(
                      "The credential guard incorrectly rejected a successful authorization check. The two-attempt budget is exhausted. This action explicitly authorizes one additional attempt on the same job and resource plan after the fix. It does not authorize production traffic.",
                      "ระบบตรวจ credential ตีความผลตรวจสิทธิ์สำเร็จผิดพลาด และใช้สิทธิ์เดิมครบ 2 ครั้งแล้ว ปุ่มนี้อนุมัติเพิ่มเพียง 1 ครั้งให้งานและแผนเดิมหลังแก้ไข ไม่อนุมัติการเปลี่ยน traffic",
                    ) : text(
                      "This job expired before a worker claimed it because its adapter contract was not admitted. No Cloudflare resource was created. The original grant has expired, so an authenticated Admin must renew authorization; the same Job ID and resource plan will be reused.",
                      "งานหมดอายุก่อน worker รับไปทำ เพราะระบบไม่ยอมรับ contract ของ adapter จึงยังไม่ได้สร้าง Cloudflare resource และ grant เดิมหมดอายุแล้ว Admin ที่ยืนยันตัวตนต้องต่ออายุสิทธิ์ โดยระบบจะใช้ Job ID และแผน resource เดิม",
                    )}</p>
                    <Button type="button" disabled={resumeProductionDatabaseMutation.isPending ||
                      !databaseTunnelInventoryComplete || !productionDatabaseJobData?.tunnelId ||
                      selectedDatabaseTunnelId !== productionDatabaseJobData?.tunnelId}
                      onClick={() => resumeProductionDatabaseMutation.mutate({ tenantId, projectId,
                        jobId: productionDatabaseJobData!.jobId, tunnelId: productionDatabaseJobData!.tunnelId!, environment: "production",
                        ...(productionDatabaseGuardRecovery ? { authorizeAdditionalAttempt: true as const } : {}) })}>
                      {resumeProductionDatabaseMutation.isPending
                        ? text("Renewing and resuming the same job…", "กำลังต่ออายุสิทธิ์และกู้งานเดิม…")
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
                  {Object.entries(inventory.productionDatabaseProvisioning.checks).map(([key, check]) => {
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
          {savedStagingScope?.tenantId === tenantId && savedStagingScope.projectId === projectId ? <p role="status">{text(
            "Staging settings saved. Continue with “Authorize and deploy to staging” below. Worker readiness changes after deployment.",
            "บันทึกการตั้งค่า Staging สำเร็จแล้ว ให้ดำเนินการ “อนุมัติและ deploy ไป staging” ด้านล่าง สถานะ Worker จะเปลี่ยนหลัง deploy",
          )}</p> : null}
          <HStack gap={2} wrap="wrap">
            <h3>{text("Live Cloudflare Worker readiness", "ความพร้อมของ Cloudflare Worker ที่กำลังทำงาน")}</h3>
            <Button type="button" variant="outline" size="sm" onClick={() => void stagingRuntimeReadiness.refetch()} disabled={stagingRuntimeReadiness.isFetching}>
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
            return <VStack gap={1} role={ready ? "status" : "group"} aria-label={text("Live Cloudflare Worker readiness", "ความพร้อมของ Cloudflare Worker ที่กำลังทำงาน")}>
              <HStack gap={2} wrap="wrap">
                <Badge variant={ready ? "default" : "destructive"}>{runtime.status}</Badge>
                {runtime.activation ? <Badge variant="outline">activation: {runtime.activation}</Badge> : null}
                {runtime.transport ? <Badge variant="outline">transport: {runtime.transport}</Badge> : null}
                {runtime.jobHandlerConfigured !== undefined ? <Badge variant="outline">{text("Job handler", "ตัวจัดการงาน")}: {runtime.jobHandlerConfigured ? text("configured", "ตั้งค่าแล้ว") : text("missing", "ยังไม่ตั้งค่า")}</Badge> : null}
                {runtime.controlPlaneConfigured !== undefined ? <Badge variant="outline">{text("Control plane", "control plane")}: {runtime.controlPlaneConfigured ? text("configured", "ตั้งค่าแล้ว") : text("missing", "ยังไม่ตั้งค่า")}</Badge> : null}
              </HStack>
              {runtime.missing.length > 0 ? <p>{text("Missing runtime bindings", "binding ที่ runtime ยังขาด")}: <code>{runtime.missing.join(", ")}</code></p> : null}
              {runtime.reason ? <p><code>{runtime.reason}</code></p> : null}
              {(activationRecoveryStatus ||
                stagingDeployPreflight.data?.reason === "STAGING_ACTIVATION_PROFILE_REQUIRED") ? (() => {
                const configRef = currentStagingConfigRef;
                const config = stagingOriginConfiguration.data;
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
                  Boolean(config.descriptor.nativeResources?.privateDatabase);
                const activationBlocker = stagingDeployPreflight.data?.reason;
                return <VStack gap={2}>
                  <h4>{text("1. Prepare Staging", "1. เตรียม Staging")}</h4>
                  <p>{text(
                    "Prepare the internal connection for this Staging target. After saving, continue with “Authorize and deploy to staging” below. The live Worker readiness updates after deployment.",
                    "เตรียมการเชื่อมต่อภายในสำหรับ Staging นี้ เมื่อบันทึกสำเร็จ ให้กด “อนุมัติและ deploy ไป staging” ด้านล่าง สถานะ Worker ที่กำลังทำงานจะอัปเดตหลัง deploy",
                  )}</p>
                  {activationBlocker && activationBlocker !== "STAGING_ACTIVATION_PROFILE_REQUIRED" ?
                    <p role="status">{text("Configuration or deployment blocker", "สาเหตุที่ config หรือการ deploy ยังติดอยู่")}: <code>{activationBlocker}</code></p> : null}
                  {stagingOriginConfiguration.data?.status === "EXPIRED" ? <p role="alert"><code>STAGING_ORIGIN_CONFIGURATION_EXPIRED</code> · {text("Replace the expired immutable configuration through the authorized origin-configuration workflow.", "ให้บันทึก immutable configuration ชุดใหม่ผ่านขั้นตอน origin-configuration ที่ได้รับอนุญาต")}</p> : null}
                  {stagingOriginConfiguration.data?.status === "REVOKED" ? <p role="alert"><code>STAGING_ORIGIN_CONFIGURATION_REVOKED</code> · {text("Save a new authorized immutable configuration before activation.", "บันทึก immutable configuration ชุดใหม่ที่ได้รับอนุญาตก่อน activate")}</p> : null}
                  {stagingOriginConfiguration.data && !stagingOriginConfiguration.data.descriptor.nativeResources?.privateDatabase ? <p role="alert"><code>STAGING_PRIVATE_DATABASE_BINDING_REQUIRED</code> · {text("The stored configuration has no verified private database receipt. Complete the authorized database binding workflow before activation.", "config ไม่มี receipt ของ private database ที่ตรวจสอบแล้ว ให้ทำขั้นตอนผูก database ที่ได้รับอนุญาตก่อน activate")}</p> : null}
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
                        {suppliedRuntimeSecrets ? <Button type="button" variant="outline" onClick={() => { setWorkflowRuntimeToken(""); setControlPlaneToken(""); }}>
                          {text("Use automatic setup instead", "ให้ระบบตั้งค่าอัตโนมัติแทน")}
                        </Button> : null}
                      </VStack>
                    </details>
                  </VStack> : <p>{text(
                    "The internal secrets are already saved securely. The server will reuse them without generating replacements.",
                    "มี secret ภายในที่บันทึกไว้อย่างปลอดภัยแล้ว ระบบจะใช้ค่าเดิมโดยไม่สร้างใหม่",
                  )}</p>}
                  {stagingOriginConfiguration.isError ? <p role="alert"><code>{activationBlocker && activationBlocker.startsWith("STAGING_") ? activationBlocker : "STAGING_ORIGIN_CONFIGURATION_UNAVAILABLE"}</code> · {text("Stored configuration or its resource receipts could not be verified. Use the authorized origin-configuration repair path, then refresh this registry.", "ตรวจสอบ config หรือ resource receipt ที่บันทึกไว้ไม่สำเร็จ ให้ใช้ขั้นตอนซ่อม origin-configuration ที่ได้รับอนุญาต แล้วรีเฟรช registry")}</p> : null}
                  <Button type="button" disabled={!activationRequired || !targetAllowsActivation || !configurationVerified || !/^cf-origin:[a-f0-9]{64}$/.test(configRef) || activateStagingProfile.isPending ||
                    stagingOriginConfiguration.isLoading || !config || stagingOriginConfiguration.isError ||
                    (secretsMissing && suppliedRuntimeSecrets && !suppliedRuntimeSecretsValid)}
                    onClick={() => activateStagingProfile.mutate({ tenantId, projectId, environment: "staging", provider: "cloudflare", configurationRef: configRef,
                      ...(secretsMissing && suppliedRuntimeSecrets ? { workflowRuntimeToken, controlPlaneToken } : {}) })}>
                    {activateStagingProfile.isPending ? text("Preparing Staging…", "กำลังเตรียม Staging…") : secretsMissing
                      ? suppliedRuntimeSecrets ? text("Use supplied secrets and prepare Staging", "ใช้ secret ที่ระบุและเตรียม Staging")
                        : text("Generate secrets and prepare Staging", "สร้าง secret และเตรียม Staging อัตโนมัติ")
                      : text("Prepare Staging with saved secrets", "เตรียม Staging ด้วย secret ที่บันทึกไว้")}
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
              <Button type="button" disabled={stagingDeployMutation.isPending} onClick={() => stagingDeployMutation.mutate({ tenantId, projectId, environment: "staging" })}>
                {stagingDeployMutation.isPending ? text("Authorizing and queueing…", "กำลังตรวจสิทธิ์และส่งงาน…") : text("Authorize and deploy to staging", "อนุมัติและ deploy ไป staging")}
              </Button>
            </> : stagingDeployPreflight.data.reason === "STAGING_BOOTSTRAP_REQUIRED" && stagingDeployPreflight.data.artifact ? <>
              <p>{text("This is the first Staging deployment, so Cloudflare has no verified Staging deployment to use as a rollback baseline yet.", "นี่คือการ deploy Staging ครั้งแรก จึงยังไม่มี deployment ที่ตรวจสอบแล้วสำหรับใช้ rollback")}</p>
              <p>{text("The one-time bootstrap below is limited to this published artifact, saved origin configuration, Staging Worker, Cloudflare account, and registered executor. It allows one job, creates no production DNS or route changes, and fails closed if the Worker is already owned by a different deployment.", "bootstrap ครั้งเดียวนี้จำกัดเฉพาะ artifact, origin config ที่บันทึกไว้, Staging Worker, บัญชี Cloudflare และ executor ที่ลงทะเบียน อนุญาตเพียงหนึ่ง job ไม่เปลี่ยน DNS หรือ route ของ production และจะหยุดทันทีหาก Worker มี deployment ที่ไม่ตรงกับงานนี้")}</p>
              <p>{text("Candidate", "รุ่นที่จะ deploy")}: <code>{stagingDeployPreflight.data.artifact.sourceSha}</code> · <code>{stagingDeployPreflight.data.artifact.artifactRef}</code></p>
              <Button type="button" disabled={stagingDeployMutation.isPending} onClick={() => stagingDeployMutation.mutate({ tenantId, projectId, environment: "staging" })}>
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
    </VStack>
  );
}
