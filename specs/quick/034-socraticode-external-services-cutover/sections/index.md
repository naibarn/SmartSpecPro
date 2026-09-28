<!-- PROJECT_CONFIG
runtime: bash-node-docker-systemd
test_command: bash ops/socraticode-runtime/tests/test-external-launcher.sh && bash ops/socraticode-runtime/tests/test-cleanup.sh && node --test ops/socraticode-runtime/tests/watch-smartspecpro.test.mjs
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-launcher-tests-and-external-policy
section-02-resource-guard-and-cutover
section-03-live-verification-and-convergence
END_MANIFEST -->

# Section Index

1. `section-01-launcher-tests-and-external-policy.md`
2. `section-02-resource-guard-and-cutover.md`
3. `section-03-live-verification-and-convergence.md`

Execute sections sequentially. Section 02 installs only artifacts proven by
Section 01. Section 03 is blocking before completion.
