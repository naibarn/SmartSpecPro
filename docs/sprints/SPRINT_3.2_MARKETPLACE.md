# Sprint 3.2: Marketplace

**Duration:** 2 สัปดาห์ (10-14 วันทำงาน)  
**Priority:** High  
**Dependencies:** Sprint 3.1 (Plugin System)  

---

## 🎯 Sprint Goal

สร้าง Marketplace ที่ช่วยให้:
1. ค้นหาและติดตั้ง templates และ plugins
2. แชร์ templates และ plugins กับ community
3. ให้คะแนนและรีวิว
4. จัดการ versions และ updates

---

## 📋 User Stories

### US-3.2.1: Browse Marketplace
> **As a** user  
> **I want** to browse marketplace for templates and plugins  
> **So that** I can find useful extensions

**Acceptance Criteria:**
- [ ] Browse templates by category
- [ ] Browse plugins by category
- [ ] Search functionality
- [ ] Filter and sort
- [ ] View details

### US-3.2.2: Install from Marketplace
> **As a** user  
> **I want** to install templates/plugins from marketplace  
> **So that** I can extend SmartSpecPro

**Acceptance Criteria:**
- [ ] One-click install
- [ ] Version selection
- [ ] Dependency resolution
- [ ] Progress indicator
- [ ] Install confirmation

### US-3.2.3: Publish to Marketplace
> **As a** developer  
> **I want** to publish my templates/plugins  
> **So that** others can use them

**Acceptance Criteria:**
- [ ] Publish wizard
- [ ] Version management
- [ ] Asset upload
- [ ] Review process
- [ ] Analytics dashboard

### US-3.2.4: Rate and Review
> **As a** user  
> **I want** to rate and review items  
> **So that** I can help others make decisions

**Acceptance Criteria:**
- [ ] Star rating (1-5)
- [ ] Written review
- [ ] Helpful votes
- [ ] Report inappropriate
- [ ] Author responses

---

## 🏗️ Technical Architecture

### Marketplace Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           MARKETPLACE ARCHITECTURE                               │
└─────────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────────────────────────────────────────────────────────────────────┐
    │  MARKETPLACE FRONTEND                                                        │
    │                                                                              │
    │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐ │
    │  │   Browse      │  │   Search      │  │   Details     │  │   Publish     │ │
    │  │               │  │               │  │               │  │               │ │
    │  │ • Categories  │  │ • Full-text   │  │ • Overview    │  │ • Wizard      │ │
    │  │ • Featured    │  │ • Filters     │  │ • Reviews     │  │ • Validation  │ │
    │  │ • Popular     │  │ • Sort        │  │ • Versions    │  │ • Preview     │ │
    │  │ • New         │  │ • Suggestions │  │ • Install     │  │ • Submit      │ │
    │  └───────────────┘  └───────────────┘  └───────────────┘  └───────────────┘ │
    └──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
    ┌──────────────────────────────────────────────────────────────────────────────┐
    │  MARKETPLACE API                                                             │
    │                                                                              │
    │  ┌───────────────────────────────────────────────────────────────────────┐  │
    │  │  Endpoints                                                            │  │
    │  │  • GET /items                    - List items                         │  │
    │  │  • GET /items/:id                - Get item details                   │  │
    │  │  • GET /items/:id/versions       - Get versions                       │  │
    │  │  • POST /items                   - Publish item                       │  │
    │  │  • PUT /items/:id                - Update item                        │  │
    │  │  • GET /items/:id/reviews        - Get reviews                        │  │
    │  │  • POST /items/:id/reviews       - Add review                         │  │
    │  │  • GET /items/:id/download       - Download item                      │  │
    │  └───────────────────────────────────────────────────────────────────────┘  │
    └──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
    ┌──────────────────────────────────────────────────────────────────────────────┐
    │  MARKETPLACE BACKEND                                                         │
    │                                                                              │
    │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐ │
    │  │   Catalog     │  │   Storage     │  │   Reviews     │  │   Analytics   │ │
    │  │               │  │               │  │               │  │               │ │
    │  │ • Items       │  │ • S3/GCS      │  │ • Ratings     │  │ • Downloads   │ │
    │  │ • Versions    │  │ • CDN         │  │ • Comments    │  │ • Installs    │ │
    │  │ • Categories  │  │ • Signing     │  │ • Reports     │  │ • Usage       │ │
    │  │ • Search      │  │               │  │               │  │               │ │
    │  └───────────────┘  └───────────────┘  └───────────────┘  └───────────────┘ │
    └──────────────────────────────────────────────────────────────────────────────┘
```

### Data Models

```typescript
// Marketplace Item
interface MarketplaceItem {
  id: string;
  type: 'template' | 'plugin' | 'theme';
  name: string;
  displayName: string;
  description: string;
  longDescription: string;
  author: {
    id: string;
    name: string;
    email: string;
    verified: boolean;
  };
  icon: string;
  screenshots: string[];
  categories: string[];
  tags: string[];
  license: string;
  repository?: string;
  homepage?: string;
  latestVersion: string;
  versions: ItemVersion[];
  stats: {
    downloads: number;
    installs: number;
    rating: number;
    reviewCount: number;
  };
  pricing: {
    type: 'free' | 'paid' | 'freemium';
    price?: number;
    currency?: string;
  };
  featured: boolean;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
}

// Item Version
interface ItemVersion {
  version: string;
  releaseNotes: string;
  minHostVersion: string;
  maxHostVersion?: string;
  dependencies: {
    id: string;
    version: string;
  }[];
  downloadUrl: string;
  checksum: string;
  size: number;
  publishedAt: string;
}

// Review
interface Review {
  id: string;
  itemId: string;
  userId: string;
  userName: string;
  rating: number;
  title: string;
  content: string;
  helpfulCount: number;
  authorResponse?: {
    content: string;
    respondedAt: string;
  };
  createdAt: string;
  updatedAt: string;
}

// Category
interface Category {
  id: string;
  name: string;
  description: string;
  icon: string;
  itemCount: number;
  subcategories?: Category[];
}
```

---

## 📁 Implementation Tasks

### Week 1: Backend & API

#### Task 3.2.1: Marketplace Service (Rust)
**File:** `desktop-app/src-tauri/src/marketplace/mod.rs`

```rust
use reqwest::Client;
use serde::{Deserialize, Serialize};

pub mod catalog;
pub mod download;
pub mod reviews;
pub mod publish;

const MARKETPLACE_API: &str = "https://marketplace.smartspecpro.com/api/v1";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketplaceItem {
    pub id: String,
    #[serde(rename = "type")]
    pub item_type: ItemType,
    pub name: String,
    pub display_name: String,
    pub description: String,
    pub author: Author,
    pub icon: String,
    pub categories: Vec<String>,
    pub latest_version: String,
    pub stats: ItemStats,
    pub pricing: Pricing,
    pub featured: bool,
    pub verified: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ItemType {
    Template,
    Plugin,
    Theme,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ItemStats {
    pub downloads: u64,
    pub installs: u64,
    pub rating: f32,
    pub review_count: u32,
}

pub struct MarketplaceService {
    client: Client,
    api_url: String,
}

impl MarketplaceService {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
            api_url: MARKETPLACE_API.to_string(),
        }
    }
    
    pub async fn list_items(&self, params: ListParams) -> Result<ListResponse, Error> {
        let url = format!("{}/items", self.api_url);
        
        let response = self.client
            .get(&url)
            .query(&params)
            .send()
            .await?
            .json::<ListResponse>()
            .await?;
        
        Ok(response)
    }
    
    pub async fn get_item(&self, id: &str) -> Result<MarketplaceItem, Error> {
        let url = format!("{}/items/{}", self.api_url, id);
        
        let response = self.client
            .get(&url)
            .send()
            .await?
            .json::<MarketplaceItem>()
            .await?;
        
        Ok(response)
    }
    
    pub async fn search(&self, query: &str, filters: SearchFilters) -> Result<SearchResponse, Error> {
        let url = format!("{}/items/search", self.api_url);
        
        let response = self.client
            .get(&url)
            .query(&[("q", query)])
            .query(&filters)
            .send()
            .await?
            .json::<SearchResponse>()
            .await?;
        
        Ok(response)
    }
    
    pub async fn get_categories(&self) -> Result<Vec<Category>, Error> {
        let url = format!("{}/categories", self.api_url);
        
        let response = self.client
            .get(&url)
            .send()
            .await?
            .json::<Vec<Category>>()
            .await?;
        
        Ok(response)
    }
    
    pub async fn download_item(&self, id: &str, version: &str) -> Result<Vec<u8>, Error> {
        let url = format!("{}/items/{}/versions/{}/download", self.api_url, id, version);
        
        let response = self.client
            .get(&url)
            .send()
            .await?
            .bytes()
            .await?;
        
        Ok(response.to_vec())
    }
    
    pub async fn get_reviews(&self, item_id: &str, page: u32) -> Result<ReviewsResponse, Error> {
        let url = format!("{}/items/{}/reviews", self.api_url, item_id);
        
        let response = self.client
            .get(&url)
            .query(&[("page", page)])
            .send()
            .await?
            .json::<ReviewsResponse>()
            .await?;
        
        Ok(response)
    }
    
    pub async fn add_review(&self, item_id: &str, review: NewReview) -> Result<Review, Error> {
        let url = format!("{}/items/{}/reviews", self.api_url, item_id);
        
        let response = self.client
            .post(&url)
            .json(&review)
            .send()
            .await?
            .json::<Review>()
            .await?;
        
        Ok(response)
    }
    
    pub async fn publish_item(&self, item: PublishRequest) -> Result<MarketplaceItem, Error> {
        let url = format!("{}/items", self.api_url);
        
        let response = self.client
            .post(&url)
            .json(&item)
            .send()
            .await?
            .json::<MarketplaceItem>()
            .await?;
        
        Ok(response)
    }
    
    pub async fn update_item(&self, id: &str, update: UpdateRequest) -> Result<MarketplaceItem, Error> {
        let url = format!("{}/items/{}", self.api_url, id);
        
        let response = self.client
            .put(&url)
            .json(&update)
            .send()
            .await?
            .json::<MarketplaceItem>()
            .await?;
        
        Ok(response)
    }
}

#[derive(Debug, Serialize)]
pub struct ListParams {
    pub item_type: Option<ItemType>,
    pub category: Option<String>,
    pub sort: Option<SortBy>,
    pub page: Option<u32>,
    pub per_page: Option<u32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SortBy {
    Popular,
    Recent,
    Rating,
    Downloads,
    Name,
}

#[derive(Debug, Deserialize)]
pub struct ListResponse {
    pub items: Vec<MarketplaceItem>,
    pub total: u64,
    pub page: u32,
    pub per_page: u32,
}
```

**Deliverables:**
- [ ] List items
- [ ] Get item details
- [ ] Search
- [ ] Download
- [ ] Reviews API
- [ ] Publish API

#### Task 3.2.2: Tauri Commands
**File:** `desktop-app/src-tauri/src/marketplace/commands.rs`

```rust
#[tauri::command]
pub async fn marketplace_list(
    params: ListParams,
    service: State<'_, MarketplaceService>,
) -> Result<ListResponse, String> {
    service.list_items(params).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn marketplace_search(
    query: String,
    filters: SearchFilters,
    service: State<'_, MarketplaceService>,
) -> Result<SearchResponse, String> {
    service.search(&query, filters).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn marketplace_get_item(
    id: String,
    service: State<'_, MarketplaceService>,
) -> Result<MarketplaceItem, String> {
    service.get_item(&id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn marketplace_install(
    id: String,
    version: String,
    service: State<'_, MarketplaceService>,
    plugin_host: State<'_, PluginHost>,
) -> Result<(), String> {
    // Download item
    let data = service.download_item(&id, &version).await.map_err(|e| e.to_string())?;
    
    // Install based on type
    let item = service.get_item(&id).await.map_err(|e| e.to_string())?;
    
    match item.item_type {
        ItemType::Plugin => {
            plugin_host.install_from_bytes(&id, &data).await.map_err(|e| e.to_string())?;
        }
        ItemType::Template => {
            // Install template
        }
        ItemType::Theme => {
            // Install theme
        }
    }
    
    Ok(())
}

#[tauri::command]
pub async fn marketplace_get_reviews(
    item_id: String,
    page: u32,
    service: State<'_, MarketplaceService>,
) -> Result<ReviewsResponse, String> {
    service.get_reviews(&item_id, page).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn marketplace_add_review(
    item_id: String,
    review: NewReview,
    service: State<'_, MarketplaceService>,
) -> Result<Review, String> {
    service.add_review(&item_id, review).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn marketplace_publish(
    request: PublishRequest,
    service: State<'_, MarketplaceService>,
) -> Result<MarketplaceItem, String> {
    service.publish_item(request).await.map_err(|e| e.to_string())
}
```

**Deliverables:**
- [ ] All Tauri commands
- [ ] Install flow
- [ ] Error handling

---

### Week 2: Frontend UI

#### Task 3.2.3: Marketplace Service (TypeScript)
**File:** `desktop-app/src/services/marketplaceService.ts`

```typescript
import { invoke } from '@tauri-apps/api/tauri';

export interface MarketplaceItem {
  id: string;
  type: 'template' | 'plugin' | 'theme';
  name: string;
  displayName: string;
  description: string;
  author: {
    id: string;
    name: string;
    verified: boolean;
  };
  icon: string;
  screenshots: string[];
  categories: string[];
  latestVersion: string;
  stats: {
    downloads: number;
    installs: number;
    rating: number;
    reviewCount: number;
  };
  pricing: {
    type: 'free' | 'paid' | 'freemium';
    price?: number;
  };
  featured: boolean;
  verified: boolean;
}

export interface ListParams {
  type?: 'template' | 'plugin' | 'theme';
  category?: string;
  sort?: 'popular' | 'recent' | 'rating' | 'downloads' | 'name';
  page?: number;
  perPage?: number;
}

export interface Review {
  id: string;
  userId: string;
  userName: string;
  rating: number;
  title: string;
  content: string;
  helpfulCount: number;
  createdAt: string;
}

class MarketplaceService {
  async list(params: ListParams = {}): Promise<{ items: MarketplaceItem[]; total: number }> {
    return invoke('marketplace_list', { params });
  }
  
  async search(query: string, filters: any = {}): Promise<{ items: MarketplaceItem[]; total: number }> {
    return invoke('marketplace_search', { query, filters });
  }
  
  async getItem(id: string): Promise<MarketplaceItem> {
    return invoke('marketplace_get_item', { id });
  }
  
  async install(id: string, version: string): Promise<void> {
    return invoke('marketplace_install', { id, version });
  }
  
  async getReviews(itemId: string, page: number = 1): Promise<{ reviews: Review[]; total: number }> {
    return invoke('marketplace_get_reviews', { itemId, page });
  }
  
  async addReview(itemId: string, review: { rating: number; title: string; content: string }): Promise<Review> {
    return invoke('marketplace_add_review', { itemId, review });
  }
  
  async publish(request: any): Promise<MarketplaceItem> {
    return invoke('marketplace_publish', { request });
  }
}

export const marketplaceService = new MarketplaceService();
```

#### Task 3.2.4: Marketplace Page
**File:** `desktop-app/src/pages/Marketplace/MarketplacePage.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { marketplaceService, MarketplaceItem, ListParams } from '@/services/marketplaceService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export function MarketplacePage() {
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'templates' | 'plugins' | 'themes'>('all');
  const [selectedItem, setSelectedItem] = useState<MarketplaceItem | null>(null);
  
  useEffect(() => {
    loadItems();
  }, [activeTab]);
  
  const loadItems = async () => {
    setLoading(true);
    try {
      const params: ListParams = {
        type: activeTab === 'all' ? undefined : activeTab.slice(0, -1) as any,
        sort: 'popular',
      };
      const result = await marketplaceService.list(params);
      setItems(result.items);
    } finally {
      setLoading(false);
    }
  };
  
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      loadItems();
      return;
    }
    
    setLoading(true);
    try {
      const result = await marketplaceService.search(searchQuery);
      setItems(result.items);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="marketplace-page">
      <div className="marketplace-header">
        <h1>Marketplace</h1>
        <div className="search-bar">
          <Input
            placeholder="Search templates, plugins, themes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Button onClick={handleSearch}>Search</Button>
        </div>
      </div>
      
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="plugins">Plugins</TabsTrigger>
          <TabsTrigger value="themes">Themes</TabsTrigger>
        </TabsList>
        
        <TabsContent value={activeTab}>
          {/* Featured Section */}
          <section className="featured-section">
            <h2>Featured</h2>
            <div className="featured-grid">
              {items.filter(i => i.featured).slice(0, 3).map((item) => (
                <FeaturedCard
                  key={item.id}
                  item={item}
                  onClick={() => setSelectedItem(item)}
                />
              ))}
            </div>
          </section>
          
          {/* All Items */}
          <section className="items-section">
            <h2>All {activeTab === 'all' ? 'Items' : activeTab}</h2>
            <div className="items-grid">
              {loading ? (
                <LoadingSkeleton count={8} />
              ) : items.length === 0 ? (
                <EmptyState message="No items found" />
              ) : (
                items.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    onClick={() => setSelectedItem(item)}
                  />
                ))
              )}
            </div>
          </section>
        </TabsContent>
      </Tabs>
      
      {/* Item Details Modal */}
      {selectedItem && (
        <ItemDetailsModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onInstall={() => {
            // Refresh after install
            loadItems();
          }}
        />
      )}
    </div>
  );
}

function ItemCard({ item, onClick }: { item: MarketplaceItem; onClick: () => void }) {
  return (
    <div className="item-card" onClick={onClick}>
      <div className="item-icon">
        <img src={item.icon} alt={item.displayName} />
        {item.verified && <span className="verified-badge">✓</span>}
      </div>
      
      <div className="item-info">
        <h3>{item.displayName}</h3>
        <p className="author">by {item.author.name}</p>
        <p className="description">{item.description}</p>
        
        <div className="item-stats">
          <span className="rating">
            ⭐ {item.stats.rating.toFixed(1)} ({item.stats.reviewCount})
          </span>
          <span className="downloads">
            ↓ {formatNumber(item.stats.downloads)}
          </span>
        </div>
      </div>
      
      <div className="item-price">
        {item.pricing.type === 'free' ? (
          <span className="free">Free</span>
        ) : (
          <span className="paid">${item.pricing.price}</span>
        )}
      </div>
    </div>
  );
}

function ItemDetailsModal({ item, onClose, onInstall }: {
  item: MarketplaceItem;
  onClose: () => void;
  onInstall: () => void;
}) {
  const [installing, setInstalling] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'reviews' | 'versions'>('overview');
  
  useEffect(() => {
    loadReviews();
  }, [item.id]);
  
  const loadReviews = async () => {
    const result = await marketplaceService.getReviews(item.id);
    setReviews(result.reviews);
  };
  
  const handleInstall = async () => {
    setInstalling(true);
    try {
      await marketplaceService.install(item.id, item.latestVersion);
      onInstall();
      onClose();
    } finally {
      setInstalling(false);
    }
  };
  
  return (
    <div className="item-details-modal">
      <div className="modal-header">
        <div className="item-header">
          <img src={item.icon} alt={item.displayName} />
          <div>
            <h2>{item.displayName}</h2>
            <p>by {item.author.name} {item.author.verified && '✓'}</p>
            <div className="stats">
              <span>⭐ {item.stats.rating.toFixed(1)}</span>
              <span>↓ {formatNumber(item.stats.downloads)} downloads</span>
            </div>
          </div>
        </div>
        
        <div className="actions">
          <Button
            onClick={handleInstall}
            disabled={installing}
          >
            {installing ? 'Installing...' : 'Install'}
          </Button>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
      </div>
      
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="reviews">Reviews ({item.stats.reviewCount})</TabsTrigger>
          <TabsTrigger value="versions">Versions</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview">
          <div className="screenshots">
            {item.screenshots.map((url, i) => (
              <img key={i} src={url} alt={`Screenshot ${i + 1}`} />
            ))}
          </div>
          
          <div className="description">
            <h3>Description</h3>
            <p>{item.description}</p>
          </div>
          
          <div className="categories">
            <h3>Categories</h3>
            <div className="tags">
              {item.categories.map((cat) => (
                <span key={cat} className="tag">{cat}</span>
              ))}
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="reviews">
          <ReviewsList reviews={reviews} />
          <AddReviewForm itemId={item.id} onAdd={loadReviews} />
        </TabsContent>
        
        <TabsContent value="versions">
          <VersionsList itemId={item.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

**Deliverables:**
- [ ] Browse page
- [ ] Search functionality
- [ ] Item cards
- [ ] Details modal
- [ ] Install flow

#### Task 3.2.5: Publish Wizard
**File:** `desktop-app/src/pages/Marketplace/PublishWizard.tsx`

```typescript
import React, { useState } from 'react';
import { marketplaceService } from '@/services/marketplaceService';

interface PublishData {
  type: 'template' | 'plugin' | 'theme';
  name: string;
  displayName: string;
  description: string;
  longDescription: string;
  categories: string[];
  tags: string[];
  license: string;
  repository?: string;
  homepage?: string;
  pricing: {
    type: 'free' | 'paid';
    price?: number;
  };
  files: File[];
  icon: File | null;
  screenshots: File[];
}

export function PublishWizard() {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<PublishData>({
    type: 'template',
    name: '',
    displayName: '',
    description: '',
    longDescription: '',
    categories: [],
    tags: [],
    license: 'MIT',
    pricing: { type: 'free' },
    files: [],
    icon: null,
    screenshots: [],
  });
  const [publishing, setPublishing] = useState(false);
  
  const steps = [
    { id: 1, title: 'Basic Info' },
    { id: 2, title: 'Details' },
    { id: 3, title: 'Assets' },
    { id: 4, title: 'Review' },
  ];
  
  const handlePublish = async () => {
    setPublishing(true);
    try {
      // Upload assets
      // Submit to marketplace
      await marketplaceService.publish(data);
      // Show success
    } finally {
      setPublishing(false);
    }
  };
  
  return (
    <div className="publish-wizard">
      <div className="wizard-header">
        <h1>Publish to Marketplace</h1>
        <div className="steps">
          {steps.map((s) => (
            <div
              key={s.id}
              className={`step ${step === s.id ? 'active' : ''} ${step > s.id ? 'completed' : ''}`}
            >
              <span className="step-number">{s.id}</span>
              <span className="step-title">{s.title}</span>
            </div>
          ))}
        </div>
      </div>
      
      <div className="wizard-content">
        {step === 1 && (
          <BasicInfoStep data={data} onChange={setData} />
        )}
        {step === 2 && (
          <DetailsStep data={data} onChange={setData} />
        )}
        {step === 3 && (
          <AssetsStep data={data} onChange={setData} />
        )}
        {step === 4 && (
          <ReviewStep data={data} />
        )}
      </div>
      
      <div className="wizard-footer">
        {step > 1 && (
          <Button variant="outline" onClick={() => setStep(step - 1)}>
            Back
          </Button>
        )}
        {step < 4 ? (
          <Button onClick={() => setStep(step + 1)}>
            Next
          </Button>
        ) : (
          <Button onClick={handlePublish} disabled={publishing}>
            {publishing ? 'Publishing...' : 'Publish'}
          </Button>
        )}
      </div>
    </div>
  );
}
```

**Deliverables:**
- [ ] Multi-step wizard
- [ ] Form validation
- [ ] Asset upload
- [ ] Preview
- [ ] Submit

---

## 📊 Definition of Done

- [ ] Browse marketplace ทำงานได้
- [ ] Search ทำงานได้
- [ ] Install from marketplace ทำงานได้
- [ ] Reviews ทำงานได้
- [ ] Publish wizard ทำงานได้
- [ ] Unit tests coverage > 80%

---

## 🚀 Next Sprint

**Sprint 3.3: AI Enhancements**
- Smart suggestions
- Code completion
- Bug predictions
- Learning system
