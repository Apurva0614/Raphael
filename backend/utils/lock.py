import os
from filelock import FileLock, Timeout

def get_lock_path() -> str:
    data_dir = os.getenv("RAPHAEL_DATA_DIR")
    if not data_dir:
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        data_dir = os.path.join(project_root, "data")
    os.makedirs(data_dir, exist_ok=True)
    return os.path.join(data_dir, "raphael_pipeline.lock")

class PipelineLock:
    def __init__(self):
        self.lock_path = get_lock_path()
        self.lock = FileLock(self.lock_path)

    def acquire_non_blocking(self) -> bool:
        """Attempt to acquire lock without blocking. Returns True if acquired, False otherwise."""
        try:
            self.lock.acquire(timeout=0)
            return True
        except Timeout:
            return False

    def release(self):
        """Release the lock."""
        try:
            self.lock.release()
        except Exception:
            pass

    def __enter__(self):
        if not self.acquire_non_blocking():
            raise Timeout("Could not acquire pipeline lock")
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.release()
