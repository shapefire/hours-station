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
RATE_COL = 37  # 「Rate」→ openpyxl 列 AL
TRIPLE_PAY_COL = 38  # 「三薪」→ openpyxl 列 AM

# 模板下区 COUNTIF 口径（AL/AM 列）
RATE_COUNT_VALUE = 22.5
TRIPLE_PAY_COUNT_VALUE = 8.5

# 人员区
PERSON_START_ROW = 2
ROWS_PER_PERSON = 2
SEQ_COL, NAME_COL, POSITION_COL, LABEL_COL = 0, 1, 2, 3
TEMPLATE_PERSON_SLOTS = 15  # 序号 1–15 成对「上班/下班」行，AJ 列带公式
TEMPLATE_EXTENDED_SLOTS = 23  # 模板预置到序号 23（rows 33–48），AJ 合并但无公式

# 「支援」表头文字在 openpyxl AN3（人员槽第 1 个 on 行）。
# 导出数值口径：
# - 第 1 位人员：写入 AN4（该人员的 off 行，避免覆盖 AN3 标题）
# - 第 2 位及后续：写入各自的 on 行（第一行）的 AN 列
SUPPORT_VALUE_COL = 39
