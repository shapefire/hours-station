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


def test_patch_employee_export_fields_and_list_order(client):
    a = client.post("/api/employees", json={"name": "苑菱"}).json()
    b = client.post("/api/employees", json={"name": "晓玲"}).json()
    r = client.patch(f"/api/employees/{a['id']}", json={
        "export_name": "伍苑菱", "position": "店经理",
    })
    assert r.status_code == 200
    assert r.json()["export_name"] == "伍苑菱"
    assert r.json()["position"] == "店经理"
    listed = client.get("/api/employees").json()
    assert [e["name"] for e in listed] == ["苑菱", "晓玲"]
    rr = client.put("/api/employees/reorder", json={"ids": [b["id"], a["id"]]})
    assert rr.status_code == 204
    listed = client.get("/api/employees").json()
    assert [e["name"] for e in listed] == ["晓玲", "苑菱"]


def test_patch_employee_rejects_overlong(client):
    emp = client.post("/api/employees", json={"name": "苑菱"}).json()
    r = client.patch(f"/api/employees/{emp['id']}", json={"position": "岗" * 65})
    assert r.status_code == 400


def _entry(client, work_date, name, **kwargs):
    status = kwargs.get("status", "on_duty")
    payload = {"work_date": work_date, "name": name}
    if status not in ("rest", "leave"):
        payload["start_time"] = "09:00"
        payload["end_time"] = "18:00"
    payload.update(kwargs)
    return client.post("/api/entries", json=payload)


def test_patch_employee_rename_success(client):
    emp = client.post("/api/employees", json={"name": "李四"}).json()
    _entry(client, "2026-08-04", "李四")
    r = client.patch(f"/api/employees/{emp['id']}", json={"name": "李肆"})
    assert r.status_code == 200
    assert r.json()["name"] == "李肆"
    entries = client.get("/api/entries", params={"date": "2026-08-04"}).json()
    assert entries[0]["employee_name"] == "李肆"


def test_patch_employee_rename_conflict_409(client):
    a = client.post("/api/employees", json={"name": "李四"}).json()
    client.post("/api/employees", json={"name": "张三"})
    r = client.patch(f"/api/employees/{a['id']}", json={"name": "张三"})
    assert r.status_code == 409
    body = r.json()["detail"]
    assert body["code"] == "name_exists"
    assert body["existing_name"] == "张三"


def test_patch_employee_rename_same_name_noop(client):
    emp = client.post("/api/employees", json={"name": "李四"}).json()
    r = client.patch(f"/api/employees/{emp['id']}", json={"name": "李四"})
    assert r.status_code == 200
    assert r.json()["name"] == "李四"


def test_merge_preview_lists_conflicts(client):
    a = client.post("/api/employees", json={"name": "李四"}).json()
    b = client.post("/api/employees", json={"name": "张三"}).json()
    _entry(client, "2026-08-05", "李四")
    _entry(client, "2026-08-05", "张三", status="rest")
    _entry(client, "2026-08-06", "李四")

    r = client.get("/api/employees/merge-preview", params={
        "source_id": a["id"], "target_id": b["id"],
    })
    assert r.status_code == 200
    body = r.json()
    assert body["movable_count"] == 1
    assert len(body["conflicts"]) == 1
    assert body["conflicts"][0]["work_date"] == "2026-08-05"
    assert body["conflicts"][0]["source_entry"]["status"] == "on_duty"
    assert body["conflicts"][0]["target_entry"]["status"] == "rest"


def test_merge_moves_entries_and_deactivates_source(client):
    a = client.post("/api/employees", json={"name": "李四"}).json()
    b = client.post("/api/employees", json={"name": "张三"}).json()
    client.patch(f"/api/employees/{a['id']}", json={
        "export_name": "李四全名", "position": "收银",
    })
    client.patch(f"/api/employees/{b['id']}", json={
        "export_name": "张三全名", "position": "理货",
    })
    _entry(client, "2026-08-05", "李四")
    _entry(client, "2026-08-05", "张三", status="rest")
    _entry(client, "2026-08-06", "李四")

    r = client.post("/api/employees/merge", json={
        "source_id": a["id"],
        "target_id": b["id"],
        "resolutions": [{"work_date": "2026-08-05", "keep": "source"}],
        "export_name_keep": "source",
        "position_keep": "target",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["merged_entries"] == 2
    assert body["discarded_entries"] == 1
    assert body["target"]["export_name"] == "李四全名"
    assert body["target"]["position"] == "理货"

    names = [e["name"] for e in client.get("/api/employees").json()]
    assert "李四" not in names
    assert "张三" in names

    entries = client.get("/api/entries", params={"date": "2026-08-05"}).json()
    assert len(entries) == 1
    assert entries[0]["employee_name"] == "张三"
    assert entries[0]["status"] == "on_duty"

    entries6 = client.get("/api/entries", params={"date": "2026-08-06"}).json()
    assert len(entries6) == 1
    assert entries6[0]["employee_name"] == "张三"


def test_merge_rejects_incomplete_resolutions(client):
    a = client.post("/api/employees", json={"name": "李四"}).json()
    b = client.post("/api/employees", json={"name": "张三"}).json()
    _entry(client, "2026-08-05", "李四")
    _entry(client, "2026-08-05", "张三", status="rest")
    r = client.post("/api/employees/merge", json={
        "source_id": a["id"],
        "target_id": b["id"],
        "resolutions": [],
    })
    assert r.status_code == 400
