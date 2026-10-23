from app.database import engine
from sqlalchemy import text

with engine.connect() as conn:
    conn.execute(text("ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS internship_end_date DATE;"))
    conn.execute(text("ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS internship_status VARCHAR(40) DEFAULT 'Active';"))
    conn.commit()

print("Migration 011 applied successfully!")
