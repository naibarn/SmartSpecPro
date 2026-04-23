import { ArrowUpRight, Loader2, Network, Search, Tag } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import KnowledgeGraphView from "./KnowledgeGraphView";

type KnowledgeInspectorPanelProps = {
  selectedItem: {
    id: number;
    title: string;
    item_type: string;
  } | null;
  onOpenItem: (itemId: number, title: string) => void;
  focus?: "all" | "graph";
  onBrowseNotes?: () => void;
  onOpenQuickSwitch?: () => void;
};

function RelationList(props: {
  title: string;
  entries: Array<{
    libraryItemId: number | null;
    title: string | null;
    logicalPath: string | null;
    rawReference?: string;
    matchedText?: string;
    status?: string;
    supportingText?: string | null;
    sharedTags?: string[];
  }>;
  onOpenItem: (itemId: number, title: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm font-semibold text-slate-900">{props.title}</div>
      <div className="mt-3 space-y-2">
        {props.entries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
            No safe relationships available in this section.
          </div>
        ) : (
          props.entries.map((entry, index) => (
            <div
              key={`${props.title}-${entry.libraryItemId ?? entry.rawReference ?? entry.matchedText ?? index}`}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-900">
                    {entry.title ??
                      entry.rawReference ??
                      entry.matchedText ??
                      "Unknown"}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    {entry.logicalPath ? (
                      <span>{entry.logicalPath}</span>
                    ) : null}
                    {entry.status ? (
                      <Badge variant="outline" className="text-[10px]">
                        {entry.status}
                      </Badge>
                    ) : null}
                  </div>
                  {entry.sharedTags && entry.sharedTags.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {entry.sharedTags.map(tag => (
                        <Badge
                          key={`${props.title}-${entry.libraryItemId ?? tag}-${tag}`}
                          className="rounded-full bg-slate-900 text-white"
                        >
                          <Tag className="mr-1 h-3 w-3" />
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  {entry.supportingText ? (
                    <div className="mt-2 text-xs leading-5 text-slate-600">
                      {entry.supportingText}
                    </div>
                  ) : null}
                </div>
                {entry.libraryItemId && entry.title ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      props.onOpenItem(entry.libraryItemId!, entry.title!)
                    }
                  >
                    <ArrowUpRight className="mr-2 h-4 w-4" />
                    Open
                  </Button>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function KnowledgeInspectorPanel(props: KnowledgeInspectorPanelProps) {
  const inspectorQuery = trpc.library.getKnowledgeInspector.useQuery(
    props.selectedItem
      ? { itemId: props.selectedItem.id, localGraphLimit: 40 }
      : { itemId: 0, localGraphLimit: 40 },
    {
      enabled:
        props.selectedItem != null && props.selectedItem.item_type === "md",
      refetchOnWindowFocus: false,
    }
  );

  if (!props.selectedItem) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
        <div>
          Select a markdown note to inspect aliases, properties, backlinks, and
          safe graph relationships.
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {props.onOpenQuickSwitch ? (
            <Button
              type="button"
              variant="outline"
              onClick={props.onOpenQuickSwitch}
            >
              <Search className="mr-2 h-4 w-4" />
              Quick switch
            </Button>
          ) : null}
          {props.onBrowseNotes ? (
            <Button
              type="button"
              variant="outline"
              onClick={props.onBrowseNotes}
            >
              Browse notes
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  if (props.selectedItem.item_type !== "md") {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
        <div>
          Knowledge Inspector is navigation-first and only opens on markdown
          notes. Select an `md` file to continue.
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {props.onOpenQuickSwitch ? (
            <Button
              type="button"
              variant="outline"
              onClick={props.onOpenQuickSwitch}
            >
              <Search className="mr-2 h-4 w-4" />
              Quick switch
            </Button>
          ) : null}
          {props.onBrowseNotes ? (
            <Button
              type="button"
              variant="outline"
              onClick={props.onBrowseNotes}
            >
              Browse notes
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  if (inspectorQuery.isLoading && !inspectorQuery.data) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-8 text-sm text-slate-500 shadow-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading inspector details...
      </div>
    );
  }

  if (inspectorQuery.error || !inspectorQuery.data) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-5 text-sm text-amber-900 shadow-sm">
        <div className="font-medium">
          Knowledge relationships are temporarily unavailable.
        </div>
        <div className="mt-1 leading-6">
          The note is still editable, but graph/backlink metadata could not be
          loaded right now. This usually means the knowledge schema still needs
          a refresh or repair on this environment.
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {props.onOpenQuickSwitch ? (
            <Button
              type="button"
              variant="outline"
              onClick={props.onOpenQuickSwitch}
            >
              <Search className="mr-2 h-4 w-4" />
              Quick switch
            </Button>
          ) : null}
          {props.onBrowseNotes ? (
            <Button
              type="button"
              variant="outline"
              onClick={props.onBrowseNotes}
            >
              Browse notes
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  const inspector = inspectorQuery.data;
  const graphOnly = props.focus === "graph";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              {inspector.note.title}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {inspector.note.logicalPath ?? "No logical path"} • Inspector is
              read-only and never auto-attaches related notes to runtime
              context.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {inspector.note.aliases.map(alias => (
              <Badge key={alias} variant="outline" className="rounded-full">
                {alias}
              </Badge>
            ))}
            {inspector.note.tags.map(tag => (
              <Badge key={tag} className="rounded-full bg-slate-900 text-white">
                <Tag className="mr-1 h-3 w-3" />
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        {!graphOnly ? (
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">
                Frontmatter-style properties
              </div>
              <div className="mt-3 space-y-2">
                {Object.entries(inspector.note.properties).length === 0 ? (
                  <div className="text-sm text-slate-500">
                    No custom properties recorded.
                  </div>
                ) : (
                  Object.entries(inspector.note.properties).map(
                    ([key, value]) => (
                      <div
                        key={key}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2"
                      >
                        <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                          {key}
                        </div>
                        <div className="mt-1 text-sm text-slate-900">
                          {JSON.stringify(value)}
                        </div>
                      </div>
                    )
                  )
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Network className="h-4 w-4 text-sky-600" />
                Knowledge relationship graph
              </div>
              <div className="mt-3">
                <KnowledgeGraphView
                  compact
                  activeNote={inspector.note}
                  outgoing={inspector.outgoing}
                  backlinks={inspector.backlinks}
                  sharedTags={inspector.sharedTags}
                  semanticRelated={inspector.semanticRelated}
                  onOpenItem={props.onOpenItem}
                />
              </div>
              <div className="mt-3 text-xs text-slate-500">
                {inspector.localGraph.edges.length} canonical edge(s),{" "}
                {inspector.sharedTags.length} shared-tag neighbor(s), and{" "}
                {inspector.semanticRelated.length} hybrid/vector suggestion(s).
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <KnowledgeGraphView
              activeNote={inspector.note}
              outgoing={inspector.outgoing}
              backlinks={inspector.backlinks}
              sharedTags={inspector.sharedTags}
              semanticRelated={inspector.semanticRelated}
              onOpenItem={props.onOpenItem}
            />
            <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-600">
              Click a node once to inspect why it is connected, then click it
              again or use Open note when you want to navigate. This graph
              blends canonical links, shared tags, and hybrid/vector suggestions
              for navigation only. None of these notes are auto-injected into
              runtime context.
            </div>
          </div>
        )}
      </div>

      {!graphOnly ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <RelationList
            title="Outgoing links"
            entries={inspector.outgoing}
            onOpenItem={props.onOpenItem}
          />
          <RelationList
            title="Backlinks"
            entries={inspector.backlinks}
            onOpenItem={props.onOpenItem}
          />
          <RelationList
            title="Unlinked mentions"
            entries={inspector.unlinkedMentions.map(mention => ({
              libraryItemId: mention.libraryItemId,
              title: mention.title,
              logicalPath: mention.logicalPath,
              matchedText: mention.matchedText,
            }))}
            onOpenItem={props.onOpenItem}
          />
          <RelationList
            title="Shared tags"
            entries={inspector.sharedTags.map(entry => ({
              libraryItemId: entry.libraryItemId,
              title: entry.title,
              logicalPath: entry.logicalPath,
              sharedTags: entry.sharedTags,
              supportingText: `Shared hashtag/topic overlap: ${entry.sharedTags.join(", ")}`,
            }))}
            onOpenItem={props.onOpenItem}
          />
          <RelationList
            title="Semantic related"
            entries={inspector.semanticRelated.map(entry => ({
              libraryItemId: entry.libraryItemId,
              title: entry.title,
              logicalPath: entry.logicalPath,
              supportingText: entry.rationale ?? null,
            }))}
            onOpenItem={props.onOpenItem}
          />
        </div>
      ) : null}
    </div>
  );
}

export default KnowledgeInspectorPanel;
