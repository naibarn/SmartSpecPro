fn main() {
    println!("cargo:rerun-if-env-changed=SAH_RUNNER_BUILD_DATE");
    let build_date = std::env::var("SAH_RUNNER_BUILD_DATE")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
                .to_string()
        });
    println!("cargo:rustc-env=SAH_RUNNER_BUILD_DATE={build_date}");
    tauri_build::build()
}
