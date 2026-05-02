# HelixZip

HelixZip is a DNA-inspired compression prototype. It converts bytes into a four-base alphabet (`A/C/G/T`), then performs repeated pair-substitution passes to discover reusable "motifs". The compressed archive stores:

- a compact symbol stream
- a lookup table of derived motifs
- enough metadata for a client-side decoder to reconstruct the original bytes

This is a compression experiment, not a secure encryption scheme. If you want confidentiality, the recommended design is:

1. compress with HelixZip
2. encrypt the `.hxz` output with a standard cipher such as AES-GCM or ChaCha20-Poly1305

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

Inspect the archive and resolved motifs:

```bash
python3 helixzip.py inspect output.hxz --resolve
```

Decompress the file:

```bash
python3 helixzip.py decompress output.hxz restored.bin
```

Run tests:

```bash
python3 -m unittest -v
```

## Notes on lookup tables

The current prototype stores the rule table inside each archive so decoding is self-contained. In a production client/server design, you could ship a stable shared table to clients and transmit only:

- rule deltas
- payload symbol stream
- version metadata for table compatibility

That would make the client-side lookup-table idea even stronger for recurring content domains such as genomic records, medical templates, or repeated structured documents.
