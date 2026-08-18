SAMPLE = """8月1 周六 完成自检
8-16梓野（早值）7.5
休息：苑菱
支援上社：洁怡
"""


def test_preview_flags_support_without_times(client):
    r = client.post("/api/entries/import/preview", json={"text": SAMPLE, "year": 2026})
    assert r.status_code == 200
    day = r.json()["days"][0]
    assert day["work_date"] == "2026-08-01"
    assert day["day_note"] == "完成自检"
    support = next(e for e in day["entries"] if e["name"] == "洁怡")
    assert "missing_support_times" in support["errors"]


def test_commit_overwrites_same_person_keeps_others(client):
    client.post("/api/entries", json={
        "work_date": "2026-08-01", "name": "张三",
        "start_time": "08:00", "end_time": "16:00",
    })
    client.post("/api/entries", json={
        "work_date": "2026-08-01", "name": "梓野",
        "start_time": "09:00", "end_time": "17:00",
    })
    payload = {
        "days": [{
            "work_date": "2026-08-01",
            "day_note": "完成自检",
            "entries": [{
                "name": "梓野", "status": "on_duty",
                "start_time": "08:00", "end_time": "16:00",
                "ot_start_time": None, "ot_end_time": None,
                "is_trial": False, "note": "早值",
            }],
        }]
    }
    r = client.post("/api/entries/import/commit", json=payload)
    assert r.status_code == 200
    assert r.json()["updated"] + r.json()["created"] >= 1
    listed = client.get("/api/entries", params={"date": "2026-08-01"}).json()
    names = {e["employee_name"]: e for e in listed}
    assert "张三" in names
    assert names["梓野"]["start_time"] == "08:00"
    assert names["梓野"]["note"] == "早值"
    note = client.get("/api/day-notes", params={"date": "2026-08-01"}).json()
    assert note["note"] == "完成自检"


def test_commit_rejects_support_without_times(client):
    r = client.post("/api/entries/import/commit", json={
        "days": [{
            "work_date": "2026-08-01",
            "entries": [{
                "name": "洁怡", "status": "support",
                "start_time": None, "end_time": None,
                "is_trial": False, "note": "上社",
            }],
        }]
    })
    assert r.status_code == 400


def test_preview_illegal_time_token_returns_200(client):
    r = client.post(
        "/api/entries/import/preview",
        json={"text": "8月1 周六\n25-26嘉岚（卫生）", "year": 2026},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["days"]
    day = body["days"][0]
    if day["entries"]:
        assert "invalid_time_range" in day["entries"][0]["errors"]
    else:
        assert any("25-26" in line for line in body["unparsed_lines"])


def test_commit_all_or_nothing_rolls_back(client):
    seed = client.post("/api/entries", json={
        "work_date": "2026-08-01", "name": "张三",
        "start_time": "08:00", "end_time": "16:00",
    })
    assert seed.status_code == 201
    before = client.get("/api/entries", params={"date": "2026-08-01"}).json()
    assert len(before) == 1

    r = client.post("/api/entries/import/commit", json={
        "days": [{
            "work_date": "2026-08-01",
            "day_note": "不应写入",
            "entries": [
                {
                    "name": "梓野", "status": "on_duty",
                    "start_time": "08:00", "end_time": "16:00",
                    "ot_start_time": None, "ot_end_time": None,
                    "is_trial": False, "note": None,
                },
                {
                    "name": "洁怡", "status": "support",
                    "start_time": None, "end_time": None,
                    "is_trial": False, "note": "上社",
                },
            ],
        }]
    })
    assert r.status_code == 400
    after = client.get("/api/entries", params={"date": "2026-08-01"}).json()
    assert len(after) == 1
    assert after[0]["employee_name"] == "张三"
    note = client.get("/api/day-notes", params={"date": "2026-08-01"}).json()
    assert note["note"] is None


def test_preview_invalid_date_keeps_following_duty(client):
    r = client.post(
        "/api/entries/import/preview",
        json={
            "text": "13月40 周一\n8-16梓野（早值）7.5",
            "year": 2026,
        },
    )
    assert r.status_code == 200
    day = r.json()["days"][0]
    assert "invalid_date" in day["errors"]
    assert any(e["name"] == "梓野" for e in day["entries"])
