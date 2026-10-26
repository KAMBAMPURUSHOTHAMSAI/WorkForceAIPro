from fastapi import WebSocket, WebSocketDisconnect


class NotificationConnectionManager:
    """Manage authenticated notification WebSocket connections."""

    def __init__(self) -> None:
        self.connections: dict[int, list[WebSocket]] = {}

    async def connect(
        self,
        user_id: int,
        websocket: WebSocket,
    ) -> None:
        await websocket.accept()

        self.connections.setdefault(user_id, []).append(websocket)

    def disconnect(
        self,
        user_id: int,
        websocket: WebSocket,
    ) -> None:
        user_connections = self.connections.get(user_id, [])

        if websocket in user_connections:
            user_connections.remove(websocket)

        if not user_connections:
            self.connections.pop(user_id, None)

    async def send_to_user(
        self,
        user_id: int,
        event: dict,
    ) -> None:
        connections = list(self.connections.get(user_id, []))
        stale_connections = []

        for websocket in connections:
            try:
                await websocket.send_json(event)
            except (WebSocketDisconnect, RuntimeError, OSError):
                stale_connections.append(websocket)
            except Exception:
                # Remove unexpectedly broken connections.
                stale_connections.append(websocket)

        for websocket in stale_connections:
            self.disconnect(user_id, websocket)


notification_manager = NotificationConnectionManager()


def notification_payload(notification) -> dict:
    """Serialize a notification into a WebSocket-safe payload."""

    return {
        "id": notification.id,
        "user_id": notification.user_id,
        "notification_type": notification.notification_type,
        "title": notification.title,
        "message": notification.message,
        "priority": notification.priority,
        "read_status": notification.read_status,
        "read_at": (
            notification.read_at.isoformat()
            if notification.read_at
            else None
        ),
        "created_at": (
            notification.created_at.isoformat()
            if notification.created_at
            else None
        ),
    }