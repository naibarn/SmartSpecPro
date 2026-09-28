use std::path::{Component, Path, PathBuf};

#[derive(Debug, Clone)]
pub struct WorkspacePolicy {
    pub root: PathBuf,
    pub allowed_refs: Vec<String>,
}

impl WorkspacePolicy {
    pub fn resolve(&self, reference: &str) -> Result<PathBuf, String> {
        let path = Path::new(reference);
        if path.is_absolute() || reference.trim().is_empty() {
            return Err("RUNNER_WORKSPACE_PATH_INVALID".into());
        }
        if path
            .components()
            .any(|component| matches!(component, Component::ParentDir))
        {
            return Err("RUNNER_WORKSPACE_TRAVERSAL".into());
        }
        if !self.allowed_refs.iter().any(|allowed| allowed == reference) {
            return Err("RUNNER_WORKSPACE_REFERENCE_DENIED".into());
        }
        let candidate = self.root.join(path);
        let mut current = self.root.clone();
        for component in path.components() {
            if let Component::Normal(part) = component {
                current.push(part);
                if let Ok(metadata) = std::fs::symlink_metadata(&current) {
                    if metadata.file_type().is_symlink() {
                        return Err("RUNNER_WORKSPACE_SYMLINK_ESCAPE".into());
                    }
                }
            }
        }
        Ok(candidate)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn confines_references_to_policy() {
        let policy = WorkspacePolicy {
            root: PathBuf::from("/tmp/job"),
            allowed_refs: vec!["input/file.txt".into()],
        };
        assert_eq!(
            policy.resolve("input/file.txt").unwrap(),
            PathBuf::from("/tmp/job/input/file.txt")
        );
        assert!(policy.resolve("../secrets").is_err());
        assert!(policy.resolve("/etc/passwd").is_err());
        assert!(policy.resolve("output/file.txt").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_escape_even_when_reference_is_allowed() {
        use std::os::unix::fs::symlink;

        let root =
            std::env::temp_dir().join(format!("smartspec-runner-workspace-{}", std::process::id()));
        let outside = root.with_file_name("smartspec-runner-outside");
        let _ = std::fs::remove_dir_all(&root);
        let _ = std::fs::remove_dir_all(&outside);
        std::fs::create_dir_all(&root).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        symlink(&outside, root.join("linked")).unwrap();
        let policy = WorkspacePolicy {
            root: root.clone(),
            allowed_refs: vec!["linked/secret.txt".into()],
        };
        assert!(policy.resolve("linked/secret.txt").is_err());
        let _ = std::fs::remove_dir_all(&root);
        let _ = std::fs::remove_dir_all(&outside);
    }
}
