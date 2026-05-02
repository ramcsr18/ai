import contextlib
import io
import json
import unittest
import random
from pathlib import Path
from tempfile import TemporaryDirectory

from helixzip import (
    AUTO_SHARED_TABLE_SUFFIX,
    BODY_MODE_GRAMMAR,
    BODY_MODE_LZ,
    BODY_MODE_RAW,
    BODY_MODE_REPEAT,
    BUNDLE_ENTRY_DIR,
    BUNDLE_ENTRY_FILE,
    HelixArchive,
    SharedHelixArchive,
    SharedTable,
    collect_bundle_entries,
    compress,
    compress_with_table,
    decode_bundle,
    encode_bundle,
    load_shared_table,
    main,
    read_hx7_prelude,
    read_stream_prelude,
    read_stream_archive,
    shared_archive_size,
    standalone_archive_size,
    write_hx7_archive,
    write_stream_archive,
)


class HelixZipTests(unittest.TestCase):
    def run_cli(self, *argv: str) -> str:
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            exit_code = main(list(argv))
        self.assertEqual(exit_code, 0)
        return stdout.getvalue()

    def roundtrip(self, payload: bytes, iterations: int = 64) -> HelixArchive:
        archive = compress(payload, max_iterations=iterations)
        encoded = archive.to_bytes()
        decoded = HelixArchive.from_bytes(encoded).decode()
        self.assertEqual(decoded, payload)
        return archive

    def test_roundtrip_text(self) -> None:
        payload = (b"DNA inspired compression is really grammar compression wearing a lab coat.\n" * 16)
        archive = self.roundtrip(payload)
        if archive.body_mode == BODY_MODE_RAW:
            self.assertEqual(archive.lookup_table(resolve=False), [])
        elif archive.body_mode == BODY_MODE_LZ:
            self.assertGreater(len(archive.lz_payload), 0)
        elif archive.body_mode == BODY_MODE_REPEAT:
            self.assertGreater(archive.repeat_count, 1)
        else:
            self.assertGreater(len(archive.rules), 0)

    def test_roundtrip_binary(self) -> None:
        payload = bytes(range(256)) * 4
        self.roundtrip(payload)

    def test_empty_payload(self) -> None:
        self.roundtrip(b"")

    def test_repetitive_data_compresses(self) -> None:
        payload = (b"ACGTACGTACGTACGT" * 128) + (b"GENE" * 128)
        archive = compress(payload, max_iterations=128)
        self.assertLess(len(archive.to_bytes()), len(payload))

    def test_auto_iterations_roundtrip(self) -> None:
        payload = (b"DNA_MODEL_" * 256) + (b"ACGT" * 512) + b"PATIENT_VARIANT_001"
        archive = compress(payload, max_iterations=None)
        decoded = HelixArchive.from_bytes(archive.to_bytes())

        self.assertEqual(decoded.decode(), payload)
        self.assertEqual(decoded.requested_iterations, archive.requested_iterations)
        if decoded.body_mode == BODY_MODE_GRAMMAR:
            self.assertGreater(decoded.requested_iterations, 0)

    def test_shared_table_roundtrip(self) -> None:
        training = (b"GENE_SEQUENCE_BLOCK_" * 96) + (b"ACGT" * 256)
        table = SharedTable.from_archive(compress(training, max_iterations=96))

        payload = (b"GENE_SEQUENCE_BLOCK_" * 32) + (b"ACGT" * 64) + b"PATIENT_VARIANT_001"
        archive = compress_with_table(payload, table, max_iterations=48)

        encoded = archive.to_bytes()
        decoded = SharedHelixArchive.from_bytes(encoded).decode(table)
        self.assertEqual(decoded, payload)
        self.assertEqual(SharedHelixArchive.from_bytes(encoded).table_id, table.table_id)

    def test_shared_table_can_beat_plain_archive(self) -> None:
        training = (b"AAACCCGGGTTT" * 128) + (b"DNA_MODEL_" * 128)
        table = SharedTable.from_archive(compress(training, max_iterations=96))
        payload = (b"DNA_MODEL_" * 64) + (b"AAACCCGGGTTT" * 64)

        shared = compress_with_table(payload, table, max_iterations=48)

        self.assertLess(len(shared.to_bytes()), len(payload))
        self.assertEqual(SharedHelixArchive.from_bytes(shared.to_bytes()).table_id, table.table_id)

    def test_shared_table_binary_roundtrip(self) -> None:
        training = (b"GENE_SEQUENCE_BLOCK_" * 64) + (b"ACGT" * 128)
        table = SharedTable.build(training, max_iterations=64)
        encoded = table.to_bytes()
        decoded = SharedTable.from_bytes(encoded)

        self.assertEqual(decoded, table)
        self.assertEqual(load_shared_table(Path(self.make_temp_file(encoded))), table)

    def make_temp_file(self, payload: bytes) -> str:
        tmpdir = TemporaryDirectory()
        self.addCleanup(tmpdir.cleanup)
        path = Path(tmpdir.name) / "payload.bin"
        path.write_bytes(payload)
        return str(path)

    def test_structured_text_can_use_lz_mode(self) -> None:
        records = []
        for index in range(200):
            records.append(
                (
                    f"dn: uid=user{index:05d},ou=people,dc=example,dc=com\n"
                    f"uid: user{index:05d}\n"
                    f"cn: Example User {index:05d}\n"
                    f"mail: user{index:05d}@example.com\n"
                    "objectClass: top\n"
                    "objectClass: person\n"
                    "objectClass: organizationalPerson\n"
                    "objectClass: inetOrgPerson\n\n"
                ).encode("utf-8")
            )
        payload = b"".join(records)
        archive = compress(payload, max_iterations=None)
        decoded = HelixArchive.from_bytes(archive.to_bytes())

        self.assertEqual(decoded.decode(), payload)
        self.assertEqual(decoded.body_mode, BODY_MODE_LZ)
        self.assertLess(len(archive.to_bytes()), len(payload))

    def test_size_estimators_match_serialized_archives(self) -> None:
        standalone_cases = [
            compress((b"DNA_MODEL_" * 96) + (b"ACGT" * 64), max_iterations=64),
            compress(bytes(range(256)) * 4, max_iterations=16),
            compress(b"ACGT" * 4096, max_iterations=16),
            compress(
                (
                    b"dn: uid=user00001,ou=people,dc=example,dc=com\n"
                    b"uid: user00001\n"
                    b"cn: Example User 00001\n"
                    b"mail: user00001@example.com\n"
                    b"objectClass: top\n"
                    b"objectClass: person\n\n"
                )
                * 32,
                max_iterations=None,
            ),
        ]
        for archive in standalone_cases:
            self.assertEqual(standalone_archive_size(archive), len(archive.to_bytes()))

        table = SharedTable.build((b"DNA_MODEL_" * 128) + (b"ACGT" * 128), max_iterations=64)
        shared = compress_with_table((b"DNA_MODEL_" * 32) + (b"ACGT" * 64), table, max_iterations=None)
        self.assertEqual(shared_archive_size(shared), len(shared.to_bytes()))

    def test_archive_header_carries_lookup_and_iterations(self) -> None:
        payload = b"ACGT" * 64
        archive = compress(payload, max_iterations=21)
        encoded = archive.to_bytes()
        decoded = HelixArchive.from_bytes(encoded)

        self.assertEqual(decoded.decode(), payload)
        self.assertEqual(decoded.requested_iterations, 21)
        if decoded.body_mode == BODY_MODE_GRAMMAR:
            self.assertEqual(len(decoded.rules), len(archive.rules))
            self.assertGreater(len(decoded.lookup_table(resolve=False)), 0)
        elif decoded.body_mode == BODY_MODE_LZ:
            self.assertGreater(len(decoded.lz_payload), 0)
        elif decoded.body_mode == BODY_MODE_REPEAT:
            self.assertGreater(decoded.repeat_count, 1)
        else:
            self.assertEqual(decoded.lookup_table(resolve=False), [])

    def test_shared_archive_header_carries_lookup_and_iterations(self) -> None:
        training = (b"GENE_SEQUENCE_BLOCK_" * 48) + (b"ACGT" * 128)
        table = SharedTable.from_archive(compress(training, max_iterations=64))
        payload = (b"GENE_SEQUENCE_BLOCK_" * 16) + b"PATIENT_VARIANT_001"
        archive = compress_with_table(payload, table, max_iterations=17)
        encoded = archive.to_bytes()
        decoded = SharedHelixArchive.from_bytes(encoded)

        self.assertEqual(decoded.decode(table), payload)
        self.assertEqual(decoded.requested_iterations, 17)
        self.assertEqual(len(decoded.delta_rules), len(archive.delta_rules))

    def test_incompressible_data_can_fall_back_to_raw_body(self) -> None:
        rng = random.Random(12345)
        payload = bytes(rng.getrandbits(8) for _ in range(8192))
        archive = compress(payload, max_iterations=16)
        encoded = archive.to_bytes()
        decoded = HelixArchive.from_bytes(encoded)

        self.assertEqual(decoded.decode(), payload)
        self.assertEqual(decoded.body_mode, BODY_MODE_RAW)
        self.assertLess(len(encoded), len(payload) + 128)
        self.assertEqual(decoded.lookup_table(resolve=False), [])

    def test_exact_repeating_pattern_can_use_repeat_mode(self) -> None:
        payload = b"ACGT" * 4096
        archive = compress(payload, max_iterations=16)
        encoded = archive.to_bytes()
        decoded = HelixArchive.from_bytes(encoded)

        self.assertEqual(decoded.decode(), payload)
        self.assertEqual(decoded.body_mode, BODY_MODE_REPEAT)
        self.assertEqual(decoded.repeat_unit, b"ACGT")
        self.assertEqual(decoded.repeat_count, 4096)
        self.assertEqual(decoded.lookup_table(resolve=False), [])

    def test_repeating_pattern_with_tail_can_use_repeat_mode(self) -> None:
        unit = b"DNA inspired compression is really grammar compression wearing a lab coat.\n"
        payload = (unit * 400) + unit[:37]
        archive = compress(payload, max_iterations=16)
        decoded = HelixArchive.from_bytes(archive.to_bytes())

        self.assertEqual(decoded.decode(), payload)
        self.assertEqual(decoded.body_mode, BODY_MODE_REPEAT)
        self.assertEqual(decoded.repeat_unit, unit)
        self.assertEqual(decoded.repeat_count, 400)
        self.assertEqual(decoded.repeat_tail, unit[:37])

    def test_stream_archive_roundtrip(self) -> None:
        payload = (b"ACGT" * 10000) + (b"\x00" * 5000) + (b"GENE_SEQUENCE_BLOCK_" * 400)
        with TemporaryDirectory() as tmpdir:
            source = Path(tmpdir) / "input.bin"
            archive_path = Path(tmpdir) / "stream.hzs"
            restored = Path(tmpdir) / "restored.bin"
            source.write_bytes(payload)

            compress_report = write_stream_archive(source, archive_path, chunk_size=4096, max_iterations=16)
            decompress_report = read_stream_archive(archive_path, restored)

            self.assertEqual(restored.read_bytes(), payload)
            self.assertEqual(decompress_report["restored_bytes"], len(payload))
            self.assertEqual(compress_report["chunks"], decompress_report["chunks"])
            self.assertGreater(compress_report["repeat_chunks"], 0)

    def test_hx7_archive_roundtrip_without_dictionary(self) -> None:
        payload = (b"ACGT" * 10000) + (b"\x00" * 5000) + (b"GENE_SEQUENCE_BLOCK_" * 400)
        with TemporaryDirectory() as tmpdir:
            source = Path(tmpdir) / "input.bin"
            archive_path = Path(tmpdir) / "archive.hx7"
            restored = Path(tmpdir) / "restored.bin"
            source.write_bytes(payload)

            compress_report = write_hx7_archive(source, archive_path, chunk_size=4096, max_iterations=16)
            self.run_cli("decompress-hx7", str(archive_path), str(restored))

            self.assertEqual(restored.read_bytes(), payload)
            self.assertEqual(compress_report["blocks"], 13)
            self.assertEqual(read_hx7_prelude(archive_path)[2], 2)
            self.assertEqual(read_hx7_prelude(archive_path)[3], None)

    def test_hx7_archive_can_choose_lzma_block(self) -> None:
        records = []
        for index in range(120):
            records.append(
                (
                    f"dn: uid=user{index:05d},ou=people,dc=example,dc=com\n"
                    f"uid: user{index:05d}\n"
                    f"cn: Example User {index:05d}\n"
                    f"mail: user{index:05d}@example.com\n"
                    "objectClass: top\n"
                    "objectClass: person\n"
                    "objectClass: organizationalPerson\n"
                    "objectClass: inetOrgPerson\n\n"
                ).encode("utf-8")
            )
        payload = b"".join(records)
        with TemporaryDirectory() as tmpdir:
            source = Path(tmpdir) / "input.bin"
            archive_path = Path(tmpdir) / "archive.hx7"
            restored = Path(tmpdir) / "restored.bin"
            source.write_bytes(payload)

            compress_report = write_hx7_archive(source, archive_path, chunk_size=65536, max_iterations=16)
            inspect_report = json.loads(self.run_cli("inspect-hx7", str(archive_path)))
            self.run_cli("decompress-hx7", str(archive_path), str(restored))

            self.assertEqual(restored.read_bytes(), payload)
            self.assertGreaterEqual(compress_report["lzma_blocks"], 1)
            self.assertGreaterEqual(inspect_report["lzma_blocks"], 1)

    def test_hx7_archive_can_choose_zlib_block(self) -> None:
        rng = random.Random(12345)
        payload = bytes(rng.getrandbits(8) for _ in range(8192))
        with TemporaryDirectory() as tmpdir:
            source = Path(tmpdir) / "input.bin"
            archive_path = Path(tmpdir) / "archive.hx7"
            restored = Path(tmpdir) / "restored.bin"
            source.write_bytes(payload)

            compress_report = write_hx7_archive(source, archive_path, chunk_size=65536, max_iterations=16)
            inspect_report = json.loads(self.run_cli("inspect-hx7", str(archive_path)))
            self.run_cli("decompress-hx7", str(archive_path), str(restored))

            self.assertEqual(restored.read_bytes(), payload)
            self.assertGreaterEqual(compress_report["zlib_blocks"], 1)
            self.assertGreaterEqual(inspect_report["zlib_blocks"], 1)

    def test_hx7_archive_roundtrip_with_binary_dictionary(self) -> None:
        training = b"DNA_MODEL_" * 2048
        payload = b"DNA_MODEL_" * 512
        table = SharedTable.build(training, max_iterations=96)
        with TemporaryDirectory() as tmpdir:
            source = Path(tmpdir) / "input.bin"
            archive_path = Path(tmpdir) / "archive.hx7"
            restored = Path(tmpdir) / "restored.bin"
            table_path = Path(tmpdir) / "client.hx7t"
            source.write_bytes(payload)
            table_path.write_bytes(table.to_bytes())

            compress_report = write_hx7_archive(
                source,
                archive_path,
                chunk_size=16384,
                max_iterations=16,
                table=table,
            )
            decompress_report = self.run_cli(
                "decompress-hx7",
                str(archive_path),
                str(restored),
                "--table",
                str(table_path),
            )

            self.assertEqual(restored.read_bytes(), payload)
            self.assertEqual(read_hx7_prelude(archive_path)[2], 2)
            self.assertEqual(read_hx7_prelude(archive_path)[3], table.table_id)
            self.assertGreaterEqual(compress_report["shared_blocks"], 1)
            self.assertIn(table.table_id, decompress_report)

    def test_hx7_archive_roundtrip_with_multiple_workers(self) -> None:
        payload = (b"ACGT" * 12000) + (b"\x00" * 8000) + (b"GENE_SEQUENCE_BLOCK_" * 600)
        with TemporaryDirectory() as tmpdir:
            source = Path(tmpdir) / "input.bin"
            archive_path = Path(tmpdir) / "archive.hx7"
            restored = Path(tmpdir) / "restored.bin"
            source.write_bytes(payload)

            compress_report = write_hx7_archive(
                source,
                archive_path,
                chunk_size=4096,
                max_iterations=16,
                workers=2,
            )
            decompress_report = json.loads(
                self.run_cli("decompress-hx7", str(archive_path), str(restored), "--workers", "2")
            )

            self.assertEqual(restored.read_bytes(), payload)
            self.assertEqual(compress_report["workers"], 2)
            self.assertEqual(decompress_report["workers"], 2)
            self.assertEqual(compress_report["blocks"], decompress_report["blocks"])

    def test_bundle_binary_roundtrip(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "dataset"
            (root / "nested").mkdir(parents=True)
            (root / "empty").mkdir()
            (root / "alpha.txt").write_text("alpha\n", encoding="utf-8")
            (root / "nested" / "beta.bin").write_bytes(b"\x00\x01\x02")

            entries = collect_bundle_entries([root], includes=[], excludes=[])
            decoded = decode_bundle(encode_bundle(entries))

            self.assertEqual(entries, decoded)
            self.assertIn((BUNDLE_ENTRY_DIR, "dataset"), {(entry.entry_type, entry.path) for entry in entries})
            self.assertIn((BUNDLE_ENTRY_FILE, "dataset/alpha.txt"), {(entry.entry_type, entry.path) for entry in entries})

    def test_hx7_bundle_cli_roundtrip_with_filters(self) -> None:
        with TemporaryDirectory() as tmpdir:
            source = Path(tmpdir) / "source"
            archive_path = Path(tmpdir) / "bundle.hx7"
            restored = Path(tmpdir) / "restored"
            (source / "docs").mkdir(parents=True)
            (source / "docs" / "keep.txt").write_text("important\n", encoding="utf-8")
            (source / "docs" / "skip.tmp").write_text("ignore\n", encoding="utf-8")
            (source / "logs").mkdir()
            (source / "logs" / "app.log").write_text("log\n", encoding="utf-8")

            output = json.loads(
                self.run_cli(
                    "compress-bundle-hx7",
                    str(archive_path),
                    str(source),
                    "--include",
                    "*.txt",
                    "--exclude",
                    "*.tmp",
                    "--chunk-size",
                    "4096",
                )
            )
            restore_output = json.loads(
                self.run_cli(
                    "decompress-bundle-hx7",
                    str(archive_path),
                    str(restored),
                )
            )

            self.assertTrue((restored / "source").is_dir())
            self.assertEqual((restored / "source" / "docs" / "keep.txt").read_text(encoding="utf-8"), "important\n")
            self.assertFalse((restored / "source" / "docs" / "skip.tmp").exists())
            self.assertFalse((restored / "source" / "logs" / "app.log").exists())
            self.assertEqual(output["files"], 1)
            self.assertGreaterEqual(output["directories"], 2)
            self.assertEqual(restore_output["files"], 1)

    def test_hx7_bundle_cli_supports_multiple_inputs(self) -> None:
        with TemporaryDirectory() as tmpdir:
            source_dir = Path(tmpdir) / "tree"
            archive_path = Path(tmpdir) / "multi.hx7"
            restored = Path(tmpdir) / "restored"
            single_file = Path(tmpdir) / "note.txt"
            (source_dir / "nested").mkdir(parents=True)
            (source_dir / "nested" / "data.txt").write_text("nested\n", encoding="utf-8")
            single_file.write_text("top\n", encoding="utf-8")

            self.run_cli(
                "compress-bundle-hx7",
                str(archive_path),
                str(source_dir),
                str(single_file),
                "--chunk-size",
                "4096",
            )
            self.run_cli("decompress-bundle-hx7", str(archive_path), str(restored))

            self.assertEqual((restored / "tree" / "nested" / "data.txt").read_text(encoding="utf-8"), "nested\n")
            self.assertEqual((restored / "note.txt").read_text(encoding="utf-8"), "top\n")

    def test_stream_archive_roundtrip_with_multiple_workers(self) -> None:
        payload = (b"ACGT" * 12000) + (b"\x00" * 8000) + (b"GENE_SEQUENCE_BLOCK_" * 600)
        with TemporaryDirectory() as tmpdir:
            source = Path(tmpdir) / "input.bin"
            archive_path = Path(tmpdir) / "stream.hzs"
            restored = Path(tmpdir) / "restored.bin"
            source.write_bytes(payload)

            compress_report = write_stream_archive(
                source,
                archive_path,
                chunk_size=4096,
                max_iterations=16,
                workers=2,
            )
            decompress_report = read_stream_archive(archive_path, restored, workers=2)

            self.assertEqual(restored.read_bytes(), payload)
            self.assertEqual(compress_report["workers"], 2)
            self.assertEqual(decompress_report["workers"], 2)
            self.assertEqual(compress_report["chunks"], decompress_report["chunks"])

    def test_cli_stream_archive_can_omit_iterations(self) -> None:
        payload = (b"ACGT" * 6000) + (b"GENE_SEQUENCE_BLOCK_" * 200)
        with TemporaryDirectory() as tmpdir:
            source = Path(tmpdir) / "input.bin"
            archive_path = Path(tmpdir) / "stream.hzs"
            restored = Path(tmpdir) / "restored.bin"
            source.write_bytes(payload)

            self.run_cli("compress-stream", str(source), str(archive_path), "--chunk-size", "4096")
            self.run_cli("decompress-stream", str(archive_path), str(restored))

            self.assertEqual(restored.read_bytes(), payload)
            self.assertEqual(read_stream_prelude(archive_path)[1], 0)

    def test_cli_shared_archive_can_autogenerate_table(self) -> None:
        payload = (b"DNA_MODEL_" * 512) + (b"ACGT" * 256) + b"PATIENT_VARIANT_001"
        with TemporaryDirectory() as tmpdir:
            source = Path(tmpdir) / "input.bin"
            archive_path = Path(tmpdir) / "payload.hxs"
            restored = Path(tmpdir) / "restored.bin"
            source.write_bytes(payload)

            self.run_cli("compress-shared", str(source), str(archive_path))
            table_path = Path(f"{archive_path}{AUTO_SHARED_TABLE_SUFFIX}")

            self.assertTrue(table_path.exists())
            self.run_cli("decompress-shared", str(archive_path), str(restored))
            self.assertEqual(restored.read_bytes(), payload)

    def test_cli_hx7_archive_with_binary_table(self) -> None:
        training = (b"DNA_MODEL_" * 512) + (b"ACGT" * 256) + b"PATIENT_VARIANT_001"
        payload = (b"DNA_MODEL_" * 128) + (b"ACGT" * 64) + b"PATIENT_VARIANT_777"
        with TemporaryDirectory() as tmpdir:
            training_path = Path(tmpdir) / "training.bin"
            source = Path(tmpdir) / "input.bin"
            archive_path = Path(tmpdir) / "payload.hx7"
            table_path = Path(tmpdir) / "client.hx7t"
            restored = Path(tmpdir) / "restored.bin"
            training_path.write_bytes(training)
            source.write_bytes(payload)

            build_report = json.loads(
                self.run_cli("build-table", str(training_path), str(table_path))
            )
            compress_report = json.loads(
                self.run_cli(
                    "compress-hx7",
                    str(source),
                    str(archive_path),
                    "--table",
                    str(table_path),
                    "--chunk-size",
                    "4096",
                )
            )
            inspect_report = json.loads(
                self.run_cli("inspect-hx7", str(archive_path), "--table", str(table_path))
            )
            self.run_cli("decompress-hx7", str(archive_path), str(restored), "--table", str(table_path))

            self.assertEqual(restored.read_bytes(), payload)
            self.assertEqual(build_report["format"], "hx7t")
            self.assertEqual(compress_report["dictionary_id"], build_report["table_id"])
            self.assertEqual(inspect_report["dictionary_id"], build_report["table_id"])


if __name__ == "__main__":
    unittest.main()
