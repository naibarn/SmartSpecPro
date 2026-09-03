use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

const MAX_SCAN_FILES: usize = 100_000;
const MAX_SCAN_DEPTH: usize = 12;
const ROOT_FINGERPRINT_VERSION: &str = "root-fingerprint.v1";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SeriesWorkspaceProjection {
    pub series_id: String,
    pub root_id: String,
    /// Returned only to the local Tauri UI; this projection is never sent to
    /// the server control plane.
    pub local_path: String,
    pub workspace_mode: String,
    pub status: String,
    pub file_count: u64,
    pub total_bytes: u64,
    pub last_scan_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SeriesWorkspaceRoot {
    pub series_id: String,
    pub root_id: String,
    pub root_path: PathBuf,
    pub root_fingerprint: String,
    pub workspace_mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedRoot {
    series_id: String,
    root_id: String,
    root_path: String,
    root_fingerprint: String,
    workspace_mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedWorkspaceStateV2 {
    version: u8,
    active_series_id: Option<String>,
    roots: BTreeMap<String, PersistedRoot>,
}

#[derive(Debug, Default)]
pub struct SeriesWorkspaceState {
    pub root: Option<SeriesWorkspaceRoot>,
    pub projection: Option<SeriesWorkspaceProjection>,
    pub coordinator_running: AtomicBool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScanPreview {
    pub root_id: String,
    pub file_count: u64,
    pub total_bytes: u64,
    pub supported_file_count: u64,
    pub skipped_file_count: u64,
    pub status: String,
    pub entries: Vec<ScanPreviewEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScanPreviewEntry {
    pub relative_name: String,
    pub kind: String,
    pub size_bytes: u64,
    pub fingerprint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImportedFile {
    pub source_name: String,
    pub relative_name: String,
    pub size_bytes: u64,
    pub fingerprint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImportFilesResult {
    pub imported: Vec<ImportedFile>,
    pub scan: ScanPreview,
}

pub fn validate_local_root(path: &Path) -> Result<PathBuf, String> {
    if !path.is_absolute() {
        return Err("local_root_must_be_absolute".into());
    }
    let input_metadata =
        fs::symlink_metadata(path).map_err(|_| "local_root_not_found".to_string())?;
    if input_metadata.file_type().is_symlink() {
        return Err("local_root_symlink_not_allowed".into());
    }
    let canonical = path
        .canonicalize()
        .map_err(|_| "local_root_not_found".to_string())?;
    if !canonical.is_dir() {
        return Err("local_root_must_be_directory".into());
    }
    let metadata = fs::symlink_metadata(&canonical)
        .map_err(|_| "local_root_metadata_unavailable".to_string())?;
    if metadata.file_type().is_symlink() {
        return Err("local_root_symlink_not_allowed".into());
    }
    if canonical
        .components()
        .any(|component| component.as_os_str().to_string_lossy().starts_with('.'))
    {
        return Err("local_root_hidden_not_allowed".into());
    }
    Ok(canonical)
}

pub fn validate_folder_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
        return Err("local_folder_name_invalid".into());
    }
    if trimmed.len() > 120
        || trimmed.contains('/')
        || trimmed.contains('\\')
        || trimmed.contains('\0')
        || trimmed.chars().any(|character| character.is_control())
    {
        return Err("local_folder_name_invalid".into());
    }
    let upper = trimmed.trim_end_matches([' ', '.']).to_ascii_uppercase();
    if upper.is_empty()
        || ["CON", "PRN", "AUX", "NUL"].contains(&upper.as_str())
        || (upper.len() == 4
            && (upper.starts_with("COM") || upper.starts_with("LPT"))
            && upper.as_bytes()[3].is_ascii_digit())
    {
        return Err("local_folder_name_reserved".into());
    }
    if trimmed.ends_with(' ') || trimmed.ends_with('.') {
        return Err("local_folder_name_invalid".into());
    }
    Ok(trimmed.to_string())
}

pub fn create_child_folder(parent: &Path, name: &str) -> Result<PathBuf, String> {
    let canonical_parent = validate_local_root(parent)?;
    let safe_name = validate_folder_name(name)?;
    let child = canonical_parent.join(safe_name);
    fs::create_dir(&child).map_err(|error| {
        if error.kind() == std::io::ErrorKind::AlreadyExists {
            "local_folder_already_exists".to_string()
        } else {
            "local_folder_create_failed".to_string()
        }
    })?;
    validate_local_root(&child)
}

pub fn root_fingerprint(device_key: &str, canonical_path: &Path, workspace_mode: &str) -> String {
    // Device-keyed fingerprint, deliberately opaque to the webview. The key
    // never leaves native state; the server receives only this identifier.
    let mut material = Vec::new();
    material.extend_from_slice(ROOT_FINGERPRINT_VERSION.as_bytes());
    material.push(0);
    material.extend_from_slice(canonical_path.to_string_lossy().as_bytes());
    material.push(0);
    material.extend_from_slice(workspace_mode.as_bytes());
    let mut mac = Hmac::<Sha256>::new_from_slice(device_key.as_bytes())
        .expect("HMAC accepts arbitrary key length");
    mac.update(&material);
    format!(
        "{}-{}",
        ROOT_FINGERPRINT_VERSION,
        hex_lower(&mac.finalize().into_bytes())
    )
}

pub fn root_id(fingerprint: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(fingerprint.as_bytes());
    format!("root-{}", hex_lower(&hasher.finalize())[..24].to_string())
}

pub fn scan_preview(root: &SeriesWorkspaceRoot) -> Result<ScanPreview, String> {
    let mut file_count = 0u64;
    let mut total_bytes = 0u64;
    let mut supported_file_count = 0u64;
    let mut skipped_file_count = 0u64;
    let mut entries = Vec::new();
    scan_directory(
        &root.root_path,
        &root.root_path,
        0,
        &mut file_count,
        &mut total_bytes,
        &mut supported_file_count,
        &mut skipped_file_count,
        &mut entries,
    )?;
    Ok(ScanPreview {
        root_id: root.root_id.clone(),
        file_count,
        total_bytes,
        supported_file_count,
        skipped_file_count,
        status: "preview_ready".into(),
        entries,
    })
}

/// Copy user-selected local footage into the bound Series workspace. The
/// source path never leaves the native process and is never persisted. Files
/// are copied into `incoming/` with a collision-safe name, then the same scan
/// used by the copy-to-folder workflow is returned to the UI.
pub fn import_files_into_root(
    root: &SeriesWorkspaceRoot,
    source_paths: &[String],
) -> Result<ImportFilesResult, String> {
    let canonical_root = validate_local_root(&root.root_path)?;
    if canonical_root != root.root_path {
        return Err("local_root_identity_changed".into());
    }
    if source_paths.is_empty() {
        return Err("media_import_files_required".into());
    }
    if source_paths.len() > 200 {
        return Err("media_import_file_limit".into());
    }
    let incoming = root.root_path.join("incoming");
    if let Ok(metadata) = fs::symlink_metadata(&incoming) {
        if metadata.file_type().is_symlink() {
            return Err("media_import_destination_symlink_not_allowed".into());
        }
        if !metadata.is_dir() {
            return Err("media_import_destination_invalid".into());
        }
    } else {
        fs::create_dir_all(&incoming).map_err(|_| "media_import_destination_failed".to_string())?;
    }

    let mut candidates = Vec::with_capacity(source_paths.len());
    for raw_path in source_paths {
        let input = Path::new(raw_path.trim());
        if !input.is_absolute() {
            return Err("media_import_source_must_be_absolute".into());
        }
        let metadata =
            fs::symlink_metadata(input).map_err(|_| "media_import_source_missing".to_string())?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err("media_import_source_file_required".into());
        }
        let canonical = input
            .canonicalize()
            .map_err(|_| "media_import_source_missing".to_string())?;
        let file_name = canonical
            .file_name()
            .and_then(|value| value.to_str())
            .filter(|value| !value.is_empty() && !value.starts_with('.'))
            .map(str::to_string)
            .ok_or_else(|| "media_import_source_name_invalid".to_string())?;
        if !is_supported_media(&canonical) {
            return Err("media_import_unsupported_media_file".into());
        }
        candidates.push((canonical, file_name));
    }

    let mut imported = Vec::with_capacity(candidates.len());
    for (source, file_name) in candidates {
        let metadata =
            fs::metadata(&source).map_err(|_| "media_import_source_missing".to_string())?;
        let mut reader =
            fs::File::open(&source).map_err(|_| "media_import_source_unreadable".to_string())?;
        let mut hasher = Sha256::new();
        let mut buffer = vec![0u8; 1024 * 1024];
        loop {
            let read = reader
                .read(&mut buffer)
                .map_err(|_| "media_import_source_unreadable".to_string())?;
            if read == 0 {
                break;
            }
            hasher.update(&buffer[..read]);
        }
        let fingerprint = hex_lower(&hasher.finalize());
        let mut destination_name = file_name.clone();
        let mut collision_index = 0u32;
        let destination = loop {
            let candidate = incoming.join(&destination_name);
            if !candidate.exists() {
                break candidate;
            }
            let stem = Path::new(file_name.as_str())
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("media");
            let extension = Path::new(file_name.as_str())
                .extension()
                .and_then(|value| value.to_str())
                .map(|value| format!(".{value}"))
                .unwrap_or_default();
            collision_index = collision_index.saturating_add(1);
            destination_name = if collision_index == 1 {
                format!("{stem}-{}{extension}", &fingerprint[..12])
            } else {
                format!("{stem}-{}-{collision_index}{extension}", &fingerprint[..12])
            };
        };
        let temporary = destination.with_extension(format!(
            "{}part",
            destination
                .extension()
                .and_then(|value| value.to_str())
                .map(|value| format!("{value}."))
                .unwrap_or_default()
        ));
        fs::copy(&source, &temporary).map_err(|_| "media_import_copy_failed".to_string())?;
        fs::rename(&temporary, &destination)
            .map_err(|_| "media_import_commit_failed".to_string())?;
        imported.push(ImportedFile {
            source_name: file_name,
            relative_name: destination
                .strip_prefix(&root.root_path)
                .map_err(|_| "relative_path_escape".to_string())?
                .to_string_lossy()
                .replace('\\', "/"),
            size_bytes: metadata.len(),
            fingerprint,
        });
    }
    Ok(ImportFilesResult {
        imported,
        scan: scan_preview(root)?,
    })
}

fn scan_directory(
    root: &Path,
    path: &Path,
    depth: usize,
    file_count: &mut u64,
    total_bytes: &mut u64,
    supported: &mut u64,
    skipped: &mut u64,
    entries: &mut Vec<ScanPreviewEntry>,
) -> Result<(), String> {
    if depth > MAX_SCAN_DEPTH {
        return Err("local_root_depth_limit".into());
    }
    let dir_entries = fs::read_dir(path).map_err(|_| "local_root_scan_failed".to_string())?;
    for entry in dir_entries {
        if *file_count as usize >= MAX_SCAN_FILES {
            return Err("local_root_file_limit".into());
        }
        let entry = entry.map_err(|_| "local_root_scan_failed".to_string())?;
        let file_type = entry
            .file_type()
            .map_err(|_| "local_root_metadata_unavailable".to_string())?;
        if file_type.is_symlink() {
            *skipped += 1;
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            *skipped += 1;
            continue;
        }
        if file_type.is_dir() {
            scan_directory(
                root,
                &entry.path(),
                depth + 1,
                file_count,
                total_bytes,
                supported,
                skipped,
                entries,
            )?;
            continue;
        }
        if !file_type.is_file() {
            *skipped += 1;
            continue;
        }
        let metadata = entry
            .metadata()
            .map_err(|_| "local_root_metadata_unavailable".to_string())?;
        *file_count += 1;
        *total_bytes = total_bytes.saturating_add(metadata.len());
        if is_supported_media(&entry.path()) {
            *supported += 1;
            if entries.len() < MAX_SCAN_FILES {
                let relative_name = entry
                    .path()
                    .strip_prefix(root)
                    .map_err(|_| "relative_path_escape".to_string())?
                    .to_string_lossy()
                    .replace('\\', "/");
                let modified = metadata
                    .modified()
                    .ok()
                    .and_then(|value| value.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|value| value.as_millis())
                    .unwrap_or_default();
                let fingerprint = format!(
                    "{:064x}",
                    Sha256::digest(
                        format!("{relative_name}:{}:{modified}", metadata.len()).as_bytes()
                    )
                );
                let kind = match entry
                    .path()
                    .extension()
                    .and_then(|value| value.to_str())
                    .map(|value| value.to_ascii_lowercase())
                    .as_deref()
                {
                    Some("jpg" | "jpeg" | "png" | "webp") => "image",
                    _ => "video",
                };
                entries.push(ScanPreviewEntry {
                    relative_name,
                    kind: kind.into(),
                    size_bytes: metadata.len(),
                    fingerprint,
                });
            }
        } else {
            *skipped += 1;
        }
    }
    Ok(())
}

fn is_supported_media(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase())
            .as_deref(),
        Some("mp4" | "mov" | "m4v" | "mkv" | "webm" | "avi" | "jpg" | "jpeg" | "png" | "webp")
    )
}

fn hex_lower(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

pub fn redacted_projection(
    root: &SeriesWorkspaceRoot,
    scan: Option<&ScanPreview>,
    status: &str,
) -> SeriesWorkspaceProjection {
    SeriesWorkspaceProjection {
        series_id: root.series_id.clone(),
        root_id: root.root_id.clone(),
        local_path: root.root_path.to_string_lossy().to_string(),
        workspace_mode: root.workspace_mode.clone(),
        status: status.into(),
        file_count: scan.map(|value| value.file_count).unwrap_or_default(),
        total_bytes: scan.map(|value| value.total_bytes).unwrap_or_default(),
        last_scan_at: None,
    }
}

pub fn try_start_coordinator(state: &SeriesWorkspaceState) -> Result<(), String> {
    state
        .coordinator_running
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .map(|_| ())
        .map_err(|_| "series_workspace_coordinator_already_running".into())
}

pub fn stop_coordinator(state: &SeriesWorkspaceState) {
    state.coordinator_running.store(false, Ordering::SeqCst);
}

fn persisted_root(root: &SeriesWorkspaceRoot) -> PersistedRoot {
    PersistedRoot {
        series_id: root.series_id.clone(),
        root_id: root.root_id.clone(),
        root_path: root.root_path.to_string_lossy().to_string(),
        root_fingerprint: root.root_fingerprint.clone(),
        workspace_mode: root.workspace_mode.clone(),
    }
}

fn root_from_persisted(persisted: PersistedRoot) -> SeriesWorkspaceRoot {
    SeriesWorkspaceRoot {
        series_id: persisted.series_id,
        root_id: persisted.root_id,
        root_path: PathBuf::from(persisted.root_path),
        root_fingerprint: persisted.root_fingerprint,
        workspace_mode: persisted.workspace_mode,
    }
}

fn write_atomic(path: &Path, data: &[u8]) -> Result<(), String> {
    let temp = path.with_extension("tmp");
    fs::write(&temp, data).map_err(|_| "workspace_state_write_failed".to_string())?;
    fs::rename(temp, path).map_err(|_| "workspace_state_commit_failed".to_string())
}

pub fn persist_root_state(app_data_dir: &Path, root: &SeriesWorkspaceRoot) -> Result<(), String> {
    let path = app_data_dir.join("series-workspace-bindings.v2.json");
    let mut state = load_v2_state(app_data_dir)?.unwrap_or(PersistedWorkspaceStateV2 {
        version: 2,
        active_series_id: None,
        roots: BTreeMap::new(),
    });
    state.version = 2;
    state.active_series_id = Some(root.series_id.clone());
    state
        .roots
        .insert(root.series_id.clone(), persisted_root(root));
    let data = serde_json::to_vec_pretty(&state)
        .map_err(|_| "workspace_state_encode_failed".to_string())?;
    fs::create_dir_all(app_data_dir).map_err(|_| "workspace_state_directory_failed".to_string())?;
    write_atomic(&path, &data)
}

fn load_v2_state(app_data_dir: &Path) -> Result<Option<PersistedWorkspaceStateV2>, String> {
    let path = app_data_dir.join("series-workspace-bindings.v2.json");
    let Ok(data) = fs::read(&path) else {
        return Ok(None);
    };
    let state: PersistedWorkspaceStateV2 =
        serde_json::from_slice(&data).map_err(|_| "workspace_state_invalid".to_string())?;
    if state.version != 2 {
        return Err("workspace_state_version_unsupported".into());
    }
    Ok(Some(state))
}

pub fn load_root_state_for_series(
    app_data_dir: &Path,
    series_id: &str,
) -> Result<Option<SeriesWorkspaceRoot>, String> {
    if let Some(state) = load_v2_state(app_data_dir)? {
        return Ok(state.roots.get(series_id).cloned().map(root_from_persisted));
    }
    let path = app_data_dir.join("series-workspace-root.json");
    let Ok(data) = fs::read(&path) else {
        return Ok(None);
    };
    let persisted: PersistedRoot =
        serde_json::from_slice(&data).map_err(|_| "workspace_state_invalid".to_string())?;
    if persisted.series_id != series_id {
        return Ok(None);
    }
    Ok(Some(root_from_persisted(persisted)))
}

pub fn load_root_state(app_data_dir: &Path) -> Result<Option<SeriesWorkspaceRoot>, String> {
    if let Some(state) = load_v2_state(app_data_dir)? {
        return Ok(state
            .active_series_id
            .as_deref()
            .and_then(|series_id| state.roots.get(series_id).cloned())
            .map(root_from_persisted));
    }
    let path = app_data_dir.join("series-workspace-root.json");
    let Ok(data) = fs::read(&path) else {
        return Ok(None);
    };
    let persisted: PersistedRoot =
        serde_json::from_slice(&data).map_err(|_| "workspace_state_invalid".to_string())?;
    Ok(Some(root_from_persisted(persisted)))
}

pub fn clear_root_state(app_data_dir: &Path, series_id: &str) -> Result<(), String> {
    let path = app_data_dir.join("series-workspace-bindings.v2.json");
    if let Some(mut state) = load_v2_state(app_data_dir)? {
        state.roots.remove(series_id);
        if state.active_series_id.as_deref() == Some(series_id) {
            state.active_series_id = state.roots.keys().next().cloned();
        }
        let data = serde_json::to_vec_pretty(&state)
            .map_err(|_| "workspace_state_encode_failed".to_string())?;
        return write_atomic(&path, &data);
    }
    let legacy = app_data_dir.join("series-workspace-root.json");
    let Ok(data) = fs::read(&legacy) else {
        return Ok(());
    };
    let persisted: PersistedRoot =
        serde_json::from_slice(&data).map_err(|_| "workspace_state_invalid".to_string())?;
    if persisted.series_id == series_id {
        fs::remove_file(&legacy).map_err(|_| "workspace_state_clear_failed".to_string())?;
    }
    Ok(())
}

#[allow(dead_code)]
fn _safe_metadata_projection(_value: Value) -> Value {
    serde_json::json!({})
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn rejects_symlink_root_and_hidden_root() {
        let temp = tempdir().unwrap();
        let hidden = temp.path().join(".hidden");
        fs::create_dir(&hidden).unwrap();
        assert_eq!(
            validate_local_root(&hidden).unwrap_err(),
            "local_root_hidden_not_allowed"
        );
        #[cfg(unix)]
        {
            let target = temp.path().join("target");
            fs::create_dir(&target).unwrap();
            let link = temp.path().join("link");
            std::os::unix::fs::symlink(&target, &link).unwrap();
            assert_eq!(
                validate_local_root(&link).unwrap_err(),
                "local_root_symlink_not_allowed"
            );
        }
    }

    #[test]
    fn fingerprint_is_deterministic_and_keyed() {
        let temp = tempdir().unwrap();
        let canonical = temp.path().canonicalize().unwrap();
        let a = root_fingerprint("device-a", &canonical, "local_only");
        assert_eq!(a, root_fingerprint("device-a", &canonical, "local_only"));
        assert_ne!(a, root_fingerprint("device-b", &canonical, "local_only"));
    }

    #[test]
    fn scan_skips_symlinks_and_reports_supported_media() {
        let temp = tempdir().unwrap();
        fs::write(temp.path().join("shot.mp4"), b"video").unwrap();
        fs::write(temp.path().join("notes.txt"), b"notes").unwrap();
        let canonical = temp.path().canonicalize().unwrap();
        let fingerprint = root_fingerprint("device-a", &canonical, "local_only");
        let root = SeriesWorkspaceRoot {
            series_id: "1".into(),
            root_id: root_id(&fingerprint),
            root_path: canonical,
            root_fingerprint: fingerprint,
            workspace_mode: "local_only".into(),
        };
        let scan = scan_preview(&root).unwrap();
        assert_eq!(scan.file_count, 2);
        assert_eq!(scan.supported_file_count, 1);
    }

    #[test]
    fn coordinator_is_singleton() {
        let state = SeriesWorkspaceState::default();
        assert!(try_start_coordinator(&state).is_ok());
        assert!(try_start_coordinator(&state).is_err());
        stop_coordinator(&state);
        assert!(try_start_coordinator(&state).is_ok());
    }

    #[test]
    fn persists_independent_roots_per_series_and_revokes_only_one() {
        let temp = tempdir().unwrap();
        let first_path = temp.path().join("series-one");
        let second_path = temp.path().join("series-two");
        fs::create_dir(&first_path).unwrap();
        fs::create_dir(&second_path).unwrap();
        let make_root = |series_id: &str, path: &Path| {
            let canonical = path.canonicalize().unwrap();
            let fingerprint = root_fingerprint("device-a", &canonical, "local_only");
            SeriesWorkspaceRoot {
                series_id: series_id.into(),
                root_id: root_id(&fingerprint),
                root_path: canonical,
                root_fingerprint: fingerprint,
                workspace_mode: "local_only".into(),
            }
        };
        let first = make_root("1", &first_path);
        let second = make_root("2", &second_path);
        persist_root_state(temp.path(), &first).unwrap();
        persist_root_state(temp.path(), &second).unwrap();
        assert_eq!(
            load_root_state_for_series(temp.path(), "1").unwrap(),
            Some(first)
        );
        assert_eq!(
            load_root_state_for_series(temp.path(), "2").unwrap(),
            Some(second.clone())
        );
        clear_root_state(temp.path(), "1").unwrap();
        assert!(load_root_state_for_series(temp.path(), "1")
            .unwrap()
            .is_none());
        assert_eq!(load_root_state(temp.path()).unwrap(), Some(second));
    }

    #[test]
    fn rejects_unsafe_child_folder_names() {
        assert_eq!(
            validate_folder_name("..").unwrap_err(),
            "local_folder_name_invalid"
        );
        assert_eq!(
            validate_folder_name("CON").unwrap_err(),
            "local_folder_name_reserved"
        );
        assert_eq!(validate_folder_name("safe-folder").unwrap(), "safe-folder");
    }
}
