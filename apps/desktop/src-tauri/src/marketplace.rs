// Marketplace - Plugin and Template Store
//
// Provides:
// - Browse and search marketplace items
// - Download and install items
// - Publish items to marketplace
// - Reviews and ratings

use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ============================================
// Marketplace Types
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketplaceItem {
    pub id: String,
    pub item_type: MarketplaceItemType,
    pub name: String,
    pub slug: String,
    pub version: String,
    pub description: String,
    pub long_description: Option<String>,
    pub author: Author,
    pub icon_url: Option<String>,
    pub screenshots: Vec<String>,
    pub category: String,
    pub tags: Vec<String>,
    pub downloads: u64,
    pub rating: f64,
    pub rating_count: u32,
    pub price: Price,
    pub license: String,
    pub repository_url: Option<String>,
    pub homepage_url: Option<String>,
    pub changelog: Vec<ChangelogEntry>,
    pub dependencies: Vec<Dependency>,
    pub min_app_version: String,
    pub published_at: i64,
    pub updated_at: i64,
    pub verified: bool,
    pub featured: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MarketplaceItemType {
    Plugin,
    Template,
    Theme,
    Integration,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Author {
    pub id: String,
    pub name: String,
    pub avatar_url: Option<String>,
    pub verified: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Price {
    pub price_type: PriceType,
    pub amount: Option<f64>,
    pub currency: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PriceType {
    Free,
    Paid,
    Freemium,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangelogEntry {
    pub version: String,
    pub date: i64,
    pub changes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Dependency {
    pub id: String,
    pub name: String,
    pub version_requirement: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Review {
    pub id: String,
    pub item_id: String,
    pub user_id: String,
    pub user_name: String,
    pub rating: u8,
    pub title: Option<String>,
    pub content: String,
    pub helpful_count: u32,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchQuery {
    pub query: Option<String>,
    pub item_type: Option<MarketplaceItemType>,
    pub category: Option<String>,
    pub tags: Vec<String>,
    pub price_type: Option<PriceType>,
    pub sort_by: SortBy,
    pub page: u32,
    pub per_page: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SortBy {
    Relevance,
    Downloads,
    Rating,
    Newest,
    Updated,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub items: Vec<MarketplaceItem>,
    pub total: u64,
    pub page: u32,
    pub per_page: u32,
    pub total_pages: u32,
}

// ============================================
// Publish Types
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublishRequest {
    pub item_type: MarketplaceItemType,
    pub name: String,
    pub description: String,
    pub long_description: Option<String>,
    pub category: String,
    pub tags: Vec<String>,
    pub license: String,
    pub repository_url: Option<String>,
    pub homepage_url: Option<String>,
    pub price: Price,
    pub changelog: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublishResult {
    pub item_id: String,
    pub version: String,
    pub status: PublishStatus,
    pub review_notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PublishStatus {
    Pending,
    InReview,
    Approved,
    Rejected,
    Published,
}

// ============================================
// Marketplace Service
// ============================================

pub struct MarketplaceService {
    pub items: HashMap<String, MarketplaceItem>,
    pub reviews: HashMap<String, Vec<Review>>,
    pub installed: HashMap<String, InstalledItem>,
    pub favorites: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledItem {
    pub item_id: String,
    pub version: String,
    pub installed_at: i64,
    pub auto_update: bool,
}

impl MarketplaceService {
    pub fn new() -> Self {
        let mut service = Self {
            items: HashMap::new(),
            reviews: HashMap::new(),
            installed: HashMap::new(),
            favorites: Vec::new(),
        };
        service.load_sample_items();
        service
    }

    fn load_sample_items(&mut self) {
        // Add sample marketplace items
        let sample_items = vec![
            MarketplaceItem {
                id: "plugin-github".to_string(),
                item_type: MarketplaceItemType::Plugin,
                name: "GitHub Integration".to_string(),
                slug: "github-integration".to_string(),
                version: "1.2.0".to_string(),
                description: "Sync specs with GitHub issues and PRs".to_string(),
                long_description: Some("Full GitHub integration for SmartSpecPro...".to_string()),
                author: Author {
                    id: "official".to_string(),
                    name: "SmartSpecPro Team".to_string(),
                    avatar_url: None,
                    verified: true,
                },
                icon_url: None,
                screenshots: vec![],
                category: "integrations".to_string(),
                tags: vec!["github".to_string(), "git".to_string(), "sync".to_string()],
                downloads: 15420,
                rating: 4.8,
                rating_count: 234,
                price: Price { price_type: PriceType::Free, amount: None, currency: None },
                license: "MIT".to_string(),
                repository_url: Some("https://github.com/smartspecpro/plugin-github".to_string()),
                homepage_url: None,
                changelog: vec![],
                dependencies: vec![],
                min_app_version: "1.0.0".to_string(),
                published_at: chrono::Utc::now().timestamp() - 86400 * 30,
                updated_at: chrono::Utc::now().timestamp() - 86400 * 7,
                verified: true,
                featured: true,
            },
            MarketplaceItem {
                id: "plugin-jira".to_string(),
                item_type: MarketplaceItemType::Plugin,
                name: "Jira Integration".to_string(),
                slug: "jira-integration".to_string(),
                version: "2.0.1".to_string(),
                description: "Two-way sync with Jira projects".to_string(),
                long_description: None,
                author: Author {
                    id: "official".to_string(),
                    name: "SmartSpecPro Team".to_string(),
                    avatar_url: None,
                    verified: true,
                },
                icon_url: None,
                screenshots: vec![],
                category: "integrations".to_string(),
                tags: vec!["jira".to_string(), "atlassian".to_string(), "sync".to_string()],
                downloads: 8930,
                rating: 4.5,
                rating_count: 156,
                price: Price { price_type: PriceType::Free, amount: None, currency: None },
                license: "MIT".to_string(),
                repository_url: None,
                homepage_url: None,
                changelog: vec![],
                dependencies: vec![],
                min_app_version: "1.0.0".to_string(),
                published_at: chrono::Utc::now().timestamp() - 86400 * 60,
                updated_at: chrono::Utc::now().timestamp() - 86400 * 14,
                verified: true,
                featured: true,
            },
            MarketplaceItem {
                id: "template-saas".to_string(),
                item_type: MarketplaceItemType::Template,
                name: "SaaS Starter".to_string(),
                slug: "saas-starter".to_string(),
                version: "1.0.0".to_string(),
                description: "Complete SaaS product specification template".to_string(),
                long_description: None,
                author: Author {
                    id: "community-1".to_string(),
                    name: "John Developer".to_string(),
                    avatar_url: None,
                    verified: false,
                },
                icon_url: None,
                screenshots: vec![],
                category: "templates".to_string(),
                tags: vec!["saas".to_string(), "startup".to_string(), "web".to_string()],
                downloads: 5670,
                rating: 4.6,
                rating_count: 89,
                price: Price { price_type: PriceType::Free, amount: None, currency: None },
                license: "MIT".to_string(),
                repository_url: None,
                homepage_url: None,
                changelog: vec![],
                dependencies: vec![],
                min_app_version: "1.0.0".to_string(),
                published_at: chrono::Utc::now().timestamp() - 86400 * 45,
                updated_at: chrono::Utc::now().timestamp() - 86400 * 10,
                verified: false,
                featured: false,
            },
            MarketplaceItem {
                id: "theme-dark-pro".to_string(),
                item_type: MarketplaceItemType::Theme,
                name: "Dark Pro Theme".to_string(),
                slug: "dark-pro-theme".to_string(),
                version: "1.1.0".to_string(),
                description: "Professional dark theme with custom colors".to_string(),
                long_description: None,
                author: Author {
                    id: "community-2".to_string(),
                    name: "Design Studio".to_string(),
                    avatar_url: None,
                    verified: false,
                },
                icon_url: None,
                screenshots: vec![],
                category: "themes".to_string(),
                tags: vec!["dark".to_string(), "theme".to_string(), "ui".to_string()],
                downloads: 12340,
                rating: 4.9,
                rating_count: 312,
                price: Price { price_type: PriceType::Free, amount: None, currency: None },
                license: "MIT".to_string(),
                repository_url: None,
                homepage_url: None,
                changelog: vec![],
                dependencies: vec![],
                min_app_version: "1.0.0".to_string(),
                published_at: chrono::Utc::now().timestamp() - 86400 * 20,
                updated_at: chrono::Utc::now().timestamp() - 86400 * 5,
                verified: false,
                featured: true,
            },
        ];

        for item in sample_items {
            self.items.insert(item.id.clone(), item);
        }
    }

    // ============================================
    // Search and Browse
    // ============================================

    pub fn search(&self, query: SearchQuery) -> SearchResult {
        let mut items: Vec<_> = self.items.values().cloned().collect();

        // Filter by query
        if let Some(q) = &query.query {
            let q_lower = q.to_lowercase();
            items.retain(|item| {
                item.name.to_lowercase().contains(&q_lower) ||
                item.description.to_lowercase().contains(&q_lower) ||
                item.tags.iter().any(|t| t.to_lowercase().contains(&q_lower))
            });
        }

        // Filter by type
        if let Some(item_type) = &query.item_type {
            items.retain(|item| std::mem::discriminant(&item.item_type) == std::mem::discriminant(item_type));
        }

        // Filter by category
        if let Some(category) = &query.category {
            items.retain(|item| &item.category == category);
        }

        // Filter by tags
        if !query.tags.is_empty() {
            items.retain(|item| query.tags.iter().any(|t| item.tags.contains(t)));
        }

        // Filter by price type
        if let Some(price_type) = &query.price_type {
            items.retain(|item| std::mem::discriminant(&item.price.price_type) == std::mem::discriminant(price_type));
        }

        // Sort
        match query.sort_by {
            SortBy::Downloads => items.sort_by(|a, b| b.downloads.cmp(&a.downloads)),
            SortBy::Rating => items.sort_by(|a, b| b.rating.partial_cmp(&a.rating).unwrap_or(std::cmp::Ordering::Equal)),
            SortBy::Newest => items.sort_by(|a, b| b.published_at.cmp(&a.published_at)),
            SortBy::Updated => items.sort_by(|a, b| b.updated_at.cmp(&a.updated_at)),
            SortBy::Relevance => {} // Keep original order
        }

        let total = items.len() as u64;
        let per_page = query.per_page.max(1).min(100);
        let total_pages = ((total as f64) / (per_page as f64)).ceil() as u32;
        let page = query.page.max(1).min(total_pages.max(1));
        let start = ((page - 1) * per_page) as usize;
        let end = (start + per_page as usize).min(items.len());

        SearchResult {
            items: items[start..end].to_vec(),
            total,
            page,
            per_page,
            total_pages,
        }
    }

    pub fn get_item(&self, item_id: &str) -> Option<&MarketplaceItem> {
        self.items.get(item_id)
    }

    pub fn get_featured(&self) -> Vec<&MarketplaceItem> {
        self.items.values().filter(|item| item.featured).collect()
    }

    pub fn get_categories(&self) -> Vec<CategoryInfo> {
        let mut categories: HashMap<String, u32> = HashMap::new();
        for item in self.items.values() {
            *categories.entry(item.category.clone()).or_insert(0) += 1;
        }
        categories.into_iter()
            .map(|(name, count)| CategoryInfo { name, count })
            .collect()
    }

    // ============================================
    // Installation
    // ============================================

    pub fn install(&mut self, item_id: &str) -> Result<InstalledItem, String> {
        let item = self.items.get(item_id)
            .ok_or_else(|| format!("Item not found: {}", item_id))?;

        let installed = InstalledItem {
            item_id: item_id.to_string(),
            version: item.version.clone(),
            installed_at: chrono::Utc::now().timestamp(),
            auto_update: true,
        };

        self.installed.insert(item_id.to_string(), installed.clone());

        // Increment download count
        if let Some(item) = self.items.get_mut(item_id) {
            item.downloads += 1;
        }

        Ok(installed)
    }

    pub fn uninstall(&mut self, item_id: &str) -> Result<(), String> {
        self.installed.remove(item_id)
            .ok_or_else(|| format!("Item not installed: {}", item_id))?;
        Ok(())
    }

    pub fn get_installed(&self) -> Vec<&InstalledItem> {
        self.installed.values().collect()
    }

    pub fn is_installed(&self, item_id: &str) -> bool {
        self.installed.contains_key(item_id)
    }

    // ============================================
    // Favorites
    // ============================================

    pub fn add_favorite(&mut self, item_id: &str) -> Result<(), String> {
        if !self.items.contains_key(item_id) {
            return Err(format!("Item not found: {}", item_id));
        }
        if !self.favorites.contains(&item_id.to_string()) {
            self.favorites.push(item_id.to_string());
        }
        Ok(())
    }

    pub fn remove_favorite(&mut self, item_id: &str) {
        self.favorites.retain(|id| id != item_id);
    }

    pub fn get_favorites(&self) -> Vec<&MarketplaceItem> {
        self.favorites.iter()
            .filter_map(|id| self.items.get(id))
            .collect()
    }

    // ============================================
    // Reviews
    // ============================================

    pub fn add_review(&mut self, item_id: &str, user_id: &str, user_name: &str, rating: u8, title: Option<String>, content: &str) -> Result<Review, String> {
        if !self.items.contains_key(item_id) {
            return Err(format!("Item not found: {}", item_id));
        }

        let review = Review {
            id: Uuid::new_v4().to_string(),
            item_id: item_id.to_string(),
            user_id: user_id.to_string(),
            user_name: user_name.to_string(),
            rating: rating.min(5).max(1),
            title,
            content: content.to_string(),
            helpful_count: 0,
            created_at: chrono::Utc::now().timestamp(),
            updated_at: chrono::Utc::now().timestamp(),
        };

        self.reviews.entry(item_id.to_string())
            .or_insert_with(Vec::new)
            .push(review.clone());

        // Update item rating
        self.update_item_rating(item_id);

        Ok(review)
    }

    pub fn get_reviews(&self, item_id: &str) -> Vec<&Review> {
        self.reviews.get(item_id)
            .map(|reviews| reviews.iter().collect())
            .unwrap_or_default()
    }

    fn update_item_rating(&mut self, item_id: &str) {
        if let Some(reviews) = self.reviews.get(item_id) {
            if !reviews.is_empty() {
                let total: u32 = reviews.iter().map(|r| r.rating as u32).sum();
                let avg = total as f64 / reviews.len() as f64;
                if let Some(item) = self.items.get_mut(item_id) {
                    item.rating = avg;
                    item.rating_count = reviews.len() as u32;
                }
            }
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryInfo {
    pub name: String,
    pub count: u32,
}
