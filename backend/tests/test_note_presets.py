from app.models import NotePreset


def test_note_presets_crud(client):
    empty = client.get("/api/settings/note-presets")
    assert empty.status_code == 200
    assert empty.json() == []

    created = client.post("/api/settings/note-presets", json={"text": "  加班  "})
    assert created.status_code == 201
    body = created.json()
    assert body["text"] == "加班"
    assert "id" in body

    again = client.post("/api/settings/note-presets", json={"text": "加班"})
    assert again.status_code == 201
    assert again.json()["id"] == body["id"]

    listed = client.get("/api/settings/note-presets")
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["text"] == "加班"

    bad = client.post("/api/settings/note-presets", json={"text": "   "})
    assert bad.status_code == 400

    deleted = client.delete(f"/api/settings/note-presets/{body['id']}")
    assert deleted.status_code == 204

    after = client.get("/api/settings/note-presets")
    assert after.json() == []

    missing = client.delete(f"/api/settings/note-presets/{body['id']}")
    assert missing.status_code == 404
