# Sprint 3.3: AI Enhancements

**Duration:** 2 สัปดาห์ (10-14 วันทำงาน)  
**Priority:** High  
**Dependencies:** Phase 2 Complete, Sprint 3.1  

---

## 🎯 Sprint Goal

เพิ่มความสามารถ AI ที่ช่วยให้:
1. Smart suggestions ที่แม่นยำขึ้น
2. Code completion ที่เข้าใจ context
3. Bug predictions และ quality insights
4. Learning system ที่เรียนรู้จากผู้ใช้

---

## 📋 User Stories

### US-3.3.1: Smart Suggestions
> **As a** user  
> **I want** AI to suggest relevant actions and content  
> **So that** I can work more efficiently

**Acceptance Criteria:**
- [ ] Context-aware suggestions
- [ ] Spec recommendations
- [ ] Task suggestions
- [ ] Template suggestions
- [ ] Keyboard shortcuts

### US-3.3.2: Code Completion
> **As a** developer  
> **I want** AI-powered code completion  
> **So that** I can write code faster

**Acceptance Criteria:**
- [ ] Context-aware completion
- [ ] Multi-line suggestions
- [ ] Documentation generation
- [ ] Code explanation
- [ ] Refactoring suggestions

### US-3.3.3: Bug Predictions
> **As a** developer  
> **I want** AI to predict potential bugs  
> **So that** I can fix issues before they occur

**Acceptance Criteria:**
- [ ] Static analysis integration
- [ ] Pattern-based detection
- [ ] Severity classification
- [ ] Fix suggestions
- [ ] Historical learning

### US-3.3.4: Learning System
> **As a** user  
> **I want** AI to learn from my preferences  
> **So that** suggestions improve over time

**Acceptance Criteria:**
- [ ] Preference tracking
- [ ] Feedback collection
- [ ] Model fine-tuning
- [ ] Privacy controls
- [ ] Reset learning

---

## 🏗️ Technical Architecture

### AI Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           AI ENHANCEMENTS ARCHITECTURE                           │
└─────────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────────────────────────────────────────────────────────────────────┐
    │  AI ENGINE                                                                   │
    │                                                                              │
    │  ┌─────────────────────────────────────────────────────────────────────────┐│
    │  │  Context Builder                                                        ││
    │  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐               ││
    │  │  │   Workspace   │  │    Code       │  │    User       │               ││
    │  │  │   Context     │  │    Context    │  │    Context    │               ││
    │  │  │               │  │               │  │               │               ││
    │  │  │ • Tasks       │  │ • Current file│  │ • Preferences │               ││
    │  │  │ • Specs       │  │ • Open files  │  │ • History     │               ││
    │  │  │ • Knowledge   │  │ • Project     │  │ • Feedback    │               ││
    │  │  │ • History     │  │ • Dependencies│  │ • Patterns    │               ││
    │  │  └───────────────┘  └───────────────┘  └───────────────┘               ││
    │  └─────────────────────────────────────────────────────────────────────────┘│
    │                                      │                                       │
    │                                      ▼                                       │
    │  ┌─────────────────────────────────────────────────────────────────────────┐│
    │  │  AI Models                                                              ││
    │  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐               ││
    │  │  │   Suggestion  │  │   Completion  │  │   Analysis    │               ││
    │  │  │   Model       │  │   Model       │  │   Model       │               ││
    │  │  │               │  │               │  │               │               ││
    │  │  │ • GPT-4       │  │ • CodeLlama   │  │ • Custom      │               ││
    │  │  │ • Claude      │  │ • StarCoder   │  │   trained     │               ││
    │  │  │ • Local       │  │ • Local       │  │               │               ││
    │  │  └───────────────┘  └───────────────┘  └───────────────┘               ││
    │  └─────────────────────────────────────────────────────────────────────────┘│
    │                                      │                                       │
    │                                      ▼                                       │
    │  ┌─────────────────────────────────────────────────────────────────────────┐│
    │  │  Output Processors                                                      ││
    │  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐               ││
    │  │  │   Ranking     │  │   Filtering   │  │   Formatting  │               ││
    │  │  │               │  │               │  │               │               ││
    │  │  │ • Relevance   │  │ • Quality     │  │ • Code style  │               ││
    │  │  │ • Confidence  │  │ • Safety      │  │ • Markdown    │               ││
    │  │  │ • Recency     │  │ • Duplicates  │  │ • Inline      │               ││
    │  │  └───────────────┘  └───────────────┘  └───────────────┘               ││
    │  └─────────────────────────────────────────────────────────────────────────┘│
    └──────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────────────────────────────────────────────────────────────────────┐
    │  LEARNING SYSTEM                                                             │
    │                                                                              │
    │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐ │
    │  │   Feedback    │  │   Analytics   │  │   Training    │  │   Privacy     │ │
    │  │   Collector   │  │               │  │               │  │   Manager     │ │
    │  │               │  │               │  │               │  │               │ │
    │  │ • Accept/     │  │ • Usage stats │  │ • Local fine- │  │ • Data        │ │
    │  │   reject      │  │ • Patterns    │  │   tuning      │  │   retention   │ │
    │  │ • Edits       │  │ • Trends      │  │ • Preference  │  │ • Opt-out     │ │
    │  │ • Ratings     │  │               │  │   learning    │  │ • Export      │ │
    │  └───────────────┘  └───────────────┘  └───────────────┘  └───────────────┘ │
    └──────────────────────────────────────────────────────────────────────────────┘
```

### Data Models

```typescript
// Suggestion
interface Suggestion {
  id: string;
  type: 'action' | 'content' | 'template' | 'task' | 'code';
  title: string;
  description: string;
  preview?: string;
  confidence: number;
  context: SuggestionContext;
  action: SuggestionAction;
  metadata: {
    source: string;
    model: string;
    latency: number;
  };
}

// Code Completion
interface CodeCompletion {
  id: string;
  text: string;
  displayText: string;
  range: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  kind: 'snippet' | 'line' | 'block' | 'function';
  confidence: number;
  documentation?: string;
}

// Bug Prediction
interface BugPrediction {
  id: string;
  file: string;
  line: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  message: string;
  suggestion?: string;
  confidence: number;
  references: string[];
}

// User Preference
interface UserPreference {
  id: string;
  category: string;
  key: string;
  value: any;
  confidence: number;
  source: 'explicit' | 'implicit' | 'default';
  updatedAt: string;
}

// Feedback
interface Feedback {
  id: string;
  suggestionId: string;
  type: 'accept' | 'reject' | 'edit' | 'ignore';
  originalValue?: string;
  editedValue?: string;
  context: any;
  timestamp: string;
}
```

---

## 📁 Implementation Tasks

### Week 1: AI Engine & Suggestions

#### Task 3.3.1: AI Engine (Rust)
**File:** `desktop-app/src-tauri/src/ai_engine/mod.rs`

```rust
use std::sync::Arc;
use tokio::sync::RwLock;

pub mod context;
pub mod models;
pub mod suggestions;
pub mod completion;
pub mod analysis;
pub mod learning;

use context::ContextBuilder;
use models::ModelManager;
use learning::LearningSystem;

pub struct AIEngine {
    context_builder: ContextBuilder,
    model_manager: ModelManager,
    learning_system: Arc<RwLock<LearningSystem>>,
    config: AIConfig,
}

#[derive(Debug, Clone)]
pub struct AIConfig {
    pub suggestion_model: String,
    pub completion_model: String,
    pub analysis_model: String,
    pub max_suggestions: usize,
    pub confidence_threshold: f32,
    pub learning_enabled: bool,
}

impl AIEngine {
    pub fn new(config: AIConfig) -> Result<Self, Error> {
        let context_builder = ContextBuilder::new();
        let model_manager = ModelManager::new(&config)?;
        let learning_system = Arc::new(RwLock::new(LearningSystem::new()));
        
        Ok(Self {
            context_builder,
            model_manager,
            learning_system,
            config,
        })
    }
    
    pub async fn get_suggestions(&self, request: SuggestionRequest) -> Result<Vec<Suggestion>, Error> {
        // Build context
        let context = self.context_builder.build(&request.context).await?;
        
        // Get user preferences
        let preferences = self.learning_system.read().await.get_preferences(&request.user_id)?;
        
        // Generate suggestions
        let raw_suggestions = self.model_manager
            .suggest(&context, &preferences)
            .await?;
        
        // Rank and filter
        let ranked = self.rank_suggestions(raw_suggestions, &preferences);
        let filtered = self.filter_suggestions(ranked);
        
        // Limit results
        let suggestions = filtered
            .into_iter()
            .take(self.config.max_suggestions)
            .collect();
        
        Ok(suggestions)
    }
    
    pub async fn get_completion(&self, request: CompletionRequest) -> Result<Vec<CodeCompletion>, Error> {
        // Build code context
        let context = self.context_builder.build_code_context(&request).await?;
        
        // Get completions
        let completions = self.model_manager
            .complete(&context, &request)
            .await?;
        
        // Filter by confidence
        let filtered = completions
            .into_iter()
            .filter(|c| c.confidence >= self.config.confidence_threshold)
            .collect();
        
        Ok(filtered)
    }
    
    pub async fn analyze_code(&self, request: AnalysisRequest) -> Result<AnalysisResult, Error> {
        // Build analysis context
        let context = self.context_builder.build_analysis_context(&request).await?;
        
        // Run analysis
        let result = self.model_manager
            .analyze(&context, &request)
            .await?;
        
        Ok(result)
    }
    
    pub async fn predict_bugs(&self, request: BugPredictionRequest) -> Result<Vec<BugPrediction>, Error> {
        // Build context
        let context = self.context_builder.build_code_context(&request.into()).await?;
        
        // Run prediction
        let predictions = self.model_manager
            .predict_bugs(&context)
            .await?;
        
        // Sort by severity and confidence
        let mut sorted = predictions;
        sorted.sort_by(|a, b| {
            let severity_order = |s: &str| match s {
                "critical" => 0,
                "high" => 1,
                "medium" => 2,
                "low" => 3,
                _ => 4,
            };
            severity_order(&a.severity).cmp(&severity_order(&b.severity))
                .then(b.confidence.partial_cmp(&a.confidence).unwrap())
        });
        
        Ok(sorted)
    }
    
    pub async fn record_feedback(&self, feedback: Feedback) -> Result<(), Error> {
        let mut learning = self.learning_system.write().await;
        learning.record_feedback(feedback)?;
        Ok(())
    }
    
    fn rank_suggestions(&self, suggestions: Vec<Suggestion>, preferences: &UserPreferences) -> Vec<Suggestion> {
        let mut ranked = suggestions;
        
        // Apply preference-based ranking
        for suggestion in &mut ranked {
            let preference_boost = preferences.get_boost(&suggestion.type_);
            suggestion.confidence *= preference_boost;
        }
        
        // Sort by confidence
        ranked.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap());
        
        ranked
    }
    
    fn filter_suggestions(&self, suggestions: Vec<Suggestion>) -> Vec<Suggestion> {
        suggestions
            .into_iter()
            .filter(|s| s.confidence >= self.config.confidence_threshold)
            .collect()
    }
}
```

**Deliverables:**
- [ ] AI Engine core
- [ ] Context builder
- [ ] Model manager
- [ ] Suggestion generation
- [ ] Ranking system

#### Task 3.3.2: Context Builder
**File:** `desktop-app/src-tauri/src/ai_engine/context.rs`

```rust
use crate::workspace::WorkspaceManager;
use crate::memory::MemorySystem;

pub struct ContextBuilder {
    workspace_manager: Arc<WorkspaceManager>,
    memory_system: Arc<MemorySystem>,
}

impl ContextBuilder {
    pub async fn build(&self, request: &ContextRequest) -> Result<AIContext, Error> {
        let workspace_context = self.build_workspace_context(request).await?;
        let code_context = self.build_code_context_internal(request).await?;
        let user_context = self.build_user_context(request).await?;
        
        Ok(AIContext {
            workspace: workspace_context,
            code: code_context,
            user: user_context,
            timestamp: chrono::Utc::now(),
        })
    }
    
    async fn build_workspace_context(&self, request: &ContextRequest) -> Result<WorkspaceContext, Error> {
        let workspace = self.workspace_manager.get_current().await?;
        
        // Get recent tasks
        let tasks = workspace.get_recent_tasks(10).await?;
        
        // Get relevant specs
        let specs = workspace.get_specs_by_relevance(&request.query, 5).await?;
        
        // Get knowledge
        let knowledge = self.memory_system.search(&request.query, 10).await?;
        
        Ok(WorkspaceContext {
            workspace_id: workspace.id.clone(),
            tasks,
            specs,
            knowledge,
        })
    }
    
    async fn build_code_context_internal(&self, request: &ContextRequest) -> Result<CodeContext, Error> {
        let mut context = CodeContext::default();
        
        if let Some(file_path) = &request.file_path {
            // Current file content
            let content = tokio::fs::read_to_string(file_path).await?;
            context.current_file = Some(FileContext {
                path: file_path.clone(),
                content,
                language: detect_language(file_path),
                cursor_position: request.cursor_position,
            });
            
            // Get related files
            let related = self.find_related_files(file_path).await?;
            context.related_files = related;
            
            // Get project structure
            context.project_structure = self.get_project_structure(file_path).await?;
        }
        
        Ok(context)
    }
    
    async fn build_user_context(&self, request: &ContextRequest) -> Result<UserContext, Error> {
        // Get user preferences
        let preferences = self.get_user_preferences(&request.user_id).await?;
        
        // Get recent actions
        let recent_actions = self.get_recent_actions(&request.user_id, 20).await?;
        
        // Get feedback history
        let feedback = self.get_feedback_history(&request.user_id, 50).await?;
        
        Ok(UserContext {
            user_id: request.user_id.clone(),
            preferences,
            recent_actions,
            feedback_patterns: analyze_feedback_patterns(&feedback),
        })
    }
    
    pub async fn build_code_context(&self, request: &CompletionRequest) -> Result<CodeCompletionContext, Error> {
        let file_content = tokio::fs::read_to_string(&request.file_path).await?;
        
        // Get prefix (code before cursor)
        let prefix = get_prefix(&file_content, request.cursor_position);
        
        // Get suffix (code after cursor)
        let suffix = get_suffix(&file_content, request.cursor_position);
        
        // Get imports and dependencies
        let imports = extract_imports(&file_content, &request.language);
        
        // Get function context
        let function_context = extract_function_context(&file_content, request.cursor_position);
        
        Ok(CodeCompletionContext {
            file_path: request.file_path.clone(),
            language: request.language.clone(),
            prefix,
            suffix,
            imports,
            function_context,
            project_context: self.get_project_context(&request.file_path).await?,
        })
    }
}
```

**Deliverables:**
- [ ] Workspace context
- [ ] Code context
- [ ] User context
- [ ] Project context

#### Task 3.3.3: Smart Suggestions
**File:** `desktop-app/src-tauri/src/ai_engine/suggestions.rs`

```rust
use super::*;

pub struct SuggestionGenerator {
    model: Arc<dyn AIModel>,
}

impl SuggestionGenerator {
    pub async fn generate(&self, context: &AIContext, preferences: &UserPreferences) -> Result<Vec<Suggestion>, Error> {
        let mut suggestions = Vec::new();
        
        // Generate action suggestions
        suggestions.extend(self.generate_action_suggestions(context).await?);
        
        // Generate content suggestions
        suggestions.extend(self.generate_content_suggestions(context).await?);
        
        // Generate template suggestions
        suggestions.extend(self.generate_template_suggestions(context).await?);
        
        // Generate task suggestions
        suggestions.extend(self.generate_task_suggestions(context).await?);
        
        Ok(suggestions)
    }
    
    async fn generate_action_suggestions(&self, context: &AIContext) -> Result<Vec<Suggestion>, Error> {
        let prompt = format!(
            r#"Based on the current context, suggest relevant actions the user might want to take.

Context:
- Current workspace: {}
- Recent tasks: {:?}
- Current file: {:?}

Suggest 3-5 relevant actions in JSON format:
[{{"title": "...", "description": "...", "action_type": "...", "confidence": 0.0-1.0}}]"#,
            context.workspace.workspace_id,
            context.workspace.tasks.iter().take(3).collect::<Vec<_>>(),
            context.code.current_file.as_ref().map(|f| &f.path),
        );
        
        let response = self.model.complete(&prompt).await?;
        let actions: Vec<ActionSuggestion> = serde_json::from_str(&response)?;
        
        Ok(actions.into_iter().map(|a| a.into()).collect())
    }
    
    async fn generate_content_suggestions(&self, context: &AIContext) -> Result<Vec<Suggestion>, Error> {
        // Use knowledge base to suggest relevant content
        let relevant_knowledge = &context.workspace.knowledge;
        
        let suggestions = relevant_knowledge
            .iter()
            .take(3)
            .map(|k| Suggestion {
                id: uuid::Uuid::new_v4().to_string(),
                type_: SuggestionType::Content,
                title: format!("Related: {}", k.title),
                description: k.summary.clone(),
                preview: Some(k.content.chars().take(200).collect()),
                confidence: k.relevance_score,
                context: SuggestionContext::Knowledge(k.id.clone()),
                action: SuggestionAction::OpenKnowledge(k.id.clone()),
                metadata: Default::default(),
            })
            .collect();
        
        Ok(suggestions)
    }
    
    async fn generate_template_suggestions(&self, context: &AIContext) -> Result<Vec<Suggestion>, Error> {
        // Analyze context to suggest relevant templates
        let prompt = format!(
            r#"Based on the user's recent tasks and current work, suggest relevant templates.

Recent tasks: {:?}
Current specs: {:?}

Available template categories: SaaS, E-commerce, Mobile, API, Dashboard

Suggest 2-3 relevant templates in JSON format:
[{{"template_id": "...", "reason": "...", "confidence": 0.0-1.0}}]"#,
            context.workspace.tasks.iter().take(3).collect::<Vec<_>>(),
            context.workspace.specs.iter().take(3).collect::<Vec<_>>(),
        );
        
        let response = self.model.complete(&prompt).await?;
        let templates: Vec<TemplateSuggestion> = serde_json::from_str(&response)?;
        
        Ok(templates.into_iter().map(|t| t.into()).collect())
    }
    
    async fn generate_task_suggestions(&self, context: &AIContext) -> Result<Vec<Suggestion>, Error> {
        // Analyze current progress and suggest next tasks
        let incomplete_tasks: Vec<_> = context.workspace.tasks
            .iter()
            .filter(|t| t.status != "completed")
            .collect();
        
        if incomplete_tasks.is_empty() {
            return Ok(vec![]);
        }
        
        let prompt = format!(
            r#"Based on the current tasks and their dependencies, suggest which task to work on next.

Current tasks:
{}

Suggest the most important task to work on and why:
{{"task_id": "...", "reason": "...", "confidence": 0.0-1.0}}"#,
            incomplete_tasks.iter()
                .map(|t| format!("- {} ({}): {}", t.id, t.status, t.title))
                .collect::<Vec<_>>()
                .join("\n"),
        );
        
        let response = self.model.complete(&prompt).await?;
        let suggestion: TaskSuggestion = serde_json::from_str(&response)?;
        
        Ok(vec![suggestion.into()])
    }
}
```

**Deliverables:**
- [ ] Action suggestions
- [ ] Content suggestions
- [ ] Template suggestions
- [ ] Task suggestions

#### Task 3.3.4: Code Completion
**File:** `desktop-app/src-tauri/src/ai_engine/completion.rs`

```rust
pub struct CodeCompletionEngine {
    model: Arc<dyn CodeModel>,
    cache: Arc<RwLock<CompletionCache>>,
}

impl CodeCompletionEngine {
    pub async fn complete(&self, context: &CodeCompletionContext) -> Result<Vec<CodeCompletion>, Error> {
        // Check cache
        let cache_key = self.compute_cache_key(context);
        if let Some(cached) = self.cache.read().await.get(&cache_key) {
            return Ok(cached.clone());
        }
        
        // Generate completions
        let completions = self.generate_completions(context).await?;
        
        // Cache results
        self.cache.write().await.insert(cache_key, completions.clone());
        
        Ok(completions)
    }
    
    async fn generate_completions(&self, context: &CodeCompletionContext) -> Result<Vec<CodeCompletion>, Error> {
        let prompt = self.build_prompt(context);
        
        // Get multiple completions
        let responses = self.model.complete_multiple(&prompt, 5).await?;
        
        let completions: Vec<CodeCompletion> = responses
            .into_iter()
            .enumerate()
            .map(|(i, response)| {
                let (text, kind) = self.parse_completion(&response, context);
                CodeCompletion {
                    id: format!("completion_{}", i),
                    text: text.clone(),
                    display_text: self.format_display_text(&text, context),
                    range: self.compute_range(context, &text),
                    kind,
                    confidence: self.compute_confidence(&response, i),
                    documentation: self.generate_documentation(&text, context),
                }
            })
            .collect();
        
        Ok(completions)
    }
    
    fn build_prompt(&self, context: &CodeCompletionContext) -> String {
        format!(
            r#"<|file|>{}<|endoffile|>
<|prefix|>{}<|suffix|>{}<|endofsuffix|>
<|imports|>{}<|endofimports|>
<|complete|>"#,
            context.file_path,
            context.prefix,
            context.suffix,
            context.imports.join("\n"),
        )
    }
    
    fn parse_completion(&self, response: &str, context: &CodeCompletionContext) -> (String, CompletionKind) {
        let text = response.trim().to_string();
        
        let kind = if text.contains('\n') {
            if text.starts_with("fn ") || text.starts_with("async fn ") || text.starts_with("pub fn ") {
                CompletionKind::Function
            } else {
                CompletionKind::Block
            }
        } else if text.len() > 50 {
            CompletionKind::Line
        } else {
            CompletionKind::Snippet
        };
        
        (text, kind)
    }
    
    fn compute_confidence(&self, response: &str, index: usize) -> f32 {
        // Higher confidence for first results
        let base = 0.9 - (index as f32 * 0.1);
        
        // Adjust based on response quality
        let quality_factor = if response.len() > 10 { 1.0 } else { 0.8 };
        
        (base * quality_factor).max(0.1).min(1.0)
    }
    
    fn generate_documentation(&self, text: &str, context: &CodeCompletionContext) -> Option<String> {
        // Generate documentation for function completions
        if text.starts_with("fn ") || text.starts_with("async fn ") {
            Some(format!("Suggested function based on context in {}", context.file_path))
        } else {
            None
        }
    }
}
```

**Deliverables:**
- [ ] Code completion engine
- [ ] Multi-line completion
- [ ] Caching
- [ ] Documentation generation

---

### Week 2: Analysis & Learning

#### Task 3.3.5: Bug Prediction
**File:** `desktop-app/src-tauri/src/ai_engine/analysis.rs`

```rust
pub struct BugPredictor {
    model: Arc<dyn AnalysisModel>,
    patterns: Arc<RwLock<PatternDatabase>>,
}

impl BugPredictor {
    pub async fn predict(&self, context: &CodeCompletionContext) -> Result<Vec<BugPrediction>, Error> {
        let mut predictions = Vec::new();
        
        // Pattern-based detection
        predictions.extend(self.pattern_based_detection(context).await?);
        
        // AI-based detection
        predictions.extend(self.ai_based_detection(context).await?);
        
        // Deduplicate and rank
        let unique = self.deduplicate(predictions);
        let ranked = self.rank_predictions(unique);
        
        Ok(ranked)
    }
    
    async fn pattern_based_detection(&self, context: &CodeCompletionContext) -> Result<Vec<BugPrediction>, Error> {
        let patterns = self.patterns.read().await;
        let mut predictions = Vec::new();
        
        let content = format!("{}{}", context.prefix, context.suffix);
        
        for pattern in patterns.get_patterns(&context.language) {
            if let Some(matches) = pattern.find_matches(&content) {
                for m in matches {
                    predictions.push(BugPrediction {
                        id: uuid::Uuid::new_v4().to_string(),
                        file: context.file_path.clone(),
                        line: m.line,
                        severity: pattern.severity.clone(),
                        type_: pattern.bug_type.clone(),
                        message: pattern.message.clone(),
                        suggestion: pattern.suggestion.clone(),
                        confidence: pattern.confidence,
                        references: pattern.references.clone(),
                    });
                }
            }
        }
        
        Ok(predictions)
    }
    
    async fn ai_based_detection(&self, context: &CodeCompletionContext) -> Result<Vec<BugPrediction>, Error> {
        let prompt = format!(
            r#"Analyze the following {} code for potential bugs, security issues, and code smells.

```{}
{}{}
```

For each issue found, provide:
- Line number
- Severity (low, medium, high, critical)
- Type of issue
- Description
- Suggested fix

Format as JSON array:
[{{"line": 1, "severity": "...", "type": "...", "message": "...", "suggestion": "..."}}]"#,
            context.language,
            context.language,
            context.prefix,
            context.suffix,
        );
        
        let response = self.model.analyze(&prompt).await?;
        let predictions: Vec<BugPrediction> = serde_json::from_str(&response)?;
        
        Ok(predictions)
    }
    
    fn rank_predictions(&self, predictions: Vec<BugPrediction>) -> Vec<BugPrediction> {
        let mut ranked = predictions;
        
        ranked.sort_by(|a, b| {
            let severity_order = |s: &str| match s {
                "critical" => 0,
                "high" => 1,
                "medium" => 2,
                "low" => 3,
                _ => 4,
            };
            
            severity_order(&a.severity).cmp(&severity_order(&b.severity))
                .then(b.confidence.partial_cmp(&a.confidence).unwrap())
        });
        
        ranked
    }
}
```

**Deliverables:**
- [ ] Pattern-based detection
- [ ] AI-based detection
- [ ] Severity classification
- [ ] Fix suggestions

#### Task 3.3.6: Learning System
**File:** `desktop-app/src-tauri/src/ai_engine/learning.rs`

```rust
pub struct LearningSystem {
    preferences: HashMap<String, UserPreferences>,
    feedback_store: FeedbackStore,
    analytics: AnalyticsEngine,
}

impl LearningSystem {
    pub fn new() -> Self {
        Self {
            preferences: HashMap::new(),
            feedback_store: FeedbackStore::new(),
            analytics: AnalyticsEngine::new(),
        }
    }
    
    pub fn record_feedback(&mut self, feedback: Feedback) -> Result<(), Error> {
        // Store feedback
        self.feedback_store.store(&feedback)?;
        
        // Update preferences
        self.update_preferences(&feedback)?;
        
        // Update analytics
        self.analytics.record(&feedback)?;
        
        Ok(())
    }
    
    fn update_preferences(&mut self, feedback: &Feedback) -> Result<(), Error> {
        let user_prefs = self.preferences
            .entry(feedback.user_id.clone())
            .or_insert_with(UserPreferences::default);
        
        match feedback.type_ {
            FeedbackType::Accept => {
                // Increase preference for this type of suggestion
                user_prefs.increase_preference(&feedback.suggestion_type, 0.1);
            }
            FeedbackType::Reject => {
                // Decrease preference
                user_prefs.decrease_preference(&feedback.suggestion_type, 0.1);
            }
            FeedbackType::Edit => {
                // Learn from the edit
                if let (Some(original), Some(edited)) = (&feedback.original_value, &feedback.edited_value) {
                    user_prefs.learn_from_edit(original, edited);
                }
            }
            FeedbackType::Ignore => {
                // Slight decrease
                user_prefs.decrease_preference(&feedback.suggestion_type, 0.05);
            }
        }
        
        Ok(())
    }
    
    pub fn get_preferences(&self, user_id: &str) -> Result<UserPreferences, Error> {
        Ok(self.preferences
            .get(user_id)
            .cloned()
            .unwrap_or_default())
    }
    
    pub fn get_analytics(&self, user_id: &str) -> Result<UserAnalytics, Error> {
        self.analytics.get_user_analytics(user_id)
    }
    
    pub fn reset_learning(&mut self, user_id: &str) -> Result<(), Error> {
        self.preferences.remove(user_id);
        self.feedback_store.clear_user(user_id)?;
        self.analytics.clear_user(user_id)?;
        Ok(())
    }
    
    pub fn export_data(&self, user_id: &str) -> Result<UserData, Error> {
        Ok(UserData {
            preferences: self.get_preferences(user_id)?,
            feedback: self.feedback_store.get_user_feedback(user_id)?,
            analytics: self.get_analytics(user_id)?,
        })
    }
}

#[derive(Debug, Clone, Default)]
pub struct UserPreferences {
    pub suggestion_weights: HashMap<String, f32>,
    pub code_style: CodeStylePreferences,
    pub patterns: Vec<LearnedPattern>,
}

impl UserPreferences {
    pub fn get_boost(&self, suggestion_type: &str) -> f32 {
        *self.suggestion_weights.get(suggestion_type).unwrap_or(&1.0)
    }
    
    pub fn increase_preference(&mut self, type_: &str, amount: f32) {
        let weight = self.suggestion_weights.entry(type_.to_string()).or_insert(1.0);
        *weight = (*weight + amount).min(2.0);
    }
    
    pub fn decrease_preference(&mut self, type_: &str, amount: f32) {
        let weight = self.suggestion_weights.entry(type_.to_string()).or_insert(1.0);
        *weight = (*weight - amount).max(0.1);
    }
    
    pub fn learn_from_edit(&mut self, original: &str, edited: &str) {
        // Analyze the edit and learn patterns
        if let Some(pattern) = analyze_edit_pattern(original, edited) {
            self.patterns.push(pattern);
        }
    }
}
```

**Deliverables:**
- [ ] Feedback collection
- [ ] Preference learning
- [ ] Analytics
- [ ] Privacy controls
- [ ] Data export

#### Task 3.3.7-3.3.10: Frontend & Testing

- **3.3.7:** AI Service (TypeScript)
- **3.3.8:** Suggestions UI
- **3.3.9:** Code Completion UI
- **3.3.10:** Settings & Privacy UI

---

## 📊 Definition of Done

- [ ] Smart suggestions ทำงานได้
- [ ] Code completion ทำงานได้
- [ ] Bug predictions ทำงานได้
- [ ] Learning system ทำงานได้
- [ ] Privacy controls ทำงานได้
- [ ] Unit tests coverage > 80%

---

## 🚀 Next Sprint

**Sprint 3.4: Multi-workspace**
- Workspace switching
- Workspace sync
- Team workspaces
