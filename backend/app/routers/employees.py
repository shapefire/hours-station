from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import EmployeeOut
from app.services import employees as employees_service

router = APIRouter(prefix="/api/employees", tags=["employees"])


@router.get("", response_model=list[EmployeeOut])
def list_employees(
    q: str | None = Query(default=None),
    year: int | None = Query(default=None, ge=1),
    month: int | None = Query(default=None, ge=1, le=12),
    db: Session = Depends(get_db),
):
    if (year is None) ^ (month is None):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="year 与 month 需同时提供",
        )
    rows = employees_service.list_employees(db, q=q, year=year, month=month)
    return [EmployeeOut.model_validate(row) for row in rows]


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_employee(employee_id: UUID, db: Session = Depends(get_db)):
    """Remove from roster (soft-delete). Historical work entries are kept."""
    try:
        employees_service.deactivate_employee(db, employee_id)
    except KeyError as exc:
        detail = str(exc.args[0]) if exc.args else "员工不存在"
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
