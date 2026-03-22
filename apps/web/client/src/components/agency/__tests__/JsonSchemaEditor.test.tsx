/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { createElement } from "react";

// ── Radix Select mock ────────────────────────────────────────
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: any) =>
    createElement("div", { "data-testid": "select" }, children),
  SelectTrigger: ({ children, ...props }: any) =>
    createElement("button", { ...props, type: "button" }, children),
  SelectValue: () => createElement("span"),
  SelectContent: ({ children }: any) => createElement("div", null, children),
  SelectItem: ({ children, value }: any) =>
    createElement("option", { value }, children),
}));

// ── Checkbox mock ────────────────────────────────────────────
vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({ checked, onCheckedChange, ...props }: any) =>
    createElement("input", {
      type: "checkbox",
      checked: !!checked,
      onChange: (e: any) => onCheckedChange?.(e.target.checked),
      ...props,
    }),
}));

describe("JsonSchemaEditor", () => {
  let onChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    onChange = vi.fn();
  });

  it("renders empty state with Add Property button", async () => {
    const { JsonSchemaEditor } = await import("../JsonSchemaEditor");
    render(createElement(JsonSchemaEditor, { value: null, onChange }));

    expect(screen.getByTestId("add-property-btn")).toBeTruthy();
    expect(screen.getByText(/No properties defined/)).toBeTruthy();
  });

  it("adds a property when Add Property is clicked", async () => {
    const { JsonSchemaEditor } = await import("../JsonSchemaEditor");
    render(createElement(JsonSchemaEditor, { value: null, onChange }));

    fireEvent.click(screen.getByTestId("add-property-btn"));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ type: "object", properties: expect.any(Object) }),
    );
    expect(screen.getByTestId("schema-property-0")).toBeTruthy();
  });

  it("removes a property via delete button", async () => {
    const { JsonSchemaEditor } = await import("../JsonSchemaEditor");
    const value = {
      type: "object",
      properties: { name: { type: "string" } },
    };
    render(createElement(JsonSchemaEditor, { value, onChange }));

    expect(screen.getByTestId("schema-property-0")).toBeTruthy();

    fireEvent.click(screen.getByTestId("property-delete-0"));

    // onChange should be called with empty properties
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(Object.keys(lastCall.properties)).toHaveLength(0);
  });

  it("toggles between visual editor and raw JSON textarea", async () => {
    const { JsonSchemaEditor } = await import("../JsonSchemaEditor");
    render(createElement(JsonSchemaEditor, { value: null, onChange }));

    // Start in visual mode
    expect(screen.getByTestId("add-property-btn")).toBeTruthy();

    // Switch to raw mode
    fireEvent.click(screen.getByTestId("schema-mode-toggle"));
    expect(screen.getByTestId("schema-raw-textarea")).toBeTruthy();

    // Switch back to visual mode
    fireEvent.click(screen.getByTestId("schema-mode-toggle"));
    expect(screen.getByTestId("add-property-btn")).toBeTruthy();
  });

  it("raw JSON textarea shows error indicator on invalid JSON", async () => {
    const { JsonSchemaEditor } = await import("../JsonSchemaEditor");
    render(createElement(JsonSchemaEditor, { value: null, onChange }));

    // Switch to raw mode
    fireEvent.click(screen.getByTestId("schema-mode-toggle"));

    // Type invalid JSON
    fireEvent.change(screen.getByTestId("schema-raw-textarea"), {
      target: { value: "{invalid json" },
    });

    expect(screen.getByTestId("schema-raw-error")).toBeTruthy();
    expect(screen.getByTestId("schema-raw-error").textContent).toBe("Invalid JSON");
  });

  it("raw JSON textarea syncs back to visual editor on valid JSON", async () => {
    const { JsonSchemaEditor } = await import("../JsonSchemaEditor");
    render(createElement(JsonSchemaEditor, { value: null, onChange }));

    // Switch to raw mode
    fireEvent.click(screen.getByTestId("schema-mode-toggle"));

    const schema = JSON.stringify({
      type: "object",
      properties: { age: { type: "number" } },
      required: ["age"],
    });
    fireEvent.change(screen.getByTestId("schema-raw-textarea"), {
      target: { value: schema },
    });

    // onChange should fire with valid schema
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "object",
        properties: expect.objectContaining({ age: { type: "number" } }),
      }),
    );

    // Switch back to visual
    fireEvent.click(screen.getByTestId("schema-mode-toggle"));
    expect(screen.getByTestId("schema-property-0")).toBeTruthy();
  });

  it("onChange fires with valid JSON Schema object on every edit", async () => {
    const { JsonSchemaEditor } = await import("../JsonSchemaEditor");
    render(createElement(JsonSchemaEditor, { value: null, onChange }));

    fireEvent.click(screen.getByTestId("add-property-btn"));
    expect(onChange).toHaveBeenCalled();

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall).toHaveProperty("type", "object");
    expect(lastCall).toHaveProperty("properties");
  });

  it("enforces max properties limit", async () => {
    const { JsonSchemaEditor } = await import("../JsonSchemaEditor");
    render(
      createElement(JsonSchemaEditor, {
        value: null,
        onChange,
        maxProperties: 2,
      }),
    );

    // Add 2 properties
    fireEvent.click(screen.getByTestId("add-property-btn"));
    fireEvent.click(screen.getByTestId("add-property-btn"));

    // Button should be disabled now
    const addBtn = screen.getByTestId("add-property-btn");
    expect(addBtn.hasAttribute("disabled")).toBe(true);
  });

  it("handles nested object properties (renders type as object)", async () => {
    const { JsonSchemaEditor } = await import("../JsonSchemaEditor");
    const value = {
      type: "object",
      properties: {
        address: { type: "object", description: "Address object" },
      },
    };
    render(createElement(JsonSchemaEditor, { value, onChange }));

    expect(screen.getByTestId("schema-property-0")).toBeTruthy();
  });
});
