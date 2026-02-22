import type { ReactNode } from "react";

const TABS = ["Add", "Layers", "Properties", "Pages"] as const;

export type MobileBottomSheetTab = typeof TABS[number];

interface MobileBottomSheetProps {
  activeTab: MobileBottomSheetTab;
  onTabChange: (tab: MobileBottomSheetTab) => void;
  body: ReactNode;
}

export function MobileBottomSheet({ activeTab, onTabChange, body }: MobileBottomSheetProps) {
  return (
    <section className="rounded border bg-card p-2 space-y-2" data-testid="mobile-bottom-sheet">
      <div className="grid grid-cols-4 gap-1" role="tablist" aria-label="Mobile editor tabs">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            className={`min-h-10 rounded border px-2 text-xs ${activeTab === tab ? "border-primary bg-primary/10" : ""}`}
            aria-selected={activeTab === tab}
            onClick={() => onTabChange(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
      <div>{body}</div>
    </section>
  );
}
