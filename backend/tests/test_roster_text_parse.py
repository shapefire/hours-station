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


def test_parse_duty_dai_shi_gong_is_note_not_trial():
    text = "8月17 周一\n11.5-19梓野（带试工吧台）6.5\n12-18飞云（香雪试工）吧台6"
    day = parse_roster_text(text, year=2026)["days"][0]
    by_name = {e["name"]: e for e in day["entries"]}
    assert by_name["梓野"]["is_trial"] is False
    assert "带试工" in (by_name["梓野"]["note"] or "")
    assert by_name["飞云"]["is_trial"] is True
    assert "香雪试工" in (by_name["飞云"]["note"] or "")


def test_parse_shift_change_paren():
    text = "8月4 周二\n8.5-19苑菱（早值、检查效期）10（10-23.5）"
    day = parse_roster_text(text, year=2026)["days"][0]
    e = day["entries"][0]
    assert e["name"] == "苑菱"
    assert e["start_time"] == time(10, 0)
    assert e["end_time"] == time(23, 30)
    assert e["ot_start_time"] is None
    assert e["ot_end_time"] is None


def test_parse_duty_trailing_paren_after_main_is_ot():
    text = "8月4 周二\n8-16晓玲（制备位）7.5（22-23.5）"
    e = parse_roster_text(text, year=2026)["days"][0]["entries"][0]
    assert e["name"] == "晓玲"
    assert e["start_time"] == time(8, 0)
    assert e["end_time"] == time(16, 0)
    assert e["note"] == "制备位"
    assert e["ot_start_time"] == time(22, 0)
    assert e["ot_end_time"] == time(23, 30)


def test_parse_duty_trailing_paren_ot_multiple_people():
    text = """8月4 周二
8-16晓玲（制备位）7.5（22-23.5）
8-17佳博（水果位）8.5（22-23.5）"""
    by_name = {
        e["name"]: e for e in parse_roster_text(text, year=2026)["days"][0]["entries"]
    }
    for name in ("晓玲", "佳博"):
        assert by_name[name]["start_time"] == time(8, 0)
        assert by_name[name]["ot_start_time"] == time(22, 0)
        assert by_name[name]["ot_end_time"] == time(23, 30)
    assert by_name["晓玲"]["end_time"] == time(16, 0)
    assert by_name["佳博"]["end_time"] == time(17, 0)


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


def test_illegal_hour_token_does_not_raise():
    text = "8月1 周六\n25-26嘉岚（卫生）"
    result = parse_roster_text(text, year=2026)
    assert result["days"]
    day = result["days"][0]
    # either unparsed or entry error — must not raise
    if day["entries"]:
        assert "invalid_time_range" in day["entries"][0]["errors"]
    else:
        assert any("25-26" in line for line in result["unparsed_lines"])


def test_invalid_calendar_date_keeps_block_and_following_lines():
    text = "13月40 周一 备注\n8-16梓野（早值）7.5\n休息：苑菱"
    result = parse_roster_text(text, year=2026)
    assert len(result["days"]) == 1
    day = result["days"][0]
    assert "invalid_date" in day["errors"]
    by_name = {e["name"]: e for e in day["entries"]}
    assert "梓野" in by_name
    assert by_name["梓野"]["status"] == "on_duty"
    assert "苑菱" in by_name
    assert by_name["苑菱"]["status"] == "rest"
    assert "13月40" not in result["unparsed_lines"]


def test_rest_splits_ascii_comma():
    text = "8月1 周六\n休息：苑菱,梓野"
    day = parse_roster_text(text, year=2026)["days"][0]
    by_name = {e["name"]: e for e in day["entries"]}
    assert set(by_name) == {"苑菱", "梓野"}
    assert by_name["苑菱"]["status"] == "rest"
    assert by_name["梓野"]["status"] == "rest"


def test_md_date_line_vs_duty_line():
    text = "8-1 周六 来货\n8-16梓野（早值）7.5"
    result = parse_roster_text(text, year=2026)
    assert len(result["days"]) == 1
    day = result["days"][0]
    assert day["work_date"] == date(2026, 8, 1)
    assert day["day_note"] == "来货"
    assert day["entries"][0]["name"] == "梓野"
    assert day["entries"][0]["start_time"] == time(8, 0)
    assert day["entries"][0]["end_time"] == time(16, 0)
    assert result["unparsed_lines"] == []


def test_spaced_duty_not_parsed_as_md_date():
    """`9-16 继鹏` is a shift, not September 16."""
    text = """8月12   周三
8-16洁惠（早值、检查效期）7.5
7.5-16 梓野（制备位）8
7.5-16 洁怡（水果位）8
9-16 继鹏（协助后厨）6.5
7.5-13林航（香雪试工水果位）5.5
11-17晓愉5
12-17锶锴5
13-19佳佳6
14-20晓丹6
14.5-23.5晓玲（接制备）8.5
17-23.5小帅（晚值、检查效期）6.5
17-23.5家进6.5
"""
    result = parse_roster_text(text, year=2026)
    assert len(result["days"]) == 1
    day = result["days"][0]
    assert day["work_date"] == date(2026, 8, 12)
    by_name = {e["name"]: e for e in day["entries"]}
    assert set(by_name) == {
        "洁惠",
        "梓野",
        "洁怡",
        "继鹏",
        "林航",
        "晓愉",
        "锶锴",
        "佳佳",
        "晓丹",
        "晓玲",
        "小帅",
        "家进",
    }
    assert by_name["继鹏"]["start_time"] == time(9, 0)
    assert by_name["继鹏"]["end_time"] == time(16, 0)
    assert by_name["继鹏"]["note"] == "协助后厨"
    assert by_name["梓野"]["start_time"] == time(7, 30)
    assert by_name["林航"]["is_trial"] is True
    assert result["unparsed_lines"] == []


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
8-16晓玲（制备位）7.5（22-23.5）
8-17佳博（水果位）8.5（22-23.5）
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
    assert set(by_name) == {"苑菱", "晓玲", "佳博", "继鹏", "梓野", "锶锴", "洁怡"}
    assert by_name["苑菱"]["start_time"] == time(10, 0)
    assert by_name["苑菱"]["end_time"] == time(23, 30)
    assert by_name["苑菱"]["note"] == "早值、检查效期"
    xiaoling = by_name["晓玲"]
    assert xiaoling["start_time"] == time(8, 0)
    assert xiaoling["end_time"] == time(16, 0)
    assert xiaoling["ot_start_time"] == time(22, 0)
    assert xiaoling["ot_end_time"] == time(23, 30)
    jiabo = by_name["佳博"]
    assert jiabo["start_time"] == time(8, 0)
    assert jiabo["end_time"] == time(17, 0)
    assert jiabo["ot_start_time"] == time(22, 0)
    assert jiabo["ot_end_time"] == time(23, 30)
    assert by_name["继鹏"]["status"] == "rest"
    assert by_name["继鹏"]["ot_start_time"] == time(22, 0)
    assert by_name["继鹏"]["ot_end_time"] == time(23, 30)
    assert by_name["继鹏"]["start_time"] is None
    assert by_name["洁怡"]["status"] == "support"
    assert "missing_support_times" in by_name["洁怡"]["errors"]
    assert result["unparsed_lines"] == []


def test_parse_duty_skip_meal_after_hours():
    text = "8月17 周一 来货\n8-16苑菱(早值 检查效期）8(没吃饭）"
    result = parse_roster_text(text, year=2026)
    assert result["unparsed_lines"] == []
    e = result["days"][0]["entries"][0]
    assert e["name"] == "苑菱"
    assert e["status"] == "on_duty"
    assert e["start_time"] == time(8, 0)
    assert e["end_time"] == time(16, 0)
    assert e["skip_deduction"] is True
    assert e["note"] == "早值 检查效期、没吃饭不扣减"


def test_parse_duty_skip_meal_without_hours():
    text = "8月17 周一\n8-16苑菱（早值）（没吃饭）"
    e = parse_roster_text(text, year=2026)["days"][0]["entries"][0]
    assert e["name"] == "苑菱"
    assert e["skip_deduction"] is True
    assert e["note"] == "早值、没吃饭不扣减"


def test_parse_support_multiple_names_shared_times():
    text = "8月17 周一\n支援美林：嘉岚  晓愉 8-17"
    result = parse_roster_text(text, year=2026)
    assert result["unparsed_lines"] == []
    by_name = {e["name"]: e for e in result["days"][0]["entries"]}
    assert set(by_name) == {"嘉岚", "晓愉"}
    for name in ("嘉岚", "晓愉"):
        e = by_name[name]
        assert e["status"] == "support"
        assert e["note"] == "美林"
        assert e["start_time"] == time(8, 0)
        assert e["end_time"] == time(17, 0)
        assert e["errors"] == []
        assert e["skip_deduction"] is False


def test_parse_support_per_person_times_and_notes():
    text = "8月19 周三\n支援利丰：洁惠11-19（加料） 嘉岚  12-20（水果）"
    result = parse_roster_text(text, year=2026)
    assert result["unparsed_lines"] == []
    by_name = {e["name"]: e for e in result["days"][0]["entries"]}
    assert set(by_name) == {"洁惠", "嘉岚"}
    jiehui = by_name["洁惠"]
    assert jiehui["status"] == "support"
    assert jiehui["start_time"] == time(11, 0)
    assert jiehui["end_time"] == time(19, 0)
    assert jiehui["note"] == "利丰、加料"
    assert jiehui["errors"] == []
    jialan = by_name["嘉岚"]
    assert jialan["status"] == "support"
    assert jialan["start_time"] == time(12, 0)
    assert jialan["end_time"] == time(20, 0)
    assert jialan["note"] == "利丰、水果"
    assert jialan["errors"] == []


def test_empty_rest_line_is_ignored():
    text = "8月19 周三\n7.5-16洁怡（水果位）\n休息:"
    result = parse_roster_text(text, year=2026)
    assert result["unparsed_lines"] == []
    assert [e["name"] for e in result["days"][0]["entries"]] == ["洁怡"]


AUG17_SAMPLE = """8月17       周一   来货
8-16苑菱(早值 检查效期）8(没吃饭）
7.5-16家进（制备位）8
7.5-16佳博（水果位）8
7.5-15浩媚（香雪试工水果）7
10-17锶锴6
12-18飞云（香雪试工）吧台6
11.5-19梓野（带试工吧台）6.5
13-19嘉允（香雪试工）吧台6
13-20洁惠（周清制冰机）6.5
14-23.5林航（香雪培训）9
13.5-23.5晓玲（晚值 检查效期 卫生）9.5
14.5-23.5晓丹（接制备 ）8.5
16-23.5佳佳（学水果位)7.5

休息: 洁怡 继鹏
支援上社：小帅 8-17
支援美林：嘉岚  晓愉 8-17
"""


def test_gold_sample_aug17():
    result = parse_roster_text(AUG17_SAMPLE, year=2026)
    day = result["days"][0]
    assert day["work_date"] == date(2026, 8, 17)
    assert day["day_note"] == "来货"
    by_name = {e["name"]: e for e in day["entries"]}
    assert by_name["苑菱"]["skip_deduction"] is True
    assert by_name["苑菱"]["start_time"] == time(8, 0)
    assert by_name["苑菱"]["end_time"] == time(16, 0)
    assert by_name["嘉岚"]["status"] == "support"
    assert by_name["晓愉"]["status"] == "support"
    assert by_name["嘉岚"]["start_time"] == time(8, 0)
    assert by_name["小帅"]["status"] == "support"
    assert by_name["小帅"]["note"] == "上社"
    assert by_name["洁怡"]["status"] == "rest"
    assert by_name["飞云"]["name"] == "飞云"
    assert by_name["飞云"]["is_trial"] is True
    assert "吧台" in (by_name["飞云"]["note"] or "")
    assert by_name["梓野"]["is_trial"] is False
    assert "带试工" in (by_name["梓野"]["note"] or "")
    assert by_name["嘉允"]["name"] == "嘉允"
    assert "吧台" in (by_name["嘉允"]["note"] or "")
    assert result["unparsed_lines"] == []


AUG19_SAMPLE = """8月19      周三
7.5-16梓野（ 早值、看制备）
7.5-16嘉允（学制备、香雪试工）
7.5-16洁怡（水果位）
7.5-16浩媚（香雪试工水果）
9-16锶锴
10-16飞云（香雪试工）吧台
11-17晓愉
12-19继鹏
13-18美淇（香雪试工）
13-20林航（香雪培训）
14-21晓丹             
14-23.5晓玲（晚值 检查效期 ）
14.5-23.5小帅（制备 ）
16-23.5家进（水果）
休息:
支援利丰：洁惠11-19（加料） 嘉岚  12-20（水果）
支援香雪：佳博  佳佳
"""


def test_gold_sample_aug19():
    result = parse_roster_text(AUG19_SAMPLE, year=2026)
    day = result["days"][0]
    assert day["work_date"] == date(2026, 8, 19)
    by_name = {e["name"]: e for e in day["entries"]}
    assert by_name["嘉允"]["is_trial"] is True
    assert by_name["飞云"]["is_trial"] is True
    assert "吧台" in (by_name["飞云"]["note"] or "")
    jiehui = by_name["洁惠"]
    assert jiehui["status"] == "support"
    assert jiehui["start_time"] == time(11, 0)
    assert jiehui["end_time"] == time(19, 0)
    assert jiehui["note"] == "利丰、加料"
    jialan = by_name["嘉岚"]
    assert jialan["status"] == "support"
    assert jialan["start_time"] == time(12, 0)
    assert jialan["end_time"] == time(20, 0)
    assert jialan["note"] == "利丰、水果"
    assert by_name["佳博"]["status"] == "support"
    assert by_name["佳佳"]["status"] == "support"
    assert by_name["佳博"]["note"] == "香雪"
    assert "missing_support_times" in by_name["佳博"]["errors"]
    assert "missing_support_times" in by_name["佳佳"]["errors"]
    assert "洁怡" not in by_name or by_name["洁怡"]["status"] == "on_duty"
    assert result["unparsed_lines"] == []
