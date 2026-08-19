from datetime import date
from io import BytesIO

from openpyxl import load_workbook

from app.services.hr_excel_export import build_export_workbook, export_filename
from app.services.hr_excel_layout import (
    DAY1_COL,
    LABEL_COL,
    NAME_COL,
    PERSON_START_ROW,
    POSITION_COL,
    ROWS_PER_PERSON,
    SEQ_COL,
    SUPPORT_VALUE_COL,
    WEEKDAY_ROW,
)


def test_export_filename():
    assert export_filename("东圃地铁站", 7) == "东圃地铁站店7月份.xlsx"


def test_february_headers_and_blank_extra_days(db):
    raw = build_export_workbook(db, 2026, 2)
    ws = load_workbook(BytesIO(raw)).active
    day1_col = DAY1_COL + 1
    assert ws.cell(1, day1_col).value == 1
    # 2026-02-01 周日
    assert ws.cell(WEEKDAY_ROW + 1, day1_col).value == "周日"
    assert ws.cell(1, day1_col + 27).value == 28
    assert ws.cell(1, day1_col + 28).value in (None, "")
    assert ws.cell(WEEKDAY_ROW + 1, day1_col + 28).value in (None, "")


def test_only_registered_people_in_sort_order(client, db):
    zhang = client.post("/api/employees", json={"name": "张三"}).json()
    li = client.post("/api/employees", json={"name": "李四"}).json()
    client.put("/api/employees/reorder", json={"ids": [li["id"], zhang["id"]]})
    client.patch(
        f"/api/employees/{li['id']}",
        json={"export_name": "李四全", "position": "全职"},
    )
    client.post(
        "/api/entries",
        json={
            "work_date": "2026-08-01",
            "name": "李四",
            "start_time": "07:30",
            "end_time": "16:00",
        },
    )
    # 张三当月无登记
    raw = build_export_workbook(db, 2026, 8)
    ws = load_workbook(BytesIO(raw)).active
    first_name_row = PERSON_START_ROW + 1  # openpyxl 1-based
    assert ws.cell(first_name_row, NAME_COL + 1).value == "李四全"
    assert ws.cell(first_name_row, POSITION_COL + 1).value == "全职"
    assert ws.cell(first_name_row, SEQ_COL + 1).value == 1
    # 下一人员上班行（空槽）
    second_on_row = PERSON_START_ROW + ROWS_PER_PERSON + 1
    assert ws.cell(second_on_row, NAME_COL + 1).value in (None, "")
    assert ws.cell(second_on_row, SEQ_COL + 1).value in (None, "")
    assert ws.cell(second_on_row, LABEL_COL + 1).value == "上班"
    assert ws.cell(second_on_row + 1, LABEL_COL + 1).value == "下班"


def test_duty_cells_and_support_column(client, db):
    client.post(
        "/api/entries",
        json={
            "work_date": "2026-08-01",
            "name": "苑菱",
            "start_time": "07:30",
            "end_time": "16:00",
            "ot_start_time": "22:00",
            "ot_end_time": "23:30",
        },
    )
    raw = build_export_workbook(db, 2026, 8)
    ws = load_workbook(BytesIO(raw)).active
    on_cell = ws.cell(PERSON_START_ROW + 1, DAY1_COL + 1).value
    off_cell = ws.cell(PERSON_START_ROW + 2, DAY1_COL + 1).value
    assert on_cell in (8, 8.0)
    assert off_cell in (17.5, 17.50)
    # 无支援 → 支援列空
    assert ws.cell(PERSON_START_ROW + 1, SUPPORT_VALUE_COL + 1).value in (None, "")


def test_rest_with_ot_and_pure_rest(client, db):
    client.post(
        "/api/entries",
        json={
            "work_date": "2026-08-01",
            "name": "甲",
            "status": "rest",
            "ot_start_time": "22:00",
            "ot_end_time": "23:30",
        },
    )
    client.post(
        "/api/entries",
        json={
            "work_date": "2026-08-02",
            "name": "甲",
            "status": "rest",
        },
    )
    raw = build_export_workbook(db, 2026, 8)
    ws = load_workbook(BytesIO(raw)).active
    on_row = PERSON_START_ROW + 1
    off_row = PERSON_START_ROW + 2
    # 休息+加班：上下班为加班起止小时
    assert ws.cell(on_row, DAY1_COL + 1).value in (22, 22.0)
    assert ws.cell(off_row, DAY1_COL + 1).value in (23.5, 23.50)
    # 纯休息：空
    assert ws.cell(on_row, DAY1_COL + 1 + 1).value in (None, "")
    assert ws.cell(off_row, DAY1_COL + 1 + 1).value in (None, "")


def test_support_day_and_support_column(client, db):
    client.post(
        "/api/entries",
        json={
            "work_date": "2026-08-05",
            "name": "乙",
            "status": "support",
            "start_time": "11:00",
            "end_time": "19:00",
        },
    )
    raw = build_export_workbook(db, 2026, 8)
    ws = load_workbook(BytesIO(raw)).active
    on_row = PERSON_START_ROW + 1
    off_row = PERSON_START_ROW + 2
    day5_col = DAY1_COL + 1 + 4  # 公历 5 日
    # 支援日与到岗同样填上下班
    assert ws.cell(on_row, day5_col).value in (11.5, 11.50)
    assert ws.cell(off_row, day5_col).value in (19, 19.0)
    # 支援列 = 有效工时 8-0.5=7.5
    support_val = ws.cell(on_row, SUPPORT_VALUE_COL + 1).value
    assert support_val in (7.5, 7.50)


def test_store_name_and_month_anchor(db):
    raw = build_export_workbook(db, 2026, 8)
    ws = load_workbook(BytesIO(raw)).active
    from app.services.hr_excel_layout import MONTH_DATE_COL, STORE_COL, STORE_ROW

    assert ws.cell(STORE_ROW + 1, STORE_COL + 1).value == "东圃地铁站"
    month_val = ws.cell(STORE_ROW + 1, MONTH_DATE_COL + 1).value
    if hasattr(month_val, "date"):
        month_val = month_val.date()
    assert month_val == date(2026, 8, 1)
