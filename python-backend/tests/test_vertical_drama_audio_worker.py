"""Tests for Vertical Drama Audio Worker (Feature 175 GPU & Heavy Audio Worker Engine)"""

import os
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.workers.vertical_drama_audio_worker import (
    IsolatedAudioWorkspace,
    build_demucs_cmd,
    build_ffmpeg_ingestion_cmd,
    calculate_cer,
    compute_normalized_peaks,
    evaluate_speech_f0,
    evaluate_worker_device,
    format_ssml_thai_particle_preserved,
)


class TestVerticalDramaAudioWorker(unittest.TestCase):
    def test_evaluate_worker_device_cpu_fallback(self):
        """Asserts that when CUDA is unavailable, device falls back safely to CPU without error."""
        with patch("torch.cuda.is_available", return_value=False):
            device, info = evaluate_worker_device()
            self.assertEqual(device, "cpu")
            self.assertEqual(info["reason"], "cuda_unavailable")

    def test_evaluate_worker_device_vram_guardrail(self):
        """Asserts that if free VRAM < 2.0 GB, Demucs routes to CPU fallback (Spec §9.3.2)."""
        with patch("torch.cuda.is_available", return_value=True):
            # 1.5 GB free, 16 GB total
            with patch("torch.cuda.mem_get_info", return_value=(int(1.5 * 1024**3), 16 * 1024**3)):
                device, info = evaluate_worker_device(min_free_vram_gb=2.0)
                self.assertEqual(device, "cpu")
                self.assertEqual(info["reason"], "vram_insufficient")
                self.assertLess(info["free_vram_gb"], 2.0)

    def test_build_ffmpeg_ingestion_cmd(self):
        """Asserts Constant Frame Rate 25.0 fps and 48kHz SOXR resampling in ingestion command (Spec §9.3.4)."""
        cmd = build_ffmpeg_ingestion_cmd("/tmp/raw_input.mp4", "/tmp/normalized.mp4")
        self.assertIn("-r", cmd)
        self.assertIn("25.0", cmd)
        self.assertIn("-af", cmd)
        idx = cmd.index("-af")
        self.assertIn("aresample=48000:resampler=soxr:precision=28", cmd[idx + 1])
        self.assertIn("-c:a", cmd)
        self.assertIn("pcm_f32le", cmd)

    def test_build_demucs_cmd(self):
        """Asserts Demucs v4 CLI arguments with device routing."""
        gpu_cmd = build_demucs_cmd("/tmp/audio.wav", "/tmp/out", device="cuda")
        self.assertIn("--device", gpu_cmd)
        self.assertIn("cuda", gpu_cmd)
        self.assertIn("--two-stems=vocals", gpu_cmd)

        cpu_cmd = build_demucs_cmd("/tmp/audio.wav", "/tmp/out", device="cpu")
        self.assertIn("cpu", cpu_cmd)

    def test_compute_normalized_peaks(self):
        """Asserts that 100 normalized peak values (0.0 to 1.0) are extracted for UI scrubbing (Spec §7.2)."""
        samples = [0.1 * i for i in range(1000)]
        peaks = compute_normalized_peaks(samples, num_points=100)
        self.assertEqual(len(peaks), 100)
        self.assertTrue(all(0.0 <= p <= 1.0 for p in peaks))

    def test_calculate_cer(self):
        """Asserts Character Error Rate (CER) calculation between expected text and ASR transcript (Spec §7.1.3)."""
        ref = "ส้มอยากให้พี่แกะกล่องอันใหม่ให้น้อง"
        hyp_exact = "ส้มอยากให้พี่แกะกล่องอันใหม่ให้น้อง"
        self.assertEqual(calculate_cer(ref, hyp_exact), 0.0)

        hyp_slight_error = "ส้มอยากให้พี่แกะกล่องอันเก่าให้น้อง"
        cer = calculate_cer(ref, hyp_slight_error)
        self.assertTrue(0.0 < cer < 0.20)

    def test_evaluate_speech_f0(self):
        """Asserts character voice identity drift detection via mean F0 trajectory (Spec §7.1.10)."""
        female_ok = evaluate_speech_f0(210.0, target_gender="female")
        self.assertFalse(female_ok["identity_drift"])
        self.assertEqual(female_ok["action_required"], "NONE")

        female_drifting = evaluate_speech_f0(90.0, target_gender="female")  # Much too low
        self.assertTrue(female_drifting["identity_drift"])
        self.assertEqual(female_drifting["action_required"], "DEMUCS_TTS_REPLACEMENT")

        male_ok = evaluate_speech_f0(120.0, target_gender="male")
        self.assertFalse(male_ok["identity_drift"])

    def test_format_ssml_thai_particle_preserved(self):
        """Asserts Thai particle pitch contour preservation in SSML (Spec §7.2.3)."""
        text = "ส้มอยากได้กล่องนี้ค่ะ"
        ssml = format_ssml_thai_particle_preserved(text)
        self.assertIn('<prosody pitch="+5%">ค่ะ</prosody>', ssml)
        self.assertTrue(ssml.startswith("<speak>"))
        self.assertTrue(ssml.endswith("</speak>"))

    def test_isolated_audio_workspace_lifecycle(self):
        """Asserts that workspace is created and unconditionally wiped after execution (Spec §9.3.3)."""
        temp_dir = tempfile.mkdtemp()
        try:
            workspace_mgr = IsolatedAudioWorkspace(tenant_id="tenant_123", job_id="job_abc", base_scratch=temp_dir)
            with workspace_mgr as ws_path:
                self.assertTrue(ws_path.exists())
                # Create a dummy scratch file inside
                dummy_file = ws_path / "vocals.wav"
                dummy_file.write_bytes(b"RIFF dummy audio data")
                self.assertTrue(dummy_file.exists())

            # Workspace directory should be cleaned up immediately
            self.assertFalse(ws_path.exists())
        finally:
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
