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
