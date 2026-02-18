# คู่มือการใช้งาน Dynamic Skill Input Forms (ภาษาไทย)

## ภาพรวม

ฟีเจอร์นี้เพิ่มความสามารถให้ผู้ใช้งานสามารถเลือก Skill และกรอกข้อมูลแบบ Dynamic Form ได้ใน Chat Interface เหมือนกับที่มีอยู่ใน Media Studio

## สิ่งที่สร้างขึ้น

### 1. Components หลัก

| Component | คำอธิบาย |
|-----------|---------|
| `SkillSelector` | Dialog สำหรับเลือก Skill พร้อม Search และ Keyboard Navigation |
| `ChatDynamicSkillForm` | ฟอร์มที่ render จาก Skill Schema |
| `MobileSkillForm` | Bottom Sheet สำหรับ Mobile (ใช้ vaul) |
| `SkillInputChip` | แสดงสถานะ Skill ที่กำลังใช้งาน |
| `SkillCommandButton` | ปุ่มเปิด Skill Selector (พร้อม Tooltip Ctrl+K) |
| `SkillFormErrorBoundary` | จัดการ Error ที่เกิดขึ้นใน Form |

### 2. Hooks

| Hook | คำอธิบาย |
|------|---------|
| `useChatSkillForm` | Hook หลักสำหรับจัดการ state และ render |
| `useSkillForm` | จัดการ form state, validation |
| `useSkillExecution` | เรียกใช้ skill ผ่าน tRPC |
| `useImageUpload` | อัพโหลดรูปภาพพร้อม retry mechanism |
| `useFeatureFlag` | ควบคุมการเปิด/ปิดฟีเจอร์ |

---

## วิธีการติดตั้ง (Integration)

### ขั้นตอนที่ 1: Import

```typescript
// ใน ChatView.tsx
import { 
  useChatSkillForm,
  SkillCommandButton,
  SkillFormErrorBoundary 
} from '@/components/chat/skill';
```

### ขั้นตอนที่ 2: เรียกใช้ Hook

```typescript
function ChatView({ conversationId }: { conversationId: number }) {
  // เรียกใช้ hook หลัก
  const skillForm = useChatSkillForm(
    conversationId, 
    (content, context) => {
      // Callback เมื่อส่งข้อความ (optional)
      console.log('Skill context:', context);
    }
  );

  // ใช้ข้อมูลจาก hook
  const { 
    renderSkillForm,      // แสดงฟอร์ม
    renderSkillChip,      // แสดง chip ตอน minimize
    renderSkillSelector,  // แสดง skill selector
    setShowSkillSelector, // เปิด/ปิด selector
    isFormOpen,          // สถานะ form เปิด/ปิด
    isLoadingSchema,     // กำลังโหลด schema
    hasFormChanges,      // มีการเปลี่ยนแปลงข้อมูล
  } = skillForm;
```

### ขั้นตอนที่ 3: เพิ่มปุ่ม Skill ใน Chat Input

```typescript
// ใน Input Area
<div className="flex items-center gap-2">
  <SkillCommandButton 
    onClick={() => setShowSkillSelector(true)} 
  />
  <textarea ... />
  <button type="submit">Send</button>
</div>
```

### ขั้นตอนที่ 4: Render UI Components

```typescript
return (
  <div className="chat-container">
    {/* Messages... */}
    
    {/* Skill Selector Dialog */}
    {renderSkillSelector()}
    
    {/* Form หรือ Chip */}
    <SkillFormErrorBoundary onReset={() => skillForm.closeSkillForm()}>
      {renderSkillForm()}
      {renderSkillChip()}
    </SkillFormErrorBoundary>
    
    {/* Input Area */}
    <div className="input-area">
      <SkillCommandButton 
        onClick={() => setShowSkillSelector(true)} 
        disabled={isFormOpen}
      />
      {/* ... rest of input */}
    </div>
  </div>
);
```

---

## การใช้งาน Feature Flag

```typescript
import { useFeatureFlag } from '@/hooks/useFeatureFlag';

function ChatView() {
  // เช็คว่าฟีเจอร์เปิดอยู่หรือไม่
  const isEnabled = useFeatureFlag('chat.dynamicSkillForm', {
    userId: currentUser?.id
  });

  if (!isEnabled) {
    return <StandardChatView />;
  }

  return <ChatWithSkillForm />;
}
```

**การตั้งค่า Feature Flag:**
- แก้ไขใน `apps/web/client/src/hooks/useFeatureFlag.ts`
- หรือตั้งค่าผ่าน Environment Variable: `VITE_FEATURE_CHAT_DYNAMICSKILLFORM={"enabled":true}`

---

## การใช้งาน Hooks แยก

### useSkillForm (สำหรับ Custom Form)

```typescript
import { useSkillForm } from '@/components/chat/skill';

function MyCustomForm() {
  const schema = {
    title: 'My Form',
    sections: [{
      id: 'section1',
      title: 'Section 1',
      fields: [
        { id: 'name', type: 'text', label: 'Name', required: true },
        { id: 'age', type: 'number', label: 'Age', min: 0, max: 150 },
      ]
    }]
  };

  const {
    values,
    setValue,
    errors,
    validate,
    isValid,
    hasChanges,
    reset
  } = useSkillForm({ schema, initialValues: { age: 18 } });

  const handleSubmit = () => {
    if (validate()) {
      console.log('Submit:', values);
    }
  };

  return (
    <div>
      <input 
        value={values.name || ''} 
        onChange={e => setValue('name', e.target.value)}
      />
      {errors.name && <span className="error">{errors.name}</span>}
      
      <button onClick={handleSubmit} disabled={!isValid}>
        Submit
      </button>
    </div>
  );
}
```

### useImageUpload (สำหรับ Upload รูป)

```typescript
import { useImageUpload } from '@/components/chat/skill';

function ImageUploader() {
  const { 
    upload, 
    isUploading, 
    uploadProgress, 
    error, 
    retry,
    validateFile 
  } = useImageUpload();

  const handleFileSelect = async (file: File) => {
    // Validation ก่อน upload
    const validation = validateFile(file, {
      maxFileSize: 5 * 1024 * 1024, // 5MB
      allowedTypes: ['image/jpeg', 'image/png']
    });

    if (!validation.valid) {
      alert(validation.error);
      return;
    }

    try {
      const url = await upload(file, { retry: 3 });
      console.log('Uploaded:', url);
    } catch (err) {
      console.error('Upload failed:', err);
    }
  };

  return (
    <div>
      {isUploading && (
        <div>
          <progress value={uploadProgress} max={100} />
          <span>{uploadProgress}%</span>
        </div>
      )}
      {error && (
        <div>
          Error: {error.message}
          <button onClick={retry}>Retry</button>
        </div>
      )}
      <input type="file" onChange={e => e.target.files?.[0] && handleFileSelect(e.target.files[0])} />
    </div>
  );
}
```

---

## การทำงานกับ Mobile

```typescript
import { MobileSkillForm } from '@/components/chat/skill';

function MobileChatView() {
  const [showMobileForm, setShowMobileForm] = useState(false);
  const { values, setValue } = useSkillForm({ schema });

  return (
    <MobileSkillForm
      open={showMobileForm}
      onClose={() => setShowMobileForm(false)}
      skillName="Image Generator"
      schema={schema}
      values={values}
      onChange={setValue}
      onSubmit={handleSubmit}
      onCancel={() => setShowMobileForm(false)}
      hasUnsavedChanges={hasChanges}
    />
  );
}
```

**คุณสมบัติ Mobile:**
- Bottom sheet ที่ลากขึ้น/ลงได้
- Snap points ที่ 50% และ 90% ของจอ
- Confirmation dialog ก่อนปิดถ้ามีการเปลี่ยนแปลง
- Sticky header และ footer

---

## การ Validation

ระบบ validation รองรับ:

| Field Type | Validation |
|------------|-----------|
| `text` | required, minLength, maxLength |
| `textarea` | required, minLength, maxLength |
| `email` | required, email format |
| `number` | required, min, max |
| `slider` | required, min, max |
| `select` | required, valid option |
| `multiselect` | required, maxCount |
| `image` | required, valid URL |

**ตัวอย่าง Schema พร้อม Validation:**

```typescript
const schema = {
  title: 'Image Generator',
  sections: [{
    id: 'settings',
    title: 'Settings',
    fields: [
      {
        id: 'prompt',
        type: 'textarea',
        label: 'Prompt',
        required: true,
        min: 10,  // min length
        max: 1000 // max length
      },
      {
        id: 'width',
        type: 'number',
        label: 'Width',
        required: true,
        min: 256,
        max: 2048
      },
      {
        id: 'style',
        type: 'select',
        label: 'Style',
        options: [
          { value: 'realistic', label: 'Realistic' },
          { value: 'artistic', label: 'Artistic' }
        ]
      },
      {
        id: 'email',
        type: 'text',
        label: 'Email',
        // จะ validate email format อัตโนมัติถ้าชื่อ field มี "email"
      }
    ]
  }]
};
```

---

## Security Features

ระบบมีการป้องกันความปลอดภัยดังนี้:

1. **XSS Prevention** - ตรวจสอบ `<script>` tags ใน input
2. **URL Validation** - ปฏิเสธ `javascript:`, `data:` URLs
3. **File Upload Validation** - ตรวจสอบ file type และ size
4. **Rate Limiting** - จำกัดการเรียก API executeSkill
5. **Authorization** - ตรวจสอบสิทธิ์การใช้งาน skill

---

## การ Debug

```typescript
// เปิด log analytics ใน development
if (import.meta.env.DEV) {
  console.log('Skill form values:', skillForm.values);
  console.log('Skill form errors:', skillForm.errors);
}

// ใช้ Error Boundary
<SkillFormErrorBoundary onReset={() => window.location.reload()}>
  {renderSkillForm()}
</SkillFormErrorBoundary>
```

---

## ตัวอย่างการใช้งานแบบสมบูรณ์

```typescript
import React from 'react';
import {
  useChatSkillForm,
  SkillCommandButton,
  SkillFormErrorBoundary
} from '@/components/chat/skill';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';

export default function ChatView({ conversationId }: { conversationId: number }) {
  // Feature flag check
  const isSkillFormEnabled = useFeatureFlag('chat.dynamicSkillForm');
  
  // Skill form hook
  const skillForm = useChatSkillForm(conversationId);
  
  if (!isSkillFormEnabled) {
    return <BasicChatView conversationId={conversationId} />;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto">
        {/* ... messages ... */}
      </div>
      
      {/* Skill Form Area */}
      <div className="p-4">
        <SkillFormErrorBoundary>
          {skillForm.renderSkillForm()}
          {skillForm.renderSkillChip()}
        </SkillFormErrorBoundary>
        
        {/* Input Area */}
        <div className="flex items-center gap-2 border rounded-lg p-2">
          <SkillCommandButton 
            onClick={() => skillForm.setShowSkillSelector(true)}
            disabled={skillForm.isFormOpen}
          />
          
          <textarea 
            className="flex-1 resize-none"
            placeholder="พิมพ์ข้อความ..."
            rows={1}
          />
          
          <button type="submit">ส่ง</button>
        </div>
      </div>
      
      {/* Skill Selector Dialog */}
      {skillForm.renderSkillSelector()}
    </div>
  );
}
```

---

## หมายเหตุ

1. **ChatView.tsx ยังไม่ได้ถูกแก้ไขโดยอัตโนมัติ** - ต้อง integrate เองตามคู่มือนี้
2. **Analytics** - ถูก integrate กับ PostHog แล้ว ไม่ต้องทำอะไรเพิ่ม
3. **Tests** - รัน `npm test` ใน `apps/web` เพื่อตรวจสอบ
4. **Build** - รัน `npm run build` เพื่อ build production

---

## การติดต่อ/สอบถาม

หากพบปัญหา:
1. ตรวจสอบ console ดู error messages
2. ตรวจสอบ PostHog analytics events
3. ดู Network tab ใน DevTools สำหรับ tRPC calls
