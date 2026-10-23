from app.database import engine
from sqlalchemy import text

def run():
    with open("migrations/008_attendance_and_breaks.sql", "r", encoding="utf-8") as f:
        sql = f.read()
    with engine.begin() as conn:
        for stmt in sql.split(";"):
            cleaned = stmt.strip()
            if cleaned and not cleaned.startswith("BEGIN") and not cleaned.startswith("COMMIT"):
                conn.execute(text(cleaned))
    print("Migration 008 applied successfully.")

if __name__ == "__main__":
    run()
