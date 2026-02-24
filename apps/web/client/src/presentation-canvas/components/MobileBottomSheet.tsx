import { useState, type ReactNode } from "react";

const TABS = ["Add", "Layers", "Properties", "Pages", "Versions"] as const;

export type MobileBottomSheetTab = typeof TABS[number];

interface MobileBottomSheetProps {
  activeTab: MobileBottomSheetTab;
  onTabChange: (tab: MobileBottomSheetTab) => void;
  body: ReactNode;
}

export function MobileBottomSheet({ activeTab, onTabChange, body }: MobileBottomSheetProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  function handleTabClick(tab: MobileBottomSheetTab) {
    if (!isExpanded) {
      // Collapsed: expand and switch to clicked tab
      setIsExpanded(true);
      onTabChange(tab);
    } else if (tab === activeTab) {
      // Expanded and clicked active tab: collapse
      setIsExpanded(false);
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
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-label={isExpanded ? "Collapse panel" : "Expand panel"}
        aria-expanded={isExpanded}
      >
        <div className="h-1 w-10 rounded-full bg-slate-300" />
      </button>

      {/* Tab bar */}
      <div
        className="grid gap-1 border-b border-slate-100 px-2 pb-1"
        style={{ gridTemplateColumns: `repeat(${TABS.length}, minmax(0, 1fr))` }}
        role="tablist"
        aria-label="Mobile editor tabs"
      >
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            className={`min-h-9 rounded px-1 text-xs font-medium transition-colors ${
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

      {/* Body — only rendered when expanded */}
      {isExpanded && (
        <div className="overflow-y-auto p-2" style={{ maxHeight: "45vh" }}>
          {body}
        </div>
      )}
    </section>
  );
}
