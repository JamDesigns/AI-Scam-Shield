"""Fetch a pinned, non-executable CTranslate2 weight set; never run remote code."""
import argparse
import concurrent.futures
import hashlib
import shutil
import uuid
import urllib.request
from pathlib import Path

REPOSITORY = "Nextcloud-AI/madlad400-3b-mt-ct2-int8"
REVISION = "aa32bbdeba7880eff2096ec044cb155a340a9400"
FILES = {
    "config.json": (224, "90fb54962455a4e0a0bc7235c0f063d7e46d9c1a1ae003af8059809abd6aeece"),
    "shared_vocabulary.json": (5477099, "c327551ce3ca6efc7b437e11a267f79979893332dda8a1d146e2c950815193f8"),
    "spiece.model": (4427844, "ef11ac9a22c7503492f56d48dce53be20e339b63605983e9f27d2cd0e0f3922c"),
    "model.bin": (2950208329, "77b9fd9ab97c1259d07089b5f854393dad81bc5fb5647d3f9a5d101c94f40daa"),
}


def valid_file(file, size, expected):
    if not file.is_file() or file.stat().st_size != size:
        return False
    digest = hashlib.sha256()
    with file.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest() == expected


def verify_model(directory):
    for name, (size, digest) in FILES.items():
        if not valid_file(Path(directory) / name, size, digest):
            raise ValueError("Translation model checksum mismatch: " + name)


def download(directory):
    directory = Path(directory).resolve()
    directory.mkdir(parents=True, exist_ok=True)
    for name, (size, digest) in FILES.items():
        destination = directory / name
        if valid_file(destination, size, digest):
            print("Verified " + name, flush=True)
            continue
        temporary = directory / (name + ".download")
        url = f"https://huggingface.co/{REPOSITORY}/resolve/{REVISION}/{name}?download=true&nonce={uuid.uuid4().hex}"
        print("Downloading " + name, flush=True)
        if size > 100_000_000:
            count = 8
            width = (size + count - 1) // count
            def part(index):
                start, end = index * width, min(size - 1, (index + 1) * width - 1)
                file = directory / (name + f".download-part-{index}")
                request = urllib.request.Request(url + f"&part={index}", headers={"Range": f"bytes={start}-{end}"})
                with urllib.request.urlopen(request, timeout=180) as response, file.open("wb") as output:
                    if response.status != 206 or response.headers.get("Content-Range") != f"bytes {start}-{end}/{size}":
                        raise ValueError("Invalid model range response")
                    shutil.copyfileobj(response, output)
                if file.stat().st_size != end - start + 1:
                    raise ValueError("Incomplete model range")
                return file
            with concurrent.futures.ThreadPoolExecutor(max_workers=count) as executor:
                parts = list(executor.map(part, range(count)))
            with temporary.open("wb") as output:
                for file in parts:
                    with file.open("rb") as stream:
                        shutil.copyfileobj(stream, output)
        else:
            with urllib.request.urlopen(url, timeout=180) as response, temporary.open("wb") as output:
                shutil.copyfileobj(response, output)
        if not valid_file(temporary, size, digest):
            raise ValueError("Downloaded model checksum mismatch: " + name)
        temporary.replace(destination)
        if size > 100_000_000:
            for file in parts:
                file.unlink()  # Only known temporary files created above, never a directory.
    verify_model(directory)
    license_file = directory / "LICENSE"
    if not license_file.exists():
        with urllib.request.urlopen("https://www.apache.org/licenses/LICENSE-2.0.txt", timeout=30) as response:
            license_file.write_bytes(response.read(50_000))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()
    verify_model(args.model_dir) if args.verify_only else download(args.model_dir)
    print("Verified offline translation model.", flush=True)
