def _post_entry(client, *, work_date, name, start="07:30", end="16:00"):
    r = client.post(
        "/api/entries",
        json={
            "work_date": work_date,
            "name": name,
            "start_time": start,
            "end_time": end,
        },
    )
    assert r.status_code == 201
    return r.json()


def test_monthly_stats_summary_and_rest_days(client):
    a = _post_entry(client, work_date="2026-08-01", name="张三")
    _post_entry(client, work_date="2026-08-03", name="张三")
    # other month — must not count
    _post_entry(client, work_date="2026-07-31", name="张三")

    r = client.get("/api/stats/monthly", params={"year": 2026, "month": 8})
    assert r.status_code == 200
    body = r.json()
    assert body["year"] == 2026
    assert body["month"] == 8
    assert body["total_hours"] == "16.0"
    assert body["employee_count"] == 1
    assert body["attendance_person_days"] == 2
    assert len(body["people"]) == 1
    person = body["people"][0]
    assert person["employee_id"] == a["employee_id"]
    assert person["name"] == "张三"
    assert person["attendance_days"] == 2
    assert person["support_days"] == 0
    assert person["support_hours"] == "0.0"
    assert person["rest_days"] == 0  # 只统计已安排 rest，无 rest 记录
    assert person["leave_days"] == 0
    assert person["total_hours"] == "16.0"
    assert person["avg_hours"] == "8.0"


def test_monthly_stats_support_not_in_store_hours_or_rest(client):
    # Aug 2026 has 31 days
    client.post("/api/entries", json={
        "work_date": "2026-08-01",
        "name": "张三",
        "start_time": "07:30",
        "end_time": "16:00",
    })
    client.post("/api/entries", json={
        "work_date": "2026-08-02",
        "name": "张三",
        "status": "support",
        "start_time": "08:00",
        "end_time": "17:00",
    })
    client.post("/api/entries", json={
        "work_date": "2026-08-03",
        "name": "张三",
        "status": "leave",
    })
    r = client.get("/api/stats/monthly", params={"year": 2026, "month": 8})
    assert r.status_code == 200
    body = r.json()
    assert body["total_hours"] == "8.0"
    person = body["people"][0]
    assert person["attendance_days"] == 1
    assert person["support_days"] == 1
    assert person["support_hours"] == "8.5"
    assert person["rest_days"] == 0  # 只统计已安排 rest
    assert person["leave_days"] == 1  # 只统计已安排 leave
    assert person["total_hours"] == "8.0"

    days = client.get(
        f"/api/stats/monthly/{person['employee_id']}/days",
        params={"year": 2026, "month": 8},
    ).json()["days"]
    by = {d["date"]: d for d in days}
    assert by["2026-08-01"]["status"] == "work"
    assert by["2026-08-02"]["status"] == "support"
    assert by["2026-08-03"]["status"] == "leave"
    assert by["2026-08-04"]["status"] == "unassigned"  # 无记录=未安排


def test_monthly_stats_sorted_by_total_hours_desc(client):
    _post_entry(client, work_date="2026-08-01", name="少工时", start="09:00", end="14:30")  # 5.5
    _post_entry(client, work_date="2026-08-01", name="多工时")  # 8.0
    _post_entry(client, work_date="2026-08-02", name="多工时")  # 8.0 → 16.0

    r = client.get("/api/stats/monthly", params={"year": 2026, "month": 8})
    assert r.status_code == 200
    names = [p["name"] for p in r.json()["people"]]
    assert names == ["多工时", "少工时"]


def test_monthly_stats_empty_month(client):
    r = client.get("/api/stats/monthly", params={"year": 2026, "month": 6})
    assert r.status_code == 200
    body = r.json()
    assert body["total_hours"] == "0.0"
    assert body["employee_count"] == 0
    assert body["attendance_person_days"] == 0
    assert body["people"] == []


def test_employee_month_days_covers_full_month_with_unassigned(client):
    entry = _post_entry(client, work_date="2026-08-01", name="张三")
    employee_id = entry["employee_id"]

    r = client.get(
        f"/api/stats/monthly/{employee_id}/days",
        params={"year": 2026, "month": 8},
    )
    assert r.status_code == 200
    days = r.json()["days"]
    assert len(days) == 31

    assert days[0] == {
        "date": "2026-08-01",
        "status": "work",
        "start_time": "07:30",
        "end_time": "16:00",
        "effective_hours": "8.0",
    }
    assert days[1] == {
        "date": "2026-08-02",
        "status": "unassigned",
        "start_time": None,
        "end_time": None,
        "effective_hours": None,
    }
    unassigned_count = sum(1 for d in days if d["status"] == "unassigned")
    assert unassigned_count == 30
    work_count = sum(1 for d in days if d["status"] == "work")
    assert work_count == 1


def test_employee_month_days_404_unknown_employee(client):
    r = client.get(
        "/api/stats/monthly/00000000-0000-0000-0000-000000000000/days",
        params={"year": 2026, "month": 8},
    )
    assert r.status_code == 404
    assert "员工" in r.json()["detail"]
