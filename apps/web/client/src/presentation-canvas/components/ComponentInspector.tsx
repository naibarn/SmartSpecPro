import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getBuiltInPresentationComponentDefinition } from "@/lib/presentationComponentCatalog";
import { isPresentationGroupComponent, type PresentationComponentInstance } from "@/lib/presentationEditorState";
import {
  type BuiltInPresentationComponentId,
  getPresentationComponentSlotTextCapacity,
  measurePresentationTextUnits,
} from "@shared/presentation/componentRecipes";

interface ComponentInspectorProps {
  components: PresentationComponentInstance[];
  selectedComponentId: string | null;
  onSelectComponent: (componentId: string) => void;
  onUpdateTextSlot: (componentId: string, slotId: string, text: string) => void;
  onUpdateImageSlot: (componentId: string, slotId: string, src: string, alt: string) => void;
  onUpdateVideoSlot: (componentId: string, slotId: string, src: string, poster: string, title: string) => void;
  onUpdateListSlot: (componentId: string, slotId: string, items: string[]) => void;
  onDetachComponent: (componentId: string) => void;
  onDeleteComponent: (componentId: string) => void;
}

function getTextSlotValue(component: PresentationComponentInstance, slotId: string): string {
  const binding = component.slotBindings.find((slot) => slot.slotId === slotId && slot.type === "text");
  return binding?.type === "text" ? binding.text : "";
}

function getImageSlotValue(component: PresentationComponentInstance, slotId: string): { src: string; alt: string } {
  const binding = component.slotBindings.find((slot) => slot.slotId === slotId && slot.type === "image");
  return binding?.type === "image"
    ? { src: binding.src, alt: binding.alt ?? "" }
    : { src: "", alt: "" };
}

function getVideoSlotValue(component: PresentationComponentInstance, slotId: string): {
  src: string;
  poster: string;
  title: string;
} {
  const binding = component.slotBindings.find((slot) => slot.slotId === slotId && slot.type === "video");
  return binding?.type === "video"
    ? { src: binding.src, poster: binding.poster ?? "", title: binding.title ?? "" }
    : { src: "", poster: "", title: "" };
}

function getMediaSlotValue(component: PresentationComponentInstance, slotId: string): {
  kind: "image" | "video" | null;
  image: { src: string; alt: string };
  video: { src: string; poster: string; title: string };
} {
  const image = getImageSlotValue(component, slotId);
  if (image.src || image.alt) {
    return {
      kind: "image",
      image,
      video: { src: "", poster: "", title: "" },
    };
  }
  const video = getVideoSlotValue(component, slotId);
  if (video.src || video.poster || video.title) {
    return {
      kind: "video",
      image: { src: "", alt: "" },
      video,
    };
  }
  return {
    kind: null,
    image,
    video,
  };
}

function getListSlotValue(component: PresentationComponentInstance, slotId: string): string[] {
  const binding = component.slotBindings.find((slot) => slot.slotId === slotId && slot.type === "list");
  return binding?.type === "list" ? binding.items : [];
}

function getComponentInspectorMeta(component: PresentationComponentInstance): {
  label: string;
  category: string;
  description: string;
  accentColor: string;
  detachLabel: string;
} {
  const definition = getBuiltInPresentationComponentDefinition(component.componentId);
  if (definition) {
    return {
      label: definition.label,
      category: definition.category,
      description: definition.description,
      accentColor: definition.accentColor,
      detachLabel: "Detach",
    };
  }

  if (isPresentationGroupComponent(component)) {
    return {
      label: "Group",
      category: "Grouped elements",
      description: "Move, duplicate, and delete this grouped selection as one block, or ungroup it back into loose elements.",
      accentColor: "#0ea5e9",
      detachLabel: "Ungroup",
    };
  }

  return {
    label: component.componentId,
    category: "Component",
    description: "Custom component without editable slots.",
    accentColor: "#64748b",
    detachLabel: "Detach",
  };
}

function formatTextSlotCapacityHint(
  componentId: BuiltInPresentationComponentId,
  slotId: string,
  currentValue: string,
): string | null {
  const capacity = getPresentationComponentSlotTextCapacity(componentId, slotId);
  if (!capacity.maxTextUnits) {
    return null;
  }
  const parts: string[] = [];
  if (capacity.recommendedEnglishChars) {
    parts.push(`EN ~${capacity.recommendedEnglishChars}`);
  }
  if (capacity.recommendedThaiChars) {
    parts.push(`TH ~${capacity.recommendedThaiChars}`);
  }
  if (capacity.preferredLines) {
    parts.push(`${capacity.preferredLines} lines`);
  }
  const usedUnits = Math.round(measurePresentationTextUnits(currentValue));
  parts.push(`used ${usedUnits}/${capacity.maxTextUnits}`);
  return parts.join(" · ");
}

function formatListSlotCapacityHint(
  componentId: BuiltInPresentationComponentId,
  slotId: string,
  currentItems: string[],
): string | null {
  const capacity = getPresentationComponentSlotTextCapacity(componentId, slotId);
  if (!capacity.maxItems && !capacity.maxTextUnits) {
    return null;
  }
  const parts: string[] = [];
  if (capacity.maxItems) {
    parts.push(`${currentItems.length}/${capacity.maxItems} items`);
  }
  if (capacity.recommendedEnglishChars) {
    parts.push(`EN ~${capacity.recommendedEnglishChars}/item`);
  }
  if (capacity.recommendedThaiChars) {
    parts.push(`TH ~${capacity.recommendedThaiChars}/item`);
  }
  if (capacity.preferredLines) {
    parts.push(`${capacity.preferredLines} lines`);
  }
  return parts.join(" · ");
}

export function ComponentInspector({
  components,
  selectedComponentId,
  onSelectComponent,
  onUpdateTextSlot,
  onUpdateImageSlot,
  onUpdateVideoSlot,
  onUpdateListSlot,
  onDetachComponent,
  onDeleteComponent,
}: ComponentInspectorProps) {
  const [mediaEditorMode, setMediaEditorMode] = useState<Record<string, "image" | "video">>({});
  const selectedComponent = components.find((component) => component.id === selectedComponentId) ?? null;
  const selectedDefinition = selectedComponent
    ? getBuiltInPresentationComponentDefinition(selectedComponent.componentId)
    : null;
  const selectedMeta = selectedComponent ? getComponentInspectorMeta(selectedComponent) : null;

  if (!components.length) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-slate-300 bg-white p-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Components On Slide</p>
            <p className="mt-1 text-[11px] text-slate-500">Select a reusable block and edit its slots without flattening it into loose elements.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
            {components.length}
          </span>
        </div>
        <div className="mt-2 space-y-1.5">
          {components.map((component) => {
            const meta = getComponentInspectorMeta(component);
            const active = component.id === selectedComponentId;
            return (
              <button
                key={component.id}
                type="button"
                onClick={() => onSelectComponent(component.id)}
                className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                  active
                    ? "border-sky-400 bg-sky-50 text-sky-900"
                  : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white"
                }`}
                aria-label={`Select component ${meta.label}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{meta.label}</span>
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: meta.accentColor }}
                    aria-hidden="true"
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-500">{meta.category}</p>
              </button>
            );
          })}
        </div>
      </div>

      {selectedComponent && selectedMeta ? (
        <div className="rounded-md border border-slate-300 bg-white p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">{selectedMeta.label}</p>
              <p className="mt-1 text-xs text-slate-500">{selectedMeta.description}</p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => onDetachComponent(selectedComponent.id)}
                aria-label={`${selectedMeta.detachLabel} component ${selectedMeta.label} to elements`}
              >
                {selectedMeta.detachLabel}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => onDeleteComponent(selectedComponent.id)}
                aria-label={`Delete component ${selectedMeta.label}`}
              >
                Delete
              </Button>
            </div>
          </div>
          {selectedDefinition ? (
            <div className="mt-3 space-y-3">
            {selectedDefinition.slotDefinitions.map((slot) => {
              if (slot.type === "text") {
                const value = getTextSlotValue(selectedComponent, slot.id);
                const capacityHint = formatTextSlotCapacityHint(selectedComponent.componentId as BuiltInPresentationComponentId, slot.id, value);
                return (
                  <label key={slot.id} className="block space-y-1">
                    <div className="space-y-0.5">
                      <span className="text-xs font-medium text-slate-700">{slot.label}</span>
                      {capacityHint ? (
                        <p className="text-[11px] text-slate-500">{capacityHint}</p>
                      ) : null}
                    </div>
                    {slot.multiline ? (
                      <Textarea
                        value={value}
                        onChange={(event) => onUpdateTextSlot(selectedComponent.id, slot.id, event.target.value)}
                        placeholder={slot.placeholder ?? ""}
                        className="min-h-[92px] text-sm"
                        aria-label={`${selectedDefinition.label} ${slot.label}`}
                      />
                    ) : (
                      <Input
                        value={value}
                        onChange={(event) => onUpdateTextSlot(selectedComponent.id, slot.id, event.target.value)}
                        placeholder={slot.placeholder ?? ""}
                        className="h-9 text-sm"
                        aria-label={`${selectedDefinition.label} ${slot.label}`}
                      />
                    )}
                  </label>
                );
              }

              if (slot.type === "image") {
                const value = getImageSlotValue(selectedComponent, slot.id);
                return (
                  <div key={slot.id} className="space-y-1.5">
                    <p className="text-xs font-medium text-slate-700">{slot.label}</p>
                    <Input
                      value={value.src}
                      onChange={(event) => onUpdateImageSlot(selectedComponent.id, slot.id, event.target.value, value.alt)}
                      placeholder={slot.placeholder ?? "https://..."}
                      className="h-9 text-sm"
                      aria-label={`${selectedDefinition.label} ${slot.label} URL`}
                    />
                    <Input
                      value={value.alt}
                      onChange={(event) => onUpdateImageSlot(selectedComponent.id, slot.id, value.src, event.target.value)}
                      placeholder="Alt text"
                      className="h-9 text-sm"
                      aria-label={`${selectedDefinition.label} ${slot.label} Alt`}
                    />
                  </div>
                );
              }

              if (slot.type === "media") {
                const value = getMediaSlotValue(selectedComponent, slot.id);
                const mediaSlotKey = `${selectedComponent.id}:${slot.id}`;
                const activeMode = mediaEditorMode[mediaSlotKey]
                  ?? (value.kind === "video" ? "video" : "image");
                return (
                  <div key={slot.id} className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-slate-700">{slot.label}</p>
                      <div className="flex items-center gap-1">
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                          {value.kind === "video" ? "Video bound" : value.kind === "image" ? "Image bound" : "Image or Video"}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => {
                            if (value.kind === "video" || activeMode === "video") {
                              onUpdateVideoSlot(selectedComponent.id, slot.id, "", "", "");
                            } else {
                              onUpdateImageSlot(selectedComponent.id, slot.id, "", "");
                            }
                          }}
                        >
                          Clear
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant={activeMode === "image" ? "default" : "outline"}
                        className="h-7 px-2 text-[10px]"
                        onClick={() => setMediaEditorMode((current) => ({ ...current, [mediaSlotKey]: "image" }))}
                      >
                        Use Image
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={activeMode === "video" ? "default" : "outline"}
                        className="h-7 px-2 text-[10px]"
                        onClick={() => setMediaEditorMode((current) => ({ ...current, [mediaSlotKey]: "video" }))}
                      >
                        Use Video
                      </Button>
                    </div>
                    {activeMode === "image" ? (
                      <div className="space-y-1.5">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Image</p>
                      <Input
                        value={value.image.src}
                        onChange={(event) => onUpdateImageSlot(selectedComponent.id, slot.id, event.target.value, value.image.alt)}
                        placeholder={slot.placeholder ?? "https://..."}
                        className="h-9 text-sm"
                        aria-label={`${selectedDefinition.label} ${slot.label} Image URL`}
                      />
                      <Input
                        value={value.image.alt}
                        onChange={(event) => onUpdateImageSlot(selectedComponent.id, slot.id, value.image.src, event.target.value)}
                        placeholder={slot.altLabel ?? "Alt text"}
                        className="h-9 text-sm"
                        aria-label={`${selectedDefinition.label} ${slot.label} Image Alt`}
                      />
                    </div>
                    ) : null}
                    {activeMode === "video" ? (
                      <div className="space-y-1.5">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Video</p>
                      <Input
                        value={value.video.src}
                        onChange={(event) => onUpdateVideoSlot(selectedComponent.id, slot.id, event.target.value, value.video.poster, value.video.title)}
                        placeholder={slot.placeholder ?? "https://..."}
                        className="h-9 text-sm"
                        aria-label={`${selectedDefinition.label} ${slot.label} Video URL`}
                      />
                      <Input
                        value={value.video.poster}
                        onChange={(event) => onUpdateVideoSlot(selectedComponent.id, slot.id, value.video.src, event.target.value, value.video.title)}
                        placeholder={slot.posterLabel ?? "Poster URL"}
                        className="h-9 text-sm"
                        aria-label={`${selectedDefinition.label} ${slot.label} Poster`}
                      />
                      <Input
                        value={value.video.title}
                        onChange={(event) => onUpdateVideoSlot(selectedComponent.id, slot.id, value.video.src, value.video.poster, event.target.value)}
                        placeholder={slot.titleLabel ?? "Video title"}
                        className="h-9 text-sm"
                        aria-label={`${selectedDefinition.label} ${slot.label} Video Title`}
                      />
                    </div>
                    ) : null}
                  </div>
                );
              }

              if (slot.type === "video") {
                const value = getVideoSlotValue(selectedComponent, slot.id);
                return (
                  <div key={slot.id} className="space-y-1.5">
                    <p className="text-xs font-medium text-slate-700">{slot.label}</p>
                    <Input
                      value={value.src}
                      onChange={(event) => onUpdateVideoSlot(selectedComponent.id, slot.id, event.target.value, value.poster, value.title)}
                      placeholder={slot.placeholder ?? "https://..."}
                      className="h-9 text-sm"
                      aria-label={`${selectedDefinition.label} ${slot.label} URL`}
                    />
                    <Input
                      value={value.poster}
                      onChange={(event) => onUpdateVideoSlot(selectedComponent.id, slot.id, value.src, event.target.value, value.title)}
                      placeholder="Poster URL"
                      className="h-9 text-sm"
                      aria-label={`${selectedDefinition.label} ${slot.label} Poster`}
                    />
                    <Input
                      value={value.title}
                      onChange={(event) => onUpdateVideoSlot(selectedComponent.id, slot.id, value.src, value.poster, event.target.value)}
                      placeholder="Video title"
                      className="h-9 text-sm"
                      aria-label={`${selectedDefinition.label} ${slot.label} Title`}
                    />
                  </div>
                );
              }

              const value = getListSlotValue(selectedComponent, slot.id);
              const capacityHint = formatListSlotCapacityHint(selectedComponent.componentId as BuiltInPresentationComponentId, slot.id, value);
              return (
                <label key={slot.id} className="block space-y-1">
                  <div className="space-y-0.5">
                    <span className="text-xs font-medium text-slate-700">{slot.label}</span>
                    {capacityHint ? (
                      <p className="text-[11px] text-slate-500">{capacityHint}</p>
                    ) : null}
                  </div>
                  <Textarea
                    value={value.join("\n")}
                    onChange={(event) => onUpdateListSlot(
                      selectedComponent.id,
                      slot.id,
                      event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
                    )}
                    placeholder={slot.placeholder ?? "One item per line"}
                    className="min-h-[100px] text-sm"
                    aria-label={`${selectedDefinition.label} ${slot.label}`}
                  />
                </label>
              );
            })}
            </div>
          ) : (
            <div className="mt-3 rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
              {isPresentationGroupComponent(selectedComponent)
                ? "This group has no editable slots. Ungroup it to edit the individual elements."
                : "This component has no editable slots."}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-500">
          Select a component to edit its text, list, and image slots.
        </div>
      )}
    </div>
  );
}
