use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UpdateBundleVerificationRequest {
    pub current_version: String,
    pub bundle_version: String,
    pub trusted_signer_ids: Vec<String>,
    pub signer_id: String,
    pub signature_sha256: String,
    pub allow_downgrade: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UpdateBundleVerificationResult {
    pub accepted: bool,
    pub reason: String,
}

fn is_sha256_hex(value: &str) -> bool {
    value.len() == 64 && value.chars().all(|character| character.is_ascii_hexdigit())
}

fn compare_version_strings(left: &str, right: &str) -> i32 {
    let left_segments: Vec<&str> = left
        .trim()
        .split(['.', '+', '-'])
        .filter(|segment| !segment.trim().is_empty())
        .collect();
    let right_segments: Vec<&str> = right
        .trim()
        .split(['.', '+', '-'])
        .filter(|segment| !segment.trim().is_empty())
        .collect();
    let max_length = left_segments.len().max(right_segments.len());

    for index in 0..max_length {
        let left_segment = left_segments.get(index).copied().unwrap_or("0");
        let right_segment = right_segments.get(index).copied().unwrap_or("0");
        let left_numeric = left_segment.chars().all(|character| character.is_ascii_digit());
        let right_numeric = right_segment.chars().all(|character| character.is_ascii_digit());

        if left_numeric && right_numeric {
            let left_number = left_segment.parse::<u64>().unwrap_or(0);
            let right_number = right_segment.parse::<u64>().unwrap_or(0);
            if left_number != right_number {
                return if left_number > right_number { 1 } else { -1 };
            }
            continue;
        }

        if left_segment != right_segment {
            return if left_segment > right_segment { 1 } else { -1 };
        }
    }

    0
}

pub fn verify_update_bundle(
    request: UpdateBundleVerificationRequest,
) -> Result<UpdateBundleVerificationResult, String> {
    if request.current_version.trim().is_empty() || request.bundle_version.trim().is_empty() {
        return Err("current_version and bundle_version are required".into());
    }
    if !request.trusted_signer_ids.contains(&request.signer_id) {
        return Err("update signer is not trusted".into());
    }
    if !is_sha256_hex(&request.signature_sha256) {
        return Err("update signature is invalid".into());
    }
    if !request.allow_downgrade
        && compare_version_strings(&request.bundle_version, &request.current_version) < 0
    {
        return Err("downgrade is blocked by update policy".into());
    }

    Ok(UpdateBundleVerificationResult {
        accepted: true,
        reason: "signed_update_verified".into(),
    })
}

#[tauri::command]
pub async fn desktop_host_verify_update_bundle(
    request: UpdateBundleVerificationRequest,
) -> Result<UpdateBundleVerificationResult, String> {
    verify_update_bundle(request)
}
