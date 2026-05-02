# HXZ7 Adaptive Hybrid Compression Design

Status: proposed next-generation design for HelixZip after the current `HXZ6` / `HXS4` / `HZS1` family.

Current implementation note:

- Phase 1 is now partially implemented in Python:
  - `HX7T` binary dictionaries
  - `HX7F` framed archives that reuse the current standalone and shared codecs per block
  - pragmatic `zlib` and `lzma` block fallbacks for chunks where the current HelixZip codecs lose badly
- entropy-coded LZ, richer transforms, and native `HXZ7` C++ support are still future work

This document describes a practical path from the current grammar-first prototype to a stronger general-purpose compressor that still supports:

- binary on-disk archives
- client-side lookup tables
- streaming
- multi-core processing
- compatibility between Python and C++

The key change is architectural: `HXZ7` is not "one algorithm". It is an adaptive framed container that chooses among several codecs and transforms per block.

## 1. Goals

- Compress mixed workloads better than the current HelixZip design.
- Stay competitive across text, web payloads, binary files, and structured records.
- Keep exact round-trip fidelity.
- Support bounded-memory streaming encode/decode.
- Support reusable client-side dictionaries in a binary format.
- Support per-block parallel encode/decode.
- Keep the format inspectable and implementable in both Python and C++.

## 2. Non-Goals

- Be the single best compressor on every workload.
- Replace highly specialized codecs for images, video, or audio.
- Preserve backward compatibility with `HXZ6` / `HXS4` / `HZS1`.
- Depend on JSON inside archives.

## 3. Core Idea

`HXZ7` should be a hybrid compressor with four layers:

1. **Framing layer**
   - streamable container of independently decodable blocks
2. **Transform layer**
   - optional reversible preprocessing for specific data shapes
3. **Block codec layer**
   - adaptive choice of the best codec for each block
4. **Entropy layer**
   - compact coding of literals, lengths, distances, and tokens

In short:

`input -> classify -> transform -> try candidate codecs -> entropy code -> write framed block`

## 4. Why This Direction

The current HelixZip prototype already proved a few important points:

- exact-repeat mode is excellent on highly repetitive data
- LZ mode closes a major gap on structured text
- shared tables help when a domain-specific client lookup exists
- streaming and multi-core matter in practice

The biggest remaining weaknesses are:

- no entropy coder after tokenization
- no real block classifier
- the older shared-table workflow was JSON-sidecar-heavy, and the `HXS4` path still relies on external dictionaries rather than first-class framed dictionary blocks
- grammar mode is too exposed as a primary strategy on general-purpose data

`HXZ7` addresses those gaps directly.

## 5. Proposed Archive Families

The next family should separate standalone, dictionary, and stream concerns more cleanly.

- `HX7F`: standalone framed archive
- `HX7D`: dictionary-framed archive using one or more external client dictionaries
- `HX7S`: streaming container of `HX7F` or `HX7D` frames
- `HX7T`: binary dictionary/table file distributed to clients

This keeps the "dictionary" concept explicit instead of treating it as a side feature.

## 6. Block Model

Each archive is a sequence of independent blocks. A block is the smallest codec-decision unit.

Recommended default block sizes:

- `32 KiB` for latency-sensitive or streaming use
- `64 KiB` default
- `256 KiB` optional high-ratio mode

Each block carries:

- uncompressed size
- compressed payload size
- block checksum
- codec id
- transform flags
- dictionary id, if any
- codec-specific metadata

Independent blocks give us:

- bounded memory
- parallelism
- corruption isolation
- easier codec experimentation
- future random access support

## 7. Candidate Codecs

`HXZ7` should support a small number of strong, complementary block codecs.

### 7.1 Raw

Used when compression is not helpful.

Best for:

- high-entropy data
- encrypted or already compressed payloads

### 7.2 RLE / Repeat

Generalizes the current repeat mode.

Best for:

- zero runs
- repeated bytes
- repeated short units
- repeated unit plus tail

Implementation:

- byte-run detection
- zero-run specialization
- short repeated phrase mode

### 7.3 LZ + Entropy

This should become the main general-purpose codec.

Best for:

- text
- web assets
- binaries with repeated fragments
- mixed structured payloads

Implementation:

- sliding window match finder
- literals + match lengths + match distances
- Huffman or ANS/FSE-style entropy coding

This is the workhorse codec that should carry most real workloads.

### 7.4 Dictionary-LZ + Entropy

Same as LZ, but seeded with one or more external dictionaries distributed to the client.

Best for:

- repeated web/API schemas
- logs
- recurring document families
- structured enterprise datasets

Implementation:

- dictionary id in block header
- match references allowed into dictionary history
- optional local block history plus dictionary history

### 7.5 Grammar / Motif Codec

Keep HelixZip’s distinctive grammar path, but demote it to a specialized codec instead of making it the core path.

Best for:

- synthetic highly repetitive motifs
- domain-specific repeated symbolic patterns
- cases where pair-substitution clearly wins

Implementation:

- keep the current greedy grammar builder as an optional codec
- add it only when a quick probe indicates strong structural gain

This preserves the project’s original idea without forcing it onto unsuitable data.

## 8. Transform Layer

Transforms are reversible preprocessors applied before codec selection or before the final chosen codec.

### 8.1 Text/Web Transform

Detect likely UTF-8 / HTML / CSS / JS / JSON / XML / HTTP-like payloads.

Techniques:

- static token dictionary for common web substrings
- compact coding for common keys and tags
- newline and whitespace pattern normalization only if perfectly reversible

Example candidates for a built-in static dictionary:

- `content-type`
- `application/json`
- `<div`
- `</script>`
- `"id":`
- `"name":`

### 8.2 Binary Filters

Apply only when classification is confident.

Techniques:

- delta filter for numeric sequences
- zero-bias detection
- optional executable branch filter later

### 8.3 Record-Oriented Transform

For repeated structured records:

- split common prefixes / field names / separators into tokens
- leave values as literals or LZ targets

This is especially relevant for LDIF, logs, CSV-like text, and telemetry.

## 9. Entropy Coding Layer

This is the most important upgrade.

Recommended path:

- **Phase 1**: canonical Huffman
- **Phase 2**: table-based ANS/FSE-style entropy coding

Why:

- Huffman is much easier to implement and debug in both Python and C++
- ANS/FSE-style coding is a strong follow-up once the token model is stable

Entropy coding should be applied to:

- literal streams
- match length symbols
- match distance slot symbols
- transform tokens
- grammar symbols where applicable

Without this layer, HelixZip will continue to lose badly to mature codecs on many real workloads.

## 10. Client Dictionary Design

The current JSON sidecar needs to become a binary dictionary format.

### 10.1 Dictionary File: `HX7T`

Dictionary contents:

- magic + version
- dictionary id
- training metadata
- token dictionary section
- grammar/rule section, if used
- raw byte corpus shards for LZ priming, if used
- checksum

### 10.2 Dictionary Types

`HXZ7` should support multiple dictionary styles under one container:

- static token dictionary
- LZ history dictionary
- grammar motif dictionary
- hybrid dictionary

### 10.3 Decode Rules

Blocks may reference:

- no dictionary
- one dictionary id
- one dictionary id plus small local delta additions

Decoder behavior:

- fail clearly if dictionary is required but missing
- validate dictionary id and checksum

## 11. Streaming Design

Streaming should be first-class, not an afterthought.

`HX7S` stream layout:

- stream prelude
- repeated block frames
- optional end marker / footer summary

Each frame should be independently decodable and self-describing enough that a decoder can:

- process bytes incrementally
- emit output as frames complete
- skip unknown future optional sections

Streaming requirements:

- no need to buffer the full file
- frame boundaries preserved
- optional flush points for network streaming

## 12. Multi-Core Design

Parallelism should be block-based.

Encoder:

- reader thread fills block queue
- worker pool compresses blocks independently
- writer thread emits blocks in original order

Decoder:

- reader parses frame headers
- workers decode blocks independently
- writer emits restored bytes in order

Recommended native design:

- dedicated thread pool in C++
- bounded work queue
- avoid `std::async` for predictable performance

Recommended Python design:

- `multiprocessing` for CPU-heavy work
- reuse long-lived worker pools

## 13. Block Classification And Scoring

`HXZ7` needs a lightweight classifier before trying expensive codecs.

Features to sample:

- byte histogram
- zero ratio
- repeat score
- UTF-8 likelihood
- common delimiter frequency
- top n-gram counts
- entropy estimate

From those features, choose which candidates to test:

- noisy data: `raw`, maybe fast LZ only
- exact repeat: `repeat`
- structured text: `LZ+entropy`, maybe grammar
- dictionary-covered data: `dict-LZ+entropy`

Scoring policy should support at least two modes:

- `best-size`
- `balanced`

The default should be `balanced`, because the absolute smallest codec is not always worth extreme CPU time.

## 14. Suggested On-Disk Block Header

This is a sketch, not a frozen format.

Common block header fields:

- `codec_id`
- `transform_flags`
- `dict_flags`
- `raw_size`
- `compressed_size`
- `checksum`
- `codec_meta_size`

Then:

- codec metadata blob
- compressed payload blob

This allows adding codecs later without redesigning the entire file format.

## 15. Initial Codec IDs

Recommended initial block codec ids:

- `0 = raw`
- `1 = rle`
- `2 = repeat-unit`
- `3 = lz-huff`
- `4 = dict-lz-huff`
- `5 = grammar`
- `6 = dict-grammar`

Transforms can remain orthogonal flags rather than separate codecs.

## 16. Implementation Roadmap

This should be delivered in phases so the repo stays usable and benchmarkable.

### Phase 1: Container And Binary Dictionaries

- add `HX7T` binary dictionary format
- add versioned framed block container
- keep `raw`, `repeat`, and current `lz` as initial block codecs
- add basic block checksums

Outcome:

- modern framing
- binary client lookup support
- no JSON in the hot path

### Phase 2: Entropy-Coded LZ

- replace current plain LZ payload with tokenized LZ
- add canonical Huffman coding
- build encode/decode tables in Python and C++
- benchmark against current `lz`

Outcome:

- major ratio improvement on general-purpose data

### Phase 3: Dictionary-Primed LZ

- teach encoder/decoder to use external binary dictionaries
- support dictionary match references
- add dictionary-aware streaming blocks

Outcome:

- strong gains on recurring domains and client/server workflows

### Phase 4: Better Classification

- add per-block feature extraction
- avoid trying codecs that are clearly poor fits
- add `best-size` and `balanced` modes

Outcome:

- better time/ratio tradeoff

### Phase 5: Specialized Transforms

- web/text static dictionary
- record-oriented transform
- delta filter for numeric patterns

Outcome:

- better performance on text, web, and structured binary workloads

### Phase 6: Grammar As Specialist Codec

- port current grammar engine into the `HXZ7` codec framework
- add better gating so it runs only when it is likely to win
- optionally entropy-code grammar payloads too

Outcome:

- preserves HelixZip’s differentiator without hurting general-purpose cases

### Phase 7: Native Runtime Tuning

- C++ thread pool
- faster match finder
- better memory reuse
- SIMD/hash optimizations later

Outcome:

- closes the time gap with mature codecs

## 17. Benchmark Plan

The project should keep the current historical benchmark style, but add broader corpora.

Recommended benchmark groups:

- exact repeats
- repeated structured text
- HTML/CSS/JS bundles
- JSON API payloads
- mixed text documents
- random binary
- executables / object files
- already-compressed files
- real client-dictionary corpora

For every iteration, record:

- compressed bytes
- compression ratio
- encode wall time
- decode wall time
- memory estimate
- selected codec distribution by block

Comparison targets:

- `zlib`
- `gzip`
- `bz2`
- `lzma/xz`
- `lz4` later if added locally
- `zstd` later if added locally
- current `HXZ6`

## 18. Recommended Next Code Changes In This Repo

The safest next implementation sequence is:

1. Add a new `HX7T` binary dictionary file alongside the existing JSON table workflow.
2. Add a new framed archive family with per-block `codec_id`.
3. Reuse current `raw`, `repeat`, and `lz` codecs as initial block codecs.
4. Add canonical Huffman to the LZ path.
5. Move shared-table support into C++ using the new binary dictionary.
6. Then revisit grammar integration.

This keeps progress incremental and measurable.

## 19. Recommendation

If the goal is the strongest practical compressor this project can realistically build, the right strategy is:

- make **LZ + entropy coding** the primary general-purpose path
- make **client dictionaries** first-class and binary
- keep **repeat** and **raw** as cheap specialist modes
- keep **grammar** as an optional specialist codec, not the default worldview
- keep everything inside a **streamable, block-based framed format**

That is the most credible path to a compressor that works well across text, web, binary, and client/dictionary-assisted workflows.
