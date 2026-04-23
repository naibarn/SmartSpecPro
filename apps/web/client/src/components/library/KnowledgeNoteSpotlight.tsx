import {
  Copy,
  GitBranch,
  Link2,
  Loader2,
  Package,
  Search,
  Tag,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type KnowledgeVaultMode } from "@/lib/documentManagementUi";

type KnowledgeNoteSpotlightProps = {
  title: string;
  logicalPath?: string | null;
  aliases: string[];
  tags: string[];
  backlinksCount?: number;
  outgoingCount?: number;
  mentionCount?: number;
  graphEdgeCount?: number;
  sharedTagsCount?: number;
  semanticRelatedCount?: number;
  isLoading: boolean;
  errorMessage?: string | null;
  quickSwitcherEnabled: boolean;
  inspectorEnabled: boolean;
  graphEnabled: boolean;
  contextPacksEnabled: boolean;
  blockedReasons: string[];
  compact?: boolean;
  onChangeMode: (mode: KnowledgeVaultMode) => void;
  onOpenQuickSwitch: () => void;
  onCopyWikiLink?: () => void;
};

function statValue(value: number | undefined, isLoading: boolean): string {
  if (isLoading) {
    return "…";
  }
  return String(value ?? 0);
}

function actionTone(enabled: boolean): string {
  return enabled
    ? "border-slate-200 bg-white text-slate-900 hover:border-sky-300 hover:bg-sky-50"
    : "border-slate-200 bg-slate-50 text-slate-400";
}

export function KnowledgeNoteSpotlight(props: KnowledgeNoteSpotlightProps) {
  const compact = props.compact ?? false;

  return (
    <div
      className={`rounded-3xl border border-sky-100 bg-gradient-to-br from-white via-sky-50/50 to-cyan-50/70 shadow-sm ${compact ? "p-3" : "p-4"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="rounded-full bg-sky-600 text-white">
              Knowledge note
            </Badge>
            <Badge variant="outline" className="rounded-full bg-white/80">
              navigation-first
            </Badge>
          </div>
          <h3
            className={`mt-2 line-clamp-2 font-semibold text-slate-900 ${compact ? "text-base" : "text-lg"}`}
          >
            {props.title}
          </h3>
          <p
            className={`mt-1 line-clamp-2 leading-6 text-slate-600 ${compact ? "text-xs" : "text-sm"}`}
          >
            {props.logicalPath ?? "No logical path recorded yet."}
          </p>
        </div>

        {props.isLoading ? (
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading note context
          </div>
        ) : null}
      </div>

      <div
        className={`mt-4 grid gap-3 ${compact ? "grid-cols-2" : "md:grid-cols-4"}`}
      >
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Backlinks
          </div>
          <div className="mt-2 text-lg font-semibold text-slate-900">
            {statValue(props.backlinksCount, props.isLoading)}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Outgoing
          </div>
          <div className="mt-2 text-lg font-semibold text-slate-900">
            {statValue(props.outgoingCount, props.isLoading)}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Mentions
          </div>
          <div className="mt-2 text-lg font-semibold text-slate-900">
            {statValue(props.mentionCount, props.isLoading)}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Graph edges
          </div>
          <div className="mt-2 text-lg font-semibold text-slate-900">
            {statValue(props.graphEdgeCount, props.isLoading)}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          className={actionTone(props.inspectorEnabled)}
          variant="outline"
          disabled={!props.inspectorEnabled}
          onClick={() => props.onChangeMode("related")}
        >
          <Link2 className="mr-2 h-4 w-4" />
          Related notes
        </Button>
        <Button
          type="button"
          className={actionTone(props.graphEnabled)}
          variant="outline"
          disabled={!props.graphEnabled}
          onClick={() => props.onChangeMode("graph")}
        >
          <GitBranch className="mr-2 h-4 w-4" />
          Graph
        </Button>
        <Button
          type="button"
          className={actionTone(props.contextPacksEnabled)}
          variant="outline"
          disabled={!props.contextPacksEnabled}
          onClick={() => props.onChangeMode("memory_packs")}
        >
          <Package className="mr-2 h-4 w-4" />
          Memory packs
        </Button>
        <Button
          type="button"
          className={actionTone(props.quickSwitcherEnabled)}
          variant="outline"
          disabled={!props.quickSwitcherEnabled}
          onClick={props.onOpenQuickSwitch}
        >
          <Search className="mr-2 h-4 w-4" />
          Quick switch
        </Button>
        {props.onCopyWikiLink ? (
          <Button
            type="button"
            className={actionTone(true)}
            variant="outline"
            onClick={props.onCopyWikiLink}
          >
            <Copy className="mr-2 h-4 w-4" />
            Copy wikilink
          </Button>
        ) : null}
      </div>

      {props.aliases.length > 0 || props.tags.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {props.aliases.slice(0, 4).map(alias => (
            <Badge
              key={alias}
              variant="outline"
              className="rounded-full bg-white/80"
            >
              {alias}
            </Badge>
          ))}
          {props.tags.slice(0, 4).map(tag => (
            <Badge key={tag} className="rounded-full bg-slate-900 text-white">
              <Tag className="mr-1 h-3 w-3" />
              {tag}
            </Badge>
          ))}
        </div>
      ) : null}

      {typeof props.sharedTagsCount === "number" ||
      typeof props.semanticRelatedCount === "number" ? (
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
          {typeof props.sharedTagsCount === "number" ? (
            <div className="rounded-full border border-slate-200 bg-white/80 px-3 py-1">
              Shared-tag neighbors: {props.sharedTagsCount}
            </div>
          ) : null}
          {typeof props.semanticRelatedCount === "number" ? (
            <div className="rounded-full border border-slate-200 bg-white/80 px-3 py-1">
              Hybrid/vector related: {props.semanticRelatedCount}
            </div>
          ) : null}
        </div>
      ) : null}

      {props.errorMessage ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/80 px-3 py-3 text-sm text-amber-900">
          {props.errorMessage}
        </div>
      ) : props.blockedReasons.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/80 px-3 py-3 text-sm text-amber-900">
          Some knowledge actions are still limited for this workspace.
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-sky-100 bg-white/80 px-3 py-3 text-sm text-slate-600">
          This note can guide navigation and analysis, but backlinks and graph
          relationships are not auto-injected into runtime context from this
          page.
        </div>
      )}
    </div>
  );
}

export default KnowledgeNoteSpotlight;
