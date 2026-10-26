from pathlib import Path

import joblib
import pandas as pd

from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder


BACKEND_DIR = Path(__file__).resolve().parents[2]
DATASET_DIR = BACKEND_DIR / "storage" / "datasets"
MODEL_DIR = BACKEND_DIR / "storage" / "models"

POSITIVE_LABELS = {
    "yes", "y", "true", "1", "left", "attrited"
}
NEGATIVE_LABELS = {
    "no", "n", "false", "0", "stayed", "retained"
}

IDENTIFIER_COLUMNS = {
    "id",
    "employeeid",
    "employeenumber",
    "recordid",
}


def prepare_dataset(
    dataframe: pd.DataFrame,
    target_column: str,
):
    if target_column not in dataframe.columns:
        raise ValueError(
            f"Target column '{target_column}' was not found"
        )

    dataframe = dataframe.copy()
    dataframe.columns = [
        str(column).strip()
        for column in dataframe.columns
    ]

    dataframe = dataframe.drop_duplicates(keep="first")

    target_values = dataframe[target_column]

    valid_target = (
        target_values.notna()
        & target_values.astype(str).str.strip().ne("")
    )

    dataframe = dataframe.loc[valid_target].copy()

    if len(dataframe) < 20:
        raise ValueError(
            "At least 20 valid rows are required for model training"
        )

    normalized_target = (
        dataframe[target_column]
        .astype(str)
        .str.strip()
        .str.lower()
    )

    unique_labels = sorted(normalized_target.unique())

    if len(unique_labels) != 2:
        raise ValueError(
            "Attrition training requires exactly two target classes"
        )

    known_labels = set(unique_labels)

    if (
        known_labels.issubset(
            POSITIVE_LABELS | NEGATIVE_LABELS
        )
        and any(label in POSITIVE_LABELS for label in unique_labels)
        and any(label in NEGATIVE_LABELS for label in unique_labels)
    ):
        target_mapping = {
            label: (
                1 if label in POSITIVE_LABELS else 0
            )
            for label in unique_labels
        }
    else:
        target_mapping = {
            unique_labels[0]: 0,
            unique_labels[1]: 1,
        }

    y = normalized_target.map(target_mapping).astype(int)

    if y.value_counts().min() < 2:
        raise ValueError(
            "Each target class must contain at least two records"
        )

    X = dataframe.drop(columns=[target_column])

    # Ignore columns that only act as record identifiers.
    identifier_columns = [
        column
        for column in X.columns
        if column.strip().lower() in IDENTIFIER_COLUMNS
    ]

    if identifier_columns:
        X = X.drop(columns=identifier_columns)

    # Remove features without any usable values.
    X = X.dropna(axis=1, how="all")

    if X.shape[1] == 0:
        raise ValueError(
            "No usable feature columns were found"
        )

    return X, y, target_mapping


def train_attrition_model(
    csv_path: Path,
    target_column: str,
    dataset_id: int,
):
    dataframe = pd.read_csv(csv_path)

    X, y, target_mapping = prepare_dataset(
        dataframe,
        target_column,
    )

    numeric_columns = X.select_dtypes(
        include=["number"]
    ).columns.tolist()

    categorical_columns = [
        column
        for column in X.columns
        if column not in numeric_columns
    ]

    transformers = []

    if numeric_columns:
        numeric_pipeline = Pipeline(
            steps=[
                (
                    "imputer",
                    SimpleImputer(strategy="median"),
                )
            ]
        )

        transformers.append(
            (
                "numeric",
                numeric_pipeline,
                numeric_columns,
            )
        )

    if categorical_columns:
        categorical_pipeline = Pipeline(
            steps=[
                (
                    "imputer",
                    SimpleImputer(
                        strategy="most_frequent"
                    ),
                ),
                (
                    "encoder",
                    OneHotEncoder(
                        handle_unknown="ignore"
                    ),
                ),
            ]
        )

        transformers.append(
            (
                "categorical",
                categorical_pipeline,
                categorical_columns,
            )
        )

    preprocessor = ColumnTransformer(
        transformers=transformers,
        remainder="drop",
    )

    model = Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            (
                "classifier",
                RandomForestClassifier(
                    n_estimators=200,
                    min_samples_leaf=2,
                    class_weight="balanced",
                    random_state=42,
                ),
            ),
        ]
    )

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.20,
        random_state=42,
        stratify=y,
    )

    # Evaluate on held-out data before fitting the final model.
    model.fit(X_train, y_train)

    predictions = model.predict(X_test)
    probabilities = model.predict_proba(X_test)[:, 1]

    metrics = {
        "accuracy": round(
            float(accuracy_score(y_test, predictions)), 4
        ),
        "precision": round(
            float(
                precision_score(
                    y_test,
                    predictions,
                    zero_division=0,
                )
            ),
            4,
        ),
        "recall": round(
            float(
                recall_score(
                    y_test,
                    predictions,
                    zero_division=0,
                )
            ),
            4,
        ),
        "f1_score": round(
            float(
                f1_score(
                    y_test,
                    predictions,
                    zero_division=0,
                )
            ),
            4,
        ),
        "roc_auc": round(
            float(roc_auc_score(y_test, probabilities)), 4
        ),
        "training_rows": int(len(X_train)),
        "testing_rows": int(len(X_test)),
        "class_distribution": {
            str(key): int(value)
            for key, value in y.value_counts().items()
        },
        "target_mapping": target_mapping,
        "model_version": f"random-forest-v1-dataset-{dataset_id}",
    }

    # Fit the final pipeline on all valid data.
    model.fit(X, y)

    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    artifact_name = (
        f"attrition_dataset_{dataset_id}.joblib"
    )
    artifact_path = MODEL_DIR / artifact_name

    joblib.dump(model, artifact_path)

    metrics["artifact"] = artifact_name

    return {
        "metrics": metrics,
        "feature_columns": [
            str(column) for column in X.columns
        ],
        "valid_rows": int(len(X)),
    }