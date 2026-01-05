# SmartSpec Pro - Multi-modal Generation System

## Overview

SmartSpec Pro's Multi-modal Generation System provides a comprehensive solution for generating AI-powered images, videos, and audio content. The system is designed as a **template/SDK** that users can easily integrate into their own SaaS applications, websites, or mobile apps.

## Key Features

### 1. Multi-modal Content Generation
- **Image Generation**: Nano Banana Pro, FLUX 2, and other models
- **Video Generation**: Wan 2.6 text-to-video
- **Audio/Speech**: ElevenLabs TTS with multiple voices

### 2. Secure Key Management
- Encrypted API key storage using Fernet encryption
- Environment-based configuration
- Secure key rotation support
- Per-user API key management

### 3. Template SDK System
- Ready-to-use SDK templates for:
  - Python applications
  - JavaScript/TypeScript projects
  - React applications with hooks
- Automatic code generation with user's API keys

### 4. Public Gallery with SEO
- Community gallery for sharing generated content
- SEO-optimized URLs and meta tags
- XML sitemap generation
- Social sharing support

### 5. Admin Moderation Panel
- Content moderation workflow
- Featured content management
- Bulk actions support
- Analytics dashboard

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Frontend (Desktop App)                      │
├─────────────────────────────────────────────────────────────────┤
│  GenerationPanel  │  PublicGallery  │  SDKCodeViewer  │  Admin  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Backend API (FastAPI)                       │
├─────────────────────────────────────────────────────────────────┤
│  /api/generation/*  │  /api/gallery/*  │  /api/admin/gallery/*  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Services Layer                            │
├─────────────────────────────────────────────────────────────────┤
│  GenerationService  │  KeyManagement  │  R2Storage  │  KieProvider│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      External Services                           │
├─────────────────────────────────────────────────────────────────┤
│     kie.ai API      │   Cloudflare R2   │     Database          │
└─────────────────────────────────────────────────────────────────┘
```

## API Reference

### Generation Endpoints

#### Start Generation Task
```http
POST /api/generation/generate
Authorization: Bearer <token>
Content-Type: application/json

{
  "task_type": "image",
  "model_id": "kie-ai/nano-banana-pro",
  "prompt": "A beautiful sunset over mountains",
  "parameters": {
    "width": 1024,
    "height": 1024,
    "num_images": 1
  }
}
```

#### Get Task Status
```http
GET /api/generation/tasks/{task_id}
Authorization: Bearer <token>
```

#### List Available Models
```http
GET /api/generation/models
Authorization: Bearer <token>
```

### Gallery Endpoints

#### List Public Gallery
```http
GET /api/gallery?page=1&page_size=20&category=landscape&sort_by=trending
```

#### Share to Gallery
```http
POST /api/gallery
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "My Amazing Image",
  "description": "Generated with AI",
  "generation_task_id": "task_123",
  "category": "landscape",
  "tags": ["nature", "sunset"],
  "visibility": "public"
}
```

#### Like/Unlike Item
```http
POST /api/gallery/item/{item_id}/like
Authorization: Bearer <token>
```

### SDK Endpoints

#### Get SDK Code
```http
GET /api/generation/sdk/{language}?include_api_key=true
Authorization: Bearer <token>
```

Supported languages: `python`, `javascript`, `react`

## SDK Integration Guide

### Python SDK

```python
from smartspec_client import SmartSpecClient

# Initialize client
client = SmartSpecClient(
    api_key="your_api_key",
    base_url="https://api.smartspec.pro"
)

# Generate image
result = client.generate_image(
    prompt="A futuristic city at night",
    model="nano-banana-pro",
    width=1024,
    height=1024
)

print(f"Image URL: {result['output_url']}")
```

### JavaScript/TypeScript SDK

```typescript
import { SmartSpecClient } from './smartspec-client';

const client = new SmartSpecClient({
  apiKey: 'your_api_key',
  baseUrl: 'https://api.smartspec.pro'
});

// Generate image
const result = await client.generateImage({
  prompt: 'A futuristic city at night',
  model: 'nano-banana-pro',
  width: 1024,
  height: 1024
});

console.log('Image URL:', result.outputUrl);
```

### React Hook

```tsx
import { useSmartSpec } from './useSmartSpec';

function ImageGenerator() {
  const { generateImage, loading, error, result } = useSmartSpec({
    apiKey: 'your_api_key'
  });

  const handleGenerate = async () => {
    await generateImage({
      prompt: 'A beautiful landscape',
      model: 'nano-banana-pro'
    });
  };

  return (
    <div>
      <button onClick={handleGenerate} disabled={loading}>
        {loading ? 'Generating...' : 'Generate Image'}
      </button>
      {result && <img src={result.outputUrl} alt="Generated" />}
      {error && <p>Error: {error}</p>}
    </div>
  );
}
```

## Security Best Practices

### API Key Management

1. **Never expose API keys in client-side code**
   - Use server-side proxying for production
   - Store keys in environment variables

2. **Use encrypted storage**
   ```python
   from app.services.generation.key_management import SecureKeyManager
   
   key_manager = SecureKeyManager()
   encrypted = key_manager.encrypt_key("your_api_key")
   decrypted = key_manager.decrypt_key(encrypted)
   ```

3. **Implement key rotation**
   - Regularly rotate API keys
   - Use the admin panel to manage keys

### Rate Limiting

The system implements rate limiting:
- 100 requests per minute for authenticated users
- 10 requests per minute for anonymous users

### Content Moderation

All public gallery content goes through:
1. Automatic NSFW detection
2. Manual review queue for flagged content
3. Community reporting system

## Storage Configuration

### Cloudflare R2 Setup

1. Create R2 bucket in Cloudflare dashboard
2. Generate API tokens with read/write access
3. Configure environment variables:

```env
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=smartspec-media
R2_PUBLIC_URL=https://media.smartspec.pro
```

### Storage Structure

```
smartspec-media/
├── generations/
│   ├── images/
│   │   └── {user_id}/{task_id}.{ext}
│   ├── videos/
│   │   └── {user_id}/{task_id}.mp4
│   └── audio/
│       └── {user_id}/{task_id}.mp3
├── thumbnails/
│   └── {task_id}_thumb.jpg
└── gallery/
    └── {item_id}/
        ├── original.{ext}
        └── thumbnail.jpg
```

## Database Schema

### Generation Tasks Table

```sql
CREATE TABLE generation_tasks (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    task_type VARCHAR(20) NOT NULL,
    model_id VARCHAR(100) NOT NULL,
    model_name VARCHAR(200),
    prompt TEXT NOT NULL,
    parameters JSONB,
    status VARCHAR(20) DEFAULT 'pending',
    progress INTEGER DEFAULT 0,
    output_url TEXT,
    thumbnail_url TEXT,
    error_message TEXT,
    credits_used DECIMAL(10,4) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP,
    completed_at TIMESTAMP
);
```

### Gallery Items Table

```sql
CREATE TABLE gallery_items (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    generation_task_id UUID REFERENCES generation_tasks(id),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    media_type VARCHAR(20) NOT NULL,
    media_url TEXT NOT NULL,
    thumbnail_url TEXT,
    prompt TEXT NOT NULL,
    model_id VARCHAR(100),
    model_name VARCHAR(200),
    category VARCHAR(50) DEFAULT 'other',
    tags TEXT[],
    visibility VARCHAR(20) DEFAULT 'public',
    slug VARCHAR(100) UNIQUE,
    meta_title VARCHAR(200),
    meta_description TEXT,
    likes_count INTEGER DEFAULT 0,
    views_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    is_featured BOOLEAN DEFAULT FALSE,
    is_approved BOOLEAN DEFAULT FALSE,
    is_nsfw BOOLEAN DEFAULT FALSE,
    featured_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP
);
```

## SEO Optimization

### Meta Tags

Each gallery item includes:
- Open Graph tags for social sharing
- Twitter Card support
- Structured data (JSON-LD)

### URL Structure

```
/gallery                          # Main gallery page
/gallery/{slug}                   # Individual item page
/gallery/category/{category}      # Category listing
/gallery/tag/{tag}                # Tag listing
/gallery/user/{username}          # User's gallery
```

### Sitemap

Auto-generated sitemap at `/gallery/sitemap.xml`:
- Updated daily
- Includes all public gallery items
- Image sitemap extension for better indexing

## Deployment

### Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/smartspec

# kie.ai API
KIE_AI_API_KEY=your_kie_api_key

# Cloudflare R2
R2_ACCOUNT_ID=xxx
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET_NAME=smartspec-media
R2_PUBLIC_URL=https://media.smartspec.pro

# Encryption
ENCRYPTION_KEY=your_32_byte_key

# Redis (for task queue)
REDIS_URL=redis://localhost:6379
```

### Docker Deployment

```yaml
version: '3.8'
services:
  api:
    build: ./python-backend
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - KIE_AI_API_KEY=${KIE_AI_API_KEY}
    ports:
      - "8000:8000"
    
  worker:
    build: ./python-backend
    command: celery -A app.worker worker -l info
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
```

## Support

For issues and feature requests, please contact:
- Email: support@smartspec.pro
- GitHub: https://github.com/smartspec/smartspec-pro
