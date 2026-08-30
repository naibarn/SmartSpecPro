import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { useWorkerAppContext } from "../app/workerContext";

type Profile = { profileId: string; displayName: string; enabled: boolean; transport?: string };
type ProfilesResponse = { profiles: Profile[]; activeProfileId?: string | null };
type ProbeResult = { status: string; protocolVersion?: string | null; toolNames: string[]; workflowIds: string[]; capabilities: string[]; toolSchemas: Array<[string, string]> };
type WorkflowSchemaResult = { profileId: string; workflowId: string; toolName: string; inputSchema: unknown; outputSchema: unknown; result: unknown };
type RunResult = { status: string; profileId: string; toolName?: string | null; runId: string; workflowId?: string | null; executionId?: string | null; outputDir: string; localFiles?: string[]; result: unknown };
type UploadResult = { toolName: string; fileName: string; reference?: string | null; result: unknown };
type Schema = { type?: string; title?: string; description?: string; required?: string[]; properties?: Record<string, Schema>; enum?: Array<string | number | boolean>; default?: unknown };

const WORKFLOW_TOOLS = ["run_workflow", "run_template", "submit_workflow", "create_execution"];

const copy = {
  th: {
    title: "ComfyUI Workbench", body: "ตรวจสอบ MCP connection และสั่ง workflow ได้โดยตรงจาก Worker App ไม่ต้องรอ server render-job", profile: "Connection", refresh: "ตรวจ connection ใหม่", workflow: "Workflow", workflowPlaceholder: "ระบุ workflow หรือ template name", tool: "MCP workflow tool", schema: "Input contract", inspectWorkflow: "ตรวจ schema ของ workflow", inspecting: "กำลังตรวจ schema...", schemaToolMissing: "connection นี้ไม่มี MCP tool สำหรับอ่าน schema ราย workflow", fields: "ฟิลด์ที่รับ", required: "จำเป็น", requiredFields: "กรอกฟิลด์ที่จำเป็นให้ครบ: ", noFields: "ไม่มีฟิลด์แบบฟอร์ม ใช้ JSON ขั้นสูงด้านล่าง", prompt: "Prompt", promptPlaceholder: "เขียน prompt ที่จะส่งเข้า workflow", attachment: "ไฟล์แนบ", target: "ฟิลด์ปลายทาง", chooseFile: "เลือกไฟล์", attach: "แนบ path เข้า arguments", upload: "Upload ผ่าน MCP", noAttachment: "ยังไม่ได้เลือกไฟล์", advanced: "JSON arguments (แก้ได้เต็มรูปแบบ)", run: "สั่งรัน workflow", cancel: "ยกเลิกการทำงาน", cancelRequested: "ส่งคำขอยกเลิกแล้ว", running: "กำลังรอผลจาก ComfyUI...", result: "ผลลัพธ์จาก ComfyUI", openOutput: "เปิดโฟลเดอร์ผลลัพธ์", outputSaved: "บันทึกผลลัพธ์ไว้ที่เครื่อง Worker แล้ว", syncResponse: "ผลลัพธ์ตอบกลับทันที", empty: "ยังไม่พบ workflow หรือ tool ที่ใช้รัน", outputHint: "ผลลัพธ์จะคืนจาก MCP โดยตรง และ Worker บันทึก result.json ในโฟลเดอร์ run", error: "ทำงานไม่สำเร็จ", invalidJson: "JSON arguments ไม่ถูกต้อง", workflowRequired: "ต้องระบุ workflowId/workflowPath/templateName ก่อนรัน", uploadDone: "อัปโหลดไฟล์และผูกเข้ากับ arguments แล้ว", localAttach: "local สามารถส่ง path ให้ workflow ได้โดยตรง", remoteAttach: "remote/cloud ต้องใช้ Upload ผ่าน MCP หาก schema ของ upload_file รองรับ data", protocol: "Protocol", capabilities: "Capabilities", tools: "tools", workflows: "workflows", selected: "ใช้งานอยู่", disabled: "ปิดใช้งาน", inspect: "ดู schema", mcpTool: "MCP tool", input: "Input", output: "Output" },
  en: {
    title: "ComfyUI Workbench", body: "Inspect an MCP connection and run workflows directly from the Worker App without waiting for a server render job", profile: "Connection", refresh: "Probe connection", workflow: "Workflow", workflowPlaceholder: "Enter a workflow or template name", tool: "MCP workflow tool", schema: "Input contract", inspectWorkflow: "Inspect workflow schema", inspecting: "Inspecting schema...", schemaToolMissing: "This connection does not advertise a per-workflow schema tool", fields: "Accepted fields", required: "required", requiredFields: "Fill required fields: ", noFields: "No form fields; use the advanced JSON editor below", prompt: "Prompt", promptPlaceholder: "Write the prompt sent to the workflow", attachment: "Attachment", target: "Target field", chooseFile: "Choose file", attach: "Attach path to arguments", upload: "Upload through MCP", noAttachment: "No file selected", advanced: "JSON arguments (fully editable)", run: "Run workflow", cancel: "Cancel run", cancelRequested: "Cancellation requested", running: "Waiting for ComfyUI...", result: "ComfyUI result", openOutput: "Open output folder", outputSaved: "The result was saved on the Worker machine", syncResponse: "Synchronous response", empty: "No workflow or runnable tool discovered", outputHint: "The MCP response is returned directly and Worker saves result.json in the run folder", error: "Run failed", invalidJson: "Arguments JSON is invalid", workflowRequired: "Provide workflowId, workflowPath, or templateName before running", uploadDone: "File uploaded and attached to arguments", localAttach: "Local connections can pass the path directly to the workflow", remoteAttach: "Remote/cloud connections need MCP upload_file with a schema that supports data", protocol: "Protocol", capabilities: "Capabilities", tools: "tools", workflows: "workflows", selected: "Active", disabled: "Disabled", inspect: "Inspect schema", mcpTool: "MCP tool", input: "Input", output: "Output" },
} as const;

function parseSchema(value: string | undefined): Schema { if (!value) return {}; try { return JSON.parse(value) as Schema; } catch { return {}; } }
function schemaFromValue(value: unknown): Schema { return value && typeof value === "object" && !Array.isArray(value) ? value as Schema : {}; }
function formatError(value: unknown): string { if (typeof value === "string") return value; try { return JSON.stringify(value); } catch { return String(value); } }
function fieldValue(argsText: string, name: string): unknown { try { return (JSON.parse(argsText) as Record<string, unknown>)[name]; } catch { return undefined; } }
function isPromptField(name: string): boolean { return /prompt|positive|negative|description|text/i.test(name); }
function isFileField(name: string): boolean { return /image|video|audio|file|frame|mask|reference|asset/i.test(name); }
function workflowArgumentName(schema: Schema): string {
  return ["workflowId", "workflow_id", "workflowPath", "workflow_path", "templateName", "template_name", "templateId", "template_id"]
    .find(name => Boolean(schema.properties?.[name])) || "workflowId";
}

export function ComfyWorkflowsScreen() {
  const { locale } = useWorkerAppContext();
  const t = copy[locale];
  const [profiles, setProfiles] = useState<ProfilesResponse>({ profiles: [], activeProfileId: null });
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState("");
  const [selectedTool, setSelectedTool] = useState("");
  const [argumentsText, setArgumentsText] = useState("{}");
  const [attachmentPath, setAttachmentPath] = useState("");
  const [attachmentField, setAttachmentField] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [workflowSchema, setWorkflowSchema] = useState<WorkflowSchemaResult | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const probeRequestId = useRef(0);

  const loadProfiles = () => void invoke<ProfilesResponse>("worker_app_get_comfy_profiles").then(value => {
    setProfiles(value);
    setSelectedProfileId(current => current && value.profiles.some(profile => profile.profileId === current && profile.enabled) ? current : value.activeProfileId || value.profiles.find(profile => profile.enabled)?.profileId || null);
    setError("");
  }).catch(value => setError(formatError(value)));
  useEffect(() => { loadProfiles(); }, []);

  const probeProfile = (profileId: string | null) => {
    if (!profileId) return;
    const requestId = ++probeRequestId.current;
    setError("");
    setProbe(null);
    setWorkflowSchema(null);
    void invoke<ProbeResult>("worker_app_probe_comfy_profile", { profileId }).then(value => {
      if (requestId !== probeRequestId.current) return;
      setProbe(value);
      const nextWorkflow = value.workflowIds[0] || "";
      const nextTool = value.toolNames.find(tool => WORKFLOW_TOOLS.includes(tool)) || "";
      const nextSchema = parseSchema(new Map(value.toolSchemas).get(nextTool));
      setSelectedWorkflow(current => {
        const next = current && value.workflowIds.includes(current) ? current : nextWorkflow;
        if (next) setArgumentsText(currentText => {
          try { const args = JSON.parse(currentText) as Record<string, unknown>; if (!args.workflowId && !args.workflow_id && !args.workflowPath && !args.workflow_path && !args.templateName && !args.template_name) args[workflowArgumentName(nextSchema)] = next; return JSON.stringify(args, null, 2); } catch { return currentText; }
        });
        return next;
      });
      setSelectedTool(current => current && value.toolNames.includes(current) && WORKFLOW_TOOLS.includes(current) ? current : nextTool);
    }).catch(value => { if (requestId === probeRequestId.current) { setProbe(null); setError(`${t.error}: ${formatError(value)}`); } });
  };
  useEffect(() => { if (selectedProfileId) probeProfile(selectedProfileId); }, [selectedProfileId]);

  const schemas = useMemo(() => new Map(probe?.toolSchemas || []), [probe]);
  const toolSchema = useMemo(() => parseSchema(schemas.get(selectedTool)), [schemas, selectedTool]);
  const selectedSchema = useMemo(() => {
    if (workflowSchema?.workflowId === selectedWorkflow) {
      const inspected = schemaFromValue(workflowSchema.inputSchema);
      if (inspected.properties || inspected.required?.length) return inspected;
    }
    return toolSchema;
  }, [selectedWorkflow, toolSchema, workflowSchema]);
  const fields = useMemo(() => Object.entries(selectedSchema.properties || {}), [selectedSchema]);
  const activeProfile = profiles.profiles.find(profile => profile.profileId === selectedProfileId);
  const runnableTools = useMemo(() => (probe?.toolNames || []).filter(tool => WORKFLOW_TOOLS.includes(tool) && schemas.has(tool)), [probe, schemas]);

  const setArgument = (name: string, value: unknown) => {
    try { const parsed = JSON.parse(argumentsText) as Record<string, unknown>; parsed[name] = value; setArgumentsText(JSON.stringify(parsed, null, 2)); } catch { setError(t.invalidJson); }
  };
  const selectProfile = (value: string) => { probeRequestId.current += 1; setSelectedProfileId(value || null); setProbe(null); setWorkflowSchema(null); setSelectedWorkflow(""); setSelectedTool(""); setArgumentsText("{}"); setAttachmentPath(""); setRunResult(null); };
  const selectWorkflow = (value: string) => { setSelectedWorkflow(value); setWorkflowSchema(null); setArgument(workflowArgumentName(selectedSchema), value); };
  const selectTool = (value: string) => { setSelectedTool(value); setWorkflowSchema(null); if (selectedWorkflow) setArgument(workflowArgumentName(parseSchema(schemas.get(value))), selectedWorkflow); };
  const inspectWorkflow = async () => { if (!selectedProfileId || !selectedWorkflow) return; setError(""); setInspecting(true); try { setWorkflowSchema(await invoke<WorkflowSchemaResult>("worker_app_inspect_comfy_workflow", { request: { profileId: selectedProfileId, workflowId: selectedWorkflow } })); } catch (value) { setWorkflowSchema(null); setError(formatError(value)); } finally { setInspecting(false); } };
  const chooseAttachment = async () => {
    const selected = await openFileDialog({ multiple: false, directory: false, filters: [{ name: "Media", extensions: ["png", "jpg", "jpeg", "webp", "gif", "mp4", "webm", "mov", "wav", "mp3", "flac"] }] });
    const path = Array.isArray(selected) ? selected[0] : selected;
    if (typeof path === "string" && path) setAttachmentPath(path);
  };
  const attachPath = () => { if (attachmentPath) { setArgument(attachmentField || "image", attachmentPath); setError(""); } };
  const uploadAttachment = async () => {
    if (!selectedProfileId || !attachmentPath) return;
    setError("");
    try {
      const uploaded = await invoke<UploadResult>("worker_app_upload_comfy_file", { request: { profileId: selectedProfileId, filePath: attachmentPath } });
      if (uploaded.reference) setArgument(attachmentField || "image", uploaded.reference);
      else setError(`${t.uploadDone}: ${JSON.stringify(uploaded.result)}`);
    } catch (value) { setError(formatError(value)); }
  };
  const runWorkflow = async () => {
    if (!selectedProfileId || !selectedTool) return;
    let args: Record<string, unknown>;
    try { args = JSON.parse(argumentsText) as Record<string, unknown>; } catch { setError(t.invalidJson); return; }
    if (!args.workflowId && !args.workflow_id && !args.workflowPath && !args.workflow_path && !args.templateName && !args.template_name) { setError(t.workflowRequired); return; }
    const missing = (selectedSchema.required || []).filter(name => args[name] === undefined || args[name] === null || args[name] === "");
    if (missing.length) { setError(`${t.requiredFields}${missing.join(", ")}`); return; }
    const runId = `comfy-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    setBusy(true); setStartedAt(Date.now()); setElapsed(0); setRunResult(null); setActiveRunId(runId); setError("");
    try { setRunResult(await invoke<RunResult>("worker_app_run_comfy_workflow", { request: { profileId: selectedProfileId, toolName: selectedTool, runId, arguments: args } })); }
    catch (value) { setError(`${t.error}: ${formatError(value)}`); }
    finally { setBusy(false); setStartedAt(null); setActiveRunId(null); }
  };
  const cancelWorkflow = async () => { if (!activeRunId) return; try { await invoke("worker_app_cancel_comfy_workflow", { runId: activeRunId }); setError(t.cancelRequested); } catch (value) { setError(formatError(value)); } };
  useEffect(() => { if (!startedAt) return; const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 250); return () => window.clearInterval(timer); }, [startedAt]);

  return <section className="dashboard-grid" role="tabpanel" data-testid="worker-screen-workflows">
    <article className="panel wide">
      <div className="panel-heading inline"><div><p className="eyebrow">ComfyUI MCP</p><h2>{t.title}</h2></div><button type="button" className="secondary-button" onClick={() => probeProfile(selectedProfileId)} disabled={!selectedProfileId || busy}>{t.refresh}</button></div>
      <p className="subtle">{t.body}</p>
      {error ? <p className="connect-message error" role="alert">{error}</p> : null}
      <div className="settings-grid comfy-workbench-toolbar">
        <label>{t.profile}<select value={selectedProfileId || ""} onChange={event => selectProfile(event.target.value)}><option value="">—</option>{profiles.profiles.map(profile => <option key={profile.profileId} value={profile.profileId} disabled={!profile.enabled}>{profile.displayName}{!profile.enabled ? ` (${t.disabled})` : profile.profileId === profiles.activeProfileId ? ` (${t.selected})` : ""}</option>)}</select></label>
        <label>{t.tool}<select value={selectedTool} onChange={event => selectTool(event.target.value)} disabled={!runnableTools.length}><option value="">—</option>{runnableTools.map(tool => <option key={tool} value={tool}>{tool}</option>)}</select></label>
        <label>{t.workflow}{probe?.workflowIds.length ? <select value={selectedWorkflow} onChange={event => selectWorkflow(event.target.value)}><option value="">—</option>{probe.workflowIds.map(workflow => <option key={workflow} value={workflow}>{workflow}</option>)}</select> : <input value={selectedWorkflow} onChange={event => selectWorkflow(event.target.value)} placeholder={probe ? t.workflowPlaceholder : t.empty} disabled={!probe} />}</label>
      </div>
      {probe ? <div className="workspace-status-card comfy-probe-summary"><span>{t.protocol}: {probe.protocolVersion || "unknown"}</span><span>{t.capabilities}: {probe.capabilities.length ? probe.capabilities.join(", ") : "—"}</span><span>{probe.toolNames.length} {t.tools} · {probe.workflowIds.length} {t.workflows}</span></div> : null}
      {probe ? <div className="button-row"><button type="button" className="secondary-button" onClick={() => void inspectWorkflow()} disabled={busy || inspecting || !selectedProfileId || !selectedWorkflow}>{inspecting ? t.inspecting : t.inspectWorkflow}</button>{selectedWorkflow && !probe.toolNames.some(tool => ["get_template_schema", "get_workflow_schema", "workflow_schema", "inspect_workflow"].includes(tool)) ? <span className="field-help">{t.schemaToolMissing}</span> : null}</div> : null}
      {workflowSchema ? <article className="workspace-status-card comfy-result-card"><h3>{t.inspect}: {workflowSchema.workflowId}</h3><p className="field-help">{t.mcpTool}: {workflowSchema.toolName}</p><h4>{t.input}</h4><pre className="manual-command-text">{JSON.stringify(workflowSchema.inputSchema, null, 2)}</pre><h4>{t.output}</h4><pre className="manual-command-text">{JSON.stringify(workflowSchema.outputSchema, null, 2)}</pre><details><summary>{t.result}</summary><pre className="manual-command-text">{JSON.stringify(workflowSchema.result, null, 2)}</pre></details></article> : null}
      <div className="comfy-workbench-grid">
        <article className="workspace-status-card active"><h3>{t.schema}</h3>{selectedSchema.description ? <p className="subtle">{selectedSchema.description}</p> : null}{fields.length ? <div className="settings-grid comfy-input-grid">{fields.map(([name, schema]) => {
          const value = fieldValue(argumentsText, name); const label = <span>{schema.title || name}{selectedSchema.required?.includes(name) ? ` (${t.required})` : ""}</span>;
          if (schema.enum?.length) return <label key={name}>{label}<select value={String(value ?? schema.default ?? "")} onChange={event => setArgument(name, event.target.value)}><option value="">—</option>{schema.enum.map(option => <option key={String(option)} value={String(option)}>{String(option)}</option>)}</select></label>;
          if (schema.type === "boolean") return <label key={name} className="toggle-row"><input type="checkbox" checked={Boolean(value ?? schema.default)} onChange={event => setArgument(name, event.target.checked)} />{label}</label>;
          if (schema.type === "number" || schema.type === "integer") return <label key={name}>{label}<input type="number" value={value === undefined ? String(schema.default ?? "") : String(value)} onChange={event => setArgument(name, event.target.value === "" ? undefined : Number(event.target.value))} /></label>;
          return <label key={name}>{label}{isPromptField(name) ? <textarea rows={3} value={String(value ?? schema.default ?? "")} onChange={event => setArgument(name, event.target.value)} /> : <input value={String(value ?? schema.default ?? "")} onChange={event => setArgument(name, event.target.value)} />}</label>;
        })}</div> : <p className="subtle">{t.noFields}</p>}{selectedTool && schemas.get(selectedTool) ? <details className="comfy-schema-details"><summary>{t.inspect}: {selectedTool}</summary><pre className="manual-command-text">{schemas.get(selectedTool)}</pre></details> : null}</article>
        <article className="workspace-status-card"><h3>{t.prompt}</h3><textarea rows={5} placeholder={t.promptPlaceholder} value={String(fieldValue(argumentsText, fields.find(([name]) => /prompt|positive|text/i.test(name))?.[0] || "prompt") ?? "")} onChange={event => setArgument(fields.find(([name]) => /prompt|positive|text/i.test(name))?.[0] || "prompt", event.target.value)} /><h3 className="comfy-section-heading">{t.attachment}</h3><select value={attachmentField} onChange={event => setAttachmentField(event.target.value)}><option value="">{t.target}</option>{fields.filter(([name]) => isFileField(name)).map(([name]) => <option key={name} value={name}>{name}</option>)}<option value="image">image</option><option value="referenceImage">referenceImage</option><option value="startFrame">startFrame</option></select><div className="button-row"><button type="button" className="secondary-button" onClick={() => void chooseAttachment()} disabled={busy}>{t.chooseFile}</button><button type="button" className="secondary-button" onClick={attachPath} disabled={!attachmentPath || busy}>{t.attach}</button><button type="button" className="secondary-button" onClick={() => void uploadAttachment()} disabled={!attachmentPath || !selectedProfileId || busy}>{t.upload}</button></div><p className="field-help">{attachmentPath || t.noAttachment}</p><p className="field-help">{activeProfile?.transport === "local_stdio" ? t.localAttach : t.remoteAttach}</p></article>
      </div>
      <label className="comfy-json-editor">{t.advanced}<textarea rows={12} value={argumentsText} onChange={event => setArgumentsText(event.target.value)} spellCheck={false} /></label><p className="field-help">{t.outputHint}</p><div className="button-row"><button type="button" className="primary-button comfy-run-button" onClick={() => void runWorkflow()} disabled={busy || !selectedProfileId || !selectedTool}>{busy ? `${t.running} ${elapsed}s` : t.run}</button>{busy && activeRunId ? <button type="button" className="secondary-button" onClick={() => void cancelWorkflow()}>{t.cancel}</button> : null}</div>
      {runResult ? <article className="workspace-status-card comfy-result-card" role="status"><h3>{t.result}</h3><p className="subtle">{t.outputSaved} · {runResult.executionId || t.syncResponse}</p><p className="field-help">{runResult.outputDir}</p>{runResult.localFiles?.length ? <p className="field-help">{runResult.localFiles.join("\n")}</p> : null}<button type="button" className="secondary-button" onClick={() => void invoke("worker_app_open_file", { path: runResult.outputDir })}>{t.openOutput}</button><pre className="manual-command-text">{JSON.stringify(runResult.result, null, 2)}</pre></article> : null}
    </article>
  </section>;
}
