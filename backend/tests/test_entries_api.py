def test_create_entry_auto_adds_employee(client):
    r = client.post("/api/entries", json={
        "work_date": "2026-08-04",
        "name": "张三",
        "start_time": "07:30",
        "end_time": "16:00",
        "note": "现场",
    })
    assert r.status_code == 201
    body = r.json()
    assert body["employee_name"] == "张三"
    assert body["effective_hours"] == "8.0"
    assert body["note"] == "现场"

    employees = client.get("/api/employees")
    assert employees.status_code == 200
    names = [e["name"] for e in employees.json()]
    assert "张三" in names


def test_duplicate_same_day_rejected(client):
    payload = {
        "work_date": "2026-08-04",
        "name": "张三",
        "start_time": "07:30",
        "end_time": "16:00",
    }
    assert client.post("/api/entries", json=payload).status_code == 201
    r = client.post("/api/entries", json=payload)
    assert r.status_code == 409


def test_list_entries_by_date(client):
    client.post("/api/entries", json={
        "work_date": "2026-08-04",
        "name": "张三",
        "start_time": "07:30",
        "end_time": "16:00",
    })
    client.post("/api/entries", json={
        "work_date": "2026-08-05",
        "name": "李四",
        "start_time": "08:00",
        "end_time": "17:00",
    })

    r = client.get("/api/entries", params={"date": "2026-08-04"})
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["employee_name"] == "张三"
    assert body[0]["effective_hours"] == "8.0"


def test_patch_entry(client):
    created = client.post("/api/entries", json={
        "work_date": "2026-08-04",
        "name": "张三",
        "start_time": "07:30",
        "end_time": "16:00",
    }).json()

    r = client.patch(f"/api/entries/{created['id']}", json={
        "start_time": "09:00",
        "end_time": "14:30",
        "note": "半天",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["effective_hours"] == "5.5"
    assert body["note"] == "半天"


def test_delete_entry(client):
    created = client.post("/api/entries", json={
        "work_date": "2026-08-04",
        "name": "张三",
        "start_time": "07:30",
        "end_time": "16:00",
    }).json()

    r = client.delete(f"/api/entries/{created['id']}")
    assert r.status_code == 204

    listed = client.get("/api/entries", params={"date": "2026-08-04"})
    assert listed.json() == []


def test_employees_month_rest_days(client):
    client.post("/api/entries", json={
        "work_date": "2026-08-01",
        "name": "张三",
        "status": "rest",
    })
    client.post("/api/entries", json={
        "work_date": "2026-08-02",
        "name": "张三",
        "status": "rest",
    })
    client.post("/api/entries", json={
        "work_date": "2026-08-03",
        "name": "张三",
        "status": "leave",
    })
    client.post("/api/entries", json={
        "work_date": "2026-08-04",
        "name": "李四",
        "start_time": "07:30",
        "end_time": "16:00",
    })
    client.post("/api/entries", json={
        "work_date": "2026-07-31",
        "name": "张三",
        "status": "rest",
    })

    r = client.get("/api/employees", params={"year": 2026, "month": 8})
    assert r.status_code == 200
    by_name = {e["name"]: e for e in r.json()}
    assert by_name["张三"]["month_rest_days"] == 2
    assert by_name["李四"]["month_rest_days"] == 0

    r_plain = client.get("/api/employees")
    assert r_plain.status_code == 200
    assert r_plain.json()[0].get("month_rest_days") is None


def test_employees_search(client):
    client.post("/api/entries", json={
        "work_date": "2026-08-04",
        "name": "张三",
        "start_time": "07:30",
        "end_time": "16:00",
    })
    client.post("/api/entries", json={
        "work_date": "2026-08-04",
        "name": "李四",
        "start_time": "08:00",
        "end_time": "17:00",
    })

    r = client.get("/api/employees", params={"q": "张"})
    assert r.status_code == 200
    names = [e["name"] for e in r.json()]
    assert names == ["张三"]


def test_create_entry_trims_name(client):
    r = client.post("/api/entries", json={
        "work_date": "2026-08-04",
        "name": "  张三  ",
        "start_time": "07:30",
        "end_time": "16:00",
    })
    assert r.status_code == 201
    assert r.json()["employee_name"] == "张三"


def test_invalid_time_range_rejected(client):
    r = client.post("/api/entries", json={
        "work_date": "2026-08-04",
        "name": "张三",
        "start_time": "16:00",
        "end_time": "07:30",
    })
    assert r.status_code == 400


def test_create_rest_entry_without_times(client):
    r = client.post("/api/entries", json={
        "work_date": "2026-08-14",
        "name": "赵六",
        "status": "rest",
    })
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "rest"
    assert body["start_time"] is None
    assert body["end_time"] is None
    assert body["effective_hours"] == "0.0"
    assert body["is_external"] is False
    assert body["is_trial"] is False


def test_create_on_duty_with_external_and_trial(client):
    r = client.post("/api/entries", json={
        "work_date": "2026-08-14",
        "name": "外援甲",
        "start_time": "08:00",
        "end_time": "17:00",
        "status": "on_duty",
        "is_external": True,
        "is_trial": True,
        "note": "城南店",
    })
    assert r.status_code == 201
    body = r.json()
    assert body["is_external"] is True
    assert body["is_trial"] is True
    assert body["effective_hours"] == "8.5"


def test_rest_then_on_duty_same_day_conflict(client):
    assert client.post("/api/entries", json={
        "work_date": "2026-08-14",
        "name": "张三",
        "status": "rest",
    }).status_code == 201
    r = client.post("/api/entries", json={
        "work_date": "2026-08-14",
        "name": "张三",
        "start_time": "07:30",
        "end_time": "16:00",
    })
    assert r.status_code in (400, 409)
    assert "休息" in r.json()["detail"]


def test_leave_rejects_times(client):
    r = client.post("/api/entries", json={
        "work_date": "2026-08-14",
        "name": "孙八",
        "status": "leave",
        "start_time": "07:30",
        "end_time": "16:00",
    })
    assert r.status_code == 400


def test_create_support_hours_returned_but_flags_forbidden(client):
    ok = client.post("/api/entries", json={
        "work_date": "2026-08-14",
        "name": "周九",
        "status": "support",
        "start_time": "08:00",
        "end_time": "17:00",
    })
    assert ok.status_code == 201
    assert ok.json()["effective_hours"] == "8.5"
    bad = client.post("/api/entries", json={
        "work_date": "2026-08-15",
        "name": "周九",
        "status": "support",
        "start_time": "08:00",
        "end_time": "17:00",
        "is_trial": True,
    })
    assert bad.status_code == 400


def test_patch_on_duty_flags_to_rest_clears_times_and_flags(client):
    created = client.post("/api/entries", json={
        "work_date": "2026-08-14",
        "name": "外援乙",
        "status": "on_duty",
        "start_time": "08:00",
        "end_time": "17:00",
        "is_external": True,
        "is_trial": True,
    }).json()
    assert created["is_external"] is True
    assert created["is_trial"] is True

    r = client.patch(f"/api/entries/{created['id']}", json={"status": "rest"})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "rest"
    assert body["start_time"] is None
    assert body["end_time"] is None
    assert body["is_external"] is False
    assert body["is_trial"] is False
    assert body["effective_hours"] == "0.0"


def test_on_duty_skip_deduction_no_half_hour(client):
    # 默认档满6减0.5；7:30-16:00 raw 8.5
    r = client.post("/api/entries", json={
        "work_date": "2026-08-01",
        "name": "未休甲",
        "start_time": "07:30",
        "end_time": "16:00",
        "skip_deduction": True,
    })
    assert r.status_code == 201
    body = r.json()
    assert body["skip_deduction"] is True
    assert body["effective_hours"] == "8.5"
    assert "没吃饭不扣减" in (body["note"] or "")


def test_on_duty_without_skip_still_deducts(client):
    r = client.post("/api/entries", json={
        "work_date": "2026-08-01",
        "name": "正常乙",
        "start_time": "07:30",
        "end_time": "16:00",
    })
    assert r.json()["effective_hours"] == "8.0"
    assert r.json()["skip_deduction"] is False


def test_rest_rejects_keeping_skip(client):
    created = client.post("/api/entries", json={
        "work_date": "2026-08-02",
        "name": "转休息",
        "start_time": "07:30",
        "end_time": "16:00",
        "skip_deduction": True,
    }).json()
    r = client.patch(f"/api/entries/{created['id']}", json={"status": "rest", "clear_times": True})
    assert r.status_code == 200
    assert r.json()["skip_deduction"] is False
    assert "没吃饭不扣减" not in (r.json()["note"] or "")
