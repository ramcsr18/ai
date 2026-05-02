#!/usr/bin/env python3

from __future__ import annotations

import bz2
import gzip
import json
import lzma
import random
import statistics
import time
import zlib

from helixzip import HelixArchive, compress


HELIX_ITERATIONS = 16
TIME_RUNS = 3


def build_ldif_case(target_bytes: int = 65536) -> bytes:
    records = bytearray()
    index = 0
    while len(records) < target_bytes:
        records.extend(
            (
                f"dn: uid=user{index:05d},ou=people,dc=example,dc=com\n"
                f"uid: user{index:05d}\n"
                f"cn: Example User {index:05d}\n"
                f"sn: User{index:05d}\n"
                f"givenName: Example{index:05d}\n"
                f"mail: user{index:05d}@example.com\n"
                "objectClass: top\n"
                "objectClass: person\n"
                "objectClass: organizationalPerson\n"
                "objectClass: inetOrgPerson\n\n"
            ).encode("utf-8")
        )
        index += 1
    return bytes(records[:target_bytes])


def build_cases() -> list[tuple[str, bytes]]:
    rng = random.Random(12345)
    return [
        ("zeros-64k", b"\x00" * 65536),
        ("acgt-64k", b"ACGT" * (65536 // 4)),
        ("text-64k", (b"DNA inspired compression is really grammar compression wearing a lab coat.\n" * 900)[:65536]),
        ("ldif-64k", build_ldif_case()),
        ("random-8k", bytes(rng.getrandbits(8) for _ in range(8192))),
    ]


def bench_once(encode, decode, data: bytes) -> dict:
    encoded = encode(data)
    decoded = decode(encoded)
    if decoded != data:
        raise ValueError("roundtrip failed during benchmark")

    encode_times = []
    decode_times = []
    for _ in range(TIME_RUNS):
        started = time.perf_counter()
        encoded = encode(data)
        encode_times.append((time.perf_counter() - started) * 1000)

        started = time.perf_counter()
        decoded = decode(encoded)
        decode_times.append((time.perf_counter() - started) * 1000)

    return {
        "compressed_bytes": len(encoded),
        "compression_ratio": round(len(encoded) / len(data), 6),
        "encode_ms_median": round(statistics.median(encode_times), 3),
        "decode_ms_median": round(statistics.median(decode_times), 3),
    }


def main() -> int:
    codecs = {
        "helixzip": (
            lambda data: compress(data, max_iterations=HELIX_ITERATIONS).to_bytes(),
            lambda payload: HelixArchive.from_bytes(payload).decode(),
        ),
        "zlib": (
            lambda data: zlib.compress(data, level=9),
            zlib.decompress,
        ),
        "gzip": (
            lambda data: gzip.compress(data, compresslevel=9, mtime=0),
            gzip.decompress,
        ),
        "bz2": (
            lambda data: bz2.compress(data, compresslevel=9),
            bz2.decompress,
        ),
        "lzma": (
            lambda data: lzma.compress(data, preset=9),
            lzma.decompress,
        ),
    }

    results = {
        "helixzip_iterations": HELIX_ITERATIONS,
        "time_runs": TIME_RUNS,
        "cases": [],
    }

    for case_name, data in build_cases():
        case_result = {
            "case": case_name,
            "original_bytes": len(data),
            "codecs": {},
        }
        for codec_name, (encode, decode) in codecs.items():
            case_result["codecs"][codec_name] = bench_once(encode, decode, data)
        results["cases"].append(case_result)

    print(json.dumps(results, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
