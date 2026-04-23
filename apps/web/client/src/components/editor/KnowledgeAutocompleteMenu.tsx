import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { Database, Hash, Tag } from "lucide-react";

export interface KnowledgeAutocompleteItem {
  id: string;
  label: string;
  detail?: string | null;
  meta?: string | null;
}

export interface KnowledgeAutocompleteMenuProps {
  title: string;
  emptyMessage: string;
  icon: "tag" | "property";
  items: KnowledgeAutocompleteItem[];
  command: (item: KnowledgeAutocompleteItem) => void;
}

export interface KnowledgeAutocompleteMenuRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

function resolveIcon(icon: KnowledgeAutocompleteMenuProps["icon"]) {
  return icon === "tag" ? Tag : Database;
}

const KnowledgeAutocompleteMenu = forwardRef<
  KnowledgeAutocompleteMenuRef,
  KnowledgeAutocompleteMenuProps
>(({ title, emptyMessage, icon, items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const Icon = resolveIcon(icon);

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
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="max-h-80 min-w-[18rem] overflow-y-auto rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-2xl shadow-slate-200/60 backdrop-blur">
      <div className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
        {title}
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
          >
            <div
              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                active ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-500"
              }`}
            >
              {icon === "tag" ? (
                <Hash className="h-4 w-4" />
              ) : (
                <Icon className="h-4 w-4" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-medium">
                  {icon === "tag" ? `#${item.label}` : item.label}
                </span>
                {item.meta ? (
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                      active
                        ? "border-sky-200 bg-white/80 text-sky-700"
                        : "border-slate-200 bg-slate-50 text-slate-500"
                    }`}
                  >
                    {item.meta}
                  </span>
                ) : null}
              </div>
              {item.detail ? (
                <div className="mt-1 truncate text-xs text-slate-500">
                  {item.detail}
                </div>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
});

KnowledgeAutocompleteMenu.displayName = "KnowledgeAutocompleteMenu";

export default KnowledgeAutocompleteMenu;
