use std::path::{Path, PathBuf};
use std::process::Command;

/// Builds the host command used for a discovered local CLI. Windows package
/// managers commonly expose Node CLIs as `.cmd` or `.ps1` shims, which cannot
/// be passed directly to `CreateProcess` as a program.
pub fn command_for_cli(program: &Path, args: &[String]) -> Result<Command, String> {
    let system_root = std::env::var_os("SystemRoot").map(PathBuf::from);
    command_for_cli_on_platform(program, args, cfg!(windows), system_root.as_deref())
}

fn command_for_cli_on_platform(
    program: &Path,
    args: &[String],
    windows: bool,
    system_root: Option<&Path>,
) -> Result<Command, String> {
    if windows {
        match program
            .extension()
            .and_then(|extension| extension.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref()
        {
            Some("cmd" | "bat") => {
                if cmd_shim_input_is_unsafe(program, args) {
                    return Err("RUNNER_PROCESS_CMD_SHIM_UNSAFE_ARGUMENT".into());
                }
                let mut command =
                    Command::new(windows_system_executable(system_root, &["cmd.exe"])?);
                let mut invocation = format!("\"{}\"", program.display());
                for arg in args {
                    invocation.push(' ');
                    invocation.push('"');
                    invocation.push_str(arg);
                    invocation.push('"');
                }
                command.args(["/d", "/s", "/c"]);
                #[cfg(windows)]
                {
                    use std::os::windows::process::CommandExt;

                    // cmd.exe parses this as a command line. Passing it through
                    // Command::arg applies CRT escaping, which leaves literal
                    // backslashes before quotes for cmd.exe to interpret.
                    command.raw_arg(format!("\"{invocation}\""));
                }
                #[cfg(not(windows))]
                command.arg(format!("\"{invocation}\""));
                return Ok(command);
            }
            Some("ps1") => {
                let mut command = Command::new(windows_system_executable(
                    system_root,
                    &["WindowsPowerShell", "v1.0", "powershell.exe"],
                )?);
                command
                    .args(["-NoLogo", "-NoProfile", "-NonInteractive", "-File"])
                    .arg(program)
                    .args(args);
                return Ok(command);
            }
            _ => {}
        }
    }

    let mut command = Command::new(program);
    command.args(args);
    Ok(command)
}

fn windows_system_executable(
    system_root: Option<&Path>,
    relative_parts: &[&str],
) -> Result<PathBuf, String> {
    system_root
        .map(|root| {
            relative_parts
                .iter()
                .fold(root.join("System32"), |path, part| path.join(part))
        })
        .ok_or_else(|| "RUNNER_WINDOWS_SYSTEM_ROOT_UNAVAILABLE".into())
}

fn cmd_shim_input_is_unsafe(program: &Path, args: &[String]) -> bool {
    fn contains_cmd_metacharacter(value: &str) -> bool {
        value.chars().any(|character| {
            matches!(
                character,
                '"' | '&' | '|' | '<' | '>' | '^' | '%' | '!' | '(' | ')' | '\r' | '\n' | '\0'
            )
        })
    }

    program.to_str().is_none_or(contains_cmd_metacharacter)
        || args
            .iter()
            .any(|argument| contains_cmd_metacharacter(argument))
}

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
        let mut command = command_for_cli(&spec.program, &spec.args)?;
        command
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
        #[cfg(unix)]
        let process_group_id = child.id();
        Ok(Box::new(OsProcessHandle {
            child: Some(child),
            #[cfg(unix)]
            process_group_id,
        }))
    }
}

struct OsProcessHandle {
    child: Option<std::process::Child>,
    #[cfg(unix)]
    process_group_id: u32,
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
        let still_running = child
            .try_wait()
            .map_err(|_| "RUNNER_PROCESS_STATUS_FAILED".to_string())?
            .is_none();
        #[cfg(unix)]
        {
            let group = -(self.process_group_id as libc::pid_t);
            // The child is started in a new process group, so group signals
            // terminate descendants that remain attached to this execution.
            let term_result = unsafe { libc::kill(group, libc::SIGTERM) };
            if term_result != 0 {
                let error = std::io::Error::last_os_error();
                if error.raw_os_error() != Some(libc::ESRCH) {
                    return Err("RUNNER_PROCESS_TERMINATE_FAILED".into());
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(250));
            let kill_result = unsafe { libc::kill(group, libc::SIGKILL) };
            if kill_result != 0 {
                let error = std::io::Error::last_os_error();
                if error.raw_os_error() != Some(libc::ESRCH) {
                    return Err("RUNNER_PROCESS_TERMINATE_FAILED".into());
                }
            }
        }
        #[cfg(not(unix))]
        if still_running {
            child
                .kill()
                .map_err(|_| "RUNNER_PROCESS_TERMINATE_FAILED".to_string())?;
        }
        if still_running {
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

    #[cfg(target_os = "linux")]
    #[test]
    fn cancellation_terminates_a_real_descendant_process() {
        use std::time::{Duration, Instant};

        let temp = tempfile::tempdir().unwrap();
        let pid_file = temp.path().join("child.pid");
        let program = PathBuf::from("/bin/sh");
        if !program.is_file() {
            return;
        }
        let spec = ProcessSpec {
            program,
            args: vec![
                "-c".into(),
                format!("sleep 60 & echo $! > '{}' ; wait", pid_file.display()),
            ],
            working_directory: temp.path().to_path_buf(),
            environment: vec![],
        };
        let mut host = OsProcessHost;
        let mut process = ManagedProcess::start(&mut host, &spec).unwrap();
        let deadline = Instant::now() + Duration::from_secs(2);
        while !pid_file.exists() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(10));
        }
        let child_pid: i32 = std::fs::read_to_string(&pid_file)
            .unwrap()
            .trim()
            .parse()
            .unwrap();

        process.cancel().unwrap();

        let child_stat = PathBuf::from(format!("/proc/{child_pid}/stat"));
        let reap_deadline = Instant::now() + Duration::from_secs(2);
        loop {
            match std::fs::read_to_string(&child_stat) {
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => break,
                Ok(stat) if stat.split_whitespace().nth(2) == Some("Z") => break,
                Err(error) => panic!("could not inspect descendant state: {error}"),
                _ if Instant::now() < reap_deadline => {
                    std::thread::sleep(Duration::from_millis(10))
                }
                _ => panic!("descendant process remained live after group cancellation"),
            }
        }
    }

    #[test]
    fn windows_cmd_and_batch_shims_use_cmd_exe_for_dispatch() {
        for extension in ["cmd", "bat"] {
            let program = PathBuf::from(format!(
                "C:\\Users\\runner\\AppData\\Roaming\\npm\\codex.{extension}"
            ));
            let args = vec!["exec".into(), "--json".into(), "hello".into()];
            let command =
                command_for_cli_on_platform(&program, &args, true, Some(Path::new("C:\\Windows")))
                    .unwrap();
            let actual_args = command
                .get_args()
                .map(|arg| arg.to_string_lossy().into_owned())
                .collect::<Vec<_>>();

            assert_eq!(
                command.get_program(),
                Path::new("C:\\Windows").join("System32").join("cmd.exe")
            );
            assert_eq!(&actual_args[..3], ["/d", "/s", "/c"]);
            assert_eq!(
                actual_args[3],
                "\"\"C:\\Users\\runner\\AppData\\Roaming\\npm\\codex.".to_owned()
                    + extension
                    + "\" \"exec\" \"--json\" \"hello\"\""
            );
        }
    }

    #[test]
    fn windows_powershell_shims_preserve_arguments_without_a_shell_command_string() {
        let program = PathBuf::from("C:\\Users\\runner\\AppData\\Roaming\\npm\\codex.ps1");
        let args = vec!["exec".into(), "--json".into(), "hello world".into()];
        let command =
            command_for_cli_on_platform(&program, &args, true, Some(Path::new("C:\\Windows")))
                .unwrap();
        let actual_args = command
            .get_args()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect::<Vec<_>>();

        assert_eq!(
            command.get_program(),
            Path::new("C:\\Windows")
                .join("System32")
                .join("WindowsPowerShell")
                .join("v1.0")
                .join("powershell.exe")
        );
        assert_eq!(
            actual_args,
            [
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-File",
                "C:\\Users\\runner\\AppData\\Roaming\\npm\\codex.ps1",
                "exec",
                "--json",
                "hello world",
            ]
        );
    }

    #[test]
    fn native_windows_executable_does_not_use_a_shell() {
        let program = PathBuf::from("C:\\Program Files\\Codex\\codex.exe");
        let args = vec!["exec".into(), "--json".into()];
        let command =
            command_for_cli_on_platform(&program, &args, true, Some(Path::new("C:\\Windows")))
                .unwrap();

        assert_eq!(command.get_program(), program);
        assert_eq!(
            command
                .get_args()
                .map(|arg| arg.to_string_lossy().into_owned())
                .collect::<Vec<_>>(),
            args
        );
    }

    #[test]
    fn cmd_shims_fail_closed_for_shell_metacharacters_in_path_or_arguments() {
        let program = PathBuf::from("C:\\Users\\runner\\AppData\\Roaming\\npm\\codex.cmd");
        for argument in ["hello & whoami", "say \"hello\"", "100%", "line\nbreak"] {
            let error = command_for_cli_on_platform(
                &program,
                &["exec".into(), argument.into()],
                true,
                Some(Path::new("C:\\Windows")),
            )
            .unwrap_err();
            assert_eq!(error, "RUNNER_PROCESS_CMD_SHIM_UNSAFE_ARGUMENT");
        }

        let unsafe_program = PathBuf::from("C:\\Users\\A&B\\codex.cmd");
        assert_eq!(
            command_for_cli_on_platform(
                &unsafe_program,
                &[],
                true,
                Some(Path::new("C:\\Windows")),
            )
            .unwrap_err(),
            "RUNNER_PROCESS_CMD_SHIM_UNSAFE_ARGUMENT"
        );
    }

    #[test]
    fn windows_shim_launch_requires_system_root_for_absolute_shell_resolution() {
        let program = PathBuf::from("C:\\Users\\runner\\AppData\\Roaming\\npm\\codex.cmd");
        assert_eq!(
            command_for_cli_on_platform(&program, &[], true, None).unwrap_err(),
            "RUNNER_WINDOWS_SYSTEM_ROOT_UNAVAILABLE"
        );
    }

    #[cfg(windows)]
    #[test]
    fn windows_cmd_shim_runs_with_the_requested_arguments() {
        let temp = tempfile::tempdir().unwrap();
        let program = temp.path().join("codex.cmd");
        std::fs::write(&program, "@echo off\r\necho %~1 %~2 %~3\r\n").unwrap();
        let args = vec!["exec".into(), "--json".into(), "hello-world".into()];
        let mut command = command_for_cli(&program, &args).unwrap();
        command.current_dir(temp.path());

        let output = command.output().unwrap();
        assert!(
            output.status.success(),
            "cmd shim exited {:?}; stdout={:?}; stderr={:?}",
            output.status.code(),
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        assert_eq!(
            String::from_utf8_lossy(&output.stdout).trim(),
            "exec --json hello-world"
        );
    }

    #[cfg(windows)]
    #[test]
    fn windows_powershell_shim_receives_spaced_arguments_separately() {
        let temp = tempfile::tempdir().unwrap();
        let program = temp.path().join("codex.ps1");
        std::fs::write(&program, "Write-Output ($args -join '|')\r\n").unwrap();
        let args = vec!["exec".into(), "--json".into(), "hello world".into()];
        let mut command = command_for_cli(&program, &args).unwrap();
        command.current_dir(temp.path());

        let output = command.output().unwrap();
        assert!(output.status.success());
        assert_eq!(
            String::from_utf8_lossy(&output.stdout).trim(),
            "exec|--json|hello world"
        );
    }
}
