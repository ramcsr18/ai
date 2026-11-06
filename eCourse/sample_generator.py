"""Utility to generate sample PDF documents for testing course generation without needing external files."""
import os

def create_sample_study_pdf(filepath: str = "sample_operating_systems.pdf"):
    """Creates a sample PDF with high-yield Computer Science / Operating Systems exam topics."""
    sections = [
        (
            "Topic 1: Process Synchronization, Mutexes, and Semaphores",
            [
                "Process synchronization coordinates the execution of concurrent processes to ensure consistent data.",
                "A critical section is a segment of code where shared resources such as memory, files, or variables are accessed.",
                "Mutual exclusion guarantees that only one process or thread executes within its critical section at any given time.",
                "Race conditions occur when the outcome of execution depends on the non-deterministic scheduling of competing threads.",
                "Semaphores are integer variables accessed only through two atomic operations: wait() also known as P(), and signal() also known as V().",
                "A binary semaphore takes values 0 or 1 and functions identically to a mutex lock.",
                "A counting semaphore has an unrestricted domain and is used to control access to a resource pool with multiple instances.",
                "Common synchronization problems include the Producer-Consumer Problem, Readers-Writers Problem, and Dining Philosophers Problem."
            ]
        ),
        (
            "Topic 2: Deadlock Characterization, Prevention, and Banker's Algorithm",
            [
                "A deadlock is a situation where a set of processes are blocked because each process is holding a resource and waiting for another.",
                "Four Coffman conditions must hold simultaneously for a deadlock to arise:",
                "1. Mutual Exclusion: At least one resource must be held in a non-shareable mode.",
                "2. Hold and Wait: A process must be holding at least one resource and waiting to acquire additional resources.",
                "3. No Preemption: Resources cannot be preempted; a resource can be released only voluntarily by the process holding it.",
                "4. Circular Wait: A closed chain of processes exists such that each process holds resources needed by the next process.",
                "Deadlock prevention eliminates at least one of the four necessary Coffman conditions.",
                "Deadlock avoidance uses dynamically gathered information such as Dijkstra's Banker's Algorithm to ensure the system never enters an unsafe state.",
                "A safe state guarantees that there exists a safe sequence of processes that can finish execution without deadlocking."
            ]
        ),
        (
            "Topic 3: Virtual Memory, Paging, and Page Replacement Algorithms",
            [
                "Virtual memory separates user logical memory from physical RAM, allowing execution of processes larger than physical memory.",
                "Paging divides logical memory into fixed-size blocks called pages, and physical memory into matching blocks called frames.",
                "The Memory Management Unit (MMU) translates logical addresses into physical addresses using a Page Table.",
                "The Translation Lookaside Buffer (TLB) is an associative hardware cache that drastically reduces memory lookup latency.",
                "A page fault interrupt is triggered when a process references a page marked invalid or not resident in physical RAM.",
                "Page replacement algorithms determine which frame to evict when all frames are occupied:",
                "1. FIFO (First-In, First-Out): Simple, but suffers from Belady's Anomaly where adding frames can increase page faults.",
                "2. LRU (Least Recently Used): Replaces the page unused for the longest time, highly optimal in practice.",
                "3. Optimal Algorithm: Replaces the page that will not be used for the longest period in the future (theoretical benchmark).",
                "Thrashing occurs when a computer spends excessive time swapping pages into and out of memory rather than executing instructions."
            ]
        )
    ]

    objects = []
    page_objs = []

    def escape_pdf(text: str) -> str:
        return text.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')

    # Object IDs:
    # 1: Catalog
    # 2: Pages
    # 3: Font
    # 4, 5: Page 1 content, Page 1
    # 6, 7: Page 2 content, Page 2
    # 8, 9: Page 3 content, Page 3
    num_sections = len(sections)
    cat_id = 1
    pages_id = 2
    font_id = 3
    
    # We will build objects dict {id: bytes}
    obj_dict = {}
    obj_dict[cat_id] = f"{cat_id} 0 obj\n<< /Type /Catalog /Pages {pages_id} 0 R >>\nendobj".encode("latin1")
    obj_dict[font_id] = f"{font_id} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj".encode("latin1")
    
    page_ids = []
    next_id = 4
    for title, paragraphs in sections:
        content_id = next_id
        page_id = next_id + 1
        page_ids.append(page_id)
        next_id += 2

        lines = [f"BT /F1 14 Tf 40 740 Td 20 TL ({escape_pdf(title)}) Tj T* /F1 10 Tf 14 TL"]
        for p in paragraphs:
            words = p.split(' ')
            cur = []
            for w in words:
                cur.append(w)
                if len(' '.join(cur)) > 75:
                    lines.append(f"({escape_pdf(' '.join(cur))}) Tj T*")
                    cur = []
            if cur:
                lines.append(f"({escape_pdf(' '.join(cur))}) Tj T*")
            lines.append("T*")
        lines.append("ET")
        stream_data = " ".join(lines).encode("latin1", errors="replace")
        
        obj_dict[content_id] = (
            f"{content_id} 0 obj\n<< /Length {len(stream_data)} >>\nstream\n".encode("latin1")
            + stream_data
            + b"\nendstream\nendobj"
        )
        obj_dict[page_id] = (
            f"{page_id} 0 obj\n"
            f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 612 792] "
            f"/Resources << /Font << /F1 {font_id} 0 R >> >> /Contents {content_id} 0 R >>\nendobj"
        ).encode("latin1")

    kids_str = " ".join(f"{p} 0 R" for p in page_ids)
    obj_dict[pages_id] = f"{pages_id} 0 obj\n<< /Type /Pages /Kids [{kids_str}] /Count {len(page_ids)} >>\nendobj".encode("latin1")

    max_id = next_id - 1
    out = b"%PDF-1.4\n"
    offsets = {}
    for i in range(1, max_id + 1):
        offsets[i] = len(out)
        out += obj_dict[i] + b"\n"

    start_xref = len(out)
    out += f"xref\n0 {max_id + 1}\n0000000000 65535 f \n".encode("latin1")
    for i in range(1, max_id + 1):
        out += f"{offsets[i]:010d} 00000 n \n".encode("latin1")
    out += f"trailer\n<< /Size {max_id + 1} /Root {cat_id} 0 R >>\nstartxref\n{start_xref}\n%%EOF\n".encode("latin1")

    with open(filepath, "wb") as f:
        f.write(out)
    return filepath

if __name__ == "__main__":
    path = create_sample_study_pdf()
    print(f"Sample PDF created successfully at {path}")
