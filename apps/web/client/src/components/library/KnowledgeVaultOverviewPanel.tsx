import {
  GitBranch,
  LayoutGrid,
  Link2,
  Package,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  type KnowledgeVaultMode,
  type KnowledgeVaultNavigationMode,
} from "@/lib/documentManagementUi";

type KnowledgeVaultOverviewPanelProps = {
  pending: boolean;
  enabled: boolean;
  activeMode: KnowledgeVaultMode;
  blockedReasons: string[];
  modes: KnowledgeVaultNavigationMode[];
  quickSwitcherEnabled: boolean;
  releaseGateStatus?: string | null;
  selectedMarkdownTitle?: string | null;
  compact?: boolean;
  onChangeMode: (mode: KnowledgeVaultMode) => void;
  onOpenQuickSwitch: () => void;
};

function formatPolicyReason(reason: string): string {
  switch (reason) {
    case "knowledge_vault_disabled":
      return "Knowledge Vault is not enabled for this workspace yet.";
    case "tenant_not_allowlisted":
      return "This tenant is still waiting for staged rollout access.";
    case "surface_env_disabled":
      return "Some knowledge surfaces are still disabled in rollout config.";
    case "release_gate_not_ready":
      return "Protected knowledge surfaces are still behind the release gate.";
    default:
      return reason.replaceAll("_", " ");
  }
}

function statusConfig(props: {
  pending: boolean;
  enabled: boolean;
  blockedReasons: string[];
}) {
  if (props.pending) {
    return {
      label: "Loading",
      className: "border-slate-200 bg-white text-slate-700",
      Icon: Sparkles,
    };
  }
  if (!props.enabled) {
    return {
      label: "Locked",
      className: "border-rose-200 bg-rose-50 text-rose-700",
      Icon: ShieldAlert,
    };
  }
  if (props.blockedReasons.length > 0) {
    return {
      label: "Limited",
      className: "border-amber-200 bg-amber-50 text-amber-700",
      Icon: ShieldAlert,
    };
  }
  return {
    label: "Ready",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    Icon: ShieldCheck,
  };
}

function actionCardTone(enabled: boolean): string {
  return enabled
    ? "border-sky-200 bg-white hover:border-sky-300 hover:bg-sky-50"
    : "border-slate-200 bg-slate-50 text-slate-400";
}

function actionTextTone(enabled: boolean): string {
  return enabled ? "text-slate-900" : "text-slate-400";
}

function actionDescriptionTone(enabled: boolean): string {
  return enabled ? "text-slate-500" : "text-slate-400";
}

export function KnowledgeVaultOverviewPanel(
  props: KnowledgeVaultOverviewPanelProps
) {
  const status = statusConfig(props);
  const reasons = Array.from(new Set(props.blockedReasons)).map(
    formatPolicyReason
  );
  const modeMap = new Map(props.modes.map(mode => [mode.mode, mode]));
  const relatedMode = modeMap.get("related");
  const graphMode = modeMap.get("graph");
  const memoryPackMode = modeMap.get("memory_packs");
  const canvasMode = modeMap.get("canvas");
  const compact = props.compact ?? false;

  return (
    <div
      className={`mb-3 rounded-3xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-cyan-50/70 shadow-sm ${compact ? "p-3" : "p-4"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700">
            Knowledge Vault
          </div>
          <h3
            className={`mt-1 font-semibold text-slate-900 ${compact ? "text-sm" : "text-base"}`}
          >
            Turn markdown notes into connected working knowledge
          </h3>
          <p
            className={`mt-1 leading-6 text-slate-600 ${compact ? "text-xs" : "text-sm"}`}
          >
            Navigate notes, inspect safe relationships, and prepare reviewed
            memory packs without auto-injecting extra context into runtime.
          </p>
        </div>

        <Badge
          className={`rounded-full border px-3 py-1 text-xs ${status.className}`}
        >
          <status.Icon className="mr-1.5 h-3.5 w-3.5" />
          {status.label}
        </Badge>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {props.releaseGateStatus ? (
          <Badge variant="outline" className="rounded-full bg-white/80">
            release gate: {props.releaseGateStatus}
          </Badge>
        ) : null}
        <Badge variant="outline" className="rounded-full bg-white/80">
          active mode:{" "}
          {modeMap.get(props.activeMode)?.label ?? props.activeMode}
        </Badge>
        {props.selectedMarkdownTitle ? (
          <Badge
            variant="outline"
            className="max-w-full rounded-full bg-white/80"
            title={props.selectedMarkdownTitle}
          >
            <span className="truncate">
              current note: {props.selectedMarkdownTitle}
            </span>
          </Badge>
        ) : null}
      </div>

      <div
        className={`mt-4 grid gap-3 ${compact ? "grid-cols-1" : "sm:grid-cols-2 xl:grid-cols-3"}`}
      >
        <button
          type="button"
          className={`rounded-2xl border px-3 py-3 text-left transition-colors ${actionCardTone(props.quickSwitcherEnabled)}`}
          disabled={!props.quickSwitcherEnabled}
          onClick={props.onOpenQuickSwitch}
        >
          <div
            className={`flex items-center gap-2 text-sm font-semibold ${actionTextTone(props.quickSwitcherEnabled)}`}
          >
            <Search className="h-4 w-4 text-sky-600" />
            Quick switch
          </div>
          <div
            className={`mt-1 text-xs leading-5 ${actionDescriptionTone(props.quickSwitcherEnabled)}`}
          >
            Jump by title, alias, or logical path. Shortcut: Ctrl/Cmd+K
          </div>
        </button>

        <button
          type="button"
          className={`rounded-2xl border px-3 py-3 text-left transition-colors ${actionCardTone(Boolean(relatedMode?.enabled))}`}
          disabled={!relatedMode?.enabled}
          onClick={() => props.onChangeMode("related")}
        >
          <div
            className={`flex items-center gap-2 text-sm font-semibold ${actionTextTone(Boolean(relatedMode?.enabled))}`}
          >
            <Link2 className="h-4 w-4 text-sky-600" />
            Related notes
          </div>
          <div
            className={`mt-1 text-xs leading-5 ${actionDescriptionTone(Boolean(relatedMode?.enabled))}`}
          >
            Inspect backlinks, outgoing links, shared tags, hybrid/vector
            related notes, and local context.
          </div>
        </button>

        <button
          type="button"
          className={`rounded-2xl border px-3 py-3 text-left transition-colors ${actionCardTone(Boolean(graphMode?.enabled))}`}
          disabled={!graphMode?.enabled}
          onClick={() => props.onChangeMode("graph")}
        >
          <div
            className={`flex items-center gap-2 text-sm font-semibold ${actionTextTone(Boolean(graphMode?.enabled))}`}
          >
            <GitBranch className="h-4 w-4 text-sky-600" />
            Graph explorer
          </div>
          <div
            className={`mt-1 text-xs leading-5 ${actionDescriptionTone(Boolean(graphMode?.enabled))}`}
          >
            Inspect node relationships, filter connection signals, and open
            linked notes from the graph itself.
          </div>
        </button>

        <button
          type="button"
          className={`rounded-2xl border px-3 py-3 text-left transition-colors ${actionCardTone(Boolean(memoryPackMode?.enabled))}`}
          disabled={!memoryPackMode?.enabled}
          onClick={() => props.onChangeMode("memory_packs")}
        >
          <div
            className={`flex items-center gap-2 text-sm font-semibold ${actionTextTone(Boolean(memoryPackMode?.enabled))}`}
          >
            <Package className="h-4 w-4 text-sky-600" />
            Memory packs
          </div>
          <div
            className={`mt-1 text-xs leading-5 ${actionDescriptionTone(Boolean(memoryPackMode?.enabled))}`}
          >
            Curate reviewed note bundles before exposing them to agents.
          </div>
        </button>

        <button
          type="button"
          className={`rounded-2xl border px-3 py-3 text-left transition-colors ${actionCardTone(Boolean(canvasMode?.enabled))}`}
          disabled={!canvasMode?.enabled}
          onClick={() => props.onChangeMode("canvas")}
        >
          <div
            className={`flex items-center gap-2 text-sm font-semibold ${actionTextTone(Boolean(canvasMode?.enabled))}`}
          >
            <LayoutGrid className="h-4 w-4 text-sky-600" />
            Canvas boards
          </div>
          <div
            className={`mt-1 text-xs leading-5 ${actionDescriptionTone(Boolean(canvasMode?.enabled))}`}
          >
            Map note clusters and synthesis boards in an editable workspace.
          </div>
        </button>
      </div>

      <div className="mt-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          Navigation Modes
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {props.modes.map(mode => (
            <Button
              key={mode.mode}
              type="button"
              size="sm"
              variant={props.activeMode === mode.mode ? "default" : "outline"}
              className="rounded-full"
              disabled={!mode.enabled}
              onClick={() => props.onChangeMode(mode.mode)}
            >
              {mode.label}
            </Button>
          ))}
        </div>
      </div>

      {reasons.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/80 px-3 py-3 text-sm text-amber-900">
          <div className="font-medium">
            Some knowledge tools are still limited
          </div>
          <div className="mt-1 text-xs leading-5 text-amber-800">
            {reasons.join(" ")}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-sky-100 bg-white/80 px-3 py-3 text-xs leading-5 text-slate-600">
          Graphs, backlinks, shared tags, semantic related notes, and memory
          packs stay navigation-first here. This screen helps you explore
          knowledge without auto-attaching extra files into AI context.
        </div>
      )}
    </div>
  );
}

export default KnowledgeVaultOverviewPanel;
