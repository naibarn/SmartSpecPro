import { useEffect, useRef, useState, type ReactNode } from "react";

const TABS = ["Add", "Layers", "Properties", "Pages", "Versions", "Audio"] as const;

export type MobileBottomSheetTab = typeof TABS[number];

interface MobileBottomSheetProps {
  activeTab: MobileBottomSheetTab;
  onTabChange: (tab: MobileBottomSheetTab) => void;
  body: ReactNode;
  defaultExpanded?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}

export function MobileBottomSheet({
  activeTab,
  onTabChange,
  body,
  defaultExpanded = false,
  expanded,
  onExpandedChange,
}: MobileBottomSheetProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const tabRefs = useRef<Partial<Record<MobileBottomSheetTab, HTMLButtonElement | null>>>({});
  const currentExpanded = expanded ?? isExpanded;

  useEffect(() => {
    if (expanded !== undefined) {
      return;
    }
    setIsExpanded(defaultExpanded);
  }, [defaultExpanded, expanded]);

  useEffect(() => {
    const activeTabButton = tabRefs.current[activeTab];
    activeTabButton?.scrollIntoView?.({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [activeTab, currentExpanded]);

  function setExpanded(nextExpanded: boolean) {
    if (expanded === undefined) {
      setIsExpanded(nextExpanded);
    }
    onExpandedChange?.(nextExpanded);
  }

  function handleTabClick(tab: MobileBottomSheetTab) {
    if (!currentExpanded) {
      // Collapsed: expand and switch to clicked tab
      setExpanded(true);
      onTabChange(tab);
    } else if (tab === activeTab) {
      // Expanded and clicked active tab: collapse
      setExpanded(false);
    } else {
      // Expanded and clicked different tab: just switch
      onTabChange(tab);
    }
  }

  return (
    <section
      className="rounded-t-xl border-t border-slate-200 bg-white shadow-[0_-4px_16px_rgba(0,0,0,0.08)]"
      data-testid="mobile-bottom-sheet"
    >
      {/* Drag handle — toggles expanded/collapsed */}
      <button
        type="button"
        className="flex w-full justify-center pt-2 pb-1 focus:outline-none"
        onClick={() => setExpanded(!currentExpanded)}
        aria-label={currentExpanded ? "Collapse panel" : "Expand panel"}
        aria-expanded={currentExpanded}
      >
        <div className="h-1 w-10 rounded-full bg-slate-300" />
      </button>

      {/* Tab bar */}
      <div className="border-b border-slate-100 px-2 pb-1">
        <div
          className="overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none]"
          data-testid="mobile-bottom-sheet-tab-scroller"
        >
          <div className="flex min-w-max gap-1" role="tablist" aria-label="Mobile editor tabs">
            {TABS.map((tab) => (
              <button
                key={tab}
                ref={(node) => {
                  tabRefs.current[tab] = node;
                }}
                type="button"
                role="tab"
                className={`min-h-10 min-w-[4.5rem] flex-none whitespace-nowrap rounded-md px-3 text-xs font-medium transition-colors ${
                  activeTab === tab
                    ? "bg-sky-500/10 text-sky-700"
                    : "text-slate-500 hover:text-slate-700"
                }`}
                aria-selected={activeTab === tab}
                onClick={() => handleTabClick(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Body — only rendered when expanded */}
      {currentExpanded && (
        <div className="overflow-y-auto p-2" style={{ maxHeight: "45vh" }}>
          {body}
        </div>
      )}
    </section>
  );
}
