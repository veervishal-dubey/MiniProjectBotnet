import pytest
from app.services.validator import (
    validate_csv_content,
    detect_duplicate_headers,
    suggest_label_columns,
)


def test_empty_file_validation(empty_csv_bytes):
    report = validate_csv_content(empty_csv_bytes, file_name="empty.csv")
    assert not report.is_valid
    assert "empty" in report.error_message.lower()
    assert report.total_rows == 0


def test_malformed_csv_detection():
    # Content with invalid bytes or severe parse corruption
    bad_bytes = b"col1,col2\n\"unclosed quote\n"
    report = validate_csv_content(bad_bytes, file_name="bad.csv")
    assert not report.is_valid or report.total_rows == 0 or report.error_message is not None


def test_valid_iot_csv_validation(sample_csv_bytes):
    report = validate_csv_content(sample_csv_bytes, file_name="sample_iot.csv")
    assert report.is_valid
    assert report.total_rows == 12
    assert report.total_columns == 10
    assert "packet_length" in report.numerical_columns
    assert "protocol" in report.categorical_columns
    assert "is_constant" in report.constant_columns
    assert "label" in report.suggested_label_columns
    assert report.duplicate_row_count == 0


def test_dirty_csv_missing_and_duplicates(dirty_csv_bytes):
    report = validate_csv_content(dirty_csv_bytes, file_name="dirty_iot.csv")
    assert report.is_valid
    assert report.total_rows == 6
    # Rows 1, 3, 5 are duplicates in dirty_csv_bytes
    assert report.duplicate_row_count >= 2
    assert report.missing_values_total >= 2


def test_duplicate_headers_detection():
    header_line = "flow_id,packet_rate,byte_rate,packet_rate,label"
    duplicates = detect_duplicate_headers(header_line)
    assert "packet_rate" in duplicates
    assert len(duplicates) == 1


def test_class_distribution_analysis(sample_csv_bytes):
    report = validate_csv_content(
        sample_csv_bytes,
        file_name="sample_iot.csv",
        selected_label_column="label",
    )
    assert report.class_distribution is not None
    assert len(report.class_distribution) == 3
    classes = {item.class_name: item for item in report.class_distribution}
    assert "Benign" in classes
    assert classes["Benign"].count == 6
    assert not classes["Benign"].is_malicious
    assert "Mirai" in classes
    assert classes["Mirai"].is_malicious


def test_immutability_of_source_content(sample_csv_bytes):
    original_copy = bytes(sample_csv_bytes)
    _ = validate_csv_content(sample_csv_bytes, file_name="test.csv")
    assert sample_csv_bytes == original_copy
