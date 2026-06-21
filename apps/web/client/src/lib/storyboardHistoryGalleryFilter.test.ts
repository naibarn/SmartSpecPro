import { describe, expect, it } from "vitest";
import {
  getStoryboardHistoryProductFilter,
  storyboardHistoryTaskMatchesProduct,
} from "./storyboardHistoryGalleryFilter";

describe("storyboardHistoryGalleryFilter", () => {
  it("matches history tasks by marketplace product id", () => {
    const filter = getStoryboardHistoryProductFilter({
      marketplaceContext: {
        productId: "mp_123",
        productTitle: "Space saver playpen",
      },
      tasks: [],
    });

    expect(filter?.productId).toBe("mp_123");
    expect(storyboardHistoryTaskMatchesProduct({
      parameters: {
        extraParams: {
          marketplaceContext: {
            marketplaceProductId: "mp_123",
          },
        },
      },
    }, filter!)).toBe(true);
  });

  it("matches generated history tasks by auto-review run id when product id is nested differently", () => {
    const filter = getStoryboardHistoryProductFilter({
      marketplaceContext: {
        productId: "mp_123",
        productTitle: "Space saver playpen",
        autoReviewRunId: "auto_run_82",
      },
      tasks: [],
    });

    expect(filter?.runId).toBe("auto_run_82");
    expect(storyboardHistoryTaskMatchesProduct({
      id: "mcp_task_1",
      parameters: {
        extraParams: {
          marketplaceContext: {
            marketplaceAutoReviewRunId: "auto_run_82",
          },
        },
      },
      resultData: {
        outputUrls: ["https://cdn.example.com/generated.png"],
      },
    }, filter!)).toBe(true);
  });

  it("matches mcp media tasks with marketplace context stored on parameters root", () => {
    const filter = getStoryboardHistoryProductFilter({
      marketplaceContext: {
        productId: "mp_123",
        autoReviewRunId: "auto_run_82",
      },
      tasks: [],
    });

    expect(storyboardHistoryTaskMatchesProduct({
      id: "mcp_task_2",
      parameters: {
        marketplaceContext: {
          productId: "mp_123",
          autoReviewRunId: "auto_run_82",
        },
      },
    }, filter!)).toBe(true);
  });

  it("matches gateway media tasks with persisted internal provenance in snake extra params", () => {
    const filter = getStoryboardHistoryProductFilter({
      marketplaceContext: {
        productId: "mp_123",
        autoReviewRunId: "auto_run_82",
      },
      tasks: [],
    });

    expect(storyboardHistoryTaskMatchesProduct({
      id: "provider_task_1",
      parameters: {
        extra_params: {
          __marketplace_product_id: "mp_123",
          __auto_review_run_id: "auto_run_82",
        },
      },
    }, filter!)).toBe(true);
  });

  it("reads product context from generated storyboard task extra params", () => {
    const filter = getStoryboardHistoryProductFilter({
      tasks: [
        {
          generationExtraParams: {
            marketplaceContext: {
              productId: "mp_from_generation",
              autoReviewRunId: "run_from_generation",
            },
          },
        },
      ],
    });

    expect(filter).toMatchObject({
      productId: "mp_from_generation",
      runId: "run_from_generation",
    });
  });

  it("does not match unrelated product provenance", () => {
    const filter = getStoryboardHistoryProductFilter({
      marketplaceContext: {
        productId: "mp_123",
        autoReviewRunId: "auto_run_82",
      },
      tasks: [],
    });

    expect(storyboardHistoryTaskMatchesProduct({
      parameters: {
        extraParams: {
          marketplaceContext: {
            productId: "mp_999",
            autoReviewRunId: "auto_run_99",
          },
        },
      },
    }, filter!)).toBe(false);
  });
});
