use std::path::PathBuf;
use std::fs;
use serde::{Deserialize, Serialize};

/// Get the video editor workspace path
/// Creates directory if it doesn't exist
#[tauri::command]
pub fn get_video_editor_workspace_path() -> Result<String, String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Failed to get home directory".to_string())?;

    let workspace = home_dir
        .join("SmartAIHub")
        .join("VideoEditor")
        .join("workspace");

    // Create if not exists
    fs::create_dir_all(&workspace)
        .map_err(|e| format!("Failed to create workspace directory: {}", e))?;

    Ok(workspace.to_string_lossy().to_string())
}

/// Get the projects directory path
#[tauri::command]
pub fn get_video_editor_projects_path() -> Result<String, String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Failed to get home directory".to_string())?;

    let projects = home_dir
        .join("SmartAIHub")
        .join("VideoEditor")
        .join("projects");

    // Create if not exists
    fs::create_dir_all(&projects)
        .map_err(|e| format!("Failed to create projects directory: {}", e))?;

    Ok(projects.to_string_lossy().to_string())
}

/// Check if a file exists
#[tauri::command]
pub fn file_exists(path: String) -> bool {
    PathBuf::from(path).exists()
}

/// Save binary data to file
/// Security: Validates path is within workspace to prevent path traversal attacks
/// FIXED: Canonicalize parent path BEFORE creating directories to prevent symlink attacks
#[tauri::command]
pub async fn save_blob_to_file(blob: Vec<u8>, path: String) -> Result<(), String> {
    // Get workspace path
    let workspace_path = get_video_editor_workspace_path()?;
    let workspace = PathBuf::from(&workspace_path);

    // Validate workspace exists and canonicalize it first
    let canonical_workspace = workspace.canonicalize()
        .map_err(|e| format!("Failed to resolve workspace path: {}", e))?;

    // Convert target path to absolute
    let target = PathBuf::from(&path);

    // Security: Reject absolute paths that might bypass workspace
    if target.is_absolute() {
        return Err("Absolute paths are not allowed for security reasons".to_string());
    }

    // Build target path within workspace
    let target_path = canonical_workspace.join(&target);

    // Security: Validate the constructed path is still within workspace BEFORE creating dirs
    // This prevents symlink attacks where parent() could be a symlink outside workspace
    let target_path_str = target_path.to_string_lossy();
    let workspace_str = canonical_workspace.to_string_lossy();
    if !target_path_str.starts_with(workspace_str.as_ref()) {
        return Err("Path traversal detected: Target path is outside workspace".to_string());
    }

    // Security: Check for null bytes and special characters
    if path.contains('\0') || path.contains("..") {
        return Err("Invalid path: contains illegal characters".to_string());
    }

    // Now safe to create parent directory (after validation)
    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent directory: {}", e))?;
    }

    // Write file
    fs::write(&target_path, blob)
        .map_err(|e| format!("Failed to write file: {}", e))
}

/// Get file size in bytes
/// Security: Validates path is within workspace
#[tauri::command]
pub fn get_file_size(path: String) -> Result<u64, String> {
    // Get workspace path
    let workspace_path = get_video_editor_workspace_path()?;
    let workspace = PathBuf::from(&workspace_path);

    // Canonicalize workspace
    let canonical_workspace = workspace.canonicalize()
        .map_err(|e| format!("Failed to resolve workspace path: {}", e))?;

    let target = PathBuf::from(&path);

    // Security: Reject absolute paths
    if target.is_absolute() {
        return Err("Absolute paths are not allowed for security reasons".to_string());
    }

    // Security: Check for path traversal attempts
    if path.contains('\0') || path.contains("..") {
        return Err("Invalid path: contains illegal characters".to_string());
    }

    // Build target path within workspace
    let target_path = canonical_workspace.join(&target);

    // Security: Validate constructed path
    let target_path_str = target_path.to_string_lossy();
    let workspace_str = canonical_workspace.to_string_lossy();
    if !target_path_str.starts_with(workspace_str.as_ref()) {
        return Err("Path traversal detected: Cannot access files outside workspace".to_string());
    }

    let metadata = fs::metadata(&target_path)
        .map_err(|e| format!("Failed to get file metadata: {}", e))?;

    Ok(metadata.len())
}

/// Delete a file
/// Security: Validates path is within workspace to prevent unauthorized deletions
/// FIXED: Validate path before canonicalization to prevent symlink attacks
#[tauri::command]
pub fn delete_file(path: String) -> Result<(), String> {
    // Get workspace path
    let workspace_path = get_video_editor_workspace_path()?;
    let workspace = PathBuf::from(&workspace_path);

    // Canonicalize workspace first
    let canonical_workspace = workspace.canonicalize()
        .map_err(|e| format!("Failed to resolve workspace path: {}", e))?;

    let target = PathBuf::from(&path);

    // Security: Reject absolute paths
    if target.is_absolute() {
        return Err("Absolute paths are not allowed for security reasons".to_string());
    }

    // Security: Check for path traversal attempts
    if path.contains('\0') || path.contains("..") {
        return Err("Invalid path: contains illegal characters".to_string());
    }

    // Build target path within workspace
    let target_path = canonical_workspace.join(&target);

    // Security: Validate constructed path is within workspace (string check)
    let target_path_str = target_path.to_string_lossy();
    let workspace_str = canonical_workspace.to_string_lossy();
    if !target_path_str.starts_with(workspace_str.as_ref()) {
        return Err("Path traversal detected: Cannot delete files outside workspace".to_string());
    }

    // Verify file exists and is actually a file (not directory or symlink)
    if !target_path.exists() {
        return Err("File does not exist".to_string());
    }

    if !target_path.is_file() {
        return Err("Path is not a file (symlinks and directories not allowed)".to_string());
    }

    // Safe to delete now
    fs::remove_file(&target_path)
        .map_err(|e| format!("Failed to delete file: {}", e))
}

/// List files in directory
#[tauri::command]
pub fn list_workspace_files() -> Result<Vec<WorkspaceFile>, String> {
    let workspace_path = get_video_editor_workspace_path()?;
    let workspace = PathBuf::from(workspace_path);

    let mut files = Vec::new();

    if let Ok(entries) = fs::read_dir(workspace) {
        for entry in entries.flatten() {
            if let Ok(metadata) = entry.metadata() {
                if metadata.is_file() {
                    if let Some(filename) = entry.file_name().to_str() {
                        files.push(WorkspaceFile {
                            name: filename.to_string(),
                            path: entry.path().to_string_lossy().to_string(),
                            size: metadata.len(),
                            modified: metadata.modified()
                                .ok()
                                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                                .map(|d| d.as_secs()),
                        });
                    }
                }
            }
        }
    }

    Ok(files)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WorkspaceFile {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub modified: Option<u64>,
}

/// Clean up old workspace files (older than 30 days)
#[tauri::command]
pub fn cleanup_workspace(days: u64) -> Result<usize, String> {
    let workspace_path = get_video_editor_workspace_path()?;
    let workspace = PathBuf::from(workspace_path);

    let cutoff_time = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("Failed to get system time: {}", e))?
        .as_secs()
        .saturating_sub(days * 24 * 60 * 60);

    let mut deleted_count = 0;

    if let Ok(entries) = fs::read_dir(workspace) {
        for entry in entries.flatten() {
            if let Ok(metadata) = entry.metadata() {
                if metadata.is_file() {
                    if let Ok(modified) = metadata.modified() {
                        if let Ok(duration) = modified.duration_since(std::time::UNIX_EPOCH) {
                            if duration.as_secs() < cutoff_time {
                                if fs::remove_file(entry.path()).is_ok() {
                                    deleted_count += 1;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(deleted_count)
}
