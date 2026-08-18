def test_put_and_get_day_note(client):
    r = client.put("/api/day-notes/2026-08-01", json={"note": "来货"})
    assert r.status_code == 200
    assert r.json()["note"] == "来货"
    g = client.get("/api/day-notes", params={"date": "2026-08-01"})
    assert g.json()["note"] == "来货"


def test_empty_note_deletes(client):
    client.put("/api/day-notes/2026-08-01", json={"note": "来货"})
    r = client.put("/api/day-notes/2026-08-01", json={"note": "  "})
    assert r.status_code == 200
    assert r.json()["note"] is None
