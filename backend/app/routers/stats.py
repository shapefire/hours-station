from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import StatsEmployeeDaysOut, StatsMonthlyOut
from app.services import stats as stats_service
from app.services.hr_excel_export import build_export_workbook, export_filename
from app.services.settings import get_store_name

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("/monthly", response_model=StatsMonthlyOut)
def get_monthly_stats(
    year: int = Query(..., ge=1),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
):
    return stats_service.monthly_stats(db, year=year, month=month)


@router.get("/monthly/export")
def export_monthly_hr_excel(
    year: int = Query(..., ge=1),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
):
    raw = build_export_workbook(db, year, month)
    filename = export_filename(get_store_name(db), month)
    encoded = quote(filename)
    disposition = f'attachment; filename="{encoded}"; filename*=UTF-8\'\'{encoded}'
    return Response(
        content=raw,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": disposition},
    )


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
