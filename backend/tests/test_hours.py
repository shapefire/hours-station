from datetime import time
from decimal import Decimal
import pytest
from app.services.hours import effective_hours, DEFAULT_TIERS

def test_default_under_six_no_deduction():
    assert effective_hours(time(9, 0), time(14, 30), DEFAULT_TIERS) == Decimal("5.5")

def test_default_exactly_six_deducts_half():
    assert effective_hours(time(9, 0), time(15, 0), DEFAULT_TIERS) == Decimal("5.5")

def test_default_full_day_example():
    assert effective_hours(time(7, 30), time(16, 0), DEFAULT_TIERS) == Decimal("8.0")

def test_custom_threshold():
    tiers = [(Decimal("8.0"), Decimal("1.0"))]
    assert effective_hours(time(9, 0), time(16, 0), tiers) == Decimal("7.0")  # raw 7 < 8
    assert effective_hours(time(9, 0), time(18, 0), tiers) == Decimal("8.0")  # raw 9 - 1

def test_deduct_zero_means_no_deduction():
    tiers = [(Decimal("6.0"), Decimal("0"))]
    assert effective_hours(time(7, 30), time(16, 0), tiers) == Decimal("8.5")

def test_tier_match_highest_min_first():
    tiers = [
        (Decimal("6.0"), Decimal("0.5")),
        (Decimal("10.0"), Decimal("1.0")),
    ]
    # raw 10.0 -> match 10.0 tier
    assert effective_hours(time(8, 0), time(18, 0), tiers) == Decimal("9.0")

def test_boundary_min_hours_24():
    tiers = [(Decimal("24.0"), Decimal("0.5"))]
    assert effective_hours(time(0, 0), time(23, 0), tiers) == Decimal("23.0")  # no match

def test_end_not_after_start_raises():
    with pytest.raises(ValueError):
        effective_hours(time(16, 0), time(7, 30), DEFAULT_TIERS)
