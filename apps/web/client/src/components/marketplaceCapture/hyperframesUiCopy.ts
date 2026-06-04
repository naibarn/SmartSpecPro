export type MarketplaceHyperframesUiLocale = "en" | "th";

export function normalizeMarketplaceHyperframesLocale(
  locale?: string | null
): MarketplaceHyperframesUiLocale {
  return String(locale ?? "").toLowerCase().startsWith("th") ? "th" : "en";
}

export function getMarketplaceHyperframesBrowserLocale(): MarketplaceHyperframesUiLocale {
  if (typeof window === "undefined") return "en";
  try {
    const stored =
      window.localStorage.getItem("smartspec_locale") ??
      window.localStorage.getItem("smartspec_last_locale") ??
      "";
    return normalizeMarketplaceHyperframesLocale(stored || window.navigator.language);
  } catch {
    return "en";
  }
}

export function getMarketplaceHyperframesUiCopy(locale?: string | null) {
  const resolved =
    locale == null
      ? getMarketplaceHyperframesBrowserLocale()
      : normalizeMarketplaceHyperframesLocale(locale);
  return resolved === "th"
    ? {
        locale: resolved,
        autoReviewTitle: "Auto Storyboard Review",
        autoReviewLoading: "กำลังโหลดแผนอัตโนมัติจากระบบ...",
        autoReviewFallbackSummary:
          "ระบบเลือก template, platform, render engine, storyboard settings และ preview policy ให้อัตโนมัติ",
        createAutoReview: "สร้าง Auto Storyboard Review",
        useAutoPlan: "ใช้แผนอัตโนมัติ",
        standardOrder: "Standard Order",
        template: "Template",
        platform: "Platform",
        estimate: "Estimate",
        autoSelected: "เลือกอัตโนมัติ",
        previewPolicy: "นโยบาย preview",
        creditsEstimated: (credits: number) => `ประมาณ ${credits} credits`,
        autoBlockedStandardAvailable:
          "Auto ถูกบล็อก แต่ยังใช้ Standard Order ได้ตามปกติ",
        advancedOverrides: "Advanced overrides",
        autoNoSetup:
          "Auto เริ่มได้โดยไม่ต้องเลือก template, engine, platform, frame strategy, shot count, audio หรือ text policy",
        overrideDiff: (fields: string[]) => `Override diff: ${fields.join(", ")}`,
        noOverridesActive: "ไม่มี override ที่เปิดอยู่",
        hyperframesRender: "HyperFrames render",
        loadingRenderStatus: "กำลังโหลดสถานะ render...",
        cancel: "ยกเลิก",
        saveToLibrary: "บันทึกเข้า Library",
        openOutput: "เปิด output",
        autoPreviewTitle: "Auto preview",
        autoPreviewDescription:
          "ตรวจผล preview อัตโนมัติก่อน Manual render ยังเป็น fallback ได้",
        createPreview: "สร้าง preview",
        manualFallback:
          "Manual render controls ยังพร้อมใช้เป็น retry หรือ fallback",
        snapshotComparison: "Snapshot comparison",
        noSnapshots: "ยังไม่มี snapshot",
      }
    : {
        locale: resolved,
        autoReviewTitle: "Auto Storyboard Review",
        autoReviewLoading: "Loading backend-selected plan...",
        autoReviewFallbackSummary:
          "Backend selects template, platform, render engine, storyboard settings, and preview policy.",
        createAutoReview: "Create Auto Storyboard Review",
        useAutoPlan: "Use auto plan",
        standardOrder: "Standard Order",
        template: "Template",
        platform: "Platform",
        estimate: "Estimate",
        autoSelected: "Auto selected",
        previewPolicy: "Preview policy",
        creditsEstimated: (credits: number) => `${credits} credits est.`,
        autoBlockedStandardAvailable:
          "Auto is blocked, Standard Order remains available.",
        advancedOverrides: "Advanced overrides",
        autoNoSetup:
          "Auto starts without selecting template, engine, platform, frame strategy, shot count, audio, or text policy.",
        overrideDiff: (fields: string[]) => `Override diff: ${fields.join(", ")}`,
        noOverridesActive: "No overrides active.",
        hyperframesRender: "HyperFrames render",
        loadingRenderStatus: "Loading render status...",
        cancel: "Cancel",
        saveToLibrary: "Save to Library",
        openOutput: "Open output",
        autoPreviewTitle: "Auto preview",
        autoPreviewDescription:
          "Review the automatic storyboard preview first. Manual render remains a fallback.",
        createPreview: "Create preview",
        manualFallback:
          "Manual render controls are available as retry or fallback.",
        snapshotComparison: "Snapshot comparison",
        noSnapshots: "No snapshots yet.",
      };
}
