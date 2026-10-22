import { useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
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

const PROJECT_WIKI_APP_ID = "app_project_wiki_pages";
const ENVIRONMENTS = ["preview", "staging", "production"] as const;

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
};

type TargetFields = {
  deploymentTargetId: string;
  accountRef: string;
  workerRef: string;
  containerApplicationRef: string;
  provenance: string;
};

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

type ScopeOption = { value: string; label: string };

function SearchableScopeSelect({
  label,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  options,
  value,
  disabled = false,
  onValueChange,
}: {
  label: string;
  placeholder: string;
  searchPlaceholder: string;
  emptyMessage: string;
  options: ScopeOption[];
  value: string;
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
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map(option => (
                <CommandItem
                  key={option.value}
                  value={`${option.label} ${option.value}`}
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
    onSuccess: async () => { await utils.infrastructure.getDeploymentCredentialState.invalidate(identity); },
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
      <details>
        <summary>{text("Configure target account credential", "ตั้งค่า credential ของบัญชีสำหรับ target นี้")}</summary>
        <VStack as="form" gap={2} onSubmit={event => {
          event.preventDefault();
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
  const [fields, setFields] = useState<TargetFields>(EMPTY_FIELDS);
  const tenantsQuery = trpc.systemSettings.listTenants.useQuery();
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
  const targets = validScope ? (targetsQuery.data ?? []) as DeploymentTarget[] : [];
  const cloudflareTargets = targets.filter(target => target.provider === "cloudflare");
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
  const text = useText();
  const setNewField = (key: keyof TargetFields) => (event: ChangeEvent<HTMLInputElement>) =>
    setFields(current => ({ ...current, [key]: event.target.value }));

  return (
    <VStack as="section" gap={4}>
      <VStack gap={1}>
        <h2>{text("Deployment targets", "Deployment targets")}</h2>
        <p>{text(
          "Manage Cloudflare target metadata for preview, staging, and production. This page does not deploy an app, enable traffic, change DNS/routes, or run migrations.",
          "จัดการ metadata ของ Cloudflare target สำหรับ preview, staging และ production หน้านี้ไม่ได้ deploy แอป เปิด traffic เปลี่ยน DNS/routes หรือรัน migration",
        )}</p>
        <p>{text("Project ID and App ID are separate identities. The registry stores project/environment scope, not an App ID.", "Project ID และ App ID เป็นคนละ identity โดย registry เก็บ scope ของ project/environment และไม่ได้เก็บ App ID")}
          {" "}{text("Project Wiki package App ID:", "Project Wiki package App ID:")} <code>{PROJECT_WIKI_APP_ID}</code>
          {" "}{text("Validate the app binding separately before deployment.", "ต้องตรวจ app binding แยกก่อน deploy")}
        </p>
        <p>{text("This registry authorizes Cloudflare only. Other providers are shown for visibility and cannot be changed here.", "registry นี้ให้สิทธิ์เฉพาะ Cloudflare ผู้ให้บริการอื่นจะแสดงเพื่อให้อ้างอิง แต่แก้ไขจากหน้านี้ไม่ได้")}</p>
      </VStack>

      <HStack gap={3} wrap="wrap">
        <VStack gap={1}>
          <Label htmlFor="deployment-tenant">{text("Authenticated tenant", "Tenant ที่ยืนยันตัวตนแล้ว")}</Label>
          <SearchableScopeSelect
            label={text("Authenticated tenant", "Tenant ที่ยืนยันตัวตนแล้ว")}
            placeholder={text("Select tenant", "เลือก tenant")}
            searchPlaceholder={text("Search tenant name or ID…", "ค้นหาชื่อหรือ ID ของ tenant…")}
            emptyMessage={text("No tenant matches this search.", "ไม่พบ tenant ที่ตรงกับคำค้น")}
            options={(tenantsQuery.data ?? []).map(tenant => ({ value: String(tenant.id), label: `${tenant.name} · ${String(tenant.id)}` }))}
            value={tenantId}
            onValueChange={value => { setTenantId(value); setProjectId(""); }}
          />
          {tenantId && !validTenantId ? <p role="status">{text("Select an existing tenant to configure deployment targets.", "เลือก tenant ที่มีอยู่ในระบบเพื่อตั้งค่า deployment target")}</p> : null}
        </VStack>
        <VStack gap={1}>
          <Label htmlFor="deployment-project">{text("Canonical project", "Canonical project")}</Label>
          <SearchableScopeSelect
            label={text("Canonical project", "Canonical project")}
            placeholder={text("Select project", "เลือก project")}
            searchPlaceholder={text("Search project name or ID…", "ค้นหาชื่อหรือ ID ของ project…")}
            emptyMessage={text("No active project matches this search.", "ไม่พบ project ที่ active และตรงกับคำค้น")}
            options={(projectsQuery.data ?? []).map(project => ({ value: project.projectId, label: `${project.title} · ${project.projectType} · ${project.projectId}` }))}
            value={projectId}
            disabled={!validTenantId || projectsQuery.isLoading}
            onValueChange={setProjectId}
          />
          {validTenantId && !projectsQuery.isLoading && projectsQuery.data?.length === 0 ? <p role="status">{text("No active canonical projects were found for this tenant.", "ไม่พบ canonical project ที่ active ใน tenant นี้")}</p> : null}
        </VStack>
        <VStack gap={1}>
          <Label htmlFor="deployment-environment">{text("Environment", "Environment")}</Label>
          <Select value={environment} onValueChange={setEnvironment}>
            <SelectTrigger id="deployment-environment"><SelectValue placeholder={text("Select environment", "เลือก environment")} /></SelectTrigger>
            <SelectContent>{ENVIRONMENTS.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
          </Select>
        </VStack>
      </HStack>

      {validScope && environment === "production" ? <p role="status">{text(
        "Production target metadata only records the exact deployment destination. It does not create a deployment grant or enable a Worker, Container, DNS record, route, or production traffic. Those actions remain behind their separate production approval and rollback controls.",
        "metadata ของ production target ใช้บันทึกปลายทาง deployment ที่แน่นอนเท่านั้น ไม่ได้สร้าง deployment grant หรือเปิด Worker, Container, DNS record, route หรือ production traffic การดำเนินการเหล่านั้นยังต้องผ่าน approval และ rollback control ของ production แยกต่างหาก",
      )}</p> : null}
      {!validScope ? <p role="status">{text("Select a tenant, an active canonical project, and preview, staging, or production to inspect target authority.", "เลือก tenant, canonical project ที่ active และ preview, staging หรือ production เพื่อตรวจ target authority")}</p> : null}
      {validScope && targetsQuery.isError ? <p role="alert">{text("Target registry could not be read. The current authority state is unknown; exact-admin access may be required.", "อ่าน target registry ไม่สำเร็จ สถานะ authority ยังไม่ทราบ และอาจต้องใช้ exact-admin")}</p> : null}
      {validScope && targetsQuery.isLoading ? <p role="status">{text("Reading target registry…", "กำลังอ่าน target registry…")}</p> : null}
      {validScope && !targetsQuery.isLoading && !targetsQuery.isError && isConflict ? <p role="alert">TARGET_AUTHORITY_CONFLICT: {text("multiple enabled Cloudflare targets exist for this scope. Resolve the conflict before deployment.", "พบ Cloudflare target ที่เปิดใช้งานหลายรายการใน scope นี้ ต้องแก้ conflict ก่อน deploy")}</p> : null}
      {validScope && !targetsQuery.isLoading && !targetsQuery.isError && cloudflareTargets.length === 0 ? <p role="status">NOT_CONFIGURED · WAITING_TARGET_AUTHORITY: {text("No Cloudflare target is registered. An owner must explicitly approve and record a staging or preview target.", "ยังไม่มี Cloudflare target ที่ลงทะเบียน เจ้าของระบบต้องอนุมัติและบันทึก target สำหรับ staging หรือ preview อย่างชัดเจน")}</p> : null}
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

      {validScope ? (
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
