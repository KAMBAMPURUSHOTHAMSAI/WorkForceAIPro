from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_roles
from app.db.session import get_db
from app.models.refresh_session import RefreshSession
from app.models.user import User
from app.schemas.user_admin import (
    AllowedRole,
    UserAdminResponse,
    UserAdminUpdate,
)


router = APIRouter(prefix="/users", tags=["User Management"])


@router.get("", response_model=list[UserAdminResponse])
def list_users(
    search: str | None = Query(default=None, max_length=150),
    role: AllowedRole | None = None,
    is_active: bool | None = None,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("ADMIN")),
):
    query = db.query(User)

    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        query = query.filter(
            or_(
                func.lower(User.full_name).like(term),
                func.lower(User.email).like(term),
            )
        )

    if role is not None:
        query = query.filter(User.role == role)

    if is_active is not None:
        query = query.filter(User.is_active.is_(is_active))

    return (
        query.order_by(User.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.get("/{user_id}", response_model=UserAdminResponse)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("ADMIN")),
):
    user = db.get(User, user_id)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return user


@router.patch("/{user_id}", response_model=UserAdminResponse)
def update_user(
    user_id: int,
    payload: UserAdminUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: User = Depends(require_roles("ADMIN")),
):
    user = db.get(User, user_id)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    changes = payload.model_dump(exclude_unset=True)

    if not changes or all(value is None for value in changes.values()):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide at least one non-null field to update",
        )

    new_name = changes.get("full_name")
    new_email = changes.get("email")
    new_role = changes.get("role")
    new_active = changes.get("is_active")

    # Validate names after trimming whitespace.
    if new_name is not None:
        new_name = new_name.strip()

        if len(new_name) < 2:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Full name must contain at least 2 characters",
            )

    if new_email is not None:
        new_email = str(new_email).strip().lower()

        duplicate = (
            db.query(User.id)
            .filter(
                func.lower(User.email) == new_email,
                User.id != user.id,
            )
            .first()
        )

        if duplicate:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email already exists",
            )

    proposed_role = new_role if new_role is not None else user.role
    proposed_active = new_active if new_active is not None else user.is_active

    # Prevent administrators from locking themselves out.
    if user.id == current_user.id:
        if proposed_role != "ADMIN" or proposed_active is False:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot change your own Admin role or deactivate your account",
            )

    # Never remove the final active administrator.
    would_remove_active_admin = (
        user.role == "ADMIN"
        and user.is_active
        and (proposed_role != "ADMIN" or not proposed_active)
    )

    if would_remove_active_admin:
        active_admins = (
            db.query(User.id)
            .filter(
                User.role == "ADMIN",
                User.is_active.is_(True),
            )
            .count()
        )

        if active_admins <= 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="At least one active Admin account must remain",
            )

    role_changed = (
        new_role is not None and new_role != user.role
    )
    status_changed = (
        new_active is not None and new_active != user.is_active
    )

    if new_name is not None:
        user.full_name = new_name

    if new_email is not None:
        user.email = new_email

    if new_role is not None:
        user.role = new_role

    if new_active is not None:
        user.is_active = new_active

    # Role/status changes invalidate existing access tokens and
    # revoke refresh sessions. The user must log in again.
    if role_changed or status_changed:
        user.token_version = int(user.token_version or 0) + 1

        db.query(RefreshSession).filter(
            RefreshSession.user_id == user.id,
            RefreshSession.revoked_at.is_(None),
        ).update(
            {"revoked_at": func.now()},
            synchronize_session=False,
        )

    try:
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Could not update the user because of a data conflict",
        )

    return user