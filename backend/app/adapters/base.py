import abc
from enum import Enum
from typing import Dict, List, Optional, Tuple, Any
import numpy as np
import pandas as pd
from pydantic import BaseModel, Field


class DatasetType(str, Enum):
    CIC_IOT_2023 = "cic_iot_2023"
    EDGE_IIOTSET = "edge_iiotset"
    N_IOT = "n_iot"
    UNKNOWN = "unknown"


class DatasetCompatibilityError(ValueError):
    """Raised when an uploaded dataset cannot be reliably mapped to the active model schema."""
    pass


class AdapterValidationResult(BaseModel):
    dataset_type: DatasetType
    dataset_name: str
    is_compatible_with_flmlp: bool
    matched_features: List[str] = Field(default_factory=list)
    missing_mandatory_features: List[str] = Field(default_factory=list)
    detected_columns: List[str] = Field(default_factory=list)
    detected_label_column: Optional[str] = None
    detected_classes: List[str] = Field(default_factory=list)
    supported_classes: List[str] = Field(default_factory=list)
    unsupported_classes: List[str] = Field(default_factory=list)
    row_count: int = 0
    column_count: int = 0
    infinite_values_count: int = 0
    nan_values_count: int = 0
    notes: List[str] = Field(default_factory=list)
    rejection_reason: Optional[str] = None


class BaseDatasetAdapter(abc.ABC):
    """
    Abstract base class for network traffic dataset adapters.
    Responsible for dataset identification, schema validation, leak-free preprocessing,
    and canonical alignment to the trained FLMLP PyTorch model input specification.
    """

    @property
    @abc.abstractmethod
    def dataset_type(self) -> DatasetType:
        """Returns the dataset enumeration type."""
        pass

    @property
    @abc.abstractmethod
    def display_name(self) -> str:
        """Returns the human-readable dataset name."""
        pass

    @abc.abstractmethod
    def identify(self, df: pd.DataFrame) -> bool:
        """
        Determines whether the DataFrame matches this dataset's specific column schema.
        Returns True if confident match, False otherwise.
        """
        pass

    @abc.abstractmethod
    def validate_schema(self, df: pd.DataFrame) -> AdapterValidationResult:
        """
        Validates column presence, datatypes, missing/infinite values, and target labels.
        Returns AdapterValidationResult describing compatibility with the model.
        """
        pass

    @abc.abstractmethod
    def align_and_preprocess(
        self,
        df: pd.DataFrame,
        scaler: Any = None,
    ) -> Tuple[np.ndarray, Optional[List[str]], AdapterValidationResult]:
        """
        Transforms raw dataset records into the canonical 39-feature scaled matrix.
        Returns:
            - X_scaled: np.ndarray of shape (N, 39) with float32 values.
            - actual_labels: Optional list of normalized canonical class labels if ground truth was present.
            - validation_report: AdapterValidationResult with audit diagnostics.
        Raises:
            - DatasetCompatibilityError if mandatory features cannot be mapped without fabricating data.
        """
        pass

