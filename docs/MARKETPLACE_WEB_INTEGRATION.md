# Marketplace Web Integration Guide

## 🏗️ Architecture Overview

SmartSpec ใช้ **Hybrid Architecture** ที่รวมจุดแข็งของทั้ง Web และ Desktop App:

```
┌──────────────────────────────────────────────────────┐
│        SmartSpecWeb (Next.js) - Marketing            │
│        https://marketplace.smartspec.ai              │
│                                                       │
│  ✅ SEO-optimized pages                              │
│  ✅ Public template browsing                         │
│  ✅ Template showcase & promotion                    │
│  ✅ "Open in Desktop App" deep links                 │
│  ✅ Static Site Generation for performance           │
└─────────────────────┬────────────────────────────────┘
                      │
                      │ API Calls
                      ↓
┌──────────────────────────────────────────────────────┐
│      Python Backend (FastAPI) - Single API           │
│      https://api.smartspec.ai                        │
│                                                       │
│  ✅ Marketplace APIs (CRUD, Purchase, Download)      │
│  ✅ Authentication & Authorization                   │
│  ✅ Credit Management (85/15 split)                  │
│  ✅ Template Storage (R2/S3)                         │
│  ✅ Admin Review System                              │
└─────────────────────┬────────────────────────────────┘
                      ↑
                      │ API Calls
                      │
┌──────────────────────────────────────────────────────┐
│         Desktop App (Tauri) - Power User             │
│                                                       │
│  ✅ Full marketplace browser                         │
│  ✅ Template purchasing with credits                 │
│  ✅ Template download & import                       │
│  ✅ Project management                               │
│  ✅ Template merging with existing code              │
└──────────────────────────────────────────────────────┘
```

---

## 🎯 การทำงานของแต่ละส่วน

### 1. SmartSpecWeb (Marketing Frontend)

**Purpose:**
- เว็บไซต์สาธารณะสำหรับการค้นหาและโปรโมท templates
- SEO-friendly pages ให้ Google index ได้
- Landing page สำหรับ marketing campaigns

**Key Features:**
- 📄 **Static Site Generation (SSG)** - Pre-render pages สำหรับ SEO
- 🔍 **Public Browse** - ดู templates ได้โดยไม่ต้อง login
- 🔗 **Deep Links** - เปิดใน Desktop App ผ่าน `smartspec://` protocol
- 📊 **Analytics** - Track views, clicks, conversions
- 🎨 **Showcase** - Featured templates, categories, trending

**User Flow:**
1. User ค้นหาใน Google → เจอ template page
2. เข้ามาดูรายละเอียดบนเว็บ
3. กดปุ่ม "Open in Desktop App"
4. Desktop App เปิดขึ้นมาที่หน้า template นั้นเลย
5. User purchase และ download ผ่าน Desktop App

**Routes:**
- `/marketplace` - Homepage with browse & search
- `/marketplace/[slug]` - Individual template pages (SEO-optimized)
- `/marketplace/category/[category]` - Category pages
- `/marketplace/creator/[id]` - Creator profile pages

---

### 2. Python Backend (Unified API)

**Purpose:**
- API เดียวที่ให้บริการทั้ง Web และ Desktop App
- จัดการ business logic ทั้งหมด
- Single source of truth สำหรับข้อมูล

**Endpoints:**
```
GET  /api/v1/marketplace/templates          # Browse (Web + Desktop)
GET  /api/v1/marketplace/templates/{id}     # Details (Web + Desktop)
POST /api/v1/marketplace/templates/{id}/purchase   # Purchase (Desktop only - requires auth)
GET  /api/v1/marketplace/purchases/{id}/download   # Download (Desktop only - requires auth)
```

**Why Single API?**
- ✅ Consistent data across platforms
- ✅ Easier to maintain
- ✅ Single deployment
- ✅ Shared caching
- ✅ Unified analytics

---

### 3. Desktop App (Power User Interface)

**Purpose:**
- ซื้อ, ดาวน์โหลด, และ import templates
- จัดการ projects
- Development environment

**Features:**
- 💳 **Purchase Flow** - จ่ายด้วย credits, ได้ ZIP file
- 📥 **Download Management** - Track downloads, re-download any time
- 🔀 **Template Import** - Extract และ merge กับ project existing
- 🎨 **Project Integration** - ใช้ template ร่วมกับ code ของตัวเอง
- 📊 **Purchase History** - ดูประวัติการซื้อทั้งหมด

---

## 🌐 Deep Linking System

Desktop App รองรับ **deep links** เพื่อเชื่อมต่อจาก Web:

### Protocol: `smartspec://`

**Examples:**
```bash
# เปิด marketplace
smartspec://marketplace

# เปิด template details
smartspec://marketplace/template/{template_id}

# เปิด category
smartspec://marketplace/category/image_generation

# เปิด purchase page
smartspec://marketplace/purchase/{template_id}
```

### Implementation (Desktop App)

**File:** `desktop-app/src-tauri/src/main.rs`

```rust
use tauri::Manager;

#[tauri::command]
fn handle_deep_link(url: String) {
    // Parse smartspec:// URL
    if url.starts_with("smartspec://marketplace") {
        // Navigate to marketplace
    }
}
```

### Implementation (Web)

**Example:**
```tsx
// Open in Desktop App button
<button onClick={() => {
  window.location.href = `smartspec://marketplace/template/${templateId}`;
}}>
  Open in Desktop App
</button>
```

**Fallback:**
```tsx
// Check if Desktop App is installed
const isDesktopAppInstalled = async () => {
  try {
    const response = await fetch('http://localhost:8080/health');
    return response.ok;
  } catch {
    return false;
  }
};

// Smart button
const handleOpenInApp = async () => {
  if (await isDesktopAppInstalled()) {
    // Open in Desktop App
    window.location.href = `smartspec://marketplace/template/${templateId}`;
  } else {
    // Show download modal
    showDownloadModal();
  }
};
```

---

## 📊 Data Flow Examples

### Example 1: User Discovers Template via Google

```
1. Google Search: "image generation template"
   ↓
2. Clicks result → SmartSpecWeb
   URL: marketplace.smartspec.ai/marketplace/image-gen-pro
   ↓
3. Reads description, sees screenshots
   ↓
4. Clicks "Open in Desktop App"
   Deep Link: smartspec://marketplace/template/abc123
   ↓
5. Desktop App opens → Shows template details
   ↓
6. User clicks "Purchase" → Pays with credits
   API Call: POST /api/v1/marketplace/templates/abc123/purchase
   ↓
7. Desktop App downloads ZIP
   API Call: GET /api/v1/marketplace/purchases/xyz789/download
   ↓
8. User imports template into project
   Local Operation: Extract ZIP, merge files
```

### Example 2: User Browses in Desktop App

```
1. User opens Desktop App
   ↓
2. Navigates to Marketplace tab
   API Call: GET /api/v1/marketplace/templates
   ↓
3. Filters by category "Video Generation"
   API Call: GET /api/v1/marketplace/templates?category=video_generation
   ↓
4. Clicks template to view details
   API Call: GET /api/v1/marketplace/templates/def456
   ↓
5. Purchases template
   API Call: POST /api/v1/marketplace/templates/def456/purchase
   ↓
6. Downloads and imports
   API Call: GET /api/v1/marketplace/purchases/xyz123/download
```

---

## 🎨 Web Pages Created

### 1. Marketplace Homepage
**File:** `SmartSpecWeb/pages/marketplace/index.tsx`

**Features:**
- Hero section with CTA
- Featured templates carousel
- Category filters
- Search functionality
- Sort options (popular, recent, rating, price)
- Grid view of all templates
- Responsive design

**SEO:**
```html
<title>SmartSpec Marketplace - Discover Templates</title>
<meta name="description" content="Browse premium templates..." />
<meta property="og:image" content="/og-marketplace.jpg" />
```

### 2. Template Detail Pages
**File:** `SmartSpecWeb/pages/marketplace/[slug].tsx`

**Features:**
- Full template description
- Preview images/video
- Tech stack badges
- Pricing with revenue split
- Purchase CTA
- Related templates
- README documentation
- Statistics (purchases, views, rating)

**SEO:**
```html
<title>{templateName} - SmartSpec Marketplace</title>
<meta name="description" content={template.tagline} />
<meta name="keywords" content={template.tags.join(', ')} />
```

**Static Generation:**
- Pre-renders all template pages at build time
- Revalidates every 60 seconds
- Fallback to on-demand generation for new templates

---

## 🚀 Deployment Guide

### 1. Backend API

```bash
# Production
uvicorn app.main:app --host 0.0.0.0 --port 8080

# Environment variables
API_URL=https://api.smartspec.ai
DATABASE_URL=postgresql://...
R2_BUCKET=smartspec-templates
```

### 2. SmartSpecWeb

```bash
# Build for production
cd SmartSpecWeb
npm run build

# Deploy to Vercel
vercel --prod

# Environment variables
NEXT_PUBLIC_API_URL=https://api.smartspec.ai
```

### 3. Desktop App

```bash
# Build
cd desktop-app
npm run tauri build

# Configure deep link handler
# Register smartspec:// protocol with OS
```

---

## 🔐 Security Considerations

### 1. API Authentication

**Web (Public):**
- Browse templates: No auth required
- View details: No auth required
- **Purpose:** Allow Google to crawl and index

**Desktop (Authenticated):**
- Purchase: Requires Bearer token
- Download: Requires Bearer token + ownership check
- **Purpose:** Protect paid content

### 2. Deep Link Validation

```typescript
// Desktop App validates deep link origins
const validateDeepLink = (url: string) => {
  const allowedOrigins = [
    'https://marketplace.smartspec.ai',
    'https://smartspec.ai',
  ];

  const origin = new URL(url).origin;
  return allowedOrigins.includes(origin);
};
```

### 3. Content Protection

- ZIP files stored in private R2 bucket
- Signed URLs with expiration (1 hour)
- Download tracking per purchase
- Prevent unauthorized sharing

---

## 📈 Analytics & Tracking

### Web Analytics
```typescript
// Track template views
gtag('event', 'template_view', {
  template_id: template.id,
  template_name: template.name,
  source: 'web'
});

// Track deep link clicks
gtag('event', 'open_in_app', {
  template_id: template.id,
  source: 'marketplace_web'
});
```

### API Analytics
```python
# Track in backend
logger.info(
    "template_viewed",
    template_id=template_id,
    source=request.headers.get("Referer"),
    user_agent=request.headers.get("User-Agent")
)
```

---

## ✅ Implementation Checklist

### Backend
- [x] Marketplace API endpoints
- [x] Credit distribution (85/15)
- [x] Purchase flow
- [x] Download with signed URLs
- [ ] Alembic migration
- [ ] Deploy to production

### Web Frontend
- [x] Marketplace homepage
- [x] Template detail pages
- [x] Deep link integration
- [x] SEO optimization
- [ ] Deploy to Vercel
- [ ] Setup domain (marketplace.smartspec.ai)
- [ ] Add Google Analytics
- [ ] Submit sitemap to Google

### Desktop App
- [x] Marketplace browser UI (existing)
- [x] Purchase flow (existing)
- [ ] Deep link handler
- [ ] Template import/merge system
- [ ] Download management

### Testing
- [ ] Test deep links work
- [ ] Test purchase flow end-to-end
- [ ] Test SEO (Google Search Console)
- [ ] Test download & import
- [ ] Test analytics tracking

---

## 🎊 Summary

**ตอบคำถาม:**

### 1. Desktop app ดึงข้อมูล marketplace จาก web กลางหรือไม่?

**ตอบ:** ไม่ครับ! Desktop App ดึงข้อมูลโดยตรงจาก **Python Backend API** เหมือนกับ Web

```
Desktop App ──→ Python Backend API ←── SmartSpecWeb
                (Single Source of Truth)
```

### 2. บน web SmartSpecWeb มีแสดง marketplace เพื่อโปรโมทหรือไม่?

**ตอบ:** **ใช่ครับ!** เพิ่งสร้างไปแล้ว 2 หน้า:

1. **Marketplace Homepage** (`/marketplace`)
   - Browse & search templates
   - Featured section
   - Categories & filters
   - SEO-optimized

2. **Template Detail Pages** (`/marketplace/[slug]`)
   - Individual pages for each template
   - Static Site Generation for SEO
   - Google can index and rank
   - Users can discover via search

**จุดประสงค์:**
- 🎯 **Marketing** - ให้คนค้นหาเจอทาง Google
- 📈 **SEO** - Rank ใน search results
- 🔗 **Deep Links** - ส่งต่อไป Desktop App สำหรับซื้อ
- 🌐 **Public Access** - ดูได้โดยไม่ต้อง install app

**Best of Both Worlds!** 🚀
