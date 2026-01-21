/**
 * Deep Link Handler
 * Handles smartspec:// protocol URLs from web browser
 */

use tauri::{Manager, Window};
use url::Url;

#[derive(Debug, Clone)]
pub enum DeepLinkAction {
    OpenMarketplace,
    OpenTemplate { template_id: String },
    OpenCategory { category: String },
    PurchaseTemplate { template_id: String },
}

/**
 * Parse deep link URL into action
 */
pub fn parse_deep_link(url: &str) -> Result<DeepLinkAction, String> {
    let parsed_url = Url::parse(url)
        .map_err(|e| format!("Invalid URL: {}", e))?;

    // Validate protocol
    if parsed_url.scheme() != "smartspec" {
        return Err(format!("Invalid protocol: {}", parsed_url.scheme()));
    }

    // Parse host and path
    let host = parsed_url.host_str().unwrap_or("");
    let path = parsed_url.path();

    match host {
        "marketplace" => {
            if path == "" || path == "/" {
                Ok(DeepLinkAction::OpenMarketplace)
            } else if path.starts_with("/template/") {
                let template_id = path.trim_start_matches("/template/");
                Ok(DeepLinkAction::OpenTemplate {
                    template_id: template_id.to_string(),
                })
            } else if path.starts_with("/category/") {
                let category = path.trim_start_matches("/category/");
                Ok(DeepLinkAction::OpenCategory {
                    category: category.to_string(),
                })
            } else if path.starts_with("/purchase/") {
                let template_id = path.trim_start_matches("/purchase/");
                Ok(DeepLinkAction::PurchaseTemplate {
                    template_id: template_id.to_string(),
                })
            } else {
                Err(format!("Unknown marketplace path: {}", path))
            }
        }
        _ => Err(format!("Unknown host: {}", host)),
    }
}

/**
 * Handle deep link and navigate app
 */
pub fn handle_deep_link(window: &Window, url: &str) -> Result<(), String> {
    let action = parse_deep_link(url)?;

    match action {
        DeepLinkAction::OpenMarketplace => {
            // Emit event to frontend
            window
                .emit("deep-link-marketplace", ())
                .map_err(|e| format!("Failed to emit event: {}", e))?;

            // Bring window to front
            window.set_focus().ok();
        }

        DeepLinkAction::OpenTemplate { template_id } => {
            window
                .emit("deep-link-template", template_id)
                .map_err(|e| format!("Failed to emit event: {}", e))?;

            window.set_focus().ok();
        }

        DeepLinkAction::OpenCategory { category } => {
            window
                .emit("deep-link-category", category)
                .map_err(|e| format!("Failed to emit event: {}", e))?;

            window.set_focus().ok();
        }

        DeepLinkAction::PurchaseTemplate { template_id } => {
            window
                .emit("deep-link-purchase", template_id)
                .map_err(|e| format!("Failed to emit event: {}", e))?;

            window.set_focus().ok();
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_marketplace_home() {
        let action = parse_deep_link("smartspec://marketplace").unwrap();
        match action {
            DeepLinkAction::OpenMarketplace => assert!(true),
            _ => panic!("Wrong action"),
        }
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
    fn test_invalid_protocol() {
        let result = parse_deep_link("https://example.com");
        assert!(result.is_err());
    }
}
