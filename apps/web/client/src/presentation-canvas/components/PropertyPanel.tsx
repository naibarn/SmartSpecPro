import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { PresentationElement, PresentationElementPatch } from "@/lib/presentationEditorState";

interface PropertyPanelProps {
  selectedElement: PresentationElement | null;
  onPatchSelected: (patch: PresentationElementPatch) => void;
}

function parseNumberInput(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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
      {selectedElement.type === "text" && (
        <>
          <label className="block text-sm">
            <span className="text-muted-foreground">Text</span>
            <Textarea
              aria-label="Text Content"
              value={selectedElement.text}
              onChange={(event) => onPatchSelected({ text: event.target.value } as PresentationElementPatch)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted-foreground">Color</span>
            <Input
              aria-label="Text Color"
              value={selectedElement.color}
              onChange={(event) => onPatchSelected({ color: event.target.value } as PresentationElementPatch)}
            />
          </label>
        </>
      )}
      {selectedElement.type === "image" && (
        <>
          <label className="block text-sm">
            <span className="text-muted-foreground">Image URL</span>
            <Input
              aria-label="Image URL"
              value={selectedElement.src}
              onChange={(event) => onPatchSelected({ src: event.target.value } as PresentationElementPatch)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted-foreground">Alt Text</span>
            <Input
              aria-label="Image Alt Text"
              value={selectedElement.alt}
              onChange={(event) => onPatchSelected({ alt: event.target.value } as PresentationElementPatch)}
            />
          </label>
        </>
      )}
      {selectedElement.type === "rect" && (
        <label className="block text-sm">
          <span className="text-muted-foreground">Fill Color</span>
          <Input
            aria-label="Rectangle Fill"
            value={selectedElement.fill}
            onChange={(event) => onPatchSelected({ fill: event.target.value } as PresentationElementPatch)}
          />
        </label>
      )}
      {selectedElement.type === "line" && (
        <>
          <label className="block text-sm">
            <span className="text-muted-foreground">Stroke</span>
            <Input
              aria-label="Line Stroke"
              value={selectedElement.stroke}
              onChange={(event) => onPatchSelected({ stroke: event.target.value } as PresentationElementPatch)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted-foreground">Stroke Width</span>
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
