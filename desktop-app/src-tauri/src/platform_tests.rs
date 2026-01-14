// Platform-Specific Tests Module
//
// RISK-010, RISK-011 FIX: OS-specific testing for keyring and features
//
// Provides:
// - Platform detection
// - Feature availability tests
// - Keyring compatibility tests
// - Performance benchmarks per platform

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ============================================
// Types
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformInfo {
    pub os: String,
    pub os_version: String,
    pub arch: String,
    pub family: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureAvailability {
    pub feature: String,
    pub available: bool,
    pub fallback_available: bool,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformTestResult {
    pub test_name: String,
    pub passed: bool,
    pub duration_ms: u64,
    pub error: Option<String>,
    pub details: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformReport {
    pub platform: PlatformInfo,
    pub features: Vec<FeatureAvailability>,
    pub test_results: Vec<PlatformTestResult>,
    pub overall_status: String,
    pub recommendations: Vec<String>,
}

// ============================================
// Platform Detection
// ============================================

pub fn get_platform_info() -> PlatformInfo {
    PlatformInfo {
        os: std::env::consts::OS.to_string(),
        os_version: get_os_version(),
        arch: std::env::consts::ARCH.to_string(),
        family: std::env::consts::FAMILY.to_string(),
    }
}

fn get_os_version() -> String {
    #[cfg(target_os = "linux")]
    {
        std::fs::read_to_string("/etc/os-release")
            .ok()
            .and_then(|content| {
                content.lines()
                    .find(|line| line.starts_with("PRETTY_NAME="))
                    .map(|line| line.trim_start_matches("PRETTY_NAME=").trim_matches('"').to_string())
            })
            .unwrap_or_else(|| "Linux".to_string())
    }
    
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("sw_vers")
            .arg("-productVersion")
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| format!("macOS {}", s.trim()))
            .unwrap_or_else(|| "macOS".to_string())
    }
    
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/c", "ver"])
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|| "Windows".to_string())
    }
    
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        "Unknown".to_string()
    }
}

// ============================================
// Feature Tests
// ============================================

pub fn test_keyring_availability() -> FeatureAvailability {
    let test_result = test_keyring_operations();
    
    FeatureAvailability {
        feature: "keyring".to_string(),
        available: test_result.passed,
        fallback_available: true, // We have encrypted file fallback
        notes: if test_result.passed {
            "OS keyring is available and working".to_string()
        } else {
            format!("Keyring unavailable: {}. Using encrypted file fallback.", 
                    test_result.error.unwrap_or_default())
        },
    }
}

pub fn test_filesystem_permissions() -> FeatureAvailability {
    let data_dir = dirs::data_local_dir();
    let can_write = data_dir.map(|d| {
        let test_file = d.join("smartspecpro_test_write");
        let result = std::fs::write(&test_file, "test");
        if result.is_ok() {
            let _ = std::fs::remove_file(&test_file);
            true
        } else {
            false
        }
    }).unwrap_or(false);
    
    FeatureAvailability {
        feature: "filesystem".to_string(),
        available: can_write,
        fallback_available: false,
        notes: if can_write {
            "Filesystem write permissions OK".to_string()
        } else {
            "Cannot write to data directory".to_string()
        },
    }
}

pub fn test_network_connectivity() -> FeatureAvailability {
    let can_connect = std::net::TcpStream::connect_timeout(
        &"8.8.8.8:53".parse().unwrap(),
        std::time::Duration::from_secs(5)
    ).is_ok();
    
    FeatureAvailability {
        feature: "network".to_string(),
        available: can_connect,
        fallback_available: false,
        notes: if can_connect {
            "Network connectivity OK".to_string()
        } else {
            "No network connectivity detected".to_string()
        },
    }
}

pub fn test_sqlite_availability() -> FeatureAvailability {
    let result = rusqlite::Connection::open_in_memory();
    
    FeatureAvailability {
        feature: "sqlite".to_string(),
        available: result.is_ok(),
        fallback_available: false,
        notes: if result.is_ok() {
            "SQLite is available".to_string()
        } else {
            "SQLite unavailable".to_string()
        },
    }
}

// ============================================
// Detailed Tests
// ============================================

fn test_keyring_operations() -> PlatformTestResult {
    use std::time::Instant;
    
    let start = Instant::now();
    let test_key = "__smartspec_platform_test__";
    let test_value = "test_value_12345";
    
    let result = (|| -> Result<(), String> {
        let entry = keyring::Entry::new("smartspecpro", test_key)
            .map_err(|e| format!("Failed to create entry: {}", e))?;
        
        // Test set
        entry.set_password(test_value)
            .map_err(|e| format!("Failed to set password: {}", e))?;
        
        // Test get
        let retrieved = entry.get_password()
            .map_err(|e| format!("Failed to get password: {}", e))?;
        
        if retrieved != test_value {
            return Err("Retrieved value doesn't match".to_string());
        }
        
        // Test delete
        entry.delete_password()
            .map_err(|e| format!("Failed to delete password: {}", e))?;
        
        Ok(())
    })();
    
    let duration = start.elapsed();
    
    PlatformTestResult {
        test_name: "keyring_operations".to_string(),
        passed: result.is_ok(),
        duration_ms: duration.as_millis() as u64,
        error: result.err(),
        details: HashMap::new(),
    }
}

fn test_file_encryption() -> PlatformTestResult {
    use aes_gcm::{
        aead::{Aead, KeyInit},
        Aes256Gcm, Nonce,
    };
    use std::time::Instant;
    
    let start = Instant::now();
    
    let result = (|| -> Result<HashMap<String, String>, String> {
        let key = [0u8; 32];
        let cipher = Aes256Gcm::new_from_slice(&key)
            .map_err(|e| format!("Failed to create cipher: {}", e))?;
        
        let nonce = Nonce::from_slice(&[0u8; 12]);
        let plaintext = b"test data for encryption";
        
        let ciphertext = cipher.encrypt(nonce, plaintext.as_ref())
            .map_err(|e| format!("Encryption failed: {}", e))?;
        
        let decrypted = cipher.decrypt(nonce, ciphertext.as_ref())
            .map_err(|e| format!("Decryption failed: {}", e))?;
        
        if decrypted != plaintext {
            return Err("Decrypted data doesn't match".to_string());
        }
        
        let mut details = HashMap::new();
        details.insert("plaintext_size".to_string(), plaintext.len().to_string());
        details.insert("ciphertext_size".to_string(), ciphertext.len().to_string());
        
        Ok(details)
    })();
    
    let duration = start.elapsed();
    
    match result {
        Ok(details) => PlatformTestResult {
            test_name: "file_encryption".to_string(),
            passed: true,
            duration_ms: duration.as_millis() as u64,
            error: None,
            details,
        },
        Err(e) => PlatformTestResult {
            test_name: "file_encryption".to_string(),
            passed: false,
            duration_ms: duration.as_millis() as u64,
            error: Some(e),
            details: HashMap::new(),
        },
    }
}

fn test_sqlite_operations() -> PlatformTestResult {
    use std::time::Instant;
    
    let start = Instant::now();
    
    let result = (|| -> Result<HashMap<String, String>, String> {
        let conn = rusqlite::Connection::open_in_memory()
            .map_err(|e| format!("Failed to open connection: {}", e))?;
        
        // Create table
        conn.execute(
            "CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)",
            [],
        ).map_err(|e| format!("Failed to create table: {}", e))?;
        
        // Insert
        conn.execute(
            "INSERT INTO test (value) VALUES (?1)",
            ["test_value"],
        ).map_err(|e| format!("Failed to insert: {}", e))?;
        
        // Select
        let value: String = conn.query_row(
            "SELECT value FROM test WHERE id = 1",
            [],
            |row| row.get(0),
        ).map_err(|e| format!("Failed to select: {}", e))?;
        
        if value != "test_value" {
            return Err("Selected value doesn't match".to_string());
        }
        
        // Get SQLite version
        let version: String = conn.query_row(
            "SELECT sqlite_version()",
            [],
            |row| row.get(0),
        ).map_err(|e| format!("Failed to get version: {}", e))?;
        
        let mut details = HashMap::new();
        details.insert("sqlite_version".to_string(), version);
        
        Ok(details)
    })();
    
    let duration = start.elapsed();
    
    match result {
        Ok(details) => PlatformTestResult {
            test_name: "sqlite_operations".to_string(),
            passed: true,
            duration_ms: duration.as_millis() as u64,
            error: None,
            details,
        },
        Err(e) => PlatformTestResult {
            test_name: "sqlite_operations".to_string(),
            passed: false,
            duration_ms: duration.as_millis() as u64,
            error: Some(e),
            details: HashMap::new(),
        },
    }
}

fn test_memory_operations() -> PlatformTestResult {
    use std::time::Instant;
    
    let start = Instant::now();
    
    let result = (|| -> Result<HashMap<String, String>, String> {
        // Allocate and deallocate memory
        let mut data: Vec<u8> = Vec::with_capacity(1024 * 1024); // 1MB
        for i in 0..1024 * 1024 {
            data.push((i % 256) as u8);
        }
        
        let sum: u64 = data.iter().map(|&x| x as u64).sum();
        drop(data);
        
        let mut details = HashMap::new();
        details.insert("allocated_mb".to_string(), "1".to_string());
        details.insert("checksum".to_string(), sum.to_string());
        
        Ok(details)
    })();
    
    let duration = start.elapsed();
    
    match result {
        Ok(details) => PlatformTestResult {
            test_name: "memory_operations".to_string(),
            passed: true,
            duration_ms: duration.as_millis() as u64,
            error: None,
            details,
        },
        Err(e) => PlatformTestResult {
            test_name: "memory_operations".to_string(),
            passed: false,
            duration_ms: duration.as_millis() as u64,
            error: Some(e),
            details: HashMap::new(),
        },
    }
}

// ============================================
// Full Platform Test
// ============================================

pub fn run_platform_tests() -> PlatformReport {
    let platform = get_platform_info();
    
    // Run feature availability tests
    let features = vec![
        test_keyring_availability(),
        test_filesystem_permissions(),
        test_network_connectivity(),
        test_sqlite_availability(),
    ];
    
    // Run detailed tests
    let test_results = vec![
        test_keyring_operations(),
        test_file_encryption(),
        test_sqlite_operations(),
        test_memory_operations(),
    ];
    
    // Determine overall status
    let all_passed = test_results.iter().all(|t| t.passed);
    let critical_features_ok = features.iter()
        .filter(|f| f.feature == "filesystem" || f.feature == "sqlite")
        .all(|f| f.available);
    
    let overall_status = if all_passed && critical_features_ok {
        "healthy".to_string()
    } else if critical_features_ok {
        "degraded".to_string()
    } else {
        "critical".to_string()
    };
    
    // Generate recommendations
    let mut recommendations = Vec::new();
    
    for feature in &features {
        if !feature.available && !feature.fallback_available {
            recommendations.push(format!(
                "Critical: {} is unavailable and has no fallback",
                feature.feature
            ));
        } else if !feature.available && feature.fallback_available {
            recommendations.push(format!(
                "Warning: {} is using fallback mode",
                feature.feature
            ));
        }
    }
    
    for test in &test_results {
        if !test.passed {
            recommendations.push(format!(
                "Test '{}' failed: {}",
                test.test_name,
                test.error.as_deref().unwrap_or("unknown error")
            ));
        }
    }
    
    if recommendations.is_empty() {
        recommendations.push("All systems operational".to_string());
    }
    
    PlatformReport {
        platform,
        features,
        test_results,
        overall_status,
        recommendations,
    }
}

// ============================================
// Tauri Commands
// ============================================

#[tauri::command]
pub fn get_platform_report() -> PlatformReport {
    run_platform_tests()
}

#[tauri::command]
pub fn get_platform_info_cmd() -> PlatformInfo {
    get_platform_info()
}

#[tauri::command]
pub fn test_feature(feature: String) -> FeatureAvailability {
    match feature.as_str() {
        "keyring" => test_keyring_availability(),
        "filesystem" => test_filesystem_permissions(),
        "network" => test_network_connectivity(),
        "sqlite" => test_sqlite_availability(),
        _ => FeatureAvailability {
            feature,
            available: false,
            fallback_available: false,
            notes: "Unknown feature".to_string(),
        },
    }
}

// ============================================
// Tests
// ============================================

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_platform_info() {
        let info = get_platform_info();
        assert!(!info.os.is_empty());
        assert!(!info.arch.is_empty());
    }
    
    #[test]
    fn test_full_platform_report() {
        let report = run_platform_tests();
        assert!(!report.features.is_empty());
        assert!(!report.test_results.is_empty());
        assert!(!report.overall_status.is_empty());
    }
}
