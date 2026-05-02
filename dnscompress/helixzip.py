#!/usr/bin/env python3

from __future__ import annotations

import argparse
import binascii
import fnmatch
import hashlib
import json
import lzma
import math
import multiprocessing as mp
import os
import tempfile
import zlib
from collections import deque
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Sequence, Tuple


MAGIC = b"HXZ6"
SHARED_MAGIC = b"HXS4"
STREAM_MAGIC = b"HZS1"
HX7_FRAME_MAGIC = b"HX7F"
HX7_DICT_MAGIC = b"HX7T"
BUNDLE_MAGIC = b"HXB1"
HX7_VERSION = 1
BUNDLE_VERSION = 1
BASES = "ACGT"
TABLE_ID_BYTES = 8
HEADER_MAX_ITERATIONS = 32
BODY_MODE_GRAMMAR = 0
BODY_MODE_RAW = 1
BODY_MODE_REPEAT = 2
BODY_MODE_LZ = 3
MIN_BYTE_PAIR_REPETITIONS = 8
GRAMMAR_STALL_LIMIT = 4
DEFAULT_STREAM_CHUNK_SIZE = 64 * 1024
AUTO_MAX_ITERATIONS = 128
AUTO_SHARED_TABLE_SUFFIX = ".table.hx7t"
LEGACY_SHARED_TABLE_SUFFIX = ".table.json"
AUTO_BINARY_TABLE_SUFFIX = ".table.hx7t"
LZ_HASH_BYTES = 4
LZ_MIN_MATCH = 8
LZ_MAX_CANDIDATES = 8
LZ_MATCH_SHORTCUT = 64
HX7_BLOCK_STANDALONE = 1
HX7_BLOCK_SHARED = 2
HX7_BLOCK_ZLIB = 3
HX7_BLOCK_LZMA = 4
BUNDLE_ENTRY_FILE = 1
BUNDLE_ENTRY_DIR = 2


@dataclass(frozen=True)
class BundleEntry:
    entry_type: int
    path: str
    mode: int
    payload: bytes = b""


def encode_varint(value: int) -> bytes:
    if value < 0:
        raise ValueError("varint only supports non-negative integers")
    out = bytearray()
    while True:
        chunk = value & 0x7F
        value >>= 7
        if value:
            out.append(chunk | 0x80)
        else:
            out.append(chunk)
            return bytes(out)


def varint_size(value: int) -> int:
    if value < 0:
        raise ValueError("varint only supports non-negative integers")
    size = 1
    while value >= 0x80:
        value >>= 7
        size += 1
    return size


def decode_varint(data: bytes, offset: int) -> Tuple[int, int]:
    shift = 0
    value = 0
    while True:
        if offset >= len(data):
            raise ValueError("unexpected end of data while decoding varint")
        byte = data[offset]
        offset += 1
        value |= (byte & 0x7F) << shift
        if not (byte & 0x80):
            return value, offset
        shift += 7
        if shift > 63:
            raise ValueError("varint is too large")


def read_u32_le(data: bytes, offset: int) -> int:
    return (
        data[offset]
        | (data[offset + 1] << 8)
        | (data[offset + 2] << 16)
        | (data[offset + 3] << 24)
    )


def encode_u32_le(value: int) -> bytes:
    if value < 0 or value > 0xFFFFFFFF:
        raise ValueError("u32 value must fit in 32 bits")
    return bytes(
        (
            value & 0xFF,
            (value >> 8) & 0xFF,
            (value >> 16) & 0xFF,
            (value >> 24) & 0xFF,
        )
    )


def bytes_to_bases(data: bytes) -> List[int]:
    bases: List[int] = []
    for byte in data:
        bases.extend(
            [
                (byte >> 6) & 0b11,
                (byte >> 4) & 0b11,
                (byte >> 2) & 0b11,
                byte & 0b11,
            ]
        )
    return bases


def bases_to_bytes(bases: Sequence[int]) -> bytes:
    if len(bases) % 4 != 0:
        raise ValueError("base stream must be a multiple of 4")
    out = bytearray()
    for index in range(0, len(bases), 4):
        a, b, c, d = bases[index : index + 4]
        out.append((a << 6) | (b << 4) | (c << 2) | d)
    return bytes(out)


def pack_symbols(symbols: Sequence[int], bit_width: int) -> bytes:
    if bit_width == 0:
        return b""
    out = bytearray()
    accumulator = 0
    bits_in_accumulator = 0
    for symbol in symbols:
        accumulator = (accumulator << bit_width) | symbol
        bits_in_accumulator += bit_width
        while bits_in_accumulator >= 8:
            bits_in_accumulator -= 8
            out.append((accumulator >> bits_in_accumulator) & 0xFF)
    if bits_in_accumulator:
        out.append((accumulator << (8 - bits_in_accumulator)) & 0xFF)
    return bytes(out)


def unpack_symbols(payload: bytes, count: int, bit_width: int) -> List[int]:
    if bit_width == 0:
        return []
    symbols: List[int] = []
    accumulator = 0
    bits_in_accumulator = 0
    for byte in payload:
        accumulator = (accumulator << 8) | byte
        bits_in_accumulator += 8
        while bits_in_accumulator >= bit_width and len(symbols) < count:
            bits_in_accumulator -= bit_width
            symbol = (accumulator >> bits_in_accumulator) & ((1 << bit_width) - 1)
            symbols.append(symbol)
            accumulator &= (1 << bits_in_accumulator) - 1 if bits_in_accumulator else 0
    if len(symbols) != count:
        raise ValueError("payload ended before all symbols were decoded")
    return symbols


def symbol_width(symbol_count: int) -> int:
    if symbol_count <= 1:
        return 0
    return max(1, math.ceil(math.log2(symbol_count)))


@dataclass(frozen=True)
class GrammarBlock:
    rules: Tuple[Tuple[int, int], ...]
    stream: Tuple[int, ...]


@dataclass(frozen=True)
class GrammarAnalysis:
    block: GrammarBlock
    best_iteration: int = 0


def expand_symbols(rules: Sequence[Tuple[int, int]], stream: Sequence[int]) -> List[int]:
    expanded_bases: List[int] = []
    stack = list(reversed(stream))

    while stack:
        symbol = stack.pop()
        if symbol < 4:
            expanded_bases.append(symbol)
            continue

        rule_index = symbol - 4
        if rule_index < 0 or rule_index >= len(rules):
            raise ValueError(f"invalid rule symbol {symbol}")
        left, right = rules[rule_index]
        stack.append(right)
        stack.append(left)

    return expanded_bases


def decode_grammar_bytes(
    rules: Sequence[Tuple[int, int]],
    stream: Sequence[int],
    original_size: int,
) -> bytes:
    expanded_bases = expand_symbols(rules, stream)
    expected_base_length = original_size * 4
    if len(expanded_bases) != expected_base_length:
        raise ValueError(
            f"decoded base length mismatch: expected {expected_base_length}, got {len(expanded_bases)}"
        )
    return bases_to_bytes(expanded_bases)


def serialize_rules_and_payload(
    rules: Sequence[Tuple[int, int]],
    stream: Sequence[int],
    initial_symbol_count: int = 4,
) -> bytes:
    width = symbol_width(initial_symbol_count + len(rules))
    payload = pack_symbols(stream, width)
    out = bytearray()
    for left, right in rules:
        out.extend(encode_varint(left))
        out.extend(encode_varint(right))
    out.extend(payload)
    return bytes(out)


def serialize_rules_and_payload_size(
    rules: Sequence[Tuple[int, int]],
    stream_length: int,
    initial_symbol_count: int = 4,
) -> int:
    size = 0
    for left, right in rules:
        size += varint_size(left)
        size += varint_size(right)
    width = symbol_width(initial_symbol_count + len(rules))
    size += (stream_length * width + 7) // 8 if width else 0
    return size


def parse_rules_and_payload(
    data: bytes,
    offset: int,
    rule_count: int,
    stream_length: int,
    initial_symbol_count: int = 4,
) -> Tuple[GrammarBlock, int]:
    rules = []
    for _ in range(rule_count):
        left, offset = decode_varint(data, offset)
        right, offset = decode_varint(data, offset)
        rules.append((left, right))

    width = symbol_width(initial_symbol_count + rule_count)
    payload_length = (stream_length * width + 7) // 8 if width else 0
    payload = data[offset : offset + payload_length]
    if len(payload) != payload_length:
        raise ValueError("archive payload is truncated")
    offset += payload_length
    stream = unpack_symbols(payload, stream_length, width)
    return GrammarBlock(rules=tuple(rules), stream=tuple(stream)), offset


@dataclass(frozen=True)
class HelixArchive:
    original_size: int
    rules: Tuple[Tuple[int, int], ...]
    stream: Tuple[int, ...]
    requested_iterations: int = 0
    body_mode: int = BODY_MODE_GRAMMAR
    raw_payload: bytes = b""
    lz_payload: bytes = b""
    repeat_unit: bytes = b""
    repeat_count: int = 0
    repeat_tail: bytes = b""

    def to_bytes(self) -> bytes:
        header_bytes = encode_header_metadata(
            self.body_mode,
            self.original_size,
            self.requested_iterations,
            header_primary_value(self),
            header_secondary_value(self),
        )
        header_block = compress_grammar(
            header_bytes,
            max_iterations=min(HEADER_MAX_ITERATIONS, max(self.requested_iterations, 1)),
        )
        out = bytearray(MAGIC)
        out.extend(encode_varint(len(header_bytes)))
        out.extend(encode_varint(len(header_block.rules)))
        out.extend(encode_varint(len(header_block.stream)))
        out.extend(serialize_rules_and_payload(header_block.rules, header_block.stream))
        if self.body_mode == BODY_MODE_GRAMMAR:
            out.extend(serialize_rules_and_payload(self.rules, self.stream))
        elif self.body_mode == BODY_MODE_RAW:
            out.extend(self.raw_payload)
        elif self.body_mode == BODY_MODE_LZ:
            out.extend(self.lz_payload)
        elif self.body_mode == BODY_MODE_REPEAT:
            out.extend(self.repeat_unit)
            out.extend(self.repeat_tail)
        else:
            raise ValueError(f"unsupported body mode {self.body_mode}")
        return bytes(out)

    @classmethod
    def from_bytes(cls, data: bytes) -> "HelixArchive":
        if not data.startswith(MAGIC):
            raise ValueError("not a HelixZip archive")
        offset = len(MAGIC)
        header_size, offset = decode_varint(data, offset)
        header_rule_count, offset = decode_varint(data, offset)
        header_stream_length, offset = decode_varint(data, offset)
        header_block, offset = parse_rules_and_payload(data, offset, header_rule_count, header_stream_length)
        header_bytes = decode_grammar_bytes(header_block.rules, header_block.stream, header_size)
        body_mode, original_size, requested_iterations, primary_value, secondary_value = decode_header_metadata(header_bytes)
        if body_mode == BODY_MODE_GRAMMAR:
            body_block, offset = parse_rules_and_payload(data, offset, primary_value, secondary_value)
            rules = body_block.rules
            stream = body_block.stream
            raw_payload = b""
            lz_payload = b""
            repeat_unit = b""
            repeat_count = 0
            repeat_tail = b""
        elif body_mode == BODY_MODE_RAW:
            raw_payload = data[offset : offset + original_size]
            if len(raw_payload) != original_size:
                raise ValueError("archive raw payload length does not match header")
            offset += original_size
            rules = tuple()
            stream = tuple()
            lz_payload = b""
            repeat_unit = b""
            repeat_count = 0
            repeat_tail = b""
        elif body_mode == BODY_MODE_LZ:
            lz_payload = data[offset : offset + primary_value]
            if len(lz_payload) != primary_value:
                raise ValueError("archive lz payload length does not match header")
            offset += primary_value
            if secondary_value != 0:
                raise ValueError("archive lz metadata is malformed")
            rules = tuple()
            stream = tuple()
            raw_payload = b""
            repeat_unit = b""
            repeat_count = 0
            repeat_tail = b""
        elif body_mode == BODY_MODE_REPEAT:
            repeat_unit = data[offset : offset + primary_value]
            if len(repeat_unit) != primary_value:
                raise ValueError("archive repeat unit length does not match header")
            offset += primary_value
            repeat_count = secondary_value
            repeat_tail_length = original_size - (len(repeat_unit) * repeat_count)
            if repeat_tail_length < 0:
                raise ValueError("repeat metadata exceeds original size")
            repeat_tail = data[offset : offset + repeat_tail_length]
            if len(repeat_tail) != repeat_tail_length:
                raise ValueError("archive repeat tail length does not match header")
            offset += repeat_tail_length
            rules = tuple()
            stream = tuple()
            raw_payload = b""
            lz_payload = b""
        else:
            raise ValueError(f"unsupported body mode {body_mode}")
        if offset != len(data):
            raise ValueError("archive has trailing bytes")
        return cls(
            original_size=original_size,
            rules=rules,
            stream=stream,
            requested_iterations=requested_iterations,
            body_mode=body_mode,
            raw_payload=raw_payload,
            lz_payload=lz_payload if body_mode == BODY_MODE_LZ else b"",
            repeat_unit=repeat_unit,
            repeat_count=repeat_count,
            repeat_tail=repeat_tail if body_mode == BODY_MODE_REPEAT else b"",
        )

    def decode(self) -> bytes:
        if self.body_mode == BODY_MODE_RAW:
            if len(self.raw_payload) != self.original_size:
                raise ValueError("raw payload length does not match original size")
            return self.raw_payload
        if self.body_mode == BODY_MODE_LZ:
            return decode_lz_bytes(self.lz_payload, self.original_size)
        if self.body_mode == BODY_MODE_REPEAT:
            if (len(self.repeat_unit) * self.repeat_count) + len(self.repeat_tail) != self.original_size:
                raise ValueError("repeat metadata does not match original size")
            return (self.repeat_unit * self.repeat_count) + self.repeat_tail
        return decode_grammar_bytes(self.rules, self.stream, self.original_size)

    def lookup_table(self, resolve: bool = False) -> list[dict]:
        if self.body_mode in (BODY_MODE_RAW, BODY_MODE_LZ, BODY_MODE_REPEAT):
            return []
        table = []
        for index, (left, right) in enumerate(self.rules, start=4):
            entry = {
                "symbol": index,
                "left": left,
                "right": right,
            }
            if resolve:
                entry["motif"] = self.resolve_symbol(index)
            table.append(entry)
        return table

    def resolve_symbol(self, symbol: int) -> str:
        if symbol < 4:
            return BASES[symbol]
        left, right = self.rules[symbol - 4]
        return self.resolve_symbol(left) + self.resolve_symbol(right)


def encode_header_metadata(
    body_mode: int,
    original_size: int,
    requested_iterations: int,
    primary_value: int,
    secondary_value: int,
) -> bytes:
    out = bytearray()
    out.extend(encode_varint(body_mode))
    out.extend(encode_varint(original_size))
    out.extend(encode_varint(requested_iterations))
    out.extend(encode_varint(primary_value))
    out.extend(encode_varint(secondary_value))
    return bytes(out)


def decode_header_metadata(data: bytes) -> Tuple[int, int, int, int, int]:
    offset = 0
    body_mode, offset = decode_varint(data, offset)
    original_size, offset = decode_varint(data, offset)
    requested_iterations, offset = decode_varint(data, offset)
    primary_value, offset = decode_varint(data, offset)
    secondary_value, offset = decode_varint(data, offset)
    if offset != len(data):
        raise ValueError("standalone header metadata is malformed")
    return body_mode, original_size, requested_iterations, primary_value, secondary_value


def header_primary_value(archive: HelixArchive) -> int:
    if archive.body_mode == BODY_MODE_GRAMMAR:
        return len(archive.rules)
    if archive.body_mode == BODY_MODE_RAW:
        return 0
    if archive.body_mode == BODY_MODE_LZ:
        return len(archive.lz_payload)
    if archive.body_mode == BODY_MODE_REPEAT:
        return len(archive.repeat_unit)
    raise ValueError(f"unsupported body mode {archive.body_mode}")


def header_secondary_value(archive: HelixArchive) -> int:
    if archive.body_mode == BODY_MODE_GRAMMAR:
        return len(archive.stream)
    if archive.body_mode == BODY_MODE_RAW:
        return 0
    if archive.body_mode == BODY_MODE_LZ:
        return 0
    if archive.body_mode == BODY_MODE_REPEAT:
        return archive.repeat_count
    raise ValueError(f"unsupported body mode {archive.body_mode}")


def header_block_size(header_bytes: bytes, requested_iterations: int) -> int:
    header_iterations = min(HEADER_MAX_ITERATIONS, max(requested_iterations, 1))
    header_block = compress_grammar(header_bytes, max_iterations=header_iterations)
    return (
        varint_size(len(header_bytes))
        + varint_size(len(header_block.rules))
        + varint_size(len(header_block.stream))
        + serialize_rules_and_payload_size(header_block.rules, len(header_block.stream))
    )


def standalone_archive_size(archive: HelixArchive) -> int:
    header_bytes = encode_header_metadata(
        archive.body_mode,
        archive.original_size,
        archive.requested_iterations,
        header_primary_value(archive),
        header_secondary_value(archive),
    )
    size = len(MAGIC) + header_block_size(header_bytes, archive.requested_iterations)
    if archive.body_mode == BODY_MODE_GRAMMAR:
        size += serialize_rules_and_payload_size(archive.rules, len(archive.stream))
    elif archive.body_mode == BODY_MODE_RAW:
        size += len(archive.raw_payload)
    elif archive.body_mode == BODY_MODE_LZ:
        size += len(archive.lz_payload)
    elif archive.body_mode == BODY_MODE_REPEAT:
        size += len(archive.repeat_unit) + len(archive.repeat_tail)
    else:
        raise ValueError(f"unsupported body mode {archive.body_mode}")
    return size


def shared_archive_size(archive: "SharedHelixArchive") -> int:
    table_id_bytes = bytes.fromhex(archive.table_id)
    if len(table_id_bytes) != TABLE_ID_BYTES:
        raise ValueError("table id must be 8 bytes / 16 hex characters")
    header_bytes = encode_shared_header_metadata(
        original_size=archive.original_size,
        requested_iterations=archive.requested_iterations,
        shared_rule_count=archive.shared_rule_count,
        delta_rule_count=len(archive.delta_rules),
        stream_length=len(archive.stream),
        table_id_bytes=table_id_bytes,
    )
    return (
        len(SHARED_MAGIC)
        + header_block_size(header_bytes, archive.requested_iterations)
        + serialize_rules_and_payload_size(
            archive.delta_rules,
            len(archive.stream),
            initial_symbol_count=4 + archive.shared_rule_count,
        )
    )


def resolve_iteration_limit(max_iterations: int | None) -> int:
    if max_iterations is None:
        return AUTO_MAX_ITERATIONS
    if max_iterations < 0:
        raise ValueError("max_iterations must be non-negative")
    return max_iterations


def encode_shared_header_metadata(
    original_size: int,
    requested_iterations: int,
    shared_rule_count: int,
    delta_rule_count: int,
    stream_length: int,
    table_id_bytes: bytes,
) -> bytes:
    out = bytearray()
    out.extend(encode_varint(original_size))
    out.extend(encode_varint(requested_iterations))
    out.extend(encode_varint(shared_rule_count))
    out.extend(encode_varint(delta_rule_count))
    out.extend(encode_varint(stream_length))
    out.extend(table_id_bytes)
    return bytes(out)


def decode_shared_header_metadata(data: bytes) -> Tuple[int, int, int, int, int, str]:
    offset = 0
    original_size, offset = decode_varint(data, offset)
    requested_iterations, offset = decode_varint(data, offset)
    shared_rule_count, offset = decode_varint(data, offset)
    delta_rule_count, offset = decode_varint(data, offset)
    stream_length, offset = decode_varint(data, offset)
    table_id_bytes = data[offset : offset + TABLE_ID_BYTES]
    if len(table_id_bytes) != TABLE_ID_BYTES:
        raise ValueError("shared header metadata is truncated before table id")
    offset += TABLE_ID_BYTES
    if offset != len(data):
        raise ValueError("shared header metadata is malformed")
    return (
        original_size,
        requested_iterations,
        shared_rule_count,
        delta_rule_count,
        stream_length,
        table_id_bytes.hex(),
    )


@dataclass(frozen=True)
class SharedTable:
    table_id: str
    rules: Tuple[Tuple[int, int], ...]

    @classmethod
    def build(cls, data: bytes, max_iterations: int | None = None) -> "SharedTable":
        block = compress_grammar(data, max_iterations=resolve_iteration_limit(max_iterations))
        payload = serialize_rules(block.rules)
        table_id = hashlib.sha256(payload).digest()[:TABLE_ID_BYTES].hex()
        return cls(table_id=table_id, rules=block.rules)

    @classmethod
    def from_archive(cls, archive: HelixArchive) -> "SharedTable":
        rules = archive.rules
        if not rules and archive.original_size:
            rules = compress_grammar(archive.decode(), max_iterations=archive.requested_iterations).rules
        payload = serialize_rules(rules)
        table_id = hashlib.sha256(payload).digest()[:TABLE_ID_BYTES].hex()
        return cls(table_id=table_id, rules=rules)

    @classmethod
    def from_json(cls, data: str) -> "SharedTable":
        document = json.loads(data)
        if document.get("format") != "helixzip-table-v1":
            raise ValueError("unsupported table format")
        rules = tuple((entry["left"], entry["right"]) for entry in document["rules"])
        return cls(table_id=document["table_id"], rules=rules)

    @classmethod
    def from_bytes(cls, data: bytes) -> "SharedTable":
        if not data.startswith(HX7_DICT_MAGIC):
            raise ValueError("not an HX7T dictionary")
        offset = len(HX7_DICT_MAGIC)
        version, offset = decode_varint(data, offset)
        if version != HX7_VERSION:
            raise ValueError(f"unsupported HX7T dictionary version {version}")
        table_id_bytes = data[offset : offset + TABLE_ID_BYTES]
        if len(table_id_bytes) != TABLE_ID_BYTES:
            raise ValueError("dictionary is truncated before table id")
        offset += TABLE_ID_BYTES
        rule_count, offset = decode_varint(data, offset)
        rules = []
        for _ in range(rule_count):
            left, offset = decode_varint(data, offset)
            right, offset = decode_varint(data, offset)
            rules.append((left, right))
        if offset != len(data):
            raise ValueError("dictionary has trailing bytes")
        return cls(table_id=table_id_bytes.hex(), rules=tuple(rules))

    def to_json(self, resolve: bool = True) -> str:
        helper = HelixArchive(original_size=0, rules=self.rules, stream=tuple())
        document = {
            "format": "helixzip-table-v1",
            "table_id": self.table_id,
            "rule_count": len(self.rules),
            "rules": helper.lookup_table(resolve=resolve),
        }
        return json.dumps(document, indent=2)

    def to_bytes(self) -> bytes:
        table_id_bytes = bytes.fromhex(self.table_id)
        if len(table_id_bytes) != TABLE_ID_BYTES:
            raise ValueError("table id must be 8 bytes / 16 hex characters")
        out = bytearray(HX7_DICT_MAGIC)
        out.extend(encode_varint(HX7_VERSION))
        out.extend(table_id_bytes)
        out.extend(encode_varint(len(self.rules)))
        for left, right in self.rules:
            out.extend(encode_varint(left))
            out.extend(encode_varint(right))
        return bytes(out)

    def symbol_count(self) -> int:
        return 4 + len(self.rules)

    def helper_archive(self) -> HelixArchive:
        return HelixArchive(original_size=0, rules=self.rules, stream=tuple())


def load_shared_table(path: Path) -> SharedTable:
    payload = path.read_bytes()
    if payload.startswith(HX7_DICT_MAGIC):
        return SharedTable.from_bytes(payload)
    return SharedTable.from_json(payload.decode("utf-8"))


def write_shared_table(path: Path, table: SharedTable, *, binary: bool, resolve: bool = True) -> None:
    if binary:
        path.write_bytes(table.to_bytes())
    else:
        path.write_text(table.to_json(resolve=resolve), encoding="utf-8")


@dataclass(frozen=True)
class SharedHelixArchive:
    original_size: int
    table_id: str
    shared_rule_count: int
    delta_rules: Tuple[Tuple[int, int], ...]
    stream: Tuple[int, ...]
    requested_iterations: int = 0

    def to_bytes(self) -> bytes:
        table_id_bytes = bytes.fromhex(self.table_id)
        if len(table_id_bytes) != TABLE_ID_BYTES:
            raise ValueError("table id must be 8 bytes / 16 hex characters")
        header_bytes = encode_shared_header_metadata(
            original_size=self.original_size,
            requested_iterations=self.requested_iterations,
            shared_rule_count=self.shared_rule_count,
            delta_rule_count=len(self.delta_rules),
            stream_length=len(self.stream),
            table_id_bytes=table_id_bytes,
        )
        header_block = compress_grammar(
            header_bytes,
            max_iterations=min(HEADER_MAX_ITERATIONS, max(self.requested_iterations, 1)),
        )
        out = bytearray(SHARED_MAGIC)
        out.extend(encode_varint(len(header_bytes)))
        out.extend(encode_varint(len(header_block.rules)))
        out.extend(encode_varint(len(header_block.stream)))
        out.extend(serialize_rules_and_payload(header_block.rules, header_block.stream))
        out.extend(
            serialize_rules_and_payload(
                self.delta_rules,
                self.stream,
                initial_symbol_count=4 + self.shared_rule_count,
            )
        )
        return bytes(out)

    @classmethod
    def from_bytes(cls, data: bytes) -> "SharedHelixArchive":
        if not data.startswith(SHARED_MAGIC):
            raise ValueError("not a shared HelixZip archive")
        offset = len(SHARED_MAGIC)
        header_size, offset = decode_varint(data, offset)
        header_rule_count, offset = decode_varint(data, offset)
        header_stream_length, offset = decode_varint(data, offset)
        header_block, offset = parse_rules_and_payload(data, offset, header_rule_count, header_stream_length)
        header_bytes = decode_grammar_bytes(header_block.rules, header_block.stream, header_size)
        (
            original_size,
            requested_iterations,
            shared_rule_count,
            delta_rule_count,
            stream_length,
            table_id,
        ) = decode_shared_header_metadata(header_bytes)
        body_block, offset = parse_rules_and_payload(
            data,
            offset,
            delta_rule_count,
            stream_length,
            initial_symbol_count=4 + shared_rule_count,
        )
        if offset != len(data):
            raise ValueError("archive has trailing bytes")
        return cls(
            original_size=original_size,
            table_id=table_id,
            shared_rule_count=shared_rule_count,
            delta_rules=body_block.rules,
            stream=body_block.stream,
            requested_iterations=requested_iterations,
        )

    def decode(self, table: SharedTable) -> bytes:
        if table.table_id != self.table_id:
            raise ValueError("shared table id does not match archive")
        if len(table.rules) != self.shared_rule_count:
            raise ValueError("shared table rule count does not match archive")
        archive = HelixArchive(
            original_size=self.original_size,
            rules=table.rules + self.delta_rules,
            stream=self.stream,
        )
        return archive.decode()

    def lookup_table(self, table: SharedTable, resolve: bool = False) -> list[dict]:
        archive = HelixArchive(
            original_size=self.original_size,
            rules=table.rules + self.delta_rules,
            stream=self.stream,
        )
        return archive.lookup_table(resolve=resolve)


def serialize_rules(rules: Sequence[Tuple[int, int]]) -> bytes:
    payload = bytearray()
    payload.extend(encode_varint(len(rules)))
    for left, right in rules:
        payload.extend(encode_varint(left))
        payload.extend(encode_varint(right))
    return bytes(payload)


def replace_pair(stream: Sequence[int], pair: Tuple[int, int], replacement: int) -> Tuple[List[int], int]:
    replaced: List[int] = []
    replacements = 0
    index = 0
    while index < len(stream):
        if index + 1 < len(stream) and stream[index] == pair[0] and stream[index + 1] == pair[1]:
            replaced.append(replacement)
            replacements += 1
            index += 2
        else:
            replaced.append(stream[index])
            index += 1
    return replaced, replacements


def find_best_pair(stream: Sequence[int], next_symbol: int, candidate_limit: int = 32) -> Tuple[Tuple[int, int], List[int], int] | None:
    if len(stream) < 2:
        return None

    pair_counts = Counter(zip(stream, stream[1:]))
    for pair, _ in pair_counts.most_common(candidate_limit):
        candidate_stream, replacements = replace_pair(stream, pair, next_symbol)
        net_gain = replacements - 2
        if net_gain > 0:
            return pair, candidate_stream, replacements
    return None


def should_try_grammar(data: bytes, max_iterations: int) -> bool:
    if max_iterations <= 0 or len(data) < 2:
        return False
    if len(data) < 128:
        return True
    max_pair_repetitions = Counter(zip(data, data[1:])).most_common(1)[0][1]
    return max_pair_repetitions >= MIN_BYTE_PAIR_REPETITIONS


def find_repeating_pattern(data: bytes, max_unit_size: int = 256) -> Tuple[bytes, int, bytes] | None:
    if len(data) < 2:
        return None

    limit = min(max_unit_size, len(data) - 1)
    best_match = None
    best_cost = None
    for unit_size in range(1, limit + 1):
        if best_cost is not None and unit_size >= best_cost:
            break
        unit = data[:unit_size]
        repeat_count = 1
        cursor = unit_size
        while cursor + unit_size <= len(data) and data[cursor : cursor + unit_size] == unit:
            repeat_count += 1
            cursor += unit_size
        if repeat_count < 2:
            continue
        tail = data[cursor:]
        candidate_cost = len(unit) + len(tail)
        if best_match is None or candidate_cost < best_cost:
            best_match = (unit, repeat_count, tail)
            best_cost = candidate_cost
            if not tail:
                return best_match
    return best_match


def add_lz_history(history: dict[int, list[int]], key: int, position: int) -> None:
    chain = history.setdefault(key, [])
    chain.append(position)
    if len(chain) > LZ_MAX_CANDIDATES:
        del chain[0]


def encode_lz_bytes(data: bytes) -> bytes:
    if not data:
        return encode_varint(0)

    out = bytearray()
    history: dict[int, list[int]] = {}
    anchor = 0
    index = 0
    last_match_start = len(data) - LZ_MIN_MATCH

    while index <= last_match_start:
        key = read_u32_le(data, index)
        best_length = 0
        best_distance = 0
        candidates = history.get(key)
        if candidates is not None:
            for candidate in reversed(candidates):
                distance = index - candidate
                length = LZ_HASH_BYTES
                while index + length < len(data) and data[candidate + length] == data[index + length]:
                    length += 1
                if length > best_length:
                    best_length = length
                    best_distance = distance
                    if length >= LZ_MATCH_SHORTCUT:
                        break

        literal_length = index - anchor
        if best_length >= LZ_MIN_MATCH:
            encoded_cost = (
                varint_size(literal_length)
                + literal_length
                + varint_size(best_length)
                + varint_size(best_distance)
            )
            raw_cost = literal_length + best_length
            if raw_cost > encoded_cost:
                out.extend(encode_varint(literal_length))
                out.extend(data[anchor:index])
                out.extend(encode_varint(best_length))
                out.extend(encode_varint(best_distance))
                match_end = index + best_length
                history_limit = min(match_end, len(data) - LZ_HASH_BYTES + 1)
                for cursor in range(index, history_limit):
                    add_lz_history(history, read_u32_le(data, cursor), cursor)
                index = match_end
                anchor = index
                continue

        add_lz_history(history, key, index)
        index += 1

    tail = data[anchor:]
    if tail or not out:
        out.extend(encode_varint(len(tail)))
        out.extend(tail)
    return bytes(out)


def decode_lz_bytes(payload: bytes, original_size: int) -> bytes:
    offset = 0
    restored = bytearray()
    while offset < len(payload):
        literal_length, offset = decode_varint(payload, offset)
        literals = payload[offset : offset + literal_length]
        if len(literals) != literal_length:
            raise ValueError("archive lz literal block is truncated")
        restored.extend(literals)
        offset += literal_length
        if offset == len(payload):
            break

        match_length, offset = decode_varint(payload, offset)
        if match_length < LZ_MIN_MATCH:
            raise ValueError("archive lz match length is invalid")
        match_distance, offset = decode_varint(payload, offset)
        if match_distance <= 0 or match_distance > len(restored):
            raise ValueError("archive lz match distance is invalid")
        source_index = len(restored) - match_distance
        for _ in range(match_length):
            restored.append(restored[source_index])
            source_index += 1
            if len(restored) > original_size:
                raise ValueError("archive lz body expands beyond original size")

    if len(restored) != original_size:
        raise ValueError("decoded lz payload length does not match original size")
    return bytes(restored)


def compress_grammar(data: bytes, max_iterations: int = 64) -> GrammarBlock:
    return compress_grammar_analysis(data, max_iterations=max_iterations).block


def compress_grammar_analysis(data: bytes, max_iterations: int = 64) -> GrammarAnalysis:
    base_stream = bytes_to_bases(data)
    best_block = GrammarBlock(rules=tuple(), stream=tuple(base_stream))
    best_size = serialize_rules_and_payload_size(best_block.rules, len(best_block.stream))
    best_iteration = 0

    stream = list(base_stream)
    rules: List[Tuple[int, int]] = []
    stalled_iterations = 0

    for _ in range(max_iterations):
        next_symbol = 4 + len(rules)
        match = find_best_pair(stream, next_symbol)
        if not match:
            break
        pair, stream, replacements = match
        if replacements < 3:
            break

        rules.append(pair)
        block = GrammarBlock(rules=tuple(rules), stream=tuple(stream))
        block_size = serialize_rules_and_payload_size(block.rules, len(block.stream))
        if block_size < best_size:
            best_block = block
            best_size = block_size
            best_iteration = len(rules)
            stalled_iterations = 0
        else:
            stalled_iterations += 1
            if stalled_iterations >= GRAMMAR_STALL_LIMIT:
                break

    return GrammarAnalysis(block=best_block, best_iteration=best_iteration)


def compress(data: bytes, max_iterations: int | None = None) -> HelixArchive:
    auto_iterations = max_iterations is None
    iteration_limit = resolve_iteration_limit(max_iterations)
    archive_iterations = 0 if auto_iterations else iteration_limit
    raw_archive = HelixArchive(
        original_size=len(data),
        rules=tuple(),
        stream=tuple(),
        requested_iterations=archive_iterations,
        body_mode=BODY_MODE_RAW,
        raw_payload=data,
    )
    raw_size = standalone_archive_size(raw_archive)
    repeat_match = find_repeating_pattern(data)
    repeat_archive = None
    repeat_size = None
    if repeat_match is not None:
        repeat_unit, repeat_count, repeat_tail = repeat_match
        repeat_archive = HelixArchive(
            original_size=len(data),
            rules=tuple(),
            stream=tuple(),
            requested_iterations=archive_iterations,
            body_mode=BODY_MODE_REPEAT,
            repeat_unit=repeat_unit,
            repeat_count=repeat_count,
            repeat_tail=repeat_tail,
        )
        repeat_size = standalone_archive_size(repeat_archive)
        if repeat_size * 2 <= raw_size:
            return repeat_archive

    lz_archive = None
    lz_size = None
    if len(data) >= LZ_MIN_MATCH:
        lz_archive = HelixArchive(
            original_size=len(data),
            rules=tuple(),
            stream=tuple(),
            requested_iterations=archive_iterations,
            body_mode=BODY_MODE_LZ,
            lz_payload=encode_lz_bytes(data),
        )
        lz_size = standalone_archive_size(lz_archive)

    if not should_try_grammar(data, iteration_limit):
        best_archive = raw_archive
        best_size = raw_size
        if lz_archive is not None and lz_size < best_size:
            best_archive = lz_archive
            best_size = lz_size
        if repeat_archive is not None and repeat_size < best_size:
            best_archive = repeat_archive
        return best_archive

    analysis = compress_grammar_analysis(data, max_iterations=iteration_limit)
    grammar_iterations = analysis.best_iteration if auto_iterations else iteration_limit
    grammar_archive = HelixArchive(
        original_size=len(data),
        rules=analysis.block.rules,
        stream=analysis.block.stream,
        requested_iterations=grammar_iterations,
    )
    grammar_size = standalone_archive_size(grammar_archive)
    best_archive = raw_archive
    best_size = raw_size
    if lz_archive is not None and lz_size < best_size:
        best_archive = lz_archive
        best_size = lz_size
    if repeat_archive is not None and repeat_size < best_size:
        best_archive = repeat_archive
        best_size = repeat_size
    if grammar_size < best_size:
        best_archive = grammar_archive
    return best_archive


def build_match_trie(table: SharedTable) -> dict:
    helper = table.helper_archive()
    trie: dict = {}
    for symbol in range(4, table.symbol_count()):
        motif = [BASES.index(base) for base in helper.resolve_symbol(symbol)]
        node = trie
        for base in motif:
            node = node.setdefault(base, {})
        node["_symbol"] = symbol
    return trie


def tokenize_with_table(base_stream: Sequence[int], table: SharedTable) -> List[int]:
    trie = build_match_trie(table)
    symbols: List[int] = []
    index = 0

    while index < len(base_stream):
        node = trie
        cursor = index
        best_symbol = None
        best_end = index

        while cursor < len(base_stream) and base_stream[cursor] in node:
            node = node[base_stream[cursor]]
            cursor += 1
            if "_symbol" in node:
                best_symbol = node["_symbol"]
                best_end = cursor

        if best_symbol is None:
            symbols.append(base_stream[index])
            index += 1
        else:
            symbols.append(best_symbol)
            index = best_end

    return symbols


def compress_with_table(data: bytes, table: SharedTable, max_iterations: int | None = None) -> SharedHelixArchive:
    auto_iterations = max_iterations is None
    iteration_limit = resolve_iteration_limit(max_iterations)
    archive_iterations = 0 if auto_iterations else iteration_limit
    base_stream = bytes_to_bases(data)
    seeded_stream = tokenize_with_table(base_stream, table)
    best_archive = SharedHelixArchive(
        original_size=len(data),
        table_id=table.table_id,
        shared_rule_count=len(table.rules),
        delta_rules=tuple(),
        stream=tuple(seeded_stream),
        requested_iterations=archive_iterations,
    )
    best_size = shared_archive_size(best_archive)

    stream = list(seeded_stream)
    delta_rules: List[Tuple[int, int]] = []
    symbol_offset = 4 + len(table.rules)

    for _ in range(iteration_limit):
        next_symbol = symbol_offset + len(delta_rules)
        match = find_best_pair(stream, next_symbol)
        if not match:
            break
        pair, stream, replacements = match
        if replacements < 3:
            break

        delta_rules.append(pair)
        archive = SharedHelixArchive(
            original_size=len(data),
            table_id=table.table_id,
            shared_rule_count=len(table.rules),
            delta_rules=tuple(delta_rules),
            stream=tuple(stream),
            requested_iterations=len(delta_rules) if auto_iterations else iteration_limit,
        )
        archive_size = shared_archive_size(archive)
        if archive_size < best_size:
            best_archive = archive
            best_size = archive_size

    return best_archive


def compression_report(original: bytes, archive: HelixArchive) -> dict:
    encoded_size = standalone_archive_size(archive)
    ratio = (encoded_size / len(original)) if original else 0.0
    return {
        "original_bytes": len(original),
        "compressed_bytes": encoded_size,
        "ratio": ratio,
        "body_mode": body_mode_name(archive.body_mode),
        "rules": len(archive.rules),
        "stream_symbols": len(archive.stream),
        "requested_iterations": archive.requested_iterations,
        "applied_iterations": len(archive.rules),
    }


def shared_compression_report(original: bytes, archive: SharedHelixArchive) -> dict:
    encoded_size = shared_archive_size(archive)
    ratio = (encoded_size / len(original)) if original else 0.0
    return {
        "original_bytes": len(original),
        "compressed_bytes": encoded_size,
        "ratio": ratio,
        "table_id": archive.table_id,
        "shared_rules": archive.shared_rule_count,
        "delta_rules": len(archive.delta_rules),
        "stream_symbols": len(archive.stream),
        "requested_iterations": archive.requested_iterations,
        "applied_iterations": len(archive.delta_rules),
    }


def write_file(path: Path, payload: bytes) -> None:
    path.write_bytes(payload)


def read_file(path: Path) -> bytes:
    return path.read_bytes()


def normalize_bundle_path(path: str) -> str:
    normalized = path.replace("\\", "/").strip("/")
    parts = [part for part in normalized.split("/") if part and part != "."]
    if any(part == ".." for part in parts):
        raise ValueError(f"bundle path may not traverse upwards: {path}")
    if not parts:
        raise ValueError("bundle path may not be empty")
    return "/".join(parts)


def bundle_path_matches(path: str, patterns: Sequence[str], *, is_dir: bool) -> bool:
    normalized = normalize_bundle_path(path)
    basename = normalized.rsplit("/", 1)[-1]
    candidates = [normalized, basename]
    if is_dir:
        candidates.append(f"{normalized}/")
    for pattern in patterns:
        for candidate in candidates:
            if fnmatch.fnmatchcase(candidate, pattern):
                return True
    return False


def bundle_path_selected(path: str, includes: Sequence[str], excludes: Sequence[str], *, is_dir: bool) -> bool:
    normalized = normalize_bundle_path(path)
    if bundle_path_matches(normalized, excludes, is_dir=is_dir):
        return False
    if not includes:
        return True
    return bundle_path_matches(normalized, includes, is_dir=is_dir)


def _bundle_parent_paths(path: str) -> Iterable[str]:
    parts = normalize_bundle_path(path).split("/")
    for end in range(1, len(parts)):
        yield "/".join(parts[:end])


def collect_bundle_entries(
    input_paths: Sequence[Path],
    *,
    includes: Sequence[str],
    excludes: Sequence[str],
) -> List[BundleEntry]:
    if not input_paths:
        raise ValueError("at least one input path is required")

    seen_roots: set[str] = set()
    directories: dict[str, int] = {}
    files: list[BundleEntry] = []

    for source in input_paths:
        if not source.exists():
            raise FileNotFoundError(source)
        root_name = normalize_bundle_path(source.name or source.resolve().name)
        if root_name in seen_roots:
            raise ValueError(f"duplicate bundle root name: {root_name}")
        seen_roots.add(root_name)

        if source.is_file():
            if bundle_path_selected(root_name, includes, excludes, is_dir=False):
                stat_result = source.stat()
                files.append(
                    BundleEntry(
                        BUNDLE_ENTRY_FILE,
                        root_name,
                        stat_result.st_mode & 0o777,
                        source.read_bytes(),
                    )
                )
            continue

        if not source.is_dir():
            raise ValueError(f"unsupported input path type: {source}")

        source_directories: dict[str, int] = {}
        matched_directories: set[str] = set()
        included_file_paths: list[str] = []
        root_stat = source.stat()
        if not bundle_path_matches(root_name, excludes, is_dir=True):
            source_directories[root_name] = root_stat.st_mode & 0o777
            if bundle_path_selected(root_name, includes, excludes, is_dir=True):
                matched_directories.add(root_name)

        for current_root, dirnames, filenames in os.walk(source):
            current_path = Path(current_root)
            if current_path == source:
                rel_dir = Path(root_name)
            else:
                rel_dir = Path(root_name) / current_path.relative_to(source)

            dirnames[:] = sorted(dirnames)
            kept_dirs: list[str] = []
            for dirname in dirnames:
                child_path = current_path / dirname
                rel_child = normalize_bundle_path((rel_dir / dirname).as_posix())
                if bundle_path_matches(rel_child, excludes, is_dir=True):
                    continue
                child_stat = child_path.stat()
                source_directories[rel_child] = child_stat.st_mode & 0o777
                if bundle_path_selected(rel_child, includes, excludes, is_dir=True):
                    matched_directories.add(rel_child)
                kept_dirs.append(dirname)
            dirnames[:] = kept_dirs

            for filename in sorted(filenames):
                file_path = current_path / filename
                rel_file = normalize_bundle_path((rel_dir / filename).as_posix())
                if not bundle_path_selected(rel_file, includes, excludes, is_dir=False):
                    continue
                stat_result = file_path.stat()
                files.append(
                    BundleEntry(
                        BUNDLE_ENTRY_FILE,
                        rel_file,
                        stat_result.st_mode & 0o777,
                        file_path.read_bytes(),
                    )
                )
                included_file_paths.append(rel_file)

        dirs_to_keep: set[str]
        if includes:
            dirs_to_keep = set(matched_directories)
            for file_path in included_file_paths:
                dirs_to_keep.update(_bundle_parent_paths(file_path))
        else:
            dirs_to_keep = set(source_directories)

        for directory_path in sorted(dirs_to_keep):
            if directory_path in source_directories:
                directories[directory_path] = source_directories[directory_path]

    entries = [BundleEntry(BUNDLE_ENTRY_DIR, path, mode) for path, mode in sorted(directories.items())]
    entries.extend(sorted(files, key=lambda entry: entry.path))
    if not entries:
        raise ValueError("bundle selection produced no files or directories")
    return entries


def encode_bundle(entries: Sequence[BundleEntry]) -> bytes:
    out = bytearray()
    out.extend(BUNDLE_MAGIC)
    out.extend(encode_varint(BUNDLE_VERSION))
    out.extend(encode_varint(len(entries)))
    for entry in entries:
        path_bytes = normalize_bundle_path(entry.path).encode("utf-8")
        out.extend(encode_varint(entry.entry_type))
        out.extend(encode_varint(len(path_bytes)))
        out.extend(path_bytes)
        out.extend(encode_varint(entry.mode & 0o777))
        if entry.entry_type == BUNDLE_ENTRY_FILE:
            out.extend(encode_varint(len(entry.payload)))
            out.extend(entry.payload)
        elif entry.entry_type != BUNDLE_ENTRY_DIR:
            raise ValueError(f"unsupported bundle entry type {entry.entry_type}")
    return bytes(out)


def decode_bundle(payload: bytes) -> List[BundleEntry]:
    if payload[: len(BUNDLE_MAGIC)] != BUNDLE_MAGIC:
        raise ValueError("not a HelixZip bundle payload")
    offset = len(BUNDLE_MAGIC)
    version, offset = decode_varint(payload, offset)
    if version != BUNDLE_VERSION:
        raise ValueError(f"unsupported bundle version {version}")
    entry_count, offset = decode_varint(payload, offset)
    entries: list[BundleEntry] = []
    for _ in range(entry_count):
        entry_type, offset = decode_varint(payload, offset)
        path_length, offset = decode_varint(payload, offset)
        path_bytes = payload[offset : offset + path_length]
        if len(path_bytes) != path_length:
            raise ValueError("bundle path is truncated")
        offset += path_length
        path = normalize_bundle_path(path_bytes.decode("utf-8"))
        mode, offset = decode_varint(payload, offset)
        if entry_type == BUNDLE_ENTRY_FILE:
            payload_length, offset = decode_varint(payload, offset)
            file_payload = payload[offset : offset + payload_length]
            if len(file_payload) != payload_length:
                raise ValueError("bundle file payload is truncated")
            offset += payload_length
            entries.append(BundleEntry(entry_type, path, mode & 0o777, bytes(file_payload)))
        elif entry_type == BUNDLE_ENTRY_DIR:
            entries.append(BundleEntry(entry_type, path, mode & 0o777))
        else:
            raise ValueError(f"unsupported bundle entry type {entry_type}")
    if offset != len(payload):
        raise ValueError("bundle payload contains trailing bytes")
    return entries


def extract_bundle(entries: Sequence[BundleEntry], output_dir: Path) -> dict:
    output_dir.mkdir(parents=True, exist_ok=True)
    file_count = 0
    dir_count = 0
    total_file_bytes = 0
    for entry in entries:
        target = output_dir / Path(entry.path)
        target.relative_to(output_dir)
        if entry.entry_type == BUNDLE_ENTRY_DIR:
            target.mkdir(parents=True, exist_ok=True)
            os.chmod(target, entry.mode & 0o777)
            dir_count += 1
            continue
        if entry.entry_type != BUNDLE_ENTRY_FILE:
            raise ValueError(f"unsupported bundle entry type {entry.entry_type}")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(entry.payload)
        os.chmod(target, entry.mode & 0o777)
        file_count += 1
        total_file_bytes += len(entry.payload)
    return {
        "entries": len(entries),
        "directories": dir_count,
        "files": file_count,
        "input_bytes": total_file_bytes,
    }


def bundle_report(entries: Sequence[BundleEntry], bundle_bytes: int) -> dict:
    file_count = 0
    dir_count = 0
    total_file_bytes = 0
    for entry in entries:
        if entry.entry_type == BUNDLE_ENTRY_DIR:
            dir_count += 1
        elif entry.entry_type == BUNDLE_ENTRY_FILE:
            file_count += 1
            total_file_bytes += len(entry.payload)
    return {
        "entries": len(entries),
        "directories": dir_count,
        "files": file_count,
        "input_bytes": total_file_bytes,
        "bundle_bytes": bundle_bytes,
    }


def body_mode_name(body_mode: int) -> str:
    if body_mode == BODY_MODE_GRAMMAR:
        return "grammar"
    if body_mode == BODY_MODE_RAW:
        return "raw"
    if body_mode == BODY_MODE_LZ:
        return "lz"
    if body_mode == BODY_MODE_REPEAT:
        return "repeat"
    return f"unknown-{body_mode}"


def normalize_worker_count(workers: int | None) -> int:
    if workers is None:
        return 1
    if workers <= 0:
        return max(1, os.cpu_count() or 1)
    return workers


def iter_file_chunks(path: Path, chunk_size: int) -> Iterable[bytes]:
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(chunk_size)
            if not chunk:
                break
            yield chunk


def read_varint_from_handle(handle, *, allow_eof: bool = False) -> int | None:
    shift = 0
    value = 0
    while True:
        raw = handle.read(1)
        if not raw:
            if allow_eof and shift == 0:
                return None
            raise ValueError("unexpected end of stream while decoding varint")
        byte = raw[0]
        value |= (byte & 0x7F) << shift
        if not (byte & 0x80):
            return value
        shift += 7
        if shift > 63:
            raise ValueError("varint is too large")


def iter_stream_frames(path: Path) -> Iterable[bytes]:
    with path.open("rb") as handle:
        magic = handle.read(len(STREAM_MAGIC))
        if magic != STREAM_MAGIC:
            raise ValueError("not a HelixZip stream archive")
        _chunk_size = read_varint_from_handle(handle)
        _requested_iterations = read_varint_from_handle(handle)
        while True:
            frame_length = read_varint_from_handle(handle, allow_eof=True)
            if frame_length is None:
                break
            frame = handle.read(frame_length)
            if len(frame) != frame_length:
                raise ValueError("stream frame is truncated")
            yield frame


def read_stream_prelude(path: Path) -> Tuple[int, int]:
    with path.open("rb") as handle:
        magic = handle.read(len(STREAM_MAGIC))
        if magic != STREAM_MAGIC:
            raise ValueError("not a HelixZip stream archive")
        chunk_size = read_varint_from_handle(handle)
        requested_iterations = read_varint_from_handle(handle)
        return chunk_size, requested_iterations


def _compress_chunk_worker(task: Tuple[bytes, int | None]) -> Tuple[bytes, int, int]:
    chunk, max_iterations = task
    archive = compress(chunk, max_iterations=max_iterations)
    return archive.to_bytes(), archive.body_mode, len(chunk)


def _decode_frame_worker(frame: bytes) -> Tuple[bytes, int]:
    archive = HelixArchive.from_bytes(frame)
    return archive.decode(), archive.body_mode


def write_stream_archive(
    input_path: Path,
    output_path: Path,
    *,
    chunk_size: int,
    max_iterations: int | None = None,
    workers: int = 1,
) -> dict:
    workers = normalize_worker_count(workers)
    total_input_bytes = 0
    chunk_count = 0
    grammar_chunks = 0
    raw_chunks = 0
    lz_chunks = 0
    repeat_chunks = 0

    with output_path.open("wb") as out:
        out.write(STREAM_MAGIC)
        out.write(encode_varint(chunk_size))
        out.write(encode_varint(0 if max_iterations is None else max_iterations))

        if workers == 1:
            results = (
                _compress_chunk_worker((chunk, max_iterations))
                for chunk in iter_file_chunks(input_path, chunk_size)
            )
        else:
            pool = mp.get_context("fork").Pool(processes=workers)
            try:
                results = pool.imap(
                    _compress_chunk_worker,
                    ((chunk, max_iterations) for chunk in iter_file_chunks(input_path, chunk_size)),
                )
                for payload, body_mode, input_bytes in results:
                    out.write(encode_varint(len(payload)))
                    out.write(payload)
                    total_input_bytes += input_bytes
                    chunk_count += 1
                    if body_mode == BODY_MODE_GRAMMAR:
                        grammar_chunks += 1
                    elif body_mode == BODY_MODE_RAW:
                        raw_chunks += 1
                    elif body_mode == BODY_MODE_LZ:
                        lz_chunks += 1
                    elif body_mode == BODY_MODE_REPEAT:
                        repeat_chunks += 1
            finally:
                pool.close()
                pool.join()

        for payload, body_mode, input_bytes in results:
            out.write(encode_varint(len(payload)))
            out.write(payload)
            total_input_bytes += input_bytes
            chunk_count += 1
            if body_mode == BODY_MODE_GRAMMAR:
                grammar_chunks += 1
            elif body_mode == BODY_MODE_RAW:
                raw_chunks += 1
            elif body_mode == BODY_MODE_LZ:
                lz_chunks += 1
            elif body_mode == BODY_MODE_REPEAT:
                repeat_chunks += 1

    compressed_bytes = output_path.stat().st_size
    return {
        "original_bytes": total_input_bytes,
        "compressed_bytes": compressed_bytes,
        "ratio": (compressed_bytes / total_input_bytes) if total_input_bytes else 0.0,
        "chunk_size": chunk_size,
        "chunks": chunk_count,
        "workers": workers,
        "grammar_chunks": grammar_chunks,
        "raw_chunks": raw_chunks,
        "lz_chunks": lz_chunks,
        "repeat_chunks": repeat_chunks,
    }


def read_stream_archive(input_path: Path, output_path: Path, *, workers: int = 1) -> dict:
    workers = normalize_worker_count(workers)
    chunk_size, requested_iterations = read_stream_prelude(input_path)
    restored_bytes = 0
    chunk_count = 0
    grammar_chunks = 0
    raw_chunks = 0
    lz_chunks = 0
    repeat_chunks = 0

    with output_path.open("wb") as out:
        if workers == 1:
            results = (_decode_frame_worker(frame) for frame in iter_stream_frames(input_path))
        else:
            pool = mp.get_context("fork").Pool(processes=workers)
            try:
                results = pool.imap(_decode_frame_worker, iter_stream_frames(input_path))
                for restored, body_mode in results:
                    out.write(restored)
                    restored_bytes += len(restored)
                    chunk_count += 1
                    if body_mode == BODY_MODE_GRAMMAR:
                        grammar_chunks += 1
                    elif body_mode == BODY_MODE_RAW:
                        raw_chunks += 1
                    elif body_mode == BODY_MODE_LZ:
                        lz_chunks += 1
                    elif body_mode == BODY_MODE_REPEAT:
                        repeat_chunks += 1
            finally:
                pool.close()
                pool.join()

        for restored, body_mode in results:
            out.write(restored)
            restored_bytes += len(restored)
            chunk_count += 1
            if body_mode == BODY_MODE_GRAMMAR:
                grammar_chunks += 1
            elif body_mode == BODY_MODE_RAW:
                raw_chunks += 1
            elif body_mode == BODY_MODE_LZ:
                lz_chunks += 1
            elif body_mode == BODY_MODE_REPEAT:
                repeat_chunks += 1

    return {
        "restored_bytes": restored_bytes,
        "chunk_size": chunk_size,
        "requested_iterations": requested_iterations,
        "chunks": chunk_count,
        "workers": workers,
        "grammar_chunks": grammar_chunks,
        "raw_chunks": raw_chunks,
        "lz_chunks": lz_chunks,
        "repeat_chunks": repeat_chunks,
    }


def crc32_bytes(data: bytes) -> int:
    return binascii.crc32(data) & 0xFFFFFFFF


def estimate_byte_entropy(data: bytes) -> float:
    if not data:
        return 0.0
    total = len(data)
    entropy = 0.0
    for count in Counter(data).values():
        probability = count / total
        entropy -= probability * math.log2(probability)
    return entropy


def should_try_lzma_block(data: bytes, standalone_archive: HelixArchive, standalone_payload_size: int) -> bool:
    if len(data) < 2048:
        return False
    if standalone_archive.body_mode == BODY_MODE_REPEAT and standalone_payload_size * 8 <= len(data):
        return False
    entropy = estimate_byte_entropy(data)
    if entropy < 1.5:
        return False
    if entropy > 7.5:
        return False
    return True


def should_try_wrapper_codec(payload: bytes, codec_id: int, depth: int) -> bool:
    if depth >= 3:
        return False
    if len(payload) < 128:
        return False
    if codec_id == HX7_BLOCK_ZLIB:
        return len(payload) >= 256
    if codec_id == HX7_BLOCK_LZMA:
        return len(payload) >= 512
    return False


def encode_hx7_codec(codec_id: int, payload: bytes, table: SharedTable | None, max_iterations: int | None) -> bytes:
    if codec_id == HX7_BLOCK_STANDALONE:
        return compress(payload, max_iterations=max_iterations).to_bytes()
    if codec_id == HX7_BLOCK_SHARED:
        if table is None:
            raise ValueError("shared HX7 codec requires a table")
        return compress_with_table(payload, table, max_iterations=max_iterations).to_bytes()
    if codec_id == HX7_BLOCK_ZLIB:
        return zlib.compress(payload, level=9)
    if codec_id == HX7_BLOCK_LZMA:
        return lzma.compress(payload, preset=9)
    raise ValueError(f"unsupported HX7 codec {codec_id}")


def decode_hx7_codec(codec_id: int, payload: bytes, table: SharedTable | None) -> bytes:
    if codec_id == HX7_BLOCK_STANDALONE:
        return HelixArchive.from_bytes(payload).decode()
    if codec_id == HX7_BLOCK_SHARED:
        if table is None:
            raise ValueError("HX7 shared block requires a dictionary")
        return SharedHelixArchive.from_bytes(payload).decode(table)
    if codec_id == HX7_BLOCK_ZLIB:
        return zlib.decompress(payload)
    if codec_id == HX7_BLOCK_LZMA:
        return lzma.decompress(payload)
    raise ValueError(f"unsupported HX7 block codec {codec_id}")


def decode_hx7_codec_chain_payload(codec_chain: Sequence[int], payload: bytes) -> bytes:
    restored = payload
    for codec_id in reversed(tuple(codec_chain)):
        restored = decode_hx7_codec(codec_id, restored, None)
    return restored


def default_binary_table_path(archive_path: Path) -> Path:
    return archive_path.with_name(f"{archive_path.name}{AUTO_BINARY_TABLE_SUFFIX}")


def read_hx7_prelude(path: Path) -> Tuple[int, int, int, str | None]:
    with path.open("rb") as handle:
        magic = handle.read(len(HX7_FRAME_MAGIC))
        if magic != HX7_FRAME_MAGIC:
            raise ValueError("not an HX7 framed archive")
        version = read_varint_from_handle(handle)
        if version != HX7_VERSION:
            raise ValueError(f"unsupported HX7 archive version {version}")
        chunk_size = read_varint_from_handle(handle)
        requested_iterations = read_varint_from_handle(handle)
        max_levels = read_varint_from_handle(handle)
        dictionary_flag = read_varint_from_handle(handle)
        if dictionary_flag not in (0, 1):
            raise ValueError("HX7 archive dictionary flag is invalid")
        if dictionary_flag:
            table_id_bytes = handle.read(TABLE_ID_BYTES)
            if len(table_id_bytes) != TABLE_ID_BYTES:
                raise ValueError("HX7 archive is truncated before dictionary id")
            return chunk_size, requested_iterations, max_levels, table_id_bytes.hex()
        return chunk_size, requested_iterations, max_levels, None


def iter_hx7_blocks(path: Path) -> Iterable[Tuple[Tuple[int, ...], int, int, bytes]]:
    with path.open("rb") as handle:
        magic = handle.read(len(HX7_FRAME_MAGIC))
        if magic != HX7_FRAME_MAGIC:
            raise ValueError("not an HX7 framed archive")
        version = read_varint_from_handle(handle)
        if version != HX7_VERSION:
            raise ValueError(f"unsupported HX7 archive version {version}")
        _chunk_size = read_varint_from_handle(handle)
        _requested_iterations = read_varint_from_handle(handle)
        _max_levels = read_varint_from_handle(handle)
        dictionary_flag = read_varint_from_handle(handle)
        if dictionary_flag:
            dictionary_id = handle.read(TABLE_ID_BYTES)
            if len(dictionary_id) != TABLE_ID_BYTES:
                raise ValueError("HX7 archive is truncated before dictionary id")
        while True:
            level_count = read_varint_from_handle(handle, allow_eof=True)
            if level_count is None:
                break
            if level_count <= 0:
                raise ValueError("HX7 block level count must be positive")
            codec_chain = []
            for _ in range(level_count):
                codec_chain.append(read_varint_from_handle(handle))
            raw_size = read_varint_from_handle(handle)
            payload_size = read_varint_from_handle(handle)
            checksum_bytes = handle.read(4)
            if len(checksum_bytes) != 4:
                raise ValueError("HX7 block is truncated before checksum")
            checksum = read_u32_le(checksum_bytes, 0)
            payload = handle.read(payload_size)
            if len(payload) != payload_size:
                raise ValueError("HX7 block payload is truncated")
            yield tuple(codec_chain), raw_size, checksum, payload


def _compress_hx7_chunk_worker(
    task: Tuple[bytes, int | None, SharedTable | None, int]
) -> Tuple[Tuple[int, ...], bytes, int, int]:
    chunk, max_iterations, table, max_levels = task
    standalone_archive = compress(chunk, max_iterations=max_iterations)
    standalone_payload = standalone_archive.to_bytes()
    best_codec = HX7_BLOCK_STANDALONE
    best_payload = standalone_payload
    zlib_payload = zlib.compress(chunk, level=9)
    if len(zlib_payload) < len(best_payload):
        best_codec = HX7_BLOCK_ZLIB
        best_payload = zlib_payload
    if should_try_lzma_block(chunk, standalone_archive, len(standalone_payload)):
        lzma_payload = lzma.compress(chunk, preset=9)
        if len(lzma_payload) < len(best_payload):
            best_codec = HX7_BLOCK_LZMA
            best_payload = lzma_payload
    if table is not None:
        shared_archive = compress_with_table(chunk, table, max_iterations=max_iterations)
        shared_payload = shared_archive.to_bytes()
        if len(shared_payload) < len(best_payload):
            best_codec = HX7_BLOCK_SHARED
            best_payload = shared_payload
    codec_chain = [best_codec]
    wrapped_payload = best_payload
    for depth in range(1, max(1, max_levels)):
        best_wrap_codec = None
        best_wrap_payload = wrapped_payload
        for codec_id in (HX7_BLOCK_ZLIB, HX7_BLOCK_LZMA):
            if not should_try_wrapper_codec(wrapped_payload, codec_id, depth):
                continue
            candidate = encode_hx7_codec(codec_id, wrapped_payload, None, None)
            if len(candidate) < len(best_wrap_payload):
                best_wrap_codec = codec_id
                best_wrap_payload = candidate
        if best_wrap_codec is None:
            break
        codec_chain.append(best_wrap_codec)
        wrapped_payload = best_wrap_payload
    return tuple(codec_chain), wrapped_payload, len(chunk), crc32_bytes(chunk)


def _decode_hx7_block_worker(task: Tuple[Tuple[int, ...], int, int, bytes, SharedTable | None]) -> Tuple[bytes, Tuple[int, ...]]:
    codec_chain, raw_size, checksum, payload, table = task
    restored = payload
    for codec_id in reversed(codec_chain):
        restored = decode_hx7_codec(codec_id, restored, table)
    if len(restored) != raw_size:
        raise ValueError("HX7 block restored size does not match header")
    if crc32_bytes(restored) != checksum:
        raise ValueError("HX7 block checksum mismatch")
    return restored, codec_chain


def write_hx7_archive(
    input_path: Path,
    output_path: Path,
    *,
    chunk_size: int,
    max_iterations: int | None = None,
    workers: int = 1,
    table: SharedTable | None = None,
    max_levels: int = 2,
) -> dict:
    workers = normalize_worker_count(workers)
    if max_levels <= 0:
        raise ValueError("HX7 max_levels must be positive")
    total_input_bytes = 0
    block_count = 0
    standalone_blocks = 0
    shared_blocks = 0
    zlib_blocks = 0
    lzma_blocks = 0

    with output_path.open("wb") as out:
        out.write(HX7_FRAME_MAGIC)
        out.write(encode_varint(HX7_VERSION))
        out.write(encode_varint(chunk_size))
        out.write(encode_varint(0 if max_iterations is None else max_iterations))
        out.write(encode_varint(max_levels))
        if table is None:
            out.write(encode_varint(0))
        else:
            out.write(encode_varint(1))
            out.write(bytes.fromhex(table.table_id))

        if workers == 1:
            results = (
                _compress_hx7_chunk_worker((chunk, max_iterations, table, max_levels))
                for chunk in iter_file_chunks(input_path, chunk_size)
            )
        else:
            with ThreadPoolExecutor(max_workers=workers) as executor:
                pending = deque()
                for chunk in iter_file_chunks(input_path, chunk_size):
                    pending.append(
                        executor.submit(_compress_hx7_chunk_worker, (chunk, max_iterations, table, max_levels))
                    )
                    if len(pending) >= workers:
                        codec_chain, payload, input_bytes, checksum = pending.popleft().result()
                        out.write(encode_varint(len(codec_chain)))
                        for codec_id in codec_chain:
                            out.write(encode_varint(codec_id))
                        out.write(encode_varint(input_bytes))
                        out.write(encode_varint(len(payload)))
                        out.write(encode_u32_le(checksum))
                        out.write(payload)
                        total_input_bytes += input_bytes
                        block_count += 1
                        for codec_id in codec_chain:
                            if codec_id == HX7_BLOCK_STANDALONE:
                                standalone_blocks += 1
                            elif codec_id == HX7_BLOCK_SHARED:
                                shared_blocks += 1
                            elif codec_id == HX7_BLOCK_ZLIB:
                                zlib_blocks += 1
                            elif codec_id == HX7_BLOCK_LZMA:
                                lzma_blocks += 1
                while pending:
                    codec_chain, payload, input_bytes, checksum = pending.popleft().result()
                    out.write(encode_varint(len(codec_chain)))
                    for codec_id in codec_chain:
                        out.write(encode_varint(codec_id))
                    out.write(encode_varint(input_bytes))
                    out.write(encode_varint(len(payload)))
                    out.write(encode_u32_le(checksum))
                    out.write(payload)
                    total_input_bytes += input_bytes
                    block_count += 1
                    for codec_id in codec_chain:
                        if codec_id == HX7_BLOCK_STANDALONE:
                            standalone_blocks += 1
                        elif codec_id == HX7_BLOCK_SHARED:
                            shared_blocks += 1
                        elif codec_id == HX7_BLOCK_ZLIB:
                            zlib_blocks += 1
                        elif codec_id == HX7_BLOCK_LZMA:
                            lzma_blocks += 1

        if workers == 1:
            for codec_chain, payload, input_bytes, checksum in results:
                out.write(encode_varint(len(codec_chain)))
                for codec_id in codec_chain:
                    out.write(encode_varint(codec_id))
                out.write(encode_varint(input_bytes))
                out.write(encode_varint(len(payload)))
                out.write(encode_u32_le(checksum))
                out.write(payload)
                total_input_bytes += input_bytes
                block_count += 1
                for codec_id in codec_chain:
                    if codec_id == HX7_BLOCK_STANDALONE:
                        standalone_blocks += 1
                    elif codec_id == HX7_BLOCK_SHARED:
                        shared_blocks += 1
                    elif codec_id == HX7_BLOCK_ZLIB:
                        zlib_blocks += 1
                    elif codec_id == HX7_BLOCK_LZMA:
                        lzma_blocks += 1

    compressed_bytes = output_path.stat().st_size
    return {
        "original_bytes": total_input_bytes,
        "compressed_bytes": compressed_bytes,
        "ratio": (compressed_bytes / total_input_bytes) if total_input_bytes else 0.0,
        "chunk_size": chunk_size,
        "max_levels": max_levels,
        "blocks": block_count,
        "workers": workers,
        "standalone_blocks": standalone_blocks,
        "shared_blocks": shared_blocks,
        "zlib_blocks": zlib_blocks,
        "lzma_blocks": lzma_blocks,
        "dictionary_id": table.table_id if table is not None else None,
    }


def read_hx7_archive(
    input_path: Path,
    output_path: Path,
    *,
    workers: int = 1,
    table: SharedTable | None = None,
) -> dict:
    workers = normalize_worker_count(workers)
    chunk_size, requested_iterations, max_levels, expected_table_id = read_hx7_prelude(input_path)
    if expected_table_id is not None:
        if table is None:
            raise ValueError("HX7 archive requires a dictionary; pass --table")
        if table.table_id != expected_table_id:
            raise ValueError("HX7 archive dictionary id does not match the supplied table")

    restored_bytes = 0
    block_count = 0
    standalone_blocks = 0
    shared_blocks = 0
    zlib_blocks = 0
    lzma_blocks = 0

    with output_path.open("wb") as out:
        if workers == 1:
            results = (
                _decode_hx7_block_worker((codec_chain, raw_size, checksum, payload, table))
                for codec_chain, raw_size, checksum, payload in iter_hx7_blocks(input_path)
            )
        else:
            with ThreadPoolExecutor(max_workers=workers) as executor:
                pending = deque()
                for codec_chain, raw_size, checksum, payload in iter_hx7_blocks(input_path):
                    pending.append(
                        executor.submit(
                            _decode_hx7_block_worker,
                            (codec_chain, raw_size, checksum, payload, table),
                        )
                    )
                    if len(pending) >= workers:
                        restored, codec_chain = pending.popleft().result()
                        out.write(restored)
                        restored_bytes += len(restored)
                        block_count += 1
                        for codec_id in codec_chain:
                            if codec_id == HX7_BLOCK_STANDALONE:
                                standalone_blocks += 1
                            elif codec_id == HX7_BLOCK_SHARED:
                                shared_blocks += 1
                            elif codec_id == HX7_BLOCK_ZLIB:
                                zlib_blocks += 1
                            elif codec_id == HX7_BLOCK_LZMA:
                                lzma_blocks += 1
                while pending:
                    restored, codec_chain = pending.popleft().result()
                    out.write(restored)
                    restored_bytes += len(restored)
                    block_count += 1
                    for codec_id in codec_chain:
                        if codec_id == HX7_BLOCK_STANDALONE:
                            standalone_blocks += 1
                        elif codec_id == HX7_BLOCK_SHARED:
                            shared_blocks += 1
                        elif codec_id == HX7_BLOCK_ZLIB:
                            zlib_blocks += 1
                        elif codec_id == HX7_BLOCK_LZMA:
                            lzma_blocks += 1

        if workers == 1:
            for restored, codec_chain in results:
                out.write(restored)
                restored_bytes += len(restored)
                block_count += 1
                for codec_id in codec_chain:
                    if codec_id == HX7_BLOCK_STANDALONE:
                        standalone_blocks += 1
                    elif codec_id == HX7_BLOCK_SHARED:
                        shared_blocks += 1
                    elif codec_id == HX7_BLOCK_ZLIB:
                        zlib_blocks += 1
                    elif codec_id == HX7_BLOCK_LZMA:
                        lzma_blocks += 1

    return {
        "restored_bytes": restored_bytes,
        "chunk_size": chunk_size,
        "requested_iterations": requested_iterations,
        "max_levels": max_levels,
        "blocks": block_count,
        "workers": workers,
        "standalone_blocks": standalone_blocks,
        "shared_blocks": shared_blocks,
        "zlib_blocks": zlib_blocks,
        "lzma_blocks": lzma_blocks,
        "dictionary_id": expected_table_id,
    }


def inspect_hx7_archive(path: Path, table: SharedTable | None = None, *, resolve: bool = False) -> dict:
    chunk_size, requested_iterations, max_levels, expected_table_id = read_hx7_prelude(path)
    if expected_table_id is not None and table is not None and table.table_id != expected_table_id:
        raise ValueError("HX7 archive dictionary id does not match the supplied table")

    block_reports = []
    standalone_blocks = 0
    shared_blocks = 0
    zlib_blocks = 0
    lzma_blocks = 0
    for block_index, (codec_chain, raw_size, checksum, payload) in enumerate(iter_hx7_blocks(path)):
        block_report = {
            "index": block_index,
            "codec_chain": list(codec_chain),
            "raw_size": raw_size,
            "compressed_size": len(payload),
            "checksum": f"{checksum:08x}",
        }
        block_report["codec_names"] = []
        for codec_id in codec_chain:
            if codec_id == HX7_BLOCK_STANDALONE:
                standalone_blocks += 1
                block_report["codec_names"].append("standalone")
            elif codec_id == HX7_BLOCK_SHARED:
                shared_blocks += 1
                block_report["codec_names"].append("shared")
            elif codec_id == HX7_BLOCK_ZLIB:
                zlib_blocks += 1
                block_report["codec_names"].append("zlib")
            elif codec_id == HX7_BLOCK_LZMA:
                lzma_blocks += 1
                block_report["codec_names"].append("lzma")
            else:
                raise ValueError(f"unsupported HX7 block codec {codec_id}")
        terminal_codec = codec_chain[0]
        if terminal_codec == HX7_BLOCK_STANDALONE:
            nested = HelixArchive.from_bytes(decode_hx7_codec_chain_payload(codec_chain[1:], payload))
            block_report["terminal_codec"] = "standalone"
            block_report["body_mode"] = body_mode_name(nested.body_mode)
            block_report["rules"] = len(nested.rules)
            block_report["stream_symbols"] = len(nested.stream)
        elif terminal_codec == HX7_BLOCK_SHARED:
            nested_payload = decode_hx7_codec_chain_payload(codec_chain[1:], payload)
            nested = SharedHelixArchive.from_bytes(nested_payload)
            block_report["terminal_codec"] = "shared"
            block_report["table_id"] = nested.table_id
            block_report["shared_rules"] = nested.shared_rule_count
            block_report["delta_rules"] = len(nested.delta_rules)
            block_report["stream_symbols"] = len(nested.stream)
            if table is not None and nested.table_id == table.table_id:
                block_report["lookup_table"] = nested.lookup_table(table, resolve=resolve)
        else:
            block_report["terminal_codec"] = block_report["codec_names"][0]
        block_reports.append(block_report)

    return {
        "chunk_size": chunk_size,
        "requested_iterations": requested_iterations,
        "max_levels": max_levels,
        "compressed_bytes": path.stat().st_size,
        "blocks": len(block_reports),
        "standalone_blocks": standalone_blocks,
        "shared_blocks": shared_blocks,
        "zlib_blocks": zlib_blocks,
        "lzma_blocks": lzma_blocks,
        "dictionary_id": expected_table_id,
        "block_reports": block_reports,
    }


def default_shared_table_path(archive_path: Path) -> Path:
    return archive_path.with_name(f"{archive_path.name}{AUTO_SHARED_TABLE_SUFFIX}")


def default_legacy_shared_table_path(archive_path: Path) -> Path:
    return archive_path.with_name(f"{archive_path.name}{LEGACY_SHARED_TABLE_SUFFIX}")


def resolve_shared_table_path(table_path: str | None, archive_path: Path) -> Path:
    if table_path:
        return Path(table_path)
    default_path = default_shared_table_path(archive_path)
    if default_path.exists():
        return default_path
    legacy_default_path = default_legacy_shared_table_path(archive_path)
    if legacy_default_path.exists():
        return legacy_default_path
    raise ValueError(
        f"shared table not found; pass --table or place a sibling table at {default_path} or {legacy_default_path}"
    )


def command_compress(args: argparse.Namespace) -> int:
    original = read_file(Path(args.input))
    archive = compress(original, max_iterations=args.iterations)
    payload = archive.to_bytes()
    write_file(Path(args.output), payload)

    report = compression_report(original, archive)
    if args.table:
        Path(args.table).write_text(json.dumps(archive.lookup_table(resolve=True), indent=2), encoding="utf-8")

    print(json.dumps(report, indent=2))
    return 0


def command_build_table(args: argparse.Namespace) -> int:
    source = read_file(Path(args.input))
    table = SharedTable.build(source, max_iterations=args.iterations)
    write_shared_table(
        Path(args.output),
        table,
        binary=not args.json,
        resolve=not args.no_resolve,
    )
    print(
        json.dumps(
            {
                "table_id": table.table_id,
                "rules": len(table.rules),
                "training_bytes": len(source),
                "format": "json" if args.json else "hx7t",
            },
            indent=2,
        )
    )
    return 0


def command_compress_shared(args: argparse.Namespace) -> int:
    original = read_file(Path(args.input))
    generated_table_path = None
    if args.table:
        table = load_shared_table(Path(args.table))
    else:
        generated_table_path = default_shared_table_path(Path(args.output))
        table = SharedTable.build(original, max_iterations=args.iterations)
        write_shared_table(generated_table_path, table, binary=True, resolve=False)
    archive = compress_with_table(original, table, max_iterations=args.iterations)
    write_file(Path(args.output), archive.to_bytes())
    report = shared_compression_report(original, archive)
    if generated_table_path is not None:
        report["generated_table"] = str(generated_table_path)
    print(json.dumps(report, indent=2))
    return 0


def command_decompress(args: argparse.Namespace) -> int:
    archive = HelixArchive.from_bytes(read_file(Path(args.input)))
    restored = archive.decode()
    write_file(Path(args.output), restored)
    print(
        json.dumps(
            {
                "restored_bytes": len(restored),
                "rules": len(archive.rules),
            },
            indent=2,
        )
    )
    return 0


def command_decompress_shared(args: argparse.Namespace) -> int:
    archive_path = Path(args.input)
    table = load_shared_table(resolve_shared_table_path(args.table, archive_path))
    archive = SharedHelixArchive.from_bytes(read_file(archive_path))
    restored = archive.decode(table)
    write_file(Path(args.output), restored)
    print(
        json.dumps(
            {
                "restored_bytes": len(restored),
                "table_id": archive.table_id,
                "delta_rules": len(archive.delta_rules),
            },
            indent=2,
        )
    )
    return 0


def command_inspect(args: argparse.Namespace) -> int:
    archive = HelixArchive.from_bytes(read_file(Path(args.input)))
    report = {
        "original_bytes": archive.original_size,
        "compressed_bytes": len(Path(args.input).read_bytes()),
        "body_mode": body_mode_name(archive.body_mode),
        "rules": len(archive.rules),
        "stream_symbols": len(archive.stream),
        "requested_iterations": archive.requested_iterations,
        "applied_iterations": len(archive.rules),
        "lookup_table": archive.lookup_table(resolve=args.resolve),
    }
    print(json.dumps(report, indent=2))
    return 0


def command_inspect_shared(args: argparse.Namespace) -> int:
    archive_path = Path(args.input)
    table = load_shared_table(resolve_shared_table_path(args.table, archive_path))
    archive = SharedHelixArchive.from_bytes(read_file(archive_path))
    report = {
        "original_bytes": archive.original_size,
        "compressed_bytes": len(archive_path.read_bytes()),
        "table_id": archive.table_id,
        "shared_rules": archive.shared_rule_count,
        "delta_rules": len(archive.delta_rules),
        "stream_symbols": len(archive.stream),
        "requested_iterations": archive.requested_iterations,
        "applied_iterations": len(archive.delta_rules),
        "lookup_table": archive.lookup_table(table, resolve=args.resolve),
    }
    print(json.dumps(report, indent=2))
    return 0


def command_compress_hx7(args: argparse.Namespace) -> int:
    table = load_shared_table(Path(args.table)) if args.table else None
    report = write_hx7_archive(
        Path(args.input),
        Path(args.output),
        chunk_size=args.chunk_size,
        max_iterations=args.iterations,
        workers=args.workers,
        table=table,
        max_levels=args.levels,
    )
    print(json.dumps(report, indent=2))
    return 0


def command_compress_bundle_hx7(args: argparse.Namespace) -> int:
    entries = collect_bundle_entries(
        [Path(value) for value in args.inputs],
        includes=args.include,
        excludes=args.exclude,
    )
    bundle_payload = encode_bundle(entries)
    table = load_shared_table(Path(args.table)) if args.table else None
    with tempfile.TemporaryDirectory() as tmpdir:
        bundle_path = Path(tmpdir) / "bundle.hxb"
        bundle_path.write_bytes(bundle_payload)
        report = write_hx7_archive(
            bundle_path,
            Path(args.output),
            chunk_size=args.chunk_size,
            max_iterations=args.iterations,
            workers=args.workers,
            table=table,
            max_levels=args.levels,
        )
    report.update(bundle_report(entries, len(bundle_payload)))
    report["includes"] = list(args.include)
    report["excludes"] = list(args.exclude)
    print(json.dumps(report, indent=2))
    return 0


def command_decompress_hx7(args: argparse.Namespace) -> int:
    table = load_shared_table(Path(args.table)) if args.table else None
    report = read_hx7_archive(
        Path(args.input),
        Path(args.output),
        workers=args.workers,
        table=table,
    )
    print(json.dumps(report, indent=2))
    return 0


def command_decompress_bundle_hx7(args: argparse.Namespace) -> int:
    table = load_shared_table(Path(args.table)) if args.table else None
    with tempfile.TemporaryDirectory() as tmpdir:
        bundle_path = Path(tmpdir) / "bundle.hxb"
        report = read_hx7_archive(
            Path(args.input),
            bundle_path,
            workers=args.workers,
            table=table,
        )
        bundle_payload = bundle_path.read_bytes()
        extraction = extract_bundle(decode_bundle(bundle_payload), Path(args.output))
        extraction["bundle_bytes"] = len(bundle_payload)
    report.update(extraction)
    print(json.dumps(report, indent=2))
    return 0


def command_inspect_hx7(args: argparse.Namespace) -> int:
    table = load_shared_table(Path(args.table)) if args.table else None
    report = inspect_hx7_archive(Path(args.input), table, resolve=args.resolve)
    print(json.dumps(report, indent=2))
    return 0


def command_compress_stream(args: argparse.Namespace) -> int:
    report = write_stream_archive(
        Path(args.input),
        Path(args.output),
        chunk_size=args.chunk_size,
        max_iterations=args.iterations,
        workers=args.workers,
    )
    print(json.dumps(report, indent=2))
    return 0


def command_decompress_stream(args: argparse.Namespace) -> int:
    report = read_stream_archive(Path(args.input), Path(args.output), workers=args.workers)
    print(json.dumps(report, indent=2))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="HelixZip: a DNA-inspired multi-pass compressor with lookup-table decompression."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    compress_parser = subparsers.add_parser("compress", help="compress a file into .hxz format")
    compress_parser.add_argument("input", help="path to the source file")
    compress_parser.add_argument("output", help="path to write the compressed archive")
    compress_parser.add_argument(
        "--iterations",
        type=int,
        default=None,
        help="maximum grammar-building passes to attempt; auto-tuned when omitted",
    )
    compress_parser.add_argument(
        "--table",
        help="optional JSON path to export the resolved client-side lookup table",
    )
    compress_parser.set_defaults(func=command_compress)

    compress_stream_parser = subparsers.add_parser(
        "compress-stream",
        help="compress a file as a stream of independent HelixZip frames",
    )
    compress_stream_parser.add_argument("input", help="path to the source file")
    compress_stream_parser.add_argument("output", help="path to write the stream archive")
    compress_stream_parser.add_argument(
        "--iterations",
        type=int,
        default=None,
        help="maximum grammar-building passes to attempt per chunk; auto-tuned when omitted",
    )
    compress_stream_parser.add_argument(
        "--chunk-size",
        type=int,
        default=DEFAULT_STREAM_CHUNK_SIZE,
        help="bytes per independently compressed stream chunk",
    )
    compress_stream_parser.add_argument(
        "--workers",
        type=int,
        default=1,
        help="number of worker processes to use; pass 0 to use all CPU cores",
    )
    compress_stream_parser.set_defaults(func=command_compress_stream)

    compress_hx7_parser = subparsers.add_parser(
        "compress-hx7",
        help="compress a file into an HX7 framed archive of independent blocks",
    )
    compress_hx7_parser.add_argument("input", help="path to the source file")
    compress_hx7_parser.add_argument("output", help="path to write the HX7 archive")
    compress_hx7_parser.add_argument(
        "--iterations",
        type=int,
        default=None,
        help="maximum grammar-building passes to attempt per HX7 block; auto-tuned when omitted",
    )
    compress_hx7_parser.add_argument(
        "--chunk-size",
        type=int,
        default=DEFAULT_STREAM_CHUNK_SIZE,
        help="bytes per independently compressed HX7 block",
    )
    compress_hx7_parser.add_argument(
        "--workers",
        type=int,
        default=1,
        help="number of worker processes to use; pass 0 to use all CPU cores",
    )
    compress_hx7_parser.add_argument(
        "--levels",
        type=int,
        default=2,
        help="maximum serial compression levels to apply per block",
    )
    compress_hx7_parser.add_argument(
        "--table",
        help="optional shared table in HX7T or JSON format; blocks may choose shared compression when smaller",
    )
    compress_hx7_parser.set_defaults(func=command_compress_hx7)

    compress_bundle_hx7_parser = subparsers.add_parser(
        "compress-bundle-hx7",
        help="compress multiple files and directory trees into one HX7 archive",
    )
    compress_bundle_hx7_parser.add_argument("output", help="path to write the HX7 bundle archive")
    compress_bundle_hx7_parser.add_argument("inputs", nargs="+", help="files or directories to include in the bundle")
    compress_bundle_hx7_parser.add_argument(
        "--include",
        action="append",
        default=[],
        help="glob filter for bundle paths to keep; may be repeated",
    )
    compress_bundle_hx7_parser.add_argument(
        "--exclude",
        action="append",
        default=[],
        help="glob filter for bundle paths to skip; may be repeated",
    )
    compress_bundle_hx7_parser.add_argument(
        "--iterations",
        type=int,
        default=None,
        help="maximum grammar-building passes to attempt per HX7 block; auto-tuned when omitted",
    )
    compress_bundle_hx7_parser.add_argument(
        "--chunk-size",
        type=int,
        default=DEFAULT_STREAM_CHUNK_SIZE,
        help="bytes per independently compressed HX7 block",
    )
    compress_bundle_hx7_parser.add_argument(
        "--workers",
        type=int,
        default=1,
        help="number of worker threads to use; pass 0 to use all CPU cores",
    )
    compress_bundle_hx7_parser.add_argument(
        "--levels",
        type=int,
        default=2,
        help="maximum serial compression levels to apply per block",
    )
    compress_bundle_hx7_parser.add_argument(
        "--table",
        help="optional shared table in HX7T or JSON format; blocks may choose shared compression when smaller",
    )
    compress_bundle_hx7_parser.set_defaults(func=command_compress_bundle_hx7)

    build_table_parser = subparsers.add_parser("build-table", help="derive a reusable shared lookup table")
    build_table_parser.add_argument("input", help="training file used to build the shared table")
    build_table_parser.add_argument("output", help="path to write the shared table")
    build_table_parser.add_argument(
        "--iterations",
        type=int,
        default=None,
        help="maximum grammar-building passes to attempt while building the table; auto-tuned when omitted",
    )
    build_table_parser.add_argument(
        "--no-resolve",
        action="store_true",
        help="omit fully resolved motifs from the JSON table",
    )
    build_table_parser.add_argument(
        "--json",
        action="store_true",
        help="write the shared table as legacy JSON instead of the default HX7T binary dictionary",
    )
    build_table_parser.set_defaults(func=command_build_table)

    compress_shared_parser = subparsers.add_parser(
        "compress-shared",
        help="compress a file against a shared client-side lookup table",
    )
    compress_shared_parser.add_argument("input", help="path to the source file")
    compress_shared_parser.add_argument("output", help="path to write the shared archive")
    compress_shared_parser.add_argument(
        "--table",
        help="shared table in HX7T or JSON format; auto-generated as HX7T next to the archive when omitted",
    )
    compress_shared_parser.add_argument(
        "--iterations",
        type=int,
        default=None,
        help="maximum delta-rule passes to attempt after table tokenization; auto-tuned when omitted",
    )
    compress_shared_parser.set_defaults(func=command_compress_shared)

    decompress_parser = subparsers.add_parser("decompress", help="restore a file from .hxz format")
    decompress_parser.add_argument("input", help="path to the .hxz archive")
    decompress_parser.add_argument("output", help="path to write the decompressed file")
    decompress_parser.set_defaults(func=command_decompress)

    decompress_stream_parser = subparsers.add_parser(
        "decompress-stream",
        help="restore a file from a streamed HelixZip archive",
    )
    decompress_stream_parser.add_argument("input", help="path to the streamed archive")
    decompress_stream_parser.add_argument("output", help="path to write the decompressed file")
    decompress_stream_parser.add_argument(
        "--workers",
        type=int,
        default=1,
        help="number of worker processes to use; pass 0 to use all CPU cores",
    )
    decompress_stream_parser.set_defaults(func=command_decompress_stream)

    decompress_hx7_parser = subparsers.add_parser(
        "decompress-hx7",
        help="restore a file from an HX7 framed archive",
    )
    decompress_hx7_parser.add_argument("input", help="path to the HX7 archive")
    decompress_hx7_parser.add_argument("output", help="path to write the decompressed file")
    decompress_hx7_parser.add_argument(
        "--workers",
        type=int,
        default=1,
        help="number of worker processes to use; pass 0 to use all CPU cores",
    )
    decompress_hx7_parser.add_argument(
        "--table",
        help="shared table in HX7T or JSON format when the archive contains shared blocks",
    )
    decompress_hx7_parser.set_defaults(func=command_decompress_hx7)

    decompress_bundle_hx7_parser = subparsers.add_parser(
        "decompress-bundle-hx7",
        help="restore an HX7 bundle archive into a directory tree",
    )
    decompress_bundle_hx7_parser.add_argument("input", help="path to the HX7 bundle archive")
    decompress_bundle_hx7_parser.add_argument("output", help="directory to write the restored bundle into")
    decompress_bundle_hx7_parser.add_argument(
        "--workers",
        type=int,
        default=1,
        help="number of worker threads to use; pass 0 to use all CPU cores",
    )
    decompress_bundle_hx7_parser.add_argument(
        "--table",
        help="shared table in HX7T or JSON format when the archive contains shared blocks",
    )
    decompress_bundle_hx7_parser.set_defaults(func=command_decompress_bundle_hx7)

    decompress_shared_parser = subparsers.add_parser(
        "decompress-shared",
        help="restore a shared archive using the client-side table",
    )
    decompress_shared_parser.add_argument("input", help="path to the shared archive")
    decompress_shared_parser.add_argument("output", help="path to write the decompressed file")
    decompress_shared_parser.add_argument(
        "--table",
        help="shared table in HX7T or JSON format; defaults to a sibling table when present",
    )
    decompress_shared_parser.set_defaults(func=command_decompress_shared)

    inspect_parser = subparsers.add_parser("inspect", help="print archive metadata and lookup rules")
    inspect_parser.add_argument("input", help="path to the .hxz archive")
    inspect_parser.add_argument(
        "--resolve",
        action="store_true",
        help="expand each rule into its full DNA motif",
    )
    inspect_parser.set_defaults(func=command_inspect)

    inspect_shared_parser = subparsers.add_parser(
        "inspect-shared",
        help="print metadata for a shared archive plus the effective lookup rules",
    )
    inspect_shared_parser.add_argument("input", help="path to the shared archive")
    inspect_shared_parser.add_argument(
        "--table",
        help="shared table in HX7T or JSON format; defaults to a sibling table when present",
    )
    inspect_shared_parser.add_argument(
        "--resolve",
        action="store_true",
        help="expand each rule into its full DNA motif",
    )
    inspect_shared_parser.set_defaults(func=command_inspect_shared)

    inspect_hx7_parser = subparsers.add_parser(
        "inspect-hx7",
        help="print metadata for an HX7 framed archive and its contained blocks",
    )
    inspect_hx7_parser.add_argument("input", help="path to the HX7 archive")
    inspect_hx7_parser.add_argument(
        "--table",
        help="shared table in HX7T or JSON format when resolving shared blocks",
    )
    inspect_hx7_parser.add_argument(
        "--resolve",
        action="store_true",
        help="expand each shared block rule into its full DNA motif when a table is available",
    )
    inspect_hx7_parser.set_defaults(func=command_inspect_hx7)
    return parser


def main(argv: Iterable[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
