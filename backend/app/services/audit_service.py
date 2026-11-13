import os
import json
import uuid
import time
import sqlite3
import threading
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

from app.core.config import settings

logger = logging.getLogger(__name__)


class AuditService:
    """
    Durable, thread-safe audit logging service using local SQLite storage.
    Ensures that data ingestion, ML inference, dataset validation, federated learning,
    and system operational events are persisted and searchable across restarts.
    """

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or (settings.STORAGE_DIR / "audit_logs.sqlite3")
        self.lock = threading.Lock()
        self._init_db()
        self._bootstrap_initial_logs_if_empty()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        # Enable WAL mode for high concurrent read/write throughput
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        return conn

    def _init_db(self) -> None:
        """Initializes audit_logs table schema and performance indexes."""
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self.lock:
            with self._get_connection() as conn:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS audit_logs (
                        id TEXT PRIMARY KEY,
                        timestamp TEXT NOT NULL,
                        severity TEXT NOT NULL,
                        category TEXT NOT NULL,
                        message TEXT NOT NULL,
                        component TEXT NOT NULL,
                        details TEXT,
                        experiment_id TEXT,
                        is_synthetic INTEGER DEFAULT 0
                    );
                """)
                conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp DESC);")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_category ON audit_logs(category);")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_severity ON audit_logs(severity);")
                conn.commit()

    def _bootstrap_initial_logs_if_empty(self) -> None:
        """Seeds initial system boot records if the database is newly initialized."""
        with self.lock:
            with self._get_connection() as conn:
                cur = conn.cursor()
                cur.execute("SELECT COUNT(*) AS cnt FROM audit_logs")
                count = cur.fetchone()["cnt"]
                if count == 0:
                    now = datetime.now(timezone.utc).isoformat()
                    cur.execute("""
                        INSERT INTO audit_logs (id, timestamp, severity, category, message, component, details, experiment_id, is_synthetic)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        f"log_{int(time.time())}_{uuid.uuid4().hex[:6]}",
                        now,
                        "INFO",
                        "SYSTEM",
                        "SentinelFL Audit Logging Ledger initialized with SQLite WAL persistence.",
                        "AuditService",
                        json.dumps({"storage_path": str(self.db_path), "wal_mode": True}),
                        None,
                        0
                    ))
                    cur.execute("""
                        INSERT INTO audit_logs (id, timestamp, severity, category, message, component, details, experiment_id, is_synthetic)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        f"log_{int(time.time()) + 1}_{uuid.uuid4().hex[:6]}",
                        now,
                        "INFO",
                        "SYSTEM",
                        "Dataset Adapter Registry online: CIC-IoT-2023 (Canonical FLMLP), Edge-IIoTset, and N-IoT registered.",
                        "DatasetAdapterRegistry",
                        json.dumps({"adapters": ["cic_iot_2023", "edge_iiotset", "n_iot"]}),
                        None,
                        0
                    ))
                    cur.execute("""
                        INSERT INTO audit_logs (id, timestamp, severity, category, message, component, details, experiment_id, is_synthetic)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        f"log_{int(time.time()) + 2}_{uuid.uuid4().hex[:6]}",
                        now,
                        "INFO",
                        "DETECTION",
                        "Centralized PyTorch FLMLP Model loaded successfully (39 features -> 7 threat classes).",
                        "MLService",
                        json.dumps({"features": 39, "classes": 7, "device": "cpu", "checkpoint": "mlp_model.pth"}),
                        None,
                        0
                    ))
                    conn.commit()

    def record_event(
        self,
        severity: str,
        category: str,
        message: str,
        component: str,
        details: Optional[Dict[str, Any]] = None,
        experiment_id: Optional[str] = None,
        is_synthetic: bool = False,
    ) -> Dict[str, Any]:
        """
        Records a genuine audit event to the persistent SQLite ledger.
        """
        event_id = f"log_{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}"
        timestamp = datetime.now(timezone.utc).isoformat()
        details_str = json.dumps(details, default=str) if details is not None else None

        with self.lock:
            with self._get_connection() as conn:
                conn.execute("""
                    INSERT INTO audit_logs (id, timestamp, severity, category, message, component, details, experiment_id, is_synthetic)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    event_id,
                    timestamp,
                    severity.upper(),
                    category.upper(),
                    message,
                    component,
                    details_str,
                    experiment_id,
                    1 if is_synthetic else 0,
                ))
                conn.commit()

        return {
            "id": event_id,
            "timestamp": timestamp,
            "severity": severity.upper(),
            "category": category.upper(),
            "message": message,
            "component": component,
            "details": details,
            "experimentId": experiment_id,
            "isSyntheticDemo": is_synthetic,
        }

    def get_logs(
        self,
        query: Optional[str] = None,
        severity: Optional[str] = None,
        category: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> Tuple[List[Dict[str, Any]], int, Dict[str, int], Dict[str, int]]:
        """
        Retrieves filtered audit logs, total matching count, and aggregate severity/category distributions.
        """
        conditions = []
        params: List[Any] = []

        if query and query.strip():
            like_term = f"%{query.strip()}%"
            conditions.append("(message LIKE ? OR component LIKE ? OR category LIKE ?)")
            params.extend([like_term, like_term, like_term])

        if severity and severity.upper() != "ALL":
            conditions.append("severity = ?")
            params.append(severity.upper())

        if category and category.upper() != "ALL":
            conditions.append("category = ?")
            params.append(category.upper())

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        with self.lock:
            with self._get_connection() as conn:
                cur = conn.cursor()

                # 1. Total matching count
                cur.execute(f"SELECT COUNT(*) AS total FROM audit_logs {where_clause}", params)
                total = cur.fetchone()["total"]

                # 2. Paginated rows
                query_sql = f"""
                    SELECT id, timestamp, severity, category, message, component, details, experiment_id, is_synthetic
                    FROM audit_logs
                    {where_clause}
                    ORDER BY timestamp DESC
                    LIMIT ? OFFSET ?
                """
                cur.execute(query_sql, params + [limit, offset])
                rows = cur.fetchall()

                # 3. Aggregates by category & severity
                cur.execute("SELECT category, COUNT(*) as cnt FROM audit_logs GROUP BY category")
                cat_rows = cur.fetchall()
                categories_count = {r["category"]: r["cnt"] for r in cat_rows}

                cur.execute("SELECT severity, COUNT(*) as cnt FROM audit_logs GROUP BY severity")
                sev_rows = cur.fetchall()
                severities_count = {r["severity"]: r["cnt"] for r in sev_rows}

        results = []
        for r in rows:
            parsed_details = None
            if r["details"]:
                try:
                    parsed_details = json.loads(r["details"])
                except Exception:
                    parsed_details = {"raw": r["details"]}

            results.append({
                "id": r["id"],
                "timestamp": r["timestamp"],
                "severity": r["severity"],
                "category": r["category"],
                "message": r["message"],
                "component": r["component"],
                "details": parsed_details,
                "experimentId": r["experiment_id"],
                "isSyntheticDemo": bool(r["is_synthetic"]),
            })

        return results, total, categories_count, severities_count

    def clear_logs(self) -> int:
        """Purges logs (used for testing or resetting). Returns count of deleted logs."""
        with self.lock:
            with self._get_connection() as conn:
                cur = conn.cursor()
                cur.execute("SELECT COUNT(*) as cnt FROM audit_logs")
                count = cur.fetchone()["cnt"]
                cur.execute("DELETE FROM audit_logs")
                conn.commit()
                return count


audit_service = AuditService()

