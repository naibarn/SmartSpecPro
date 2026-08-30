import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useWorkerAppContext } from "../app/workerContext";

type Policy = {
  workerId?: string;
  status?: string;
  runtimeType?: string;
  fileScopeMode?: string;
  capabilities?: unknown;
  policy?: Record<string, unknown>;
  authorization?: { effectiveScopes?: string[]; checkedAt?: string };
};

function flattenLabels(value: unknown): string[] {
  const result: string[] = [];
  const visit = (current: unknown) => {
    if (typeof current === "string" && current.length <= 120 && current.trim()) result.push(current);
    else if (Array.isArray(current)) current.forEach(visit);
    else if (current && typeof current === "object") Object.values(current).forEach(visit);
  };
  visit(value);
  return [...new Set(result)].slice(0, 100);
}

export function WorkerPermissionsPanel() {
  const { locale } = useWorkerAppContext();
  const th = locale === "th";
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [error, setError] = useState("");
  const load = () => void invoke<Policy>("worker_app_get_worker_policy").then(value => { setPolicy(value); setError(""); }).catch(value => { setPolicy(null); setError(String(value)); });
  useEffect(() => { load(); }, []);
  const scopes = policy?.authorization?.effectiveScopes || [];
  const capabilityLabels = flattenLabels(policy?.capabilities);
  return <article className="panel wide" data-testid="worker-permissions-panel">
    <div className="panel-heading"><div><p className="eyebrow">{th ? "สิทธิ์ของ Worker" : "Worker permissions"}</p><h3>{th ? "สิทธิ์ที่ connection นี้ใช้งานได้" : "Permissions available to this connection"}</h3></div><button type="button" className="secondary-button" onClick={load}>{th ? "ตรวจสอบใหม่" : "Refresh"}</button></div>
    <p className="subtle">{th ? "รายการนี้อ่านจาก token และ policy ของ Server จริง สิทธิ์ที่ถูกถอนจะใช้สั่งงานไม่ได้ทันที การเพิ่มสิทธิ์ต้องทำผ่านการเชื่อมต่อ/อนุมัติใหม่" : "This list comes from the Server token and policy. Revoked scopes stop working immediately; adding scopes requires browser reauthorization."}</p>
    {error ? <p className="connect-message error" role="alert">{th ? `อ่านสิทธิ์ไม่สำเร็จ: ${error}` : `Unable to read permissions: ${error}`}</p> : null}
    {policy ? <><div className="workspace-status-card"><span>{th ? "สถานะ" : "Status"}: {policy.status || "unknown"}</span><span>{th ? "Runtime" : "Runtime"}: {policy.runtimeType || "unknown"}</span><span>{th ? "ขอบเขตไฟล์" : "File scope"}: {policy.fileScopeMode || "unknown"}</span><span>{th ? "ตรวจเมื่อ" : "Checked"}: {policy.authorization?.checkedAt ? new Date(policy.authorization.checkedAt).toLocaleString(th ? "th-TH" : "en-US") : "—"}</span></div><div className="permission-list" aria-label={th ? "สิทธิ์ที่อนุญาต" : "Granted permissions"}>{scopes.length ? scopes.map(scope => <label key={scope}><input type="checkbox" checked readOnly />{scope}</label>) : <span>{th ? "ไม่พบ scope ที่ token นี้อนุญาต" : "No scopes are granted to this token"}</span>}</div>{capabilityLabels.length ? <details className="workspace-status-card"><summary>{th ? "ความสามารถของ Worker" : "Worker capabilities"}</summary><span>{capabilityLabels.join(", ")}</span></details> : null}</> : null}
  </article>;
}
