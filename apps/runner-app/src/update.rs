use base64::{engine::general_purpose::STANDARD, Engine as _};
use rsa::pkcs1::DecodeRsaPublicKey;
use rsa::pkcs1v15::{Signature, VerifyingKey};
use rsa::pkcs8::DecodePublicKey;
use rsa::signature::Verifier;
use rsa::RsaPublicKey;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_UPDATE_BYTES: u64 = 750 * 1024 * 1024;

pub fn verify_sha256(path: &Path, expected: &str) -> Result<(), String> {
    let expected = expected.trim().to_ascii_lowercase();
    if !matches!(expected.len(), 64) || !expected.chars().all(|value| value.is_ascii_hexdigit()) {
        return Err("RUNNER_UPDATE_HASH_INVALID".into());
    }
    let metadata = fs::metadata(path).map_err(|_| "RUNNER_UPDATE_FILE_MISSING")?;
    if !metadata.is_file() || metadata.len() > MAX_UPDATE_BYTES {
        return Err("RUNNER_UPDATE_FILE_INVALID".into());
    }
    let bytes = fs::read(path).map_err(|_| "RUNNER_UPDATE_FILE_READ_FAILED")?;
    let actual = hex_digest(&bytes);
    if actual != expected {
        return Err("RUNNER_UPDATE_HASH_MISMATCH".into());
    }
    Ok(())
}

pub fn verify_signature(bytes: &[u8], signature: &str, public_key: &str) -> Result<(), String> {
    if signature.trim().is_empty() || public_key.trim().is_empty() {
        return Err("RUNNER_UPDATE_SIGNATURE_REQUIRED".into());
    }
    let public_key = public_key.replace("\\n", "\n");
    let key = RsaPublicKey::from_public_key_pem(&public_key)
        .or_else(|_| RsaPublicKey::from_pkcs1_pem(&public_key))
        .map_err(|_| "RUNNER_UPDATE_PUBLIC_KEY_INVALID")?;
    let decoded = STANDARD
        .decode(signature.trim())
        .map_err(|_| "RUNNER_UPDATE_SIGNATURE_INVALID")?;
    let signature =
        Signature::try_from(decoded.as_slice()).map_err(|_| "RUNNER_UPDATE_SIGNATURE_INVALID")?;
    let verifier = VerifyingKey::<Sha256>::new(key);
    verifier
        .verify(bytes, &signature)
        .map_err(|_| "RUNNER_UPDATE_SIGNATURE_MISMATCH".into())
}

pub fn validate_target_path(path: &Path, expected_file_name: &str) -> Result<(), String> {
    if expected_file_name.trim().is_empty()
        || expected_file_name.contains('/')
        || expected_file_name.contains('\\')
        || expected_file_name == "."
        || expected_file_name == ".."
    {
        return Err("RUNNER_UPDATE_TARGET_INVALID".into());
    }
    if path.file_name().and_then(|value| value.to_str()) != Some(expected_file_name) {
        return Err("RUNNER_UPDATE_TARGET_INVALID".into());
    }
    if path
        .components()
        .any(|component| component == Component::ParentDir)
    {
        return Err("RUNNER_UPDATE_TARGET_INVALID".into());
    }
    if path.parent().is_none() || path.is_relative() {
        return Err("RUNNER_UPDATE_TARGET_INVALID".into());
    }
    Ok(())
}

pub fn backup_path(current: &Path) -> PathBuf {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let name = current
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("smartaihub-runner");
    current.with_file_name(format!(".{name}.sah-backup-{stamp}"))
}

pub fn atomic_replace(current: &Path, downloaded: &Path) -> Result<PathBuf, String> {
    let parent = current
        .parent()
        .ok_or_else(|| "RUNNER_UPDATE_TARGET_INVALID".to_string())?;
    if downloaded.parent() != Some(parent) {
        return Err("RUNNER_UPDATE_DOWNLOAD_NOT_SIBLING".into());
    }
    let backup = backup_path(current);
    if current.exists() {
        fs::rename(current, &backup).map_err(|_| "RUNNER_UPDATE_BACKUP_FAILED")?;
    }
    if let Err(error) = fs::rename(downloaded, current) {
        if backup.exists() {
            let _ = fs::rename(&backup, current);
        }
        return Err(format!("RUNNER_UPDATE_REPLACE_FAILED:{error}"));
    }
    Ok(backup)
}

pub fn rollback(current: &Path, backup: &Path) -> Result<(), String> {
    if current.exists() {
        fs::remove_file(current).map_err(|_| "RUNNER_UPDATE_ROLLBACK_REMOVE_FAILED")?;
    }
    fs::rename(backup, current).map_err(|_| "RUNNER_UPDATE_ROLLBACK_FAILED".to_string())
}

pub fn apply_verified_update(
    current: &Path,
    downloaded: &Path,
    expected_sha256: &str,
    signature: Option<&str>,
    public_key: Option<&str>,
) -> Result<PathBuf, String> {
    validate_target_path(
        current,
        current
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default(),
    )?;
    if downloaded.parent() != current.parent() {
        return Err("RUNNER_UPDATE_DOWNLOAD_NOT_SIBLING".into());
    }
    verify_sha256(downloaded, expected_sha256)?;
    let bytes = fs::read(downloaded).map_err(|_| "RUNNER_UPDATE_FILE_READ_FAILED")?;
    match (signature, public_key) {
        (Some(signature), Some(public_key)) => verify_signature(&bytes, signature, public_key)?,
        _ => return Err("RUNNER_UPDATE_SIGNATURE_REQUIRED".into()),
    }
    let backup = atomic_replace(current, downloaded)?;
    set_executable_mode(current)?;
    Ok(backup)
}

fn set_executable_mode(path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = fs::metadata(path)
            .map_err(|_| "RUNNER_UPDATE_PERMISSION_READ_FAILED")?
            .permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(path, permissions)
            .map_err(|_| "RUNNER_UPDATE_PERMISSION_WRITE_FAILED")?;
    }
    Ok(())
}

fn hex_digest(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|value| format!("{value:02x}"))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use rsa::pkcs1v15::SigningKey;
    use rsa::pkcs8::EncodePublicKey;
    use rsa::signature::{SignatureEncoding, Signer};
    use rsa::RsaPrivateKey;
    use tempfile::tempdir;

    #[test]
    fn verifies_hash_and_rejects_mismatch() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("runner");
        fs::write(&path, b"runner-update").unwrap();
        let hash = hex_digest(b"runner-update");
        assert!(verify_sha256(&path, &hash).is_ok());
        assert_eq!(
            verify_sha256(&path, &hex_digest(b"other")).unwrap_err(),
            "RUNNER_UPDATE_HASH_MISMATCH"
        );
    }

    #[test]
    fn verifies_signature_and_rejects_traversal() {
        let mut rng = rsa::rand_core::OsRng;
        let private = RsaPrivateKey::new(&mut rng, 2048).unwrap();
        let public = private
            .to_public_key()
            .to_public_key_pem(Default::default())
            .unwrap();
        let signing = SigningKey::<Sha256>::new(private);
        let payload = b"runner-update";
        let signature = signing.sign(payload).to_bytes();
        assert!(verify_signature(payload, &STANDARD.encode(signature), &public).is_ok());
        assert!(validate_target_path(Path::new("/tmp/../runner"), "runner").is_err());
        assert!(validate_target_path(Path::new("/tmp/runner"), "../runner").is_err());
    }

    #[test]
    fn replaces_atomically_and_can_rollback() {
        let directory = tempdir().unwrap();
        let current = directory.path().join("runner");
        let downloaded = directory.path().join(".runner.download");
        fs::write(&current, b"old").unwrap();
        fs::write(&downloaded, b"new").unwrap();
        let backup = atomic_replace(&current, &downloaded).unwrap();
        assert_eq!(fs::read(&current).unwrap(), b"new");
        rollback(&current, &backup).unwrap();
        assert_eq!(fs::read(&current).unwrap(), b"old");
    }
}
