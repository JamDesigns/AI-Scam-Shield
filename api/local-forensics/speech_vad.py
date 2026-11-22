"""Bounded CPU speech activity detection using the pinned Silero ONNX model.

The state/context input contract follows Silero's official OnnxWrapper. No
downloaded Python code is executed, and detector state is reset for each request.
"""
import hashlib
import math
from pathlib import Path
import time

import numpy as np

VAD_HASH = "1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3"
MAX_PCM_BYTES = 180 * 16000 * 2
SAMPLE_RATE = 16000
WINDOW = 512
CONTEXT = 64


class SpeechDetector:
    def __init__(self, model_path):
        import onnxruntime as ort
        if hashlib.sha256(Path(model_path).read_bytes()).hexdigest() != VAD_HASH:
            raise ValueError("Speech model checksum mismatch")
        options = ort.SessionOptions()
        options.intra_op_num_threads = 1
        options.inter_op_num_threads = 1
        self.session = ort.InferenceSession(str(model_path), sess_options=options, providers=["CPUExecutionProvider"])

    def analyze(self, pcm, deadline=None):
        if len(pcm) > MAX_PCM_BYTES or len(pcm) % 2:
            raise ValueError("Invalid speech PCM length")
        samples = np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768
        deadline = min(deadline or float("inf"), time.monotonic() + 10)
        state = np.zeros((2, 1, 128), dtype=np.float32)
        context = np.zeros((1, CONTEXT), dtype=np.float32)
        probabilities = []
        for start in range(0, len(samples), WINDOW):
            if time.monotonic() >= deadline:
                raise TimeoutError("Speech detection deadline exceeded")
            window = samples[start:start + WINDOW]
            if len(window) < WINDOW:
                window = np.pad(window, (0, WINDOW - len(window)))
            inputs = np.concatenate((context, window[None]), axis=1)
            probability, state = self.session.run(None, {"input": inputs, "state": state, "sr": np.array(SAMPLE_RATE, dtype=np.int64)})
            value = float(np.asarray(probability).reshape(-1)[0])
            if not math.isfinite(value) or not 0 <= value <= 1 or state.shape != (2, 1, 128) or not np.all(np.isfinite(state)):
                raise ValueError("Invalid speech detector output")
            probabilities.append(value)
            context = inputs[:, -CONTEXT:]
        intervals = intervals_from_probabilities(probabilities, len(samples))
        return {"provider": "silero-vad", "sampleRate": SAMPLE_RATE,
                "analyzedSeconds": len(samples) / SAMPLE_RATE, "speechIntervals": intervals}


def intervals_from_probabilities(probabilities, sample_count):
    """Hysteresis, 160ms minimum speech/silence and 80ms context padding.

    Keep short utterances rather than applying a language-specific word filter.
    Adjacent padded intervals are merged without losing any voiced samples.
    """
    duration = sample_count / SAMPLE_RATE
    active = None
    silence_start = None
    raw = []
    for index, probability in enumerate(probabilities):
        t = index * WINDOW / SAMPLE_RATE
        if active is None:
            if probability >= .5:
                active = t
            continue
        if probability >= .35:
            silence_start = None
        elif silence_start is None:
            silence_start = t
        elif t + WINDOW / SAMPLE_RATE - silence_start >= .16:
            if silence_start - active >= .16:
                raw.append((active, silence_start))
            active, silence_start = None, None
    if active is not None:
        end = silence_start if silence_start is not None else duration
        if end - active >= .16:
            raw.append((active, end))
    result = []
    for start, end in raw:
        start, end = max(0, start - .08), min(duration, end + .08)
        if result and start <= result[-1]["endSeconds"]:
            result[-1]["endSeconds"] = end
        else:
            result.append({"startSeconds": start, "endSeconds": end})
    if len(result) > 1024:
        raise ValueError("Too many speech intervals")
    return result
