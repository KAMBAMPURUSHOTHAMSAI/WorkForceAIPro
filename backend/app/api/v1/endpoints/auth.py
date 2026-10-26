import logging
import os
import secrets
import uuid

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.security import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    REFRESH_TOKEN_EXPIRE_DAYS,
    create_access_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.db.session import get_db
from app.models.employee import Employee
from app.models.password_reset_token import PasswordResetToken
from app.models.refresh_session import RefreshSession
from app.models.user import User
from app.schemas.auth import (
    ForgotPasswordRequest,
    MessageResponse,
    PasswordResetRequest,
    RefreshTokenRequest,
    TokenResponse,
    UserRegister,
    UserResponse,
    UserProfileUpdate,
)
from app.services.email_service import send_password_reset_email


router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
)

logger = logging.getLogger(__name__)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)

    return value.astimezone(timezone.utc)


def build_token_response(
    user: User,
    refresh_token: str,
) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(
            user.id,
            token_version=int(user.token_version or 0),
        ),
        refresh_token=refresh_token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


def create_refresh_session(
    user_id: int,
    refresh_token: str,
    family_id: str,
) -> RefreshSession:
    return RefreshSession(
        user_id=user_id,
        token_hash=hash_token(refresh_token),
        family_id=family_id,
        expires_at=utc_now()
        + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    )


def revoke_session_family(
    db: Session,
    family_id: str,
    now: datetime,
) -> None:
    db.query(RefreshSession).filter(
        RefreshSession.family_id == family_id,
        RefreshSession.revoked_at.is_(None),
    ).update(
        {"revoked_at": now},
        synchronize_session=False,
    )


def create_employee_code(db: Session) -> str:
    """Generate a unique employee code for a new employee profile."""
    for _ in range(10):
        code = f"EMP-{uuid.uuid4().hex[:10].upper()}"

        exists = (
            db.query(Employee.id)
            .filter(Employee.employee_code == code)
            .first()
        )

        if not exists:
            return code

    raise RuntimeError("Could not generate a unique employee code")


def provision_employee_profile(
    db: Session,
    user: User,
    existing_employee: Employee | None = None,
) -> Employee:
    """
    Link an existing unlinked employee record when possible.
    Otherwise create a profile linked to the new user account.
    """
    if existing_employee is not None:
        if existing_employee.user_id is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Employee profile is already linked to another account",
            )

        existing_employee.user_id = user.id
        return existing_employee

    full_name = (user.full_name or "").strip()
    name_parts = full_name.split()

    first_name = name_parts[0][:100] if name_parts else "Employee"

    # If the user provided only one name, use a visible placeholder.
    # HR can update the employee's actual surname later.
    last_name = " ".join(name_parts[1:])[:100] or "N/A"

    employee = Employee(
        employee_code=create_employee_code(db),
        first_name=first_name,
        last_name=last_name,
        email=user.email,
        employment_type="FULL_TIME",
        employment_status="ACTIVE",
        base_salary=0,
        department_id=None,
        manager_id=None,
        user_id=user.id,
    )

    db.add(employee)
    return employee


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_user(
    payload: UserRegister,
    db: Session = Depends(get_db),
):
    normalized_email = str(payload.email).strip().lower()
    normalized_name = payload.full_name.strip()

    if len(normalized_name) < 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Full name must contain at least 2 characters",
        )

    existing_user = (
        db.query(User)
        .filter(func.lower(User.email) == normalized_email)
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    # Reuse an existing employee record with the same email if it
    # has not yet been linked to a User account.
    existing_employee = (
        db.query(Employee)
        .filter(func.lower(Employee.email) == normalized_email)
        .first()
    )

    if (
        existing_employee is not None
        and existing_employee.user_id is not None
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This employee email is already linked to an account",
        )

    user = User(
        full_name=normalized_name,
        email=normalized_email,
        password_hash=hash_password(payload.password),
        role="EMPLOYEE",
        is_active=True,
        token_version=0,
    )

    try:
        db.add(user)
        db.flush()

        provision_employee_profile(
            db,
            user,
            existing_employee,
        )

        db.commit()
        db.refresh(user)

    except HTTPException:
        db.rollback()
        raise

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Account or employee profile conflicts with existing data",
        )

    except Exception:
        db.rollback()
        logger.exception("Registration failed")
        raise

    return user


@router.post("/login", response_model=TokenResponse)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    normalized_email = form_data.username.strip().lower()

    user = (
        db.query(User)
        .filter(func.lower(User.email) == normalized_email)
        .first()
    )

    if (
        user is None
        or not verify_password(
            form_data.password,
            user.password_hash,
        )
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account is inactive",
        )

    refresh_token = secrets.token_urlsafe(48)
    family_id = str(uuid.uuid4())

    db.add(
        create_refresh_session(
            user.id,
            refresh_token,
            family_id,
        )
    )

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to create login session",
        )

    return build_token_response(user, refresh_token)


@router.post("/refresh", response_model=TokenResponse)
def refresh_access_token(
    payload: RefreshTokenRequest,
    db: Session = Depends(get_db),
):
    session = (
        db.query(RefreshSession)
        .filter(
            RefreshSession.token_hash == hash_token(
                payload.refresh_token
            )
        )
        .with_for_update()
        .first()
    )

    if session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    now = utc_now()

    if session.revoked_at is not None:
        revoke_session_family(db, session.family_id, now)
        db.commit()

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has already been used",
        )

    if as_utc(session.expires_at) <= now:
        session.revoked_at = now
        db.commit()

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has expired",
        )

    user = db.get(User, session.user_id)

    if user is None or not user.is_active:
        revoke_session_family(db, session.family_id, now)
        session.revoked_at = now
        db.commit()

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is unavailable",
        )

    session.revoked_at = now

    new_refresh_token = secrets.token_urlsafe(48)

    db.add(
        create_refresh_session(
            user.id,
            new_refresh_token,
            session.family_id,
        )
    )

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unable to refresh session",
        )

    return build_token_response(user, new_refresh_token)


@router.post("/logout", response_model=MessageResponse)
def logout(
    payload: RefreshTokenRequest,
    db: Session = Depends(get_db),
):
    session = (
        db.query(RefreshSession)
        .filter(
            RefreshSession.token_hash == hash_token(
                payload.refresh_token
            )
        )
        .with_for_update()
        .first()
    )

    if session is not None and session.revoked_at is None:
        session.revoked_at = utc_now()
        db.commit()

    return MessageResponse(message="Logged out successfully")


@router.post(
    "/forgot-password",
    response_model=MessageResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def forgot_password(
    payload: ForgotPasswordRequest,
    db: Session = Depends(get_db),
):
    generic_response = MessageResponse(
        message=(
            "If an active account exists for this email, "
            "password reset instructions will be sent."
        )
    )

    normalized_email = str(payload.email).strip().lower()

    user = (
        db.query(User)
        .filter(func.lower(User.email) == normalized_email)
        .first()
    )

    if user is None or not user.is_active:
        return generic_response

    now = utc_now()
    raw_token = secrets.token_urlsafe(48)

    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.used_at.is_(None),
    ).update(
        {"used_at": now},
        synchronize_session=False,
    )

    reset_record = PasswordResetToken(
        user_id=user.id,
        token_hash=hash_token(raw_token),
        expires_at=now + timedelta(minutes=20),
    )

    db.add(reset_record)
    db.commit()

    frontend_url = os.getenv(
        "FRONTEND_URL",
        "http://localhost:5173",
    ).rstrip("/")

    reset_url = (
        f"{frontend_url}/reset-password?token={raw_token}"
    )

    try:
        send_password_reset_email(
            recipient=user.email,
            reset_url=reset_url,
        )
    except Exception:
        logger.exception("Unable to send password reset email")

        reset_record.used_at = utc_now()
        db.commit()

    return generic_response


@router.post(
    "/reset-password",
    response_model=MessageResponse,
)
def reset_password(
    payload: PasswordResetRequest,
    db: Session = Depends(get_db),
):
    reset_record = (
        db.query(PasswordResetToken)
        .filter(
            PasswordResetToken.token_hash == hash_token(
                payload.token
            )
        )
        .with_for_update()
        .first()
    )

    now = utc_now()

    if (
        reset_record is None
        or reset_record.used_at is not None
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset token",
        )

    if as_utc(reset_record.expires_at) <= now:
        reset_record.used_at = now
        db.commit()

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset token",
        )

    user = db.get(User, reset_record.user_id)

    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset token",
        )

    user.password_hash = hash_password(payload.new_password)
    user.token_version = int(user.token_version or 0) + 1

    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.used_at.is_(None),
    ).update(
        {"used_at": now},
        synchronize_session=False,
    )

    db.query(RefreshSession).filter(
        RefreshSession.user_id == user.id,
        RefreshSession.revoked_at.is_(None),
    ).update(
        {"revoked_at": now},
        synchronize_session=False,
    )

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    return MessageResponse(
        message="Password reset successfully. Please log in again."
    )


@router.get("/me", response_model=UserResponse)
def get_my_profile(
    current_user: User = Depends(get_current_user),
):
    return current_user

@router.patch("/me", response_model=UserResponse)
def update_my_profile(
    payload: UserProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    changes = payload.model_dump(exclude_unset=True)

    if not changes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide at least one field to update",
        )

    for field, value in changes.items():
        if value is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{field} cannot be null",
            )

    full_name = changes.get("full_name")
    email = changes.get("email")

    if full_name is not None:
        full_name = full_name.strip()

        if len(full_name) < 2:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Full name must contain at least 2 characters",
            )

    if email is not None:
        email = str(email).strip().lower()

        duplicate = (
            db.query(User.id)
            .filter(
                func.lower(User.email) == email,
                User.id != current_user.id,
            )
            .first()
        )

        if duplicate:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This email is already used by another account",
            )

    linked_employee = (
        db.query(Employee)
        .filter(Employee.user_id == current_user.id)
        .first()
    )

    if email is not None:
        employee_duplicate_query = db.query(Employee.id).filter(
            func.lower(Employee.email) == email
        )

        if linked_employee is not None:
            employee_duplicate_query = employee_duplicate_query.filter(
                Employee.id != linked_employee.id
            )

        if employee_duplicate_query.first():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This email is already used by another employee",
            )

        current_user.email = email

        if linked_employee is not None:
            linked_employee.email = email

    if full_name is not None:
        current_user.full_name = full_name

        if linked_employee is not None:
            name_parts = full_name.split()

            linked_employee.first_name = name_parts[0][:100]
            linked_employee.last_name = (
                " ".join(name_parts[1:])[:100] or "N/A"
            )

    try:
        db.commit()
        db.refresh(current_user)
    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Profile update conflicts with existing data",
        )

    return current_user