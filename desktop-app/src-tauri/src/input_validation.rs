// Input Validation Module
//
// SECURITY FIX (HIGH-003): Input validation for command execution
//
// Provides:
// - Path validation (prevent traversal)
// - Command argument validation
// - Container/branch name validation
// - General input sanitization

use regex::Regex;
use std::path::{Path, PathBuf};
use once_cell::sync::Lazy;

// ============================================
// Regex Patterns (compiled once)
// ============================================

static CONTAINER_NAME_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^[a-zA-Z0-9][a-zA-Z0-9_.-]*$").unwrap()
});

static BRANCH_NAME_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^[a-zA-Z0-9/_.-]+$").unwrap()
});

static IMAGE_NAME_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^[a-z0-9][a-z0-9._/-]*(:[\w.-]+)?$").unwrap()
});

static COMMIT_HASH_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^[a-f0-9]{7,40}$").unwrap()
});

static EMAIL_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$").unwrap()
});

static ALPHANUMERIC_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^[a-zA-Z0-9_-]+$").unwrap()
});

static SAFE_FILENAME_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^[a-zA-Z0-9][a-zA-Z0-9._-]*$").unwrap()
});

// ============================================
// Path Validation
// ============================================

/// Validate that a path is within an allowed base directory
/// Prevents path traversal attacks
pub fn validate_path_within(path: &str, base_dir: &Path) -> Result<PathBuf, String> {
    // Check for obvious traversal attempts
    if path.contains("..") {
        return Err("Path traversal detected: contains '..'".to_string());
    }
    
    // Check for null bytes
    if path.contains('\0') {
        return Err("Path contains null byte".to_string());
    }
    
    let path = PathBuf::from(path);
    
    // Get canonical paths
    let base_canonical = base_dir.canonicalize()
        .map_err(|e| format!("Invalid base directory: {}", e))?;
    
    // For the target path, we need to handle non-existent paths
    let target_path = if path.is_absolute() {
        path.clone()
    } else {
        base_dir.join(&path)
    };
    
    // Try to canonicalize, or build from components
    let target_canonical = if target_path.exists() {
        target_path.canonicalize()
            .map_err(|e| format!("Invalid path: {}", e))?
    } else {
        // For non-existent paths, normalize manually
        normalize_path(&target_path)?
    };
    
    // Check if target is within base
    if !target_canonical.starts_with(&base_canonical) {
        return Err(format!(
            "Path '{}' is outside allowed directory '{}'",
            target_canonical.display(),
            base_canonical.display()
        ));
    }
    
    Ok(target_canonical)
}

/// Normalize a path without requiring it to exist
fn normalize_path(path: &Path) -> Result<PathBuf, String> {
    let mut normalized = PathBuf::new();
    
    for component in path.components() {
        match component {
            std::path::Component::ParentDir => {
                if !normalized.pop() {
                    return Err("Path traversal detected".to_string());
                }
            }
            std::path::Component::Normal(name) => {
                normalized.push(name);
            }
            std::path::Component::RootDir => {
                normalized.push("/");
            }
            std::path::Component::Prefix(prefix) => {
                normalized.push(prefix.as_os_str());
            }
            std::path::Component::CurDir => {
                // Skip current directory markers
            }
        }
    }
    
    Ok(normalized)
}

/// Validate a filename (no path components)
pub fn validate_filename(filename: &str) -> Result<(), String> {
    if filename.is_empty() {
        return Err("Filename cannot be empty".to_string());
    }
    
    if filename.len() > 255 {
        return Err("Filename too long (max 255 characters)".to_string());
    }
    
    // Check for path separators
    if filename.contains('/') || filename.contains('\\') {
        return Err("Filename cannot contain path separators".to_string());
    }
    
    // Check for special names
    if filename == "." || filename == ".." {
        return Err("Invalid filename".to_string());
    }
    
    // Check for null bytes
    if filename.contains('\0') {
        return Err("Filename contains null byte".to_string());
    }
    
    // Check for valid characters
    if !SAFE_FILENAME_REGEX.is_match(filename) {
        return Err("Filename contains invalid characters".to_string());
    }
    
    Ok(())
}

// ============================================
// Docker Validation
// ============================================

/// Validate Docker container name
pub fn validate_container_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Container name cannot be empty".to_string());
    }
    
    if name.len() > 128 {
        return Err("Container name too long (max 128 characters)".to_string());
    }
    
    if !CONTAINER_NAME_REGEX.is_match(name) {
        return Err(format!(
            "Invalid container name '{}': must start with alphanumeric and contain only alphanumeric, underscore, period, or hyphen",
            name
        ));
    }
    
    Ok(())
}

/// Validate Docker image name
pub fn validate_image_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Image name cannot be empty".to_string());
    }
    
    if name.len() > 256 {
        return Err("Image name too long (max 256 characters)".to_string());
    }
    
    if !IMAGE_NAME_REGEX.is_match(name) {
        return Err(format!(
            "Invalid image name '{}': must be lowercase and follow Docker naming conventions",
            name
        ));
    }
    
    Ok(())
}

// ============================================
// Git Validation
// ============================================

/// Validate Git branch name
pub fn validate_branch_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Branch name cannot be empty".to_string());
    }
    
    if name.len() > 256 {
        return Err("Branch name too long (max 256 characters)".to_string());
    }
    
    // Check for forbidden patterns
    if name.contains("..") {
        return Err("Branch name cannot contain '..'".to_string());
    }
    
    if name.starts_with('/') || name.ends_with('/') {
        return Err("Branch name cannot start or end with '/'".to_string());
    }
    
    if name.starts_with('-') {
        return Err("Branch name cannot start with '-'".to_string());
    }
    
    if name.ends_with(".lock") {
        return Err("Branch name cannot end with '.lock'".to_string());
    }
    
    if !BRANCH_NAME_REGEX.is_match(name) {
        return Err(format!(
            "Invalid branch name '{}': must contain only alphanumeric, slash, underscore, period, or hyphen",
            name
        ));
    }
    
    Ok(())
}

/// Validate Git commit hash
pub fn validate_commit_hash(hash: &str) -> Result<(), String> {
    if !COMMIT_HASH_REGEX.is_match(hash) {
        return Err(format!(
            "Invalid commit hash '{}': must be 7-40 hexadecimal characters",
            hash
        ));
    }
    
    Ok(())
}

/// Validate Git remote URL
pub fn validate_git_remote_url(url: &str) -> Result<(), String> {
    if url.is_empty() {
        return Err("Remote URL cannot be empty".to_string());
    }
    
    // Check for valid protocols
    let valid_protocols = ["https://", "git@", "ssh://", "git://"];
    let has_valid_protocol = valid_protocols.iter().any(|p| url.starts_with(p));
    
    if !has_valid_protocol {
        return Err("Invalid remote URL protocol".to_string());
    }
    
    // Check for command injection attempts
    if url.contains(';') || url.contains('|') || url.contains('&') || url.contains('$') {
        return Err("Remote URL contains invalid characters".to_string());
    }
    
    Ok(())
}

// ============================================
// General Validation
// ============================================

/// Validate email address
pub fn validate_email(email: &str) -> Result<(), String> {
    if email.is_empty() {
        return Err("Email cannot be empty".to_string());
    }
    
    if email.len() > 254 {
        return Err("Email too long (max 254 characters)".to_string());
    }
    
    if !EMAIL_REGEX.is_match(email) {
        return Err(format!("Invalid email address: {}", email));
    }
    
    Ok(())
}

/// Validate alphanumeric identifier
pub fn validate_identifier(id: &str, field_name: &str) -> Result<(), String> {
    if id.is_empty() {
        return Err(format!("{} cannot be empty", field_name));
    }
    
    if id.len() > 128 {
        return Err(format!("{} too long (max 128 characters)", field_name));
    }
    
    if !ALPHANUMERIC_REGEX.is_match(id) {
        return Err(format!(
            "Invalid {}: must contain only alphanumeric, underscore, or hyphen",
            field_name
        ));
    }
    
    Ok(())
}

/// Validate UUID format
pub fn validate_uuid(uuid: &str) -> Result<(), String> {
    let uuid_regex = Regex::new(
        r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
    ).unwrap();
    
    if !uuid_regex.is_match(&uuid.to_lowercase()) {
        return Err(format!("Invalid UUID format: {}", uuid));
    }
    
    Ok(())
}

/// Sanitize string for shell command argument
/// Returns the sanitized string or error if it contains dangerous characters
pub fn sanitize_shell_arg(arg: &str) -> Result<String, String> {
    // Check for dangerous characters
    let dangerous_chars = [';', '|', '&', '$', '`', '(', ')', '{', '}', '[', ']', '<', '>', '\n', '\r'];
    
    for c in dangerous_chars {
        if arg.contains(c) {
            return Err(format!("Argument contains dangerous character: '{}'", c));
        }
    }
    
    // Check for null bytes
    if arg.contains('\0') {
        return Err("Argument contains null byte".to_string());
    }
    
    Ok(arg.to_string())
}

/// Validate and sanitize command arguments
pub fn validate_command_args(args: &[&str]) -> Result<Vec<String>, String> {
    let mut validated = Vec::new();
    
    for arg in args {
        validated.push(sanitize_shell_arg(arg)?);
    }
    
    Ok(validated)
}

// ============================================
// File Extension Validation
// ============================================

/// Validate file extension against whitelist
pub fn validate_file_extension(filename: &str, allowed: &[&str]) -> Result<(), String> {
    let extension = Path::new(filename)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase());
    
    match extension {
        Some(ext) => {
            let allowed_lower: Vec<String> = allowed.iter()
                .map(|e| e.to_lowercase().trim_start_matches('.').to_string())
                .collect();
            
            if !allowed_lower.contains(&ext) {
                return Err(format!(
                    "File extension '{}' not allowed. Allowed: {:?}",
                    ext, allowed
                ));
            }
            Ok(())
        }
        None => Err("File has no extension".to_string()),
    }
}

// ============================================
// Tests
// ============================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;
    
    #[test]
    fn test_validate_container_name() {
        assert!(validate_container_name("my-container").is_ok());
        assert!(validate_container_name("container_1").is_ok());
        assert!(validate_container_name("container.name").is_ok());
        
        assert!(validate_container_name("").is_err());
        assert!(validate_container_name("-invalid").is_err());
        assert!(validate_container_name("invalid name").is_err());
        assert!(validate_container_name("invalid;name").is_err());
    }
    
    #[test]
    fn test_validate_branch_name() {
        assert!(validate_branch_name("main").is_ok());
        assert!(validate_branch_name("feature/new-feature").is_ok());
        assert!(validate_branch_name("release-1.0").is_ok());
        
        assert!(validate_branch_name("").is_err());
        assert!(validate_branch_name("..").is_err());
        assert!(validate_branch_name("/invalid").is_err());
        assert!(validate_branch_name("invalid/").is_err());
        assert!(validate_branch_name("-invalid").is_err());
        assert!(validate_branch_name("branch.lock").is_err());
    }
    
    #[test]
    fn test_validate_commit_hash() {
        assert!(validate_commit_hash("abc1234").is_ok());
        assert!(validate_commit_hash("abc1234567890def1234567890abc1234567890ab").is_ok());
        
        assert!(validate_commit_hash("").is_err());
        assert!(validate_commit_hash("abc123").is_err()); // Too short
        assert!(validate_commit_hash("xyz1234").is_err()); // Invalid hex
    }
    
    #[test]
    fn test_validate_email() {
        assert!(validate_email("user@example.com").is_ok());
        assert!(validate_email("user.name@example.co.uk").is_ok());
        
        assert!(validate_email("").is_err());
        assert!(validate_email("invalid").is_err());
        assert!(validate_email("@example.com").is_err());
        assert!(validate_email("user@").is_err());
    }
    
    #[test]
    fn test_sanitize_shell_arg() {
        assert!(sanitize_shell_arg("safe-arg").is_ok());
        assert!(sanitize_shell_arg("safe_arg_123").is_ok());
        
        assert!(sanitize_shell_arg("arg;rm -rf /").is_err());
        assert!(sanitize_shell_arg("arg|cat /etc/passwd").is_err());
        assert!(sanitize_shell_arg("$(whoami)").is_err());
        assert!(sanitize_shell_arg("`whoami`").is_err());
    }
    
    #[test]
    fn test_validate_filename() {
        assert!(validate_filename("file.txt").is_ok());
        assert!(validate_filename("my-file_v1.0.txt").is_ok());
        
        assert!(validate_filename("").is_err());
        assert!(validate_filename("..").is_err());
        assert!(validate_filename("file/path").is_err());
        assert!(validate_filename("file\\path").is_err());
    }
    
    #[test]
    fn test_validate_file_extension() {
        let allowed = &["txt", "md", "json"];
        
        assert!(validate_file_extension("file.txt", allowed).is_ok());
        assert!(validate_file_extension("file.TXT", allowed).is_ok());
        assert!(validate_file_extension("file.md", allowed).is_ok());
        
        assert!(validate_file_extension("file.exe", allowed).is_err());
        assert!(validate_file_extension("file", allowed).is_err());
    }
}
