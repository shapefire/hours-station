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
