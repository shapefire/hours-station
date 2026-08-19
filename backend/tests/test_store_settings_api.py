def test_store_name_default_and_update(client):
    r = client.get("/api/settings/store")
    assert r.status_code == 200
    assert r.json()["store_name"] == "东圃地铁站"
    u = client.put("/api/settings/store", json={"store_name": " 东圃地铁站 "})
    assert u.status_code == 200
    assert u.json()["store_name"] == "东圃地铁站"
    bad = client.put("/api/settings/store", json={"store_name": ""})
    assert bad.status_code == 400
