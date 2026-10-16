from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import TriplePayDayOut, TriplePayDayPut
from app.services.triple_pay_days import set_triple_pay_day

router = APIRouter(prefix="/api/triple-pay-days", tags=["triple-pay-days"])


@router.put("/{work_date}", response_model=TriplePayDayOut)
def set_triple_pay(work_date: date, payload: TriplePayDayPut, db: Session = Depends(get_db)):
    is_triple_pay = set_triple_pay_day(db, work_date, payload.is_triple_pay)
    return TriplePayDayOut(work_date=work_date, is_triple_pay=is_triple_pay)
