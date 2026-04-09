import { useState } from "react";
import { useLocation } from "wouter";

import { trpc } from "@/lib/trpc";
import { LocaleToggle } from "@/components/LocaleToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardCard } from "@/components/dashboard";
import {
  Factory as FactoryIcon,
  Play,
  ShieldCheck,
  FileSearch,
  ExternalLink,
  Loader2,
  ChevronLeft,
} from "lucide-react";

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/dashboard")}
          className="text-gray-600"
        >
          <ChevronLeft className="mr-1 h-5 w-5" />
          Back to Dashboard
        </Button>
        <LocaleToggle className="shrink-0" />
      </div>

      <div className="mb-8">
        <h1 className="flex items-center gap-3 text-3xl font-bold">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <FactoryIcon className="h-5 w-5 text-primary" />
          </div>
          SaaS Factory
        </h1>
        <p className="mt-2 text-muted-foreground">
          Build and deploy SaaS applications from specifications
        </p>
      </div>

      <div className="max-w-4xl space-y-6">
        <DashboardCard
          className="glass-card"
          title={
            <span className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                1
              </Badge>
              Create Project / Session
            </span>
          }
          titleClassName="text-base font-semibold text-slate-900"
          bodyClassName="space-y-3"
        >
          <div className="flex flex-wrap gap-2">
            <Input
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              placeholder="Project name"
              className="max-w-xs"
            />
            <Button
              onClick={async () => {
                const res: any = await createProject.mutateAsync({
                  name: projectName,
                });
                setProjectId(res.project?.id ?? res.projectId ?? res.id ?? "");
              }}
              disabled={createProject.isPending}
              className="gap-1.5"
            >
              {createProject.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Create Project
            </Button>
            <Button
              variant="secondary"
              disabled={!projectId || createSession.isPending}
              onClick={async () => {
                const res: any = await createSession.mutateAsync({
                  projectId,
                  name: "Session",
                });
                setSessionId(res.session?.id ?? res.id ?? "");
              }}
            >
              {createSession.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Create Session
            </Button>
          </div>
          <div className="flex gap-4 text-sm font-mono text-muted-foreground">
            <span>
              Project:{" "}
              <span className="text-foreground">{projectId || "—"}</span>
            </span>
            <span>
              Session:{" "}
              <span className="text-foreground">{sessionId || "—"}</span>
            </span>
          </div>
        </DashboardCard>

        <DashboardCard
          className="glass-card"
          title={
            <span className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                2
              </Badge>
              <ShieldCheck className="h-4 w-4" />
              Approval for Apply
            </span>
          }
          titleClassName="text-base font-semibold text-slate-900"
          bodyClassName="space-y-3"
        >
          <Button
            variant="secondary"
            disabled={!projectId || !sessionId || requestApproval.isPending}
            onClick={async () => {
              const res: any = await requestApproval.mutateAsync({
                projectId,
                sessionId,
                reason: "approve apply",
              });
              setApplyToken(res.token);
            }}
            className="gap-1.5"
          >
            <ShieldCheck className="h-4 w-4" />
            Request Apply Token
          </Button>
          <textarea
            value={applyToken}
            readOnly
            rows={2}
            className="w-full resize-none rounded-lg border bg-muted px-3 py-2 font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            This token is single-use and may expire.
          </p>
        </DashboardCard>

        <DashboardCard
          className="glass-card"
          title={
            <span className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                3
              </Badge>
              <Play className="h-4 w-4" />
              Run Orchestrator
            </span>
          }
          titleClassName="text-base font-semibold text-slate-900"
          bodyClassName="space-y-3"
        >
          <div className="flex flex-wrap gap-2">
            <Input
              value={workspace}
              onChange={e => setWorkspace(e.target.value)}
              placeholder="Workspace path (server can access)"
              className="min-w-[360px] flex-1"
            />
            <Button
              variant="secondary"
              disabled={
                !projectId || !sessionId || !workspace || runOrch.isPending
              }
              onClick={async () => {
                await runOrch.mutateAsync({
                  projectId,
                  sessionId,
                  workspace,
                  apply: false,
                  maxIterations: 4,
                });
              }}
            >
              Run (plan-only)
            </Button>
            <Button
              disabled={
                !projectId ||
                !sessionId ||
                !workspace ||
                !applyToken ||
                runOrch.isPending
              }
              onClick={async () => {
                await runOrch.mutateAsync({
                  projectId,
                  sessionId,
                  workspace,
                  apply: true,
                  applyApprovalToken: applyToken,
                  maxIterations: 4,
                });
                setApplyToken("");
              }}
              className="gap-1.5"
            >
              {runOrch.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Run (apply)
            </Button>
          </div>
          {runOrch.error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 font-mono text-sm text-destructive">
              {String(runOrch.error.message)}
            </div>
          )}
        </DashboardCard>

        <DashboardCard
          className="glass-card"
          title={
            <span className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                4
              </Badge>
              <FileSearch className="h-4 w-4" />
              Gates / Tasks / Reports
            </span>
          }
          titleClassName="text-base font-semibold text-slate-900"
          bodyClassName="space-y-4"
        >
          <div>
            <h4 className="mb-1 text-sm font-medium">Gates</h4>
            <pre className="max-h-48 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs">
              {JSON.stringify(evalGates.data ?? {}, null, 2)}
            </pre>
          </div>
          <div>
            <h4 className="mb-1 text-sm font-medium">Tasks</h4>
            <pre className="max-h-48 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs">
              {JSON.stringify(tasks.data ?? {}, null, 2)}
            </pre>
          </div>
          <div>
            <h4 className="mb-1 text-sm font-medium">Reports</h4>
            <pre className="max-h-48 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs">
              {JSON.stringify(reports.data ?? {}, null, 2)}
            </pre>
          </div>
        </DashboardCard>

        <DashboardCard
          className="glass-card"
          title={
            <span className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                5
              </Badge>
              <ExternalLink className="h-4 w-4" />
              Open Artifact (presigned GET)
            </span>
          }
          titleClassName="text-base font-semibold text-slate-900"
          bodyClassName="space-y-3"
        >
          <div className="flex gap-2">
            <Input
              value={artifactKey}
              onChange={e => setArtifactKey(e.target.value)}
              placeholder="artifact key"
              className="flex-1"
            />
            <Button
              disabled={!projectId || !sessionId || !artifactKey}
              onClick={async () => {
                const res: any = await presignGet.mutateAsync({
                  projectId,
                  sessionId,
                  key: artifactKey,
                });
                window.open(res.url, "_blank", "noopener,noreferrer");
              }}
              className="gap-1.5"
            >
              <ExternalLink className="h-4 w-4" />
              Open
            </Button>
          </div>
        </DashboardCard>
      </div>
    </div>
  );
}
