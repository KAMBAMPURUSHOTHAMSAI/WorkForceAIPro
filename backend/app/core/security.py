import hashlib
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
from dotenv import load_dotenv
from pwdlib import PasswordHash


ENV_FILE = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(ENV_FILE)

SECRET_KEY = os.getenv("JWT_SECRET")

if not SECRET_KEY or len(SECRET_KEY) < 32:
    raise RuntimeError("Set a strong JWT_SECRET in backend/.env")

ALGORITHM = "HS256"

ACCESS_TOKEN_EXPIRE_MINUTES = int(
    os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30")
)

REFRESH_TOKEN_EXPIRE_DAYS = int(
    os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "14")
)

if ACCESS_TOKEN_EXPIRE_MINUTES <= 0:
    raise RuntimeError("ACCESS_TOKEN_EXPIRE_MINUTES must be positive")

if REFRESH_TOKEN_EXPIRE_DAYS <= 0:
    raise RuntimeError("REFRESH_TOKEN_EXPIRE_DAYS must be positive")

password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(
    plain_password: str,
    hashed_password: str,
) -> bool:
    return password_hash.verify(plain_password, hashed_password)


def hash_token(token: str) -> str:
    """Return the SHA-256 hash of an opaque token."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_access_token(
    user_id: int,
    expires_minutes: int | None = None,
    token_version: int = 0,
) -> str:
    duration = (
        expires_minutes
        if expires_minutes is not None
        else ACCESS_TOKEN_EXPIRE_MINUTES
    )

    if duration <= 0:
        raise ValueError("Token expiration must be positive")

    now = datetime.now(timezone.utc)

    payload = {
        "sub": str(user_id),
        "ver": int(token_version),
        "iat": now,
        "exp": now + timedelta(minutes=duration),
    }

    return jwt.encode(
        payload,
        SECRET_KEY,
        algorithm=ALGORITHM,
    )