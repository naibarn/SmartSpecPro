import { toast } from "sonner";
import { Link } from "wouter";
import { DashboardCard, DashboardSectionHeader } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function WorkpackExceptionInbox() {
  const utils = trpc.useUtils();
  const { data: exceptions = [], isLoading } = trpc.workpack.exceptionInbox.useQuery();
  const resolveMutation = trpc.workpack.resolveException.useMutation({
    onSuccess: async () => {
      toast.success("Exception action applied");
      await Promise.all([
        utils.workpack.exceptionInbox.invalidate(),
        utils.workpack.list.invalidate(),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-sky-50/40">
      <div className="flex min-h-screen w-full flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-none flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild variant="ghost" size="sm" className="gap-1">
                <Link href="/dashboard">
                  <ArrowLeft className="h-4 w-4" />
                  Dashboard
                </Link>
              </Button>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">Exception Inbox</h1>
                <p className="max-w-3xl text-sm text-slate-600">
                  Resolve only the exceptions that truly need a person, while pushing the rest back into automation.
                </p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-none flex-col gap-6">
            <DashboardSectionHeader
              eyebrow="Exception Inbox"
              title="Boundary failures, drift, and clarifications in one queue"
              description="Resolve only the exceptions that truly need a person, while pushing the rest back into automation."
            />

            <DashboardCard title="Open Exceptions" description="Action the queue directly from here">
              {isLoading ? (
                <p className="text-sm text-slate-500">Loading exception inbox...</p>
              ) : exceptions.length === 0 ? (
                <p className="text-sm text-slate-500">No open exceptions right now.</p>
              ) : (
                <div className="space-y-3">
                  {exceptions.map((item: any) => (
                    <div key={item.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
                          <p className="mt-1 text-xs text-slate-500">
                            {item.reasonCategory} • {item.reasonCode} • {item.riskClass}
                          </p>
                        </div>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                          {item.workpackId}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{item.summary}</p>
                      <p className="mt-2 text-xs text-slate-500">Next action: {item.nextAction}</p>
                      <p className="mt-1 text-xs text-slate-500">Remediation: {item.remediationPointer}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(item.allowedActions ?? []).map((action: string) => (
                          <Button
                            key={`${item.id}-${action}`}
                            size="sm"
                            variant={action === "approve" || action === "retry" ? "default" : "outline"}
                            onClick={() => resolveMutation.mutate({
                              exceptionId: item.id,
                              action: action as "approve" | "reject" | "retry" | "downgrade_autonomy" | "remap_connector" | "regenerate_workpack" | "escalate_admin" | "mark_false_positive",
                            })}
                            disabled={resolveMutation.isPending}
                          >
                            {action.replace(/_/g, " ")}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </DashboardCard>
          </div>
        </main>
      </div>
    </div>
  );
}
