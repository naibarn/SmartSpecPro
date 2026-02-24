import { useState, type ReactNode } from "react";
import {
  Clapperboard,
  Crop,
  ImageIcon,
  Minus,
  RectangleHorizontal,
  Type,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PresentationElementType } from "@/lib/presentationEditorState";

type DrawerTab = "Slides" | "Add";

interface MobileDrawerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  slidesPanel: ReactNode;
  onAddElement: (type: PresentationElementType) => void;
  snapLockEnabled: boolean;
  onToggleSnapLock: () => void;
}

export function MobileDrawerPanel({
  isOpen,
  onClose,
  slidesPanel,
  onAddElement,
  snapLockEnabled,
  onToggleSnapLock,
}: MobileDrawerPanelProps) {
  const [activeTab, setActiveTab] = useState<DrawerTab>("Slides");

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 ${
          isOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-in panel */}
      <div
        className={`fixed inset-y-0 left-0 z-50 flex h-full w-[85vw] max-w-[340px] flex-col bg-white shadow-xl transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Editor Tools Panel"
      >
        {/* Panel header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">Editor Tools</h2>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-slate-500 hover:bg-slate-100"
            onClick={onClose}
            aria-label="Close Tools Panel"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Tab bar */}
        <div className="flex shrink-0 gap-1 border-b border-slate-200 px-3 pt-2">
          {(["Slides", "Add"] as DrawerTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              className={`rounded-t px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "border-b-2 border-sky-500 text-sky-700"
                  : "text-slate-500 hover:text-slate-700"
              }`}
              onClick={() => setActiveTab(tab)}
              aria-selected={activeTab === tab}
              role="tab"
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab body */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {activeTab === "Slides" ? (
            <div className="h-full overflow-hidden p-3">
              {slidesPanel}
            </div>
          ) : (
            <div className="overflow-y-auto p-3">
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  onClick={() => onAddElement("text")}
                  size="sm"
                  variant="secondary"
                  className="gap-1 text-xs"
                  aria-label="Add Text Element"
                >
                  <Type className="h-3.5 w-3.5" />
                  Text
                </Button>
                <Button
                  type="button"
                  onClick={() => onAddElement("image")}
                  size="sm"
                  variant="secondary"
                  className="gap-1 text-xs"
                  aria-label="Add Image Element"
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  Image
                </Button>
                <Button
                  type="button"
                  onClick={() => onAddElement("video")}
                  size="sm"
                  variant="secondary"
                  className="gap-1 text-xs"
                  aria-label="Add Video Element"
                >
                  <Clapperboard className="h-3.5 w-3.5" />
                  Video
                </Button>
                <Button
                  type="button"
                  onClick={() => onAddElement("rect")}
                  size="sm"
                  variant="secondary"
                  className="gap-1 text-xs"
                  aria-label="Add Rectangle Element"
                >
                  <RectangleHorizontal className="h-3.5 w-3.5" />
                  Rect
                </Button>
                <Button
                  type="button"
                  onClick={() => onAddElement("line")}
                  size="sm"
                  variant="secondary"
                  className="gap-1 text-xs"
                  aria-label="Add Line Element"
                >
                  <Minus className="h-3.5 w-3.5" />
                  Line
                </Button>
                <Button
                  type="button"
                  onClick={onToggleSnapLock}
                  size="sm"
                  variant={snapLockEnabled ? "default" : "outline"}
                  className="gap-1 text-xs"
                  aria-label={snapLockEnabled ? "Disable Snap Lock" : "Enable Snap Lock"}
                >
                  <Crop className="h-3.5 w-3.5" />
                  {snapLockEnabled ? "Snap On" : "Snap Off"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
