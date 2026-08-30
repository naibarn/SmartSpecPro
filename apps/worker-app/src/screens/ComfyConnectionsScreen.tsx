import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useWorkerAppContext } from "../app/workerContext";

type Transport = "local_stdio" | "self_hosted_stdio_bridge" | "self_hosted_http_mcp" | "comfy_cloud" | "ssh_tunnel";
type CredentialKind = "none" | "api_key" | "oauth" | "ssh_keychain_ref";
type Profile = {
  profileId: string;
  workerId: string;
  displayName: string;
  transport: Transport;
  endpointLabel: string;
  endpoint?: string | null;
  command?: string | null;
  args?: string[];
  credentialKind: string;
  credentialRef?: string | null;
  credentialConfigured: boolean;
  enabled: boolean;
  profileRevision: number;
  permissionRevision: number;
  policyRevision: number;
  projectionRevision: number;
  expiresAt?: string | null;
  lastProbeAt?: string | null;
  lastProbeStatus?: string | null;
};
type ProfilesResponse = { profiles: Profile[]; activeProfileId?: string | null };
type ProbeResult = { status: string; protocolVersion?: string | null; toolNames: string[]; workflowIds: string[]; capabilities: string[]; toolSchemas: Array<[string, string]> };
type ComfyRuntime = { status: "ready" | "needs_install"; command: string; managedCommandPath?: string | null; pythonVersion?: string | null; comfyMcpVersion?: string | null; comfyCliVersion?: string | null; pythonRequirement: string; comfyMcpRequirement: string; comfyCliRequirement: string; installRoot: string; requiresComfyuiWorkspace: boolean; message: string };

const copy = {
  th: {
    title: "ComfyUI connections", body: "บันทึกได้หลาย connection และเลือกชุดที่ใช้งานอยู่ งานใหม่จะใช้ profile ที่ server อนุญาตเท่านั้น",
    add: "เพิ่ม connection", edit: "แก้ไข", name: "ชื่อ connection", transport: "รูปแบบการเชื่อมต่อ", endpoint: "MCP endpoint / host", command: "คำสั่ง local MCP", bridgeArgs: "Bridge arguments (ต้องมี {endpoint})", sshArgs: "SSH options (ต้องมี -N, -L และ ExitOnForwardFailure=yes)", credential: "Secure-store reference", credentialType: "ประเภท credential", secret: "ตั้งค่า secret (ไม่แสดงซ้ำ)", deleteSecret: "ลบ secret", save: "บันทึก", active: "ใช้งานอยู่", activate: "เลือกใช้งาน", disable: "ยกเลิกสิทธิ์ profile", probe: "ทดสอบและอ่าน workflow", empty: "ยังไม่มี ComfyUI profile", disabled: "ถูกปิดใช้งาน", configured: "มี credential reference", missing: "ยังไม่มี credential reference", local: "local process", revisions: "revision", noManifest: "ยังไม่ได้ตรวจสอบความสามารถ", mcpRuntime: "Local ComfyUI MCP runtime", ready: "พร้อมใช้งาน", installNeeded: "ยังไม่ได้ติดตั้ง", install: "ติดตั้ง / ซ่อมแซม MCP", installing: "กำลังติดตั้ง...", runtimeHint: "ใช้ Python จาก Hermes runtime ก่อน หากไม่มีจึงใช้ Python ในเครื่อง และติดตั้ง package ผ่านอินเทอร์เน็ตครั้งแรกในโฟลเดอร์แยกจาก ComfyUI", workspaceHint: "ยังต้องมี ComfyUI workspace และ GPU dependencies ในเครื่องนี้",
  },
  en: {
    title: "ComfyUI connections", body: "Save multiple connections and choose the active one. New jobs use only profiles allowed by the server.",
    add: "Add connection", edit: "Edit", name: "Connection name", transport: "Connection type", endpoint: "MCP endpoint / host", command: "Local MCP command", bridgeArgs: "Bridge arguments (must include {endpoint})", sshArgs: "SSH options (requires -N, -L, and ExitOnForwardFailure=yes)", credential: "Secure-store reference", credentialType: "Credential type", secret: "Set secret (never shown again)", deleteSecret: "Delete secret", save: "Save", active: "Active", activate: "Use this profile", disable: "Revoke profile", probe: "Test and discover workflows", empty: "No ComfyUI profiles yet", disabled: "Disabled", configured: "Credential reference configured", missing: "Credential reference missing", local: "local process", revisions: "revisions", noManifest: "Not probed yet", mcpRuntime: "Local ComfyUI MCP runtime", ready: "Ready", installNeeded: "Not installed", install: "Install / repair MCP", installing: "Installing...", runtimeHint: "The Worker uses Python from the Hermes runtime first, then system Python as a fallback, and downloads the package on first install into an isolated folder", workspaceHint: "A ComfyUI workspace and GPU dependencies are still required on this machine",
  },
} as const;

export function ComfyConnectionsScreen({ onNavigate }: { onNavigate?: (route: "workflows") => void }) {
  const { locale } = useWorkerAppContext();
  const t = copy[locale];
  const [data, setData] = useState<ProfilesResponse>({ profiles: [], activeProfileId: null });
  const [error, setError] = useState("");
  const [probe, setProbe] = useState<Record<string, ProbeResult>>({});
  const [runtime, setRuntime] = useState<ComfyRuntime | null>(null);
  const [installing, setInstalling] = useState(false);
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [form, setForm] = useState({ profileId: null as string | null, profileRevision: 1, permissionRevision: 1, policyRevision: 1, projectionRevision: 1, displayName: "Local ComfyUI", transport: "local_stdio" as Transport, endpoint: "", command: "comfy-mcp", bridgeArgs: "--endpoint {endpoint}", sshArgs: "", credentialKind: "none" as CredentialKind, credentialRef: "", credentialSecret: "" });
  const formatRuntimeError = (value: unknown) => {
    const raw = String(value);
    if (raw.includes("comfy_mcp_python_310_required")) return locale === "th"
      ? "ติดตั้ง Local ComfyUI MCP ไม่สำเร็จ: ไม่พบ Python 3.10 ขึ้นไป ให้ติดตั้งหรือซ่อมแซม Hermes runtime ในเมนู Runtime & agents แล้วลองใหม่"
      : "Local ComfyUI MCP could not be installed: Python 3.10+ was not found. Install or repair the Hermes runtime from Runtime & agents, then try again.";
    if (raw.includes("comfy_mcp_ensurepip_failed") || raw.includes("comfy_mcp_pip_missing")) return locale === "th"
      ? "ติดตั้ง Local ComfyUI MCP ไม่สำเร็จ: Python runtime ไม่มี pip ให้ติดตั้ง Worker runtime รุ่นล่าสุดใหม่ แล้วลองอีกครั้ง"
      : "Local ComfyUI MCP could not be installed: the Python runtime has no pip. Reinstall the latest Worker runtime and try again.";
    if (raw.includes("comfy_mcp_package_install_failed")) return locale === "th"
      ? "ดาวน์โหลดแพ็กเกจ ComfyUI MCP ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ต proxy หรือ firewall แล้วลองใหม่"
      : "The ComfyUI MCP package download failed. Check the network, proxy, or firewall and try again.";
    if (raw.includes("comfy_mcp_runtime_verification_failed") || raw.includes("comfy_mcp_entrypoint_missing")) return locale === "th"
      ? "ติดตั้ง ComfyUI MCP แล้วแต่ตรวจสอบไฟล์ไม่ครบ ให้กดติดตั้ง / ซ่อมแซมอีกครั้ง หรืออัปเดต Worker runtime"
      : "ComfyUI MCP was installed but its files could not be verified. Install / repair again or update the Worker runtime.";
    return raw;
  };
  const load = () => void invoke<ProfilesResponse>("worker_app_get_comfy_profiles").then(value => { setData(value); setError(""); }).catch(value => setError(String(value)));
  useEffect(() => {
    load();
    void invoke<ComfyRuntime>("worker_app_get_comfy_mcp_runtime").then(setRuntime).catch(() => setRuntime(null));
    void invoke<{ worker?: { id?: string } } | null>("worker_app_get_saved_connection").then(value => setWorkerId(value?.worker?.id || null)).catch(() => setWorkerId(null));
  }, []);
  const save = () => {
    const now = Date.now();
    const profileId = form.profileId || `profile-${now}`;
    if (!workerId) { setError(locale === "th" ? "ต้องเชื่อมต่อ Worker กับ SmartAIHub ก่อนบันทึก ComfyUI profile" : "Connect this Worker to SmartAIHub before saving a ComfyUI profile"); return; }
    void invoke<Profile>("worker_app_save_comfy_profile", { profile: {
      profileId, workerId, displayName: form.displayName.trim(), transport: form.transport,
      endpoint: form.endpoint.trim() || null, command: form.transport === "local_stdio" ? "comfy-mcp" : form.command.trim() || null, args: form.transport === "ssh_tunnel" ? form.sshArgs.trim().split(/\s+/).filter(Boolean) : form.transport === "self_hosted_stdio_bridge" ? form.bridgeArgs.trim().split(/\s+/).filter(Boolean) : [], credentialKind: form.credentialKind,
      credentialRef: form.credentialRef.trim() || null, enabled: true, profileRevision: form.profileRevision, permissionRevision: form.permissionRevision,
      policyRevision: form.policyRevision, projectionRevision: form.projectionRevision, expiresAt: null, lastProbeAt: null, lastProbeStatus: "unverified",
    } }).then(() => form.credentialSecret.trim() ? invoke("worker_app_set_comfy_credential", { profileId, secret: form.credentialSecret }).then(() => { setForm(current => ({ ...current, profileId: null, credentialSecret: "" })); load(); }) : load()).catch(value => setError(String(value)));
  };
  const activate = (profileId: string) => void invoke<ProfilesResponse>("worker_app_activate_comfy_profile", { profileId }).then(setData).catch(value => setError(String(value)));
  const disable = (profileId: string) => void invoke<ProfilesResponse>("worker_app_disable_comfy_profile", { profileId }).then(setData).catch(value => setError(String(value)));
  const runProbe = (profileId: string) => void invoke<ProbeResult>("worker_app_probe_comfy_profile", { profileId }).then(value => { setProbe(current => ({ ...current, [profileId]: value })); load(); setError(""); }).catch(value => setError(String(value)));
  const installRuntime = () => { setInstalling(true); setError(""); void invoke<{ runtime: ComfyRuntime }>("worker_app_install_comfy_mcp").then(value => { setRuntime(value.runtime); load(); }).catch(value => setError(formatRuntimeError(value))).finally(() => setInstalling(false)); };
  const edit = (profile: Profile) => setForm({ profileId: profile.profileId, profileRevision: profile.profileRevision, permissionRevision: profile.permissionRevision, policyRevision: profile.policyRevision, projectionRevision: profile.projectionRevision, displayName: profile.displayName, transport: profile.transport, endpoint: profile.endpoint || "", command: profile.command || "comfy-mcp", bridgeArgs: profile.transport === "self_hosted_stdio_bridge" ? (profile.args || []).join(" ") : "--endpoint {endpoint}", sshArgs: profile.transport === "ssh_tunnel" ? (profile.args || []).join(" ") : "", credentialKind: profile.credentialKind as CredentialKind, credentialRef: profile.credentialRef || "", credentialSecret: "" });
  const deleteSecret = (profileId: string) => void invoke("worker_app_delete_comfy_credential", { profileId }).then(() => load()).catch(value => setError(String(value)));
  return <section className="dashboard-grid" role="tabpanel" data-testid="worker-screen-comfy">
    <article className="panel wide">
      <div className="panel-heading"><div><p className="eyebrow">ComfyUI MCP</p><h2>{t.title}</h2></div></div>
      <p className="subtle">{t.body}</p>
      {onNavigate ? <button type="button" className="secondary-button" onClick={() => onNavigate("workflows")}>{locale === "th" ? "เปิด ComfyUI Workbench เพื่อสั่งรัน" : "Open ComfyUI Workbench to run"}</button> : null}
      {error ? <p className="connect-message error" role="alert">{error}</p> : null}
      <article className="workspace-status-card" aria-label={t.mcpRuntime}>
        <div className="panel-heading"><strong>{t.mcpRuntime}</strong><span className={`loop-badge${runtime?.status === "ready" ? "" : " warning"}`}>{runtime?.status === "ready" ? t.ready : t.installNeeded}</span></div>
        <span>{runtime?.command || "comfy-mcp"} · {runtime?.comfyMcpVersion ? `comfy-mcp ${runtime.comfyMcpVersion}` : "comfy-mcp 0.10.0"} · {runtime?.comfyCliVersion ? `comfy-cli ${runtime.comfyCliVersion}` : "comfy-cli >=1.14.0"}</span>
        <span>{t.runtimeHint}. {t.workspaceHint}</span>
        <button type="button" className="primary-button" onClick={installRuntime} disabled={installing}>{installing ? t.installing : t.install}</button>
      </article>
      <div className="comfy-profile-grid" aria-label={t.title}>
        {data.profiles.length === 0 ? <p className="subtle">{t.empty}</p> : data.profiles.map(profile => <article className={`workspace-status-card${data.activeProfileId === profile.profileId ? " active" : ""}`} key={profile.profileId}>
          <div className="panel-heading"><strong>{profile.displayName}</strong><span className="loop-badge">{data.activeProfileId === profile.profileId ? t.active : profile.enabled ? profile.transport : t.disabled}</span></div>
          <span>{profile.transport} · {profile.endpointLabel || t.local}</span>
          <span>{profile.credentialConfigured ? t.configured : t.missing} · {t.revisions}: {profile.profileRevision}/{profile.permissionRevision}/{profile.policyRevision}</span>
          <span>{probe[profile.profileId] ? `${probe[profile.profileId].workflowIds.length} workflows · ${probe[profile.profileId].toolNames.length} tools` : t.noManifest}</span>
          {probe[profile.profileId] ? <details><summary>{locale === "th" ? "ดูความสามารถที่ตรวจพบ" : "View discovered capabilities"}</summary><span>{probe[profile.profileId].capabilities.length ? probe[profile.profileId].capabilities.join(", ") : (locale === "th" ? "ยังไม่มี capability ที่ประกาศ" : "No capability identifiers advertised")}</span><span>{probe[profile.profileId].workflowIds.length ? probe[profile.profileId].workflowIds.join(", ") : (locale === "th" ? "ยังไม่มี workflow ที่ประกาศ" : "No workflow identifiers advertised")}</span></details> : null}
          <div className="button-row"><button type="button" className="secondary-button" onClick={() => runProbe(profile.profileId)} disabled={!profile.enabled}>{t.probe}</button><button type="button" className="secondary-button" onClick={() => activate(profile.profileId)} disabled={!profile.enabled || data.activeProfileId === profile.profileId}>{t.activate}</button><button type="button" className="secondary-button" onClick={() => edit(profile)}>{t.edit}</button><button type="button" className="secondary-button" onClick={() => deleteSecret(profile.profileId)} disabled={!profile.credentialConfigured}>{t.deleteSecret}</button><button type="button" className="secondary-button" onClick={() => disable(profile.profileId)} disabled={!profile.enabled}>{t.disable}</button></div>
        </article>)}
      </div>
      <details className="workspace-status-card"><summary>{t.add}</summary>
        <div className="settings-form-grid">
          <label>{t.name}<input value={form.displayName} onChange={event => setForm({ ...form, displayName: event.target.value })} /></label>
          <label>{t.transport}<select value={form.transport} onChange={event => { const transport = event.target.value as Transport; setForm({ ...form, transport, credentialKind: transport === "local_stdio" || transport === "self_hosted_stdio_bridge" ? "none" : form.credentialKind }); }}><option value="local_stdio">Local stdio</option><option value="self_hosted_stdio_bridge">Remote stdio bridge</option><option value="self_hosted_http_mcp">Self-hosted HTTP MCP</option><option value="comfy_cloud">Comfy Cloud</option><option value="ssh_tunnel">SSH tunnel</option></select></label>
          {form.transport !== "local_stdio" ? <label>{t.endpoint}<input value={form.endpoint} onChange={event => setForm({ ...form, endpoint: event.target.value })} placeholder={form.transport === "comfy_cloud" ? "https://cloud.comfy.org/mcp" : "https://.../mcp"} /></label> : null}
          {form.transport === "local_stdio" || form.transport === "self_hosted_stdio_bridge" ? <label>{t.command}<input value={form.transport === "local_stdio" ? "comfy-mcp" : form.command} readOnly={form.transport === "local_stdio"} onChange={event => setForm({ ...form, command: event.target.value })} /></label> : null}
          {form.transport === "self_hosted_stdio_bridge" ? <label>{t.bridgeArgs}<input value={form.bridgeArgs} onChange={event => setForm({ ...form, bridgeArgs: event.target.value })} /></label> : null}
          {form.transport === "ssh_tunnel" ? <label>{t.sshArgs}<input value={form.sshArgs} onChange={event => setForm({ ...form, sshArgs: event.target.value })} placeholder="-N -o ExitOnForwardFailure=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/path/known_hosts -L 127.0.0.1:8188:127.0.0.1:8188 user@host" /></label> : null}
          {form.transport !== "local_stdio" && form.transport !== "self_hosted_stdio_bridge" ? <label>{t.credential}<input value={form.credentialRef} onChange={event => setForm({ ...form, credentialRef: event.target.value })} placeholder="keychain:comfy/profile" /></label> : null}
          {form.transport !== "local_stdio" && form.transport !== "self_hosted_stdio_bridge" ? <label>{t.credentialType}<select value={form.credentialKind} onChange={event => setForm({ ...form, credentialKind: event.target.value as CredentialKind })}><option value="none">None</option><option value="api_key">API key</option><option value="oauth">OAuth</option><option value="ssh_keychain_ref">SSH keychain</option></select></label> : null}
          {form.transport !== "local_stdio" && form.transport !== "self_hosted_stdio_bridge" ? <label>{t.secret}<input type="password" autoComplete="new-password" value={form.credentialSecret} onChange={event => setForm({ ...form, credentialSecret: event.target.value })} /></label> : null}
        </div>
        <button type="button" className="primary-button" onClick={save} disabled={!form.displayName.trim()}>{t.save}</button>
      </details>
    </article>
  </section>;
}
