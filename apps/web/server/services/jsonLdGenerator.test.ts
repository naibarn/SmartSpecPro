import { describe, it, expect } from "vitest";
import {
  generateProductReviewJsonLd,
  generateArticleJsonLd,
  validateJsonLd,
} from "./jsonLdGenerator";
import type {
  ProductReviewCMSOutput,
  ArticleCMSOutput,
} from "@smartspec/skills";

const baseReview: ProductReviewCMSOutput = {
  locale: "th",
  title: "รีวิว Samsung Galaxy S26",
  slug: "samsung-galaxy-s26-review",
  last_verified_at: "2026-03-11T00:00:00Z",
  product: {
    brand: "Samsung",
    model: "Galaxy S26",
    category: "smartphone",
  },
  review: {
    title: "Samsung Galaxy S26 Review",
    summary: "An excellent flagship phone with great camera and performance.",
    verdict: "Highly recommended",
    body_markdown: "# Review",
    pros: ["Great camera", "Fast performance"],
    cons: ["Expensive", "No headphone jack"],
    scoring: {
      overall: 8.5,
      max_score: 10,
      dimensions: [],
    },
  },
  claims: [],
  citations: [],
  disclosures: { type: "provided_for_review" },
};

const baseArticle: ArticleCMSOutput = {
  locale: "th",
  title: "คู่มือเลือกซื้อโทรศัพท์มือถือ 2026",
  slug: "smartphone-buying-guide-2026",
  body_markdown: "# Guide content",
  last_verified_at: "2026-03-11T00:00:00Z",
  claims: [],
  citations: [],
  disclosures: { type: "none" },
  seo: {
    meta_title: "Smartphone Buying Guide 2026",
    meta_description: "Complete guide to choosing the right smartphone.",
  },
};

describe("generateProductReviewJsonLd", () => {
  it("generates Product + Review with rating", () => {
    const result = JSON.parse(generateProductReviewJsonLd(baseReview));
    expect(result["@type"]).toBe("Product");
    expect(result.name).toBe("Samsung Galaxy S26");
    expect(result.brand.name).toBe("Samsung");
    expect(result.review["@type"]).toBe("Review");
    expect(result.review.reviewRating.ratingValue).toBe(8.5);
    expect(result.review.reviewRating.bestRating).toBe(10);
  });

  it("includes positiveNotes and negativeNotes", () => {
    const result = JSON.parse(generateProductReviewJsonLd(baseReview));
    expect(result.review.positiveNotes.itemListElement).toHaveLength(2);
    expect(result.review.negativeNotes.itemListElement).toHaveLength(2);
    expect(result.review.positiveNotes.itemListElement[0].name).toBe("Great camera");
  });

  it("includes Offer when price is present", () => {
    const withPrice = {
      ...baseReview,
      product: {
        ...baseReview.product,
        price: { amount: 39900, currency: "THB" },
      },
    };
    const result = JSON.parse(generateProductReviewJsonLd(withPrice));
    expect(result.offers).toBeDefined();
    expect(result.offers["@type"]).toBe("Offer");
    expect(result.offers.price).toBe(39900);
    expect(result.offers.priceCurrency).toBe("THB");
  });

  it("omits Offer when no price", () => {
    const result = JSON.parse(generateProductReviewJsonLd(baseReview));
    expect(result.offers).toBeUndefined();
  });

  it("generates FAQPage when FAQ present", () => {
    const withFaq = {
      ...baseReview,
      faq: [
        { question: "ราคาเท่าไหร่?", answer: "39,900 บาท" },
        { question: "กันน้ำไหม?", answer: "IP68" },
      ],
    };
    const results = JSON.parse(generateProductReviewJsonLd(withFaq));
    expect(Array.isArray(results)).toBe(true);
    expect(results[1]["@type"]).toBe("FAQPage");
    expect(results[1].mainEntity).toHaveLength(2);
  });

  it("rating value in valid range", () => {
    const result = JSON.parse(generateProductReviewJsonLd(baseReview));
    const rating = result.review.reviewRating.ratingValue;
    expect(rating).toBeGreaterThanOrEqual(0);
    expect(rating).toBeLessThanOrEqual(10);
  });
});

describe("generateArticleJsonLd", () => {
  it("generates Article schema with headline", () => {
    const result = JSON.parse(generateArticleJsonLd(baseArticle));
    expect(result["@type"]).toBe("Article");
    expect(result.headline).toBe("คู่มือเลือกซื้อโทรศัพท์มือถือ 2026");
    expect(result.inLanguage).toBe("th");
  });

  it("includes dateModified from last_verified_at", () => {
    const result = JSON.parse(generateArticleJsonLd(baseArticle));
    expect(result.dateModified).toBe("2026-03-11T00:00:00Z");
  });

  it("includes description from SEO metadata", () => {
    const result = JSON.parse(generateArticleJsonLd(baseArticle));
    expect(result.description).toBe("Complete guide to choosing the right smartphone.");
  });

  it("handles special characters in title", () => {
    const article = {
      ...baseArticle,
      title: 'Title with "quotes" & <brackets>',
    };
    const jsonLd = generateArticleJsonLd(article);
    // Should be valid JSON
    const parsed = JSON.parse(jsonLd);
    expect(parsed.headline).toBe('Title with "quotes" & <brackets>');
  });
});

describe("validateJsonLd", () => {
  it("validates correct JSON-LD", () => {
    const jsonLd = generateProductReviewJsonLd(baseReview);
    const result = validateJsonLd(jsonLd);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects invalid JSON", () => {
    const result = validateJsonLd("not json");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Invalid JSON");
  });

  it("rejects missing @context", () => {
    const result = validateJsonLd(JSON.stringify({ "@type": "Product" }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Missing @context");
  });

  it("validates array of JSON-LD objects", () => {
    const withFaq = {
      ...baseReview,
      faq: [{ question: "Q?", answer: "A" }],
    };
    const jsonLd = generateProductReviewJsonLd(withFaq);
    const result = validateJsonLd(jsonLd);
    expect(result.valid).toBe(true);
  });
});
