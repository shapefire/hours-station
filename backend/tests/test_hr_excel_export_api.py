from urllib.parse import unquote


def test_export_download_headers(client):
    client.post(
        "/api/entries",
        json={
            "work_date": "2026-07-02",
            "name": "苑菱",
            "start_time": "08:00",
            "end_time": "16:00",
        },
    )
    r = client.get("/api/stats/monthly/export", params={"year": 2026, "month": 7})
    assert r.status_code == 200
    assert "spreadsheetml.sheet" in r.headers["content-type"]
    cd = r.headers.get("content-disposition", "")
    assert "7月份.xlsx" in unquote(cd)
    assert r.content[:2] == b"PK"


def test_export_empty_month(client):
    r = client.get("/api/stats/monthly/export", params={"year": 2026, "month": 6})
    assert r.status_code == 200
    assert r.content[:2] == b"PK"
