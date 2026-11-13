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

CANONICAL_39_FEATURES: List[str] = [
    "psh_flag_number", "IAT", "ARP", "cwr_flag_number", "Min", "syn_flag_number",
    "ece_flag_number", "Max", "Tot size", "DNS", "fin_flag_number", "ack_flag_number",
    "Std", "rst_flag_number", "Telnet", "Header_Length", "rst_count", "Variance",
    "HTTP", "ICMP", "Protocol Type", "Tot sum", "AVG", "fin_count", "IRC", "IGMP",
    "IPv", "Number", "TCP", "SSH", "UDP", "Time_To_Live", "SMTP", "LLC", "Rate",
    "DHCP", "ack_count", "syn_count", "HTTPS"
]

CANONICAL_7_CLASSES: List[str] = [
    "Benign",
    "DDoS-ACK",
    "DDoS-SYN",
    "DDoS-TCP",
    "Mirai-greeth_flood",
    "Mirai-greip_flood",
    "Mirai-udpplain",
]

# Exact CIC-IoT-2023 label mapping
CIC_LABEL_MAP: Dict[str, str] = {
    "benign": "Benign",
    "normal": "Benign",
    "0": "Benign",
    "ddos-ack_fragmentation": "DDoS-ACK",
    "ddos-ack": "DDoS-ACK",
    "ddos-syn_flood": "DDoS-SYN",
    "ddos-syn": "DDoS-SYN",
    "ddos-tcp_flood": "DDoS-TCP",
    "ddos-tcp": "DDoS-TCP",
    "mirai-greeth_flood": "Mirai-greeth_flood",
    "mirai-greip_flood": "Mirai-greip_flood",
    "mirai-udpplain": "Mirai-udpplain",
}

# Potential label column candidate names
LABEL_CANDIDATE_COLUMNS = ["label", "Label", "attack_cat", "attack_type", "class", "target", "category"]


class CICIoT2023Adapter(BaseDatasetAdapter):
    """
    Adapter for the Canadian Institute for Cybersecurity (CIC) IoT 2023 dataset.
    This is the primary canonical dataset supported by the FLMLP (39 -> 128 -> 64 -> 32 -> 7) model.
    """

    @property
    def dataset_type(self) -> DatasetType:
        return DatasetType.CIC_IOT_2023

    @property
    def display_name(self) -> str:
        return "CIC IoT 2023 (Canonical FLMLP Benchmark)"

    def identify(self, df: pd.DataFrame) -> bool:
        """
        Identifies CIC IoT 2023 based on feature column overlap.
        If at least 25 of the canonical 39 features are found, confident match.
        """
        cols_lower = {c.strip().lower() for c in df.columns}
        canonical_lower = {f.lower() for f in CANONICAL_39_FEATURES}
        overlap = cols_lower.intersection(canonical_lower)
        return len(overlap) >= 20

    def validate_schema(self, df: pd.DataFrame) -> AdapterValidationResult:
        col_map_lower = {c.strip().lower(): c for c in df.columns}
        matched = []
        missing = []

        for expected in CANONICAL_39_FEATURES:
            if expected.lower() in col_map_lower:
                matched.append(expected)
            else:
                missing.append(expected)

        # Detect label column
        label_col = None
        for cand in LABEL_CANDIDATE_COLUMNS:
            if cand in df.columns:
                label_col = cand
                break
            elif cand.lower() in col_map_lower:
                label_col = col_map_lower[cand.lower()]
                break

        detected_classes = []
        supported_classes = []
        unsupported_classes = []

        if label_col:
            raw_classes = df[label_col].dropna().unique().tolist()
            detected_classes = [str(c) for c in raw_classes]
            for c in detected_classes:
                mapped = CIC_LABEL_MAP.get(c.strip().lower())
                if mapped:
                    if mapped not in supported_classes:
                        supported_classes.append(mapped)
                else:
                    unsupported_classes.append(c)

        # Count Infs and NaNs
        num_cols = df.select_dtypes(include=[np.number]).columns
        inf_count = int(np.isinf(df[num_cols]).values.sum()) if len(num_cols) > 0 else 0
        nan_count = int(df.isna().values.sum())

        is_compatible = len(missing) == 0
        notes = []
        rejection_reason = None

        if is_compatible:
            notes.append("All 39 canonical CIC IoT 2023 flow features are present in valid format.")
        else:
            notes.append(f"Missing {len(missing)} of 39 mandatory features: {missing[:5]}")
            rejection_reason = (
                f"CIC IoT 2023 schema validation failed: Missing {len(missing)} mandatory features. "
                "The FLMLP model strictly forbids arbitrary zero-imputation of missing structural flow parameters."
            )

        return AdapterValidationResult(
            dataset_type=self.dataset_type,
            dataset_name=self.display_name,
            is_compatible_with_flmlp=is_compatible,
            matched_features=matched,
            missing_mandatory_features=missing,
            detected_columns=list(df.columns),
            detected_label_column=label_col,
            detected_classes=detected_classes,
            supported_classes=supported_classes,
            unsupported_classes=unsupported_classes,
            row_count=len(df),
            column_count=len(df.columns),
            infinite_values_count=inf_count,
            nan_values_count=nan_count,
            notes=notes,
            rejection_reason=rejection_reason,
        )

    def align_and_preprocess(
        self,
        df: pd.DataFrame,
        scaler: Any = None,
    ) -> Tuple[np.ndarray, Optional[List[str]], AdapterValidationResult]:
        validation = self.validate_schema(df)
        if not validation.is_compatible_with_flmlp:
            raise DatasetCompatibilityError(validation.rejection_reason or "Dataset is incompatible with FLMLP model.")

        col_map_lower = {c.strip().lower(): c for c in df.columns}
        aligned_df = pd.DataFrame(index=df.index)

        for col in CANONICAL_39_FEATURES:
            source_col = col if col in df.columns else col_map_lower[col.lower()]
            aligned_df[col] = pd.to_numeric(df[source_col], errors="coerce")

        # Sanitize +/- inf and extreme numbers
        vals = aligned_df.to_numpy(dtype=np.float64)
        clean_vals = np.where(np.isinf(vals) | (np.abs(vals) > 1e300), np.nan, vals)
        col_medians = np.nanmedian(clean_vals, axis=0)
        col_medians = np.nan_to_num(col_medians, nan=0.0)

        nan_mask = np.isnan(clean_vals)
        clean_vals[nan_mask] = np.take(col_medians, np.where(nan_mask)[1])

        clean_df = pd.DataFrame(clean_vals, columns=CANONICAL_39_FEATURES, index=df.index)

        # Scale features
        if scaler is not None:
            X_scaled = scaler.transform(clean_df).astype(np.float32)
        else:
            X_scaled = clean_df.to_numpy(dtype=np.float32)

        # Extract normalized labels if label column is present
        actual_labels = None
        if validation.detected_label_column:
            raw_labels = df[validation.detected_label_column].tolist()
            actual_labels = []
            for l in raw_labels:
                if l is None or pd.isna(l):
                    actual_labels.append(None)
                else:
                    norm = CIC_LABEL_MAP.get(str(l).strip().lower())
                    actual_labels.append(norm if norm else str(l))

        return X_scaled, actual_labels, validation
