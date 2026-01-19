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
        .join("SmartSpecPro")
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
        .join("SmartSpecPro")
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
#[tauri::command]
pub async fn save_blob_to_file(blob: Vec<u8>, path: String) -> Result<(), String> {
    // Get workspace path
    let workspace_path = get_video_editor_workspace_path()?;
    let workspace = PathBuf::from(&workspace_path);

    // Convert target path to absolute
    let target = PathBuf::from(&path);

    // Validate path is within workspace (prevent path traversal)
    let canonical_workspace = workspace.canonicalize()
        .map_err(|e| format!("Failed to resolve workspace path: {}", e))?;

    // If target is relative, resolve it against workspace
    let target_path = if target.is_absolute() {
        target
    } else {
        workspace.join(target)
    };

    // Ensure parent directory exists
    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent directory: {}", e))?;
    }

    // Canonicalize target path (after parent dir exists)
    let canonical_target = target_path.canonicalize()
        .or_else(|_| {
            // If file doesn't exist yet, validate parent directory
            target_path.parent()
                .ok_or_else(|| "Invalid path".to_string())?
                .canonicalize()
                .map(|parent| parent.join(target_path.file_name().unwrap()))
                .map_err(|e| format!("Failed to resolve target path: {}", e))
        })?;

    // Security check: ensure target is within workspace
    if !canonical_target.starts_with(&canonical_workspace) {
        return Err("Path traversal detected: Target path is outside workspace".to_string());
    }

    fs::write(&canonical_target, blob)
        .map_err(|e| format!("Failed to write file: {}", e))
}

/// Get file size in bytes
#[tauri::command]
pub fn get_file_size(path: String) -> Result<u64, String> {
    let metadata = fs::metadata(&path)
        .map_err(|e| format!("Failed to get file metadata: {}", e))?;

    Ok(metadata.len())
}

/// Delete a file
/// Security: Validates path is within workspace to prevent unauthorized deletions
#[tauri::command]
pub fn delete_file(path: String) -> Result<(), String> {
    // Get workspace path
    let workspace_path = get_video_editor_workspace_path()?;
    let workspace = PathBuf::from(&workspace_path);

    let target = PathBuf::from(&path);

    // Validate path is within workspace
    let canonical_workspace = workspace.canonicalize()
        .map_err(|e| format!("Failed to resolve workspace path: {}", e))?;

    let canonical_target = target.canonicalize()
        .map_err(|e| format!("Failed to resolve target path: {}", e))?;

    // Security check: ensure target is within workspace
    if !canonical_target.starts_with(&canonical_workspace) {
        return Err("Path traversal detected: Cannot delete files outside workspace".to_string());
    }

    fs::remove_file(&canonical_target)
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
