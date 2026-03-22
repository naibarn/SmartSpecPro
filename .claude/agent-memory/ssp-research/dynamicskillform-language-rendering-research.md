# DynamicSkillForm Language Rendering Research Brief

**Date**: 2026-03-10
**Status**: Complete Research
**Focus**: How DynamicSkillForm handles Thai/English label switching across chat page vs AIDraftModal

---

## Findings

### Key Discovery: Language Prop Handling Inconsistency

DynamicSkillForm supports Thai/English label switching via an optional `language` prop that defaults to "en". The component correctly implements a `getText()` helper that selects between English and Thai labels based on the prop. However, this feature is only exercised in the "Draft with AI" modal (AIDraftModal); the chat page's skill forms hardcode the language to English, preventing Thai labels from ever displaying.

**Evidence**:
- AIDraftModal passes conditional language: `language={language === "th" ? "th" : "en"}` (lines 1711, 1890)
- ChatDynamicSkillForm passes hardcoded language: `language="en"` (line 111)

---

## Current Architecture

### DynamicSkillForm Component
**File**: `apps/web/client/src/components/media/DynamicSkillForm.tsx`

**Props Interface** (lines 444-459):
```typescript
interface DynamicSkillFormProps {
  schema: SkillInputSchema;
  language?: "en" | "th";  // Optional, defaults to "en"
  values: Record<string, any>;
  onChange: (values: Record<string, any>) => void;
  onImageUpload?: (files: FileList) => Promise<string[]>;
  referenceImages?: ReferenceImage[];
  onRemoveImage?: (index: number) => void;
  isUploading?: boolean;
  excludeFields?: string[];
  onStyleAction?: (action: StyleAction) => void;
  className?: string;
}
```

**getText() Helper** (lines 516-519):
```typescript
const getText = (en: string | undefined, th: string | undefined) => {
  if (language === "th" && th) return th;
  return en || "";
};
```

This function is applied to:
- Field labels (line 603): `const label = getText(field.label, field.labelTh);`
- Placeholders (line 604): `const placeholder = getText(field.placeholder, field.placeholderTh);`
- Descriptions (line 605): `const description = getText(field.description || field.helpText, field.descriptionTh || field.helpTextTh);`
- Option labels (lines 705, 753): `{getText(opt.label, opt.labelTh)}`

### SkillInputField Schema with Thai Localization

Every schema field can include Thai variants:
```typescript
export interface SkillInputField {
  id: string;
  type: "text" | "textarea" | "select" | ...;
  label: string;           // English (required)
  labelTh?: string;        // Thai (optional)
  placeholder?: string;
  placeholderTh?: string;
  description?: string;
  descriptionTh?: string;
  helpText?: string;
  helpTextTh?: string;
  options?: Array<{
    value: string;
    label: string;
    labelTh?: string;      // Thai option labels
  }>;
  optionGroups?: Record<string, Array<{
    value: string;
    label: string;
    labelTh?: string;      // Thai in cascading selects
  }>>;
  // ... other fields (min, max, rows, required, dependsOn, etc.)
}
```

### AIDraftModal Implementation (Working Thai Support)
**File**: `apps/web/client/src/components/presentation/AIDraftModal.tsx`

**Language State** (line 357):
```typescript
const [language, setLanguage] = useState<"auto" | "en" | "th">("auto");
```

**DynamicSkillForm Rendering** (lines 1709-1713, 1888-1891):
```typescript
<DynamicSkillForm
  schema={articleGenSchema}
  language={language === "th" ? "th" : "en"}  // Conditionally passes Thai
  values={articleGenParams}
  onChange={setArticleGenParams}
/>
```

**User Can**: Select language preference in modal UI → form labels update to Thai

### ChatDynamicSkillForm Implementation (Broken Thai Support)
**File**: `apps/web/client/src/components/chat/skill/ChatDynamicSkillForm.tsx`

**Props Interface** (lines 10-17) — NO language prop accepted:
```typescript
export interface ChatDynamicSkillFormProps {
  schema: SkillInputSchema;
  values: Record<string, any>;
  onChange: (values: Record<string, any>) => void;
  isLoading?: boolean;
  error?: string | null;
  onClearError?: () => void;
}
```

**DynamicSkillForm Rendering** (lines 104-112):
```typescript
<DynamicSkillForm
  schema={schema}
  values={values}
  onChange={onChange}
  onImageUpload={handleImageUpload}
  excludeFields={[]}
  className="space-y-4"
  language="en"  // <- HARDCODED TO ENGLISH
/>
```

**Result**: Chat skill forms can NEVER display Thai labels, even if schema has them.

### Where ChatDynamicSkillForm Is Rendered
**File**: `apps/web/client/src/components/chat/ChatView.skillForm.tsx`

**useChatSkillForm Hook** (lines 57-445):
- Main hook used by ChatView.tsx
- Returns `renderSkillForm()` which builds a Card component

**Skill Form Card** (lines 312-324):
```typescript
<ChatDynamicSkillForm
  schema={skillFormState.schema}
  values={values}
  onChange={(newValues) => {
    Object.entries(newValues).forEach(([key, value]) => {
      if (values[key] !== value) {
        setValue(key, value);
      }
    });
  }}
  error={executionError?.message || null}
/>
```

No language prop passed → defaults to English.

---

## Risks

### Accessibility & User Experience
- **Thai-speaking users**: When using chat skills with Thai labels in schema, they see only English labels, creating confusion or poor UX
- **Schema creation**: Skill designers may add Thai labels to schemas, believing they'll render in chat, but get no feedback that chat doesn't support Thai
- **Inconsistency**: Users switch from "Draft with AI" (supports Thai) to chat skills (English-only) and get conflicting experiences

### Localization Completeness
- If the application is targeting Thai-speaking users or multi-language support, this is a gap
- Other forms (AIDraftModal) prove Thai is technically supported but chat is incompletely integrated

### Maintenance Debt
- Pattern divergence: AIDraftModal passes language conditionally, ChatDynamicSkillForm hardcodes it
- Future updates may inadvertently assume one pattern works everywhere

---

## Options

### Option A: Add Language Prop to ChatDynamicSkillForm (Minimal)
**Effort**: Low
**Scope**: 2–3 files

1. Add optional `language?: "en" | "th"` prop to `ChatDynamicSkillFormProps` interface (ChatDynamicSkillForm.tsx)
2. Pass language to DynamicSkillForm: `<DynamicSkillForm ... language={language ?? "en"} />`
3. In `useChatSkillForm()` hook (ChatView.skillForm.tsx), detect language from somewhere (e.g., localStorage, global context, or user preferences)
4. Pass detected language when rendering ChatDynamicSkillForm (line 312-324)

**Pros**:
- Minimal changes, follows existing AIDraftModal pattern
- Allows chat to respect user's language preference
- Backward compatible (prop is optional)

**Cons**:
- Still requires a source of truth for language (where does chat get language from?)
- No language selector UI in chat (unlike AIDraftModal which has a dropdown)
- Requires determining whether to use "auto", "en", or "th" based on user context

---

### Option B: Add Language Selector UI to Chat (Complete)
**Effort**: Medium
**Scope**: 4–5 files

1. Add language state to ChatView or useChatSkillForm hook
2. Add language selector dropdown/toggle in the skill form card header or chat settings
3. Pass selected language to ChatDynamicSkillForm (and then to DynamicSkillForm)
4. Persist language choice to localStorage for consistency

**Pros**:
- Full feature parity with AIDraftModal
- Users have explicit control over language
- Consistent UX across the app

**Cons**:
- More work (new UI, state management, persistence logic)
- May clutter chat skill form UI if space is limited
- Requires decision on default language

---

### Option C: Use Global Language Context (Integrated)
**Effort**: Medium
**Scope**: 3–4 files

1. Create or leverage existing language context/provider (e.g., i18n library)
2. Extract language preference from context in ChatDynamicSkillForm or useChatSkillForm
3. Pass context language to DynamicSkillForm
4. Allow global language switching to affect all forms (chat and AIDraftModal)

**Pros**:
- Consistent across entire app
- Single source of truth for language
- Scales to other components naturally

**Cons**:
- Requires global state infrastructure
- May require refactoring if no context exists yet
- Language detection logic needed (from user locale? settings? UI toggle?)

---

## Recommendation

**Implement Option A (Add Language Prop) as immediate fix, with path to Option C (Global Context)**

**Rationale**:

1. **Quick win**: ChatDynamicSkillForm's hardcoded `language="en"` is an obvious bug. Removing the hardcoding unblocks language switching.

2. **Determine language source**:
   - **Short-term**: Use localStorage key (e.g., `smartspec_language_preference`) or detect from browser locale
   - **Long-term**: Migrate to global language context (Option C)

3. **Implementation steps**:
   - [ ] Modify `ChatDynamicSkillFormProps` to accept optional `language` prop
   - [ ] In `useChatSkillForm()` hook, read language preference (localStorage or context)
   - [ ] Pass language when rendering ChatDynamicSkillForm
   - [ ] Test that Thai labels render correctly in chat skills when schema has `labelTh` fields

4. **Leaves door open**: If a global language context is added later (for i18n), ChatDynamicSkillForm will automatically use it with minimal changes.

---

## Open Questions

1. **Where should chat detect language preference?**
   - From user's browser locale (navigator.language)?
   - From localStorage (user previously selected)?
   - From global app settings/context?
   - From ChatView's own state (does ChatView track language)?

2. **Should there be a language toggle UI in the chat skill form?**
   - AIDraftModal has one (line 357 state + UI not fully shown in snippet)
   - Chat could add one in the card header, but that may clutter the UI
   - Or rely on global language setting?

3. **Does ChatView.tsx already have language tracking?**
   - Need to check ChatView.tsx to see if it maintains language state
   - If yes, pass it down to useChatSkillForm hook
   - If no, what is the intended pattern for language preference in chat?

4. **Should language preference persist across sessions?**
   - AIDraftModal may not persist (need to verify)
   - Chat should likely store in localStorage for consistency

5. **Fallback behavior**: When `language="th"` is set but schema lacks `labelTh`, getText() falls back to English. Is this the desired behavior, or should Thai-speaking users get English? (Likely yes, this is correct.)

---

## Files to Modify

| File | Lines | Change |
|------|-------|--------|
| `apps/web/client/src/components/chat/skill/ChatDynamicSkillForm.tsx` | 10-17, 111 | Add `language` prop to interface, pass to DynamicSkillForm |
| `apps/web/client/src/components/chat/ChatView.skillForm.tsx` | 312-324 | Detect language, pass to ChatDynamicSkillForm |
| `apps/web/client/src/components/chat/ChatView.tsx` | TBD | Check if language tracking already exists |

---

## Related Code

- **Language decision logic**: AIDraftModal line 1711, 1890
- **getText() implementation**: DynamicSkillForm lines 516-519
- **Option label rendering**: DynamicSkillForm lines 705, 753
- **Section title rendering**: DynamicSkillForm rendering loop (need to verify exact line)
