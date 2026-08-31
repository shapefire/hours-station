def _seed_duty(client, day="2026-08-10"):
    r = client.post("/api/entries", json={
        "work_date": day,
        "name": "核审甲",
        "status": "on_duty",
        "start_time": "08:00",
        "end_time": "17:00",
        "ot_start_time": "17:00",
        "ot_end_time": "18:00",
    })
    assert r.status_code == 201
    return r.json()


def test_employee_month_requires_existing_name(client):
    r = client.get("/api/reviews/employee-month", params={
        "name": "不存在的人", "year": 2026, "month": 8,
    })
    assert r.status_code == 404


def test_employee_month_lists_days_and_ot(client):
    _seed_duty(client)
    r = client.get("/api/reviews/employee-month", params={
        "name": "核审甲", "year": 2026, "month": 8,
    })
    assert r.status_code == 200
    body = r.json()
    assert body["reviewed"] is False
    day = next(d for d in body["days"] if d["date"] == "2026-08-10")
    assert day["status"] == "on_duty"
    assert day["start_time"] == "08:00"
    assert day["end_time"] == "17:00"
    assert day["ot_start_time"] == "17:00"
    assert day["ot_end_time"] == "18:00"


def test_submit_locks_month_and_creates_disputes(client):
    _seed_duty(client)
    r = client.post("/api/reviews/submit", json={
        "name": "核审甲",
        "year": 2026,
        "month": 8,
        "disputes": [{
            "work_date": "2026-08-10",
            "proposed_start_time": "09:00",
            "proposed_end_time": "18:00",
            "proposed_ot_start_time": None,
            "proposed_ot_end_time": None,
            "note": "实际无加班",
        }],
    })
    assert r.status_code == 200
    assert r.json()["dispute_count"] == 1

    again = client.post("/api/reviews/submit", json={
        "name": "核审甲", "year": 2026, "month": 8, "disputes": [],
    })
    assert again.status_code == 409

    month = client.get("/api/reviews/employee-month", params={
        "name": "核审甲", "year": 2026, "month": 8,
    }).json()
    assert month["reviewed"] is True
    assert len(month["disputes"]) == 1
    assert month["disputes"][0]["status"] == "pending"


def test_submit_rejects_incomplete_ot_pair(client):
    _seed_duty(client)
    r = client.post("/api/reviews/submit", json={
        "name": "核审甲",
        "year": 2026,
        "month": 8,
        "disputes": [{
            "work_date": "2026-08-11",
            "proposed_start_time": "08:00",
            "proposed_end_time": "16:00",
            "proposed_ot_start_time": "16:00",
            "proposed_ot_end_time": None,
            "note": None,
        }],
    })
    assert r.status_code == 400
