# Research notes

- Production Worker App 0.1.131 is online and Hermes-advertised.
- Authorization jobs reach `job.running` then fail in about two seconds before
  any device-code event with `HERMES_PROCESS_FAILED`.
- `base_hermes_spawn_env()` clears the parent environment and omits Windows
  home/app-data variables.
- Hermes 0.18.2 computes its Windows default root from `LOCALAPPDATA`, falling
  back to `Path.home()`, even when resolving profile/global auth stores.
- The current diagnostic masks an entire exception line to four characters,
  producing `process_failed: Trac…`.
- `HermesConnectPanel` maps every visible row directly and the admin panel maps
  the tenant-wide admin list without filtering to central scope.
- Astryx recommends a controlled Collapsible disclosure and count-style
  pagination for compact history.
- SocratiCode discovery was attempted first and failed with `Transport closed`;
  targeted shell and production DB reads were used as fallback.

