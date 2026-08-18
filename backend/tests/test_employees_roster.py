from app.services.employees import parse_roster_text


def test_parse_roster_text_splits_and_dedupes():
    assert parse_roster_text("张三 李四、王五\n赵六,张三") == ["张三", "李四", "王五", "赵六"]


def test_parse_roster_text_fullwidth_comma():
    assert parse_roster_text("打击，嘎机") == ["打击", "嘎机"]


def test_parse_roster_text_tabs_and_empty():
    assert parse_roster_text("张三\t李四") == ["张三", "李四"]
    assert parse_roster_text("  、,\n  ") == []
    assert parse_roster_text("") == []


def test_create_employee_and_existing_returns_200(client):
    created = client.post("/api/employees", json={"name": "  张三  "})
    assert created.status_code == 201
    body = created.json()
    assert body["name"] == "张三"

    again = client.post("/api/employees", json={"name": "张三"})
    assert again.status_code == 200
    assert again.json()["id"] == body["id"]

    listed = client.get("/api/employees")
    names = [e["name"] for e in listed.json()]
    assert names.count("张三") == 1


def test_create_employee_rejects_blank(client):
    r = client.post("/api/employees", json={"name": "   "})
    assert r.status_code == 400


def test_import_employees_counts_and_reactivates(client):
    first = client.post("/api/employees", json={"name": "张三"})
    assert first.status_code == 201
    client.delete(f"/api/employees/{first.json()['id']}")
    assert client.get("/api/employees").json() == []

    client.post("/api/employees", json={"name": "李四"})

    too_long = "超" * 65
    r = client.post(
        "/api/employees/import",
        json={"text": f"张三 李四、王五\n赵六,张三 {too_long}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["created"] == 2
    assert body["reactivated"] == 1
    assert body["skipped_existing"] == 1
    assert body["skipped_invalid"] == 1
    assert body["names"] == ["张三", "李四", "王五", "赵六"]

    listed = {e["name"] for e in client.get("/api/employees").json()}
    assert listed == {"张三", "李四", "王五", "赵六"}


def test_import_employees_fullwidth_comma(client):
    r = client.post("/api/employees/import", json={"text": "打击，嘎机"})
    assert r.status_code == 200
    body = r.json()
    assert body["created"] == 2
    assert body["names"] == ["打击", "嘎机"]
    listed = {e["name"] for e in client.get("/api/employees").json()}
    assert listed == {"打击", "嘎机"}
    r = client.post("/api/employees/import", json={"text": " 、,\n"})
    assert r.status_code == 400
    assert "姓名" in r.json()["detail"]


def test_delete_employee_is_soft(client):
    created = client.post("/api/entries", json={
        "work_date": "2026-08-04",
        "name": "张三",
        "start_time": "07:30",
        "end_time": "16:00",
    })
    assert created.status_code == 201
    emp_id = created.json()["employee_id"]

    removed = client.delete(f"/api/employees/{emp_id}")
    assert removed.status_code == 204
    assert client.get("/api/employees").json() == []

    entries = client.get("/api/entries", params={"date": "2026-08-04"})
    assert len(entries.json()) == 1
    assert entries.json()[0]["employee_name"] == "张三"
