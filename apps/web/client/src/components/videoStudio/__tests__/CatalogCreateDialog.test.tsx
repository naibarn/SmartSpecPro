/**
 * CatalogCreateDialog coverage (Feature 133, section-08 follow-up). Proves
 * the browse/search-by-name product picker (backed by
 * `marketplaceCapture.listProducts` — own + group-shared products, per the
 * same procedure/UI pattern already shipped in
 * `verticalDramaSeries/CreateSeriesWizard.tsx`) replaces the old raw
 * product-id text field: products load on open with no search text,
 * filtering by typed text re-queries, selecting a card shows a preview and
 * enables Create, and Create sends `sourceRefs.productIds` with the
 * selected product's real id.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Astryx's Dialog renders a native <dialog> element and calls showModal()/
// close() on it. jsdom does not implement HTMLDialogElement's showModal/close
// (see @astryxdesign/core's own Dialog.test.tsx, which mocks the same way) —
// without this, every test below fails with "dialog.showModal is not a
// function" before it can assert anything about the rendered UI.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
});

const listProductsQueryMock = vi.fn();
const createMutateMock = vi.fn();

vi.mock("wouter", () => ({
  useLocation: () => ["/video-studio", vi.fn()],
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: "th" } }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    marketplaceCapture: {
      listProducts: { useQuery: (...args: unknown[]) => listProductsQueryMock(...args) },
    },
    videoProjects: {
      create: {
        useMutation: (opts: Record<string, unknown>) => ({
          mutate: (input: unknown) => createMutateMock(input, opts),
          isPending: false,
        }),
      },
    },
  },
}));

import { CatalogCreateDialog } from "../CatalogCreateDialog";

const OWNED_PRODUCT = {
  id: "prod-own-1",
  productName: "โต๊ะไม้เนื้อแข็ง",
  imageUrl: null,
  imageUrls: [],
  descriptionText: null,
  priceCurrent: "1200",
  currency: "THB",
  platform: "shopee",
  accessType: "owner",
};

const GROUP_SHARED_PRODUCT = {
  id: "prod-group-1",
  productName: "เก้าอี้สำนักงาน",
  imageUrl: null,
  imageUrls: [],
  descriptionText: null,
  priceCurrent: "890",
  currency: "THB",
  platform: "tiktok_shop",
  accessType: "group",
};

const PRODUCT_WITH_IMAGES = {
  id: "prod-images-1",
  productName: "โคมไฟตั้งโต๊ะ",
  imageUrl: "https://example.com/lamp-1.jpg",
  imageUrls: [
    "https://example.com/lamp-1.jpg",
    "https://example.com/lamp-2.jpg",
    "https://example.com/lamp-3.jpg",
  ],
  descriptionText: "โคมไฟตั้งโต๊ะดีไซน์มินิมอล ปรับความสว่างได้ 3 ระดับ เหมาะสำหรับโต๊ะทำงานหรือหัวเตียง",
  priceCurrent: "590",
  currency: "THB",
  platform: "shopee",
  accessType: "owner",
};

beforeEach(() => {
  vi.clearAllMocks();
  listProductsQueryMock.mockReturnValue({
    data: [OWNED_PRODUCT, GROUP_SHARED_PRODUCT],
    isFetching: false,
    isError: false,
    error: null,
  });
});

describe("CatalogCreateDialog — browse/search product picker", () => {
  it("browses all accessible products (own + group-shared) with no search text on open", () => {
    render(<CatalogCreateDialog lang="th" open onOpenChange={vi.fn()} />);

    expect(listProductsQueryMock).toHaveBeenCalledWith(
      { query: undefined, limit: 24 },
      expect.objectContaining({ enabled: true }),
    );
    const results = screen.getByTestId("video-studio-catalog-product-results");
    expect(results).toHaveTextContent("โต๊ะไม้เนื้อแข็ง");
    expect(results).toHaveTextContent("เก้าอี้สำนักงาน");
  });

  it("re-queries by typed search text instead of requiring an exact product id", () => {
    render(<CatalogCreateDialog lang="th" open onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/ค้นหาสินค้า/i), { target: { value: "เก้าอี้" } });

    expect(listProductsQueryMock).toHaveBeenCalledWith(
      { query: "เก้าอี้", limit: 24 },
      expect.objectContaining({ enabled: true }),
    );
  });

  it("shows an empty state when no accessible products match", () => {
    listProductsQueryMock.mockReturnValue({ data: [], isFetching: false, isError: false, error: null });
    render(<CatalogCreateDialog lang="th" open onOpenChange={vi.fn()} />);
    expect(screen.queryByTestId("video-studio-catalog-product-results")).not.toBeInTheDocument();
    expect(screen.getByText(/ไม่พบสินค้าที่เข้าถึงได้/)).toBeInTheDocument();
  });

  it("selects a product on click and shows its preview with a group-shared badge", () => {
    render(<CatalogCreateDialog lang="th" open onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByText("เก้าอี้สำนักงาน"));

    const preview = screen.getByTestId("video-studio-catalog-product-preview");
    expect(preview).toHaveTextContent("เก้าอี้สำนักงาน");
    expect(preview).toHaveTextContent("แชร์จากกลุ่ม");
    // The browse/search list is replaced by the single-product preview.
    expect(screen.queryByTestId("video-studio-catalog-product-results")).not.toBeInTheDocument();
  });

  it("disables Create until a product is selected, then creates with the real product id in sourceRefs", () => {
    render(<CatalogCreateDialog lang="th" open onOpenChange={vi.fn()} />);

    const createButton = screen.getByTestId("video-studio-catalog-create-submit");
    expect(createButton).toBeDisabled();

    fireEvent.click(screen.getByText("โต๊ะไม้เนื้อแข็ง"));
    expect(createButton).not.toBeDisabled();

    fireEvent.click(createButton);
    expect(createMutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        studioType: "catalog",
        name: "โต๊ะไม้เนื้อแข็ง",
        sourceRefs: { productIds: ["prod-own-1"] },
      }),
      expect.anything(),
    );
  });

  it("lets the user change the selected product back to the search picker", () => {
    render(<CatalogCreateDialog lang="th" open onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByText("โต๊ะไม้เนื้อแข็ง"));
    expect(screen.getByTestId("video-studio-catalog-product-preview")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/เปลี่ยนสินค้า/i));
    expect(screen.queryByTestId("video-studio-catalog-product-preview")).not.toBeInTheDocument();
    expect(screen.getByTestId("video-studio-catalog-product-results")).toBeInTheDocument();
  });
});

describe("CatalogCreateDialog — product description + image selection", () => {
  beforeEach(() => {
    listProductsQueryMock.mockReturnValue({
      data: [PRODUCT_WITH_IMAGES],
      isFetching: false,
      isError: false,
      error: null,
    });
  });

  it("shows the product description after selecting a product", () => {
    render(<CatalogCreateDialog lang="th" open onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByText("โคมไฟตั้งโต๊ะ"));

    expect(screen.getByTestId("video-studio-catalog-product-description")).toHaveTextContent(
      "โคมไฟตั้งโต๊ะดีไซน์มินิมอล",
    );
  });

  it("defaults to all product images selected and shows the image grid", () => {
    render(<CatalogCreateDialog lang="th" open onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByText("โคมไฟตั้งโต๊ะ"));

    const grid = screen.getByTestId("catalog-create-image-grid");
    const toggles = screen.getAllByTestId("catalog-create-image-toggle");
    expect(grid).toBeInTheDocument();
    expect(toggles).toHaveLength(3);
    expect(toggles.every((toggle) => toggle.getAttribute("data-selected") === "true")).toBe(true);
    expect(screen.getByTestId("video-studio-catalog-image-count")).toHaveTextContent("3/3");
  });

  it("toggles an image off and requires at least one selected image to enable Create", () => {
    render(<CatalogCreateDialog lang="th" open onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByText("โคมไฟตั้งโต๊ะ"));

    const toggles = screen.getAllByTestId("catalog-create-image-toggle");
    fireEvent.click(toggles[0]);
    fireEvent.click(toggles[1]);
    fireEvent.click(toggles[2]);

    const createButton = screen.getByTestId("video-studio-catalog-create-submit");
    expect(createButton).toBeDisabled();

    fireEvent.click(toggles[0]);
    expect(createButton).not.toBeDisabled();
  });

  it("sends the selected description, price, and ticked image subset in the brief on create", () => {
    render(<CatalogCreateDialog lang="th" open onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByText("โคมไฟตั้งโต๊ะ"));

    const toggles = screen.getAllByTestId("catalog-create-image-toggle");
    // Deselect the middle image; keep the first and third.
    fireEvent.click(toggles[1]);

    fireEvent.click(screen.getByTestId("video-studio-catalog-create-submit"));

    expect(createMutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        studioType: "catalog",
        brief: expect.objectContaining({
          productId: "prod-images-1",
          productName: "โคมไฟตั้งโต๊ะ",
          productDescription: PRODUCT_WITH_IMAGES.descriptionText,
          productImageUrls: [
            "https://example.com/lamp-1.jpg",
            "https://example.com/lamp-3.jpg",
          ],
          productPrice: "590",
          productCurrency: "THB",
        }),
        sourceRefs: { productIds: ["prod-images-1"] },
      }),
      expect.anything(),
    );
  });

  it("resets the image selection when changing back to a different product", () => {
    render(<CatalogCreateDialog lang="th" open onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByText("โคมไฟตั้งโต๊ะ"));
    fireEvent.click(screen.getAllByTestId("catalog-create-image-toggle")[0]);
    expect(screen.getByTestId("video-studio-catalog-image-count")).toHaveTextContent("2/3");

    fireEvent.click(screen.getByLabelText(/เปลี่ยนสินค้า/i));
    fireEvent.click(screen.getByText("โคมไฟตั้งโต๊ะ"));

    expect(screen.getByTestId("video-studio-catalog-image-count")).toHaveTextContent("3/3");
  });
});
