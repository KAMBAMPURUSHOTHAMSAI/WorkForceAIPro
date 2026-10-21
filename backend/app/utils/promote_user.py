import sys

from sqlalchemy import func

from app.db.session import SessionLocal
from app.models.user import User


def main():
    if len(sys.argv) != 2:
        print(
            "Usage: python -m app.utils.promote_user "
            "registered-email@example.com"
        )
        raise SystemExit(1)

    email = sys.argv[1].strip().lower()

    db = SessionLocal()

    try:
        user = (
            db.query(User)
            .filter(func.lower(User.email) == email)
            .first()
        )

        if user is None:
            print("User not found. Register the account first.")
            raise SystemExit(1)

        user.role = "ADMIN"
        db.commit()

        print(f"ADMIN role assigned to {user.email}")

    finally:
        db.close()


if __name__ == "__main__":
    main()