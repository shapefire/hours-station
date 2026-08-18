from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import EmployeeCreate, EmployeeImportIn, EmployeeImportOut, EmployeeOut
from app.services import employees as employees_service

router = APIRouter(prefix="/api/employees", tags=["employees"])


def _exc_detail(exc: Exception) -> str:
    if exc.args:
        return str(exc.args[0])
    return str(exc)


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


@router.post("", response_model=EmployeeOut)
def create_employee(
    payload: EmployeeCreate,
    response: Response,
    db: Session = Depends(get_db),
):
    try:
        emp, outcome = employees_service.ensure_active_employee(db, payload.name)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=_exc_detail(exc)) from exc
    response.status_code = (
        status.HTTP_200_OK if outcome == "existing" else status.HTTP_201_CREATED
    )
    return EmployeeOut.model_validate(emp)


@router.post("/import", response_model=EmployeeImportOut)
def import_employees(payload: EmployeeImportIn, db: Session = Depends(get_db)):
    try:
        result = employees_service.import_employees(db, payload.text)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=_exc_detail(exc)) from exc
    return EmployeeImportOut.model_validate(result)


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_employee(employee_id: UUID, db: Session = Depends(get_db)):
    """Remove from roster (soft-delete). Historical work entries are kept."""
    try:
        employees_service.deactivate_employee(db, employee_id)
    except KeyError as exc:
        detail = str(exc.args[0]) if exc.args else "员工不存在"
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
