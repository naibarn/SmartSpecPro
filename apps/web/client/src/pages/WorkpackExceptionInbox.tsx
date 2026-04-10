import { toast } from "sonner";
import { DashboardCard, DashboardSectionHeader } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
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
    <div className="space-y-6 p-4 sm:p-6">
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
  );
}
