import { useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";

const PROJECT_WIKI_APP_ID = "app_project_wiki_pages";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENVIRONMENTS = ["preview", "staging"] as const;

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

function CredentialReadiness({ target }: { target: DeploymentTarget }) {
  const text = useText();
  const { data, isLoading, isError } = trpc.infrastructure.getDeploymentCredentialState.useQuery({
    tenantId: target.tenantId,
    projectId: target.projectId,
    environment: target.environment,
    provider: "cloudflare",
  }, { enabled: target.provider === "cloudflare" });
  const label = isLoading
    ? "Checking"
    : isError
      ? "Unavailable"
      : data?.status ?? "Unavailable";
  return <Badge variant={data?.status === "CONFIGURED" ? "default" : "secondary"}>
    {text("Credential", "Credential")}: {label}
  </Badge>;
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
    <VStack as="form" gap={2} onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); onSave(fields); }}>
      <Label htmlFor={`target-id-${target.id}`}>{text("Deployment target identity", "ตัวตนของ deployment target")}</Label>
      <Input id={`target-id-${target.id}`} value={fields.deploymentTargetId} onChange={set("deploymentTargetId")} required maxLength={160} />
      <HStack gap={2} wrap="wrap">
        <VStack gap={1}><Label htmlFor={`account-${target.id}`}>{text("Cloudflare account reference", "อ้างอิงบัญชี Cloudflare")}</Label><Input id={`account-${target.id}`} value={fields.accountRef} onChange={set("accountRef")} maxLength={255} /></VStack>
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
  const validTenantId = UUID_PATTERN.test(tenantId);
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
          "Manage Cloudflare targets for preview and staging. This page only records target authority; it does not deploy an app or run migrations.",
          "จัดการ Cloudflare target สำหรับ preview และ staging หน้านี้บันทึก authority ของ target เท่านั้น ไม่ได้ deploy แอปหรือรัน migration",
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
          <Select value={tenantId} onValueChange={value => { setTenantId(value); setProjectId(""); }}>
            <SelectTrigger id="deployment-tenant"><SelectValue placeholder={text("Select tenant", "เลือก tenant")} /></SelectTrigger>
            <SelectContent>
              {(tenantsQuery.data ?? []).map(tenant => <SelectItem key={String(tenant.id)} value={String(tenant.id)}>{tenant.name} · {String(tenant.id)}</SelectItem>)}
            </SelectContent>
          </Select>
          {tenantId && !validTenantId ? <p role="status">{text("This tenant ID does not meet the UUID contract required by exact-admin target APIs.", "Tenant ID นี้ไม่เป็นไปตาม UUID contract ที่ exact-admin target API กำหนด")}</p> : null}
        </VStack>
        <VStack gap={1}>
          <Label htmlFor="deployment-project">{text("Canonical project", "Canonical project")}</Label>
          <Select value={projectId} onValueChange={setProjectId} disabled={!validTenantId || projectsQuery.isLoading}>
            <SelectTrigger id="deployment-project"><SelectValue placeholder={text("Select project", "เลือก project")} /></SelectTrigger>
            <SelectContent>
              {(projectsQuery.data ?? []).map(project => <SelectItem key={project.projectId} value={project.projectId}>{project.title} · {project.projectType} · {project.projectId}</SelectItem>)}
            </SelectContent>
          </Select>
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

      {!validScope ? <p role="status">{text("Select a UUID tenant, an active canonical project, and preview or staging to inspect target authority.", "เลือก tenant ที่เป็น UUID, canonical project ที่ active และ preview หรือ staging เพื่อตรวจ target authority")}</p> : null}
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
          <VStack as="form" gap={2} onSubmit={(event: FormEvent<HTMLFormElement>) => {
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
              <VStack gap={1}><Label htmlFor="new-target-account">{text("Cloudflare account reference", "อ้างอิงบัญชี Cloudflare")}</Label><Input id="new-target-account" value={fields.accountRef} onChange={setNewField("accountRef")} maxLength={255} /></VStack>
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
