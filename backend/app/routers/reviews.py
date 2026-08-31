from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import EmployeeMonthReviewOut, ReviewSubmitIn, ReviewSubmitOut
from app.services.reviews import get_employee_month, submit_monthly_review

router = APIRouter(prefix="/api/reviews", tags=["reviews"])


@router.get("/employee-month", response_model=EmployeeMonthReviewOut)
def employee_month(
    name: str = Query(...),
    year: int = Query(..., ge=1),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
):
    try:
        return get_employee_month(db, name=name, year=year, month=month)
    except KeyError as exc:
        raise HTTPException(404, detail=str(exc.args[0])) from exc


@router.post("/submit", response_model=ReviewSubmitOut)
def submit(payload: ReviewSubmitIn, db: Session = Depends(get_db)):
    try:
        return submit_monthly_review(db, **payload.model_dump())
    except KeyError as exc:
        raise HTTPException(404, detail=str(exc.args[0])) from exc
    except LookupError as exc:
        raise HTTPException(409, detail=str(exc.args[0])) from exc
    except ValueError as exc:
        raise HTTPException(400, detail=str(exc.args[0])) from exc
