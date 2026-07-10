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
        autoReviewPlanLabel: "แผน Auto Storyboard Review",
        autoReviewLoading: "กำลังโหลดแผนอัตโนมัติจากระบบ...",
        autoReviewFallbackSummary:
          "ระบบเลือก template, platform, render engine, storyboard settings และ preview policy ให้อัตโนมัติ",
        createAutoReview: "สร้าง Auto Storyboard Review",
        resumeAutoReview: "เปิดงาน Auto Storyboard Review ที่กำลังทำอยู่",
        reviewBlockers: "ตรวจสอบสิ่งที่ต้องแก้ก่อนเริ่ม Auto",
        autoPlanUpdating: "กำลังอัปเดตแผน Auto",
        useAutoPlan: "ใช้แผนอัตโนมัติ",
        useStandardOrder: "ใช้ Standard Order",
        retryAutoPlan: "โหลดแผน Auto ใหม่",
        autoPlanLoadFailed: "โหลด Auto Storyboard Review plan ไม่สำเร็จ",
        autoPlanLoadFailedDescription:
          "ลองโหลด plan ใหม่ หรือใช้ Standard Order ได้ทันที โดย flow เดิมยังทำงานตามปกติ",
        standardOrder: "Standard Order",
        launchModeGroup: "โหมดเริ่ม Marketplace Auto Review",
        autoModeLabel: "โหมด Auto",
        standardModeLabel: "โหมด Standard",
        template: "Template",
        platform: "Platform",
        estimate: "Estimate",
        autoSelected: "เลือกอัตโนมัติ",
        previewPolicy: "นโยบาย preview",
        creditsEstimated: (credits: number) => `ประมาณ ${credits} credits`,
        autoBlockedStandardAvailable:
          "Auto ถูกบล็อก แต่ยังใช้ Standard Order ได้ตามปกติ",
        advancedOverrides: "ตัวเลือก Auto ขั้นสูง",
        autoNoSetup:
          "Auto เริ่มได้โดยไม่ต้องเลือก template, engine, platform, frame strategy, shot count, audio หรือ text policy",
        visionQaModel: "โมเดลตรวจ QA (Vision)",
        visionQaModelAuto: "อัตโนมัติตามคุณภาพ (gpt-4o-mini / gpt-4o)",
        overrideDiff: (fields: string[]) =>
          `ค่าที่ปรับจากแผนอัตโนมัติ: ${fields.join(", ")}`,
        overridePending:
          "กำลังอัปเดตแผนอัตโนมัติตามตัวเลือกที่ปรับ ระบบยังไม่ต้องการให้เลือก template หรือ engine เอง",
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
        autoReviewPlanLabel: "Auto Storyboard Review plan",
        autoReviewLoading: "Loading backend-selected plan...",
        autoReviewFallbackSummary:
          "Backend selects template, platform, render engine, storyboard settings, and preview policy.",
        createAutoReview: "Create Auto Storyboard Review",
        resumeAutoReview: "Resume Auto Storyboard Review",
        reviewBlockers: "Review blockers",
        autoPlanUpdating: "Updating Auto plan",
        useAutoPlan: "Use auto plan",
        useStandardOrder: "Use Standard Order",
        retryAutoPlan: "Retry Auto plan",
        autoPlanLoadFailed: "Auto Storyboard Review plan failed to load",
        autoPlanLoadFailedDescription:
          "Retry the Auto plan or use Standard Order immediately. The existing flow remains available.",
        standardOrder: "Standard Order",
        launchModeGroup: "Marketplace Auto Review launch mode",
        autoModeLabel: "Auto mode",
        standardModeLabel: "Standard mode",
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
        visionQaModel: "Vision QA model",
        visionQaModelAuto: "Auto (follow quality mode: gpt-4o-mini / gpt-4o)",
        overrideDiff: (fields: string[]) => `Override diff: ${fields.join(", ")}`,
        overridePending:
          "Updating the auto plan with your optional choices. Template and engine remain backend-managed.",
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
