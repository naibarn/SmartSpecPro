# Configuration UI Locations - SmartSpecPro

## 📍 สรุปหน้า Config ทั้งหมดในระบบ

---

## 👤 User Settings (ตั้งค่าผู้ใช้)

### 1. `/settings` - **Settings.tsx**
**ไฟล์:** `apps/web/client/src/pages/Settings.tsx`

**หน้าตั้งค่าผู้ใช้ทั่วไป** สำหรับ user ทุกคน:
- ✅ ข้อมูลโปรไฟล์
- ✅ การตั้งค่าบัญชี
- ✅ ความปลอดภัย & รหัสผ่าน
- ✅ การแจ้งเตือน
- ✅ ภาษา & เขตเวลา
- ✅ API Keys (ส่วนตัว)

**เข้าถึง:** ผู้ใช้ทุกคน
**Menu:** Main → Settings

---

## 🏢 Domain Admin Settings (ตั้งค่าระดับโดเมน)

### 2. `/domain-admin/settings` - **TenantSettings.tsx**
**ไฟล์:** `apps/web/client/src/pages/TenantSettings.tsx`

**ตั้งค่าระดับ Tenant/Domain** สำหรับ domain_admin:
- ✅ ข้อมูล Tenant
- ✅ การตั้งค่าโดเมน
- ✅ Branding & Logo
- ✅ การตั้งค่าเฉพาะองค์กร

**เข้าถึง:** domain_admin, admin
**Menu:** Domain Admin → Tenant Settings

### 3. `/domain-admin/theme` - **DomainThemeEditor.tsx**
**ไฟล์:** `apps/web/client/src/pages/DomainThemeEditor.tsx`

**แก้ไขธีมและสี:**
- ✅ Color Scheme
- ✅ Custom CSS
- ✅ Logo & Branding
- ✅ Layout Customization

**เข้าถึง:** domain_admin, admin
**Menu:** Domain Admin → Edit Theme

### 4. `/domain-admin/users` - **DomainUsers.tsx**
**จัดการผู้ใช้ในองค์กร:**
- ✅ User Management
- ✅ Roles & Permissions
- ✅ Invitations

**เข้าถึง:** domain_admin, admin
**Menu:** Domain Admin → Manage Users

---

## 🔧 Admin Settings (ตั้งค่าระดับระบบ)

### 5. `/admin/settings` - **AdminSettings.tsx**
**ไฟล์:** `apps/web/client/src/pages/AdminSettings.tsx`

**ตั้งค่าระดับ Platform** สำหรับ admin เท่านั้น:
- ✅ System Settings
- ✅ Platform Configuration
- ✅ Email Settings (SMTP)
- ✅ Security Settings
- ✅ Feature Flags
- ✅ Maintenance Mode

**เข้าถึง:** admin เท่านั้น
**Menu:** Admin → Platform Settings

---

## 🤖 AI & LLM Configuration

### 6. `/admin/llm-providers` - **AdminLLMProviders.tsx**
**ไฟล์:** `apps/web/client/src/pages/AdminLLMProviders.tsx`

**จัดการ LLM Providers:**
- ✅ OpenAI, Anthropic, Cohere, etc.
- ✅ API Keys
- ✅ Model Configuration
- ✅ Rate Limits
- ✅ Pricing
- ✅ Enable/Disable Providers

**เข้าถึง:** admin
**Menu:** Admin → LLM Providers

**คุณสมบัติ:**
```typescript
// Provider Configuration
{
  name: "OpenAI",
  apiKey: "sk-...",
  enabled: true,
  models: ["gpt-4", "gpt-3.5-turbo"],
  rateLimit: {
    requestsPerMinute: 60,
    tokensPerMinute: 90000
  },
  pricing: {
    "gpt-4": { input: 0.03, output: 0.06 }
  }
}
```

---

## 🎨 Media AI Configuration

### 7. `/admin/media-providers` - **AdminMediaProviders.tsx**
**ไฟล์:** `apps/web/client/src/pages/AdminMediaProviders.tsx`

**จัดการ Media Generation Providers:**
- ✅ Image: DALL-E, Midjourney, Stable Diffusion
- ✅ Video: Runway, Pika, Kling AI
- ✅ Audio: ElevenLabs, Google TTS
- ✅ API Keys & Credentials
- ✅ Enable/Disable
- ✅ Default Provider Selection

**เข้าถึง:** admin
**Menu:** Admin → Media Providers

### 8. `/admin/media-models` - **AdminMediaModels.tsx**
**ไฟล์:** `apps/web/client/src/pages/AdminMediaModels.tsx`

**จัดการ Media AI Models:**
- ✅ Image Models (DALL-E 3, SDXL, Midjourney v6)
- ✅ Video Models (Runway Gen-2, Pika 1.0, Kling)
- ✅ Model Parameters
- ✅ Pricing Configuration
- ✅ Quality Settings
- ✅ Enable/Disable Models

**เข้าถึง:** admin
**Menu:** Admin → Media AI Models

---

## 💾 Storage Configuration

### 9. `/admin/storage-settings` - **AdminStorageSettings.tsx**
**ไฟล์:** `apps/web/client/src/pages/AdminStorageSettings.tsx`

**จัดการ Object Storage:**
- ✅ Cloudflare R2 Configuration
- ✅ AWS S3 Configuration
- ✅ Bucket Settings
- ✅ Access Keys
- ✅ CDN Configuration
- ✅ Storage Quota
- ✅ Upload Limits

**เข้าถึง:** admin
**Menu:** Admin → Storage (R2/S3)

**ตัวอย่าง Config:**
```typescript
{
  provider: "cloudflare_r2",
  accountId: "...",
  accessKeyId: "...",
  secretAccessKey: "...",
  bucketName: "smartspec-media",
  publicUrl: "https://media.smartaihub.app",
  maxFileSize: "100MB",
  allowedTypes: ["image/*", "video/*", "application/pdf"]
}
```

---

## 👥 User & Tenant Management

### 10. `/admin/tenants` - **AdminTenants.tsx**
**ไฟล์:** `apps/web/client/src/pages/AdminTenants.tsx`

**จัดการ Tenants:**
- ✅ Create/Edit/Delete Tenants
- ✅ Domain Configuration
- ✅ Feature Access Control
- ✅ Resource Limits
- ✅ Billing Settings

**เข้าถึง:** admin
**Menu:** Admin → Tenants

### 11. `/admin/users` - **AdminUsers.tsx**
**ไฟล์:** `apps/web/client/src/pages/AdminUsers.tsx`

**จัดการผู้ใช้ทั้งระบบ:**
- ✅ User List (ทุก Tenant)
- ✅ Role Management
- ✅ Credit Balance
- ✅ Suspend/Activate Users
- ✅ Usage Statistics

**เข้าถึก:** admin
**Menu:** Admin → Users

---

## 📦 Package & Credit Configuration

### 12. `/admin/packages` - **AdminPackages.tsx**
**ไฟล์:** `apps/web/client/src/pages/AdminPackages.tsx`

**จัดการ Credit Packages:**
- ✅ Create/Edit Packages
- ✅ Pricing
- ✅ Credit Amount
- ✅ Bonus Credits
- ✅ Validity Period
- ✅ Stripe Integration

**เข้าถึง:** admin
**Menu:** Admin → Packages

**ตัวอย่าง Package:**
```typescript
{
  name: "Starter Pack",
  credits: 1000,
  bonusCredits: 100,
  priceUSD: 10.00,
  validityDays: 30,
  stripeProductId: "prod_...",
  stripePriceId: "price_..."
}
```

---

## 🧠 Skills Configuration

### 13. `/admin/skills` - **AdminSkills.tsx**
**ไฟล์:** `apps/web/client/src/pages/AdminSkills.tsx`

**จัดการ Skills:**
- ✅ Skill Registry
- ✅ Enable/Disable Skills
- ✅ Skill Parameters
- ✅ Visibility Settings
- ✅ Skill Categories

**เข้าถึง:** admin
**Menu:** Admin → Skills

### 14. `/admin/skill-repositories` - **AdminSkillRepositories.tsx**
**ไฟล์:** `apps/web/client/src/pages/AdminSkillRepositories.tsx`

**จัดการ Skill Repositories:**
- ✅ Git Repository URLs
- ✅ Auto-sync Settings
- ✅ Branch Configuration
- ✅ Skill Discovery
- ✅ Version Control

**เข้าถึง:** admin
**Menu:** Admin → Skill Repos

---

## 📊 Monitoring & System Health

### 15. `/admin/services` - **AdminServices.tsx**
**ไฟล์:** `apps/web/client/src/pages/AdminServices.tsx`

**ตรวจสอบ Services:**
- ✅ Service Status
- ✅ Health Checks
- ✅ Uptime Monitoring
- ✅ Start/Stop Services
- ✅ Logs

**เข้าถึง:** admin
**Menu:** Admin → Services

### 16. `/admin/queues` - **AdminQueues.tsx**
**Dashboard สำหรับ Queue System:**
- ✅ BullMQ Dashboard
- ✅ Job Statistics
- ✅ Queue Health
- ✅ Failed Jobs
- ✅ Retry Management

**เข้าถึง:** admin
**Menu:** Admin → Queue Dashboard

### 17. `/admin/queues/llm` - **AdminQueueLLM.tsx**
**Monitor LLM Queue:**
- ✅ LLM Request Queue
- ✅ Processing Status
- ✅ Rate Limiting
- ✅ Errors & Retries

**เข้าถึง:** admin
**Menu:** Admin → LLM Monitor

### 18. `/admin/queues/media` - **AdminQueueMedia.tsx**
**Monitor Media Queue:**
- ✅ Media Generation Queue
- ✅ Image/Video Jobs
- ✅ Processing Status
- ✅ Failed Generations

**เข้าถึง:** admin
**Menu:** Admin → Media Monitor

### 19. External: `https://docker.smartaihub.app` - **Docker Status**
**Docker Container Status:**
- ✅ Container Health
- ✅ Resource Usage
- ✅ Logs
- ✅ Restart Containers

**เข้าถึง:** admin (external link)
**Menu:** Admin → Docker Status

---

## 🎨 Gallery & Content

### 20. `/admin/gallery` - **AdminGallery.tsx**
**ไฟล์:** `apps/web/client/src/pages/AdminGallery.tsx`

**จัดการ Gallery:**
- ✅ Gallery Items
- ✅ Moderation
- ✅ Featured Items
- ✅ Categories
- ✅ Visibility Control

**เข้าถึง:** admin
**Menu:** Admin → Gallery Admin

---

## 🔐 Security & API

### 21. `/admin/api-keys` - **AdminAPIKeys.tsx** (ถ้ามี)
**จัดการ API Keys ระดับระบบ:**
- ⏳ System-level API Keys
- ⏳ Integration Tokens
- ⏳ Webhook Secrets

### 22. `/admin/rate-limits` - **AdminRateLimits.tsx** (ถ้ามี)
**จัดการ Rate Limiting:**
- ⏳ API Rate Limits
- ⏳ User Quotas
- ⏳ IP-based Limits

### 23. `/admin/audit-logs` - **AdminAuditLogs.tsx** (ถ้ามี)
**Audit Logs:**
- ⏳ System Changes
- ⏳ Admin Actions
- ⏳ Security Events

---

## 📍 Navigation Structure

### Main Menu (ผู้ใช้ทั่วไป)
```
Dashboard
Chat (LLM)
Media Studio
Skills
Workflows
Media History
Document Management
Credits
Usage Analytics
└─ Settings ★
```

### Admin Menu (เฉพาะ Admin)
```
👨‍💼 ADMIN
├─ Tenants
├─ Services
├─ Queue Dashboard
│  ├─ LLM Monitor
│  └─ Media Monitor
├─ Docker Status (external)
├─ Users
├─ Packages
├─ LLM Providers ★
├─ Media Providers ★
├─ Media AI Models ★
├─ Skills
├─ Skill Repos
├─ Storage (R2/S3) ★
├─ Gallery Admin
└─ Platform Settings ★
```

### Domain Admin Menu (เฉพาะ Domain Admin)
```
🏢 DOMAIN ADMIN
├─ Manage Users
├─ Edit Content
├─ Edit Theme ★
├─ Manage Blog
└─ Tenant Settings ★
```

---

## 🎯 Quick Access Guide

### ต้องการตั้งค่า LLM (OpenAI, Claude, etc.)?
👉 `/admin/llm-providers` (AdminLLMProviders.tsx)

### ต้องการตั้งค่า Image/Video Generation?
👉 `/admin/media-providers` (AdminMediaProviders.tsx)
👉 `/admin/media-models` (AdminMediaModels.tsx)

### ต้องการตั้งค่า Storage (R2/S3)?
👉 `/admin/storage-settings` (AdminStorageSettings.tsx)

### ต้องการตั้งค่าระบบทั่วไป?
👉 `/admin/settings` (AdminSettings.tsx)

### ต้องการจัดการ Users?
👉 `/admin/users` (AdminUsers.tsx) - ทั้งระบบ
👉 `/domain-admin/users` (DomainUsers.tsx) - เฉพาะ tenant

### ต้องการแก้ไขธีม?
👉 `/domain-admin/theme` (DomainThemeEditor.tsx)

### ต้องการดู Queue Status?
👉 `/admin/queues` (AdminQueues.tsx)
👉 `/admin/queues/llm` (AdminQueueLLM.tsx)
👉 `/admin/queues/media` (AdminQueueMedia.tsx)

### ต้องการจัดการ Skills?
👉 `/admin/skills` (AdminSkills.tsx)
👉 `/admin/skill-repositories` (AdminSkillRepositories.tsx)

---

## 🔑 Access Levels

| หน้า | User | Domain Admin | Admin |
|------|------|--------------|-------|
| Settings | ✅ | ✅ | ✅ |
| Tenant Settings | ❌ | ✅ | ✅ |
| Domain Theme | ❌ | ✅ | ✅ |
| Domain Users | ❌ | ✅ | ✅ |
| Admin Settings | ❌ | ❌ | ✅ |
| LLM Providers | ❌ | ❌ | ✅ |
| Media Providers | ❌ | ❌ | ✅ |
| Storage Settings | ❌ | ❌ | ✅ |
| All Other Admin/* | ❌ | ❌ | ✅ |

---

## 📂 File Locations Summary

```
apps/web/client/src/pages/
├─ Settings.tsx                    # User settings
├─ TenantSettings.tsx              # Tenant/Domain settings
├─ DomainThemeEditor.tsx           # Theme customization
├─ DomainUsers.tsx                 # Domain user management
├─ AdminSettings.tsx               # Platform settings ★
├─ AdminLLMProviders.tsx           # LLM config ★
├─ AdminMediaProviders.tsx         # Media providers ★
├─ AdminMediaModels.tsx            # Media models ★
├─ AdminStorageSettings.tsx        # Storage config ★
├─ AdminTenants.tsx                # Tenant management
├─ AdminUsers.tsx                  # User management
├─ AdminPackages.tsx               # Credit packages
├─ AdminSkills.tsx                 # Skills
├─ AdminSkillRepositories.tsx      # Skill repos
├─ AdminServices.tsx               # Services monitoring
├─ AdminQueues.tsx                 # Queue dashboard
├─ AdminQueueLLM.tsx               # LLM queue
├─ AdminQueueMedia.tsx             # Media queue
└─ AdminGallery.tsx                # Gallery admin
```

---

## 🚀 Development Notes

### เพิ่ม Config Page ใหม่:

1. **สร้างไฟล์:**
   ```
   apps/web/client/src/pages/AdminYourFeature.tsx
   ```

2. **เพิ่ม Route:**
   ```typescript
   // apps/web/client/src/App.tsx
   <Route path="/admin/your-feature" component={AdminYourFeature} />
   ```

3. **เพิ่มใน Menu:**
   ```typescript
   // packages/shared/src/constants/menu.ts
   {
     id: 'admin-your-feature',
     label: 'Your Feature',
     icon: 'Settings',
     path: '/admin/your-feature',
     platforms: ['web', 'desktop'],
     roles: ['admin'],
     group: 'admin',
     sortOrder: 35
   }
   ```

4. **สร้าง API Endpoint:**
   ```typescript
   // apps/web/server/routers/yourFeature.ts
   export const yourFeatureRouter = router({
     getConfig: protectedProcedure.query(...),
     updateConfig: protectedProcedure.mutation(...)
   });
   ```

---

**สรุป:** ระบบมี Config UI ครบถ้วน แบ่งเป็น 3 ระดับ:
- 👤 **User Settings** - ตั้งค่าส่วนตัว
- 🏢 **Domain Admin** - ตั้งค่าองค์กร (Theme, Users, Tenant)
- 🔧 **Admin** - ตั้งค่าระบบทั้งหมด (LLM, Media, Storage, etc.)
