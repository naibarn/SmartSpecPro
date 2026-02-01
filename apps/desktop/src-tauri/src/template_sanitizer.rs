// Template Sanitizer Module
//
// SECURITY FIX (HIGH-005): Template sanitization to prevent path traversal
//
// Provides:
// - Template path validation
// - Variable sanitization
// - Safe file operations

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use regex::Regex;
use once_cell::sync::Lazy;

// ============================================
// Constants
// ============================================

/// Allowed template directories
const ALLOWED_TEMPLATE_DIRS: &[&str] = &[
    "templates",
    "user_templates",
    ".smartspec/templates",
];

/// Allowed file extensions for templates
const ALLOWED_EXTENSIONS: &[&str] = &[
    "md", "txt", "json", "yaml", "yml", "toml",
    "html", "css", "js", "ts", "tsx", "jsx",
    "rs", "py", "go", "java", "kt", "swift",
    "sql", "sh", "bash", "zsh",
    "gitignore", "dockerignore", "env.example",
];

/// Maximum template file size (1MB)
const MAX_TEMPLATE_SIZE: u64 = 1024 * 1024;

/// Maximum variable name length
const MAX_VAR_NAME_LENGTH: usize = 64;

/// Maximum variable value length
const MAX_VAR_VALUE_LENGTH: usize = 10_000;

// ============================================
// Regex Patterns
// ============================================

static TEMPLATE_VAR_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}").unwrap()
});

static SAFE_VAR_NAME_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^[a-zA-Z_][a-zA-Z0-9_]*$").unwrap()
});

static DANGEROUS_CONTENT_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)(<script|javascript:|data:|vbscript:|on\w+=)").unwrap()
});

// ============================================
// Error Types
// ============================================

#[derive(Debug, Clone)]
pub enum SanitizeError {
    PathTraversal(String),
    InvalidExtension(String),
    FileTooLarge(u64),
    InvalidVariableName(String),
    InvalidVariableValue(String),
    DangerousContent(String),
    IoError(String),
}

impl std::fmt::Display for SanitizeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SanitizeError::PathTraversal(path) => write!(f, "Path traversal detected: {}", path),
            SanitizeError::InvalidExtension(ext) => write!(f, "Invalid file extension: {}", ext),
            SanitizeError::FileTooLarge(size) => write!(f, "File too large: {} bytes", size),
            SanitizeError::InvalidVariableName(name) => write!(f, "Invalid variable name: {}", name),
            SanitizeError::InvalidVariableValue(msg) => write!(f, "Invalid variable value: {}", msg),
            SanitizeError::DangerousContent(msg) => write!(f, "Dangerous content detected: {}", msg),
            SanitizeError::IoError(msg) => write!(f, "IO error: {}", msg),
        }
    }
}

impl std::error::Error for SanitizeError {}

pub type SanitizeResult<T> = Result<T, SanitizeError>;

// ============================================
// Path Sanitization
// ============================================

/// Sanitize and validate a template path
pub fn sanitize_template_path(path: &str, base_dir: &Path) -> SanitizeResult<PathBuf> {
    // Check for null bytes
    if path.contains('\0') {
        return Err(SanitizeError::PathTraversal("Path contains null byte".to_string()));
    }
    
    // Check for path traversal attempts
    if path.contains("..") {
        return Err(SanitizeError::PathTraversal("Path contains '..'".to_string()));
    }
    
    // Normalize path separators
    let normalized = path.replace('\\', "/");
    
    // Check for absolute paths
    if normalized.starts_with('/') || normalized.contains(':') {
        return Err(SanitizeError::PathTraversal("Absolute paths not allowed".to_string()));
    }
    
    // Build full path
    let full_path = base_dir.join(&normalized);
    
    // Canonicalize base directory
    let base_canonical = base_dir.canonicalize()
        .map_err(|e| SanitizeError::IoError(e.to_string()))?;
    
    // For existing files, verify they're within base
    if full_path.exists() {
        let full_canonical = full_path.canonicalize()
            .map_err(|e| SanitizeError::IoError(e.to_string()))?;
        
        if !full_canonical.starts_with(&base_canonical) {
            return Err(SanitizeError::PathTraversal(
                format!("Path escapes base directory: {}", full_canonical.display())
            ));
        }
    }
    
    // Validate extension
    if let Some(ext) = full_path.extension().and_then(|e| e.to_str()) {
        let ext_lower = ext.to_lowercase();
        if !ALLOWED_EXTENSIONS.contains(&ext_lower.as_str()) {
            return Err(SanitizeError::InvalidExtension(ext.to_string()));
        }
    }
    
    Ok(full_path)
}

/// Validate that a path is within allowed template directories
pub fn validate_template_directory(path: &Path, workspace_dir: &Path) -> SanitizeResult<()> {
    let path_str = path.to_string_lossy();
    
    let is_allowed = ALLOWED_TEMPLATE_DIRS.iter().any(|dir| {
        let allowed_path = workspace_dir.join(dir);
        path.starts_with(&allowed_path)
    });
    
    if !is_allowed {
        return Err(SanitizeError::PathTraversal(
            format!("Path not in allowed template directory: {}", path_str)
        ));
    }
    
    Ok(())
}

// ============================================
// Variable Sanitization
// ============================================

/// Validate a template variable name
pub fn validate_variable_name(name: &str) -> SanitizeResult<()> {
    if name.is_empty() {
        return Err(SanitizeError::InvalidVariableName("Variable name cannot be empty".to_string()));
    }
    
    if name.len() > MAX_VAR_NAME_LENGTH {
        return Err(SanitizeError::InvalidVariableName(
            format!("Variable name too long (max {} chars)", MAX_VAR_NAME_LENGTH)
        ));
    }
    
    if !SAFE_VAR_NAME_REGEX.is_match(name) {
        return Err(SanitizeError::InvalidVariableName(
            format!("Invalid variable name: {}", name)
        ));
    }
    
    Ok(())
}

/// Sanitize a template variable value
pub fn sanitize_variable_value(value: &str, allow_html: bool) -> SanitizeResult<String> {
    if value.len() > MAX_VAR_VALUE_LENGTH {
        return Err(SanitizeError::InvalidVariableValue(
            format!("Value too long (max {} chars)", MAX_VAR_VALUE_LENGTH)
        ));
    }
    
    // Check for dangerous content
    if !allow_html && DANGEROUS_CONTENT_REGEX.is_match(value) {
        return Err(SanitizeError::DangerousContent(
            "Value contains potentially dangerous content".to_string()
        ));
    }
    
    // Remove null bytes
    let sanitized = value.replace('\0', "");
    
    Ok(sanitized)
}

/// Validate all variables in a map
pub fn validate_variables(variables: &HashMap<String, String>, allow_html: bool) -> SanitizeResult<HashMap<String, String>> {
    let mut sanitized = HashMap::new();
    
    for (name, value) in variables {
        validate_variable_name(name)?;
        let clean_value = sanitize_variable_value(value, allow_html)?;
        sanitized.insert(name.clone(), clean_value);
    }
    
    Ok(sanitized)
}

// ============================================
// Template Content Sanitization
// ============================================

/// Extract variable names from template content
pub fn extract_variables(content: &str) -> Vec<String> {
    TEMPLATE_VAR_REGEX
        .captures_iter(content)
        .filter_map(|cap| cap.get(1).map(|m| m.as_str().to_string()))
        .collect()
}

/// Render template with sanitized variables
pub fn render_template(
    content: &str,
    variables: &HashMap<String, String>,
    allow_html: bool,
) -> SanitizeResult<String> {
    // Validate all variables first
    let sanitized_vars = validate_variables(variables, allow_html)?;
    
    // Replace variables in content
    let mut result = content.to_string();
    
    for (name, value) in &sanitized_vars {
        let pattern = format!("{{{{{}}}}}", name);
        result = result.replace(&pattern, value);
    }
    
    Ok(result)
}

/// Check template content for dangerous patterns
pub fn check_template_safety(content: &str) -> SanitizeResult<()> {
    // Check for dangerous patterns
    let dangerous_patterns = [
        ("{{#exec", "Template execution directive"),
        ("{{#include /", "Absolute include path"),
        ("{{#include ../", "Parent directory include"),
        ("eval(", "JavaScript eval"),
        ("exec(", "Execution function"),
        ("system(", "System call"),
        ("shell_exec", "Shell execution"),
        ("passthru", "Passthru function"),
        ("__import__", "Python import"),
    ];
    
    for (pattern, description) in dangerous_patterns {
        if content.contains(pattern) {
            return Err(SanitizeError::DangerousContent(
                format!("Dangerous pattern detected: {}", description)
            ));
        }
    }
    
    Ok(())
}

// ============================================
// File Operations
// ============================================

/// Read template file with safety checks
pub fn read_template_file(path: &Path, base_dir: &Path) -> SanitizeResult<String> {
    // Validate path
    let safe_path = sanitize_template_path(
        path.to_str().ok_or_else(|| SanitizeError::IoError("Invalid path".to_string()))?,
        base_dir,
    )?;
    
    // Check file size
    let metadata = std::fs::metadata(&safe_path)
        .map_err(|e| SanitizeError::IoError(e.to_string()))?;
    
    if metadata.len() > MAX_TEMPLATE_SIZE {
        return Err(SanitizeError::FileTooLarge(metadata.len()));
    }
    
    // Read content
    let content = std::fs::read_to_string(&safe_path)
        .map_err(|e| SanitizeError::IoError(e.to_string()))?;
    
    // Check content safety
    check_template_safety(&content)?;
    
    Ok(content)
}

/// Write template output with safety checks
pub fn write_template_output(
    path: &Path,
    content: &str,
    base_dir: &Path,
) -> SanitizeResult<()> {
    // Validate path
    let safe_path = sanitize_template_path(
        path.to_str().ok_or_else(|| SanitizeError::IoError("Invalid path".to_string()))?,
        base_dir,
    )?;
    
    // Create parent directories if needed
    if let Some(parent) = safe_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| SanitizeError::IoError(e.to_string()))?;
    }
    
    // Write content
    std::fs::write(&safe_path, content)
        .map_err(|e| SanitizeError::IoError(e.to_string()))?;
    
    Ok(())
}

// ============================================
// HTML Escaping
// ============================================

/// Escape HTML special characters
pub fn escape_html(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#x27;")
}

/// Escape for use in JavaScript strings
pub fn escape_js_string(input: &str) -> String {
    input
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\'', "\\'")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
}

// ============================================
// Tauri Commands
// ============================================

#[tauri::command]
pub fn sanitize_template_variables(
    variables: HashMap<String, String>,
    allow_html: bool,
) -> Result<HashMap<String, String>, String> {
    validate_variables(&variables, allow_html).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn validate_template_path_cmd(path: String, base_dir: String) -> Result<String, String> {
    let base = PathBuf::from(&base_dir);
    sanitize_template_path(&path, &base)
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn check_template_content_safety(content: String) -> Result<(), String> {
    check_template_safety(&content).map_err(|e| e.to_string())
}

// ============================================
// Tests
// ============================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;
    
    #[test]
    fn test_sanitize_template_path_valid() {
        let temp_dir = env::temp_dir();
        let result = sanitize_template_path("templates/test.md", &temp_dir);
        assert!(result.is_ok());
    }
    
    #[test]
    fn test_sanitize_template_path_traversal() {
        let temp_dir = env::temp_dir();
        let result = sanitize_template_path("../../../etc/passwd", &temp_dir);
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), SanitizeError::PathTraversal(_)));
    }
    
    #[test]
    fn test_sanitize_template_path_absolute() {
        let temp_dir = env::temp_dir();
        let result = sanitize_template_path("/etc/passwd", &temp_dir);
        assert!(result.is_err());
    }
    
    #[test]
    fn test_validate_variable_name() {
        assert!(validate_variable_name("project_name").is_ok());
        assert!(validate_variable_name("_private").is_ok());
        assert!(validate_variable_name("var123").is_ok());
        
        assert!(validate_variable_name("").is_err());
        assert!(validate_variable_name("123var").is_err());
        assert!(validate_variable_name("var-name").is_err());
        assert!(validate_variable_name("var name").is_err());
    }
    
    #[test]
    fn test_sanitize_variable_value() {
        assert!(sanitize_variable_value("Hello World", false).is_ok());
        assert!(sanitize_variable_value("test@example.com", false).is_ok());
        
        // Should reject dangerous content when allow_html is false
        assert!(sanitize_variable_value("<script>alert(1)</script>", false).is_err());
        assert!(sanitize_variable_value("javascript:alert(1)", false).is_err());
        
        // Should allow when allow_html is true
        assert!(sanitize_variable_value("<b>bold</b>", true).is_ok());
    }
    
    #[test]
    fn test_extract_variables() {
        let content = "Hello {{name}}, welcome to {{project}}!";
        let vars = extract_variables(content);
        assert_eq!(vars.len(), 2);
        assert!(vars.contains(&"name".to_string()));
        assert!(vars.contains(&"project".to_string()));
    }
    
    #[test]
    fn test_render_template() {
        let content = "Hello {{name}}!";
        let mut vars = HashMap::new();
        vars.insert("name".to_string(), "World".to_string());
        
        let result = render_template(content, &vars, false).unwrap();
        assert_eq!(result, "Hello World!");
    }
    
    #[test]
    fn test_check_template_safety() {
        assert!(check_template_safety("Hello {{name}}").is_ok());
        assert!(check_template_safety("{{#exec rm -rf /}}").is_err());
        assert!(check_template_safety("{{#include /etc/passwd}}").is_err());
    }
    
    #[test]
    fn test_escape_html() {
        assert_eq!(escape_html("<script>"), "&lt;script&gt;");
        assert_eq!(escape_html("a & b"), "a &amp; b");
        assert_eq!(escape_html("\"quoted\""), "&quot;quoted&quot;");
    }
    
    #[test]
    fn test_escape_js_string() {
        assert_eq!(escape_js_string("line1\nline2"), "line1\\nline2");
        assert_eq!(escape_js_string("say \"hello\""), "say \\\"hello\\\"");
    }
}
