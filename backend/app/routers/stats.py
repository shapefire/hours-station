from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import StatsEmployeeDaysOut, StatsMonthlyOut
from app.services import stats as stats_service

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("/monthly", response_model=StatsMonthlyOut)
def get_monthly_stats(
    year: int = Query(..., ge=1),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
):
    return stats_service.monthly_stats(db, year=year, month=month)


@router.get("/monthly/{employee_id}/days", response_model=StatsEmployeeDaysOut)
def get_employee_month_days(
    employee_id: UUID,
    year: int = Query(..., ge=1),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
):
    try:
        return stats_service.employee_month_days(
            db, employee_id=employee_id, year=year, month=month
        )
    except KeyError as exc:
        detail = str(exc.args[0]) if exc.args else "员工不存在"
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail) from exc
