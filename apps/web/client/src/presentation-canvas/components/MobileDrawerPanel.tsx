import { useState, type ReactNode } from "react";
import {
  Clapperboard,
  Crop,
  ImageIcon,
  LayoutTemplate,
  Minus,
  RectangleHorizontal,
  Type,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PresentationCustomBlockDefinition } from "@/lib/presentationCustomBlocks";
import type { BuiltInPresentationComponentId } from "@/lib/presentationComponentCatalog";
import type { PresentationElementType } from "@/lib/presentationEditorState";
import {
  PRESENTATION_BLOCK_PRESETS,
  type PresentationBlockPresetId,
} from "@/lib/presentationBlockPresets";

type DrawerTab = "Slides" | "Add";

interface MobileDrawerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  slidesPanel: ReactNode;
  onAddElement: (type: PresentationElementType) => void;
  onInsertBlockPreset: (presetId: PresentationBlockPresetId) => void;
  onInsertComponent?: (componentId: BuiltInPresentationComponentId) => void;
  customBlocks?: PresentationCustomBlockDefinition[];
  onInsertCustomBlock?: (blockId: string) => void;
  snapLockEnabled: boolean;
  onToggleSnapLock: () => void;
}

export function MobileDrawerPanel({
  isOpen,
  onClose,
  slidesPanel,
  onAddElement,
  onInsertBlockPreset,
  onInsertComponent,
  customBlocks = [],
  onInsertCustomBlock,
  snapLockEnabled,
  onToggleSnapLock,
}: MobileDrawerPanelProps) {
  const [activeTab, setActiveTab] = useState<DrawerTab>("Slides");

  function handleAddElement(type: PresentationElementType) {
    onAddElement(type);
    onClose();
  }

  function handleInsertBlockPreset(presetId: PresentationBlockPresetId) {
    onInsertBlockPreset(presetId);
    onClose();
  }

  function handleInsertComponent(componentId: BuiltInPresentationComponentId) {
    onInsertComponent?.(componentId);
    onClose();
  }

  function handleInsertCustomBlock(blockId: string) {
    onInsertCustomBlock?.(blockId);
    onClose();
  }

  function getInsertAriaLabel(label: string): string {
    return label.trim().toLowerCase().endsWith("block")
      ? label
      : `${label} Block`;
  }

  const mobileBlocks = PRESENTATION_BLOCK_PRESETS;
  const mobileCustomBlocks = customBlocks.slice(0, 4);

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
                  onClick={() => handleAddElement("text")}
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
                  onClick={() => handleAddElement("image")}
                  size="sm"
                  variant="secondary"
                  className="gap-1 text-xs"
                  aria-label="Upload Image Element"
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  Upload Img
                </Button>
                <Button
                  type="button"
                  onClick={() => handleAddElement("video")}
                  size="sm"
                  variant="secondary"
                  className="gap-1 text-xs"
                  aria-label="Upload Video Element"
                >
                  <Clapperboard className="h-3.5 w-3.5" />
                  Upload Vid
                </Button>
                <Button
                  type="button"
                  onClick={() => handleAddElement("rect")}
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
                  onClick={() => handleAddElement("line")}
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

              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <LayoutTemplate className="h-3.5 w-3.5" />
                  Blocks
                </div>
                {mobileCustomBlocks.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Saved Blocks</p>
                    <div className="grid grid-cols-2 gap-2">
                      {mobileCustomBlocks.map((block) => (
                        <Button
                          key={`custom-${block.id}`}
                          type="button"
                          size="sm"
                          className="h-auto min-h-8 gap-1 whitespace-normal px-2 py-1 text-center text-[11px] leading-tight"
                          onClick={() => handleInsertCustomBlock(block.id)}
                          aria-label={`Insert Editable ${getInsertAriaLabel(block.label)}`}
                        >
                          {block.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {onInsertComponent ? (
                  <div className="grid grid-cols-2 gap-2">
                    {mobileBlocks.map((preset) => (
                      <Button
                        key={`editable-${preset.id}`}
                        type="button"
                        size="sm"
                        className="h-auto min-h-8 gap-1 whitespace-normal px-2 py-1 text-center text-[11px] leading-tight"
                        onClick={() => handleInsertComponent(preset.id)}
                        aria-label={`Insert Editable ${getInsertAriaLabel(preset.label)}`}
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  {mobileBlocks.map((preset) => (
                    <Button
                      key={`elements-${preset.id}`}
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-auto min-h-8 gap-1 whitespace-normal px-2 py-1 text-center text-[11px] leading-tight"
                      onClick={() => handleInsertBlockPreset(preset.id)}
                      aria-label={`Insert ${getInsertAriaLabel(preset.label)}`}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
