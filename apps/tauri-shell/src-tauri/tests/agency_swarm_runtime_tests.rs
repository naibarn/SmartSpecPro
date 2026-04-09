use smartspec_shell_lib::agency_swarm_runtime::{
    prepare_agency_swarm_runtime, AgencySwarmRuntimeRequest,
};
use smartspec_shell_lib::connector_runtime::{
    authorize_connector_action, ConnectorActionRequest,
};

#[test]
fn prepares_agency_swarm_runtime_with_gateway_only_provider_injection() {
    let plan = prepare_agency_swarm_runtime(AgencySwarmRuntimeRequest {
        package_id: "proposal-orchestrator".into(),
        gateway_base_url: "https://gateway.smartspec.local".into(),
        provider_mode: "gateway_only".into(),
        unmanaged_provider_keys: vec![],
        connector_actions: vec!["read_message".into()],
        capability_manifest: vec!["local_file_search".into()],
        runtime_mode: None,
    })
    .unwrap();

    assert_eq!(plan.runtime_mode, "docker_managed");
    assert_eq!(plan.provider_mode, "gateway_only");
}

#[test]
fn rejects_unmanaged_keys_and_requires_dlp_confirmation_for_sensitive_connector_egress() {
    let invalid_plan = prepare_agency_swarm_runtime(AgencySwarmRuntimeRequest {
        package_id: "proposal-orchestrator".into(),
        gateway_base_url: "https://gateway.smartspec.local".into(),
        provider_mode: "gateway_only".into(),
        unmanaged_provider_keys: vec!["OPENAI_API_KEY".into()],
        connector_actions: vec![],
        capability_manifest: vec![],
        runtime_mode: Some("docker_managed".into()),
    });
    let authorization = authorize_connector_action(ConnectorActionRequest {
        connector_type: "telegram".into(),
        action: "send_message".into(),
        destination_class: "external".into(),
        dlp_sensitivity: "high".into(),
        secret_reference_present: true,
    })
    .unwrap();

    assert!(invalid_plan.is_err());
    assert!(!authorization.allowed);
    assert_eq!(authorization.decision, "confirm");
}
