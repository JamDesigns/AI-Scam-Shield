"""Synthetic CPU/memory smoke test; not an accuracy evaluation or sizing guarantee."""
import base64
import io
import json
import resource
import time

import numpy as np
from PIL import Image
from server import Engine

started = time.monotonic()
engine = Engine('models/community_forensics_frontier_fp16.onnx', 'models/AASIST.pth')
load_seconds = time.monotonic() - started
buffer = io.BytesIO()
Image.new('RGB', (640, 480), (80, 120, 160)).save(buffer, format='JPEG')
image = base64.b64encode(buffer.getvalue()).decode('ascii')
# Non-silent deterministic audio exercises all twelve AASIST windows.
pcm = np.random.default_rng(42).integers(-3000, 3000, 180 * 16000, dtype=np.int16)
request = {
    'frames': [{'timestampSeconds': i * 180 / 14, 'dataBase64': image} for i in range(14)],
    'audioPcm16Base64': base64.b64encode(pcm.astype('<i2').tobytes()).decode('ascii'),
}
started = time.monotonic()
result = engine.analyze(request)
print(json.dumps({
    'syntheticOnly': True, 'loadSeconds': round(load_seconds, 3),
    'analysisSeconds': round(time.monotonic() - started, 3),
    'peakRssMiB': round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1),
    'framesAnalyzed': len(result['frames']), 'audioWindowsAnalyzed': len(result['audioWindows']),
    'calibratedForVideo': result['calibratedForVideo'],
}))
