use smartspec_shell_lib::package_materializer::{
    materialize_package, MaterializePackageRequest, RuntimeDestination,
};
use smartspec_shell_lib::pi_runtime::{prepare_pi_runtime_session, PiRuntimeSessionRequest};
use smartspec_shell_lib::policy_bridge::{validate_policy_bridge, PolicyBridgeRequest};

#[test]
fn prepares_managed_pi_runtime_sessions_with_sidecar_rpc_and_gateway_only_provider() {
    let session = prepare_pi_runtime_session(PiRuntimeSessionRequest {
        package_id: "storyboard-writer".into(),
        gateway_base_url: "https://gateway.smartspec.local".into(),
        provider_mode: "gateway_only".into(),
        sidecar_command: Some("pi-sidecar --serve".into()),
        unmanaged_provider_keys: vec![],
        tool_names: vec!["local_file_search".into(), "server_api_access".into()],
    })
    .unwrap();

    assert_eq!(session.boundary, "sidecar_rpc");
    assert_eq!(session.provider_mode, "gateway_only");
}

#[test]
fn rejects_unmanaged_provider_keys_for_managed_pi_runtime() {
    let result = prepare_pi_runtime_session(PiRuntimeSessionRequest {
        package_id: "storyboard-writer".into(),
        gateway_base_url: "https://gateway.smartspec.local".into(),
        provider_mode: "gateway_only".into(),
        sidecar_command: Some("pi-sidecar --serve".into()),
        unmanaged_provider_keys: vec!["OPENAI_API_KEY".into()],
        tool_names: vec![],
    });

    assert!(result.is_err());
}

#[test]
fn validates_http_first_policy_bridge_and_fail_closed_package_materialization() {
    let validation = validate_policy_bridge(PolicyBridgeRequest {
        policy_version: "policy-v1".into(),
        gateway_base_url: "https://gateway.smartspec.local".into(),
        provider_mode: "gateway_only".into(),
        preferred_transport: "http".into(),
        mcp_fallback_allowed: true,
        policy_expired: false,
    })
    .unwrap();
    let materialized = materialize_package(MaterializePackageRequest {
        package_id: "storyboard-writer".into(),
        version: "1.0.0".into(),
        runtime_destination: RuntimeDestination::Pi,
        local_bundle_path: "/tmp/storyboard-writer".into(),
        signature: "a".repeat(64),
        capability_manifest_digest: "b".repeat(64),
        payload_digest: "c".repeat(64),
        compatible: true,
        revoked: false,
        trust_class: "org_verified".into(),
    })
    .unwrap();

    assert!(validation.accepted);
    assert_eq!(validation.reason, "http_first_mcp_second");
    assert!(materialized.materialized_entry_path.ends_with("/pi"));
}
