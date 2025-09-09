"""
java_embeddings_oracle.py

Walk a directory, embed Java source files and test files separately,
store embeddings in Oracle 23ai VECTOR column, and test cosine search
using a modified source file.

Supports two embedding backends:
 - "openai" (OpenAI embeddings via openai package)
 - "local" (sentence-transformers local model)
"""

import os
import sys
import uuid
import glob
import json
import array
from typing import List, Tuple, Iterable, Dict
from tqdm import tqdm

# DB client
import oracledb

# Embedding backends
EMBED_BACKENDS = ("openai", "local")

# Choose backend and models here:
BACKEND = os.getenv("EMBED_BACKEND", "local")  # "openai" or "local"
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "text-embedding-3-small")  # if using openai
LOCAL_MODEL_NAME = os.getenv("LOCAL_MODEL_NAME", "all-mpnet-base-v2")  # if using sentence-transformers

# Database config - replace with your values
DB_USER = os.getenv("ORACLE_USER", "VECTOR")
DB_PWD  = os.getenv("ORACLE_PWD", "VECTOR123")
DB_DSN  = os.getenv("ORACLE_DSN", "localhost/orclpdb1")  # host/service

# Chunking params
CHUNK_SIZE = 800  # characters per chunk
CHUNK_OVERLAP = 100

# ---------------------------------------------------------------------------
# Embedding helpers
# ---------------------------------------------------------------------------
def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    if len(text) <= size:
        return [text]
    chunks = []
    start = 0
    while start < len(text):
        end = start + size
        chunk = text[start:end]
        chunks.append(chunk)
        start = end - overlap
        if start < 0:
            start = 0
        if start >= len(text):
            break
    return chunks

# Backend: local (sentence-transformers)
def init_local_model(name: str):
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer(name)
    return model

def embed_local_model(model, texts: Iterable[str]) -> List[List[float]]:
    embs = model.encode(list(texts), show_progress_bar=False, convert_to_numpy=False)
    # ensure list[float]
    return [list(map(float, e)) for e in embs]

# Backend: OpenAI
def embed_openai(api_key: str, model: str, texts: Iterable[str]) -> List[List[float]]:
    import openai
    openai.api_key = api_key
    res = []
    # OpenAI's API may have batching limits; keep simple: call per item (or batch)
    for t in texts:
        resp = openai.Embedding.create(input=t, model=model)
        emb = resp["data"][0]["embedding"]
        res.append(list(map(float, emb)))
    return res

# Generic wrapper
def get_embeddings(texts: List[str]) -> List[List[float]]:
    if BACKEND == "local":
        global _local_model
        try:
            _local_model
        except NameError:
            _local_model = init_local_model(LOCAL_MODEL_NAME)
        return embed_local_model(_local_model, texts)
    elif BACKEND == "openai":
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY not set in environment")
        return embed_openai(api_key, OPENAI_MODEL, texts)
    else:
        raise ValueError(f"Unknown backend: {BACKEND}")

# ---------------------------------------------------------------------------
# Oracle helper functions
# ---------------------------------------------------------------------------
def connect_db(user: str, pwd: str, dsn: str):
    # Use thin mode (no instant client required) unless you need thick mode features
    conn = oracledb.connect(user=user, password=pwd, dsn=dsn)
    return conn

def insert_embeddings(conn, rows: Iterable[Tuple[str, str, int, str, List[float]]]):
    """
    rows: iterable of (id, filepath, chunk_id, chunk_text, embedding_list)
    Embedding list should be python floats; we'll convert to array.array("f") for float32 binding.
    """
    cur = conn.cursor()
    sql = """
      INSERT INTO java_embeddings (id, filepath, content_type, chunk_id, chunk_text, embedding)
      VALUES (:1, :2, :3, :4, :5, :6)
    """
    batch = []
    for r in rows:
        _id, filepath, content_type, chunk_id, chunk_text, emb = r
        # convert embedding to float32 array for binding
        arr = array.array("f", emb)  # float32
        batch.append((_id, filepath, content_type, chunk_id, chunk_text, arr))
    cur.executemany(sql, batch)
    conn.commit()
    cur.close()

def query_similar(conn, query_vector: List[float], top_k: int = 10) -> List[Dict]:
    """
    Use VECTOR_DISTANCE with COSINE to get nearest matches.
    Returns list of dict rows with distance ordered ascending (closest first).
    """
    cur = conn.cursor()
    qarr = array.array("f", query_vector)
    sql = """
    SELECT id, filepath, content_type, chunk_id, dbms_lob.substr(chunk_text, 4000, 1) AS snippet,
           VECTOR_DISTANCE(embedding, :qvec, 'COSINE') AS dist
    FROM java_embeddings
    ORDER BY dist ASC
    FETCH FIRST :k ROWS ONLY
    """
    cur.execute(sql, [qarr, top_k])
    cols = [c[0].lower() for c in cur.description]
    results = []
    for row in cur:
        results.append(dict(zip(cols, row)))
    cur.close()
    return results

# ---------------------------------------------------------------------------
# File scanning and ingestion
# ---------------------------------------------------------------------------
def find_java_files(base_dir: str) -> Tuple[List[str], List[str]]:
    """
    Returns (source_files, test_files)
    Strategy: treat files under paths containing 'test' or filenames ending with *Test.java or *Tests.java as test files.
    """
    source_files = []
    test_files = []
    for root, _, files in os.walk(base_dir):
        for f in files:
            if not f.endswith(".java"):
                continue
            path = os.path.join(root, f)
            lower = path.lower()
            if "test" in lower.split(os.sep) or f.endswith("Test.java") or f.endswith("Tests.java"):
                test_files.append(path)
            else:
                source_files.append(path)
    return source_files, test_files

def read_file(path: str) -> str:
    with open(path, "r", encoding="utf-8", errors="ignore") as fh:
        return fh.read()

def ingest_directory(base_dir: str, conn):
    src_files, test_files = find_java_files(base_dir)
    print(f"Found {len(src_files)} source files and {len(test_files)} test files")

    def process_file_list(file_list, content_type):
        all_rows = []
        for path in tqdm(file_list, desc=f"Embedding {content_type}"):
            text = read_file(path)
            chunks = chunk_text(text)
            embeddings = get_embeddings(chunks)
            for i, (chunk_text, emb) in enumerate(zip(chunks, embeddings)):
                row_id = str(uuid.uuid4())
                # row tuple: id, filepath, content_type, chunk_id, chunk_text, embedding
                all_rows.append((row_id, path, content_type, i, chunk_text, emb))
        # insert in batches (example batch size)
        BATCH = 128
        for i in range(0, len(all_rows), BATCH):
            insert_embeddings(conn, all_rows[i:i+BATCH])

    # process separately so we can label content_type differently
    process_file_list(src_files, "source")
    process_file_list(test_files, "test")

# ---------------------------------------------------------------------------
# Example use: search for similar chunks to a modified file
# ---------------------------------------------------------------------------
def search_with_modified_file(conn, modified_file_path: str, top_k: int = 8):
    mod_text = read_file(modified_file_path)
    # you might want to focus on changed hunks only; here we embed the whole modified file
    chunks = chunk_text(mod_text)
    embeddings = get_embeddings(chunks)
    # average vector as a simple query vector (or use the first chunk or any strategy)
    import numpy as np
    avg_vec = np.mean(np.array(embeddings, dtype=float), axis=0).tolist()
    results = query_similar(conn, avg_vec, top_k=top_k)
    print("Top matches:")
    for r in results:
        print(f"{r['filepath']} (chunk {r['chunk_id']}) dist={r['dist']:.6f}")
        print(f" snippet: {r['snippet'][:300]!r}")
        print("-" * 60)
    return results

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    if len(sys.argv) < 2:
        print("Usage: python java_embeddings_oracle.py <java_project_root> [--search modified_file.java]")
        sys.exit(1)

    base_dir = sys.argv[1]
    search_mode = False
    modified_path = None
    if len(sys.argv) >= 4 and sys.argv[2] == "--search":
        search_mode = True
        modified_path = sys.argv[3]

    conn = connect_db(DB_USER, DB_PWD, DB_DSN)
    if not search_mode:
        print("Starting ingestion...")
        ingest_directory(base_dir, conn)
        print("Done ingestion.")
    else:
        print("Running similarity search using modified file:", modified_path)
        search_with_modified_file(conn, modified_path)

    conn.close()

if __name__ == "__main__":
    main()
