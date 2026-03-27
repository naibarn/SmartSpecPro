I have all the context I need. Let me now produce the section content:

# Section 06 — Wizard Step Components + `ComposerStepper`

## Section ID
`section-06-wizard-steps`

## Position in Dependency Graph

| Attribute | Value |
|---|---|
| **Depends on** | section-02 (composerReducer types + `SafeHtml`), section-04 (`SkillAgencySelector`), section-05 (`SocialPlatformPicker`, `SocialAccountPicker`) |
| **Blocks** | section-07 (`ContentComposerPanel` assembles these steps) |
| **Batch** | 3 — runs after Batch 2 completes |

---

## Objective

Implement the five wizard step components and the `ComposerStepper` navigation indicator. Each step is a **presentation component** — it receives state via props and writes back exclusively through the `dispatch` function. None of the step components own any async state; all loading and mutation logic stays in `ContentComposerPanel` (section-07).

After this section, every step can be rendered and tested in isolation. The full wiring into `ContentComposerPanel` happens in section-07.

---

## Files to Create or Modify

| Action | File |
|---|---|
| Create | `apps/web/client/src/components/media/composer/ArticleSettingsStep.tsx` |
| Create | `apps/web/client/src/components/media/composer/ArticlePreviewStep.tsx` |
| Create | `apps/web/client/src/components/media/composer/MediaAttachmentStep.tsx` |
| Create | `apps/web/client/src/components/media/composer/DestinationStep.tsx` |
| Create | `apps/web/client/src/components/media/composer/ComposerReviewStep.tsx` |
| Create | `apps/web/client/src/components/media/composer/ComposerStepper.tsx` |
| Create | `apps/web/client/src/components/media/composer/__tests__/ArticleSettingsStep.test.tsx` |
| Create | `apps/web/client/src/components/media/composer/__tests__/ArticlePreviewStep.test.tsx` |
| Create | `apps/web/client/src/components/media/composer/__tests__/MediaAttachmentStep.test.tsx` |
| Create | `apps/web/client/src/components/media/composer/__tests__/DestinationStep.test.tsx` |
| Create | `apps/web/client/src/components/media/composer/__tests__/ComposerReviewStep.test.tsx` |
| Create | `apps/web/client/src/components/media/composer/__tests__/ComposerStepper.test.tsx` |
| Modify | `apps/web/client/src/lib/i18n/locales/en.ts` (add `mediaStudio.articleComposer.*` keys) |
| Modify | `apps/web/client/src/lib/i18n/locales/th.ts` (add Thai translations) |

---

## Background: Contracts from Earlier Sections

### State and Actions (from section-02)

All step components import state-related types from `composerReducer.ts`:

```typescript
import type {
  ComposerState,
  ComposerAction,
} from "../composerReducer";
```

Each step receives `state: ComposerState` and `dispatch: React.Dispatch<ComposerAction>` as props.

### SafeHtml (from section-02)

`ArticlePreviewStep` is the only step that renders untrusted HTML. It must import and use `SafeHtml` from `@/components/ui/SafeHtml`. Direct `dangerouslySetInnerHTML` anywhere in the `composer/` subtree is forbidden.

```typescript
import { SafeHtml } from "@/components/ui/SafeHtml";
```

### SkillAgencySelector (from section-04)

`ArticleSettingsStep` composes `SkillAgencySelector`. Import as:

```typescript
import { SkillAgencySelector } from "./SkillAgencySelector";
```

The `SkillAgencySelector` props are defined in section-04. The step passes `state.executionSource`, `state.skillId`, `state.agencyId`, `state.topic`, and `dispatch` directly.

### SocialPlatformPicker + SocialAccountPicker (from section-05)

`DestinationStep` composes these. Import as:

```typescript
import { SocialPlatformPicker } from "./SocialPlatformPicker";
import { SocialAccountPicker } from "./SocialAccountPicker";
```

Section-05 defines their props. The step passes `state.socialPlatform`, `state.socialTargetId`, and `dispatch`.

---

## i18n Requirement

All user-visible strings use `useI18n()`. Keys are added under the `"mediaStudio.articleComposer.*"` prefix, following the flat-key pattern already used throughout `en.ts` (e.g., `"mediaStudio.tabs.image"`).

### Keys to Add to `apps/web/client/src/lib/i18n/locales/en.ts`

Add these after the last `"mediaStudio.*"` entry (currently at line 1382):

```
"mediaStudio.tabs.article": "Article Composer",

// Stepper labels
"mediaStudio.articleComposer.stepTopic": "Topic",
"mediaStudio.articleComposer.stepContent": "Content",
"mediaStudio.articleComposer.stepMedia": "Media",
"mediaStudio.articleComposer.stepDestination": "Destination",
"mediaStudio.articleComposer.stepReview": "Review",

// ArticleSettingsStep
"mediaStudio.articleComposer.topicLabel": "Article Topic",
"mediaStudio.articleComposer.topicPlaceholder": "Describe what this article should cover…",
"mediaStudio.articleComposer.webSearchLabel": "Web Search",
"mediaStudio.articleComposer.thinkingLabel": "Deep Thinking",
"mediaStudio.articleComposer.generateButton": "Generate Article",
"mediaStudio.articleComposer.generating": "Generating…",

// ArticlePreviewStep
"mediaStudio.articleComposer.stopButton": "Stop",
"mediaStudio.articleComposer.regenerateButton": "Regenerate",
"mediaStudio.articleComposer.editManuallyButton": "Edit Manually",
"mediaStudio.articleComposer.saveEditsButton": "Save Edits",
"mediaStudio.articleComposer.generationError": "Generation failed: {{message}}. Try again.",
"mediaStudio.articleComposer.previewEmpty": "Article will appear here as it generates.",

// MediaAttachmentStep
"mediaStudio.articleComposer.attachmentCount": "{{selected}} / {{max}} selected",
"mediaStudio.articleComposer.attachmentLimitError": "Maximum {{max}} attachments allowed.",
"mediaStudio.articleComposer.skipAttachments": "Skip",
"mediaStudio.articleComposer.skipAttachmentsWarning": "Publishing without media attachments. You can still proceed.",
"mediaStudio.articleComposer.removeAttachment": "Remove",

// DestinationStep
"mediaStudio.articleComposer.destinationDocs": "Documentation",
"mediaStudio.articleComposer.destinationBlog": "Blog Post",
"mediaStudio.articleComposer.destinationSocial": "Social Post",
"mediaStudio.articleComposer.docsSubKindDoc": "Documentation Page",
"mediaStudio.articleComposer.docsSubKindCms": "CMS Page",
"mediaStudio.articleComposer.docsTargetPlaceholder": "Select or create a page…",
"mediaStudio.articleComposer.blogTargetPlaceholder": "Select or create a post…",
"mediaStudio.articleComposer.blogTargetNewOption": "Create new draft post",
"mediaStudio.articleComposer.captionLabel": "Social Caption",
"mediaStudio.articleComposer.captionCharCount": "{{count}} characters",
"mediaStudio.articleComposer.captionRegenerateButton": "Regenerate caption",
"mediaStudio.articleComposer.captionGenerating": "Generating caption…",
"mediaStudio.articleComposer.captionError": "Caption generation failed — you can write one manually.",
"mediaStudio.articleComposer.noConnectedAccounts": "No connected accounts for this platform.",
"mediaStudio.articleComposer.connectFirst": "Connect first",

// ComposerReviewStep
"mediaStudio.articleComposer.reviewTitle": "Review & Publish",
"mediaStudio.articleComposer.reviewTopicLabel": "Topic",
"mediaStudio.articleComposer.reviewSourceLabel": "Source",
"mediaStudio.articleComposer.reviewAttachmentsLabel": "Attachments",
"mediaStudio.articleComposer.reviewDestinationLabel": "Destination",
"mediaStudio.articleComposer.reviewNoAttachments": "None",
"mediaStudio.articleComposer.publishButton": "Publish Now",
"mediaStudio.articleComposer.publishingButton": "Publishing…",
"mediaStudio.articleComposer.publishConfirmTitle": "Confirm Publish",
"mediaStudio.articleComposer.publishConfirmDescription": "This will publish your article to the selected destination. Are you sure?",
"mediaStudio.articleComposer.publishConfirmCancel": "Cancel",
"mediaStudio.articleComposer.publishConfirmOk": "Publish",
"mediaStudio.articleComposer.publishError": "Publish failed: {{message}}",

// Navigation
"mediaStudio.articleComposer.nextButton": "Next",
"mediaStudio.articleComposer.backButton": "Back",
```

### Keys to Add to `apps/web/client/src/lib/i18n/locales/th.ts`

Add the Thai equivalents after the last `"mediaStudio.*"` entry, mirroring every key added to `en.ts`. Representative translations:

```
"mediaStudio.tabs.article": "นักเขียนบทความ",
"mediaStudio.articleComposer.stepTopic": "หัวข้อ",
"mediaStudio.articleComposer.stepContent": "เนื้อหา",
"mediaStudio.articleComposer.stepMedia": "มีเดีย",
"mediaStudio.articleComposer.stepDestination": "ปลายทาง",
"mediaStudio.articleComposer.stepReview": "ตรวจสอบ",
"mediaStudio.articleComposer.topicLabel": "หัวข้อบทความ",
"mediaStudio.articleComposer.topicPlaceholder": "อธิบายว่าบทความนี้ควรครอบคลุมเรื่องอะไร…",
"mediaStudio.articleComposer.webSearchLabel": "ค้นหาเว็บ",
"mediaStudio.articleComposer.thinkingLabel": "คิดลึก",
"mediaStudio.articleComposer.generateButton": "สร้างบทความ",
"mediaStudio.articleComposer.generating": "กำลังสร้าง…",
"mediaStudio.articleComposer.stopButton": "หยุด",
"mediaStudio.articleComposer.regenerateButton": "สร้างใหม่",
"mediaStudio.articleComposer.editManuallyButton": "แก้ไขด้วยตนเอง",
"mediaStudio.articleComposer.saveEditsButton": "บันทึกการแก้ไข",
"mediaStudio.articleComposer.generationError": "การสร้างล้มเหลว: {{message}} ลองอีกครั้ง",
"mediaStudio.articleComposer.previewEmpty": "บทความจะปรากฏที่นี่ขณะที่กำลังสร้าง",
"mediaStudio.articleComposer.attachmentCount": "{{selected}} / {{max}} รายการที่เลือก",
"mediaStudio.articleComposer.attachmentLimitError": "อนุญาตสูงสุด {{max}} ไฟล์แนบ",
"mediaStudio.articleComposer.skipAttachments": "ข้าม",
"mediaStudio.articleComposer.skipAttachmentsWarning": "เผยแพร่โดยไม่มีไฟล์แนบ ยังคงดำเนินการต่อได้",
"mediaStudio.articleComposer.removeAttachment": "ลบ",
"mediaStudio.articleComposer.destinationDocs": "เอกสาร",
"mediaStudio.articleComposer.destinationBlog": "บล็อกโพสต์",
"mediaStudio.articleComposer.destinationSocial": "โพสต์โซเชียล",
"mediaStudio.articleComposer.docsSubKindDoc": "หน้าเอกสาร",
"mediaStudio.articleComposer.docsSubKindCms": "หน้า CMS",
"mediaStudio.articleComposer.docsTargetPlaceholder": "เลือกหรือสร้างหน้า…",
"mediaStudio.articleComposer.blogTargetPlaceholder": "เลือกหรือสร้างโพสต์…",
"mediaStudio.articleComposer.blogTargetNewOption": "สร้างโพสต์ฉบับร่างใหม่",
"mediaStudio.articleComposer.captionLabel": "คำบรรยายโซเชียล",
"mediaStudio.articleComposer.captionCharCount": "{{count}} ตัวอักษร",
"mediaStudio.articleComposer.captionRegenerateButton": "สร้างคำบรรยายใหม่",
"mediaStudio.articleComposer.captionGenerating": "กำลังสร้างคำบรรยาย…",
"mediaStudio.articleComposer.captionError": "การสร้างคำบรรยายล้มเหลว — คุณสามารถเขียนเองได้",
"mediaStudio.articleComposer.noConnectedAccounts": "ไม่มีบัญชีที่เชื่อมต่อสำหรับแพลตฟอร์มนี้",
"mediaStudio.articleComposer.connectFirst": "เชื่อมต่อก่อน",
"mediaStudio.articleComposer.reviewTitle": "ตรวจสอบและเผยแพร่",
"mediaStudio.articleComposer.reviewTopicLabel": "หัวข้อ",
"mediaStudio.articleComposer.reviewSourceLabel": "แหล่งที่มา",
"mediaStudio.articleComposer.reviewAttachmentsLabel": "ไฟล์แนบ",
"mediaStudio.articleComposer.reviewDestinationLabel": "ปลายทาง",
"mediaStudio.articleComposer.reviewNoAttachments": "ไม่มี",
"mediaStudio.articleComposer.publishButton": "เผยแพร่เลย",
"mediaStudio.articleComposer.publishingButton": "กำลังเผยแพร่…",
"mediaStudio.articleComposer.publishConfirmTitle": "ยืนยันการเผยแพร่",
"mediaStudio.articleComposer.publishConfirmDescription": "จะเผยแพร่บทความของคุณไปยังปลายทางที่เลือก แน่ใจหรือไม่?",
"mediaStudio.articleComposer.publishConfirmCancel": "ยกเลิก",
"mediaStudio.articleComposer.publishConfirmOk": "เผยแพร่",
"mediaStudio.articleComposer.publishError": "การเผยแพร่ล้มเหลว: {{message}}",
"mediaStudio.articleComposer.nextButton": "ถัดไป",
"mediaStudio.articleComposer.backButton": "ย้อนกลับ",
```

---

## Component 1: `ComposerStepper`

**File:** `apps/web/client/src/components/media/composer/ComposerStepper.tsx`

### Purpose

A read-only horizontal progress indicator for wizard steps 1–5. Clicking a completed step navigates back; future steps are blocked. No tRPC calls. Renders above the active step in `ContentComposerPanel`.

### Props Interface

```typescript
export interface ComposerStepperProps {
  currentStep: 1 | 2 | 3 | 4 | 5;   // maps to steps 1–5 (step 0 = draft list, not shown)
  dispatch: React.Dispatch<ComposerAction>;
  className?: string;
}
```

Note: the stepper uses 1-indexed step numbers for display. `currentStep` here corresponds to `ComposerState.currentStep` values `1`–`4`, but the stepper shows labels for all five steps. The caller (section-07) is responsible for passing `state.currentStep` cast to the correct range.

### Step Labels

Read from i18n via `useI18n()`:

| Index | i18n key | English |
|---|---|---|
| 1 | `mediaStudio.articleComposer.stepTopic` | Topic |
| 2 | `mediaStudio.articleComposer.stepContent` | Content |
| 3 | `mediaStudio.articleComposer.stepMedia` | Media |
| 4 | `mediaStudio.articleComposer.stepDestination` | Destination |
| 5 | `mediaStudio.articleComposer.stepReview` | Review |

### Behavior

- Steps with index < `currentStep` are **completed** — show a checkmark icon and are clickable. Clicking dispatches `{ type: "GO_TO_STEP", payload: index }`.
- The step with index === `currentStep` is **active** — highlighted, not clickable.
- Steps with index > `currentStep` are **future** — muted, `pointer-events: none`.
- Render as a horizontal flex row of `<button>` or `<div>` nodes connected by divider lines.

### Render Skeleton

```
<nav aria-label="Article wizard progress">
  {steps.map((step, i) => (
    <StepNode
      key={i}
      label={step.label}
      state={i + 1 < currentStep ? "complete" : i + 1 === currentStep ? "active" : "future"}
      onClick={i + 1 < currentStep ? () => dispatch({ type: "GO_TO_STEP", payload: i + 1 }) : undefined}
    />
  ))}
</nav>
```

---

## Component 2: `ArticleSettingsStep`

**File:** `apps/web/client/src/components/media/composer/ArticleSettingsStep.tsx`

### Purpose

Step 1. Collects the topic, execution source, skill/agency choice, and feature toggles. Triggers generation.

### Props Interface

```typescript
export interface ArticleSettingsStepProps {
  state: Pick<
    ComposerState,
    | "topic"
    | "executionSource"
    | "skillId"
    | "agencyId"
    | "requiresWebSearch"
    | "requiresThinking"
    | "showComplexityBanner"
    | "isGenerating"
  >;
  dispatch: React.Dispatch<ComposerAction>;
  /** Called when user clicks "Generate Article" — parent manages the actual stream */
  onGenerateClick: () => void;
}
```

Using `Pick<ComposerState, ...>` rather than the full `ComposerState` keeps the interface explicit and enables shallow testing without constructing the full state.

### Layout

```
<div className="space-y-6">
  <Textarea
    label={t("mediaStudio.articleComposer.topicLabel")}
    placeholder={t("mediaStudio.articleComposer.topicPlaceholder")}
    value={state.topic}
    onChange={(e) => dispatch({ type: "SET_TOPIC", payload: e.target.value })}
    rows={3}
    maxLength={2000}
  />

  <SkillAgencySelector
    executionSource={state.executionSource}
    skillId={state.skillId}
    agencyId={state.agencyId}
    topic={state.topic}
    dispatch={dispatch}
    {...}
  />

  <div className="flex gap-4">
    <Switch
      checked={state.requiresWebSearch}
      onCheckedChange={() => dispatch({ type: "TOGGLE_WEB_SEARCH" })}
      label={t("mediaStudio.articleComposer.webSearchLabel")}
    />
    <Switch
      checked={state.requiresThinking}
      onCheckedChange={() => dispatch({ type: "TOGGLE_THINKING" })}
      label={t("mediaStudio.articleComposer.thinkingLabel")}
    />
  </div>

  <Button
    onClick={onGenerateClick}
    disabled={!state.topic.trim() || state.isGenerating}
    className="w-full"
  >
    {state.isGenerating
      ? t("mediaStudio.articleComposer.generating")
      : t("mediaStudio.articleComposer.generateButton")}
  </Button>
</div>
```

### Key Behaviors

- The "Generate Article" button is **disabled** when `topic.trim()` is empty or `isGenerating` is true.
- After clicking "Generate Article", the step advances to step 2; this navigation is done by the parent (`ContentComposerPanel`) by dispatching `GO_TO_STEP` in response to the generation starting, not by the step itself.
- The `onGenerateClick` callback merely signals intent. The parent decides when to start the stream and advance the step.

---

## Component 3: `ArticlePreviewStep`

**File:** `apps/web/client/src/components/media/composer/ArticlePreviewStep.tsx`

### Purpose

Step 2. Renders the streaming article body via `SafeHtml`. Shows generation progress. Provides stop/regenerate/manual-edit controls.

### Props Interface

```typescript
export interface ArticlePreviewStepProps {
  state: Pick<
    ComposerState,
    | "articleBody"
    | "isGenerating"
    | "generationError"
  >;
  dispatch: React.Dispatch<ComposerAction>;
  /** Called when user clicks "Stop" during streaming */
  onStopGeneration: () => void;
  /** Called when user clicks "Regenerate" */
  onRegenerate: () => void;
  /** Called when user advances past this step */
  onNext: () => void;
}
```

### Layout and States

**While generating (`isGenerating === true`):**

```
<div>
  <SafeHtml
    html={state.articleBody}
    profile="article"
    className="prose max-w-none min-h-[200px] border rounded p-4"
  />
  {/* Streaming cursor indicator */}
  <div aria-live="polite" className="text-sm text-muted-foreground">
    {t("mediaStudio.articleComposer.generating")}
  </div>
  <Button variant="outline" onClick={onStopGeneration}>
    {t("mediaStudio.articleComposer.stopButton")}
  </Button>
</div>
```

**Generation error (`generationError !== null`):**

```
<InlineError message={t("mediaStudio.articleComposer.generationError", { message: state.generationError })} />
<Button variant="outline" onClick={onRegenerate}>
  {t("mediaStudio.articleComposer.regenerateButton")}
</Button>
```

**Generation complete (`!isGenerating && !generationError && articleBody !== ""`):**

```
<SafeHtml html={state.articleBody} profile="article" className="prose max-w-none" />
{isEditMode ? (
  <Textarea
    value={editValue}
    onChange={(e) => setEditValue(e.target.value)}
    rows={20}
  />
  <Button onClick={handleSaveEdits}>{t("mediaStudio.articleComposer.saveEditsButton")}</Button>
) : (
  <div className="flex gap-2">
    <Button variant="outline" onClick={() => setIsEditMode(true)}>
      {t("mediaStudio.articleComposer.editManuallyButton")}
    </Button>
    <Button variant="outline" onClick={onRegenerate}>
      {t("mediaStudio.articleComposer.regenerateButton")}
    </Button>
    <Button onClick={onNext}>
      {t("mediaStudio.articleComposer.nextButton")}
    </Button>
  </div>
)}
```

**Empty (before any generation):**

```
<div className="flex min-h-[200px] items-center justify-center text-muted-foreground">
  {t("mediaStudio.articleComposer.previewEmpty")}
</div>
```

### Manual Edit Mode

Local state: `isEditMode: boolean` and `editValue: string` (initialized from `state.articleBody`).

Clicking "Edit Manually" enters edit mode. The article content is replaced by a `<textarea>` pre-filled with `state.articleBody`. On "Save Edits", the component dispatches `{ type: "SET_ARTICLE_BODY", payload: editValue }` and exits edit mode. This does NOT re-run SafeHtml during editing (the textarea is plain text).

**Important:** `SafeHtml` and the edit `<textarea>` are mutually exclusive. The `SafeHtml` preview is hidden while `isEditMode` is true. This avoids any XSS surface during editing.

---

## Component 4: `MediaAttachmentStep`

**File:** `apps/web/client/src/components/media/composer/MediaAttachmentStep.tsx`

### Purpose

Step 3. Lets the user select 1–6 library assets to attach to the article.

### Props Interface

```typescript
export interface MediaAttachmentStepProps {
  state: Pick<ComposerState, "attachmentIds">;
  dispatch: React.Dispatch<ComposerAction>;
  onNext: () => void;
  onBack: () => void;
}
```

### Library Picker Integration

The existing `LibraryFilePicker` (`apps/web/client/src/components/library/LibraryFilePicker.tsx`) is a **single-select** popover picker (accepts `value: string` and `onValueChange: (url: string) => void`). It is **not** directly reusable in multi-select mode without modification.

**Implementation approach for section-06:** Build a thin `MultiLibraryPicker` wrapper inside `MediaAttachmentStep.tsx` itself (as a non-exported inner component) that uses the same tRPC queries (`trpc.library.listDocuments.useQuery` and `trpc.library.search.useQuery`) as `LibraryFilePicker`, adapted for multi-select with a maximum of 6. Alternatively, if a multi-select variant of `LibraryFilePicker` exists by the time this section is implemented, use that instead.

The picker must query `libraryItems` with their `status` field and filter out items where `status !== "available"` — those are shown as disabled in the picker list.

### Behavior

- **Counter:** shows `"{{selected}} / 6 selected"` using the i18n key `mediaStudio.articleComposer.attachmentCount` with `selected = state.attachmentIds.length` and `max = 6`.
- **Adding:** dispatches `{ type: "ADD_ATTACHMENT", payload: id }`. The reducer silently ignores adds beyond 6. The component must additionally show a toast (`sonner` `toast.error`) with `t("mediaStudio.articleComposer.attachmentLimitError", { max: 6 })` when the user attempts to add a 7th item (i.e., when `attachmentIds.length >= 6`).
- **Removing:** dispatches `{ type: "REMOVE_ATTACHMENT", payload: id }`.
- **Skip:** the step has a "Skip" button that calls `onNext()` directly. Before navigating, show a toast warning (non-blocking): `toast.warning(t("mediaStudio.articleComposer.skipAttachmentsWarning"))` if `attachmentIds.length === 0`.
- **Selected items display:** each selected item renders as a card with a thumbnail (if image/video), filename, and a "Remove" button.

### Attachment Card

```
<div key={id} className="flex items-center gap-2 border rounded p-2">
  <Thumbnail src={item.source_url} alt={item.filename} />
  <span className="text-sm truncate">{item.filename}</span>
  <Button
    variant="ghost"
    size="icon"
    aria-label={t("mediaStudio.articleComposer.removeAttachment")}
    onClick={() => dispatch({ type: "REMOVE_ATTACHMENT", payload: id })}
  >
    <X className="h-4 w-4" />
  </Button>
</div>
```

Attachment display data requires a local map of `id → item metadata`. The component maintains a local `Record<number, LibraryItem>` built from the picker results to render the selected cards.

---

## Component 5: `DestinationStep`

**File:** `apps/web/client/src/components/media/composer/DestinationStep.tsx`

### Purpose

Step 4. Role-gated destination picker with sub-pickers for Docs, Blog, and Social routes. Social route includes platform picker, account picker, and caption editor.

### Props Interface

```typescript
export interface DestinationStepProps {
  state: Pick<
    ComposerState,
    | "destinationKind"
    | "docsSubKind"
    | "docsTargetId"
    | "blogTargetId"
    | "socialPlatform"
    | "socialTargetId"
    | "socialCaption"
    | "captionIsManuallyEdited"
    | "isCaptionGenerating"
  >;
  dispatch: React.Dispatch<ComposerAction>;
  /** User role — from useAuth() in ContentComposerPanel, passed as prop */
  userRole: "user" | "admin" | "domain_admin";
  /** Called when social account is selected for the first time (triggers caption generation in parent) */
  onGenerateCaption: (targetId: number) => void;
  onNext: () => void;
  onBack: () => void;
}
```

### Role-Gated Destination Cards

```typescript
const isAdmin = userRole === "admin" || userRole === "domain_admin";

// Only render Docs and Blog cards when isAdmin === true
```

Destination option cards:

| destinationKind | Label key | Shown to |
|---|---|---|
| `"docs"` | `mediaStudio.articleComposer.destinationDocs` | admin, domain_admin |
| `"blog"` | `mediaStudio.articleComposer.destinationBlog` | admin, domain_admin |
| `"social"` | `mediaStudio.articleComposer.destinationSocial` | all roles |

Clicking a card dispatches `{ type: "SET_DESTINATION_KIND", payload: kind }`.

### Docs Sub-Flow

When `destinationKind === "docs"`:

1. Show a sub-option picker for `docsSubKind`: "Documentation Page" vs "CMS Page".
   - On select: dispatch `{ type: "SET_DOCS_SUB_KIND", payload: subKind }`.
2. Show a searchable Select populated from the appropriate list:
   - `docsSubKind === "doc_page"`: fetch pages via a `useQuery` wrapping the docs pages list endpoint. Check `apps/web/server/routers/` for an existing tRPC procedure first (look for `docs` or `docPages` router); if absent, use a plain `fetch` call to the Express route `/api/docs/pages` (GET). Each option shows the page `title`.
   - `docsSubKind === "cms_page"`: fetch tenant pages. Look for an existing tRPC procedure in `trpc.tenant.*` or `trpc.contentManagement.*`; the implementer should search `apps/web/server/routers/tenant.ts` and `DomainAdminContent.tsx` for the existing call pattern and reuse it.
   - Both lists include a "Create new" option at the top (value: `null`) as the default.
   - On select: dispatch `{ type: "SET_DOCS_TARGET", payload: selectedId }`.

### Blog Sub-Flow

When `destinationKind === "blog"`:

Show a searchable Select of existing blog post drafts to update, with a "Create new draft post" option at the top (value: `null`). Fetch via `trpc.blog.listPosts.useQuery({ status: "draft" })` or the equivalent. On select: dispatch `{ type: "SET_BLOG_TARGET", payload: selectedId }`.

### Social Sub-Flow

When `destinationKind === "social"`:

```
{/* Step 1: Platform picker */}
<SocialPlatformPicker
  selected={state.socialPlatform}
  onSelect={(platform) => dispatch({ type: "SET_SOCIAL_PLATFORM", payload: platform })}
/>

{/* Step 2: Account picker — shown only after platform is selected */}
{state.socialPlatform && (
  <SocialAccountPicker
    platform={state.socialPlatform}
    selectedAccountId={state.socialTargetId}
    onSelect={(targetId) => {
      dispatch({ type: "SET_SOCIAL_TARGET", payload: targetId });
      if (!captionIsManuallyEdited) {
        onGenerateCaption(targetId);  // triggers auto-caption in parent
      }
    }}
  />
)}

{/* Step 3: Caption editor — shown only after account is selected */}
{state.socialTargetId !== null && (
  <div className="space-y-2">
    <Label>{t("mediaStudio.articleComposer.captionLabel")}</Label>
    {state.isCaptionGenerating ? (
      <Skeleton className="h-20 w-full" />
    ) : (
      <Textarea
        value={state.socialCaption}
        onChange={(e) =>
          dispatch({ type: "SET_SOCIAL_CAPTION", payload: e.target.value })
        }
        rows={4}
      />
    )}
    <div className="flex justify-between text-sm text-muted-foreground">
      <span>{t("mediaStudio.articleComposer.captionCharCount", { count: state.socialCaption.length })}</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onGenerateCaption(state.socialTargetId!)}
        disabled={state.isCaptionGenerating}
      >
        {t("mediaStudio.articleComposer.captionRegenerateButton")}
      </Button>
    </div>
  </div>
)}
```

When `onGenerateCaption` is called, the parent (`ContentComposerPanel`) calls `trpc.contentComposer.generateSocialCaption` and dispatches `CAPTION_GENERATED` on success or shows an error toast on failure. The step component does not call tRPC directly.

Caption error handling: if the parent sets an error through a prop mechanism (or via a separate `captionError: string | null` state field if added in section-07), show `t("mediaStudio.articleComposer.captionError")` inline beneath the textarea. In phase-1 section-06 implementation, a simple local `captionGenerationFailed: boolean` prop from the parent is acceptable.

---

## Component 6: `ComposerReviewStep`

**File:** `apps/web/client/src/components/media/composer/ComposerReviewStep.tsx`

### Purpose

Step 5. Read-only summary of all choices, publish confirmation dialog, and publish trigger.

### Props Interface

```typescript
export interface ComposerReviewStepProps {
  state: Pick<
    ComposerState,
    | "topic"
    | "executionSource"
    | "skillId"
    | "agencyId"
    | "attachmentIds"
    | "destinationKind"
    | "docsSubKind"
    | "socialPlatform"
    | "isPublishing"
    | "publishError"
  >;
  /** Display name for the selected skill (resolved by parent from skills list) */
  skillName: string | null;
  /** Display name for the selected agency (from composerReducer state) */
  agencyName: string | null;
  dispatch: React.Dispatch<ComposerAction>;
  onBack: () => void;
  /** Called when user confirms publish */
  onPublish: () => void;
}
```

### Layout

```
<div className="space-y-6">
  <h2>{t("mediaStudio.articleComposer.reviewTitle")}</h2>

  {/* Summary table */}
  <dl className="divide-y">
    <ReviewRow label={t("mediaStudio.articleComposer.reviewTopicLabel")} value={state.topic} />
    <ReviewRow
      label={t("mediaStudio.articleComposer.reviewSourceLabel")}
      value={state.executionSource === "skill" ? (skillName ?? state.skillId) : (agencyName ?? state.agencyId)}
    />
    <ReviewRow
      label={t("mediaStudio.articleComposer.reviewAttachmentsLabel")}
      value={state.attachmentIds.length === 0
        ? t("mediaStudio.articleComposer.reviewNoAttachments")
        : `${state.attachmentIds.length} item(s)`}
    />
    <ReviewRow
      label={t("mediaStudio.articleComposer.reviewDestinationLabel")}
      value={destinationSummary}   // computed from destinationKind + subKind + platform
    />
  </dl>

  {/* Publish error (shown inline, not in a toast) */}
  {state.publishError && (
    <Alert variant="destructive">
      {t("mediaStudio.articleComposer.publishError", { message: state.publishError })}
    </Alert>
  )}

  <div className="flex gap-2 justify-between">
    <Button variant="outline" onClick={onBack} disabled={state.isPublishing}>
      {t("mediaStudio.articleComposer.backButton")}
    </Button>

    {/* Confirmation dialog wrapping the publish action */}
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button disabled={state.isPublishing}>
          {state.isPublishing
            ? t("mediaStudio.articleComposer.publishingButton")
            : t("mediaStudio.articleComposer.publishButton")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("mediaStudio.articleComposer.publishConfirmTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("mediaStudio.articleComposer.publishConfirmDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            {t("mediaStudio.articleComposer.publishConfirmCancel")}
          </AlertDialogCancel>
          <AlertDialogAction onClick={onPublish}>
            {t("mediaStudio.articleComposer.publishConfirmOk")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</div>
```

### Publish Button State

While `state.isPublishing` is true: both the "Back" button and the publish button are disabled. The publish button shows the `publishingButton` text. The `AlertDialog` trigger should not be re-openable while publishing (disable the trigger button).

---

## Tests

**Testing stack:** Vitest + `@testing-library/react` + jsdom + `@testing-library/user-event`. Mock `@/lib/trpc` to avoid network calls. Mock `sonner` for toast assertions.

### Shared Mock Setup

All test files should use the following mock stubs at the top:

```typescript
vi.mock("@/lib/trpc", () => ({
  trpc: {
    skills: { listFromDb: { useQuery: vi.fn().mockReturnValue({ data: [], isLoading: false }) } },
    socialPublishing: { listPages: { useQuery: vi.fn().mockReturnValue({ data: [], isLoading: false }) } },
    uploadPost: { getConnection: { useQuery: vi.fn().mockReturnValue({ data: null, isLoading: false }) } },
    library: {
      listDocuments: { useQuery: vi.fn().mockReturnValue({ data: { items: [] }, isLoading: false }) },
      search: { useQuery: vi.fn().mockReturnValue({ data: { items: [] }, isLoading: false }) },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), warning: vi.fn() },
}));
```

Also mock `@/components/media/composer/SkillAgencySelector`, `./SocialPlatformPicker`, and `./SocialAccountPicker` with stub implementations that render a `data-testid` and accept their callback props, so the wizard step tests remain isolated from those sub-components.

```typescript
vi.mock("./SkillAgencySelector", () => ({
  SkillAgencySelector: ({ dispatch }: any) => (
    <div data-testid="skill-agency-selector">
      <button onClick={() => dispatch({ type: "SET_SKILL", payload: "sk-1" })}>
        Select Skill
      </button>
    </div>
  ),
}));
```

---

### `ComposerStepper` Tests

**File:** `apps/web/client/src/components/media/composer/__tests__/ComposerStepper.test.tsx`

```typescript
// Test: renders 5 step labels (Topic, Content, Media, Destination, Review)
// Test: currentStep=1 → step 1 is "active", steps 2–5 are "future"
// Test: currentStep=3 → steps 1–2 are "complete", step 3 is "active", steps 4–5 are "future"
// Test: clicking a completed step dispatches GO_TO_STEP with the correct index
// Test: clicking the active step does NOT dispatch
// Test: clicking a future step does NOT dispatch
// Test: completed steps show a checkmark icon (or accessible text "completed")
// Test: renders aria-label on the nav element for accessibility
```

---

### `ArticleSettingsStep` Tests

**File:** `apps/web/client/src/components/media/composer/__tests__/ArticleSettingsStep.test.tsx`

```typescript
// Test: renders topic textarea
// Test: "Generate Article" button is disabled when topic is empty string
// Test: "Generate Article" button is disabled when topic is whitespace only
// Test: "Generate Article" button is enabled when topic has at least 1 non-whitespace character
// Test: "Generate Article" button is disabled when isGenerating = true
// Test: typing in topic dispatches SET_TOPIC with new value
// Test: toggling web search dispatches TOGGLE_WEB_SEARCH
// Test: toggling thinking dispatches TOGGLE_THINKING
// Test: clicking "Generate Article" calls onGenerateClick callback
// Test: SkillAgencySelector is rendered (mocked stub present in DOM)
// Test: generate button shows generating text while isGenerating = true
```

---

### `ArticlePreviewStep` Tests

**File:** `apps/web/client/src/components/media/composer/__tests__/ArticlePreviewStep.test.tsx`

```typescript
// Test: renders empty placeholder when articleBody is empty and not generating
// Test: renders "Generating…" indicator when isGenerating = true
// Test: renders the Stop button while isGenerating = true
// Test: clicking Stop calls onStopGeneration
// Test: renders SafeHtml output for non-empty articleBody when not generating
//   (verify SafeHtml is used — check for the container element with class "prose")
// Test: shows error message when generationError is set
// Test: shows Regenerate button when generationError is set
// Test: clicking Regenerate calls onRegenerate
// Test: shows "Edit Manually" button when generation is complete
// Test: clicking "Edit Manually" renders a textarea with article content
// Test: editing textarea and clicking "Save Edits" dispatches SET_ARTICLE_BODY
// Test: Next button is visible after generation complete
// Test: clicking Next calls onNext
// Test: SafeHtml is NOT rendered while in edit mode (textarea replaces it)
```

---

### `MediaAttachmentStep` Tests

**File:** `apps/web/client/src/components/media/composer/__tests__/MediaAttachmentStep.test.tsx`

```typescript
// Test: shows "0 / 6 selected" counter when attachmentIds is empty
// Test: shows "2 / 6 selected" counter when 2 attachments are selected
// Test: adds an item and dispatches ADD_ATTACHMENT
// Test: attempting to add a 7th item shows toast.error with the limit message
// Test: attempting to add a 7th item does NOT dispatch ADD_ATTACHMENT
// Test: selected items render as cards with a remove button
// Test: clicking remove button dispatches REMOVE_ATTACHMENT with the correct id
// Test: "Skip" button is visible
// Test: clicking "Skip" with 0 attachments shows toast.warning
// Test: clicking "Skip" calls onNext
// Test: clicking "Back" calls onBack
// Test: items with status = "processing" are shown as disabled in the picker
```

---

### `DestinationStep` Tests

**File:** `apps/web/client/src/components/media/composer/__tests__/DestinationStep.test.tsx`

```typescript
// Test: admin user sees Docs, Blog, and Social post option cards
// Test: domain_admin user sees Docs, Blog, and Social post option cards
// Test: regular "user" sees ONLY Social post option card (Docs and Blog absent)
// Test: clicking Docs card dispatches SET_DESTINATION_KIND "docs"
// Test: clicking Blog card dispatches SET_DESTINATION_KIND "blog"
// Test: clicking Social card dispatches SET_DESTINATION_KIND "social"
// Test: when destinationKind = "docs" → docsSubKind picker is rendered
// Test: selecting "doc_page" sub-kind dispatches SET_DOCS_SUB_KIND "doc_page"
// Test: when destinationKind = "social" → SocialPlatformPicker is rendered
// Test: when socialPlatform is set → SocialAccountPicker is rendered
// Test: when socialTargetId is set → caption textarea is rendered
// Test: typing in caption textarea dispatches SET_SOCIAL_CAPTION
// Test: character count updates as caption changes
// Test: when isCaptionGenerating = true → skeleton shown in place of textarea
// Test: "Regenerate caption" button calls onGenerateCaption with current socialTargetId
// Test: "Next" button calls onNext
// Test: "Back" button calls onBack
```

---

### `ComposerReviewStep` Tests

**File:** `apps/web/client/src/components/media/composer/__tests__/ComposerReviewStep.test.tsx`

```typescript
// Test: renders topic in summary
// Test: renders skill name in source row when executionSource = "skill"
// Test: renders agency name in source row when executionSource = "agency"
// Test: renders "None" in attachments row when attachmentIds is empty
// Test: renders attachment count when attachmentIds has items
// Test: renders destination kind in destination row
// Test: "Publish Now" button is visible and enabled when not publishing
// Test: clicking "Publish Now" opens the confirmation dialog
// Test: confirmation dialog shows title and description text
// Test: clicking "Publish" in dialog calls onPublish
// Test: clicking "Cancel" in dialog closes dialog without calling onPublish
// Test: "Publish Now" button is disabled when isPublishing = true
// Test: shows publishing text while isPublishing = true
// Test: "Back" button is disabled when isPublishing = true
// Test: clicking "Back" calls onBack when not publishing
// Test: publishError is displayed inline when set
// Test: publishError is not shown when null
```

---

## Implementation Checklist

- [ ] Create `ComposerStepper.tsx` with step states (complete/active/future) and click-to-navigate behavior
- [ ] Create `ArticleSettingsStep.tsx` with `onGenerateClick` callback pattern
- [ ] Create `ArticlePreviewStep.tsx` using `SafeHtml` (never raw `dangerouslySetInnerHTML`)
- [ ] Create `MediaAttachmentStep.tsx` with 6-item cap and toast on over-limit
- [ ] Create `DestinationStep.tsx` with role-gated destination cards
- [ ] Create `ComposerReviewStep.tsx` with `AlertDialog` confirm before publish
- [ ] Add all `mediaStudio.articleComposer.*` keys to `en.ts`
- [ ] Add all Thai translations to `th.ts`
- [ ] Create all 6 test files with stub test cases listed above
- [ ] Verify `DestinationStep` calls `onGenerateCaption` (not tRPC directly) for caption generation
- [ ] Verify `ArticlePreviewStep` never uses `dangerouslySetInnerHTML` directly — only `SafeHtml`
- [ ] Run `pnpm test -- --testPathPattern="ArticleSettingsStep|ArticlePreviewStep|MediaAttachmentStep|DestinationStep|ComposerReviewStep|ComposerStepper"` and confirm all test files are collected

---

## Consistency Notes for Neighboring Sections

**section-07 (`ContentComposerPanel`)** consumes all six components defined here. It must:

- Pass `state: ComposerState` and `dispatch` to each step — the `Pick<>` prop types here mean the parent can pass the full state and TypeScript will accept it.
- Provide `onGenerateClick` to `ArticleSettingsStep` — the panel owns stream lifecycle.
- Provide `onStopGeneration` and `onRegenerate` to `ArticlePreviewStep`.
- Provide `onGenerateCaption` to `DestinationStep` — triggers `trpc.contentComposer.generateSocialCaption`.
- Provide `onPublish` to `ComposerReviewStep` — triggers `trpc.contentComposer.publish`.
- Pass `skillName` to `ComposerReviewStep` by resolving `state.skillId` against the cached `skills.listFromDb` result.
- Render `ComposerStepper` above the active step with `currentStep` mapped from `state.currentStep`.

**section-10 (integration tests)** will call each step component directly in integration scenarios to verify the full wizard flow end-to-end.