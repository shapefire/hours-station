def _seed_duty(client, day="2026-08-10", name="核审甲"):
    r = client.post("/api/entries", json={
        "work_date": day,
        "name": name,
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


def test_confirm_updates_one_day_only(client):
    _seed_duty(client, "2026-08-10", name="核审确认甲")
    client.post("/api/entries", json={
        "work_date": "2026-08-12", "name": "核审确认甲",
        "status": "on_duty", "start_time": "08:00", "end_time": "16:00",
    })
    client.post("/api/reviews/submit", json={
        "name": "核审确认甲", "year": 2026, "month": 8,
        "disputes": [
            {
                "work_date": "2026-08-10",
                "proposed_start_time": "09:00",
                "proposed_end_time": "18:00",
                "proposed_ot_start_time": None,
                "proposed_ot_end_time": None,
                "note": "清加班",
            },
            {
                "work_date": "2026-08-12",
                "proposed_start_time": "10:00",
                "proposed_end_time": "19:00",
                "proposed_ot_start_time": "19:00",
                "proposed_ot_end_time": "20:00",
                "note": None,
            },
        ],
    })
    pending = client.get("/api/reviews/disputes", params={"status": "pending"}).json()
    d10 = next(d for d in pending if d["work_date"] == "2026-08-10")
    d12 = next(d for d in pending if d["work_date"] == "2026-08-12")

    ok = client.post(f"/api/reviews/disputes/{d10['id']}/confirm")
    assert ok.status_code == 200

    e10 = client.get("/api/entries", params={"date": "2026-08-10"}).json()
    row10 = next(e for e in e10 if e["employee_name"] == "核审确认甲")
    assert row10["start_time"] == "09:00"
    assert row10["end_time"] == "18:00"
    assert row10["ot_start_time"] is None
    assert row10["status"] == "on_duty"

    e12 = client.get("/api/entries", params={"date": "2026-08-12"}).json()
    row12 = next(e for e in e12 if e["employee_name"] == "核审确认甲")
    assert row12["start_time"] == "08:00"

    still = client.get("/api/reviews/disputes", params={"status": "pending"}).json()
    assert any(d["id"] == d12["id"] for d in still)


def test_confirm_creates_entry_for_unassigned_day(client):
    client.post("/api/entries", json={
        "work_date": "2026-08-01", "name": "核审乙",
        "status": "on_duty", "start_time": "08:00", "end_time": "16:00",
    })
    client.post("/api/reviews/submit", json={
        "name": "核审乙", "year": 2026, "month": 8,
        "disputes": [{
            "work_date": "2026-08-20",
            "proposed_start_time": "08:00",
            "proposed_end_time": "17:00",
            "proposed_ot_start_time": "17:00",
            "proposed_ot_end_time": "18:30",
            "note": "漏登记",
        }],
    })
    d = client.get("/api/reviews/disputes", params={"status": "pending"}).json()[0]
    assert client.post(f"/api/reviews/disputes/{d['id']}/confirm").status_code == 200
    rows = client.get("/api/entries", params={"date": "2026-08-20"}).json()
    row = next(e for e in rows if e["employee_name"] == "核审乙")
    assert row["status"] == "on_duty"
    assert row["ot_end_time"] == "18:30"


def test_reject_does_not_change_entry(client):
    _seed_duty(client, "2026-08-15", name="核审拒绝甲")
    client.post("/api/reviews/submit", json={
        "name": "核审拒绝甲", "year": 2026, "month": 8,
        "disputes": [{
            "work_date": "2026-08-15",
            "proposed_start_time": "10:00",
            "proposed_end_time": "19:00",
            "proposed_ot_start_time": None,
            "proposed_ot_end_time": None,
            "note": None,
        }],
    })
    d = client.get("/api/reviews/disputes", params={"status": "pending"}).json()[0]
    assert client.post(f"/api/reviews/disputes/{d['id']}/reject").status_code == 200
    row = next(
        e for e in client.get("/api/entries", params={"date": "2026-08-15"}).json()
        if e["employee_name"] == "核审拒绝甲"
    )
    assert row["start_time"] == "08:00"
