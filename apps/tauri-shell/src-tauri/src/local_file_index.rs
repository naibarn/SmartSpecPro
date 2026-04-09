use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WritebackMode {
    ReadSearchOnly,
    ManagedOutputOnly,
    UserConfirmedRootWrite,
    AdvancedLocalOverride,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StorageProtection {
    OsProtected,
    EncryptedAtRest,
    BestEffort,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ManagedLocalRoot {
    pub root_id: String,
    pub name: String,
    pub absolute_path: String,
    pub writeback_mode: WritebackMode,
    pub indexing_enabled: bool,
    pub preview_enabled: bool,
    pub vector_index_enabled: bool,
    pub denied_by_default: bool,
    pub denial_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DerivedStorePolicy {
    pub storage_protection: StorageProtection,
    pub preview_cache_ttl_days: u32,
    pub snippet_cache_ttl_days: u32,
    pub full_text_index_enabled: bool,
    pub vector_index_enabled: bool,
    pub purge_on_root_removal: bool,
    pub purge_on_offboarding: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DerivedStorePaths {
    pub root_id: String,
    pub metadata_dir: String,
    pub preview_cache_dir: String,
    pub snippet_cache_dir: String,
    pub full_text_index_dir: String,
    pub vector_index_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct IndexedFileRecord {
    pub root_id: String,
    pub file_name: String,
    pub absolute_path: String,
    pub relative_path: String,
    pub extension: Option<String>,
    pub size_bytes: u64,
}

pub fn normalize_desktop_path(raw_path: &str) -> Result<PathBuf, String> {
    if raw_path.trim().is_empty() {
        return Err("path cannot be empty".into());
    }

    let path = PathBuf::from(raw_path);
    if !path.is_absolute() {
        return Err("managed desktop paths must be absolute".into());
    }

    Ok(path)
}

pub fn is_sensitive_root(path: &Path) -> bool {
    let normalized = path.to_string_lossy().replace('\\', "/");
    let lower = normalized.to_lowercase();

    lower == "/"
        || lower.starts_with("/etc/")
        || lower == "/etc"
        || lower.starts_with("/bin/")
        || lower == "/bin"
        || lower.starts_with("/sbin/")
        || lower == "/sbin"
        || lower.starts_with("/usr/")
        || lower == "/usr"
        || lower.starts_with("/var/")
        || lower == "/var"
        || lower.starts_with("/private/")
        || lower == "/private"
        || lower.starts_with("/system/")
        || lower == "/system"
        || lower.starts_with("/windows/")
        || lower == "/windows"
        || lower.starts_with("c:/windows/")
        || lower == "c:/windows"
        || lower.starts_with("c:/program files/")
        || lower == "c:/program files"
        || lower.contains("/appdata/")
        || lower.contains("/library/application support/")
        || lower.contains("/library/keychains/")
        || lower.ends_with("/.ssh")
        || lower.contains("/.ssh/")
        || lower.ends_with("/.config")
        || lower.contains("/.config/")
}

pub fn build_managed_root(
    root_id: &str,
    name: &str,
    absolute_path: &str,
    requested_writeback_mode: Option<WritebackMode>,
    advanced_local_mode: bool,
) -> Result<ManagedLocalRoot, String> {
    let normalized = normalize_desktop_path(absolute_path)?;
    let denied = is_sensitive_root(&normalized);

    Ok(ManagedLocalRoot {
        root_id: root_id.to_string(),
        name: name.to_string(),
        absolute_path: normalized.to_string_lossy().to_string(),
        writeback_mode: if denied {
            WritebackMode::ReadSearchOnly
        } else if let Some(mode) = requested_writeback_mode {
            mode
        } else if advanced_local_mode {
            WritebackMode::UserConfirmedRootWrite
        } else {
            WritebackMode::ManagedOutputOnly
        },
        indexing_enabled: !denied,
        preview_enabled: !denied,
        vector_index_enabled: false,
        denied_by_default: denied,
        denial_reason: if denied {
            Some("sensitive_root_blocked_by_default".into())
        } else {
            None
        },
    })
}

pub fn default_derived_store_policy() -> DerivedStorePolicy {
    DerivedStorePolicy {
        storage_protection: StorageProtection::OsProtected,
        preview_cache_ttl_days: 30,
        snippet_cache_ttl_days: 30,
        full_text_index_enabled: true,
        vector_index_enabled: false,
        purge_on_root_removal: true,
        purge_on_offboarding: true,
    }
}

pub fn build_derived_store_paths(
    base_dir: &Path,
    root_id: &str,
) -> Result<DerivedStorePaths, String> {
    let safe_root_id = root_id.trim();
    if safe_root_id.is_empty() {
        return Err("root_id cannot be empty".into());
    }

    let root_base = base_dir.join(safe_root_id);
    Ok(DerivedStorePaths {
        root_id: safe_root_id.to_string(),
        metadata_dir: root_base.join("metadata").to_string_lossy().to_string(),
        preview_cache_dir: root_base.join("previews").to_string_lossy().to_string(),
        snippet_cache_dir: root_base.join("snippets").to_string_lossy().to_string(),
        full_text_index_dir: root_base.join("full_text").to_string_lossy().to_string(),
        vector_index_dir: root_base.join("vectors").to_string_lossy().to_string(),
    })
}

pub fn purge_derived_store_for_root(base_dir: &Path, root_id: &str) -> Result<(), String> {
    let paths = build_derived_store_paths(base_dir, root_id)?;
    let root_base = PathBuf::from(paths.metadata_dir)
        .parent()
        .map(|value| value.to_path_buf())
        .ok_or_else(|| "invalid derived store path".to_string())?;

    if root_base.exists() {
        fs::remove_dir_all(root_base).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn visit_files(
    root: &ManagedLocalRoot,
    current_dir: &Path,
    root_dir: &Path,
    depth: u32,
    max_depth: u32,
    records: &mut Vec<IndexedFileRecord>,
) -> Result<(), String> {
    if depth > max_depth || root.denied_by_default || !root.indexing_enabled {
        return Ok(());
    }

    let entries = fs::read_dir(current_dir).map_err(|error| error.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name == "node_modules" || name == "target" {
            continue;
        }

        let metadata = entry.metadata().map_err(|error| error.to_string())?;
        if metadata.is_dir() {
            visit_files(root, &path, root_dir, depth + 1, max_depth, records)?;
            continue;
        }

        if metadata.is_file() {
            let relative_path = path
                .strip_prefix(root_dir)
                .unwrap_or(&path)
                .to_string_lossy()
                .to_string();
            records.push(IndexedFileRecord {
                root_id: root.root_id.clone(),
                file_name: name,
                absolute_path: path.to_string_lossy().to_string(),
                relative_path,
                extension: path.extension().map(|value| value.to_string_lossy().to_string()),
                size_bytes: metadata.len(),
            });
        }
    }

    Ok(())
}

pub fn index_root_files(
    root: &ManagedLocalRoot,
    max_depth: u32,
) -> Result<Vec<IndexedFileRecord>, String> {
    let root_dir = normalize_desktop_path(&root.absolute_path)?;
    let mut records = Vec::new();
    visit_files(root, &root_dir, &root_dir, 0, max_depth, &mut records)?;
    Ok(records)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir(name: &str) -> PathBuf {
        let mut path = std::env::temp_dir();
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        path.push(format!("smartspec-local-file-index-{name}-{suffix}"));
        path
    }

    #[test]
    fn blocks_sensitive_roots() {
        let root = build_managed_root("etc", "etc", "/etc", None, false).unwrap();
        assert!(root.denied_by_default);
        assert_eq!(root.writeback_mode, WritebackMode::ReadSearchOnly);
    }

    #[test]
    fn builds_and_purges_derived_store_paths() {
        let base_dir = temp_dir("purge");
        fs::create_dir_all(base_dir.join("quotes/previews")).unwrap();
        let marker = base_dir.join("quotes/previews/preview.txt");
        fs::write(&marker, "preview").unwrap();

        let paths = build_derived_store_paths(&base_dir, "quotes").unwrap();
        assert!(paths.preview_cache_dir.ends_with("/quotes/previews") || paths.preview_cache_dir.ends_with("\\quotes\\previews"));

        purge_derived_store_for_root(&base_dir, "quotes").unwrap();
        assert!(!base_dir.join("quotes").exists());
    }

    #[test]
    fn indexes_files_inside_managed_roots() {
        let root_dir = temp_dir("index");
        fs::create_dir_all(root_dir.join("nested")).unwrap();
        fs::write(root_dir.join("quote.txt"), "hello").unwrap();
        fs::write(root_dir.join("nested/asset.pdf"), "pdf").unwrap();

        let root = build_managed_root(
            "quotes",
            "Quotes",
            &root_dir.to_string_lossy(),
            Some(WritebackMode::ManagedOutputOnly),
            false,
        )
        .unwrap();
        let indexed = index_root_files(&root, 4).unwrap();

        assert_eq!(indexed.len(), 2);
        assert!(indexed.iter().any(|record| record.relative_path.ends_with("quote.txt")));
    }
}
