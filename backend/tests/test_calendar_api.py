def test_calendar_month_summary(client):
    assert client.post("/api/entries", json={
        "work_date": "2026-08-04",
        "name": "张三",
        "start_time": "07:30",
        "end_time": "16:00",
    }).status_code == 201
    assert client.post("/api/entries", json={
        "work_date": "2026-08-05",
        "name": "李四",
        "start_time": "07:30",
        "end_time": "16:00",
    }).status_code == 201
    # same day second person — entry_count aggregates
    assert client.post("/api/entries", json={
        "work_date": "2026-08-04",
        "name": "王五",
        "start_time": "09:00",
        "end_time": "14:30",
    }).status_code == 201

    r = client.get("/api/calendar", params={"year": 2026, "month": 8})
    assert r.status_code == 200
    body = r.json()
    assert body["year"] == 2026
    assert body["month"] == 8
    assert body["registered_days"] == 2
    assert body["month_total_hours"] == "21.5"
    assert body["days"] == [
        {"date": "2026-08-04", "entry_count": 2, "total_effective_hours": "13.5"},
        {"date": "2026-08-05", "entry_count": 1, "total_effective_hours": "8.0"},
    ]


def test_calendar_empty_month(client):
    r = client.get("/api/calendar", params={"year": 2026, "month": 7})
    assert r.status_code == 200
    body = r.json()
    assert body["registered_days"] == 0
    assert body["month_total_hours"] == "0.0"
    assert body["days"] == []


def test_calendar_excludes_support_and_rest_from_totals(client):
    client.post("/api/entries", json={
        "work_date": "2026-08-14",
        "name": "张三",
        "start_time": "07:30",
        "end_time": "16:00",
    })
    client.post("/api/entries", json={
        "work_date": "2026-08-14",
        "name": "周九",
        "status": "support",
        "start_time": "08:00",
        "end_time": "17:00",
    })
    client.post("/api/entries", json={
        "work_date": "2026-08-14",
        "name": "赵六",
        "status": "rest",
    })
    r = client.get("/api/calendar", params={"year": 2026, "month": 8})
    assert r.status_code == 200
    day = next(d for d in r.json()["days"] if d["date"] == "2026-08-14")
    assert day["entry_count"] == 1
    assert day["total_effective_hours"] == "8.0"
