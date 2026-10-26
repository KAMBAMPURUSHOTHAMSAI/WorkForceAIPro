"""Isolated tests for WebSocket notification connection management."""
import asyncio
from datetime import datetime

from fastapi import WebSocketDisconnect

from app.services.notification_service import NotificationConnectionManager, notification_payload


class FakeWebSocket:
    def __init__(self, *, fail_send: bool = False):
        self.accepted = False
        self.sent = []
        self.fail_send = fail_send

    async def accept(self):
        self.accepted = True

    async def send_json(self, event):
        if self.fail_send:
            raise WebSocketDisconnect(code=1001)
        self.sent.append(event)


def test_connect_accepts_and_registers_socket():
    manager = NotificationConnectionManager()
    socket = FakeWebSocket()
    asyncio.run(manager.connect(12, socket))
    assert socket.accepted is True
    assert manager.connections[12] == [socket]


def test_disconnect_removes_socket_and_empty_user_bucket():
    manager = NotificationConnectionManager()
    socket = FakeWebSocket()
    asyncio.run(manager.connect(12, socket))
    manager.disconnect(12, socket)
    assert 12 not in manager.connections


def test_send_to_user_delivers_event_to_connected_socket():
    manager = NotificationConnectionManager()
    socket = FakeWebSocket()
    asyncio.run(manager.connect(12, socket))
    asyncio.run(manager.send_to_user(12, {"event": "test"}))
    assert socket.sent == [{"event": "test"}]


def test_send_to_user_cleans_stale_socket():
    manager = NotificationConnectionManager()
    socket = FakeWebSocket(fail_send=True)
    asyncio.run(manager.connect(12, socket))
    asyncio.run(manager.send_to_user(12, {"event": "test"}))
    assert 12 not in manager.connections


def test_notification_payload_serializes_read_and_created_times():
    class Notification:
        id = 5
        user_id = 12
        notification_type = "GENERAL"
        title = "Test notification"
        message = "This is a test."
        priority = "NORMAL"
        read_status = False
        read_at = None
        created_at = datetime(2026, 10, 25, 12, 0, 0)

    payload = notification_payload(Notification())
    assert payload["id"] == 5
    assert payload["read_at"] is None
    assert payload["created_at"] == "2026-10-25T12:00:00"
