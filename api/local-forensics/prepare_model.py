"""Download fixed public AASIST and Silero weights with checksums."""
import argparse
import hashlib
from pathlib import Path
import urllib.request

URL = "https://raw.githubusercontent.com/clovaai/aasist/a04c9863f63d44471dde8a6abcb3b082b07cd1d1/models/weights/AASIST.pth"
EXPECTED = "51d2d9cf0738172f61e2a384ec50a54a55363240f67c971ed55a92435bc1a1c0"
VAD_URL = "https://raw.githubusercontent.com/snakers4/silero-vad/066409f3d9db45a30d21dfcbf9147826ffdd7052/src/silero_vad/data/silero_vad.onnx"
VAD_EXPECTED = "1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3"


def prepare(destination, url, expected):
    if destination.exists():
        data = destination.read_bytes()
    else:
        with urllib.request.urlopen(url, timeout=30) as response:
            data = response.read(4 * 1024 * 1024)
    if hashlib.sha256(data).hexdigest() != expected:
        raise SystemExit(f"Checkpoint checksum mismatch: {destination.name}")
    if not destination.exists():
        temporary = destination.with_suffix(".download")
        temporary.write_bytes(data)
        temporary.replace(destination)
    print(f"{destination.name} checkpoint verified")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", required=True, type=Path)
    args = parser.parse_args()
    args.model_dir.mkdir(parents=True, exist_ok=True)
    prepare(args.model_dir / "AASIST.pth", URL, EXPECTED)
    prepare(args.model_dir / "silero_vad.onnx", VAD_URL, VAD_EXPECTED)
