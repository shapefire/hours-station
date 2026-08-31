from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from uuid import UUID

from app.db import get_db
from app.schemas import AdminDisputeOut, EmployeeMonthReviewOut, ReviewSubmitIn, ReviewSubmitOut
from app.services.reviews import (
    confirm_dispute,
    get_employee_month,
    list_disputes,
    reject_dispute,
    submit_monthly_review,
)

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


@router.get("/disputes", response_model=list[AdminDisputeOut])
def disputes(
    status: str | None = Query(None),
    year: int | None = Query(None, ge=1),
    month: int | None = Query(None, ge=1, le=12),
    db: Session = Depends(get_db),
):
    return list_disputes(db, status=status, year=year, month=month)


@router.post("/disputes/{dispute_id}/confirm", response_model=AdminDisputeOut)
def confirm(dispute_id: UUID, db: Session = Depends(get_db)):
    try:
        return confirm_dispute(db, dispute_id)
    except KeyError as exc:
        raise HTTPException(404, detail=str(exc.args[0])) from exc
    except LookupError as exc:
        raise HTTPException(409, detail=str(exc.args[0])) from exc
    except ValueError as exc:
        raise HTTPException(400, detail=str(exc.args[0])) from exc


@router.post("/disputes/{dispute_id}/reject", response_model=AdminDisputeOut)
def reject(dispute_id: UUID, db: Session = Depends(get_db)):
    try:
        return reject_dispute(db, dispute_id)
    except KeyError as exc:
        raise HTTPException(404, detail=str(exc.args[0])) from exc
    except LookupError as exc:
        raise HTTPException(409, detail=str(exc.args[0])) from exc
