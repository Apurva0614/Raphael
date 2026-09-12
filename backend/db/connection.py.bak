import os
import sys
import platform
import psutil
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

# Windows DLL overrides for MKL/OMP, Stan compiler, and SpatiaLite
if sys.platform == 'win32':
    conda_prefix = os.environ.get("RAPHAEL_CONDA_PREFIX") or os.environ.get("CONDA_PREFIX") or r"C:\Users\harsh\anaconda3\envs\raphael-env"
    lib_bin = os.path.join(conda_prefix, "Library", "bin")
    if os.path.exists(lib_bin):
        if lib_bin not in os.environ["PATH"]:
            os.environ["PATH"] = lib_bin + os.pathsep + os.environ["PATH"]
        if hasattr(os, 'add_dll_directory'):
            try:
                os.add_dll_directory(lib_bin)
            except Exception:
                pass

load_dotenv()

def get_available_ram_gb() -> float:
    return psutil.virtual_memory().available / (1024 ** 3)

def get_database_url() -> str:
    ram = get_available_ram_gb()
    threshold = float(os.getenv("DB_RAM_THRESHOLD_GB", "6"))

    if ram >= threshold:
        user     = os.getenv("POSTGRES_USER", "raphael")
        password = os.getenv("POSTGRES_PASSWORD", "raphael")
        host     = "127.0.0.1"
        port     = os.getenv("POSTGRES_PORT", "5433")
        db       = os.getenv("POSTGRES_DB", "raphael_db")
        return f"postgresql+psycopg2://{user}:{password}@{host}:{port}/{db}"
    else:
        data_dir = os.getenv("RAPHAEL_DATA_DIR", "./data")
        return f"sqlite+pysqlite:///{data_dir}/raphael.db"

DATABASE_URL = get_database_url()
IS_SPATIALITE = DATABASE_URL.startswith("sqlite")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if IS_SPATIALITE else {}
)

if IS_SPATIALITE:
    @event.listens_for(engine, "connect")
    def load_spatialite(dbapi_conn, connection_record):
        dbapi_conn.enable_load_extension(True)
        dbapi_conn.load_extension("mod_spatialite")
        dbapi_conn.enable_load_extension(False)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
