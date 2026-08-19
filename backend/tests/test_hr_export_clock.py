from datetime import time
from decimal import Decimal
from types import SimpleNamespace

from app.services.hr_export_clock import clock_in_out_for_entry, excel_hour_value, time_to_hour_number


def _e(**kwargs):
    base = dict(
        status="on_duty",
        start_time=None,
        end_time=None,
        ot_start_time=None,
        ot_end_time=None,
        skip_deduction=False,
    )
    base.update(kwargs)
    return SimpleNamespace(**base)


def test_time_to_hour_number():
    assert time_to_hour_number(time(7, 30)) == Decimal("7.5")
    assert time_to_hour_number(time(16, 0)) == Decimal("16.0")
    assert excel_hour_value(Decimal("16.0")) == 16
    assert excel_hour_value(Decimal("7.5")) == 7.5


def test_on_duty_adds_half_hour_when_not_skip():
    inn, out = clock_in_out_for_entry(_e(
        start_time=time(7, 30), end_time=time(16, 0),
    ))
    assert inn == Decimal("8.0")
    assert out == Decimal("16.0")


def test_on_duty_skip_meal_keeps_start():
    inn, out = clock_in_out_for_entry(_e(
        start_time=time(7, 30), end_time=time(16, 0), skip_deduction=True,
    ))
    assert inn == Decimal("7.5")
    assert out == Decimal("16.0")


def test_on_duty_ot_adds_to_clock_out():
    inn, out = clock_in_out_for_entry(_e(
        start_time=time(7, 30), end_time=time(16, 0),
        ot_start_time=time(22, 0), ot_end_time=time(23, 30),
    ))
    assert inn == Decimal("8.0")
    assert out == Decimal("17.5")


def test_support_same_as_on_duty():
    inn, out = clock_in_out_for_entry(_e(
        status="support", start_time=time(11, 0), end_time=time(19, 0),
    ))
    assert inn == Decimal("11.5")
    assert out == Decimal("19.0")


def test_rest_without_ot_blank():
    assert clock_in_out_for_entry(_e(status="rest")) == (None, None)


def test_rest_ot_only_no_half_hour():
    inn, out = clock_in_out_for_entry(_e(
        status="rest", ot_start_time=time(22, 0), ot_end_time=time(23, 30),
    ))
    assert inn == Decimal("22.0")
    assert out == Decimal("23.5")


def test_on_duty_missing_main_times_blank():
    assert clock_in_out_for_entry(_e(status="on_duty")) == (None, None)
