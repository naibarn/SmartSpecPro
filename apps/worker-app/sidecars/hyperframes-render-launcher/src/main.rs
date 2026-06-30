use std::env;
use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode};

const LAUNCHER_MARKER: &str = "smart-ai-hub-hyperframes-node-launcher";

fn runtime_root() -> Result<PathBuf, String> {
    if let Ok(root) = env::var("SMARTAIHUB_RUNTIME_ROOT") {
        if !root.trim().is_empty() {
            return Ok(PathBuf::from(root));
        }
    }
    let exe =
        env::current_exe().map_err(|error| format!("failed to resolve launcher path: {error}"))?;
    let sidecar_dir = exe
        .parent()
        .ok_or_else(|| "launcher path has no parent directory".to_string())?;
    if sidecar_dir
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name == "sidecars")
    {
        return sidecar_dir
            .parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| "sidecars directory has no runtime root parent".to_string());
    }
    Ok(sidecar_dir.to_path_buf())
}

#[cfg(target_os = "windows")]
fn node_path(root: &Path) -> PathBuf {
    root.join("runtime-pack").join("node").join("node.exe")
}

#[cfg(not(target_os = "windows"))]
fn node_path(root: &Path) -> PathBuf {
    root.join("runtime-pack")
        .join("node")
        .join("bin")
        .join("node")
}

fn run() -> Result<i32, String> {
    let root = runtime_root()?;
    let node = node_path(&root);
    let script = root
        .join("runtime-pack")
        .join("hyperframes-sidecar")
        .join("render.mjs");
    if !node.is_file() {
        return Err(format!(
            "bundled Node runtime is missing: {}",
            node.display()
        ));
    }
    if !script.is_file() {
        return Err(format!(
            "HyperFrames sidecar script is missing: {}",
            script.display()
        ));
    }

    let status = Command::new(node)
        .arg(script)
        .args(env::args_os().skip(1))
        .env("SMARTAIHUB_RUNTIME_ROOT", &root)
        .env("SMARTAIHUB_HYPERFRAMES_LAUNCHER", LAUNCHER_MARKER)
        .status()
        .map_err(|error| format!("failed to run bundled HyperFrames sidecar: {error}"))?;
    Ok(status.code().unwrap_or(1))
}

fn main() -> ExitCode {
    match run() {
        Ok(code) => ExitCode::from(code as u8),
        Err(error) => {
            eprintln!("{error}");
            ExitCode::from(1)
        }
    }
}
