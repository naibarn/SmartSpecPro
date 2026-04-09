use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use crate::local_file_index::{
    index_root_files, normalize_desktop_path, purge_derived_store_for_root, ManagedLocalRoot,
};

const MAX_TEXT_PREVIEW_BYTES: u64 = 1_048_576;
const MAX_TEXT_SNIPPET_BYTES: u64 = 524_288;
const MAX_RICH_DOCUMENT_INPUT_BYTES: u64 = 8_388_608;
const RICH_DOCUMENT_PARSE_TIMEOUT_MS: u64 = 8_000;
const SAFE_TEXT_EXTENSIONS: &[&str] = &[
    "txt", "md", "markdown", "csv", "json", "yml", "yaml", "log", "rtf", "ts", "tsx", "js",
    "jsx", "py", "rs", "sql", "html", "css", "xml",
];
const RICH_DOCUMENT_EXTENSIONS: &[&str] = &[
    "pdf", "doc", "docx", "odt", "ppt", "pptx", "odp", "xls", "xlsx", "ods", "png", "jpg",
    "jpeg", "webp", "gif", "bmp", "tif", "tiff", "svg",
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalFileParserCapabilityReport {
    pub enabled: bool,
    pub isolation_mode: String,
    pub supported_formats: Vec<String>,
    pub max_input_bytes: u64,
    pub timeout_ms: u64,
    pub ocr_enabled: bool,
    pub pdf_extractor: String,
    pub ocr_provider: String,
    pub render_backend: String,
    pub office_renderer: String,
    pub rendered_preview_formats: Vec<String>,
    pub complex_document_support: String,
    pub full_rendering_supported: bool,
    pub active_content_execution_allowed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SearchFilesRequest {
    pub roots: Vec<ManagedLocalRoot>,
    pub query: String,
    pub max_results: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FileMetadataRecord {
    pub root_id: String,
    pub absolute_path: String,
    pub file_name: String,
    pub size_bytes: u64,
    pub is_dir: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FilePreview {
    pub root_id: String,
    pub absolute_path: String,
    pub preview_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FileSnippet {
    pub absolute_path: String,
    pub line_number: usize,
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StageIntoWorkspaceRequest {
    pub roots: Vec<ManagedLocalRoot>,
    pub source_path: String,
    pub workspace_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StagedFileRecord {
    pub source_path: String,
    pub staged_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RemoveRootRequest {
    pub root_id: String,
    pub derived_store_base_dir: String,
}

#[derive(Debug, Clone, Deserialize)]
struct DocumentParserWorkerSnippet {
    line_number: usize,
    snippet: String,
}

#[derive(Debug, Clone, Deserialize)]
struct DocumentParserWorkerOutput {
    preview_text: Option<String>,
    snippets: Option<Vec<DocumentParserWorkerSnippet>>,
    error: Option<String>,
}

fn extension_for_path(path: &Path) -> String {
    path.extension()
        .map(|value| value.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default()
}

fn is_safe_text_extension(extension: &str) -> bool {
    SAFE_TEXT_EXTENSIONS
        .iter()
        .any(|candidate| *candidate == extension)
}

fn is_rich_document_extension(extension: &str) -> bool {
    RICH_DOCUMENT_EXTENSIONS
        .iter()
        .any(|candidate| *candidate == extension)
}

fn resolve_binary_path(env_var: &str, binary_name: &str) -> Option<PathBuf> {
    if let Ok(value) = env::var(env_var) {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            let candidate = PathBuf::from(trimmed);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    let path_value = env::var_os("PATH")?;
    for entry in env::split_paths(&path_value) {
        let candidate = entry.join(binary_name);
        if candidate.is_file() {
            return Some(candidate);
        }
        #[cfg(target_os = "windows")]
        {
            let exe_candidate = entry.join(format!("{binary_name}.exe"));
            if exe_candidate.is_file() {
                return Some(exe_candidate);
            }
        }
    }
    None
}

fn resolve_office_renderer_path() -> Option<PathBuf> {
    resolve_binary_path("SMARTSPEC_SOFFICE_PATH", "soffice")
        .or_else(|| resolve_binary_path("SMARTSPEC_LIBREOFFICE_PATH", "libreoffice"))
}

fn resolve_pdf_render_backend() -> Option<&'static str> {
    if resolve_binary_path("SMARTSPEC_PDFTOPPM_PATH", "pdftoppm").is_some() {
        return Some("pdftoppm");
    }
    if resolve_binary_path("SMARTSPEC_MUTOOL_PATH", "mutool").is_some() {
        return Some("mutool");
    }
    None
}

fn resolve_rendered_preview_formats(
    pdf_render_backend: Option<&str>,
    office_renderer_available: bool,
) -> Vec<String> {
    let mut formats = Vec::new();
    if pdf_render_backend.is_some() {
        formats.extend(
            ["pdf", "png", "jpg", "jpeg", "webp", "gif", "bmp", "tif", "tiff", "svg"]
                .into_iter()
                .map(String::from),
        );
    }
    if office_renderer_available {
        formats.extend(
            ["doc", "docx", "odt", "ppt", "pptx", "odp", "xls", "xlsx", "ods"]
                .into_iter()
                .map(String::from),
        );
    }
    formats.sort();
    formats.dedup();
    formats
}

pub fn describe_local_file_parser_capabilities() -> LocalFileParserCapabilityReport {
    let pdf_extractor = if resolve_binary_path("SMARTSPEC_PDFTOTEXT_PATH", "pdftotext").is_some() {
        "pdftotext".into()
    } else {
        "internal_heuristic".into()
    };
    let ocr_enabled = resolve_binary_path("SMARTSPEC_TESSERACT_PATH", "tesseract").is_some();
    let pdf_render_backend = resolve_pdf_render_backend();
    let office_renderer = resolve_office_renderer_path()
        .and_then(|path| {
            path.file_name()
                .map(|value| value.to_string_lossy().to_ascii_lowercase())
        })
        .unwrap_or_else(|| "none".into());
    let rendered_preview_formats = resolve_rendered_preview_formats(
        pdf_render_backend,
        office_renderer != "none",
    );
    let render_backend = match (pdf_render_backend, office_renderer.as_str()) {
        (Some(pdf_backend), "none") => pdf_backend.to_string(),
        (None, office_backend) if office_backend != "none" => office_backend.into(),
        (Some(pdf_backend), office_backend) => format!("{pdf_backend}+{office_backend}"),
        _ => "none".into(),
    };
    let full_rendering_supported = pdf_render_backend.is_some() || office_renderer != "none";
    let complex_document_support = if full_rendering_supported && ocr_enabled {
        "ocr_rendering".into()
    } else if full_rendering_supported {
        "rendering_without_ocr".into()
    } else {
        "text_extraction_only".into()
    };
    LocalFileParserCapabilityReport {
        enabled: true,
        isolation_mode: "python_subprocess_bounded".into(),
        supported_formats: RICH_DOCUMENT_EXTENSIONS
            .iter()
            .map(|value| value.to_string())
            .collect(),
        max_input_bytes: MAX_RICH_DOCUMENT_INPUT_BYTES,
        timeout_ms: RICH_DOCUMENT_PARSE_TIMEOUT_MS,
        ocr_enabled,
        pdf_extractor,
        ocr_provider: if ocr_enabled {
            "tesseract".into()
        } else {
            "none".into()
        },
        render_backend,
        office_renderer,
        rendered_preview_formats,
        complex_document_support,
        full_rendering_supported,
        active_content_execution_allowed: false,
    }
}

fn resolve_bundled_runtime_manifest_path() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(current_exe) = env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            #[cfg(target_os = "windows")]
            candidates.push(
                exe_dir
                    .join("resources")
                    .join("litert-lm-runtime")
                    .join("bundle-manifest.json"),
            );

            #[cfg(target_os = "macos")]
            {
                candidates.push(
                    exe_dir
                        .join("..")
                        .join("Resources")
                        .join("litert-lm-runtime")
                        .join("bundle-manifest.json"),
                );
                candidates.push(
                    exe_dir
                        .join("resources")
                        .join("litert-lm-runtime")
                        .join("bundle-manifest.json"),
                );
            }

            #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
            candidates.push(
                exe_dir
                    .join("resources")
                    .join("litert-lm-runtime")
                    .join("bundle-manifest.json"),
            );
        }
    }

    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("litert-lm-runtime")
            .join("bundle-manifest.json"),
    );

    candidates.into_iter().find(|candidate| candidate.is_file())
}

fn resolve_bundled_runtime_root() -> Option<PathBuf> {
    resolve_bundled_runtime_manifest_path()
        .and_then(|manifest_path| manifest_path.parent().map(Path::to_path_buf))
}

fn resolve_bundled_litert_python_executable() -> Option<PathBuf> {
    let runtime_root = resolve_bundled_runtime_root()?;

    #[cfg(target_os = "windows")]
    let candidates = [
        runtime_root.join("venv").join("Scripts").join("python.exe"),
        runtime_root.join("venv").join("Scripts").join("python"),
    ];

    #[cfg(not(target_os = "windows"))]
    let candidates = [
        runtime_root.join("venv").join("bin").join("python"),
        runtime_root.join("venv").join("bin").join("python3"),
    ];

    candidates.into_iter().find(|path| path.is_file())
}

fn resolve_bundled_document_parser_script() -> Option<PathBuf> {
    let runtime_root = resolve_bundled_runtime_root()?;
    let candidate = runtime_root.join("parse_document.py");
    if candidate.is_file() {
        return Some(candidate);
    }
    None
}

fn run_isolated_document_parser(
    path: &Path,
    mode: &str,
    query: Option<&str>,
) -> Result<DocumentParserWorkerOutput, String> {
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    if metadata.len() > MAX_RICH_DOCUMENT_INPUT_BYTES {
        return Err("managed rich-document parsing exceeds size limit".into());
    }

    let python_path = resolve_bundled_litert_python_executable()
        .ok_or_else(|| "bundled document parser runtime is unavailable".to_string())?;
    let script_path = resolve_bundled_document_parser_script()
        .ok_or_else(|| "bundled document parser helper is unavailable".to_string())?;

    let mut command = Command::new(python_path);
    command
        .arg(script_path)
        .arg("--file-path")
        .arg(path)
        .arg("--mode")
        .arg(mode)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(query) = query {
        command.arg("--query").arg(query);
    }

    let mut child = command.spawn().map_err(|error| error.to_string())?;
    let start = Instant::now();
    loop {
        match child.try_wait().map_err(|error| error.to_string())? {
            Some(status) => {
                let mut stdout = Vec::new();
                let mut stderr = Vec::new();
                if let Some(mut handle) = child.stdout.take() {
                    handle
                        .read_to_end(&mut stdout)
                        .map_err(|error| error.to_string())?;
                }
                if let Some(mut handle) = child.stderr.take() {
                    handle
                        .read_to_end(&mut stderr)
                        .map_err(|error| error.to_string())?;
                }
                let output: DocumentParserWorkerOutput = serde_json::from_slice(&stdout)
                    .map_err(|error| format!("document parser returned invalid payload: {error}"))?;
                if !status.success() {
                    return Err(
                        output
                            .error
                            .or_else(|| {
                                let raw = String::from_utf8(stderr).ok()?;
                                let trimmed = raw.trim().to_string();
                                if trimmed.is_empty() {
                                    None
                                } else {
                                    Some(trimmed)
                                }
                            })
                            .unwrap_or_else(|| "isolated document parser failed".to_string()),
                    );
                }
                if let Some(error) = output.error {
                    return Err(error);
                }
                return Ok(output);
            }
            None => {
                if start.elapsed() > Duration::from_millis(RICH_DOCUMENT_PARSE_TIMEOUT_MS) {
                    child.kill().map_err(|error| error.to_string())?;
                    let _ = child.wait();
                    return Err("isolated document parser timed out".into());
                }
                thread::sleep(Duration::from_millis(25));
            }
        }
    }
}

fn find_matching_root<'a>(
    roots: &'a [ManagedLocalRoot],
    absolute_path: &Path,
) -> Result<&'a ManagedLocalRoot, String> {
    let normalized = absolute_path.to_string_lossy().to_string();
    roots.iter()
        .filter(|root| !root.denied_by_default)
        .find(|root| normalized == root.absolute_path || normalized.starts_with(&format!("{}/", root.absolute_path.replace('\\', "/"))))
        .ok_or_else(|| "path is not inside an approved managed root".to_string())
}

fn read_text_preview(path: &Path, max_chars: usize) -> Result<String, String> {
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    let extension = extension_for_path(path);
    if is_safe_text_extension(&extension) {
        if metadata.len() > MAX_TEXT_PREVIEW_BYTES {
            return Err("managed preview exceeds size limit".into());
        }

        let raw = fs::read(path).map_err(|error| error.to_string())?;
        return match String::from_utf8(raw) {
            Ok(content) => Ok(content.chars().take(max_chars).collect()),
            Err(_) => Err("binary preview unavailable".into()),
        };
    }

    if is_rich_document_extension(&extension) {
        let output = run_isolated_document_parser(path, "preview", None)?;
        let preview = output
            .preview_text
            .unwrap_or_default()
            .chars()
            .take(max_chars)
            .collect::<String>();
        if preview.trim().is_empty() {
            return Err("managed preview unavailable for this file type".into());
        }
        return Ok(preview);
    }

    Err("managed preview unavailable for this file type".into())
}

pub fn search_files_internal(
    request: SearchFilesRequest,
) -> Result<Vec<FileMetadataRecord>, String> {
    if request.query.trim().is_empty() {
        return Err("query cannot be empty".into());
    }

    let query_lower = request.query.to_lowercase();
    let max_results = request.max_results.unwrap_or(20).min(100);
    let mut results = Vec::new();

    for root in request.roots.iter().filter(|root| !root.denied_by_default) {
        for record in index_root_files(root, 5)? {
            let preview = read_text_preview(Path::new(&record.absolute_path), 2048).unwrap_or_default();
            if record.file_name.to_lowercase().contains(&query_lower)
                || record.relative_path.to_lowercase().contains(&query_lower)
                || preview.to_lowercase().contains(&query_lower)
            {
                results.push(FileMetadataRecord {
                    root_id: record.root_id,
                    absolute_path: record.absolute_path,
                    file_name: record.file_name,
                    size_bytes: record.size_bytes,
                    is_dir: false,
                });
            }
            if results.len() >= max_results {
                return Ok(results);
            }
        }
    }

    Ok(results)
}

pub fn get_metadata_internal(
    roots: Vec<ManagedLocalRoot>,
    absolute_path: &str,
) -> Result<FileMetadataRecord, String> {
    let path = normalize_desktop_path(absolute_path)?;
    let root = find_matching_root(&roots, &path)?;
    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
    let file_name = path
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string());

    Ok(FileMetadataRecord {
        root_id: root.root_id.clone(),
        absolute_path: path.to_string_lossy().to_string(),
        file_name,
        size_bytes: metadata.len(),
        is_dir: metadata.is_dir(),
    })
}

pub fn get_preview_internal(
    roots: Vec<ManagedLocalRoot>,
    absolute_path: &str,
) -> Result<FilePreview, String> {
    let path = normalize_desktop_path(absolute_path)?;
    let root = find_matching_root(&roots, &path)?;
    let preview_text = read_text_preview(&path, 500)?;
    Ok(FilePreview {
        root_id: root.root_id.clone(),
        absolute_path: path.to_string_lossy().to_string(),
        preview_text,
    })
}

pub fn get_snippets_internal(
    roots: Vec<ManagedLocalRoot>,
    absolute_path: &str,
    query: &str,
) -> Result<Vec<FileSnippet>, String> {
    let path = normalize_desktop_path(absolute_path)?;
    find_matching_root(&roots, &path)?;
    if query.trim().is_empty() {
        return Err("query cannot be empty".into());
    }

    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
    let extension = extension_for_path(&path);
    if is_safe_text_extension(&extension) {
        if metadata.len() > MAX_TEXT_SNIPPET_BYTES {
            return Err("managed snippet extraction exceeds size limit".into());
        }

        let content = fs::read_to_string(&path).map_err(|error| error.to_string())?;
        let query_lower = query.to_lowercase();
        let snippets = content
            .lines()
            .enumerate()
            .filter(|(_, line)| line.to_lowercase().contains(&query_lower))
            .take(10)
            .map(|(index, line)| FileSnippet {
                absolute_path: path.to_string_lossy().to_string(),
                line_number: index + 1,
                snippet: line.to_string(),
            })
            .collect();
        return Ok(snippets);
    }

    if is_rich_document_extension(&extension) {
        let output = run_isolated_document_parser(&path, "snippets", Some(query))?;
        let snippets = output
            .snippets
            .unwrap_or_default()
            .into_iter()
            .map(|snippet| FileSnippet {
                absolute_path: path.to_string_lossy().to_string(),
                line_number: snippet.line_number,
                snippet: snippet.snippet,
            })
            .collect();
        return Ok(snippets);
    }

    Err("managed snippets unavailable for this file type".into())
}

pub fn stage_into_workspace_internal(
    request: StageIntoWorkspaceRequest,
) -> Result<StagedFileRecord, String> {
    let source_path = normalize_desktop_path(&request.source_path)?;
    find_matching_root(&request.roots, &source_path)?;
    let workspace_dir = normalize_desktop_path(&request.workspace_dir)?;
    fs::create_dir_all(&workspace_dir).map_err(|error| error.to_string())?;
    let file_name = source_path
        .file_name()
        .ok_or_else(|| "source path must point to a file".to_string())?;
    let staged_path = workspace_dir.join(file_name);
    fs::copy(&source_path, &staged_path).map_err(|error| error.to_string())?;

    Ok(StagedFileRecord {
        source_path: source_path.to_string_lossy().to_string(),
        staged_path: staged_path.to_string_lossy().to_string(),
    })
}

pub fn list_related_files_internal(
    roots: Vec<ManagedLocalRoot>,
    absolute_path: &str,
) -> Result<Vec<FileMetadataRecord>, String> {
    let path = normalize_desktop_path(absolute_path)?;
    let root = find_matching_root(&roots, &path)?;
    let parent_dir = path
        .parent()
        .ok_or_else(|| "path has no parent directory".to_string())?;
    let stem = path
        .file_stem()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_default();

    let mut related = Vec::new();
    for entry in fs::read_dir(parent_dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let metadata = entry.metadata().map_err(|error| error.to_string())?;
        if !metadata.is_file() {
            continue;
        }
        let file_path = entry.path();
        let file_stem = file_path
            .file_stem()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_default();
        if file_stem == stem && file_path != path {
            related.push(FileMetadataRecord {
                root_id: root.root_id.clone(),
                absolute_path: file_path.to_string_lossy().to_string(),
                file_name: entry.file_name().to_string_lossy().to_string(),
                size_bytes: metadata.len(),
                is_dir: false,
            });
        }
    }

    related.sort_by(|left, right| left.file_name.cmp(&right.file_name));
    Ok(related)
}

pub fn remove_root_and_purge_internal(request: RemoveRootRequest) -> Result<(), String> {
    let base_dir = normalize_desktop_path(&request.derived_store_base_dir)?;
    purge_derived_store_for_root(&base_dir, &request.root_id)
}

#[tauri::command]
pub async fn desktop_host_search_files(request: SearchFilesRequest) -> Result<Vec<FileMetadataRecord>, String> {
    search_files_internal(request)
}

#[tauri::command]
pub async fn desktop_host_get_metadata(
    roots: Vec<ManagedLocalRoot>,
    absolute_path: String,
) -> Result<FileMetadataRecord, String> {
    get_metadata_internal(roots, &absolute_path)
}

#[tauri::command]
pub async fn desktop_host_get_preview(
    roots: Vec<ManagedLocalRoot>,
    absolute_path: String,
) -> Result<FilePreview, String> {
    get_preview_internal(roots, &absolute_path)
}

#[tauri::command]
pub async fn desktop_host_get_snippets(
    roots: Vec<ManagedLocalRoot>,
    absolute_path: String,
    query: String,
) -> Result<Vec<FileSnippet>, String> {
    get_snippets_internal(roots, &absolute_path, &query)
}

#[tauri::command]
pub async fn desktop_host_stage_into_workspace(
    request: StageIntoWorkspaceRequest,
) -> Result<StagedFileRecord, String> {
    stage_into_workspace_internal(request)
}

#[tauri::command]
pub async fn desktop_host_list_related_files(
    roots: Vec<ManagedLocalRoot>,
    absolute_path: String,
) -> Result<Vec<FileMetadataRecord>, String> {
    list_related_files_internal(roots, &absolute_path)
}

#[tauri::command]
pub async fn desktop_host_remove_root(
    request: RemoveRootRequest,
) -> Result<(), String> {
    remove_root_and_purge_internal(request)
}

#[tauri::command]
pub async fn desktop_host_describe_local_file_parser_capabilities(
) -> Result<LocalFileParserCapabilityReport, String> {
    Ok(describe_local_file_parser_capabilities())
}
