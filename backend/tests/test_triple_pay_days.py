from datetime import date

from app.services.triple_pay_days import (
    list_triple_pay_dates,
    set_triple_pay_day,
    triple_pay_dates_between,
)


def test_set_and_unset_triple_pay_day(db):
    d = date(2026, 9, 1)
    assert set_triple_pay_day(db, d, True) is True
    assert list_triple_pay_dates(db, 2026, 9) == [d]
    assert set_triple_pay_day(db, d, False) is False
    assert list_triple_pay_dates(db, 2026, 9) == []
    assert set_triple_pay_day(db, d, False) is False  # 幂等取消


def test_triple_pay_dates_between_range(db):
    for d in (date(2026, 8, 31), date(2026, 9, 1), date(2026, 9, 30)):
        set_triple_pay_day(db, d, True)
    assert triple_pay_dates_between(db, date(2026, 9, 1), date(2026, 9, 30)) == {
        date(2026, 9, 1),
        date(2026, 9, 30),
    }


def test_put_triple_pay_day_and_calendar(client):
    r = client.put("/api/triple-pay-days/2026-09-01", json={"is_triple_pay": True})
    assert r.status_code == 200
    assert r.json() == {"work_date": "2026-09-01", "is_triple_pay": True}
    cal = client.get("/api/calendar?year=2026&month=9").json()
    assert "2026-09-01" in cal["triple_pay_dates"]
    client.put("/api/triple-pay-days/2026-09-01", json={"is_triple_pay": False})
    cal = client.get("/api/calendar?year=2026&month=9").json()
    assert cal["triple_pay_dates"] == []
