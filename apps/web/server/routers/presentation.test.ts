import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { TRPCError } from "@trpc/server";

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

const serviceMocks = vi.hoisted(() => ({
  getPresentationDeckDetail: vi.fn(),
  createPresentationDeckForLibraryItem: vi.fn(),
  attachAssetToDeck: vi.fn(),
}));

vi.mock("../services/presentationService", async () => {
  const actual = await vi.importActual<any>("../services/presentationService");
  return {
    ...actual,
    getPresentationDeckDetail: serviceMocks.getPresentationDeckDetail,
    createPresentationDeckForLibraryItem: serviceMocks.createPresentationDeckForLibraryItem,
    attachAssetToDeck: serviceMocks.attachAssetToDeck,
  };
});

import { presentationRouter } from "./presentation";
import { PresentationServiceError } from "../services/presentationService";
import {
  PRESENTATION_ERROR_CODE,
  PRESENTATION_EDITOR_ROUTE_BASE,
} from "@shared/presentation/constants";

describe("presentationRouter", () => {
  beforeEach(() => {
    delete process.env.PRESENTATION_EDITOR_ENABLED;
    vi.clearAllMocks();
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

  it("forwards tenant-scoped actor when creating a deck", async () => {
    serviceMocks.createPresentationDeckForLibraryItem.mockResolvedValue({
      created: true,
      deck: { id: 8, libraryItemId: 42 },
    });

    const fn = presentationRouter.createDeck as Function;
    const result = await fn({
      ctx: { tenantId: "tenant-1", user: { id: 77, role: "user" } },
      input: { libraryItemId: 42, title: "Deck A" },
    });

    expect(serviceMocks.createPresentationDeckForLibraryItem).toHaveBeenCalledWith(
      { libraryItemId: 42, title: "Deck A" },
      { userId: 77, tenantId: "tenant-1", role: "user" },
    );
    expect(result.created).toBe(true);
  });

  it("requires tenant context for deck endpoints", async () => {
    const fn = presentationRouter.getDeck as Function;

    await expect(
      fn({
        ctx: { tenantId: null, user: { id: 1 } },
        input: { deckId: 99 },
      }),
    ).rejects.toMatchObject({
      message: "Tenant context is required for presentation operations",
    });
  });

  it("maps service lifecycle restrictions to forbidden errors", async () => {
    serviceMocks.getPresentationDeckDetail.mockRejectedValue(
      new PresentationServiceError(
        PRESENTATION_ERROR_CODE.LIFECYCLE_RESTRICTED,
        `${PRESENTATION_ERROR_CODE.LIFECYCLE_RESTRICTED}: archived or deleted resources are read-only`,
      ),
    );

    const fn = presentationRouter.getDeck as Function;
    await expect(
      fn({
        ctx: { tenantId: "tenant-1", user: { id: 5, role: "user" } },
        input: { deckId: 5 },
      }),
    ).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof TRPCError)) return false;
      return error.code === "FORBIDDEN" && error.message.includes(PRESENTATION_ERROR_CODE.LIFECYCLE_RESTRICTED);
    });
  });

  it("maps limit violations to deterministic bad-request errors", async () => {
    serviceMocks.attachAssetToDeck.mockRejectedValue(
      new PresentationServiceError(
        PRESENTATION_ERROR_CODE.DECK_SIZE_LIMIT_EXCEEDED,
        `${PRESENTATION_ERROR_CODE.DECK_SIZE_LIMIT_EXCEEDED}: max deck size is 104857600 bytes`,
      ),
    );

    const fn = presentationRouter.attachAsset as Function;
    await expect(
      fn({
        ctx: { tenantId: "tenant-1", user: { id: 10, role: "user" } },
        input: { deckId: 4, libraryItemId: 77, byteSize: 1024 },
      }),
    ).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof TRPCError)) return false;
      return error.code === "BAD_REQUEST" && error.message.includes(PRESENTATION_ERROR_CODE.DECK_SIZE_LIMIT_EXCEEDED);
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
