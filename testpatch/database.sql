CREATE TABLE java_code_embeddings (
    id VARCHAR2(36) DEFAULT SYS_GUID() PRIMARY KEY,
    filepath VARCHAR2(256),
    type VARCHAR2(10), -- 'source' or 'test'
    content CLOB,
    embedding VECTOR(384, FLOAT32)
);

-- Create a vector index for faster search
CREATE VECTOR INDEX java_code_embedding_idx
ON java_code_embeddings(embedding)
ORGANIZATION INMEMORY NEIGHBOR PARTITIONS 128
ATTRIBUTES (
    DISTANCE COSINE
);
