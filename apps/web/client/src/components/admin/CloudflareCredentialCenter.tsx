import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "../../lib/trpc";
import { DashboardCard } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import StorageSettingsPanel from "./StorageSettingsPanel";
import { toast } from "sonner";
import { CLOUDFLARE_CREDENTIAL_PROFILES, type CloudflareCredentialProfileId } from "../../../../shared/cloudflareCredentialCatalog";
import { Cloud, Loader2, RefreshCw, Save, Trash2 } from "lucide-react";

type ProbeResult = {
  profileId: CloudflareCredentialProfileId;
  checkedAt: string;
  error: string | null;
  checks: Array<{
    id: string;
    label: string;
    scope: string;
    permission: string;
    status: "granted" | "missing_permission" | "invalid_token" | "resource_not_found" | "rate_limited" | "unsupported_or_invalid_request" | "unavailable";
    httpStatus: number | null;
  }>;
};

type PermissionCatalogResult = {
  status: "granted" | "partial" | "missing_permission" | "invalid_token" | "resource_not_found" | "rate_limited" | "unsupported_or_invalid_request" | "unavailable";
  checkedAt: string;
  httpStatus: number | null;
  groups: Array<{ id: string; name: string; category: string; scopes: string[]; description: string; selectable: boolean | null }>;
  totalCount: number;
  complete: boolean;
  stale: boolean;
  lastSuccessAt: string | null;
  sources: Array<{ scope: "account" | "user"; status: PermissionCatalogResult["status"]; httpStatus: number | null; groupCount: number; complete: boolean }>;
};

const statusLabels = {
  granted: { en: "Granted", th: "ผ่าน" },
  partial: { en: "Partial catalog", th: "รายการ permission ยังไม่ครบ" },
  missing_permission: { en: "Permission missing", th: "ขาดสิทธิ์" },
  invalid_token: { en: "Token rejected", th: "Token ถูกปฏิเสธ" },
  resource_not_found: { en: "Resource not found", th: "ไม่พบ resource" },
  unavailable: { en: "Unavailable / API error", th: "API ใช้งานไม่ได้" },
  rate_limited: { en: "Rate limited", th: "ถูกจำกัดอัตราเรียก" },
  unsupported_or_invalid_request: { en: "Unsupported endpoint / invalid request", th: "endpoint ไม่รองรับหรือคำขอไม่ถูกต้อง" },
} as const;

export default function CloudflareCredentialCenter() {
  const { i18n } = useTranslation();
  const isThai = i18n.resolvedLanguage?.startsWith("th") || i18n.language?.startsWith("th");
  const { data, isLoading, refetch } = trpc.infrastructure.getCloudflareCredentialCenter.useQuery();
  const { data: storage = [] } = trpc.storageSettings.list.useQuery();
  const [accountId, setAccountId] = useState("");
  const [forms, setForms] = useState({
    audit: { label: "Infrastructure audit", token: "" },
    deployment: { label: "Deployment / provisioning", token: "" },
  });
  const [legacyVectorizeToken, setLegacyVectorizeToken] = useState("");
  const [probes, setProbes] = useState<Partial<Record<CloudflareCredentialProfileId, ProbeResult>>>({});
  const [permissionCatalog, setPermissionCatalog] = useState<PermissionCatalogResult | null>(null);
  const [permissionSearch, setPermissionSearch] = useState("");

  useEffect(() => setAccountId(data?.accountId ?? ""), [data?.accountId]);

  const saveAccount = trpc.infrastructure.updateCloudflareAccountId.useMutation({
    onSuccess: async () => { toast.success(isThai ? "Account ID และ Vectorize ตั้งค่าตรงกันแล้ว" : "Account ID saved and synced with Vectorize."); await refetch(); },
    onError: (error) => toast.error(error.message),
  });
  const saveCredential = trpc.infrastructure.saveCloudflareCredential.useMutation({
    onSuccess: async (_result, variables) => {
      setForms((current) => ({ ...current, [variables.profileId]: { ...current[variables.profileId], token: "" } }));
      toast.success(isThai ? "บันทึก token แบบเข้ารหัสแล้ว" : "Token saved encrypted.");
      await refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const saveLegacyVectorizeToken = trpc.infrastructure.updateLegacyVectorizeToken.useMutation({
    onSuccess: async () => {
      setLegacyVectorizeToken("");
      toast.success(isThai ? "บันทึก Vectorize token ลงค่าตั้งเดิมแล้ว" : "Vectorize token saved to the existing setting.");
      await refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const removeCredential = trpc.infrastructure.removeCloudflareCredential.useMutation({
    onSuccess: async (_result, variables) => { setProbes((current) => { const next = { ...current }; delete next[variables.profileId]; return next; }); await refetch(); },
    onError: (error) => toast.error(error.message),
  });
  const probeCredential = trpc.infrastructure.probeCloudflareCredential.useMutation({
    onSuccess: (result) => { setProbes((current) => ({ ...current, [result.profileId]: result as ProbeResult })); },
    onError: (error) => toast.error(error.message),
  });
  const probePermissionCatalog = trpc.infrastructure.probeCloudflarePermissionCatalog.useMutation({
    onSuccess: (result) => setPermissionCatalog(result as PermissionCatalogResult),
    onError: (error) => toast.error(error.message),
  });

  const text = (en: string, th: string) => isThai ? th : en;
  const r2Configs = storage.filter((item) => item.providerType === "r2");
  const configuredProfileCount = Number(Boolean(data?.legacyVectorize.configured))
    + Number(Boolean(data?.profiles.audit.configured))
    + Number(Boolean(data?.profiles.deployment.configured));
  const renderProbe = (profileId: CloudflareCredentialProfileId) => {
    const report = probes[profileId];
    if (!report) return null;
    return (
      <VStack as="section" gap={2} padding={3}>
        <HStack gap={2} wrap="wrap">
          <strong>{text("Read-only permission results", "ผลตรวจสิทธิ์แบบอ่านอย่างเดียว")}</strong>
          <span>{new Date(report.checkedAt).toLocaleString()}</span>
        </HStack>
        {report.error ? <p role="status">{report.error === "credential_not_configured" ? text("No token is saved for this profile. Save a token before probing.", "profile นี้ยังไม่มี token ให้บันทึก token ก่อนตรวจ") : text("Cloudflare Account ID is not configured. Set it in this page before probing.", "ยังไม่ได้ตั้ง Cloudflare Account ID ให้ตั้งค่าในหน้านี้ก่อนตรวจ")}</p> : null}
        <ul>
          {report.checks.map((check) => (
            <li key={check.id}>
              <VStack gap={1}>
                <HStack gap={2} wrap="wrap">
                  <strong>{check.label}</strong>
                  <Badge variant={check.status === "granted" ? "default" : "secondary"}>
                    {isThai ? statusLabels[check.status].th : statusLabels[check.status].en}{check.httpStatus ? ` · HTTP ${check.httpStatus}` : ""}
                  </Badge>
                </HStack>
                <span>{text("Token profile", "Token ที่ตรวจ")}: {profileId === "deployment" ? text("Deployment / provisioning", "Deployment / provisioning") : text("Infrastructure audit", "Infrastructure audit")} · {text("scope", "ขอบเขต")}: {check.scope} · {text("required permission", "permission ที่ endpoint ยอมรับ")}: {check.permission}</span>
                {check.status === "missing_permission" ? <p role="status">{text(
                  `In Cloudflare API Tokens, edit the ${profileId === "deployment" ? "Deployment / provisioning" : "Infrastructure audit"} token and grant the required permission shown above at ${check.scope === "Zone" ? "Zone: smartaihub.app" : "Account: Smartaihub"} scope. Where alternatives are listed, grant one accepted permission, not all of them. Save the updated token here, then run Probe read access again. HTTP 403 confirms this request was denied, but Cloudflare does not distinguish token scope, account/resource selection, or product entitlement; verify each before adding broader access.`,
                  `ไปที่ Cloudflare API Tokens แล้วแก้ token ${profileId === "deployment" ? "Deployment / provisioning" : "Infrastructure audit"} เพิ่ม permission ตามที่แสดงด้านบนใน scope ${check.scope === "Zone" ? "Zone: smartaihub.app" : "Account: Smartaihub"} หากแสดงตัวเลือกหลายรายการ ให้เพิ่มเพียงหนึ่ง permission ที่ endpoint ยอมรับ ไม่ต้องเพิ่มทั้งหมด จากนั้นบันทึก token ที่อัปเดตในหน้านี้และกดตรวจสิทธิ์อ่านอีกครั้ง HTTP 403 ยืนยันว่า request ถูกปฏิเสธ แต่ Cloudflare แยกสาเหตุระหว่าง scope ของ token, การเลือก account/resource หรือ entitlement ของบริการไม่ได้ ให้ตรวจทุกจุดก่อนเพิ่มสิทธิ์ให้กว้างขึ้น`
                )}</p> : null}
                {check.status === "invalid_token" ? <p role="status">{text(`Cloudflare rejected this token (HTTP ${check.httpStatus ?? "—"}). Replace the token saved under this profile, then probe again.`, `Cloudflare ปฏิเสธ token นี้ (HTTP ${check.httpStatus ?? "—"}) ให้สร้างหรือเลือก token ใหม่สำหรับ profile นี้ บันทึกแทนค่าเดิม แล้วตรวจอีกครั้ง`)}</p> : null}
                {check.status === "resource_not_found" ? <p role="status">{text("The request was authorized but the expected resource was not found. Confirm the account/zone and create the Cloudflare resource if needed; adding permission may not fix this.", "คำขอผ่านการยืนยันตัวตนแล้วแต่ไม่พบ resource ให้ตรวจ account/zone และสร้าง resource ของ Cloudflare หากยังไม่มี การเพิ่ม permission อาจไม่ช่วย")}</p> : null}
                {check.status === "rate_limited" ? <p role="status">{text("Cloudflare rate-limited this probe. Wait briefly and retry; do not change permissions based on this result.", "Cloudflare จำกัดอัตราการตรวจ ให้รอสักครู่แล้วตรวจใหม่ ไม่ต้องเปลี่ยน permission จากผลนี้")}</p> : null}
                {check.status === "unsupported_or_invalid_request" || check.status === "unavailable" ? <p role="status">{text("This result does not establish a missing permission. Check Cloudflare API availability and the endpoint/request before changing token scopes.", "ผลนี้ยังสรุปไม่ได้ว่าขาด permission ให้ตรวจสถานะ Cloudflare API และ endpoint/request ก่อนเปลี่ยน scope ของ token")}</p> : null}
              </VStack>
            </li>
          ))}
        </ul>
      </VStack>
    );
  };
  const filteredPermissionGroups = permissionCatalog?.groups.filter((group) => {
    const search = permissionSearch.trim().toLowerCase();
    return !search || `${group.name} ${group.category} ${group.description} ${group.scopes.join(" ")}`.toLowerCase().includes(search);
  }) ?? [];

  if (isLoading) return <HStack justify="center" paddingBlock={6}><Loader2 size={20} /></HStack>;

  return (
    <VStack as="section" gap={4}>
      <DashboardCard>
        <VStack as="header" gap={2}>
          <HStack gap={2} align="center">
            <Cloud size={20} />
            <h3>{text("Cloudflare credential center", "ศูนย์รวมการตั้งค่า Cloudflare")}</h3>
          </HStack>
          <p>{text("One place for SmartSpecPro Cloudflare credentials, permission guides, and safe access checks. The catalog covers services used by this repository and Spec 245; it is not a list of every Cloudflare product.", "รวม credential, คู่มือสิทธิ์ และผลตรวจการเข้าถึงของบริการ Cloudflare ที่ SmartSpecPro ใช้และระบุไว้ใน Spec 245 ไว้ที่เดียว ไม่ใช่รายการผลิตภัณฑ์ Cloudflare ทั้งบัญชี")}</p>
        </VStack>
        <VStack as="section" gap={3}>
          <HStack gap={2} wrap="wrap">
            <Badge variant="outline">{text(`${configuredProfileCount} of 3 API token profiles configured`, `ตั้งค่า API token แล้ว ${configuredProfileCount} จาก 3 ชุด`)}</Badge>
            <Badge variant="outline">{text("R2 S3 credentials are separate", "credential R2 S3 แยกต่างหาก")}</Badge>
              <Button variant="outline" size="sm" onClick={() => { void refetch(); }}><RefreshCw size={16} />{text("Refresh status", "รีเฟรชสถานะ")}</Button>
          </HStack>
          <VStack as="section" gap={2}>
            <h4>{text("Shared Cloudflare Account ID", "Cloudflare Account ID ที่ใช้ร่วมกัน")}</h4>
            <p>{text("This field uses the existing vectordb.vectorizeAccountId setting. Saving here updates that same setting, so Vectorize and this center stay synchronized.", "ช่องนี้ใช้ค่า vectordb.vectorizeAccountId เดิม เมื่อบันทึกจากหน้านี้จะอัปเดตแถวเดิม เพื่อให้ Vectorize และศูนย์กลางนี้ใช้ค่าเดียวกัน")}</p>
            <HStack gap={2} wrap="wrap">
              <Label htmlFor="cloudflare-account-id">Account ID</Label>
              <Input id="cloudflare-account-id" value={accountId} onChange={(event) => setAccountId(event.target.value)} maxLength={32} />
              <Button onClick={() => saveAccount.mutate({ accountId: accountId.trim() })} disabled={saveAccount.isPending || !/^[a-f0-9]{32}$/i.test(accountId.trim())}>
                {saveAccount.isPending ? <Loader2 size={16} /> : <Save size={16} />}{text("Save & sync", "บันทึกและ sync")}
              </Button>
            </HStack>
            <p>{text("Current source", "แหล่งค่าปัจจุบัน")}: {data?.accountIdSource ?? "none"}</p>
          </VStack>
        </VStack>
      </DashboardCard>

      <DashboardCard>
        <VStack as="header" gap={2}>
          <h3>{text("Token setup manual", "คู่มือตั้งค่า Token")}</h3>
          <ol>
            <li>{text("Open Cloudflare Dashboard → My Profile → API Tokens → Create Custom Token.", "เข้า Cloudflare Dashboard → My Profile → API Tokens → Create Custom Token")}</li>
            <li>{text("Create one token per purpose shown below. Select only the SmartSpecPro account; restrict zone permissions to smartaihub.app where applicable.", "สร้าง token แยกตามวัตถุประสงค์ด้านล่าง เลือกเฉพาะ account ของ SmartSpecPro และจำกัด zone permission ไว้ที่ smartaihub.app เมื่อทำได้")}</li>
            <li>{text("Copy the token once into its password field, save, then run Probe read access. A 403 identifies the service permission still missing; 404 means the resource may not exist or the endpoint is unavailable.", "คัดลอก token ลงช่องรหัสผ่าน บันทึก แล้วกดตรวจสิทธิ์อ่าน ถ้าได้ 403 คือขาด permission ของบริการนั้น ส่วน 404 อาจหมายถึงไม่มี resource หรือ endpoint ยังไม่พร้อม")}</li>
            <li>{text("For rotation, save the replacement and confirm its probe before revoking the prior token. This page never displays a saved token again.", "เมื่อต้องหมุน token ให้บันทึกค่าใหม่และตรวจ probe ผ่านก่อน แล้วจึงเพิกถอน token เดิม หน้านี้จะไม่แสดง token ที่บันทึกแล้วซ้ำ")}</li>
          </ol>
          <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noreferrer">{text("Open Cloudflare API Tokens", "เปิดหน้า Cloudflare API Tokens")}</a>
          <a href="https://developers.cloudflare.com/fundamentals/api/reference/permissions/" target="_blank" rel="noreferrer">{text("Cloudflare permission reference", "เอกสารอ้างอิง permission ของ Cloudflare")}</a>
        </VStack>
      </DashboardCard>

      <DashboardCard>
        <VStack as="header" gap={2}>
          <h3>{text("Live Cloudflare API permission catalog", "รายการ permission API จาก Cloudflare โดยตรง")}</h3>
          <p>{text(
            "Fetches the current account- and user-scoped permission groups from Cloudflare. It requires Account API Tokens Read and API Tokens Read (user scope). This checks catalog access, not whether the token has every listed permission. Containers/Worker App execution is verified through runtime bindings; write permissions remain unverified until an approved deployment operation.",
            "ดึง permission group ทั้ง account scope และ user scope จาก Cloudflare ต้องมี Account API Tokens Read และ API Tokens Read (user scope) หาก scope ใดได้ 403 ให้เพิ่มสิทธิ์อ่านของ scope นั้นใน token Infrastructure audit แล้วบันทึก token ที่อัปเดตและตรวจใหม่ การดึงรายการนี้ยืนยันเฉพาะสิทธิ์อ่าน catalog ไม่ได้แปลว่า token มี permission ทุกตัวในรายการ ส่วน Containers/Worker App ต้องตรวจผ่าน runtime binding และ write permission ยังไม่ยืนยันจนกว่าจะมี deployment ที่อนุมัติ"
          )}</p>
          <HStack gap={2} wrap="wrap">
            <Button variant="outline" onClick={() => probePermissionCatalog.mutate({ profileId: "audit" })} disabled={probePermissionCatalog.isPending || !data?.profiles.audit.configured || !data?.accountId}>
              {probePermissionCatalog.isPending ? <Loader2 /> : <RefreshCw />}{text("Test permission catalog API", "ทดสอบ Permission Catalog API")}
            </Button>
            {permissionCatalog ? <Badge variant={permissionCatalog.status === "granted" && !permissionCatalog.stale ? "default" : "secondary"}>{statusLabels[permissionCatalog.status][isThai ? "th" : "en"]}{permissionCatalog.stale ? ` · ${text("stale cache", "ข้อมูล cache เก่า")}` : ""} · HTTP {permissionCatalog.httpStatus ?? "—"} · {permissionCatalog.groups.length} groups · {permissionCatalog.complete ? text("complete", "ครบ") : text("incomplete", "ยังไม่ครบ")}</Badge> : null}
          </HStack>
          {permissionCatalog ? <>
            <p>{text("Checked", "ตรวจเมื่อ")}: {new Date(permissionCatalog.checkedAt).toLocaleString()} · {text("scope", "ขอบเขต")}: {text("account + user permission groups", "permission group ระดับ account + user")}</p>
            {permissionCatalog.status === "missing_permission" ? <p role="status">{text("The account catalog request was denied. Add Account API Tokens Read to the Infrastructure audit token at the Smartaihub account scope, save the updated token here, then run this check again. No permission was changed automatically.", "คำขออ่าน catalog ระดับ account ถูกปฏิเสธ ให้เพิ่ม Account API Tokens Read ให้ token Infrastructure audit ใน scope ของ Smartaihub account แล้วบันทึก token ที่แก้ในหน้านี้และตรวจใหม่ ระบบไม่ได้เปลี่ยน permission ให้อัตโนมัติ")}</p> : null}
            {permissionCatalog.status === "partial" ? <p role="status">{text("Only part of the catalog was readable. Check the account and user scope results below; missing scope results are not evidence that those products do not exist.", "อ่าน catalog ได้เพียงบาง scope โปรดตรวจผล account/user ด้านล่าง สถานะขาดสิทธิ์ไม่ได้แปลว่าผลิตภัณฑ์นั้นไม่มีอยู่")}</p> : null}
            {permissionCatalog.sources.length ? <ul>{permissionCatalog.sources.map((source) => <li key={source.scope}><strong>{source.scope}</strong>: {statusLabels[source.status][isThai ? "th" : "en"]} · HTTP {source.httpStatus ?? "—"} · {source.groupCount} groups · {source.complete ? text("complete", "ครบ") : text("incomplete", "ยังไม่ครบ")}{source.status === "missing_permission" ? ` · ${source.scope === "user" ? text("edit the Infrastructure audit token and grant API Tokens Read at user scope (API Tokens Write also satisfies read)", "แก้ token Infrastructure audit แล้วเพิ่ม API Tokens Read ใน user scope (API Tokens Write ใช้แทนสิทธิ์อ่านได้)") : text("edit the Infrastructure audit token and grant Account API Tokens Read at the Smartaihub account scope (Account API Tokens Write also satisfies read)", "แก้ token Infrastructure audit แล้วเพิ่ม Account API Tokens Read ใน scope ของ Smartaihub account (Account API Tokens Write ใช้แทนสิทธิ์อ่านได้)")}` : ""}</li>)}</ul> : null}
            {permissionCatalog.stale ? <p role="status">{text(`Showing the last successful catalog from ${permissionCatalog.lastSuccessAt ? new Date(permissionCatalog.lastSuccessAt).toLocaleString() : "an earlier check"}. Current probe failed; this is not current permission evidence.`, `กำลังแสดง catalog ล่าสุดที่อ่านสำเร็จเมื่อ ${permissionCatalog.lastSuccessAt ? new Date(permissionCatalog.lastSuccessAt).toLocaleString() : "ก่อนหน้านี้"} การตรวจครั้งนี้ไม่ผ่าน ข้อมูลนี้ไม่ใช่หลักฐาน permission ปัจจุบัน`)}</p> : null}
            {permissionCatalog.status === "granted" ? <>
              <Label htmlFor="cloudflare-permission-search">{text("Search all permission groups", "ค้นหา permission group ทั้งหมด")}</Label>
              <Input id="cloudflare-permission-search" value={permissionSearch} onChange={(event) => setPermissionSearch(event.target.value)} placeholder={text("Name, product, scope…", "ชื่อ permission, ผลิตภัณฑ์, scope…")} />
              <p>{text(`Showing ${filteredPermissionGroups.length} of ${permissionCatalog.groups.length} groups`, `แสดง ${filteredPermissionGroups.length} จาก ${permissionCatalog.groups.length} groups`)}</p>
              <ul>{filteredPermissionGroups.map((group) => <li key={group.id}><strong>{group.name}</strong> · {group.category || text("uncategorized", "ไม่ระบุหมวด")} · {group.scopes.join(", ") || text("scope not supplied", "API ไม่ส่ง scope มา")} · {group.selectable === null ? text("selectability not reported", "ไม่ระบุสถานะเลือกใช้") : group.selectable ? text("selectable for this caller", "ผู้เรียกเลือกใช้ได้") : text("not selectable by this caller", "ผู้เรียกไม่มีสิทธิ์เลือก group นี้")}<br /><small>{group.description}</small></li>)}</ul>
            </> : null}
          </> : null}
        </VStack>
      </DashboardCard>

      {CLOUDFLARE_CREDENTIAL_PROFILES.map((profile) => {
        const managed = profile.id !== "vectorize";
        const tokenProfileId = profile.id === "deployment" ? "deployment" : "audit";
        const configured = profile.id === "vectorize" ? data?.legacyVectorize.configured : data?.profiles[tokenProfileId]?.configured;
        const form = managed ? forms[tokenProfileId] : null;
        const permissions = profile.id === "audit"
          ? profile.readPermissions.map((permission) => `Read — ${permission}`)
          : [
            ...profile.readPermissions.map((permission) => `Read — ${permission}`),
            ...profile.writePermissions.map((permission) => `Write — ${permission}`),
          ];
        return (
          <DashboardCard key={profile.id}>
            <VStack as="header" gap={2}>
              <HStack gap={2}>
                <h3>{profile.title}</h3>
                <Badge variant={configured ? "default" : "secondary"}>{configured ? text("Configured", "ตั้งค่าแล้ว") : text("Not configured", "ยังไม่ตั้งค่า")}</Badge>
                <span>{text("Source", "แหล่งค่า")}: {profile.id === "vectorize" ? data?.legacyVectorize.source : profile.owner}</span>
              </HStack>
              <p>{profile.id === "vectorize" ? text("Existing Vectorize integration; this editor writes to the original Vector DB setting so both screens use the same token.", "ใช้กับ Vectorize เดิม ช่องนี้บันทึกกลับค่าตั้ง Vector Database แถวเดิม จึงใช้ token เดียวกันทั้งสองหน้า") : profile.id === "audit" ? text("Read-only inventory and permission checks for the account and zones this system uses.", "ใช้ตรวจรายการ resource และ permission แบบอ่านอย่างเดียวสำหรับ account/zone ที่ระบบใช้งาน") : text("Separate write-capable credential profile for approved deployment operations. Configure the same secret at the actual CI/deployment destination.", "ชุด credential แยกสำหรับงาน deploy ที่ได้รับอนุมัติ ต้องตั้ง secret เดียวกันที่ CI/deployment ซึ่งใช้งานจริง")}</p>
            </VStack>
            <VStack as="section" gap={3}>
              {managed && form ? (
                <>
                  <HStack gap={3}>
                    <VStack as="label" gap={1}>
                      <Label htmlFor={`${profile.id}-label`}>{text("Credential label", "ชื่อชุด credential")}</Label>
                      <Input id={`${tokenProfileId}-label`} value={form.label} maxLength={64} onChange={(event) => setForms((current) => ({ ...current, [tokenProfileId]: { ...current[tokenProfileId], label: event.target.value } }))} />
                    </VStack>
                    <VStack as="label" gap={1}>
                      <Label htmlFor={`${profile.id}-token`}>{text("API token (never shown again after saving)", "API token (บันทึกแล้วจะไม่แสดงกลับมา)")}</Label>
                      <Input id={`${tokenProfileId}-token`} type="password" autoComplete="new-password" value={form.token} maxLength={512} onChange={(event) => setForms((current) => ({ ...current, [tokenProfileId]: { ...current[tokenProfileId], token: event.target.value } }))} />
                    </VStack>
                  </HStack>
                  <HStack gap={2}>
                    <Button onClick={() => saveCredential.mutate({ profileId: tokenProfileId, label: form.label.trim(), token: form.token.trim() })} disabled={saveCredential.isPending || form.label.trim().length === 0 || form.token.trim().length < 20}>
                      {saveCredential.isPending ? <Loader2 /> : <Save />}{text("Save encrypted token", "บันทึก token แบบเข้ารหัส")}
                    </Button>
                    {configured ? <Button variant="destructive" onClick={() => removeCredential.mutate({ profileId: tokenProfileId })} disabled={removeCredential.isPending}><Trash2 />{text("Remove", "ลบ")}</Button> : null}
                    <Button variant="outline" onClick={() => probeCredential.mutate({ profileId: profile.id })} disabled={probeCredential.isPending || !configured || !data?.accountId}>
                      {probeCredential.isPending ? <Loader2 /> : <RefreshCw />}{text("Probe read access", "ตรวจสิทธิ์อ่าน")}
                    </Button>
                  </HStack>
                  {profile.id === "deployment" ? <p>{text("This value is stored encrypted here for inventory and safe read probes. The live deploy pipeline still needs its own secret configured at the named CI/deployment destination. Write scopes are not tested because this page never changes Cloudflare resources.", "ค่านี้เก็บแบบเข้ารหัสเพื่อทำ inventory และตรวจสิทธิ์อ่านเท่านั้น ต้องตั้ง secret ที่ CI/deployment pipeline ซึ่งใช้งานจริงด้วย หน้านี้ไม่ทดสอบ write scope เพราะไม่แก้ resource บน Cloudflare")}</p> : null}
                </>
              ) : (
                <>
                  <p>{text("This editor writes to the existing vectordb.vectorizeApiToken setting. It stays synchronized with the original Vector Database settings; the saved token is never shown again.", "ช่องนี้บันทึกลง vectordb.vectorizeApiToken แถวเดิม จึงใช้ค่าเดียวกับหน้าตั้งค่า Vector Database และจะไม่แสดง token ที่บันทึกแล้วซ้ำ")}</p>
                  <Label htmlFor="cloudflare-vectorize-token">{text("Replace Vectorize API token", "เปลี่ยน Vectorize API token")}</Label>
                  <Input id="cloudflare-vectorize-token" type="password" autoComplete="new-password" value={legacyVectorizeToken} maxLength={512} onChange={(event) => setLegacyVectorizeToken(event.target.value)} placeholder={configured ? text("Enter a replacement token", "ใส่ token ใหม่เพื่อแทนค่าเดิม") : text("Enter API token", "ใส่ API token")} />
                  <HStack gap={2} wrap="wrap">
                    <Button onClick={() => saveLegacyVectorizeToken.mutate({ token: legacyVectorizeToken.trim() })} disabled={saveLegacyVectorizeToken.isPending || legacyVectorizeToken.trim().length < 20}>
                      {saveLegacyVectorizeToken.isPending ? <Loader2 /> : <Save />}{text("Save to existing Vectorize setting", "บันทึกลงค่าตั้ง Vectorize เดิม")}
                    </Button>
                    <Button variant="outline" onClick={() => probeCredential.mutate({ profileId: "vectorize" })} disabled={probeCredential.isPending || !configured || !data?.accountId}>
                      {probeCredential.isPending ? <Loader2 /> : <RefreshCw />}{text("Probe Vectorize token", "ตรวจ Vectorize token")}
                    </Button>
                  </HStack>
                </>
              )}
              <VStack as="section" gap={1}>
                <h4>{profile.id === "deployment" ? text("Recommended read and write permissions", "สิทธิ์อ่านและเขียนที่แนะนำ") : text("Required permissions", "สิทธิ์ที่ต้องใช้")}</h4>
                <ul>
                  {permissions.map((permission) => <li key={permission}>{permission}</li>)}
                </ul>
              </VStack>
              {renderProbe(profile.id)}
            </VStack>
          </DashboardCard>
        );
      })}

      <DashboardCard>
        <VStack as="header" gap={2}>
          <h3>{text("Existing Cloudflare runtime and storage settings", "ค่ารันไทม์ Cloudflare และ Storage เดิม")}</h3>
          <p>{text("These credentials keep their current source of truth. This page syncs status and guides; it does not copy or reveal secret values.", "credential เหล่านี้คงแหล่งข้อมูลเดิม หน้าเดียวนี้แสดงสถานะและคู่มือ โดยไม่คัดลอกหรือเปิดเผย secret")}</p>
        </VStack>
        <VStack as="section" gap={3}>
          <VStack as="section" gap={1}>
            <h4>{text("Worker runtime secrets — deployment environment", "Worker runtime secrets — deployment environment")}</h4>
            <ul>
              <li><Badge variant="outline">{data?.runtime.workerUrlConfigured ? text("Configured", "ตั้งค่าแล้ว") : text("Missing", "ยังไม่มี")}</Badge> CLOUDFLARE_RUNTIME_URL</li>
              <li><Badge variant="outline">{data?.runtime.runtimeTokenConfigured ? text("Configured", "ตั้งค่าแล้ว") : text("Missing", "ยังไม่มี")}</Badge> CLOUDFLARE_RUNTIME_TOKEN</li>
              <li><Badge variant="outline">{data?.runtime.searchCacheTokenConfigured ? text("Configured", "ตั้งค่าแล้ว") : text("Missing", "ยังไม่มี")}</Badge> CLOUDFLARE_SEARCH_CACHE_TOKEN</li>
            </ul>
            <p>{text("Source", "แหล่งค่า")}: {data?.runtime.secretSource}</p>
            <p>{text(
              "These runtime values are owned by the deployment environment and are shown here as status only. Set a missing value in the production secret manager or Web service environment, then restart Web. Keep the runtime token separate from the Search Cache token.",
              "ค่ารันไทม์เหล่านี้จัดการที่ deployment environment หน้านี้แสดงสถานะเท่านั้น หากยังขาด ให้ตั้งใน secret manager หรือ environment ของ Web service แล้ว restart Web โดยแยก runtime token ออกจาก Search Cache token"
            )}</p>
          </VStack>
          <VStack as="section" gap={1}>
            <HStack gap={2}><h4>R2 S3 credentials</h4><Badge variant="outline">{text("Separate from Cloudflare API tokens", "แยกจาก Cloudflare API token")}</Badge></HStack>
            <p>{text("Existing Storage Settings are reused. R2 data access uses bucket-scoped S3 credentials; Workers R2 Storage Read only controls Cloudflare REST bucket administration.", "ใช้ค่า Storage Settings เดิม การเข้าถึงข้อมูล R2 ใช้ S3 credential ที่จำกัด bucket ส่วน Workers R2 Storage Read ใช้จัดการ bucket ผ่าน Cloudflare REST API")}</p>
            {r2Configs.length ? <ul>{r2Configs.map((item) => <li key={item.id}><strong>{item.displayName}</strong> · {item.bucket || text("bucket not set", "ยังไม่ตั้ง bucket")} · {item.isActive ? text("active", "ใช้งาน") : text("inactive", "ไม่ได้ใช้งาน")} · {item.hasCredentials ? text("credentials set", "ตั้ง credential แล้ว") : text("credentials missing", "ขาด credential")} · {item.lastTestResult?.success === true ? text("last connection test passed", "ทดสอบการเชื่อมต่อล่าสุดผ่าน") : item.lastTestResult?.success === false ? text("last connection test failed", "ทดสอบการเชื่อมต่อล่าสุดไม่ผ่าน") : text("not tested", "ยังไม่ทดสอบ")}</li>)}</ul> : <p>{text("No R2 storage profile found.", "ยังไม่พบโปรไฟล์ R2")}</p>}
            <p>{text("This is the existing Storage Settings editor embedded here. The legacy ?tab=storage URL redirects to this center.", "นี่คือหน้า Storage Settings เดิมที่นำมาแสดงในศูนย์กลางนี้ ลิงก์เดิม ?tab=storage จะพามาที่หน้านี้")}</p>
            <VStack as="section" gap={2}>
              <h4>{text("Configure existing storage here", "ตั้งค่า Storage เดิมได้จากหน้านี้")}</h4>
              <StorageSettingsPanel />
            </VStack>
          </VStack>
        </VStack>
      </DashboardCard>
    </VStack>
  );
}
