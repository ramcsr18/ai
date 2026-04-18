import os
import glob
import oracledb
import array
import javalang
from sentence_transformers import SentenceTransformer
from pathlib import Path

# --- Configuration ---
# Oracle DB credentials
DB_USER = os.getenv("ORACLE_DB_USER", "your_user")
DB_PASSWORD = os.getenv("ORACLE_DB_PASSWORD", "your_password")
DB_DSN = os.getenv("ORACLE_DB_DSN", "localhost:1521/XEPDB1")

# Paths to your Java source and test files
SOURCE_CODE_PATH = "./your_java_project/src/main/java"
TEST_CODE_PATH = "./your_java_project/src/test/java"

# Embedding models to test
MODELS_TO_TEST = [
    "sentence-transformers/all-MiniLM-L6-v2", # Fast and light
    "BAAI/bge-small-en-v1.5" # High-performance
]
# For this example, we use the embedding dimension for 'all-MiniLM-L6-v2'.
EMBEDDING_DIMENSION = 384

# --- Helper Functions ---
def connect_to_db(user, password, dsn):
    """Establishes a connection to the Oracle database."""
    try:
        connection = oracledb.connect(user=user, password=password, dsn=dsn)
        print("Successfully connected to Oracle Database.")
        return connection
    except oracledb.DatabaseError as e:
        print(f"Database connection error: {e}")
        return None

def extract_methods_and_classes(file_path):
    """
    Parses a Java source file and extracts the content of methods and classes.
    Returns a list of dictionaries, with each dictionary containing the content
    and type ('class' or 'method').
    """
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    extracted_content = []
    try:
        tree = javalang.parse.parse(content)
        
        # Extract class content
        for _, class_declaration in tree.filter(javalang.tree.ClassDeclaration):
            class_content = " ".join(token.value for token in class_declaration.tokens)
            extracted_content.append({"content": class_content, "type": "class"})
        
        # Extract method content
        for _, method_declaration in tree.filter(javalang.tree.MethodDeclaration):
            method_content = " ".join(token.value for token in method_declaration.tokens)
            extracted_content.append({"content": method_content, "type": "method"})

    except javalang.parser.JavaSyntaxError as e:
        print(f"Syntax error in file {file_path}: {e}")
    
    return extracted_content

def process_and_insert_embeddings(connection, model, base_path, file_type):
    """
    Generates embeddings for Java source/test files and inserts them into the database.
    """
    print(f"\nProcessing {file_type} files using model: {model.model_name}")
    cursor = connection.cursor()
    
    java_files = glob.glob(os.path.join(base_path, '**', '*.java'), recursive=True)
    if not java_files:
        print(f"No {file_type} files found in {base_path}")
        return

    insert_sql = "INSERT INTO java_code_embeddings (filepath, type, content, embedding) VALUES (:1, :2, :3, :4)"
    
    for file_path in java_files:
        extracted_content = extract_methods_and_classes(file_path)
        
        for item in extracted_content:
            text_to_embed = item["content"]
            
            try:
                embedding = model.encode(text_to_embed, normalize_embeddings=True)
                # Convert the NumPy array to an array.array of floats for oracledb
                embedding_array = array.array('f', embedding.tolist())
                
                cursor.execute(insert_sql, [
                    os.path.relpath(file_path),
                    file_type,
                    text_to_embed,
                    embedding_array
                ])
                connection.commit()
            except Exception as e:
                print(f"Error inserting embedding for {file_path} (Type: {item['type']}): {e}")
                connection.rollback()
    
    print(f"Finished inserting embeddings for {file_type} files.")

def find_similar_code(connection, query_text, model, num_results=5):
    """
    Performs a cosine similarity search on the embedded code.
    """
    print(f"\nSearching for code similar to: '{query_text}'")
    query_vector = model.encode(query_text, normalize_embeddings=True)
    query_vector_array = array.array('f', query_vector.tolist())
    
    search_sql = """
        SELECT filepath, type, content,
               VECTOR_DISTANCE(embedding, :query_vec, COSINE) AS similarity_score
        FROM java_code_embeddings
        ORDER BY similarity_score DESC
        FETCH FIRST :num_rows ROWS ONLY
    """
    
    cursor = connection.cursor()
    try:
        cursor.setinputsizes(query_vec=oracledb.VECTOR)
        cursor.execute(search_sql, {"query_vec": query_vector_array, "num_rows": num_results})
        
        results = cursor.fetchall()
        print(f"Found {len(results)} similar code snippets.")
        
        for filepath, file_type, content, score in results:
            print("-" * 50)
            print(f"File: {filepath} (Type: {file_type})")
            print(f"Similarity Score: {score:.4f}")
            print("Content Snippet:\n", content[:200].strip(), "...")
    
    except oracledb.DatabaseError as e:
        print(f"Similarity search error: {e}")

# --- Main Execution ---
if __name__ == "__main__":
    db_conn = connect_to_db(DB_USER, DB_PASSWORD, DB_DSN)
    if not db_conn:
        exit()

    try:
        # Step 1 & 2: Generate and insert embeddings for different models
        for model_name in MODELS_TO_TEST:
            print(f"\n--- Running tests with model: {model_name} ---")
            model = SentenceTransformer(model_name)
            
            # Insert embeddings for source and test code
            process_and_insert_embeddings(db_conn, model, SOURCE_CODE_PATH, 'source')
            process_and_insert_embeddings(db_conn, model, TEST_CODE_PATH, 'test')

            # Step 3: Test cosine similarity search on a modified file
            # Scenario: Simulate a change and check for related code
            # We'll use a sample search query instead of a real modified file for simplicity
            
            # Example search query based on a hypothetical modified function
            search_query_java = """
                public void calculateTotal(double price, int quantity) {
                    double total = price * quantity;
                    // Additional complex logic here
                    return total;
                }
            """
            
            find_similar_code(db_conn, search_query_java, model)

    finally:
        if db_conn:
            db_conn.close()
            print("Database connection closed.")
	