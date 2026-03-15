import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CANVAS_LIBRARY_ASSET_DRAG_MIME } from "../CanvasStage";
import { ComponentCanvasOverlay } from "./ComponentCanvasOverlay";

function renderOverlay() {
  const onSelectSlot = vi.fn();
  const onMoveComponent = vi.fn();
  const onResizeComponent = vi.fn();
  const onResizeSlot = vi.fn();
  const onEndComponentDrag = vi.fn();

  render(
    <div style={{ position: "relative", width: 1280, height: 720 }}>
      <ComponentCanvasOverlay
        component={{
          id: "component-1",
          componentId: "process-steps",
          componentType: "built-in",
          definitionRevision: 1,
          slotBindings: [
            { slotId: "title", type: "text", text: "Bedtime routine" },
          ],
          fallbackElements: [],
        }}
        componentLabel="Process Steps"
        interactionScale={1}
        componentBounds={{ x: 120, y: 90, width: 520, height: 320 }}
        slotAreas={[
          {
            slotId: "title",
            label: "Title",
            type: "text",
            multiline: true,
            targetElementIds: ["component-1::title"],
            bounds: { x: 150, y: 130, width: 320, height: 110 },
          },
        ]}
        activeSlotId={null}
        onSelectSlot={onSelectSlot}
        onClearSlot={vi.fn()}
        onMoveComponent={onMoveComponent}
        onResizeComponent={onResizeComponent}
        onResizeSlot={onResizeSlot}
        onEndComponentDrag={onEndComponentDrag}
        onUpdateTextSlot={vi.fn()}
        onUpdateImageSlot={vi.fn()}
        onUpdateVideoSlot={vi.fn()}
        onUpdateListSlot={vi.fn()}
      />
    </div>,
  );

  return {
    onSelectSlot,
    onMoveComponent,
    onResizeComponent,
    onResizeSlot,
    onEndComponentDrag,
  };
}

describe("ComponentCanvasOverlay", () => {
  it("keeps slot click behavior for editing without dragging", () => {
    const { onSelectSlot } = renderOverlay();

    fireEvent.click(screen.getByTestId("component-slot-overlay-title"));

    expect(onSelectSlot).toHaveBeenCalledWith("title");
  });

  it("moves the component when dragging from the overlay frame", () => {
    const { onMoveComponent, onEndComponentDrag } = renderOverlay();

    fireEvent.pointerDown(screen.getByTestId("component-overlay-drag-surface"), {
      button: 0,
      pointerId: 11,
      clientX: 180,
      clientY: 160,
    });
    fireEvent.pointerMove(window, {
      pointerId: 11,
      clientX: 212,
      clientY: 188,
    });
    fireEvent.pointerUp(window, { pointerId: 11 });

    expect(onMoveComponent).toHaveBeenCalledWith(32, 28);
    expect(onEndComponentDrag).toHaveBeenCalled();
  });

  it("treats slot dragging as component movement instead of a slot click", () => {
    const { onSelectSlot, onMoveComponent, onEndComponentDrag } = renderOverlay();
    const slot = screen.getByTestId("component-slot-overlay-title");

    fireEvent.pointerDown(slot, {
      button: 0,
      pointerId: 17,
      clientX: 240,
      clientY: 180,
    });
    fireEvent.pointerMove(window, {
      pointerId: 17,
      clientX: 268,
      clientY: 214,
    });
    fireEvent.pointerUp(window, { pointerId: 17 });
    fireEvent.click(slot);

    expect(onMoveComponent).toHaveBeenCalled();
    expect(onEndComponentDrag).toHaveBeenCalled();
    expect(onSelectSlot).not.toHaveBeenCalled();
  });

  it("resizes the component from the right edge handle", () => {
    const { onResizeComponent, onEndComponentDrag } = renderOverlay();

    fireEvent.pointerDown(screen.getByLabelText("Resize Process Steps wider"), {
      button: 0,
      pointerId: 21,
      clientX: 640,
      clientY: 250,
    });
    fireEvent.pointerMove(window, {
      pointerId: 21,
      clientX: 700,
      clientY: 250,
    });
    fireEvent.pointerUp(window, { pointerId: 21 });

    expect(onResizeComponent).toHaveBeenCalledWith(580, 320);
    expect(onEndComponentDrag).toHaveBeenCalled();
  });

  it("resizes the component from the bottom edge handle", () => {
    const { onResizeComponent, onEndComponentDrag } = renderOverlay();

    fireEvent.pointerDown(screen.getByLabelText("Resize Process Steps taller"), {
      button: 0,
      pointerId: 22,
      clientX: 380,
      clientY: 410,
    });
    fireEvent.pointerMove(window, {
      pointerId: 22,
      clientX: 380,
      clientY: 474,
    });
    fireEvent.pointerUp(window, { pointerId: 22 });

    expect(onResizeComponent).toHaveBeenCalledWith(520, 384);
    expect(onEndComponentDrag).toHaveBeenCalled();
  });

  it("resizes the component from the bottom-right corner handle", () => {
    const { onResizeComponent, onEndComponentDrag } = renderOverlay();

    fireEvent.pointerDown(screen.getByLabelText("Resize Process Steps"), {
      button: 0,
      pointerId: 23,
      clientX: 640,
      clientY: 410,
    });
    fireEvent.pointerMove(window, {
      pointerId: 23,
      clientX: 688,
      clientY: 458,
    });
    fireEvent.pointerUp(window, { pointerId: 23 });

    expect(onResizeComponent).toHaveBeenCalledWith(568, 368);
    expect(onEndComponentDrag).toHaveBeenCalled();
  });

  it("resizes the active slot from the right edge handle", () => {
    const onSelectSlot = vi.fn();
    const onResizeSlot = vi.fn();

    render(
      <div style={{ position: "relative", width: 1280, height: 720 }}>
        <ComponentCanvasOverlay
          component={{
            id: "component-1",
            componentId: "process-steps",
            componentType: "built-in",
            definitionRevision: 1,
            slotBindings: [{ slotId: "title", type: "text", text: "Bedtime routine" }],
            fallbackElements: [],
          }}
          componentLabel="Process Steps"
          interactionScale={1}
          componentBounds={{ x: 120, y: 90, width: 520, height: 320 }}
          slotAreas={[
            {
              slotId: "title",
              label: "Title",
              type: "text",
              multiline: true,
              targetElementIds: ["component-1::title"],
              bounds: { x: 150, y: 130, width: 320, height: 110 },
            },
          ]}
          activeSlotId="title"
          onSelectSlot={onSelectSlot}
          onClearSlot={vi.fn()}
          onMoveComponent={vi.fn()}
          onResizeComponent={vi.fn()}
          onResizeSlot={onResizeSlot}
          onEndComponentDrag={vi.fn()}
          onUpdateTextSlot={vi.fn()}
          onUpdateImageSlot={vi.fn()}
          onUpdateVideoSlot={vi.fn()}
          onUpdateListSlot={vi.fn()}
        />
      </div>,
    );

    fireEvent.pointerDown(screen.getByLabelText("Resize Title slot wider"), {
      button: 0,
      pointerId: 30,
      clientX: 470,
      clientY: 185,
    });
    fireEvent.pointerMove(window, {
      pointerId: 30,
      clientX: 518,
      clientY: 185,
    });
    fireEvent.pointerUp(window, { pointerId: 30 });

    expect(onResizeSlot).toHaveBeenCalledWith("title", 368, 110);
  });

  it("routes dropped image and video assets into a mixed media slot", () => {
    const onPickImageAsset = vi.fn();
    const onPickVideoAsset = vi.fn();

    render(
      <div style={{ position: "relative", width: 1280, height: 720 }}>
        <ComponentCanvasOverlay
          component={{
            id: "component-1",
            componentId: "a4-photo-grid",
            componentType: "built-in",
            definitionRevision: 1,
            slotBindings: [{ slotId: "hero-photo", type: "image", src: "", alt: "" }],
            fallbackElements: [],
          }}
          componentLabel="Multi-Photo Board"
          interactionScale={1}
          componentBounds={{ x: 120, y: 90, width: 520, height: 320 }}
          slotAreas={[
            {
              slotId: "hero-photo",
              label: "Hero Media",
              type: "media",
              targetElementIds: ["component-1::hero-frame"],
              bounds: { x: 150, y: 130, width: 220, height: 180 },
            },
          ]}
          activeSlotId={null}
          onSelectSlot={vi.fn()}
          onClearSlot={vi.fn()}
          onMoveComponent={vi.fn()}
          onResizeComponent={vi.fn()}
          onResizeSlot={vi.fn()}
          onEndComponentDrag={vi.fn()}
          onUpdateTextSlot={vi.fn()}
          onUpdateImageSlot={vi.fn()}
          onUpdateVideoSlot={vi.fn()}
          onUpdateListSlot={vi.fn()}
          onPickImageAsset={onPickImageAsset}
          onPickVideoAsset={onPickVideoAsset}
        />
      </div>,
    );

    const slot = screen.getByTestId("component-slot-overlay-hero-photo");
    const imageTransfer = {
      getData: (type: string) => type === CANVAS_LIBRARY_ASSET_DRAG_MIME
        ? JSON.stringify({ id: 1, kind: "image", title: "Hero still", sourceUrl: "https://cdn.example.com/hero.png" })
        : "",
    };
    fireEvent.dragOver(slot, { dataTransfer: imageTransfer });
    fireEvent.drop(slot, { dataTransfer: imageTransfer });

    expect(onPickImageAsset).toHaveBeenCalledWith("hero-photo", expect.objectContaining({
      kind: "image",
      sourceUrl: "https://cdn.example.com/hero.png",
    }));

    const videoTransfer = {
      getData: (type: string) => type === CANVAS_LIBRARY_ASSET_DRAG_MIME
        ? JSON.stringify({ id: 2, kind: "video", title: "Hero reel", sourceUrl: "https://cdn.example.com/hero.mp4" })
        : "",
    };
    fireEvent.dragOver(slot, { dataTransfer: videoTransfer });
    fireEvent.drop(slot, { dataTransfer: videoTransfer });

    expect(onPickVideoAsset).toHaveBeenCalledWith("hero-photo", expect.objectContaining({
      kind: "video",
      sourceUrl: "https://cdn.example.com/hero.mp4",
    }));
  });
});
