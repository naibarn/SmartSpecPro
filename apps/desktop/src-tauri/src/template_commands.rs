// Template Commands - Tauri IPC Commands for Template Wizard
//
// Provides commands for:
// - Template listing and search
// - Template metadata retrieval
// - Project generation

use tauri::{State, Window};
use std::sync::Arc;
use std::path::PathBuf;
use tokio::sync::Mutex;

use crate::template_engine::{
    TemplateEngine, TemplateEntry, TemplateMetadata, TemplateCategory,
    ConfigSchema, ProjectConfig, GenerationResult, GenerationProgress,
};

// ============================================
// State Types
// ============================================

pub struct TemplateState {
    pub engine: Arc<Mutex<TemplateEngine>>,
}

impl TemplateState {
    pub fn new(templates_dir: PathBuf) -> Self {
        Self {
            engine: Arc::new(Mutex::new(TemplateEngine::new(templates_dir))),
        }
    }
}

// ============================================
// Registry Commands
// ============================================

#[tauri::command]
pub async fn template_load_registry(
    state: State<'_, Arc<Mutex<TemplateState>>>,
) -> Result<(), String> {
    let state = state.lock().await;
    let mut engine = state.engine.lock().await;
    engine.load_registry().await?;
    Ok(())
}

#[tauri::command]
pub async fn template_list(
    state: State<'_, Arc<Mutex<TemplateState>>>,
) -> Result<Vec<TemplateEntry>, String> {
    let state = state.lock().await;
    let engine = state.engine.lock().await;
    Ok(engine.list_templates())
}

#[tauri::command]
pub async fn template_search(
    state: State<'_, Arc<Mutex<TemplateState>>>,
    query: String,
    category: Option<String>,
) -> Result<Vec<TemplateEntry>, String> {
    let state = state.lock().await;
    let engine = state.engine.lock().await;
    
    let category_enum = category.and_then(|c| match c.to_lowercase().as_str() {
        "saas" => Some(TemplateCategory::Saas),
        "ecommerce" => Some(TemplateCategory::Ecommerce),
        "mobile" => Some(TemplateCategory::Mobile),
        "api" => Some(TemplateCategory::Api),
        "dashboard" => Some(TemplateCategory::Dashboard),
        "landing" => Some(TemplateCategory::Landing),
        "blog" => Some(TemplateCategory::Blog),
        "portfolio" => Some(TemplateCategory::Portfolio),
        _ => None,
    });
    
    Ok(engine.search_templates(&query, category_enum))
}

#[tauri::command]
pub async fn template_get_categories() -> Result<Vec<CategoryInfo>, String> {
    Ok(vec![
        CategoryInfo { id: "saas".to_string(), name: "SaaS".to_string(), icon: "🚀".to_string(), description: "Software as a Service applications".to_string() },
        CategoryInfo { id: "ecommerce".to_string(), name: "E-commerce".to_string(), icon: "🛒".to_string(), description: "Online stores and marketplaces".to_string() },
        CategoryInfo { id: "mobile".to_string(), name: "Mobile App".to_string(), icon: "📱".to_string(), description: "iOS and Android applications".to_string() },
        CategoryInfo { id: "api".to_string(), name: "API".to_string(), icon: "🔌".to_string(), description: "REST and GraphQL APIs".to_string() },
        CategoryInfo { id: "dashboard".to_string(), name: "Dashboard".to_string(), icon: "📊".to_string(), description: "Admin panels and dashboards".to_string() },
        CategoryInfo { id: "landing".to_string(), name: "Landing Page".to_string(), icon: "🎯".to_string(), description: "Marketing and landing pages".to_string() },
        CategoryInfo { id: "blog".to_string(), name: "Blog".to_string(), icon: "📝".to_string(), description: "Blog and content sites".to_string() },
        CategoryInfo { id: "portfolio".to_string(), name: "Portfolio".to_string(), icon: "💼".to_string(), description: "Personal and business portfolios".to_string() },
    ])
}

#[derive(serde::Serialize)]
pub struct CategoryInfo {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub description: String,
}

// ============================================
// Template Commands
// ============================================

#[tauri::command]
pub async fn template_get_metadata(
    state: State<'_, Arc<Mutex<TemplateState>>>,
    template_id: String,
) -> Result<TemplateMetadata, String> {
    let state = state.lock().await;
    let engine = state.engine.lock().await;
    engine.get_template_metadata(&template_id).await
}

#[tauri::command]
pub async fn template_get_config_schema(
    state: State<'_, Arc<Mutex<TemplateState>>>,
    template_id: String,
) -> Result<ConfigSchema, String> {
    let state = state.lock().await;
    let engine = state.engine.lock().await;
    engine.get_config_schema(&template_id).await
}

// ============================================
// Generation Commands
// ============================================

#[tauri::command]
pub async fn template_generate_project(
    state: State<'_, Arc<Mutex<TemplateState>>>,
    window: Window,
    config: ProjectConfig,
) -> Result<GenerationResult, String> {
    let state = state.lock().await;
    let engine = state.engine.lock().await;
    
    let window_clone = window.clone();
    let progress_callback = move |progress: GenerationProgress| {
        let _ = window_clone.emit("template:progress", &progress);
    };
    
    engine.generate_project(config, progress_callback).await
}

#[tauri::command]
pub async fn template_validate_config(
    config: ProjectConfig,
) -> Result<ValidationResult, String> {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    // Validate project name
    if config.project_name.is_empty() {
        errors.push(ValidationError {
            field: "project_name".to_string(),
            message: "Project name is required".to_string(),
        });
    } else {
        let name_regex = regex::Regex::new(r"^[a-z][a-z0-9-]*$").unwrap();
        if !name_regex.is_match(&config.project_name) {
            errors.push(ValidationError {
                field: "project_name".to_string(),
                message: "Project name must be lowercase, start with a letter, and contain only letters, numbers, and hyphens".to_string(),
            });
        }
    }

    // Validate output path
    if config.output_path.is_empty() {
        errors.push(ValidationError {
            field: "output_path".to_string(),
            message: "Output path is required".to_string(),
        });
    } else {
        let output_dir = PathBuf::from(&config.output_path);
        if !output_dir.exists() {
            warnings.push(ValidationWarning {
                field: "output_path".to_string(),
                message: "Output directory will be created".to_string(),
            });
        }
        
        let project_dir = output_dir.join(&config.project_name);
        if project_dir.exists() {
            errors.push(ValidationError {
                field: "project_name".to_string(),
                message: format!("Directory already exists: {}", project_dir.display()),
            });
        }
    }

    Ok(ValidationResult {
        valid: errors.is_empty(),
        errors,
        warnings,
    })
}

#[derive(serde::Serialize)]
pub struct ValidationResult {
    pub valid: bool,
    pub errors: Vec<ValidationError>,
    pub warnings: Vec<ValidationWarning>,
}

#[derive(serde::Serialize)]
pub struct ValidationError {
    pub field: String,
    pub message: String,
}

#[derive(serde::Serialize)]
pub struct ValidationWarning {
    pub field: String,
    pub message: String,
}

// ============================================
// Quick Start Commands
// ============================================

#[tauri::command]
pub async fn template_get_quick_start(
    template_id: String,
) -> Result<QuickStartGuide, String> {
    // Return template-specific quick start guide
    Ok(QuickStartGuide {
        title: format!("Getting Started with {}", template_id),
        steps: vec![
            QuickStartStep {
                order: 1,
                title: "Install Dependencies".to_string(),
                description: "Install all required packages".to_string(),
                command: Some("npm install".to_string()),
                completed: false,
            },
            QuickStartStep {
                order: 2,
                title: "Configure Environment".to_string(),
                description: "Copy .env.example to .env and fill in your values".to_string(),
                command: Some("cp .env.example .env".to_string()),
                completed: false,
            },
            QuickStartStep {
                order: 3,
                title: "Start Development Server".to_string(),
                description: "Run the development server".to_string(),
                command: Some("npm run dev".to_string()),
                completed: false,
            },
            QuickStartStep {
                order: 4,
                title: "Open in Browser".to_string(),
                description: "View your app at http://localhost:3000".to_string(),
                command: None,
                completed: false,
            },
        ],
        resources: vec![
            QuickStartResource {
                title: "Documentation".to_string(),
                url: "https://docs.smartspecpro.com".to_string(),
                icon: "📚".to_string(),
            },
            QuickStartResource {
                title: "Video Tutorial".to_string(),
                url: "https://youtube.com/smartspecpro".to_string(),
                icon: "🎥".to_string(),
            },
            QuickStartResource {
                title: "Community Discord".to_string(),
                url: "https://discord.gg/smartspecpro".to_string(),
                icon: "💬".to_string(),
            },
        ],
    })
}

#[derive(serde::Serialize)]
pub struct QuickStartGuide {
    pub title: String,
    pub steps: Vec<QuickStartStep>,
    pub resources: Vec<QuickStartResource>,
}

#[derive(serde::Serialize)]
pub struct QuickStartStep {
    pub order: i32,
    pub title: String,
    pub description: String,
    pub command: Option<String>,
    pub completed: bool,
}

#[derive(serde::Serialize)]
pub struct QuickStartResource {
    pub title: String,
    pub url: String,
    pub icon: String,
}
