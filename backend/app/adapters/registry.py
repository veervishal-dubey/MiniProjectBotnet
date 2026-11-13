import logging
from typing import Dict, List, Optional, Type, Any, Tuple
import pandas as pd

from app.adapters.base import (
    BaseDatasetAdapter,
    DatasetType,
    AdapterValidationResult,
    DatasetCompatibilityError,
)
from app.adapters.cic_iot_2023 import CICIoT2023Adapter
from app.adapters.edge_iiotset import EdgeIIoTsetAdapter
from app.adapters.n_iot import NIoTAdapter

logger = logging.getLogger(__name__)


class DatasetAdapterRegistry:
    """
    Registry for network traffic dataset adapters.
    Automatically detects dataset format from column headers and returns the matching adapter.
    """

    def __init__(self):
        self._adapters: List[BaseDatasetAdapter] = [
            CICIoT2023Adapter(),
            EdgeIIoTsetAdapter(),
            NIoTAdapter(),
        ]

    def list_adapters(self) -> List[Dict[str, Any]]:
        """Returns details and FLMLP compatibility status of all registered adapters."""
        return [
            {
                "dataset_type": a.dataset_type.value,
                "display_name": a.display_name,
                "supported_by_flmlp": (a.dataset_type == DatasetType.CIC_IOT_2023),
                "expected_features_count": 39 if a.dataset_type == DatasetType.CIC_IOT_2023 else (115 if a.dataset_type == DatasetType.N_IOT else 61),
                "notes": (
                    "Fully compatible with production 39-feature FLMLP model and 7 canonical threat classes."
                    if a.dataset_type == DatasetType.CIC_IOT_2023
                    else "Recognized dataset schema. Requires dedicated model training; incompatible with current 39-feature FLMLP model."
                ),
            }
            for a in self._adapters
        ]

    def get_adapter_by_type(self, dataset_type: str) -> Optional[BaseDatasetAdapter]:
        for a in self._adapters:
            if a.dataset_type.value.lower() == dataset_type.lower():
                return a
        return None

    def detect_adapter(self, df: pd.DataFrame) -> Tuple[BaseDatasetAdapter, AdapterValidationResult]:
        """
        Inspects DataFrame headers and features to determine the appropriate adapter.
        Returns the chosen adapter and its schema validation report.
        """
        # Try specific adapters in priority order
        for adapter in self._adapters:
            if adapter.identify(df):
                logger.info(f"Dataset identified as {adapter.display_name}")
                validation = adapter.validate_schema(df)
                return adapter, validation

        # Default fallback: evaluate against CIC IoT 2023 canonical schema
        default_adapter = self._adapters[0]
        validation = default_adapter.validate_schema(df)
        return default_adapter, validation


# Global singleton instance
adapter_registry = DatasetAdapterRegistry()
