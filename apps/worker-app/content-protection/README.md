# Content Protection provider runtime

The Worker App advertises `content-protection-v1` only when an actual provider
command is configured. `videoseal-provider.py` is the command bridge for the
native contract: it watermarks image/video media, re-decodes the output, and
writes only the public `detected`/`confidence` verification envelope.

Install the provider on the machine running the Worker App. Installing it in
the web server is not sufficient. For this repository's Linux development
runtime, run the reproducible setup script from the repository root:

```bash
apps/worker-app/content-protection/setup-local.sh
```

The script pins the VideoSeal source revision, installs the provider-only
packages without replacing the backend's existing Torch runtime, restores the
model config files omitted by the pip package, downloads the checkpoint, and
loads the model before reporting success.

The main Worker App installer does not contain this provider or its model. On
Windows x64, the separate `content-protection:release` workflow creates the
optional `smart-ai-hub-content-protection-runtime-windows-x64-{version}.zip`.
Users install it from the Worker App's Runtime screen. The app verifies the
published archive hash, manifest, PE provider, model, license, and provider
health check before activating it under AppData, then reuses FFmpeg/FFprobe
from the separately managed Worker runtime pack. No Python, API keys,
environment variables, or shell script are required for the production flow.

Install FFmpeg and FFprobe, then configure the Worker App process:

```text
CONTENT_PROTECTION_PROVIDER=videoseal
CONTENT_PROTECTION_WORKER_CAPABILITY=true
CONTENT_PROTECTION_PROVIDER_COMMAND=/absolute/path/to/videoseal-provider.py
```

For local development, start the Tauri Worker App with the complete environment
already wired:

```bash
apps/worker-app/content-protection/run-worker-local.sh
```

The provider command used by that launcher is
`apps/worker-app/content-protection/videoseal-provider.sh`, which combines the
backend Torch environment with the provider environment. Do not enable the
capability in another Worker process unless its provider command passes the
same model-load and media smoke test.

The launcher is only for local development. A packaged Worker App uses only an
explicit operator override or the validated AppData runtime installed from the
optional ZIP. It never discovers a provider from the main Tauri resource set.

For an intentional local Windows override, point
`CONTENT_PROTECTION_PROVIDER_COMMAND` to `videoseal-provider.cmd` and
optionally set `CONTENT_PROTECTION_PYTHON` to the virtual-environment Python
executable. Restart the Worker App after changing these values. Its heartbeat
advertises `content-protection-v1` only after the provider, model, and media
tool checks pass.

The first run downloads the model checkpoint through the provider loader. Keep
the model cache on persistent disk and warm it with a test job before enabling
the capability in production. Audio jobs require a separate AudioSeal command;
do not point audio jobs at this video-only bridge.
