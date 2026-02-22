import type { PresentationElement } from "@/lib/presentationEditorState";

interface CanvasObjectsProps {
  elements: PresentationElement[];
  selectedElementIds: string[];
  onSelectElement: (elementId: string, options?: { additive?: boolean }) => void;
}

function getElementDisplayText(element: PresentationElement): string {
  if (element.type === "text") {
    return element.text || "Text";
  }

  if (element.type === "image") {
    return element.alt || "Image";
  }

  return element.type;
}

export function CanvasObjects({ elements, selectedElementIds, onSelectElement }: CanvasObjectsProps) {
  if (!elements.length) {
    return (
      <p className="text-sm text-muted-foreground">No elements on this slide yet.</p>
    );
  }

  return (
    <ul className="space-y-2">
      {elements.map((element, index) => (
        <li key={element.id}>
          <button
            type="button"
            className={`w-full rounded border px-2 py-1 text-left text-sm ${
              selectedElementIds.includes(element.id) ? "border-primary bg-primary/10" : ""
            }`}
            onClick={(event) => onSelectElement(element.id, { additive: event.shiftKey })}
            aria-label={`Select canvas element ${index + 1}`}
          >
            {index + 1}. {getElementDisplayText(element)} ({element.type})
          </button>
        </li>
      ))}
    </ul>
  );
}
