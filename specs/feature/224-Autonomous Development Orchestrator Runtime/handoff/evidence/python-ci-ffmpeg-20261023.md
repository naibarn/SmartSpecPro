# Python CI FFmpeg dependency — 2026-10-23

- Integrated source: `d2e54be0c3` (`fix(ci): install ffmpeg for Python media tests`).
- Root cause from the Python CI run at `fb413da88c302b297e324394e22a29be55d4d6d3`: `tests/test_dead_air_detect.py::test_detects_silent_region_in_audio_asset` failed with `FileNotFoundError: [Errno 2] No such file or directory: 'ffmpeg'`. The Python job did not install FFmpeg, unlike the desktop and local-AI jobs.
- Change: `.github/workflows/ci.yml` now installs the Ubuntu `ffmpeg` package in the Python job before running backend/runtime tests.
- Focused verification: `DEBUG=false PYTHONPATH=. /home/dev/projects/SmartSpecPro/python-backend/.venv/bin/python -m pytest tests/test_dead_air_detect.py -q --no-cov` passed (1 test). `yaml.safe_load(.github/workflows/ci.yml)` and `git diff --check` passed.
- Full Python CI on the integrated fix is pending; this evidence closes only the missing executable root cause. Other CI failures and SPEC-224 runtime/Runner acceptance remain open.
