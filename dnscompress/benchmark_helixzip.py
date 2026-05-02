#!/usr/bin/env python3

from __future__ import annotations

import json

from helixzip import SharedTable, compress, compress_with_table


def benchmark_cases() -> list[dict]:
    results: list[dict] = []
    cases = [
        ("zeros-1k", b"\x00" * 1024),
        ("zeros-64k", b"\x00" * 65536),
        ("acgt-64k", b"ACGT" * (65536 // 4)),
    ]

    for name, data in cases:
        archive = compress(data, max_iterations=128)
        results.append(
            {
                "case": name,
                "mode": "plain",
                "compressed_bytes": len(archive.to_bytes()),
                "rules": len(archive.rules),
                "stream_symbols": len(archive.stream),
            }
        )

    training = b"\x00" * 65536
    table = SharedTable.from_archive(compress(training, max_iterations=128))
    for size in (1024, 65536):
        data = b"\x00" * size
        archive = compress_with_table(data, table, max_iterations=64)
        results.append(
            {
                "case": f"zeros-shared-{size}",
                "mode": "shared",
                "compressed_bytes": len(archive.to_bytes()),
                "delta_rules": len(archive.delta_rules),
                "stream_symbols": len(archive.stream),
                "table_id": archive.table_id,
            }
        )

    return results


def main() -> int:
    print(json.dumps(benchmark_cases(), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
