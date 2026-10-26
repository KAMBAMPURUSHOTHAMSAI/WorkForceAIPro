import jwt

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    WebSocket,
    WebSocketDisconnect,
)
from jwt.exceptions import InvalidTokenError
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_roles
from app.core.security import ALGORITHM, SECRET_KEY
from app.db.session import SessionLocal, get_db
from app.models.employee import Employee
from app.models.user import User
from app.models.workforce_activity import WorkforceActivity
from app.schemas.workforce_activity import (
    WorkforceActivityCreate,
    WorkforceActivityResponse,
)
from app.services.activity_service import (
    activity_manager,
    activity_payload,
)


router = APIRouter(
    prefix="/workforce-activities",
    tags=["Workforce Activity"],
)


@router.get(
    "",
    response_model=list[WorkforceActivityResponse],
)
def list_activities(
    activity_type: str | None = Query(default=None, max_length=80),
    before_id: int | None = Query(default=None, gt=0),
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(WorkforceActivity)

    if current_user.role not in ("ADMIN", "HR"):
        conditions = [
            WorkforceActivity.actor_user_id == current_user.id
        ]

        employee = current_user.employee

        if employee is not None:
            conditions.append(
                WorkforceActivity.employee_id == employee.id
            )

        query = query.filter(or_(*conditions))

    if activity_type:
        query = query.filter(
            WorkforceActivity.activity_type == activity_type
        )

    if before_id is not None:
        query = query.filter(
            WorkforceActivity.id < before_id
        )

    return (
        query
        .order_by(
            WorkforceActivity.created_at.desc(),
            WorkforceActivity.id.desc(),
        )
        .limit(limit)
        .all()
    )


@router.post(
    "",
    response_model=WorkforceActivityResponse,
    status_code=201,
)
async def create_activity(
    payload: WorkforceActivityCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles("ADMIN", "HR")
    ),
):
    if payload.employee_id is not None:
        employee = db.get(Employee, payload.employee_id)

        if employee is None:
            raise HTTPException(
                status_code=404,
                detail="Employee not found",
            )

    activity_type = payload.activity_type.strip()
    description = payload.description.strip()

    if len(activity_type) < 2 or not description:
        raise HTTPException(
            status_code=422,
            detail="Activity type and description cannot be empty",
        )

    activity = WorkforceActivity(
        employee_id=payload.employee_id,
        actor_user_id=current_user.id,
        activity_type=activity_type,
        description=description,
        activity_data=payload.activity_data,
        source="APPLICATION",
    )

    try:
        db.add(activity)
        db.commit()
        db.refresh(activity)
    except Exception:
        db.rollback()
        raise

    event_data = activity_payload(activity)

    await activity_manager.broadcast(event_data)

    return activity


@router.websocket("/ws")
async def activity_websocket(
    websocket: WebSocket,
    token: str = Query(...),
):
    db = SessionLocal()
    user = None

    try:
        try:
            payload = jwt.decode(
                token,
                SECRET_KEY,
                algorithms=[ALGORITHM],
            )

            subject = payload.get("sub")
            token_version = payload.get("ver", 0)

            if subject is None:
                await websocket.close(code=4401)
                return

            if (
                type(token_version) is not int
                or token_version < 0
            ):
                await websocket.close(code=4401)
                return

            user_id = int(subject)
            user = db.get(User, user_id)

        except (
            InvalidTokenError,
            ValueError,
            TypeError,
            KeyError,
        ):
            await websocket.close(code=4401)
            return

        if (
            user is None
            or not user.is_active
            or int(user.token_version or 0) != token_version
        ):
            await websocket.close(code=4401)
            return

        await activity_manager.connect(user, websocket)

        await websocket.send_json({
            "event": "connected",
            "data": {"user_id": user.id},
        })

        # Keep the connection open for incoming activity events.
        while True:
            await websocket.receive_text()

    except WebSocketDisconnect:
        pass

    finally:
        activity_manager.disconnect(websocket)
        db.close()