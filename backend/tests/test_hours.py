from datetime import time
from decimal import Decimal
import pytest
from app.services.hours import effective_hours

def test_under_six_no_deduction():
    assert effective_hours(time(9, 0), time(14, 30)) == Decimal("5.5")

def test_exactly_six_deducts_half():
    assert effective_hours(time(9, 0), time(15, 0)) == Decimal("5.5")

def test_full_day_example():
    # 7:30-16:00 = 8.5 raw -> 8.0
    assert effective_hours(time(7, 30), time(16, 0)) == Decimal("8.0")

def test_end_not_after_start_raises():
    with pytest.raises(ValueError):
        effective_hours(time(16, 0), time(7, 30))
