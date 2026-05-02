#!/usr/bin/env python3

from __future__ import annotations

import json
import random
import statistics
import time
from pathlib import Path
from tempfile import TemporaryDirectory

from helixzip import SharedTable, compress, read_hx7_archive, write_hx7_archive


TIME_RUNS = 3
CHUNK_SIZE = 65536
ITERATIONS = 16
MAX_LEVELS = 2


def build_ldif_case(target_bytes: int = 65536, *, start_index: int = 0) -> bytes:
    records = bytearray()
    index = start_index
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


def build_cases() -> list[tuple[str, bytes, bytes | None]]:
    rng = random.Random(12345)
    text_unit = b"DNA inspired compression is really grammar compression wearing a lab coat.\n"
    return [
        ("zeros-64k", b"\x00" * 65536, b"\x00" * 131072),
        ("acgt-64k", b"ACGT" * (65536 // 4), b"ACGT" * (131072 // 4)),
        ("text-64k", (text_unit * 900)[:65536], (text_unit * 1800)[:131072]),
        ("ldif-64k", build_ldif_case(), build_ldif_case(131072, start_index=10000)),
        ("random-8k", bytes(rng.getrandbits(8) for _ in range(8192)), None),
    ]


def bench_hxz6(data: bytes) -> dict:
    encoded = compress(data, max_iterations=ITERATIONS).to_bytes()
    if len(encoded) <= 0:
        raise ValueError("invalid encoded size")

    encode_times = []
    decode_times = []
    for _ in range(TIME_RUNS):
        started = time.perf_counter()
        archive = compress(data, max_iterations=ITERATIONS)
        encoded = archive.to_bytes()
        encode_times.append((time.perf_counter() - started) * 1000)

        started = time.perf_counter()
        restored = archive.from_bytes(encoded).decode()
        decode_times.append((time.perf_counter() - started) * 1000)
        if restored != data:
            raise ValueError("HXZ6 roundtrip failed")

    return {
        "compressed_bytes": len(encoded),
        "compression_ratio": round(len(encoded) / len(data), 6),
        "encode_ms_median": round(statistics.median(encode_times), 3),
        "decode_ms_median": round(statistics.median(decode_times), 3),
    }


def bench_hx7(data: bytes, table: SharedTable | None) -> dict:
    with TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        source = tmp / "input.bin"
        archive = tmp / "output.hx7"
        restored = tmp / "restored.bin"
        source.write_bytes(data)

        encode_times = []
        decode_times = []
        report = None

        for _ in range(TIME_RUNS):
            started = time.perf_counter()
            report = write_hx7_archive(
                source,
                archive,
                chunk_size=CHUNK_SIZE,
                max_iterations=ITERATIONS,
                workers=1,
                table=table,
                max_levels=MAX_LEVELS,
            )
            encode_times.append((time.perf_counter() - started) * 1000)

            started = time.perf_counter()
            decode_report = read_hx7_archive(archive, restored, workers=1, table=table)
            decode_times.append((time.perf_counter() - started) * 1000)
            if restored.read_bytes() != data:
                raise ValueError("HX7 roundtrip failed")
            if decode_report["restored_bytes"] != len(data):
                raise ValueError("HX7 decode report is inconsistent")

        return {
            "compressed_bytes": report["compressed_bytes"],
            "compression_ratio": round(report["compressed_bytes"] / len(data), 6),
            "encode_ms_median": round(statistics.median(encode_times), 3),
            "decode_ms_median": round(statistics.median(decode_times), 3),
            "standalone_blocks": report["standalone_blocks"],
            "shared_blocks": report["shared_blocks"],
            "zlib_blocks": report["zlib_blocks"],
            "lzma_blocks": report["lzma_blocks"],
        }


def main() -> int:
    results = {
        "time_runs": TIME_RUNS,
        "chunk_size": CHUNK_SIZE,
        "iterations": ITERATIONS,
        "max_levels": MAX_LEVELS,
        "cases": [],
    }

    for case_name, data, training in build_cases():
        case_result = {
            "case": case_name,
            "original_bytes": len(data),
            "implementations": {
                "hxz6": bench_hxz6(data),
                "hx7_plain": bench_hx7(data, None),
            },
        }
        if training is not None:
            case_result["implementations"]["hx7_dict"] = bench_hx7(
                data,
                SharedTable.build(training, max_iterations=ITERATIONS),
            )
        results["cases"].append(case_result)

    print(json.dumps(results, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
