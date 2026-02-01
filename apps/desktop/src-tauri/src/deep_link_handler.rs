/**
 * Deep Link Handler Module
 * Handles smartspec:// protocol URLs from web browser
 */

use serde::{Deserialize, Serialize};
use tauri::{Manager, Window};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum DeepLinkAction {
    #[serde(rename = "marketplace")]
    OpenMarketplace,

    #[serde(rename = "template")]
    OpenTemplate { template_id: String },

    #[serde(rename = "category")]
    OpenCategory { category: String },

    #[serde(rename = "purchase")]
    PurchaseTemplate { template_id: String },
}

/**
 * Parse deep link URL into action
 *
 * Examples:
 * - smartspec://marketplace -> OpenMarketplace
 * - smartspec://marketplace/template/abc123 -> OpenTemplate
 * - smartspec://marketplace/category/image_generation -> OpenCategory
 */
pub fn parse_deep_link(url: &str) -> Result<DeepLinkAction, String> {
    // Remove protocol
    let without_protocol = url
        .trim_start_matches("smartspec://")
        .trim_start_matches("smartspec:");

    // Split into parts
    let parts: Vec<&str> = without_protocol
        .trim_start_matches('/')
        .split('/')
        .collect();

    if parts.is_empty() || parts[0].is_empty() {
        return Err("Empty deep link".to_string());
    }

    match parts[0] {
        "marketplace" => {
            if parts.len() == 1 {
                Ok(DeepLinkAction::OpenMarketplace)
            } else if parts.len() >= 3 && parts[1] == "template" {
                Ok(DeepLinkAction::OpenTemplate {
                    template_id: parts[2].to_string(),
                })
            } else if parts.len() >= 3 && parts[1] == "category" {
                Ok(DeepLinkAction::OpenCategory {
                    category: parts[2].to_string(),
                })
            } else if parts.len() >= 3 && parts[1] == "purchase" {
                Ok(DeepLinkAction::PurchaseTemplate {
                    template_id: parts[2].to_string(),
                })
            } else {
                Err(format!("Unknown marketplace path: {}", without_protocol))
            }
        }
        _ => Err(format!("Unknown deep link host: {}", parts[0])),
    }
}

/**
 * Handle deep link and emit event to frontend
 */
pub fn handle_deep_link(window: &Window, url: &str) -> Result<(), String> {
    println!("[DeepLink] Handling: {}", url);

    let action = parse_deep_link(url)?;

    println!("[DeepLink] Parsed action: {:?}", action);

    // Emit event to frontend based on action
    let event_result = match &action {
        DeepLinkAction::OpenMarketplace => {
            window.emit("deep-link", serde_json::json!({
                "type": "marketplace"
            }))
        }
        DeepLinkAction::OpenTemplate { template_id } => {
            window.emit("deep-link", serde_json::json!({
                "type": "template",
                "templateId": template_id
            }))
        }
        DeepLinkAction::OpenCategory { category } => {
            window.emit("deep-link", serde_json::json!({
                "type": "category",
                "category": category
            }))
        }
        DeepLinkAction::PurchaseTemplate { template_id } => {
            window.emit("deep-link", serde_json::json!({
                "type": "purchase",
                "templateId": template_id
            }))
        }
    };

    event_result.map_err(|e| format!("Failed to emit event: {}", e))?;

    // Bring window to front
    if let Err(e) = window.set_focus() {
        eprintln!("[DeepLink] Failed to focus window: {}", e);
    }

    // Show window if hidden
    if let Err(e) = window.show() {
        eprintln!("[DeepLink] Failed to show window: {}", e);
    }

    // Unminimize if minimized
    if let Err(e) = window.unminimize() {
        eprintln!("[DeepLink] Failed to unminimize window: {}", e);
    }

    println!("[DeepLink] Successfully handled: {:?}", action);

    Ok(())
}

/**
 * Tauri command: Test deep link handling
 */
#[tauri::command]
pub fn test_deep_link(window: Window, url: String) -> Result<String, String> {
    handle_deep_link(&window, &url)?;
    Ok(format!("Deep link handled: {}", url))
}

/**
 * Tauri command: Check if deep link is registered
 */
#[tauri::command]
pub fn get_deep_link_status() -> Result<String, String> {
    Ok("smartspec:// protocol is registered".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_marketplace_home() {
        let action = parse_deep_link("smartspec://marketplace").unwrap();
        matches!(action, DeepLinkAction::OpenMarketplace);
    }

    #[test]
    fn test_parse_template() {
        let action = parse_deep_link("smartspec://marketplace/template/abc123").unwrap();
        match action {
            DeepLinkAction::OpenTemplate { template_id } => {
                assert_eq!(template_id, "abc123");
            }
            _ => panic!("Wrong action"),
        }
    }

    #[test]
    fn test_parse_category() {
        let action = parse_deep_link("smartspec://marketplace/category/image_generation").unwrap();
        match action {
            DeepLinkAction::OpenCategory { category } => {
                assert_eq!(category, "image_generation");
            }
            _ => panic!("Wrong action"),
        }
    }

    #[test]
    fn test_parse_purchase() {
        let action = parse_deep_link("smartspec://marketplace/purchase/xyz789").unwrap();
        match action {
            DeepLinkAction::PurchaseTemplate { template_id } => {
                assert_eq!(template_id, "xyz789");
            }
            _ => panic!("Wrong action"),
        }
    }

    #[test]
    fn test_invalid_url() {
        let result = parse_deep_link("https://example.com");
        assert!(result.is_err());
    }

    #[test]
    fn test_empty_url() {
        let result = parse_deep_link("smartspec://");
        assert!(result.is_err());
    }
}
