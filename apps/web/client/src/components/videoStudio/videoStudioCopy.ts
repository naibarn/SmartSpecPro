/**
 * Video Studio (Feature 133, section-08) — bilingual (Thai-first, English
 * fallback) copy helpers. Mirrors the established
 * `components/verticalDramaSeries/verticalDramaCopy.ts` convention
 * (`useVideoStudioLang` + `pickCopy`) rather than inventing a new i18n
 * pattern (memory `feedback_reuse_existing_ui_patterns`).
 */
import { useTranslation } from "react-i18next";

export type VideoStudioLang = "th" | "en";

export function useVideoStudioLang(): VideoStudioLang {
  const { i18n } = useTranslation();
  return i18n.language?.toLowerCase().startsWith("th") ? "th" : "en";
}

export function pickCopy<T>(lang: VideoStudioLang, value: { th: T; en: T }): T {
  return lang === "th" ? value.th : value.en;
}

export const videoStudioCopy = {
  dashboard: { th: "แดชบอร์ด", en: "Dashboard" },
  pageTitle: { th: "สตูดิโอวิดีโอ", en: "Video Studio" },
  pageDescription: {
    th: "สร้างวิดีโอจากสินค้าในตลาด (Catalog) หรือเริ่มโปรเจกต์ motion graphic เปล่า",
    en: "Create videos from a marketplace product (Catalog) or start a blank motion graphics project.",
  },
  newFromProduct: { th: "สร้างจากสินค้า", en: "New from product" },
  productDescriptionLabel: {
    th: "รายละเอียดสินค้า",
    en: "Product description",
  },
  showMoreDescription: { th: "แสดงเพิ่มเติม", en: "Show more" },
  showLessDescription: { th: "ย่อ", en: "Show less" },
  productImagesLabel: { th: "เลือกรูปภาพสินค้า", en: "Select product images" },
  selectAllImages: { th: "เลือกทั้งหมด", en: "Select all" },
  clearImages: { th: "ล้าง", en: "Clear" },
  noProductImages: {
    th: "สินค้านี้ไม่มีรูปภาพ",
    en: "This product has no images",
  },
  newBlankProject: { th: "โปรเจกต์เปล่าใหม่", en: "New blank project" },
  searchPlaceholder: { th: "ค้นหาโปรเจกต์...", en: "Search projects..." },
  allStudioTypes: { th: "ทั้งหมด", en: "All" },
  studioTypeCatalog: { th: "Catalog Video", en: "Catalog Video" },
  studioTypeMotion: { th: "Motion Studio", en: "Motion Studio" },
  studioTypeContent: { th: "AI Content", en: "AI Content" },
  studioTypeReviewRemix: { th: "Review Remix", en: "Review Remix" },
  studioTypeImported: { th: "นำเข้า", en: "Imported" },
  emptyTitle: { th: "ยังไม่มีโปรเจกต์วิดีโอ", en: "No video projects yet" },
  emptyBody: {
    th: "เริ่มต้นด้วยการสร้างจากสินค้า หรือสร้างโปรเจกต์ motion เปล่า",
    en: "Get started by creating from a product, or start a blank motion project.",
  },
  errorTitle: {
    th: "โหลดรายการโปรเจกต์ไม่สำเร็จ",
    en: "Failed to load projects",
  },
  notAvailable: {
    th: "ฟีเจอร์นี้ยังไม่เปิดใช้งานสำหรับบัญชีของคุณ",
    en: "This feature is not available for your account.",
  },
  loading: { th: "กำลังโหลด...", en: "Loading..." },
  cancel: { th: "ยกเลิก", en: "Cancel" },
  dismiss: { th: "ปิด", en: "Dismiss" },
  save: { th: "บันทึก", en: "Save" },
  saved: { th: "บันทึกแล้ว", en: "Saved" },
  unsavedChanges: {
    th: "มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก",
    en: "You have unsaved changes",
  },
  conflictTitle: {
    th: "มีการเปลี่ยนแปลงจากที่อื่น",
    en: "This project changed elsewhere",
  },
  conflictBody: {
    th: "โปรเจกต์นี้ถูกแก้ไขจากที่อื่นแล้ว กรุณาโหลดใหม่ก่อนบันทึกต่อ (ระบบจะไม่เขียนทับข้อมูลให้อัตโนมัติ)",
    en: "This project was changed elsewhere. Reload before saving again — nothing is overwritten automatically.",
  },
  reload: { th: "โหลดใหม่", en: "Reload" },
  automationModeLabel: { th: "รูปแบบการทำงาน", en: "Workflow mode" },
  automationModeGuided: { th: "แนะนำทีละขั้น", en: "Guided" },
  automationModeManual: { th: "แก้ไขเอง", en: "Manual" },

  /* Stage rail — each label names its artifact (not the ambiguous word
   * "captions"/"narration" alone) so users don't confuse spoken-audio
   * narration with the subtitle text it auto-derives. */
  stageBrief: { th: "โจทย์", en: "Brief" },
  stageScenes: { th: "ฉาก", en: "Scenes" },
  stageNarration: { th: "เสียงพากย์ (Voice-over)", en: "Voice-over" },
  stageMotion: { th: "โมชัน", en: "Motion" },
  stageBroll: { th: "B-roll", en: "B-roll" },
  stageCaptions: {
    th: "ซับไทเทิล & สไตล์คำบรรยาย",
    en: "Subtitles & caption style",
  },
  stageQa: { th: "ตรวจสอบคุณภาพ", en: "QA" },
  stageRender: { th: "เรนเดอร์", en: "Render" },

  runScenePlan: { th: "สร้างแผนฉากด้วย AI", en: "Generate scene plan (AI)" },
  scenePlanAlreadyReady: {
    th: "ฉากและบทพูดพร้อมแล้ว",
    en: "Scenes and narration are already ready",
  },
  scenePlanAlreadyReadyBody: {
    th: "ระบบใช้ฉากและบทพูดจาก draft ที่ยืนยันแล้ว ไม่ต้องสร้างฉากซ้ำ หากต้องการวางแผนใหม่ให้เลือกโหมดแทนที่",
    en: "The accepted draft already provides the scenes and narration. No second scene plan is needed; choose Replace only when you intentionally want to re-plan.",
  },
  draftAcceptedHandoffTitle: {
    th: "ส่งต่อ draft ไปยังฉากแล้ว",
    en: "Draft handed off to Scenes",
  },
  draftAcceptedHandoffBody: {
    th: "ฉากและบทพูดด้านล่างมาจาก draft เดิมที่คุณยืนยันแล้ว ตรวจสอบหรือแก้ไขได้ทันที ไม่ต้องสร้างฉากใหม่ซ้ำ",
    en: "The scenes and narration below come from the draft you accepted. Review or edit them directly; you do not need to create another scene plan.",
  },
  runNarration: {
    th: "สร้างเสียงพากย์ (TTS)",
    en: "Generate voice-over (TTS)",
  },
  runQualityReview: { th: "ตรวจสอบคุณภาพด้วย AI", en: "Run AI quality review" },

  /* Narration <-> Captions relationship note (this task) */
  narrationCaptionsNote: {
    th: 'การสร้างเสียงพากย์จะสร้างซับไทเทิลให้อัตโนมัติจากบทเดียวกัน แก้ไขข้อความบทพูดได้ที่แท็บ "ฉาก"',
    en: 'Generating voice-over also auto-creates subtitle cues from the same script. Edit the script text in the "Scenes" tab.',
  },
  goToScenes: { th: "ไปที่แท็บฉาก", en: "Go to Scenes tab" },

  /* Captions panel — subtitle text preview vs style/export split */
  captionsCueListTitle: { th: "ข้อความซับไทเทิล", en: "Subtitle text" },
  captionsStyleExportTitle: { th: "สไตล์ & การส่งออก", en: "Style & export" },
  captionsCueListEmpty: {
    th: 'ยังไม่มีซับไทเทิล — ซับจะปรากฏหลังจากสร้างเสียงพากย์ในแท็บ "เสียงพากย์"',
    en: 'No subtitle cues yet — cues appear here after you generate voice-over in the "Voice-over" tab.',
  },

  /* Motion panel — auto-draft awareness */
  motionAutoDraftBanner: {
    th: "เทมเพลตโมชันถูกร่างให้อัตโนมัติแล้วตอนวางแผนฉาก แท็บนี้ใช้สำหรับปรับแต่งเพิ่มเติมเท่านั้น",
    en: "Motion templates were already drafted automatically when scenes were planned. This tab is for adjusting them.",
  },
  motionAutoDraftBadge: { th: "ร่างอัตโนมัติ", en: "Auto-drafted" },

  addScene: { th: "เพิ่มฉาก", en: "Add scene" },
  removeScene: { th: "ลบฉาก", en: "Remove scene" },

  exportSrt: { th: "ส่งออก SRT", en: "Export SRT" },
  exportVtt: { th: "ส่งออก VTT", en: "Export VTT" },

  compileError: {
    th: "คอมไพล์โปรเจกต์ไม่สำเร็จ",
    en: "Failed to compile project",
  },
  renderPreview: { th: "เรนเดอร์ตัวอย่าง", en: "Render preview" },
  renderFinal: { th: "เรนเดอร์ไฟล์จริง", en: "Render final" },
  renderCostEstimate: {
    th: "ประมาณการต้นทุนเรนเดอร์",
    en: "Render cost estimate",
  },
  viewRenderJob: { th: "ดูสถานะงานเรนเดอร์", en: "View render job" },

  claimViolation: {
    th: "มีข้อความอ้างสิทธิ์ที่ต้องห้ามหรือยังไม่ผ่านการตรวจสอบ กรุณาแก้ไขก่อนเรนเดอร์ไฟล์จริง",
    en: "There are prohibited or unmapped product claims. Fix them before rendering the final video.",
  },
  segmentedNotSupported: {
    th: "โปรเจกต์มีหลายส่วน ระบบจะเรนเดอร์แต่ละส่วนแล้วรวมเป็นไฟล์เดียว โดยคงลำดับเสียงและซับไตเติลไว้",
    en: "This project has multiple parts. Each part will render and then be combined into one file with continuous audio and subtitles.",
  },
  documentInvalid: {
    th: "ข้อมูลโปรเจกต์ไม่ถูกต้องตามรูปแบบที่กำหนด",
    en: "The project document does not match the required schema.",
  },
  documentNotInitialized: {
    th: "ยังไม่ได้บันทึกข้อมูลโปรเจกต์ กรุณาบันทึกโจทย์ก่อนเริ่มขั้นตอนนี้",
    en: "The project has not been initialized. Save the brief before starting this stage.",
  },
  stageNotReady: {
    th: "ขั้นตอนนี้ยังไม่มีผลลัพธ์ครบถ้วนให้อนุมัติ กรุณาทำขั้นตอนให้เสร็จก่อน",
    en: "This stage has no complete result to approve yet. Finish the stage first.",
  },
  modelNotRecommended: {
    th: "เลือกได้เฉพาะโมเดลที่ระบบแนะนำและรองรับงานนี้",
    en: "Only recommended models that support this task can be selected.",
  },
  draftNotReady: {
    th: "ยังไม่มี draft ที่พร้อมยืนยัน กรุณาสร้าง draft ก่อน",
    en: "There is no draft ready to accept. Create a draft first.",
  },
  draftNotChanged: {
    th: "draft ใหม่ซ้ำกับ draft เดิม กรุณาเพิ่มรายละเอียดที่ต้องการปรับปรุง",
    en: "The new draft is identical to the previous draft. Add more improvement details.",
  },
  jobErrorGeneric: {
    th: "งานล้มเหลว กรุณาลองใหม่อีกครั้งหรือติดต่อผู้ดูแลระบบ",
    en: "The job failed. Please try again or contact support.",
  },

  /* Section-07 — estimate -> confirm gate (D4) */
  stageFailedTitle: { th: "ขั้นตอนล้มเหลว", en: "Stage failed" },
  estimateTitle: {
    th: "ประมาณการเครดิตก่อนเริ่ม",
    en: "Credit estimate before running",
  },
  estimateCeiling: { th: "ใช้เครดิตอย่างมาก", en: "At most" },
  estimateTypical: { th: "โดยทั่วไปประมาณ", en: "Typically about" },
  estimateCeilingNote: {
    th: "เป็นเพดานสูงสุด (ตรวจ + ซ่อม + ตรวจซ้ำ ต่อรอบ) การเรียกเก็บจริงคิดตามจำนวนโทเค็นที่ใช้จริง",
    en: "This is a ceiling (review + repairs + re-review per round). Actual billing follows real token usage.",
  },
  estimateModel: { th: "โมเดลที่ใช้", en: "Model" },
  estimateMaxLoops: { th: "จำนวนรอบสูงสุด", en: "Max rounds" },
  estimateBasis: { th: "ที่มาของตัวเลข", en: "Why this number" },
  estimateConfirm: { th: "ยืนยันและเริ่ม", en: "Confirm and run" },
  noRecommendedModel: {
    th: "ยังไม่มีโมเดลที่แนะนำและรองรับผลลัพธ์แบบมีโครงสร้าง กรุณาติดต่อผู้ดูแลระบบ",
    en: "No recommended structured-output model is available. Please contact an administrator.",
  },
  insufficientCredits: {
    th: "เครดิตไม่พอสำหรับขั้นตอนนี้",
    en: "Not enough credits for this stage",
  },
  saveBeforeRunning: {
    th: "บันทึกการเปลี่ยนแปลงก่อนเริ่มขั้นตอนนี้",
    en: "Save your changes before running this stage",
  },
  autoSaveBeforeDraft: {
    th: "ระบบจะบันทึกการแก้ไขให้ก่อนสร้าง draft",
    en: "Your changes will be saved before the draft is created",
  },
  qaEmpty: {
    th: "ยังไม่เคยตรวจสอบคุณภาพโปรเจกต์นี้",
    en: "This project has not been reviewed yet",
  },
  qaScore: { th: "คะแนนรวม", en: "Overall score" },
  qaStale: {
    th: "ผลตรวจนี้ล้าสมัย (เอกสารเปลี่ยนไปหลังการตรวจ)",
    en: "This review is out of date — the document changed after it was produced",
  },
  qaStaleUnsaved: {
    th: "ผลตรวจนี้ยังไม่รวมการแก้ไขที่ยังไม่ได้บันทึก",
    en: "This review does not include your unsaved changes",
  },
  qaRerun: { th: "ตรวจสอบใหม่", en: "Re-run review" },
  qaIssuesHigh: { th: "รุนแรง", en: "High" },
  qaIssuesMedium: { th: "ปานกลาง", en: "Medium" },
  qaIssuesLow: { th: "เล็กน้อย", en: "Low" },
  qaIssuesUnknown: { th: "ไม่ระบุความรุนแรง", en: "Unspecified severity" },
  qaClaimBlockTitle: {
    th: "ติดล็อกการอ้างสิทธิ์ — ยังเรนเดอร์ไฟล์จริงไม่ได้",
    en: "Claim compliance blocks the final render",
  },
  qaClaimBlockFromDocument: {
    th: "ตรวจจากเอกสารปัจจุบัน (ผลจากเซิร์ฟเวอร์จะมาพร้อมการตรวจครั้งถัดไป)",
    en: "Derived from the current document — the server verdict arrives with the next review",
  },
  repairFree: { th: "ฟรี (ไม่เรียกใช้ AI)", en: "Free (no AI call)" },
  repairBillable: { th: "ใช้เครดิต", en: "Uses credits" },
  repairApplyAll: { th: "ซ่อมทั้งหมด", en: "Repair all" },
  qaRound: { th: "รอบที่", en: "Round" },
  qaRevert: { th: "ย้อนกลับรอบนี้", en: "Revert this round" },
  qaRevertConfirm: {
    th: "ย้อนเอกสารกลับไปสถานะก่อนการซ่อมรอบนี้?",
    en: "Revert the document to its state before this repair round?",
  },
  creditsActual: { th: "ใช้จริง", en: "Actual" },
  creditsFailedNotFree: {
    th: "ขั้นตอนล้มเหลว แต่เครดิตอาจถูกใช้ไปแล้วบางส่วน",
    en: "The stage failed, but credits may already have been spent",
  },
  scenePlanMode: { th: "โหมดการวางแผนซ้ำ", en: "Re-run mode" },
  scenePlanModeFillEmpty: {
    th: "วางแผนเฉพาะฉากที่ยังว่าง",
    en: "Plan only empty scenes",
  },
  scenePlanModeReplace: {
    th: "วางแผนใหม่ทั้งหมด (แทนที่ของเดิม)",
    en: "Re-plan everything (replaces existing)",
  },
  scenePlanReplaceWarning: {
    th: "จะเขียนทับฉากที่คุณแก้ไขเอง เอกสารเดิมถูกเก็บเป็นเวอร์ชันย้อนกลับได้",
    en: "This overwrites scenes you edited manually. The previous document is kept as a revertable revision.",
  },
  destructiveAcknowledge: {
    th: "ฉันเข้าใจและต้องการดำเนินการต่อ",
    en: "I understand and want to proceed",
  },
  planLayerBudget: {
    th: "แผนฉากใช้เลเยอร์เกิน 40 จึงเรนเดอร์ไฟล์จริงไม่ได้ ระบบไม่ได้แก้ไขเอกสารเดิม",
    en: "The plan exceeds the 40-layer budget, so it could never be final-rendered. Your document was left unchanged.",
  },
  planTimelineInvalid: {
    th: "ช่วงเวลาของฉากซ้อนทับหรือเกินความยาววิดีโอ ระบบไม่ได้แก้ไขเอกสารเดิม",
    en: "Scene timings overlap or exceed the video duration. Your document was left unchanged.",
  },
  planTemplateUnknown: {
    th: "แม่แบบฉากที่เลือกไม่รู้จัก ระบบไม่ได้แก้ไขเอกสารเดิม",
    en: "The selected scene template is unknown. Your document was left unchanged.",
  },
  planParamsInvalid: {
    th: "พารามิเตอร์ของแผนฉากไม่ถูกต้อง ระบบไม่ได้แก้ไขเอกสารเดิม",
    en: "The scene plan's parameters are invalid. Your document was left unchanged.",
  },
  goToQa: { th: "ไปที่ขั้นตอนตรวจสอบคุณภาพ", en: "Go to QA" },

  /* Brief panel UX (topic/audience presets + button clarity) */
  briefTopicLabel: { th: "หัวข้อวิดีโอ", en: "Video topic" },
  briefTopicHelper: {
    th: "กำหนดแนวเรื่องของฉากที่ AI จะวางแผนให้",
    en: "Sets the storyline direction the AI will use when planning scenes.",
  },
  briefTopicPresetsLabel: {
    th: "แม่แบบหัวข้อยอดนิยม",
    en: "Popular topic presets",
  },
  briefAudienceLabel: { th: "กลุ่มเป้าหมาย", en: "Target audience" },
  briefAudiencePresetsLabel: {
    th: "เลือกกลุ่มเป้าหมายที่ใกล้เคียง",
    en: "Pick a close audience match",
  },
  briefAudienceHelper: {
    th: "ปรับโทนภาษาและสไตล์ภาพให้เหมาะกับกลุ่มเป้าหมาย",
    en: "Adjusts tone of voice and visual style to fit the audience.",
  },
  briefAudienceCustom: { th: "กำหนดเอง", en: "Custom" },
  briefNotesLabel: { th: "หมายเหตุ", en: "Notes" },
  briefNotesHelper: {
    th: "ข้อจำกัดหรือสิ่งที่ต้องมีในวิดีโอ เช่น ห้ามพูดเกินจริง ต้องมีโลโก้",
    en: "Constraints or must-haves for the video, e.g. avoid exaggerated claims, must include the logo.",
  },
  briefInitTitle: { th: "เริ่มร่างโครงวิดีโอ", en: "Draft the video outline" },
  briefInitButton: {
    th: "เริ่มร่างโครงวิดีโอ (ยังไม่สร้างวิดีโอ)",
    en: "Draft the outline (no video rendered yet)",
  },
  briefInitCaption: {
    th: "ระบบจะสร้างโครงเอกสารเปล่าเพื่อปลดล็อกแท็บถัดไป ยังไม่ใช้เครดิตและยังไม่เรนเดอร์วิดีโอ",
    en: "This creates an empty outline document to unlock the next tabs. No credits are used and no video is rendered yet.",
  },

  /* Product Library panel (right-side, catalog projects only) */
  productLibraryToggle: { th: "คลังสินค้า", en: "Product library" },
  productLibraryTitle: { th: "คลังสินค้า", en: "Product library" },
  productLibraryInfoTitle: { th: "ข้อมูลสินค้า", en: "Product details" },
  productLibraryImagesTitle: { th: "รูปภาพสินค้า", en: "Product images" },
  productLibraryVideosTitle: {
    th: "วิดีโอของสินค้านี้",
    en: "Videos of this product",
  },
  productLibraryImagesUsedCount: {
    th: "ใช้ในโปรเจกต์",
    en: "Used in project",
  },
  productLibraryImagesLoadError: {
    th: "โหลดรูปภาพสินค้าไม่สำเร็จ",
    en: "Failed to load product images",
  },
  productLibraryImagesEmpty: {
    th: "สินค้านี้ไม่มีรูปภาพ",
    en: "This product has no images",
  },
  productLibraryPriorProjectsEmpty: {
    th: "ยังไม่มีโปรเจกต์วิดีโอสตูดิโออื่นของสินค้านี้",
    en: "No other Video Studio projects for this product yet",
  },
  productLibraryPriorProjectsTitle: {
    th: "โปรเจกต์ Video Studio ก่อนหน้า",
    en: "Prior Video Studio projects",
  },
  productLibraryReviewRunsTitle: {
    th: "รอบตรวจสอบอัตโนมัติ",
    en: "Auto-review runs",
  },
  productLibraryReviewRunsEmpty: {
    th: "ยังไม่มีรอบตรวจสอบอัตโนมัติของสินค้านี้",
    en: "No auto-review runs for this product yet",
  },
  productLibraryProductInfoFallback: {
    th: "แสดงข้อมูลจากตอนสร้างโปรเจกต์ (โหลดข้อมูลล่าสุดไม่สำเร็จ)",
    en: "Showing the snapshot saved when this project was created — could not load the latest data.",
  },
  productLibraryPrice: { th: "ราคา", en: "Price" },
  productLibraryOpenProduct: { th: "เปิดหน้าสินค้า", en: "Open product" },

  /* Brief panel — auto-draft-everything launcher (Feature 142 follow-on).
   * One click chains scene plan -> narration script -> voice-over -> subtitle
   * cues into a single job so a fresh project has a full first draft to
   * refine, instead of running each stage by hand. */
  briefAutoDraftTitle: {
    th: "ร่างเนื้อหาให้อัตโนมัติทั้งหมด",
    en: "Auto-draft everything",
  },
  briefAutoDraftDescription: {
    th: "AI จะวางแผนฉาก เขียนบทพากย์ สร้างเสียงพากย์ และสร้างซับไทเทิลให้ในขั้นตอนเดียว จากนั้นคุณสามารถแก้ไขแต่ละแท็บเพิ่มเติมได้ ระบบจะไม่เขียนทับเนื้อหาที่คุณกรอกไว้แล้ว",
    en: "AI plans the scenes, writes the narration script, generates voice-over, and creates subtitles in one go. You can then refine each tab. It will not overwrite content you've already filled in.",
  },
  briefAutoDraftButton: {
    th: "ร่างเนื้อหาให้อัตโนมัติทั้งหมด",
    en: "Auto-draft everything",
  },
  briefAutoDraftCreditsNote: {
    th: "ขั้นตอนนี้ใช้เครดิต — ดูเพดานการใช้เครดิตในหน้าต่างยืนยันก่อนเริ่ม",
    en: "This uses credits — see the ceiling in the confirmation dialog before running.",
  },

  // --- Scenes editing ---
  sceneCardTitle: { th: "ฉากที่", en: "Scene" },
  sceneMoveUp: { th: "ย้ายฉากขึ้น", en: "Move scene up" },
  sceneMoveDown: { th: "ย้ายฉากลง", en: "Move scene down" },
  sceneDuplicate: { th: "ทำสำเนาฉาก", en: "Duplicate scene" },
  sceneDeleteTitle: { th: "ลบฉากนี้?", en: "Delete this scene?" },
  sceneDeleteConfirm: {
    th: "ฉากนี้มีบทพากย์ ซับไทเทิล หรือภาพที่ตั้งค่าไว้แล้ว การลบจะไม่สามารถย้อนกลับได้ในแท็บนี้ (แต่โปรเจกต์มีประวัติเวอร์ชันแยกต่างหาก)",
    en: "This scene has narration, caption cues, or a configured visual. Deleting it cannot be undone in this tab (though the project keeps separate revision history).",
  },
  sceneDeleteAction: { th: "ลบฉาก", en: "Delete scene" },
  sceneNarrationEmpty: { th: "ยังไม่มีบทพากย์", en: "No narration yet" },
  addSceneHelper: {
    th: "เพิ่มฉากใหม่ต่อท้ายไทม์ไลน์ปัจจุบัน",
    en: "Appends a new scene after the current timeline.",
  },

  // --- Render / error codes / stage state ---
  renderPreviewHelper: {
    th: "เร็วและถูก ความละเอียด/เฟรมเรตต่ำกว่า เหมาะสำหรับตรวจงานก่อนส่งจริง",
    en: "Fast and cheap — lower resolution/frame rate. Good for checking your work before the real thing.",
  },
  renderFinalHelper: {
    th: "คุณภาพเต็ม ใช้เวลาและเครดิตมากกว่า สำหรับไฟล์ที่จะส่งมอบจริง",
    en: "Full quality — takes longer and costs more. Use this for the file you actually deliver.",
  },
  renderFinalConfirmTitle: {
    th: "ยืนยันเรนเดอร์ไฟล์จริง?",
    en: "Confirm final render?",
  },
  renderFinalConfirmBody: {
    th: "การเรนเดอร์ไฟล์จริงเป็นขั้นตอนที่ใช้เครดิตมากที่สุดในแอปนี้ ดูตัวเลขต้นทุนโดยประมาณด้านบน (คะแนนต้นทุน/ระดับต้นทุน) ก่อนยืนยัน การเรนเดอร์จะเริ่มทำงานทันทีหลังกดยืนยันและไม่สามารถยกเลิกกลางคันได้",
    en: "Final render is the most credit-expensive action in this app. Review the cost estimate above (cost score/class) before confirming. Rendering starts immediately after you confirm and cannot be cancelled mid-run.",
  },
  renderFinalConfirmAction: {
    th: "ยืนยันเรนเดอร์ไฟล์จริง",
    en: "Confirm final render",
  },

  /* Per-stage rail status badges (derived client-side — see stageRailState.ts) */
  stageStateEmpty: { th: "ว่าง", en: "Empty" },
  stageStateDrafted: { th: "ร่างแล้ว", en: "Drafted" },
  stageStateRunning: { th: "กำลังทำงาน", en: "Running" },
  stageStateError: { th: "ผิดพลาด", en: "Error" },
  stageStateDone: { th: "เสร็จ", en: "Done" },

  /* VI_* error codes not already covered by an existing key above. */
  brandLockViolation: {
    th: "มีการละเมิดข้อกำหนดชุดแบรนด์ (โลโก้ สี หรือฟอนต์) กรุณาแก้ไขให้ตรงกับชุดแบรนด์ที่ล็อกไว้แล้วลองใหม่",
    en: "This violates the locked brand kit (logo, color, or font). Fix it to match the locked brand kit and try again.",
  },
  queueUnavailable: {
    th: "ระบบคิวงานไม่พร้อมใช้งานชั่วคราว กรุณาลองใหม่อีกครั้งในอีกสักครู่",
    en: "The job queue is temporarily unavailable. Please try again in a moment.",
  },
  repairStaleReview: {
    th: "ผลตรวจสอบที่จะใช้ซ่อมล้าสมัยแล้ว (เอกสารถูกแก้ไขหลังการตรวจสอบครั้งล่าสุด) กรุณาตรวจสอบคุณภาพใหม่ก่อนซ่อม",
    en: "The review used for repair is out of date — the document changed after that review. Run a fresh quality review before repairing.",
  },
  repairNoInstructions: {
    th: "ยังไม่มีคำแนะนำการซ่อมจากผลตรวจสอบล่าสุด กรุณาตรวจสอบคุณภาพก่อนเริ่มซ่อม",
    en: "The latest review has no repair instructions yet. Run a quality review before repairing.",
  },
  narrationScriptInvalid: {
    th: "สร้างบทพากย์ไม่สำเร็จ (ผลลัพธ์จาก AI ไม่ตรงตามรูปแบบที่กำหนด) กรุณาลองสร้างใหม่อีกครั้ง",
    en: "Generating the narration script failed — the AI output didn't match the required format. Please try again.",
  },
  revisionConflict: {
    th: "ขั้นตอนนี้เริ่มทำงานกับเอกสารรุ่นเก่า และเอกสารถูกแก้ไขที่อื่นระหว่างทำงาน กรุณาโหลดโปรเจกต์ใหม่แล้วลองอีกครั้ง",
    en: "This stage started against an older document revision, and the document changed elsewhere while it ran. Reload the project and try again.",
  },
  missingSourceRefs: {
    th: "โปรเจกต์ Catalog นี้ยังไม่ได้เชื่อมโยงกับสินค้า กรุณาระบุสินค้าก่อนจึงจะเรนเดอร์ไฟล์จริงได้",
    en: "This Catalog project isn't linked to a product yet. Attach a product before you can final-render.",
  },
  assetUnresolved: {
    th: "มีไฟล์สื่อที่อ้างอิงในโปรเจกต์นี้ใช้งานไม่ได้ (อาจถูกลบหรือไม่ได้เป็นของบัญชีนี้) กรุณาตรวจสอบรูปภาพ/วิดีโอ/เสียงที่ใช้ในฉาก",
    en: "A media asset referenced by this project can't be resolved (it may have been deleted, or doesn't belong to this account). Check the images/video/audio used in your scenes.",
  },
  templateUnknown: {
    th: "แม่แบบฉาก (template) ที่ใช้ไม่รู้จักในระบบ กรุณาเลือกแม่แบบใหม่ในแท็บโมชันแล้วบันทึกก่อนเรนเดอร์",
    en: "The scene template used is not recognized. Pick a different template in the Motion tab and save before rendering.",
  },
  reviewOutputInvalid: {
    th: "ตรวจสอบคุณภาพไม่สำเร็จ (ผลลัพธ์จาก AI ไม่ตรงตามรูปแบบที่กำหนด) กรุณาลองตรวจสอบใหม่อีกครั้ง",
    en: "The quality review failed — the AI output didn't match the required format. Please run the review again.",
  },
  repairOutputInvalid: {
    th: "ซ่อมเนื้อหาไม่สำเร็จ (ผลลัพธ์จาก AI ไม่ตรงตามรูปแบบที่กำหนด) กรุณาลองซ่อมใหม่อีกครั้ง",
    en: "The repair failed — the AI output didn't match the required format. Please try repairing again.",
  },

  // --- Revisions / project actions ---
  retry: { th: "ลองใหม่", en: "Retry" },
  productLibrarySourceRefsError: {
    th: "เชื่อมโยงสินค้ากับโปรเจกต์ไม่สำเร็จ — การเรนเดอร์ขั้นสุดท้ายอาจถูกบล็อก",
    en: "Couldn't link the product to this project — final render may be blocked.",
  },
  revisionHistoryOpen: { th: "ประวัติเวอร์ชัน", en: "Revision history" },
  revisionHistoryTitle: { th: "ประวัติเวอร์ชัน", en: "Revision history" },
  revisionHistorySubtitle: {
    th: "ดูเวอร์ชันก่อนหน้าของโปรเจกต์นี้ และกู้คืนเวอร์ชันที่ต้องการ",
    en: "Browse previous versions of this project and restore one if needed.",
  },
  revisionHistoryEmpty: {
    th: "ยังไม่มีประวัติเวอร์ชันสำหรับโปรเจกต์นี้",
    en: "No revision history for this project yet.",
  },
  revisionHistoryLoadError: {
    th: "โหลดประวัติเวอร์ชันไม่สำเร็จ",
    en: "Failed to load revision history",
  },
  revisionHistoryRevisionLabel: { th: "เวอร์ชันที่", en: "Revision" },
  revisionHistoryRestore: { th: "กู้คืน", en: "Restore" },
  revisionHistoryRestoreConfirmTitle: {
    th: "กู้คืนเวอร์ชันนี้?",
    en: "Restore this revision?",
  },
  revisionHistoryRestoreConfirmBody: {
    th: "การเปลี่ยนแปลงหลังจากเวอร์ชันนี้จะถูกแทนที่ด้วยเวอร์ชันที่เลือก (ระบบจะสร้างเวอร์ชันใหม่จากเวอร์ชันนี้ ไม่ลบประวัติเดิม)",
    en: "Changes made after this revision will be replaced by the selected one (a new revision is created from it — history is never deleted).",
  },
  revisionHistoryRestoreSuccess: {
    th: "กู้คืนเวอร์ชันสำเร็จ",
    en: "Revision restored",
  },
  revisionHistoryClose: { th: "ปิด", en: "Close" },
  projectDelete: { th: "ลบโปรเจกต์", en: "Delete project" },
  projectDeleteConfirmTitle: {
    th: "ลบโปรเจกต์นี้?",
    en: "Delete this project?",
  },
  projectDeleteConfirmBody: {
    th: "การลบไม่สามารถย้อนกลับได้ ข้อมูลโปรเจกต์และประวัติเวอร์ชันทั้งหมดจะถูกลบถาวร",
    en: "This cannot be undone. The project and all of its revision history will be permanently deleted.",
  },
  projectDeleteSuccess: { th: "ลบโปรเจกต์แล้ว", en: "Project deleted" },

  // --- Brand kit ---
  brandKitOpen: { th: "Brand Kit", en: "Brand kit" },
  brandKitTitle: { th: "Brand Kit", en: "Brand kit" },
  brandKitSubtitle: {
    th: "ผูก Brand Kit เข้ากับโปรเจกต์นี้เพื่อคุมสี ฟอนต์ และกฎการล็อกแบรนด์ตอนเรนเดอร์",
    en: "Attach a brand kit to this project to enforce colors, fonts, and brand-lock rules at render time.",
  },
  brandKitAttachedSectionTitle: {
    th: "ผูกกับโปรเจกต์นี้",
    en: "Attached to this project",
  },
  brandKitNoneAttached: {
    th: "ยังไม่ได้ผูก Brand Kit กับโปรเจกต์นี้",
    en: "No brand kit attached to this project yet",
  },
  brandKitSelectLabel: { th: "เลือก Brand Kit", en: "Select brand kit" },
  brandKitSelectPlaceholder: {
    th: "เลือก Brand Kit ที่จะผูก...",
    en: "Choose a brand kit to attach...",
  },
  brandKitDetach: { th: "ยกเลิกการผูก", en: "Detach" },
  brandKitAttachSuccess: { th: "ผูก Brand Kit แล้ว", en: "Brand kit attached" },
  brandKitDetachSuccess: {
    th: "ยกเลิกการผูก Brand Kit แล้ว",
    en: "Brand kit detached",
  },
  brandKitNoDocumentYet: {
    th: "บันทึกการผูกไว้แล้ว แต่โปรเจกต์นี้ยังไม่มีเอกสารวิดีโอ กรุณาไปที่ขั้นตอนโจทย์เพื่อเริ่มต้นเอกสารก่อน ระบบจะดึง Brand Kit นี้เข้าไปให้อัตโนมัติตอนบันทึกครั้งแรก",
    en: "Attachment saved, but this project has no video document yet. Go to the Brief stage to initialize the document first — this brand kit will be pulled in automatically on the first save.",
  },
  brandKitManageSectionTitle: {
    th: "จัดการ Brand Kit",
    en: "Manage brand kits",
  },
  brandKitEmptyTitle: { th: "ยังไม่มี Brand Kit", en: "No brand kits yet" },
  brandKitEmptyBody: {
    th: "สร้าง Brand Kit แรกของคุณเพื่อคุมสี ฟอนต์ และกฎการล็อกแบรนด์ให้ทุกวิดีโอ",
    en: "Create your first brand kit to keep colors, fonts, and brand-lock rules consistent across every video.",
  },
  brandKitCreateFirst: {
    th: "สร้าง Brand Kit แรก",
    en: "Create your first brand kit",
  },
  brandKitCreateNew: { th: "สร้าง Brand Kit ใหม่", en: "New brand kit" },
  brandKitNameLabel: { th: "ชื่อ Brand Kit", en: "Brand kit name" },
  brandKitNamePlaceholder: {
    th: "เช่น แบรนด์หลัก 2026",
    en: "e.g. Main brand 2026",
  },
  brandKitColorsLabel: { th: "สี", en: "Colors" },
  brandKitColorPrimary: { th: "สีหลัก", en: "Primary" },
  brandKitColorSecondary: { th: "สีรอง", en: "Secondary" },
  brandKitColorAccent: { th: "สีเน้น", en: "Accent" },
  brandKitFontsLabel: { th: "ฟอนต์", en: "Fonts" },
  brandKitFontHeading: { th: "ฟอนต์หัวข้อ", en: "Heading font" },
  brandKitFontBody: { th: "ฟอนต์เนื้อหา", en: "Body font" },
  brandKitCaptionPresetLabel: {
    th: "รูปแบบคำบรรยายเริ่มต้น",
    en: "Default caption preset",
  },
  brandKitCaptionPresetNone: { th: "ไม่กำหนด", en: "Not set" },
  brandKitLocksLabel: { th: "การล็อกแบรนด์", en: "Brand locks" },
  brandKitLockColors: { th: "ล็อกสี", en: "Lock colors" },
  brandKitLockColorsHint: {
    th: "ถ้าเปิด: บล็อกการเรนเดอร์ถ้าเลเยอร์ที่ล็อกใช้สีไม่ตรงกับสีหลักของแบรนด์",
    en: "When on: blocks render if a locked layer's color doesn't match the brand's primary color.",
  },
  brandKitLockFonts: { th: "ล็อกฟอนต์", en: "Lock fonts" },
  brandKitLockFontsHint: {
    th: "ถ้าเปิด: บล็อกการเรนเดอร์ถ้าเลเยอร์ข้อความที่ล็อกใช้ฟอนต์ไม่ตรงกับฟอนต์เนื้อหาของแบรนด์",
    en: "When on: blocks render if a locked text layer's font doesn't match the brand's body font.",
  },
  brandKitLockIconStyle: { th: "ล็อกสไตล์ไอคอน", en: "Lock icon style" },
  brandKitLockIconStyleHint: {
    th: "ถ้าเปิด: บล็อกการเรนเดอร์ถ้ารูปทรงไอคอนในวิดีโอไม่สอดคล้องกัน",
    en: "When on: blocks render if icon shapes across the video are inconsistent.",
  },
  brandKitLockMotionIntensity: {
    th: "ล็อกความเข้มของโมชัน",
    en: "Lock motion intensity",
  },
  brandKitLockMotionIntensityHint: {
    th: "ถ้าเปิด: บล็อกการเรนเดอร์ถ้าระดับความเข้มของโมชันในแต่ละฉากไม่สอดคล้องกัน",
    en: "When on: blocks render if motion intensity is inconsistent across scenes.",
  },
  brandKitLockCta: { th: "ล็อกข้อความ CTA", en: "Lock CTA text" },
  brandKitLockCtaHint: {
    th: "ถ้าเปิด: บล็อกการเรนเดอร์ถ้าเลเยอร์ข้อความ CTA ไม่สอดคล้องกันตลอดวิดีโอ",
    en: "When on: blocks render if CTA text layers are inconsistent throughout the video.",
  },
  brandKitLockProductFidelity: {
    th: "ล็อกความถูกต้องของสินค้า",
    en: "Lock product fidelity",
  },
  brandKitLockProductFidelityHint: {
    th: "ถ้าเปิด: บล็อกการเรนเดอร์ถ้ารูปสินค้าถูกบีบหรือยืดจนผิดสัดส่วน",
    en: "When on: blocks render if a product image fill is stretched/distorted out of its aspect ratio.",
  },
  brandKitSave: { th: "บันทึก Brand Kit", en: "Save brand kit" },
  brandKitCreateSuccess: {
    th: "สร้าง Brand Kit แล้ว",
    en: "Brand kit created",
  },
  brandKitUpdateSuccess: {
    th: "อัปเดต Brand Kit แล้ว",
    en: "Brand kit updated",
  },
  brandKitEdit: { th: "แก้ไข", en: "Edit" },
  brandKitDelete: { th: "ลบ Brand Kit", en: "Delete brand kit" },
  brandKitDeleteConfirmTitle: {
    th: "ลบ Brand Kit นี้?",
    en: "Delete this brand kit?",
  },
  brandKitDeleteConfirmBody: {
    th: "การลบไม่สามารถย้อนกลับได้ โปรเจกต์ที่ผูก Brand Kit นี้อยู่จะไม่ถูกล็อกแบรนด์อีกต่อไป",
    en: "This cannot be undone. Projects with this brand kit attached will no longer be brand-locked by it.",
  },
  brandKitDeleteSuccess: { th: "ลบ Brand Kit แล้ว", en: "Brand kit deleted" },
  brandKitLoadError: {
    th: "โหลดรายการ Brand Kit ไม่สำเร็จ",
    en: "Failed to load brand kits",
  },
  brandKitNameRequired: {
    th: "กรุณากรอกชื่อ Brand Kit",
    en: "Brand kit name is required",
  },

  // --- Motion variants ---
  runMotionVariants: {
    th: "สร้าง Motion graphics ตามบทพูดด้วย AI",
    en: "Generate narration-synced motion graphics (AI)",
  },
  motionVariantsTitle: {
    th: "สร้าง Motion graphics ตามบทพูดด้วย AI",
    en: "AI narration-synced motion graphics",
  },
  motionVariantMode: { th: "โหมดการสร้างซ้ำ", en: "Re-run mode" },
  motionVariantModeFillEmpty: {
    th: "สร้างเฉพาะฉากที่ยังไม่มีตัวเลือก",
    en: "Generate only scenes without candidates",
  },
  motionVariantModeReplace: {
    th: "สร้างตัวเลือกใหม่ทุกฉาก",
    en: "Regenerate candidates for every scene",
  },
  motionVariantReplaceWarning: {
    th: "จะสร้างตัวเลือกโมชันใหม่ทุกฉาก (ฉากที่เลือกไว้แล้วจะยังคงใช้ค่าที่เลือกอยู่ ระบบจะเสนอทางเลือกใหม่เพิ่มเติมเท่านั้น)",
    en: "This regenerates the offered options for every scene. Scenes that already have a selected candidate keep their current motion — only the offered alternatives are refreshed.",
  },
  motionVariantsHeading: {
    th: "ตัวเลือกโมชัน (AI)",
    en: "Motion variants (AI)",
  },
  motionVariantsEmpty: {
    th: "ยังไม่มีตัวเลือกโมชันสำหรับฉากนี้ — กดสร้างตัวเลือกโมชันด้วย AI ด้านบน",
    en: 'No motion variants yet for this scene — use "Generate motion variants" above.',
  },
  motionVariantsRejected: {
    th: "AI ไม่สามารถสร้างตัวเลือกที่ใช้งานได้สำหรับฉากนี้ กรุณาใช้ตัวแก้ไขแบบละเอียดด้านล่างแทน",
    en: "AI could not produce a valid option for this scene — use the manual editor below instead.",
  },
  motionVariantSelected: { th: "ตัวเลือกที่เลือกอยู่", en: "Selected" },
  motionVariantApply: { th: "ใช้ตัวเลือกนี้", en: "Apply this option" },
  motionVariantApplyError: {
    th: "ใช้ตัวเลือกโมชันไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
    en: "Failed to apply this motion candidate. Please try again.",
  },
  motionVariantIntensity: {
    th: "ความเข้มของการเคลื่อนไหว",
    en: "Motion intensity",
  },
  motionVariantCamera: { th: "การเคลื่อนกล้อง", en: "Camera" },
  motionVariantIntensityLow: { th: "น้อย", en: "Low" },
  motionVariantIntensityMedium: { th: "ปานกลาง", en: "Medium" },
  motionVariantIntensityHigh: { th: "มาก", en: "High" },
  motionManualEditorHeading: {
    th: "แก้ไขด้วยตนเอง (ขั้นสูง)",
    en: "Manual editor (advanced)",
  },
  motionVariantGenerationError: {
    th: "AI สร้างตัวเลือก Motion graphics ไม่สำเร็จ ระบบจะเก็บตัวเลือกที่ถูกต้องไว้ให้ หากยังไม่ผ่านให้ลองใหม่หรือเลือกโมเดล Structured ที่แนะนำ",
    en: "AI could not finish the motion-graphics options. Valid options are kept when available; try again or use the recommended structured model.",
  },
  brollPromptGenerationError: {
    th: "สร้าง prompt B-roll ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
    en: "The B-roll prompt could not be drafted. Please try again.",
  },

  // --- Asset picker ---
  assetPickerTitle: { th: "เลือกไฟล์สื่อ", en: "Choose media" },
  assetPickerSearchPlaceholder: { th: "ค้นหาไฟล์...", en: "Search files..." },
  assetPickerFilterAll: { th: "ทั้งหมด", en: "All" },
  assetPickerFilterImage: { th: "ภาพ", en: "Image" },
  assetPickerFilterVideo: { th: "วิดีโอ", en: "Video" },
  assetPickerFilterAudio: { th: "เสียง", en: "Audio" },
  assetPickerEmptyTitle: {
    th: "ยังไม่มีไฟล์ในคลัง",
    en: "No files in your library yet",
  },
  assetPickerEmptyBody: {
    th: "อัปโหลดหรือสร้างภาพ วิดีโอ หรือเสียงก่อน จึงจะเลือกใช้ที่นี่ได้",
    en: "Upload or generate an image, video, or audio file first — it will then show up here to choose from.",
  },
  assetPickerLoadError: {
    th: "โหลดรายการไฟล์ไม่สำเร็จ",
    en: "Failed to load files",
  },
  assetPickerLoadMore: { th: "โหลดเพิ่ม", en: "Load more" },
  assetPickerAudioTile: { th: "ไฟล์เสียง", en: "Audio file" },
  assetDockLibrary: { th: "คลัง", en: "Library" },
  assetDockHistory: { th: "ประวัติสื่อ", en: "Media history" },
  assetDockComputer: { th: "จากเครื่อง", en: "Computer" },
  assetDockHistoryError: {
    th: "โหลดประวัติสื่อไม่สำเร็จ",
    en: "Failed to load media history",
  },
  assetDockEmpty: {
    th: "ยังไม่มีสื่อที่สร้างเสร็จ",
    en: "No completed media yet",
  },
  assetDockComputerHint: {
    th: "ลากภาพหรือวิดีโอมาวาง หรือกดเพื่อเลือกไฟล์",
    en: "Drop an image or video here, or click to choose a file",
  },
  assetDockDragHint: {
    th: "ลากสื่อไปวางบน timeline ได้ทันที หรือแตะสื่อแล้วแตะช่องภาพ/วิดีโอ",
    en: "Drag media onto the timeline, or tap media then tap an image/video slot",
  },
  assetImportError: {
    th: "นำเข้าไฟล์ไม่สำเร็จ กรุณาตรวจสอบชนิดไฟล์แล้วลองใหม่",
    en: "File import failed. Check the file type and try again.",
  },
  imageModelLabel: { th: "โมเดลสร้างภาพ", en: "Image generation model" },
  noImageModel: {
    th: "ยังไม่มีโมเดลสร้างภาพที่แนะนำ",
    en: "No recommended image model",
  },
  defaultModel: { th: "ค่าเริ่มต้น", en: "default" },
  imagePromptLabel: { th: "Prompt สร้างภาพ", en: "Image prompt" },
  imagePromptPlaceholder: {
    th: "อธิบายภาพที่ต้องการสร้าง...",
    en: "Describe the image you want to create...",
  },
  generateImage: { th: "สร้างภาพ", en: "Generate image" },
  brollSectionTitle: {
    th: "สร้าง B-roll จากเนื้อหาฉาก",
    en: "Create B-roll from scene content",
  },
  brollKindImage: { th: "ภาพนิ่ง", en: "Still image" },
  brollKindVideo: { th: "วิดีโอจากภาพ", en: "Image-to-video" },
  brollSceneLabel: { th: "ฉากที่จะนำไปสร้าง", en: "Scene to illustrate" },
  brollInstructionsLabel: {
    th: "สิ่งที่อยากให้ปรับเพิ่ม",
    en: "Extra direction",
  },
  brollInstructionsPlaceholder: {
    th: "เช่น เพิ่มบรรยากาศกลางคืน ให้เห็นมือกำลังสาธิต...",
    en: "For example: add a nighttime mood and show hands demonstrating...",
  },
  brollDraftPrompt: {
    th: "สร้าง prompt จากเนื้อหาด้วย Skill",
    en: "Draft prompt from scene with Skill",
  },
  brollReviewTitle: {
    th: "ตรวจสอบ prompt ก่อนสร้างจริง",
    en: "Review the prompt before generation",
  },
  brollPromptLabel: { th: "Prompt ที่แก้ไขได้", en: "Editable prompt" },
  brollNegativePromptLabel: { th: "สิ่งที่ไม่ต้องการ", en: "Negative prompt" },
  brollGenerateImage: {
    th: "ยืนยัน prompt และสร้างภาพ",
    en: "Confirm prompt and generate image",
  },
  brollGenerateVideo: {
    th: "ยืนยัน prompt และสร้างวิดีโอ",
    en: "Confirm prompt and generate video",
  },
  brollVideoModelLabel: {
    th: "โมเดลสร้างวิดีโอ",
    en: "Video generation model",
  },
  noVideoModel: {
    th: "ยังไม่มีโมเดลสร้างวิดีโอที่แนะนำ",
    en: "No recommended video model",
  },
  brollWaiting: {
    th: "กำลังสร้างสื่อแบบ async — สามารถทำงานส่วนอื่นต่อได้",
    en: "Generating asynchronously — you can continue editing",
  },
  brollReady: {
    th: "สร้างเสร็จแล้ว ลากไปวางหรือกดเพิ่มเป็น B-roll",
    en: "Ready — drag it to the timeline or insert as B-roll",
  },
  brollInsert: {
    th: "เพิ่มเป็น B-roll ณ playhead",
    en: "Insert as B-roll at playhead",
  },
  brollInsertScene: {
    th: "เพิ่มลงไทม์ไลน์ตามช่วงฉากนี้",
    en: "Insert into this scene's timeline range",
  },
  brollStageTitle: { th: "B-roll ตามฉาก", en: "Scene-based B-roll" },
  brollStageDescription: {
    th: "สร้างภาพหรือวิดีโอประกอบจากบทพากย์ของแต่ละฉาก แล้ววางลง timeline ตามช่วงเวลาของฉากโดยอัตโนมัติ",
    en: "Create supporting images or videos from each scene's narration and place them on the timeline using that scene's exact time range.",
  },
  brollSceneRange: { th: "ช่วงเวลาใน timeline", en: "Timeline range" },
  brollSceneNarration: {
    th: "เนื้อหาที่จะใช้เป็นต้นทางของ prompt",
    en: "Prompt source content",
  },
  brollSlotImage: { th: "ช่องภาพ", en: "Image slot" },
  brollSlotVideo: { th: "ช่องวิดีโอ", en: "Video slot" },
  brollSlotEmpty: {
    th: "ลากมาวาง หรือแตะสื่อจาก panel แล้วแตะช่องนี้",
    en: "Drop here, or tap media in the panel then tap this slot",
  },
  brollNeedImage: {
    th: "สร้างภาพก่อน แล้วจึงสร้างวิดีโอจากภาพนั้นได้",
    en: "Generate an image first before creating a video from it",
  },

  // --- Timeline (Feature 143, P1 — read-only timeline core) ---
  // Terminology per spec §4.15: track = "แทร็ก" (row heading only), clip =
  // "คลิป". "เลเยอร์" is reserved for the budget meter and MUST NOT appear
  // here. z-order is never shown as a number.
  timelineTitle: { th: "ไทม์ไลน์", en: "Timeline" },
  timelineTrackScene: { th: "ฉาก", en: "Scenes" },
  timelineTrackBrand: { th: "โลโก้ & ลายน้ำ", en: "Logo & watermark" },
  timelineTrackOverlay: { th: "ภาพ/ข้อความซ้อน", en: "Overlays" },
  timelineTrackBackground: {
    th: "พื้นหลัง (เต็มจอ)",
    en: "Background (full-bleed)",
  },
  timelineTrackSubtitles: {
    th: "ซับไทเทิล (ดูอย่างเดียว)",
    en: "Subtitles (read-only)",
  },
  timelineTrackAudio: { th: "เสียง", en: "Audio" },
  timelineTrackAudioNarration: { th: "เสียงพากย์", en: "Narration" },
  timelineTrackAudioMusic: { th: "เพลงประกอบ", en: "Music" },
  timelineTrackAudioSfx: { th: "เอฟเฟกต์เสียง", en: "Sound effects" },
  timelineSubtitleBurnInOn: { th: "เผารวมวิดีโอ", en: "Burned into video" },
  timelineSubtitleBurnInOff: { th: "ไม่เผารวมวิดีโอ", en: "Not burned in" },
  timelinePlayhead: { th: "ตัวชี้เวลา", en: "Playhead" },
  timelineClipHidden: { th: "ซ่อนอยู่", en: "Hidden" },
  timelineClipLocked: { th: "ล็อก", en: "Locked" },
  timelineZoomIn: { th: "ซูมเข้า", en: "Zoom in" },
  timelineZoomOut: { th: "ซูมออก", en: "Zoom out" },
  timelineZoomReset: { th: "รีเซ็ตการซูม", en: "Reset zoom" },
  timelineEmptyTrack: { th: "ยังไม่มีคลิป", en: "No clips yet" },

  // --- Layer list panel (D3 — first-class permanent surface, not a fallback) ---
  layerListTitle: { th: "รายการคลิป", en: "Clip list" },
  layerListEmpty: {
    th: "ยังไม่มีคลิปที่คุณวางเอง — ผลลัพธ์จาก AI จะแสดงในตัวอย่างด้านบน",
    en: "No hand-placed clips yet — the AI composition still shows in the preview above.",
  },
  layerListStart: { th: "เริ่มที่ (มิลลิวินาที)", en: "Start (ms)" },
  layerListDuration: { th: "ระยะเวลา (มิลลิวินาที)", en: "Duration (ms)" },
  layerListPositionX: { th: "ตำแหน่ง X (%)", en: "Position X (%)" },
  layerListPositionY: { th: "ตำแหน่ง Y (%)", en: "Position Y (%)" },
  layerListWidth: { th: "ความกว้าง (%)", en: "Width (%)" },
  layerListHeight: { th: "ความสูง (%)", en: "Height (%)" },
  layerListOpacity: { th: "ความทึบ", en: "Opacity" },
  layerListType: { th: "ชนิดคลิป", en: "Clip type" },

  // --- Timeline stage ---
  // Feature 143 (Video Studio — Layer & Timeline Editor), P1. D1's 8th stage
  // + its budget meter + its states (§4.13). Terminology follows §4.15 —
  // `เลเยอร์` is reserved for the budget meter only; the timeline itself
  // says `คลิป`/`แทร็ก`.
  stageCompose: { th: "จัดวาง & ไทม์ไลน์", en: "Layout & timeline" },
  stageComposeHelper: {
    th: "ไม่บังคับ — ถ้า AI ร่างให้แล้วพอใจ ข้ามไปตรวจสอบคุณภาพได้เลย",
    en: "Optional — if you're happy with the AI draft, skip straight to QA.",
  },

  // Budget meter (§4.6) — sourced breakdown, same nouns the user sees.
  budgetMeterTemplate: { th: "แม่แบบฉาก", en: "Scene templates" },
  budgetMeterHandAuthored: { th: "ที่คุณวางเอง", en: "You placed" },
  budgetMeterCaptions: { th: "ซับไทเทิล", en: "Subtitles" },
  budgetMeterAudio: { th: "เสียง", en: "Audio" },
  budgetMeterLabel: { th: "เลเยอร์ที่ใช้ไป", en: "Layers used" },
  budgetMeterLoading: {
    th: "กำลังคำนวณเลเยอร์...",
    en: "Calculating layers...",
  },
  budgetMeterFullTitle: {
    th: "ใช้เลเยอร์ครบ 40/40 แล้ว",
    en: "You've used all 40/40 layers",
  },
  budgetMeterRemedyBurnIn: {
    th: "เปิดฝังซับไทเทิลลงในวิดีโอเพื่อคืนเลเยอร์ซับทั้งหมด",
    en: "Turn on burn-in captions to reclaim every subtitle layer",
  },
  budgetMeterRemedyDeleteDecorative: {
    th: "ลบคลิปตกแต่งออก",
    en: "Delete decorative clips",
  },

  // Empty state (§4.13) — not an error, the four one-click launchers (G9).
  timelineEmptyTitle: {
    th: "ยังไม่มีสิ่งที่คุณวางเอง",
    en: "Nothing hand-placed yet",
  },
  timelineEmptyBody: {
    th: "นี่คือองค์ประกอบที่ AI ร่างไว้ให้ คุณสามารถเพิ่มของตัวเองทับได้ทุกเมื่อ",
    en: "This is the composition the AI drafted. You can add your own on top any time.",
  },
  timelineLauncherBackground: {
    th: "ใส่วิดีโอพื้นหลัง",
    en: "Add background video",
  },
  timelineLauncherText: { th: "ใส่ข้อความ", en: "Add text" },
  timelineLauncherLogo: { th: "ใส่โลโก้/ลายน้ำ", en: "Add logo/watermark" },
  timelineLauncherMusic: { th: "ใส่เพลงประกอบ", en: "Add music" },
  timelineLauncherComingSoon: { th: "เร็ว ๆ นี้", en: "Coming soon" },

  // Generation-job-running read-only state — the ONE legitimate whole-surface
  // disable (§4.13, §4.9.2 — an AI stage rewrites scene timings underneath
  // the user).
  timelineReadOnlyGenerating: {
    th: "AI กำลังร่างเนื้อหาอยู่ — แก้ไขได้เมื่อเสร็จ",
    en: "AI is drafting content — you can edit again once it finishes.",
  },

  // Feature-flag-off note (§4.13) — shown as a persistent non-blocking
  // header note, not just at the Render stage.
  timelineRenderFlagOffNote: {
    th: "การเรนเดอร์ยังไม่เปิดใช้งานสำหรับบัญชีนี้ — แก้ไขและบันทึกได้ตามปกติ",
    en: "Rendering isn't enabled for this account yet — editing and saving still work normally.",
  },

  // Segmented compile (§4.13) — never render the parts.
  timelineSegmentedNotSupported: {
    th: "โปรเจกต์มีหลายส่วน — ตัวอย่างรวมและไฟล์เรนเดอร์จริงจะต่อเนื่องตามลำดับเดียวกัน",
    en: "This project has multiple parts; the combined preview and final render use the same continuous order.",
  },

  // Narrow-screen banner (§4.14, <1024px).
  timelineNarrowScreenBanner: {
    th: "หน้าจอนี้แคบเกินไปสำหรับการลากวาง — แก้ไขค่าจากรายการด้านล่างได้ตามปกติ",
    en: "This screen is too narrow for drag editing — use the list below instead.",
  },
  stageApprovalTitle: { th: "ตรวจสอบขั้นตอน", en: "Stage review" },
  stageApprovalBody: {
    th: "ยืนยันผลลัพธ์ของขั้นตอนนี้ หรือส่งกลับพร้อมเหตุผลเพื่อแก้ไขต่อ",
    en: "Approve this stage, or send it back with a reason for further edits.",
  },
  stageApprovalApprove: { th: "อนุมัติขั้นตอน", en: "Approve stage" },
  stageApprovalReject: { th: "ส่งกลับแก้ไข", en: "Send back" },
  stageApprovalRejectTitle: {
    th: "ส่งขั้นตอนกลับแก้ไข",
    en: "Send stage back",
  },
  stageApprovalReason: { th: "เหตุผล (ไม่บังคับ)", en: "Reason (optional)" },
  stageApprovalConfirmReject: { th: "ยืนยันส่งกลับ", en: "Confirm send back" },
  stageApprovalStatus: { th: "สถานะ", en: "Status" },

  // Loading skeleton (§4.13) — not a spinner; shows the known track count.
  timelineLoadingSkeleton: {
    th: "กำลังเตรียมไทม์ไลน์...",
    en: "Preparing timeline...",
  },
  timelineMissingAsset: { th: "ไฟล์หาย", en: "Missing file" },
  timelineMissingAssetBanner: {
    th: "มีไฟล์สื่อที่หายหรือหมดอายุ — เปลี่ยนไฟล์ก่อนเรนเดอร์ขั้นสุดท้าย",
    en: "A media file is missing or expired — replace it before final render.",
  },
  timelineReplaceMissingAsset: { th: "เปลี่ยนไฟล์", en: "Replace file" },
  timelineReplaceMissingAssetTitle: {
    th: "เปลี่ยนไฟล์ที่หาย",
    en: "Replace missing file",
  },

  // --- Timeline editing ---
  // Feature 143 P2 (§4.5/§4.8/G7/AC15) — undo/redo, band controls, lock/hide,
  // inspector, autosave and the save-conflict recovery path. Terminology
  // follows §4.15: never a raw z-order number (`bringForward`/`sendBackward`
  // only), `ปรับช่วงเวลา`/`จุดเริ่ม`/`จุดจบ` for trims (never `ตัด`), `เลเยอร์`
  // reserved for the budget meter only.
  timelineUndo: { th: "เลิกทำ", en: "Undo" },
  timelineRedo: { th: "ทำซ้ำ", en: "Redo" },
  timelineBringForward: { th: "นำมาไว้ด้านหน้า", en: "Bring forward" },
  timelineSendBackward: { th: "ส่งไปด้านหลัง", en: "Send backward" },
  timelineLockClip: { th: "ล็อกคลิป", en: "Lock clip" },
  timelineUnlockClip: { th: "ปลดล็อกคลิป", en: "Unlock clip" },
  timelineHideClip: { th: "ซ่อนคลิป", en: "Hide clip" },
  timelineShowClip: { th: "แสดงคลิป", en: "Show clip" },
  timelineDuplicateClip: { th: "ทำสำเนาคลิป", en: "Duplicate clip" },
  timelineDeleteClip: { th: "ลบคลิป", en: "Delete clip" },
  timelineCopyClip: { th: "คัดลอกคลิป", en: "Copy clip" },
  timelinePasteClip: { th: "วางคลิป", en: "Paste clip" },
  timelineAdjustTiming: { th: "ปรับช่วงเวลา", en: "Adjust timing" },
  timelineEdgeStart: { th: "จุดเริ่ม", en: "Start edge" },
  timelineEdgeEnd: { th: "จุดจบ", en: "End edge" },
  timelineConcatenate: { th: "ต่อคลิป", en: "Concatenate" },

  // Inspector (§4.4 mock — "รายละเอียด") — shared selection surface.
  inspectorTitle: { th: "รายละเอียด", en: "Details" },
  inspectorNoSelection: {
    th: "ยังไม่ได้เลือกคลิป — ค่าที่แสดงคือของทั้งโปรเจกต์",
    en: "No clip selected — showing project-wide values.",
  },
  inspectorNameLabel: { th: "ชื่อคลิป", en: "Clip name" },
  inspectorRotationLabel: { th: "การหมุน (องศา)", en: "Rotation (deg)" },
  inspectorContentLabel: { th: "ข้อความ", en: "Text content" },
  inspectorColorLabel: { th: "สี", en: "Color" },
  inspectorFontLabel: { th: "ฟอนต์", en: "Font" },
  inspectorBrandLockedColor: {
    th: "สีถูกล็อกโดยชุดแบรนด์ — ใช้สีหลักของแบรนด์เท่านั้น",
    en: "Color is locked by the brand kit — the brand's primary color only.",
  },
  inspectorBrandLockedFont: {
    th: "ฟอนต์ถูกล็อกโดยชุดแบรนด์ — ใช้ฟอนต์เนื้อหาของแบรนด์เท่านั้น",
    en: "Font is locked by the brand kit — the brand's body font only.",
  },

  // Autosave (§4.5) — idle ~1.5s, shrinks the conflict window.
  timelineAutosaveSaving: {
    th: "กำลังบันทึกอัตโนมัติ...",
    en: "Autosaving...",
  },
  timelineAutosaveSaved: { th: "บันทึกอัตโนมัติแล้ว", en: "Autosaved" },
  timelineAutosaveError: {
    th: "บันทึกอัตโนมัติไม่สำเร็จ",
    en: "Autosave failed",
  },

  // Save-conflict recovery (§4.13/RK4) — never silently discards a drag.
  timelineConflictTitle: {
    th: "มีการเปลี่ยนแปลงจากที่อื่นระหว่างที่คุณแก้ไข",
    en: "This project changed elsewhere while you were editing",
  },
  timelineConflictBody: {
    th: "โหลดเวอร์ชันล่าสุดจากเซิร์ฟเวอร์ แล้วนำสิ่งที่คุณวางเองกลับไปใส่ให้อัตโนมัติ",
    en: "Reload the latest server version and automatically re-apply what you placed.",
  },
  timelineConflictKeepMine: {
    th: "เก็บการแก้ไขของฉันไว้",
    en: "Keep my edits",
  },

  // Layer list (D3) editable-mode row actions (§4.5).
  layerListLockToggle: { th: "ล็อก", en: "Lock" },
  layerListHideToggle: { th: "ซ่อน", en: "Hide" },
  layerListBringForward: { th: "นำมาไว้ด้านหน้า", en: "Bring forward" },
  layerListSendBackward: { th: "ส่งไปด้านหลัง", en: "Send backward" },
  layerListRename: { th: "ชื่อคลิป", en: "Clip name" },
  layerListDuplicate: { th: "ทำสำเนา", en: "Duplicate" },
  layerListRemove: { th: "ลบ", en: "Remove" },
  layerListRotation: { th: "การหมุน (องศา)", en: "Rotation (deg)" },

  // --- Timeline presets ---
  // Feature 143 P3 (§2 four launchers/G9, §3 named presets, §4 concat
  // affordance, §5 format-change confirm). Appended-only per this round's
  // brief — every key above this comment is untouched.

  // Launcher toolbar (reachable both from the empty state AND — new this
  // round — a persistent toolbar so launchers stay usable once the timeline
  // is no longer empty).
  timelineLauncherToolbarTitle: { th: "เพิ่มด่วน", en: "Quick add" },
  timelineLauncherBudgetFull: {
    th: "ใช้เลเยอร์ครบ 40/40 แล้ว — ดูวิธีเพิ่มพื้นที่ในมิเตอร์ด้านบน",
    en: "You've used all 40/40 layers — see the remedies in the meter above.",
  },

  // Asset-picker dialog titles per launcher (the picker's own default title
  // is generic; each launcher gives it a specific Thai title).
  timelineLauncherBackgroundPickerTitle: {
    th: "เลือกวิดีโอพื้นหลัง",
    en: "Choose a background video",
  },
  timelineLauncherLogoPickerTitle: {
    th: "เลือกโลโก้/ลายน้ำ",
    en: "Choose a logo/watermark",
  },
  timelineLauncherMusicPickerTitle: {
    th: "เลือกเพลงประกอบ",
    en: "Choose background music",
  },

  // Named presets (§7 P3 row) — reachable next to the launchers once the
  // timeline is no longer forced-empty.
  timelinePresetsTitle: { th: "เทมเพลตสำเร็จรูป", en: "Presets" },
  timelinePresetPromoPrice: {
    th: "ราคาโปรมุมบนขวา",
    en: "Promo price (top-right)",
  },
  timelinePresetStoreWatermark: { th: "ลายน้ำร้านค้า", en: "Store watermark" },
  timelinePresetOpeningText: {
    th: "ข้อความเปิด 3 วินาทีแรก",
    en: "Opening text (first 3s)",
  },
  timelinePresetClosingCta: { th: "CTA ปิดท้าย", en: "Closing CTA" },
  timelinePresetSubtitleBackdrop: {
    th: "แถบซับไทเทิลพื้นหลังทึบ",
    en: "Solid subtitle backdrop",
  },

  // Background concatenation (§4.5/G3) — "ต่อคลิป" appends a new clip right
  // after the last background clip; a hard cut, never implying a
  // transition.
  timelineConcatenateHint: {
    th: "ต่อคลิปใหม่ทันทีหลังคลิปสุดท้าย (ตัดตรง ไม่มีเอฟเฟกต์เปลี่ยนฉาก)",
    en: "Appends a new clip right after the last one (a hard cut — no transition effect).",
  },

  // Format-change confirm (§4.11/AC17) — `BriefPanel.tsx` shows this before
  // committing an fps/width/height edit on a project with hand-authored
  // layers.
  formatMigrateConfirmTitle: {
    th: "เปลี่ยนรูปแบบวิดีโอ?",
    en: "Change the video format?",
  },
  formatMigrateConfirmBody: {
    th: "โปรเจกต์นี้มีภาพซ้อน/ข้อความที่คุณวางเอง การเปลี่ยนอัตราเฟรมหรือขนาดจะปรับเวลาและขนาดตัวอักษรของสิ่งที่คุณวางเองให้ตรงกับรูปแบบใหม่โดยอัตโนมัติ ตำแหน่งและเวลาที่แท้จริงของสิ่งเหล่านั้นจะไม่เปลี่ยน",
    en: "This project has hand-placed overlays/text. Changing the frame rate or size will automatically re-scale their timing and text size to match the new format — their real position and timing won't shift.",
  },
  formatMigrateConfirmAction: {
    th: "ปรับและเปลี่ยนรูปแบบ",
    en: "Migrate and change format",
  },

  // --- Audio tracks ---
  // Feature 143 P3 §4.8/§6 — the audio-track controls (timeline row +
  // inspector). `audioDuckingLabel` is deliberately written with NO
  // technical term (no "dB", no "sidechain") per §6's own note: ducking is
  // a flat -6dB attenuation, not sidechain compression, and the UI must
  // never claim otherwise.
  audioVolumeLabel: { th: "ระดับเสียง", en: "Volume" },
  // Shown by `formatValue` at the slider's own -60dB floor, in place of the
  // number — this project has no separate `muted` field on an audio track
  // (see this round's task brief), so "muted" is a LABEL on the existing
  // `gainDb` floor, never a second boolean that could drift from it.
  audioVolumeMutedLabel: { th: "ปิดเสียง", en: "Muted" },
  audioDuckingLabel: {
    th: "ลดเสียงเพลงอัตโนมัติตอนมีเสียงพูด",
    en: "Automatically lower the music when there's speech",
  },
  audioSpanToggleLabel: {
    th: "กำหนดช่วงเวลาเอง",
    en: "Set a custom time range",
  },
  // Shown when a track's `startMs`/`endMs` are both absent (§4.8) — the
  // honest "spans the whole document" state, never mistaken for a bounded
  // span that happens to match today's duration.
  audioSpanFullVideoLabel: {
    th: "ตลอดทั้งวิดีโอ",
    en: "Spans the whole video",
  },
  audioSpanSetCustom: { th: "กำหนดช่วงเวลา", en: "Set a time range" },
  audioSpanMakeFullVideo: {
    th: "ทำให้เล่นตลอดทั้งวิดีโอ",
    en: "Make it span the whole video",
  },
  audioSpanStartLabel: {
    th: "เริ่มเสียงที่ (มิลลิวินาที)",
    en: "Audio start (ms)",
  },
  audioSpanEndLabel: { th: "จบเสียงที่ (มิลลิวินาที)", en: "Audio end (ms)" },
  audioFadeInLabel: { th: "ค่อยๆ ดังขึ้น (มิลลิวินาที)", en: "Fade in (ms)" },
  audioFadeOutLabel: { th: "ค่อยๆ เบาลง (มิลลิวินาที)", en: "Fade out (ms)" },
  audioRemoveTrackLabel: { th: "ลบแทร็กเสียง", en: "Remove audio track" },
} as const;

/**
 * Topic presets shown as quick-fill chips above the topic input. `{product}`
 * is interpolated with `brief.productName` when present (catalog projects);
 * falls back to a generic Thai noun otherwise. Kept as data (not inline JSX)
 * per the task brief so the list can grow without touching component logic.
 */
export const BRIEF_TOPIC_PRESETS: ReadonlyArray<{
  id: string;
  th: (product: string) => string;
  en: (product: string) => string;
}> = [
  { id: "intro", th: p => `แนะนำสินค้า ${p}`, en: p => `Introducing ${p}` },
  {
    id: "review",
    th: () => "รีวิวการใช้งานจริง",
    en: () => "Real-world usage review",
  },
  {
    id: "reasons",
    th: () => "5 เหตุผลที่ต้องมี",
    en: () => "5 reasons you need this",
  },
  { id: "unboxing", th: () => "Unboxing เปิดกล่อง", en: () => "Unboxing" },
  { id: "promo", th: () => "โปรโมชั่น/ลดราคา", en: () => "Promo / discount" },
  {
    id: "before_after",
    th: () => "เปรียบเทียบก่อน-หลังใช้",
    en: () => "Before vs. after comparison",
  },
];

/** Audience choice-chip presets; `custom` opens the free-text input instead of filling it. */
export const BRIEF_AUDIENCE_PRESETS: ReadonlyArray<{
  id: string;
  th: string;
  en: string;
}> = [
  { id: "new_moms", th: "คุณแม่มือใหม่", en: "New moms" },
  { id: "working_adults", th: "วัยทำงาน", en: "Working adults" },
  { id: "teens_students", th: "วัยรุ่น/นักศึกษา", en: "Teens / students" },
  { id: "seniors", th: "ผู้สูงอายุ", en: "Seniors" },
  { id: "health_conscious", th: "คนรักสุขภาพ", en: "Health-conscious people" },
  { id: "pet_owners", th: "เจ้าของสัตว์เลี้ยง", en: "Pet owners" },
  {
    id: "fashion_beauty",
    th: "สายแฟชั่น/ความงาม",
    en: "Fashion / beauty enthusiasts",
  },
];

/**
 * FE03 (pre-merge security gate, carried over from the deleted
 * `NotWiredJobCard`): only render an error verbatim when it is one of our
 * own greppable `VI_*` codes; any other value (arbitrary worker/job text, or
 * an HTML-looking payload) falls back to the generic message instead of
 * being echoed into the DOM. Never returns `null` for a non-empty input.
 */
export function renderableJobError(
  lang: VideoStudioLang,
  error: string | null | undefined
): string | null {
  if (!error) return null;
  return error.startsWith("VI_")
    ? error
    : pickCopy(lang, videoStudioCopy.jobErrorGeneric);
}

/**
 * Full `VI_*` -> Thai/English copy map (this task). Every `VI_*` code
 * greppable under `apps/web/server/` as of this writing is covered here —
 * re-grep before adding a new server-side `VI_` throw site so this map never
 * silently drifts out of date. Each message states what happened AND what to
 * do next; `VI_DOCUMENT_INVALID` in particular must NEVER have the raw Zod
 * dump appended after it (that was the pre-existing bug this map fixes).
 *
 * Codes already covered by an existing `videoStudioCopy` key (documentInvalid,
 * claimViolation, segmentedNotSupported, noRecommendedModel,
 * insufficientCredits, planTemplateUnknown, planLayerBudget,
 * planTimelineInvalid, planParamsInvalid) reference that key directly instead
 * of duplicating the text.
 */
export const VI_ERROR_COPY: Record<string, { th: string; en: string }> = {
  VI_DOCUMENT_INVALID: videoStudioCopy.documentInvalid,
  VI_DOCUMENT_NOT_INITIALIZED: videoStudioCopy.documentNotInitialized,
  VI_STAGE_NOT_READY: videoStudioCopy.stageNotReady,
  VI_MODEL_NOT_RECOMMENDED: videoStudioCopy.modelNotRecommended,
  VI_DRAFT_NOT_READY: videoStudioCopy.draftNotReady,
  VI_DRAFT_NOT_CHANGED: videoStudioCopy.draftNotChanged,
  VI_BRAND_LOCK_VIOLATION: videoStudioCopy.brandLockViolation,
  VI_NO_RECOMMENDED_MODEL: videoStudioCopy.noRecommendedModel,
  // Not a user-facing throw site today (it's an internal model-requirements
  // descriptor object) — mapped defensively in case it is ever interpolated
  // into a rejected error string, using the same admin-actionable copy as
  // VI_NO_RECOMMENDED_MODEL since both mean "no eligible structured model".
  VI_STRUCTURED_STAGE_REQUIREMENTS: videoStudioCopy.noRecommendedModel,
  VI_INSUFFICIENT_CREDITS: videoStudioCopy.insufficientCredits,
  VI_QUEUE_UNAVAILABLE: videoStudioCopy.queueUnavailable,
  VI_REPAIR_STALE_REVIEW: videoStudioCopy.repairStaleReview,
  VI_REPAIR_NO_INSTRUCTIONS: videoStudioCopy.repairNoInstructions,
  VI_NARRATION_SCRIPT_INVALID: videoStudioCopy.narrationScriptInvalid,
  VI_REVISION_CONFLICT: videoStudioCopy.revisionConflict,
  VI_SEGMENTED_RENDER_NOT_SUPPORTED: videoStudioCopy.segmentedNotSupported,
  VI_MISSING_SOURCE_REFS: videoStudioCopy.missingSourceRefs,
  VI_CLAIM_VIOLATION: videoStudioCopy.claimViolation,
  VI_ASSET_UNRESOLVED: videoStudioCopy.assetUnresolved,
  VI_TEMPLATE_UNKNOWN: videoStudioCopy.templateUnknown,
  VI_PLAN_TEMPLATE_UNKNOWN: videoStudioCopy.planTemplateUnknown,
  VI_PLAN_LAYER_BUDGET_EXCEEDED: videoStudioCopy.planLayerBudget,
  VI_PLAN_TIMELINE_INVALID: videoStudioCopy.planTimelineInvalid,
  VI_PLAN_PARAMS_INVALID: videoStudioCopy.planParamsInvalid,
  VI_REVIEW_OUTPUT_INVALID: videoStudioCopy.reviewOutputInvalid,
  VI_REPAIR_OUTPUT_INVALID: videoStudioCopy.repairOutputInvalid,
  VI_MOTION_VARIANT_INVALID: videoStudioCopy.motionVariantGenerationError,
  VI_BROLL_PROMPT_INVALID: videoStudioCopy.brollPromptGenerationError,
};

/**
 * Extracts the leading `VI_[A-Z0-9_]+` code (if any) from a raw error string
 * and looks it up in `VI_ERROR_COPY`. Unknown codes — including a `VI_`-
 * prefixed one we don't (yet) recognize — and any non-`VI_` error all fall
 * back to the SAME generic Thai message (`jobErrorGeneric`), never the raw
 * string. This is intentionally stricter than `renderableJobError` (which
 * echoes any `VI_`-prefixed string verbatim): once a per-code Thai message
 * exists, a code that fails to match one is more likely a NEW/unmapped
 * server code than a safe-to-echo string, so it degrades to the generic
 * message rather than leaking raw text. NEVER appends the raw error after
 * the mapped copy (that would re-leak exactly what this function exists to
 * hide, e.g. a Zod dump on `VI_DOCUMENT_INVALID`).
 */
export function describeViError(
  lang: VideoStudioLang,
  error: string | null | undefined
): string | null {
  if (!error) return null;
  const code = error.match(/^(VI_[A-Z0-9_]+)/)?.[1];
  if (code && code in VI_ERROR_COPY) {
    return pickCopy(lang, VI_ERROR_COPY[code]);
  }
  return pickCopy(lang, videoStudioCopy.jobErrorGeneric);
}
