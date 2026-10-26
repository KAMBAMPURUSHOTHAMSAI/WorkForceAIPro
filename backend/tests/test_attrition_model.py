"""Unit tests for attrition dataset validation and model artifact generation."""
from pathlib import Path

import pandas as pd
import pytest

from app.ml import attrition


def balanced_dataframe(rows: int = 40) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "EmployeeNumber": range(1, rows + 1),
            "Age": [22 + (index % 25) for index in range(rows)],
            "MonthlyIncome": [2200 + (index * 175) for index in range(rows)],
            "OverTime": ["Yes" if index % 3 == 0 else "No" for index in range(rows)],
            "Attrition": ["No"] * (rows // 2) + ["Yes"] * (rows - rows // 2),
        }
    )


def test_prepare_dataset_maps_yes_no_and_drops_identifier_features():
    features, target, mapping = attrition.prepare_dataset(balanced_dataframe(), "Attrition")
    assert len(features) == 40
    assert len(target) == 40
    assert "EmployeeNumber" not in features.columns
    assert mapping["yes"] == 1
    assert mapping["no"] == 0


def test_prepare_dataset_rejects_missing_target_column():
    with pytest.raises(ValueError, match="was not found"):
        attrition.prepare_dataset(balanced_dataframe(), "MissingTarget")


def test_prepare_dataset_rejects_fewer_than_twenty_valid_rows():
    with pytest.raises(ValueError, match="At least 20 valid rows"):
        attrition.prepare_dataset(balanced_dataframe(18), "Attrition")


def test_prepare_dataset_rejects_single_target_class():
    frame = balanced_dataframe()
    frame["Attrition"] = "No"
    with pytest.raises(ValueError, match="exactly two target classes"):
        attrition.prepare_dataset(frame, "Attrition")


def test_prepare_dataset_rejects_no_usable_feature_columns():
    frame = pd.DataFrame({"EmployeeNumber": range(1, 41), "Attrition": ["No"] * 20 + ["Yes"] * 20})
    with pytest.raises(ValueError, match="No usable feature columns"):
        attrition.prepare_dataset(frame, "Attrition")


def test_model_training_creates_metrics_and_artifact(tmp_path, monkeypatch):
    csv_path = tmp_path / "training.csv"
    balanced_dataframe().to_csv(csv_path, index=False)
    model_dir = tmp_path / "models"
    monkeypatch.setattr(attrition, "MODEL_DIR", model_dir)

    result = attrition.train_attrition_model(csv_path, "Attrition", dataset_id=987)

    metrics = result["metrics"]
    assert result["valid_rows"] == 40
    assert metrics["training_rows"] == 32
    assert metrics["testing_rows"] == 8
    assert 0 <= metrics["accuracy"] <= 1
    assert 0 <= metrics["precision"] <= 1
    assert 0 <= metrics["recall"] <= 1
    assert 0 <= metrics["f1_score"] <= 1
    assert 0 <= metrics["roc_auc"] <= 1
    assert metrics["artifact"] == "attrition_dataset_987.joblib"
    assert (model_dir / metrics["artifact"]).is_file()
    assert "EmployeeNumber" not in result["feature_columns"]
