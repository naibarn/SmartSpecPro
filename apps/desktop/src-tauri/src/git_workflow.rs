// Git Workflow Manager - Advanced Git operations for parallel development
//
// Provides:
// - Branch management with protection rules
// - Commit history and diff viewing
// - Merge conflict detection and resolution
// - Remote synchronization (push/pull)
// - Stash management for context switching

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;

// ============================================
// Types and Structures
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitStatus {
    pub branch: String,
    pub ahead: u32,
    pub behind: u32,
    pub staged: Vec<FileChange>,
    pub unstaged: Vec<FileChange>,
    pub untracked: Vec<String>,
    pub has_conflicts: bool,
    pub is_clean: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileChange {
    pub path: String,
    pub status: ChangeStatus,
    pub old_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChangeStatus {
    Added,
    Modified,
    Deleted,
    Renamed,
    Copied,
    Unmerged,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchInfo {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
    pub upstream: Option<String>,
    pub last_commit: String,
    pub last_commit_date: String,
    pub ahead: u32,
    pub behind: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitInfo {
    pub hash: String,
    pub short_hash: String,
    pub author: String,
    pub email: String,
    pub date: String,
    pub message: String,
    pub files_changed: u32,
    pub insertions: u32,
    pub deletions: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeResult {
    pub success: bool,
    pub conflicts: Vec<ConflictFile>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictFile {
    pub path: String,
    pub ours: String,
    pub theirs: String,
    pub base: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StashEntry {
    pub index: u32,
    pub message: String,
    pub branch: String,
    pub date: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffResult {
    pub files: Vec<FileDiff>,
    pub total_additions: u32,
    pub total_deletions: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileDiff {
    pub path: String,
    pub status: ChangeStatus,
    pub additions: u32,
    pub deletions: u32,
    pub hunks: Vec<DiffHunk>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffHunk {
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffLine {
    pub line_type: LineType,
    pub content: String,
    pub old_line_no: Option<u32>,
    pub new_line_no: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LineType {
    Context,
    Addition,
    Deletion,
    Header,
}

// ============================================
// Git Workflow Manager Implementation
// ============================================

pub struct GitWorkflow {
    repo_path: PathBuf,
}

impl GitWorkflow {
    /// Create a new GitWorkflow instance for a repository
    pub fn new(repo_path: PathBuf) -> Self {
        Self { repo_path }
    }
    
    // ========================================
    // Status Operations
    // ========================================
    
    /// Get current repository status
    pub fn get_status(&self) -> Result<GitStatus, String> {
        // Get current branch
        let branch = self.get_current_branch()?;
        
        // Get ahead/behind counts
        let (ahead, behind) = self.get_ahead_behind(&branch)?;
        
        // Get file status
        let output = self.run_git(&["status", "--porcelain=v2", "-b"])?;
        
        let mut staged = Vec::new();
        let mut unstaged = Vec::new();
        let mut untracked = Vec::new();
        let mut has_conflicts = false;
        
        for line in output.lines() {
            if line.starts_with("1 ") || line.starts_with("2 ") {
                // Changed entry
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 9 {
                    let xy = parts[1];
                    let path = parts[8];
                    
                    let x = xy.chars().next().unwrap_or('.');
                    let y = xy.chars().nth(1).unwrap_or('.');
                    
                    // Staged changes (index)
                    if x != '.' && x != '?' {
                        staged.push(FileChange {
                            path: path.to_string(),
                            status: char_to_status(x),
                            old_path: None,
                        });
                    }
                    
                    // Unstaged changes (worktree)
                    if y != '.' && y != '?' {
                        unstaged.push(FileChange {
                            path: path.to_string(),
                            status: char_to_status(y),
                            old_path: None,
                        });
                    }
                }
            } else if line.starts_with("? ") {
                // Untracked file
                let path = line.strip_prefix("? ").unwrap_or("");
                untracked.push(path.to_string());
            } else if line.starts_with("u ") {
                // Unmerged entry (conflict)
                has_conflicts = true;
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 11 {
                    unstaged.push(FileChange {
                        path: parts[10].to_string(),
                        status: ChangeStatus::Unmerged,
                        old_path: None,
                    });
                }
            }
        }
        
        let is_clean = staged.is_empty() && unstaged.is_empty() && untracked.is_empty();
        
        Ok(GitStatus {
            branch,
            ahead,
            behind,
            staged,
            unstaged,
            untracked,
            has_conflicts,
            is_clean,
        })
    }
    
    /// Get current branch name
    pub fn get_current_branch(&self) -> Result<String, String> {
        let output = self.run_git(&["rev-parse", "--abbrev-ref", "HEAD"])?;
        Ok(output.trim().to_string())
    }
    
    /// Get ahead/behind counts relative to upstream
    fn get_ahead_behind(&self, branch: &str) -> Result<(u32, u32), String> {
        let output = self.run_git(&[
            "rev-list",
            "--left-right",
            "--count",
            &format!("{}...@{{u}}", branch),
        ]);
        
        match output {
            Ok(out) => {
                let parts: Vec<&str> = out.trim().split_whitespace().collect();
                if parts.len() == 2 {
                    let ahead = parts[0].parse().unwrap_or(0);
                    let behind = parts[1].parse().unwrap_or(0);
                    Ok((ahead, behind))
                } else {
                    Ok((0, 0))
                }
            }
            Err(_) => Ok((0, 0)), // No upstream configured
        }
    }
    
    // ========================================
    // Branch Operations
    // ========================================
    
    /// List all branches
    pub fn list_branches(&self, include_remote: bool) -> Result<Vec<BranchInfo>, String> {
        let args = if include_remote {
            vec!["branch", "-a", "-v", "--format=%(refname:short)|%(objectname:short)|%(authordate:iso)|%(upstream:short)|%(HEAD)"]
        } else {
            vec!["branch", "-v", "--format=%(refname:short)|%(objectname:short)|%(authordate:iso)|%(upstream:short)|%(HEAD)"]
        };
        
        let output = self.run_git(&args)?;
        let mut branches = Vec::new();
        
        for line in output.lines() {
            let parts: Vec<&str> = line.split('|').collect();
            if parts.len() >= 5 {
                let name = parts[0].to_string();
                let is_remote = name.starts_with("remotes/") || name.starts_with("origin/");
                let is_current = parts[4] == "*";
                
                // Get ahead/behind for local branches
                let (ahead, behind) = if !is_remote {
                    self.get_ahead_behind(&name).unwrap_or((0, 0))
                } else {
                    (0, 0)
                };
                
                branches.push(BranchInfo {
                    name,
                    is_current,
                    is_remote,
                    upstream: if parts[3].is_empty() { None } else { Some(parts[3].to_string()) },
                    last_commit: parts[1].to_string(),
                    last_commit_date: parts[2].to_string(),
                    ahead,
                    behind,
                });
            }
        }
        
        Ok(branches)
    }
    
    /// Create a new branch
    pub fn create_branch(&self, name: &str, from: Option<&str>) -> Result<(), String> {
        let args = match from {
            Some(base) => vec!["checkout", "-b", name, base],
            None => vec!["checkout", "-b", name],
        };
        
        self.run_git(&args)?;
        Ok(())
    }
    
    /// Checkout a branch
    pub fn checkout(&self, branch: &str) -> Result<(), String> {
        self.run_git(&["checkout", branch])?;
        Ok(())
    }
    
    /// Delete a branch
    pub fn delete_branch(&self, name: &str, force: bool) -> Result<(), String> {
        let flag = if force { "-D" } else { "-d" };
        self.run_git(&["branch", flag, name])?;
        Ok(())
    }
    
    /// Rename a branch
    pub fn rename_branch(&self, old_name: &str, new_name: &str) -> Result<(), String> {
        self.run_git(&["branch", "-m", old_name, new_name])?;
        Ok(())
    }
    
    // ========================================
    // Commit Operations
    // ========================================
    
    /// Get commit history
    pub fn get_log(&self, count: u32, branch: Option<&str>) -> Result<Vec<CommitInfo>, String> {
        let format = "--format=%H|%h|%an|%ae|%ai|%s";
        let count_str = format!("-{}", count);
        
        let mut args = vec!["log", &count_str, format, "--shortstat"];
        if let Some(b) = branch {
            args.push(b);
        }
        
        let output = self.run_git(&args)?;
        let mut commits = Vec::new();
        let mut current_commit: Option<CommitInfo> = None;
        
        for line in output.lines() {
            if line.contains('|') && line.len() > 40 {
                // Commit line
                if let Some(commit) = current_commit.take() {
                    commits.push(commit);
                }
                
                let parts: Vec<&str> = line.splitn(6, '|').collect();
                if parts.len() == 6 {
                    current_commit = Some(CommitInfo {
                        hash: parts[0].to_string(),
                        short_hash: parts[1].to_string(),
                        author: parts[2].to_string(),
                        email: parts[3].to_string(),
                        date: parts[4].to_string(),
                        message: parts[5].to_string(),
                        files_changed: 0,
                        insertions: 0,
                        deletions: 0,
                    });
                }
            } else if line.contains("file") && line.contains("changed") {
                // Stats line
                if let Some(ref mut commit) = current_commit {
                    // Parse: " 3 files changed, 45 insertions(+), 12 deletions(-)"
                    let parts: Vec<&str> = line.split(',').collect();
                    for part in parts {
                        let trimmed = part.trim();
                        if trimmed.contains("file") {
                            commit.files_changed = trimmed.split_whitespace()
                                .next()
                                .and_then(|s| s.parse().ok())
                                .unwrap_or(0);
                        } else if trimmed.contains("insertion") {
                            commit.insertions = trimmed.split_whitespace()
                                .next()
                                .and_then(|s| s.parse().ok())
                                .unwrap_or(0);
                        } else if trimmed.contains("deletion") {
                            commit.deletions = trimmed.split_whitespace()
                                .next()
                                .and_then(|s| s.parse().ok())
                                .unwrap_or(0);
                        }
                    }
                }
            }
        }
        
        if let Some(commit) = current_commit {
            commits.push(commit);
        }
        
        Ok(commits)
    }
    
    /// Stage files
    pub fn stage(&self, paths: &[&str]) -> Result<(), String> {
        let mut args = vec!["add"];
        args.extend(paths);
        self.run_git(&args)?;
        Ok(())
    }
    
    /// Stage all changes
    pub fn stage_all(&self) -> Result<(), String> {
        self.run_git(&["add", "-A"])?;
        Ok(())
    }
    
    /// Unstage files
    pub fn unstage(&self, paths: &[&str]) -> Result<(), String> {
        let mut args = vec!["reset", "HEAD", "--"];
        args.extend(paths);
        self.run_git(&args)?;
        Ok(())
    }
    
    /// Commit staged changes
    pub fn commit(&self, message: &str) -> Result<String, String> {
        let output = self.run_git(&["commit", "-m", message])?;
        
        // Extract commit hash from output
        let hash = self.run_git(&["rev-parse", "HEAD"])?;
        Ok(hash.trim().to_string())
    }
    
    /// Amend last commit
    pub fn amend(&self, message: Option<&str>) -> Result<String, String> {
        let args = match message {
            Some(msg) => vec!["commit", "--amend", "-m", msg],
            None => vec!["commit", "--amend", "--no-edit"],
        };
        
        self.run_git(&args)?;
        let hash = self.run_git(&["rev-parse", "HEAD"])?;
        Ok(hash.trim().to_string())
    }
    
    // ========================================
    // Merge Operations
    // ========================================
    
    /// Merge a branch into current branch
    pub fn merge(&self, branch: &str, no_ff: bool) -> Result<MergeResult, String> {
        let args = if no_ff {
            vec!["merge", "--no-ff", branch]
        } else {
            vec!["merge", branch]
        };
        
        let result = Command::new("git")
            .args(&args)
            .current_dir(&self.repo_path)
            .output()
            .map_err(|e| format!("Failed to execute git merge: {}", e))?;
        
        if result.status.success() {
            Ok(MergeResult {
                success: true,
                conflicts: Vec::new(),
                message: String::from_utf8_lossy(&result.stdout).to_string(),
            })
        } else {
            // Check for conflicts
            let conflicts = self.get_conflicts()?;
            
            Ok(MergeResult {
                success: false,
                conflicts,
                message: String::from_utf8_lossy(&result.stderr).to_string(),
            })
        }
    }
    
    /// Get list of conflicting files
    fn get_conflicts(&self) -> Result<Vec<ConflictFile>, String> {
        let output = self.run_git(&["diff", "--name-only", "--diff-filter=U"])?;
        
        let conflicts: Vec<ConflictFile> = output
            .lines()
            .filter(|l| !l.is_empty())
            .map(|path| ConflictFile {
                path: path.to_string(),
                ours: String::new(),
                theirs: String::new(),
                base: None,
            })
            .collect();
        
        Ok(conflicts)
    }
    
    /// Abort merge
    pub fn abort_merge(&self) -> Result<(), String> {
        self.run_git(&["merge", "--abort"])?;
        Ok(())
    }
    
    /// Continue merge after resolving conflicts
    pub fn continue_merge(&self) -> Result<(), String> {
        self.run_git(&["commit", "--no-edit"])?;
        Ok(())
    }
    
    // ========================================
    // Remote Operations
    // ========================================
    
    /// Fetch from remote
    pub fn fetch(&self, remote: Option<&str>, prune: bool) -> Result<(), String> {
        let mut args = vec!["fetch"];
        
        if let Some(r) = remote {
            args.push(r);
        }
        
        if prune {
            args.push("--prune");
        }
        
        self.run_git(&args)?;
        Ok(())
    }
    
    /// Pull from remote
    pub fn pull(&self, remote: Option<&str>, branch: Option<&str>, rebase: bool) -> Result<(), String> {
        let mut args = vec!["pull"];
        
        if rebase {
            args.push("--rebase");
        }
        
        if let Some(r) = remote {
            args.push(r);
        }
        
        if let Some(b) = branch {
            args.push(b);
        }
        
        self.run_git(&args)?;
        Ok(())
    }
    
    /// Push to remote
    pub fn push(&self, remote: Option<&str>, branch: Option<&str>, force: bool, set_upstream: bool) -> Result<(), String> {
        let mut args = vec!["push"];
        
        if force {
            args.push("--force-with-lease");
        }
        
        if set_upstream {
            args.push("-u");
        }
        
        if let Some(r) = remote {
            args.push(r);
        }
        
        if let Some(b) = branch {
            args.push(b);
        }
        
        self.run_git(&args)?;
        Ok(())
    }
    
    // ========================================
    // Stash Operations
    // ========================================
    
    /// List stashes
    pub fn list_stashes(&self) -> Result<Vec<StashEntry>, String> {
        let output = self.run_git(&["stash", "list", "--format=%gd|%gs|%ci"])?;
        
        let stashes: Vec<StashEntry> = output
            .lines()
            .filter(|l| !l.is_empty())
            .enumerate()
            .filter_map(|(i, line)| {
                let parts: Vec<&str> = line.splitn(3, '|').collect();
                if parts.len() >= 3 {
                    Some(StashEntry {
                        index: i as u32,
                        message: parts[1].to_string(),
                        branch: String::new(),
                        date: parts[2].to_string(),
                    })
                } else {
                    None
                }
            })
            .collect();
        
        Ok(stashes)
    }
    
    /// Create a stash
    pub fn stash_push(&self, message: Option<&str>, include_untracked: bool) -> Result<(), String> {
        let mut args = vec!["stash", "push"];
        
        if include_untracked {
            args.push("-u");
        }
        
        if let Some(msg) = message {
            args.push("-m");
            args.push(msg);
        }
        
        self.run_git(&args)?;
        Ok(())
    }
    
    /// Apply a stash
    pub fn stash_apply(&self, index: Option<u32>) -> Result<(), String> {
        let stash_ref = match index {
            Some(i) => format!("stash@{{{}}}", i),
            None => "stash@{0}".to_string(),
        };
        
        self.run_git(&["stash", "apply", &stash_ref])?;
        Ok(())
    }
    
    /// Pop a stash
    pub fn stash_pop(&self, index: Option<u32>) -> Result<(), String> {
        let stash_ref = match index {
            Some(i) => format!("stash@{{{}}}", i),
            None => "stash@{0}".to_string(),
        };
        
        self.run_git(&["stash", "pop", &stash_ref])?;
        Ok(())
    }
    
    /// Drop a stash
    pub fn stash_drop(&self, index: Option<u32>) -> Result<(), String> {
        let stash_ref = match index {
            Some(i) => format!("stash@{{{}}}", i),
            None => "stash@{0}".to_string(),
        };
        
        self.run_git(&["stash", "drop", &stash_ref])?;
        Ok(())
    }
    
    // ========================================
    // Diff Operations
    // ========================================
    
    /// Get diff for staged changes
    pub fn diff_staged(&self) -> Result<DiffResult, String> {
        self.parse_diff(&["diff", "--cached", "--stat"])
    }
    
    /// Get diff for unstaged changes
    pub fn diff_unstaged(&self) -> Result<DiffResult, String> {
        self.parse_diff(&["diff", "--stat"])
    }
    
    /// Get diff between two refs
    pub fn diff_refs(&self, from: &str, to: &str) -> Result<DiffResult, String> {
        self.parse_diff(&["diff", "--stat", from, to])
    }
    
    fn parse_diff(&self, args: &[&str]) -> Result<DiffResult, String> {
        let output = self.run_git(args)?;
        
        let mut files = Vec::new();
        let mut total_additions = 0;
        let mut total_deletions = 0;
        
        for line in output.lines() {
            if line.contains('|') {
                // File stat line: " path/to/file | 10 ++++----"
                let parts: Vec<&str> = line.split('|').collect();
                if parts.len() == 2 {
                    let path = parts[0].trim().to_string();
                    let stats = parts[1].trim();
                    
                    let additions = stats.matches('+').count() as u32;
                    let deletions = stats.matches('-').count() as u32;
                    
                    total_additions += additions;
                    total_deletions += deletions;
                    
                    files.push(FileDiff {
                        path,
                        status: ChangeStatus::Modified,
                        additions,
                        deletions,
                        hunks: Vec::new(),
                    });
                }
            }
        }
        
        Ok(DiffResult {
            files,
            total_additions,
            total_deletions,
        })
    }
    
    // ========================================
    // Helper Functions
    // ========================================
    
    fn run_git(&self, args: &[&str]) -> Result<String, String> {
        let output = Command::new("git")
            .args(args)
            .current_dir(&self.repo_path)
            .output()
            .map_err(|e| format!("Failed to execute git: {}", e))?;
        
        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(format!(
                "Git command failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ))
        }
    }
}

// ============================================
// Helper Functions
// ============================================

fn char_to_status(c: char) -> ChangeStatus {
    match c {
        'A' => ChangeStatus::Added,
        'M' => ChangeStatus::Modified,
        'D' => ChangeStatus::Deleted,
        'R' => ChangeStatus::Renamed,
        'C' => ChangeStatus::Copied,
        'U' => ChangeStatus::Unmerged,
        _ => ChangeStatus::Modified,
    }
}
