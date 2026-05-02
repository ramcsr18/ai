#!/usr/bin/env python3

from __future__ import annotations

import json
import statistics
import time
from pathlib import Path
from tempfile import TemporaryDirectory

from helixzip import write_stream_archive


TIME_RUNS = 3


def stream_benchmark() -> dict:
    unit = b"DNA inspired compression is really grammar compression wearing a lab coat.\n"
    payload = (b"ACGT" * 200000) + (b"\x00" * 200000) + (unit * 12000) + (b"GENE_SEQUENCE_BLOCK_" * 12000)

    with TemporaryDirectory() as tmpdir:
        source = Path(tmpdir) / "input.bin"
        output_one = Path(tmpdir) / "stream-1.hzs"
        output_two = Path(tmpdir) / "stream-2.hzs"
        source.write_bytes(payload)

        workers1_times = []
        workers2_times = []
        single_worker = None
        two_workers = None

        for _ in range(TIME_RUNS):
            started = time.perf_counter()
            single_worker = write_stream_archive(
                source,
                output_one,
                chunk_size=65536,
                max_iterations=16,
                workers=1,
            )
            workers1_times.append((time.perf_counter() - started) * 1000)

            started = time.perf_counter()
            two_workers = write_stream_archive(
                source,
                output_two,
                chunk_size=65536,
                max_iterations=16,
                workers=2,
            )
            workers2_times.append((time.perf_counter() - started) * 1000)

        return {
            "payload_bytes": len(payload),
            "chunk_size": 65536,
            "max_iterations": 16,
            "time_runs": TIME_RUNS,
            "workers1_ms_median": round(statistics.median(workers1_times), 3),
            "workers2_ms_median": round(statistics.median(workers2_times), 3),
            "same_size": single_worker["compressed_bytes"] == two_workers["compressed_bytes"],
            "compressed_bytes": single_worker["compressed_bytes"],
            "chunks": single_worker["chunks"],
            "grammar_chunks": single_worker["grammar_chunks"],
            "raw_chunks": single_worker["raw_chunks"],
            "lz_chunks": single_worker["lz_chunks"],
            "repeat_chunks": single_worker["repeat_chunks"],
            "mode_total": (
                single_worker["grammar_chunks"]
                + single_worker["raw_chunks"]
                + single_worker["lz_chunks"]
                + single_worker["repeat_chunks"]
            ),
        }


def main() -> int:
    print(json.dumps(stream_benchmark(), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
