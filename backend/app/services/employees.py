from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Employee


def get_or_create_employee(db: Session, name: str) -> Employee:
    cleaned = name.strip()
    if not cleaned:
        raise ValueError("姓名不能为空")
    emp = db.scalars(select(Employee).where(Employee.name == cleaned)).one_or_none()
    if emp:
        return emp
    emp = Employee(name=cleaned)
    db.add(emp)
    db.flush()
    return emp


def list_employees(db: Session, q: str | None = None) -> list[Employee]:
    stmt = select(Employee).order_by(Employee.name)
    if q is not None and (needle := q.strip()):
        stmt = stmt.where(Employee.name.contains(needle))
    return list(db.scalars(stmt).all())
