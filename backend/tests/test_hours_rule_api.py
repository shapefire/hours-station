from decimal import Decimal
from datetime import time

from app.services.hours import effective_hours
from app.services.hours_rule_cache import get_cached_tiers


def test_get_hours_rule_default(client):
    res = client.get("/api/settings/hours-rule")
    assert res.status_code == 200
    body = res.json()
    assert len(body["tiers"]) == 1
    assert body["tiers"][0]["min_hours"] == "6.0"
    assert body["tiers"][0]["deduct_hours"] == "0.5"


def test_put_hours_rule_and_cache(client):
    res = client.put(
        "/api/settings/hours-rule",
        json={"tiers": [{"min_hours": "8.0", "deduct_hours": "1.0"}]},
    )
    assert res.status_code == 200
    assert res.json()["tiers"][0]["min_hours"] == "8.0"
    got = client.get("/api/settings/hours-rule")
    assert got.json()["tiers"][0]["deduct_hours"] == "1.0"
    assert get_cached_tiers()[0][0] == Decimal("8.0")
    assert effective_hours(time(9, 0), time(18, 0)) == Decimal("8.0")


def test_put_deduct_zero(client):
    res = client.put(
        "/api/settings/hours-rule",
        json={"tiers": [{"min_hours": "6.0", "deduct_hours": "0"}]},
    )
    assert res.status_code == 200
    assert effective_hours(time(7, 30), time(16, 0)) == Decimal("8.5")


def test_put_rejects_min_over_24(client):
    res = client.put(
        "/api/settings/hours-rule",
        json={"tiers": [{"min_hours": "24.5", "deduct_hours": "0.5"}]},
    )
    assert res.status_code == 400


def test_put_rejects_deduct_gt_min(client):
    res = client.put(
        "/api/settings/hours-rule",
        json={"tiers": [{"min_hours": "6.0", "deduct_hours": "6.5"}]},
    )
    assert res.status_code == 400


def test_put_rejects_empty_or_multi_tiers(client):
    assert client.put("/api/settings/hours-rule", json={"tiers": []}).status_code == 400
    assert (
        client.put(
            "/api/settings/hours-rule",
            json={
                "tiers": [
                    {"min_hours": "6.0", "deduct_hours": "0.5"},
                    {"min_hours": "10.0", "deduct_hours": "1.0"},
                ]
            },
        ).status_code
        == 400
    )
