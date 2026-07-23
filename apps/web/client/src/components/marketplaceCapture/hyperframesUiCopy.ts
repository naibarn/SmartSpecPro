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
        // Feature 136 (section 10, §5.5) — transparency line shown only when
        // creditEstimate.imageJobCount > 1 (sequential storyboard strategy).
        imageJobsEstimated: (jobs: number) =>
          `สร้างภาพ ${jobs} งาน (คิดเครดิตต่อภาพตอนสร้างจริง)`,
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
        // Feature 136 (section 11, §6.10) — sequential 9-image storyboard UI.
        frameStrategyLabels: {
          storyboard_3x3_split: "ตาราง storyboard 3x3",
          video_shot_start_stop: "เฟรมเริ่ม/จบแต่ละช็อต",
          sequential_shot_storyboard: "9 ภาพต่อเนื่อง (Sequential)",
        } as Record<
          "storyboard_3x3_split" | "video_shot_start_stop" | "sequential_shot_storyboard",
          string
        >,
        sequentialStrategyOptionLabel:
          "9 ภาพต่อเนื่อง (Sequential) — 1 prompt ต่อ 1 ภาพ",
        sequentialStrategyOptionDescription:
          "สร้างภาพแยก 9 ภาพเป็นเรื่องเดียวต่อเนื่อง เน้นสินค้าตรงทุกมุม",
        // Frame-strategy card promotion — top-level card copy. The card
        // mirrors `frameStrategyOptions` in AutoStoryboardAdvancedOverrides.tsx
        // (reuses `frameStrategyLabels` above for option labels and
        // `sequentialStrategyOptionDescription` above for the sequential
        // option's description); only the card chrome + the two
        // non-sequential descriptions are new here.
        frameStrategyCardTitle: "รูปแบบการสร้างภาพ (Frame strategy)",
        frameStrategyCardSubtitle:
          "เลือกวิธีที่ระบบจะสร้างภาพ storyboard ให้คุณ",
        frameStrategyCardOptionDescriptions: {
          storyboard_3x3_split: "ภาพเดียวแบบตาราง 9 ช่อง เห็นทุกช็อตในภาพเดียว",
          video_shot_start_stop:
            "แยกเฟรมเริ่มและจบของแต่ละช็อต เหมาะกับการตัดต่อวิดีโอ",
        } as Record<"storyboard_3x3_split" | "video_shot_start_stop", string>,
        angleChipLabels: {
          front: "ด้านหน้า",
          back: "ด้านหลัง",
          side: "ด้านข้าง",
          top: "ด้านบน",
          base: "ฐาน",
          detail: "จุดเด่น/ระยะใกล้",
          package: "บรรจุภัณฑ์",
          parts_diagram: "ผังชิ้นส่วน",
          scale: "เทียบขนาด",
          other: "อื่น ๆ",
        } as Record<
          | "front"
          | "back"
          | "side"
          | "top"
          | "base"
          | "detail"
          | "package"
          | "parts_diagram"
          | "scale"
          | "other",
          string
        >,
        referenceCapacityMeter: (n: number, cap: number, model: string) =>
          `ใช้ได้ ${n}/${cap} ภาพอ้างอิงต่อภาพ (โมเดล ${model})`,
        referenceTrimWarning: (labels: string[]) =>
          `มุมที่จะถูกตัดออก: ${labels.join(", ")}`,
        referenceEvidenceOnly: "ใช้เป็นหลักฐานเท่านั้น (ไม่แนบเข้าโมเดล)",
        referenceCapacityImpossible: (model: string) =>
          `ความจุภาพอ้างอิงของโมเดล ${model} ไม่พอสำหรับภาพที่บังคับต้องมี (เช่น ภาพสินค้าหลัก) กรุณาลดจำนวนภาพอ้างอิงหรือเปลี่ยนโมเดล`,
        // Selection redesign (2026-07-23, user-approved mockup) — checkbox
        // selection on the Product Images grid replaces "assign a label to
        // enroll". These three strings back that picker.
        referenceDiscoverabilityHint: (n: number) =>
          `ใช้ภาพสินค้าได้อีก ${n} ภาพ — คลิกเลือกภาพมุมอื่นเพื่อให้ AI สร้างสินค้าได้แม่นยำขึ้น`,
        referenceAutoAngleOption: "อัตโนมัติ",
        referenceAngleSelectLabel: "เลือกมุมภาพ (ไม่บังคับ)",
        referenceAnchorBadge: "ภาพหลัก",
        // Selection redesign follow-up (2026-07-23) — clicking the image
        // itself now toggles sequential reference selection directly
        // (see `canToggleAutoReviewSelection` in
        // MarketplaceCaptureProductDetail.tsx). These back the on-image
        // "selected" overlay, the locked-anchor helper line, and the
        // localized aria-label/title strings for the card button and the
        // corner toggle.
        referenceSelectedBadge: "เลือกใช้อ้างอิง",
        referenceAnchorLockedHint:
          'ภาพนี้ถูกล็อกเป็นภาพหลัก ใช้ปุ่ม "ตั้งเป็นภาพ Hero" ที่ภาพอื่นเพื่อเปลี่ยน',
        referenceSelectAriaLabel: (n: number) =>
          `เลือกภาพที่ ${n} เป็นภาพอ้างอิงสินค้าหลายมุม`,
        referenceDeselectAriaLabel: (n: number) =>
          `เอาภาพที่ ${n} ออกจากภาพอ้างอิงสินค้าหลายมุม`,
        referenceAnchorAriaLabel: (n: number) =>
          `ภาพที่ ${n} ถูกล็อกเป็นภาพหลัก ใช้ปุ่ม "ตั้งเป็นภาพ Hero" ที่ภาพอื่นเพื่อเปลี่ยน`,
        evidenceReviewTitle: "ตรวจหลักฐานและข้อขัดแย้ง",
        evidenceReviewDescription:
          "ตรวจข้อมูลที่ระบบดึงจากหน้าสินค้า ยืนยันหรือตัดออกก่อนเริ่มสร้างรีวิว",
        evidenceVerifiedHighlights: "ข้อมูลที่ตรวจสอบแล้ว",
        evidenceNeedsConfirmation: "ต้องยืนยัน",
        evidenceConfirm: "ยืนยัน",
        evidenceReject: "ตัดออก",
        evidenceExcluded: "จะไม่ถูกใช้ในรีวิว",
        forbiddenClaimsLabel: "คำที่ห้ามใช้",
        targetAudienceLabel: "กลุ่มเป้าหมาย (ไม่บังคับ)",
        userRequirementsLabel: "ความต้องการเพิ่มเติม (ไม่บังคับ)",
        confirmedAttributesLabel: "แอตทริบิวต์ที่ยืนยันแล้ว",
        sequentialImagePromptMaxCharsLabel:
          "จำนวนตัวอักษรสูงสุดของ prompt ภาพ",
        guardianNoticeTitle: "นโยบายการปรากฏตัวของผู้ปกครอง",
        guardianNoticeBody:
          "สินค้านี้เกี่ยวกับเด็ก — ทุกเฟรมที่มีเด็กใช้งานสินค้า ระบบจะใส่ผู้ปกครองอยู่ในฉากด้วยเสมอ คุณสามารถอัปโหลดรูปตัวละครผู้ใหญ่ เพื่อกำหนดหน้าตาผู้ปกครองได้",
        guardianNoticeAttach: "อัปโหลด reference",
        guardianNoticeAttached: "แนบรูป reference ผู้ปกครองแล้ว",
        guardianBadge: "มีผู้ปกครองในเฟรม",
        sequentialShotsTitle: "ช็อตทั้ง 9 ภาพ",
        regenerateShot: "สร้างภาพนี้ใหม่",
        saveShotEdits: "บันทึกการแก้ไข",
        promptCharCount: (n: number, max: number) => `${n}/${max} ตัวอักษร`,
        promptOverBudget:
          "ยาวเกินงบตัวอักษรที่แนะนำ ระบบฝั่งเซิร์ฟเวอร์จะตรวจสอบอีกครั้งตอนบันทึก",
        loopReportTitle: "รายงานรอบตรวจสอบ",
        loopReportRound: (n: number) => `รอบที่ ${n}`,
        loopReportSelected: (n: number) => `เวอร์ชันที่เลือก: ${n}`,
        loopReportCandidates: (n: number) => `มี ${n} ตัวเลือก`,
        loopReportDegraded:
          "ระบบใช้ prompt สำรองแบบอัตโนมัติ เนื่องจากไม่มีรอบตรวจสอบใดผ่านเกณฑ์",
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
        // Feature 136 (section 10, §5.5) — transparency line shown only when
        // creditEstimate.imageJobCount > 1 (sequential storyboard strategy).
        imageJobsEstimated: (jobs: number) =>
          `${jobs} image jobs (billed per image at generation)`,
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
        // Feature 136 (section 11, §6.10) — sequential 9-image storyboard UI.
        frameStrategyLabels: {
          storyboard_3x3_split: "3x3 storyboard grid",
          video_shot_start_stop: "Start/stop frame pairs",
          sequential_shot_storyboard: "Sequential 9 images",
        } as Record<
          "storyboard_3x3_split" | "video_shot_start_stop" | "sequential_shot_storyboard",
          string
        >,
        sequentialStrategyOptionLabel:
          "Sequential 9 images — one prompt per image",
        sequentialStrategyOptionDescription:
          "Nine separate images telling one continuous story, product-accurate from every angle",
        // Frame-strategy card promotion — top-level card copy. The card
        // mirrors `frameStrategyOptions` in AutoStoryboardAdvancedOverrides.tsx
        // (reuses `frameStrategyLabels` above for option labels and
        // `sequentialStrategyOptionDescription` above for the sequential
        // option's description); only the card chrome + the two
        // non-sequential descriptions are new here.
        frameStrategyCardTitle: "Frame strategy",
        frameStrategyCardSubtitle:
          "Choose how Auto builds your storyboard frames",
        frameStrategyCardOptionDescriptions: {
          storyboard_3x3_split:
            "One 3x3 grid image showing every shot at a glance",
          video_shot_start_stop:
            "Separate start and stop frames per shot, ready for video editing",
        } as Record<"storyboard_3x3_split" | "video_shot_start_stop", string>,
        angleChipLabels: {
          front: "Front",
          back: "Back",
          side: "Side",
          top: "Top",
          base: "Base",
          detail: "Detail / close-up",
          package: "Packaging",
          parts_diagram: "Parts diagram",
          scale: "Scale reference",
          other: "Other",
        } as Record<
          | "front"
          | "back"
          | "side"
          | "top"
          | "base"
          | "detail"
          | "package"
          | "parts_diagram"
          | "scale"
          | "other",
          string
        >,
        referenceCapacityMeter: (n: number, cap: number, model: string) =>
          `Using ${n}/${cap} reference images per frame (model ${model})`,
        referenceTrimWarning: (labels: string[]) =>
          `Angles that will be trimmed: ${labels.join(", ")}`,
        referenceEvidenceOnly: "Evidence only (not attached to the model)",
        referenceCapacityImpossible: (model: string) =>
          `Model ${model} cannot fit even the required reference images (e.g. the primary product). Reduce reference images or choose a different model.`,
        // Selection redesign (2026-07-23, user-approved mockup) — checkbox
        // selection on the Product Images grid replaces "assign a label to
        // enroll". These three strings back that picker.
        referenceDiscoverabilityHint: (n: number) =>
          `${n} more product image${n === 1 ? "" : "s"} available — click to select other angles so the AI can render your product more accurately.`,
        referenceAutoAngleOption: "Auto",
        referenceAngleSelectLabel: "Choose angle (optional)",
        referenceAnchorBadge: "Primary image",
        // Selection redesign follow-up (2026-07-23) — clicking the image
        // itself now toggles sequential reference selection directly
        // (see `canToggleAutoReviewSelection` in
        // MarketplaceCaptureProductDetail.tsx). These back the on-image
        // "selected" overlay, the locked-anchor helper line, and the
        // localized aria-label/title strings for the card button and the
        // corner toggle.
        referenceSelectedBadge: "Reference selected",
        referenceAnchorLockedHint:
          'Locked as the primary reference. Use "Set as Hero image" on another photo to change it.',
        referenceSelectAriaLabel: (n: number) =>
          `Select image ${n} as a reference for the sequential storyboard.`,
        referenceDeselectAriaLabel: (n: number) =>
          `Remove image ${n} from the sequential storyboard references.`,
        referenceAnchorAriaLabel: (n: number) =>
          `Image ${n} is locked as the primary reference. Use "Set as Hero image" on another photo to change it.`,
        evidenceReviewTitle: "Evidence & conflict review",
        evidenceReviewDescription:
          "Review the facts pulled from the product page. Confirm or exclude them before generation starts.",
        evidenceVerifiedHighlights: "Verified highlights",
        evidenceNeedsConfirmation: "Needs confirmation",
        evidenceConfirm: "Confirm",
        evidenceReject: "Exclude",
        evidenceExcluded: "Will not be used in the review",
        forbiddenClaimsLabel: "Words to avoid",
        targetAudienceLabel: "Target audience (optional)",
        userRequirementsLabel: "Additional requirements (optional)",
        confirmedAttributesLabel: "Confirmed attributes",
        sequentialImagePromptMaxCharsLabel: "Max image prompt characters",
        guardianNoticeTitle: "Guardian presence policy",
        guardianNoticeBody:
          "This product involves children — every frame where a child uses the product will always include a guardian in the scene. You can upload an adult character reference to control how the guardian looks.",
        guardianNoticeAttach: "Upload reference",
        guardianNoticeAttached: "Guardian reference attached",
        guardianBadge: "Guardian in frame",
        sequentialShotsTitle: "All 9 shots",
        regenerateShot: "Regenerate this image",
        saveShotEdits: "Save edits",
        promptCharCount: (n: number, max: number) => `${n}/${max} characters`,
        promptOverBudget:
          "Over the recommended character budget — the server re-validates on save.",
        loopReportTitle: "Loop report",
        loopReportRound: (n: number) => `Round ${n}`,
        loopReportSelected: (n: number) => `Selected version: ${n}`,
        loopReportCandidates: (n: number) => `${n} candidate${n === 1 ? "" : "s"}`,
        loopReportDegraded:
          "The system used an automatic fallback prompt because no loop round passed review.",
      };
}

/**
 * Feature 136 (section 11, §6.10) — optional per-blocker-id "what to fix"
 * hint line for the sequential per-shot editor. The AUTHORITATIVE rejection
 * MESSAGE always comes from
 * `shared/marketplaceCapture/sequentialShotBlockerCopy.ts` (section 08,
 * server-owned Thai sentences) — this map is deliberately limited to a
 * short supplementary hint and must never duplicate those sentences.
 * Unknown blocker ids simply have no hint (caller falls back to the server
 * message alone).
 */
export const SEQUENTIAL_SHOT_BLOCKER_HINTS: Readonly<
  Record<string, { th: string; en: string }>
> = {
  sequential_prompt_set_incomplete: {
    th: "กรอก prompt ภาพและวิดีโอของช็อตนี้ให้ครบ",
    en: "Fill in both the image and video prompt for this shot.",
  },
  prompt_too_long_for_image_provider: {
    th: "ลองตัดรายละเอียดที่ไม่จำเป็นออกจาก prompt ภาพ",
    en: "Trim non-essential detail from the image prompt.",
  },
  prompt_too_long_for_video_provider: {
    th: "ลองตัดรายละเอียดที่ไม่จำเป็นออกจาก prompt วิดีโอ",
    en: "Trim non-essential detail from the video prompt.",
  },
  video_global_block_missing: {
    th: 'เพิ่มประโยคล็อกสินค้า ("Use @Image1 as the absolute product identity reference") ไว้ต้น prompt วิดีโอ',
    en: 'Add the product-identity lock sentence ("Use @Image1 as the absolute product identity reference") back to the start of the video prompt.',
  },
  guardian_directive_missing: {
    th: "เพิ่มคำอธิบายผู้ปกครองที่อยู่ในภาพให้ชัดเจน",
    en: "Describe the guardian present in the frame explicitly.",
  },
  minor_safety_clothing_lock_missing: {
    th: "เพิ่มคำล็อกความปลอดภัยเรื่องเครื่องแต่งกายของเด็กกลับเข้าไปใน prompt",
    en: "Add the child clothing-safety lock back into the prompt.",
  },
  assembly_demo_unverified: {
    th: "เปลี่ยนคำอธิบายให้ไม่ใช่การประกอบ/ถอดชิ้นส่วน หรือยืนยันหลักฐานจากหน้าสินค้าก่อน",
    en: "Rephrase away from assembly/disassembly, or confirm evidence from the product page first.",
  },
  price_claim_detected: {
    th: "ลบคำเกี่ยวกับราคา/โปรโมชันออกจากข้อความ",
    en: "Remove price or promotion wording from the text.",
  },
  reference_index_mapping_mismatch: {
    th: "แก้ข้อความอ้างอิง @ImageN ให้ตรงกับภาพที่แนบจริง",
    en: "Fix the @ImageN reference wording to match the images actually attached.",
  },
  product_reference_model_conflict: {
    th: "ตรวจสอบว่าทุกภาพอ้างอิงเป็นสินค้ารุ่นเดียวกัน",
    en: "Check that every reference image shows the same product model.",
  },
  shot_duration_exceeds_max: {
    th: "ลดความยาวช็อตให้อยู่ในช่วงที่กำหนด",
    en: "Shorten the shot to fit the allowed duration range.",
  },
  dialogue_exceeds_shot_duration: {
    th: "ตัดบทพูดให้สั้นลงให้พอดีกับความยาวช็อต",
    en: "Shorten the dialogue to fit the shot duration.",
  },
};

/**
 * Returns the optional "what to fix" hint for a blocker id, or `null` when
 * none is defined — callers must fall back to the server message alone in
 * that case (never invent a hint).
 */
export function getSequentialShotBlockerHint(
  blockerId: string | undefined | null,
  locale: MarketplaceHyperframesUiLocale = "en"
): string | null {
  const id = typeof blockerId === "string" ? blockerId.trim() : "";
  const hint = id ? SEQUENTIAL_SHOT_BLOCKER_HINTS[id] : undefined;
  if (!hint) return null;
  return locale === "th" ? hint.th : hint.en;
}
