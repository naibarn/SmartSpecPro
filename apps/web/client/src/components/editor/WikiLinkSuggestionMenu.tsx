import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
  forwardRef,
} from "react";
import { FileText, Link2 } from "lucide-react";

export interface WikiLinkSuggestionItem {
  id: string;
  label: string;
  reference: string;
  logicalPath?: string | null;
  aliases?: string[];
  matchType?: string;
  disambiguation?: string | null;
}

export interface WikiLinkSuggestionMenuProps {
  items: WikiLinkSuggestionItem[];
  command: (item: WikiLinkSuggestionItem) => void;
}

export interface WikiLinkSuggestionMenuRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

function matchTypeLabel(matchType: string | undefined): string {
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

const WikiLinkSuggestionMenu = forwardRef<
  WikiLinkSuggestionMenuRef,
  WikiLinkSuggestionMenuProps
>(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  const selectItem = useCallback((index: number) => {
    const item = items[index];
    if (item) {
      command(item);
    }
  }, [command, items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (!items.length) {
        return false;
      }
      if (event.key === "ArrowUp") {
        setSelectedIndex((index) => (index + items.length - 1) % items.length);
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelectedIndex((index) => (index + 1) % items.length);
        return true;
      }
      if (event.key === "Enter") {
        selectItem(selectedIndex);
        return true;
      }
      return false;
    },
  }), [items.length, selectItem, selectedIndex]);

  if (!items.length) {
    return (
      <div className="min-w-[18rem] rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-500 shadow-2xl shadow-slate-200/60">
        No matching knowledge notes found.
      </div>
    );
  }

  return (
    <div
      className="max-h-80 min-w-[20rem] overflow-y-auto rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-2xl shadow-slate-200/60 backdrop-blur"
      data-testid="wikilink-menu"
    >
      <div className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
        Link knowledge note
      </div>
      {items.map((item, index) => {
        const active = index === selectedIndex;
        return (
          <button
            key={item.id}
            type="button"
            className={`flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
              active
                ? "bg-sky-50 text-sky-950"
                : "text-slate-700 hover:bg-slate-50"
            }`}
            onClick={() => selectItem(index)}
            data-testid={`wikilink-item-${item.id}`}
          >
            <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
              active ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-500"
            }`}>
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-medium">{item.label}</span>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                  active
                    ? "border-sky-200 bg-white/80 text-sky-700"
                    : "border-slate-200 bg-slate-50 text-slate-500"
                }`}>
                  {matchTypeLabel(item.matchType)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <Link2 className="h-3 w-3" />
                  {item.reference}
                </span>
                {item.disambiguation ? (
                  <span>{item.disambiguation}</span>
                ) : null}
              </div>
              {item.logicalPath && item.logicalPath !== item.reference ? (
                <div className="mt-1 truncate text-[11px] text-slate-400">
                  {item.logicalPath}
                </div>
              ) : null}
              {item.aliases && item.aliases.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {item.aliases.slice(0, 2).map((alias) => (
                    <span
                      key={`${item.id}-${alias}`}
                      className="rounded-full border border-slate-200 bg-white/80 px-2 py-0.5 text-[10px] text-slate-500"
                    >
                      {alias}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
});

WikiLinkSuggestionMenu.displayName = "WikiLinkSuggestionMenu";

export default WikiLinkSuggestionMenu;
