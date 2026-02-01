// CLI Service - OpenCode CLI Backend
//
// Provides:
// - Command parsing and execution
// - File operations
// - Code analysis
// - Diff generation
// - Docker sandbox integration

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::Mutex;
use serde::{Deserialize, Serialize};

// ============================================
// Types
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CliCommand {
    Spec { description: String },
    Plan { task: String },
    Tasks { filter: Option<String> },
    Implement { instruction: String, files: Vec<String> },
    Debug { error: Option<String>, file: Option<String> },
    Review { files: Vec<String> },
    Ask { question: String },
    Help,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandResult {
    pub command: String,
    pub status: CommandStatus,
    pub output: Vec<OutputBlock>,
    pub suggestions: Vec<CodeSuggestion>,
    pub files_read: Vec<String>,
    pub files_modified: Vec<String>,
    pub execution_time_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CommandStatus {
    Success,
    Pending,
    Error(String),
    Streaming,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutputBlock {
    pub block_type: OutputBlockType,
    pub content: String,
    pub metadata: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum OutputBlockType {
    Text,
    Code,
    Diff,
    FileList,
    TaskList,
    Error,
    Warning,
    Info,
    Progress,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeSuggestion {
    pub id: String,
    pub file_path: String,
    pub original_content: Option<String>,
    pub suggested_content: String,
    pub diff_hunks: Vec<DiffHunk>,
    pub description: String,
    pub status: SuggestionStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffHunk {
    pub old_start: i32,
    pub old_lines: i32,
    pub new_start: i32,
    pub new_lines: i32,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffLine {
    pub line_type: DiffLineType,
    pub content: String,
    pub old_line_no: Option<i32>,
    pub new_line_no: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DiffLineType {
    Context,
    Addition,
    Deletion,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SuggestionStatus {
    Pending,
    Accepted,
    Rejected,
    Modified,
}

// ============================================
// File System Types
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileNode>>,
    pub size: Option<u64>,
    pub modified: Option<String>,
    pub extension: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileContent {
    pub path: String,
    pub content: String,
    pub language: String,
    pub line_count: i32,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub file_path: String,
    pub line_number: i32,
    pub line_content: String,
    pub match_start: i32,
    pub match_end: i32,
}

// ============================================
// CLI Service
// ============================================

pub struct CliService {
    workspace_path: Arc<Mutex<Option<PathBuf>>>,
    command_history: Arc<Mutex<Vec<String>>>,
    pending_suggestions: Arc<Mutex<HashMap<String, CodeSuggestion>>>,
}

impl CliService {
    pub fn new() -> Self {
        Self {
            workspace_path: Arc::new(Mutex::new(None)),
            command_history: Arc::new(Mutex::new(Vec::new())),
            pending_suggestions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn set_workspace(&self, path: &str) -> Result<(), String> {
        let path = PathBuf::from(path);
        if !path.exists() {
            return Err(format!("Path does not exist: {}", path.display()));
        }
        *self.workspace_path.lock().await = Some(path);
        Ok(())
    }

    pub async fn get_workspace(&self) -> Option<PathBuf> {
        self.workspace_path.lock().await.clone()
    }

    // ============================================
    // Command Parsing
    // ============================================

    pub fn parse_command(input: &str) -> Result<CliCommand, String> {
        let input = input.trim();
        
        if input.is_empty() {
            return Err("Empty command".to_string());
        }

        // Check for slash commands
        if input.starts_with('/') {
            let parts: Vec<&str> = input.splitn(2, ' ').collect();
            let command = parts[0].to_lowercase();
            let args = parts.get(1).map(|s| s.trim()).unwrap_or("");

            match command.as_str() {
                "/spec" => Ok(CliCommand::Spec {
                    description: args.to_string(),
                }),
                "/plan" => Ok(CliCommand::Plan {
                    task: args.to_string(),
                }),
                "/tasks" => Ok(CliCommand::Tasks {
                    filter: if args.is_empty() { None } else { Some(args.to_string()) },
                }),
                "/implement" | "/impl" => {
                    let (instruction, files) = Self::parse_implement_args(args);
                    Ok(CliCommand::Implement { instruction, files })
                }
                "/debug" => {
                    let (error, file) = Self::parse_debug_args(args);
                    Ok(CliCommand::Debug { error, file })
                }
                "/review" => {
                    let files = Self::parse_file_list(args);
                    Ok(CliCommand::Review { files })
                }
                "/ask" => Ok(CliCommand::Ask {
                    question: args.to_string(),
                }),
                "/help" | "/?" => Ok(CliCommand::Help),
                _ => Err(format!("Unknown command: {}", command)),
            }
        } else {
            // Default to ask
            Ok(CliCommand::Ask {
                question: input.to_string(),
            })
        }
    }

    fn parse_implement_args(args: &str) -> (String, Vec<String>) {
        let mut files = Vec::new();
        let mut instruction_parts = Vec::new();

        for part in args.split_whitespace() {
            if part.contains('.') && (part.contains('/') || part.ends_with(".ts") || part.ends_with(".rs") || part.ends_with(".tsx") || part.ends_with(".js")) {
                files.push(part.to_string());
            } else {
                instruction_parts.push(part);
            }
        }

        (instruction_parts.join(" "), files)
    }

    fn parse_debug_args(args: &str) -> (Option<String>, Option<String>) {
        let parts: Vec<&str> = args.splitn(2, " in ").collect();
        let error = if parts[0].is_empty() { None } else { Some(parts[0].to_string()) };
        let file = parts.get(1).map(|s| s.trim().to_string());
        (error, file)
    }

    fn parse_file_list(args: &str) -> Vec<String> {
        args.split_whitespace()
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .collect()
    }

    // ============================================
    // Command History
    // ============================================

    pub async fn add_to_history(&self, command: &str) {
        let mut history = self.command_history.lock().await;
        // Don't add duplicates
        if history.last().map(|s| s.as_str()) != Some(command) {
            history.push(command.to_string());
            // Keep last 100 commands
            if history.len() > 100 {
                history.remove(0);
            }
        }
    }

    pub async fn get_history(&self) -> Vec<String> {
        self.command_history.lock().await.clone()
    }

    pub async fn search_history(&self, query: &str) -> Vec<String> {
        let history = self.command_history.lock().await;
        history
            .iter()
            .filter(|cmd| cmd.to_lowercase().contains(&query.to_lowercase()))
            .cloned()
            .collect()
    }

    // ============================================
    // Suggestion Management
    // ============================================

    pub async fn add_suggestion(&self, suggestion: CodeSuggestion) {
        let mut suggestions = self.pending_suggestions.lock().await;
        suggestions.insert(suggestion.id.clone(), suggestion);
    }

    pub async fn get_suggestion(&self, id: &str) -> Option<CodeSuggestion> {
        let suggestions = self.pending_suggestions.lock().await;
        suggestions.get(id).cloned()
    }

    pub async fn update_suggestion_status(&self, id: &str, status: SuggestionStatus) -> Result<(), String> {
        let mut suggestions = self.pending_suggestions.lock().await;
        if let Some(suggestion) = suggestions.get_mut(id) {
            suggestion.status = status;
            Ok(())
        } else {
            Err(format!("Suggestion not found: {}", id))
        }
    }

    pub async fn get_pending_suggestions(&self) -> Vec<CodeSuggestion> {
        let suggestions = self.pending_suggestions.lock().await;
        suggestions
            .values()
            .filter(|s| s.status == SuggestionStatus::Pending)
            .cloned()
            .collect()
    }

    pub async fn clear_suggestions(&self) {
        let mut suggestions = self.pending_suggestions.lock().await;
        suggestions.clear();
    }

    // ============================================
    // File Operations
    // ============================================

    pub async fn read_file(&self, path: &str) -> Result<FileContent, String> {
        let workspace = self.workspace_path.lock().await;
        let full_path = if let Some(ws) = workspace.as_ref() {
            ws.join(path)
        } else {
            PathBuf::from(path)
        };

        if !full_path.exists() {
            return Err(format!("File not found: {}", path));
        }

        let content = std::fs::read_to_string(&full_path)
            .map_err(|e| format!("Failed to read file: {}", e))?;
        
        let metadata = std::fs::metadata(&full_path)
            .map_err(|e| format!("Failed to get metadata: {}", e))?;

        let extension = full_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");

        let language = Self::detect_language(extension);
        let line_count = content.lines().count() as i32;

        Ok(FileContent {
            path: path.to_string(),
            content,
            language,
            line_count,
            size: metadata.len(),
        })
    }

    pub async fn write_file(&self, path: &str, content: &str) -> Result<(), String> {
        let workspace = self.workspace_path.lock().await;
        let full_path = if let Some(ws) = workspace.as_ref() {
            ws.join(path)
        } else {
            PathBuf::from(path)
        };

        // Create parent directories if needed
        if let Some(parent) = full_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directories: {}", e))?;
        }

        std::fs::write(&full_path, content)
            .map_err(|e| format!("Failed to write file: {}", e))?;

        Ok(())
    }

    pub async fn list_files(&self, dir: Option<&str>) -> Result<Vec<FileNode>, String> {
        let workspace = self.workspace_path.lock().await;
        let base_path = workspace.as_ref().ok_or("No workspace set")?;
        
        let target_path = if let Some(d) = dir {
            base_path.join(d)
        } else {
            base_path.clone()
        };

        Self::build_file_tree(&target_path, base_path)
    }

    fn build_file_tree(path: &Path, base_path: &Path) -> Result<Vec<FileNode>, String> {
        let mut nodes = Vec::new();
        
        let entries = std::fs::read_dir(path)
            .map_err(|e| format!("Failed to read directory: {}", e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
            let file_path = entry.path();
            let file_name = entry.file_name().to_string_lossy().to_string();

            // Skip hidden files and common ignore patterns
            if file_name.starts_with('.') || 
               file_name == "node_modules" || 
               file_name == "target" ||
               file_name == "dist" ||
               file_name == "__pycache__" {
                continue;
            }

            let metadata = entry.metadata()
                .map_err(|e| format!("Failed to get metadata: {}", e))?;

            let relative_path = file_path
                .strip_prefix(base_path)
                .unwrap_or(&file_path)
                .to_string_lossy()
                .to_string();

            let is_dir = metadata.is_dir();
            let children = if is_dir {
                Some(Self::build_file_tree(&file_path, base_path)?)
            } else {
                None
            };

            let extension = if is_dir {
                None
            } else {
                file_path.extension().map(|e| e.to_string_lossy().to_string())
            };

            nodes.push(FileNode {
                name: file_name,
                path: relative_path,
                is_dir,
                children,
                size: if is_dir { None } else { Some(metadata.len()) },
                modified: None, // Could add timestamp
                extension,
            });
        }

        // Sort: directories first, then alphabetically
        nodes.sort_by(|a, b| {
            match (a.is_dir, b.is_dir) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
            }
        });

        Ok(nodes)
    }

    pub async fn search_files(&self, query: &str, file_pattern: Option<&str>) -> Result<Vec<SearchResult>, String> {
        let workspace = self.workspace_path.lock().await;
        let base_path = workspace.as_ref().ok_or("No workspace set")?;
        
        let mut results = Vec::new();
        Self::search_in_dir(base_path, base_path, query, file_pattern, &mut results)?;
        
        Ok(results)
    }

    fn search_in_dir(
        path: &Path,
        base_path: &Path,
        query: &str,
        file_pattern: Option<&str>,
        results: &mut Vec<SearchResult>,
    ) -> Result<(), String> {
        let entries = std::fs::read_dir(path)
            .map_err(|e| format!("Failed to read directory: {}", e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
            let file_path = entry.path();
            let file_name = entry.file_name().to_string_lossy().to_string();

            // Skip hidden and ignored
            if file_name.starts_with('.') || 
               file_name == "node_modules" || 
               file_name == "target" {
                continue;
            }

            if file_path.is_dir() {
                Self::search_in_dir(&file_path, base_path, query, file_pattern, results)?;
            } else {
                // Check file pattern
                if let Some(pattern) = file_pattern {
                    if !file_name.ends_with(pattern) && !file_name.contains(pattern) {
                        continue;
                    }
                }

                // Search in file
                if let Ok(content) = std::fs::read_to_string(&file_path) {
                    let relative_path = file_path
                        .strip_prefix(base_path)
                        .unwrap_or(&file_path)
                        .to_string_lossy()
                        .to_string();

                    for (line_no, line) in content.lines().enumerate() {
                        if let Some(pos) = line.to_lowercase().find(&query.to_lowercase()) {
                            results.push(SearchResult {
                                file_path: relative_path.clone(),
                                line_number: (line_no + 1) as i32,
                                line_content: line.to_string(),
                                match_start: pos as i32,
                                match_end: (pos + query.len()) as i32,
                            });

                            // Limit results per file
                            if results.len() >= 100 {
                                return Ok(());
                            }
                        }
                    }
                }
            }
        }

        Ok(())
    }

    // ============================================
    // Diff Generation
    // ============================================

    pub fn generate_diff(original: &str, modified: &str) -> Vec<DiffHunk> {
        let original_lines: Vec<&str> = original.lines().collect();
        let modified_lines: Vec<&str> = modified.lines().collect();
        
        let mut hunks = Vec::new();
        let mut current_hunk: Option<DiffHunk> = None;
        let mut old_line = 1i32;
        let mut new_line = 1i32;

        // Simple line-by-line diff (could use more sophisticated algorithm)
        let max_lines = original_lines.len().max(modified_lines.len());
        
        for i in 0..max_lines {
            let old_content = original_lines.get(i).copied();
            let new_content = modified_lines.get(i).copied();

            match (old_content, new_content) {
                (Some(old), Some(new)) if old == new => {
                    // Context line
                    if let Some(ref mut hunk) = current_hunk {
                        hunk.lines.push(DiffLine {
                            line_type: DiffLineType::Context,
                            content: old.to_string(),
                            old_line_no: Some(old_line),
                            new_line_no: Some(new_line),
                        });
                    }
                    old_line += 1;
                    new_line += 1;
                }
                (Some(old), Some(new)) => {
                    // Changed line
                    let hunk = current_hunk.get_or_insert_with(|| DiffHunk {
                        old_start: old_line,
                        old_lines: 0,
                        new_start: new_line,
                        new_lines: 0,
                        lines: Vec::new(),
                    });
                    
                    hunk.lines.push(DiffLine {
                        line_type: DiffLineType::Deletion,
                        content: old.to_string(),
                        old_line_no: Some(old_line),
                        new_line_no: None,
                    });
                    hunk.old_lines += 1;
                    
                    hunk.lines.push(DiffLine {
                        line_type: DiffLineType::Addition,
                        content: new.to_string(),
                        old_line_no: None,
                        new_line_no: Some(new_line),
                    });
                    hunk.new_lines += 1;
                    
                    old_line += 1;
                    new_line += 1;
                }
                (Some(old), None) => {
                    // Deleted line
                    let hunk = current_hunk.get_or_insert_with(|| DiffHunk {
                        old_start: old_line,
                        old_lines: 0,
                        new_start: new_line,
                        new_lines: 0,
                        lines: Vec::new(),
                    });
                    
                    hunk.lines.push(DiffLine {
                        line_type: DiffLineType::Deletion,
                        content: old.to_string(),
                        old_line_no: Some(old_line),
                        new_line_no: None,
                    });
                    hunk.old_lines += 1;
                    old_line += 1;
                }
                (None, Some(new)) => {
                    // Added line
                    let hunk = current_hunk.get_or_insert_with(|| DiffHunk {
                        old_start: old_line,
                        old_lines: 0,
                        new_start: new_line,
                        new_lines: 0,
                        lines: Vec::new(),
                    });
                    
                    hunk.lines.push(DiffLine {
                        line_type: DiffLineType::Addition,
                        content: new.to_string(),
                        old_line_no: None,
                        new_line_no: Some(new_line),
                    });
                    hunk.new_lines += 1;
                    new_line += 1;
                }
                (None, None) => break,
            }
        }

        if let Some(hunk) = current_hunk {
            if !hunk.lines.is_empty() {
                hunks.push(hunk);
            }
        }

        hunks
    }

    // ============================================
    // Language Detection
    // ============================================

    fn detect_language(extension: &str) -> String {
        match extension.to_lowercase().as_str() {
            "rs" => "rust",
            "ts" | "tsx" => "typescript",
            "js" | "jsx" => "javascript",
            "py" => "python",
            "go" => "go",
            "java" => "java",
            "c" | "h" => "c",
            "cpp" | "cc" | "hpp" => "cpp",
            "cs" => "csharp",
            "rb" => "ruby",
            "php" => "php",
            "swift" => "swift",
            "kt" | "kts" => "kotlin",
            "scala" => "scala",
            "html" | "htm" => "html",
            "css" | "scss" | "sass" | "less" => "css",
            "json" => "json",
            "yaml" | "yml" => "yaml",
            "toml" => "toml",
            "xml" => "xml",
            "md" | "markdown" => "markdown",
            "sql" => "sql",
            "sh" | "bash" | "zsh" => "shell",
            "dockerfile" => "dockerfile",
            _ => "plaintext",
        }.to_string()
    }
}

// ============================================
// Help Text
// ============================================

pub fn get_help_text() -> String {
    r#"
╔═══════════════════════════════════════════════════════════════════╗
║                     SmartSpecPro CLI Commands                      ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                    ║
║  /spec <description>    Create or update specification             ║
║  /plan <task>           Generate implementation plan               ║
║  /tasks [filter]        List and manage tasks                      ║
║  /implement <instr>     Implement changes with AI assistance       ║
║  /debug [error]         Debug issues and suggest fixes             ║
║  /review [files]        Review code and suggest improvements       ║
║  /ask <question>        Ask any question about the codebase        ║
║  /help                  Show this help message                     ║
║                                                                    ║
╠═══════════════════════════════════════════════════════════════════╣
║  Keyboard Shortcuts:                                               ║
║  ↑/↓        Navigate command history                               ║
║  Ctrl+P     Quick file search                                      ║
║  Ctrl+Enter Send message                                           ║
║  Ctrl+L     Clear chat                                             ║
║  Esc        Cancel current operation                               ║
║                                                                    ║
╠═══════════════════════════════════════════════════════════════════╣
║  Code Suggestions:                                                 ║
║  [✓ Accept]  Apply suggested changes                               ║
║  [✗ Reject]  Discard suggestion                                    ║
║  [✎ Edit]    Modify before applying                                ║
║  [💬 Discuss] Ask follow-up questions                              ║
║                                                                    ║
╚═══════════════════════════════════════════════════════════════════╝
"#.to_string()
}
