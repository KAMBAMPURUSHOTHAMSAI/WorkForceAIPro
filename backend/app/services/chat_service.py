from fastapi import WebSocket


class ChatConnectionManager:
    def __init__(self):
        self.connections: dict[int, list[WebSocket]] = {}

    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        self.connections.setdefault(user_id, []).append(websocket)

    def disconnect(self, user_id: int, websocket: WebSocket):
        connections = self.connections.get(user_id, [])

        if websocket in connections:
            connections.remove(websocket)

        if not connections:
            self.connections.pop(user_id, None)

    async def send_to_user(self, user_id: int, payload: dict):
        connections = list(self.connections.get(user_id, []))
        disconnected = []

        for websocket in connections:
            try:
                await websocket.send_json(payload)
            except Exception:
                disconnected.append(websocket)

        for websocket in disconnected:
            self.disconnect(user_id, websocket)


chat_manager = ChatConnectionManager()