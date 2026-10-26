"""Unit tests for CSV, XLSX and PDF report export helpers."""
import csv
from datetime import date, datetime
from decimal import Decimal
from io import BytesIO, StringIO

import pytest
from openpyxl import load_workbook

from app.services.report_export import export_report, export_value


COLUMNS = [("name", "Employee Name"), ("salary", "Monthly Salary"), ("joined", "Date Joined")]
ROWS = [{"name": "Sai", "salary": Decimal("37500.00"), "joined": date(2026, 10, 21)}]


def test_export_value_serializes_common_types():
    assert export_value(None) == ""
    assert export_value(Decimal("10.50")) == "10.50"
    assert export_value(date(2026, 10, 21)) == "2026-10-21"
    assert export_value({"ok": True}) == '{"ok": true}'


def test_csv_export_includes_header_data_and_download_filename():
    response = export_report("Employees", "employees", COLUMNS, ROWS, "csv")
    assert response.media_type.startswith("text/csv")
    assert 'filename="employees.csv"' in response.headers["content-disposition"]
    text = response.body.decode("utf-8-sig")
    rows = list(csv.reader(StringIO(text)))
    assert rows[0] == ["Employee Name", "Monthly Salary", "Date Joined"]
    assert rows[1] == ["Sai", "37500.00", "2026-10-21"]


def test_xlsx_export_is_valid_workbook_with_rows():
    response = export_report("Employees", "employees", COLUMNS, ROWS, "xlsx")
    workbook = load_workbook(BytesIO(response.body), read_only=True)
    sheet = workbook["Report"]
    assert list(sheet.values)[0] == ("Employee Name", "Monthly Salary", "Date Joined")
    assert list(sheet.values)[1] == ("Sai", "37500.00", "2026-10-21")
    workbook.close()


def test_pdf_export_returns_pdf_payload():
    response = export_report("Employees", "employees", COLUMNS, ROWS, "pdf")
    assert response.media_type == "application/pdf"
    assert response.body.startswith(b"%PDF")
    assert 'filename="employees.pdf"' in response.headers["content-disposition"]


def test_export_rejects_unsupported_format():
    with pytest.raises(ValueError, match="Unsupported export format"):
        export_report("Employees", "employees", COLUMNS, ROWS, "docx")
