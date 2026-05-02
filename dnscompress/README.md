# HelixZip

HelixZip is a DNA-inspired compression prototype. It converts bytes into a four-base alphabet (`A/C/G/T`), then performs repeated pair-substitution passes to discover reusable "motifs". The compressed archive stores:

- a compact header block whose metadata is itself compressed with the same grammar scheme
- a packed symbol-stream body
- enough metadata for a client-side decoder to reconstruct the original bytes

For the architecture and file-format rationale behind the current implementation, see [DESIGN.md](DESIGN.md).
For the proposed next-generation adaptive hybrid design, see [HXZ7_DESIGN.md](HXZ7_DESIGN.md).

For standalone archives, HelixZip can also fall back to storing a raw body when grammar compression would not improve the result. That keeps the format more comparable to general-purpose compressors, which commonly emit uncompressed blocks when needed.

For exact repeated payloads such as `AAAA...` or `ACGTACGT...`, standalone archives can also switch to a compact repeat-pattern body mode instead of storing a grammar or raw bytes. The same mode also handles `repeat unit + tail` cases, which helps repeated corpora that end with a truncated final record.

For structured text or repeated fragments that are not exact whole-file repeats, standalone archives can also switch to an internal `lz` body mode. That closes the earlier gap where LDIF-like inputs often fell back to `raw` and showed effectively no compression.

This is a compression experiment, not a secure encryption scheme. If you want confidentiality, the recommended design is:

1. compress with HelixZip
2. encrypt the `.hxz` output with a standard cipher such as AES-GCM or ChaCha20-Poly1305

The prototype now supports two archive families:

- standalone archives: each file carries its own lookup table
- shared-table archives: clients keep a reusable table locally and payloads send only the compressed stream plus delta rules

Standalone archives auto-select between `grammar`, `raw`, `repeat`, and `lz` body modes. They also support a streamed container mode, where a large file is split into independent chunk frames so compression and decompression can run incrementally with bounded memory. Streamed archives can also use multiple worker processes so chunks compress and decompress in parallel on multi-core machines.

Phase 1 of the proposed `HXZ7` work is now implemented in Python as:

- `HX7T`: binary shared dictionary files
- `HX7F`: framed archives made of independent blocks

Each `HX7F` block currently compares four choices:

- standalone HelixZip block
- shared-table HelixZip block
- `zlib` block
- `lzma` block

The encoder stores whichever one is smallest for that chunk.

## C++ implementation

The repo now also includes a native C++ implementation in [helixzip_cpp.cpp](/Users/ryaratap/git/dnacompress/helixzip_cpp.cpp). It is compatible with the current standalone `HXZ6` archives, including `raw`, `repeat`, and `lz` body modes, and with streamed `HZS1` archives produced by the Python tool, so Python and C++ can decompress each other's outputs.

Build it with:

```bash
g++ -O3 -std=c++17 -pthread helixzip_cpp.cpp -lz -o helixzip_cpp
```

Supported C++ commands:

- `./helixzip_cpp compress input.bin output.hxz`
- `./helixzip_cpp decompress output.hxz restored.bin`
- `./helixzip_cpp inspect output.hxz`
- `./helixzip_cpp compress-stream input.bin output.hzs --chunk-size 65536 --workers 0`
- `./helixzip_cpp decompress-stream output.hzs restored.bin --workers 0`
- `./helixzip_cpp compress-hx7 input.bin output.hx7 --chunk-size 65536 --workers 0 --levels 3`
- `./helixzip_cpp decompress-hx7 output.hx7 restored.bin --workers 0`
- `./helixzip_cpp inspect-hx7 output.hx7`
- `./helixzip_cpp compress-bundle-hx7 bundle.hx7 project_dir assets --exclude '*.tmp' --exclude 'node_modules/*' --include '*.txt'`
- `./helixzip_cpp decompress-bundle-hx7 bundle.hx7 restored_dir --workers 0`

The current C++ implementation targets standalone and streamed archives, plus the native subset of `HX7F`.

Current `HX7F` C++ support:

- standalone HelixZip blocks
- `zlib` blocks
- multi-threaded block compression and decompression
- serial multi-level block wrapping

Current `HX7F` limitations in C++:

- shared-table `HX7T` blocks are still Python-only
- `lzma` HX7 blocks are still Python-only in this environment because the native `lzma` headers are unavailable

The Python CLI supports the same bundled-directory workflow:

```bash
python3 helixzip.py compress-bundle-hx7 bundle.hx7 project_dir assets --exclude '*.tmp' --exclude 'node_modules/*' --include '*.txt'
python3 helixzip.py decompress-bundle-hx7 bundle.hx7 restored_dir
```

Bundle behavior:

- accepts multiple files and directories in one archive
- preserves relative paths under each top-level input name
- stores bundle metadata in a compact binary payload before HX7 compression
- supports repeated `--include` and `--exclude` glob filters

## Why this matches your idea

- DNA-like encoding: raw bytes are transformed into a nucleotide-style alphabet.
- Client-side lookup tables: the decoder rebuilds content from a compact stream plus motif rules.
- Multiple iterations: the compressor repeatedly adds rules and keeps the best result it finds.
- Portable prototype: implemented as a single Python script with no third-party dependencies.

## Format sketch

1. Each byte becomes 4 bases using 2-bit chunks.
2. The compressor finds the most reusable adjacent symbol pair.
3. That pair becomes a new derived symbol, similar to a biological motif or gene fragment.
4. The process repeats until additional rules stop reducing size.
5. The archive stores a compact compressed header block with lookup rules, iteration counts, and stream metadata, followed by the compressed payload body.

## Usage

Compress a file:

```bash
python3 helixzip.py compress input.bin output.hxz
```

Compress a file as a streamed archive of chunk frames:

```bash
python3 helixzip.py compress-stream input.bin output.hzs --chunk-size 65536
```

Compress a stream archive with multiple worker processes:

```bash
python3 helixzip.py compress-stream input.bin output.hzs --chunk-size 65536 --workers 0
```

Build a reusable client-side table from training data:

```bash
python3 helixzip.py build-table training.bin client_table.hx7t
```

Build a legacy JSON table instead:

```bash
python3 helixzip.py build-table training.bin client_table.json --json
```

Compress against that shared table:

```bash
python3 helixzip.py compress-shared input.bin output.hxs --table client_table.hx7t
```

Compress into an `HX7F` framed archive with optional client dictionary support:

```bash
python3 helixzip.py compress-hx7 input.bin output.hx7 --table client_table.hx7t --chunk-size 65536
```

Compress in shared mode without providing a table:

```bash
python3 helixzip.py compress-shared input.bin output.hxs
```

Inspect the archive and resolved motifs:

```bash
python3 helixzip.py inspect output.hxz --resolve
```

Inspect a shared archive:

```bash
python3 helixzip.py inspect-shared output.hxs --resolve
```

Inspect an `HX7F` archive and its per-block codec choices:

```bash
python3 helixzip.py inspect-hx7 output.hx7 --table client_table.hx7t
```

Decompress the file:

```bash
python3 helixzip.py decompress output.hxz restored.bin
```

Decompress a streamed archive:

```bash
python3 helixzip.py decompress-stream output.hzs restored.bin
```

Decompress a stream archive with multiple workers:

```bash
python3 helixzip.py decompress-stream output.hzs restored.bin --workers 0
```

Decompress a shared archive with the client-side table:

```bash
python3 helixzip.py decompress-shared output.hxs restored.bin
```

Decompress an `HX7F` archive:

```bash
python3 helixzip.py decompress-hx7 output.hx7 restored.bin --table client_table.hx7t
```

When `--iterations` is omitted, HelixZip auto-tunes the grammar pass budget and stores the chosen value in each standalone frame/header. Standalone compression will also auto-select the best available body mode and report it as `body_mode` in the CLI JSON output. In shared mode, omitting `--table` now generates a sibling binary dictionary at `<archive>.table.hx7t`, and `decompress-shared` / `inspect-shared` will reuse that sibling automatically when present. Shared-table commands still accept legacy JSON tables, but the binary `HX7T` format is now the default metadata path.

Run tests:

```bash
python3 -m unittest -v
```

## Shared-table workflow

The shared mode is the client/server version of your original idea:

1. train a shared table on representative data
2. distribute that table to clients once
3. compress new files against the shared table
4. send only the compact archive and table identifier
5. let the client reconstruct the original bytes with its local table plus any delta rules

This works best for recurring content domains such as genomic records, medical templates, telemetry, structured logs, or families of related documents where motifs repeat across many files.
