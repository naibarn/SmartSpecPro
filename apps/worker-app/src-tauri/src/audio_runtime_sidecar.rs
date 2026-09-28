use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::Duration;

pub const DEFAULT_RUNTIME_PORT: u16 = 8199;
pub const DEFAULT_RUNTIME_URL: &str = "http://127.0.0.1:8199";
pub const EXPECTED_MODEL_NAME: &str = "MiniMaxAI/MiniMax-Music3";

fn runtime_token() -> Result<String, String> {
    std::env::var("MINIMAX_AUDIO_RUNTIME_TOKEN")
        .map(|token| token.trim().to_string())
        .ok()
        .filter(|token| !token.is_empty())
        .ok_or_else(|| "MODEL_NOT_INSTALLED: runtime session secret is not configured".into())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioRuntimeStatus {
    pub ready: bool,
    pub service: String,
    pub version: String,
    pub url: String,
    pub device: String,
    pub vram_total_gb: f32,
    pub vram_free_gb: f32,
    pub active_jobs: usize,
    pub model_name: String,
    pub model_revision: String,
    pub capability: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicCueGenerateRequest {
    pub cue_id: String,
    pub model_instruction: String,
    pub plan_hash: String,
    pub skill_execution_id: String,
    pub rights_policy_hash: String,
    pub rights_status: String,
    pub duration_seconds: f32,
    pub intensity: f32,
    pub fade_in_ms: Option<u32>,
    pub fade_out_ms: Option<u32>,
    pub target_lufs: Option<f32>,
    pub workspace_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicCueGenerateResult {
    pub job_id: String,
    pub cue_id: String,
    pub status: String,
    pub output_wav_path: String,
    pub output_duration_seconds: f32,
    pub sample_rate: u32,
    pub channels: u32,
    pub measured_lufs: f32,
    pub true_peak_db: f32,
    pub generation_time_seconds: f32,
    pub model_name: String,
    pub model_revision: String,
    pub output_sha256: String,
}

fn unavailable(message: impl Into<String>) -> AudioRuntimeStatus {
    AudioRuntimeStatus {
        ready: false,
        service: "minimax_music3_runtime".into(),
        version: "unknown".into(),
        url: DEFAULT_RUNTIME_URL.into(),
        device: "Unavailable".into(),
        vram_total_gb: 0.0,
        vram_free_gb: 0.0,
        active_jobs: 0,
        model_name: EXPECTED_MODEL_NAME.into(),
        model_revision: String::new(),
        capability: String::new(),
        message: message.into(),
    }
}

/// A 200 response is not sufficient: the sidecar must explicitly attest to
/// the genuine model identity, pinned revision and production capability.
pub async fn probe_audio_runtime_status() -> AudioRuntimeStatus {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_millis(800))
        .build()
    {
        Ok(client) => client,
        Err(error) => return unavailable(format!("runtime_client_failed: {error}")),
    };

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct HealthResp {
        ready: Option<bool>,
        service: Option<String>,
        version: Option<String>,
        model_name: Option<String>,
        model_revision: Option<String>,
        capability: Option<String>,
        gpu: Option<GpuInfo>,
        active_jobs: Option<usize>,
        message: Option<String>,
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct GpuInfo {
        device: Option<String>,
        vram_total_gb: Option<f32>,
        vram_free_gb: Option<f32>,
    }

    let response = match client
        .get(format!("{DEFAULT_RUNTIME_URL}/healthz"))
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => return unavailable(format!("runtime_unreachable: {error}")),
    };
    let data = match response.json::<HealthResp>().await {
        Ok(data) => data,
        Err(error) => return unavailable(format!("runtime_health_invalid: {error}")),
    };
    let model_name = data.model_name.unwrap_or_default();
    let model_revision = data.model_revision.unwrap_or_default();
    let capability = data.capability.unwrap_or_default();
    if data.ready != Some(true)
        || model_name != EXPECTED_MODEL_NAME
        || model_revision.trim().is_empty()
        || capability != "genuine_minimax_music3"
    {
        return unavailable(
            data.message
                .unwrap_or_else(|| "genuine Music 3 capability is unavailable".into()),
        );
    }

    let gpu = data.gpu.unwrap_or(GpuInfo {
        device: None,
        vram_total_gb: None,
        vram_free_gb: None,
    });
    AudioRuntimeStatus {
        ready: true,
        service: data
            .service
            .unwrap_or_else(|| "minimax_music3_runtime".into()),
        version: data.version.unwrap_or_else(|| "unknown".into()),
        url: DEFAULT_RUNTIME_URL.into(),
        device: gpu.device.unwrap_or_else(|| "CUDA".into()),
        vram_total_gb: gpu.vram_total_gb.unwrap_or(0.0),
        vram_free_gb: gpu.vram_free_gb.unwrap_or(0.0),
        active_jobs: data.active_jobs.unwrap_or(0),
        model_name,
        model_revision,
        capability,
        message: "Genuine MiniMax Music 3 runtime is online".into(),
    }
}

/// Submit to the verified runtime and only return after its measured artifact
/// and provenance are complete. Caller-controlled output directories are never
/// forwarded to the sidecar.
pub async fn execute_music_cue_generation(
    req: MusicCueGenerateRequest,
    _work_dir: std::path::PathBuf,
) -> Result<MusicCueGenerateResult, String> {
    if req.model_instruction.trim().is_empty()
        || req.plan_hash.trim().is_empty()
        || req.skill_execution_id.trim().is_empty()
        || req.rights_policy_hash.trim().is_empty()
        || req.rights_status != "approved_for_project"
    {
        return Err("SKILL_UNAVAILABLE: empty model instruction".into());
    }
    if req.duration_seconds <= 0.0 || !req.duration_seconds.is_finite() {
        return Err("GENERATION_FAILED: invalid cue duration".into());
    }
    let runtime_token = runtime_token()?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("runtime_client_failed: {e}"))?;
    let sidecar_req = serde_json::json!({
        "cueId": req.cue_id,
        "modelInstruction": req.model_instruction,
        "planHash": req.plan_hash,
        "skillExecutionId": req.skill_execution_id,
        "rightsPolicyHash": req.rights_policy_hash,
        "rightsStatus": req.rights_status,
        "durationSeconds": req.duration_seconds,
        "intensity": req.intensity,
        "fadeInMs": req.fade_in_ms.unwrap_or(1000),
        "fadeOutMs": req.fade_out_ms.unwrap_or(2000),
        "targetLufs": req.target_lufs.unwrap_or(-16.0),
    });

    let response = client
        .post(format!("{DEFAULT_RUNTIME_URL}/v1/jobs"))
        .header("Authorization", format!("Bearer {runtime_token}"))
        .json(&sidecar_req)
        .send()
        .await
        .map_err(|e| format!("MODEL_NOT_INSTALLED: runtime connection failed: {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "GENERATION_FAILED: runtime returned {}",
            response.status()
        ));
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct JobCreated {
        job_id: String,
    }
    let created = response
        .json::<JobCreated>()
        .await
        .map_err(|e| format!("GENERATION_OUTCOME_UNKNOWN: invalid job response: {e}"))?;
    let poll_client = client.clone();
    let poll_url = format!("{DEFAULT_RUNTIME_URL}/v1/jobs/{}", created.job_id);

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Metrics {
        sample_rate: Option<u32>,
        channels: Option<u32>,
        measured_lufs: Option<f32>,
        true_peak_db: Option<f32>,
        generation_time_seconds: Option<f32>,
        model_name: Option<String>,
        model_revision: Option<String>,
        output_sha256: Option<String>,
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct PollResult {
        status: String,
        cue_id: Option<String>,
        output_wav_path: Option<String>,
        output_duration_seconds: Option<f32>,
        metrics: Option<Metrics>,
        error: Option<String>,
    }

    for _ in 0..600 {
        tokio::time::sleep(Duration::from_millis(500)).await;
        let response = match poll_client
            .get(&poll_url)
            .header("Authorization", format!("Bearer {runtime_token}"))
            .send()
            .await
        {
            Ok(response) => response,
            Err(_) => continue,
        };
        let polled = match response.json::<PollResult>().await {
            Ok(polled) => polled,
            Err(_) => continue,
        };
        if polled.status == "failed" || polled.status == "cancelled" {
            return Err(format!(
                "GENERATION_FAILED: {}",
                polled.error.unwrap_or(polled.status)
            ));
        }
        if polled.status != "completed" {
            continue;
        }

        let metrics = polled
            .metrics
            .ok_or_else(|| "GENERATION_OUTCOME_UNKNOWN: missing measured metrics".to_string())?;
        let output_path = polled
            .output_wav_path
            .ok_or_else(|| "GENERATION_OUTCOME_UNKNOWN: missing output artifact".to_string())?;
        let model_name = metrics
            .model_name
            .ok_or_else(|| "MODEL_IDENTITY_MISMATCH: missing model identity".to_string())?;
        let model_revision = metrics
            .model_revision
            .ok_or_else(|| "MODEL_IDENTITY_MISMATCH: missing model revision".to_string())?;
        let output_sha256 = metrics
            .output_sha256
            .ok_or_else(|| "GENERATION_OUTCOME_UNKNOWN: missing output hash".to_string())?;
        if model_name != EXPECTED_MODEL_NAME
            || model_revision.trim().is_empty()
            || output_sha256.trim().is_empty()
        {
            return Err(
                "MODEL_IDENTITY_MISMATCH: runtime provenance is not genuine Music 3".into(),
            );
        }
        let path = Path::new(&output_path);
        if !path.is_file() || path.extension().and_then(|ext| ext.to_str()) != Some("wav") {
            return Err(
                "GENERATION_OUTCOME_UNKNOWN: output artifact is not a local WAV file".into(),
            );
        }
        let measured_lufs = metrics
            .measured_lufs
            .ok_or_else(|| "GENERATION_OUTCOME_UNKNOWN: missing LUFS measurement".to_string())?;
        let true_peak_db = metrics.true_peak_db.ok_or_else(|| {
            "GENERATION_OUTCOME_UNKNOWN: missing true peak measurement".to_string()
        })?;
        if !measured_lufs.is_finite() || !true_peak_db.is_finite() {
            return Err("GENERATION_OUTCOME_UNKNOWN: non-finite measurement".into());
        }
        if metrics.sample_rate != Some(32000)
            || metrics.channels != Some(2)
            || polled.output_duration_seconds.unwrap_or(0.0) <= 0.0
        {
            return Err(
                "GENERATION_OUTCOME_UNKNOWN: runtime output format or duration is not verified"
                    .into(),
            );
        }
        let actual_sha256 = crate::runtime_manifest::file_sha256(path)
            .map_err(|error| format!("GENERATION_OUTCOME_UNKNOWN: output hash failed: {error}"))?;
        if actual_sha256 != output_sha256 {
            return Err("GENERATION_OUTCOME_UNKNOWN: output checksum mismatch".into());
        }
        return Ok(MusicCueGenerateResult {
            job_id: created.job_id,
            cue_id: polled.cue_id.unwrap_or_default(),
            status: "completed".into(),
            output_wav_path: output_path,
            output_duration_seconds: polled.output_duration_seconds.unwrap_or(0.0),
            sample_rate: metrics.sample_rate.unwrap_or(0),
            channels: metrics.channels.unwrap_or(0),
            measured_lufs,
            true_peak_db,
            generation_time_seconds: metrics.generation_time_seconds.unwrap_or(0.0),
            model_name,
            model_revision,
            output_sha256,
        });
    }
    Err("GENERATION_OUTCOME_UNKNOWN: runtime deadline exceeded".into())
}

/// Request cooperative cancellation in the managed runtime. The adapter may
/// still finish its upstream call, but the sidecar ledger will not publish an
/// artifact after this state transition.
pub async fn cancel_music_cue_generation(job_id: &str) -> Result<(), String> {
    if job_id.trim().is_empty() {
        return Err("GENERATION_FAILED: missing runtime job id".into());
    }
    let runtime_token = runtime_token()?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| format!("runtime_client_failed: {e}"))?;
    let response = client
        .post(format!("{DEFAULT_RUNTIME_URL}/v1/jobs/{job_id}/cancel"))
        .header("Authorization", format!("Bearer {runtime_token}"))
        .send()
        .await
        .map_err(|e| format!("GENERATION_OUTCOME_UNKNOWN: runtime cancellation failed: {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "GENERATION_OUTCOME_UNKNOWN: runtime cancellation returned {}",
            response.status()
        ));
    }
    Ok(())
}
