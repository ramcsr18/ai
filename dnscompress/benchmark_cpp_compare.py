#!/usr/bin/env python3

from __future__ import annotations

import json
import random
import statistics
import subprocess
import time
from pathlib import Path
from tempfile import TemporaryDirectory


ROOT = Path(__file__).resolve().parent
CPP_SOURCE = ROOT / "helixzip_cpp.cpp"
CPP_BINARY = ROOT / "helixzip_cpp"
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


def ensure_cpp_binary() -> None:
    if CPP_BINARY.exists() and CPP_BINARY.stat().st_mtime >= CPP_SOURCE.stat().st_mtime:
        return
    subprocess.run(
        ["g++", "-O3", "-std=c++17", "-pthread", str(CPP_SOURCE), "-lz", "-o", str(CPP_BINARY)],
        check=True,
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


def build_cases() -> list[tuple[str, bytes]]:
    rng = random.Random(12345)
    return [
        ("zeros-64k", b"\x00" * 65536),
        ("acgt-64k", b"ACGT" * (65536 // 4)),
        ("text-64k", (b"DNA inspired compression is really grammar compression wearing a lab coat.\n" * 900)[:65536]),
        ("ldif-64k", build_ldif_case()),
        ("random-8k", bytes(rng.getrandbits(8) for _ in range(8192))),
    ]


def run_checked(command: list[str]) -> None:
    subprocess.run(command, check=True, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def verify_cross_compatibility() -> dict:
    results = {"python_to_cpp": True, "cpp_to_python": True, "stream_python_to_cpp": True, "stream_cpp_to_python": True}
    with TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        payload = (b"ACGT" * 4096) + (b"\x00" * 1024) + (b"DNA inspired compression is really grammar compression wearing a lab coat.\n" * 32)
        source = tmp / "input.bin"
        source.write_bytes(payload)

        py_archive = tmp / "python.hxz"
        cpp_archive = tmp / "cpp.hxz"
        py_restored = tmp / "py.restored"
        cpp_restored = tmp / "cpp.restored"

        run_checked(["python3", "helixzip.py", "compress", str(source), str(py_archive), "--iterations", str(HELIX_ITERATIONS)])
        run_checked([str(CPP_BINARY), "decompress", str(py_archive), str(cpp_restored)])
        results["python_to_cpp"] = cpp_restored.read_bytes() == payload

        run_checked([str(CPP_BINARY), "compress", str(source), str(cpp_archive), "--iterations", str(HELIX_ITERATIONS)])
        run_checked(["python3", "helixzip.py", "decompress", str(cpp_archive), str(py_restored)])
        results["cpp_to_python"] = py_restored.read_bytes() == payload

        py_stream = tmp / "python.hzs"
        cpp_stream = tmp / "cpp.hzs"
        py_stream_restored = tmp / "py_stream.restored"
        cpp_stream_restored = tmp / "cpp_stream.restored"

        run_checked(
            [
                "python3",
                "helixzip.py",
                "compress-stream",
                str(source),
                str(py_stream),
                "--iterations",
                str(HELIX_ITERATIONS),
                "--chunk-size",
                "4096",
                "--workers",
                "1",
            ]
        )
        run_checked([str(CPP_BINARY), "decompress-stream", str(py_stream), str(cpp_stream_restored), "--workers", "2"])
        results["stream_python_to_cpp"] = cpp_stream_restored.read_bytes() == payload

        run_checked(
            [
                str(CPP_BINARY),
                "compress-stream",
                str(source),
                str(cpp_stream),
                "--iterations",
                str(HELIX_ITERATIONS),
                "--chunk-size",
                "4096",
                "--workers",
                "2",
            ]
        )
        run_checked(["python3", "helixzip.py", "decompress-stream", str(cpp_stream), str(py_stream_restored), "--workers", "1"])
        results["stream_cpp_to_python"] = py_stream_restored.read_bytes() == payload

    return results


def verify_hx7_compatibility() -> dict:
    results = {
        "python_to_cpp_random_zlib": True,
        "cpp_to_python_random_zlib": True,
        "python_to_cpp_repeat_standalone": True,
        "cpp_to_python_repeat_standalone": True,
    }

    with TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)

        random_payload = bytes(random.Random(12345).getrandbits(8) for _ in range(8192))
        random_source = tmp / "random.bin"
        random_source.write_bytes(random_payload)
        py_random = tmp / "py-random.hx7"
        cpp_random = tmp / "cpp-random.hx7"
        py_random_restored = tmp / "py-random.restored"
        cpp_random_restored = tmp / "cpp-random.restored"

        run_checked(
            [
                "python3",
                "helixzip.py",
                "compress-hx7",
                str(random_source),
                str(py_random),
                "--iterations",
                str(HELIX_ITERATIONS),
                "--chunk-size",
                "65536",
                "--levels",
                "3",
            ]
        )
        run_checked([str(CPP_BINARY), "decompress-hx7", str(py_random), str(cpp_random_restored), "--workers", "2"])
        results["python_to_cpp_random_zlib"] = cpp_random_restored.read_bytes() == random_payload

        run_checked(
            [
                str(CPP_BINARY),
                "compress-hx7",
                str(random_source),
                str(cpp_random),
                "--iterations",
                str(HELIX_ITERATIONS),
                "--chunk-size",
                "65536",
                "--levels",
                "3",
                "--workers",
                "2",
            ]
        )
        run_checked(["python3", "helixzip.py", "decompress-hx7", str(cpp_random), str(py_random_restored)])
        results["cpp_to_python_random_zlib"] = py_random_restored.read_bytes() == random_payload

        repeat_payload = b"ACGT" * 20000
        repeat_source = tmp / "repeat.bin"
        repeat_source.write_bytes(repeat_payload)
        py_repeat = tmp / "py-repeat.hx7"
        cpp_repeat = tmp / "cpp-repeat.hx7"
        py_repeat_restored = tmp / "py-repeat.restored"
        cpp_repeat_restored = tmp / "cpp-repeat.restored"

        run_checked(
            [
                "python3",
                "helixzip.py",
                "compress-hx7",
                str(repeat_source),
                str(py_repeat),
                "--iterations",
                str(HELIX_ITERATIONS),
                "--chunk-size",
                "4096",
                "--levels",
                "3",
            ]
        )
        run_checked([str(CPP_BINARY), "decompress-hx7", str(py_repeat), str(cpp_repeat_restored), "--workers", "2"])
        results["python_to_cpp_repeat_standalone"] = cpp_repeat_restored.read_bytes() == repeat_payload

        run_checked(
            [
                str(CPP_BINARY),
                "compress-hx7",
                str(repeat_source),
                str(cpp_repeat),
                "--iterations",
                str(HELIX_ITERATIONS),
                "--chunk-size",
                "4096",
                "--levels",
                "3",
                "--workers",
                "2",
            ]
        )
        run_checked(["python3", "helixzip.py", "decompress-hx7", str(cpp_repeat), str(py_repeat_restored)])
        results["cpp_to_python_repeat_standalone"] = py_repeat_restored.read_bytes() == repeat_payload

    return results


def bench_case(case_name: str, data: bytes) -> dict:
    with TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        source = tmp / f"{case_name}.bin"
        source.write_bytes(data)
        py_archive = tmp / f"{case_name}.py.hxz"
        py_restored = tmp / f"{case_name}.py.restored"
        cpp_archive = tmp / f"{case_name}.cpp.hxz"
        cpp_restored = tmp / f"{case_name}.cpp.restored"

        implementations = {
            "python_cli": (
                ["python3", "helixzip.py", "compress", str(source), str(py_archive), "--iterations", str(HELIX_ITERATIONS)],
                ["python3", "helixzip.py", "decompress", str(py_archive), str(py_restored)],
                py_archive,
                py_restored,
            ),
            "cpp_cli": (
                [str(CPP_BINARY), "compress", str(source), str(cpp_archive), "--iterations", str(HELIX_ITERATIONS)],
                [str(CPP_BINARY), "decompress", str(cpp_archive), str(cpp_restored)],
                cpp_archive,
                cpp_restored,
            ),
        }

        case_result = {"case": case_name, "original_bytes": len(data), "implementations": {}}
        for impl_name, (compress_cmd, decompress_cmd, archive_path, restored_path) in implementations.items():
            encode_times = []
            decode_times = []
            compressed_bytes = 0

            for _ in range(TIME_RUNS):
                archive_path.unlink(missing_ok=True)
                restored_path.unlink(missing_ok=True)
                started = time.perf_counter()
                run_checked(compress_cmd)
                encode_times.append((time.perf_counter() - started) * 1000)
                compressed_bytes = archive_path.stat().st_size

                started = time.perf_counter()
                run_checked(decompress_cmd)
                decode_times.append((time.perf_counter() - started) * 1000)

                if restored_path.read_bytes() != data:
                    raise ValueError(f"{impl_name} roundtrip failed for {case_name}")

            case_result["implementations"][impl_name] = {
                "compressed_bytes": compressed_bytes,
                "compression_ratio": round(compressed_bytes / len(data), 6),
                "encode_ms_median": round(statistics.median(encode_times), 3),
                "decode_ms_median": round(statistics.median(decode_times), 3),
            }
        return case_result


def stream_parallel_benchmark() -> dict:
    unit = b"DNA inspired compression is really grammar compression wearing a lab coat.\n"
    payload = (b"ACGT" * 200000) + (b"\x00" * 200000) + (unit * 12000) + (b"GENE_SEQUENCE_BLOCK_" * 12000)

    with TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        source = tmp / "input.bin"
        stream_one = tmp / "stream-1.hzs"
        stream_two = tmp / "stream-2.hzs"
        source.write_bytes(payload)

        workers1_times = []
        workers2_times = []

        for _ in range(TIME_RUNS):
            started = time.perf_counter()
            run_checked(
                [
                    str(CPP_BINARY),
                    "compress-stream",
                    str(source),
                    str(stream_one),
                    "--iterations",
                    str(HELIX_ITERATIONS),
                    "--chunk-size",
                    "65536",
                    "--workers",
                    "1",
                ]
            )
            workers1_times.append((time.perf_counter() - started) * 1000)

            started = time.perf_counter()
            run_checked(
                [
                    str(CPP_BINARY),
                    "compress-stream",
                    str(source),
                    str(stream_two),
                    "--iterations",
                    str(HELIX_ITERATIONS),
                    "--chunk-size",
                    "65536",
                    "--workers",
                    "2",
                ]
            )
            workers2_times.append((time.perf_counter() - started) * 1000)

        return {
            "payload_bytes": len(payload),
            "chunk_size": 65536,
            "max_iterations": HELIX_ITERATIONS,
            "workers1_ms_median": round(statistics.median(workers1_times), 3),
            "workers2_ms_median": round(statistics.median(workers2_times), 3),
            "same_size": stream_one.stat().st_size == stream_two.stat().st_size,
            "compressed_bytes": stream_one.stat().st_size,
        }


def bench_hx7_case(case_name: str, data: bytes) -> dict:
    with TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        source = tmp / f"{case_name}.bin"
        source.write_bytes(data)
        py_archive = tmp / f"{case_name}.py.hx7"
        py_restored = tmp / f"{case_name}.py.restored"
        cpp_archive = tmp / f"{case_name}.cpp.hx7"
        cpp_restored = tmp / f"{case_name}.cpp.restored"

        implementations = {
            "python_hx7": (
                [
                    "python3",
                    "helixzip.py",
                    "compress-hx7",
                    str(source),
                    str(py_archive),
                    "--iterations",
                    str(HELIX_ITERATIONS),
                    "--chunk-size",
                    "65536",
                    "--levels",
                    "3",
                    "--workers",
                    "1",
                ],
                ["python3", "helixzip.py", "decompress-hx7", str(py_archive), str(py_restored), "--workers", "1"],
                py_archive,
                py_restored,
            ),
            "cpp_hx7": (
                [
                    str(CPP_BINARY),
                    "compress-hx7",
                    str(source),
                    str(cpp_archive),
                    "--iterations",
                    str(HELIX_ITERATIONS),
                    "--chunk-size",
                    "65536",
                    "--levels",
                    "3",
                    "--workers",
                    "2",
                ],
                [str(CPP_BINARY), "decompress-hx7", str(cpp_archive), str(cpp_restored), "--workers", "2"],
                cpp_archive,
                cpp_restored,
            ),
        }

        case_result = {"case": case_name, "original_bytes": len(data), "implementations": {}}
        for impl_name, (compress_cmd, decompress_cmd, archive_path, restored_path) in implementations.items():
            encode_times = []
            decode_times = []
            compressed_bytes = 0

            for _ in range(TIME_RUNS):
                archive_path.unlink(missing_ok=True)
                restored_path.unlink(missing_ok=True)
                started = time.perf_counter()
                run_checked(compress_cmd)
                encode_times.append((time.perf_counter() - started) * 1000)
                compressed_bytes = archive_path.stat().st_size

                started = time.perf_counter()
                run_checked(decompress_cmd)
                decode_times.append((time.perf_counter() - started) * 1000)

                if restored_path.read_bytes() != data:
                    raise ValueError(f"{impl_name} HX7 roundtrip failed for {case_name}")

            case_result["implementations"][impl_name] = {
                "compressed_bytes": compressed_bytes,
                "compression_ratio": round(compressed_bytes / len(data), 6),
                "encode_ms_median": round(statistics.median(encode_times), 3),
                "decode_ms_median": round(statistics.median(decode_times), 3),
            }
        return case_result


def main() -> int:
    ensure_cpp_binary()

    results = {
        "helixzip_iterations": HELIX_ITERATIONS,
        "time_runs": TIME_RUNS,
        "compatibility": verify_cross_compatibility(),
        "hx7_compatibility": verify_hx7_compatibility(),
        "cases": [bench_case(case_name, data) for case_name, data in build_cases()],
        "hx7_cases": [bench_hx7_case(case_name, data) for case_name, data in build_cases()],
        "stream_parallel_cpp": stream_parallel_benchmark(),
    }

    print(json.dumps(results, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
