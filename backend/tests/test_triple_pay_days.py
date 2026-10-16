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
