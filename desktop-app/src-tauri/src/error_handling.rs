// Error Handling Module
//
// SECURITY FIX (HIGH-001): Proper error handling to replace .unwrap()
//
// Provides:
// - Custom error types
// - Error conversion traits
// - Result type aliases
// - Error logging

use serde::{Deserialize, Serialize};
use std::fmt;

// ============================================
// Custom Error Types
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AppError {
    // Database errors
    DatabaseConnection(String),
    DatabaseQuery(String),
    DatabaseMigration(String),
    
    // File system errors
    FileNotFound(String),
    FileReadError(String),
    FileWriteError(String),
    PathTraversal(String),
    
    // Authentication errors
    AuthenticationFailed(String),
    TokenExpired,
    TokenInvalid(String),
    Unauthorized,
    
    // API errors
    ApiKeyMissing(String),
    ApiKeyInvalid(String),
    ApiRequestFailed(String),
    ApiRateLimited(String),
    
    // Validation errors
    ValidationFailed(String),
    InvalidInput(String),
    InvalidFormat(String),
    
    // System errors
    ConfigurationError(String),
    InternalError(String),
    NotImplemented(String),
    
    // External service errors
    LlmServiceError(String),
    GitError(String),
    DockerError(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::DatabaseConnection(msg) => write!(f, "Database connection error: {}", msg),
            AppError::DatabaseQuery(msg) => write!(f, "Database query error: {}", msg),
            AppError::DatabaseMigration(msg) => write!(f, "Database migration error: {}", msg),
            
            AppError::FileNotFound(path) => write!(f, "File not found: {}", path),
            AppError::FileReadError(msg) => write!(f, "File read error: {}", msg),
            AppError::FileWriteError(msg) => write!(f, "File write error: {}", msg),
            AppError::PathTraversal(path) => write!(f, "Path traversal detected: {}", path),
            
            AppError::AuthenticationFailed(msg) => write!(f, "Authentication failed: {}", msg),
            AppError::TokenExpired => write!(f, "Token has expired"),
            AppError::TokenInvalid(msg) => write!(f, "Invalid token: {}", msg),
            AppError::Unauthorized => write!(f, "Unauthorized access"),
            
            AppError::ApiKeyMissing(provider) => write!(f, "API key missing for: {}", provider),
            AppError::ApiKeyInvalid(provider) => write!(f, "Invalid API key for: {}", provider),
            AppError::ApiRequestFailed(msg) => write!(f, "API request failed: {}", msg),
            AppError::ApiRateLimited(msg) => write!(f, "Rate limited: {}", msg),
            
            AppError::ValidationFailed(msg) => write!(f, "Validation failed: {}", msg),
            AppError::InvalidInput(msg) => write!(f, "Invalid input: {}", msg),
            AppError::InvalidFormat(msg) => write!(f, "Invalid format: {}", msg),
            
            AppError::ConfigurationError(msg) => write!(f, "Configuration error: {}", msg),
            AppError::InternalError(msg) => write!(f, "Internal error: {}", msg),
            AppError::NotImplemented(feature) => write!(f, "Not implemented: {}", feature),
            
            AppError::LlmServiceError(msg) => write!(f, "LLM service error: {}", msg),
            AppError::GitError(msg) => write!(f, "Git error: {}", msg),
            AppError::DockerError(msg) => write!(f, "Docker error: {}", msg),
        }
    }
}

impl std::error::Error for AppError {}

// ============================================
// Error Conversion Traits
// ============================================

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        match err.kind() {
            std::io::ErrorKind::NotFound => AppError::FileNotFound(err.to_string()),
            std::io::ErrorKind::PermissionDenied => AppError::Unauthorized,
            _ => AppError::InternalError(err.to_string()),
        }
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(err: rusqlite::Error) -> Self {
        match err {
            rusqlite::Error::QueryReturnedNoRows => {
                AppError::DatabaseQuery("No rows returned".to_string())
            }
            rusqlite::Error::SqliteFailure(_, Some(msg)) => {
                AppError::DatabaseQuery(msg)
            }
            _ => AppError::DatabaseQuery(err.to_string()),
        }
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::InvalidFormat(err.to_string())
    }
}

impl From<reqwest::Error> for AppError {
    fn from(err: reqwest::Error) -> Self {
        if err.is_timeout() {
            AppError::ApiRequestFailed("Request timeout".to_string())
        } else if err.is_connect() {
            AppError::ApiRequestFailed("Connection failed".to_string())
        } else {
            AppError::ApiRequestFailed(err.to_string())
        }
    }
}

impl From<keyring::Error> for AppError {
    fn from(err: keyring::Error) -> Self {
        match err {
            keyring::Error::NoEntry => AppError::ApiKeyMissing("Key not found".to_string()),
            _ => AppError::InternalError(err.to_string()),
        }
    }
}

// Convert AppError to String for Tauri commands
impl From<AppError> for String {
    fn from(err: AppError) -> Self {
        err.to_string()
    }
}

// ============================================
// Result Type Aliases
// ============================================

pub type AppResult<T> = Result<T, AppError>;

// ============================================
// Helper Functions
// ============================================

/// Convert Option to Result with custom error
pub trait OptionExt<T> {
    fn ok_or_app_error(self, error: AppError) -> AppResult<T>;
    fn ok_or_not_found(self, item: &str) -> AppResult<T>;
    fn ok_or_invalid(self, msg: &str) -> AppResult<T>;
}

impl<T> OptionExt<T> for Option<T> {
    fn ok_or_app_error(self, error: AppError) -> AppResult<T> {
        self.ok_or(error)
    }
    
    fn ok_or_not_found(self, item: &str) -> AppResult<T> {
        self.ok_or_else(|| AppError::FileNotFound(item.to_string()))
    }
    
    fn ok_or_invalid(self, msg: &str) -> AppResult<T> {
        self.ok_or_else(|| AppError::InvalidInput(msg.to_string()))
    }
}

/// Add context to errors
pub trait ResultExt<T, E> {
    fn context_app(self, msg: &str) -> AppResult<T>;
    fn with_context_app<F: FnOnce() -> String>(self, f: F) -> AppResult<T>;
}

impl<T, E: std::error::Error> ResultExt<T, E> for Result<T, E> {
    fn context_app(self, msg: &str) -> AppResult<T> {
        self.map_err(|e| AppError::InternalError(format!("{}: {}", msg, e)))
    }
    
    fn with_context_app<F: FnOnce() -> String>(self, f: F) -> AppResult<T> {
        self.map_err(|e| AppError::InternalError(format!("{}: {}", f(), e)))
    }
}

// ============================================
// Safe Unwrap Alternatives
// ============================================

/// Safely get value or return default
pub fn safe_unwrap_or<T: Default>(opt: Option<T>) -> T {
    opt.unwrap_or_default()
}

/// Safely get value or return provided default
pub fn safe_unwrap_or_else<T, F: FnOnce() -> T>(opt: Option<T>, f: F) -> T {
    opt.unwrap_or_else(f)
}

/// Log error and return default
pub fn log_error_and_default<T: Default, E: std::fmt::Display>(result: Result<T, E>, context: &str) -> T {
    match result {
        Ok(v) => v,
        Err(e) => {
            eprintln!("[ERROR] {}: {}", context, e);
            T::default()
        }
    }
}

/// Log error and return None
pub fn log_error_and_none<T, E: std::fmt::Display>(result: Result<T, E>, context: &str) -> Option<T> {
    match result {
        Ok(v) => Some(v),
        Err(e) => {
            eprintln!("[ERROR] {}: {}", context, e);
            None
        }
    }
}

// ============================================
// Validation Helpers
// ============================================

/// Validate that a string is not empty
pub fn validate_not_empty(value: &str, field_name: &str) -> AppResult<()> {
    if value.trim().is_empty() {
        return Err(AppError::ValidationFailed(format!("{} cannot be empty", field_name)));
    }
    Ok(())
}

/// Validate string length
pub fn validate_length(value: &str, min: usize, max: usize, field_name: &str) -> AppResult<()> {
    let len = value.len();
    if len < min || len > max {
        return Err(AppError::ValidationFailed(
            format!("{} must be between {} and {} characters", field_name, min, max)
        ));
    }
    Ok(())
}

/// Validate that a value is within range
pub fn validate_range<T: PartialOrd + std::fmt::Display>(
    value: T,
    min: T,
    max: T,
    field_name: &str,
) -> AppResult<()> {
    if value < min || value > max {
        return Err(AppError::ValidationFailed(
            format!("{} must be between {} and {}", field_name, min, max)
        ));
    }
    Ok(())
}

// ============================================
// Tests
// ============================================

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_app_error_display() {
        let err = AppError::DatabaseConnection("Connection refused".to_string());
        assert!(err.to_string().contains("Connection refused"));
    }
    
    #[test]
    fn test_option_ext() {
        let some_value: Option<i32> = Some(42);
        let none_value: Option<i32> = None;
        
        assert_eq!(some_value.ok_or_not_found("test").unwrap(), 42);
        assert!(none_value.ok_or_not_found("test").is_err());
    }
    
    #[test]
    fn test_validate_not_empty() {
        assert!(validate_not_empty("hello", "field").is_ok());
        assert!(validate_not_empty("", "field").is_err());
        assert!(validate_not_empty("   ", "field").is_err());
    }
    
    #[test]
    fn test_validate_length() {
        assert!(validate_length("hello", 1, 10, "field").is_ok());
        assert!(validate_length("", 1, 10, "field").is_err());
        assert!(validate_length("hello world!", 1, 5, "field").is_err());
    }
}
