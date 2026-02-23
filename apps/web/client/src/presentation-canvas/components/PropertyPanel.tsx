import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { PresentationElement, PresentationElementPatch } from "@/lib/presentationEditorState";

interface PropertyPanelProps {
  selectedElement: PresentationElement | null;
  onPatchSelected: (patch: PresentationElementPatch) => void;
}

interface TextPresetDefinition {
  id: string;
  label: string;
  ariaLabel: string;
  patch: PresentationElementPatch;
}

const TEXT_STYLE_PRESETS: TextPresetDefinition[] = [
  {
    id: "heading",
    label: "Heading",
    ariaLabel: "Apply Heading Text Preset",
    patch: {
      fontSize: 64,
      fontWeight: "700",
      fontStyle: "normal",
      textDecoration: "none",
      textAlign: "left",
      lineHeight: 1.1,
      letterSpacing: 0,
      backgroundColor: "transparent",
    },
  },
  {
    id: "subheading",
    label: "Subheading",
    ariaLabel: "Apply Subheading Text Preset",
    patch: {
      fontSize: 44,
      fontWeight: "600",
      fontStyle: "normal",
      textDecoration: "none",
      textAlign: "left",
      lineHeight: 1.2,
      letterSpacing: 0,
      backgroundColor: "transparent",
    },
  },
  {
    id: "body",
    label: "Body",
    ariaLabel: "Apply Body Text Preset",
    patch: {
      fontSize: 32,
      fontWeight: "500",
      fontStyle: "normal",
      textDecoration: "none",
      textAlign: "left",
      lineHeight: 1.35,
      letterSpacing: 0,
      backgroundColor: "transparent",
    },
  },
  {
    id: "citation",
    label: "Citation",
    ariaLabel: "Apply Citation Text Preset",
    patch: {
      fontSize: 26,
      fontWeight: "500",
      fontStyle: "italic",
      textDecoration: "none",
      textAlign: "right",
      lineHeight: 1.3,
      letterSpacing: 0.1,
      backgroundColor: "transparent",
    },
  },
];

function parseNumberInput(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toColorInputValue(value: string, fallback: string): string {
  const candidate = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(candidate)) {
    return candidate;
  }
  if (/^#[0-9a-fA-F]{3}$/.test(candidate)) {
    return `#${candidate.slice(1).split("").map((char) => `${char}${char}`).join("")}`;
  }
  return fallback;
}

interface ColorFieldProps {
  label: string;
  textAriaLabel: string;
  pickerAriaLabel: string;
  value: string;
  fallback: string;
  onChange: (next: string) => void;
}

function ColorField({
  label,
  textAriaLabel,
  pickerAriaLabel,
  value,
  fallback,
  onChange,
}: ColorFieldProps) {
  return (
    <label className="block text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <Input
          aria-label={textAriaLabel}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <Input
          aria-label={pickerAriaLabel}
          type="color"
          className="h-10 w-14 rounded-md p-1"
          value={toColorInputValue(value, fallback)}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </label>
  );
}

export function PropertyPanel({ selectedElement, onPatchSelected }: PropertyPanelProps) {
  if (!selectedElement) {
    return <p className="text-sm text-muted-foreground">Select an element to edit properties.</p>;
  }

  return (
    <div className="space-y-2" data-testid="canvas-property-panel">
      <label className="block text-sm">
        <span className="text-muted-foreground">X</span>
        <Input
          aria-label="Element X"
          type="number"
          value={selectedElement.x}
          onChange={(event) =>
            onPatchSelected({
              x: parseNumberInput(event.target.value, selectedElement.x),
            })
          }
        />
      </label>
      <label className="block text-sm">
        <span className="text-muted-foreground">Y</span>
        <Input
          aria-label="Element Y"
          type="number"
          value={selectedElement.y}
          onChange={(event) =>
            onPatchSelected({
              y: parseNumberInput(event.target.value, selectedElement.y),
            })
          }
        />
      </label>
      <label className="block text-sm">
        <span className="text-muted-foreground">Width</span>
        <Input
          aria-label="Element Width"
          type="number"
          value={selectedElement.width}
          onChange={(event) =>
            onPatchSelected({
              width: parseNumberInput(event.target.value, selectedElement.width),
            })
          }
        />
      </label>
      <label className="block text-sm">
        <span className="text-muted-foreground">Height</span>
        <Input
          aria-label="Element Height"
          type="number"
          value={selectedElement.height}
          onChange={(event) =>
            onPatchSelected({
              height: parseNumberInput(event.target.value, selectedElement.height),
            })
          }
        />
      </label>
      <label className="block text-sm">
        <span className="text-muted-foreground">Rotation (deg)</span>
        <Input
          aria-label="Element Rotation"
          type="number"
          value={selectedElement.rotation ?? 0}
          onChange={(event) =>
            onPatchSelected({
              rotation: parseNumberInput(event.target.value, selectedElement.rotation ?? 0),
            })
          }
        />
      </label>
      {selectedElement.type === "text" && (
        <>
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Text Presets</p>
            <div className="grid grid-cols-2 gap-2">
              {TEXT_STYLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  aria-label={preset.ariaLabel}
                  className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  onClick={() => onPatchSelected(preset.patch)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          <label className="block text-sm">
            <span className="text-muted-foreground">Text</span>
            <Textarea
              aria-label="Text Content"
              value={selectedElement.text}
              onChange={(event) => onPatchSelected({ text: event.target.value } as PresentationElementPatch)}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm">
              <span className="text-muted-foreground">Font Size</span>
              <Input
                aria-label="Text Font Size"
                type="number"
                min={8}
                step={1}
                value={selectedElement.fontSize ?? 48}
                onChange={(event) =>
                  onPatchSelected({
                    fontSize: parseNumberInput(event.target.value, selectedElement.fontSize ?? 48),
                  } as PresentationElementPatch)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">Font Family</span>
              <Input
                aria-label="Text Font Family"
                value={selectedElement.fontFamily || "Inter, system-ui, sans-serif"}
                onChange={(event) => onPatchSelected({ fontFamily: event.target.value } as PresentationElementPatch)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">Weight</span>
              <select
                aria-label="Text Font Weight"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedElement.fontWeight || "600"}
                onChange={(event) => onPatchSelected({ fontWeight: event.target.value as any } as PresentationElementPatch)}
              >
                <option value="normal">Normal</option>
                <option value="500">Medium</option>
                <option value="600">Semi Bold</option>
                <option value="700">Bold</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">Style</span>
              <select
                aria-label="Text Font Style"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedElement.fontStyle || "normal"}
                onChange={(event) => onPatchSelected({ fontStyle: event.target.value as any } as PresentationElementPatch)}
              >
                <option value="normal">Normal</option>
                <option value="italic">Italic</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">Decoration</span>
              <select
                aria-label="Text Decoration"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedElement.textDecoration || "none"}
                onChange={(event) => onPatchSelected({ textDecoration: event.target.value as any } as PresentationElementPatch)}
              >
                <option value="none">None</option>
                <option value="underline">Underline</option>
                <option value="line-through">Line Through</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">Align</span>
              <select
                aria-label="Text Align"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedElement.textAlign || "left"}
                onChange={(event) => onPatchSelected({ textAlign: event.target.value as any } as PresentationElementPatch)}
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
                <option value="justify">Justify</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">Line Height</span>
              <Input
                aria-label="Text Line Height"
                type="number"
                min={0.6}
                max={4}
                step={0.05}
                value={selectedElement.lineHeight ?? 1.25}
                onChange={(event) =>
                  onPatchSelected({
                    lineHeight: parseNumberInput(event.target.value, selectedElement.lineHeight ?? 1.25),
                  } as PresentationElementPatch)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">Letter Spacing</span>
              <Input
                aria-label="Text Letter Spacing"
                type="number"
                min={-20}
                max={100}
                step={0.1}
                value={selectedElement.letterSpacing ?? 0}
                onChange={(event) =>
                  onPatchSelected({
                    letterSpacing: parseNumberInput(event.target.value, selectedElement.letterSpacing ?? 0),
                  } as PresentationElementPatch)}
              />
            </label>
          </div>
          <ColorField
            label="Text Color"
            textAriaLabel="Text Color"
            pickerAriaLabel="Text Color Picker"
            value={selectedElement.color}
            fallback="#111827"
            onChange={(next) => onPatchSelected({ color: next } as PresentationElementPatch)}
          />
          <ColorField
            label="Text Background"
            textAriaLabel="Text Background Color"
            pickerAriaLabel="Text Background Color Picker"
            value={selectedElement.backgroundColor || "transparent"}
            fallback="#ffffff"
            onChange={(next) => onPatchSelected({ backgroundColor: next } as PresentationElementPatch)}
          />
        </>
      )}
      {selectedElement.type === "image" && (
        <>
          <label className="block text-sm">
            <span className="text-muted-foreground">Image URL</span>
            <Input
              aria-label="Image URL"
              value={selectedElement.src}
              readOnly
              className="cursor-default bg-slate-100 text-slate-700"
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted-foreground">Image Name</span>
            <Input
              aria-label="Image Alt Text"
              value={selectedElement.alt}
              readOnly
              className="cursor-default bg-slate-100 text-slate-700"
            />
          </label>
        </>
      )}
      {selectedElement.type === "video" && (
        <>
          <label className="block text-sm">
            <span className="text-muted-foreground">Video URL</span>
            <Input
              aria-label="Video URL"
              value={selectedElement.src}
              onChange={(event) => onPatchSelected({ src: event.target.value } as PresentationElementPatch)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted-foreground">Poster URL</span>
            <Input
              aria-label="Video Poster URL"
              value={selectedElement.poster || ""}
              onChange={(event) => onPatchSelected({ poster: event.target.value } as PresentationElementPatch)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted-foreground">Title</span>
            <Input
              aria-label="Video Title"
              value={selectedElement.title || ""}
              onChange={(event) => onPatchSelected({ title: event.target.value } as PresentationElementPatch)}
            />
          </label>
        </>
      )}
      {selectedElement.type === "rect" && (
        <>
          <ColorField
            label="Fill Color"
            textAriaLabel="Rectangle Fill"
            pickerAriaLabel="Rectangle Fill Picker"
            value={selectedElement.fill}
            fallback="#93c5fd"
            onChange={(next) => onPatchSelected({ fill: next } as PresentationElementPatch)}
          />
          <ColorField
            label="Border Color"
            textAriaLabel="Rectangle Border"
            pickerAriaLabel="Rectangle Border Picker"
            value={selectedElement.stroke || "#2563eb"}
            fallback="#2563eb"
            onChange={(next) => onPatchSelected({ stroke: next } as PresentationElementPatch)}
          />
          <label className="block text-sm">
            <span className="text-muted-foreground">Border Width</span>
            <Input
              aria-label="Rectangle Border Width"
              type="number"
              min={0}
              step={1}
              value={selectedElement.strokeWidth ?? 2}
              onChange={(event) =>
                onPatchSelected({
                  strokeWidth: parseNumberInput(event.target.value, selectedElement.strokeWidth ?? 2),
                } as PresentationElementPatch)}
            />
          </label>
        </>
      )}
      {selectedElement.type === "line" && (
        <>
          <ColorField
            label="Background Color"
            textAriaLabel="Line Fill"
            pickerAriaLabel="Line Fill Picker"
            value={selectedElement.fill || "transparent"}
            fallback="#ffffff"
            onChange={(next) => onPatchSelected({ fill: next } as PresentationElementPatch)}
          />
          <ColorField
            label="Border Color"
            textAriaLabel="Line Stroke"
            pickerAriaLabel="Line Stroke Picker"
            value={selectedElement.stroke}
            fallback="#1f2937"
            onChange={(next) => onPatchSelected({ stroke: next } as PresentationElementPatch)}
          />
          <label className="block text-sm">
            <span className="text-muted-foreground">Border Width</span>
            <Input
              aria-label="Line Stroke Width"
              type="number"
              value={selectedElement.strokeWidth}
              onChange={(event) =>
                onPatchSelected({
                  strokeWidth: parseNumberInput(event.target.value, selectedElement.strokeWidth),
                } as PresentationElementPatch)
              }
            />
          </label>
        </>
      )}
    </div>
  );
}
