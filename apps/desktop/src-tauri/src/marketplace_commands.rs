// Marketplace Commands - Tauri IPC Commands for Marketplace
//
// Provides commands for:
// - Browsing and searching marketplace
// - Installing and managing items
// - Reviews and ratings
// - Favorites

use tauri::State;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::marketplace::{
    MarketplaceService, MarketplaceItem, MarketplaceItemType, SearchQuery,
    SearchResult, InstalledItem, Review, CategoryInfo, SortBy, PriceType,
};

// ============================================
// State Types
// ============================================

pub struct MarketplaceState {
    pub service: MarketplaceService,
}

impl MarketplaceState {
    pub fn new() -> Self {
        Self {
            service: MarketplaceService::new(),
        }
    }
}

// ============================================
// Search Commands
// ============================================

#[tauri::command]
pub async fn marketplace_search(
    state: State<'_, Arc<Mutex<MarketplaceState>>>,
    query: Option<String>,
    item_type: Option<String>,
    category: Option<String>,
    tags: Vec<String>,
    price_type: Option<String>,
    sort_by: Option<String>,
    page: Option<u32>,
    per_page: Option<u32>,
) -> Result<SearchResult, String> {
    let state = state.lock().await;
    
    let search_query = SearchQuery {
        query,
        item_type: item_type.and_then(|t| parse_item_type(&t)),
        category,
        tags,
        price_type: price_type.and_then(|p| parse_price_type(&p)),
        sort_by: sort_by.and_then(|s| parse_sort_by(&s)).unwrap_or(SortBy::Relevance),
        page: page.unwrap_or(1),
        per_page: per_page.unwrap_or(20),
    };
    
    Ok(state.service.search(search_query))
}

#[tauri::command]
pub async fn marketplace_get_item(
    state: State<'_, Arc<Mutex<MarketplaceState>>>,
    item_id: String,
) -> Result<MarketplaceItem, String> {
    let state = state.lock().await;
    state.service.get_item(&item_id)
        .cloned()
        .ok_or_else(|| format!("Item not found: {}", item_id))
}

#[tauri::command]
pub async fn marketplace_get_featured(
    state: State<'_, Arc<Mutex<MarketplaceState>>>,
) -> Result<Vec<MarketplaceItem>, String> {
    let state = state.lock().await;
    Ok(state.service.get_featured().into_iter().cloned().collect())
}

#[tauri::command]
pub async fn marketplace_get_categories(
    state: State<'_, Arc<Mutex<MarketplaceState>>>,
) -> Result<Vec<CategoryInfo>, String> {
    let state = state.lock().await;
    Ok(state.service.get_categories())
}

// ============================================
// Installation Commands
// ============================================

#[tauri::command]
pub async fn marketplace_install(
    state: State<'_, Arc<Mutex<MarketplaceState>>>,
    item_id: String,
) -> Result<InstalledItem, String> {
    let mut state = state.lock().await;
    state.service.install(&item_id)
}

#[tauri::command]
pub async fn marketplace_uninstall(
    state: State<'_, Arc<Mutex<MarketplaceState>>>,
    item_id: String,
) -> Result<(), String> {
    let mut state = state.lock().await;
    state.service.uninstall(&item_id)
}

#[tauri::command]
pub async fn marketplace_get_installed(
    state: State<'_, Arc<Mutex<MarketplaceState>>>,
) -> Result<Vec<InstalledItem>, String> {
    let state = state.lock().await;
    Ok(state.service.get_installed().into_iter().cloned().collect())
}

#[tauri::command]
pub async fn marketplace_is_installed(
    state: State<'_, Arc<Mutex<MarketplaceState>>>,
    item_id: String,
) -> Result<bool, String> {
    let state = state.lock().await;
    Ok(state.service.is_installed(&item_id))
}

// ============================================
// Favorites Commands
// ============================================

#[tauri::command]
pub async fn marketplace_add_favorite(
    state: State<'_, Arc<Mutex<MarketplaceState>>>,
    item_id: String,
) -> Result<(), String> {
    let mut state = state.lock().await;
    state.service.add_favorite(&item_id)
}

#[tauri::command]
pub async fn marketplace_remove_favorite(
    state: State<'_, Arc<Mutex<MarketplaceState>>>,
    item_id: String,
) -> Result<(), String> {
    let mut state = state.lock().await;
    state.service.remove_favorite(&item_id);
    Ok(())
}

#[tauri::command]
pub async fn marketplace_get_favorites(
    state: State<'_, Arc<Mutex<MarketplaceState>>>,
) -> Result<Vec<MarketplaceItem>, String> {
    let state = state.lock().await;
    Ok(state.service.get_favorites().into_iter().cloned().collect())
}

// ============================================
// Review Commands
// ============================================

#[tauri::command]
pub async fn marketplace_add_review(
    state: State<'_, Arc<Mutex<MarketplaceState>>>,
    item_id: String,
    user_id: String,
    user_name: String,
    rating: u8,
    title: Option<String>,
    content: String,
) -> Result<Review, String> {
    let mut state = state.lock().await;
    state.service.add_review(&item_id, &user_id, &user_name, rating, title, &content)
}

#[tauri::command]
pub async fn marketplace_get_reviews(
    state: State<'_, Arc<Mutex<MarketplaceState>>>,
    item_id: String,
) -> Result<Vec<Review>, String> {
    let state = state.lock().await;
    Ok(state.service.get_reviews(&item_id).into_iter().cloned().collect())
}

// ============================================
// Helper Functions
// ============================================

fn parse_item_type(s: &str) -> Option<MarketplaceItemType> {
    match s.to_lowercase().as_str() {
        "plugin" => Some(MarketplaceItemType::Plugin),
        "template" => Some(MarketplaceItemType::Template),
        "theme" => Some(MarketplaceItemType::Theme),
        "integration" => Some(MarketplaceItemType::Integration),
        _ => None,
    }
}

fn parse_price_type(s: &str) -> Option<PriceType> {
    match s.to_lowercase().as_str() {
        "free" => Some(PriceType::Free),
        "paid" => Some(PriceType::Paid),
        "freemium" => Some(PriceType::Freemium),
        _ => None,
    }
}

fn parse_sort_by(s: &str) -> Option<SortBy> {
    match s.to_lowercase().as_str() {
        "relevance" => Some(SortBy::Relevance),
        "downloads" => Some(SortBy::Downloads),
        "rating" => Some(SortBy::Rating),
        "newest" => Some(SortBy::Newest),
        "updated" => Some(SortBy::Updated),
        _ => None,
    }
}
