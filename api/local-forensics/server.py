"""Offline forensic signals. Raw detector outputs are not calibrated video verdicts."""
import argparse
import base64
import hashlib
import importlib.util
import io
import json
import math
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps
from speech_vad import SpeechDetector

IMAGE_HASH = "d75791ba2fa59146025d342cfaafa9ddeab24af117642a94f752ee4c1619375d"
AUDIO_HASH = "51d2d9cf0738172f61e2a384ec50a54a55363240f67c971ed55a92435bc1a1c0"
IMAGE_THRESHOLD = 1.359375
MAX_BODY = 20 * 1024 * 1024
MAX_PCM_BYTES = 180 * 16000 * 2
AUDIO_SAMPLES = 64600
MAX_AUDIO_WINDOWS = 12


class DeadlineReader(io.RawIOBase):
    """Bound total header/body reading, including a client that keeps dripping bytes."""
    def __init__(self, connection, deadline):
        self.connection, self.deadline = connection, deadline

    def readable(self):
        return True

    def readinto(self, buffer):
        remaining = self.deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("Request read deadline exceeded")
        self.connection.settimeout(remaining)
        return self.connection.recv_into(buffer)


def verify_file(path, expected):
    if hashlib.sha256(Path(path).read_bytes()).hexdigest() != expected:
        raise ValueError("Model checksum mismatch")


def preprocess_image(data):
    with Image.open(io.BytesIO(data)) as original:
        if original.width * original.height > 25_000_000:
            raise ValueError("Image too large")
        image = ImageOps.exif_transpose(original).convert("RGB")
        scale = 440 / min(image.size)
        resized = (int(image.width * scale), int(image.height * scale))
        if max(resized) > 8192 or resized[0] * resized[1] > 4_000_000:
            raise ValueError("Extreme image aspect ratio")
        image = image.resize(resized, Image.Resampling.BICUBIC)
        x, y = round((image.width - 384) / 2), round((image.height - 384) / 2)
        pixels = np.asarray(image.crop((x, y, x + 384, y + 384)), dtype=np.float32) / 255
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    return np.ascontiguousarray(((pixels - mean) / std).transpose(2, 0, 1)[None])


def audio_windows(pcm):
    if len(pcm) > MAX_PCM_BYTES or len(pcm) % 2:
        raise ValueError("Invalid PCM length")
    samples = np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768
    if len(samples) < 8000:
        return [], 0
    last = max(0, len(samples) - AUDIO_SAMPLES)
    count = min(MAX_AUDIO_WINDOWS, max(1, math.ceil(len(samples) / AUDIO_SAMPLES)))
    starts = sorted(set(int(value) for value in np.linspace(0, last, count)))
    windows, skipped = [], 0
    for start in starts:
        clip = samples[start:start + AUDIO_SAMPLES]
        rms = float(np.sqrt(np.mean(clip ** 2)))
        if rms < 0.0001:
            skipped += 1
            continue
        if len(clip) < AUDIO_SAMPLES:
            clip = np.tile(clip, math.ceil(AUDIO_SAMPLES / len(clip)))[:AUDIO_SAMPLES]
        windows.append((start / 16000, clip, rms))
    return windows, skipped


class Engine:
    def __init__(self, image_model, audio_model, vad_model=None):
        import onnxruntime as ort
        import torch
        verify_file(image_model, IMAGE_HASH)
        verify_file(audio_model, AUDIO_HASH)
        options = ort.SessionOptions()
        options.intra_op_num_threads = 2
        self.image = ort.InferenceSession(str(image_model), sess_options=options, providers=["CPUExecutionProvider"])
        self.image_input = self.image.get_inputs()[0]
        self.image_dtype = np.float16 if self.image_input.type == "tensor(float16)" else np.float32
        torch.set_num_threads(2)
        torch.manual_seed(0)
        module_path = Path(__file__).parent / "vendor" / "AASIST.py"
        verify_file(module_path, "9e0d3e80937dd0577beea7883098465a479da23a198ebc0d712abcc59b0bec50")
        # Only the reviewed, vendored implementation is loaded. Requests cannot select code or models.
        spec = importlib.util.spec_from_file_location("local_aasist", module_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        config_path = Path(__file__).parent / "AASIST.conf"
        verify_file(config_path, "c25023331685027cce90e1b9a0d2df10aa04b2a27d9b27d5afa36e6815b0fe76")
        config = json.loads(config_path.read_text())["model_config"]
        self.audio = module.Model(config)
        self.audio.load_state_dict(torch.load(audio_model, map_location="cpu", weights_only=True))
        self.audio.eval()
        self.torch = torch
        self.speech_detector = SpeechDetector(vad_model or Path(audio_model).with_name("silero_vad.onnx"))

    def speech(self, request, deadline=None):
        if not isinstance(request, dict) or set(request) != {"audioPcm16Base64"}:
            raise ValueError("Invalid speech request")
        value = request["audioPcm16Base64"]
        if not isinstance(value, str) or len(value) > ((MAX_PCM_BYTES + 2) // 3) * 4:
            raise ValueError("Invalid speech request length")
        return self.speech_detector.analyze(base64.b64decode(value, validate=True), deadline)

    def analyze(self, request, deadline=None):
        deadline = min(deadline or float("inf"), time.monotonic() + 20)
        def check_deadline():
            if time.monotonic() >= deadline:
                raise TimeoutError("Local forensic deadline exceeded")
        if not isinstance(request, dict) or set(request) != {"frames", "audioPcm16Base64"}:
            raise ValueError("Invalid request")
        frames = request["frames"]
        if not isinstance(frames, list) or not 1 <= len(frames) <= 14:
            raise ValueError("Invalid frame count")
        image_results = []
        for frame in frames:
            check_deadline()
            if not isinstance(frame, dict) or set(frame) != {"timestampSeconds", "dataBase64"}:
                raise ValueError("Invalid frame")
            timestamp = frame["timestampSeconds"]
            if isinstance(timestamp, bool) or not isinstance(timestamp, (int, float)) or not math.isfinite(timestamp) or not 0 <= timestamp <= 180:
                raise ValueError("Invalid timestamp")
            data = base64.b64decode(frame["dataBase64"], validate=True)
            if not 0 < len(data) <= 2 * 1024 * 1024:
                raise ValueError("Invalid image length")
            tensor = preprocess_image(data).astype(self.image_dtype)
            logit = float(np.asarray(self.image.run(None, {self.image_input.name: tensor})[0]).reshape(-1)[0])
            if not math.isfinite(logit):
                raise ValueError("Non-finite image output")
            image_results.append({"timestampSeconds": timestamp, "imageLogit": logit,
                                  "aboveImageThreshold": logit >= IMAGE_THRESHOLD})
        pcm = base64.b64decode(request["audioPcm16Base64"], validate=True)
        windows, skipped = audio_windows(pcm)
        audio_results = []
        with self.torch.inference_mode():
            for timestamp, clip, rms in windows:
                check_deadline()
                _, logits = self.audio(self.torch.from_numpy(clip[None]))
                scores = logits[0].tolist()
                if len(scores) != 2 or not all(math.isfinite(x) for x in scores):
                    raise ValueError("Invalid audio output")
                audio_results.append({"timestampSeconds": timestamp, "spoofLogit": scores[0],
                                      "bonaFideLogit": scores[1], "rms": rms})
        return {"scope": "sampled_frames_and_audio_windows", "calibratedForVideo": False,
                "frames": image_results, "audioWindows": audio_results, "skippedSilentWindows": skipped}


def serve(engine, host="127.0.0.1", port=8081, translation=None):
    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.rfile.close()
            self.rfile = io.BufferedReader(DeadlineReader(self.connection, time.monotonic() + 10))

        def log_message(self, *_args):
            pass  # Never log media, body, paths or credentials.

        def respond(self, status, payload):
            body = json.dumps(payload, allow_nan=False).encode()
            self.connection.settimeout(5)
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path != "/health":
                self.respond(404, {"error": "not_found"})
                return
            self.respond(200, {"ok": True, "provider": "local-experimental", "imageModel": "community-forensics-frontier",
                               "audioModel": "AASIST", "calibratedForVideo": False,
                               "contractVersion": 3, "speechAvailable": True, "speechProvider": "silero-vad",
                               "translationAvailable": translation is not None,
                               "translationProvider": "madlad400-3b-ct2-int8" if translation else None})

        def do_POST(self):
            if self.path not in ["/analyze", "/speech", "/translate"]:
                self.respond(404, {"error": "not_found"})
                return
            try:
                if self.headers.get_content_type() != "application/json" or self.headers.get("Transfer-Encoding"):
                    raise ValueError("Invalid content type")
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= (64 * 1024 if self.path == "/translate" else MAX_BODY):
                    self.respond(413, {"error": "body_too_large"})
                    return
                body = self.rfile.read(length)
                if len(body) != length:
                    raise ValueError("Incomplete body")
                if self.path == "/translate":
                    if translation is None:
                        self.respond(503, {"error": "translation_unavailable"})
                    else:
                        self.respond(200, translation.translate(json.loads(body), time.monotonic() + 45))
                elif self.path == "/speech":
                    self.respond(200, engine.speech(json.loads(body), time.monotonic() + 10))
                else:
                    self.respond(200, engine.analyze(json.loads(body), time.monotonic() + 20))
            except TimeoutError:
                self.respond(503, {"error": "translation_unavailable" if self.path == "/translate" else "forensics_unavailable"})
            except (ValueError, TypeError, KeyError, OSError):
                self.respond(400, {"error": "invalid_translation" if self.path == "/translate" else "invalid_media"})
            except Exception:
                self.respond(503, {"error": "translation_unavailable" if self.path == "/translate" else "forensics_unavailable"})

    # A single worker bounds model memory and CPU concurrency for development.
    HTTPServer((host, port), Handler).serve_forever()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--image-model", required=True, type=Path)
    parser.add_argument("--audio-model", required=True, type=Path)
    parser.add_argument("--vad-model", type=Path)
    parser.add_argument("--translation-model", type=Path)
    parser.add_argument("--host", choices=["127.0.0.1", "0.0.0.0"], default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8081)
    args = parser.parse_args()
    translation = None
    if args.translation_model:
        from translation_engine import TranslationEngine
        translation = TranslationEngine(args.translation_model)
    serve(Engine(args.image_model, args.audio_model, args.vad_model), args.host, args.port, translation)
