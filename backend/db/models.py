import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Float, Boolean, DateTime, Date, Integer, Text, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import declarative_base, relationship
from geoalchemy2 import Geometry

@compiles(UUID, "sqlite")
def compile_uuid_sqlite(type_, compiler, **kw):
    return "CHAR(36)"

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id                 = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username           = Column(String(100), unique=True, nullable=False)
    password_hash      = Column(Text, nullable=False)
    display_name       = Column(String(200))
    role               = Column(String(20), nullable=False, default="viewer")
    organization       = Column(String(200))
    preferred_language = Column(String(5), default="en")
    created_at         = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    last_active_at     = Column(DateTime(timezone=True))

class ActivityLog(Base):
    __tablename__ = "activity_log"
    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id       = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    action        = Column(String(100), nullable=False)
    resource_type = Column(String(50))
    resource_id   = Column(UUID(as_uuid=True))
    metadata_json = Column("metadata", JSON)
    performed_at  = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class Region(Base):
    __tablename__ = "regions"
    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name         = Column(String(200), nullable=False)
    country_code = Column(String(3), nullable=False)
    bbox         = Column(Geometry("POLYGON", srid=4326), nullable=False)
    admin_level  = Column(Integer, default=2)
    pmtiles_path = Column(Text)
    created_at   = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    is_active    = Column(Boolean, default=False)

class Source(Base):
    __tablename__ = "sources"
    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key            = Column(String(50), unique=True, nullable=False)
    name           = Column(String(200), nullable=False)
    category       = Column(String(50), nullable=False)
    layer_types    = Column(JSON, nullable=False)
    base_url       = Column(Text)
    is_enabled     = Column(Boolean, default=True)
    last_synced_at = Column(DateTime(timezone=True))
    last_error     = Column(Text)
    error_count    = Column(Integer, default=0)

class RawObservation(Base):
    __tablename__ = "raw_observations"
    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_id    = Column(UUID(as_uuid=True), ForeignKey("sources.id"), nullable=False)
    region_id    = Column(UUID(as_uuid=True), ForeignKey("regions.id"), nullable=False)
    layer_type   = Column(String(50), nullable=False)
    geometry     = Column(Geometry("POINT", srid=4326), nullable=False)
    value        = Column(Float, nullable=False)
    unit         = Column(String(20))
    station_id   = Column(String(100))
    station_name = Column(String(200))
    observed_at  = Column(DateTime(timezone=True), nullable=False)
    synced_at    = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    raw_payload  = Column(JSON)
    is_anomalous = Column(Boolean, default=False)
    anomaly_score = Column(Float)

class ZoneGeometry(Base):
    __tablename__ = "zone_geometries"
    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    region_id   = Column(UUID(as_uuid=True), ForeignKey("regions.id"), nullable=False)
    admin_level = Column(Integer, nullable=False)
    name        = Column(String(200), nullable=False)
    name_local  = Column(String(200))
    gadm_gid    = Column(String(100))
    geometry    = Column(Geometry("MULTIPOLYGON", srid=4326), nullable=False)
    properties  = Column(JSON)
    source      = Column(String(50), default="gadm")

class RasterTile(Base):
    __tablename__ = "raster_tiles"
    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    layer_type   = Column(String(50), nullable=False)
    region_id    = Column(UUID(as_uuid=True), ForeignKey("regions.id"), nullable=False)
    source_id    = Column(UUID(as_uuid=True), ForeignKey("sources.id"))
    tile_path    = Column(Text, nullable=False)
    bounds       = Column(Geometry("POLYGON", srid=4326))
    processed_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    valid_date   = Column(Date, nullable=False)
    resolution_m = Column(Integer)
    colormap     = Column(String(50), default="plasma")

class MLOutput(Base):
    __tablename__ = "ml_outputs"
    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    zone_id         = Column(UUID(as_uuid=True), ForeignKey("zone_geometries.id"))
    model_type      = Column(String(50), nullable=False)
    output_type     = Column(String(50), nullable=False)
    layer_type      = Column(String(50))
    value           = Column(Float, nullable=False)
    confidence_lower = Column(Float)
    confidence_upper = Column(Float)
    explanation     = Column(Text)
    model_version   = Column(String(50))
    mlflow_run_id   = Column(String(100))
    computed_at     = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    valid_from      = Column(DateTime(timezone=True))
    valid_to        = Column(DateTime(timezone=True))
    geometry        = Column(Geometry("POINT", srid=4326))

class AlertRule(Base):
    __tablename__ = "alert_rules"
    id                = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id           = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    name              = Column(String(200), nullable=False)
    layer_type        = Column(String(50), nullable=False)
    geometry          = Column(Geometry("GEOMETRY", srid=4326))
    zone_id           = Column(UUID(as_uuid=True), ForeignKey("zone_geometries.id"))
    operator          = Column(String(20), nullable=False)
    threshold         = Column(Float, nullable=False)
    severity          = Column(String(20), nullable=False, default="warning")
    time_window       = Column(JSON)
    radius_km         = Column(Float)
    is_active         = Column(Boolean, default=True)
    created_at        = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    consecutive_fires = Column(Integer, default=0)
    consecutive_fires_by_zone = Column(Text, default="{}")

class AlertEvent(Base):
    __tablename__ = "alert_events"
    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rule_id         = Column(UUID(as_uuid=True), ForeignKey("alert_rules.id"), nullable=False)
    triggered_at    = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    observed_value  = Column(Float, nullable=False)
    location        = Column(Geometry("POINT", srid=4326))
    acknowledged    = Column(Boolean, default=False)
    acknowledged_at = Column(DateTime(timezone=True))
    acknowledged_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    severity        = Column(String(20), default="warning")

class ImportDataset(Base):
    __tablename__ = "import_datasets"
    id               = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id          = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    name             = Column(String(200), nullable=False)
    format           = Column(String(20), nullable=False)
    row_count        = Column(Integer)
    schema_map       = Column(JSON, nullable=False)
    layer_type       = Column(String(50))
    mage_pipeline_id = Column(String(100))
    imported_at      = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    is_visible       = Column(Boolean, default=True)

class EventMarker(Base):
    __tablename__ = "event_markers"
    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id     = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    name        = Column(String(200), nullable=False)
    description = Column(Text)
    zone_id     = Column(UUID(as_uuid=True), ForeignKey("zone_geometries.id"))
    geometry    = Column(Geometry("GEOMETRY", srid=4326))
    event_date  = Column(Date, nullable=False)
    created_at  = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class ReportJob(Base):
    __tablename__ = "report_jobs"
    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    report_type   = Column(String(50), nullable=False)
    zone_ids      = Column(JSON)
    date_range    = Column(JSON)
    status        = Column(String(20))
    file_path     = Column(Text)
    file_size     = Column(Integer)
    page_count    = Column(Integer)
    error_message = Column(Text)
    progress_pct  = Column(Integer)
    current_step  = Column(String(100))
    generated_at  = Column(DateTime(timezone=True))
    requested_by  = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
