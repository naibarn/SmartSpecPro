import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

vi.mock("../_core/trpc", () => {
  const createProcedure = () => {
    const proc: any = {
      query: (fn: Function) => fn,
      mutation: (fn: Function) => fn,
      input: () => proc,
    };
    return proc;
  };

  return {
    router: (routes: any) => routes,
    protectedProcedure: createProcedure(),
  };
});

import { presentationRouter } from "./presentation";
import {
  PRESENTATION_ERROR_CODE,
  PRESENTATION_EDITOR_ROUTE_BASE,
} from "@shared/presentation/constants";

describe("presentationRouter", () => {
  beforeEach(() => {
    delete process.env.PRESENTATION_EDITOR_ENABLED;
  });

  it("returns disabled availability when feature flag is off", async () => {
    process.env.PRESENTATION_EDITOR_ENABLED = "false";

    const fn = presentationRouter.availability as Function;
    const result = await fn({
      ctx: { user: { id: 1 } },
    });

    expect(result.enabled).toBe(false);
    expect(result.errorCode).toBe(PRESENTATION_ERROR_CODE.FEATURE_DISABLED);
  });

  it("allows presentation items and returns deterministic editor route", async () => {
    const fn = presentationRouter.guardEditorOpen as Function;
    const result = await fn({
      ctx: { user: { id: 1 } },
      input: { itemId: 42, itemType: "presentation" },
    });

    expect(result).toEqual({
      allowed: true,
      itemId: 42,
      editorRoute: `${PRESENTATION_EDITOR_ROUTE_BASE}/42`,
    });
  });

  it("returns deterministic wrong-item guard with recovery CTA", async () => {
    const fn = presentationRouter.guardEditorOpen as Function;
    const result = await fn({
      ctx: { user: { id: 1 } },
      input: { itemId: 7, itemType: "document" },
    });

    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe(PRESENTATION_ERROR_CODE.ITEM_TYPE_MISMATCH);
    expect(result.recoveryCta).toEqual({
      label: "Open in Document Management",
      href: "/document-management?scope=my_library&sort=updated_desc&mode=editor&doc=7",
    });
  });
});

describe("presentation router registration", () => {
  it("registers presentation router without removing existing namespaces", () => {
    const routersFile = path.resolve(import.meta.dirname, "../routers.ts");
    const source = fs.readFileSync(routersFile, "utf-8");

    expect(source).toContain("presentation: presentationRouter");
    expect(source).toContain("library: libraryRouter");
    expect(source).toContain("videoEditorProjects: videoEditorProjectsRouter");
  });
});
