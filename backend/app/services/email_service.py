import os
import smtplib
from email.message import EmailMessage
from pathlib import Path

from dotenv import load_dotenv


ENV_FILE = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(ENV_FILE)


class EmailConfigurationError(RuntimeError):
    """Raised when SMTP settings are missing or invalid."""


def send_transactional_email(recipient: str, subject: str, body: str) -> None:
    """Send a plain-text transactional email using the configured SMTP server."""
    host = os.getenv("SMTP_HOST", "").strip()
    raw_port = os.getenv("SMTP_PORT", "587").strip()
    username = os.getenv("SMTP_USERNAME", "").strip()
    password = os.getenv("SMTP_PASSWORD", "")
    sender = os.getenv("SMTP_FROM_EMAIL", "").strip()

    if not all([host, username, password, sender]):
        raise EmailConfigurationError(
            "Configure SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, "
            "and SMTP_FROM_EMAIL in backend/.env"
        )

    try:
        port = int(raw_port)
    except ValueError as exc:
        raise EmailConfigurationError("SMTP_PORT must be a valid port number") from exc

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = sender
    message["To"] = recipient
    message.set_content(body)

    use_ssl = os.getenv("SMTP_USE_SSL", "false").strip().lower() == "true"
    use_tls = os.getenv("SMTP_USE_TLS", "true").strip().lower() == "true"

    if use_ssl:
        with smtplib.SMTP_SSL(host, port, timeout=15) as server:
            server.login(username, password)
            server.send_message(message)
    else:
        with smtplib.SMTP(host, port, timeout=15) as server:
            server.ehlo()
            if use_tls:
                server.starttls()
                server.ehlo()
            server.login(username, password)
            server.send_message(message)


def send_password_reset_email(recipient: str, reset_url: str) -> None:
    """Send a password-reset email (existing API preserved)."""
    body = (
        "We received a request to reset your WorkForce AI Pro password.\n\n"
        f"Open this link to reset your password:\n{reset_url}\n\n"
        "This link can only be used once and expires after 20 minutes.\n"
        "If you did not request this change, you can ignore this email."
    )
    send_transactional_email(
        recipient,
        "Reset your WorkForce AI Pro password",
        body,
    )


def send_leave_notification_email(recipient: str, subject: str, body: str) -> None:
    """Send a leave submission, decision, or cancellation email."""
    send_transactional_email(recipient, subject, body)
