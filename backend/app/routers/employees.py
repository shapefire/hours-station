from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import EmployeeOut
from app.services import employees as employees_service

router = APIRouter(prefix="/api/employees", tags=["employees"])


@router.get("", response_model=list[EmployeeOut])
def list_employees(
    q: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    return employees_service.list_employees(db, q=q)
