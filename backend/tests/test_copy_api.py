def test_copy_day_empty_source_400(client):
    r = client.post(
        "/api/entries/copy-day",
        json={"from_date": "2026-08-01", "to_date": "2026-08-02"},
    )
    assert r.status_code == 400
    assert "无安排" in r.json()["detail"]


def test_copy_day_skips_existing_name(client):
    # 源日两人
    client.post("/api/entries", json={
        "work_date": "2026-08-01",
        "name": "张三",
        "start_time": "07:30",
        "end_time": "16:00",
        "note": "现场",
    })
    client.post("/api/entries", json={
        "work_date": "2026-08-01",
        "name": "李四",
        "start_time": "08:00",
        "end_time": "17:00",
    })
    # 目标日已有其中一人
    client.post("/api/entries", json={
        "work_date": "2026-08-02",
        "name": "张三",
        "start_time": "09:00",
        "end_time": "12:00",
    })

    r = client.post("/api/entries/copy-day", json={
        "from_date": "2026-08-01",
        "to_date": "2026-08-02",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["copied"] == 1
    assert body["skipped"] == 1
    assert body["skipped_names"] == ["张三"]

    target = client.get("/api/entries", params={"date": "2026-08-02"}).json()
    names = {e["employee_name"] for e in target}
    assert names == {"张三", "李四"}
    li_si = next(e for e in target if e["employee_name"] == "李四")
    assert li_si["start_time"] == "08:00"
    assert li_si["end_time"] == "17:00"


def test_copy_person_only_changes_name(client):
    source = client.post("/api/entries", json={
        "work_date": "2026-08-01",
        "name": "张三",
        "start_time": "07:30",
        "end_time": "16:00",
        "note": "现场",
    }).json()

    r = client.post("/api/entries/copy-person", json={
        "source_entry_id": source["id"],
        "name": "赵六",
        "date": "2026-08-04",
    })
    assert r.status_code == 201
    body = r.json()
    assert body["employee_name"] == "赵六"
    assert body["work_date"] == "2026-08-04"
    assert body["start_time"] == "07:30"
    assert body["end_time"] == "16:00"
    assert body["note"] == "现场"
    assert body["effective_hours"] == "8.0"

    employees = client.get("/api/employees").json()
    assert "赵六" in [e["name"] for e in employees]


def test_copy_person_duplicate_same_day_rejected(client):
    source = client.post("/api/entries", json={
        "work_date": "2026-08-01",
        "name": "张三",
        "start_time": "07:30",
        "end_time": "16:00",
    }).json()
    client.post("/api/entries", json={
        "work_date": "2026-08-04",
        "name": "李四",
        "start_time": "08:00",
        "end_time": "17:00",
    })

    r = client.post("/api/entries/copy-person", json={
        "source_entry_id": source["id"],
        "name": "李四",
        "date": "2026-08-04",
    })
    assert r.status_code == 409
