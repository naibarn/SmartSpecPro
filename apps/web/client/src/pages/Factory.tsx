import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Factory as FactoryIcon, Play, ShieldCheck, FileSearch, ExternalLink, Loader2, ChevronLeft } from "lucide-react";
import { useLocation } from "wouter";

export default function Factory() {
  const [, setLocation] = useLocation();
  const [projectName, setProjectName] = useState("Demo Project");
  const [projectId, setProjectId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [applyToken, setApplyToken] = useState("");
  const [artifactKey, setArtifactKey] = useState("");

  const createProject = trpc.factory.createProject.useMutation();
  const createSession = trpc.factory.createSession.useMutation();
  const evalGates = trpc.factory.evaluateGates.useQuery(
    { projectId, sessionId },
    { enabled: Boolean(projectId && sessionId), refetchInterval: 5000 }
  );
  const tasks = trpc.factory.listTasks.useQuery(
    { projectId, sessionId },
    { enabled: Boolean(projectId && sessionId), refetchInterval: 5000 }
  );
  const reports = trpc.factory.listReports.useQuery(
    { projectId, sessionId },
    { enabled: Boolean(projectId && sessionId), refetchInterval: 5000 }
  );

  const requestApproval = trpc.factory.requestApplyApproval.useMutation();
  const runOrch = trpc.factory.runOrchestrator.useMutation();
  const presignGet = trpc.factory.presignGet.useMutation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20 px-4 sm:px-6 lg:px-8 py-8">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setLocation('/dashboard')}
        className="text-gray-600 mb-4"
      >
        <ChevronLeft className="w-5 h-5 mr-1" />
        Back to Dashboard
      </Button>
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <FactoryIcon className="w-5 h-5 text-primary" />
          </div>
          SaaS Factory
        </h1>
        <p className="text-muted-foreground mt-2">
          Build and deploy SaaS applications from specifications
        </p>
      </div>

      <div className="space-y-6 max-w-4xl">

      {/* Step 1: Project / Session */}
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Badge variant="outline" className="text-xs">1</Badge>
            Create Project / Session
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <Input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Project name"
              className="max-w-xs"
            />
            <Button
              onClick={async () => {
                const res: any = await createProject.mutateAsync({ name: projectName });
                setProjectId(res.project?.id ?? res.projectId ?? res.id ?? "");
              }}
              disabled={createProject.isPending}
              className="gap-1.5"
            >
              {createProject.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Create Project
            </Button>
            <Button
              variant="secondary"
              disabled={!projectId || createSession.isPending}
              onClick={async () => {
                const res: any = await createSession.mutateAsync({ projectId, name: "Session" });
                setSessionId(res.session?.id ?? res.id ?? "");
              }}
            >
              {createSession.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Create Session
            </Button>
          </div>
          <div className="flex gap-4 text-sm font-mono text-muted-foreground">
            <span>Project: <span className="text-foreground">{projectId || "—"}</span></span>
            <span>Session: <span className="text-foreground">{sessionId || "—"}</span></span>
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Approval */}
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Badge variant="outline" className="text-xs">2</Badge>
            <ShieldCheck className="w-4 h-4" />
            Approval for Apply
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            variant="secondary"
            disabled={!projectId || !sessionId || requestApproval.isPending}
            onClick={async () => {
              const res: any = await requestApproval.mutateAsync({ projectId, sessionId, reason: "approve apply" });
              setApplyToken(res.token);
            }}
            className="gap-1.5"
          >
            <ShieldCheck className="w-4 h-4" />
            Request Apply Token
          </Button>
          <textarea
            value={applyToken}
            readOnly
            rows={2}
            className="w-full px-3 py-2 rounded-lg border bg-muted text-sm font-mono resize-none"
          />
          <p className="text-xs text-muted-foreground">This token is single-use and may expire.</p>
        </CardContent>
      </Card>

      {/* Step 3: Run Orchestrator */}
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Badge variant="outline" className="text-xs">3</Badge>
            <Play className="w-4 h-4" />
            Run Orchestrator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <Input
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
              placeholder="Workspace path (server can access)"
              className="min-w-[360px] flex-1"
            />
            <Button
              variant="secondary"
              disabled={!projectId || !sessionId || !workspace || runOrch.isPending}
              onClick={async () => {
                await runOrch.mutateAsync({ projectId, sessionId, workspace, apply: false, maxIterations: 4 });
              }}
            >
              Run (plan-only)
            </Button>
            <Button
              disabled={!projectId || !sessionId || !workspace || !applyToken || runOrch.isPending}
              onClick={async () => {
                await runOrch.mutateAsync({
                  projectId, sessionId, workspace, apply: true,
                  applyApprovalToken: applyToken, maxIterations: 4,
                });
                setApplyToken("");
              }}
              className="gap-1.5"
            >
              {runOrch.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Run (apply)
            </Button>
          </div>
          {runOrch.error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive font-mono">
              {String(runOrch.error.message)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 4: Gates / Tasks / Reports */}
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Badge variant="outline" className="text-xs">4</Badge>
            <FileSearch className="w-4 h-4" />
            Gates / Tasks / Reports
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="text-sm font-medium mb-1">Gates</h4>
            <pre className="bg-muted rounded-lg p-3 text-xs font-mono overflow-auto max-h-48">
              {JSON.stringify(evalGates.data ?? {}, null, 2)}
            </pre>
          </div>
          <div>
            <h4 className="text-sm font-medium mb-1">Tasks</h4>
            <pre className="bg-muted rounded-lg p-3 text-xs font-mono overflow-auto max-h-48">
              {JSON.stringify(tasks.data ?? {}, null, 2)}
            </pre>
          </div>
          <div>
            <h4 className="text-sm font-medium mb-1">Reports</h4>
            <pre className="bg-muted rounded-lg p-3 text-xs font-mono overflow-auto max-h-48">
              {JSON.stringify(reports.data ?? {}, null, 2)}
            </pre>
          </div>
        </CardContent>
      </Card>

      {/* Step 5: Artifact */}
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Badge variant="outline" className="text-xs">5</Badge>
            <ExternalLink className="w-4 h-4" />
            Open Artifact (presigned GET)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={artifactKey}
              onChange={(e) => setArtifactKey(e.target.value)}
              placeholder="artifact key"
              className="flex-1"
            />
            <Button
              disabled={!projectId || !sessionId || !artifactKey}
              onClick={async () => {
                const res: any = await presignGet.mutateAsync({ projectId, sessionId, key: artifactKey });
                window.open(res.url, "_blank", "noopener,noreferrer");
              }}
              className="gap-1.5"
            >
              <ExternalLink className="w-4 h-4" />
              Open
            </Button>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
