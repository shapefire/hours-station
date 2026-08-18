from app.services.skip_deduction_note import apply_skip_deduction_note


def test_append_on_empty():
    assert apply_skip_deduction_note(None, True) == "没吃饭不扣减"
    assert apply_skip_deduction_note("", True) == "没吃饭不扣减"


def test_append_with_existing():
    assert apply_skip_deduction_note("制备位", True) == "制备位、没吃饭不扣减"


def test_no_duplicate():
    assert apply_skip_deduction_note("制备位、没吃饭不扣减", True) == "制备位、没吃饭不扣减"


def test_replace_legacy_phrase():
    assert apply_skip_deduction_note("制备位、未休息不扣减", True) == "制备位、没吃饭不扣减"


def test_remove_phrase():
    assert apply_skip_deduction_note("制备位、没吃饭不扣减", False) == "制备位"
    assert apply_skip_deduction_note("没吃饭不扣减", False) is None
    assert apply_skip_deduction_note("制备位、未休息不扣减", False) == "制备位"
