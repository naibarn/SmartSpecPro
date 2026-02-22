import { describe, it, expect } from "vitest";

import {
  buildWrongEditorOpenGuard,
  getEditorOpenRouteForItem,
} from "./presentationRouting";

describe("presentationRouting", () => {
  it("routes presentation item opens to presentation editor", () => {
    const result = getEditorOpenRouteForItem({ id: 11, item_type: "presentation" });

    expect(result).toEqual({
      kind: "presentation",
      href: "/presentation-editor/11",
    });
  });

  it("keeps non-presentation item opens in document management", () => {
    const result = getEditorOpenRouteForItem({ id: 12, item_type: "document" });

    expect(result).toEqual({
      kind: "document_management",
      href: "/document-management?scope=my_library&sort=updated_desc&mode=editor&doc=12",
    });
  });

  it("builds deterministic wrong-editor guard payload", () => {
    const guard = buildWrongEditorOpenGuard(9, "document");

    expect(guard.allowed).toBe(false);
    expect(guard.errorCode).toBe("PRESENTATION_ITEM_TYPE_MISMATCH");
    expect(guard.recoveryCta).toEqual({
      label: "Open in Document Management",
      href: "/document-management?scope=my_library&sort=updated_desc&mode=editor&doc=9",
    });
  });
});
