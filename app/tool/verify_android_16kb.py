"""Inspect packaged ELF LOAD/RELRO alignment; exits nonzero for bad 64-bit libs.

Usage: python tool/verify_android_16kb.py app.aab [--json report.json]
Also accepts an APK. APK ZIP alignment must additionally pass zipalign -c -P 16 4.
Reference: https://developer.android.com/guide/practices/page-sizes
"""

import argparse
import hashlib
import json
import struct
import zipfile
from pathlib import Path


PAGE = 16384


def inspect_elf(data):
    if data[:4] != b"\x7fELF" or data[4] not in (1, 2) or data[5] not in (1, 2):
        raise ValueError("Not a supported ELF file")
    bits = 64 if data[4] == 2 else 32
    order = "<" if data[5] == 1 else ">"
    if bits == 64:
        offset = struct.unpack_from(order + "Q", data, 32)[0]
        size, count = struct.unpack_from(order + "HH", data, 54)
        fmt = order + "IIQQQQQQ"
    else:
        offset = struct.unpack_from(order + "I", data, 28)[0]
        size, count = struct.unpack_from(order + "HH", data, 42)
        fmt = order + "IIIIIIII"
    if size < struct.calcsize(fmt) or not count:
        raise ValueError("Invalid ELF program header table")
    headers = []
    for index in range(count):
        values = struct.unpack_from(fmt, data, offset + index * size)
        if bits == 64:
            kind, flags, file_offset, address, _, file_size, mem_size, alignment = values
        else:
            kind, file_offset, address, _, file_size, mem_size, flags, alignment = values
        headers.append(dict(kind=kind, flags=flags, offset=file_offset,
                            address=address, file_size=file_size,
                            mem_size=mem_size, alignment=alignment))
    loads = [h for h in headers if h["kind"] == 1]
    errors = []
    if not loads:
        errors.append("No LOAD segments")
    for h in loads:
        if h["alignment"] < PAGE or h["alignment"] & (h["alignment"] - 1):
            errors.append(f"LOAD alignment {h['alignment']} does not support 16 KB")
        if (h["address"] - h["offset"]) % PAGE:
            errors.append("LOAD virtual address and file offset disagree modulo 16 KB")
    for relro in (h for h in headers if h["kind"] == 0x6474E552):
        end = relro["address"] + relro["mem_size"]
        if end % PAGE == 0:
            continue
        # Page protection must not include following writable bytes in the LOAD.
        containing = [h for h in loads if h["flags"] & 2
                      and h["address"] <= relro["address"]
                      and end <= h["address"] + h["mem_size"]]
        if any(end < h["address"] + h["mem_size"] for h in containing):
            errors.append("RELRO ends inside a 16 KB page containing writable data")
    return dict(bits=bits, load_alignments=[h["alignment"] for h in loads],
                errors=errors, passes_16kb=not errors)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--json", type=Path)
    args = parser.parse_args()
    entries = []
    with zipfile.ZipFile(args.archive) as archive:
        for name in sorted(archive.namelist()):
            # Exclude debug metadata and inspect the native libraries actually shipped.
            parts = name.split("/")
            if not name.endswith(".so") or not (
                len(parts) == 3 and parts[0] == "lib"
                or len(parts) == 4 and parts[1] == "lib"
            ):
                continue
            try:
                result = inspect_elf(archive.read(name))
            except (ValueError, struct.error, IndexError) as exc:
                result = dict(bits=None, errors=[str(exc)], passes_16kb=False)
            result["name"] = name
            result["required"] = parts[-2] in ("arm64-v8a", "x86_64")
            entries.append(result)
    failures = [e["name"] for e in entries if e["required"] and not e["passes_16kb"]]
    for abi in ("arm64-v8a", "x86_64"):
        if not any(e["name"].split("/")[-2] == abi for e in entries):
            failures.append(f"Missing required ABI: {abi}")
    report = dict(archive=str(args.archive.resolve()),
                  sha256=hashlib.sha256(args.archive.read_bytes()).hexdigest(),
                  libraries=entries, failures=failures, passes_16kb=not failures)
    if args.json:
        args.json.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    for entry in entries:
        status = "PASS" if entry["passes_16kb"] else "FAIL" if entry["required"] else "INFO (32-bit)"
        print(f"{status}: {entry['name']}: {entry.get('load_alignments', [])}")
        for error in entry["errors"]:
            print(f"  {error}")
    print(f"{'PASS' if not failures else 'FAIL'}: {len(entries)} packaged libraries; "
          f"{sum(e['required'] for e in entries)} required 64-bit libraries")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
