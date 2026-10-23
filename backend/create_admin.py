
import os
from getpass import getpass

from app.database import Base, engine, SessionLocal
from app.models.user import User
from app.security import hash_password

Base.metadata.create_all(bind=engine)

email = input("Admin email: ").strip().lower()
full_name = input("Admin name: ").strip()
password = getpass("Admin password (minimum 12 characters): ")

if len(password) < 12:
    raise SystemExit("Password must be at least 12 characters.")

db = SessionLocal()

try:
    existing = db.query(User).filter(User.email == email).first()

    if existing:
        raise SystemExit("This email already exists. No changes made.")

    admin = User(
        full_name=full_name,
        email=email,
        password_hash=hash_password(password),
        role="admin",
        status="active",
    )

    db.add(admin)
    db.commit()
    print("Initial Admin account created successfully.")

finally:
    db.close()
