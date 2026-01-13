# Sprint 2.1: Product Template Wizard

**Duration:** 2 สัปดาห์ (10-14 วันทำงาน)  
**Priority:** Critical  
**Dependencies:** Phase 1 Complete  

---

## 🎯 Sprint Goal

สร้าง Template Wizard ที่ช่วยให้ผู้ใช้สามารถเริ่มต้นโปรเจคได้อย่างรวดเร็วโดย:
1. เลือก template ที่เหมาะสมกับ product type
2. กำหนด configuration ผ่าน wizard
3. Generate project structure อัตโนมัติ
4. Setup workspace พร้อมใช้งานทันที

---

## 📋 User Stories

### US-2.1.1: Template Selection
> **As a** non-technical user  
> **I want** to browse and select from pre-built templates  
> **So that** I can start my project without technical knowledge

**Acceptance Criteria:**
- [ ] แสดง template categories (SaaS, E-commerce, Mobile, API, etc.)
- [ ] แสดง preview และ description ของแต่ละ template
- [ ] Filter และ search templates ได้
- [ ] แสดง tech stack ที่ใช้ในแต่ละ template
- [ ] แสดง estimated time และ complexity

### US-2.1.2: Configuration Wizard
> **As a** user  
> **I want** to configure my project through a step-by-step wizard  
> **So that** I can customize the template to my needs

**Acceptance Criteria:**
- [ ] Step-by-step wizard UI
- [ ] Project name และ description
- [ ] Feature selection (checkboxes)
- [ ] Tech stack options (if applicable)
- [ ] Integration selection (payment, auth, etc.)
- [ ] Validation และ error messages

### US-2.1.3: Project Generation
> **As a** user  
> **I want** the system to generate my project automatically  
> **So that** I can start working immediately

**Acceptance Criteria:**
- [ ] Generate project files จาก template
- [ ] Replace variables ตาม configuration
- [ ] Setup Git repository
- [ ] Create initial spec document
- [ ] Setup workspace database
- [ ] Show progress และ completion status

### US-2.1.4: Quick Start Guide
> **As a** new user  
> **I want** to see a quick start guide after project creation  
> **So that** I know what to do next

**Acceptance Criteria:**
- [ ] แสดง next steps หลังสร้างโปรเจค
- [ ] Link ไปยัง documentation
- [ ] Suggested first tasks
- [ ] Tutorial walkthrough (optional)

---

## 🏗️ Technical Architecture

### Template Engine

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           TEMPLATE ENGINE                                        │
└─────────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
    │   TEMPLATE   │     │   CONFIG     │     │   GENERATOR  │     │   POST-GEN   │
    │   REGISTRY   │ ──► │   PARSER     │ ──► │   ENGINE     │ ──► │   HOOKS      │
    │              │     │              │     │              │     │              │
    │ • Load       │     │ • Validate   │     │ • Copy files │     │ • Git init   │
    │ • Index      │     │ • Transform  │     │ • Replace    │     │ • npm install│
    │ • Search     │     │ • Defaults   │     │   variables  │     │ • Setup DB   │
    │              │     │              │     │ • Conditionals│    │ • Create spec│
    └──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

### Template Structure

```
templates/
├── registry.json                 # Template index
├── saas/
│   ├── template.json            # Template metadata
│   ├── config-schema.json       # Configuration schema
│   ├── files/                   # Template files
│   │   ├── package.json.hbs     # Handlebars template
│   │   ├── src/
│   │   │   ├── app.tsx.hbs
│   │   │   └── ...
│   │   └── ...
│   ├── hooks/
│   │   ├── pre-generate.js      # Pre-generation hook
│   │   └── post-generate.js     # Post-generation hook
│   └── docs/
│       ├── README.md
│       └── QUICK_START.md
├── ecommerce/
│   └── ...
├── mobile/
│   └── ...
└── api/
    └── ...
```

### Template Metadata (template.json)

```json
{
  "id": "saas-starter",
  "name": "SaaS Starter",
  "description": "Full-featured SaaS application with auth, billing, and dashboard",
  "version": "1.0.0",
  "category": "saas",
  "tags": ["saas", "subscription", "dashboard", "auth"],
  "techStack": {
    "frontend": "React + TypeScript + TailwindCSS",
    "backend": "Node.js + Express + Prisma",
    "database": "PostgreSQL",
    "auth": "NextAuth.js",
    "payment": "Stripe"
  },
  "features": [
    {
      "id": "auth",
      "name": "Authentication",
      "description": "User registration, login, password reset",
      "required": true
    },
    {
      "id": "billing",
      "name": "Subscription Billing",
      "description": "Stripe integration with subscription plans",
      "required": false,
      "default": true
    },
    {
      "id": "dashboard",
      "name": "Admin Dashboard",
      "description": "Analytics and user management",
      "required": false,
      "default": true
    },
    {
      "id": "api",
      "name": "REST API",
      "description": "Public API with rate limiting",
      "required": false,
      "default": false
    }
  ],
  "estimatedTime": "2-4 weeks",
  "complexity": "intermediate",
  "preview": {
    "thumbnail": "preview/thumbnail.png",
    "screenshots": [
      "preview/dashboard.png",
      "preview/billing.png"
    ],
    "demo": "https://demo.saas-starter.example.com"
  }
}
```

### Configuration Schema (config-schema.json)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["projectName", "description"],
  "properties": {
    "projectName": {
      "type": "string",
      "title": "Project Name",
      "description": "Name of your project (lowercase, no spaces)",
      "pattern": "^[a-z][a-z0-9-]*$",
      "minLength": 3,
      "maxLength": 50
    },
    "description": {
      "type": "string",
      "title": "Description",
      "description": "Brief description of your project",
      "maxLength": 200
    },
    "features": {
      "type": "object",
      "title": "Features",
      "properties": {
        "auth": {
          "type": "boolean",
          "title": "Authentication",
          "default": true
        },
        "billing": {
          "type": "boolean",
          "title": "Subscription Billing",
          "default": true
        },
        "dashboard": {
          "type": "boolean",
          "title": "Admin Dashboard",
          "default": true
        },
        "api": {
          "type": "boolean",
          "title": "REST API",
          "default": false
        }
      }
    },
    "integrations": {
      "type": "object",
      "title": "Integrations",
      "properties": {
        "stripe": {
          "type": "boolean",
          "title": "Stripe Payment",
          "default": true
        },
        "sendgrid": {
          "type": "boolean",
          "title": "SendGrid Email",
          "default": false
        },
        "analytics": {
          "type": "string",
          "title": "Analytics Provider",
          "enum": ["none", "google", "mixpanel", "posthog"],
          "default": "none"
        }
      }
    },
    "deployment": {
      "type": "string",
      "title": "Deployment Target",
      "enum": ["vercel", "railway", "docker", "manual"],
      "default": "vercel"
    }
  }
}
```

---

## 📁 Implementation Tasks

### Week 1: Template Engine & Registry

#### Task 2.1.1: Template Registry (Rust)
**File:** `desktop-app/src-tauri/src/template_engine/registry.rs`

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateMetadata {
    pub id: String,
    pub name: String,
    pub description: String,
    pub version: String,
    pub category: String,
    pub tags: Vec<String>,
    pub tech_stack: TechStack,
    pub features: Vec<Feature>,
    pub estimated_time: String,
    pub complexity: String,
    pub preview: Preview,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TechStack {
    pub frontend: String,
    pub backend: String,
    pub database: String,
    pub auth: Option<String>,
    pub payment: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Feature {
    pub id: String,
    pub name: String,
    pub description: String,
    pub required: bool,
    pub default: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Preview {
    pub thumbnail: String,
    pub screenshots: Vec<String>,
    pub demo: Option<String>,
}

pub struct TemplateRegistry {
    templates: HashMap<String, TemplateMetadata>,
    templates_dir: PathBuf,
}

impl TemplateRegistry {
    pub fn new(templates_dir: PathBuf) -> Result<Self, Error> {
        let mut registry = Self {
            templates: HashMap::new(),
            templates_dir,
        };
        registry.load_templates()?;
        Ok(registry)
    }
    
    fn load_templates(&mut self) -> Result<(), Error> {
        let registry_path = self.templates_dir.join("registry.json");
        
        if registry_path.exists() {
            let content = std::fs::read_to_string(&registry_path)?;
            let index: Vec<String> = serde_json::from_str(&content)?;
            
            for template_id in index {
                let template_path = self.templates_dir.join(&template_id).join("template.json");
                if template_path.exists() {
                    let template_content = std::fs::read_to_string(&template_path)?;
                    let metadata: TemplateMetadata = serde_json::from_str(&template_content)?;
                    self.templates.insert(template_id, metadata);
                }
            }
        }
        
        Ok(())
    }
    
    pub fn list_all(&self) -> Vec<&TemplateMetadata> {
        self.templates.values().collect()
    }
    
    pub fn list_by_category(&self, category: &str) -> Vec<&TemplateMetadata> {
        self.templates
            .values()
            .filter(|t| t.category == category)
            .collect()
    }
    
    pub fn search(&self, query: &str) -> Vec<&TemplateMetadata> {
        let query_lower = query.to_lowercase();
        self.templates
            .values()
            .filter(|t| {
                t.name.to_lowercase().contains(&query_lower)
                    || t.description.to_lowercase().contains(&query_lower)
                    || t.tags.iter().any(|tag| tag.to_lowercase().contains(&query_lower))
            })
            .collect()
    }
    
    pub fn get(&self, id: &str) -> Option<&TemplateMetadata> {
        self.templates.get(id)
    }
    
    pub fn get_config_schema(&self, id: &str) -> Result<serde_json::Value, Error> {
        let schema_path = self.templates_dir
            .join(id)
            .join("config-schema.json");
        
        let content = std::fs::read_to_string(&schema_path)?;
        let schema: serde_json::Value = serde_json::from_str(&content)?;
        Ok(schema)
    }
}
```

**Deliverables:**
- [ ] Template metadata structure
- [ ] Registry loading
- [ ] Search and filter
- [ ] Config schema loading

#### Task 2.1.2: Template Generator (Rust)
**File:** `desktop-app/src-tauri/src/template_engine/generator.rs`

```rust
use handlebars::Handlebars;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

pub struct TemplateGenerator {
    handlebars: Handlebars<'static>,
    templates_dir: PathBuf,
}

impl TemplateGenerator {
    pub fn new(templates_dir: PathBuf) -> Self {
        let mut handlebars = Handlebars::new();
        handlebars.set_strict_mode(true);
        
        // Register custom helpers
        handlebars.register_helper("lowercase", Box::new(lowercase_helper));
        handlebars.register_helper("uppercase", Box::new(uppercase_helper));
        handlebars.register_helper("camelCase", Box::new(camel_case_helper));
        handlebars.register_helper("pascalCase", Box::new(pascal_case_helper));
        handlebars.register_helper("kebabCase", Box::new(kebab_case_helper));
        handlebars.register_helper("if_feature", Box::new(if_feature_helper));
        
        Self {
            handlebars,
            templates_dir,
        }
    }
    
    pub async fn generate(
        &self,
        template_id: &str,
        config: &serde_json::Value,
        output_dir: &Path,
        progress_callback: impl Fn(GenerationProgress),
    ) -> Result<GenerationResult, Error> {
        let template_dir = self.templates_dir.join(template_id);
        let files_dir = template_dir.join("files");
        
        // 1. Run pre-generation hook
        progress_callback(GenerationProgress::PreHook);
        self.run_hook(&template_dir, "pre-generate", config).await?;
        
        // 2. Count total files
        let total_files = WalkDir::new(&files_dir)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
            .count();
        
        // 3. Generate files
        let mut generated_files = Vec::new();
        let mut current = 0;
        
        for entry in WalkDir::new(&files_dir) {
            let entry = entry?;
            if entry.file_type().is_file() {
                let relative_path = entry.path().strip_prefix(&files_dir)?;
                let output_path = self.process_path(relative_path, config)?;
                let full_output_path = output_dir.join(&output_path);
                
                // Create parent directories
                if let Some(parent) = full_output_path.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                
                // Check if file should be included (conditional)
                if !self.should_include_file(&relative_path, config)? {
                    continue;
                }
                
                // Process file content
                let content = std::fs::read_to_string(entry.path())?;
                let processed = if entry.path().extension().map_or(false, |ext| ext == "hbs") {
                    // Remove .hbs extension from output
                    let output_path = output_path.with_extension("");
                    self.handlebars.render_template(&content, config)?
                } else {
                    content
                };
                
                std::fs::write(&full_output_path, processed)?;
                generated_files.push(output_path.to_string_lossy().to_string());
                
                current += 1;
                progress_callback(GenerationProgress::File {
                    current,
                    total: total_files,
                    file: output_path.to_string_lossy().to_string(),
                });
            }
        }
        
        // 4. Run post-generation hook
        progress_callback(GenerationProgress::PostHook);
        self.run_hook(&template_dir, "post-generate", config).await?;
        
        // 5. Initialize Git
        progress_callback(GenerationProgress::GitInit);
        self.init_git(output_dir).await?;
        
        // 6. Create workspace database
        progress_callback(GenerationProgress::WorkspaceSetup);
        self.setup_workspace(output_dir, config).await?;
        
        progress_callback(GenerationProgress::Complete);
        
        Ok(GenerationResult {
            output_dir: output_dir.to_path_buf(),
            files_generated: generated_files.len(),
            files: generated_files,
        })
    }
    
    fn process_path(&self, path: &Path, config: &serde_json::Value) -> Result<PathBuf, Error> {
        let path_str = path.to_string_lossy();
        
        // Replace {{projectName}} in path
        let processed = self.handlebars.render_template(&path_str, config)?;
        
        // Remove .hbs extension
        let processed = processed.trim_end_matches(".hbs");
        
        Ok(PathBuf::from(processed))
    }
    
    fn should_include_file(&self, path: &Path, config: &serde_json::Value) -> Result<bool, Error> {
        let path_str = path.to_string_lossy();
        
        // Check for feature conditionals in path
        // e.g., [billing]/stripe.ts only included if billing feature is enabled
        if let Some(captures) = FEATURE_PATTERN.captures(&path_str) {
            let feature = &captures[1];
            if let Some(features) = config.get("features") {
                if let Some(enabled) = features.get(feature) {
                    return Ok(enabled.as_bool().unwrap_or(false));
                }
            }
            return Ok(false);
        }
        
        Ok(true)
    }
    
    async fn run_hook(
        &self,
        template_dir: &Path,
        hook_name: &str,
        config: &serde_json::Value,
    ) -> Result<(), Error> {
        let hook_path = template_dir.join("hooks").join(format!("{}.js", hook_name));
        
        if hook_path.exists() {
            // Run hook with Node.js
            let output = tokio::process::Command::new("node")
                .arg(&hook_path)
                .arg(serde_json::to_string(config)?)
                .current_dir(template_dir)
                .output()
                .await?;
            
            if !output.status.success() {
                return Err(Error::HookFailed(
                    String::from_utf8_lossy(&output.stderr).to_string()
                ));
            }
        }
        
        Ok(())
    }
    
    async fn init_git(&self, dir: &Path) -> Result<(), Error> {
        tokio::process::Command::new("git")
            .args(["init"])
            .current_dir(dir)
            .output()
            .await?;
        
        tokio::process::Command::new("git")
            .args(["add", "."])
            .current_dir(dir)
            .output()
            .await?;
        
        tokio::process::Command::new("git")
            .args(["commit", "-m", "Initial commit from SmartSpecPro template"])
            .current_dir(dir)
            .output()
            .await?;
        
        Ok(())
    }
    
    async fn setup_workspace(&self, dir: &Path, config: &serde_json::Value) -> Result<(), Error> {
        // Create workspace.db and initialize schema
        let db_path = dir.join("workspace.db");
        let db = WorkspaceDatabase::create(&db_path)?;
        
        // Create initial spec from template
        let spec_content = self.generate_initial_spec(config)?;
        db.save_knowledge(Knowledge {
            id: uuid::Uuid::new_v4().to_string(),
            knowledge_type: "spec".to_string(),
            title: format!("{} Specification", config["projectName"].as_str().unwrap_or("Project")),
            content: spec_content,
            ..Default::default()
        })?;
        
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub enum GenerationProgress {
    PreHook,
    File { current: usize, total: usize, file: String },
    PostHook,
    GitInit,
    WorkspaceSetup,
    Complete,
}

#[derive(Debug, Clone)]
pub struct GenerationResult {
    pub output_dir: PathBuf,
    pub files_generated: usize,
    pub files: Vec<String>,
}
```

**Deliverables:**
- [ ] Handlebars template processing
- [ ] Variable substitution
- [ ] Conditional file inclusion
- [ ] Hook execution
- [ ] Git initialization
- [ ] Workspace setup

#### Task 2.1.3: Tauri Commands
**File:** `desktop-app/src-tauri/src/template_engine/commands.rs`

```rust
use tauri::State;

#[tauri::command]
pub async fn list_templates(
    registry: State<'_, TemplateRegistry>,
) -> Result<Vec<TemplateMetadata>, String> {
    Ok(registry.list_all().into_iter().cloned().collect())
}

#[tauri::command]
pub async fn list_templates_by_category(
    category: String,
    registry: State<'_, TemplateRegistry>,
) -> Result<Vec<TemplateMetadata>, String> {
    Ok(registry.list_by_category(&category).into_iter().cloned().collect())
}

#[tauri::command]
pub async fn search_templates(
    query: String,
    registry: State<'_, TemplateRegistry>,
) -> Result<Vec<TemplateMetadata>, String> {
    Ok(registry.search(&query).into_iter().cloned().collect())
}

#[tauri::command]
pub async fn get_template(
    id: String,
    registry: State<'_, TemplateRegistry>,
) -> Result<TemplateMetadata, String> {
    registry.get(&id)
        .cloned()
        .ok_or_else(|| format!("Template not found: {}", id))
}

#[tauri::command]
pub async fn get_template_config_schema(
    id: String,
    registry: State<'_, TemplateRegistry>,
) -> Result<serde_json::Value, String> {
    registry.get_config_schema(&id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn generate_project(
    template_id: String,
    config: serde_json::Value,
    output_dir: String,
    generator: State<'_, TemplateGenerator>,
    window: tauri::Window,
) -> Result<GenerationResult, String> {
    let output_path = PathBuf::from(output_dir);
    
    generator.generate(
        &template_id,
        &config,
        &output_path,
        |progress| {
            // Emit progress to frontend
            let _ = window.emit("template:progress", &progress);
        },
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn validate_config(
    template_id: String,
    config: serde_json::Value,
    registry: State<'_, TemplateRegistry>,
) -> Result<ValidationResult, String> {
    let schema = registry.get_config_schema(&template_id)
        .map_err(|e| e.to_string())?;
    
    // Validate config against schema
    let validator = jsonschema::JSONSchema::compile(&schema)
        .map_err(|e| e.to_string())?;
    
    let result = validator.validate(&config);
    
    match result {
        Ok(_) => Ok(ValidationResult { valid: true, errors: vec![] }),
        Err(errors) => Ok(ValidationResult {
            valid: false,
            errors: errors.map(|e| e.to_string()).collect(),
        }),
    }
}
```

**Deliverables:**
- [ ] List templates command
- [ ] Search templates command
- [ ] Get template details command
- [ ] Generate project command
- [ ] Validate config command

---

### Week 2: Frontend UI

#### Task 2.1.4: Template Service (TypeScript)
**File:** `desktop-app/src/services/templateService.ts`

```typescript
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';

export interface TemplateMetadata {
  id: string;
  name: string;
  description: string;
  version: string;
  category: string;
  tags: string[];
  techStack: {
    frontend: string;
    backend: string;
    database: string;
    auth?: string;
    payment?: string;
  };
  features: Feature[];
  estimatedTime: string;
  complexity: 'beginner' | 'intermediate' | 'advanced';
  preview: {
    thumbnail: string;
    screenshots: string[];
    demo?: string;
  };
}

export interface Feature {
  id: string;
  name: string;
  description: string;
  required: boolean;
  default?: boolean;
}

export interface GenerationProgress {
  type: 'PreHook' | 'File' | 'PostHook' | 'GitInit' | 'WorkspaceSetup' | 'Complete';
  current?: number;
  total?: number;
  file?: string;
}

export interface GenerationResult {
  outputDir: string;
  filesGenerated: number;
  files: string[];
}

class TemplateService {
  async listTemplates(): Promise<TemplateMetadata[]> {
    return invoke('list_templates');
  }
  
  async listByCategory(category: string): Promise<TemplateMetadata[]> {
    return invoke('list_templates_by_category', { category });
  }
  
  async searchTemplates(query: string): Promise<TemplateMetadata[]> {
    return invoke('search_templates', { query });
  }
  
  async getTemplate(id: string): Promise<TemplateMetadata> {
    return invoke('get_template', { id });
  }
  
  async getConfigSchema(id: string): Promise<any> {
    return invoke('get_template_config_schema', { id });
  }
  
  async generateProject(
    templateId: string,
    config: Record<string, any>,
    outputDir: string,
    onProgress?: (progress: GenerationProgress) => void
  ): Promise<GenerationResult> {
    // Listen for progress events
    const unlisten = onProgress
      ? await listen<GenerationProgress>('template:progress', (event) => {
          onProgress(event.payload);
        })
      : null;
    
    try {
      const result = await invoke<GenerationResult>('generate_project', {
        templateId,
        config,
        outputDir,
      });
      return result;
    } finally {
      unlisten?.();
    }
  }
  
  async validateConfig(
    templateId: string,
    config: Record<string, any>
  ): Promise<{ valid: boolean; errors: string[] }> {
    return invoke('validate_config', { templateId, config });
  }
}

export const templateService = new TemplateService();
```

**Deliverables:**
- [ ] TypeScript service
- [ ] Progress event handling
- [ ] Type definitions

#### Task 2.1.5: Template Wizard Page
**File:** `desktop-app/src/pages/TemplateWizard/TemplateWizard.tsx`

```typescript
import React, { useState } from 'react';
import { TemplateSelector } from './TemplateSelector';
import { ConfigurationForm } from './ConfigurationForm';
import { PreviewPanel } from './PreviewPanel';
import { GenerationProgress } from './GenerationProgress';
import { QuickStartGuide } from './QuickStartGuide';
import { templateService, TemplateMetadata, GenerationResult } from '@/services/templateService';

type WizardStep = 'select' | 'configure' | 'preview' | 'generate' | 'complete';

export function TemplateWizard() {
  const [step, setStep] = useState<WizardStep>('select');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateMetadata | null>(null);
  const [config, setConfig] = useState<Record<string, any>>({});
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [progressStatus, setProgressStatus] = useState<string>('');
  
  const handleTemplateSelect = async (template: TemplateMetadata) => {
    setSelectedTemplate(template);
    
    // Load default config from schema
    const schema = await templateService.getConfigSchema(template.id);
    const defaults = extractDefaults(schema);
    setConfig(defaults);
    
    setStep('configure');
  };
  
  const handleConfigChange = (newConfig: Record<string, any>) => {
    setConfig(newConfig);
  };
  
  const handlePreview = () => {
    setStep('preview');
  };
  
  const handleGenerate = async () => {
    if (!selectedTemplate) return;
    
    setStep('generate');
    setProgress(0);
    
    try {
      const outputDir = await selectOutputDirectory();
      
      const result = await templateService.generateProject(
        selectedTemplate.id,
        config,
        outputDir,
        (prog) => {
          switch (prog.type) {
            case 'PreHook':
              setProgressStatus('Running pre-generation hooks...');
              setProgress(5);
              break;
            case 'File':
              setProgressStatus(`Generating ${prog.file}...`);
              setProgress(10 + (prog.current! / prog.total!) * 70);
              break;
            case 'PostHook':
              setProgressStatus('Running post-generation hooks...');
              setProgress(85);
              break;
            case 'GitInit':
              setProgressStatus('Initializing Git repository...');
              setProgress(90);
              break;
            case 'WorkspaceSetup':
              setProgressStatus('Setting up workspace...');
              setProgress(95);
              break;
            case 'Complete':
              setProgressStatus('Complete!');
              setProgress(100);
              break;
          }
        }
      );
      
      setResult(result);
      setStep('complete');
    } catch (error) {
      console.error('Generation failed:', error);
      // Handle error
    }
  };
  
  return (
    <div className="template-wizard">
      {/* Progress indicator */}
      <WizardProgress currentStep={step} />
      
      {/* Step content */}
      <div className="wizard-content">
        {step === 'select' && (
          <TemplateSelector onSelect={handleTemplateSelect} />
        )}
        
        {step === 'configure' && selectedTemplate && (
          <ConfigurationForm
            template={selectedTemplate}
            config={config}
            onChange={handleConfigChange}
            onNext={handlePreview}
            onBack={() => setStep('select')}
          />
        )}
        
        {step === 'preview' && selectedTemplate && (
          <PreviewPanel
            template={selectedTemplate}
            config={config}
            onGenerate={handleGenerate}
            onBack={() => setStep('configure')}
          />
        )}
        
        {step === 'generate' && (
          <GenerationProgress
            progress={progress}
            status={progressStatus}
          />
        )}
        
        {step === 'complete' && result && (
          <QuickStartGuide
            result={result}
            template={selectedTemplate!}
            config={config}
          />
        )}
      </div>
    </div>
  );
}
```

**Deliverables:**
- [ ] Wizard state management
- [ ] Step navigation
- [ ] Progress tracking

#### Task 2.1.6: Template Selector Component
**File:** `desktop-app/src/pages/TemplateWizard/TemplateSelector.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { templateService, TemplateMetadata } from '@/services/templateService';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface TemplateSelectorProps {
  onSelect: (template: TemplateMetadata) => void;
}

const CATEGORIES = [
  { id: 'all', name: 'All Templates', icon: '📦' },
  { id: 'saas', name: 'SaaS', icon: '☁️' },
  { id: 'ecommerce', name: 'E-commerce', icon: '🛒' },
  { id: 'mobile', name: 'Mobile App', icon: '📱' },
  { id: 'api', name: 'API / Backend', icon: '⚡' },
  { id: 'landing', name: 'Landing Page', icon: '🎯' },
  { id: 'dashboard', name: 'Dashboard', icon: '📊' },
];

export function TemplateSelector({ onSelect }: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<TemplateMetadata[]>([]);
  const [filteredTemplates, setFilteredTemplates] = useState<TemplateMetadata[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadTemplates();
  }, []);
  
  useEffect(() => {
    filterTemplates();
  }, [templates, selectedCategory, searchQuery]);
  
  const loadTemplates = async () => {
    setLoading(true);
    try {
      const data = await templateService.listTemplates();
      setTemplates(data);
    } finally {
      setLoading(false);
    }
  };
  
  const filterTemplates = async () => {
    let filtered = templates;
    
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(t => t.category === selectedCategory);
    }
    
    if (searchQuery) {
      const results = await templateService.searchTemplates(searchQuery);
      filtered = filtered.filter(t => results.some(r => r.id === t.id));
    }
    
    setFilteredTemplates(filtered);
  };
  
  return (
    <div className="template-selector">
      <div className="selector-header">
        <h2>Choose a Template</h2>
        <p>Select a template to get started with your project</p>
      </div>
      
      {/* Search */}
      <div className="search-bar">
        <Input
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
      </div>
      
      {/* Categories */}
      <div className="categories">
        {CATEGORIES.map((category) => (
          <button
            key={category.id}
            className={`category-btn ${selectedCategory === category.id ? 'active' : ''}`}
            onClick={() => setSelectedCategory(category.id)}
          >
            <span className="category-icon">{category.icon}</span>
            <span className="category-name">{category.name}</span>
          </button>
        ))}
      </div>
      
      {/* Template Grid */}
      <div className="template-grid">
        {loading ? (
          <LoadingSkeleton />
        ) : filteredTemplates.length === 0 ? (
          <EmptyState />
        ) : (
          filteredTemplates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onClick={() => onSelect(template)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function TemplateCard({ template, onClick }: { template: TemplateMetadata; onClick: () => void }) {
  return (
    <div className="template-card" onClick={onClick}>
      <div className="card-thumbnail">
        <img src={template.preview.thumbnail} alt={template.name} />
      </div>
      
      <div className="card-content">
        <h3 className="card-title">{template.name}</h3>
        <p className="card-description">{template.description}</p>
        
        <div className="card-meta">
          <Badge variant="outline">{template.complexity}</Badge>
          <span className="estimated-time">⏱️ {template.estimatedTime}</span>
        </div>
        
        <div className="card-tech-stack">
          <span className="tech-item">{template.techStack.frontend}</span>
          <span className="tech-item">{template.techStack.backend}</span>
          <span className="tech-item">{template.techStack.database}</span>
        </div>
        
        <div className="card-tags">
          {template.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="secondary">{tag}</Badge>
          ))}
        </div>
      </div>
    </div>
  );
}
```

**Deliverables:**
- [ ] Category filtering
- [ ] Search functionality
- [ ] Template cards
- [ ] Loading states

#### Task 2.1.7: Configuration Form Component
**File:** `desktop-app/src/pages/TemplateWizard/ConfigurationForm.tsx`

```typescript
import React, { useEffect, useState } from 'react';
import { templateService, TemplateMetadata } from '@/services/templateService';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

interface ConfigurationFormProps {
  template: TemplateMetadata;
  config: Record<string, any>;
  onChange: (config: Record<string, any>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function ConfigurationForm({
  template,
  config,
  onChange,
  onNext,
  onBack,
}: ConfigurationFormProps) {
  const [schema, setSchema] = useState<any>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  
  useEffect(() => {
    loadSchema();
  }, [template.id]);
  
  const loadSchema = async () => {
    const data = await templateService.getConfigSchema(template.id);
    setSchema(data);
  };
  
  const handleChange = (key: string, value: any) => {
    const newConfig = { ...config, [key]: value };
    onChange(newConfig);
  };
  
  const handleNestedChange = (parent: string, key: string, value: any) => {
    const newConfig = {
      ...config,
      [parent]: {
        ...config[parent],
        [key]: value,
      },
    };
    onChange(newConfig);
  };
  
  const handleValidate = async () => {
    const result = await templateService.validateConfig(template.id, config);
    setErrors(result.errors);
    return result.valid;
  };
  
  const handleNext = async () => {
    const valid = await handleValidate();
    if (valid) {
      onNext();
    }
  };
  
  if (!schema) {
    return <LoadingSkeleton />;
  }
  
  const steps = [
    { id: 'basic', title: 'Basic Info', fields: ['projectName', 'description'] },
    { id: 'features', title: 'Features', fields: ['features'] },
    { id: 'integrations', title: 'Integrations', fields: ['integrations'] },
    { id: 'deployment', title: 'Deployment', fields: ['deployment'] },
  ];
  
  return (
    <div className="configuration-form">
      <div className="form-header">
        <h2>Configure Your Project</h2>
        <p>Customize {template.name} to your needs</p>
      </div>
      
      {/* Step indicator */}
      <div className="step-indicator">
        {steps.map((step, index) => (
          <div
            key={step.id}
            className={`step ${index === currentStep ? 'active' : ''} ${index < currentStep ? 'completed' : ''}`}
            onClick={() => setCurrentStep(index)}
          >
            <span className="step-number">{index + 1}</span>
            <span className="step-title">{step.title}</span>
          </div>
        ))}
      </div>
      
      {/* Form content */}
      <div className="form-content">
        {currentStep === 0 && (
          <BasicInfoStep
            schema={schema}
            config={config}
            onChange={handleChange}
            errors={errors}
          />
        )}
        
        {currentStep === 1 && (
          <FeaturesStep
            template={template}
            config={config}
            onChange={(key, value) => handleNestedChange('features', key, value)}
          />
        )}
        
        {currentStep === 2 && (
          <IntegrationsStep
            schema={schema}
            config={config}
            onChange={(key, value) => handleNestedChange('integrations', key, value)}
          />
        )}
        
        {currentStep === 3 && (
          <DeploymentStep
            schema={schema}
            config={config}
            onChange={handleChange}
          />
        )}
      </div>
      
      {/* Errors */}
      {errors.length > 0 && (
        <div className="form-errors">
          {errors.map((error, index) => (
            <p key={index} className="error">{error}</p>
          ))}
        </div>
      )}
      
      {/* Navigation */}
      <div className="form-actions">
        <Button variant="outline" onClick={currentStep === 0 ? onBack : () => setCurrentStep(currentStep - 1)}>
          Back
        </Button>
        
        {currentStep < steps.length - 1 ? (
          <Button onClick={() => setCurrentStep(currentStep + 1)}>
            Next
          </Button>
        ) : (
          <Button onClick={handleNext}>
            Preview & Generate
          </Button>
        )}
      </div>
    </div>
  );
}

function BasicInfoStep({ schema, config, onChange, errors }) {
  return (
    <div className="form-step">
      <div className="form-group">
        <label>Project Name</label>
        <Input
          value={config.projectName || ''}
          onChange={(e) => onChange('projectName', e.target.value)}
          placeholder="my-awesome-project"
        />
        <p className="hint">Lowercase letters, numbers, and hyphens only</p>
      </div>
      
      <div className="form-group">
        <label>Description</label>
        <textarea
          value={config.description || ''}
          onChange={(e) => onChange('description', e.target.value)}
          placeholder="A brief description of your project"
          rows={3}
        />
      </div>
    </div>
  );
}

function FeaturesStep({ template, config, onChange }) {
  return (
    <div className="form-step">
      <p className="step-description">Select the features you want to include:</p>
      
      <div className="features-list">
        {template.features.map((feature) => (
          <div key={feature.id} className="feature-item">
            <Checkbox
              checked={config.features?.[feature.id] ?? feature.default ?? false}
              onCheckedChange={(checked) => onChange(feature.id, checked)}
              disabled={feature.required}
            />
            <div className="feature-info">
              <span className="feature-name">
                {feature.name}
                {feature.required && <Badge variant="outline">Required</Badge>}
              </span>
              <span className="feature-description">{feature.description}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Deliverables:**
- [ ] Multi-step form
- [ ] Dynamic field rendering
- [ ] Validation
- [ ] Feature selection

#### Task 2.1.8: Preview Panel Component
**File:** `desktop-app/src/pages/TemplateWizard/PreviewPanel.tsx`

```typescript
import React from 'react';
import { TemplateMetadata } from '@/services/templateService';
import { Button } from '@/components/ui/button';

interface PreviewPanelProps {
  template: TemplateMetadata;
  config: Record<string, any>;
  onGenerate: () => void;
  onBack: () => void;
}

export function PreviewPanel({ template, config, onGenerate, onBack }: PreviewPanelProps) {
  const enabledFeatures = template.features.filter(
    f => config.features?.[f.id] ?? f.default ?? false
  );
  
  return (
    <div className="preview-panel">
      <div className="preview-header">
        <h2>Review Your Configuration</h2>
        <p>Make sure everything looks correct before generating</p>
      </div>
      
      <div className="preview-content">
        {/* Project Info */}
        <section className="preview-section">
          <h3>📋 Project Information</h3>
          <div className="preview-grid">
            <div className="preview-item">
              <span className="label">Name</span>
              <span className="value">{config.projectName}</span>
            </div>
            <div className="preview-item">
              <span className="label">Description</span>
              <span className="value">{config.description}</span>
            </div>
            <div className="preview-item">
              <span className="label">Template</span>
              <span className="value">{template.name}</span>
            </div>
          </div>
        </section>
        
        {/* Tech Stack */}
        <section className="preview-section">
          <h3>🛠️ Tech Stack</h3>
          <div className="tech-stack-preview">
            <div className="tech-item">
              <span className="tech-label">Frontend</span>
              <span className="tech-value">{template.techStack.frontend}</span>
            </div>
            <div className="tech-item">
              <span className="tech-label">Backend</span>
              <span className="tech-value">{template.techStack.backend}</span>
            </div>
            <div className="tech-item">
              <span className="tech-label">Database</span>
              <span className="tech-value">{template.techStack.database}</span>
            </div>
          </div>
        </section>
        
        {/* Features */}
        <section className="preview-section">
          <h3>✨ Features ({enabledFeatures.length})</h3>
          <div className="features-preview">
            {enabledFeatures.map((feature) => (
              <div key={feature.id} className="feature-badge">
                ✓ {feature.name}
              </div>
            ))}
          </div>
        </section>
        
        {/* Integrations */}
        <section className="preview-section">
          <h3>🔌 Integrations</h3>
          <div className="integrations-preview">
            {config.integrations?.stripe && <span className="integration">Stripe</span>}
            {config.integrations?.sendgrid && <span className="integration">SendGrid</span>}
            {config.integrations?.analytics !== 'none' && (
              <span className="integration">{config.integrations?.analytics}</span>
            )}
          </div>
        </section>
        
        {/* Deployment */}
        <section className="preview-section">
          <h3>🚀 Deployment</h3>
          <div className="deployment-preview">
            <span className="deployment-target">{config.deployment || 'Manual'}</span>
          </div>
        </section>
        
        {/* Estimated Files */}
        <section className="preview-section">
          <h3>📁 What will be generated</h3>
          <div className="files-preview">
            <FileTreePreview template={template} config={config} />
          </div>
        </section>
      </div>
      
      <div className="preview-actions">
        <Button variant="outline" onClick={onBack}>
          Back to Configure
        </Button>
        <Button onClick={onGenerate}>
          🚀 Generate Project
        </Button>
      </div>
    </div>
  );
}
```

**Deliverables:**
- [ ] Configuration summary
- [ ] File tree preview
- [ ] Generate button

#### Task 2.1.9: Quick Start Guide Component
**File:** `desktop-app/src/pages/TemplateWizard/QuickStartGuide.tsx`

```typescript
import React from 'react';
import { GenerationResult, TemplateMetadata } from '@/services/templateService';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface QuickStartGuideProps {
  result: GenerationResult;
  template: TemplateMetadata;
  config: Record<string, any>;
}

export function QuickStartGuide({ result, template, config }: QuickStartGuideProps) {
  const navigate = useNavigate();
  
  const handleOpenWorkspace = () => {
    // Navigate to workspace with the new project
    navigate(`/workspace?path=${encodeURIComponent(result.outputDir)}`);
  };
  
  return (
    <div className="quick-start-guide">
      <div className="success-header">
        <div className="success-icon">🎉</div>
        <h2>Project Created Successfully!</h2>
        <p>Your {template.name} project is ready</p>
      </div>
      
      <div className="generation-summary">
        <div className="summary-item">
          <span className="summary-label">Location</span>
          <code className="summary-value">{result.outputDir}</code>
        </div>
        <div className="summary-item">
          <span className="summary-label">Files Generated</span>
          <span className="summary-value">{result.filesGenerated} files</span>
        </div>
      </div>
      
      <div className="next-steps">
        <h3>🚀 Next Steps</h3>
        
        <div className="steps-list">
          <div className="step-item">
            <span className="step-number">1</span>
            <div className="step-content">
              <h4>Open Workspace</h4>
              <p>Start working on your project in SmartSpecPro</p>
              <Button onClick={handleOpenWorkspace}>
                Open Workspace
              </Button>
            </div>
          </div>
          
          <div className="step-item">
            <span className="step-number">2</span>
            <div className="step-content">
              <h4>Install Dependencies</h4>
              <p>Run the following command in your terminal:</p>
              <code className="command">
                cd {config.projectName} && npm install
              </code>
            </div>
          </div>
          
          <div className="step-item">
            <span className="step-number">3</span>
            <div className="step-content">
              <h4>Configure Environment</h4>
              <p>Copy the example environment file and add your API keys:</p>
              <code className="command">
                cp .env.example .env
              </code>
            </div>
          </div>
          
          <div className="step-item">
            <span className="step-number">4</span>
            <div className="step-content">
              <h4>Start Development</h4>
              <p>Run the development server:</p>
              <code className="command">
                npm run dev
              </code>
            </div>
          </div>
        </div>
      </div>
      
      <div className="resources">
        <h3>📚 Resources</h3>
        <div className="resource-links">
          <a href="#" className="resource-link">
            📖 Documentation
          </a>
          <a href="#" className="resource-link">
            🎥 Video Tutorial
          </a>
          <a href="#" className="resource-link">
            💬 Community Support
          </a>
        </div>
      </div>
      
      <div className="guide-actions">
        <Button variant="outline" onClick={() => navigate('/templates')}>
          Create Another Project
        </Button>
        <Button onClick={handleOpenWorkspace}>
          Start Working →
        </Button>
      </div>
    </div>
  );
}
```

**Deliverables:**
- [ ] Success message
- [ ] Next steps guide
- [ ] Resource links
- [ ] Navigation to workspace

---

### Week 2: Templates & Testing

#### Task 2.1.10: Create SaaS Template
**Directory:** `desktop-app/templates/saas/`

**Deliverables:**
- [ ] template.json
- [ ] config-schema.json
- [ ] File templates (React, API, etc.)
- [ ] Pre/post hooks
- [ ] Documentation

#### Task 2.1.11: Create E-commerce Template
**Directory:** `desktop-app/templates/ecommerce/`

**Deliverables:**
- [ ] template.json
- [ ] config-schema.json
- [ ] File templates
- [ ] Product catalog structure
- [ ] Cart/checkout templates

#### Task 2.1.12: Create API Template
**Directory:** `desktop-app/templates/api/`

**Deliverables:**
- [ ] template.json
- [ ] config-schema.json
- [ ] REST API structure
- [ ] OpenAPI spec template
- [ ] Authentication templates

#### Task 2.1.13: Unit Tests
**File:** `desktop-app/tests/template-wizard/`

**Deliverables:**
- [ ] Registry tests
- [ ] Generator tests
- [ ] UI component tests
- [ ] Integration tests

#### Task 2.1.14: Documentation
**File:** `desktop-app/docs/TEMPLATE_WIZARD.md`

**Deliverables:**
- [ ] User guide
- [ ] Template creation guide
- [ ] API documentation

---

## 📊 Definition of Done

- [ ] Template registry ทำงานได้
- [ ] Search และ filter templates ได้
- [ ] Configuration wizard ทำงานได้
- [ ] Project generation สำเร็จ
- [ ] Git repository initialized
- [ ] Workspace database created
- [ ] Quick start guide แสดงผล
- [ ] มี templates อย่างน้อย 3 ตัว (SaaS, E-commerce, API)
- [ ] Unit tests coverage > 80%
- [ ] Documentation complete

---

## 🚀 Next Sprint

**Sprint 2.2: Visual Spec Builder**
- Drag-and-drop UI
- Component library
- Flow diagrams
- Spec generation
