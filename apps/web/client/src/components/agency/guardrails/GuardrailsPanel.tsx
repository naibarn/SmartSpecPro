import { useState } from "react";
import { Plus, Shield } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { GuardrailCard } from "./GuardrailCard";
import { GuardrailForm } from "./GuardrailForm";
import { GuardrailTestPanel } from "./GuardrailTestPanel";
import type { Guardrail, GuardrailType } from "./types";

interface Props {
  agencyId: string;
  agentId?: string; // when opened from NodePropertyPanel
}

export function GuardrailsPanel({ agencyId, agentId }: Props) {
  const [tab, setTab] = useState<GuardrailType | "all">("all");
  const [editingGuardrail, setEditingGuardrail] = useState<Guardrail | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [testingGuardrail, setTestingGuardrail] = useState<Guardrail | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { data: guardrails = [], refetch } = (trpc as any).agency?.listGuardrails?.useQuery?.(
    { agencyId },
    { enabled: !!agencyId },
  ) ?? { data: [], refetch: () => {} };

  const deleteMutation = (trpc as any).agency?.deleteGuardrail?.useMutation?.({
    onSuccess: () => { toast.success("Guardrail deleted"); refetch(); },
    onError: (err: { message?: string }) => toast.error(err?.message ?? "Delete failed"),
  }) ?? { mutate: () => {} };

  const updateMutation = (trpc as any).agency?.updateGuardrail?.useMutation?.({
    onSuccess: () => refetch(),
    onError: (err: { message?: string }) => toast.error(err?.message ?? "Update failed"),
  }) ?? { mutate: () => {} };

  const assignMutation = (trpc as any).agency?.assignGuardrailToAgent?.useMutation?.({
    onSuccess: () => { toast.success("Guardrail assigned"); refetch(); },
    onError: (err: { message?: string }) => toast.error(err?.message ?? "Assign failed"),
  }) ?? { mutate: () => {} };

  const removeMutation = (trpc as any).agency?.removeGuardrailFromAgent?.useMutation?.({
    onSuccess: () => { toast.success("Guardrail unassigned"); refetch(); },
    onError: (err: { message?: string }) => toast.error(err?.message ?? "Unassign failed"),
  }) ?? { mutate: () => {} };

  const filtered = (guardrails as Guardrail[]).filter((g) =>
    tab === "all" ? true : g.type === tab,
  );

  if (showForm || editingGuardrail) {
    return (
      <div className="p-3">
        <GuardrailForm
          agencyId={agencyId}
          guardrail={editingGuardrail ?? undefined}
          onClose={() => { setShowForm(false); setEditingGuardrail(null); }}
          onSaved={() => refetch()}
        />
      </div>
    );
  }

  if (testingGuardrail) {
    return (
      <div className="space-y-3 p-3">
        <button
          onClick={() => setTestingGuardrail(null)}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Back to list
        </button>
        <GuardrailTestPanel guardrail={testingGuardrail} />
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Guardrails</span>
          {guardrails.length > 0 && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">
              {guardrails.length}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-md bg-muted p-0.5">
        {(["all", "input", "output"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
              tab === t
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <Shield className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">No guardrails</p>
          <p className="text-xs text-muted-foreground">Add guardrails to validate agent inputs and outputs.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((g: Guardrail) => (
            <div key={g.id}>
              <GuardrailCard
                guardrail={g}
                onEdit={() => setEditingGuardrail(g)}
                onDelete={() => setDeleteConfirm(g.id)}
                onToggleEnabled={(enabled) =>
                  updateMutation.mutate({ guardrailId: g.id, isEnabled: enabled })
                }
                assigned={agentId ? g.assignedAgentIds?.includes(agentId) : undefined}
                onToggleAssign={agentId ? (assign) => {
                  if (assign) {
                    assignMutation.mutate({ guardrailId: g.id, agentId });
                  } else {
                    removeMutation.mutate({ guardrailId: g.id, agentId });
                  }
                } : undefined}
              />
              {deleteConfirm === g.id && (
                <div className="mt-1 flex items-center gap-2 rounded border border-red-200 bg-red-50 p-2 text-xs dark:border-red-800 dark:bg-red-900/20">
                  <span>Delete "{g.name}"?</span>
                  <button
                    onClick={() => { deleteMutation.mutate({ guardrailId: g.id }); setDeleteConfirm(null); }}
                    className="rounded bg-red-600 px-2 py-0.5 text-white hover:bg-red-700"
                  >
                    Delete
                  </button>
                  <button onClick={() => setDeleteConfirm(null)} className="text-muted-foreground hover:text-foreground">
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add button */}
      <button
        onClick={() => setShowForm(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed py-2 text-sm text-muted-foreground hover:border-primary hover:text-primary"
      >
        <Plus className="h-3.5 w-3.5" />
        Add Guardrail
      </button>
    </div>
  );
}
