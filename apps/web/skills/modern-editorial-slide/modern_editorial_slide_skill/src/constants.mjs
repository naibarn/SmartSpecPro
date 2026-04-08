export const RATIO_PRESETS = {
  "16:9": { widthIn: 13.333, heightIn: 7.5, family: "landscape_wide" },
  "9:16": { widthIn: 7.5, heightIn: 13.333, family: "portrait_tall" },
  "4:5": { widthIn: 8, heightIn: 10, family: "portrait_editorial" },
  "5:4": { widthIn: 10, heightIn: 8, family: "report_compact" }
};

export const STYLE_PALETTES = {
  "luxury-editorial": {
    background: "#F7F3EC",
    text: "#171717",
    accent: "#A48A6A",
    panel: "#E9DFD2",
    titleFont: "Playfair Display",
    bodyFont: "Inter"
  },
  "modern-report": {
    background: "#F3F5F7",
    text: "#14213D",
    accent: "#5C7AEA",
    panel: "#E4EAF3",
    titleFont: "Aptos Display",
    bodyFont: "Aptos"
  },
  "soft-wellness": {
    background: "#F7F2EC",
    text: "#4A332A",
    accent: "#D8A06A",
    panel: "#F3E6D7",
    titleFont: "Noto Serif Thai",
    bodyFont: "Noto Sans Thai"
  },
  "corporate-premium": {
    background: "#F8F9FA",
    text: "#1F2937",
    accent: "#3B82F6",
    panel: "#E6EEF9",
    titleFont: "Aptos Display",
    bodyFont: "Aptos"
  },
  "magazine-infographic": {
    background: "#FAFAF7",
    text: "#1B1B1B",
    accent: "#3E63DD",
    panel: "#EBEFFD",
    titleFont: "Montserrat",
    bodyFont: "Inter"
  },
  "minimal-premium": {
    background: "#FCFCFB",
    text: "#18181B",
    accent: "#7C6F64",
    panel: "#F2EEE8",
    titleFont: "Cormorant Garamond",
    bodyFont: "Inter"
  }
};

export const ARCHETYPES = {
  landscape_wide: [
    "editorial_cover_split",
    "title_hero_split",
    "two_column_editorial",
    "executive_summary_dashboard",
    "product_overview_report",
    "stat_card_with_image",
    "feature_story_panels",
    "project_timeline_bands"
  ],
  portrait_tall: [
    "editorial_cover_split",
    "portrait_large_type",
    "executive_summary_dashboard",
    "two_column_editorial",
    "vertical_workflow_steps",
    "feature_story_panels",
    "project_timeline_bands",
    "title_hero_split",
    "stat_card_with_image",
    "product_overview_report"
  ],
  portrait_editorial: [
    "editorial_cover_split",
    "title_hero_split",
    "feature_story_panels",
    "product_overview_report",
    "vertical_workflow_steps"
  ],
  report_compact: [
    "executive_summary_dashboard",
    "product_overview_report",
    "two_column_editorial",
    "feature_story_panels",
    "project_timeline_bands"
  ]
};

export const INTENT_TO_ARCHETYPES = {
  editorial_cover: ["editorial_cover_split", "title_hero_split"],
  executive_summary: ["executive_summary_dashboard", "two_column_editorial", "feature_story_panels"],
  report_page: ["product_overview_report", "executive_summary_dashboard", "two_column_editorial"],
  workflow_infographic: ["vertical_workflow_steps", "feature_story_panels"],
  healthcare_steps: ["vertical_workflow_steps", "feature_story_panels"],
  product_summary: ["product_overview_report", "stat_card_with_image", "two_column_editorial"],
  strategy_overview: ["portrait_large_type", "executive_summary_dashboard", "two_column_editorial", "stat_card_with_image"],
  project_timeline: ["project_timeline_bands", "feature_story_panels"],
  business_process: ["vertical_workflow_steps", "project_timeline_bands", "feature_story_panels"],
  case_study: ["portrait_large_type", "title_hero_split", "feature_story_panels", "two_column_editorial"]
};

export const KEYWORD_INTENTS = [
  { intent: "project_timeline", words: ["timeline", "phase", "milestone", "launch", "roadmap", "กำหนดการ", "ไทม์ไลน์", "ระยะ", "เฟส"] },
  { intent: "workflow_infographic", words: ["workflow", "step", "process", "journey", "ขั้นตอน", "กระบวนการ", "ลำดับ"] },
  { intent: "healthcare_steps", words: ["health", "care", "patient", "nursing", "ทารก", "นอน", "เด็ก", "สุขภาพ", "ผู้ป่วย", "แม่", "ลูก"] },
  { intent: "executive_summary", words: ["summary", "overview", "background", "approach", "outlook", "plan", "สรุป", "ภาพรวม", "แผน", "กลยุทธ์"] },
  { intent: "product_summary", words: ["product", "feature", "market", "goal", "สินค้า", "เป้าหมาย", "โปรโมชั่น"] },
  { intent: "case_study", words: ["case study", "story", "founder", "experience", "กรณีศึกษา", "ประสบการณ์", "เรื่องราว"] }
];
