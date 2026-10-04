fn main() {
    println!("cargo:rerun-if-env-changed=SAH_RUNNER_BUILD_DATE");
    let build_date =
        std::env::var("SAH_RUNNER_BUILD_DATE").unwrap_or_else(|_| "local build".into());
    println!("cargo:rustc-env=SAH_RUNNER_BUILD_DATE={build_date}");
    tauri_build::build()
}
