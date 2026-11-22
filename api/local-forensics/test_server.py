import base64
import io
import hashlib
import tempfile
from pathlib import Path
import time
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import numpy as np
from PIL import Image
from server import AUDIO_SAMPLES, DeadlineReader, Engine, audio_windows, preprocess_image, verify_file


class TextIntegrityTests(unittest.TestCase):
    def test_config_accepts_only_the_pinned_content_across_line_endings(self):
        original = Path(__file__).with_name('AASIST.conf').read_bytes().replace(b'\r\n', b'\n')
        expected = '8b6cfe6a9a4a448dc3082e5e10b0a46c478237908ad6a0c886a37a3a8ffe82e3'
        self.assertEqual(hashlib.sha256(original).hexdigest(), expected)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'config'
            path.write_bytes(original.replace(b'\n', b'\r\n'))
            verify_file(path, expected, normalize_text=True)
            path.write_bytes(original.replace(b'64600', b'64601'))
            with self.assertRaises(ValueError):
                verify_file(path, expected, normalize_text=True)


class ForensicsTests(unittest.TestCase):
    def test_body_and_header_read_budget_is_absolute_even_when_data_keeps_arriving(self):
        connection = Mock()
        connection.recv_into.return_value = 1
        reader = DeadlineReader(connection, 5)
        with patch("server.time.monotonic", side_effect=[4, 5.01]):
            self.assertEqual(reader.readinto(bytearray(1)), 1)
            connection.settimeout.assert_called_once_with(1)
            with self.assertRaises(TimeoutError):
                reader.readinto(bytearray(1))

    def test_image_preprocessing_matches_reference_normalisation(self):
        output = io.BytesIO()
        Image.new("RGB", (800, 400), (255, 0, 0)).save(output, format="PNG")
        tensor = preprocess_image(output.getvalue())
        self.assertEqual(tensor.shape, (1, 3, 384, 384))
        np.testing.assert_allclose(tensor[0, :, 20, 30], [(1 - .485) / .229, -.456 / .224, -.406 / .225], rtol=1e-6)
        self.assertEqual(tensor.dtype, np.float32)

    def test_audio_windows_cover_start_and_end_with_a_fixed_upper_bound(self):
        pcm = np.full(180 * 16000, 1000, dtype="<i2").tobytes()
        windows, skipped = audio_windows(pcm)
        self.assertEqual(len(windows), 12)
        self.assertEqual(skipped, 0)
        self.assertEqual(windows[0][0], 0)
        self.assertAlmostEqual(windows[-1][0], 180 - AUDIO_SAMPLES / 16000)
        self.assertTrue(all(len(clip) == AUDIO_SAMPLES for _, clip, _ in windows))

    def test_silence_is_not_classified_as_synthetic_speech(self):
        windows, skipped = audio_windows(bytes(16000 * 2))
        self.assertEqual(windows, [])
        self.assertEqual(skipped, 1)
        self.assertEqual(audio_windows(b""), ([], 0))

    def test_short_audio_is_repeated_like_upstream_and_invalid_sizes_rejected(self):
        samples = np.full(16000, 2000, dtype="<i2")
        windows, _ = audio_windows(samples.tobytes())
        np.testing.assert_allclose(windows[0][1], np.full(AUDIO_SAMPLES, 2000 / 32768))
        for pcm in [b"x", bytes(180 * 16000 * 2 + 2)]:
            with self.assertRaises(ValueError):
                audio_windows(pcm)

    def test_invalid_model_hash_prevents_loading(self):
        with self.assertRaises(ValueError):
            verify_file(__file__, "0" * 64)

    def test_extreme_aspect_ratio_is_rejected_before_resize_allocation(self):
        output = io.BytesIO()
        Image.new("RGB", (10000, 1)).save(output, format="PNG")
        with self.assertRaises(ValueError):
            preprocess_image(output.getvalue())

    def test_odd_dimension_centre_crop_uses_reference_rounding(self):
        pixels = np.zeros((440, 447, 3), dtype=np.uint8)
        pixels[:, 32, 0] = 255
        output = io.BytesIO()
        Image.fromarray(pixels).save(output, format="PNG")
        tensor = preprocess_image(output.getvalue())
        self.assertAlmostEqual(float(tensor[0, 0, 0, 0]), (1 - .485) / .229, places=5)

    def test_expired_budget_prevents_starting_native_inference(self):
        engine = Engine.__new__(Engine)
        with self.assertRaises(TimeoutError):
            engine.analyze({"frames": [{"timestampSeconds": 0, "dataBase64": ""}], "audioPcm16Base64": ""}, time.monotonic() - 1)

    def test_native_result_after_budget_is_not_returned_as_success(self):
        engine = Engine.__new__(Engine)
        engine.image_input = SimpleNamespace(name="input")
        engine.image_dtype = np.float32
        engine.image = Mock()
        output = io.BytesIO()
        Image.new("RGB", (400, 400)).save(output, format="PNG")
        request = {"frames": [{"timestampSeconds": 0, "dataBase64": base64.b64encode(output.getvalue()).decode()}], "audioPcm16Base64": ""}
        for budget in [1, 40]:
            with patch("server.time.monotonic", return_value=0) as clock:
                def slow_native(*args):
                    clock.return_value = budget + 1
                    return [np.array([[2.0]], dtype=np.float32)]
                engine.image.run.side_effect = slow_native
                with self.assertRaises(TimeoutError):
                    engine.analyze(request, deadline=budget)

    def test_frame_inference_returns_raw_logit_and_image_threshold_only(self):
        engine = Engine.__new__(Engine)
        engine.image_input = SimpleNamespace(name="input")
        engine.image_dtype = np.float32
        engine.image = Mock()
        engine.image.run.return_value = [np.array([[2.0]], dtype=np.float32)]
        import torch
        engine.torch = torch
        engine.audio = Mock()
        output = io.BytesIO()
        Image.new("RGB", (400, 400)).save(output, format="PNG")
        request = {"frames": [{"timestampSeconds": 0, "dataBase64": base64.b64encode(output.getvalue()).decode()}], "audioPcm16Base64": ""}
        result = engine.analyze(request)
        self.assertEqual(result["frames"][0]["imageLogit"], 2)
        self.assertTrue(result["frames"][0]["aboveImageThreshold"])
        self.assertFalse(result["calibratedForVideo"])
        engine.audio.assert_not_called()
        request["frames"][0]["timestampSeconds"] = float("nan")
        with self.assertRaises(ValueError):
            engine.analyze(request)


if __name__ == "__main__":
    unittest.main()
