/**
 * JSON-LD Structured Data Generator — Spec 038 Section 06
 *
 * Generates schema.org Product+Review and Article JSON-LD
 * from CMS output for Google rich results.
 */

import type {
  ArticleCMSOutput,
  ProductReviewCMSOutput,
} from "@smartspec/skills";

/**
 * Generate Product + Review JSON-LD from a ProductReviewCMS output.
 */
export function generateProductReviewJsonLd(
  review: ProductReviewCMSOutput
): string {
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${review.product.brand} ${review.product.model}`,
    brand: { "@type": "Brand", name: review.product.brand },
    category: review.product.category,
  };

  // Review
  const reviewObj: Record<string, unknown> = {
    "@type": "Review",
    name: review.review.title,
    reviewBody: review.review.summary,
    reviewRating: {
      "@type": "Rating",
      ratingValue: review.review.scoring.overall,
      bestRating: review.review.scoring.max_score,
      worstRating: 0,
    },
  };

  if (review.review.pros?.length) {
    reviewObj.positiveNotes = {
      "@type": "ItemList",
      itemListElement: review.review.pros.map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: p,
      })),
    };
  }

  if (review.review.cons?.length) {
    reviewObj.negativeNotes = {
      "@type": "ItemList",
      itemListElement: review.review.cons.map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: c,
      })),
    };
  }

  jsonLd.review = reviewObj;

  // Offer (only if price present)
  if (review.product.price?.amount) {
    jsonLd.offers = {
      "@type": "Offer",
      priceCurrency: review.product.price.currency ?? "THB",
      price: review.product.price.amount,
    };
  }

  // FAQ (generates separate FAQPage if present)
  const result: unknown[] = [jsonLd];
  const faq = (review as ProductReviewCMSOutput & {
    faq?: Array<{ question: string; answer: string }>;
  }).faq;
  if (faq?.length) {
    result.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    });
  }

  return result.length === 1
    ? JSON.stringify(result[0])
    : JSON.stringify(result);
}

/**
 * Generate Article JSON-LD from an ArticleCMS output.
 */
export function generateArticleJsonLd(article: ArticleCMSOutput): string {
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    inLanguage: article.locale,
  };

  if (article.seo?.meta_description) {
    jsonLd.description = article.seo.meta_description;
  }
  if (article.last_verified_at) {
    jsonLd.dateModified = article.last_verified_at;
  }

  return JSON.stringify(jsonLd);
}

/**
 * Validate a JSON-LD string. Basic structural validation.
 */
function isValidJsonLdContext(context: unknown): boolean {
  if (typeof context === "string") return Boolean(context.trim());
  if (Array.isArray(context)) {
    return context.length > 0 && context.every(isValidJsonLdContext);
  }
  return Boolean(
    context &&
      typeof context === "object" &&
      Object.keys(context).length > 0
  );
}

function isValidJsonLdType(type: unknown): boolean {
  if (typeof type === "string") return Boolean(type.trim());
  return Array.isArray(type) &&
    type.length > 0 &&
    type.every((entry) => typeof entry === "string" && Boolean(entry.trim()));
}

export function validateJsonLd(
  jsonLd: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  try {
    const parsed = JSON.parse(jsonLd);
    const items = Array.isArray(parsed) ? parsed : [parsed];
    if (items.length === 0) {
      errors.push("JSON-LD must contain at least one item");
    }
    for (const item of items) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        errors.push("JSON-LD items must be objects");
        continue;
      }
      const context = item["@context"];
      if (context === undefined || context === null) {
        errors.push("Missing @context");
      } else if (!isValidJsonLdContext(context)) {
        errors.push("Invalid @context");
      }
      const type = item["@type"];
      if (type === undefined || type === null) {
        errors.push("Missing @type");
      } else if (!isValidJsonLdType(type)) {
        errors.push("Invalid @type");
      }
    }
  } catch {
    errors.push("Invalid JSON");
  }
  return { valid: errors.length === 0, errors };
}
