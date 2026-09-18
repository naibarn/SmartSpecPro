use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProcessSpec {
    pub program: PathBuf,
    pub args: Vec<String>,
    pub working_directory: PathBuf,
    pub environment: Vec<(String, String)>,
}

impl ProcessSpec {
    pub fn validate(&self) -> Result<(), String> {
        if !self.program.is_absolute() {
            return Err("RUNNER_PROCESS_PROGRAM_MUST_BE_ABSOLUTE".into());
        }
        if !self.program.is_file() {
            return Err("RUNNER_PROCESS_PROGRAM_NOT_FOUND".into());
        }
        if !self.working_directory.is_absolute() || !self.working_directory.is_dir() {
            return Err("RUNNER_PROCESS_WORKSPACE_INVALID".into());
        }
        if self.args.len() > 64 || self.args.iter().any(|arg| arg.len() > 4096) {
            return Err("RUNNER_PROCESS_ARGUMENTS_TOO_LARGE".into());
        }
        if self.environment.len() > 32
            || self
                .environment
                .iter()
                .any(|(key, value)| key.len() > 128 || value.len() > 4096)
        {
            return Err("RUNNER_PROCESS_ENVIRONMENT_TOO_LARGE".into());
        }
        Ok(())
    }
}

pub trait ProcessHandle {
    fn try_status(&mut self) -> Result<Option<i32>, String>;
    fn terminate(&mut self) -> Result<(), String>;
}

pub trait ProcessHost {
    fn spawn(&mut self, spec: &ProcessSpec) -> Result<Box<dyn ProcessHandle>, String>;
}

#[derive(Default)]
pub struct OsProcessHost;

impl ProcessHost for OsProcessHost {
    fn spawn(&mut self, spec: &ProcessSpec) -> Result<Box<dyn ProcessHandle>, String> {
        spec.validate()?;
        let mut command = std::process::Command::new(&spec.program);
        command
            .args(&spec.args)
            .current_dir(&spec.working_directory)
            .envs(spec.environment.iter().map(|(key, value)| (key, value)));
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.process_group(0);
        }
        let child = command
            .spawn()
            .map_err(|_| "RUNNER_PROCESS_SPAWN_FAILED".to_string())?;
        Ok(Box::new(OsProcessHandle { child: Some(child) }))
    }
}

struct OsProcessHandle {
    child: Option<std::process::Child>,
}

impl ProcessHandle for OsProcessHandle {
    fn try_status(&mut self) -> Result<Option<i32>, String> {
        let child = self
            .child
            .as_mut()
            .ok_or_else(|| "RUNNER_PROCESS_HANDLE_CLOSED".to_string())?;
        child
            .try_wait()
            .map(|status| status.map(|value| value.code().unwrap_or(-1)))
            .map_err(|_| "RUNNER_PROCESS_STATUS_FAILED".to_string())
    }

    fn terminate(&mut self) -> Result<(), String> {
        let Some(child) = self.child.as_mut() else {
            return Ok(());
        };
        if child
            .try_wait()
            .map_err(|_| "RUNNER_PROCESS_STATUS_FAILED".to_string())?
            .is_none()
        {
            child
                .kill()
                .map_err(|_| "RUNNER_PROCESS_TERMINATE_FAILED".to_string())?;
            let _ = child.wait();
        }
        Ok(())
    }
}

pub struct ManagedProcess {
    handle: Box<dyn ProcessHandle>,
}

impl ManagedProcess {
    pub fn start(host: &mut dyn ProcessHost, spec: &ProcessSpec) -> Result<Self, String> {
        Ok(Self {
            handle: host.spawn(spec)?,
        })
    }

    pub fn try_status(&mut self) -> Result<Option<i32>, String> {
        self.handle.try_status()
    }

    pub fn cancel(&mut self) -> Result<(), String> {
        self.handle.terminate()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    struct FakeHandle {
        terminated: Arc<Mutex<bool>>,
    }

    impl ProcessHandle for FakeHandle {
        fn try_status(&mut self) -> Result<Option<i32>, String> {
            Ok(None)
        }

        fn terminate(&mut self) -> Result<(), String> {
            *self.terminated.lock().unwrap() = true;
            Ok(())
        }
    }

    struct FakeHost {
        terminated: Arc<Mutex<bool>>,
    }

    impl ProcessHost for FakeHost {
        fn spawn(&mut self, spec: &ProcessSpec) -> Result<Box<dyn ProcessHandle>, String> {
            spec.validate().err().map_or_else(
                || {
                    Ok(Box::new(FakeHandle {
                        terminated: self.terminated.clone(),
                    }) as Box<dyn ProcessHandle>)
                },
                Err,
            )
        }
    }

    #[test]
    fn process_scope_uses_validated_absolute_program_and_can_cancel() {
        let temp = tempfile::tempdir().unwrap();
        let program = if cfg!(windows) {
            std::path::PathBuf::from("C:\\Windows\\System32\\cmd.exe")
        } else {
            std::path::PathBuf::from("/bin/echo")
        };
        if !program.is_file() {
            return;
        }
        let terminated = Arc::new(Mutex::new(false));
        let mut host = FakeHost {
            terminated: terminated.clone(),
        };
        let spec = ProcessSpec {
            program,
            args: vec!["smartaihub-runner".into()],
            working_directory: temp.path().to_path_buf(),
            environment: vec![("SAH_RUNNER_JOB_ID".into(), "job-1".into())],
        };
        let mut process = ManagedProcess::start(&mut host, &spec).unwrap();
        assert_eq!(process.try_status().unwrap(), None);
        process.cancel().unwrap();
        assert!(*terminated.lock().unwrap());
    }

    #[test]
    fn process_scope_rejects_relative_program() {
        let temp = tempfile::tempdir().unwrap();
        let spec = ProcessSpec {
            program: "codex".into(),
            args: vec![],
            working_directory: temp.path().to_path_buf(),
            environment: vec![],
        };
        assert_eq!(
            spec.validate().unwrap_err(),
            "RUNNER_PROCESS_PROGRAM_MUST_BE_ABSOLUTE"
        );
    }
}
