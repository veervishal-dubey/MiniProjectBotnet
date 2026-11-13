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

N_IOT_PREFIXES = ["MI_dir_", "H_L", "HH_L", "HH_jit_L", "HpHp_L"]


class NIoTAdapter(BaseDatasetAdapter):
    """
    Adapter for the N-BaIoT (Network-based IoT Botnet Dataset) / N-IoT dataset.
    Extracts stream statistics across decay windows (100ms, 500ms, 1.5s, 10s, 1min)
    and strictly enforces architectural validation against the 39-feature FLMLP model.
    """

    @property
    def dataset_type(self) -> DatasetType:
        return DatasetType.N_IOT

    @property
    def display_name(self) -> str:
        return "N-BaIoT / N-IoT (Decay Stream Botnet Dataset)"

    def identify(self, df: pd.DataFrame) -> bool:
        """
        Identifies N-IoT based on streaming decay window prefix patterns (MI_dir, H_L, HH_L, HpHp_L).
        """
        decay_cols = 0
        for col in df.columns:
            if any(col.startswith(p) for p in N_IOT_PREFIXES):
                decay_cols += 1
        return decay_cols >= 5 or len(df.columns) in [115, 116]

    def validate_schema(self, df: pd.DataFrame) -> AdapterValidationResult:
        col_map_lower = {c.strip().lower(): c for c in df.columns}

        # Check label column
        label_col = None
        for cand in ["label", "Label", "attack", "attack_type", "class", "target"]:
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
            f"N-BaIoT / N-IoT is structurally incompatible with the loaded 39-feature FLMLP model. "
            f"N-BaIoT features represent 115 continuous exponential decay window statistics (100ms - 1min windows), "
            f"not discrete TCP/IP header flag counts. All 39 canonical CIC IoT features are missing. "
            "Inference is safely rejected to uphold scientific integrity and prevent arbitrary zero-imputation."
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
                "Successfully identified N-BaIoT 115-stream-feature decay signature.",
                "Inference blocked: N-BaIoT requires a dedicated 115-input model architecture.",
                "Anti-hallucination policy enforced: zero-imputation of missing header flags prohibited.",
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

