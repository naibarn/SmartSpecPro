import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { cp } from "../services/controlPlane";

type Task = {
  id: string;
  title: string;
  status: string;
  originatingSpec?: string | null;
};

export function FactoryPanel() {
  const [projectName, setProjectName] = useState("My SmartSpec Project");
  const [projectId, setProjectId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [tasksRaw, setTasksRaw] = useState<any[]>([]);
  const [gates, setGates] = useState<any | null>(null);

  const tasks: Task[] = useMemo(() => tasksRaw as any, [tasksRaw]);

  const load = async () => {
    if (!sessionId) return;
    try {
      setError(null);
      const [t, g] = await Promise.all([cp.listTasks(sessionId), cp.evaluateGates(sessionId)]);
      setTasksRaw((t as any).tasks ?? []);
      setGates((g as any).evaluation ?? null);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  };

  useEffect(() => {
    if (!sessionId) return;
    load();
    const id = window.setInterval(load, 5000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">SaaS Factory</h2>
        <p className="text-sm text-gray-600">Desktop wrapper for Control Plane session + task registry + gates.</p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>1) Project & Session</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <div className="text-sm font-medium text-gray-700">Project name</div>
              <input
                className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={async () => {
                  try {
                    setError(null);
                    const r: any = await cp.createProject(projectName);
                    const id = r?.project?.id ?? r?.id ?? r?.projectId;
                    if (id) setProjectId(id);
                  } catch (e: any) {
                    setError(e?.message ?? String(e));
                  }
                }}
              >
                Create project
              </Button>
              <input
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 bg-white"
                placeholder="projectId"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              />
            </div>

            <div className="flex gap-2">
              <Button
                disabled={!projectId}
                onClick={async () => {
                  try {
                    setError(null);
                    const r: any = await cp.createSession(projectId, "New Session");
                    const id = r?.session?.id ?? r?.id ?? r?.sessionId;
                    if (id) setSessionId(id);
                  } catch (e: any) {
                    setError(e?.message ?? String(e));
                  }
                }}
              >
                Create session
              </Button>
              <input
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 bg-white"
                placeholder="sessionId"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
              />
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
              <div><span className="font-medium">projectId:</span> {projectId || "—"}</div>
              <div><span className="font-medium">sessionId:</span> {sessionId || "—"}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2) Gates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!sessionId ? (
              <div className="text-sm text-gray-600">Create a session first.</div>
            ) : !gates ? (
              <div className="text-sm text-gray-600">No evaluation yet.</div>
            ) : (
              <>
                <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-3">
                  <div>
                    <div className="font-medium">Overall</div>
                    <div className="text-xs text-gray-600">{gates.evaluatedAt}</div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full border ${gates.ok ? "bg-green-50 text-green-700 border-green-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                    {gates.ok ? "PASS" : "NOT READY"}
                  </span>
                </div>
                <div className="space-y-2">
                  {(gates.checks ?? []).map((c: any) => (
                    <div key={c.name} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-3">
                      <div className="font-medium">{c.name}</div>
                      <span className={`text-xs px-2 py-1 rounded-full border ${c.ok ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                        {c.ok ? "OK" : "FAIL"}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className="flex gap-2">
              <Button variant="outline" disabled={!sessionId} onClick={load}>Refresh</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>3) Task Registry</CardTitle>
        </CardHeader>
        <CardContent>
          {!sessionId ? (
            <div className="text-sm text-gray-600">Create a session first.</div>
          ) : tasks.length === 0 ? (
            <div className="text-sm text-gray-600">No tasks yet.</div>
          ) : (
            <div className="space-y-2">
              {tasks.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-3">
                  <div>
                    <div className="font-medium text-gray-900">{t.title}</div>
                    {t.originatingSpec && <div className="text-xs text-gray-600">Spec: {t.originatingSpec}</div>}
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-gray-100 border border-gray-200 text-gray-700">
                    {t.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
