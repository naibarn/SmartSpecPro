//! A per-command Windows Job Object. The child starts suspended, is assigned
//! before running user code, and all descendants die before workspace apply.
use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
use std::process::{Child, Command};
use std::time::{Duration, Instant};
use windows_sys::Win32::Foundation::INVALID_HANDLE_VALUE;
use windows_sys::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Thread32First, Thread32Next, TH32CS_SNAPTHREAD, THREADENTRY32,
};
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JobObjectBasicAccountingInformation,
    JobObjectExtendedLimitInformation, QueryInformationJobObject, SetInformationJobObject,
    TerminateJobObject, JOBOBJECT_BASIC_ACCOUNTING_INFORMATION,
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};
use windows_sys::Win32::System::Threading::{
    OpenThread, ResumeThread, CREATE_NO_WINDOW, CREATE_SUSPENDED, THREAD_SUSPEND_RESUME,
};

pub(crate) struct WindowsProcessJob(OwnedHandle);

impl WindowsProcessJob {
    pub(crate) fn spawn(command: &mut Command) -> Result<(Child, Self), String> {
        use std::os::windows::process::CommandExt;
        let handle = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
        if handle.is_null() {
            return Err("RUNNER_WINDOWS_JOB_CREATE_FAILED".into());
        }
        let job = Self(unsafe { OwnedHandle::from_raw_handle(handle) });
        let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        if unsafe {
            SetInformationJobObject(
                job.0.as_raw_handle(),
                JobObjectExtendedLimitInformation,
                (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
                std::mem::size_of_val(&limits) as u32,
            )
        } == 0
        {
            return Err("RUNNER_WINDOWS_JOB_LIMIT_FAILED".into());
        }
        command.creation_flags(CREATE_NO_WINDOW | CREATE_SUSPENDED);
        let mut child = command.spawn().map_err(|_| "RUNNER_PROCESS_SPAWN_FAILED")?;
        let admitted = (|| {
            if unsafe { AssignProcessToJobObject(job.0.as_raw_handle(), child.as_raw_handle()) }
                == 0
            {
                return Err("RUNNER_WINDOWS_JOB_ASSIGN_FAILED");
            }
            // std::process::Child owns the process handle, not the primary
            // thread handle. Locate only this suspended child's primary thread.
            let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0) };
            if snapshot == INVALID_HANDLE_VALUE {
                return Err("RUNNER_WINDOWS_THREAD_SNAPSHOT_FAILED");
            }
            let snapshot = unsafe { OwnedHandle::from_raw_handle(snapshot) };
            let mut entry = THREADENTRY32::default();
            entry.dwSize = std::mem::size_of::<THREADENTRY32>() as u32;
            let mut found = unsafe { Thread32First(snapshot.as_raw_handle(), &mut entry) };
            while found != 0 {
                if entry.th32OwnerProcessID == child.id() {
                    let thread =
                        unsafe { OpenThread(THREAD_SUSPEND_RESUME, 0, entry.th32ThreadID) };
                    if thread.is_null() {
                        return Err("RUNNER_WINDOWS_THREAD_OPEN_FAILED");
                    }
                    let thread = unsafe { OwnedHandle::from_raw_handle(thread) };
                    if unsafe { ResumeThread(thread.as_raw_handle()) } == u32::MAX {
                        return Err("RUNNER_WINDOWS_THREAD_RESUME_FAILED");
                    }
                    return Ok(());
                }
                found = unsafe { Thread32Next(snapshot.as_raw_handle(), &mut entry) };
            }
            Err("RUNNER_WINDOWS_THREAD_NOT_FOUND")
        })();
        if let Err(error) = admitted {
            // If assignment failed the job cannot kill the suspended child.
            let _ = child.kill();
            let _ = child.wait();
            return Err(error.into());
        }
        Ok((child, job))
    }

    pub(crate) fn terminate(&self) -> Result<(), String> {
        if unsafe { TerminateJobObject(self.0.as_raw_handle(), 1) } == 0 {
            return Err("RUNNER_WINDOWS_JOB_TERMINATE_FAILED".into());
        }
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            let mut accounting = JOBOBJECT_BASIC_ACCOUNTING_INFORMATION::default();
            if unsafe {
                QueryInformationJobObject(
                    self.0.as_raw_handle(),
                    JobObjectBasicAccountingInformation,
                    (&mut accounting as *mut JOBOBJECT_BASIC_ACCOUNTING_INFORMATION).cast(),
                    std::mem::size_of_val(&accounting) as u32,
                    std::ptr::null_mut(),
                )
            } == 0
            {
                return Err("RUNNER_WINDOWS_JOB_STATUS_FAILED".into());
            }
            if accounting.ActiveProcesses == 0 {
                return Ok(());
            }
            if Instant::now() >= deadline {
                return Err("RUNNER_WINDOWS_JOB_TERMINATE_TIMEOUT".into());
            }
            std::thread::sleep(Duration::from_millis(10));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows_sys::Win32::System::Threading::{OpenProcess, WaitForSingleObject};

    fn owned_parent_and_child() -> (Child, WindowsProcessJob, OwnedHandle) {
        let root = tempfile::tempdir().unwrap();
        let pid_file = root.path().join("child-pid.txt");
        let powershell = std::path::PathBuf::from(std::env::var_os("SystemRoot").unwrap())
            .join("System32/WindowsPowerShell/v1.0/powershell.exe");
        let mut command = Command::new(powershell);
        command.args(["-NoProfile", "-NonInteractive", "-Command",
            "$p = Start-Process (Join-Path $PSHOME 'powershell.exe') -ArgumentList '-NoProfile','-NonInteractive','-Command','Start-Sleep -Seconds 60' -PassThru; $p.Id | Set-Content $env:SAH_TEST_PID_FILE; Start-Sleep -Seconds 60"])
            .env("SAH_TEST_PID_FILE", &pid_file);
        let (child, job) = WindowsProcessJob::spawn(&mut command).unwrap();
        let deadline = Instant::now() + Duration::from_secs(15);
        let pid = loop {
            if let Ok(text) = std::fs::read_to_string(&pid_file) {
                if let Ok(pid) = text.trim().parse::<u32>() {
                    break pid;
                }
            }
            assert!(Instant::now() < deadline, "child did not publish PID");
            std::thread::sleep(Duration::from_millis(20));
        };
        // SYNCHRONIZE access is enough to observe this owned descendant exit.
        let handle = unsafe { OpenProcess(0x0010_0000, 0, pid) };
        assert!(!handle.is_null());
        let handle = unsafe { OwnedHandle::from_raw_handle(handle) };
        assert_eq!(
            unsafe { WaitForSingleObject(handle.as_raw_handle(), 0) },
            258
        );
        (child, job, handle)
    }

    #[test]
    fn windows_job_timeout_or_cancel_terminates_parent_and_descendant() {
        let (mut child, job, descendant) = owned_parent_and_child();
        job.terminate().unwrap();
        assert!(child.wait().is_ok());
        assert_eq!(
            unsafe { WaitForSingleObject(descendant.as_raw_handle(), 5000) },
            0
        );
    }

    #[test]
    fn windows_job_owner_drop_stops_descendants_before_recovery() {
        let (mut child, job, descendant) = owned_parent_and_child();
        drop(job);
        assert!(child.wait().is_ok());
        assert_eq!(
            unsafe { WaitForSingleObject(descendant.as_raw_handle(), 5000) },
            0
        );
    }
}
