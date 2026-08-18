from datetime import date, time

from app.services.roster_text_import import parse_roster_text, parse_time_token


def test_parse_time_token():
    assert parse_time_token("7.5") == time(7, 30)
    assert parse_time_token("23.5") == time(23, 30)
    assert parse_time_token("16") == time(16, 0)


def test_parse_duty_trial_and_note():
    text = "8月1 周六\n16-23.5嘉岚（卫生）6.5\n8-13林航（试工水果位）5\n总：72.5"
    result = parse_roster_text(text, year=2026)
    day = result["days"][0]
    assert day["work_date"] == date(2026, 8, 1)
    by_name = {e["name"]: e for e in day["entries"]}
    assert by_name["嘉岚"]["start_time"] == time(16, 0)
    assert by_name["嘉岚"]["end_time"] == time(23, 30)
    assert by_name["嘉岚"]["note"] == "卫生"
    assert by_name["林航"]["is_trial"] is True
    assert "试工" in (by_name["林航"]["note"] or "")


def test_parse_shift_change_paren():
    text = "8月4 周二\n8.5-19苑菱（早值、检查效期）10（10-23.5）"
    day = parse_roster_text(text, year=2026)["days"][0]
    e = day["entries"][0]
    assert e["name"] == "苑菱"
    assert e["start_time"] == time(10, 0)
    assert e["end_time"] == time(23, 30)


def test_parse_rest_and_ot_line():
    text = "8月4 周二\n继鹏22-23.5\n休息：梓野 锶锴 继鹏"
    day = parse_roster_text(text, year=2026)["days"][0]
    jp = next(e for e in day["entries"] if e["name"] == "继鹏")
    assert jp["status"] == "rest"
    assert jp["ot_start_time"] == time(22, 0)
    assert jp["ot_end_time"] == time(23, 30)
    assert jp["start_time"] is None


def test_parse_support_missing_times_error():
    text = "8月4 周二\n支援上社：洁怡"
    day = parse_roster_text(text, year=2026)["days"][0]
    e = day["entries"][0]
    assert e["status"] == "support"
    assert e["note"] == "上社"
    assert "missing_support_times" in e["errors"]


def test_parse_support_with_times():
    text = "8月14 周五\n支援：洁慧 12-21"
    day = parse_roster_text(text, year=2026)["days"][0]
    e = day["entries"][0]
    assert e["status"] == "support"
    assert e["start_time"] == time(12, 0)
    assert e["end_time"] == time(21, 0)
    assert e["errors"] == []


def test_parse_day_note():
    text = "8月2 周日 团餐47\n8-16苑菱（早值）7.5"
    day = parse_roster_text(text, year=2026)["days"][0]
    assert day["day_note"] == "团餐47"


def test_parse_leave_splits_names():
    text = "8月3 周一\n请假：洁惠、嘉岚，林航"
    day = parse_roster_text(text, year=2026)["days"][0]
    by_name = {e["name"]: e for e in day["entries"]}
    assert set(by_name) == {"洁惠", "嘉岚", "林航"}
    assert by_name["洁惠"]["status"] == "leave"
    assert by_name["洁惠"]["start_time"] is None


def test_ignore_empty_and_total_variants():
    text = "8月1 周六\n\n16-23.5嘉岚（卫生）6.5\n总:72.5\n总：80+（试工）4\n"
    result = parse_roster_text(text, year=2026)
    day = result["days"][0]
    assert [e["name"] for e in day["entries"]] == ["嘉岚"]
    assert result["unparsed_lines"] == []


def test_unparsed_lines_collected():
    text = "8月1 周六\n这不是排班\n16-23.5嘉岚（卫生）6.5"
    result = parse_roster_text(text, year=2026)
    assert "这不是排班" in result["unparsed_lines"]
    assert result["days"][0]["entries"][0]["name"] == "嘉岚"


def test_ot_only_then_duty_keeps_ot():
    text = "8月5 周三\n嘉岚22-23.5\n16-23.5嘉岚（卫生）6.5"
    day = parse_roster_text(text, year=2026)["days"][0]
    e = day["entries"][0]
    assert e["status"] == "on_duty"
    assert e["start_time"] == time(16, 0)
    assert e["end_time"] == time(23, 30)
    assert e["ot_start_time"] == time(22, 0)
    assert e["ot_end_time"] == time(23, 30)


def test_invalid_time_range_error():
    text = "8月1 周六\n23-8嘉岚（卫生）"
    day = parse_roster_text(text, year=2026)["days"][0]
    assert "invalid_time_range" in day["entries"][0]["errors"]


AUG1_SAMPLE = """8月1 周六 完成5号前自检表+QSE自检表
16-23.5嘉岚（卫生）6.5
8-16梓野（早值、检查效期）7.5
8-13林航（试工水果位）5
总：72.5+（试工）4
"""


def test_gold_sample_aug1():
    result = parse_roster_text(AUG1_SAMPLE, year=2026)
    day = result["days"][0]
    assert day["work_date"] == date(2026, 8, 1)
    assert day["day_note"] == "完成5号前自检表+QSE自检表"
    by_name = {e["name"]: e for e in day["entries"]}
    assert set(by_name) == {"嘉岚", "梓野", "林航"}
    assert by_name["嘉岚"]["start_time"] == time(16, 0)
    assert by_name["嘉岚"]["end_time"] == time(23, 30)
    assert by_name["嘉岚"]["note"] == "卫生"
    assert by_name["梓野"]["status"] == "on_duty"
    assert by_name["林航"]["is_trial"] is True
    assert result["unparsed_lines"] == []


AUG4_SAMPLE = """8月4 周二
8.5-19苑菱（早值、检查效期）10（10-23.5）
继鹏22-23.5
休息：梓野 锶锴 继鹏
支援上社：洁怡
总：80
"""


def test_gold_sample_aug4_shift_change_and_ot():
    result = parse_roster_text(AUG4_SAMPLE, year=2026)
    day = result["days"][0]
    assert day["work_date"] == date(2026, 8, 4)
    by_name = {e["name"]: e for e in day["entries"]}
    assert set(by_name) == {"苑菱", "继鹏", "梓野", "锶锴", "洁怡"}
    assert by_name["苑菱"]["start_time"] == time(10, 0)
    assert by_name["苑菱"]["end_time"] == time(23, 30)
    assert by_name["苑菱"]["note"] == "早值、检查效期"
    assert by_name["继鹏"]["status"] == "rest"
    assert by_name["继鹏"]["ot_start_time"] == time(22, 0)
    assert by_name["继鹏"]["ot_end_time"] == time(23, 30)
    assert by_name["继鹏"]["start_time"] is None
    assert by_name["洁怡"]["status"] == "support"
    assert "missing_support_times" in by_name["洁怡"]["errors"]
    assert result["unparsed_lines"] == []
