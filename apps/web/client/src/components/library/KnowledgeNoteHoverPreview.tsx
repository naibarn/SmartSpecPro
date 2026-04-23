import { useMemo, useState, type ReactNode } from "react";
import { ArrowUpRight, GitBranch, Link2, Loader2, Tag } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { trpc } from "@/lib/trpc";
import {
  extractKnowledgePreviewWithQuery,
  getKnowledgeHighlightSegments,
} from "@/lib/knowledgePreview";
import {
  matchesWikiLinkReference,
  normalizeWikiLinkToken,
} from "@/lib/wikiLink";

type KnowledgeNoteHoverPreviewProps = {
  children: ReactNode;
  itemId?: number | null;
  reference?: string | null;
  label?: string | null;
  logicalPath?: string | null;
  onOpenItem?: (itemId: number, title: string) => void;
};

function HighlightedPreviewText({
  text,
  query,
}: {
  text: string;
  query?: string | null;
}) {
  const segments = getKnowledgeHighlightSegments(text, query);

  return (
    <>
      {segments.map((segment, index) =>
        segment.highlighted ? (
          <mark
            key={`${segment.text}-${index}`}
            className="rounded bg-amber-100 px-0.5 text-amber-950"
          >
            {segment.text}
          </mark>
        ) : (
          <span key={`${segment.text}-${index}`}>{segment.text}</span>
        )
      )}
    </>
  );
}

export function KnowledgeNoteHoverPreview({
  children,
  itemId = null,
  reference,
  label,
  logicalPath,
  onOpenItem,
}: KnowledgeNoteHoverPreviewProps) {
  const [open, setOpen] = useState(false);
  const normalizedReference = useMemo(
    () => normalizeWikiLinkToken(reference ?? ""),
    [reference]
  );

  const quickSwitchQuery = trpc.library.quickSwitchNotes.useQuery(
    {
      query: normalizedReference || undefined,
      limit: 6,
    },
    {
      enabled: open && !itemId && Boolean(normalizedReference),
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: 60_000,
    }
  );

  const matchedNote = useMemo(() => {
    if (itemId || !normalizedReference) {
      return null;
    }

    const results = quickSwitchQuery.data?.results ?? [];
    return (
      results.find(entry =>
        matchesWikiLinkReference(normalizedReference, {
          title: entry.title,
          logicalPath: entry.logicalPath,
        })
      ) ??
      results[0] ??
      null
    );
  }, [itemId, normalizedReference, quickSwitchQuery.data?.results]);

  const resolvedItemId = itemId ?? matchedNote?.libraryItemId ?? null;
  const inspectorQuery = trpc.library.getKnowledgeInspector.useQuery(
    resolvedItemId
      ? { itemId: resolvedItemId, localGraphLimit: 12 }
      : { itemId: 0, localGraphLimit: 12 },
    {
      enabled: open && Boolean(resolvedItemId),
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: 60_000,
    }
  );
  const markdownQuery = trpc.library.getMarkdownContent.useQuery(
    { id: resolvedItemId ?? 0 },
    {
      enabled: open && Boolean(resolvedItemId),
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: 60_000,
    }
  );

  const note = inspectorQuery.data?.note;
  const previewTitle =
    note?.title ?? matchedNote?.title ?? label ?? normalizedReference ?? "Note";
  const previewLogicalPath =
    note?.logicalPath ?? logicalPath ?? matchedNote?.logicalPath ?? null;
  const isLoading =
    open &&
    (quickSwitchQuery.isLoading ||
      (Boolean(resolvedItemId) && inspectorQuery.isLoading) ||
      (Boolean(resolvedItemId) && markdownQuery.isLoading));
  const canOpen = Boolean(resolvedItemId && previewTitle && onOpenItem);
  const previewQuery = normalizedReference || label || previewTitle;
  const previewContent = extractKnowledgePreviewWithQuery(
    markdownQuery.data?.content ?? "",
    {
      query: previewQuery,
    }
  );

  return (
    <HoverCard
      open={open}
      onOpenChange={setOpen}
      openDelay={150}
      closeDelay={100}
    >
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        align="start"
        className="w-[320px] rounded-3xl border-slate-200 bg-white/95 p-4 shadow-2xl shadow-slate-200/70 backdrop-blur"
      >
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="rounded-full bg-sky-600 text-white">
                  Knowledge note
                </Badge>
                {normalizedReference ? (
                  <Badge variant="outline" className="rounded-full bg-white/80">
                    {normalizedReference}
                  </Badge>
                ) : null}
              </div>
              <div className="mt-2 truncate text-sm font-semibold text-slate-900">
                {previewTitle}
              </div>
              <div className="mt-1 text-xs leading-5 text-slate-500">
                {previewLogicalPath ?? "No logical path recorded yet."}
              </div>
            </div>
            {isLoading ? (
              <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-slate-400" />
            ) : null}
          </div>

          {!isLoading && !resolvedItemId ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
              No readable note matched this reference yet.
            </div>
          ) : null}

          {note ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Backlinks
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">
                    {inspectorQuery.data?.backlinks.length ?? 0}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Outgoing
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">
                    {inspectorQuery.data?.outgoing.length ?? 0}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Graph
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">
                    {inspectorQuery.data?.localGraph.edges.length ?? 0}
                  </div>
                </div>
              </div>

              {note.aliases.length > 0 || note.tags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {note.aliases.slice(0, 3).map(alias => (
                    <Badge
                      key={alias}
                      variant="outline"
                      className="rounded-full bg-white/80"
                    >
                      {alias}
                    </Badge>
                  ))}
                  {note.tags.slice(0, 3).map(tag => (
                    <Badge
                      key={tag}
                      className="rounded-full bg-slate-900 text-white"
                    >
                      <Tag className="mr-1 h-3 w-3" />
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : null}

              {previewContent.matchedSnippet ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-3 py-3 text-sm leading-6 text-slate-700">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                    Matched context
                  </div>
                  <HighlightedPreviewText
                    text={previewContent.matchedSnippet}
                    query={previewQuery}
                  />
                </div>
              ) : null}

              {previewContent.summary ? (
                <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm leading-6 text-slate-700">
                  {previewContent.summary}
                </div>
              ) : null}

              {previewContent.headings.length > 0 ? (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Outline
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {previewContent.headings.slice(0, 3).map(heading => (
                      <Badge
                        key={heading}
                        variant="outline"
                        className="rounded-full bg-white/80 text-slate-600"
                      >
                        {heading}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-600">
                <div className="flex items-center gap-2 font-medium text-slate-700">
                  <GitBranch className="h-3.5 w-3.5 text-sky-600" />
                  Navigation-first preview
                </div>
                <div className="mt-2">
                  Inspect safe note relationships before opening the full
                  document.
                </div>
              </div>
            </>
          ) : null}

          <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Link2 className="h-3.5 w-3.5" />
              Hover previews never auto-attach extra context.
            </span>
            {canOpen ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 rounded-full"
                onClick={event => {
                  event.preventDefault();
                  event.stopPropagation();
                  onOpenItem?.(resolvedItemId!, previewTitle);
                }}
              >
                <ArrowUpRight className="mr-2 h-3.5 w-3.5" />
                Open
              </Button>
            ) : null}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

export default KnowledgeNoteHoverPreview;
