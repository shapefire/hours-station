from datetime import time


def test_create_on_duty_with_ot_sums_hours(client):
    r = client.post("/api/entries", json={
        "work_date": "2026-08-04",
        "name": "苑菱",
        "status": "on_duty",
        "start_time": "08:00",
        "end_time": "16:00",
        "ot_start_time": "22:00",
        "ot_end_time": "23:30",
    })
    assert r.status_code == 201
    # 主 8h→有效 7.5；OT 1.5→1.5；合计 9.0（默认档 raw>=6 扣 0.5 只作用于主段）
    assert r.json()["effective_hours"] == "9.0"
    assert r.json()["ot_start_time"] == "22:00"
    assert r.json()["ot_end_time"] == "23:30"


def test_ot_two_segment_both_deduct_when_ge_six(client):
    # 主 8h→7.5；加班 6h→5.5；两段各自满 6h 各扣 0.5
    r = client.post("/api/entries", json={
        "work_date": "2026-08-04",
        "name": "苑菱",
        "status": "on_duty",
        "start_time": "08:00",
        "end_time": "16:00",
        "ot_start_time": "17:00",
        "ot_end_time": "23:00",
    })
    assert r.status_code == 201
    assert r.json()["effective_hours"] == "13.0"


def test_ot_two_segment_skip_deduction_skips_both(client):
    # 主 7:30-16:00 raw 8.5；加班 16:00-23:00 raw 7.0；默认各扣 0.5→14.5；skip→15.5
    r = client.post("/api/entries", json={
        "work_date": "2026-08-04",
        "name": "未休双段",
        "status": "on_duty",
        "start_time": "07:30",
        "end_time": "16:00",
        "ot_start_time": "16:00",
        "ot_end_time": "23:00",
        "skip_deduction": True,
    })
    assert r.status_code == 201
    body = r.json()
    assert body["skip_deduction"] is True
    assert body["effective_hours"] == "15.5"


def test_rest_with_ot_only_counts_ot(client):
    r = client.post("/api/entries", json={
        "work_date": "2026-08-04",
        "name": "继鹏",
        "status": "rest",
        "ot_start_time": "22:00",
        "ot_end_time": "23:30",
    })
    assert r.status_code == 201
    assert r.json()["effective_hours"] == "1.5"
    assert r.json()["start_time"] is None


def test_ot_pair_must_be_complete(client):
    r = client.post("/api/entries", json={
        "work_date": "2026-08-04",
        "name": "小帅",
        "start_time": "08:00",
        "end_time": "16:00",
        "ot_start_time": "22:00",
    })
    assert r.status_code == 400


def test_patch_clear_times_keeps_ot(client):
    created = client.post("/api/entries", json={
        "work_date": "2026-08-04",
        "name": "苑菱",
        "status": "on_duty",
        "start_time": "08:00",
        "end_time": "16:00",
        "ot_start_time": "22:00",
        "ot_end_time": "23:30",
    }).json()
    r = client.patch(f"/api/entries/{created['id']}", json={
        "status": "rest",
        "clear_times": True,
    })
    assert r.status_code == 200
    body = r.json()
    assert body["start_time"] is None
    assert body["end_time"] is None
    assert body["ot_start_time"] == "22:00"
    assert body["ot_end_time"] == "23:30"
    assert body["effective_hours"] == "1.5"


def test_patch_explicit_null_clears_ot(client):
    created = client.post("/api/entries", json={
        "work_date": "2026-08-04",
        "name": "苑菱",
        "status": "on_duty",
        "start_time": "08:00",
        "end_time": "16:00",
        "ot_start_time": "22:00",
        "ot_end_time": "23:30",
    }).json()
    r = client.patch(f"/api/entries/{created['id']}", json={
        "ot_start_time": None,
        "ot_end_time": None,
    })
    assert r.status_code == 200
    body = r.json()
    assert body["ot_start_time"] is None
    assert body["ot_end_time"] is None
    assert body["start_time"] == "08:00"
    assert body["effective_hours"] == "7.5"


def test_patch_clears_ot_on_rest(client):
    created = client.post("/api/entries", json={
        "work_date": "2026-08-04",
        "name": "继鹏",
        "status": "rest",
        "ot_start_time": "22:00",
        "ot_end_time": "23:30",
    }).json()
    assert created["effective_hours"] == "1.5"
    r = client.patch(f"/api/entries/{created['id']}", json={
        "ot_start_time": None,
        "ot_end_time": None,
    })
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "rest"
    assert body["ot_start_time"] is None
    assert body["ot_end_time"] is None
    assert body["effective_hours"] == "0.0"


def test_copy_day_and_person_copy_ot(client):
    source = client.post("/api/entries", json={
        "work_date": "2026-08-04",
        "name": "苑菱",
        "status": "on_duty",
        "start_time": "08:00",
        "end_time": "16:00",
        "ot_start_time": "22:00",
        "ot_end_time": "23:30",
    }).json()
    day = client.post("/api/entries/copy-day", json={
        "from_date": "2026-08-04",
        "to_date": "2026-08-05",
    })
    assert day.status_code == 200
    copied_day = client.get("/api/entries", params={"date": "2026-08-05"}).json()
    assert copied_day[0]["ot_start_time"] == "22:00"
    assert copied_day[0]["ot_end_time"] == "23:30"
    assert copied_day[0]["effective_hours"] == "9.0"

    person = client.post("/api/entries/copy-person", json={
        "source_entry_id": source["id"],
        "name": "继鹏",
        "date": "2026-08-06",
    })
    assert person.status_code == 201
    body = person.json()
    assert body["ot_start_time"] == "22:00"
    assert body["ot_end_time"] == "23:30"
    assert body["effective_hours"] == "9.0"


def test_employees_month_hours_include_on_duty_and_rest_ot(client):
    client.post("/api/entries", json={
        "work_date": "2026-08-04",
        "name": "苑菱",
        "status": "on_duty",
        "start_time": "08:00",
        "end_time": "16:00",
        "ot_start_time": "22:00",
        "ot_end_time": "23:30",
    })
    client.post("/api/entries", json={
        "work_date": "2026-08-05",
        "name": "苑菱",
        "status": "rest",
        "ot_start_time": "22:00",
        "ot_end_time": "23:30",
    })
    client.post("/api/entries", json={
        "work_date": "2026-08-06",
        "name": "苑菱",
        "status": "support",
        "start_time": "08:00",
        "end_time": "17:00",
        "ot_start_time": "22:00",
        "ot_end_time": "23:00",
    })
    r = client.get("/api/employees", params={"year": 2026, "month": 8})
    assert r.status_code == 200
    by_name = {e["name"]: e for e in r.json()}
    # on_duty 9.0 + rest OT 1.5；support 不计
    assert by_name["苑菱"]["month_hours"] == "10.5"


def test_calendar_includes_rest_ot_and_excludes_support(client):
    client.post("/api/entries", json={
        "work_date": "2026-08-04",
        "name": "苑菱",
        "status": "on_duty",
        "start_time": "08:00",
        "end_time": "16:00",
        "ot_start_time": "22:00",
        "ot_end_time": "23:30",
    })
    client.post("/api/entries", json={
        "work_date": "2026-08-04",
        "name": "周九",
        "status": "support",
        "start_time": "08:00",
        "end_time": "17:00",
    })
    client.post("/api/entries", json={
        "work_date": "2026-08-05",
        "name": "继鹏",
        "status": "rest",
        "ot_start_time": "22:00",
        "ot_end_time": "23:30",
    })
    r = client.get("/api/calendar", params={"year": 2026, "month": 8})
    assert r.status_code == 200
    body = r.json()
    by_date = {d["date"]: d for d in body["days"]}
    assert by_date["2026-08-04"]["total_effective_hours"] == "9.0"
    assert by_date["2026-08-04"]["entry_count"] == 1
    assert by_date["2026-08-05"]["total_effective_hours"] == "1.5"
    assert by_date["2026-08-05"]["entry_count"] == 1
    assert body["month_total_hours"] == "10.5"


def test_stats_total_hours_include_rest_ot_not_support(client):
    client.post("/api/entries", json={
        "work_date": "2026-08-01",
        "name": "苑菱",
        "status": "on_duty",
        "start_time": "08:00",
        "end_time": "16:00",
        "ot_start_time": "22:00",
        "ot_end_time": "23:30",
    })
    client.post("/api/entries", json={
        "work_date": "2026-08-02",
        "name": "苑菱",
        "status": "rest",
        "ot_start_time": "22:00",
        "ot_end_time": "23:30",
    })
    client.post("/api/entries", json={
        "work_date": "2026-08-03",
        "name": "苑菱",
        "status": "support",
        "start_time": "08:00",
        "end_time": "17:00",
        "ot_start_time": "22:00",
        "ot_end_time": "23:00",
    })
    r = client.get("/api/stats/monthly", params={"year": 2026, "month": 8})
    assert r.status_code == 200
    body = r.json()
    person = body["people"][0]
    assert person["total_hours"] == "10.5"
    assert person["support_hours"] == "9.5"
    assert person["attendance_days"] == 1
    assert person["support_days"] == 1
    assert person["rest_days"] == 29  # 31 - 1 - 1
    assert body["total_hours"] == "10.5"
