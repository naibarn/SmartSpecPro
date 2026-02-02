use serde::{Deserialize, Serialize};
use std::path::Path;
use tokio::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitBranch {
    pub name: String,
    pub is_current: bool,
}

fn validate_path(path: &str) -> Result<(), String> {
    if path.is_empty() {
        return Err("Path cannot be empty".into());
    }
    let p = Path::new(path);
    if !p.is_absolute() {
        return Err("Path must be absolute".into());
    }
    if path.contains("..") {
        return Err("Path traversal not allowed".into());
    }
    Ok(())
}

fn validate_branch_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Branch name cannot be empty".into());
    }
    if name.len() > 256 {
        return Err("Branch name too long".into());
    }
    if name.contains(|c: char| c == ' ' || c == '~' || c == '^' || c == ':' || c == '\\' || c == ';' || c == '&' || c == '|' || c == '$' || c == '`') {
        return Err("Branch name contains invalid characters".into());
    }
    Ok(())
}

async fn run_git(path: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .current_dir(path)
        .args(args)
        .output()
        .await
        .map_err(|e| format!("Failed to execute git: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(if stderr.is_empty() { "Git command failed".into() } else { stderr })
    }
}

#[tauri::command]
pub async fn git_init(path: String) -> Result<String, String> {
    validate_path(&path)?;
    run_git(&path, &["init"]).await
}

#[tauri::command]
pub async fn git_status(path: String) -> Result<String, String> {
    validate_path(&path)?;
    run_git(&path, &["status", "--short"]).await
}

#[tauri::command]
pub async fn git_create_branch(path: String, name: String) -> Result<String, String> {
    validate_path(&path)?;
    validate_branch_name(&name)?;
    run_git(&path, &["branch", &name]).await
}

#[tauri::command]
pub async fn git_checkout(path: String, branch: String) -> Result<String, String> {
    validate_path(&path)?;
    validate_branch_name(&branch)?;
    run_git(&path, &["checkout", &branch]).await
}

#[tauri::command]
pub async fn git_commit_all(path: String, message: String) -> Result<String, String> {
    validate_path(&path)?;
    if message.is_empty() {
        return Err("Commit message cannot be empty".into());
    }
    run_git(&path, &["add", "-A"]).await?;
    run_git(&path, &["commit", "-m", &message]).await
}

#[tauri::command]
pub async fn git_push(path: String, remote: String, branch: String) -> Result<String, String> {
    validate_path(&path)?;
    validate_branch_name(&branch)?;
    if remote.is_empty() {
        return Err("Remote cannot be empty".into());
    }
    run_git(&path, &["push", &remote, &branch]).await
}

#[tauri::command]
pub async fn git_list_branches(path: String) -> Result<Vec<GitBranch>, String> {
    validate_path(&path)?;
    let stdout = run_git(&path, &["branch", "--list"]).await?;
    let branches = stdout.lines()
        .filter(|l| !l.is_empty())
        .map(|line| {
            let is_current = line.starts_with('*');
            let name = line.trim_start_matches('*').trim().to_string();
            GitBranch { name, is_current }
        })
        .collect();
    Ok(branches)
}

#[tauri::command]
pub async fn git_has_changes(path: String) -> Result<bool, String> {
    validate_path(&path)?;
    let stdout = run_git(&path, &["status", "--porcelain"]).await?;
    Ok(!stdout.trim().is_empty())
}
