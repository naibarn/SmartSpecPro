use anyhow::{Context, Result};
use git2::{Repository, Signature, IndexAddOption, BranchType};
use std::path::Path;

pub struct GitManager {
    repo_path: String,
}

impl GitManager {
    pub fn new(repo_path: String) -> Self {
        Self { repo_path }
    }

    /// Open the repository
    fn open_repo(&self) -> Result<Repository> {
        Repository::open(&self.repo_path)
            .with_context(|| format!("Failed to open repository at {}", self.repo_path))
    }

    /// Get current branch name
    pub fn get_current_branch(&self) -> Result<String> {
        let repo = self.open_repo()?;
        let head = repo.head()?;
        
        if let Some(branch_name) = head.shorthand() {
            Ok(branch_name.to_string())
        } else {
            Ok("HEAD".to_string())
        }
    }

    /// Create a new branch from current HEAD
    pub fn create_branch(&self, branch_name: &str) -> Result<()> {
        let repo = self.open_repo()?;
        let head = repo.head()?;
        let commit = head.peel_to_commit()?;
        
        // Check if branch already exists
        if repo.find_branch(branch_name, BranchType::Local).is_ok() {
            return Ok(()); // Branch already exists, that's fine
        }

        repo.branch(branch_name, &commit, false)?;
        Ok(())
    }

    /// Switch to a branch
    pub fn checkout_branch(&self, branch_name: &str) -> Result<()> {
        let repo = self.open_repo()?;
        
        // Get the branch reference
        let branch = repo.find_branch(branch_name, BranchType::Local)?;
        let reference = branch.get();
        
        // Set HEAD to the branch
        repo.set_head(reference.name().unwrap())?;
        
        // Checkout the branch
        repo.checkout_head(Some(
            git2::build::CheckoutBuilder::new()
                .force()
        ))?;
        
        Ok(())
    }

    /// Create and checkout a new branch
    pub fn create_and_checkout_branch(&self, branch_name: &str) -> Result<()> {
        self.create_branch(branch_name)?;
        self.checkout_branch(branch_name)?;
        Ok(())
    }

    /// Stage all changes
    pub fn stage_all(&self) -> Result<()> {
        let repo = self.open_repo()?;
        let mut index = repo.index()?;
        
        index.add_all(["*"].iter(), IndexAddOption::DEFAULT, None)?;
        index.write()?;
        
        Ok(())
    }

    /// Commit staged changes
    pub fn commit(&self, message: &str) -> Result<String> {
        let repo = self.open_repo()?;
        let mut index = repo.index()?;
        let tree_id = index.write_tree()?;
        let tree = repo.find_tree(tree_id)?;
        
        let signature = Signature::now("SmartSpec Pro", "smartspec@local")?;
        let head = repo.head()?;
        let parent_commit = head.peel_to_commit()?;
        
        let commit_id = repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            message,
            &tree,
            &[&parent_commit],
        )?;
        
        Ok(commit_id.to_string())
    }

    /// Push branch to remote
    pub fn push_branch(&self, branch_name: &str, remote_name: &str) -> Result<()> {
        let repo = self.open_repo()?;
        let mut remote = repo.find_remote(remote_name)?;
        
        let refspec = format!("refs/heads/{}", branch_name);
        remote.push(&[&refspec], None)?;
        
        Ok(())
    }

    /// Check if repository has uncommitted changes
    pub fn has_changes(&self) -> Result<bool> {
        let repo = self.open_repo()?;
        let statuses = repo.statuses(None)?;
        Ok(!statuses.is_empty())
    }

    /// List all local branches
    pub fn list_branches(&self) -> Result<Vec<String>> {
        let repo = self.open_repo()?;
        let branches = repo.branches(Some(BranchType::Local))?;
        
        let mut branch_names = Vec::new();
        for branch in branches {
            let (branch, _) = branch?;
            if let Some(name) = branch.name()? {
                branch_names.push(name.to_string());
            }
        }
        
        Ok(branch_names)
    }

    /// Check if repository exists at path
    pub fn repo_exists(&self) -> bool {
        Repository::open(&self.repo_path).is_ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_git_manager_creation() {
        let manager = GitManager::new("/tmp/test-repo".to_string());
        assert_eq!(manager.repo_path, "/tmp/test-repo");
    }
}
