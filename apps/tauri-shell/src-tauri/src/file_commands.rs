use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tokio::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TreeEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<TreeEntry>>,
}

fn validate_path(path: &str) -> Result<PathBuf, String> {
    if path.is_empty() {
        return Err("Path cannot be empty".into());
    }
    let p = PathBuf::from(path);
    if !p.is_absolute() {
        return Err("Path must be absolute".into());
    }
    // Canonicalize to resolve any ..
    // We can't do this for non-existent paths, so just check the string
    if path.contains("..") {
        return Err("Path traversal not allowed".into());
    }
    Ok(p)
}

#[tauri::command]
pub async fn fs_list_files(path: String) -> Result<Vec<FileEntry>, String> {
    let p = validate_path(&path)?;
    let mut entries = Vec::new();
    let mut dir = fs::read_dir(&p).await.map_err(|e| format!("Failed to read directory: {}", e))?;
    while let Some(entry) = dir.next_entry().await.map_err(|e| e.to_string())? {
        let metadata = entry.metadata().await.map_err(|e| e.to_string())?;
        entries.push(FileEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            path: entry.path().to_string_lossy().to_string(),
            is_dir: metadata.is_dir(),
            size: metadata.len(),
        });
    }
    entries.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

#[tauri::command]
pub async fn fs_read_file(path: String) -> Result<String, String> {
    let p = validate_path(&path)?;
    fs::read_to_string(&p).await.map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub async fn fs_write_file(path: String, content: String) -> Result<(), String> {
    let p = validate_path(&path)?;
    fs::write(&p, content).await.map_err(|e| format!("Failed to write file: {}", e))
}

#[tauri::command]
pub async fn fs_delete_file(path: String) -> Result<(), String> {
    let p = validate_path(&path)?;
    let metadata = fs::metadata(&p).await.map_err(|e| format!("Path not found: {}", e))?;
    if metadata.is_dir() {
        fs::remove_dir_all(&p).await.map_err(|e| format!("Failed to remove directory: {}", e))
    } else {
        fs::remove_file(&p).await.map_err(|e| format!("Failed to remove file: {}", e))
    }
}

#[tauri::command]
pub async fn fs_get_file_tree(path: String, depth: Option<u32>) -> Result<TreeEntry, String> {
    let p = validate_path(&path)?;
    let max_depth = depth.unwrap_or(3);
    build_tree(&p, max_depth, 0).await
}

async fn build_tree(path: &Path, max_depth: u32, current_depth: u32) -> Result<TreeEntry, String> {
    let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| path.to_string_lossy().to_string());
    let is_dir = path.is_dir();

    let children = if is_dir && current_depth < max_depth {
        let mut entries = Vec::new();
        let mut dir = fs::read_dir(path).await.map_err(|e| e.to_string())?;
        while let Some(entry) = dir.next_entry().await.map_err(|e| e.to_string())? {
            let entry_name = entry.file_name().to_string_lossy().to_string();
            // Skip hidden files and common large directories
            if entry_name.starts_with('.') || entry_name == "node_modules" || entry_name == "target" || entry_name == "dist" {
                continue;
            }
            entries.push(Box::pin(build_tree(&entry.path(), max_depth, current_depth + 1)).await?);
        }
        entries.sort_by(|a, b| {
            b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });
        Some(entries)
    } else if is_dir {
        Some(Vec::new()) // directory but at max depth
    } else {
        None
    };

    Ok(TreeEntry {
        name,
        path: path.to_string_lossy().to_string(),
        is_dir,
        children,
    })
}

#[tauri::command]
pub async fn fs_search_files(path: String, query: String) -> Result<Vec<String>, String> {
    let p = validate_path(&path)?;
    if query.is_empty() {
        return Err("Search query cannot be empty".into());
    }
    let query_lower = query.to_lowercase();
    let mut results = Vec::new();
    search_recursive(&p, &query_lower, &mut results, 0, 5).await;
    Ok(results)
}

#[async_recursion::async_recursion]
async fn search_recursive(path: &Path, query: &str, results: &mut Vec<String>, depth: u32, max_depth: u32) {
    if depth > max_depth || results.len() >= 100 {
        return;
    }
    if let Ok(mut dir) = fs::read_dir(path).await {
        while let Ok(Some(entry)) = dir.next_entry().await {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || name == "node_modules" || name == "target" {
                continue;
            }
            if name.to_lowercase().contains(query) {
                results.push(entry.path().to_string_lossy().to_string());
            }
            if entry.path().is_dir() {
                search_recursive(&entry.path(), query, results, depth + 1, max_depth).await;
            }
        }
    }
}
