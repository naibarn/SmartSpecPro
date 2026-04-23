import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  FilePlus2,
  FileText,
  GitBranch,
  Link2,
  Loader2,
  Sparkles,
  Tag,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  extractKnowledgePreviewWithQuery,
  getKnowledgeHighlightSegments,
} from "@/lib/knowledgePreview";
import { trpc } from "@/lib/trpc";

type KnowledgeQuickSwitcherDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectNote: (note: { libraryItemId: number; title: string }) => void;
  onCreateNote: (title: string) => void | Promise<void>;
};

type LocalNeighborEntry = {
  libraryItemId: number;
  title: string;
  logicalPath: string | null;
  supportingText: string;
};

type LocalNeighborGroup = {
  key: "backlinks" | "outgoing" | "sharedTags" | "semanticRelated";
  label: string;
  icon: typeof Link2;
  toneClassName: string;
  count: number;
  items: LocalNeighborEntry[];
};

function matchTypeLabel(matchType: string): string {
  switch (matchType) {
    case "exact_title":
      return "Exact title";
    case "exact_path":
      return "Exact path";
    case "exact_alias":
      return "Exact alias";
    case "prefix":
      return "Prefix";
    case "path_prefix":
      return "Path prefix";
    case "fuzzy":
      return "Fuzzy";
    case "path_fuzzy":
      return "Path match";
    default:
      return "Recent";
  }
}

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

function buildLocalNeighborGroups(
  inspector:
    | {
        backlinks: Array<{
          libraryItemId: number | null;
          title: string | null;
          logicalPath: string | null;
          rawReference?: string;
        }>;
        outgoing: Array<{
          libraryItemId: number | null;
          title: string | null;
          logicalPath: string | null;
          rawReference?: string;
        }>;
        sharedTags: Array<{
          libraryItemId: number;
          title: string;
          logicalPath: string | null;
          sharedTags: string[];
        }>;
        semanticRelated: Array<{
          libraryItemId: number;
          title: string;
          logicalPath: string | null;
          score?: number | null;
        }>;
      }
    | null
    | undefined
): LocalNeighborGroup[] {
  if (!inspector) {
    return [];
  }

  const backlinks = inspector.backlinks
    .filter(
      entry =>
        typeof entry.libraryItemId === "number" && Boolean(entry.title?.trim())
    )
    .slice(0, 2)
    .map(entry => ({
      libraryItemId: entry.libraryItemId!,
      title: entry.title!,
      logicalPath: entry.logicalPath,
      supportingText: entry.rawReference
        ? `References: ${entry.rawReference}`
        : "Backlink to the current note",
    }));
  const outgoing = inspector.outgoing
    .filter(
      entry =>
        typeof entry.libraryItemId === "number" && Boolean(entry.title?.trim())
    )
    .slice(0, 2)
    .map(entry => ({
      libraryItemId: entry.libraryItemId!,
      title: entry.title!,
      logicalPath: entry.logicalPath,
      supportingText: entry.rawReference
        ? `Linked as: ${entry.rawReference}`
        : "Explicit markdown link",
    }));
  const sharedTags = inspector.sharedTags.slice(0, 2).map(entry => ({
    libraryItemId: entry.libraryItemId,
    title: entry.title,
    logicalPath: entry.logicalPath,
    supportingText: entry.sharedTags.map(tag => `#${tag}`).join(", "),
  }));
  const semanticRelated = inspector.semanticRelated.slice(0, 2).map(entry => ({
    libraryItemId: entry.libraryItemId,
    title: entry.title,
    logicalPath: entry.logicalPath,
    supportingText:
      typeof entry.score === "number"
        ? `Hybrid/vector ${(entry.score * 100).toFixed(0)}%`
        : "Hybrid/vector related",
  }));

  return [
    {
      key: "backlinks",
      label: "Backlinks",
      icon: Link2,
      toneClassName:
        "border-emerald-200 bg-emerald-50/80 text-emerald-700 shadow-emerald-100/70",
      count: inspector.backlinks.length,
      items: backlinks,
    },
    {
      key: "outgoing",
      label: "Outgoing",
      icon: ArrowUpRight,
      toneClassName:
        "border-indigo-200 bg-indigo-50/80 text-indigo-700 shadow-indigo-100/70",
      count: inspector.outgoing.length,
      items: outgoing,
    },
    {
      key: "sharedTags",
      label: "Shared tags",
      icon: Tag,
      toneClassName:
        "border-orange-200 bg-orange-50/80 text-orange-700 shadow-orange-100/70",
      count: inspector.sharedTags.length,
      items: sharedTags,
    },
    {
      key: "semanticRelated",
      label: "Hybrid/vector",
      icon: Sparkles,
      toneClassName:
        "border-violet-200 bg-violet-50/80 text-violet-700 shadow-violet-100/70",
      count: inspector.semanticRelated.length,
      items: semanticRelated,
    },
  ];
}

export function KnowledgeQuickSwitcherDialog(
  props: KnowledgeQuickSwitcherDialogProps
) {
  const [query, setQuery] = useState("");
  const [activeLibraryItemId, setActiveLibraryItemId] = useState<number | null>(
    null
  );
  const commandRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!props.open) {
      setQuery("");
      setActiveLibraryItemId(null);
    }
  }, [props.open]);

  const quickSwitchQuery = trpc.library.quickSwitchNotes.useQuery(
    {
      query: query.trim() || undefined,
      limit: 12,
    },
    {
      enabled: props.open,
      refetchOnWindowFocus: false,
    }
  );

  const results = quickSwitchQuery.data?.results ?? [];
  const createSuggestion =
    quickSwitchQuery.data?.createSuggestion?.trim() || "";
  const activeResult = useMemo(
    () =>
      results.find(result => result.libraryItemId === activeLibraryItemId) ??
      results[0] ??
      null,
    [activeLibraryItemId, results]
  );
  const activePreviewItemId = activeResult?.libraryItemId ?? null;

  useEffect(() => {
    if (results.length === 0) {
      setActiveLibraryItemId(null);
      return;
    }

    setActiveLibraryItemId(current =>
      results.some(result => result.libraryItemId === current)
        ? current
        : (results[0]?.libraryItemId ?? null)
    );
  }, [results]);

  const inspectorQuery = trpc.library.getKnowledgeInspector.useQuery(
    activePreviewItemId
      ? { itemId: activePreviewItemId, localGraphLimit: 12 }
      : { itemId: 0, localGraphLimit: 12 },
    {
      enabled: props.open && Boolean(activePreviewItemId),
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: 60_000,
    }
  );
  const markdownQuery = trpc.library.getMarkdownContent.useQuery(
    { id: activePreviewItemId ?? 0 },
    {
      enabled: props.open && Boolean(activePreviewItemId),
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: 60_000,
    }
  );

  const previewQuery =
    query.trim() || activeResult?.title || activeResult?.logicalPath;
  const previewContent = extractKnowledgePreviewWithQuery(
    markdownQuery.data?.content ?? "",
    { query: previewQuery }
  );
  const localNeighborGroups = useMemo(
    () => buildLocalNeighborGroups(inspectorQuery.data),
    [inspectorQuery.data]
  );
  const selectNote = useCallback(
    (note: { libraryItemId: number; title: string }) => {
      props.onSelectNote(note);
      props.onOpenChange(false);
    },
    [props.onOpenChange, props.onSelectNote]
  );
  const syncActiveFromDom = useCallback(() => {
    const selectedElement = commandRef.current?.querySelector<HTMLElement>(
      "[cmdk-item][aria-selected='true'], [role='option'][aria-selected='true']"
    );
    const nextId = Number(selectedElement?.dataset.knowledgeItemId ?? "");
    if (Number.isFinite(nextId) && nextId > 0) {
      setActiveLibraryItemId(nextId);
    }
  }, []);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="w-[min(96vw,72rem)] max-w-5xl max-h-[90vh] overflow-hidden border-slate-200 p-0">
        <DialogHeader className="border-b border-slate-200 px-6 py-5">
          <DialogTitle className="flex items-center gap-2 text-lg text-slate-900">
            <Sparkles className="h-5 w-5 text-sky-600" />
            Knowledge Quick Switcher
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-600">
            Jump across notes by title, alias, or logical path without widening
            runtime context. Shortcut: Ctrl/Cmd+K
          </DialogDescription>
        </DialogHeader>

        <div ref={commandRef}>
          <Command
            className="rounded-none"
            onKeyDownCapture={event => {
              if (
                event.key === "ArrowDown" ||
                event.key === "ArrowUp" ||
                event.key === "Home" ||
                event.key === "End" ||
                event.key === "PageDown" ||
                event.key === "PageUp"
              ) {
                requestAnimationFrame(syncActiveFromDom);
              }
            }}
          >
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Find notes, aliases, or recent knowledge..."
              className="border-0"
            />
            <div className="grid min-h-[320px] lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
              <div className="min-h-0 border-b border-slate-200 lg:border-r lg:border-b-0">
                <CommandList
                  data-testid="knowledge-quick-switcher-list"
                  className="max-h-[34vh] sm:max-h-[40vh] lg:max-h-[520px]"
                >
                  {quickSwitchQuery.isLoading ? (
                    <div className="flex items-center gap-2 px-4 py-6 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading knowledge notes...
                    </div>
                  ) : null}

                  {quickSwitchQuery.error ? (
                    <div className="px-4 py-4 text-sm text-amber-700">
                      Knowledge search is temporarily unavailable. Try again in
                      a moment.
                    </div>
                  ) : null}

                  {!quickSwitchQuery.isLoading && !quickSwitchQuery.error ? (
                    <>
                      <CommandEmpty>
                        <div className="px-4 py-6 text-center text-sm text-slate-500">
                          No readable notes matched this search.
                        </div>
                      </CommandEmpty>

                      <CommandGroup
                        heading={query.trim() ? "Matches" : "Recent notes"}
                      >
                        {results.map(result => (
                          <CommandItem
                            key={result.libraryItemId}
                            value={`${result.title} ${result.logicalPath ?? ""}`}
                            data-knowledge-item-id={result.libraryItemId}
                            data-testid={`knowledge-quick-switcher-item-${result.libraryItemId}`}
                            onMouseEnter={() =>
                              setActiveLibraryItemId(result.libraryItemId)
                            }
                            onFocus={() =>
                              setActiveLibraryItemId(result.libraryItemId)
                            }
                            onSelect={() => {
                              selectNote({
                                libraryItemId: result.libraryItemId,
                                title: result.title,
                              });
                            }}
                            className="flex items-start gap-3 px-4 py-3"
                          >
                            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-700">
                              <FileText className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="truncate font-medium text-slate-900">
                                  {result.title}
                                </span>
                                <Badge
                                  variant="outline"
                                  className="rounded-full border-slate-200 bg-white text-[10px] text-slate-600"
                                >
                                  {matchTypeLabel(result.matchType)}
                                </Badge>
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                {result.logicalPath ? (
                                  <span className="inline-flex items-center gap-1">
                                    <Link2 className="h-3 w-3" />
                                    {result.logicalPath}
                                  </span>
                                ) : null}
                                {result.disambiguation ? (
                                  <span>{result.disambiguation}</span>
                                ) : null}
                              </div>
                              {result.aliases.length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {result.aliases.slice(0, 2).map(alias => (
                                    <Badge
                                      key={`${result.libraryItemId}-${alias}`}
                                      variant="outline"
                                      className="rounded-full border-slate-200 bg-white text-[10px] text-slate-500"
                                    >
                                      {alias}
                                    </Badge>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>

                      {createSuggestion ? (
                        <CommandGroup heading="Create on miss">
                          <CommandItem
                            value={`create ${createSuggestion}`}
                            onSelect={() => {
                              void props.onCreateNote(createSuggestion);
                              props.onOpenChange(false);
                            }}
                            className="flex items-center gap-3 px-4 py-3"
                          >
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                              <FilePlus2 className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-slate-900">
                                Create markdown note
                              </div>
                              <div className="text-xs text-slate-500">
                                "{createSuggestion}"
                              </div>
                            </div>
                          </CommandItem>
                        </CommandGroup>
                      ) : null}
                    </>
                  ) : null}
                </CommandList>
              </div>

              <div
                data-testid="knowledge-quick-switcher-preview"
                className="flex min-h-[260px] max-h-[42vh] flex-col overflow-y-auto bg-slate-50/70 px-4 py-4 sm:px-5 lg:max-h-none"
              >
                {activeResult ? (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className="rounded-full bg-sky-600 text-white">
                            Knowledge note
                          </Badge>
                          <Badge
                            variant="outline"
                            className="rounded-full border-slate-200 bg-white text-[10px] text-slate-600"
                          >
                            {matchTypeLabel(activeResult.matchType)}
                          </Badge>
                        </div>
                        <div className="mt-2 line-clamp-2 text-base font-semibold text-slate-900">
                          {activeResult.title}
                        </div>
                        <div className="mt-1 text-xs leading-5 text-slate-500">
                          {activeResult.logicalPath ??
                            "No logical path recorded yet."}
                        </div>
                      </div>
                      {(inspectorQuery.isLoading || markdownQuery.isLoading) &&
                      activePreviewItemId ? (
                        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-slate-400" />
                      ) : null}
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Backlinks
                        </div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">
                          {inspectorQuery.data?.backlinks.length ?? 0}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Outgoing
                        </div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">
                          {inspectorQuery.data?.outgoing.length ?? 0}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Graph
                        </div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">
                          {inspectorQuery.data?.localGraph.edges.length ?? 0}
                        </div>
                      </div>
                    </div>

                    {(inspectorQuery.data?.note.aliases.length ?? 0) > 0 ||
                    (inspectorQuery.data?.note.tags.length ?? 0) > 0 ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {(inspectorQuery.data?.note.aliases ?? [])
                          .slice(0, 3)
                          .map(alias => (
                            <Badge
                              key={alias}
                              variant="outline"
                              className="rounded-full border-slate-200 bg-white text-[10px] text-slate-600"
                            >
                              {alias}
                            </Badge>
                          ))}
                        {(inspectorQuery.data?.note.tags ?? [])
                          .slice(0, 3)
                          .map(tag => (
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

                    {localNeighborGroups.some(group => group.count > 0) ? (
                      <div className="mt-4 rounded-3xl border border-slate-200 bg-white px-3 py-3">
                        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          <GitBranch className="h-3.5 w-3.5 text-sky-600" />
                          Local neighbors
                        </div>
                        <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Current note
                          </div>
                          <div className="mt-1 line-clamp-2 text-sm font-semibold text-slate-900">
                            {activeResult.title}
                          </div>
                          <div className="mt-1 text-xs leading-5 text-slate-500">
                            {activeResult.logicalPath ??
                              "No logical path recorded yet."}
                          </div>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {localNeighborGroups
                            .filter(group => group.count > 0)
                            .map(group => {
                              const Icon = group.icon;

                              return (
                                <div
                                  key={group.key}
                                  className={`rounded-2xl border px-3 py-3 shadow-sm ${group.toneClassName}`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="inline-flex items-center gap-2 text-xs font-semibold">
                                      <Icon className="h-3.5 w-3.5" />
                                      {group.label}
                                    </div>
                                    <Badge
                                      variant="outline"
                                      className="rounded-full border-current/30 bg-white/80 text-[10px]"
                                    >
                                      {group.count}
                                    </Badge>
                                  </div>
                                  <div className="mt-2 space-y-2">
                                    {group.items.length > 0 ? (
                                      group.items.map(item => (
                                        <button
                                          key={`${group.key}-${item.libraryItemId}`}
                                          type="button"
                                          className="w-full rounded-2xl border border-white/80 bg-white/85 px-3 py-2 text-left transition hover:border-white hover:bg-white"
                                          onClick={() =>
                                            selectNote({
                                              libraryItemId: item.libraryItemId,
                                              title: item.title,
                                            })
                                          }
                                        >
                                          <div className="line-clamp-1 text-sm font-medium text-slate-900">
                                            {item.title}
                                          </div>
                                          <div className="mt-1 line-clamp-1 text-[11px] text-slate-500">
                                            {item.logicalPath ??
                                              "No logical path recorded yet."}
                                          </div>
                                          <div className="mt-1 line-clamp-2 text-[11px] text-slate-600">
                                            {item.supportingText}
                                          </div>
                                        </button>
                                      ))
                                    ) : (
                                      <div className="rounded-2xl border border-dashed border-white/80 bg-white/60 px-3 py-3 text-[11px] text-slate-500">
                                        No nearby notes in this relation yet.
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    ) : null}

                    {previewContent.matchedSnippet ? (
                      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/80 px-3 py-3 text-sm leading-6 text-slate-700">
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
                      <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm leading-6 text-slate-700">
                        {previewContent.summary}
                      </div>
                    ) : null}

                    {previewContent.headings.length > 0 ? (
                      <div className="mt-4">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Outline
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {previewContent.headings.slice(0, 3).map(heading => (
                            <Badge
                              key={heading}
                              variant="outline"
                              className="rounded-full border-slate-200 bg-white text-slate-600"
                            >
                              {heading}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-auto space-y-3 pt-4">
                      <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-xs leading-5 text-slate-600">
                        <div className="flex items-center gap-2 font-medium text-slate-700">
                          <GitBranch className="h-3.5 w-3.5 text-sky-600" />
                          Preview before opening
                        </div>
                        <div className="mt-2">
                          Inspect note relationships and matched context before
                          you widen the editor surface.
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs text-slate-500">
                          Quick switch stays navigation-first.
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          className="rounded-full bg-sky-600 text-white hover:bg-sky-700"
                          onClick={() =>
                            selectNote({
                              libraryItemId: activeResult.libraryItemId,
                              title: activeResult.title,
                            })
                          }
                        >
                          <ArrowUpRight className="mr-2 h-3.5 w-3.5" />
                          Open note
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-1 items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white/70 px-6 text-center text-sm text-slate-500">
                    Pick a note to preview its relationships, aliases, tags, and
                    matched content before opening it.
                  </div>
                )}
              </div>
            </div>
          </Command>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default KnowledgeQuickSwitcherDialog;
