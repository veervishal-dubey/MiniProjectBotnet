import logging
from typing import Dict, List, Optional, Tuple, Any
import numpy as np
import pandas as pd

from app.adapters.base import (
    BaseDatasetAdapter,
    DatasetType,
    AdapterValidationResult,
    DatasetCompatibilityError,
)

logger = logging.getLogger(__name__)

EDGE_IIOTSET_SIGNATURE_COLUMNS = [
    "frame.time", "ip.src_host", "ip.dst_host", "arp.opcode", "arp.hw.size",
    "icmp.checksum", "icmp.seq_le", "http.response", "http.tls_version",
    "tcp.ack", "tcp.connection.fin", "tcp.flags", "tcp.len", "tcp.seq",
    "udp.port", "udp.stream", "mqtt.topic", "Attack_label", "Attack_type"
]

EDGE_IIOTSET_ATTACK_TYPES = [
    "Normal", "DDoS_UDP", "DDoS_ICMP", "DDoS_HTTP", "DDoS_TCP",
    "Ransomware", "Fingerprinting", "Vulnerability_scanner", "MITM",
    "SQL_injection", "Backdoor", "Port_Scanning", "Password", "XSS", "Uploading"
]


class EdgeIIoTsetAdapter(BaseDatasetAdapter):
    """
    Adapter for the Edge-IIoTset (Industrial IoT / Edge Computing Cybersecurity) dataset.
    Detects Edge-IIoTset schema, performs empirical validation, and enforces strict
    anti-fabrication safeguards preventing invalid inference on mismatched FLMLP models.
    """

    @property
    def dataset_type(self) -> DatasetType:
        return DatasetType.EDGE_IIOTSET

    @property
    def display_name(self) -> str:
        return "Edge-IIoTset (Industrial IoT Dataset)"

    def identify(self, df: pd.DataFrame) -> bool:
        """
        Identifies Edge-IIoTset based on characteristic Wireshark/Zeek flow headers.
        """
        cols_lower = {c.strip().lower() for c in df.columns}
        sig_lower = {c.lower() for c in EDGE_IIOTSET_SIGNATURE_COLUMNS}
        overlap = cols_lower.intersection(sig_lower)
        has_network_fields = any(c.startswith("frame.") or c.startswith("tcp.") or c.startswith("udp.") or c.startswith("icmp.") or c.startswith("arp.") for c in cols_lower)
        return len(overlap) >= 3 or (has_network_fields and ("attack_type" in cols_lower or "attack_label" in cols_lower))

    def validate_schema(self, df: pd.DataFrame) -> AdapterValidationResult:
        col_map_lower = {c.strip().lower(): c for c in df.columns}
        
        # Check label column
        label_col = None
        for cand in ["attack_type", "Attack_type", "Attack_label", "attack_label", "label", "Label"]:
            if cand in df.columns:
                label_col = cand
                break
            elif cand.lower() in col_map_lower:
                label_col = col_map_lower[cand.lower()]
                break

        detected_classes = []
        if label_col:
            detected_classes = [str(c) for c in df[label_col].dropna().unique().tolist()]

        num_cols = df.select_dtypes(include=[np.number]).columns
        inf_count = int(np.isinf(df[num_cols]).values.sum()) if len(num_cols) > 0 else 0
        nan_count = int(df.isna().values.sum())

        from app.adapters.cic_iot_2023 import CANONICAL_39_FEATURES
        canonical_set = {f.lower() for f in CANONICAL_39_FEATURES}
        current_set = {c.lower() for c in df.columns}
        overlap = canonical_set.intersection(current_set)
        missing_canonical = [f for f in CANONICAL_39_FEATURES if f.lower() not in current_set]

        rejection_reason = (
            f"Edge-IIoTset is incompatible with the currently loaded 39-feature FLMLP model. "
            f"It lacks {len(missing_canonical)} mandatory flow dynamics features (including IAT, AVG, Tot sum, Header_Length). "
            f"Furthermore, its attack taxonomy ({', '.join(detected_classes[:4]) if detected_classes else 'Industrial IoT threats'}) "
            f"does not map directly to the 7 canonical CIC IoT 2023 threat classes without scientifically invalid label fabrication."
        )

        return AdapterValidationResult(
            dataset_type=self.dataset_type,
            dataset_name=self.display_name,
            is_compatible_with_flmlp=False,
            matched_features=list(overlap),
            missing_mandatory_features=missing_canonical,
            detected_columns=list(df.columns),
            detected_label_column=label_col,
            detected_classes=detected_classes,
            supported_classes=[],
            unsupported_classes=detected_classes,
            row_count=len(df),
            column_count=len(df.columns),
            infinite_values_count=inf_count,
            nan_values_count=nan_count,
            notes=[
                "Successfully identified Edge-IIoTset schema signature.",
                "Inference blocked: Edge-IIoTset requires an Edge-IIoTset-specific classifier.",
                "Zero-imputation guard active: preventing synthetic fabrication of missing network header flags.",
            ],
            rejection_reason=rejection_reason,
        )

    def align_and_preprocess(
        self,
        df: pd.DataFrame,
        scaler: Any = None,
    ) -> Tuple[np.ndarray, Optional[List[str]], AdapterValidationResult]:
        validation = self.validate_schema(df)
        raise DatasetCompatibilityError(validation.rejection_reason)
