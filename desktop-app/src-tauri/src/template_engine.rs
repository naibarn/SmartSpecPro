// Template Engine - Product Template Wizard Backend
//
// Provides:
// - Template registry and discovery
// - Configuration parsing and validation
// - Project generation from templates
// - Post-generation hooks

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use handlebars::Handlebars;

// ============================================
// Types
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateRegistry {
    pub version: String,
    pub templates: Vec<TemplateEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateEntry {
    pub id: String,
    pub name: String,
    pub category: TemplateCategory,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TemplateCategory {
    Saas,
    Ecommerce,
    Mobile,
    Api,
    Dashboard,
    Landing,
    Blog,
    Portfolio,
    Custom,
}

impl std::fmt::Display for TemplateCategory {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Saas => write!(f, "SaaS"),
            Self::Ecommerce => write!(f, "E-commerce"),
            Self::Mobile => write!(f, "Mobile App"),
            Self::Api => write!(f, "API"),
            Self::Dashboard => write!(f, "Dashboard"),
            Self::Landing => write!(f, "Landing Page"),
            Self::Blog => write!(f, "Blog"),
            Self::Portfolio => write!(f, "Portfolio"),
            Self::Custom => write!(f, "Custom"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateMetadata {
    pub id: String,
    pub name: String,
    pub description: String,
    pub version: String,
    pub category: TemplateCategory,
    pub tags: Vec<String>,
    pub tech_stack: TechStack,
    pub features: Vec<TemplateFeature>,
    pub complexity: Complexity,
    pub estimated_time: String,
    pub preview_image: Option<String>,
    pub author: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TechStack {
    pub frontend: Option<String>,
    pub backend: Option<String>,
    pub database: Option<String>,
    pub auth: Option<String>,
    pub payment: Option<String>,
    pub hosting: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateFeature {
    pub id: String,
    pub name: String,
    pub description: String,
    pub required: bool,
    #[serde(default)]
    pub default: bool,
    pub dependencies: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Complexity {
    Beginner,
    Intermediate,
    Advanced,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigSchema {
    pub fields: Vec<ConfigField>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigField {
    pub id: String,
    pub name: String,
    pub field_type: ConfigFieldType,
    pub required: bool,
    pub default: Option<serde_json::Value>,
    pub validation: Option<ValidationRule>,
    pub options: Option<Vec<ConfigOption>>,
    pub depends_on: Option<String>,
    pub help_text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConfigFieldType {
    Text,
    Number,
    Boolean,
    Select,
    MultiSelect,
    Color,
    File,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigOption {
    pub value: String,
    pub label: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationRule {
    pub pattern: Option<String>,
    pub min: Option<i64>,
    pub max: Option<i64>,
    pub min_length: Option<usize>,
    pub max_length: Option<usize>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectConfig {
    pub template_id: String,
    pub project_name: String,
    pub project_description: Option<String>,
    pub output_path: String,
    pub features: Vec<String>,
    pub variables: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerationResult {
    pub success: bool,
    pub project_path: String,
    pub files_created: Vec<String>,
    pub warnings: Vec<String>,
    pub next_steps: Vec<NextStep>,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NextStep {
    pub title: String,
    pub description: String,
    pub command: Option<String>,
    pub link: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerationProgress {
    pub stage: String,
    pub percent: u8,
    pub current_file: Option<String>,
    pub message: String,
}

// ============================================
// Template Engine
// ============================================

pub struct TemplateEngine {
    templates_dir: PathBuf,
    handlebars: Handlebars<'static>,
    registry: Option<TemplateRegistry>,
}

impl TemplateEngine {
    pub fn new(templates_dir: PathBuf) -> Self {
        let mut handlebars = Handlebars::new();
        handlebars.set_strict_mode(false);
        
        // Register custom helpers
        Self::register_helpers(&mut handlebars);
        
        Self {
            templates_dir,
            handlebars,
            registry: None,
        }
    }

    fn register_helpers(handlebars: &mut Handlebars) {
        // lowercase helper
        handlebars.register_helper("lowercase", Box::new(|h: &handlebars::Helper, _: &Handlebars, _: &handlebars::Context, _: &mut handlebars::RenderContext, out: &mut dyn handlebars::Output| {
            let param = h.param(0).and_then(|v| v.value().as_str()).unwrap_or("");
            out.write(&param.to_lowercase())?;
            Ok(())
        }));

        // uppercase helper
        handlebars.register_helper("uppercase", Box::new(|h: &handlebars::Helper, _: &Handlebars, _: &handlebars::Context, _: &mut handlebars::RenderContext, out: &mut dyn handlebars::Output| {
            let param = h.param(0).and_then(|v| v.value().as_str()).unwrap_or("");
            out.write(&param.to_uppercase())?;
            Ok(())
        }));

        // camelCase helper
        handlebars.register_helper("camelCase", Box::new(|h: &handlebars::Helper, _: &Handlebars, _: &handlebars::Context, _: &mut handlebars::RenderContext, out: &mut dyn handlebars::Output| {
            let param = h.param(0).and_then(|v| v.value().as_str()).unwrap_or("");
            let result = to_camel_case(param);
            out.write(&result)?;
            Ok(())
        }));

        // PascalCase helper
        handlebars.register_helper("pascalCase", Box::new(|h: &handlebars::Helper, _: &Handlebars, _: &handlebars::Context, _: &mut handlebars::RenderContext, out: &mut dyn handlebars::Output| {
            let param = h.param(0).and_then(|v| v.value().as_str()).unwrap_or("");
            let result = to_pascal_case(param);
            out.write(&result)?;
            Ok(())
        }));

        // snake_case helper
        handlebars.register_helper("snakeCase", Box::new(|h: &handlebars::Helper, _: &Handlebars, _: &handlebars::Context, _: &mut handlebars::RenderContext, out: &mut dyn handlebars::Output| {
            let param = h.param(0).and_then(|v| v.value().as_str()).unwrap_or("");
            let result = to_snake_case(param);
            out.write(&result)?;
            Ok(())
        }));

        // kebab-case helper
        handlebars.register_helper("kebabCase", Box::new(|h: &handlebars::Helper, _: &Handlebars, _: &handlebars::Context, _: &mut handlebars::RenderContext, out: &mut dyn handlebars::Output| {
            let param = h.param(0).and_then(|v| v.value().as_str()).unwrap_or("");
            let result = to_kebab_case(param);
            out.write(&result)?;
            Ok(())
        }));
    }

    // ============================================
    // Registry Operations
    // ============================================

    pub async fn load_registry(&mut self) -> Result<&TemplateRegistry, String> {
        let registry_path = self.templates_dir.join("registry.json");
        
        if !registry_path.exists() {
            // Create default registry
            let default_registry = self.create_default_registry();
            self.registry = Some(default_registry);
            return Ok(self.registry.as_ref().unwrap());
        }

        let content = tokio::fs::read_to_string(&registry_path)
            .await
            .map_err(|e| format!("Failed to read registry: {}", e))?;

        let registry: TemplateRegistry = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse registry: {}", e))?;

        self.registry = Some(registry);
        Ok(self.registry.as_ref().unwrap())
    }

    fn create_default_registry(&self) -> TemplateRegistry {
        TemplateRegistry {
            version: "1.0.0".to_string(),
            templates: vec![
                TemplateEntry {
                    id: "saas-starter".to_string(),
                    name: "SaaS Starter".to_string(),
                    category: TemplateCategory::Saas,
                    path: "saas".to_string(),
                },
                TemplateEntry {
                    id: "ecommerce-store".to_string(),
                    name: "E-commerce Store".to_string(),
                    category: TemplateCategory::Ecommerce,
                    path: "ecommerce".to_string(),
                },
                TemplateEntry {
                    id: "mobile-app".to_string(),
                    name: "Mobile App".to_string(),
                    category: TemplateCategory::Mobile,
                    path: "mobile".to_string(),
                },
                TemplateEntry {
                    id: "rest-api".to_string(),
                    name: "REST API".to_string(),
                    category: TemplateCategory::Api,
                    path: "api".to_string(),
                },
                TemplateEntry {
                    id: "admin-dashboard".to_string(),
                    name: "Admin Dashboard".to_string(),
                    category: TemplateCategory::Dashboard,
                    path: "dashboard".to_string(),
                },
                TemplateEntry {
                    id: "landing-page".to_string(),
                    name: "Landing Page".to_string(),
                    category: TemplateCategory::Landing,
                    path: "landing".to_string(),
                },
            ],
        }
    }

    pub fn list_templates(&self) -> Vec<TemplateEntry> {
        self.registry.as_ref()
            .map(|r| r.templates.clone())
            .unwrap_or_default()
    }

    pub fn search_templates(&self, query: &str, category: Option<TemplateCategory>) -> Vec<TemplateEntry> {
        let templates = self.list_templates();
        let query_lower = query.to_lowercase();

        templates.into_iter()
            .filter(|t| {
                let matches_query = query.is_empty() || 
                    t.name.to_lowercase().contains(&query_lower) ||
                    t.id.to_lowercase().contains(&query_lower);
                
                let matches_category = category.as_ref()
                    .map(|c| std::mem::discriminant(c) == std::mem::discriminant(&t.category))
                    .unwrap_or(true);

                matches_query && matches_category
            })
            .collect()
    }

    // ============================================
    // Template Operations
    // ============================================

    pub async fn get_template_metadata(&self, template_id: &str) -> Result<TemplateMetadata, String> {
        let template_path = self.find_template_path(template_id)?;
        let metadata_path = template_path.join("template.json");

        if !metadata_path.exists() {
            return Ok(self.create_default_metadata(template_id));
        }

        let content = tokio::fs::read_to_string(&metadata_path)
            .await
            .map_err(|e| format!("Failed to read template metadata: {}", e))?;

        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse template metadata: {}", e))
    }

    fn create_default_metadata(&self, template_id: &str) -> TemplateMetadata {
        TemplateMetadata {
            id: template_id.to_string(),
            name: template_id.replace("-", " ").to_string(),
            description: format!("Template for {}", template_id),
            version: "1.0.0".to_string(),
            category: TemplateCategory::Custom,
            tags: vec![],
            tech_stack: TechStack {
                frontend: Some("React + TypeScript".to_string()),
                backend: Some("Node.js".to_string()),
                database: Some("SQLite".to_string()),
                auth: None,
                payment: None,
                hosting: None,
            },
            features: vec![],
            complexity: Complexity::Beginner,
            estimated_time: "30 minutes".to_string(),
            preview_image: None,
            author: None,
        }
    }

    pub async fn get_config_schema(&self, template_id: &str) -> Result<ConfigSchema, String> {
        let template_path = self.find_template_path(template_id)?;
        let schema_path = template_path.join("config-schema.json");

        if !schema_path.exists() {
            return Ok(self.create_default_schema());
        }

        let content = tokio::fs::read_to_string(&schema_path)
            .await
            .map_err(|e| format!("Failed to read config schema: {}", e))?;

        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse config schema: {}", e))
    }

    fn create_default_schema(&self) -> ConfigSchema {
        ConfigSchema {
            fields: vec![
                ConfigField {
                    id: "project_name".to_string(),
                    name: "Project Name".to_string(),
                    field_type: ConfigFieldType::Text,
                    required: true,
                    default: None,
                    validation: Some(ValidationRule {
                        pattern: Some(r"^[a-z][a-z0-9-]*$".to_string()),
                        min: None,
                        max: None,
                        min_length: Some(3),
                        max_length: Some(50),
                        message: "Project name must be lowercase, start with a letter, and contain only letters, numbers, and hyphens".to_string(),
                    }),
                    options: None,
                    depends_on: None,
                    help_text: Some("The name of your project (will be used as directory name)".to_string()),
                },
                ConfigField {
                    id: "description".to_string(),
                    name: "Description".to_string(),
                    field_type: ConfigFieldType::Text,
                    required: false,
                    default: None,
                    validation: None,
                    options: None,
                    depends_on: None,
                    help_text: Some("A brief description of your project".to_string()),
                },
            ],
        }
    }

    fn find_template_path(&self, template_id: &str) -> Result<PathBuf, String> {
        // First check registry
        if let Some(registry) = &self.registry {
            if let Some(entry) = registry.templates.iter().find(|t| t.id == template_id) {
                let path = self.templates_dir.join(&entry.path);
                if path.exists() {
                    return Ok(path);
                }
            }
        }

        // Try direct path
        let direct_path = self.templates_dir.join(template_id);
        if direct_path.exists() {
            return Ok(direct_path);
        }

        Err(format!("Template not found: {}", template_id))
    }

    // ============================================
    // Project Generation
    // ============================================

    pub async fn generate_project(
        &self,
        config: ProjectConfig,
        progress_callback: impl Fn(GenerationProgress) + Send + 'static,
    ) -> Result<GenerationResult, String> {
        let start = std::time::Instant::now();
        let mut files_created = Vec::new();
        let mut warnings = Vec::new();

        // Stage 1: Validate config
        progress_callback(GenerationProgress {
            stage: "validate".to_string(),
            percent: 5,
            current_file: None,
            message: "Validating configuration...".to_string(),
        });

        self.validate_config(&config)?;

        // Stage 2: Prepare output directory
        progress_callback(GenerationProgress {
            stage: "prepare".to_string(),
            percent: 10,
            current_file: None,
            message: "Preparing output directory...".to_string(),
        });

        let output_path = PathBuf::from(&config.output_path).join(&config.project_name);
        if output_path.exists() {
            return Err(format!("Directory already exists: {}", output_path.display()));
        }
        tokio::fs::create_dir_all(&output_path)
            .await
            .map_err(|e| format!("Failed to create directory: {}", e))?;

        // Stage 3: Load template
        progress_callback(GenerationProgress {
            stage: "load".to_string(),
            percent: 15,
            current_file: None,
            message: "Loading template...".to_string(),
        });

        let template_path = self.find_template_path(&config.template_id)?;
        let files_dir = template_path.join("files");

        // Stage 4: Build context
        progress_callback(GenerationProgress {
            stage: "context".to_string(),
            percent: 20,
            current_file: None,
            message: "Building template context...".to_string(),
        });

        let context = self.build_context(&config);

        // Stage 5: Copy and process files
        if files_dir.exists() {
            let file_list = self.collect_template_files(&files_dir).await?;
            let total_files = file_list.len();

            for (i, file_path) in file_list.iter().enumerate() {
                let progress = 20 + ((i as f32 / total_files as f32) * 60.0) as u8;
                let relative_path = file_path.strip_prefix(&files_dir)
                    .map_err(|e| e.to_string())?;

                progress_callback(GenerationProgress {
                    stage: "generate".to_string(),
                    percent: progress,
                    current_file: Some(relative_path.to_string_lossy().to_string()),
                    message: format!("Processing {} of {} files...", i + 1, total_files),
                });

                // Check if file should be included based on features
                if !self.should_include_file(&relative_path, &config.features) {
                    continue;
                }

                let output_file = self.process_file(
                    &file_path,
                    &output_path,
                    &relative_path,
                    &context,
                ).await?;

                files_created.push(output_file);
            }
        } else {
            // Create minimal project structure
            files_created.extend(self.create_minimal_project(&output_path, &context).await?);
        }

        // Stage 6: Run post-generation hooks
        progress_callback(GenerationProgress {
            stage: "hooks".to_string(),
            percent: 85,
            current_file: None,
            message: "Running post-generation hooks...".to_string(),
        });

        if let Err(e) = self.run_post_hooks(&output_path, &config).await {
            warnings.push(format!("Post-hook warning: {}", e));
        }

        // Stage 7: Initialize Git
        progress_callback(GenerationProgress {
            stage: "git".to_string(),
            percent: 90,
            current_file: None,
            message: "Initializing Git repository...".to_string(),
        });

        if let Err(e) = self.init_git(&output_path).await {
            warnings.push(format!("Git init warning: {}", e));
        }

        // Stage 8: Complete
        progress_callback(GenerationProgress {
            stage: "complete".to_string(),
            percent: 100,
            current_file: None,
            message: "Project generated successfully!".to_string(),
        });

        let next_steps = self.get_next_steps(&config);

        Ok(GenerationResult {
            success: true,
            project_path: output_path.to_string_lossy().to_string(),
            files_created,
            warnings,
            next_steps,
            duration_ms: start.elapsed().as_millis() as u64,
        })
    }

    fn validate_config(&self, config: &ProjectConfig) -> Result<(), String> {
        if config.project_name.is_empty() {
            return Err("Project name is required".to_string());
        }

        // Validate project name format
        let name_regex = regex::Regex::new(r"^[a-z][a-z0-9-]*$").unwrap();
        if !name_regex.is_match(&config.project_name) {
            return Err("Invalid project name format".to_string());
        }

        if config.output_path.is_empty() {
            return Err("Output path is required".to_string());
        }

        Ok(())
    }

    fn build_context(&self, config: &ProjectConfig) -> serde_json::Value {
        let mut context = serde_json::json!({
            "project_name": config.project_name,
            "project_description": config.project_description.clone().unwrap_or_default(),
            "features": config.features,
            "year": chrono::Utc::now().format("%Y").to_string(),
            "date": chrono::Utc::now().format("%Y-%m-%d").to_string(),
        });

        // Add feature flags
        for feature in &config.features {
            context[format!("feature_{}", feature)] = serde_json::Value::Bool(true);
        }

        // Add custom variables
        if let serde_json::Value::Object(ref mut map) = context {
            for (key, value) in &config.variables {
                map.insert(key.clone(), value.clone());
            }
        }

        context
    }

    async fn collect_template_files(&self, dir: &Path) -> Result<Vec<PathBuf>, String> {
        let mut files = Vec::new();
        let mut stack = vec![dir.to_path_buf()];

        while let Some(current) = stack.pop() {
            let mut entries = tokio::fs::read_dir(&current)
                .await
                .map_err(|e| format!("Failed to read directory: {}", e))?;

            while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
                let path = entry.path();
                if path.is_dir() {
                    stack.push(path);
                } else {
                    files.push(path);
                }
            }
        }

        Ok(files)
    }

    fn should_include_file(&self, path: &Path, features: &[String]) -> bool {
        let path_str = path.to_string_lossy();
        
        // Check for feature-specific directories
        if path_str.contains("__feature_") {
            for feature in features {
                if path_str.contains(&format!("__feature_{}__", feature)) {
                    return true;
                }
            }
            return false;
        }

        true
    }

    async fn process_file(
        &self,
        source: &Path,
        output_dir: &Path,
        relative_path: &Path,
        context: &serde_json::Value,
    ) -> Result<String, String> {
        // Process output path (remove .hbs extension, replace variables)
        let mut output_path = output_dir.join(relative_path);
        let file_name = output_path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");

        // Remove .hbs extension
        if file_name.ends_with(".hbs") {
            output_path = output_path.with_file_name(&file_name[..file_name.len() - 4]);
        }

        // Remove feature markers from path
        let output_path_str = output_path.to_string_lossy()
            .replace("__feature_", "")
            .replace("__", "/");
        let output_path = PathBuf::from(output_path_str);

        // Create parent directories
        if let Some(parent) = output_path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        }

        // Read source file
        let content = tokio::fs::read_to_string(source)
            .await
            .map_err(|e| format!("Failed to read file: {}", e))?;

        // Process template if it's a .hbs file
        let processed = if file_name.ends_with(".hbs") {
            self.handlebars.render_template(&content, context)
                .map_err(|e| format!("Template error: {}", e))?
        } else {
            content
        };

        // Write output file
        tokio::fs::write(&output_path, processed)
            .await
            .map_err(|e| format!("Failed to write file: {}", e))?;

        Ok(output_path.to_string_lossy().to_string())
    }

    async fn create_minimal_project(&self, output_path: &Path, context: &serde_json::Value) -> Result<Vec<String>, String> {
        let mut files = Vec::new();
        let project_name = context["project_name"].as_str().unwrap_or("project");
        let description = context["project_description"].as_str().unwrap_or("");

        // Create README.md
        let readme = format!(r#"# {}

{}

## Getting Started

This project was generated by SmartSpecPro Template Wizard.

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

## License

MIT
"#, project_name, description);

        let readme_path = output_path.join("README.md");
        tokio::fs::write(&readme_path, readme).await.map_err(|e| e.to_string())?;
        files.push(readme_path.to_string_lossy().to_string());

        // Create package.json
        let package_json = serde_json::json!({
            "name": project_name,
            "version": "0.1.0",
            "description": description,
            "scripts": {
                "dev": "echo 'Add your dev script here'",
                "build": "echo 'Add your build script here'",
                "test": "echo 'Add your test script here'"
            }
        });

        let package_path = output_path.join("package.json");
        tokio::fs::write(&package_path, serde_json::to_string_pretty(&package_json).unwrap())
            .await.map_err(|e| e.to_string())?;
        files.push(package_path.to_string_lossy().to_string());

        // Create .gitignore
        let gitignore = r#"node_modules/
dist/
.env
.env.local
*.log
.DS_Store
"#;
        let gitignore_path = output_path.join(".gitignore");
        tokio::fs::write(&gitignore_path, gitignore).await.map_err(|e| e.to_string())?;
        files.push(gitignore_path.to_string_lossy().to_string());

        Ok(files)
    }

    async fn run_post_hooks(&self, _output_path: &Path, _config: &ProjectConfig) -> Result<(), String> {
        // TODO: Implement post-generation hooks
        Ok(())
    }

    async fn init_git(&self, output_path: &Path) -> Result<(), String> {
        let output = tokio::process::Command::new("git")
            .arg("init")
            .current_dir(output_path)
            .output()
            .await
            .map_err(|e| format!("Failed to run git init: {}", e))?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }

        // Create initial commit
        let _ = tokio::process::Command::new("git")
            .args(["add", "."])
            .current_dir(output_path)
            .output()
            .await;

        let _ = tokio::process::Command::new("git")
            .args(["commit", "-m", "Initial commit from SmartSpecPro"])
            .current_dir(output_path)
            .output()
            .await;

        Ok(())
    }

    fn get_next_steps(&self, config: &ProjectConfig) -> Vec<NextStep> {
        vec![
            NextStep {
                title: "Navigate to project".to_string(),
                description: "Open your new project directory".to_string(),
                command: Some(format!("cd {}", config.project_name)),
                link: None,
            },
            NextStep {
                title: "Install dependencies".to_string(),
                description: "Install project dependencies".to_string(),
                command: Some("npm install".to_string()),
                link: None,
            },
            NextStep {
                title: "Start development".to_string(),
                description: "Run the development server".to_string(),
                command: Some("npm run dev".to_string()),
                link: None,
            },
            NextStep {
                title: "Read documentation".to_string(),
                description: "Learn more about your template".to_string(),
                command: None,
                link: Some("https://docs.smartspecpro.com".to_string()),
            },
        ]
    }
}

// ============================================
// Helper Functions
// ============================================

fn to_camel_case(s: &str) -> String {
    let mut result = String::new();
    let mut capitalize_next = false;
    
    for (i, c) in s.chars().enumerate() {
        if c == '-' || c == '_' || c == ' ' {
            capitalize_next = true;
        } else if capitalize_next {
            result.push(c.to_ascii_uppercase());
            capitalize_next = false;
        } else if i == 0 {
            result.push(c.to_ascii_lowercase());
        } else {
            result.push(c);
        }
    }
    
    result
}

fn to_pascal_case(s: &str) -> String {
    let camel = to_camel_case(s);
    let mut chars = camel.chars();
    match chars.next() {
        None => String::new(),
        Some(c) => c.to_uppercase().collect::<String>() + chars.as_str(),
    }
}

fn to_snake_case(s: &str) -> String {
    let mut result = String::new();
    
    for (i, c) in s.chars().enumerate() {
        if c == '-' || c == ' ' {
            result.push('_');
        } else if c.is_uppercase() && i > 0 {
            result.push('_');
            result.push(c.to_ascii_lowercase());
        } else {
            result.push(c.to_ascii_lowercase());
        }
    }
    
    result
}

fn to_kebab_case(s: &str) -> String {
    let mut result = String::new();
    
    for (i, c) in s.chars().enumerate() {
        if c == '_' || c == ' ' {
            result.push('-');
        } else if c.is_uppercase() && i > 0 {
            result.push('-');
            result.push(c.to_ascii_lowercase());
        } else {
            result.push(c.to_ascii_lowercase());
        }
    }
    
    result
}
