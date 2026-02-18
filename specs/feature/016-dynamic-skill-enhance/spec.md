# Feature: Dynamic Skill Input Enhancement for Chat

## Overview

เพิ่มความสามารถให้หน้า Chat รองรับการใช้ Skill แบบ Dynamic Input เทียบเท่ากับ Media Studio โดยผู้ใช้สามารถ:
- เลือก Skill ที่ต้องการใช้งานพร้อมแสดง Form ตาม Input Schema
- กรอกค่าต่างๆ ตาม field ที่แต่ละ Skill กำหนด (text, select, boolean, image upload, etc.)
- รองรับ dependent fields (เช่น เลือก Category แล้วแสดง Options ย่อย)
- Execute Skill ด้วยค่าที่กรอกและได้รับผลลัพธ์

## Goals

1. **Parity with Media Studio**: หน้า Chat สามารถใช้ Skill แบบ Dynamic Input ได้เหมือนกับ Media Studio
2. **Skill Discovery**: ผู้ใช้สามารถค้นหาและเลือก Skill ที่ต้องการใช้งานได้ง่าย
3. **Dynamic Form Rendering**: แสดง Form ตาม Input Schema ของแต่ละ Skill โดยอัตโนมัติ
4. **Context Preservation**: ผลลัพธ์จาก Skill ถูกบันทึกเป็น Message ใน Conversation
5. **Seamless Experience**: สลับระหว่างการคุยปกติและใช้ Skill ได้อย่างราบรื่น

## Current State Analysis

### Media Studio (Reference Implementation)
```
apps/web/client/src/components/media/DynamicSkillForm.tsx
├── รับ SkillInputSchema (sections, fields)
├── Render fields ตาม type: text, textarea, select, boolean, imageUpload, etc.
├── รองรับ dependsOn สำหรับ conditional fields
├── รองรับ optionGroups สำหรับ cascading selects
└── ส่งค่ากลับผ่าน onChange(values: Record<string, any>)
```

### Chat System (Current)
```
apps/web/client/src/components/chat/
├── ChatView.tsx - หน้าหลักแสดงข้อความ
├── SlashCommandMenu.tsx - เลือก skill ผ่าน /command
└── settings/SkillSettings.tsx - ตั้งค่า skill ที่ enable

apps/web/server/routers/chat.ts
├── detectSkill - ตรวจจับ skill จากข้อความ
├── executeSkill - execute skill ด้วย params คงที่
└── รองรับ params: prompt, model, aspectRatio, numImages, etc.
```

### Skill Schema System
```
skills/{skill-name}/
├── skill.md - เนื้อหา skill
└── schemas/
    ├── input.schema.json - UI schema (custom format)
    └── ui.schema.json - (optional)

apps/web/server/routers/skills.ts
├── getInputSchema(skillId) - โหลด schema จาก file
└── convertJsonSchemaToSkillSchema() - convert JSON Schema → UI Schema
```

## Proposed Architecture

### 1. UI Components (apps/web/client/src/components/chat/skill/)

```typescript
// SkillSelector.tsx - Dialog สำหรับเลือก Skill
interface SkillSelectorProps {
  open: boolean;
  onClose: () => void;
  onSelect: (skillId: string, hasSchema: boolean) => void;
}

// DynamicSkillFormDialog.tsx - Form ตาม Schema
interface DynamicSkillFormDialogProps {
  skillId: string;
  schema: SkillInputSchema;
  open: boolean;
  onClose: () => void;
  onSubmit: (values: Record<string, any>) => void;
}

// SkillInputChip.tsx - แสดง chip เมื่อมี skill input ที่กรอกไว้
interface SkillInputChipProps {
  skillName: string;
  values: Record<string, any>;
  onEdit: () => void;
  onRemove: () => void;
}
```

### 2. Integration with Chat Input

```typescript
// ใน ChatView.tsx หรือ ChatInput.tsx
interface ChatInputState {
  text: string;
  attachments: Attachment[];
  activeSkill: {
    skillId: string;
    skillName: string;
    values: Record<string, any>;
    schema: SkillInputSchema;
  } | null;
}
```

### 3. Backend Changes

```typescript
// apps/web/server/routers/chat.ts
// extend executeSkill input ให้รองรับ dynamicParams
executeSkillInput: z.object({
  skillId: z.string(),
  prompt: z.string().optional(), // optional เมื่อมี dynamic input
  dynamicParams: z.record(z.any()).optional(), // ค่าจาก form
  conversationId: z.number(),
})

// apps/web/server/services/skillExecutor.ts
// executeSkill ต้องรวม dynamicParams เข้าไปใน extraParams
```

## Implementation Plan

### Phase 1: Core Components (3-4 days)

#### 1.1 Create SkillSelector Component
**File:** `apps/web/client/src/components/chat/skill/SkillSelector.tsx`

**Requirements:**
- แสดงรายการ Skill ที่ user มีสิทธิ์ใช้ (จาก `trpc.skills.getUserVisibleSkills`)
- แบ่งหมวดหมู่ (Category)
- มี Search/filter
- แสดง icon, name, description
- บ่งชี้ว่า Skill นี้มี Input Schema หรือไม่

**API Integration:**
```typescript
const { data: skills } = trpc.skills.getUserVisibleSkills.useQuery({ limit: 100 });
```

#### 1.2 Create DynamicSkillFormDialog
**File:** `apps/web/client/src/components/chat/skill/DynamicSkillFormDialog.tsx`

**Requirements:**
- ใช้ `DynamicSkillForm` จาก `apps/web/client/src/components/media/DynamicSkillForm.tsx`
- หรือสร้าง `ChatDynamicSkillForm` ที่ปรับแต่งสำหรับ chat context
- รองรับ:
  - Collapsible sections
  - All field types: text, textarea, select, multiselect, boolean, number, slider, imageUpload
  - dependsOn สำหรับ conditional visibility
  - optionGroups สำหรับ cascading selects
- Preview ค่าที่จะส่งก่อน submit

**API Integration:**
```typescript
const { data: schemaData } = trpc.skills.getInputSchema.useQuery({ skillId });
```

#### 1.3 Create SkillInputChip
**File:** `apps/web/client/src/components/chat/skill/SkillInputChip.tsx`

**Requirements:**
- แสดงบน Chat Input เมื่อมี skill ที่กรอกค่าไว้
- แสดง skill name + จำนวน fields ที่กรอก
- มีปุ่ม Edit (เปิด form ใหม่) และ Remove (ลบออก)

### Phase 2: Chat Integration (2-3 days)

#### 2.1 Extend Chat Input State
**File:** `apps/web/client/src/components/chat/ChatInput.tsx` หรือ `ChatView.tsx`

**Changes:**
- เพิ่ม state `activeSkillInput` สำหรับเก็บ skill + values
- เพิ่มปุ่ม "Use Skill" ใน input area (ขวาของปุ่ม attach)
- เมื่อมี activeSkillInput ให้แสดง SkillInputChip

#### 2.2 Modify Message Sending Flow
**File:** `apps/web/client/src/components/chat/ChatView.tsx`

**Flow:**
```
User types message → Click Send
├── If has activeSkillInput:
│   ├── Call trpc.chat.executeSkill with dynamicParams
│   ├── Show loading state
│   ├── On success: Add assistant message with result
│   └── Clear activeSkillInput
└── Else:
    └── Normal message flow (existing)
```

#### 2.3 Extend executeSkill API
**File:** `apps/web/server/routers/chat.ts`

**Changes:**
- Update `executeSkill` input schema ให้รองรับ `dynamicParams`
- ส่ง `dynamicParams` ไปยัง `skillExecutor.executeSkill` ผ่าน `extraParams`

```typescript
.executeSkill.input = z.object({
  skillId: z.string(),
  prompt: z.string().optional(),
  dynamicParams: z.record(z.any()).optional(), // NEW
  conversationId: z.number(),
  // ... existing fields
});
```

### Phase 3: Slash Command Enhancement (2 days)

#### 3.1 Update SlashCommandMenu
**File:** `apps/web/client/src/components/chat/SlashCommandMenu.tsx`

**Changes:**
- เมื่อเลือก Skill ที่มี Input Schema → เปิด DynamicSkillFormDialog
- เมื่อเลือก Skill ที่ไม่มี Schema → ทำงานแบบเดิม (ใช้ default params)

#### 3.2 Quick Skill Shortcuts
- `/image` → เปิด form สำหรับ image-generation
- `/video` → เปิด form สำหรับ video-generation
- `/prompt` → เปิด form สำหรับ prompt-enhancement

### Phase 4: Polish & UX (2 days)

#### 4.1 Keyboard Shortcuts
- `Cmd/Ctrl + K` → เปิด Skill Selector
- `Escape` → ปิด form/selector

#### 4.2 Loading States
- Skeleton loader ขณะโหลด schema
- Progress indicator ขณะ execute skill

#### 4.3 Error Handling
- แสดง error ถ้า schema ไม่ valid
- แสดง error ถ้า execute ไม่สำเร็จ
- Validation ก่อน submit form

#### 4.4 Mobile Responsive
- Full-screen dialog บน mobile
- Touch-friendly form controls

## API Contract

### Existing APIs (No Change)
```typescript
// Get visible skills
trpc.skills.getUserVisibleSkills.useQuery({ limit: 100 });

// Get skill input schema
trpc.skills.getInputSchema.useQuery({ skillId: string });
```

### Modified APIs
```typescript
// Execute skill with dynamic params
const mutation = trpc.chat.executeSkill.useMutation();
mutation.mutate({
  skillId: "create-image-prompt",
  prompt: "optional context from chat",
  dynamicParams: {
    userIdea: "a cat in space",
    styleCategory: "F",
    styleName: "Ghibli-style",
    aspectRatio: "9:16"
  },
  conversationId: 123,
});
```

## Component Structure

```
apps/web/client/src/components/chat/
├── skill/
│   ├── index.ts                    # exports
│   ├── SkillSelector.tsx           # Dialog เลือก skill
│   ├── DynamicSkillFormDialog.tsx  # Form ตาม schema
│   ├── SkillInputChip.tsx          # Chip แสดง active skill
│   ├── SkillCommandButton.tsx      # ปุ่มเปิด skill selector
│   └── hooks/
│       ├── useSkillSchema.ts       # โหลด schema
│       └── useSkillExecution.ts    # Execute skill
├── ChatInput.tsx                   # + integration
└── ChatView.tsx                    # + state management
```

## State Management

### Local State (Component Level)
```typescript
// ใน ChatView.tsx
const [activeSkillInput, setActiveSkillInput] = useState<{
  skillId: string;
  skillName: string;
  schema: SkillInputSchema;
  values: Record<string, any>;
} | null>(null);
```

### No Global State Required
- ใช้ React Query สำหรับ fetch skills และ schema
- ใช้ local state สำหรับ form values
- ไม่ต้องใช้ context หรือ store เพิ่ม

## Testing Strategy

### Unit Tests
```typescript
// SkillSelector.test.tsx
- แสดงรายการ skill ถูกต้อง
- search/filter ทำงาน
- เรียก onSelect เมื่อ click

// DynamicSkillFormDialog.test.tsx
- render form ตาม schema
- validate required fields
- conditional fields แสดง/ซ่อน ถูกต้อง
- submit ส่งค่าถูกต้อง
```

### Integration Tests
```typescript
// ChatView + Skill Integration
- เลือก skill → แสดง form → กรอกค่า → submit → ได้ผลลัพธ์
- skill result แสดงเป็น assistant message
```

## Migration Strategy

### Backward Compatibility
- ไม่มี breaking changes
- Skills ที่ไม่มี schema ยังทำงานแบบเดิมได้
- Execute skill API รองรับทั้งแบบมีและไม่มี dynamicParams

### Migration Steps
1. Deploy backend changes (เพิ่ม dynamicParams support)
2. Deploy frontend components (แบบ lazy-loaded)
3. Enable ผ่าน feature flag ทีละ user group

## Performance Considerations

1. **Schema Caching**: React Query cache schema ไว้ 5 นาที
2. **Lazy Loading**: DynamicSkillFormDialog โหลดแบบ lazy
3. **Image Upload**: ใช้ existing upload service (progressive upload)
4. **Debounced Search**: Skill selector search debounce 200ms

## Security Considerations

1. **Input Validation**: Validate dynamicParams ฝั่ง server ก่อน execute
2. **File Upload**: ใช้ existing upload validation (type, size)
3. **Rate Limiting**: ใช้ existing skill execution rate limiter
4. **Permission Check**: ตรวจสอบ user มีสิทธิ์ใช้ skill ก่อน execute

## Success Metrics

1. **Usage**: จำนวน skill execution ผ่าน chat dynamic form
2. **Completion Rate**: % ของ form ที่ถูกกรอกครบและ submit
3. **Error Rate**: % ของ execution ที่ fail
4. **User Satisfaction**: Feedback จาก users

## Future Enhancements

1. **Skill History**: บันทึกค่าที่เคยกรอกสำหรับ reuse
2. **Template Presets**: บันทึก preset ค่าที่ใช้บ่อย
3. **Multi-Skill**: รองรับการ chain skills (skill A → skill B)
4. **Inline Editing**: แก้ไขค่า skill จาก message เก่า
5. **AI Suggestion**: AI แนะนำค่าที่เหมาะสมตาม context

## References

- Media Studio Implementation:
  - `apps/web/client/src/components/media/DynamicSkillForm.tsx`
  - `apps/web/client/src/components/media/SkillSelectorDialog.tsx`

- Skill Schema System:
  - `apps/web/server/routers/skills.ts` (getInputSchema)
  - `skills/create-image-prompt/schemas/input.schema.json`

- Chat System:
  - `apps/web/server/routers/chat.ts` (executeSkill)
  - `apps/web/client/src/components/chat/ChatView.tsx`
