// Context Builder - Builds context for LLM from memory and project
//
// Provides:
// - Context assembly from multiple sources
// - Token budget management
// - Context summarization
// - Skills system integration

use anyhow::{Context, Result, anyhow};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::memory_manager::{MemoryManager, RetrievalQuery, RetrievedContext, ShortTermMemory};
use crate::workspace_db::WorkspaceDbManager;

// ============================================
// Context Types
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatContext {
    pub system_prompt: String,
    pub skill_context: Option<SkillContext>,
    pub project_context: Option<ProjectContext>,
    pub retrieved_memories: Vec<RetrievedContext>,
    pub pinned_context: Vec<PinnedItem>,
    pub conversation_history: Vec<ConversationMessage>,
    pub total_tokens_estimate: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillContext {
    pub skill_name: String,
    pub skill_prompt: String,
    pub required_context_types: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectContext {
    pub project_name: String,
    pub project_path: String,
    pub structure_summary: String,
    pub tech_stack: Vec<String>,
    pub recent_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PinnedItem {
    pub id: i64,
    pub title: String,
    pub content: String,
    pub category: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationMessage {
    pub role: String,
    pub content: String,
    pub tokens_estimate: i32,
}

// ============================================
// Skills Definition
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Skill {
    pub name: String,
    pub command: String,
    pub description: String,
    pub system_prompt: String,
    pub required_context: Vec<String>,
    pub output_format: String,
    pub keywords: Vec<String>,
}

impl Skill {
    pub fn get_all_skills() -> Vec<Skill> {
        vec![
            Skill {
                name: "Specification".to_string(),
                command: "/spec".to_string(),
                description: "Help write detailed specifications".to_string(),
                system_prompt: r#"You are a specification writer expert. Your role is to help create clear, detailed, and actionable specifications.

When writing specifications:
1. Start with a clear overview and objectives
2. Define scope and boundaries
3. List functional requirements with acceptance criteria
4. List non-functional requirements (performance, security, etc.)
5. Define data models and API contracts
6. Include edge cases and error handling
7. Reference existing project constraints and decisions

Format output as structured Markdown with clear sections."#.to_string(),
                required_context: vec!["project_structure".to_string(), "existing_specs".to_string(), "constraints".to_string()],
                output_format: "markdown".to_string(),
                keywords: vec!["spec".to_string(), "specification".to_string(), "requirements".to_string(), "define".to_string()],
            },
            Skill {
                name: "Planning".to_string(),
                command: "/plan".to_string(),
                description: "Help break down work into tasks".to_string(),
                system_prompt: r#"You are a project planning expert. Your role is to help break down work into manageable tasks.

When planning:
1. Understand the goal and scope
2. Identify dependencies and prerequisites
3. Break down into small, actionable tasks (2-4 hours each)
4. Estimate effort for each task
5. Identify risks and blockers
6. Suggest task order and parallelization opportunities
7. Consider existing project timeline and resources

Format output as a task list with estimates and dependencies."#.to_string(),
                required_context: vec!["specs".to_string(), "existing_tasks".to_string(), "timeline".to_string()],
                output_format: "task_list".to_string(),
                keywords: vec!["plan".to_string(), "breakdown".to_string(), "tasks".to_string(), "estimate".to_string()],
            },
            Skill {
                name: "Debugging".to_string(),
                command: "/debug".to_string(),
                description: "Help diagnose and fix issues".to_string(),
                system_prompt: r#"You are a debugging expert. Your role is to help diagnose and fix issues systematically.

When debugging:
1. Understand the expected vs actual behavior
2. Analyze error messages and stack traces
3. Identify potential root causes
4. Suggest diagnostic steps
5. Propose fixes with explanations
6. Consider side effects of fixes
7. Suggest preventive measures

Be methodical and explain your reasoning."#.to_string(),
                required_context: vec!["error_logs".to_string(), "related_code".to_string(), "recent_changes".to_string()],
                output_format: "analysis".to_string(),
                keywords: vec!["debug".to_string(), "error".to_string(), "fix".to_string(), "bug".to_string(), "issue".to_string()],
            },
            Skill {
                name: "Code Review".to_string(),
                command: "/review".to_string(),
                description: "Review code for quality and issues".to_string(),
                system_prompt: r#"You are a code review expert. Your role is to review code for quality, correctness, and best practices.

When reviewing:
1. Check for correctness and logic errors
2. Evaluate code structure and organization
3. Assess naming and readability
4. Look for security vulnerabilities
5. Check error handling
6. Evaluate performance implications
7. Ensure consistency with project patterns
8. Suggest improvements with examples

Be constructive and explain the reasoning behind suggestions."#.to_string(),
                required_context: vec!["code_diff".to_string(), "coding_standards".to_string(), "patterns".to_string()],
                output_format: "review_comments".to_string(),
                keywords: vec!["review".to_string(), "check".to_string(), "feedback".to_string(), "code".to_string()],
            },
            Skill {
                name: "Knowledge".to_string(),
                command: "/knowledge".to_string(),
                description: "Manage project knowledge and decisions".to_string(),
                system_prompt: r#"You are a knowledge management assistant. Your role is to help capture, organize, and retrieve project knowledge.

When managing knowledge:
1. Help capture decisions with context and rationale
2. Record constraints and their reasons
3. Document patterns and best practices
4. Organize information with appropriate categories
5. Suggest related knowledge when relevant
6. Help update outdated information

When user says "บันทึกว่า..." or "remember that...", extract and save as knowledge.
When user asks about past decisions, search and present relevant knowledge."#.to_string(),
                required_context: vec!["existing_knowledge".to_string()],
                output_format: "knowledge_entry".to_string(),
                keywords: vec!["knowledge".to_string(), "remember".to_string(), "บันทึก".to_string(), "decision".to_string(), "constraint".to_string()],
            },
        ]
    }
    
    pub fn detect_skill(message: &str) -> Option<Skill> {
        let message_lower = message.to_lowercase();
        
        // Check for explicit commands first
        for skill in Self::get_all_skills() {
            if message_lower.starts_with(&skill.command) {
                return Some(skill);
            }
        }
        
        // Check for keyword matches
        for skill in Self::get_all_skills() {
            for keyword in &skill.keywords {
                if message_lower.contains(keyword) {
                    return Some(skill);
                }
            }
        }
        
        None
    }
}

// ============================================
// Context Builder
// ============================================

pub struct ContextBuilder {
    memory_manager: Arc<MemoryManager>,
    db_manager: Arc<WorkspaceDbManager>,
    max_context_tokens: i32,
}

impl ContextBuilder {
    pub fn new(
        memory_manager: Arc<MemoryManager>,
        db_manager: Arc<WorkspaceDbManager>,
    ) -> Self {
        Self {
            memory_manager,
            db_manager,
            max_context_tokens: 100000, // Default for Claude 3.5 Sonnet
        }
    }
    
    pub fn with_max_tokens(mut self, max_tokens: i32) -> Self {
        self.max_context_tokens = max_tokens;
        self
    }
    
    /// Build complete context for LLM chat
    pub fn build_context(
        &self,
        workspace_id: &str,
        session_id: &str,
        user_message: &str,
        skill: Option<&Skill>,
    ) -> Result<ChatContext> {
        let mut total_tokens = 0;
        
        // 1. Build system prompt
        let (system_prompt, skill_context) = self.build_system_prompt(skill);
        total_tokens += self.estimate_tokens(&system_prompt);
        
        // 2. Get project context
        let project_context = self.get_project_context(workspace_id)?;
        if let Some(ref ctx) = project_context {
            total_tokens += self.estimate_tokens(&ctx.structure_summary);
        }
        
        // 3. Get pinned context
        let pinned_context = self.get_pinned_context(workspace_id)?;
        for item in &pinned_context {
            total_tokens += self.estimate_tokens(&item.content);
        }
        
        // 4. Retrieve relevant memories
        let retrieved_memories = self.retrieve_relevant_memories(
            workspace_id,
            user_message,
            skill,
        )?;
        for memory in &retrieved_memories {
            total_tokens += self.estimate_tokens(&memory.content);
        }
        
        // 5. Get conversation history (with token budget)
        let remaining_tokens = self.max_context_tokens - total_tokens - 2000; // Reserve for response
        let conversation_history = self.get_conversation_history(
            workspace_id,
            session_id,
            remaining_tokens,
        )?;
        for msg in &conversation_history {
            total_tokens += msg.tokens_estimate;
        }
        
        Ok(ChatContext {
            system_prompt,
            skill_context,
            project_context,
            retrieved_memories,
            pinned_context,
            conversation_history,
            total_tokens_estimate: total_tokens,
        })
    }
    
    fn build_system_prompt(&self, skill: Option<&Skill>) -> (String, Option<SkillContext>) {
        let base_prompt = r#"You are SmartSpec Pro AI Assistant, an intelligent coding companion that helps developers with their projects.

You have access to:
- Project context and structure
- Past decisions and constraints (knowledge base)
- Conversation history
- Pinned important information

Guidelines:
1. Always consider the project context when answering
2. Reference past decisions when relevant
3. Be concise but thorough
4. Use code examples when helpful
5. Ask clarifying questions if needed
6. Suggest saving important decisions as knowledge

Available commands:
- /spec - Help write specifications
- /plan - Help break down work into tasks
- /debug - Help diagnose and fix issues
- /review - Review code for quality
- /knowledge - Manage project knowledge"#;

        if let Some(skill) = skill {
            let combined_prompt = format!("{}\n\n---\n\n{}", base_prompt, skill.system_prompt);
            let skill_context = SkillContext {
                skill_name: skill.name.clone(),
                skill_prompt: skill.system_prompt.clone(),
                required_context_types: skill.required_context.clone(),
            };
            (combined_prompt, Some(skill_context))
        } else {
            (base_prompt.to_string(), None)
        }
    }
    
    fn get_project_context(&self, workspace_id: &str) -> Result<Option<ProjectContext>> {
        // Get workspace metadata
        let workspace = self.db_manager.get_workspace(workspace_id)?;
        
        // For now, return basic context
        // TODO: Integrate with file system scanning
        Ok(Some(ProjectContext {
            project_name: workspace.name,
            project_path: workspace.path,
            structure_summary: "Project structure not yet scanned.".to_string(),
            tech_stack: vec![],
            recent_files: vec![],
        }))
    }
    
    fn get_pinned_context(&self, workspace_id: &str) -> Result<Vec<PinnedItem>> {
        let pinned = self.memory_manager.get_pinned_memory(workspace_id)?;
        
        Ok(pinned.into_iter().map(|m| PinnedItem {
            id: m.id,
            title: m.title,
            content: m.content,
            category: m.category,
        }).collect())
    }
    
    fn retrieve_relevant_memories(
        &self,
        workspace_id: &str,
        query: &str,
        skill: Option<&Skill>,
    ) -> Result<Vec<RetrievedContext>> {
        let categories = skill.map(|s| {
            s.required_context.iter()
                .filter_map(|c| match c.as_str() {
                    "constraints" => Some("constraint".to_string()),
                    "existing_specs" => Some("reference".to_string()),
                    "patterns" => Some("pattern".to_string()),
                    _ => None,
                })
                .collect()
        });
        
        let retrieval_query = RetrievalQuery {
            query: query.to_string(),
            categories,
            limit: Some(10),
            include_short_term: false,
            include_working: true,
            include_long_term: true,
            min_relevance: Some(0.3),
        };
        
        self.memory_manager.retrieve_context(workspace_id, retrieval_query)
    }
    
    fn get_conversation_history(
        &self,
        workspace_id: &str,
        session_id: &str,
        max_tokens: i32,
    ) -> Result<Vec<ConversationMessage>> {
        let memories = self.memory_manager.get_session_memory(workspace_id, session_id, Some(50))?;
        
        let mut history = Vec::new();
        let mut total_tokens = 0;
        
        // Process from newest to oldest, but we'll reverse later
        for memory in memories.into_iter().rev() {
            let tokens = self.estimate_tokens(&memory.content);
            
            if total_tokens + tokens > max_tokens {
                break;
            }
            
            history.push(ConversationMessage {
                role: memory.role,
                content: memory.content,
                tokens_estimate: tokens,
            });
            
            total_tokens += tokens;
        }
        
        // Reverse to get chronological order
        history.reverse();
        
        Ok(history)
    }
    
    fn estimate_tokens(&self, text: &str) -> i32 {
        // Rough estimation: ~4 characters per token for English
        // ~2 characters per token for Thai/CJK
        let char_count = text.chars().count();
        let has_thai = text.chars().any(|c| c >= '\u{0E00}' && c <= '\u{0E7F}');
        
        if has_thai {
            (char_count as f64 / 2.0).ceil() as i32
        } else {
            (char_count as f64 / 4.0).ceil() as i32
        }
    }
    
    /// Format context for LLM API call
    pub fn format_for_api(&self, context: &ChatContext, user_message: &str) -> Vec<ApiMessage> {
        let mut messages = Vec::new();
        
        // System message
        let mut system_content = context.system_prompt.clone();
        
        // Add project context
        if let Some(ref project) = context.project_context {
            system_content.push_str(&format!(
                "\n\n## Current Project\nName: {}\nPath: {}\n{}",
                project.project_name,
                project.project_path,
                project.structure_summary
            ));
        }
        
        // Add pinned context
        if !context.pinned_context.is_empty() {
            system_content.push_str("\n\n## Pinned Context");
            for item in &context.pinned_context {
                system_content.push_str(&format!(
                    "\n### {} ({})\n{}",
                    item.title, item.category, item.content
                ));
            }
        }
        
        // Add retrieved memories
        if !context.retrieved_memories.is_empty() {
            system_content.push_str("\n\n## Relevant Knowledge");
            for memory in &context.retrieved_memories {
                system_content.push_str(&format!(
                    "\n### {} (relevance: {:.2})\n{}",
                    memory.title, memory.relevance_score, memory.content
                ));
            }
        }
        
        messages.push(ApiMessage {
            role: "system".to_string(),
            content: system_content,
        });
        
        // Conversation history
        for msg in &context.conversation_history {
            messages.push(ApiMessage {
                role: msg.role.clone(),
                content: msg.content.clone(),
            });
        }
        
        // Current user message
        messages.push(ApiMessage {
            role: "user".to_string(),
            content: user_message.to_string(),
        });
        
        messages
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiMessage {
    pub role: String,
    pub content: String,
}

// ============================================
// Context Summarizer
// ============================================

pub struct ContextSummarizer;

impl ContextSummarizer {
    /// Summarize long conversation for context compression
    pub fn summarize_conversation(messages: &[ConversationMessage]) -> String {
        if messages.is_empty() {
            return String::new();
        }
        
        let mut summary = String::from("Previous conversation summary:\n");
        
        // Extract key points from messages
        let mut topics = Vec::new();
        let mut decisions = Vec::new();
        
        for msg in messages {
            if msg.role == "user" {
                // Extract topics from user messages
                if msg.content.len() > 50 {
                    let first_sentence = msg.content.split('.').next().unwrap_or(&msg.content);
                    topics.push(first_sentence.to_string());
                }
            } else if msg.role == "assistant" {
                // Extract decisions/conclusions from assistant messages
                if msg.content.contains("decision") || msg.content.contains("recommend") {
                    let lines: Vec<&str> = msg.content.lines().take(2).collect();
                    decisions.push(lines.join(" "));
                }
            }
        }
        
        if !topics.is_empty() {
            summary.push_str("Topics discussed:\n");
            for (i, topic) in topics.iter().take(5).enumerate() {
                summary.push_str(&format!("{}. {}\n", i + 1, topic));
            }
        }
        
        if !decisions.is_empty() {
            summary.push_str("\nKey points:\n");
            for decision in decisions.iter().take(3) {
                summary.push_str(&format!("- {}\n", decision));
            }
        }
        
        summary
    }
    
    /// Extract knowledge candidates from conversation
    pub fn extract_knowledge_candidates(messages: &[ConversationMessage]) -> Vec<KnowledgeCandidate> {
        let mut candidates = Vec::new();
        
        for msg in messages {
            if msg.role == "assistant" {
                // Look for decision patterns
                if msg.content.contains("ตัดสินใจ") || msg.content.contains("decided") ||
                   msg.content.contains("เลือก") || msg.content.contains("chose") {
                    candidates.push(KnowledgeCandidate {
                        category: "decision".to_string(),
                        content: msg.content.clone(),
                        confidence: 0.8,
                    });
                }
                
                // Look for constraint patterns
                if msg.content.contains("ข้อจำกัด") || msg.content.contains("constraint") ||
                   msg.content.contains("ต้อง") || msg.content.contains("must") {
                    candidates.push(KnowledgeCandidate {
                        category: "constraint".to_string(),
                        content: msg.content.clone(),
                        confidence: 0.7,
                    });
                }
                
                // Look for pattern recommendations
                if msg.content.contains("pattern") || msg.content.contains("รูปแบบ") ||
                   msg.content.contains("best practice") {
                    candidates.push(KnowledgeCandidate {
                        category: "pattern".to_string(),
                        content: msg.content.clone(),
                        confidence: 0.6,
                    });
                }
            }
        }
        
        candidates
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeCandidate {
    pub category: String,
    pub content: String,
    pub confidence: f64,
}
