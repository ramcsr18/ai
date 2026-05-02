# HelixZip Benchmark History

These numbers track the main archive-size milestones across format iterations and the current time/size comparisons against other codecs and against the C++ CLI.

## Cases

- `zeros-1k`: 1024 bytes of `0x00`
- `zeros-64k`: 65536 bytes of `0x00`
- `acgt-64k`: 65536 bytes of repeating `ACGT`
- `zeros-shared-1024`: 1024 bytes of `0x00` against a shared table trained on 65536 zero bytes
- `zeros-shared-65536`: 65536 bytes of `0x00` against that same shared table

## Iterations

These rows come from [benchmark_helixzip.py](benchmark_helixzip.py) and capture the archive size in bytes for each format iteration.

| Iteration | Format change | zeros-1k | zeros-64k | acgt-64k | zeros-shared-1024 | zeros-shared-65536 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | `HXZ2/HXS2` binary header/body with legacy compatibility still present | 36 | 50 | 64 | 32 | 37 |
| 2 | `HXZ3/HXS3` forward-only binary layout, derived widths/lengths, no legacy reader | 32 | 46 | 60 | 28 | 33 |
| 3 | `HXZ3/HXS3` shared table id stored as raw 8-byte digest | 32 | 46 | 60 | 19 | 24 |
| 4 | `HXZ4/HXS4` header metadata compressed with the same grammar algorithm | 35 | 49 | 63 | 22 | 27 |
| 5 | `HXZ5/HXS4` standalone raw fallback plus early grammar bail-out for fairer general-purpose behavior | 36 | 50 | 64 | 22 | 27 |
| 6 | `HXZ6/HXS4` standalone repeat-pattern mode plus streamed frame support | 16 | 18 | 21 | 22 | 27 |
| 7 | `HXZ6/HXS4` repeat-with-tail detection plus multi-core streamed chunk processing | 16 | 18 | 21 | 22 | 27 |
| 8 | `HXZ6/HXS4` optional auto-tuned iterations/table workflow plus archive-size estimators | 16 | 18 | 21 | 22 | 27 |
| 9 | `HXZ6/HXS4` standalone `lz` body mode for structured text plus refreshed multi-run benchmark harness | 16 | 18 | 21 | 22 | 27 |

## Notes

- Iteration 6 introduced the best measured sizes on the repetitive benchmark set, and iterations 7 through 9 preserve those results.
- Iteration 4 satisfies the requirement that the header use the same compression family and keep metadata inside the header block, but it increases size on these small metadata sets.
- Iteration 5 improves general-purpose comparability by allowing standalone archives to store a raw body when grammar compression does not help, and by skipping expensive grammar work on noisy inputs.
- Iteration 6 adds an exact-repeat body mode for highly repetitive inputs and a streamed frame container for chunked encode/decode.
- Iteration 7 extends repeat mode to cover `repeat unit + tail` cases and adds multi-process stream chunk compression/decompression.
- Iteration 8 keeps the fixed-corpus archive sizes from iteration 7, but makes `--iterations` and shared `--table` optional and avoids redundant full archive serialization while comparing candidates.
- Iteration 9 keeps the fixed-corpus archive sizes from iteration 8, but adds a standalone `lz` body mode that materially improves LDIF-like structured text and repeated-fragment workloads.
- A local LDIF sample of `13,015,346` bytes now compresses to `723,326` bytes (`5.56%`) in `lz` mode instead of falling back to `raw`.
- Run `python3 benchmark_helixzip.py` to reproduce the fixed-corpus size table for the current iteration.

## Codec Comparison

The current comparison script is [benchmark_compare.py](benchmark_compare.py). It compares plain HelixZip against standard-library codecs on representative cases and records both compressed size and elapsed encode/decode time.

Benchmark settings:

- HelixZip iteration budget: `16`
- Timing runs: `3` (median reported)
- Compared codecs: `helixzip`, `zlib`, `gzip`, `bz2`, `lzma`
- Shared-table HelixZip is intentionally excluded here because it is not an apples-to-apples comparison with general-purpose standalone codecs

### Representative Results

#### `zeros-64k` (65536 zero bytes)

| Codec | Compressed bytes | Encode ms | Decode ms |
| --- | ---: | ---: | ---: |
| HelixZip | 17 | 6.463 | 0.035 |
| zlib | 84 | 0.099 | 0.043 |
| gzip | 96 | 0.100 | 0.053 |
| bz2 | 43 | 0.324 | 0.045 |
| lzma | 140 | 0.908 | 0.129 |

#### `acgt-64k` (65536 bytes of repeating `ACGT`)

| Codec | Compressed bytes | Encode ms | Decode ms |
| --- | ---: | ---: | ---: |
| HelixZip | 20 | 1.964 | 0.023 |
| zlib | 93 | 0.094 | 0.025 |
| gzip | 105 | 0.147 | 0.042 |
| bz2 | 50 | 4.322 | 0.172 |
| lzma | 148 | 0.892 | 0.099 |

#### `text-64k` (repeated sentence corpus)

| Codec | Compressed bytes | Encode ms | Decode ms |
| --- | ---: | ---: | ---: |
| HelixZip | 151 | 0.300 | 0.020 |
| zlib | 308 | 0.097 | 0.014 |
| gzip | 320 | 0.102 | 0.026 |
| bz2 | 211 | 6.101 | 0.252 |
| lzma | 204 | 0.885 | 0.086 |

#### `ldif-64k` (65536 bytes of repeated LDIF-style records)

| Codec | Compressed bytes | Encode ms | Decode ms |
| --- | ---: | ---: | ---: |
| HelixZip | 9308 | 206.498 | 6.235 |
| zlib | 4663 | 0.197 | 0.016 |
| gzip | 4675 | 0.255 | 0.041 |
| bz2 | 2127 | 2.226 | 0.304 |
| lzma | 1120 | 4.047 | 0.141 |

#### `random-8k` (8192 random bytes)

| Codec | Compressed bytes | Encode ms | Decode ms |
| --- | ---: | ---: | ---: |
| HelixZip | 8205 | 4.655 | 0.018 |
| zlib | 8203 | 0.056 | 0.001 |
| gzip | 8215 | 0.061 | 0.011 |
| bz2 | 8718 | 0.871 | 0.248 |
| lzma | 8252 | 0.779 | 0.009 |

### Comparison Summary

- With repeat and repeat-with-tail mode, HelixZip wins decisively on exact full-file repeats such as `zeros-64k`, repeating `ACGT`, and truncated repeated-text corpora.
- On the repeated-text benchmark here, HelixZip is smaller than `zlib`, `gzip`, `bz2`, and `lzma`.
- The new standalone `lz` body mode gives HelixZip a real compression path on LDIF-like structured text, where earlier versions often fell back to `raw`.
- On `ldif-64k`, HelixZip now compresses to `9308` bytes, but mature codecs still win comfortably on both size and time.
- On random data, the raw fallback keeps HelixZip much more comparable in size and speed instead of wasting time on grammar rules that will not help.
- HelixZip decode time is extremely fast on repeat-mode and raw-mode cases, while grammar and `lz` cases are still the main slower paths.
- The current HelixZip implementation is still primarily an experimental grammar compressor, not yet competitive with mature general-purpose compressors on common workloads.

## Real-File Spot Check

Local LDIF sample:

- Original bytes: `13,015,346`
- Compressed bytes: `723,326`
- Ratio: `0.05557485755661048`
- Selected body mode: `lz`
- C++ CLI encode wall time: `1.01 s`
- C++ CLI decode wall time: `0.02 s`
- Python CLI encode wall time: `44.29 s`
- Python CLI decode wall time: `1.25 s`
- C++ and Python both reproduced the original bytes from the same archive

## Streamed Archives

HelixZip supports streamed standalone archives as a sequence of independent chunk frames. This keeps encode/decode bounded-memory and lets different chunks choose `grammar`, `raw`, `lz`, or `repeat` mode independently.

Representative multi-core stream benchmark:

- Script: `python3 benchmark_stream.py`
- Payload size: `2140000` bytes
- Chunk size: `65536` bytes
- Timing runs: `3` (median reported)
- Output size: `3130` bytes
- Chunks: `33`
- Chunk modes: `0` grammar, `0` raw, `2` lz, `31` repeat
- `workers=1`: `529.329 ms`
- `workers=2`: `319.997 ms`
- Output size is identical across worker counts

## C++ Compatibility And Benchmarks

The native implementation lives in [helixzip_cpp.cpp](helixzip_cpp.cpp), and the benchmark/compatibility harness is [benchmark_cpp_compare.py](benchmark_cpp_compare.py).

Compatibility checks from the current benchmark run:

- Python standalone archive -> C++ decoder: passed
- C++ standalone archive -> Python decoder: passed
- Python streamed archive -> C++ decoder: passed
- C++ streamed archive -> Python decoder: passed
- Python HX7 `zlib` block -> C++ decoder: passed
- C++ HX7 `zlib` block -> Python decoder: passed
- Python HX7 standalone block -> C++ decoder: passed
- C++ HX7 standalone block -> Python decoder: passed

CLI benchmark settings:

- HelixZip iteration budget: `16`
- Timing runs: `3` (median reported)
- Compared implementations: `python_cli`, `cpp_cli`

### Python CLI vs C++ CLI

#### `zeros-64k`

| Implementation | Compressed bytes | Encode ms | Decode ms |
| --- | ---: | ---: | ---: |
| Python CLI | 17 | 81.285 | 75.996 |
| C++ CLI | 17 | 5.841 | 5.854 |

#### `acgt-64k`

| Implementation | Compressed bytes | Encode ms | Decode ms |
| --- | ---: | ---: | ---: |
| Python CLI | 20 | 74.488 | 70.134 |
| C++ CLI | 20 | 5.945 | 6.243 |

#### `text-64k`

| Implementation | Compressed bytes | Encode ms | Decode ms |
| --- | ---: | ---: | ---: |
| Python CLI | 151 | 74.470 | 72.344 |
| C++ CLI | 151 | 6.236 | 6.473 |

#### `ldif-64k`

| Implementation | Compressed bytes | Encode ms | Decode ms |
| --- | ---: | ---: | ---: |
| Python CLI | 9308 | 285.911 | 78.310 |
| C++ CLI | 9308 | 15.963 | 9.737 |

#### `random-8k`

| Implementation | Compressed bytes | Encode ms | Decode ms |
| --- | ---: | ---: | ---: |
| Python CLI | 8205 | 86.339 | 75.362 |
| C++ CLI | 8205 | 12.428 | 6.751 |

### C++ Stream Parallel Benchmark

- Payload size: `2140000` bytes
- Chunk size: `65536` bytes
- Timing runs: `3` (median reported)
- Output size: `3130` bytes
- `workers=1`: `17.272 ms`
- `workers=2`: `18.383 ms`
- Output size is identical across worker counts
- On this workload, the current two-worker C++ path is slightly slower than single-worker, so multi-core overhead still needs tuning in the native stream path

### Python HX7 vs C++ HX7

Benchmark settings:

- Timing runs: `3` (median reported)
- Chunk size: `65536`
- Levels: `3`
- Python can additionally choose `lzma` for HX7 blocks; the current C++ build supports HX7 standalone and `zlib` blocks only

#### `zeros-64k`

| Implementation | Compressed bytes | Encode ms | Decode ms |
| --- | ---: | ---: | ---: |
| Python HX7 | 38 | 85.053 | 79.036 |
| C++ HX7 | 38 | 7.091 | 7.093 |

#### `acgt-64k`

| Implementation | Compressed bytes | Encode ms | Decode ms |
| --- | ---: | ---: | ---: |
| Python HX7 | 41 | 83.705 | 83.474 |
| C++ HX7 | 41 | 8.772 | 8.120 |

#### `text-64k`

| Implementation | Compressed bytes | Encode ms | Decode ms |
| --- | ---: | ---: | ---: |
| Python HX7 | 173 | 81.014 | 78.037 |
| C++ HX7 | 173 | 7.151 | 6.646 |

#### `ldif-64k`

| Implementation | Compressed bytes | Encode ms | Decode ms |
| --- | ---: | ---: | ---: |
| Python HX7 | 1142 | 297.127 | 90.295 |
| C++ HX7 | 1819 | 13.648 | 9.817 |

#### `random-8k`

| Implementation | Compressed bytes | Encode ms | Decode ms |
| --- | ---: | ---: | ---: |
| Python HX7 | 8224 | 92.723 | 77.009 |
| C++ HX7 | 8224 | 10.732 | 6.139 |

The native HX7 path is much faster, and it matches Python on standalone and `zlib`-selected blocks. The remaining compression-ratio gap on structured text like `ldif-64k` comes from Python's additional `lzma` fallback, which is not available to the current C++ build in this environment.

## HX7 Benchmarks

The new HX7 benchmark harness is [benchmark_hx7.py](benchmark_hx7.py). It compares:

- `hxz6`: the current standalone archive format
- `hx7_plain`: the new framed container without a client dictionary
- `hx7_dict`: the new framed container with a binary `HX7T` dictionary when a training corpus is provided

Benchmark settings:

- Timing runs: `3` (median reported)
- Chunk size: `65536`
- Iterations: `16`

### Representative Results

#### `zeros-64k`

| Implementation | Compressed bytes | Encode ms | Decode ms |
| --- | ---: | ---: | ---: |
| HXZ6 | 17 | 6.944 | 0.024 |
| HX7 plain | 36 | 7.515 | 0.482 |
| HX7 dict | 44 | 75.234 | 0.642 |

#### `acgt-64k`

| Implementation | Compressed bytes | Encode ms | Decode ms |
| --- | ---: | ---: | ---: |
| HXZ6 | 20 | 1.932 | 0.022 |
| HX7 plain | 39 | 5.109 | 0.674 |
| HX7 dict | 47 | 35.861 | 0.578 |

#### `text-64k`

| Implementation | Compressed bytes | Encode ms | Decode ms |
| --- | ---: | ---: | ---: |
| HXZ6 | 151 | 0.287 | 0.020 |
| HX7 plain | 171 | 1.076 | 0.456 |
| HX7 dict | 179 | 1248.191 | 0.641 |

#### `ldif-64k`

| Implementation | Compressed bytes | Encode ms | Decode ms |
| --- | ---: | ---: | ---: |
| HXZ6 | 9308 | 196.077 | 6.880 |
| HX7 plain | 1140 | 204.320 | 0.738 |
| HX7 dict | 1148 | 2523.523 | 0.837 |

#### `random-8k`

| Implementation | Compressed bytes | Encode ms | Decode ms |
| --- | ---: | ---: | ---: |
| HXZ6 | 8205 | 4.386 | 0.017 |
| HX7 plain | 8222 | 5.313 | 0.775 |

### HX7 Summary

- HX7 currently adds noticeable frame overhead on cases where HXZ6 repeat mode was already nearly optimal.
- HX7 plain is dramatically better than HXZ6 on LDIF-like structured text because it now chooses `lzma` blocks for those chunks.
- HX7 decode is still much faster than HXZ6 on LDIF-like data because the chosen external codec blocks avoid the older HelixZip LZ decode path there.
- The current dictionary-assisted HX7 path is still too expensive on encode time because it builds and evaluates shared-table candidates even when they do not beat the plain framed path.

### Real-File HX7 Spot Check

Local LDIF sample (`13,015,346` bytes):

- HXZ6: `723,326` bytes, encode `42.00 s`, decode `1.16 s`
- HX7 plain: `584,148` bytes, encode `40.98 s`, decode `0.12 s`
- Both outputs round-tripped back to the original file
