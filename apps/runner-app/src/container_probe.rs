//! One fixed CPU media operation for the private shared-container profile.
//! The canonical control plane owns admission/lease/settlement; this module
//! cannot claim jobs, fetch URLs, select commands, or publish artifacts.
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crate::{config::RunnerConfig, leasing::Lease};
pub const CONTRACT: &str = "container-media-probe-v1";
pub const MAX_INPUT_BYTES: usize = 3 * 1024 * 1024;
pub const MAX_RESULT_BYTES: usize = 128 * 1024;
pub const MAX_REQUEST_BYTES: usize = 5 * 1024 * 1024;
const FFPROBE: &str = "/usr/bin/ffprobe";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProbeScope {
    pub tenant_id: String,
    pub lease: Lease,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProbeInput {
    pub content_base64: String,
    pub checksum_sha256: String,
    pub size_bytes: usize,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProbeRequest {
    pub contract_version: String,
    pub scope: ProbeScope,
    pub input: ProbeInput,
}
pub fn current_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(u64::MAX)
}
pub fn configured_scope(config: &RunnerConfig) -> Result<ProbeScope, String> {
    let number = |name| {
        std::env::var(name)
            .ok()
            .and_then(|s| s.parse::<u64>().ok())
            .ok_or("CONTAINER_PROBE_SCOPE_REQUIRED")
    };
    let scope = ProbeScope {
        tenant_id: std::env::var("SAH_RUNNER_TENANT_ID").unwrap_or_default(),
        lease: Lease {
            job_id: config.job_id.clone().unwrap_or_default(),
            attempt_id: config.attempt_id.clone().unwrap_or_default(),
            lease_id: config.lease_id.clone().unwrap_or_default(),
            fencing_version: number("SAH_RUNNER_FENCING_VERSION")?,
            expires_at_ms: number("SAH_RUNNER_EXPIRES_AT_MS")?,
        },
    };
    if scope.tenant_id.is_empty()
        || scope.tenant_id.len() > 255
        || scope.lease.fencing_version == 0
        || scope.lease.expires_at_ms > current_time_ms().saturating_add(600_000)
    {
        return Err("CONTAINER_PROBE_SCOPE_REQUIRED".into());
    }
    scope.lease.validate(current_time_ms(), &scope.lease)?;
    Ok(scope)
}
fn tool_path() -> std::path::PathBuf {
    // Server/image configuration only; the request cannot select an executable.
    std::env::var_os("SAH_RUNNER_FFPROBE_PATH")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| FFPROBE.into())
}
pub fn available() -> bool {
    let path = tool_path();
    path.is_absolute() && path.is_file()
}

struct Scratch(std::path::PathBuf);
impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

pub fn execute(request: ProbeRequest, expected: &ProbeScope, root: &Path) -> Result<Value, String> {
    execute_at(
        request,
        expected,
        root,
        &tool_path(),
        Duration::from_secs(30),
    )
}
fn execute_at(
    request: ProbeRequest,
    expected: &ProbeScope,
    root: &Path,
    binary: &Path,
    timeout: Duration,
) -> Result<Value, String> {
    if request.contract_version != CONTRACT
        || request.scope.tenant_id != expected.tenant_id
        || expected.tenant_id.is_empty()
    {
        return Err("CONTAINER_PROBE_SCOPE_MISMATCH".into());
    }
    request
        .scope
        .lease
        .validate(current_time_ms(), &expected.lease)?;
    if expected.lease.fencing_version == 0
        || expected.lease.expires_at_ms > current_time_ms().saturating_add(600_000)
    {
        return Err("CONTAINER_PROBE_SCOPE_MISMATCH".into());
    }
    if request.input.size_bytes == 0
        || request.input.size_bytes > MAX_INPUT_BYTES
        || request.input.content_base64.len() > MAX_INPUT_BYTES.div_ceil(3) * 4
        || request.input.checksum_sha256.len() != 64
        || !request
            .input
            .checksum_sha256
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err("CONTAINER_PROBE_INPUT_INVALID".into());
    }
    let bytes = STANDARD
        .decode(&request.input.content_base64)
        .map_err(|_| "CONTAINER_PROBE_INPUT_INVALID")?;
    let checksum = format!("{:x}", Sha256::digest(&bytes));
    if bytes.len() != request.input.size_bytes || checksum != request.input.checksum_sha256 {
        return Err("CONTAINER_PROBE_INPUT_CHECKSUM_MISMATCH".into());
    }
    if !binary.is_absolute() || !binary.is_file() {
        return Err("CONTAINER_PROBE_TOOL_UNAVAILABLE".into());
    }
    let scratch = root.join("media-probe");
    fs::create_dir(&scratch).map_err(|_| "CONTAINER_PROBE_WORKSPACE_UNAVAILABLE")?;
    let scratch = Scratch(scratch);
    let input = scratch.0.join("input.bin");
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&input)
        .and_then(|mut f| f.write_all(&bytes))
        .map_err(|_| "CONTAINER_PROBE_INPUT_WRITE_FAILED")?;
    let output = scratch.0.join("metadata.json");
    let output_file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&output)
        .map_err(|_| "CONTAINER_PROBE_OUTPUT_FAILED")?;
    let mut command = Command::new(binary);
    command.env_clear().current_dir(&scratch.0).stdin(Stdio::null()).stdout(output_file).stderr(Stdio::null())
        .args(["-v", "error", "-protocol_whitelist", "file", "-format_whitelist",
            "mov,mp4,m4a,3gp,3g2,mj2,matroska,webm,wav,mp3,ogg,flac,aac,png_pipe,jpeg_pipe,webp_pipe",
            "-probesize", "1048576", "-analyzeduration", "5000000", "-max_streams", "32", "-threads", "1", "-show_entries",
            "format=format_name,duration,size:stream=index,codec_name,codec_type,width,height,sample_rate,channels,duration", "-of", "json"])
        .arg(&input);
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        // Only async-signal-safe syscalls in the child before exec. Limit file
        // output, CPU and descriptors without changing the parent Runner.
        unsafe {
            command.pre_exec(|| {
                if libc::setsid() < 0 {
                    return Err(std::io::Error::last_os_error());
                }
                for (resource, value) in [
                    (libc::RLIMIT_FSIZE, MAX_RESULT_BYTES as libc::rlim_t),
                    (libc::RLIMIT_CPU, 31),
                    (libc::RLIMIT_NOFILE, 64),
                ] {
                    let limit = libc::rlimit {
                        rlim_cur: value,
                        rlim_max: value,
                    };
                    if libc::setrlimit(resource, &limit) != 0 {
                        return Err(std::io::Error::last_os_error());
                    }
                }
                Ok(())
            });
        }
    }
    let mut child = command
        .spawn()
        .map_err(|_| "CONTAINER_PROBE_START_FAILED")?;
    let began = Instant::now();
    loop {
        if current_time_ms() >= expected.lease.expires_at_ms || began.elapsed() >= timeout {
            #[cfg(unix)]
            unsafe {
                libc::kill(-(child.id() as i32), libc::SIGKILL);
            }
            let _ = child.kill();
            let _ = child.wait();
            return Err("CONTAINER_PROBE_DEADLINE_EXCEEDED".into());
        }
        match child.try_wait() {
            Ok(Some(status)) if status.success() => break,
            Ok(Some(_)) => return Err("CONTAINER_PROBE_MEDIA_INVALID".into()),
            Ok(None) => std::thread::sleep(Duration::from_millis(20)),
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("CONTAINER_PROBE_PROCESS_FAILED".into());
            }
        }
    }
    let mut bytes = Vec::new();
    fs::File::open(&output)
        .and_then(|f| {
            f.take((MAX_RESULT_BYTES + 1) as u64)
                .read_to_end(&mut bytes)
        })
        .map_err(|_| "CONTAINER_PROBE_OUTPUT_FAILED")?;
    if bytes.len() > MAX_RESULT_BYTES {
        return Err("CONTAINER_PROBE_OUTPUT_TOO_LARGE".into());
    }
    let metadata: Value =
        serde_json::from_slice(&bytes).map_err(|_| "CONTAINER_PROBE_OUTPUT_INVALID")?;
    let streams = metadata
        .get("streams")
        .and_then(Value::as_array)
        .ok_or("CONTAINER_PROBE_OUTPUT_INVALID")?;
    if streams.len() > 32 {
        return Err("CONTAINER_PROBE_OUTPUT_INVALID".into());
    }
    let format = metadata
        .get("format")
        .and_then(Value::as_object)
        .ok_or("CONTAINER_PROBE_OUTPUT_INVALID")?;
    let duration = format
        .get("duration")
        .and_then(Value::as_str)
        .and_then(|v| v.parse::<f64>().ok())
        .unwrap_or(0.0);
    if !duration.is_finite() || !(0.0..=86400.0).contains(&duration) {
        return Err("CONTAINER_PROBE_OUTPUT_INVALID".into());
    }
    expected
        .lease
        .validate(current_time_ms(), &expected.lease)?;
    Ok(
        json!({"contractVersion":CONTRACT,"scope":expected,"inputChecksumSha256":checksum,
        "result":{"artifacts":[],"derived":{"format":format,"streams":streams,"durationMs":(duration*1000.0) as u64}}}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    fn scope() -> ProbeScope {
        ProbeScope {
            tenant_id: "test-tenant".into(),
            lease: Lease {
                job_id: "job".into(),
                attempt_id: "attempt".into(),
                lease_id: "opaque-lease-id".into(),
                fencing_version: 1,
                expires_at_ms: current_time_ms() + 60_000,
            },
        }
    }
    fn request(scope: ProbeScope, bytes: &[u8]) -> ProbeRequest {
        ProbeRequest {
            contract_version: CONTRACT.into(),
            scope,
            input: ProbeInput {
                content_base64: STANDARD.encode(bytes),
                checksum_sha256: format!("{:x}", Sha256::digest(bytes)),
                size_bytes: bytes.len(),
            },
        }
    }
    #[test]
    fn rejects_scope_expiry_and_checksum_before_process_creation() {
        let root = tempfile::tempdir().unwrap();
        let expected = scope();
        let mut r = request(expected.clone(), b"not-media");
        r.scope.tenant_id = "foreign".into();
        assert_eq!(
            execute_at(
                r,
                &expected,
                root.path(),
                Path::new("/absent"),
                Duration::from_secs(1)
            )
            .unwrap_err(),
            "CONTAINER_PROBE_SCOPE_MISMATCH"
        );
        let mut r = request(expected.clone(), b"not-media");
        r.scope.lease.fencing_version = 2;
        assert!(execute(r, &expected, root.path())
            .unwrap_err()
            .contains("FENCE_MISMATCH"));
        let mut r = request(expected.clone(), b"not-media");
        r.input.checksum_sha256 = "0".repeat(64);
        assert_eq!(
            execute(r, &expected, root.path()).unwrap_err(),
            "CONTAINER_PROBE_INPUT_CHECKSUM_MISMATCH"
        );
        let mut expired = expected.clone();
        expired.lease.expires_at_ms = 1;
        assert!(execute(
            request(expired.clone(), b"not-media"),
            &expired,
            root.path()
        )
        .unwrap_err()
        .contains("EXPIRED"));
        assert!(!root.path().join("media-probe").exists());
    }
    #[test]
    fn wire_rejects_arbitrary_commands_or_unknown_fields() {
        let s = json!({"contractVersion":CONTRACT,"scope":scope(),"input":{"contentBase64":"eA==","sizeBytes":1,"checksumSha256":"0".repeat(64)},"command":"sh"});
        assert!(serde_json::from_value::<ProbeRequest>(s).is_err());
    }
    #[test]
    #[ignore = "requires an explicitly selected local ffprobe binary"]
    fn actual_ffprobe_reads_local_wav_and_cleans_input_output() {
        let binary = std::env::var("SAH_TEST_FFPROBE")
            .expect("set SAH_TEST_FFPROBE to the actual approved test binary");
        let mut wav = Vec::new();
        wav.extend(b"RIFF");
        wav.extend(16036u32.to_le_bytes());
        wav.extend(b"WAVEfmt ");
        wav.extend(16u32.to_le_bytes());
        wav.extend(1u16.to_le_bytes());
        wav.extend(1u16.to_le_bytes());
        wav.extend(8000u32.to_le_bytes());
        wav.extend(16000u32.to_le_bytes());
        wav.extend(2u16.to_le_bytes());
        wav.extend(16u16.to_le_bytes());
        wav.extend(b"data");
        wav.extend(16000u32.to_le_bytes());
        wav.resize(16044, 0);
        let root = tempfile::tempdir().unwrap();
        let expected = scope();
        let value = execute_at(
            request(expected.clone(), &wav),
            &expected,
            root.path(),
            Path::new(&binary),
            Duration::from_secs(5),
        )
        .unwrap();
        assert_eq!(value["result"]["derived"]["durationMs"], 1000);
        assert_eq!(
            value["result"]["derived"]["streams"][0]["codec_name"],
            "pcm_s16le"
        );
        assert!(value["result"]["derived"]["format"]
            .get("filename")
            .is_none());
        assert!(!root.path().join("media-probe").exists());
    }
    #[cfg(unix)]
    #[test]
    fn kills_a_stuck_process_and_cleans_its_workspace() {
        use std::os::unix::fs::PermissionsExt;
        let root = tempfile::tempdir().unwrap();
        let binary = root.path().join("fixture-ffprobe");
        fs::write(&binary, "#!/bin/sh\nsleep 30\n").unwrap();
        fs::set_permissions(&binary, fs::Permissions::from_mode(0o700)).unwrap();
        let expected = scope();
        let start = Instant::now();
        let result = execute_at(
            request(expected.clone(), b"fixture"),
            &expected,
            root.path(),
            &binary,
            Duration::from_millis(40),
        );
        assert_eq!(result.unwrap_err(), "CONTAINER_PROBE_DEADLINE_EXCEEDED");
        assert!(start.elapsed() < Duration::from_secs(2));
        assert!(!root.path().join("media-probe").exists());
    }
}
