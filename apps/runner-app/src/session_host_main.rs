fn main() {
    #[cfg(target_os = "linux")]
    if let Err(error) = smartaihub_runner::session_host::run_host() {
        eprintln!("session host error: {error}");
        std::process::exit(3);
    }

    #[cfg(not(target_os = "linux"))]
    {
        eprintln!("session host platform unsupported");
        std::process::exit(2);
    }
}
