import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface FinanceCounterpartyAutocompleteItem {
  id: number;
  displayName: string;
  aliases?: string[];
  usageCount?: number;
}

interface FinanceCounterpartyAutocompleteProps {
  value: string;
  onValueChange: (value: string) => void;
  items: FinanceCounterpartyAutocompleteItem[];
  placeholder: string;
  helperText?: string;
  emptyMessage?: string;
  className?: string;
  inputClassName?: string;
}

export function FinanceCounterpartyAutocomplete({
  value,
  onValueChange,
  items,
  placeholder,
  helperText,
  emptyMessage = "No matching counterparties found.",
  className,
  inputClassName,
}: FinanceCounterpartyAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const activeIndexRef = useRef(0);
  const listboxId = useId();

  useEffect(() => () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const visibleItems = useMemo(() => {
    const seen = new Set<string>();
    return items.filter((item) => {
      const key = item.displayName.trim().toLowerCase();
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }, [items]);

  const setActiveItemIndex = (nextIndex: number) => {
    activeIndexRef.current = nextIndex;
    setActiveIndex(nextIndex);
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    if (visibleItems.length === 0) {
      setActiveIndex(-1);
      activeIndexRef.current = -1;
      return;
    }
    setActiveIndex((current) => {
      if (current < 0) {
        activeIndexRef.current = 0;
        return 0;
      }
      const nextIndex = Math.min(current, visibleItems.length - 1);
      activeIndexRef.current = nextIndex;
      return nextIndex;
    });
  }, [open, visibleItems.length]);

  const handleSelect = (nextValue: string) => {
    onValueChange(nextValue);
    setOpen(false);
    setActiveItemIndex(0);
    window.setTimeout(() => {
      wrapperRef.current?.querySelector("input")?.focus();
    }, 0);
  };

  const handleBlur = () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
    }, 150);
  };

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <Input
        value={value}
        onChange={(event) => {
          onValueChange(event.target.value);
          setOpen(true);
          setActiveItemIndex(0);
        }}
        onFocus={() => {
          setOpen(true);
          if (visibleItems.length > 0) {
            const nextIndex = Math.max(activeIndexRef.current, 0);
            setActiveItemIndex(nextIndex);
          } else {
            setActiveItemIndex(-1);
          }
        }}
        onBlur={handleBlur}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            setActiveItemIndex(0);
            return;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (!open) {
              setOpen(true);
            }
            if (visibleItems.length === 0) {
              return;
            }
            const nextIndex = activeIndexRef.current < 0 ? 0 : (activeIndexRef.current + 1) % visibleItems.length;
            setActiveItemIndex(nextIndex);
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) {
              setOpen(true);
            }
            if (visibleItems.length === 0) {
              return;
            }
            const nextIndex = activeIndexRef.current <= 0 ? visibleItems.length - 1 : activeIndexRef.current - 1;
            setActiveItemIndex(nextIndex);
            return;
          }
          if (event.key === "Enter" && open && visibleItems.length > 0) {
            event.preventDefault();
            const nextItem = visibleItems[Math.max(0, Math.min(activeIndexRef.current, visibleItems.length - 1))];
            if (nextItem) {
              handleSelect(nextItem.displayName);
            }
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        className={cn("bg-white pr-9", inputClassName)}
      />
      <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

      {open ? (
        <div id={listboxId} role="listbox" className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="max-h-64 overflow-y-auto">
            {visibleItems.length > 0 ? (
              visibleItems.map((item, index) => {
                const isSelected = value.trim().toLowerCase() === item.displayName.trim().toLowerCase();
                const isActive = index === activeIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      "flex w-full items-start gap-3 border-b border-slate-100 px-3 py-2.5 text-left last:border-b-0 hover:bg-sky-50",
                      isSelected && "bg-sky-50",
                      isActive && "bg-sky-100",
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleSelect(item.displayName)}
                    onMouseEnter={() => setActiveItemIndex(index)}
                    role="option"
                    aria-selected={isSelected}
                    title={item.aliases?.length ? `Aliases: ${item.aliases.join(", ")}` : undefined}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                        isSelected || isActive
                          ? "border-sky-300 bg-sky-100 text-sky-700"
                          : "border-slate-200 bg-white text-transparent",
                      )}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-950">
                        {item.displayName}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">
                        {item.aliases?.length
                          ? `Aliases: ${item.aliases.slice(0, 3).join(", ")}`
                          : item.usageCount
                            ? `Used ${item.usageCount} times`
                            : "Canonical name"}
                      </span>
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-3 text-sm text-slate-500">
                {emptyMessage}
              </div>
            )}
          </div>
          {helperText ? (
            <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
              {helperText}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
