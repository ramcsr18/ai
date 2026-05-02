# HelixZip

HelixZip is a DNA-inspired compression prototype. It converts bytes into a four-base alphabet (`A/C/G/T`), then performs repeated pair-substitution passes to discover reusable "motifs". The compressed archive stores:

- a compact symbol stream
- a lookup table of derived motifs
- enough metadata for a client-side decoder to reconstruct the original bytes

This is a compression experiment, not a secure encryption scheme. If you want confidentiality, the recommended design is:

1. compress with HelixZip
2. encrypt the `.hxz` output with a standard cipher such as AES-GCM or ChaCha20-Poly1305

The prototype now supports two modes:

- standalone archives: each file carries its own lookup table
- shared-table archives: clients keep a reusable table locally and payloads send only the compressed stream plus delta rules

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
5. The archive stores the final symbol stream and the lookup rules needed by the decoder.

## Usage

Compress a file:

```bash
python3 helixzip.py compress input.bin output.hxz --iterations 64 --table lookup.json
```

Build a reusable client-side table from training data:

```bash
python3 helixzip.py build-table training.bin client_table.json --iterations 96
```

Compress against that shared table:

```bash
python3 helixzip.py compress-shared input.bin output.hxs --table client_table.json --iterations 32
```

Inspect the archive and resolved motifs:

```bash
python3 helixzip.py inspect output.hxz --resolve
```

Inspect a shared archive:

```bash
python3 helixzip.py inspect-shared output.hxs --table client_table.json --resolve
```

Decompress the file:

```bash
python3 helixzip.py decompress output.hxz restored.bin
```

Decompress a shared archive with the client-side table:

```bash
python3 helixzip.py decompress-shared output.hxs restored.bin --table client_table.json
```

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
