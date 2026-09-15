import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const environments = ["dev-mini", "staging", "legacy-prod", "cutover", "production"] as const;

export default function AdminPlatformOperations() {
  const [environment, setEnvironment] = useState<(typeof environments)[number]>("dev-mini");
  const [reason, setReason] = useState("");
  const [releaseIdentity, setReleaseIdentity] = useState("");
  const [promotionId, setPromotionId] = useState("");
  const scope = "global";
  const overviewQuery = trpc.platformOperations.getOverview.useQuery({ environment, scope }, { refetchInterval: 10_000 });
  const overview = overviewQuery.data;
  const actionMutation = trpc.platformOperations.requestAction.useMutation({
    onSuccess: data => { toast.success(data.accepted ? `Action recorded: ${data.lifecycle}` : `Blocked: ${data.errorCode}`); overviewQuery.refetch(); },
    onError: error => toast.error(error.message),
  });
  const controlVersion = overview?.control?.controlVersion ?? 0;
  const targetIdentity = overview?.control?.targetIdentity;
  const action = (name: "prepare" | "validate" | "requestMaintenance" | "activate" | "cancelActivation" | "requestRollback" | "separateSync") => {
    actionMutation.mutate({ environment, scope, action: name, expectedControlVersion: controlVersion, actionKey: `ui:${name}:${environment}:${Date.now()}`, reason: reason.trim() || `Admin ${name}`, targetIdentity, releaseIdentity: releaseIdentity.trim() || undefined, promotionId: promotionId.trim() || undefined });
  };
  const passed = useMemo(() => overview?.gates.filter(gate => gate.passed).length ?? 0, [overview]);

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <section className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <section>
            <p className="text-sm font-medium text-blue-600">Feature 188</p>
            <h1 className="text-2xl font-semibold tracking-tight">Platform Operations</h1>
            <p className="mt-1 text-sm text-muted-foreground">Evidence-gated cutover control. Unknown evidence remains blocked.</p>
          </section>
          <Button variant="outline" onClick={() => overviewQuery.refetch()} disabled={overviewQuery.isFetching}>
            {overviewQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Refresh
          </Button>
        </header>

        <Card>
          <CardContent className="grid gap-4 p-4 md:grid-cols-3">
            <section>
              <Label htmlFor="platform-environment">Environment</Label>
              <select id="platform-environment" className="mt-2 flex h-10 w-full rounded-md border bg-background px-3 text-sm" value={environment} onChange={event => setEnvironment(event.target.value as (typeof environments)[number])}>
                {environments.map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            </section>
            <section>
              <Label htmlFor="platform-reason">Operator reason</Label>
              <Input id="platform-reason" className="mt-2" value={reason} onChange={event => setReason(event.target.value)} placeholder="Required reason for an action" maxLength={500} />
            </section>
            <section>
              <Label htmlFor="platform-release">Release identity</Label>
              <Input id="platform-release" className="mt-2" value={releaseIdentity} onChange={event => setReleaseIdentity(event.target.value)} placeholder="Required for activation" maxLength={255} />
            </section>
            <section>
              <Label htmlFor="platform-promotion">Promotion ID</Label>
              <Input id="platform-promotion" className="mt-2" value={promotionId} onChange={event => setPromotionId(event.target.value)} placeholder="Required for activation" maxLength={36} />
            </section>
            <section className="rounded-md border bg-slate-50 p-3 text-sm">
              <p className="text-muted-foreground">Lifecycle</p>
              <p className="mt-1 font-semibold">{overview?.control?.lifecycle ?? "preparing (not initialized)"}</p>
              <p className="mt-1 text-xs text-muted-foreground">Control version: {controlVersion}</p>
            </section>
          </CardContent>
        </Card>

        {overviewQuery.isError && <Card className="border-red-200"><CardContent className="flex items-center gap-2 p-4 text-sm text-red-700"><ShieldAlert className="h-4 w-4" /> Unable to read platform evidence.</CardContent></Card>}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card><CardHeader><CardTitle className="text-sm">Source</CardTitle></CardHeader><CardContent className="font-mono text-sm">{overview?.control?.sourceIdentity ?? "not declared"}</CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">Target</CardTitle></CardHeader><CardContent className="font-mono text-sm">{targetIdentity ?? "not declared"}</CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">Gate evidence</CardTitle></CardHeader><CardContent className="text-sm">{passed}/{overview?.gates.length ?? 0} passed</CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">Promotion</CardTitle></CardHeader><CardContent className="text-sm">{overview?.promotion?.phase ?? "not started"}</CardContent></Card>
        </section>

        <Card>
          <CardHeader><CardTitle>Readiness gates</CardTitle></CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-2">
            {(overview?.gates ?? []).map(gate => <section key={gate.gateKey} className="flex items-start justify-between gap-3 rounded-md border p-3"><span><p className="text-sm font-medium">{gate.gateKey}</p><p className="text-xs text-muted-foreground">{gate.safeReason}</p></span><Badge variant={gate.passed ? "default" : "destructive"}>{gate.passed ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <AlertTriangle className="mr-1 h-3 w-3" />}{gate.status}</Badge></section>)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Guarded actions</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {(["prepare", "validate", "requestMaintenance", "activate", "cancelActivation", "requestRollback", "separateSync"] as const).map(name => <Button key={name} variant={name === "activate" ? "default" : "outline"} disabled={actionMutation.isPending} onClick={() => action(name)}>{name}</Button>)}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
