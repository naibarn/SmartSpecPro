# Multi-modal Generation System Architecture

## Overview

ระบบ Multi-modal Generation สำหรับ SmartSpec Pro รองรับการสร้าง:
- **รูปภาพ (Image)** - ผ่าน kie.ai providers
- **วีดีโอ (Video)** - ผ่าน kie.ai providers
- **เสียง (Audio)** - ผ่าน ElevenLabs via kie.ai

## Storage: Cloudflare R2

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare R2 Storage                     │
├─────────────────────────────────────────────────────────────┤
│  Bucket: smartspec-media                                     │
│  ├── images/                                                 │
│  │   ├── generated/{user_id}/{task_id}.{ext}                │
│  │   ├── gallery/{gallery_id}/{image_id}.{ext}              │
│  │   └── thumbnails/{size}/{image_id}.{ext}                 │
│  ├── videos/                                                 │
│  │   ├── generated/{user_id}/{task_id}.{ext}                │
│  │   ├── gallery/{gallery_id}/{video_id}.{ext}              │
│  │   └── thumbnails/{video_id}.jpg                          │
│  └── audio/                                                  │
│      └── generated/{user_id}/{task_id}.{ext}                │
└─────────────────────────────────────────────────────────────┘
```

## API Providers (kie.ai)

### Image Generation Models

| Model ID | Provider | Features | Pricing |
|----------|----------|----------|---------|
| `nano-banana-pro` | Google Gemini 3.0 | 2K/4K, text rendering | $0.09-0.12 |
| `z-image` | TBD | TBD | TBD |
| `seedream-4-5` | ByteDance | High quality | TBD |
| `flux-2` | Black Forest Labs | Photorealistic | TBD |

### Video Generation Models

| Model ID | Provider | Features | Pricing |
|----------|----------|----------|---------|
| `wan/2-6-text-to-video` | Alibaba | T2V, 5-15s, 720p/1080p | $0.35-1.58 |
| `wan/2-6-image-to-video` | Alibaba | I2V | TBD |
| `seedance-1-5-pro` | ByteDance | Dance generation | TBD |
| `sora-2-pro-storyboard` | OpenAI | Storyboard | TBD |
| `veo-3-1` | Google | High quality | TBD |
| `sora-2-pro` | OpenAI | General video | TBD |
| `infinitalk` | TBD | Talking head | TBD |

### Audio Generation Models

| Model ID | Provider | Features | Pricing |
|----------|----------|----------|---------|
| `elevenlabs/text-to-speech-turbo-2-5` | ElevenLabs | TTS, multi-voice | $0.03/1000 chars |
| `elevenlabs/sound-effect` | ElevenLabs | SFX generation | TBD |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           SmartSpec Pro                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │
│  │   Desktop App   │  │    Web App      │  │  Admin Panel    │          │
│  │   (Chat UI)     │  │   (Gallery)     │  │  (Management)   │          │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘          │
│           │                    │                    │                    │
│           └────────────────────┼────────────────────┘                    │
│                                │                                         │
│                                ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                      FastAPI Backend                             │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │    │
│  │  │ Generation  │  │   Gallery   │  │   Storage   │              │    │
│  │  │   Router    │  │   Router    │  │   Router    │              │    │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │    │
│  │         │                │                │                      │    │
│  │         ▼                ▼                ▼                      │    │
│  │  ┌─────────────────────────────────────────────────────────┐    │    │
│  │  │                   Service Layer                          │    │    │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │    │    │
│  │  │  │ Generation  │  │   Gallery   │  │   R2        │      │    │    │
│  │  │  │  Service    │  │   Service   │  │   Service   │      │    │    │
│  │  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘      │    │    │
│  │  │         │                │                │              │    │    │
│  │  │         ▼                │                │              │    │    │
│  │  │  ┌─────────────┐         │                │              │    │    │
│  │  │  │ KieAI       │         │                │              │    │    │
│  │  │  │ Provider    │         │                │              │    │    │
│  │  │  │ (Unified)   │         │                │              │    │    │
│  │  │  └──────┬──────┘         │                │              │    │    │
│  │  └─────────┼────────────────┼────────────────┼──────────────┘    │    │
│  └────────────┼────────────────┼────────────────┼───────────────────┘    │
│               │                │                │                        │
└───────────────┼────────────────┼────────────────┼────────────────────────┘
                │                │                │
                ▼                ▼                ▼
┌───────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│     kie.ai        │  │   PostgreSQL    │  │  Cloudflare R2  │
│     APIs          │  │   (metadata)    │  │  (media files)  │
└───────────────────┘  └─────────────────┘  └─────────────────┘
```

---

## Database Schema

### Generation Tasks

```sql
CREATE TABLE generation_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    task_type VARCHAR(20) NOT NULL, -- 'image', 'video', 'audio'
    model_id VARCHAR(100) NOT NULL,
    provider VARCHAR(50) DEFAULT 'kie.ai',
    
    -- Input
    prompt TEXT NOT NULL,
    input_params JSONB DEFAULT '{}',
    reference_files TEXT[], -- R2 URLs for input images/videos
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed
    external_task_id VARCHAR(100), -- kie.ai task ID
    
    -- Output
    output_url TEXT, -- R2 URL
    output_metadata JSONB DEFAULT '{}',
    
    -- Metrics
    credits_used DECIMAL(10,2) DEFAULT 0,
    processing_time_ms INTEGER,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    
    -- Indexes
    INDEX idx_generation_tasks_user (user_id),
    INDEX idx_generation_tasks_status (status),
    INDEX idx_generation_tasks_type (task_type)
);
```

### Gallery Items

```sql
CREATE TABLE gallery_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    generation_task_id UUID REFERENCES generation_tasks(id),
    
    -- Content
    title VARCHAR(255) NOT NULL,
    description TEXT,
    media_type VARCHAR(20) NOT NULL, -- 'image', 'video'
    media_url TEXT NOT NULL, -- R2 URL
    thumbnail_url TEXT,
    
    -- SEO
    slug VARCHAR(255) UNIQUE NOT NULL,
    meta_title VARCHAR(255),
    meta_description TEXT,
    keywords TEXT[],
    
    -- Display
    is_featured BOOLEAN DEFAULT FALSE,
    is_public BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    
    -- Stats
    view_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    
    -- Admin
    created_by UUID REFERENCES users(id),
    approved_at TIMESTAMP,
    approved_by UUID REFERENCES users(id),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Indexes
    INDEX idx_gallery_items_slug (slug),
    INDEX idx_gallery_items_public (is_public, is_featured),
    INDEX idx_gallery_items_type (media_type)
);
```

### Gallery Categories

```sql
CREATE TABLE gallery_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    parent_id UUID REFERENCES gallery_categories(id),
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE gallery_item_categories (
    gallery_item_id UUID REFERENCES gallery_items(id) ON DELETE CASCADE,
    category_id UUID REFERENCES gallery_categories(id) ON DELETE CASCADE,
    PRIMARY KEY (gallery_item_id, category_id)
);
```

---

## API Endpoints

### Generation API

```
POST /api/v1/generation/image
POST /api/v1/generation/video
POST /api/v1/generation/audio
GET  /api/v1/generation/tasks/{task_id}
GET  /api/v1/generation/tasks/{task_id}/status
GET  /api/v1/generation/history
DELETE /api/v1/generation/tasks/{task_id}
```

### Gallery API (Public)

```
GET  /api/v1/gallery                    # List gallery items (paginated)
GET  /api/v1/gallery/{slug}             # Get single item by slug
GET  /api/v1/gallery/featured           # Featured items
GET  /api/v1/gallery/categories         # List categories
GET  /api/v1/gallery/categories/{slug}  # Items in category
GET  /api/v1/gallery/search             # Search items
```

### Admin Gallery API

```
POST   /api/v1/admin/gallery            # Create gallery item
PUT    /api/v1/admin/gallery/{id}       # Update item
DELETE /api/v1/admin/gallery/{id}       # Delete item
POST   /api/v1/admin/gallery/{id}/approve  # Approve item
POST   /api/v1/admin/gallery/{id}/feature  # Feature item
POST   /api/v1/admin/gallery/generate   # Generate and add to gallery
```

### Storage API

```
POST /api/v1/storage/upload             # Upload file to R2
GET  /api/v1/storage/presigned-url      # Get presigned URL for upload
DELETE /api/v1/storage/{key}            # Delete file from R2
```

---

## Provider Models Registry

```python
# app/services/generation/models.py

from enum import Enum
from typing import Dict, List, Optional
from pydantic import BaseModel

class MediaType(str, Enum):
    IMAGE = "image"
    VIDEO = "video"
    AUDIO = "audio"

class GenerationModel(BaseModel):
    """Model configuration for generation providers."""
    id: str
    name: str
    provider: str
    media_type: MediaType
    description: str
    
    # Capabilities
    supports_image_input: bool = False
    supports_video_input: bool = False
    max_prompt_length: int = 5000
    
    # Options
    aspect_ratios: Optional[List[str]] = None
    resolutions: Optional[List[str]] = None
    durations: Optional[List[int]] = None  # seconds for video
    output_formats: Optional[List[str]] = None
    
    # Pricing (credits per generation)
    base_credits: float
    pricing_tiers: Optional[Dict[str, float]] = None
    
    # Status
    is_active: bool = True
    is_beta: bool = False


# Image Models
IMAGE_MODELS = {
    "nano-banana-pro": GenerationModel(
        id="nano-banana-pro",
        name="Nano Banana Pro",
        provider="kie.ai",
        media_type=MediaType.IMAGE,
        description="Google Gemini 3.0 Pro - Sharp 2K/4K imagery with text rendering",
        supports_image_input=True,
        max_prompt_length=20000,
        aspect_ratios=["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9", "auto"],
        resolutions=["1K", "2K", "4K"],
        output_formats=["png", "jpg"],
        base_credits=18,
        pricing_tiers={"1K": 18, "2K": 18, "4K": 24},
    ),
    "z-image": GenerationModel(
        id="z-image",
        name="Z-Image",
        provider="kie.ai",
        media_type=MediaType.IMAGE,
        description="Z-Image generation model",
        base_credits=20,
        is_beta=True,
    ),
    "seedream-4-5": GenerationModel(
        id="seedream-4-5",
        name="Seedream 4.5",
        provider="kie.ai",
        media_type=MediaType.IMAGE,
        description="ByteDance Seedream - High quality image generation",
        base_credits=25,
        is_beta=True,
    ),
    "flux-2": GenerationModel(
        id="flux-2",
        name="FLUX 2",
        provider="kie.ai",
        media_type=MediaType.IMAGE,
        description="Black Forest Labs FLUX 2 - Photorealistic images",
        base_credits=30,
        is_beta=True,
    ),
}

# Video Models
VIDEO_MODELS = {
    "wan/2-6-text-to-video": GenerationModel(
        id="wan/2-6-text-to-video",
        name="Wan 2.6 Text-to-Video",
        provider="kie.ai",
        media_type=MediaType.VIDEO,
        description="Alibaba Wan 2.6 - Multi-shot HD video with native audio",
        max_prompt_length=5000,
        resolutions=["720p", "1080p"],
        durations=[5, 10, 15],
        base_credits=70,
        pricing_tiers={
            "720p-5s": 70, "720p-10s": 140, "720p-15s": 209.5,
            "1080p-5s": 104.5, "1080p-10s": 209.5, "1080p-15s": 315,
        },
    ),
    "wan/2-6-image-to-video": GenerationModel(
        id="wan/2-6-image-to-video",
        name="Wan 2.6 Image-to-Video",
        provider="kie.ai",
        media_type=MediaType.VIDEO,
        description="Alibaba Wan 2.6 - Image to video generation",
        supports_image_input=True,
        base_credits=70,
    ),
    "seedance-1-5-pro": GenerationModel(
        id="seedance-1-5-pro",
        name="Seedance 1.5 Pro",
        provider="kie.ai",
        media_type=MediaType.VIDEO,
        description="ByteDance Seedance - Dance video generation",
        base_credits=100,
        is_beta=True,
    ),
    "sora-2-pro-storyboard": GenerationModel(
        id="sora-2-pro-storyboard",
        name="Sora 2 Pro Storyboard",
        provider="kie.ai",
        media_type=MediaType.VIDEO,
        description="OpenAI Sora 2 - Storyboard video generation",
        base_credits=200,
        is_beta=True,
    ),
    "veo-3-1": GenerationModel(
        id="veo-3-1",
        name="Veo 3.1",
        provider="kie.ai",
        media_type=MediaType.VIDEO,
        description="Google Veo 3.1 - High quality video generation",
        base_credits=150,
        is_beta=True,
    ),
    "sora-2-pro": GenerationModel(
        id="sora-2-pro",
        name="Sora 2 Pro",
        provider="kie.ai",
        media_type=MediaType.VIDEO,
        description="OpenAI Sora 2 Pro - General video generation",
        base_credits=200,
        is_beta=True,
    ),
    "infinitalk": GenerationModel(
        id="infinitalk",
        name="Infinitalk",
        provider="kie.ai",
        media_type=MediaType.VIDEO,
        description="Talking head video generation",
        base_credits=80,
        is_beta=True,
    ),
}

# Audio Models
AUDIO_MODELS = {
    "elevenlabs/text-to-speech-turbo-2-5": GenerationModel(
        id="elevenlabs/text-to-speech-turbo-2-5",
        name="ElevenLabs TTS Turbo 2.5",
        provider="kie.ai",
        media_type=MediaType.AUDIO,
        description="ElevenLabs Text-to-Speech - Human-like voices",
        max_prompt_length=10000,
        output_formats=["mp3", "wav"],
        base_credits=12,  # per 1000 characters
    ),
    "elevenlabs/sound-effect": GenerationModel(
        id="elevenlabs/sound-effect",
        name="ElevenLabs Sound Effect",
        provider="kie.ai",
        media_type=MediaType.AUDIO,
        description="ElevenLabs Sound Effect generation",
        base_credits=20,
        is_beta=True,
    ),
}

# Combined registry
ALL_MODELS = {**IMAGE_MODELS, **VIDEO_MODELS, **AUDIO_MODELS}

def get_model(model_id: str) -> Optional[GenerationModel]:
    """Get model by ID."""
    return ALL_MODELS.get(model_id)

def get_models_by_type(media_type: MediaType) -> Dict[str, GenerationModel]:
    """Get all models of a specific type."""
    return {k: v for k, v in ALL_MODELS.items() if v.media_type == media_type}

def get_active_models() -> Dict[str, GenerationModel]:
    """Get all active models."""
    return {k: v for k, v in ALL_MODELS.items() if v.is_active}
```

---

## SEO/ASO Strategy for Public Gallery

### URL Structure

```
/gallery                           # Main gallery page
/gallery/images                    # Image gallery
/gallery/videos                    # Video gallery
/gallery/category/{slug}           # Category page
/gallery/{slug}                    # Single item page
```

### Meta Tags

```html
<!-- Single Item Page -->
<title>{title} | SmartSpec Gallery</title>
<meta name="description" content="{description}">
<meta name="keywords" content="{keywords}">

<!-- Open Graph -->
<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">
<meta property="og:image" content="{thumbnail_url}">
<meta property="og:type" content="article">
<meta property="og:url" content="https://smartspec.app/gallery/{slug}">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{description}">
<meta name="twitter:image" content="{thumbnail_url}">

<!-- Structured Data (JSON-LD) -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "ImageObject",
  "name": "{title}",
  "description": "{description}",
  "contentUrl": "{media_url}",
  "thumbnailUrl": "{thumbnail_url}",
  "datePublished": "{created_at}",
  "author": {
    "@type": "Organization",
    "name": "SmartSpec"
  }
}
</script>
```

### Sitemap Generation

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
  <url>
    <loc>https://smartspec.app/gallery/{slug}</loc>
    <lastmod>{updated_at}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
    <image:image>
      <image:loc>{media_url}</image:loc>
      <image:title>{title}</image:title>
      <image:caption>{description}</image:caption>
    </image:image>
  </url>
</urlset>
```

---

## Implementation Phases

### Phase 1: Core Infrastructure
- [ ] Cloudflare R2 service integration
- [ ] KieAI provider base class
- [ ] Database migrations
- [ ] Basic generation endpoints

### Phase 2: Image Generation
- [ ] Nano Banana Pro integration
- [ ] Image upload/download flow
- [ ] Thumbnail generation
- [ ] Desktop chat integration

### Phase 3: Video Generation
- [ ] Wan 2.6 integration
- [ ] Video processing pipeline
- [ ] Progress tracking

### Phase 4: Audio Generation
- [ ] ElevenLabs TTS integration
- [ ] Audio file handling

### Phase 5: Public Gallery
- [ ] Gallery frontend (React)
- [ ] SEO optimization
- [ ] Sitemap generation
- [ ] Social sharing

### Phase 6: Admin Panel
- [ ] Gallery management UI
- [ ] Content moderation
- [ ] Analytics dashboard

---

## Environment Variables

```env
# Cloudflare R2
CLOUDFLARE_R2_ACCESS_KEY_ID=
CLOUDFLARE_R2_SECRET_ACCESS_KEY=
CLOUDFLARE_R2_BUCKET_NAME=smartspec-media
CLOUDFLARE_R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
CLOUDFLARE_R2_PUBLIC_URL=https://media.smartspec.app

# kie.ai
KIE_AI_API_KEY=
KIE_AI_BASE_URL=https://api.kie.ai/api/v1/jobs

# Feature Flags
ENABLE_IMAGE_GENERATION=true
ENABLE_VIDEO_GENERATION=true
ENABLE_AUDIO_GENERATION=true
ENABLE_PUBLIC_GALLERY=true
```
