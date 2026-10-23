from app.database import engine
from sqlalchemy import text

def run():
    with open("migrations/004_project_management_documents_links.sql", "r") as f:
        sql = f.read()
    with engine.begin() as conn:
        for stmt in sql.split(";"):
            cleaned = stmt.strip()
            if cleaned and not cleaned.startswith("BEGIN") and not cleaned.startswith("COMMIT"):
                conn.execute(text(cleaned))
    print("Migration 004 applied successfully.")

if __name__ == "__main__":
    run()
