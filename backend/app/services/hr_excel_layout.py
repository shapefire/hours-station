"""人事工时 Excel 导出：模板路径与 0-indexed 行列常量。

坐标来自样例表转换后的 `hours_export.xlsx` 实测（见 task-4-report）。
"""

from pathlib import Path

TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "templates" / "hours_export.xlsx"

# 表头
STORE_ROW, STORE_COL = 0, 2
MONTH_DATE_ROW, MONTH_DATE_COL = 0, 3
DAY_HEADER_ROW = 0
WEEKDAY_ROW = 1
DAY1_COL = 4  # 公历 1 日 → openpyxl 列 E
TOTAL_HEADER_COL = 35  # 「總計」→ openpyxl 列 AJ

# 人员区
PERSON_START_ROW = 2
ROWS_PER_PERSON = 2
SEQ_COL, NAME_COL, POSITION_COL, LABEL_COL = 0, 1, 2, 3
TEMPLATE_PERSON_SLOTS = 15  # 序号 1–15 成对「上班/下班」行

# 「支援」表头文字在 0-indexed (2, 39)（openpyxl AN3），数值写相邻空列 AO
SUPPORT_VALUE_COL = 40
