import time
import unittest
from unittest.mock import Mock

import numpy as np
from speech_vad import SpeechDetector, intervals_from_probabilities, MAX_PCM_BYTES
from server import Engine


class SpeechTests(unittest.TestCase):
    def test_intervals_are_bounded_and_padding_preserves_delayed_speech(self):
        probabilities = [0.] * 25 + [.9] * 20 + [0.] * 20
        intervals = intervals_from_probabilities(probabilities, len(probabilities) * 512)
        self.assertEqual(len(intervals), 1)
        self.assertLess(intervals[0]["startSeconds"], 25 * .032)
        self.assertGreater(intervals[0]["endSeconds"], 45 * .032)

    def test_a_short_probability_spike_is_not_a_spoken_phrase(self):
        self.assertEqual(intervals_from_probabilities([0., .9, .9] + [0.] * 15, 18 * 512), [])

    def test_empty_audio_avoids_native_inference(self):
        detector = SpeechDetector.__new__(SpeechDetector)
        detector.session = Mock()
        self.assertEqual(detector.analyze(b"")["speechIntervals"], [])
        detector.session.run.assert_not_called()

    def test_invalid_pcm_and_expired_budget_rejected_before_inference(self):
        detector = SpeechDetector.__new__(SpeechDetector)
        detector.session = Mock()
        for pcm in [b"x", bytes(MAX_PCM_BYTES + 2)]:
            with self.assertRaises(ValueError):
                detector.analyze(pcm)
        with self.assertRaises(TimeoutError):
            detector.analyze(bytes(1024), time.monotonic() - 1)
        detector.session.run.assert_not_called()

    def test_recurrent_state_and_context_are_reset_between_requests(self):
        detector = SpeechDetector.__new__(SpeechDetector)
        recorded = []
        def infer(_outputs, inputs):
            recorded.append((inputs["state"].copy(), inputs["input"].copy()))
            return [np.array([[.1]], dtype=np.float32), np.ones((2, 1, 128), dtype=np.float32)]
        detector.session = Mock()
        detector.session.run.side_effect = infer
        for _ in range(2):
            detector.analyze(np.full(512, 12000, dtype="<i2").tobytes())
        self.assertEqual(len(recorded), 2)
        for state, inputs in recorded:
            self.assertFalse(state.any())
            self.assertFalse(inputs[0, :64].any())

    def test_nonfinite_probability_rejected(self):
        detector = SpeechDetector.__new__(SpeechDetector)
        detector.session = Mock()
        detector.session.run.return_value = [np.array([[float("nan")]]), np.zeros((2, 1, 128), dtype=np.float32)]
        with self.assertRaises(ValueError):
            detector.analyze(bytes(1024))

    def test_speech_endpoint_checks_format_before_decoding(self):
        engine = Engine.__new__(Engine)
        engine.speech_detector = Mock()
        for request in [{}, {"audioPcm16Base64": 1}, {"audioPcm16Base64": "!!!"}, {"audioPcm16Base64": "", "extra": True}]:
            with self.assertRaises((ValueError, TypeError)):
                engine.speech(request)
        engine.speech_detector.analyze.assert_not_called()


if __name__ == "__main__":
    unittest.main()
