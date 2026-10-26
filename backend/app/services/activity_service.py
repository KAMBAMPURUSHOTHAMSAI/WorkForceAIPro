from typing import Any

from fastapi import WebSocket, WebSocketDisconnect


class ActivityConnectionManager:
    def __init__(self) -> None:
        self.connections: dict[WebSocket, dict[str, Any]] = {}

    async def connect(self, user, websocket: WebSocket) -> None:
        await websocket.accept()

        employee = user.employee

        self.connections[websocket] = {
            "user_id": user.id,
            "role": user.role,
            "employee_id": employee.id if employee else None,
        }

    def disconnect(self, websocket: WebSocket) -> None:
        self.connections.pop(websocket, None)

    async def broadcast(self, activity: dict[str, Any]) -> None:
        event = {
            "event": "activity",
            "data": activity,
        }

        stale_connections = []

        for websocket, user_info in list(self.connections.items()):
            is_admin_or_hr = user_info["role"] in ("ADMIN", "HR")

            is_own_activity = (
                user_info["user_id"] == activity.get("actor_user_id")
                or (
                    user_info["employee_id"] is not None
                    and user_info["employee_id"]
                    == activity.get("employee_id")
                )
            )

            # HR/Admin receive organization-wide updates.
            # Other users receive only their own related activities.
            if not is_admin_or_hr and not is_own_activity:
                continue

            try:
                await websocket.send_json(event)
            except (WebSocketDisconnect, RuntimeError, OSError):
                stale_connections.append(websocket)

        for websocket in stale_connections:
            self.disconnect(websocket)


activity_manager = ActivityConnectionManager()


def activity_payload(activity) -> dict[str, Any]:
    return {
        "id": activity.id,
        "employee_id": activity.employee_id,
        "actor_user_id": activity.actor_user_id,
        "activity_type": activity.activity_type,
        "description": activity.description,
        "activity_data": activity.activity_data,
        "source": activity.source,
        "created_at": (
            activity.created_at.isoformat()
            if activity.created_at
            else None
        ),
    }