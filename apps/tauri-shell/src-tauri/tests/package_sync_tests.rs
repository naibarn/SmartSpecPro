use smartspec_shell_lib::package_materializer::RuntimeDestination;
use smartspec_shell_lib::package_sync::{prepare_package_sync, PackageSyncRequest};

#[test]
fn prepares_signed_package_sync_and_materialization_plans() {
    let plan = prepare_package_sync(PackageSyncRequest {
        tenant_id: "tenant-1".into(),
        package_id: "storyboard-writer".into(),
        version: "1.0.0".into(),
        runtime_destination: RuntimeDestination::Pi,
        cache_root_dir: "/tmp/desktop-packages".into(),
        signature: "a".repeat(64),
        capability_manifest_digest: "b".repeat(64),
        payload_digest: "c".repeat(64),
        trust_class: "org_verified".into(),
        package_state: "trusted".into(),
        compatible: true,
        revoked: false,
        revocation_checked_at: "2026-04-09T10:00:00.000Z".into(),
    })
    .unwrap();

    assert!(plan.cache_bundle_path.ends_with("/storyboard-writer/1.0.0"));
    assert!(plan.envelope_path.ends_with("/desktop-package.json"));
    assert!(plan.materialized_package.materialized_entry_path.ends_with("/pi"));
  }

#[test]
fn rejects_unverified_or_blocked_packages_before_sync() {
    let unverified = prepare_package_sync(PackageSyncRequest {
        tenant_id: "tenant-1".into(),
        package_id: "storyboard-writer".into(),
        version: "1.0.0".into(),
        runtime_destination: RuntimeDestination::Pi,
        cache_root_dir: "/tmp/desktop-packages".into(),
        signature: "a".repeat(64),
        capability_manifest_digest: "b".repeat(64),
        payload_digest: "c".repeat(64),
        trust_class: "local_unverified".into(),
        package_state: "trusted".into(),
        compatible: true,
        revoked: false,
        revocation_checked_at: "2026-04-09T10:00:00.000Z".into(),
    });
    let blocked = prepare_package_sync(PackageSyncRequest {
        tenant_id: "tenant-1".into(),
        package_id: "storyboard-writer".into(),
        version: "1.0.0".into(),
        runtime_destination: RuntimeDestination::Pi,
        cache_root_dir: "/tmp/desktop-packages".into(),
        signature: "a".repeat(64),
        capability_manifest_digest: "b".repeat(64),
        payload_digest: "c".repeat(64),
        trust_class: "org_verified".into(),
        package_state: "blocked".into(),
        compatible: true,
        revoked: false,
        revocation_checked_at: "2026-04-09T10:00:00.000Z".into(),
    });

    assert!(unverified.is_err());
    assert!(blocked.is_err());
}
