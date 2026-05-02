#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdint>
#include <deque>
#include <filesystem>
#include <fnmatch.h>
#include <fstream>
#include <future>
#include <iomanip>
#include <iostream>
#include <limits>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>
#include <system_error>
#include <thread>
#include <tuple>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>
#include <zlib.h>

namespace {

constexpr const char* MAGIC = "HXZ6";
constexpr const char* STREAM_MAGIC = "HZS1";
constexpr const char* HX7_FRAME_MAGIC = "HX7F";
constexpr const char* BUNDLE_MAGIC = "HXB1";
constexpr std::uint64_t HX7_VERSION = 1;
constexpr std::uint64_t BUNDLE_VERSION = 1;
constexpr int HEADER_MAX_ITERATIONS = 32;
constexpr int BODY_MODE_GRAMMAR = 0;
constexpr int BODY_MODE_RAW = 1;
constexpr int BODY_MODE_REPEAT = 2;
constexpr int BODY_MODE_LZ = 3;
constexpr int MIN_BYTE_PAIR_REPETITIONS = 8;
constexpr int GRAMMAR_STALL_LIMIT = 4;
constexpr std::size_t DEFAULT_STREAM_CHUNK_SIZE = 64 * 1024;
constexpr int AUTO_MAX_ITERATIONS = 128;
constexpr std::size_t LZ_HASH_BYTES = 4;
constexpr std::size_t LZ_MIN_MATCH = 8;
constexpr std::size_t LZ_MAX_CANDIDATES = 8;
constexpr std::size_t LZ_MATCH_SHORTCUT = 64;
constexpr int HX7_BLOCK_STANDALONE = 1;
constexpr int HX7_BLOCK_SHARED = 2;
constexpr int HX7_BLOCK_ZLIB = 3;
constexpr int HX7_BLOCK_LZMA = 4;
constexpr int BUNDLE_ENTRY_FILE = 1;
constexpr int BUNDLE_ENTRY_DIR = 2;

using ByteVec = std::vector<std::uint8_t>;
using SymbolVec = std::vector<std::uint32_t>;
using Rule = std::pair<std::uint32_t, std::uint32_t>;
using RuleVec = std::vector<Rule>;

struct GrammarBlock {
    RuleVec rules;
    SymbolVec stream;
};

struct GrammarAnalysis {
    GrammarBlock block;
    int best_iteration = 0;
};

struct HelixArchive {
    std::uint64_t original_size = 0;
    RuleVec rules;
    SymbolVec stream;
    std::uint64_t requested_iterations = 0;
    int body_mode = BODY_MODE_GRAMMAR;
    ByteVec raw_payload;
    ByteVec lz_payload;
    ByteVec repeat_unit;
    std::uint64_t repeat_count = 0;
    ByteVec repeat_tail;

    ByteVec to_bytes() const;
    static HelixArchive from_bytes(const ByteVec& data);
    ByteVec decode() const;
};

struct StreamReport {
    std::uint64_t original_bytes = 0;
    std::uint64_t compressed_bytes = 0;
    double ratio = 0.0;
    std::uint64_t chunk_size = 0;
    std::uint64_t chunks = 0;
    std::uint64_t workers = 1;
    std::uint64_t grammar_chunks = 0;
    std::uint64_t raw_chunks = 0;
    std::uint64_t lz_chunks = 0;
    std::uint64_t repeat_chunks = 0;
};

struct StreamRestoreReport {
    std::uint64_t restored_bytes = 0;
    std::uint64_t chunk_size = 0;
    std::uint64_t requested_iterations = 0;
    std::uint64_t chunks = 0;
    std::uint64_t workers = 1;
    std::uint64_t grammar_chunks = 0;
    std::uint64_t raw_chunks = 0;
    std::uint64_t lz_chunks = 0;
    std::uint64_t repeat_chunks = 0;
};

struct HX7Report {
    std::uint64_t original_bytes = 0;
    std::uint64_t compressed_bytes = 0;
    double ratio = 0.0;
    std::uint64_t chunk_size = 0;
    std::uint64_t max_levels = 0;
    std::uint64_t blocks = 0;
    std::uint64_t workers = 1;
    std::uint64_t standalone_blocks = 0;
    std::uint64_t shared_blocks = 0;
    std::uint64_t zlib_blocks = 0;
    std::uint64_t lzma_blocks = 0;
};

struct HX7RestoreReport {
    std::uint64_t restored_bytes = 0;
    std::uint64_t chunk_size = 0;
    std::uint64_t requested_iterations = 0;
    std::uint64_t max_levels = 0;
    std::uint64_t blocks = 0;
    std::uint64_t workers = 1;
    std::uint64_t standalone_blocks = 0;
    std::uint64_t shared_blocks = 0;
    std::uint64_t zlib_blocks = 0;
    std::uint64_t lzma_blocks = 0;
};

struct HX7InspectBlock {
    std::uint64_t index = 0;
    std::vector<int> codec_chain;
    std::uint64_t raw_size = 0;
    std::uint64_t compressed_size = 0;
    std::uint32_t checksum = 0;
    std::string terminal_codec;
    std::string body_mode;
    std::uint64_t rules = 0;
    std::uint64_t stream_symbols = 0;
};

struct HX7InspectReport {
    std::uint64_t chunk_size = 0;
    std::uint64_t requested_iterations = 0;
    std::uint64_t max_levels = 0;
    std::uint64_t compressed_bytes = 0;
    std::uint64_t blocks = 0;
    std::uint64_t standalone_blocks = 0;
    std::uint64_t shared_blocks = 0;
    std::uint64_t zlib_blocks = 0;
    std::uint64_t lzma_blocks = 0;
    std::vector<HX7InspectBlock> block_reports;
};

struct BundleEntry {
    int entry_type = BUNDLE_ENTRY_FILE;
    std::string path;
    std::uint64_t mode = 0;
    ByteVec payload;
};

GrammarBlock compress_grammar(const ByteVec& data, int max_iterations = 64);
GrammarAnalysis analyze_grammar(const ByteVec& data, int max_iterations = 64);
ByteVec encode_lz_bytes(const ByteVec& data);
ByteVec decode_lz_bytes(const ByteVec& payload, std::uint64_t original_size);

[[noreturn]] void fail(const std::string& message) {
    throw std::runtime_error(message);
}

void append_bytes(ByteVec& out, const ByteVec& data) {
    out.insert(out.end(), data.begin(), data.end());
}

ByteVec encode_varint(std::uint64_t value) {
    ByteVec out;
    while (true) {
        std::uint8_t chunk = static_cast<std::uint8_t>(value & 0x7FU);
        value >>= 7U;
        if (value != 0) {
            out.push_back(static_cast<std::uint8_t>(chunk | 0x80U));
        } else {
            out.push_back(chunk);
            return out;
        }
    }
}

std::size_t varint_size(std::uint64_t value) {
    std::size_t size = 1;
    while (value >= 0x80U) {
        value >>= 7U;
        ++size;
    }
    return size;
}

std::uint64_t decode_varint(const ByteVec& data, std::size_t& offset) {
    int shift = 0;
    std::uint64_t value = 0;
    while (true) {
        if (offset >= data.size()) {
            fail("unexpected end of data while decoding varint");
        }
        const std::uint8_t byte = data[offset++];
        value |= static_cast<std::uint64_t>(byte & 0x7FU) << shift;
        if ((byte & 0x80U) == 0) {
            return value;
        }
        shift += 7;
        if (shift > 63) {
            fail("varint is too large");
        }
    }
}

std::uint64_t decode_varint_stream(std::istream& in, bool allow_eof = false) {
    int shift = 0;
    std::uint64_t value = 0;
    while (true) {
        int raw = in.get();
        if (raw == EOF) {
            if (allow_eof && shift == 0) {
                return std::numeric_limits<std::uint64_t>::max();
            }
            fail("unexpected end of stream while decoding varint");
        }
        const auto byte = static_cast<std::uint8_t>(raw);
        value |= static_cast<std::uint64_t>(byte & 0x7FU) << shift;
        if ((byte & 0x80U) == 0) {
            return value;
        }
        shift += 7;
        if (shift > 63) {
            fail("varint is too large");
        }
    }
}

std::uint32_t read_u32_le(const ByteVec& data, std::size_t offset) {
    return static_cast<std::uint32_t>(
        data[offset] |
        (static_cast<std::uint32_t>(data[offset + 1]) << 8U) |
        (static_cast<std::uint32_t>(data[offset + 2]) << 16U) |
        (static_cast<std::uint32_t>(data[offset + 3]) << 24U)
    );
}

ByteVec encode_u32_le(std::uint32_t value) {
    return ByteVec{
        static_cast<std::uint8_t>(value & 0xFFU),
        static_cast<std::uint8_t>((value >> 8U) & 0xFFU),
        static_cast<std::uint8_t>((value >> 16U) & 0xFFU),
        static_cast<std::uint8_t>((value >> 24U) & 0xFFU),
    };
}

std::uint32_t crc32_bytes(const ByteVec& data) {
    return static_cast<std::uint32_t>(::crc32(0L, reinterpret_cast<const Bytef*>(data.data()), static_cast<uInt>(data.size())));
}

ByteVec zlib_compress_bytes(const ByteVec& data) {
    uLongf bound = compressBound(static_cast<uLong>(data.size()));
    ByteVec out(bound);
    int status = ::compress2(
        reinterpret_cast<Bytef*>(out.data()),
        &bound,
        reinterpret_cast<const Bytef*>(data.data()),
        static_cast<uLong>(data.size()),
        Z_BEST_COMPRESSION
    );
    if (status != Z_OK) {
        fail("zlib compression failed");
    }
    out.resize(static_cast<std::size_t>(bound));
    return out;
}

ByteVec zlib_decompress_bytes(const ByteVec& data) {
    z_stream stream{};
    stream.next_in = const_cast<Bytef*>(reinterpret_cast<const Bytef*>(data.data()));
    stream.avail_in = static_cast<uInt>(data.size());
    if (inflateInit(&stream) != Z_OK) {
        fail("zlib decompression init failed");
    }
    ByteVec out;
    ByteVec buffer(8192);
    int status = Z_OK;
    while (status == Z_OK) {
        stream.next_out = reinterpret_cast<Bytef*>(buffer.data());
        stream.avail_out = static_cast<uInt>(buffer.size());
        status = inflate(&stream, Z_NO_FLUSH);
        const std::size_t produced = buffer.size() - static_cast<std::size_t>(stream.avail_out);
        out.insert(out.end(), buffer.begin(), buffer.begin() + static_cast<std::ptrdiff_t>(produced));
    }
    inflateEnd(&stream);
    if (status != Z_STREAM_END) {
        fail("zlib decompression failed");
    }
    return out;
}

ByteVec read_file(const std::string& path) {
    std::ifstream in(path, std::ios::binary);
    if (!in) {
        fail("failed to open input file: " + path);
    }
    return ByteVec(std::istreambuf_iterator<char>(in), std::istreambuf_iterator<char>());
}

void write_file(const std::string& path, const ByteVec& data) {
    std::ofstream out(path, std::ios::binary);
    if (!out) {
        fail("failed to open output file: " + path);
    }
    out.write(reinterpret_cast<const char*>(data.data()), static_cast<std::streamsize>(data.size()));
    if (!out) {
        fail("failed to write output file: " + path);
    }
}

std::string normalize_bundle_path(const std::string& path) {
    std::string normalized;
    normalized.reserve(path.size());
    for (char ch : path) {
        normalized.push_back(ch == '\\' ? '/' : ch);
    }
    while (!normalized.empty() && normalized.front() == '/') {
        normalized.erase(normalized.begin());
    }
    while (!normalized.empty() && normalized.back() == '/') {
        normalized.pop_back();
    }
    std::vector<std::string> parts;
    std::stringstream stream(normalized);
    std::string part;
    while (std::getline(stream, part, '/')) {
        if (part.empty() || part == ".") {
            continue;
        }
        if (part == "..") {
            fail("bundle path may not traverse upwards: " + path);
        }
        parts.push_back(part);
    }
    if (parts.empty()) {
        fail("bundle path may not be empty");
    }
    std::ostringstream out;
    for (std::size_t i = 0; i < parts.size(); ++i) {
        if (i != 0) {
            out << '/';
        }
        out << parts[i];
    }
    return out.str();
}

std::string bundle_basename(const std::string& path) {
    const std::string normalized = normalize_bundle_path(path);
    const std::size_t slash = normalized.find_last_of('/');
    return slash == std::string::npos ? normalized : normalized.substr(slash + 1);
}

bool bundle_path_matches(const std::string& path, const std::vector<std::string>& patterns, bool is_dir) {
    if (patterns.empty()) {
        return false;
    }
    const std::string normalized = normalize_bundle_path(path);
    const std::string basename = bundle_basename(normalized);
    const std::string dir_candidate = is_dir ? normalized + "/" : normalized;
    for (const std::string& pattern : patterns) {
        if (fnmatch(pattern.c_str(), normalized.c_str(), 0) == 0) {
            return true;
        }
        if (fnmatch(pattern.c_str(), basename.c_str(), 0) == 0) {
            return true;
        }
        if (is_dir && fnmatch(pattern.c_str(), dir_candidate.c_str(), 0) == 0) {
            return true;
        }
    }
    return false;
}

bool bundle_path_selected(const std::string& path, const std::vector<std::string>& includes, const std::vector<std::string>& excludes, bool is_dir) {
    const std::string normalized = normalize_bundle_path(path);
    if (bundle_path_matches(normalized, excludes, is_dir)) {
        return false;
    }
    if (includes.empty()) {
        return true;
    }
    return bundle_path_matches(normalized, includes, is_dir);
}

std::vector<std::string> bundle_parent_paths(const std::string& path) {
    const std::string normalized = normalize_bundle_path(path);
    std::vector<std::string> parents;
    std::size_t offset = 0;
    while (true) {
        const std::size_t slash = normalized.find('/', offset);
        if (slash == std::string::npos) {
            break;
        }
        parents.push_back(normalized.substr(0, slash));
        offset = slash + 1;
    }
    return parents;
}

std::vector<BundleEntry> collect_bundle_entries(
    const std::vector<std::string>& input_paths,
    const std::vector<std::string>& includes,
    const std::vector<std::string>& excludes
) {
    if (input_paths.empty()) {
        fail("at least one input path is required");
    }
    std::unordered_set<std::string> seen_roots;
    std::unordered_map<std::string, std::uint64_t> directories;
    std::vector<BundleEntry> files;

    for (const std::string& input_value : input_paths) {
        const std::filesystem::path source(input_value);
        if (!std::filesystem::exists(source)) {
            fail("input path does not exist: " + input_value);
        }
        const std::string root_name = normalize_bundle_path(source.filename().string());
        if (!seen_roots.insert(root_name).second) {
            fail("duplicate bundle root name: " + root_name);
        }

        if (std::filesystem::is_regular_file(source)) {
            if (bundle_path_selected(root_name, includes, excludes, false)) {
                const auto status = std::filesystem::status(source);
                files.push_back({BUNDLE_ENTRY_FILE, root_name, static_cast<std::uint64_t>(status.permissions()) & 0777ULL, read_file(input_value)});
            }
            continue;
        }
        if (!std::filesystem::is_directory(source)) {
            fail("unsupported input path type: " + input_value);
        }

        std::unordered_map<std::string, std::uint64_t> source_directories;
        std::unordered_set<std::string> matched_directories;
        std::vector<std::string> included_file_paths;
        const auto root_status = std::filesystem::status(source);
        if (!bundle_path_matches(root_name, excludes, true)) {
            source_directories[root_name] = static_cast<std::uint64_t>(root_status.permissions()) & 0777ULL;
            if (bundle_path_selected(root_name, includes, excludes, true)) {
                matched_directories.insert(root_name);
            }
        }

        std::vector<std::filesystem::path> discovered;
        for (const auto& entry : std::filesystem::recursive_directory_iterator(source)) {
            discovered.push_back(entry.path());
        }
        std::sort(discovered.begin(), discovered.end(), [](const auto& lhs, const auto& rhs) {
            return lhs.generic_string() < rhs.generic_string();
        });

        for (const std::filesystem::path& candidate : discovered) {
            const std::filesystem::path relative = std::filesystem::relative(candidate, source);
            const std::string bundle_path = normalize_bundle_path((std::filesystem::path(root_name) / relative).generic_string());
            if (std::filesystem::is_directory(candidate)) {
                if (bundle_path_matches(bundle_path, excludes, true)) {
                    continue;
                }
                const auto status = std::filesystem::status(candidate);
                source_directories[bundle_path] = static_cast<std::uint64_t>(status.permissions()) & 0777ULL;
                if (bundle_path_selected(bundle_path, includes, excludes, true)) {
                    matched_directories.insert(bundle_path);
                }
                continue;
            }
            if (!std::filesystem::is_regular_file(candidate)) {
                continue;
            }
            if (!bundle_path_selected(bundle_path, includes, excludes, false)) {
                continue;
            }
            const auto status = std::filesystem::status(candidate);
            files.push_back({
                BUNDLE_ENTRY_FILE,
                bundle_path,
                static_cast<std::uint64_t>(status.permissions()) & 0777ULL,
                read_file(candidate.string())
            });
            included_file_paths.push_back(bundle_path);
        }

        std::unordered_set<std::string> dirs_to_keep;
        if (includes.empty()) {
            for (const auto& item : source_directories) {
                dirs_to_keep.insert(item.first);
            }
        } else {
            for (const std::string& path : matched_directories) {
                dirs_to_keep.insert(path);
            }
            for (const std::string& file_path : included_file_paths) {
                for (const std::string& parent : bundle_parent_paths(file_path)) {
                    dirs_to_keep.insert(parent);
                }
            }
        }
        for (const std::string& path : dirs_to_keep) {
            const auto found = source_directories.find(path);
            if (found != source_directories.end()) {
                directories[path] = found->second;
            }
        }
    }

    std::vector<BundleEntry> entries;
    entries.reserve(directories.size() + files.size());
    std::vector<std::pair<std::string, std::uint64_t>> sorted_directories(directories.begin(), directories.end());
    std::sort(sorted_directories.begin(), sorted_directories.end(), [](const auto& lhs, const auto& rhs) {
        return lhs.first < rhs.first;
    });
    for (const auto& [path, mode] : sorted_directories) {
        entries.push_back({BUNDLE_ENTRY_DIR, path, mode, {}});
    }
    std::sort(files.begin(), files.end(), [](const BundleEntry& lhs, const BundleEntry& rhs) {
        return lhs.path < rhs.path;
    });
    entries.insert(entries.end(), files.begin(), files.end());
    if (entries.empty()) {
        fail("bundle selection produced no files or directories");
    }
    return entries;
}

ByteVec encode_bundle(const std::vector<BundleEntry>& entries) {
    ByteVec out(BUNDLE_MAGIC, BUNDLE_MAGIC + 4);
    append_bytes(out, encode_varint(BUNDLE_VERSION));
    append_bytes(out, encode_varint(entries.size()));
    for (const BundleEntry& entry : entries) {
        const std::string normalized_path = normalize_bundle_path(entry.path);
        const ByteVec path_bytes(normalized_path.begin(), normalized_path.end());
        append_bytes(out, encode_varint(static_cast<std::uint64_t>(entry.entry_type)));
        append_bytes(out, encode_varint(path_bytes.size()));
        append_bytes(out, path_bytes);
        append_bytes(out, encode_varint(entry.mode & 0777ULL));
        if (entry.entry_type == BUNDLE_ENTRY_FILE) {
            append_bytes(out, encode_varint(entry.payload.size()));
            append_bytes(out, entry.payload);
        } else if (entry.entry_type != BUNDLE_ENTRY_DIR) {
            fail("unsupported bundle entry type");
        }
    }
    return out;
}

std::vector<BundleEntry> decode_bundle(const ByteVec& payload) {
    if (payload.size() < 4 || std::string(reinterpret_cast<const char*>(payload.data()), 4) != BUNDLE_MAGIC) {
        fail("not a HelixZip bundle payload");
    }
    std::size_t offset = 4;
    const std::uint64_t version = decode_varint(payload, offset);
    if (version != BUNDLE_VERSION) {
        fail("unsupported bundle version");
    }
    const std::uint64_t entry_count = decode_varint(payload, offset);
    std::vector<BundleEntry> entries;
    entries.reserve(static_cast<std::size_t>(entry_count));
    for (std::uint64_t index = 0; index < entry_count; ++index) {
        const int entry_type = static_cast<int>(decode_varint(payload, offset));
        const std::uint64_t path_length = decode_varint(payload, offset);
        if (offset + path_length > payload.size()) {
            fail("bundle path is truncated");
        }
        const std::string path = normalize_bundle_path(std::string(payload.begin() + static_cast<std::ptrdiff_t>(offset), payload.begin() + static_cast<std::ptrdiff_t>(offset + path_length)));
        offset += static_cast<std::size_t>(path_length);
        const std::uint64_t mode = decode_varint(payload, offset) & 0777ULL;
        if (entry_type == BUNDLE_ENTRY_FILE) {
            const std::uint64_t payload_size = decode_varint(payload, offset);
            if (offset + payload_size > payload.size()) {
                fail("bundle file payload is truncated");
            }
            ByteVec file_payload(payload.begin() + static_cast<std::ptrdiff_t>(offset), payload.begin() + static_cast<std::ptrdiff_t>(offset + payload_size));
            offset += static_cast<std::size_t>(payload_size);
            entries.push_back({entry_type, path, mode, std::move(file_payload)});
        } else if (entry_type == BUNDLE_ENTRY_DIR) {
            entries.push_back({entry_type, path, mode, {}});
        } else {
            fail("unsupported bundle entry type");
        }
    }
    if (offset != payload.size()) {
        fail("bundle payload contains trailing bytes");
    }
    return entries;
}

std::tuple<std::uint64_t, std::uint64_t, std::uint64_t, std::uint64_t> bundle_stats(const std::vector<BundleEntry>& entries, std::uint64_t bundle_bytes) {
    std::uint64_t directories = 0;
    std::uint64_t files = 0;
    std::uint64_t input_bytes = 0;
    for (const BundleEntry& entry : entries) {
        if (entry.entry_type == BUNDLE_ENTRY_DIR) {
            ++directories;
        } else if (entry.entry_type == BUNDLE_ENTRY_FILE) {
            ++files;
            input_bytes += entry.payload.size();
        }
    }
    return {directories, files, input_bytes, bundle_bytes};
}

std::tuple<std::uint64_t, std::uint64_t, std::uint64_t> extract_bundle(const std::vector<BundleEntry>& entries, const std::string& output_dir) {
    const std::filesystem::path root(output_dir);
    std::filesystem::create_directories(root);
    std::uint64_t directories = 0;
    std::uint64_t files = 0;
    std::uint64_t input_bytes = 0;
    for (const BundleEntry& entry : entries) {
        const std::filesystem::path relative(entry.path);
        const std::filesystem::path target = root / relative;
        if (entry.entry_type == BUNDLE_ENTRY_DIR) {
            std::filesystem::create_directories(target);
            std::error_code ignore;
            std::filesystem::permissions(target, static_cast<std::filesystem::perms>(entry.mode), std::filesystem::perm_options::replace, ignore);
            ++directories;
            continue;
        }
        if (entry.entry_type != BUNDLE_ENTRY_FILE) {
            fail("unsupported bundle entry type");
        }
        std::filesystem::create_directories(target.parent_path());
        write_file(target.string(), entry.payload);
        std::error_code ignore;
        std::filesystem::permissions(target, static_cast<std::filesystem::perms>(entry.mode), std::filesystem::perm_options::replace, ignore);
        ++files;
        input_bytes += entry.payload.size();
    }
    return {directories, files, input_bytes};
}

std::string make_temp_path(const std::string& suffix) {
    const auto seed = std::chrono::steady_clock::now().time_since_epoch().count();
    return (std::filesystem::temp_directory_path() / ("helixzip_bundle_" + std::to_string(seed) + suffix)).string();
}

SymbolVec bytes_to_bases(const ByteVec& data) {
    SymbolVec bases;
    bases.reserve(data.size() * 4);
    for (std::uint8_t byte : data) {
        bases.push_back((byte >> 6U) & 0b11U);
        bases.push_back((byte >> 4U) & 0b11U);
        bases.push_back((byte >> 2U) & 0b11U);
        bases.push_back(byte & 0b11U);
    }
    return bases;
}

ByteVec bases_to_bytes(const SymbolVec& bases) {
    if (bases.size() % 4 != 0) {
        fail("base stream must be a multiple of 4");
    }
    ByteVec out;
    out.reserve(bases.size() / 4);
    for (std::size_t i = 0; i < bases.size(); i += 4) {
        out.push_back(static_cast<std::uint8_t>(
            (bases[i] << 6U) | (bases[i + 1] << 4U) | (bases[i + 2] << 2U) | bases[i + 3]
        ));
    }
    return out;
}

int symbol_width(std::size_t symbol_count) {
    if (symbol_count <= 1) {
        return 0;
    }
    int width = 0;
    std::size_t value = symbol_count - 1;
    while (value > 0) {
        ++width;
        value >>= 1U;
    }
    return std::max(1, width);
}

ByteVec pack_symbols(const SymbolVec& symbols, int bit_width) {
    if (bit_width == 0) {
        return {};
    }
    ByteVec out;
    std::uint64_t accumulator = 0;
    int bits_in_accumulator = 0;
    for (std::uint32_t symbol : symbols) {
        accumulator = (accumulator << bit_width) | symbol;
        bits_in_accumulator += bit_width;
        while (bits_in_accumulator >= 8) {
            bits_in_accumulator -= 8;
            out.push_back(static_cast<std::uint8_t>((accumulator >> bits_in_accumulator) & 0xFFU));
        }
    }
    if (bits_in_accumulator > 0) {
        out.push_back(static_cast<std::uint8_t>((accumulator << (8 - bits_in_accumulator)) & 0xFFU));
    }
    return out;
}

SymbolVec unpack_symbols(const ByteVec& payload, std::size_t count, int bit_width) {
    if (bit_width == 0) {
        return {};
    }
    SymbolVec symbols;
    symbols.reserve(count);
    std::uint64_t accumulator = 0;
    int bits_in_accumulator = 0;
    const std::uint64_t mask = (bit_width == 64) ? std::numeric_limits<std::uint64_t>::max() : ((1ULL << bit_width) - 1ULL);
    for (std::uint8_t byte : payload) {
        accumulator = (accumulator << 8U) | byte;
        bits_in_accumulator += 8;
        while (bits_in_accumulator >= bit_width && symbols.size() < count) {
            bits_in_accumulator -= bit_width;
            symbols.push_back(static_cast<std::uint32_t>((accumulator >> bits_in_accumulator) & mask));
            if (bits_in_accumulator == 0) {
                accumulator = 0;
            } else {
                accumulator &= ((1ULL << bits_in_accumulator) - 1ULL);
            }
        }
    }
    if (symbols.size() != count) {
        fail("payload ended before all symbols were decoded");
    }
    return symbols;
}

SymbolVec expand_symbols(const RuleVec& rules, const SymbolVec& stream) {
    SymbolVec expanded;
    expanded.reserve(stream.size() * 4);
    SymbolVec stack(stream.rbegin(), stream.rend());
    while (!stack.empty()) {
        const std::uint32_t symbol = stack.back();
        stack.pop_back();
        if (symbol < 4) {
            expanded.push_back(symbol);
            continue;
        }
        const std::size_t rule_index = static_cast<std::size_t>(symbol - 4);
        if (rule_index >= rules.size()) {
            fail("invalid rule symbol");
        }
        const auto [left, right] = rules[rule_index];
        stack.push_back(right);
        stack.push_back(left);
    }
    return expanded;
}

ByteVec decode_grammar_bytes(const RuleVec& rules, const SymbolVec& stream, std::uint64_t original_size) {
    SymbolVec bases = expand_symbols(rules, stream);
    if (bases.size() != original_size * 4ULL) {
        fail("decoded base length mismatch");
    }
    return bases_to_bytes(bases);
}

ByteVec serialize_rules_and_payload(const RuleVec& rules, const SymbolVec& stream, std::size_t initial_symbol_count = 4) {
    ByteVec out;
    for (const auto& [left, right] : rules) {
        append_bytes(out, encode_varint(left));
        append_bytes(out, encode_varint(right));
    }
    append_bytes(out, pack_symbols(stream, symbol_width(initial_symbol_count + rules.size())));
    return out;
}

std::size_t serialized_rules_and_payload_size(const RuleVec& rules, std::size_t stream_length, std::size_t initial_symbol_count = 4) {
    std::size_t size = 0;
    for (const auto& [left, right] : rules) {
        size += varint_size(left);
        size += varint_size(right);
    }
    const int width = symbol_width(initial_symbol_count + rules.size());
    size += (stream_length * static_cast<std::size_t>(width) + 7ULL) / 8ULL;
    return size;
}

GrammarBlock parse_rules_and_payload(const ByteVec& data, std::size_t& offset, std::size_t rule_count, std::size_t stream_length, std::size_t initial_symbol_count = 4) {
    RuleVec rules;
    rules.reserve(rule_count);
    for (std::size_t i = 0; i < rule_count; ++i) {
        std::uint32_t left = static_cast<std::uint32_t>(decode_varint(data, offset));
        std::uint32_t right = static_cast<std::uint32_t>(decode_varint(data, offset));
        rules.emplace_back(left, right);
    }
    const int width = symbol_width(initial_symbol_count + rule_count);
    const std::size_t payload_length = (stream_length * static_cast<std::size_t>(width) + 7ULL) / 8ULL;
    if (offset + payload_length > data.size()) {
        fail("archive payload is truncated");
    }
    ByteVec payload(data.begin() + static_cast<std::ptrdiff_t>(offset), data.begin() + static_cast<std::ptrdiff_t>(offset + payload_length));
    offset += payload_length;
    SymbolVec stream = unpack_symbols(payload, stream_length, width);
    return {std::move(rules), std::move(stream)};
}

ByteVec encode_header_metadata(int body_mode, std::uint64_t original_size, std::uint64_t requested_iterations, std::uint64_t primary_value, std::uint64_t secondary_value) {
    ByteVec out;
    append_bytes(out, encode_varint(body_mode));
    append_bytes(out, encode_varint(original_size));
    append_bytes(out, encode_varint(requested_iterations));
    append_bytes(out, encode_varint(primary_value));
    append_bytes(out, encode_varint(secondary_value));
    return out;
}

std::tuple<int, std::uint64_t, std::uint64_t, std::uint64_t, std::uint64_t> decode_header_metadata(const ByteVec& data) {
    std::size_t offset = 0;
    int body_mode = static_cast<int>(decode_varint(data, offset));
    std::uint64_t original_size = decode_varint(data, offset);
    std::uint64_t requested_iterations = decode_varint(data, offset);
    std::uint64_t primary_value = decode_varint(data, offset);
    std::uint64_t secondary_value = decode_varint(data, offset);
    if (offset != data.size()) {
        fail("standalone header metadata is malformed");
    }
    return {body_mode, original_size, requested_iterations, primary_value, secondary_value};
}

std::uint64_t header_primary_value(const HelixArchive& archive) {
    if (archive.body_mode == BODY_MODE_GRAMMAR) {
        return archive.rules.size();
    }
    if (archive.body_mode == BODY_MODE_RAW) {
        return 0;
    }
    if (archive.body_mode == BODY_MODE_LZ) {
        return archive.lz_payload.size();
    }
    if (archive.body_mode == BODY_MODE_REPEAT) {
        return archive.repeat_unit.size();
    }
    fail("unsupported body mode");
}

std::uint64_t header_secondary_value(const HelixArchive& archive) {
    if (archive.body_mode == BODY_MODE_GRAMMAR) {
        return archive.stream.size();
    }
    if (archive.body_mode == BODY_MODE_RAW) {
        return 0;
    }
    if (archive.body_mode == BODY_MODE_LZ) {
        return 0;
    }
    if (archive.body_mode == BODY_MODE_REPEAT) {
        return archive.repeat_count;
    }
    fail("unsupported body mode");
}

int resolve_iteration_limit(const std::optional<int>& max_iterations) {
    if (!max_iterations.has_value()) {
        return AUTO_MAX_ITERATIONS;
    }
    if (*max_iterations < 0) {
        fail("max_iterations must be non-negative");
    }
    return *max_iterations;
}

std::size_t header_block_size(const ByteVec& header_bytes, std::uint64_t requested_iterations) {
    const int header_iterations = std::min<int>(HEADER_MAX_ITERATIONS, std::max<std::uint64_t>(requested_iterations, 1));
    const GrammarBlock header_block = compress_grammar(header_bytes, header_iterations);
    return varint_size(header_bytes.size()) +
           varint_size(header_block.rules.size()) +
           varint_size(header_block.stream.size()) +
           serialized_rules_and_payload_size(header_block.rules, header_block.stream.size());
}

std::size_t archive_serialized_size(const HelixArchive& archive) {
    const ByteVec header_bytes = encode_header_metadata(
        archive.body_mode,
        archive.original_size,
        archive.requested_iterations,
        header_primary_value(archive),
        header_secondary_value(archive)
    );
    std::size_t size = 4 + header_block_size(header_bytes, archive.requested_iterations);
    if (archive.body_mode == BODY_MODE_GRAMMAR) {
        size += serialized_rules_and_payload_size(archive.rules, archive.stream.size());
    } else if (archive.body_mode == BODY_MODE_RAW) {
        size += archive.raw_payload.size();
    } else if (archive.body_mode == BODY_MODE_LZ) {
        size += archive.lz_payload.size();
    } else if (archive.body_mode == BODY_MODE_REPEAT) {
        size += archive.repeat_unit.size() + archive.repeat_tail.size();
    } else {
        fail("unsupported body mode");
    }
    return size;
}

struct PairStat {
    std::uint32_t left = 0;
    std::uint32_t right = 0;
    std::size_t count = 0;
    std::size_t first_pos = 0;
};

std::pair<SymbolVec, std::size_t> replace_pair(const SymbolVec& stream, Rule pair, std::uint32_t replacement) {
    SymbolVec replaced;
    replaced.reserve(stream.size());
    std::size_t replacements = 0;
    std::size_t index = 0;
    while (index < stream.size()) {
        if ((index + 1U) < stream.size() && stream[index] == pair.first && stream[index + 1U] == pair.second) {
            replaced.push_back(replacement);
            ++replacements;
            index += 2U;
        } else {
            replaced.push_back(stream[index]);
            ++index;
        }
    }
    return {std::move(replaced), replacements};
}

std::optional<std::tuple<Rule, SymbolVec, std::size_t>> find_best_pair(const SymbolVec& stream, std::uint32_t next_symbol, std::size_t candidate_limit = 32) {
    if (stream.size() < 2) {
        return std::nullopt;
    }
    std::unordered_map<std::uint64_t, PairStat> stats;
    stats.reserve(stream.size());
    for (std::size_t i = 0; i + 1 < stream.size(); ++i) {
        const std::uint32_t left = stream[i];
        const std::uint32_t right = stream[i + 1];
        const std::uint64_t key = (static_cast<std::uint64_t>(left) << 32U) | right;
        auto it = stats.find(key);
        if (it == stats.end()) {
            stats.emplace(key, PairStat{left, right, 1, i});
        } else {
            ++it->second.count;
        }
    }
    std::vector<PairStat> ranked;
    ranked.reserve(stats.size());
    for (const auto& item : stats) {
        ranked.push_back(item.second);
    }
    std::sort(ranked.begin(), ranked.end(), [](const PairStat& a, const PairStat& b) {
        if (a.count != b.count) {
            return a.count > b.count;
        }
        return a.first_pos < b.first_pos;
    });
    const std::size_t limit = std::min(candidate_limit, ranked.size());
    for (std::size_t i = 0; i < limit; ++i) {
        auto [candidate_stream, replacements] = replace_pair(stream, {ranked[i].left, ranked[i].right}, next_symbol);
        const auto net_gain = static_cast<long long>(replacements) - 2LL;
        if (net_gain > 0) {
            return std::make_optional(std::make_tuple(Rule{ranked[i].left, ranked[i].right}, std::move(candidate_stream), replacements));
        }
    }
    return std::nullopt;
}

bool should_try_grammar(const ByteVec& data, int max_iterations) {
    if (max_iterations <= 0 || data.size() < 2) {
        return false;
    }
    if (data.size() < 128) {
        return true;
    }
    std::unordered_map<std::uint16_t, std::size_t> counts;
    counts.reserve(data.size());
    std::size_t best = 0;
    for (std::size_t i = 0; i + 1 < data.size(); ++i) {
        const std::uint16_t key = static_cast<std::uint16_t>((data[i] << 8U) | data[i + 1]);
        std::size_t count = ++counts[key];
        if (count > best) {
            best = count;
        }
    }
    return best >= MIN_BYTE_PAIR_REPETITIONS;
}

std::optional<std::tuple<ByteVec, std::uint64_t, ByteVec>> find_repeating_pattern(const ByteVec& data, std::size_t max_unit_size = 256) {
    if (data.size() < 2) {
        return std::nullopt;
    }
    const std::size_t limit = std::min(max_unit_size, data.size() - 1);
    std::optional<std::tuple<ByteVec, std::uint64_t, ByteVec>> best_match;
    std::size_t best_cost = std::numeric_limits<std::size_t>::max();
    for (std::size_t unit_size = 1; unit_size <= limit; ++unit_size) {
        if (best_match.has_value() && unit_size >= best_cost) {
            break;
        }
        ByteVec unit(data.begin(), data.begin() + static_cast<std::ptrdiff_t>(unit_size));
        std::uint64_t repeat_count = 1;
        std::size_t cursor = unit_size;
        while (cursor + unit_size <= data.size() &&
               std::equal(unit.begin(), unit.end(), data.begin() + static_cast<std::ptrdiff_t>(cursor))) {
            ++repeat_count;
            cursor += unit_size;
        }
        if (repeat_count < 2) {
            continue;
        }
        ByteVec tail(data.begin() + static_cast<std::ptrdiff_t>(cursor), data.end());
        const std::size_t candidate_cost = unit.size() + tail.size();
        if (candidate_cost < best_cost) {
            best_cost = candidate_cost;
            best_match = std::make_optional(std::make_tuple(std::move(unit), repeat_count, std::move(tail)));
            if (best_cost == std::get<0>(*best_match).size()) {
                return best_match;
            }
        }
    }
    return best_match;
}

void add_lz_history(std::unordered_map<std::uint32_t, std::deque<std::size_t>>& history, std::uint32_t key, std::size_t position) {
    auto& chain = history[key];
    chain.push_back(position);
    if (chain.size() > LZ_MAX_CANDIDATES) {
        chain.pop_front();
    }
}

ByteVec encode_lz_bytes(const ByteVec& data) {
    if (data.empty()) {
        return encode_varint(0);
    }

    ByteVec out;
    std::unordered_map<std::uint32_t, std::deque<std::size_t>> history;
    history.reserve(std::min<std::size_t>(data.size(), 1 << 20));
    std::size_t anchor = 0;
    std::size_t index = 0;
    const std::size_t last_match_start = data.size() - LZ_MIN_MATCH;

    while (index <= last_match_start) {
        const std::uint32_t key = read_u32_le(data, index);
        std::size_t best_length = 0;
        std::size_t best_distance = 0;
        auto it = history.find(key);
        if (it != history.end()) {
            for (auto candidate = it->second.rbegin(); candidate != it->second.rend(); ++candidate) {
                const std::size_t distance = index - *candidate;
                std::size_t length = LZ_HASH_BYTES;
                while (index + length < data.size() && data[*candidate + length] == data[index + length]) {
                    ++length;
                }
                if (length > best_length) {
                    best_length = length;
                    best_distance = distance;
                    if (length >= LZ_MATCH_SHORTCUT) {
                        break;
                    }
                }
            }
        }

        const std::size_t literal_length = index - anchor;
        if (best_length >= LZ_MIN_MATCH) {
            const std::size_t encoded_cost = varint_size(literal_length) +
                                             literal_length +
                                             varint_size(best_length) +
                                             varint_size(best_distance);
            const std::size_t raw_cost = literal_length + best_length;
            if (raw_cost > encoded_cost) {
                append_bytes(out, encode_varint(literal_length));
                out.insert(out.end(), data.begin() + static_cast<std::ptrdiff_t>(anchor), data.begin() + static_cast<std::ptrdiff_t>(index));
                append_bytes(out, encode_varint(best_length));
                append_bytes(out, encode_varint(best_distance));
                const std::size_t match_end = index + best_length;
                const std::size_t history_limit = std::min(match_end, data.size() - LZ_HASH_BYTES + 1);
                for (std::size_t cursor = index; cursor < history_limit; ++cursor) {
                    add_lz_history(history, read_u32_le(data, cursor), cursor);
                }
                index = match_end;
                anchor = index;
                continue;
            }
        }

        add_lz_history(history, key, index);
        ++index;
    }

    if (anchor < data.size() || out.empty()) {
        const std::size_t tail_length = data.size() - anchor;
        append_bytes(out, encode_varint(tail_length));
        out.insert(out.end(), data.begin() + static_cast<std::ptrdiff_t>(anchor), data.end());
    }
    return out;
}

ByteVec decode_lz_bytes(const ByteVec& payload, std::uint64_t original_size) {
    std::size_t offset = 0;
    ByteVec restored;
    restored.reserve(static_cast<std::size_t>(original_size));
    while (offset < payload.size()) {
        const std::size_t literal_length = static_cast<std::size_t>(decode_varint(payload, offset));
        if (offset + literal_length > payload.size()) {
            fail("archive lz literal block is truncated");
        }
        restored.insert(
            restored.end(),
            payload.begin() + static_cast<std::ptrdiff_t>(offset),
            payload.begin() + static_cast<std::ptrdiff_t>(offset + literal_length)
        );
        offset += literal_length;
        if (offset == payload.size()) {
            break;
        }

        const std::size_t match_length = static_cast<std::size_t>(decode_varint(payload, offset));
        if (match_length < LZ_MIN_MATCH) {
            fail("archive lz match length is invalid");
        }
        const std::size_t match_distance = static_cast<std::size_t>(decode_varint(payload, offset));
        if (match_distance == 0 || match_distance > restored.size()) {
            fail("archive lz match distance is invalid");
        }
        std::size_t source_index = restored.size() - match_distance;
        for (std::size_t i = 0; i < match_length; ++i) {
            restored.push_back(restored[source_index++]);
            if (restored.size() > original_size) {
                fail("archive lz body expands beyond original size");
            }
        }
    }

    if (restored.size() != original_size) {
        fail("decoded lz payload length does not match original size");
    }
    return restored;
}

GrammarBlock compress_grammar(const ByteVec& data, int max_iterations) {
    return analyze_grammar(data, max_iterations).block;
}

GrammarAnalysis analyze_grammar(const ByteVec& data, int max_iterations) {
    SymbolVec base_stream = bytes_to_bases(data);
    GrammarBlock best_block{{}, base_stream};
    std::size_t best_size = serialized_rules_and_payload_size(best_block.rules, best_block.stream.size());
    int best_iteration = 0;

    SymbolVec stream = base_stream;
    RuleVec rules;
    int stalled_iterations = 0;

    for (int i = 0; i < max_iterations; ++i) {
        const std::uint32_t next_symbol = static_cast<std::uint32_t>(4 + rules.size());
        auto match = find_best_pair(stream, next_symbol);
        if (!match.has_value()) {
            break;
        }
        auto [pair, candidate_stream, replacements] = std::move(*match);
        if (replacements < 3) {
            break;
        }
        rules.push_back(pair);
        GrammarBlock block{rules, std::move(candidate_stream)};
        stream = block.stream;
        const std::size_t block_size = serialized_rules_and_payload_size(block.rules, block.stream.size());
        if (block_size < best_size) {
            best_block = block;
            best_size = block_size;
            best_iteration = static_cast<int>(rules.size());
            stalled_iterations = 0;
        } else {
            ++stalled_iterations;
            if (stalled_iterations >= GRAMMAR_STALL_LIMIT) {
                break;
            }
        }
    }
    return {std::move(best_block), best_iteration};
}

ByteVec HelixArchive::to_bytes() const {
    ByteVec header_bytes = encode_header_metadata(
        body_mode,
        original_size,
        requested_iterations,
        header_primary_value(*this),
        header_secondary_value(*this)
    );
    GrammarBlock header_block = compress_grammar(header_bytes, std::min<int>(HEADER_MAX_ITERATIONS, std::max<std::uint64_t>(requested_iterations, 1)));
    ByteVec out(reinterpret_cast<const std::uint8_t*>(MAGIC), reinterpret_cast<const std::uint8_t*>(MAGIC) + 4);
    append_bytes(out, encode_varint(header_bytes.size()));
    append_bytes(out, encode_varint(header_block.rules.size()));
    append_bytes(out, encode_varint(header_block.stream.size()));
    append_bytes(out, serialize_rules_and_payload(header_block.rules, header_block.stream));
    if (body_mode == BODY_MODE_GRAMMAR) {
        append_bytes(out, serialize_rules_and_payload(rules, stream));
    } else if (body_mode == BODY_MODE_RAW) {
        append_bytes(out, raw_payload);
    } else if (body_mode == BODY_MODE_LZ) {
        append_bytes(out, lz_payload);
    } else if (body_mode == BODY_MODE_REPEAT) {
        append_bytes(out, repeat_unit);
        append_bytes(out, repeat_tail);
    } else {
        fail("unsupported body mode");
    }
    return out;
}

HelixArchive HelixArchive::from_bytes(const ByteVec& data) {
    if (data.size() < 4 || !std::equal(data.begin(), data.begin() + 4, MAGIC)) {
        fail("not a HelixZip archive");
    }
    std::size_t offset = 4;
    const std::size_t header_size = static_cast<std::size_t>(decode_varint(data, offset));
    const std::size_t header_rule_count = static_cast<std::size_t>(decode_varint(data, offset));
    const std::size_t header_stream_length = static_cast<std::size_t>(decode_varint(data, offset));
    GrammarBlock header_block = parse_rules_and_payload(data, offset, header_rule_count, header_stream_length);
    ByteVec header_bytes = decode_grammar_bytes(header_block.rules, header_block.stream, header_size);
    auto [body_mode, original_size, requested_iterations, primary_value, secondary_value] = decode_header_metadata(header_bytes);

    HelixArchive archive;
    archive.original_size = original_size;
    archive.requested_iterations = requested_iterations;
    archive.body_mode = body_mode;
    if (body_mode == BODY_MODE_GRAMMAR) {
        GrammarBlock body_block = parse_rules_and_payload(
            data,
            offset,
            static_cast<std::size_t>(primary_value),
            static_cast<std::size_t>(secondary_value)
        );
        archive.rules = std::move(body_block.rules);
        archive.stream = std::move(body_block.stream);
    } else if (body_mode == BODY_MODE_RAW) {
        if (offset + original_size > data.size()) {
            fail("archive raw payload length does not match header");
        }
        archive.raw_payload = ByteVec(data.begin() + static_cast<std::ptrdiff_t>(offset), data.begin() + static_cast<std::ptrdiff_t>(offset + original_size));
        offset += static_cast<std::size_t>(original_size);
    } else if (body_mode == BODY_MODE_LZ) {
        if (offset + primary_value > data.size()) {
            fail("archive lz payload length does not match header");
        }
        if (secondary_value != 0) {
            fail("archive lz metadata is malformed");
        }
        archive.lz_payload = ByteVec(
            data.begin() + static_cast<std::ptrdiff_t>(offset),
            data.begin() + static_cast<std::ptrdiff_t>(offset + primary_value)
        );
        offset += static_cast<std::size_t>(primary_value);
    } else if (body_mode == BODY_MODE_REPEAT) {
        if (offset + primary_value > data.size()) {
            fail("archive repeat unit length does not match header");
        }
        archive.repeat_unit = ByteVec(data.begin() + static_cast<std::ptrdiff_t>(offset), data.begin() + static_cast<std::ptrdiff_t>(offset + primary_value));
        offset += static_cast<std::size_t>(primary_value);
        archive.repeat_count = secondary_value;
        const long long repeat_tail_length = static_cast<long long>(original_size) -
                                             static_cast<long long>(archive.repeat_unit.size() * archive.repeat_count);
        if (repeat_tail_length < 0) {
            fail("repeat metadata exceeds original size");
        }
        if (offset + static_cast<std::size_t>(repeat_tail_length) > data.size()) {
            fail("archive repeat tail length does not match header");
        }
        archive.repeat_tail = ByteVec(
            data.begin() + static_cast<std::ptrdiff_t>(offset),
            data.begin() + static_cast<std::ptrdiff_t>(offset + static_cast<std::size_t>(repeat_tail_length))
        );
        offset += static_cast<std::size_t>(repeat_tail_length);
    } else {
        fail("unsupported body mode");
    }
    if (offset != data.size()) {
        fail("archive has trailing bytes");
    }
    return archive;
}

ByteVec HelixArchive::decode() const {
    if (body_mode == BODY_MODE_RAW) {
        if (raw_payload.size() != original_size) {
            fail("raw payload length does not match original size");
        }
        return raw_payload;
    }
    if (body_mode == BODY_MODE_LZ) {
        return decode_lz_bytes(lz_payload, original_size);
    }
    if (body_mode == BODY_MODE_REPEAT) {
        if ((repeat_unit.size() * repeat_count) + repeat_tail.size() != original_size) {
            fail("repeat metadata does not match original size");
        }
        ByteVec out;
        out.reserve(static_cast<std::size_t>(original_size));
        for (std::uint64_t i = 0; i < repeat_count; ++i) {
            append_bytes(out, repeat_unit);
        }
        append_bytes(out, repeat_tail);
        return out;
    }
    return decode_grammar_bytes(rules, stream, original_size);
}

HelixArchive compress_data(const ByteVec& data, std::optional<int> max_iterations = std::nullopt) {
    const bool auto_iterations = !max_iterations.has_value();
    const int iteration_limit = resolve_iteration_limit(max_iterations);
    const std::uint64_t archive_iterations = auto_iterations ? 0ULL : static_cast<std::uint64_t>(iteration_limit);
    HelixArchive raw_archive;
    raw_archive.original_size = data.size();
    raw_archive.requested_iterations = archive_iterations;
    raw_archive.body_mode = BODY_MODE_RAW;
    raw_archive.raw_payload = data;
    const std::size_t raw_size = archive_serialized_size(raw_archive);

    std::optional<HelixArchive> repeat_archive;
    std::optional<std::size_t> repeat_size;
    auto repeat_match = find_repeating_pattern(data);
    if (repeat_match.has_value()) {
        auto [unit, repeat_count, tail] = std::move(*repeat_match);
        HelixArchive archive;
        archive.original_size = data.size();
        archive.requested_iterations = archive_iterations;
        archive.body_mode = BODY_MODE_REPEAT;
        archive.repeat_unit = std::move(unit);
        archive.repeat_count = repeat_count;
        archive.repeat_tail = std::move(tail);
        const std::size_t size = archive_serialized_size(archive);
        repeat_archive = std::move(archive);
        repeat_size = size;
        if (size * 2 <= raw_size) {
            return *repeat_archive;
        }
    }

    std::optional<HelixArchive> lz_archive;
    std::optional<std::size_t> lz_size;
    if (data.size() >= LZ_MIN_MATCH) {
        HelixArchive archive;
        archive.original_size = data.size();
        archive.requested_iterations = archive_iterations;
        archive.body_mode = BODY_MODE_LZ;
        archive.lz_payload = encode_lz_bytes(data);
        const std::size_t size = archive_serialized_size(archive);
        lz_archive = std::move(archive);
        lz_size = size;
    }

    if (!should_try_grammar(data, iteration_limit)) {
        const HelixArchive* best_archive = &raw_archive;
        std::size_t best_size = raw_size;
        if (lz_archive.has_value() && lz_size.value() < best_size) {
            best_archive = &lz_archive.value();
            best_size = lz_size.value();
        }
        if (repeat_archive.has_value() && repeat_size.value() < best_size) {
            best_archive = &repeat_archive.value();
        }
        return *best_archive;
    }

    GrammarAnalysis analysis = analyze_grammar(data, iteration_limit);
    HelixArchive grammar_archive;
    grammar_archive.original_size = data.size();
    grammar_archive.requested_iterations = auto_iterations ? static_cast<std::uint64_t>(analysis.best_iteration)
                                                           : static_cast<std::uint64_t>(iteration_limit);
    grammar_archive.body_mode = BODY_MODE_GRAMMAR;
    grammar_archive.rules = std::move(analysis.block.rules);
    grammar_archive.stream = std::move(analysis.block.stream);
    const std::size_t grammar_size = archive_serialized_size(grammar_archive);

    const HelixArchive* best_archive = &raw_archive;
    std::size_t best_size = raw_size;
    if (lz_archive.has_value() && lz_size.value() < best_size) {
        best_archive = &lz_archive.value();
        best_size = lz_size.value();
    }
    if (repeat_archive.has_value() && repeat_size.value() < best_size) {
        best_archive = &repeat_archive.value();
        best_size = repeat_size.value();
    }
    if (grammar_size < best_size) {
        best_archive = &grammar_archive;
    }
    return *best_archive;
}

std::uint64_t normalize_workers(int workers) {
    if (workers <= 0) {
        const unsigned int hardware = std::thread::hardware_concurrency();
        return std::max<std::uint64_t>(1, hardware == 0 ? 1 : hardware);
    }
    return static_cast<std::uint64_t>(workers);
}

bool should_try_zlib_wrapper(const ByteVec& payload, int depth) {
    if (depth >= 3) {
        return false;
    }
    return payload.size() >= 256;
}

ByteVec encode_hx7_codec(int codec_id, const ByteVec& payload, const std::optional<int>& max_iterations) {
    if (codec_id == HX7_BLOCK_STANDALONE) {
        return compress_data(payload, max_iterations).to_bytes();
    }
    if (codec_id == HX7_BLOCK_ZLIB) {
        return zlib_compress_bytes(payload);
    }
    fail("unsupported HX7 codec in C++");
}

ByteVec decode_hx7_codec(int codec_id, const ByteVec& payload) {
    if (codec_id == HX7_BLOCK_STANDALONE) {
        return HelixArchive::from_bytes(payload).decode();
    }
    if (codec_id == HX7_BLOCK_ZLIB) {
        return zlib_decompress_bytes(payload);
    }
    if (codec_id == HX7_BLOCK_SHARED) {
        fail("HX7 shared blocks are not supported in C++ yet");
    }
    if (codec_id == HX7_BLOCK_LZMA) {
        fail("HX7 lzma blocks are not supported in this C++ build");
    }
    fail("unsupported HX7 block codec");
}

struct ChunkCompressionResult {
    ByteVec payload;
    int body_mode = BODY_MODE_RAW;
    std::size_t input_bytes = 0;
};

ChunkCompressionResult compress_chunk(const ByteVec& chunk, const std::optional<int>& max_iterations) {
    HelixArchive archive = compress_data(chunk, max_iterations);
    return {archive.to_bytes(), archive.body_mode, chunk.size()};
}

struct ChunkDecodeResult {
    ByteVec restored;
    int body_mode = BODY_MODE_RAW;
};

ChunkDecodeResult decode_frame(const ByteVec& frame) {
    HelixArchive archive = HelixArchive::from_bytes(frame);
    return {archive.decode(), archive.body_mode};
}

struct HX7ChunkCompressionResult {
    std::vector<int> codec_chain;
    ByteVec payload;
    std::size_t input_bytes = 0;
    std::uint32_t checksum = 0;
};

struct HX7ChunkDecodeResult {
    ByteVec restored;
    std::vector<int> codec_chain;
};

HX7ChunkCompressionResult compress_hx7_chunk(const ByteVec& chunk, const std::optional<int>& max_iterations, int max_levels) {
    HelixArchive standalone_archive = compress_data(chunk, max_iterations);
    ByteVec standalone_payload = standalone_archive.to_bytes();
    int best_codec = HX7_BLOCK_STANDALONE;
    ByteVec best_payload = standalone_payload;
    ByteVec zlib_payload = zlib_compress_bytes(chunk);
    if (zlib_payload.size() < best_payload.size()) {
        best_codec = HX7_BLOCK_ZLIB;
        best_payload = std::move(zlib_payload);
    }
    std::vector<int> codec_chain{best_codec};
    ByteVec wrapped_payload = best_payload;
    for (int depth = 1; depth < std::max(1, max_levels); ++depth) {
        if (!should_try_zlib_wrapper(wrapped_payload, depth)) {
            break;
        }
        ByteVec candidate = zlib_compress_bytes(wrapped_payload);
        if (candidate.size() < wrapped_payload.size()) {
            codec_chain.push_back(HX7_BLOCK_ZLIB);
            wrapped_payload = std::move(candidate);
        } else {
            break;
        }
    }
    return {codec_chain, wrapped_payload, chunk.size(), crc32_bytes(chunk)};
}

HX7ChunkDecodeResult decode_hx7_block(const std::vector<int>& codec_chain, std::uint64_t raw_size, std::uint32_t checksum, const ByteVec& payload) {
    ByteVec restored = payload;
    for (auto it = codec_chain.rbegin(); it != codec_chain.rend(); ++it) {
        restored = decode_hx7_codec(*it, restored);
    }
    if (restored.size() != raw_size) {
        fail("HX7 block restored size does not match header");
    }
    if (crc32_bytes(restored) != checksum) {
        fail("HX7 block checksum mismatch");
    }
    return {restored, codec_chain};
}

void count_hx7_codec(int codec_id, HX7Report& report) {
    if (codec_id == HX7_BLOCK_STANDALONE) {
        ++report.standalone_blocks;
    } else if (codec_id == HX7_BLOCK_SHARED) {
        ++report.shared_blocks;
    } else if (codec_id == HX7_BLOCK_ZLIB) {
        ++report.zlib_blocks;
    } else if (codec_id == HX7_BLOCK_LZMA) {
        ++report.lzma_blocks;
    }
}

void count_hx7_codec(int codec_id, HX7RestoreReport& report) {
    if (codec_id == HX7_BLOCK_STANDALONE) {
        ++report.standalone_blocks;
    } else if (codec_id == HX7_BLOCK_SHARED) {
        ++report.shared_blocks;
    } else if (codec_id == HX7_BLOCK_ZLIB) {
        ++report.zlib_blocks;
    } else if (codec_id == HX7_BLOCK_LZMA) {
        ++report.lzma_blocks;
    }
}

void count_hx7_codec(int codec_id, HX7InspectReport& report) {
    if (codec_id == HX7_BLOCK_STANDALONE) {
        ++report.standalone_blocks;
    } else if (codec_id == HX7_BLOCK_SHARED) {
        ++report.shared_blocks;
    } else if (codec_id == HX7_BLOCK_ZLIB) {
        ++report.zlib_blocks;
    } else if (codec_id == HX7_BLOCK_LZMA) {
        ++report.lzma_blocks;
    }
}

void count_body_mode(int body_mode, StreamReport& report) {
    if (body_mode == BODY_MODE_GRAMMAR) {
        ++report.grammar_chunks;
    } else if (body_mode == BODY_MODE_RAW) {
        ++report.raw_chunks;
    } else if (body_mode == BODY_MODE_LZ) {
        ++report.lz_chunks;
    } else if (body_mode == BODY_MODE_REPEAT) {
        ++report.repeat_chunks;
    }
}

void count_body_mode(int body_mode, StreamRestoreReport& report) {
    if (body_mode == BODY_MODE_GRAMMAR) {
        ++report.grammar_chunks;
    } else if (body_mode == BODY_MODE_RAW) {
        ++report.raw_chunks;
    } else if (body_mode == BODY_MODE_LZ) {
        ++report.lz_chunks;
    } else if (body_mode == BODY_MODE_REPEAT) {
        ++report.repeat_chunks;
    }
}

StreamReport write_stream_archive(
    const std::string& input_path,
    const std::string& output_path,
    std::size_t chunk_size,
    std::optional<int> max_iterations,
    int workers
) {
    StreamReport report;
    report.chunk_size = chunk_size;
    report.workers = normalize_workers(workers);

    std::ifstream in(input_path, std::ios::binary);
    if (!in) {
        fail("failed to open input file: " + input_path);
    }
    std::ofstream out(output_path, std::ios::binary);
    if (!out) {
        fail("failed to open output file: " + output_path);
    }
    out.write(STREAM_MAGIC, 4);
    const ByteVec chunk_size_varint = encode_varint(chunk_size);
    const ByteVec iteration_varint = encode_varint(max_iterations.has_value() ? static_cast<std::uint64_t>(*max_iterations) : 0ULL);
    out.write(reinterpret_cast<const char*>(chunk_size_varint.data()), static_cast<std::streamsize>(chunk_size_varint.size()));
    out.write(reinterpret_cast<const char*>(iteration_varint.data()), static_cast<std::streamsize>(iteration_varint.size()));

    auto flush_result = [&](const ChunkCompressionResult& result) {
        const ByteVec frame_size = encode_varint(result.payload.size());
        out.write(reinterpret_cast<const char*>(frame_size.data()), static_cast<std::streamsize>(frame_size.size()));
        out.write(reinterpret_cast<const char*>(result.payload.data()), static_cast<std::streamsize>(result.payload.size()));
        report.original_bytes += result.input_bytes;
        ++report.chunks;
        count_body_mode(result.body_mode, report);
    };

    if (report.workers <= 1) {
        while (true) {
            ByteVec chunk(chunk_size);
            in.read(reinterpret_cast<char*>(chunk.data()), static_cast<std::streamsize>(chunk.size()));
            const auto read_count = static_cast<std::size_t>(in.gcount());
            if (read_count == 0) {
                break;
            }
            chunk.resize(read_count);
            flush_result(compress_chunk(chunk, max_iterations));
        }
    } else {
        std::deque<std::future<ChunkCompressionResult>> pending;
        while (true) {
            ByteVec chunk(chunk_size);
            in.read(reinterpret_cast<char*>(chunk.data()), static_cast<std::streamsize>(chunk.size()));
            const auto read_count = static_cast<std::size_t>(in.gcount());
            if (read_count == 0) {
                break;
            }
            chunk.resize(read_count);
            pending.push_back(std::async(std::launch::async, [chunk = std::move(chunk), max_iterations]() {
                return compress_chunk(chunk, max_iterations);
            }));
            if (pending.size() >= report.workers) {
                flush_result(pending.front().get());
                pending.pop_front();
            }
        }
        while (!pending.empty()) {
            flush_result(pending.front().get());
            pending.pop_front();
        }
    }

    out.flush();
    out.close();
    report.compressed_bytes = static_cast<std::uint64_t>(std::filesystem::file_size(output_path));
    report.ratio = report.original_bytes == 0 ? 0.0 : static_cast<double>(report.compressed_bytes) / static_cast<double>(report.original_bytes);
    return report;
}

std::pair<std::uint64_t, std::uint64_t> read_stream_prelude(std::istream& in) {
    char magic[4];
    in.read(magic, 4);
    if (!in || std::string(magic, 4) != STREAM_MAGIC) {
        fail("not a HelixZip stream archive");
    }
    std::uint64_t chunk_size = decode_varint_stream(in);
    std::uint64_t requested_iterations = decode_varint_stream(in);
    return {chunk_size, requested_iterations};
}

StreamRestoreReport read_stream_archive(const std::string& input_path, const std::string& output_path, int workers) {
    StreamRestoreReport report;
    report.workers = normalize_workers(workers);
    std::ifstream in(input_path, std::ios::binary);
    if (!in) {
        fail("failed to open input file: " + input_path);
    }
    std::ofstream out(output_path, std::ios::binary);
    if (!out) {
        fail("failed to open output file: " + output_path);
    }
    auto [chunk_size, requested_iterations] = read_stream_prelude(in);
    report.chunk_size = chunk_size;
    report.requested_iterations = requested_iterations;

    auto flush_result = [&](const ChunkDecodeResult& result) {
        out.write(reinterpret_cast<const char*>(result.restored.data()), static_cast<std::streamsize>(result.restored.size()));
        report.restored_bytes += result.restored.size();
        ++report.chunks;
        count_body_mode(result.body_mode, report);
    };

    auto read_frame = [&]() -> std::optional<ByteVec> {
        std::uint64_t frame_length = decode_varint_stream(in, true);
        if (frame_length == std::numeric_limits<std::uint64_t>::max()) {
            return std::nullopt;
        }
        ByteVec frame(static_cast<std::size_t>(frame_length));
        in.read(reinterpret_cast<char*>(frame.data()), static_cast<std::streamsize>(frame.size()));
        if (static_cast<std::size_t>(in.gcount()) != frame.size()) {
            fail("stream frame is truncated");
        }
        return frame;
    };

    if (report.workers <= 1) {
        while (true) {
            auto frame = read_frame();
            if (!frame.has_value()) {
                break;
            }
            flush_result(decode_frame(*frame));
        }
    } else {
        std::deque<std::future<ChunkDecodeResult>> pending;
        while (true) {
            auto frame = read_frame();
            if (!frame.has_value()) {
                break;
            }
            pending.push_back(std::async(std::launch::async, [frame = std::move(*frame)]() {
                return decode_frame(frame);
            }));
            if (pending.size() >= report.workers) {
                flush_result(pending.front().get());
                pending.pop_front();
            }
        }
        while (!pending.empty()) {
            flush_result(pending.front().get());
            pending.pop_front();
        }
    }
    return report;
}

std::tuple<std::uint64_t, std::uint64_t, std::uint64_t, bool> read_hx7_prelude(std::istream& in) {
    char magic[4];
    in.read(magic, 4);
    if (!in || std::string(magic, 4) != HX7_FRAME_MAGIC) {
        fail("not an HX7 framed archive");
    }
    std::uint64_t version = decode_varint_stream(in);
    if (version != HX7_VERSION) {
        fail("unsupported HX7 archive version");
    }
    std::uint64_t chunk_size = decode_varint_stream(in);
    std::uint64_t requested_iterations = decode_varint_stream(in);
    std::uint64_t max_levels = decode_varint_stream(in);
    std::uint64_t dictionary_flag = decode_varint_stream(in);
    if (dictionary_flag > 1) {
        fail("HX7 dictionary flag is invalid");
    }
    if (dictionary_flag == 1) {
        ByteVec table_id(8);
        in.read(reinterpret_cast<char*>(table_id.data()), static_cast<std::streamsize>(table_id.size()));
        if (static_cast<std::size_t>(in.gcount()) != table_id.size()) {
            fail("HX7 archive is truncated before dictionary id");
        }
    }
    return {chunk_size, requested_iterations, max_levels, dictionary_flag == 1};
}

HX7Report write_hx7_archive(
    const std::string& input_path,
    const std::string& output_path,
    std::size_t chunk_size,
    std::optional<int> max_iterations,
    int workers,
    int max_levels
) {
    if (max_levels <= 0) {
        fail("HX7 max_levels must be positive");
    }
    HX7Report report;
    report.chunk_size = chunk_size;
    report.max_levels = static_cast<std::uint64_t>(max_levels);
    report.workers = normalize_workers(workers);

    std::ifstream in(input_path, std::ios::binary);
    if (!in) {
        fail("failed to open input file: " + input_path);
    }
    std::ofstream out(output_path, std::ios::binary);
    if (!out) {
        fail("failed to open output file: " + output_path);
    }
    out.write(HX7_FRAME_MAGIC, 4);
    for (const ByteVec& prefix : {
            encode_varint(HX7_VERSION),
            encode_varint(chunk_size),
            encode_varint(max_iterations.has_value() ? static_cast<std::uint64_t>(*max_iterations) : 0ULL),
            encode_varint(static_cast<std::uint64_t>(max_levels)),
            encode_varint(0ULL)}) {
        out.write(reinterpret_cast<const char*>(prefix.data()), static_cast<std::streamsize>(prefix.size()));
    }

    auto flush_result = [&](const HX7ChunkCompressionResult& result) {
        ByteVec level_count = encode_varint(result.codec_chain.size());
        out.write(reinterpret_cast<const char*>(level_count.data()), static_cast<std::streamsize>(level_count.size()));
        for (int codec_id : result.codec_chain) {
            ByteVec codec_varint = encode_varint(static_cast<std::uint64_t>(codec_id));
            out.write(reinterpret_cast<const char*>(codec_varint.data()), static_cast<std::streamsize>(codec_varint.size()));
        }
        ByteVec raw_size = encode_varint(result.input_bytes);
        ByteVec payload_size = encode_varint(result.payload.size());
        ByteVec checksum = encode_u32_le(result.checksum);
        out.write(reinterpret_cast<const char*>(raw_size.data()), static_cast<std::streamsize>(raw_size.size()));
        out.write(reinterpret_cast<const char*>(payload_size.data()), static_cast<std::streamsize>(payload_size.size()));
        out.write(reinterpret_cast<const char*>(checksum.data()), static_cast<std::streamsize>(checksum.size()));
        out.write(reinterpret_cast<const char*>(result.payload.data()), static_cast<std::streamsize>(result.payload.size()));
        report.original_bytes += result.input_bytes;
        ++report.blocks;
        for (int codec_id : result.codec_chain) {
            count_hx7_codec(codec_id, report);
        }
    };

    if (report.workers <= 1) {
        while (true) {
            ByteVec chunk(chunk_size);
            in.read(reinterpret_cast<char*>(chunk.data()), static_cast<std::streamsize>(chunk.size()));
            const auto read_count = static_cast<std::size_t>(in.gcount());
            if (read_count == 0) {
                break;
            }
            chunk.resize(read_count);
            flush_result(compress_hx7_chunk(chunk, max_iterations, max_levels));
        }
    } else {
        std::deque<std::future<HX7ChunkCompressionResult>> pending;
        while (true) {
            ByteVec chunk(chunk_size);
            in.read(reinterpret_cast<char*>(chunk.data()), static_cast<std::streamsize>(chunk.size()));
            const auto read_count = static_cast<std::size_t>(in.gcount());
            if (read_count == 0) {
                break;
            }
            chunk.resize(read_count);
            pending.push_back(std::async(std::launch::async, [chunk = std::move(chunk), max_iterations, max_levels]() {
                return compress_hx7_chunk(chunk, max_iterations, max_levels);
            }));
            if (pending.size() >= report.workers) {
                flush_result(pending.front().get());
                pending.pop_front();
            }
        }
        while (!pending.empty()) {
            flush_result(pending.front().get());
            pending.pop_front();
        }
    }

    out.flush();
    out.close();
    report.compressed_bytes = static_cast<std::uint64_t>(std::filesystem::file_size(output_path));
    report.ratio = report.original_bytes == 0 ? 0.0 : static_cast<double>(report.compressed_bytes) / static_cast<double>(report.original_bytes);
    return report;
}

HX7RestoreReport read_hx7_archive(const std::string& input_path, const std::string& output_path, int workers) {
    HX7RestoreReport report;
    report.workers = normalize_workers(workers);

    std::ifstream in(input_path, std::ios::binary);
    if (!in) {
        fail("failed to open input file: " + input_path);
    }
    std::ofstream out(output_path, std::ios::binary);
    if (!out) {
        fail("failed to open output file: " + output_path);
    }
    auto [chunk_size, requested_iterations, max_levels, has_dictionary] = read_hx7_prelude(in);
    if (has_dictionary) {
        fail("HX7 shared blocks are not supported in C++ yet");
    }
    report.chunk_size = chunk_size;
    report.requested_iterations = requested_iterations;
    report.max_levels = max_levels;

    auto read_block = [&]() -> std::optional<std::tuple<std::vector<int>, std::uint64_t, std::uint32_t, ByteVec>> {
        std::uint64_t level_count = decode_varint_stream(in, true);
        if (level_count == std::numeric_limits<std::uint64_t>::max()) {
            return std::nullopt;
        }
        if (level_count == 0) {
            fail("HX7 block level count must be positive");
        }
        std::vector<int> codec_chain;
        codec_chain.reserve(static_cast<std::size_t>(level_count));
        for (std::uint64_t i = 0; i < level_count; ++i) {
            codec_chain.push_back(static_cast<int>(decode_varint_stream(in)));
        }
        std::uint64_t raw_size = decode_varint_stream(in);
        std::uint64_t payload_size = decode_varint_stream(in);
        ByteVec checksum_bytes(4);
        in.read(reinterpret_cast<char*>(checksum_bytes.data()), static_cast<std::streamsize>(checksum_bytes.size()));
        if (static_cast<std::size_t>(in.gcount()) != checksum_bytes.size()) {
            fail("HX7 block is truncated before checksum");
        }
        ByteVec payload(static_cast<std::size_t>(payload_size));
        in.read(reinterpret_cast<char*>(payload.data()), static_cast<std::streamsize>(payload.size()));
        if (static_cast<std::size_t>(in.gcount()) != payload.size()) {
            fail("HX7 block payload is truncated");
        }
        return std::make_tuple(codec_chain, raw_size, read_u32_le(checksum_bytes, 0), payload);
    };

    auto flush_result = [&](const HX7ChunkDecodeResult& result) {
        out.write(reinterpret_cast<const char*>(result.restored.data()), static_cast<std::streamsize>(result.restored.size()));
        report.restored_bytes += result.restored.size();
        ++report.blocks;
        for (int codec_id : result.codec_chain) {
            count_hx7_codec(codec_id, report);
        }
    };

    if (report.workers <= 1) {
        while (true) {
            auto block = read_block();
            if (!block.has_value()) {
                break;
            }
            auto& [codec_chain, raw_size, checksum, payload] = *block;
            flush_result(decode_hx7_block(codec_chain, raw_size, checksum, payload));
        }
    } else {
        std::deque<std::future<HX7ChunkDecodeResult>> pending;
        while (true) {
            auto block = read_block();
            if (!block.has_value()) {
                break;
            }
            auto block_data = std::move(*block);
            pending.push_back(std::async(std::launch::async, [block_data = std::move(block_data)]() mutable {
                return decode_hx7_block(
                    std::get<0>(block_data),
                    std::get<1>(block_data),
                    std::get<2>(block_data),
                    std::get<3>(block_data)
                );
            }));
            if (pending.size() >= report.workers) {
                flush_result(pending.front().get());
                pending.pop_front();
            }
        }
        while (!pending.empty()) {
            flush_result(pending.front().get());
            pending.pop_front();
        }
    }
    return report;
}

HX7Report write_hx7_archive_from_bytes(
    const ByteVec& payload,
    const std::string& output_path,
    std::size_t chunk_size,
    std::optional<int> max_iterations,
    int workers,
    int max_levels
) {
    const std::string temp_input = make_temp_path(".bundle.in");
    write_file(temp_input, payload);
    try {
        HX7Report report = write_hx7_archive(temp_input, output_path, chunk_size, max_iterations, workers, max_levels);
        std::filesystem::remove(temp_input);
        return report;
    } catch (...) {
        std::filesystem::remove(temp_input);
        throw;
    }
}

std::pair<ByteVec, HX7RestoreReport> read_hx7_archive_to_bytes(const std::string& input_path, int workers) {
    const std::string temp_output = make_temp_path(".bundle.out");
    try {
        HX7RestoreReport report = read_hx7_archive(input_path, temp_output, workers);
        ByteVec payload = read_file(temp_output);
        std::filesystem::remove(temp_output);
        return {payload, report};
    } catch (...) {
        std::filesystem::remove(temp_output);
        throw;
    }
}

int parse_int_option(const std::vector<std::string>& args, const std::string& name, int default_value) {
    for (std::size_t i = 0; i + 1 < args.size(); ++i) {
        if (args[i] == name) {
            return std::stoi(args[i + 1]);
        }
    }
    return default_value;
}

std::optional<int> parse_optional_int_option(const std::vector<std::string>& args, const std::string& name) {
    for (std::size_t i = 0; i + 1 < args.size(); ++i) {
        if (args[i] == name) {
            return std::stoi(args[i + 1]);
        }
    }
    return std::nullopt;
}

std::vector<std::string> parse_multi_string_option(const std::vector<std::string>& args, const std::string& name) {
    std::vector<std::string> values;
    for (std::size_t i = 0; i + 1 < args.size(); ++i) {
        if (args[i] == name) {
            values.push_back(args[i + 1]);
        }
    }
    return values;
}

std::vector<std::string> collect_positionals(const std::vector<std::string>& args, const std::unordered_set<std::string>& valued_options) {
    std::vector<std::string> values;
    for (std::size_t i = 0; i < args.size(); ++i) {
        if (valued_options.find(args[i]) != valued_options.end()) {
            ++i;
            continue;
        }
        values.push_back(args[i]);
    }
    return values;
}

std::string body_mode_name(int body_mode) {
    if (body_mode == BODY_MODE_GRAMMAR) {
        return "grammar";
    }
    if (body_mode == BODY_MODE_RAW) {
        return "raw";
    }
    if (body_mode == BODY_MODE_LZ) {
        return "lz";
    }
    if (body_mode == BODY_MODE_REPEAT) {
        return "repeat";
    }
    return "unknown";
}

std::string hx7_codec_name(int codec_id) {
    if (codec_id == HX7_BLOCK_STANDALONE) {
        return "standalone";
    }
    if (codec_id == HX7_BLOCK_SHARED) {
        return "shared";
    }
    if (codec_id == HX7_BLOCK_ZLIB) {
        return "zlib";
    }
    if (codec_id == HX7_BLOCK_LZMA) {
        return "lzma";
    }
    return "unknown";
}

std::string json_escape(const std::string& value) {
    std::ostringstream out;
    for (char ch : value) {
        if (ch == '"' || ch == '\\') {
            out << '\\' << ch;
        } else if (ch == '\n') {
            out << "\\n";
        } else {
            out << ch;
        }
    }
    return out.str();
}

void print_archive_report(const HelixArchive& archive, std::size_t compressed_bytes) {
    std::ostringstream out;
    out << "{\n"
        << "  \"original_bytes\": " << archive.original_size << ",\n"
        << "  \"compressed_bytes\": " << compressed_bytes << ",\n"
        << "  \"body_mode\": \"" << body_mode_name(archive.body_mode) << "\",\n"
        << "  \"rules\": " << archive.rules.size() << ",\n"
        << "  \"stream_symbols\": " << archive.stream.size() << ",\n"
        << "  \"requested_iterations\": " << archive.requested_iterations << "\n"
        << "}\n";
    std::cout << out.str();
}

void print_stream_report(const StreamReport& report) {
    std::ostringstream out;
    out << "{\n"
        << "  \"original_bytes\": " << report.original_bytes << ",\n"
        << "  \"compressed_bytes\": " << report.compressed_bytes << ",\n"
        << "  \"ratio\": " << std::fixed << std::setprecision(12) << report.ratio << ",\n"
        << "  \"chunk_size\": " << report.chunk_size << ",\n"
        << "  \"chunks\": " << report.chunks << ",\n"
        << "  \"workers\": " << report.workers << ",\n"
        << "  \"grammar_chunks\": " << report.grammar_chunks << ",\n"
        << "  \"raw_chunks\": " << report.raw_chunks << ",\n"
        << "  \"lz_chunks\": " << report.lz_chunks << ",\n"
        << "  \"repeat_chunks\": " << report.repeat_chunks << "\n"
        << "}\n";
    std::cout << out.str();
}

void print_stream_restore_report(const StreamRestoreReport& report) {
    std::ostringstream out;
    out << "{\n"
        << "  \"restored_bytes\": " << report.restored_bytes << ",\n"
        << "  \"chunk_size\": " << report.chunk_size << ",\n"
        << "  \"requested_iterations\": " << report.requested_iterations << ",\n"
        << "  \"chunks\": " << report.chunks << ",\n"
        << "  \"workers\": " << report.workers << ",\n"
        << "  \"grammar_chunks\": " << report.grammar_chunks << ",\n"
        << "  \"raw_chunks\": " << report.raw_chunks << ",\n"
        << "  \"lz_chunks\": " << report.lz_chunks << ",\n"
        << "  \"repeat_chunks\": " << report.repeat_chunks << "\n"
        << "}\n";
    std::cout << out.str();
}

void print_hx7_report(const HX7Report& report) {
    std::ostringstream out;
    out << "{\n"
        << "  \"original_bytes\": " << report.original_bytes << ",\n"
        << "  \"compressed_bytes\": " << report.compressed_bytes << ",\n"
        << "  \"ratio\": " << std::fixed << std::setprecision(12) << report.ratio << ",\n"
        << "  \"chunk_size\": " << report.chunk_size << ",\n"
        << "  \"max_levels\": " << report.max_levels << ",\n"
        << "  \"blocks\": " << report.blocks << ",\n"
        << "  \"workers\": " << report.workers << ",\n"
        << "  \"standalone_blocks\": " << report.standalone_blocks << ",\n"
        << "  \"shared_blocks\": " << report.shared_blocks << ",\n"
        << "  \"zlib_blocks\": " << report.zlib_blocks << ",\n"
        << "  \"lzma_blocks\": " << report.lzma_blocks << "\n"
        << "}\n";
    std::cout << out.str();
}

void print_hx7_restore_report(const HX7RestoreReport& report) {
    std::ostringstream out;
    out << "{\n"
        << "  \"restored_bytes\": " << report.restored_bytes << ",\n"
        << "  \"chunk_size\": " << report.chunk_size << ",\n"
        << "  \"requested_iterations\": " << report.requested_iterations << ",\n"
        << "  \"max_levels\": " << report.max_levels << ",\n"
        << "  \"blocks\": " << report.blocks << ",\n"
        << "  \"workers\": " << report.workers << ",\n"
        << "  \"standalone_blocks\": " << report.standalone_blocks << ",\n"
        << "  \"shared_blocks\": " << report.shared_blocks << ",\n"
        << "  \"zlib_blocks\": " << report.zlib_blocks << ",\n"
        << "  \"lzma_blocks\": " << report.lzma_blocks << "\n"
        << "}\n";
    std::cout << out.str();
}

HX7InspectReport inspect_hx7_archive(const std::string& input_path) {
    HX7InspectReport report;
    report.compressed_bytes = static_cast<std::uint64_t>(std::filesystem::file_size(input_path));

    std::ifstream in(input_path, std::ios::binary);
    if (!in) {
        fail("failed to open input file: " + input_path);
    }

    auto [chunk_size, requested_iterations, max_levels, has_dictionary] = read_hx7_prelude(in);
    if (has_dictionary) {
        fail("HX7 shared blocks are not supported in C++ yet");
    }
    report.chunk_size = chunk_size;
    report.requested_iterations = requested_iterations;
    report.max_levels = max_levels;

    std::uint64_t block_index = 0;
    while (true) {
        std::uint64_t level_count = decode_varint_stream(in, true);
        if (level_count == std::numeric_limits<std::uint64_t>::max()) {
            break;
        }
        if (level_count == 0) {
            fail("HX7 block level count must be positive");
        }
        HX7InspectBlock block;
        block.index = block_index++;
        block.codec_chain.reserve(static_cast<std::size_t>(level_count));
        for (std::uint64_t i = 0; i < level_count; ++i) {
            int codec_id = static_cast<int>(decode_varint_stream(in));
            block.codec_chain.push_back(codec_id);
            count_hx7_codec(codec_id, report);
        }
        block.raw_size = decode_varint_stream(in);
        std::uint64_t payload_size = decode_varint_stream(in);
        ByteVec checksum_bytes(4);
        in.read(reinterpret_cast<char*>(checksum_bytes.data()), static_cast<std::streamsize>(checksum_bytes.size()));
        if (static_cast<std::size_t>(in.gcount()) != checksum_bytes.size()) {
            fail("HX7 block is truncated before checksum");
        }
        block.checksum = read_u32_le(checksum_bytes, 0);
        ByteVec payload(static_cast<std::size_t>(payload_size));
        in.read(reinterpret_cast<char*>(payload.data()), static_cast<std::streamsize>(payload.size()));
        if (static_cast<std::size_t>(in.gcount()) != payload.size()) {
            fail("HX7 block payload is truncated");
        }
        block.compressed_size = payload.size();
        if (block.codec_chain.empty()) {
            fail("HX7 block codec chain is empty");
        }
        block.terminal_codec = hx7_codec_name(block.codec_chain.front());
        if (block.codec_chain.front() == HX7_BLOCK_STANDALONE) {
            ByteVec standalone_payload = payload;
            for (auto it = block.codec_chain.rbegin(); it != block.codec_chain.rend(); ++it) {
                if (*it == HX7_BLOCK_STANDALONE) {
                    break;
                }
                standalone_payload = decode_hx7_codec(*it, standalone_payload);
            }
            HelixArchive nested = HelixArchive::from_bytes(standalone_payload);
            block.body_mode = body_mode_name(nested.body_mode);
            block.rules = nested.rules.size();
            block.stream_symbols = nested.stream.size();
        }
        report.block_reports.push_back(std::move(block));
    }
    report.blocks = report.block_reports.size();
    return report;
}

void print_hx7_inspect_report(const HX7InspectReport& report) {
    std::ostringstream out;
    out << "{\n"
        << "  \"chunk_size\": " << report.chunk_size << ",\n"
        << "  \"requested_iterations\": " << report.requested_iterations << ",\n"
        << "  \"max_levels\": " << report.max_levels << ",\n"
        << "  \"compressed_bytes\": " << report.compressed_bytes << ",\n"
        << "  \"blocks\": " << report.blocks << ",\n"
        << "  \"standalone_blocks\": " << report.standalone_blocks << ",\n"
        << "  \"shared_blocks\": " << report.shared_blocks << ",\n"
        << "  \"zlib_blocks\": " << report.zlib_blocks << ",\n"
        << "  \"lzma_blocks\": " << report.lzma_blocks << ",\n"
        << "  \"block_reports\": [\n";
    for (std::size_t i = 0; i < report.block_reports.size(); ++i) {
        const HX7InspectBlock& block = report.block_reports[i];
        out << "    {\n"
            << "      \"index\": " << block.index << ",\n"
            << "      \"codec_chain\": [";
        for (std::size_t codec_index = 0; codec_index < block.codec_chain.size(); ++codec_index) {
            if (codec_index != 0) {
                out << ", ";
            }
            out << block.codec_chain[codec_index];
        }
        out << "],\n"
            << "      \"codec_names\": [";
        for (std::size_t codec_index = 0; codec_index < block.codec_chain.size(); ++codec_index) {
            if (codec_index != 0) {
                out << ", ";
            }
            out << "\"" << json_escape(hx7_codec_name(block.codec_chain[codec_index])) << "\"";
        }
        out << "],\n"
            << "      \"raw_size\": " << block.raw_size << ",\n"
            << "      \"compressed_size\": " << block.compressed_size << ",\n"
            << "      \"checksum\": \"" << std::hex << std::setw(8) << std::setfill('0') << block.checksum << std::dec << std::setfill(' ') << "\",\n"
            << "      \"terminal_codec\": \"" << json_escape(block.terminal_codec) << "\"";
        if (!block.body_mode.empty()) {
            out << ",\n"
                << "      \"body_mode\": \"" << json_escape(block.body_mode) << "\",\n"
                << "      \"rules\": " << block.rules << ",\n"
                << "      \"stream_symbols\": " << block.stream_symbols << "\n";
        } else {
            out << "\n";
        }
        out << "    }";
        if (i + 1 != report.block_reports.size()) {
            out << ",";
        }
        out << "\n";
    }
    out << "  ]\n"
        << "}\n";
    std::cout << out.str();
}

void usage() {
    std::cerr
        << "Usage:\n"
        << "  helixzip_cpp compress <input> <output> [--iterations N]  # auto-tuned when omitted\n"
        << "  helixzip_cpp decompress <input> <output>\n"
        << "  helixzip_cpp inspect <input>\n"
        << "  helixzip_cpp compress-stream <input> <output> [--iterations N] [--chunk-size N] [--workers N]  # auto-tuned when omitted\n"
        << "  helixzip_cpp decompress-stream <input> <output> [--workers N]\n"
        << "  helixzip_cpp compress-hx7 <input> <output> [--iterations N] [--chunk-size N] [--workers N] [--levels N]\n"
        << "  helixzip_cpp decompress-hx7 <input> <output> [--workers N]\n"
        << "  helixzip_cpp inspect-hx7 <input>\n"
        << "  helixzip_cpp compress-bundle-hx7 <output> <input1> [<input2> ...] [--include GLOB] [--exclude GLOB] [--iterations N] [--chunk-size N] [--workers N] [--levels N]\n"
        << "  helixzip_cpp decompress-bundle-hx7 <input> <output-dir> [--workers N]\n";
}

}  // namespace

int main(int argc, char** argv) {
    try {
        if (argc < 2) {
            usage();
            return 1;
        }

        const std::string command = argv[1];
        std::vector<std::string> args(argv + 2, argv + argc);

        if (command == "compress") {
            if (args.size() < 2) {
                usage();
                return 1;
            }
            const std::string input = args[0];
            const std::string output = args[1];
            const std::optional<int> iterations = parse_optional_int_option(args, "--iterations");
            ByteVec data = read_file(input);
            HelixArchive archive = compress_data(data, iterations);
            ByteVec payload = archive.to_bytes();
            write_file(output, payload);
            print_archive_report(archive, payload.size());
            return 0;
        }

        if (command == "decompress") {
            if (args.size() < 2) {
                usage();
                return 1;
            }
            const std::string input = args[0];
            const std::string output = args[1];
            HelixArchive archive = HelixArchive::from_bytes(read_file(input));
            ByteVec restored = archive.decode();
            write_file(output, restored);
            std::cout << "{\n  \"restored_bytes\": " << restored.size() << "\n}\n";
            return 0;
        }

        if (command == "inspect") {
            if (args.empty()) {
                usage();
                return 1;
            }
            HelixArchive archive = HelixArchive::from_bytes(read_file(args[0]));
            print_archive_report(archive, read_file(args[0]).size());
            return 0;
        }

        if (command == "compress-stream") {
            if (args.size() < 2) {
                usage();
                return 1;
            }
            const std::string input = args[0];
            const std::string output = args[1];
            const std::optional<int> iterations = parse_optional_int_option(args, "--iterations");
            const int chunk_size = parse_int_option(args, "--chunk-size", static_cast<int>(DEFAULT_STREAM_CHUNK_SIZE));
            const int workers = parse_int_option(args, "--workers", 1);
            StreamReport report = write_stream_archive(input, output, static_cast<std::size_t>(chunk_size), iterations, workers);
            print_stream_report(report);
            return 0;
        }

        if (command == "decompress-stream") {
            if (args.size() < 2) {
                usage();
                return 1;
            }
            const std::string input = args[0];
            const std::string output = args[1];
            const int workers = parse_int_option(args, "--workers", 1);
            StreamRestoreReport report = read_stream_archive(input, output, workers);
            print_stream_restore_report(report);
            return 0;
        }

        if (command == "compress-hx7") {
            if (args.size() < 2) {
                usage();
                return 1;
            }
            const std::string input = args[0];
            const std::string output = args[1];
            const std::optional<int> iterations = parse_optional_int_option(args, "--iterations");
            const int chunk_size = parse_int_option(args, "--chunk-size", static_cast<int>(DEFAULT_STREAM_CHUNK_SIZE));
            const int workers = parse_int_option(args, "--workers", 1);
            const int max_levels = parse_int_option(args, "--levels", 2);
            HX7Report report = write_hx7_archive(input, output, static_cast<std::size_t>(chunk_size), iterations, workers, max_levels);
            print_hx7_report(report);
            return 0;
        }

        if (command == "decompress-hx7") {
            if (args.size() < 2) {
                usage();
                return 1;
            }
            const std::string input = args[0];
            const std::string output = args[1];
            const int workers = parse_int_option(args, "--workers", 1);
            HX7RestoreReport report = read_hx7_archive(input, output, workers);
            print_hx7_restore_report(report);
            return 0;
        }

        if (command == "inspect-hx7") {
            if (args.empty()) {
                usage();
                return 1;
            }
            print_hx7_inspect_report(inspect_hx7_archive(args[0]));
            return 0;
        }

        if (command == "compress-bundle-hx7") {
            const std::unordered_set<std::string> valued_options{
                "--include",
                "--exclude",
                "--iterations",
                "--chunk-size",
                "--workers",
                "--levels",
            };
            const std::vector<std::string> positionals = collect_positionals(args, valued_options);
            if (positionals.size() < 2) {
                usage();
                return 1;
            }
            const std::string output = positionals[0];
            const std::vector<std::string> inputs(positionals.begin() + 1, positionals.end());
            const std::vector<std::string> includes = parse_multi_string_option(args, "--include");
            const std::vector<std::string> excludes = parse_multi_string_option(args, "--exclude");
            const std::optional<int> iterations = parse_optional_int_option(args, "--iterations");
            const int chunk_size = parse_int_option(args, "--chunk-size", static_cast<int>(DEFAULT_STREAM_CHUNK_SIZE));
            const int workers = parse_int_option(args, "--workers", 1);
            const int max_levels = parse_int_option(args, "--levels", 2);

            const std::vector<BundleEntry> entries = collect_bundle_entries(inputs, includes, excludes);
            const ByteVec bundle_payload = encode_bundle(entries);
            HX7Report report = write_hx7_archive_from_bytes(bundle_payload, output, static_cast<std::size_t>(chunk_size), iterations, workers, max_levels);
            const auto [directories, files, input_bytes, bundle_bytes] = bundle_stats(entries, bundle_payload.size());

            std::ostringstream out;
            out << "{\n"
                << "  \"original_bytes\": " << report.original_bytes << ",\n"
                << "  \"compressed_bytes\": " << report.compressed_bytes << ",\n"
                << "  \"ratio\": " << std::fixed << std::setprecision(12) << report.ratio << ",\n"
                << "  \"chunk_size\": " << report.chunk_size << ",\n"
                << "  \"max_levels\": " << report.max_levels << ",\n"
                << "  \"blocks\": " << report.blocks << ",\n"
                << "  \"workers\": " << report.workers << ",\n"
                << "  \"standalone_blocks\": " << report.standalone_blocks << ",\n"
                << "  \"shared_blocks\": " << report.shared_blocks << ",\n"
                << "  \"zlib_blocks\": " << report.zlib_blocks << ",\n"
                << "  \"lzma_blocks\": " << report.lzma_blocks << ",\n"
                << "  \"directories\": " << directories << ",\n"
                << "  \"files\": " << files << ",\n"
                << "  \"input_bytes\": " << input_bytes << ",\n"
                << "  \"bundle_bytes\": " << bundle_bytes << "\n"
                << "}\n";
            std::cout << out.str();
            return 0;
        }

        if (command == "decompress-bundle-hx7") {
            const std::unordered_set<std::string> valued_options{"--workers"};
            const std::vector<std::string> positionals = collect_positionals(args, valued_options);
            if (positionals.size() < 2) {
                usage();
                return 1;
            }
            const std::string input = positionals[0];
            const std::string output = positionals[1];
            const int workers = parse_int_option(args, "--workers", 1);

            auto [bundle_payload, report] = read_hx7_archive_to_bytes(input, workers);
            const std::vector<BundleEntry> entries = decode_bundle(bundle_payload);
            const auto [directories, files, input_bytes] = extract_bundle(entries, output);

            std::ostringstream out;
            out << "{\n"
                << "  \"restored_bytes\": " << report.restored_bytes << ",\n"
                << "  \"chunk_size\": " << report.chunk_size << ",\n"
                << "  \"requested_iterations\": " << report.requested_iterations << ",\n"
                << "  \"max_levels\": " << report.max_levels << ",\n"
                << "  \"blocks\": " << report.blocks << ",\n"
                << "  \"workers\": " << report.workers << ",\n"
                << "  \"standalone_blocks\": " << report.standalone_blocks << ",\n"
                << "  \"shared_blocks\": " << report.shared_blocks << ",\n"
                << "  \"zlib_blocks\": " << report.zlib_blocks << ",\n"
                << "  \"lzma_blocks\": " << report.lzma_blocks << ",\n"
                << "  \"directories\": " << directories << ",\n"
                << "  \"files\": " << files << ",\n"
                << "  \"input_bytes\": " << input_bytes << ",\n"
                << "  \"bundle_bytes\": " << bundle_payload.size() << "\n"
                << "}\n";
            std::cout << out.str();
            return 0;
        }

        usage();
        return 1;
    } catch (const std::exception& error) {
        std::cerr << "error: " << error.what() << "\n";
        return 1;
    }
}
